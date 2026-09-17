/**
 * Report CRUD against D1.
 *
 * Mirrors {@link ./agents.ts}. The `reports` table is intentionally narrower
 * than the runtime {@link ReportRow} type — it stores id / kind / requested_at
 * / range / status / rows / file_size_kb / expires_at only. Presentation-only
 * fields (title, createdBy, readyAt, failureReason) are NOT persisted here; the
 * seed keeps them intact in memory and the merge on the client preserves them
 * for seed rows. Dynamic reports pushed to D1 lose those fields on refresh — a
 * fair trade-off given the schema, and matches the "re-layer seed fields"
 * pattern the RCS template module already uses.
 *
 * Column mapping:
 *   D1 `kind`         ↔ runtime `channel`
 *   D1 `range_from`   ↔ runtime `startDate`
 *   D1 `range_to`     ↔ runtime `endDate`
 *   D1 `file_size_kb` ↔ runtime `fileSizeBytes` (bytes → KB round-trip)
 *   D1 `expires_at`   ↔ derived from `readyAt` (readyAt + 7 days on write;
 *                       expiry - 7 days on read so the client's expiry math
 *                       still lines up)
 *
 * Server-only.
 */
import type { ReportChannel, ReportRow, ReportStatus } from "@/lib/reports";
import { formatReportTitle } from "@/lib/reports";
import { getDb } from "./client";

type ReportDbRow = {
  id: string;
  kind: string;
  requested_at: number;
  range_from: string | null;
  range_to: string | null;
  status: string;
  rows: number | null;
  file_size_kb: number | null;
  expires_at: number | null;
};

const RETENTION_MS = 7 * 24 * 3600 * 1000;

function rowToRecord(row: ReportDbRow): ReportRow {
  const channel = row.kind as ReportChannel;
  const startDate = row.range_from ?? "";
  const endDate = row.range_to ?? "";
  const readyAt = row.expires_at
    ? new Date(row.expires_at - RETENTION_MS).toISOString()
    : undefined;
  return {
    id: row.id,
    requestedAt: new Date(row.requested_at).toISOString(),
    channel,
    title: formatReportTitle(channel, startDate, endDate),
    startDate,
    endDate,
    status: row.status as ReportStatus,
    ...(row.rows != null ? { rows: row.rows } : {}),
    ...(row.file_size_kb != null ? { fileSizeBytes: row.file_size_kb * 1024 } : {}),
    createdBy: "",
    ...(readyAt ? { readyAt } : {}),
  };
}

/** Return every report in the workspace. */
export async function listReports(): Promise<ReportRow[]> {
  const rows = await getDb()
    .prepare("SELECT * FROM reports ORDER BY requested_at DESC")
    .all<ReportDbRow>();
  return (rows.results ?? []).map(rowToRecord);
}

/** Fetch one report by id. Returns null when not found. */
export async function readReport(id: string): Promise<ReportRow | null> {
  const row = await getDb()
    .prepare("SELECT * FROM reports WHERE id = ?")
    .bind(id)
    .first<ReportDbRow>();
  return row ? rowToRecord(row) : null;
}

/** Upsert a report. */
export async function upsertReport(rec: ReportRow): Promise<void> {
  const requestedAt = Date.parse(rec.requestedAt);
  const expiresAt = rec.readyAt ? Date.parse(rec.readyAt) + RETENTION_MS : null;
  const fileSizeKb = rec.fileSizeBytes != null ? Math.round(rec.fileSizeBytes / 1024) : null;
  await getDb()
    .prepare(
      `INSERT INTO reports (id, kind, requested_at, range_from, range_to, status, rows, file_size_kb, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind,
         requested_at = excluded.requested_at,
         range_from = excluded.range_from,
         range_to = excluded.range_to,
         status = excluded.status,
         rows = excluded.rows,
         file_size_kb = excluded.file_size_kb,
         expires_at = excluded.expires_at`,
    )
    .bind(
      rec.id,
      rec.channel,
      requestedAt,
      rec.startDate ?? null,
      rec.endDate ?? null,
      rec.status,
      rec.rows ?? null,
      fileSizeKb,
      expiresAt,
    )
    .run();
}

/** Hard-delete a report by id. */
export async function deleteReport(id: string): Promise<void> {
  await getDb().prepare("DELETE FROM reports WHERE id = ?").bind(id).run();
}
