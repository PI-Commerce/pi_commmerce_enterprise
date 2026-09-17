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
  // D1 availability check — mutation tools no-op successfully when D1 isn't
  // bound (the client-side applyPiToolCallsToGraph still updates the canvas
  // from the tool_call args, so the user sees the graph change; only the
  // durability layer is skipped). Read tools return a clear error string so
  // Pi can adapt its next turn.
  const hasDb = (() => {
    try {
      return !!getEnv().DB;
    } catch {
      return false;
    }
  })();
  if (!hasDb) {
    switch (name) {
      case "insert_node":
      case "connect_nodes":
      case "update_node":
      case "save_agent":
        // Mutation tools: return ok so Pi's textual confirmation still fires
        // and the client applies the change to the live canvas. Include a
        // warning field so Pi can mention the "not saved to DB" caveat.
        return { ok: true, warning: "d1_unavailable — change applied to canvas but not persisted" };
      case "list_agents":
      case "read_agent":
      case "list_campaigns":
      case "read_campaign":
      case "list_tools":
      case "count_leads":
      case "status_breakdown":
      case "worst_dropoffs":
      case "latest_runs":
        return { error: "d1_unavailable — no database bound on this worker" };
    }
  }
  try {
    return await runToolInner(name, args);
  } catch (e) {
    return { error: `tool_failed: ${(e as Error).message}` };
  }
}

async function runToolInner(name: string, args: Record<string, unknown>): Promise<unknown> {
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
 * Live Ask Pi call. Multi-turn tool loop.
 *
 * Two transport paths, picked at runtime:
 *   - Anthropic native (`api.anthropic.com/v1/messages`) — public network,
 *     reachable from Cloudflare Workers, current prod path. Used whenever
 *     `env.ANTHROPIC_API_KEY` is set.
 *   - TrueFoundry OpenAI-compat (`llm.tfy.pi.mypaytm.com/openai/v1`) —
 *     Paytm-internal, only reachable when the origin is on the corporate
 *     network. Used as fallback for local dev on Paytm VPN when the
 *     Anthropic key isn't configured.
 *
 * Caps at 8 tool-call rounds — enough for a full campaign build (7-14
 * tool calls in the insurance-renewal example), but small enough that a
 * runaway loop can't burn budget.
 */
export const askPi = createServerFn({ method: "POST" })
  .inputValidator((r: AskPiRequest) => r)
  .handler(async ({ data }): Promise<AskPiResponse> => {
    let env;
    try {
      env = getEnv();
    } catch (e) {
      return { ok: false, error: `runtime_env_missing: ${(e as Error).message}` };
    }

    const systemContent =
      data.scope === "builder" ? SYSTEM_BUILDER
      : data.scope === "agents" ? SYSTEM_AGENTS
      : SYSTEM_ANALYTICS;
    const scopeTools =
      data.scope === "builder" ? [...TOOL_DEFS.analytics, ...TOOL_DEFS.builder]
      : data.scope === "agents"  ? [...TOOL_DEFS.analytics, ...TOOL_DEFS.agents]
      : [...TOOL_DEFS.analytics];

    // Prefer Anthropic direct. If missing, fall back to the OpenAI-compat
    // TrueFoundry gateway. If neither, ok:false with a clear message.
    if (env.ANTHROPIC_API_KEY) {
      return await runAnthropicLoop({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        workspaceId: env.ANTHROPIC_WORKSPACE_ID,
        systemContent,
        tools: scopeTools,
        question: data.question,
        history: data.history,
        context: data.context,
      });
    }

    const tfyKey = env.PI_AGENT_API_KEY || env.TFY_API_KEY;
    const tfyBase = env.PI_AGENT_BASE_URL || env.TFY_BASE_URL;
    if (!tfyKey || !tfyBase) {
      return { ok: false, error: "LLM gateway not configured — set ANTHROPIC_API_KEY (preferred) or PI_AGENT_API_KEY + PI_AGENT_BASE_URL in .env / wrangler secrets" };
    }
    return await runTfyLoop({
      apiKey: tfyKey,
      baseUrl: tfyBase,
      model: env.PI_AGENT_MODEL || env.TFY_MODEL || "pi-agentic/global.anthropic.claude-sonnet-4-6",
      systemContent,
      tools: scopeTools,
      question: data.question,
      history: data.history,
      context: data.context,
    });
  });

/* -------------------------------------------------------------------------- */
/* Anthropic native tool loop                                                  */
/* -------------------------------------------------------------------------- */

type LoopInput = {
  apiKey: string;
  model: string;
  systemContent: string;
  tools: ReadonlyArray<{ type: "function"; function: { name: string; description: string; parameters: unknown } }>;
  question: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  context?: Record<string, unknown>;
};

/**
 * Anthropic /v1/messages tool loop. Their shape:
 *   - `system` is a top-level string (not a message role)
 *   - tools flatten to { name, description, input_schema }
 *   - response content is an array of blocks: { type:"text",text } and
 *     { type:"tool_use", id, name, input }
 *   - tool results go back as user-message content: { type:"tool_result",
 *     tool_use_id, content: string }
 */
async function runAnthropicLoop(
  input: LoopInput & { workspaceId?: string },
): Promise<AskPiResponse> {
  // Convert our OpenAI-shape tool defs to Anthropic's shape.
  const anthropicTools = input.tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  // Anthropic messages: user/assistant only. `system` moves out. We fold the
  // context hint into the system string so it survives every turn.
  const systemFull = input.context && Object.keys(input.context).length > 0
    ? `${input.systemContent}\n\n## Current context\n${JSON.stringify(input.context, null, 2)}`
    : input.systemContent;

  type AnthropicBlock =
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "tool_result"; tool_use_id: string; content: string };

  // Seed history from prior turns (all user/assistant text blocks).
  const messages: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] | string }> = [];
  for (const m of input.history ?? []) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: input.question });

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": input.apiKey,
    "anthropic-version": "2023-06-01",
  };
  // Workspace-scoped API keys require this header; unscoped keys reject it.
  // Only send when the workspace id is configured.
  if (input.workspaceId) {
    headers["anthropic-workspace-id"] = input.workspaceId;
  }

  const toolCalls: ToolCallLog[] = [];
  for (let round = 0; round < 8; round++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.model,
        max_tokens: 4096,
        system: systemFull,
        messages,
        tools: anthropicTools,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `anthropic_${res.status}: ${body.slice(0, 300)}` };
    }
    const json = await res.json() as {
      content?: AnthropicBlock[];
      stop_reason?: string;
      role?: string;
    };
    const blocks = json.content ?? [];
    // Record the assistant turn verbatim so tool results reference the
    // matching tool_use ids on the next round.
    messages.push({ role: "assistant", content: blocks });

    const toolUses = blocks.filter((b): b is Extract<AnthropicBlock, { type: "tool_use" }> => b.type === "tool_use");
    if (toolUses.length === 0) {
      // Terminal turn — collect all text blocks as the answer.
      const answer = blocks
        .filter((b): b is Extract<AnthropicBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { ok: true, answer, toolCalls };
    }

    // Execute every tool call in this turn, then post the results back as a
    // single user message with N tool_result blocks.
    const resultBlocks: AnthropicBlock[] = [];
    for (const tu of toolUses) {
      const result = await runTool(tu.name, tu.input ?? {});
      const resultStr = JSON.stringify(result);
      toolCalls.push({
        name: tu.name,
        args: JSON.stringify(tu.input ?? {}),
        result: resultStr,
      });
      resultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: resultStr });
    }
    messages.push({ role: "user", content: resultBlocks });
  }
  return { ok: false, error: "exceeded_tool_rounds" };
}

/* -------------------------------------------------------------------------- */
/* TFY OpenAI-compat fallback (kept for local dev on Paytm net)                */
/* -------------------------------------------------------------------------- */

async function runTfyLoop(
  input: LoopInput & { baseUrl: string },
): Promise<AskPiResponse> {
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: input.systemContent },
    ...(input.history ?? []).map((m) => ({ role: m.role, content: m.content })),
  ];
  if (input.context && Object.keys(input.context).length > 0) {
    messages.push({ role: "system", content: `Current context: ${JSON.stringify(input.context)}` });
  }
  messages.push({ role: "user", content: input.question });

  const toolCalls: ToolCallLog[] = [];
  for (let round = 0; round < 8; round++) {
    const res = await fetch(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({ model: input.model, messages, tools: input.tools, tool_choice: "auto" }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `tfy_${res.status}: ${body.slice(0, 200)}` };
    }
    const json = await res.json() as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
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
}
