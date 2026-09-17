/**
 * Ask Pi LLM entry point — TrueFoundry (OpenAI-compatible) tool loop.
 *
 * Scopes:
 *   1. Analytics → read-only tools over D1's leads / runs / campaigns
 *      (count_leads, status_breakdown, worst_dropoffs, latest_runs,
 *      read_campaign). Answers real questions with real numbers; never
 *      writes.
 *   2. Builder  → analytics tools plus the campaign DAG mutations
 *      (insert_node, connect_nodes, update_node). Called from the in-canvas
 *      AiComposer on `/campaigns/$id`.
 *   3. Agents   → analytics tools plus agent mutations (list_agents,
 *      read_agent, save_agent, list_tools). Called from the global dock
 *      when the user is on `/agents`. Pi drafts / edits voice agents by
 *      natural language and the change survives refresh via D1.
 *
 * Server-only. Accessed via `askPi()` from the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { getEnv } from "@/lib/db/client";
import * as campaigns from "@/lib/db/campaigns";
import * as analytics from "@/lib/db/analytics";
import * as agentsDb from "@/lib/db/agents";
import type { AgentRecord } from "@/lib/agent-data";

export type AskPiScope = "analytics" | "builder" | "agents";

export type AskPiRequest = {
  scope: AskPiScope;
  question: string;
  /** Analytics scope: current filter context (campaignId, runId, from/to). */
  context?: Record<string, unknown>;
  /** Optional conversation state (multi-turn). */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

export type AskPiResponse =
  | { ok: true; answer: string; toolCalls: ToolCallLog[] }
  | { ok: false; error: string };

type ToolCallLog = { name: string; args: string; result: string };

const TOOL_DEFS = {
  analytics: [
    {
      type: "function",
      function: {
        name: "count_leads",
        description: "Count leads matching a filter. Filter fields: runId, campaignId, status, channel, stageNodeId.",
        parameters: {
          type: "object",
          properties: {
            runId: { type: "string" },
            campaignId: { type: "string" },
            status: { type: "string" },
            channel: { type: "string", enum: ["whatsapp", "voice", "sms", "rcs"] },
            stageNodeId: { type: "string" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "status_breakdown",
        description: "Return leads grouped by status for a run, campaign, and/or channel. Returns [{status, count}].",
        parameters: {
          type: "object",
          properties: {
            runId: { type: "string" },
            campaignId: { type: "string" },
            channel: { type: "string", enum: ["whatsapp", "voice", "sms", "rcs"] },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "worst_dropoffs",
        description: "Return the nodes with the largest drop-off (entered → exited) for a run. Returns [{nodeId, entered, exited, dropPct}].",
        parameters: {
          type: "object",
          properties: {
            runId: { type: "string" },
            limit: { type: "number" },
          },
          required: ["runId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "latest_runs",
        description: "Return the most recent runs across all campaigns.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read_campaign",
        description: "Read a campaign's full DSL graph.",
        parameters: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
  ],
  builder: [
    // Builder scope inherits the analytics reads plus the mutation tools.
    {
      type: "function",
      function: {
        name: "list_campaigns",
        description: "Return every campaign in the workspace with id, name, vertical, status.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "insert_node",
        description: "Insert a new node into a campaign's DAG.",
        parameters: {
          type: "object",
          properties: {
            campaignId: { type: "string" },
            node: {
              type: "object",
              properties: {
                id: { type: "string" },
                kind: { type: "string" },
                title: { type: "string" },
                subtitle: { type: "string" },
                config: { type: "object" },
              },
              required: ["id", "kind", "title"],
            },
          },
          required: ["campaignId", "node"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "connect_nodes",
        description: "Wire two nodes together in a campaign's DAG.",
        parameters: {
          type: "object",
          properties: {
            campaignId: { type: "string" },
            edge: {
              type: "object",
              properties: {
                id: { type: "string" },
                source: { type: "string" },
                target: { type: "string" },
                sourceHandle: { type: "string" },
              },
              required: ["id", "source", "target"],
            },
          },
          required: ["campaignId", "edge"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_node",
        description: "Patch one node's title/subtitle/config on an existing campaign.",
        parameters: {
          type: "object",
          properties: {
            campaignId: { type: "string" },
            nodeId: { type: "string" },
            patch: { type: "object" },
          },
          required: ["campaignId", "nodeId", "patch"],
        },
      },
    },
  ],
  agents: [
    {
      type: "function",
      function: {
        name: "list_agents",
        description: "Return every voice agent in the workspace with id, name, status, tools[].",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "read_agent",
        description: "Fetch the full record for one agent by id — including masterPrompt, knowledgeBase, tools, postCall vars, evalPrompt.",
        parameters: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "save_agent",
        description:
          "Upsert an agent. Pass a full AgentRecord: { id, name, type: 'voice', status: 'live' | 'draft' | 'paused', tools: string[], masterPrompt: string, knowledgeBase: string, postCall: { id, name, prompt }[], evalPrompt?: string }. Merge on top of the existing record if you're editing — always call read_agent first, then send the merged object back.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            type: { type: "string", enum: ["voice"] },
            status: { type: "string", enum: ["live", "draft", "paused"] },
            tools: { type: "array", items: { type: "string" } },
            masterPrompt: { type: "string" },
            knowledgeBase: { type: "string" },
            postCall: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  prompt: { type: "string" },
                },
                required: ["id", "name", "prompt"],
              },
            },
            evalPrompt: { type: "string" },
          },
          required: ["id", "name", "type", "status", "tools", "masterPrompt", "knowledgeBase", "postCall"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_tools",
        description: "Return every tool handle the agents can use (policy_lookup, order_lookup, crm_query, place_call, …) with a one-line description. Use this before you propose a `tools` array on save_agent so you never invent a handle.",
        parameters: { type: "object", properties: {} },
      },
    },
  ],
} as const;

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "count_leads":
      return { count: await analytics.countLeads(args as Parameters<typeof analytics.countLeads>[0]) };
    case "status_breakdown":
      return await analytics.statusBreakdown(args as Parameters<typeof analytics.statusBreakdown>[0]);
    case "worst_dropoffs":
      return await analytics.worstDropoffs(args.runId as string, (args.limit as number) ?? 5);
    case "latest_runs":
      return await analytics.latestRuns((args.limit as number) ?? 10);
    case "read_campaign":
      return await campaigns.readCampaign(args.id as string);
    case "list_campaigns":
      return await campaigns.listCampaigns();
    case "insert_node":
      await campaigns.insertNode(args.campaignId as string, args.node as campaigns.DslNode);
      return { ok: true };
    case "connect_nodes":
      await campaigns.connectNodes(args.campaignId as string, args.edge as campaigns.DslEdge);
      return { ok: true };
    case "update_node":
      await campaigns.updateNode(args.campaignId as string, args.nodeId as string, args.patch as never);
      return { ok: true };
    case "list_agents": {
      const map = await agentsDb.listAgents();
      // Trim payload — Pi doesn't need the full masterPrompt on a list call.
      return Object.values(map).map((a) => ({
        id: a.id, name: a.name, status: a.status, tools: a.tools,
      }));
    }
    case "read_agent":
      return (await agentsDb.readAgent(args.id as string)) ?? { error: "agent_not_found" };
    case "save_agent": {
      const rec = args as unknown as AgentRecord;
      if (!rec?.id || !rec?.name) return { error: "save_agent: id and name are required" };
      // Backfill safe defaults for any field the LLM omitted.
      const full: AgentRecord = {
        id: rec.id,
        name: rec.name,
        type: rec.type ?? "voice",
        status: rec.status ?? "draft",
        tools: rec.tools ?? [],
        masterPrompt: rec.masterPrompt ?? "",
        knowledgeBase: rec.knowledgeBase ?? "",
        postCall: rec.postCall ?? [],
        ...(rec.evalPrompt ? { evalPrompt: rec.evalPrompt } : {}),
      };
      await agentsDb.upsertAgent(full);
      return { ok: true, id: full.id };
    }
    case "list_tools": {
      // Read the tools registry from D1 so Pi sees the same list the workspace has.
      const rows = await getEnv().DB
        .prepare("SELECT handle, description FROM tools ORDER BY handle")
        .all<{ handle: string; description: string }>();
      return rows.results ?? [];
    }
    default:
      return { error: `unknown tool: ${name}` };
  }
}

const SYSTEM_ANALYTICS = `You are Pi, the analytics copilot for a marketing automation platform. Answer the user's question using the analytics tools available to you. Never make up numbers — always call a tool. Reply in plain, direct language. Include the exact numbers you observed. If the tools can't answer the question, say so briefly.`;

const SYSTEM_BUILDER = `You are Pi, the campaign copilot for a marketing automation platform. You help the user design a WhatsApp / SMS / RCS / Voice workflow on a visual canvas.

## Behaviour

You have TWO modes on each turn:

1. **Ask a clarifying question.** Emit ONE short question, no tool calls. Do this when you don't yet have enough to build. Aim for 2-4 clarifying questions total for a new workflow — do NOT ask more than that. Keep each question focused on one decision.

2. **Build the workflow.** Emit tool calls (insert_node, connect_nodes, optionally update_node) with a one-line textual confirmation. Do this only when you have: trigger / audience segmentation (if any) / channel per segment / message intent.

## Quick-pick options format

When a question has 2-4 discrete answers, offer them in a fenced block on its own line so the client can render them as clickable chips. Format exactly:

\`\`\`options
Option one
Option two
Option three
\`\`\`

Keep each option under 40 chars, sentence case, no leading dashes. Only use this format when the choices are truly narrow — if the answer is free-form (a name, a template body, a number of days), just ask the question and let the user type.

## What to ask

Cover these dimensions in your questions (skip ones the user already answered):
- **Trigger**: when does a lead enter this campaign? (event, schedule, list upload)
- **Audience segmentation**: does the workflow branch by lead attributes (renewal window, cart value, tier)?
- **Channel per branch**: WhatsApp / Voice / SMS / RCS.
- **Message intent**: what's the pitch / ask on each channel?
- **Follow-up / fallback**: what if the WhatsApp fails or Voice doesn't pick up?

## Building the graph

- The canvas already has a **Start node with id "start"**. Every new node's first upstream edge must connect from either "start" or a node you just inserted.
- Generate stable node ids: \`n_<kind>_<index>\`, e.g. \`n_wa_1\`, \`n_voice_1\`, \`n_cond_1\`.
- Legal node kinds: \`start\`, \`end\`, \`conditional\`, \`whatsapp\`, \`whatsappFreeform\`, \`sms\`, \`rcs\`, \`voice\`, \`wait\`, \`apiToolCall\`, \`aiTransform\`.
- Every branching decision goes through a \`conditional\` node with meaningful \`outputs\` handles ("meets_criteria" / "doesnt_meet", or channel-specific labels).
- Always terminate every branch in an \`end\` node.
- Give every node a human title ("Renew < 5 days? — split", "WhatsApp: Voice fallback", "Voice: Meera calls").
- Keep configs light: kind, title, optional subtitle are enough. Don't invent template ids, agent ids, or audience csvs — the user wires those later.

## Confirming edits

After building, list what you added in one line per node ("Added Condition, WhatsApp send, Voice call, End (converted), End (fallback). Wired them via 5 edges."). Don't repeat the whole DAG.

Never invent DSL — always call the tools.`;

const SYSTEM_AGENTS = `You are Pi, the voice-agent copilot for a marketing automation platform. When the user asks you to draft, edit, tune, or wire up a voice agent, use the agent tools:
  - Always call list_agents first if the user's request is ambiguous about which agent, and confirm the target.
  - Before proposing an edit, call read_agent to load the current record.
  - Before proposing which tools an agent should carry, call list_tools so you use real handles (never invent).
  - Apply changes with save_agent, passing the FULL merged record (id, name, type='voice', status, tools[], masterPrompt, knowledgeBase, postCall[], evalPrompt?). Merge your patch on top of what read_agent returned — do NOT drop existing fields.
Confirm each change in one line ("Updated <name>: <what changed>"). Keep master prompts natural (English AND Devanagari variants for every quoted line — never Latin-transliterated Hindi like 'namaste, kaise ho'). Only reference tool handles the list_tools call returned.`;

/**
 * Live Ask Pi call. Multi-turn tool loop over TrueFoundry's OpenAI-compat
 * chat/completions endpoint. Caps at 6 tool-call rounds so a runaway loop
 * can't burn the budget.
 */
export const askPi = createServerFn({ method: "POST" })
  .inputValidator((r: AskPiRequest) => r)
  .handler(async ({ data }): Promise<AskPiResponse> => {
    // Guard the runtime shape end-to-end so a missing binding / secret degrades
    // gracefully into an "ok: false" the client can fall back on, instead of
    // throwing a 500 back to the browser. Order: env exists, DB bound (needed
    // by every tool call), TFY key + base present.
    let env;
    try {
      env = getEnv();
    } catch (e) {
      return { ok: false, error: `runtime_env_missing: ${(e as Error).message}` };
    }
    if (!env.DB) {
      return { ok: false, error: "d1_not_bound: DB binding is missing on this worker. Provision D1 and uncomment the binding in wrangler.jsonc." };
    }
    const key = env.TFY_API_KEY;
    const base = env.TFY_BASE_URL;
    if (!key || !base) return { ok: false, error: "TFY_API_KEY / TFY_BASE_URL not configured (set in .env or wrangler secrets)" };
    const model = env.TFY_MODEL || "openai-main/anthropic/claude-sonnet-4-6";

    const systemContent =
      data.scope === "builder" ? SYSTEM_BUILDER
      : data.scope === "agents" ? SYSTEM_AGENTS
      : SYSTEM_ANALYTICS;
    const tools =
      data.scope === "builder" ? [...TOOL_DEFS.analytics, ...TOOL_DEFS.builder]
      : data.scope === "agents"  ? [...TOOL_DEFS.analytics, ...TOOL_DEFS.agents]
      : [...TOOL_DEFS.analytics];

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: systemContent },
      ...(data.history ?? []).map((m) => ({ role: m.role, content: m.content })),
    ];
    if (data.context && Object.keys(data.context).length > 0) {
      messages.push({
        role: "system",
        content: `Current context: ${JSON.stringify(data.context)}`,
      });
    }
    messages.push({ role: "user", content: data.question });

    const toolCalls: ToolCallLog[] = [];
    for (let round = 0; round < 6; round++) {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ model, messages, tools, tool_choice: "auto" }),
      });
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `tfy_${res.status}: ${body.slice(0, 200)}` };
      }
      const json = await res.json() as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      };
      const msg = json.choices?.[0]?.message;
      if (!msg) return { ok: false, error: "empty_response" };
      messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return { ok: true, answer: msg.content ?? "", toolCalls };
      }
      for (const tc of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments) as Record<string, unknown>; }
        catch { /* keep as {} */ }
        const result = await runTool(tc.function.name, args);
        toolCalls.push({
          name: tc.function.name,
          args: JSON.stringify(args),
          result: JSON.stringify(result),
        });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: JSON.stringify(result),
        });
      }
    }
    return { ok: false, error: "exceeded_tool_rounds" };
  });
