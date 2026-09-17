/**
 * Broadcast CRUD against D1.
 *
 * Mirrors {@link ./agents.ts}. The `broadcasts` table persists one row per
 * direct-channel send (WA / SMS / RCS). `sent` / `total` are counters the
 * Broadcasts page uses to render the progress bar; `status` drives the row's
 * pill + action menu. Started / completed timestamps stay as pre-formatted
 * display strings ("Today, 12:12 PM") because that's what the UI shows and
 * the demo never needs to re-format them at read time.
 *
 * Server-only.
 */
import type {
  BroadcastChannel,
  BroadcastRow,
  BroadcastStatus,
} from "@/lib/broadcasts-seed";
import { getDb } from "./client";

type BroadcastDbRow = {
  id: string;
  name: string;
  channel: string;
  asset_name: string;
  template_id: string;
  csv_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  sent: number;
  total: number;
};

function rowToRecord(row: BroadcastDbRow): BroadcastRow {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel as BroadcastChannel,
    assetName: row.asset_name,
    templateId: row.template_id,
    csvName: row.csv_name,
    status: row.status as BroadcastStatus,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? "ongoing",
    sent: row.sent,
    total: row.total,
  };
}

/** Return every broadcast in the workspace. */
export async function listBroadcasts(): Promise<BroadcastRow[]> {
  const rows = await getDb()
    .prepare("SELECT * FROM broadcasts ORDER BY started_at DESC")
    .all<BroadcastDbRow>();
  return (rows.results ?? []).map(rowToRecord);
}

/** Fetch one broadcast by id. Returns null when not found. */
export async function readBroadcast(id: string): Promise<BroadcastRow | null> {
  const row = await getDb()
    .prepare("SELECT * FROM broadcasts WHERE id = ?")
    .bind(id)
    .first<BroadcastDbRow>();
  return row ? rowToRecord(row) : null;
}

/** Upsert a broadcast. */
export async function upsertBroadcast(rec: BroadcastRow): Promise<void> {
  const completed = rec.completedAt === "ongoing" ? null : rec.completedAt;
  await getDb()
    .prepare(
      `INSERT INTO broadcasts (id, name, channel, asset_name, template_id, csv_name, status, started_at, completed_at, sent, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         channel = excluded.channel,
         asset_name = excluded.asset_name,
         template_id = excluded.template_id,
         csv_name = excluded.csv_name,
         status = excluded.status,
         started_at = excluded.started_at,
         completed_at = excluded.completed_at,
         sent = excluded.sent,
         total = excluded.total`,
    )
    .bind(
      rec.id,
      rec.name,
      rec.channel,
      rec.assetName,
      rec.templateId,
      rec.csvName,
      rec.status,
      rec.startedAt,
      completed,
      rec.sent,
      rec.total,
    )
    .run();
}

/** Hard-delete a broadcast by id. */
export async function deleteBroadcast(id: string): Promise<void> {
  await getDb().prepare("DELETE FROM broadcasts WHERE id = ?").bind(id).run();
}
