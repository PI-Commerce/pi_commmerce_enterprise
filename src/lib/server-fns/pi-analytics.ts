/**
 * Ask Pi — Analytics scope.
 *
 * Separate from `pi-llm.ts` because analytics has different semantics:
 *   - Answers are STRUCTURED (insight + optional recommendation + optional
 *     infographic + follow-up chips), not free text.
 *   - The tool loop terminates on `emit_answer` — the moment Pi calls it we
 *     capture the payload and return, no matter what text was produced.
 *   - Screen context (current filter, tab, selected node) is injected on every
 *     turn so Pi grounds every question in what the user is actually looking
 *     at right now.
 *   - No 3rd-party gen-UI SDK. Pi returns a chart spec, the client renders
 *     it locally with ECharts.
 *
 * Server-only.
 */
import { createServerFn } from "@tanstack/react-start";
import { getEnv, getDb } from "@/lib/db/client";
import * as analytics from "@/lib/db/analytics";
import * as campaigns from "@/lib/db/campaigns";
import * as fx from "./pi-analytics-fixtures";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/** Everything the /analytics page is currently showing. Fed to Pi verbatim. */
export type AnalyticsScreenContext = {
  pathname?: string;
  filter?: {
    campaignId?: string;
    runId?: string;
    channel?: "whatsapp" | "voice" | "sms" | "rcs";
    stageNodeId?: string;
    from?: string;   // ISO yyyy-mm-dd
    to?: string;     // ISO yyyy-mm-dd
    status?: string;
  };
  tab?: string;                // "campaign" | "channel"
  selectedNodeId?: string;     // if a node drawer is open
  visibleKpis?: Record<string, unknown>;
};

/** The chart spec Pi emits. Rendered client-side by ECharts. */
export type Infographic =
  | {
      kind: "bar";
      title: string;
      subtitle?: string;
      data: { categories: string[]; series: Array<{ name: string; values: number[] }> };
    }
  | {
      kind: "line";
      title: string;
      subtitle?: string;
      data: { categories: string[]; series: Array<{ name: string; values: number[] }> };
    }
  | {
      kind: "pie";
      title: string;
      subtitle?: string;
      data: Array<{ name: string; value: number }>;
    }
  | {
      kind: "funnel";
      title: string;
      subtitle?: string;
      data: Array<{ name: string; value: number }>;
    }
  | {
      kind: "kpi";
      title: string;
      subtitle?: string;
      data: Array<{ label: string; value: string | number; delta?: string }>;
    };

export type AnalyticsAnswer = {
  insight: string;
  recommendation?: string;
  infographic?: Infographic;
  followUps: string[];
};

export type AskPiAnalyticsRequest = {
  question: string;
  context?: AnalyticsScreenContext;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

type ToolCallLog = { name: string; args: string; result: string };

export type AskPiAnalyticsResponse =
  | { ok: true; answer: AnalyticsAnswer; toolCalls: ToolCallLog[] }
  | { ok: false; error: string };

/* -------------------------------------------------------------------------- */
/* Tool definitions                                                            */
/* -------------------------------------------------------------------------- */

const CHANNELS = ["whatsapp", "voice", "sms", "rcs"] as const;
const METRICS = ["leads", "delivered", "read", "clicked", "replied", "converted", "failed"] as const;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "summary",
      description:
        "One-shot rollup for a filter scope. Returns { totalLeads, byStatus:[{status,count}], byChannel:[{channel,count}], funnel:{sent,delivered,read,clicked,replied,converted,failed} }. Cheap — call this first for broad questions.",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string" },
          runId: { type: "string" },
          channel: { type: "string", enum: CHANNELS as unknown as string[] },
          stageNodeId: { type: "string" },
          from: { type: "string", description: "ISO yyyy-mm-dd" },
          to: { type: "string", description: "ISO yyyy-mm-dd" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "time_series",
      description:
        "Daily counts for a metric over a date range. Use for trend / WoW questions. Returns [{date, count}].",
      parameters: {
        type: "object",
        properties: {
          metric: { type: "string", enum: METRICS as unknown as string[] },
          campaignId: { type: "string" },
          channel: { type: "string", enum: CHANNELS as unknown as string[] },
          from: { type: "string", description: "ISO yyyy-mm-dd" },
          to: { type: "string", description: "ISO yyyy-mm-dd" },
        },
        required: ["metric", "from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "count_leads",
      description: "Count leads matching a filter. Fields: runId, campaignId, status, channel, stageNodeId.",
      parameters: {
        type: "object",
        properties: {
          runId: { type: "string" },
          campaignId: { type: "string" },
          status: { type: "string" },
          channel: { type: "string", enum: CHANNELS as unknown as string[] },
          stageNodeId: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "status_breakdown",
      description: "Leads grouped by status for a scope. Returns [{status, count}].",
      parameters: {
        type: "object",
        properties: {
          runId: { type: "string" },
          campaignId: { type: "string" },
          channel: { type: "string", enum: CHANNELS as unknown as string[] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "worst_dropoffs",
      description: "Nodes with the largest drop-off (entered → exited) for a run. Requires runId.",
      parameters: {
        type: "object",
        properties: { runId: { type: "string" }, limit: { type: "number" } },
        required: ["runId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_channels",
      description:
        "Side-by-side channel metrics for the given scope. Returns [{channel, sent, delivered, converted, convRate}].",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string" },
          runId: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_runs",
      description: "Compare two runs. Returns { a:summary, b:summary, delta:{totalLeads, converted, convRate} }.",
      parameters: {
        type: "object",
        properties: { runIdA: { type: "string" }, runIdB: { type: "string" } },
        required: ["runIdA", "runIdB"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "latest_runs",
      description: "Most recent runs across all campaigns.",
      parameters: { type: "object", properties: { limit: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "list_campaigns",
      description: "Every campaign in the workspace with id, name, vertical, status.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_campaign",
      description: "Read a campaign's full DSL graph. Use only when the question needs the flow structure.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "voice_intent_distribution",
      description:
        "Voice-channel intent breakdown for completed calls in scope. Matches the /analytics Voice tab's 'Intent distribution' chart. Returns { totalCompleted, intents:[{intent, count, pct}] }. Use when the user asks about voice intents, post-call analysis, why calls dropped, or 'what did callers say'.",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string" },
          runId: { type: "string" },
          from: { type: "string", description: "ISO yyyy-mm-dd" },
          to: { type: "string", description: "ISO yyyy-mm-dd" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "emit_answer",
      description:
        "TERMINAL. End the turn by emitting the structured answer. Pi MUST call this exactly once per turn and stop calling tools after. The client renders the payload directly.",
      parameters: {
        type: "object",
        properties: {
          insight: {
            type: "string",
            description: "1-2 short sentences, plain English, grounded in concrete numbers from the tools.",
          },
          recommendation: {
            type: "string",
            description: "Optional 1-sentence 'so what' or next action. Omit if not useful.",
          },
          infographic: {
            type: "object",
            description:
              "Optional chart spec. Only include when it materially helps understanding. Shape depends on kind.",
            properties: {
              kind: { type: "string", enum: ["bar", "line", "pie", "funnel", "kpi"] },
              title: { type: "string" },
              subtitle: { type: "string" },
              data: {
                type: "object",
                description:
                  "bar/line: { categories: string[], series: [{ name, values: number[] }] }. pie/funnel: [{ name, value }]. kpi: [{ label, value, delta? }].",
              },
            },
            required: ["kind", "title", "data"],
          },
          followUps: {
            type: "array",
            description:
              "2-3 next-question chip labels. Second-order inferences the user will likely want next. Under 60 chars each. Not 'tell me more' — specific questions.",
            items: { type: "string" },
            minItems: 2,
            maxItems: 3,
          },
        },
        required: ["insight", "followUps"],
      },
    },
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Tool runners                                                                */
/* -------------------------------------------------------------------------- */

type F = {
  campaignId?: string;
  runId?: string;
  channel?: string;
  stageNodeId?: string;
  status?: string;
  from?: string;
  to?: string;
};

function buildWhere(f: F): { where: string; binds: unknown[] } {
  const clauses: string[] = ["1=1"];
  const binds: unknown[] = [];
  if (f.campaignId) { clauses.push("campaign_id = ?"); binds.push(f.campaignId); }
  if (f.runId) { clauses.push("run_id = ?"); binds.push(f.runId); }
  if (f.channel) { clauses.push("channel = ?"); binds.push(f.channel); }
  if (f.stageNodeId) { clauses.push("stage_node_id = ?"); binds.push(f.stageNodeId); }
  if (f.status) { clauses.push("status = ?"); binds.push(f.status); }
  if (f.from) { clauses.push("updated_at >= ?"); binds.push(Date.parse(f.from + "T00:00:00Z")); }
  if (f.to) { clauses.push("updated_at <= ?"); binds.push(Date.parse(f.to + "T23:59:59Z")); }
  return { where: `WHERE ${clauses.join(" AND ")}`, binds };
}

async function toolSummary(f: F) {
  const db = getDb();
  const { where, binds } = buildWhere(f);
  const total = await db.prepare(`SELECT COUNT(*) AS c FROM leads ${where}`).bind(...binds).first<{ c: number }>();
  const byStatus = await db
    .prepare(`SELECT status, COUNT(*) AS count FROM leads ${where} AND status IS NOT NULL GROUP BY status ORDER BY count DESC`)
    .bind(...binds)
    .all<{ status: string; count: number }>();
  const byChannel = await db
    .prepare(`SELECT channel, COUNT(*) AS count FROM leads ${where} AND channel IS NOT NULL GROUP BY channel ORDER BY count DESC`)
    .bind(...binds)
    .all<{ channel: string; count: number }>();
  const funnel = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN status IN ('sent','delivered','read','clicked','replied','converted') THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN status IN ('delivered','read','clicked','replied','converted') THEN 1 ELSE 0 END) AS delivered,
         SUM(CASE WHEN status IN ('read','clicked','replied','converted') THEN 1 ELSE 0 END) AS read,
         SUM(CASE WHEN status = 'clicked' THEN 1 ELSE 0 END) AS clicked,
         SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) AS replied,
         SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM leads ${where}`,
    )
    .bind(...binds)
    .first<Record<string, number>>();
  return {
    totalLeads: total?.c ?? 0,
    byStatus: byStatus.results ?? [],
    byChannel: byChannel.results ?? [],
    funnel: {
      sent: funnel?.sent ?? 0,
      delivered: funnel?.delivered ?? 0,
      read: funnel?.read ?? 0,
      clicked: funnel?.clicked ?? 0,
      replied: funnel?.replied ?? 0,
      converted: funnel?.converted ?? 0,
      failed: funnel?.failed ?? 0,
    },
  };
}

async function toolTimeSeries(args: { metric: string; from: string; to: string; campaignId?: string; channel?: string }) {
  const db = getDb();
  const clauses: string[] = ["1=1"];
  const binds: unknown[] = [];
  clauses.push("updated_at >= ?"); binds.push(Date.parse(args.from + "T00:00:00Z"));
  clauses.push("updated_at <= ?"); binds.push(Date.parse(args.to + "T23:59:59Z"));
  if (args.campaignId) { clauses.push("campaign_id = ?"); binds.push(args.campaignId); }
  if (args.channel) { clauses.push("channel = ?"); binds.push(args.channel); }
  if (args.metric !== "leads") {
    clauses.push("status = ?"); binds.push(args.metric);
  }
  const rows = await db
    .prepare(
      `SELECT strftime('%Y-%m-%d', updated_at / 1000, 'unixepoch') AS date, COUNT(*) AS count
       FROM leads WHERE ${clauses.join(" AND ")}
       GROUP BY date ORDER BY date ASC`,
    )
    .bind(...binds)
    .all<{ date: string; count: number }>();
  return rows.results ?? [];
}

async function toolCompareChannels(args: F) {
  const db = getDb();
  const { where, binds } = buildWhere({ ...args, channel: undefined });
  const rows = await db
    .prepare(
      `SELECT channel,
              SUM(CASE WHEN status IN ('sent','delivered','read','clicked','replied','converted') THEN 1 ELSE 0 END) AS sent,
              SUM(CASE WHEN status IN ('delivered','read','clicked','replied','converted') THEN 1 ELSE 0 END) AS delivered,
              SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted,
              COUNT(*) AS total
       FROM leads ${where} AND channel IS NOT NULL
       GROUP BY channel ORDER BY total DESC`,
    )
    .bind(...binds)
    .all<{ channel: string; sent: number; delivered: number; converted: number; total: number }>();
  return (rows.results ?? []).map((r) => ({
    channel: r.channel,
    sent: r.sent,
    delivered: r.delivered,
    converted: r.converted,
    convRate: r.sent > 0 ? Number((r.converted / r.sent).toFixed(4)) : 0,
  }));
}

async function toolCompareRuns(a: string, b: string) {
  const [sa, sb] = await Promise.all([toolSummary({ runId: a }), toolSummary({ runId: b })]);
  const convA = sa.funnel.sent > 0 ? sa.funnel.converted / sa.funnel.sent : 0;
  const convB = sb.funnel.sent > 0 ? sb.funnel.converted / sb.funnel.sent : 0;
  return {
    a: sa,
    b: sb,
    delta: {
      totalLeads: sb.totalLeads - sa.totalLeads,
      converted: sb.funnel.converted - sa.funnel.converted,
      convRate: Number((convB - convA).toFixed(4)),
    },
  };
}

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // emit_answer is a client-only terminator — never touches D1.
  if (name === "emit_answer") return { ok: true };

  const hasDb = (() => { try { return !!getEnv().DB; } catch { return false; } })();

  // Local-dev path: no D1 bound. Read from the same fixture data the /analytics
  // page renders (CAMPAIGNS in analytics-data.ts) so Pi's answers match the UI.
  if (!hasDb) {
    try {
      switch (name) {
        case "summary":         return fx.fxSummary(args as F);
        case "time_series":     return fx.fxTimeSeries(args as Parameters<typeof fx.fxTimeSeries>[0]);
        case "count_leads":     return { count: fx.fxCountLeads(args as F) };
        case "status_breakdown":return fx.fxStatusBreakdown(args as F);
        case "worst_dropoffs":  return fx.fxWorstDropoffs(args.runId as string, (args.limit as number) ?? 5);
        case "compare_channels":return fx.fxCompareChannels(args as F);
        case "compare_runs":    return fx.fxCompareRuns(args.runIdA as string, args.runIdB as string);
        case "latest_runs":     return fx.fxLatestRuns((args.limit as number) ?? 10);
        case "list_campaigns":  return fx.fxListCampaigns();
        case "read_campaign":   return fx.fxReadCampaign(args.id as string);
        case "voice_intent_distribution": return fx.fxVoiceIntentDistribution(args as F);
        default:                return { error: `unknown_tool: ${name}` };
      }
    } catch (e) {
      return { error: `fixture_tool_failed: ${(e as Error).message}` };
    }
  }

  // Prod path: D1 is bound.
  try {
    switch (name) {
      case "summary":
        return await toolSummary(args as F);
      case "time_series":
        return await toolTimeSeries(args as Parameters<typeof toolTimeSeries>[0]);
      case "count_leads":
        return { count: await analytics.countLeads(args as Parameters<typeof analytics.countLeads>[0]) };
      case "status_breakdown":
        return await analytics.statusBreakdown(args as Parameters<typeof analytics.statusBreakdown>[0]);
      case "worst_dropoffs":
        return await analytics.worstDropoffs(args.runId as string, (args.limit as number) ?? 5);
      case "compare_channels":
        return await toolCompareChannels(args as F);
      case "compare_runs":
        return await toolCompareRuns(args.runIdA as string, args.runIdB as string);
      case "latest_runs":
        return await analytics.latestRuns((args.limit as number) ?? 10);
      case "list_campaigns":
        return await campaigns.listCampaigns();
      case "read_campaign":
        return await campaigns.readCampaign(args.id as string);
      case "voice_intent_distribution":
        // No D1-backed source yet — fall through to the fixture derivation so
        // Pi still gets a coherent shape. When the real intent table lands,
        // swap this branch for the D1 query.
        return fx.fxVoiceIntentDistribution(args as F);
      default:
        return { error: `unknown_tool: ${name}` };
    }
  } catch (e) {
    return { error: `tool_failed: ${(e as Error).message}` };
  }
}

/* -------------------------------------------------------------------------- */
/* System prompt                                                               */
/* -------------------------------------------------------------------------- */

const SYSTEM = `You are Pi, the analytics copilot inside PiCom, a marketing-automation platform. The user is on the /analytics screen.

## Non-negotiables

- ALWAYS end your turn by calling the \`emit_answer\` tool. That is the only way the client gets a response. Never rely on your text output being read.
- ALWAYS ground every number in a tool call. Never invent, round, or guess a number. Numbers you cite in \`insight\` must come from a tool result this turn.
- Read the injected \`Screen context\` block on EVERY turn. It carries: current filter (campaign, run, channel, date range, node), the current tab, and any selected node. Default your tool calls to that scope. Only override when the question explicitly asks for something else ("compare vs last week", "across all campaigns").

## Answer shape

Every \`emit_answer\` call MUST include:
- \`insight\`: 1-2 short sentences in plain English, containing the concrete number(s) you observed. No hedging, no "based on the data", no "it appears that".
- \`followUps\`: 2-3 chip labels for the user's likely next question. Second-order inferences — not "tell me more" but concrete drills: "Why did WhatsApp convert 3× voice?", "Compare vs previous run", "Which node caused the drop?". Under 60 chars each.

Optional (only when they help):
- \`recommendation\`: one sentence, an action or "so what". e.g. "Reorder the flow to fire WhatsApp before Voice — the sequence favors it by 22%."
- \`infographic\`: pick the visual that fits the data shape:
  - \`kpi\` — 2-4 headline numbers with optional delta. Best when the answer is "here are the top-line stats".
  - \`bar\` — comparing discrete groups (channels, campaigns, statuses, nodes).
  - \`line\` — a metric over time. Trend / WoW / cumulative.
  - \`pie\` — parts of a whole, ≤5 slices. Use sparingly.
  - \`funnel\` — sequential drop-off stages (sent → delivered → read → clicked → converted).

Do NOT force a chart. If the answer is a single number or a comparison of two, \`kpi\` is usually right. If prose alone tells it, skip the infographic entirely.

## Tools — priority order

1. \`summary\` for broad questions ("how is this run doing?") — one call covers total/status/channel/funnel.
2. \`time_series\` for trend / WoW / date-range questions.
3. \`compare_channels\` / \`compare_runs\` for A-vs-B questions.
4. \`worst_dropoffs\` for "where is the flow leaking?" (needs runId).
5. \`count_leads\` / \`status_breakdown\` for narrow single-scope slices.
6. \`read_campaign\` / \`list_campaigns\` only when the question needs flow structure or a name.

## Tone

Direct. Plain. No em/en dashes. No "let me know", "great question", "just to confirm". No apologies for the platform. First person is fine.`;

/* -------------------------------------------------------------------------- */
/* Anthropic tool loop                                                         */
/* -------------------------------------------------------------------------- */

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string }
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "redacted_thinking"; data: string };

async function runAnthropicLoop(input: {
  apiKey: string;
  model: string;
  workspaceId?: string;
  question: string;
  context?: AnalyticsScreenContext;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  thinkingBudget?: number;
}): Promise<AskPiAnalyticsResponse> {
  const anthropicTools = TOOLS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  const systemFull = input.context && Object.keys(input.context).length > 0
    ? `${SYSTEM}\n\n## Screen context\n${JSON.stringify(input.context, null, 2)}`
    : SYSTEM;

  const messages: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] | string }> = [];
  for (const m of input.history ?? []) messages.push({ role: m.role, content: m.content });
  messages.push({ role: "user", content: input.question });

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": input.apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (input.workspaceId) headers["anthropic-workspace-id"] = input.workspaceId;

  const thinkingBudget = Number(input.thinkingBudget ?? 5000);
  const maxTokens = Math.max(thinkingBudget + 4096, 12000);

  const toolCalls: ToolCallLog[] = [];
  let capturedAnswer: AnalyticsAnswer | null = null;

  for (let round = 0; round < 8; round++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.model,
        max_tokens: maxTokens,
        temperature: 1,
        thinking: { type: "enabled", budget_tokens: thinkingBudget },
        system: systemFull,
        messages,
        tools: anthropicTools,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `anthropic_${res.status}: ${body.slice(0, 300)}` };
    }
    const json = (await res.json()) as { content?: AnthropicBlock[]; stop_reason?: string };
    const blocks = json.content ?? [];
    messages.push({ role: "assistant", content: blocks });

    const toolUses = blocks.filter(
      (b): b is Extract<AnthropicBlock, { type: "tool_use" }> => b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      // Model stopped without emit_answer. Salvage: use whatever text it wrote
      // and no infographic.
      if (capturedAnswer) return { ok: true, answer: capturedAnswer, toolCalls };
      const text = blocks
        .filter((b): b is Extract<AnthropicBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return {
        ok: true,
        answer: {
          insight: text || "I couldn't finish that answer. Try rephrasing?",
          followUps: ["Summarize this run", "Compare channels", "What went wrong?"],
        },
        toolCalls,
      };
    }

    // Execute every tool call. Capture emit_answer's args as the terminal payload.
    const resultBlocks: AnthropicBlock[] = [];
    for (const tu of toolUses) {
      const result = await runTool(tu.name, tu.input ?? {});
      const resultStr = JSON.stringify(result);
      toolCalls.push({ name: tu.name, args: JSON.stringify(tu.input ?? {}), result: resultStr });
      resultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: resultStr });
      if (tu.name === "emit_answer") {
        const args = tu.input as Record<string, unknown>;
        capturedAnswer = normalizeAnswer(args);
      }
    }
    messages.push({ role: "user", content: resultBlocks });

    // Early exit: emit_answer was called. Return before spending another round.
    if (capturedAnswer) return { ok: true, answer: capturedAnswer, toolCalls };
  }

  if (capturedAnswer) return { ok: true, answer: capturedAnswer, toolCalls };
  return { ok: false, error: "exceeded_tool_rounds" };
}

/* -------------------------------------------------------------------------- */
/* TFY OpenAI-compat tool loop (local Paytm-net dev fallback)                   */
/* -------------------------------------------------------------------------- */

async function runTfyLoop(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  question: string;
  context?: AnalyticsScreenContext;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<AskPiAnalyticsResponse> {
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM },
    ...(input.history ?? []).map((m) => ({ role: m.role, content: m.content })),
  ];
  if (input.context && Object.keys(input.context).length > 0) {
    messages.push({ role: "system", content: `Screen context: ${JSON.stringify(input.context)}` });
  }
  messages.push({ role: "user", content: input.question });

  const toolCalls: ToolCallLog[] = [];
  let capturedAnswer: AnalyticsAnswer | null = null;

  for (let round = 0; round < 8; round++) {
    const res = await fetch(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify({
        model: input.model,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `tfy_${res.status}: ${body.slice(0, 200)}` };
    }
    const json = (await res.json()) as {
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
      if (capturedAnswer) return { ok: true, answer: capturedAnswer, toolCalls };
      const text = (msg.content ?? "").trim();
      return {
        ok: true,
        answer: {
          insight: text || "I couldn't finish that answer. Try rephrasing?",
          followUps: ["Summarize this run", "Compare channels", "What went wrong?"],
        },
        toolCalls,
      };
    }

    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments) as Record<string, unknown>; } catch { /* {} */ }
      const result = await runTool(tc.function.name, args);
      const resultStr = JSON.stringify(result);
      toolCalls.push({ name: tc.function.name, args: JSON.stringify(args), result: resultStr });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function.name,
        content: resultStr,
      });
      if (tc.function.name === "emit_answer") {
        capturedAnswer = normalizeAnswer(args);
      }
    }
    if (capturedAnswer) return { ok: true, answer: capturedAnswer, toolCalls };
  }

  if (capturedAnswer) return { ok: true, answer: capturedAnswer, toolCalls };
  return { ok: false, error: "exceeded_tool_rounds" };
}

/** Coerce emit_answer args into a shape the client can trust. */
function normalizeAnswer(args: Record<string, unknown>): AnalyticsAnswer {
  const insight = typeof args.insight === "string" ? args.insight : "";
  const recommendation = typeof args.recommendation === "string" ? args.recommendation : undefined;
  const followUps = Array.isArray(args.followUps)
    ? (args.followUps as unknown[]).filter((v): v is string => typeof v === "string").slice(0, 3)
    : [];
  let infographic: Infographic | undefined;
  const ig = args.infographic as Record<string, unknown> | undefined;
  if (ig && typeof ig.kind === "string" && typeof ig.title === "string" && ig.data != null) {
    infographic = {
      kind: ig.kind as Infographic["kind"],
      title: ig.title,
      subtitle: typeof ig.subtitle === "string" ? ig.subtitle : undefined,
      data: ig.data,
    } as Infographic;
  }
  return { insight, recommendation, infographic, followUps };
}

/* -------------------------------------------------------------------------- */
/* Public server fns                                                           */
/* -------------------------------------------------------------------------- */

export const askPiAnalytics = createServerFn({ method: "POST" })
  .inputValidator((r: AskPiAnalyticsRequest) => r)
  .handler(async ({ data }): Promise<AskPiAnalyticsResponse> => {
    let env;
    try { env = getEnv(); } catch (e) {
      return { ok: false, error: `runtime_env_missing: ${(e as Error).message}` };
    }
    // Prod path — Anthropic direct with extended thinking.
    if (env.ANTHROPIC_API_KEY) {
      return await runAnthropicLoop({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        workspaceId: env.ANTHROPIC_WORKSPACE_ID,
        question: data.question,
        context: data.context,
        history: data.history,
        thinkingBudget: env.ANTHROPIC_THINKING_BUDGET ? Number(env.ANTHROPIC_THINKING_BUDGET) : undefined,
      });
    }
    // Local dev fallback — TrueFoundry OpenAI-compat (Paytm net).
    const tfyKey = env.PI_AGENT_API_KEY || env.TFY_API_KEY;
    const tfyBase = env.PI_AGENT_BASE_URL || env.TFY_BASE_URL;
    if (tfyKey && tfyBase) {
      return await runTfyLoop({
        apiKey: tfyKey,
        baseUrl: tfyBase,
        model: env.PI_AGENT_MODEL || env.TFY_MODEL || "pi-agentic/global.anthropic.claude-sonnet-4-6",
        question: data.question,
        context: data.context,
        history: data.history,
      });
    }
    return { ok: false, error: "No LLM gateway configured — set ANTHROPIC_API_KEY or PI_AGENT_API_KEY + PI_AGENT_BASE_URL" };
  });

/**
 * Starter chips generator. Called once on screen-context change to seed the
 * idle-state chips (max 3). Cheap one-shot call, NO tool loop.
 * The 3 chips are second-order inferences based on the visible filter state.
 */
export const generateStarterChips = createServerFn({ method: "POST" })
  .inputValidator((c: AnalyticsScreenContext) => c)
  .handler(async ({ data: context }): Promise<{ ok: true; chips: string[] } | { ok: false; error: string }> => {
    let env;
    try { env = getEnv(); } catch (e) {
      return { ok: false, error: `runtime_env_missing: ${(e as Error).message}` };
    }

    const prompt = `Given the user's current analytics screen state, return the 3 most-likely first questions they'd want answered. Second-order inferences — not "what is this" but "which node leaks the most?", "why did conversion drop?", "compare this run vs last". Under 60 chars each. Return STRICT JSON: { "chips": ["q1", "q2", "q3"] }. No prose.

Screen context:
${JSON.stringify(context, null, 2)}`;

    const parseChips = (text: string): { ok: true; chips: string[] } | { ok: false; error: string } => {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return { ok: false, error: "no_json_in_response" };
      try {
        const parsed = JSON.parse(match[0]) as { chips?: unknown };
        const chips = Array.isArray(parsed.chips)
          ? (parsed.chips as unknown[]).filter((v): v is string => typeof v === "string").slice(0, 3)
          : [];
        if (chips.length === 0) return { ok: false, error: "empty_chips" };
        return { ok: true, chips };
      } catch (e) {
        return { ok: false, error: `json_parse: ${(e as Error).message}` };
      }
    };

    // Prod — Anthropic.
    if (env.ANTHROPIC_API_KEY) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            ...(env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": env.ANTHROPIC_WORKSPACE_ID } : {}),
          },
          body: JSON.stringify({
            model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
            max_tokens: 400,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) return { ok: false, error: `anthropic_${res.status}` };
        const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
        const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
        return parseChips(text);
      } catch (e) {
        return { ok: false, error: `fetch_failed: ${(e as Error).message}` };
      }
    }

    // Local — TFY OpenAI-compat.
    const tfyKey = env.PI_AGENT_API_KEY || env.TFY_API_KEY;
    const tfyBase = env.PI_AGENT_BASE_URL || env.TFY_BASE_URL;
    if (tfyKey && tfyBase) {
      try {
        const res = await fetch(`${tfyBase}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tfyKey}` },
          body: JSON.stringify({
            model: env.PI_AGENT_MODEL || env.TFY_MODEL || "pi-agentic/global.anthropic.claude-sonnet-4-6",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) return { ok: false, error: `tfy_${res.status}` };
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = json.choices?.[0]?.message?.content ?? "";
        return parseChips(text);
      } catch (e) {
        return { ok: false, error: `fetch_failed: ${(e as Error).message}` };
      }
    }

    return { ok: false, error: "No LLM gateway configured" };
  });
