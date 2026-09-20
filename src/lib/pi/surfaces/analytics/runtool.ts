/**
 * Analytics dashboard surface — single-dispatch tool executor.
 *
 * Extracted verbatim from the pre-refactor pi-analytics.ts. Every
 * analytics tool routes through this one function. Two paths:
 *
 *   - `hasDb` true  → real D1 queries (SQL helpers below, or shared
 *                     `@/lib/db/analytics` wrappers where appropriate)
 *   - `hasDb` false → fixture derivations from `pi-analytics-fixtures.ts`,
 *                     which reads the same CAMPAIGNS array the /analytics
 *                     page renders. Preserves demo behavior without D1.
 *
 * Kept as a single-file dispatch (rather than one file per tool) because
 * the tools share the same buildWhere / D1 client / fixture module and
 * co-location keeps the fixture-vs-D1 fork obvious.
 */
import { getDb } from "@/lib/db/client";
import * as analytics from "@/lib/db/analytics";
import * as campaigns from "@/lib/db/campaigns";
import * as fx from "@/lib/server-fns/pi-analytics-fixtures";

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

/** Single-dispatch handler for every analytics tool. Kernel calls this
 *  once per tool_use block; emit_answer is intercepted by the kernel's
 *  `terminateOnToolCall` BEFORE reaching this function, so we never see it.
 *
 *  IMPORTANT: unconditionally routes through the FIXTURE derivations even
 *  when D1 is bound. Rationale — the /analytics page's KPI cards read from
 *  the CAMPAIGNS fixture scaled by days/30, not from D1. Pi's answers need
 *  to match the top-of-screen headline the user reads first; running D1
 *  COUNTs would report a third, unrelated number alongside the fixture-
 *  scaled KPI panel (top) and the unrestricted D1 Logs table (bottom).
 *
 *  When the analytics page is migrated to read live D1 aggregates into its
 *  KPI cards, flip this back to the `if (!hasDb) { fixture } else { d1 }`
 *  fork — the D1 tool bodies below are kept live for that day.
 */
export async function runAnalyticsTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case "summary":         return await fx.fxSummary(args as F);
      case "time_series":     return await fx.fxTimeSeries(args as Parameters<typeof fx.fxTimeSeries>[0]);
      case "count_leads":     return { count: await fx.fxCountLeads(args as F) };
      case "status_breakdown":return await fx.fxStatusBreakdown(args as F);
      case "worst_dropoffs":  return fx.fxWorstDropoffs(args.runId as string, (args.limit as number) ?? 5);
      case "compare_channels":return await fx.fxCompareChannels(args as F);
      case "compare_runs":    return await fx.fxCompareRuns(args.runIdA as string, args.runIdB as string);
      case "latest_runs":     return fx.fxLatestRuns((args.limit as number) ?? 10);
      case "list_campaigns":  return fx.fxListCampaigns();
      case "read_campaign":   return fx.fxReadCampaign(args.id as string);
      case "voice_intent_distribution": return await fx.fxVoiceIntentDistribution(args as F);
      default:                return { error: `unknown_tool: ${name}` };
    }
  } catch (e) {
    return { error: `analytics_tool_failed: ${(e as Error).message}` };
  }
}

/* -------------------------------------------------------------------------- */
/* D1-backed tool bodies — currently unused. Kept live so the day the         */
/* analytics UI switches its KPI cards from fixtures to real D1 aggregates,   */
/* the fork above can be flipped back without rewriting anything.             */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _d1Dispatch(name: string, args: Record<string, unknown>): Promise<unknown> {
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
