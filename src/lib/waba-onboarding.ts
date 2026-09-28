/**
 * WhatsApp (WABA) Onboarding + multi-WABA workspace types.
 *
 * Meta's construct is a three-level hierarchy that the merchant experiences
 * directly, so this file models all three:
 *
 *   Business Manager       (one, top of the hierarchy)
 *     · Business verification, credit line, users/roles, data region.
 *   WABA                   (many under a BM)
 *     · Templates (per template per language), namespace, OBA / green tick,
 *       payment currency, WABA-level restriction if Meta flags for spam.
 *   Phone number           (many under a WABA)
 *     · Display name, quality rating, messaging limit tier, throughput,
 *       registration PIN, per-number restriction status.
 *
 * A "workspace session" is the merchant's live view over the whole tree —
 * the BM they're inside and which (WABA, phone) they've currently selected.
 * All WABA-scoped surfaces filter by the selected WABA; all number-scoped
 * surfaces filter by the selected phone.
 *
 * Existing surfaces that were written against the old flat single-WABA
 * `ConnectedWaba` type keep working via {@link projectSelected} — a helper
 * that renders the session down into the old shape.
 */

/* -------------------------------------------------------------------------- *
 *  Level 1: Business Manager
 * -------------------------------------------------------------------------- */

export type BusinessManager = {
  id: string;
  name: string;
  /** Meta business verification. Unlocks display names and higher tier ceilings. */
  verified: boolean;
  /** Billing state — shared across every WABA in this BM. */
  creditLine: "Shared" | "Not connected";
  /** Data localization region reported by Meta. */
  dataRegion: string;
};

/* -------------------------------------------------------------------------- *
 *  Level 2: WABA
 * -------------------------------------------------------------------------- */

/** Official Business Account status. `green_tick` is the visible checkmark. */
export type WabaOba = "green_tick" | "verified" | "unverified";

/** WABA-level Meta enforcement state. Applies to every number in the WABA. */
export type WabaRestriction = "active" | "restricted" | "in_review";

export type Waba = {
  id: string;
  name: string;
  displayName: string;
  category: string;
  /** BM this WABA lives under. WABAs are BM-scoped in Meta's hierarchy. */
  bmId: string;
  /** Template namespace — WABA-scoped, used when sending templates. */
  namespace: string;
  oba: WabaOba;
  /** Billing currency for template messages under this WABA. */
  currency: string;
  restriction: WabaRestriction;
  phones: PhoneNumber[];
};

/* -------------------------------------------------------------------------- *
 *  Level 3: Phone number
 * -------------------------------------------------------------------------- */

export type QualityRating = "green" | "yellow" | "red";

/** Daily unique users a number can initiate business-conversations with.
 *  Ceiling depends on BM verification; the tier itself sits on the number. */
export type LimitTier = "250" | "1K" | "10K" | "100K" | "Unlimited";

/** Per-number Meta enforcement state (independent of WABA-level restriction). */
export type PhoneRestriction = "active" | "restricted";

export type PhoneNumber = {
  id: string;
  /** E.164 with spaces for readability. */
  display: string;
  /** Meta-approved sender name shown in the chat header. */
  displayName: string;
  qualityRating: QualityRating;
  limitTier: LimitTier;
  /** Messages per second the number is provisioned for. */
  throughputMps: number;
  verified: boolean;
  restriction: PhoneRestriction;
};

/* -------------------------------------------------------------------------- *
 *  Session
 * -------------------------------------------------------------------------- */

export type WorkspaceSession = {
  /** Every Business Manager on the workspace. Multi-BM is real from Priority 2
   *  onwards; today the seed has two so the demo can tell the story. */
  businessManagers: BusinessManager[];
  /** Every WABA across every BM. Filter by `wabas.filter(w => w.bmId === bmId)`
   *  to get a BM's WABAs. */
  wabas: Waba[];
  selectedBusinessManagerId: string;
  selectedWabaId: string;
  selectedPhoneNumberId: string;
  connection: {
    connectedAt: string;
    lastSync: string;
    provisioningStatus: "Complete" | "In progress" | "Failed";
    status: "Connected";
  };
};

/* -------------------------------------------------------------------------- *
 *  Legacy projection — flat shape older surfaces still read
 * -------------------------------------------------------------------------- */

/**
 * Legacy shape used by surfaces that were written for the single-WABA world.
 * Projected from the currently-selected (WABA, phone) inside a session. New
 * code should read from {@link WorkspaceSession} directly.
 */
export type ConnectedWaba = {
  businessPortfolio: { name: string; id: string };
  waba: { name: string; id: string; displayName: string; category: string };
  phone: { display: string; id: string; verified: boolean };
  connection: {
    connectedAt: string;
    lastSync: string;
    provisioningStatus: "Complete" | "In progress" | "Failed";
    status: "Connected";
  };
  sender: {
    qualityRating: string;
    messagingLimitTier: string;
    businessVerification: string;
  };
};

/** Human-friendly label for a quality bucket. */
export const QUALITY_LABEL: Record<QualityRating, string> = {
  green: "Green · High",
  yellow: "Yellow · Medium",
  red: "Red · Low",
};

/** Human-friendly label for a limit tier. */
export const LIMIT_TIER_LABEL: Record<LimitTier, string> = {
  "250": "Tier 0 · 250 / 24h",
  "1K": "Tier 1 · 1K / 24h",
  "10K": "Tier 2 · 10K / 24h",
  "100K": "Tier 3 · 100K / 24h",
  Unlimited: "Tier 4 · Unlimited",
};

/** Project a workspace session down to the legacy flat shape.  */
export function projectSelected(s: WorkspaceSession): ConnectedWaba {
  const bm =
    s.businessManagers.find((b) => b.id === s.selectedBusinessManagerId) ??
    s.businessManagers[0];
  const waba = s.wabas.find((w) => w.id === s.selectedWabaId) ?? s.wabas[0];
  const phone =
    waba.phones.find((p) => p.id === s.selectedPhoneNumberId) ?? waba.phones[0];
  return {
    businessPortfolio: { name: bm.name, id: bm.id },
    waba: { name: waba.name, id: waba.id, displayName: waba.displayName, category: waba.category },
    phone: { display: phone.display, id: phone.id, verified: phone.verified },
    connection: { ...s.connection },
    sender: {
      qualityRating: QUALITY_LABEL[phone.qualityRating],
      messagingLimitTier: LIMIT_TIER_LABEL[phone.limitTier],
      businessVerification: bm.verified ? "Verified" : "Not verified",
    },
  };
}

/* -------------------------------------------------------------------------- *
 *  Onboarding popup catalogs (unchanged surface)
 * -------------------------------------------------------------------------- */

export const EXISTING_PORTFOLIOS = [
  { id: "1789442100981", name: "Paytm Commerce", meta: "3 WABAs · 2 ad accounts" },
  { id: "2204118890034", name: "One97 Communications", meta: "1 WABA · verified" },
] as const;

export const EXISTING_WABAS = [
  { id: "104882190034771", name: "ACME Retail", meta: "2 numbers · 8 templates" },
  { id: "210094477120983", name: "ACME Fintech", meta: "2 numbers · 6 templates" },
  { id: "315221009887744", name: "ACME Labs", meta: "2 numbers · 3 templates" },
] as const;

export const EXISTING_PHONES = [
  { id: "10918822450091", display: "+91 90045 88210", meta: "Eligible · not linked" },
] as const;

export const WABA_CATEGORIES = [
  "Finance and Banking",
  "Shopping and Retail",
  "Professional Services",
  "Education",
  "Food and Grocery",
  "Travel and Transportation",
  "Medical and Health",
  "Other",
] as const;

export const COUNTRIES = [
  "India",
  "United States",
  "United Kingdom",
  "United Arab Emirates",
  "Singapore",
  "Australia",
] as const;

export const ESIGNUP_PERMISSIONS = [
  {
    scope: "whatsapp_business_messaging",
    title: "Send and receive WhatsApp messages",
    detail: "Deliver template and session messages on your behalf.",
  },
  {
    scope: "whatsapp_business_management",
    title: "Manage your WhatsApp Business Account",
    detail: "Phone numbers, message templates and quality status.",
  },
  {
    scope: "business_management",
    title: "Manage business assets",
    detail: "Read your business portfolio and connected assets.",
  },
  {
    scope: "webhooks",
    title: "Receive webhook events",
    detail: "Message status, template status, quality and limit updates.",
  },
] as const;

export const PROVISIONING_STEPS = [
  { key: "token", label: "Token exchange", detail: "Exchanging Meta token code for a long-lived token" },
  { key: "phone", label: "Phone number registration", detail: "Registering the number on the WhatsApp Business Platform" },
  { key: "webhook", label: "Webhook subscription", detail: "Subscribing to message, template & quality events" },
  { key: "credit", label: "Credit line sharing", detail: "Linking Pi Commerce billing to your WABA" },
] as const;

/* -------------------------------------------------------------------------- *
 *  Canonical multi-WABA demo seed
 * -------------------------------------------------------------------------- */

/**
 * The demo topology sales tells the story against:
 *
 *   Paytm Commerce (BM, verified)
 *     ├─ ACME Retail   (green tick,  active)
 *     │    ├─ Marketing sender      Green   100K
 *     │    └─ Support sender        Yellow   10K
 *     └─ ACME Fintech  (verified, active)
 *          ├─ Payments sender       Green    10K
 *          └─ OTP sender            Green     1K
 *
 *   One97 Communications (BM, verified)
 *     └─ ACME Labs     (unverified, in review)
 *          ├─ Labs Test              Red      1K
 *          └─ Labs Dev               Yellow  250
 *
 * Mixed quality within a WABA (Retail: Green + Yellow) is intentional so the
 * "one number drops, siblings keep sending" story is legible in the demo.
 * ACME Labs is in a WABA-level in_review state so the WABA isolation story is
 * legible too. Splitting WABAs across two BMs makes the "one BM per workflow"
 * rule visible.
 */
const BM_PAYTM_ID = "1789442100981";
const BM_ONE97_ID = "2204118890034";

export const DEMO_SESSION: WorkspaceSession = {
  businessManagers: [
    {
      id: BM_PAYTM_ID,
      name: "Paytm Commerce",
      verified: true,
      creditLine: "Shared",
      dataRegion: "Asia (Mumbai)",
    },
    {
      id: BM_ONE97_ID,
      name: "One97 Communications",
      verified: true,
      creditLine: "Shared",
      dataRegion: "Asia (Mumbai)",
    },
  ],
  wabas: [
    {
      id: "104882190034771",
      name: "ACME Retail",
      displayName: "ACME Retail",
      category: "Shopping and Retail",
      bmId: BM_PAYTM_ID,
      namespace: "acme_retail_ns_a1b2c3",
      oba: "green_tick",
      currency: "INR",
      restriction: "active",
      phones: [
        {
          id: "10934471290017",
          display: "+91 98100 12345",
          displayName: "ACME Retail Marketing",
          qualityRating: "green",
          limitTier: "100K",
          throughputMps: 80,
          verified: true,
          restriction: "active",
        },
        {
          id: "10934471290018",
          display: "+91 98100 45678",
          displayName: "ACME Support",
          qualityRating: "yellow",
          limitTier: "10K",
          throughputMps: 20,
          verified: true,
          restriction: "active",
        },
      ],
    },
    {
      id: "210094477120983",
      name: "ACME Fintech",
      displayName: "ACME Fintech",
      category: "Finance and Banking",
      bmId: BM_PAYTM_ID,
      namespace: "acme_fintech_ns_c3d4e5",
      oba: "verified",
      currency: "INR",
      restriction: "active",
      phones: [
        {
          id: "10934471290019",
          display: "+91 99872 10001",
          displayName: "ACME Payments",
          qualityRating: "green",
          limitTier: "10K",
          throughputMps: 20,
          verified: true,
          restriction: "active",
        },
        {
          id: "10934471290020",
          display: "+91 99872 10002",
          displayName: "ACME OTP",
          qualityRating: "green",
          limitTier: "1K",
          throughputMps: 10,
          verified: true,
          restriction: "active",
        },
      ],
    },
    {
      id: "315221009887744",
      name: "ACME Labs",
      displayName: "ACME Labs",
      category: "Professional Services",
      bmId: BM_ONE97_ID,
      namespace: "acme_labs_ns_e5f6g7",
      oba: "unverified",
      currency: "INR",
      restriction: "in_review",
      phones: [
        {
          id: "10934471290021",
          display: "+91 90455 33001",
          displayName: "ACME Labs Test",
          qualityRating: "red",
          limitTier: "1K",
          throughputMps: 10,
          verified: true,
          restriction: "active",
        },
        {
          id: "10934471290022",
          display: "+91 90455 33002",
          displayName: "ACME Labs Dev",
          qualityRating: "yellow",
          limitTier: "250",
          throughputMps: 10,
          verified: true,
          restriction: "active",
        },
      ],
    },
  ],
  selectedBusinessManagerId: BM_PAYTM_ID,
  selectedWabaId: "104882190034771",
  selectedPhoneNumberId: "10934471290017",
  connection: {
    connectedAt: "12 Jun 2026, 04:31 IST",
    lastSync: "Just now",
    provisioningStatus: "Complete",
    status: "Connected",
  },
};

/**
 * Legacy demo shape — kept for anywhere that still imports `DEMO_RESULT`
 * (the onboarding popup builds a single-WABA result from the flow input).
 * Derived from the new multi-WABA seed.
 */
export const DEMO_RESULT: ConnectedWaba = projectSelected(DEMO_SESSION);

/**
 * Build a legacy ConnectedWaba from the onboarding popup's captured choices.
 * Kept intact — the popup narrates a single-WABA path and the merchant lands
 * back in the multi-WABA view after connect.
 */
export function buildResult(overrides: {
  portfolioName?: string;
  portfolioId?: string;
  wabaName?: string;
  wabaId?: string;
  displayName?: string;
  category?: string;
  phone?: string;
  phoneId?: string;
}): ConnectedWaba {
  const d = DEMO_RESULT;
  return {
    businessPortfolio: {
      name: overrides.portfolioName?.trim() || d.businessPortfolio.name,
      id: overrides.portfolioId || d.businessPortfolio.id,
    },
    waba: {
      name: overrides.wabaName?.trim() || d.waba.name,
      id: overrides.wabaId || d.waba.id,
      displayName: overrides.displayName?.trim() || d.waba.displayName,
      category: overrides.category || d.waba.category,
    },
    phone: {
      display: overrides.phone?.trim() || d.phone.display,
      id: overrides.phoneId || d.phone.id,
      verified: true,
    },
    connection: { ...d.connection },
    sender: { ...d.sender },
  };
}
