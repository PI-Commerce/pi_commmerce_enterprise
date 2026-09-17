/**
 * Run status CRUD against D1.
 *
 * The Campaigns > Runs table lets an operator pause, resume, or terminate a
 * run from the row menu. This module is the D1 write path so those actions
 * survive a refresh (and eventually feed the Ask Pi builder scope so Pi
 * can react to a paused run).
 *
 * Read is a compact { id → status } map so the client can apply overrides
 * to whatever seed rows it renders without a big fetch.
 *
 * Server-only.
 */
import type { CampaignRunStatus } from "@/lib/leads-data";
import { getDb } from "./client";

/** Return the current status of every run in D1. Cheap enough to fetch on mount. */
export async function listRunStatuses(): Promise<Record<string, CampaignRunStatus>> {
  const rows = await getDb()
    .prepare("SELECT id, status FROM runs")
    .all<{ id: string; status: CampaignRunStatus }>();
  const out: Record<string, CampaignRunStatus> = {};
  for (const r of rows.results ?? []) out[r.id] = r.status;
  return out;
}

/**
 * Update one run's status. Also stamps completed_at when the new status is
 * terminal (completed / terminated) so downstream analytics can sort on it.
 * No-op if the row doesn't exist (the UPDATE matches zero rows) — safe to
 * call from the client without pre-checking.
 */
export async function updateRunStatus(
  id: string,
  status: CampaignRunStatus,
): Promise<void> {
  const now = Date.now();
  const isTerminal = status === "completed" || status === "terminated";
  await getDb()
    .prepare(
      isTerminal
        ? "UPDATE runs SET status = ?, completed_at = ? WHERE id = ?"
        : "UPDATE runs SET status = ?, completed_at = NULL WHERE id = ?",
    )
    .bind(...(isTerminal ? [status, now, id] : [status, id]))
    .run();
}
