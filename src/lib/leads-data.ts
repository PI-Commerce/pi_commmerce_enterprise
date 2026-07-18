/**
 * Leads Management — persistent per-customer memory for the FinServ platform.
 *
 * The unit of truth is the **person**, not the product. A single Lead can hold
 * several BFSI products at once (Personal Loan + Insurance Policy + Credit Card
 * + ongoing Application, etc.), and each product carries its own domain shape.
 * Cross-cutting state (preferences, contact frequency, interactions timeline,
 * PTP register spanning all products) lives at the person level.
 *
 * This is the FinServ "one customer view" — Collections operates on loan-type
 * products; Renewal on policy-type; Cards Dues on card-type; Onboarding on
 * application-type; each vertical pack reads the same Lead pool through a
 * different product-kind lens.
 */

export type Segment = "Retail" | "SME" | "HNI";
export type RiskGrade = "A" | "B" | "C" | "D";
export type PreferredTod = "Morning" | "Afternoon" | "Evening";
export type DpdBucket = "Pre-due" | "Early" | "Mid";

/* ------------------------------------------------------------------ *
 *  Product union — each BFSI product a Lead can hold
 * ------------------------------------------------------------------ */

export type ProductKind =
  | "PersonalLoan"
  | "InsurancePolicy"
  | "CreditCard"
  | "Application"
  | "InvestmentAccount";

export type PtpHistoryEntry = { date: string; amount: number; kept: boolean };

export type PersonalLoanProduct = {
  kind: "PersonalLoan";
  loanId: string;
  emiAmount: number;         // ₹
  outstanding: number;       // ₹ remaining principal
  dueDate: string;           // YYYY-MM-DD next EMI due
  dpdDays: number;           // 0 for pre-due, negative not used (bucket carries semantics)
  dpdBucket: DpdBucket;
  disbursedOn: string;       // YYYY-MM-DD
  tenureMonths: number;
  ptpHistory: PtpHistoryEntry[];
};

export type PolicyType = "Health" | "Life" | "Auto" | "Home";
export type ClaimEntry = { date: string; amount: number; status: "Settled" | "Rejected" | "In-review" };

export type InsurancePolicyProduct = {
  kind: "InsurancePolicy";
  policyNumber: string;
  policyType: PolicyType;
  premium: number;           // ₹ annual
  sumInsured: number;        // ₹
  renewalDate: string;       // YYYY-MM-DD
  daysToRenewal: number;     // negative = lapsed
  lastRenewedOn: string;     // YYYY-MM-DD
  claims: ClaimEntry[];
};

export type CardType = "Basic" | "Gold" | "Platinum" | "Signature";

export type CreditCardProduct = {
  kind: "CreditCard";
  cardId: string;
  cardType: CardType;
  outstanding: number;       // ₹ current statement balance
  creditLimit: number;       // ₹
  minDue: number;            // ₹
  totalDue: number;          // ₹
  dueDate: string;           // YYYY-MM-DD statement due date
  dpdDays: number;
  dpdBucket: DpdBucket;
};

export type ApplicationStage = "InitiatedKYC" | "DocumentsPending" | "UnderReview" | "OfferShared" | "Dropped";
export type ApplicationKycStatus = "Pending" | "Verified" | "Failed";

export type ApplicationProduct = {
  kind: "Application";
  applicationId: string;
  applyingFor: "PersonalLoan" | "CreditCard" | "InsurancePolicy";
  stage: ApplicationStage;
  stageEnteredAt: string;    // YYYY-MM-DD
  kycStatus: ApplicationKycStatus;
  droppedReason?: string;    // when stage === "Dropped"
};

export type InvestmentType = "Mutual Fund" | "Stocks" | "Bonds";

export type InvestmentAccountProduct = {
  kind: "InvestmentAccount";
  accountNumber: string;
  investmentType: InvestmentType;
  portfolioValue: number;    // ₹
  lastTradeOn: string;       // YYYY-MM-DD
  activeSip: boolean;
};

export type LeadProduct =
  | PersonalLoanProduct
  | InsurancePolicyProduct
  | CreditCardProduct
  | ApplicationProduct
  | InvestmentAccountProduct;

/* ------------------------------------------------------------------ *
 *  Cross-cutting entities
 * ------------------------------------------------------------------ */

export type InteractionChannel = "WhatsApp" | "Voice" | "SMS" | "Email";
export type InteractionEntry = {
  timestamp: string;                    // human-friendly relative timestamp
  channel: InteractionChannel;
  direction: "outbound" | "inbound";
  productKind?: ProductKind;            // which product this touched (if any)
  productRef?: string;                  // loanId / policyNumber / cardId / appId
  summary: string;                      // human-readable one-liner
  outcome?: string;                     // e.g. "PTP captured", "Delivered", "Renewed"
};

export type PtpRegisterEntry = {
  productKind: ProductKind;
  productRef: string;                   // loanId / cardId (only loan-ish products get PTPs)
  promisedDate: string;                 // YYYY-MM-DD
  amount: number;
  kept: boolean | null;                 // null = pending (future date)
};

export type LeadPreferences = {
  preferredDow: string[];
  preferredTod: PreferredTod;
  language: string;
};

export type LeadContactFrequency = {
  whatsapp30d: number;
  voice30d: number;
  sms30d: number;
};

export type LeadPtpRate = {
  made: number;
  kept: number;
  ratePct: number;
};

/* ------------------------------------------------------------------ *
 *  Lead record
 * ------------------------------------------------------------------ */

export type LeadRecord = {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  email?: string;
  segment: Segment;
  riskGrade: RiskGrade;
  products: LeadProduct[];              // 1..3 for the seed
  /** ISO date the lead was first onboarded. Drives the Lead Creation column + filter. */
  createdAt: string;
  /** ISO date the lead memory was last touched (interaction / PTP / campaign event). */
  lastUpdatedAt: string;
  /** ISO date + channel of the most recent interaction (surfaces in the table). */
  lastInteractionAt: string;
  preferences: LeadPreferences;
  contactFrequency: LeadContactFrequency;
  interactions: InteractionEntry[];
  ptpRegister: PtpRegisterEntry[];
  ptpRate: LeadPtpRate;                 // aggregated across products
};

/* ------------------------------------------------------------------ *
 *  lead.memory.* keys for the campaign-builder variable picker
 *
 *  Convention: identity-scoped keys are always visible; product-scoped keys
 *  are tagged with the `useCase` they belong to. The picker can filter by the
 *  current campaign's useCase when we wire that up — until then, every key
 *  shows up in the picker.
 * ------------------------------------------------------------------ */

// UseCase is the shared vertical-pack tag defined in campaign-types.ts.
import type { UseCase } from "./campaign-types";
export type { UseCase };

export const LEAD_MEMORY_KEYS: { key: string; source: string; description: string; useCase?: UseCase }[] = [
  // Identity — always available
  { key: "lead.memory.segment",               source: "Lead Memory · identity", description: "Retail / SME / HNI" },
  { key: "lead.memory.risk_grade",            source: "Lead Memory · identity", description: "A / B / C / D" },
  { key: "lead.memory.contact_whatsapp_30d",  source: "Lead Memory · identity", description: "WhatsApp touches in last 30 days" },
  { key: "lead.memory.contact_voice_30d",     source: "Lead Memory · identity", description: "Voice touches in last 30 days" },
  { key: "lead.memory.contact_sms_30d",       source: "Lead Memory · identity", description: "SMS touches in last 30 days" },
  { key: "lead.memory.preferred_tod",         source: "Lead Memory · identity", description: "Morning / Afternoon / Evening" },
  { key: "lead.memory.language",              source: "Lead Memory · identity", description: "Preferred language (ISO code)" },
  // Personal Loan Collections
  { key: "lead.memory.personal_loan.dpd_bucket",     source: "Lead Memory · Personal Loan", description: "Pre-due / Early / Mid",         useCase: "personal_loan_collections" },
  { key: "lead.memory.personal_loan.dpd_days",       source: "Lead Memory · Personal Loan", description: "Days past due",                 useCase: "personal_loan_collections" },
  { key: "lead.memory.personal_loan.outstanding",    source: "Lead Memory · Personal Loan", description: "Outstanding principal (₹)",     useCase: "personal_loan_collections" },
  { key: "lead.memory.personal_loan.emi_amount",     source: "Lead Memory · Personal Loan", description: "EMI amount (₹)",                useCase: "personal_loan_collections" },
  { key: "lead.memory.personal_loan.ptp_rate_pct",   source: "Lead Memory · Personal Loan", description: "Historical PTP kept rate (%)",  useCase: "personal_loan_collections" },
  { key: "lead.memory.personal_loan.last_ptp_kept",  source: "Lead Memory · Personal Loan", description: "Was the last PTP kept?",        useCase: "personal_loan_collections" },
  // Insurance Renewal
  { key: "lead.memory.policy.renewal_date",     source: "Lead Memory · Policy", description: "Next renewal date",                useCase: "insurance_renewal" },
  { key: "lead.memory.policy.days_to_renewal",  source: "Lead Memory · Policy", description: "Days until renewal (negative = lapsed)", useCase: "insurance_renewal" },
  { key: "lead.memory.policy.premium",          source: "Lead Memory · Policy", description: "Annual premium (₹)",               useCase: "insurance_renewal" },
  { key: "lead.memory.policy.sum_insured",      source: "Lead Memory · Policy", description: "Sum insured (₹)",                  useCase: "insurance_renewal" },
  { key: "lead.memory.policy.type",             source: "Lead Memory · Policy", description: "Health / Life / Auto / Home",      useCase: "insurance_renewal" },
  { key: "lead.memory.policy.last_claim_status",source: "Lead Memory · Policy", description: "Settled / Rejected / In-review / none", useCase: "insurance_renewal" },
  // Credit Card Dues
  { key: "lead.memory.credit_card.dpd_bucket",  source: "Lead Memory · Credit Card", description: "Pre-due / Early / Mid",       useCase: "credit_card_dues" },
  { key: "lead.memory.credit_card.outstanding", source: "Lead Memory · Credit Card", description: "Statement balance (₹)",       useCase: "credit_card_dues" },
  { key: "lead.memory.credit_card.min_due",     source: "Lead Memory · Credit Card", description: "Minimum due (₹)",              useCase: "credit_card_dues" },
  { key: "lead.memory.credit_card.credit_limit",source: "Lead Memory · Credit Card", description: "Credit limit (₹)",             useCase: "credit_card_dues" },
  // KYC Onboarding
  { key: "lead.memory.application.stage",       source: "Lead Memory · Application", description: "Current onboarding stage",    useCase: "kyc_onboarding" },
  { key: "lead.memory.application.kyc_status",  source: "Lead Memory · Application", description: "Pending / Verified / Failed", useCase: "kyc_onboarding" },
  { key: "lead.memory.application.applying_for",source: "Lead Memory · Application", description: "Product the customer applied for", useCase: "kyc_onboarding" },
];

/* ------------------------------------------------------------------ *
 *  Seed data generation
 * ------------------------------------------------------------------ */

function jitter(base: number, seed: number, spread: number): number {
  const t = Math.sin(seed * 12.9898) * 43758.5453;
  const frac = t - Math.floor(t);
  return Math.round(base + (frac - 0.5) * 2 * spread);
}
function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(Math.floor(Math.sin(seed) * 1e6)) % arr.length];
}
function pickN<T>(arr: T[], n: number, seed: number): T[] {
  const out: T[] = [];
  const used = new Set<number>();
  for (let i = 0; i < n && used.size < arr.length; i++) {
    let idx = Math.abs(Math.floor(Math.sin((seed + i) * 4.7) * 1e6)) % arr.length;
    while (used.has(idx)) idx = (idx + 1) % arr.length;
    used.add(idx);
    out.push(arr[idx]);
  }
  return out;
}
function offsetDate(days: number): string {
  return new Date(Date.parse("2026-07-16T00:00:00+05:30") + days * 86_400_000).toISOString().slice(0, 10);
}
function dpdBucketFor(days: number): DpdBucket {
  if (days <= 0) return "Pre-due";
  if (days <= 7) return "Early";
  return "Mid";
}

const FIRST_NAMES = [
  "Aarav","Vivaan","Aditya","Reyansh","Krishna","Ishaan","Kabir","Arjun","Rohan","Aryan",
  "Priya","Ananya","Diya","Aadhya","Kavya","Sara","Meera","Riya","Neha","Anika",
  "Rahul","Suresh","Ajay","Vikram","Manish","Deepak","Ritu","Shweta","Pooja","Kavita",
];
const LAST_NAMES = ["Sharma","Verma","Gupta","Patel","Iyer","Reddy","Nair","Rao","Bhatt","Menon","Chopra","Kapoor","Sinha","Bansal","Malhotra"];
const SEGMENTS: Segment[] = ["Retail","Retail","Retail","SME","HNI"];
const GRADES: RiskGrade[] = ["A","A","B","B","B","C","C","D"];
const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat"];
const TODS: PreferredTod[] = ["Morning","Afternoon","Evening"];
const LANGUAGES = ["en","hi","mr","ta","te"];
const POLICY_TYPES: PolicyType[] = ["Health","Life","Auto","Home"];
const CARD_TYPES: CardType[] = ["Basic","Gold","Platinum","Signature"];
const APP_STAGES: ApplicationStage[] = ["InitiatedKYC","DocumentsPending","UnderReview","OfferShared","Dropped"];
const INVEST_TYPES: InvestmentType[] = ["Mutual Fund","Stocks","Bonds"];
const KIND_POOL: ProductKind[] = ["PersonalLoan","InsurancePolicy","CreditCard","Application","InvestmentAccount"];

/* -------- Product factories -------- */

function makePersonalLoan(seed: number): PersonalLoanProduct {
  const roll = (Math.sin(seed * 5.13) + 1) / 2;
  const dpdDays = roll < 0.55 ? 0 : roll < 0.85 ? 1 + Math.floor((roll - 0.55) / 0.3 * 6) : 8 + Math.floor((roll - 0.85) / 0.15 * 20);
  const emiAmount = 3500 + jitter(1000, seed * 7 + 3, 1500);
  const tenure = [12, 18, 24, 36, 48][Math.abs(seed * 3) % 5];
  const dueDate = offsetDate(-dpdDays + 1);
  const outstanding = emiAmount * (tenure - Math.min(tenure, Math.max(1, Math.floor(seed / 3) % tenure)));
  const ptpCount = 1 + (Math.abs(jitter(2, seed, 2)) % 3);
  const ptpHistory: PtpHistoryEntry[] = [];
  for (let i = 0; i < ptpCount; i++) {
    const daysAgo = 15 + i * 25 + jitter(0, seed + i * 7, 8);
    const kept = (Math.sin((seed + i * 3) * 1.7) + 1) / 2 > 0.4;
    ptpHistory.push({ date: offsetDate(-daysAgo), amount: 2500 + jitter(500, seed + i * 11, 800), kept });
  }
  return {
    kind: "PersonalLoan",
    loanId: `PL_${String(74_000 + seed * 121).padStart(6, "0")}`,
    emiAmount, outstanding, dueDate, dpdDays,
    dpdBucket: dpdBucketFor(dpdDays),
    disbursedOn: offsetDate(-tenure * 30 + jitter(0, seed, 30)),
    tenureMonths: tenure, ptpHistory,
  };
}

function makeInsurancePolicy(seed: number): InsurancePolicyProduct {
  const roll = (Math.sin(seed * 7.31) + 1) / 2;
  const daysToRenewal = roll < 0.6 ? Math.floor(roll * 60) : roll < 0.85 ? Math.floor((roll - 0.6) / 0.25 * 30) - 5 : -Math.floor((roll - 0.85) / 0.15 * 30);
  const policyType = POLICY_TYPES[Math.abs(seed) % POLICY_TYPES.length];
  const premium = policyType === "Health" ? 18_000 + jitter(4000, seed * 3, 6000)
    : policyType === "Life" ? 42_000 + jitter(8000, seed * 3, 12_000)
    : policyType === "Auto" ? 14_000 + jitter(3000, seed * 3, 4000)
    : 22_000 + jitter(5000, seed * 3, 7000);
  const sumInsured = premium * (policyType === "Life" ? 60 : 20);
  const claimCount = Math.abs(jitter(0, seed * 2, 2)) % 3;
  const claims: ClaimEntry[] = [];
  for (let i = 0; i < claimCount; i++) {
    const status: ClaimEntry["status"] = ["Settled","Rejected","In-review"][Math.abs(jitter(0, seed + i * 5, 3)) % 3] as ClaimEntry["status"];
    claims.push({ date: offsetDate(-90 - i * 60 - jitter(0, seed, 30)), amount: sumInsured * 0.02 + jitter(2000, seed + i, 4000), status });
  }
  return {
    kind: "InsurancePolicy",
    policyNumber: `POL_${String(9800 + seed * 17).padStart(5, "0")}`,
    policyType, premium, sumInsured,
    renewalDate: offsetDate(daysToRenewal),
    daysToRenewal,
    lastRenewedOn: offsetDate(daysToRenewal - 365),
    claims,
  };
}

function makeCreditCard(seed: number): CreditCardProduct {
  const roll = (Math.sin(seed * 9.17) + 1) / 2;
  const dpdDays = roll < 0.7 ? 0 : roll < 0.9 ? 1 + Math.floor((roll - 0.7) / 0.2 * 6) : 8 + Math.floor((roll - 0.9) / 0.1 * 20);
  const creditLimit = 50_000 + jitter(50_000, seed * 5, 150_000);
  const outstanding = Math.min(creditLimit, Math.max(0, jitter(creditLimit * 0.4, seed * 4, creditLimit * 0.35)));
  const totalDue = outstanding;
  const minDue = Math.max(500, Math.round(totalDue * 0.05));
  return {
    kind: "CreditCard",
    cardId: `CC_${String(88_000 + seed * 41).padStart(5, "0")}`,
    cardType: CARD_TYPES[Math.abs(seed * 2) % CARD_TYPES.length],
    outstanding, creditLimit, minDue, totalDue,
    dueDate: offsetDate(-dpdDays + 5),
    dpdDays, dpdBucket: dpdBucketFor(dpdDays),
  };
}

function makeApplication(seed: number): ApplicationProduct {
  const stage = APP_STAGES[Math.abs(seed) % APP_STAGES.length];
  const kycStatus: ApplicationKycStatus = stage === "OfferShared" ? "Verified" : stage === "Dropped" ? "Failed" : "Pending";
  return {
    kind: "Application",
    applicationId: `APP_${String(55_000 + seed * 23).padStart(5, "0")}`,
    applyingFor: (["PersonalLoan","CreditCard","InsurancePolicy"] as const)[Math.abs(seed * 3) % 3],
    stage,
    stageEnteredAt: offsetDate(-jitter(5, seed, 8)),
    kycStatus,
    droppedReason: stage === "Dropped" ? pick(["Video KYC failed","Documents pending","Timed out at OTP","User abandoned"], seed) : undefined,
  };
}

function makeInvestmentAccount(seed: number): InvestmentAccountProduct {
  return {
    kind: "InvestmentAccount",
    accountNumber: `INV_${String(30_000 + seed * 71).padStart(5, "0")}`,
    investmentType: INVEST_TYPES[Math.abs(seed) % INVEST_TYPES.length],
    portfolioValue: 80_000 + Math.abs(jitter(200_000, seed * 3, 800_000)),
    lastTradeOn: offsetDate(-Math.abs(jitter(15, seed, 30))),
    activeSip: Math.sin(seed * 2.3) > 0,
  };
}

const KIND_FACTORY: Record<ProductKind, (seed: number) => LeadProduct> = {
  PersonalLoan:      makePersonalLoan,
  InsurancePolicy:   makeInsurancePolicy,
  CreditCard:        makeCreditCard,
  Application:       makeApplication,
  InvestmentAccount: makeInvestmentAccount,
};

/* -------- Product mix per lead -------- */

/** Deterministically decide how many + which products a given lead index holds.
 *  Targets a natural distribution across the seed of 50:
 *    ~40% single-product, ~40% two-product, ~20% three-product.
 *  Products mix so every kind shows up plenty of times. */
function productMixFor(i: number): ProductKind[] {
  // Handpicked overlays for the first 12 leads → guaranteed variety on page 1
  const overlays: ProductKind[][] = [
    ["PersonalLoan"],
    ["PersonalLoan","InsurancePolicy"],
    ["PersonalLoan","CreditCard"],
    ["InsurancePolicy"],
    ["PersonalLoan","InsurancePolicy","CreditCard"],  // hero: 3-product
    ["CreditCard"],
    ["InsurancePolicy","CreditCard"],
    ["Application"],
    ["PersonalLoan","InvestmentAccount"],
    ["InsurancePolicy","InvestmentAccount"],
    ["PersonalLoan","CreditCard","InvestmentAccount"],
    ["Application","CreditCard"],
  ];
  if (i < overlays.length) return overlays[i];
  // The rest follow a deterministic mix.
  const r = (Math.sin(i * 11.29) + 1) / 2;
  const count = r < 0.4 ? 1 : r < 0.8 ? 2 : 3;
  return pickN(KIND_POOL, count, i * 7.13);
}

/* -------- Interactions timeline -------- */

function makeInteractions(products: LeadProduct[], seed: number): InteractionEntry[] {
  const out: InteractionEntry[] = [];
  const templates: { channel: InteractionChannel; direction: InteractionEntry["direction"]; summary: string; outcome?: string }[] = [
    { channel: "WhatsApp", direction: "outbound", summary: "Payment reminder sent",              outcome: "Delivered · Read" },
    { channel: "WhatsApp", direction: "inbound",  summary: "Replied — asked for extension",       outcome: "Reply received" },
    { channel: "Voice",    direction: "outbound", summary: "Collections voice call · 2m 44s",     outcome: "PTP captured" },
    { channel: "Voice",    direction: "outbound", summary: "Reminder call · 1m 18s",              outcome: "Answered" },
    { channel: "SMS",      direction: "outbound", summary: "Renewal reminder SMS",                outcome: "Delivered" },
    { channel: "WhatsApp", direction: "outbound", summary: "Renewal link shared",                 outcome: "Delivered" },
    { channel: "Email",    direction: "outbound", summary: "Monthly statement emailed",           outcome: "Sent" },
  ];
  const count = 3 + (Math.abs(jitter(0, seed, 2)) % 3);
  for (let i = 0; i < count; i++) {
    const t = templates[Math.abs(jitter(0, seed + i * 3, templates.length)) % templates.length];
    const product = products[Math.abs(jitter(0, seed + i * 5, products.length)) % products.length];
    const days = 1 + i * 2 + jitter(0, seed + i, 1);
    out.push({
      timestamp: days === 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`,
      channel: t.channel, direction: t.direction, summary: t.summary, outcome: t.outcome,
      productKind: product.kind,
      productRef: product.kind === "PersonalLoan" ? product.loanId
                : product.kind === "InsurancePolicy" ? product.policyNumber
                : product.kind === "CreditCard" ? product.cardId
                : product.kind === "Application" ? product.applicationId
                : product.accountNumber,
    });
  }
  return out;
}

/* -------- PTP register — pull from any loan-type products -------- */

function buildPtpRegister(products: LeadProduct[]): { register: PtpRegisterEntry[]; rate: LeadPtpRate } {
  const register: PtpRegisterEntry[] = [];
  for (const p of products) {
    if (p.kind === "PersonalLoan") {
      for (const h of p.ptpHistory) {
        register.push({ productKind: "PersonalLoan", productRef: p.loanId, promisedDate: h.date, amount: h.amount, kept: h.kept });
      }
    }
    // Cards + Insurance don't seed PTPs in this cut; add here when they do.
  }
  const made = register.length;
  const kept = register.filter((r) => r.kept === true).length;
  const ratePct = made ? Math.round((kept / made) * 100) : 0;
  return { register, rate: { made, kept, ratePct } };
}

function makeLead(i: number): LeadRecord {
  const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
  const lastName = LAST_NAMES[(i * 3 + 1) % LAST_NAMES.length];
  const customerName = `${firstName} ${lastName}`;
  const customerId = `C_${String(200_000 + i * 137).padStart(6, "0")}`;
  const phone = `+9198${String(10_000_000 + i * 74_321).slice(-8)}`;

  const kinds = productMixFor(i);
  const products: LeadProduct[] = kinds.map((k, idx) => KIND_FACTORY[k](i * 11 + idx * 7 + 1));

  const { register, rate } = buildPtpRegister(products);

  // Date fields: creation is somewhere in the last 30–720 days; lastUpdatedAt is
  // more recent (1–90 days); lastInteractionAt is closest to today (0–30 days).
  const createdDays  = 30 + Math.abs(jitter(0, i * 3.7, 690));
  const updatedDays  = 1  + Math.abs(jitter(0, i * 5.1, 89));
  const interactedDays = Math.abs(jitter(0, i * 7.3, 30));
  return {
    id: `L_${String(300_000 + i * 97).padStart(6, "0")}`,
    customerId, customerName, phone,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
    segment: pick(SEGMENTS, i * 3.1),
    riskGrade: pick(GRADES, i * 1.7),
    products,
    createdAt: offsetDate(-createdDays),
    lastUpdatedAt: offsetDate(-updatedDays),
    lastInteractionAt: offsetDate(-interactedDays),
    preferences: {
      preferredDow: DOW.slice(0, 3 + (i % 3)),
      preferredTod: pick(TODS, i * 2.3),
      language: pick(LANGUAGES, i * 4.7),
    },
    contactFrequency: {
      whatsapp30d: 2 + Math.abs(jitter(3, i * 4, 3)),
      voice30d:    Math.abs(jitter(1, i * 7, 2)),
      sms30d:      Math.abs(jitter(1, i * 11, 2)),
    },
    interactions: makeInteractions(products, i),
    ptpRegister: register,
    ptpRate: rate,
  };
}

export const LEAD_RECORDS: LeadRecord[] = Array.from({ length: 50 }, (_, i) => makeLead(i));

export function getLead(id: string): LeadRecord | undefined {
  return LEAD_RECORDS.find((l) => l.id === id);
}

/* ------------------------------------------------------------------ *
 *  Query helpers — power the table's filter chips and detail cards
 * ------------------------------------------------------------------ */

/** Convenience — returns the first product of a given kind held by this lead, if any. */
export function productOfKind<K extends ProductKind>(l: LeadRecord, kind: K): Extract<LeadProduct, { kind: K }> | undefined {
  return l.products.find((p) => p.kind === kind) as Extract<LeadProduct, { kind: K }> | undefined;
}

/** "Active tasks" — human-readable chips summarizing what needs attention across
 *  all of this lead's products. Drives the Leads-table `Active tasks` column. */
export type ActiveTask = { label: string; tone: "info" | "warn" | "urgent" };
export function activeTasksFor(l: LeadRecord): ActiveTask[] {
  const tasks: ActiveTask[] = [];
  for (const p of l.products) {
    if (p.kind === "PersonalLoan") {
      if (p.dpdBucket === "Mid") tasks.push({ label: `EMI ${p.dpdDays}d overdue`, tone: "urgent" });
      else if (p.dpdBucket === "Early") tasks.push({ label: `EMI ${p.dpdDays}d overdue`, tone: "warn" });
      else tasks.push({ label: `EMI due ${p.dueDate}`, tone: "info" });
    } else if (p.kind === "InsurancePolicy") {
      if (p.daysToRenewal < 0) tasks.push({ label: `Policy lapsed ${-p.daysToRenewal}d`, tone: "urgent" });
      else if (p.daysToRenewal <= 15) tasks.push({ label: `Renewal in ${p.daysToRenewal}d`, tone: "warn" });
    } else if (p.kind === "CreditCard") {
      if (p.dpdBucket === "Mid") tasks.push({ label: `Card ${p.dpdDays}d overdue`, tone: "urgent" });
      else if (p.dpdBucket === "Early") tasks.push({ label: `Min due ${p.dpdDays}d overdue`, tone: "warn" });
    } else if (p.kind === "Application") {
      if (p.stage === "Dropped") tasks.push({ label: `App dropped · ${p.droppedReason ?? "unknown"}`, tone: "warn" });
      else if (p.stage === "DocumentsPending") tasks.push({ label: "Docs pending", tone: "info" });
    }
    // InvestmentAccount currently doesn't drive a task.
  }
  return tasks;
}

/** Book-level counts for the Leads header. */
export function leadCounts(): {
  total: number;
  byKind: Record<ProductKind, number>;
  totalOutstanding: number;
} {
  const byKind: Record<ProductKind, number> = {
    PersonalLoan: 0, InsurancePolicy: 0, CreditCard: 0, Application: 0, InvestmentAccount: 0,
  };
  let totalOutstanding = 0;
  for (const l of LEAD_RECORDS) {
    for (const p of l.products) {
      byKind[p.kind] += 1;
      if (p.kind === "PersonalLoan") totalOutstanding += p.outstanding;
      else if (p.kind === "CreditCard") totalOutstanding += p.outstanding;
    }
  }
  return { total: LEAD_RECORDS.length, byKind, totalOutstanding };
}

/* ------------------------------------------------------------------ *
 *  PII redaction — masking for compliance-conscious views
 * ------------------------------------------------------------------ */

export function maskPhone(phone: string): string {
  const cleaned = phone.replace(/\s+/g, "");
  if (cleaned.length < 6) return "•".repeat(cleaned.length);
  const cc = cleaned.startsWith("+") ? cleaned.slice(0, 3) : "";
  const tail = cleaned.slice(-4);
  const middleLen = Math.max(4, cleaned.length - cc.length - tail.length);
  return `${cc}·${cleaned.slice(cc.length, cc.length + 2)}${"•".repeat(middleLen - 2)}${tail}`;
}
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 2) return "•••" + email.slice(at);
  return email[0] + "•••" + email.slice(at);
}
export function maskCustomerId(id: string): string {
  if (id.length < 6) return id;
  return `${id.slice(0, 2)}${"•".repeat(id.length - 4)}${id.slice(-2)}`;
}

/* ------------------------------------------------------------------ *
 *  Product-kind labels & tints (reused by table + detail + analytics)
 * ------------------------------------------------------------------ */

export const PRODUCT_LABEL: Record<ProductKind, string> = {
  PersonalLoan: "Personal Loan",
  InsurancePolicy: "Policy",
  CreditCard: "Credit Card",
  Application: "Application",
  InvestmentAccount: "Investments",
};
export const PRODUCT_TINT: Record<ProductKind, string> = {
  PersonalLoan:      "text-chart-1 bg-chart-1/10 border-chart-1/25",
  InsurancePolicy:   "text-chart-2 bg-chart-2/10 border-chart-2/25",
  CreditCard:        "text-chart-4 bg-chart-4/10 border-chart-4/25",
  Application:       "text-chart-3 bg-chart-3/10 border-chart-3/25",
  InvestmentAccount: "text-chart-5 bg-chart-5/10 border-chart-5/25",
};
