// Shared CSV "Data library" backing the Data tab (PRD change-log C1–C3).
//
// v1 scope: the Data tab is a *library*, not a data browser — we surface only
// file-level metadata (name + upload date) and a Download action. Row contents
// are never previewed or stored here (mirrors the Audience-node "headers only"
// rule from WS3). Run-creation CSV uploads auto-populate this same list and are
// selectable from the Run modal dropdown (C3) — so this module is the single
// source of truth consumed by both the Data route and CreateRunDialog.

export type CsvAsset = {
  id: string;
  /** File name shown in the library + Run-modal dropdown. */
  name: string;
  /** Human display date, e.g. "10 Jun 2026, 14:22". */
  uploadedAt: string;
  /** Sort key — epoch ms. */
  uploadedTs: number;
  /** Column headers detected on upload (metadata only — no row data kept). */
  columns: string[];
  /** Row count reported at upload time (display only). */
  rowCount: number;
  /** Approx file size in KB (display only). */
  sizeKb: number;
  /** Where the file entered the library. */
  source: "uploaded" | "run";
};

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-10T14:30:00+05:30");

function fmt(ts: number): string {
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Build a library entry with a derived display date. */
export function makeCsvAsset(
  init: Omit<CsvAsset, "uploadedAt" | "uploadedTs"> & { uploadedTs?: number },
): CsvAsset {
  const ts = init.uploadedTs ?? Date.now();
  return { ...init, uploadedTs: ts, uploadedAt: fmt(ts) };
}

// Seed library — includes the CSVs referenced by the two example campaigns so
// the demo's Data tab feels populated and consistent with the Audience cards.
export const CSV_LIBRARY: CsvAsset[] = [
  makeCsvAsset({
    id: "csv_high_value_traders",
    name: "high_value_traders.csv",
    uploadedTs: NOW - 1 * DAY,
    columns: [
      "customer_id", "phone", "first_name", "favorite_category",
      "lifetime_order_value", "discount_value", "preferred_lang",
    ],
    rowCount: 18432,
    sizeKb: 1240,
    source: "uploaded",
  }),
  makeCsvAsset({
    id: "csv_winback_lapsed_premium",
    name: "winback_lapsed_premium.csv",
    uploadedTs: NOW - 3 * DAY,
    columns: [
      "customer_id", "phone", "first_name", "avg_basket_value",
      "weeks_inactive", "last_item", "reorder_url", "preferred_lang",
    ],
    rowCount: 6107,
    sizeKb: 512,
    source: "uploaded",
  }),
  makeCsvAsset({
    id: "csv_kyc_dropoffs_may",
    name: "kyc_dropoffs_may26.csv",
    uploadedTs: NOW - 9 * DAY,
    columns: ["customer_id", "phone", "first_name", "kyc_stage", "dropoff_at"],
    rowCount: 2940,
    sizeKb: 318,
    source: "run",
  }),
  makeCsvAsset({
    id: "csv_dormant_q1",
    name: "dormant_traders_q1.csv",
    uploadedTs: NOW - 21 * DAY,
    columns: ["customer_id", "phone", "first_name", "last_trade_at", "segment"],
    rowCount: 41205,
    sizeKb: 2870,
    source: "uploaded",
  }),
];
