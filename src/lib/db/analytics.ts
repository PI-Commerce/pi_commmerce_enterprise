/**
 * Analytics queries against D1.
 *
 * The LLM tools call these to answer real questions from real data — "which
 * hero has the worst voice-call drop-off in the last 7 days?", "what's the
 * A/B winner on the Silver invite?", etc.
 *
 * Every function is a small SQL query. Aggregates are computed at query time
 * (no pre-computed roll-ups) — the leads / node-metrics tables are indexed
 * so this stays cheap for the demo's scale (~15k leads).
 *
 * Server-only.
 */
import { getDb } from "./client";

export type NodeMetric = {
  runId: string;
  nodeId: string;
  entered: number;
  exited: number;
};

/** Per-node entered / exited counts for a run. */
export async function readNodeMetrics(runId: string): Promise<NodeMetric[]> {
  const rows = await getDb()
    .prepare("SELECT run_id, node_id, entered, exited FROM run_node_metrics WHERE run_id = ?")
    .bind(runId)
    .all<{ run_id: string; node_id: string; entered: number; exited: number }>();
  return (rows.results ?? []).map((r) => ({
    runId: r.run_id,
    nodeId: r.node_id,
    entered: r.entered,
    exited: r.exited,
  }));
}

/** LLM tool: count leads at a given status/channel for a run. */
export async function countLeads(filter: {
  runId?: string;
  campaignId?: string;
  status?: string;
  channel?: string;
  stageNodeId?: string;
}): Promise<number> {
  const clauses: string[] = ["1=1"];
  const binds: unknown[] = [];
  if (filter.runId) { clauses.push("run_id = ?"); binds.push(filter.runId); }
  if (filter.campaignId) { clauses.push("campaign_id = ?"); binds.push(filter.campaignId); }
  if (filter.status) { clauses.push("status = ?"); binds.push(filter.status); }
  if (filter.channel) { clauses.push("channel = ?"); binds.push(filter.channel); }
  if (filter.stageNodeId) { clauses.push("stage_node_id = ?"); binds.push(filter.stageNodeId); }
  const row = await getDb()
    .prepare(`SELECT COUNT(*) AS c FROM leads WHERE ${clauses.join(" AND ")}`)
    .bind(...binds)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/** LLM tool: bucket leads by status for a campaign or a run. */
export async function statusBreakdown(filter: {
  runId?: string;
  campaignId?: string;
  channel?: string;
}): Promise<Array<{ status: string; count: number }>> {
  const clauses: string[] = ["status IS NOT NULL"];
  const binds: unknown[] = [];
  if (filter.runId) { clauses.push("run_id = ?"); binds.push(filter.runId); }
  if (filter.campaignId) { clauses.push("campaign_id = ?"); binds.push(filter.campaignId); }
  if (filter.channel) { clauses.push("channel = ?"); binds.push(filter.channel); }
  const rows = await getDb()
    .prepare(
      `SELECT status, COUNT(*) AS count FROM leads WHERE ${clauses.join(" AND ")} GROUP BY status ORDER BY count DESC`,
    )
    .bind(...binds)
    .all<{ status: string; count: number }>();
  return rows.results ?? [];
}

/** LLM tool: worst drop-off nodes for a run (biggest exited/entered gap). */
export async function worstDropoffs(runId: string, limit = 5): Promise<Array<{
  nodeId: string;
  entered: number;
  exited: number;
  dropPct: number;
}>> {
  const rows = await getDb()
    .prepare(
      `SELECT node_id, entered, exited,
              CASE WHEN entered > 0 THEN 1.0 - CAST(exited AS REAL) / entered ELSE 0 END AS drop_pct
       FROM run_node_metrics
       WHERE run_id = ? AND entered > 0
       ORDER BY drop_pct DESC
       LIMIT ?`,
    )
    .bind(runId, limit)
    .all<{ node_id: string; entered: number; exited: number; drop_pct: number }>();
  return (rows.results ?? []).map((r) => ({
    nodeId: r.node_id,
    entered: r.entered,
    exited: r.exited,
    dropPct: r.drop_pct,
  }));
}

/** LLM tool: latest N runs across all campaigns for the Dashboard live-runs strip. */
export async function latestRuns(limit = 10): Promise<Array<{
  id: string;
  campaignId: string;
  campaignName: string;
  status: string;
  runType: string;
  startedAt: number;
  leadsProcessed: number;
  totalLeads: number;
}>> {
  const rows = await getDb()
    .prepare(
      `SELECT r.id, r.campaign_id, c.name AS campaign_name, r.status, r.run_type,
              r.started_at, r.leads_processed, r.total_leads
       FROM runs r
       JOIN campaigns c ON c.id = r.campaign_id
       ORDER BY r.started_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{
      id: string;
      campaign_id: string;
      campaign_name: string;
      status: string;
      run_type: string;
      started_at: number;
      leads_processed: number;
      total_leads: number;
    }>();
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    status: r.status,
    runType: r.run_type,
    startedAt: r.started_at,
    leadsProcessed: r.leads_processed,
    totalLeads: r.total_leads,
  }));
}
