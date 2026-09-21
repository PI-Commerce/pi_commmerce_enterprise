/**
 * Analytics dashboard surface — tool schemas.
 *
 * Every tool's schema is declared here; all handlers delegate to the
 * shared `runAnalyticsTool` dispatcher (see `../runtool.ts`) which
 * routes D1 vs fixture based on env. Kept schema-only in this file so
 * the tool contract is visible at a glance without SQL details.
 *
 * The `emit_answer` tool is a TERMINATOR — the kernel intercepts it via
 * `terminateOnToolCall: "emit_answer"` and captures its args as the
 * structured response, so the handler is a no-op the kernel never calls.
 */
import type { SurfaceTool } from "@/lib/pi/kernel";
import { runAnalyticsTool } from "../runtool";

const CHANNELS = ["whatsapp", "voice", "sms", "rcs"] as const;
const METRICS = ["leads", "delivered", "read", "clicked", "replied", "converted", "failed"] as const;

/** Sugar — every tool below has the same handler signature. Passes the
 *  screen context through so the runtool can honor `resolvedRefs` (the
 *  pre-resolved (campaign, run, node) triples the channel views publish).
 *  Without ctx, asset-mode / broadcast-mode views would return workspace-
 *  wide aggregates that disagree with the KPI cards by 10-50x. */
const dispatch = (name: string): SurfaceTool["handler"] =>
  async (args, ctx) => await runAnalyticsTool(
    name,
    args,
    ctx?.request?.context as Record<string, unknown> | undefined,
  );

export const summary: SurfaceTool = {
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
  handler: dispatch("summary"),
};

export const timeSeries: SurfaceTool = {
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
  handler: dispatch("time_series"),
};

export const countLeads: SurfaceTool = {
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
  handler: dispatch("count_leads"),
};

export const statusBreakdown: SurfaceTool = {
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
  handler: dispatch("status_breakdown"),
};

export const worstDropoffs: SurfaceTool = {
  name: "worst_dropoffs",
  description: "Nodes with the largest drop-off (entered → exited) for a run. Requires runId.",
  parameters: {
    type: "object",
    properties: { runId: { type: "string" }, limit: { type: "number" } },
    required: ["runId"],
  },
  handler: dispatch("worst_dropoffs"),
};

export const compareChannels: SurfaceTool = {
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
  handler: dispatch("compare_channels"),
};

export const compareRuns: SurfaceTool = {
  name: "compare_runs",
  description: "Compare two runs. Returns { a:summary, b:summary, delta:{totalLeads, converted, convRate} }.",
  parameters: {
    type: "object",
    properties: { runIdA: { type: "string" }, runIdB: { type: "string" } },
    required: ["runIdA", "runIdB"],
  },
  handler: dispatch("compare_runs"),
};

export const latestRuns: SurfaceTool = {
  name: "latest_runs",
  description: "Most recent runs across all campaigns.",
  parameters: { type: "object", properties: { limit: { type: "number" } } },
  handler: dispatch("latest_runs"),
};

export const listCampaigns: SurfaceTool = {
  name: "list_campaigns",
  description: "Every campaign in the workspace with id, name, vertical, status.",
  parameters: { type: "object", properties: {} },
  handler: dispatch("list_campaigns"),
};

export const readCampaign: SurfaceTool = {
  name: "read_campaign",
  description: "Read a campaign's full DSL graph. Use only when the question needs the flow structure.",
  parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  handler: dispatch("read_campaign"),
};

export const voiceIntentDistribution: SurfaceTool = {
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
  handler: dispatch("voice_intent_distribution"),
};

/** Terminator. Kernel intercepts this call via `terminateOnToolCall`
 *  and returns its raw args as the structured answer — the handler is
 *  never actually invoked, but declared as a no-op for interface parity. */
export const emitAnswer: SurfaceTool = {
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
  // Kernel terminates BEFORE handler runs. No-op fallback for interface parity.
  handler: () => ({ ok: true, terminated: true }),
};

export const analyticsTools: SurfaceTool[] = [
  summary,
  timeSeries,
  countLeads,
  statusBreakdown,
  worstDropoffs,
  compareChannels,
  compareRuns,
  latestRuns,
  listCampaigns,
  readCampaign,
  voiceIntentDistribution,
  emitAnswer,
];
