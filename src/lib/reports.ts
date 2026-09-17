/**
 * Reports (Delivery + Campaign exports)
 *
 * Product model:
 *  - Small exports (< 10 lac rows) download directly from the channel Analytics view.
 *  - Large exports (>= 10 lac rows) run async, land in S3, and appear here.
 *  - Each report is kept for 7 days after it becomes Ready. After that it Expires.
 *  - A single report file caps at 1 crore rows. Multi-day ranges arrive as a zip
 *    with one CSV per day. Days that exceed 1 crore rows are split further within
 *    the zip.
 *  - Custom filter ranges are capped at 90 days. Older data is fulfilled via support.
 *
 * See PRD (WS8) and MEMORY for the full spec.
 */

export type ReportChannel =
  | "whatsapp"
  | "sms"
  | "rcs"
  | "voice"
  | "campaign";

export type ReportStatus =
  | "queued"
  | "processing"
  | "ready"
  | "failed"
  | "expired";

export type ReportRow = {
  id: string; // e.g. RPT-2026-000123
  requestedAt: string; // ISO
  channel: ReportChannel;
  /** Human-readable label shown in the table (name + date range). */
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: ReportStatus;
  rows?: number;
  fileSizeBytes?: number;
  createdBy: string;
  /** Set when status = ready. Files are kept 7 days from this moment. */
  readyAt?: string;
  /** Populated on failed jobs. Used for support triage. */
  failureReason?: string;
};

const CHANNEL_LABEL: Record<ReportChannel, string> = {
  whatsapp: "WhatsApp logs",
  sms: "SMS logs",
  rcs: "RCS logs",
  voice: "Voice logs",
  campaign: "Campaign leads",
};

export function channelLabel(c: ReportChannel): string {
  return CHANNEL_LABEL[c];
}

/**
 * Formats a report title for display.
 * Example: "WhatsApp delivery report · 2026-09-07 to 2026-09-13"
 */
export function formatReportTitle(
  channel: ReportChannel,
  startDate: string,
  endDate: string,
): string {
  return `${CHANNEL_LABEL[channel]} · ${startDate} to ${endDate}`;
}

/**
 * Standard filename inside the exported zip. Predictable so customers can
 * automate ingestion.
 * Example: whatsapp_org1234_20260907.csv
 */
export function reportFilename(
  channel: ReportChannel,
  orgId: string,
  date: string,
): string {
  return `${channel}_${orgId}_${date.replace(/-/g, "")}.csv`;
}

/**
 * Standard zip filename covering a date range.
 * Example: whatsapp_org1234_20260907_20260913.zip
 */
export function reportZipFilename(
  channel: ReportChannel,
  orgId: string,
  startDate: string,
  endDate: string,
): string {
  const s = startDate.replace(/-/g, "");
  const e = endDate.replace(/-/g, "");
  return `${channel}_${orgId}_${s}_${e}.zip`;
}

const RETENTION_DAYS = 7;

/**
 * Returns human text like "in 4 days", "in 2 hours", "Expired" for a report.
 * Uses `readyAt` when set, otherwise the report has not yet been produced.
 */
export function formatExpiry(row: ReportRow, now: Date = new Date()): string {
  if (row.status === "expired") return "Expired";
  if (row.status !== "ready" || !row.readyAt) return "";
  const expiresAt = new Date(new Date(row.readyAt).getTime() + RETENTION_DAYS * 24 * 3600 * 1000);
  const diffMs = expiresAt.getTime() - now.getTime();
  if (diffMs <= 0) return "Expired";
  const diffHours = Math.floor(diffMs / (3600 * 1000));
  if (diffHours < 24) return `in ${diffHours} hour${diffHours === 1 ? "" : "s"}`;
  const diffDays = Math.floor(diffHours / 24);
  return `in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatRows(rows: number | undefined): string {
  if (rows === undefined) return "";
  return rows.toLocaleString("en-IN");
}

/**
 * Max date range allowed on the custom filter. Older data goes through support.
 */
export const MAX_RANGE_DAYS = 90;

/**
 * Demo threshold: any Analytics export with a date range of this many days or
 * more is treated as "large" and routes through the async pipeline. Real
 * builds should switch to a proper row-count estimate; the demo uses days as
 * a stand-in so screenshots are deterministic.
 */
export const LARGE_EXPORT_MIN_RANGE_DAYS = 4;

/**
 * Direct download threshold. Under this row count, users get an instant CSV
 * from the Analytics view. Above it, a background job is created and lands
 * on this page.
 */
export const DIRECT_DOWNLOAD_ROW_CAP = 10_00_000; // 10 lac

/**
 * Single report file cap. Larger ranges are split into per-day CSVs inside
 * a zip. Days that themselves exceed this cap are split further.
 */
export const REPORT_ROW_CAP = 1_00_00_000; // 1 crore

// -----------------------------------------------------------------------------
// Seed data for the demo. Mirrors what the developer built plus the fixes we
// agreed on: correct expiry math, alphanumeric IDs, cleaned taxonomy, a
// visible failure reason, and a "Created by" column.
// -----------------------------------------------------------------------------

const NOW = new Date("2026-09-14T12:20:00+05:30");
const day = (offsetDays: number, h = 10, m = 0) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - offsetDays);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

// -----------------------------------------------------------------------------
// Live store. Analytics push new queued reports here when a user starts a
// "large export". Reports page subscribes to re-render.
// -----------------------------------------------------------------------------

type Listener = () => void;
let dynamicReports: ReportRow[] = [];
const listeners = new Set<Listener>();
let nextSerial = 25;

export function nextReportId(): string {
  const id = String(nextSerial);
  nextSerial += 1;
  return id;
}

export function pushReport(r: ReportRow): void {
  dynamicReports = [r, ...dynamicReports];
  listeners.forEach((l) => l());
  // Background persist. Silent fallback when D1 isn't bound. Dynamic import
  // keeps the server-fn out of any pure-data importers of reports.ts.
  if (typeof window !== "undefined") {
    void import("@/lib/server-fns/reports")
      .then((m) => m.saveReportFn({ data: r }))
      .catch(() => { /* silent */ });
  }
}

export function subscribeReports(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getDynamicReports(): ReportRow[] {
  return dynamicReports;
}

// D1 hydration state — first mount kicks off a fetch and merges the D1 rows
// into the dynamic store. Idempotent; subsequent callers await the memoized
// promise. Silent no-op when D1 isn't bound so the seed still renders.
let hydratePromise: Promise<void> | null = null;

export function hydrateReportsFromDb(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const mod = await import("@/lib/server-fns/reports");
      const r = await mod.listReportsFn();
      if (!r.ok) return;
      const seedIds = new Set(SEED_REPORTS.map((s) => s.id));
      // Only merge in D1 rows that aren't already covered by the seed —
      // presentation-only fields (title, createdBy, failureReason) live only in
      // memory for seed rows, so we don't want the D1 rehydrate to strip them.
      const extras = r.reports.filter((row) => !seedIds.has(row.id));
      if (extras.length === 0) return;
      const existing = new Set(dynamicReports.map((d) => d.id));
      const merged = [...extras.filter((e) => !existing.has(e.id)), ...dynamicReports];
      dynamicReports = merged;
      listeners.forEach((l) => l());
    } catch {
      /* silent — seed still renders */
    }
  })();
  return hydratePromise;
}

export const SEED_REPORTS: ReportRow[] = [
  {
    id: "806",
    requestedAt: day(1, 20, 30),
    channel: "campaign",
    title: formatReportTitle("campaign", "2026-06-20", "2026-06-26"),
    startDate: "2026-06-20",
    endDate: "2026-06-26",
    status: "failed",
    createdBy: "priya.sharma@acme.com",
    failureReason: "S3 upload failed. Provider timeout after 3 retries.",
  },
  {
    id: "805",
    requestedAt: day(1, 20, 25),
    channel: "whatsapp",
    title: formatReportTitle("whatsapp", "2026-09-07", "2026-09-13"),
    startDate: "2026-09-07",
    endDate: "2026-09-13",
    status: "failed",
    createdBy: "priya.sharma@acme.com",
    failureReason: "Query timeout. Try a shorter date range or narrower filters.",
  },
  {
    id: "804",
    requestedAt: day(3, 8, 28),
    channel: "whatsapp",
    title: formatReportTitle("whatsapp", "2026-09-05", "2026-09-11"),
    startDate: "2026-09-05",
    endDate: "2026-09-11",
    status: "processing",
    createdBy: "rahul.mehta@acme.com",
  },
  {
    id: "803",
    requestedAt: day(3, 8, 19),
    channel: "whatsapp",
    title: formatReportTitle("whatsapp", "2026-09-05", "2026-09-11"),
    startDate: "2026-09-05",
    endDate: "2026-09-11",
    status: "queued",
    createdBy: "rahul.mehta@acme.com",
  },
  {
    id: "801",
    requestedAt: day(6, 11, 0),
    channel: "campaign",
    title: formatReportTitle("campaign", "2026-08-25", "2026-08-31"),
    startDate: "2026-08-25",
    endDate: "2026-08-31",
    status: "ready",
    rows: 271828,
    fileSizeBytes: 333312,
    readyAt: day(2, 11, 8),
    createdBy: "priya.sharma@acme.com",
  },
  {
    id: "800",
    requestedAt: day(6, 10, 0),
    channel: "whatsapp",
    title: formatReportTitle("whatsapp", "2026-08-25", "2026-08-31"),
    startDate: "2026-08-25",
    endDate: "2026-08-31",
    status: "ready",
    rows: 314159,
    fileSizeBytes: 444416,
    readyAt: day(3, 10, 4),
    createdBy: "priya.sharma@acme.com",
  },
  {
    id: "799",
    requestedAt: day(7, 10, 0),
    channel: "rcs",
    title: formatReportTitle("rcs", "2026-08-25", "2026-08-31"),
    startDate: "2026-08-25",
    endDate: "2026-08-31",
    status: "ready",
    rows: 2000001,
    fileSizeBytes: 889242,
    readyAt: day(5, 10, 12),
    createdBy: "rahul.mehta@acme.com",
  },
  {
    id: "798",
    requestedAt: day(8, 10, 0),
    channel: "rcs",
    title: formatReportTitle("rcs", "2026-08-25", "2026-08-31"),
    startDate: "2026-08-25",
    endDate: "2026-08-31",
    status: "failed",
    createdBy: "rahul.mehta@acme.com",
    failureReason: "Provider returned partial data. Please retry.",
  },
  {
    id: "797",
    requestedAt: day(10, 10, 0),
    channel: "sms",
    title: formatReportTitle("sms", "2026-08-18", "2026-08-24"),
    startDate: "2026-08-18",
    endDate: "2026-08-24",
    status: "expired",
    rows: 51200,
    fileSizeBytes: 51200,
    readyAt: day(10, 10, 4),
    createdBy: "finance@acme.com",
  },
];
