/**
 * Analytics server functions — the browser calls these, they run on Cloudflare
 * with the D1 binding, and they return already-filtered aggregates. Every
 * widget on the Analytics page (KPIs, funnel, Sankey, LeadsTable, CSV export)
 * ultimately reads through one of these — the same query result feeds every
 * pane so a range change reflows the whole surface.
 *
 * All functions accept a shared {@link AnalyticsFilter} so filter state is
 * fully round-trippable through URL search params.
 */
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/db/client";

export type AnalyticsFilter = {
  campaignId?: string;
  runId?: string;
  channel?: "whatsapp" | "voice" | "sms" | "rcs";
  stageNodeId?: string;
  from?: string; // ISO yyyy-mm-dd
  to?: string;   // ISO yyyy-mm-dd
  status?: string;
  q?: string;    // free-text search on name / phone / lead id
};

export type AnalyticsSummary = {
  totalLeads: number;
  byStatus: Array<{ status: string; count: number }>;
  byChannel: Array<{ channel: string; count: number }>;
  funnel: {
    sent: number;
    delivered: number;
    read: number;
    clicked: number;
    replied: number;
    converted: number;
    failed: number;
  };
};

export type AnalyticsLead = {
  id: string;
  runId: string;
  campaignId: string;
  name: string;
  phone: string;
  stageNodeId: string;
  stageKind: string;
  channel: string | null;
  status: string | null;
  cost: number;
  durationSec: number | null;
  updatedAt: number;
};

/** Whole-surface aggregates. One round-trip, every KPI + funnel + status split. */
export const getAnalyticsSummary = createServerFn({ method: "POST" })
  .inputValidator((f: AnalyticsFilter) => f)
  .handler(async ({ data: f }): Promise<AnalyticsSummary> => {
    const db = getDb();
    const { where, binds } = buildLeadsWhere(f);
    const total = await db
      .prepare(`SELECT COUNT(*) AS c FROM leads ${where}`)
      .bind(...binds)
      .first<{ c: number }>();
    const byStatus = await db
      .prepare(
        `SELECT status, COUNT(*) AS count FROM leads ${where} AND status IS NOT NULL GROUP BY status ORDER BY count DESC`,
      )
      .bind(...binds)
      .all<{ status: string; count: number }>();
    const byChannel = await db
      .prepare(
        `SELECT channel, COUNT(*) AS count FROM leads ${where} AND channel IS NOT NULL GROUP BY channel ORDER BY count DESC`,
      )
      .bind(...binds)
      .all<{ channel: string; count: number }>();

    // Funnel — one COUNT per bucket, folded into a single row via SUM(CASE…).
    const funnelRow = await db
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
      .first<{ sent: number; delivered: number; read: number; clicked: number; replied: number; converted: number; failed: number }>();

    return {
      totalLeads: total?.c ?? 0,
      byStatus: byStatus.results ?? [],
      byChannel: byChannel.results ?? [],
      funnel: {
        sent: funnelRow?.sent ?? 0,
        delivered: funnelRow?.delivered ?? 0,
        read: funnelRow?.read ?? 0,
        clicked: funnelRow?.clicked ?? 0,
        replied: funnelRow?.replied ?? 0,
        converted: funnelRow?.converted ?? 0,
        failed: funnelRow?.failed ?? 0,
      },
    };
  });

/** Paginated leads table backing the Logs section. */
export const getAnalyticsLeads = createServerFn({ method: "POST" })
  .inputValidator((input: { filter: AnalyticsFilter; page: number; pageSize: number }) => input)
  .handler(async ({ data: { filter, page, pageSize } }): Promise<{ rows: AnalyticsLead[]; total: number }>=> {
    const db = getDb();
    const { where, binds } = buildLeadsWhere(filter);
    const total = await db
      .prepare(`SELECT COUNT(*) AS c FROM leads ${where}`)
      .bind(...binds)
      .first<{ c: number }>();
    const offset = Math.max(0, (page - 1) * pageSize);
    const rows = await db
      .prepare(
        `SELECT id, run_id, campaign_id, name, phone, stage_node_id, stage_kind,
                channel, status, cost, duration_sec, updated_at
         FROM leads ${where}
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...binds, pageSize, offset)
      .all<{
        id: string; run_id: string; campaign_id: string; name: string; phone: string;
        stage_node_id: string; stage_kind: string; channel: string | null;
        status: string | null; cost: number; duration_sec: number | null; updated_at: number;
      }>();
    return {
      total: total?.c ?? 0,
      rows: (rows.results ?? []).map((r) => ({
        id: r.id,
        runId: r.run_id,
        campaignId: r.campaign_id,
        name: r.name,
        phone: r.phone,
        stageNodeId: r.stage_node_id,
        stageKind: r.stage_kind,
        channel: r.channel,
        status: r.status,
        cost: r.cost,
        durationSec: r.duration_sec,
        updatedAt: r.updated_at,
      })),
    };
  });

/** Per-node entered/exited counts for the Sankey. */
export const getNodeMetrics = createServerFn({ method: "POST" })
  .inputValidator((input: { runId: string }) => input)
  .handler(async ({ data }) => {
    const rows = await getDb()
      .prepare("SELECT node_id, entered, exited FROM run_node_metrics WHERE run_id = ?")
      .bind(data.runId)
      .all<{ node_id: string; entered: number; exited: number }>();
    return rows.results ?? [];
  });

/** Every hero's campaigns for the campaign picker. */
export const getCampaignsList = createServerFn({ method: "GET" })
  .handler(async () => {
    const rows = await getDb()
      .prepare("SELECT id, name, vertical, status, updated_at FROM campaigns ORDER BY updated_at DESC")
      .all<{ id: string; name: string; vertical: string; status: string; updated_at: number }>();
    return rows.results ?? [];
  });

/** Every run for a given campaign, most recent first. */
export const getRunsForCampaign = createServerFn({ method: "POST" })
  .inputValidator((input: { campaignId: string }) => input)
  .handler(async ({ data }) => {
    const rows = await getDb()
      .prepare(
        `SELECT id, code, name, status, run_type, trigger_mode, audience_source,
                audience_size, total_leads, valid_leads, leads_processed, success_rate,
                started_at, completed_at
         FROM runs WHERE campaign_id = ? ORDER BY started_at DESC`,
      )
      .bind(data.campaignId)
      .all<{
        id: string; code: string; name: string; status: string; run_type: string;
        trigger_mode: string; audience_source: string; audience_size: number;
        total_leads: number; valid_leads: number; leads_processed: number;
        success_rate: number | null; started_at: number; completed_at: number | null;
      }>();
    return rows.results ?? [];
  });

/** CSV export of the filtered leads set. Server streams a single blob. */
export const exportLeadsCsv = createServerFn({ method: "POST" })
  .inputValidator((f: AnalyticsFilter) => f)
  .handler(async ({ data: f }): Promise<string> => {
    const { where, binds } = buildLeadsWhere(f);
    const rows = await getDb()
      .prepare(
        `SELECT id, run_id, campaign_id, name, phone, stage_node_id, stage_kind,
                channel, status, cost, duration_sec, updated_at
         FROM leads ${where} ORDER BY updated_at DESC LIMIT 100000`,
      )
      .bind(...binds)
      .all<{
        id: string; run_id: string; campaign_id: string; name: string; phone: string;
        stage_node_id: string; stage_kind: string; channel: string | null;
        status: string | null; cost: number; duration_sec: number | null; updated_at: number;
      }>();
    const header = "lead_id,run_id,campaign_id,name,phone,stage,kind,channel,status,cost,duration_sec,updated_at";
    const escape = (v: unknown): string => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = (rows.results ?? []).map((r) =>
      [r.id, r.run_id, r.campaign_id, r.name, r.phone, r.stage_node_id, r.stage_kind, r.channel, r.status, r.cost, r.duration_sec, new Date(r.updated_at).toISOString()]
        .map(escape).join(","),
    );
    return [header, ...body].join("\n");
  });

/* -------------------------------------------------------------------------- */
/* WHERE-clause builder — shared by every query above so the filter shape       */
/* stays consistent. Uses `AND`-joined clauses; the caller opens the WHERE.     */
/* -------------------------------------------------------------------------- */

function buildLeadsWhere(f: AnalyticsFilter): { where: string; binds: unknown[] } {
  const clauses: string[] = ["1=1"];
  const binds: unknown[] = [];
  if (f.campaignId) { clauses.push("campaign_id = ?"); binds.push(f.campaignId); }
  if (f.runId) { clauses.push("run_id = ?"); binds.push(f.runId); }
  if (f.channel) { clauses.push("channel = ?"); binds.push(f.channel); }
  if (f.stageNodeId) { clauses.push("stage_node_id = ?"); binds.push(f.stageNodeId); }
  if (f.status) { clauses.push("status = ?"); binds.push(f.status); }
  if (f.from) { clauses.push("updated_at >= ?"); binds.push(Date.parse(f.from + "T00:00:00Z")); }
  if (f.to) { clauses.push("updated_at <= ?"); binds.push(Date.parse(f.to + "T23:59:59Z")); }
  if (f.q) { clauses.push("(name LIKE ? OR phone LIKE ? OR id LIKE ?)"); const like = `%${f.q}%`; binds.push(like, like, like); }
  return { where: `WHERE ${clauses.join(" AND ")}`, binds };
}
