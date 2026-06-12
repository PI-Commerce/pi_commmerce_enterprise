/**
 * WhatsApp (WABA) Onboarding — demo data + types.
 *
 * Drives the Meta Embedded Signup flow replicated inside Pi Commerce
 * (Integrations → Channels → WhatsApp). Mock data only: the popup screens
 * mirror Meta's real onboarding steps so the product story can be narrated
 * end to end. See PRD "WhatsApp (WABA) Onboarding Service".
 */

/** Connected asset record stored after a successful onboarding (PRD §8 / §13). */
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

/** Existing Business Portfolios a merchant could already own (select-existing path). */
export const EXISTING_PORTFOLIOS = [
  { id: "1789442100981", name: "Paytm Commerce", meta: "3 WABAs · 2 ad accounts" },
  { id: "2204118890034", name: "One97 Communications", meta: "1 WABA · verified" },
] as const;

/** Existing WABAs under a portfolio (select-existing path). */
export const EXISTING_WABAS = [
  { id: "104882190034771", name: "Paytm Commerce WABA", meta: "2 numbers · 12 templates" },
  { id: "210094477120983", name: "PiWealth Notifications", meta: "1 number · 5 templates" },
] as const;

/** Existing eligible phone numbers not yet linked to a WABA. */
export const EXISTING_PHONES = [
  { id: "10918822450091", display: "+91 90045 88210", meta: "Eligible · not linked" },
] as const;

/** WhatsApp public-profile business categories (subset of Meta's list). */
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

/** Countries for the Business Portfolio create form. */
export const COUNTRIES = [
  "India",
  "United States",
  "United Kingdom",
  "United Arab Emirates",
  "Singapore",
  "Australia",
] as const;

/** Permissions reviewed/granted during Embedded Signup (PRD §10). */
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

/** Backend provisioning steps run after Meta returns onboarding assets (PRD §6.2.6). */
export const PROVISIONING_STEPS = [
  { key: "token", label: "Token exchange", detail: "Exchanging Meta token code for a long-lived token" },
  { key: "phone", label: "Phone number registration", detail: "Registering the number on the WhatsApp Business Platform" },
  { key: "webhook", label: "Webhook subscription", detail: "Subscribing to message, template & quality events" },
  { key: "credit", label: "Credit line sharing", detail: "Linking Pi Commerce billing to your WABA" },
] as const;

/** The canonical WABA the demo produces on a successful run. */
export const DEMO_RESULT: ConnectedWaba = {
  businessPortfolio: { name: "Paytm Commerce", id: "1789442100981" },
  waba: {
    name: "Paytm Commerce WABA",
    id: "104882190034771",
    displayName: "Paytm Commerce",
    category: "Finance and Banking",
  },
  phone: { display: "+91 98100 12345", id: "10934471290017", verified: true },
  connection: {
    connectedAt: "12 Jun 2026, 04:31 IST",
    lastSync: "Just now",
    provisioningStatus: "Complete",
    status: "Connected",
  },
  sender: {
    qualityRating: "Green · High",
    messagingLimitTier: "Tier 2 · 10K / 24h",
    businessVerification: "Verified",
  },
};

/** Builds a ConnectedWaba from the choices captured in the popup, with demo fallbacks. */
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
