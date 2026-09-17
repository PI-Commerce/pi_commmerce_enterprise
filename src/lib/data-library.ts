// Shared CSV "Data library" backing the Data tab (PRD change-log C1–C3).
//
// v1 scope: the Data tab is a *library*, not a data browser — we surface only
// file-level metadata (name + upload date) and a Download action. Row contents
// are never previewed or stored here (mirrors the Audience-node "headers only"
// rule from WS3). Run-creation CSV uploads auto-populate this same list and are
// selectable from the Run modal dropdown (C3) — so this module is the single
// source of truth consumed by both the Data route and CreateRunDialog.
//
// The library is seeded to the CSVs the 5 hero campaigns actually consume, so
// clicking Download on a row gives back a real CSV whose headers match the
// campaign's Audience node keys.

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

// Seed library — one file per hero campaign. Column headers match each
// campaign's Audience node keys + tool-input mappings so the Download output
// is a valid input for that campaign's run.
export const CSV_LIBRARY: CsvAsset[] = [
  makeCsvAsset({
    id: "csv_dormant_soundbox",
    name: "dormant_soundbox_merchants.csv",
    uploadedTs: NOW - 1 * DAY,
    columns: [
      "customer_id", "phone", "first_name", "merchant_id", "device_id",
      "last_txn_days", "monthly_tpv", "merchant_tier", "preferred_lang",
    ],
    rowCount: 1500,
    sizeKb: 214,
    source: "uploaded",
  }),
  makeCsvAsset({
    id: "csv_loyalty_members",
    name: "loyalty_card_members.csv",
    uploadedTs: NOW - 1 * DAY,
    columns: [
      "customer_id", "phone", "first_name", "loyalty_tier",
      "acv_6m", "aov_6m", "orders_6m", "lifetime_value", "last_purchase_days", "preferred_lang",
    ],
    rowCount: 12800,
    sizeKb: 1620,
    source: "uploaded",
  }),
  makeCsvAsset({
    id: "csv_cart_abandoners",
    name: "cart_abandoners_jun26.csv",
    uploadedTs: NOW - 2 * DAY,
    columns: [
      "customer_id", "phone", "first_name", "cart_id", "cart_value", "cart_items",
    ],
    rowCount: 900,
    sizeKb: 96,
    source: "uploaded",
  }),
  makeCsvAsset({
    id: "csv_policies_expiring",
    name: "insurance_policies_expiring.csv",
    uploadedTs: NOW - 3 * DAY,
    columns: [
      "customer_id", "phone", "first_name", "policy_no", "premium", "expiry_date",
    ],
    rowCount: 540,
    sizeKb: 68,
    source: "uploaded",
  }),
  makeCsvAsset({
    id: "csv_pl_delinquent",
    name: "pl_delinquent_borrowers.csv",
    uploadedTs: NOW - 5 * DAY,
    columns: [
      "customer_id", "phone", "first_name", "loan_id", "dpd", "amount_due",
    ],
    rowCount: 300,
    sizeKb: 42,
    source: "uploaded",
  }),
];

/* -------------------------------------------------------------------------- */
/* CSV generation — Download button produces a valid CSV with header + N       */
/* deterministic rows so a reviewer can inspect it in Excel / Sheets.          */
/* -------------------------------------------------------------------------- */

const FIRST_NAMES = [
  "Aarav", "Anaya", "Arjun", "Diya", "Ishaan", "Kabir", "Kavya", "Krishna",
  "Meera", "Mohit", "Nisha", "Priya", "Rahul", "Rohan", "Rohit", "Saanvi",
  "Saira", "Shaan", "Tanvi", "Vihaan", "Vivaan", "Zara",
];
const CITIES = ["Delhi", "Mumbai", "Bengaluru", "Chennai", "Kolkata", "Pune", "Jaipur"];

function seedRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

// Column-value generators. Add here as new column names appear in a CSV asset.
function valueFor(col: string, i: number, rand: () => number): string {
  switch (col) {
    case "customer_id":       return `cust_${pad(20250000 + i, 8)}`;
    case "merchant_id":       return `mid_${pad(10250000 + i, 8)}`;
    case "device_id":         return `SB-${pad(1000 + i, 5)}`;
    case "phone":             return `+91 9${pad(8000000000 + i, 10).slice(-9)}`;
    case "first_name":        return pick(rand, FIRST_NAMES);
    case "policy_no":         return `POL/2026/${pad(i + 1, 6)}`;
    case "loan_id":           return `PL${pad(600000 + i, 7)}`;
    case "cart_id":           return `cart_${pad(500000 + i, 7)}`;
    case "premium":           return String(2500 + Math.floor(rand() * 47500));
    case "expiry_date": {
      const d = new Date(NOW + (5 + Math.floor(rand() * 30)) * DAY);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
    }
    case "dpd":               return String(1 + Math.floor(rand() * 180));
    case "amount_due":        return String(1500 + Math.floor(rand() * 48500));
    case "cart_value":        return String(300 + Math.floor(rand() * 24700));
    case "cart_items":        return String(1 + Math.floor(rand() * 6));
    case "monthly_tpv":       return String(5000 + Math.floor(rand() * 195000));
    case "merchant_tier":     return pick(rand, ["small", "mid", "large"]);
    case "last_txn_days":     return String(30 + Math.floor(rand() * 220));
    case "loyalty_tier":      return pick(rand, ["silver", "silver", "silver", "gold"]); // 3:1 silver:gold
    case "acv_6m":            return String(2500 + Math.floor(rand() * 122500));
    case "aov_6m":            return String(400 + Math.floor(rand() * 4600));
    case "orders_6m":         return String(1 + Math.floor(rand() * 24));
    case "lifetime_value":    return String(5000 + Math.floor(rand() * 495000));
    case "last_purchase_days": return String(1 + Math.floor(rand() * 180));
    case "preferred_lang":    return pick(rand, ["hi", "en", "mr", "ta", "te", "bn"]);
    case "city":              return pick(rand, CITIES);
    default:                  return "";
  }
}

/**
 * Generate a full CSV as a string for the given asset. Deterministic — a fixed
 * seed derived from the asset id means clicking Download twice returns the same
 * file. Row count is capped at 500 to keep browser downloads snappy; the metadata
 * still shows the "real" (mock) row count.
 */
export function generateCsvContent(asset: CsvAsset): string {
  const cap = Math.min(asset.rowCount, 500);
  const rand = seedRand(asset.id.split("").reduce((s, c) => s + c.charCodeAt(0), 0));
  const header = asset.columns.join(",");
  const rows: string[] = [header];
  for (let i = 0; i < cap; i++) {
    rows.push(asset.columns.map((c) => escapeCsv(valueFor(c, i, rand))).join(","));
  }
  return rows.join("\n");
}

function escapeCsv(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
