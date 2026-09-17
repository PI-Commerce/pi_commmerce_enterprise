/**
 * Ask Pi LLM entry point — TrueFoundry (OpenAI-compatible) tool loop.
 *
 * Two modes:
 *   1. Analytics scope → the LLM receives a set of read-only tools mapped to
 *      `db/analytics.ts` queries. It answers real questions with real
 *      numbers, and never writes to the DB.
 *   2. Builder scope → the LLM also gets the campaign-mutation tools
 *      (insertNode, updateNode, connectNodes, ...). Any Save propagates to
 *      the DB atomically at the end of the loop.
 *
 * Server-only. Accessed via `askPi()` from the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { getEnv } from "@/lib/db/client";
import * as campaigns from "@/lib/db/campaigns";
import * as analytics from "@/lib/db/analytics";

export type AskPiScope = "analytics" | "builder";

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
    default:
      return { error: `unknown tool: ${name}` };
  }
}

const SYSTEM_ANALYTICS = `You are Pi, the analytics copilot for a marketing automation platform. Answer the user's question using the analytics tools available to you. Never make up numbers — always call a tool. Reply in plain, direct language. Include the exact numbers you observed. If the tools can't answer the question, say so briefly.`;

const SYSTEM_BUILDER = `You are Pi, the campaign copilot for a marketing automation platform. When the user asks you to build or edit a campaign, use the mutation tools (list_campaigns, read_campaign, insert_node, connect_nodes, update_node). Confirm each change in one line. Never invent DSL — call the tools.`;

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

    const systemContent = data.scope === "builder" ? SYSTEM_BUILDER : SYSTEM_ANALYTICS;
    const tools = data.scope === "builder"
      ? [...TOOL_DEFS.analytics, ...TOOL_DEFS.builder]
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
