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

// Seed library — FinServ branch keeps only BFSI-relevant cohorts.
// - collections_personal_loan_jul26.csv is the primary Collections cohort,
//   consumed by pl_predue / pl_dueday / pl_dpd_early via CSV-audience mapping.
// - kyc_dropoffs and dormant_traders are legacy BFSI carry-overs.
// - The retail CSVs (high_value_traders, winback_lapsed_premium) are removed
//   on this branch to match the retail-example trim in campaign-examples.ts.
export const CSV_LIBRARY: CsvAsset[] = [
  makeCsvAsset({
    id: "csv_collections_pl_jul26",
    name: "collections_personal_loan_jul26.csv",
    uploadedTs: NOW - 0 * DAY,
    columns: [
      "customer_id", "phone", "first_name", "loan_id", "product",
      "emi_amount", "due_date", "days_past_due", "bucket",
      "outstanding", "last_ptp_date", "last_ptp_kept", "segment",
    ],
    rowCount: 4823,
    sizeKb: 612,
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
