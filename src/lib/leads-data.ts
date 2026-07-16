/**
 * Leads Management — persistent per-lead memory for the FinServ Collections
 * vertical. Every lead carries their loan portfolio, PTP history, contact
 * frequency, and preferences here. This module is the single source of truth
 * for both the `/leads` table and the `lead.memory.*` variables exposed in the
 * campaign builder's variable picker.
 *
 * Demo scope: static seed data. In a real product, memory would persist across
 * runs and be written back after every interaction (via out-of-box "context
 * tools" like `calculate_dpd`, `lookup_ptp_history` — see tool-registry.ts).
 */

export type DpdBucket = "Pre-due" | "Early" | "Mid";
export type Segment = "Retail" | "SME" | "HNI";
export type RiskGrade = "A" | "B" | "C" | "D";
export type PreferredTod = "Morning" | "Afternoon" | "Evening";

export type PtpHistoryEntry = {
  date: string;      // YYYY-MM-DD promised date
  amount: number;    // ₹ promised
  kept: boolean;     // did the borrower actually pay by that date?
};

export type LoanState = {
  loanId: string;
  product: "PersonalLoan";
  disbursedOn: string;     // ISO date
  tenureMonths: number;
  emiAmount: number;       // ₹ per EMI
  outstanding: number;     // ₹ remaining principal
  dueDate: string;         // next EMI due YYYY-MM-DD
  dpdDays: number;         // days past due (0 for pre-due)
  dpdBucket: DpdBucket;
  ptpHistory: PtpHistoryEntry[];
};

export type LeadPreferences = {
  preferredDow: string[]; // e.g. ["Mon", "Wed", "Fri"]
  preferredTod: PreferredTod;
  language: string;       // ISO code
};

export type LeadContactFrequency = {
  whatsapp30d: number;
  voice30d: number;
  sms30d: number;
};

export type LeadPtpRate = {
  made: number;   // total PTPs captured
  kept: number;   // subset that were kept
  ratePct: number; // kept/made * 100 (0 if made=0)
};

export type LeadRecord = {
  id: string;                  // internal lead id
  customerId: string;          // stable business id (used in CRM lookups)
  customerName: string;
  phone: string;
  email?: string;
  segment: Segment;
  riskGrade: RiskGrade;
  loans: LoanState[];
  contactFrequency: LeadContactFrequency;
  preferences: LeadPreferences;
  ptpRate: LeadPtpRate;
};

/** Variables exposed as `lead.memory.<key>` in the campaign builder's variable
 *  picker. Only scalar fields — array fields (loans[], ptpHistory[]) aren't
 *  bind-able as workflow variables in this cut. */
export const LEAD_MEMORY_KEYS: { key: string; source: string; description: string }[] = [
  { key: "lead.memory.segment",              source: "Lead Memory", description: "Retail / SME / HNI" },
  { key: "lead.memory.risk_grade",           source: "Lead Memory", description: "A / B / C / D" },
  { key: "lead.memory.primary_loan_id",      source: "Lead Memory", description: "First active loan on record" },
  { key: "lead.memory.emi_amount",           source: "Lead Memory", description: "₹ per EMI (primary loan)" },
  { key: "lead.memory.outstanding",          source: "Lead Memory", description: "₹ outstanding (primary loan)" },
  { key: "lead.memory.due_date",             source: "Lead Memory", description: "Next EMI due date" },
  { key: "lead.memory.dpd_days",             source: "Lead Memory", description: "Days past due" },
  { key: "lead.memory.dpd_bucket",           source: "Lead Memory", description: "Pre-due / Early / Mid" },
  { key: "lead.memory.ptp_rate_pct",         source: "Lead Memory", description: "Historical PTP kept rate" },
  { key: "lead.memory.last_ptp_kept",        source: "Lead Memory", description: "Boolean — was the most recent PTP kept" },
  { key: "lead.memory.contact_whatsapp_30d", source: "Lead Memory", description: "WhatsApp touches in last 30 days" },
  { key: "lead.memory.contact_voice_30d",    source: "Lead Memory", description: "Voice touches in last 30 days" },
  { key: "lead.memory.preferred_tod",        source: "Lead Memory", description: "Morning / Afternoon / Evening" },
];

/* ------------------------------------------------------------------ *
 *  Seed data
 * ------------------------------------------------------------------ */

// Deterministic-ish jitter so the numbers look plausible without random churn.
function jitter(base: number, seed: number, spread: number): number {
  const t = Math.sin(seed * 12.9898) * 43758.5453;
  const frac = t - Math.floor(t);
  return Math.round(base + (frac - 0.5) * 2 * spread);
}

const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Reyansh", "Krishna", "Ishaan", "Kabir", "Arjun",
  "Rohan", "Aryan", "Priya", "Ananya", "Diya", "Aadhya", "Kavya", "Sara",
  "Meera", "Riya", "Neha", "Anika", "Rahul", "Suresh", "Ajay", "Vikram",
  "Manish", "Deepak", "Ritu", "Shweta", "Pooja", "Kavita",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Patel", "Iyer", "Reddy", "Nair", "Rao",
  "Bhatt", "Menon", "Chopra", "Kapoor", "Sinha", "Bansal", "Malhotra",
];
const SEGMENTS: Segment[] = ["Retail", "Retail", "Retail", "SME", "HNI"];
const GRADES: RiskGrade[] = ["A", "A", "B", "B", "B", "C", "C", "D"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TODS: PreferredTod[] = ["Morning", "Afternoon", "Evening"];
const LANGUAGES = ["en", "hi", "mr", "ta", "te"];

function pick<T>(arr: T[], seed: number): T { return arr[Math.abs(Math.floor(Math.sin(seed) * 1e6)) % arr.length]; }

function dpdBucketFor(days: number): DpdBucket {
  if (days <= 0) return "Pre-due";
  if (days <= 7) return "Early";
  return "Mid"; // 8+ (Late/30+ is out-of-scope for this cut per the plan)
}

function makePtpHistory(seed: number, gradeBias: number): PtpHistoryEntry[] {
  const count = 1 + (jitter(2, seed, 2) % 4 + 4) % 4; // 1..4
  const entries: PtpHistoryEntry[] = [];
  for (let i = 0; i < count; i++) {
    const daysAgo = 15 + i * 25 + (jitter(0, seed + i * 7, 8));
    const d = new Date(Date.parse("2026-07-16T00:00:00+05:30") - daysAgo * 86_400_000);
    const kept = ((Math.sin((seed + i * 3) * 1.7) + 1) / 2 + gradeBias) > 0.5;
    entries.push({
      date: d.toISOString().slice(0, 10),
      amount: 2500 + jitter(500, seed + i * 11, 800),
      kept,
    });
  }
  return entries;
}

function makeLead(i: number): LeadRecord {
  const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
  const lastName = LAST_NAMES[(i * 3 + 1) % LAST_NAMES.length];
  const customerName = `${firstName} ${lastName}`;
  const customerId = `C_${String(200_000 + i * 137).padStart(6, "0")}`;
  const id = `L_${String(300_000 + i * 97).padStart(6, "0")}`;
  const phone = `+9198${String(10_000_000 + i * 74_321).slice(-8)}`;
  const segment = pick(SEGMENTS, i * 3.1);
  const riskGrade = pick(GRADES, i * 1.7);
  const gradeBias = ({ A: 0.3, B: 0.15, C: -0.05, D: -0.2 } as const)[riskGrade];

  // DPD distribution: 55% pre-due, 30% early (1-7), 15% mid (8-29)
  const bucketRoll = (Math.sin(i * 5.13) + 1) / 2;
  let dpdDays: number;
  if (bucketRoll < 0.55) dpdDays = -Math.floor(bucketRoll * 5); // -2 to 0
  else if (bucketRoll < 0.85) dpdDays = 1 + Math.floor((bucketRoll - 0.55) / 0.3 * 6); // 1..6
  else dpdDays = 8 + Math.floor((bucketRoll - 0.85) / 0.15 * 20); // 8..27

  const dueDate = new Date(Date.parse("2026-07-16T00:00:00+05:30") + (-dpdDays + 1) * 86_400_000)
    .toISOString().slice(0, 10);
  const emiAmount = 3500 + jitter(1000, i * 7 + 3, 1500);
  const tenureMonths = [12, 18, 24, 36, 48][Math.abs(i * 3) % 5];
  const outstanding = emiAmount * (tenureMonths - Math.min(tenureMonths, Math.max(1, Math.floor(i / 3) % tenureMonths)));

  const ptpHistory = makePtpHistory(i, gradeBias);
  const made = ptpHistory.length;
  const kept = ptpHistory.filter((p) => p.kept).length;
  const ratePct = made ? Math.round((kept / made) * 100) : 0;

  return {
    id,
    customerId,
    customerName,
    phone,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
    segment,
    riskGrade,
    loans: [
      {
        loanId: `PL_${String(74_000 + i * 121).padStart(6, "0")}`,
        product: "PersonalLoan",
        disbursedOn: new Date(Date.parse(dueDate) - tenureMonths * 30 * 86_400_000).toISOString().slice(0, 10),
        tenureMonths,
        emiAmount,
        outstanding,
        dueDate,
        dpdDays: Math.max(0, dpdDays),
        dpdBucket: dpdBucketFor(dpdDays),
        ptpHistory,
      },
    ],
    contactFrequency: {
      whatsapp30d: 2 + Math.abs(jitter(3, i * 4, 3)),
      voice30d:    Math.abs(jitter(1, i * 7, 2)),
      sms30d:      Math.abs(jitter(1, i * 11, 2)),
    },
    preferences: {
      preferredDow: DOW.slice(0, 3 + (i % 3)),
      preferredTod: pick(TODS, i * 2.3),
      language: pick(LANGUAGES, i * 4.7),
    },
    ptpRate: { made, kept, ratePct },
  };
}

/** Deterministic seed — 50 leads spanning the three DPD buckets, four risk
 *  grades, and three segments. Regenerated at build time from the makeLead
 *  distribution so the numbers stay internally consistent. */
export const LEAD_RECORDS: LeadRecord[] = Array.from({ length: 50 }, (_, i) => makeLead(i));

export function getLead(id: string): LeadRecord | undefined {
  return LEAD_RECORDS.find((l) => l.id === id);
}

/** Convenience — a lead's "primary" loan (the first, and in this cut, only, loan). */
export function primaryLoan(l: LeadRecord): LoanState {
  return l.loans[0];
}

/** Aggregate counts across the whole book — used by the Leads header pill and by
 *  the Collections analytics dashboard. */
export function leadCounts(): { total: number; byBucket: Record<DpdBucket, number>; totalOutstanding: number } {
  const byBucket: Record<DpdBucket, number> = { "Pre-due": 0, Early: 0, Mid: 0 };
  let totalOutstanding = 0;
  for (const l of LEAD_RECORDS) {
    const loan = primaryLoan(l);
    byBucket[loan.dpdBucket] += 1;
    totalOutstanding += loan.outstanding;
  }
  return { total: LEAD_RECORDS.length, byBucket, totalOutstanding };
}

/* ------------------------------------------------------------------ *
 *  PII redaction — masking for compliance-conscious views
 * ------------------------------------------------------------------ */

/** Mask a phone number for PII redaction: keep country code + last 4 digits,
 *  bullet-out the middle. E.g. `+919812345678` → `+91·98······5678`. */
export function maskPhone(phone: string): string {
  const cleaned = phone.replace(/\s+/g, "");
  if (cleaned.length < 6) return "•".repeat(cleaned.length);
  const cc = cleaned.startsWith("+") ? cleaned.slice(0, 3) : "";
  const tail = cleaned.slice(-4);
  const middleLen = Math.max(4, cleaned.length - cc.length - tail.length);
  return `${cc}·${cleaned.slice(cc.length, cc.length + 2)}${"•".repeat(middleLen - 2)}${tail}`;
}

/** Mask an email address: keep first char + domain, bullet-out the local part. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 2) return "•••" + email.slice(at);
  return email[0] + "•••" + email.slice(at);
}

/** Mask a customer id: keep the prefix + last 2 chars. */
export function maskCustomerId(id: string): string {
  if (id.length < 6) return id;
  return `${id.slice(0, 2)}${"•".repeat(id.length - 4)}${id.slice(-2)}`;
}
