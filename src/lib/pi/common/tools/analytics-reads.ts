/**
 * Analytics read tools — inheritable by any surface.
 *
 * Every surface today implicitly gets these five reads (count_leads,
 * status_breakdown, worst_dropoffs, latest_runs, read_campaign) so Pi
 * can answer "how many leads in this run?" without a handoff. Kept as
 * loose tool exports for Phase 2; Phase 3 groups them into a shared
 * pool under `common/pools/analytics-reads/` and surfaces opt in via
 * `SurfaceModule.uses = ["analytics-reads"]`.
 *
 * Read-only — never mutates. Safe for any surface to expose without
 * unlocking write access.
 */
import * as analytics from "@/lib/db/analytics";
import * as campaigns from "@/lib/db/campaigns";
import type { SurfaceTool } from "@/lib/pi/kernel";

/** Count leads matching a filter — the simplest analytics primitive. */
export const countLeads: SurfaceTool = {
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
  handler: async (args) => ({
    count: await analytics.countLeads(args as Parameters<typeof analytics.countLeads>[0]),
  }),
};

/** Leads grouped by status, optionally scoped to a run / campaign / channel. */
export const statusBreakdown: SurfaceTool = {
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
  handler: async (args) => await analytics.statusBreakdown(args as Parameters<typeof analytics.statusBreakdown>[0]),
};

/** Nodes with the largest drop-off (entered → exited) for a given run. */
export const worstDropoffs: SurfaceTool = {
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
  handler: async (args) =>
    await analytics.worstDropoffs(args.runId as string, (args.limit as number) ?? 5),
};

/** Most recent runs across all campaigns. Used as a discovery primitive. */
export const latestRuns: SurfaceTool = {
  name: "latest_runs",
  description: "Return the most recent runs across all campaigns.",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "number" },
    },
  },
  handler: async (args) => await analytics.latestRuns((args.limit as number) ?? 10),
};

/** Read one campaign's full DSL — useful across surfaces to explain
 *  "what does this flow do". */
export const readCampaign: SurfaceTool = {
  name: "read_campaign",
  description: "Read a campaign's full DSL graph.",
  parameters: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  handler: async (args) => await campaigns.readCampaign(args.id as string),
};

export const analyticsReadTools: SurfaceTool[] = [
  countLeads,
  statusBreakdown,
  worstDropoffs,
  latestRuns,
  readCampaign,
];
