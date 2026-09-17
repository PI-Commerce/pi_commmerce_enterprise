/**
 * WhatsApp message templates — demo data + types for the Template Manager
 * (Integrations → WhatsApp → Templates tab).
 *
 * Modeled on Meta's WhatsApp Cloud API template schema and the Paytm ConnectPlus
 * "Template Management" screens: a template has a category, language, a message
 * format (text / media header), header + body + footer text, optional buttons,
 * and an approval status. Mock only — nothing is submitted to Meta.
 */

export type TemplateStatus = "Approved" | "Pending" | "Rejected" | "Draft";
export type TemplateCategory = "Marketing" | "Utility" | "Authentication";
export type TemplateFormat = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
export type TemplateButtonType = "URL" | "Phone Number" | "Quick Reply" | "Link Flow";

export type TemplateButton = {
  type: TemplateButtonType;
  text: string;
  /** URL buttons: destination + URL type + optional dynamic suffix + click tracking. */
  url?: string;
  urlType?: "Static" | "Dynamic";
  urlSuffix?: string;
  clickTracking?: boolean;
  /** Phone Number buttons: national number + selected country dial code. */
  phone?: string;
  dialCode?: string;
};

export type WaTemplate = {
  id: string;
  name: string; // lowercase_with_underscores
  category: TemplateCategory;
  language: string; // BCP-47-ish code, e.g. "en_US"
  format: TemplateFormat;
  status: TemplateStatus;
  createdAt: string; // e.g. "10 Jun 2026"
  header?: string;
  body: string;
  footer?: string;
  buttons?: TemplateButton[];
};

export const TEMPLATE_CATEGORIES: TemplateCategory[] = ["Marketing", "Utility", "Authentication"];

/**
 * Button types offered in the create form. We expose the three Meta calls a
 * Marketing template needs — Custom (quick reply), Visit website (URL) and Call
 * phone number — and keep the order Meta uses in its "Add button" menu. The
 * "Link Flow" type stays in the union for existing data/journey code, but is no
 * longer addable from the form.
 */
export const TEMPLATE_BUTTON_TYPES: TemplateButtonType[] = ["Quick Reply", "URL", "Phone Number"];

/** Friendly labels (the WhatsApp button names Meta shows) for each type. */
export const BUTTON_TYPE_LABELS: Record<TemplateButtonType, string> = {
  "Quick Reply": "Custom",
  "URL": "Visit website",
  "Phone Number": "Call phone number",
  "Link Flow": "Flow",
};

/**
 * Meta's button rules for message templates (the ones we enforce):
 *  - up to 10 buttons total
 *  - at most 1 Phone Number button
 *  - at most 2 URL buttons
 *  - at most 1 Flow button
 *  - Quick Reply buttons fill the remaining slots (up to the total)
 */
export const MAX_TEMPLATE_BUTTONS = 10;
export const BUTTON_TYPE_LIMITS: Record<TemplateButtonType, number> = {
  "URL": 2,
  "Phone Number": 1,
  "Quick Reply": 10,
  "Link Flow": 1,
};

const countType = (buttons: TemplateButton[], type: TemplateButtonType) =>
  buttons.filter((b) => b.type === type).length;

/** Button types that are at their Meta cap given the current buttons (so the
 *  type picker can disable them). `exclude` skips the row being edited. */
export function cappedButtonTypes(
  buttons: TemplateButton[],
  excludeIndex?: number,
): Set<TemplateButtonType> {
  const others = excludeIndex == null ? buttons : buttons.filter((_, i) => i !== excludeIndex);
  const capped = new Set<TemplateButtonType>();
  for (const t of TEMPLATE_BUTTON_TYPES) {
    if (countType(others, t) >= BUTTON_TYPE_LIMITS[t]) capped.add(t);
  }
  return capped;
}

/** Human-readable rule violations for the current button set (empty = valid). */
export function buttonRuleErrors(buttons: TemplateButton[]): string[] {
  const errors: string[] = [];
  if (buttons.length > MAX_TEMPLATE_BUTTONS) errors.push(`Templates allow at most ${MAX_TEMPLATE_BUTTONS} buttons.`);
  if (countType(buttons, "Phone Number") > 1) errors.push("Only one Phone Number button is allowed.");
  if (countType(buttons, "URL") > 2) errors.push("At most two URL buttons are allowed.");
  if (countType(buttons, "Link Flow") > 1) errors.push("Only one Flow button is allowed.");
  return errors;
}

/** Languages offered in the create form (label shown, code stored). */
// Master label lookup across all supported markets. The actual options shown in
// the Create Template form are filtered per active country (see useRegion().
// templateLanguages); this list only needs to resolve every code to a label.
export const TEMPLATE_LANGUAGES: { code: string; label: string }[] = [
  { code: "en_US", label: "English (US)" },
  { code: "en", label: "English" },
  { code: "ar", label: "Arabic" },
  { code: "ur", label: "Urdu" },
  { code: "hi", label: "Hindi" },
  { code: "mr", label: "Marathi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "bn", label: "Bengali" },
  { code: "gu", label: "Gujarati" },
];

export function languageLabel(code: string): string {
  return TEMPLATE_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** Per-format header upload hint shown in the Content section. */
export const MEDIA_HINTS: Record<Exclude<TemplateFormat, "TEXT">, { verb: string; accept: string }> = {
  IMAGE: { verb: "image", accept: "JPG, JPEG, PNG. Max 5MB" },
  VIDEO: { verb: "video", accept: "MP4. Max 16MB" },
  DOCUMENT: { verb: "document", accept: "PDF. Max 100MB" },
};

/**
 * Meta's per-format extension allow-list for template header media supplied via a
 * public URL. Mirrors https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media —
 * we support the URL path for now (upload-then-media-ID isn't wired). The runtime
 * validates the file itself; we only shape-check the URL string at design time.
 */
export const MEDIA_URL_EXTENSIONS: Record<Exclude<TemplateFormat, "TEXT">, string[]> = {
  IMAGE: ["jpg", "jpeg", "png"],
  VIDEO: ["mp4"],
  DOCUMENT: ["pdf"],
};

/**
 * Shape-check a media URL that's been mapped to a constant (a literal, not a
 * runtime variable). Returns an error message or `null` if the URL looks well
 * formed for the template's header format. Runtime still asks Meta — this catches
 * obvious typos in the config panel before the campaign ever runs.
 */
export function validateMediaUrl(
  url: string,
  format: Exclude<TemplateFormat, "TEXT">,
): string | null {
  const trimmed = url.trim();
  if (!trimmed) return "Add a media URL.";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "Enter a valid URL (must start with https://).";
  }
  if (parsed.protocol !== "https:") return "Meta requires an HTTPS URL.";
  const allowed = MEDIA_URL_EXTENSIONS[format];
  const path = parsed.pathname.toLowerCase();
  const ext = path.includes(".") ? path.split(".").pop() ?? "" : "";
  if (!allowed.includes(ext)) {
    return `URL must end in ${allowed.map((e) => "." + e).join(" / ")} for ${format.toLowerCase()} headers.`;
  }
  return null;
}

/** Seed templates for the connected Paytm Commerce WABA. */
export const SEED_TEMPLATES: WaTemplate[] = [
  // ---- Orphan utility / authentication templates (kept for a lived-in registry
  //      and to back existing broadcast records). Not referenced by the current
  //      hero campaign library. ----
  {
    id: "10248301552093",
    name: "order_confirmation",
    category: "Utility",
    language: "en_US",
    format: "TEXT",
    status: "Approved",
    createdAt: "11 Jun 2026",
    header: "Order {{1}} confirmed",
    body: "Hi {{1}}, your order {{2}} is confirmed and will be delivered by {{3}}. Track it anytime in the Paytm app.",
    footer: "Paytm Commerce",
    buttons: [{ type: "URL", text: "Track order" }],
  },
  {
    id: "10248301338871",
    name: "payment_reminder",
    category: "Utility",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "10 Jun 2026",
    body: "Hi {{1}}, a payment of ₹{{2}} for {{3}} is due on {{4}}. Pay now to avoid late fees.",
    footer: "Paytm",
    buttons: [
      { type: "URL", text: "Pay now", clickTracking: true },
      { type: "Quick Reply", text: "Remind me later" },
    ],
  },
  {
    id: "10248300981244",
    name: "abandoned_cart_offer",
    category: "Marketing",
    language: "en_US",
    format: "IMAGE",
    status: "Approved",
    createdAt: "09 Jun 2026",
    header: "",
    body: "Still thinking it over, {{1}}? Your cart is waiting. Use code {{2}} for ₹{{3}} off — today only.",
    footer: "Reply STOP to opt out",
    buttons: [
      { type: "URL", text: "Complete purchase", clickTracking: true },
      { type: "Quick Reply", text: "Not interested" },
    ],
  },
  {
    id: "10248300774501",
    name: "login_otp",
    category: "Authentication",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "08 Jun 2026",
    body: "{{1}} is your Paytm verification code. For your security, do not share this code with anyone.",
    buttons: [{ type: "Quick Reply", text: "Copy code" }],
  },

  /* ---- Journey templates: referenced by the example campaign library
   *      (campaign-examples.ts). ---- */

  // BFSI · Insurance Renewal (c_ex4)
  {
    id: "10248298000201",
    name: "renewal_link_v1",
    category: "Utility",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "13 Jun 2026",
    body: "Hi {{1}}, your {{2}} policy renews on {{3}}. Renew now to keep your cover active without a break.",
    footer: "Paytm Insurance",
    buttons: [{ type: "URL", text: "Renew now" }],
  },
  {
    id: "10248298000202",
    name: "renewal_benefits_v1",
    category: "Marketing",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "13 Jun 2026",
    body: "{{1}}, renewing your {{2}} keeps your no-claim bonus and adds {{3}} new benefits this year.",
    footer: "Paytm Insurance",
    buttons: [{ type: "Quick Reply", text: "See benefits" }],
  },
  {
    id: "10248298000203",
    name: "renewal_savings_v1",
    category: "Marketing",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "13 Jun 2026",
    body: "{{1}}, renew your {{2}} early and save ₹{{3}} this year. Lock in the lower premium now.",
    footer: "Paytm Insurance",
    buttons: [{ type: "URL", text: "Renew & save" }, { type: "Quick Reply", text: "Remind me later" }],
  },
  {
    id: "10248298000204",
    name: "renewal_followup_v1",
    category: "Utility",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "13 Jun 2026",
    body: "Hi {{1}}, a quick reminder that your {{2}} policy is still pending renewal. Let us know if you'd like help.",
    footer: "Paytm Insurance",
  },

  // BFSI · PL DPD Collections (c_ex6)
  {
    id: "10248298000401",
    name: "collections_reminder_v1",
    category: "Utility",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "11 Jun 2026",
    body: "Hi {{1}}, a gentle reminder that ₹{{2}} for {{3}} is now due. Clearing it today helps you avoid late charges.",
    footer: "Paytm",
  },
  {
    id: "10248298000402",
    name: "payment_link_v1",
    category: "Utility",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "11 Jun 2026",
    body: "Hi {{1}}, your payment of ₹{{2}} for {{3}} is pending. Pay securely via the link below.",
    footer: "Paytm",
    buttons: [{ type: "URL", text: "Pay now" }],
  },

  // D2C · Cart Abandonment (c_ex14)
  {
    id: "10248298000501",
    name: "cart_link_v1",
    category: "Marketing",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "10 Jun 2026",
    body: "Hi {{1}}, your cart is ready. Complete your order in a tap and we'll get it on its way.",
    footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Complete order" }],
  },
  {
    id: "10248298001201",
    name: "cart_discount_v1",
    category: "Marketing",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "03 Jun 2026",
    body: "Still thinking it over {{1}}? Here's {{2}}% off to complete your order. Offer ends {{3}}.",
    footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Claim offer" }, { type: "Quick Reply", text: "Not now" }],
  },
  {
    id: "10248298001202",
    name: "cart_free_shipping_v1",
    category: "Marketing",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "03 Jun 2026",
    body: "{{1}}, your cart qualifies for free shipping today. Complete your order before the offer expires.",
    footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Complete order" }],
  },

  // Retail · Loyalty Card Upsell (c_ex17) — Loyalty Card invites + welcomes
  {
    id: "10248298001501",
    name: "fcc_silver_perks",
    category: "Marketing",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "15 Jul 2026",
    body: "Hi {{1}}, you shop with us often — join our Loyalty Card Silver tier and unlock member perks like {{2}}. Silver is free to join.",
    footer: "Loyalty Card",
    buttons: [{ type: "URL", text: "Join Silver" }, { type: "Quick Reply", text: "Tell me more" }],
  },
  {
    id: "10248298001502",
    name: "fcc_silver_savings",
    category: "Marketing",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "15 Jul 2026",
    body: "{{1}}, Loyalty Card Silver members saved ₹{{2}} on average last year. Join today — it takes 30 seconds.",
    footer: "Loyalty Card",
    buttons: [{ type: "URL", text: "Join Silver" }, { type: "Quick Reply", text: "Not now" }],
  },
  {
    id: "10248298001503",
    name: "fcc_gold_invite",
    category: "Marketing",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "15 Jul 2026",
    body: "{{1}}, your spend qualifies you for the Loyalty Card Gold tier. Unlock free tailoring, {{2}}% off, and priority checkout.",
    footer: "Loyalty Card",
    buttons: [{ type: "URL", text: "Upgrade to Gold" }, { type: "Quick Reply", text: "Maybe later" }],
  },
  {
    id: "10248298001506",
    name: "fcc_welcome_silver",
    category: "Utility",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "15 Jul 2026",
    body: "Welcome to Loyalty Card Silver, {{1}}! Your member ID is {{2}}. Show it at checkout to start earning points.",
    footer: "Loyalty Card",
    buttons: [{ type: "URL", text: "See member benefits" }],
  },
  {
    id: "10248298001507",
    name: "fcc_welcome_gold",
    category: "Utility",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "15 Jul 2026",
    body: "Welcome to Loyalty Card Gold, {{1}}! Your member ID is {{2}}. Free tailoring and priority checkout are now yours.",
    footer: "Loyalty Card",
    buttons: [{ type: "URL", text: "See member benefits" }],
  },

  // B2B · Reactivate Paytm Soundbox Merchants (c_ex_soundbox) — NEW
  {
    id: "10248298001601",
    name: "soundbox_reactivate_gentle_v1",
    category: "Utility",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "20 Aug 2026",
    body: "Namaste {{1}}, we noticed your Paytm Soundbox {{2}}. Is everything okay? Reply here and our team will help you get it running again.",
    footer: "Paytm for Business",
    buttons: [{ type: "Quick Reply", text: "Chat with support" }, { type: "Quick Reply", text: "All good" }],
  },
  {
    id: "10248298001602",
    name: "soundbox_comeback_offer_v1",
    category: "Marketing",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "20 Aug 2026",
    body: "Hi {{1}}, your Soundbox {{2}}. Start accepting payments again and get {{3}} — no rental for the next 2 months. Offer ends soon.",
    footer: "Paytm for Business",
    buttons: [{ type: "URL", text: "See offer" }, { type: "Quick Reply", text: "Not interested" }],
  },
  {
    id: "10248298001603",
    name: "soundbox_device_replacement_v1",
    category: "Marketing",
    language: "en",
    format: "TEXT",
    status: "Approved",
    createdAt: "20 Aug 2026",
    body: "{{1}}, if your old Soundbox {{2}} isn't working, we'll swap it for a brand-new one free of cost — {{3}}. Tap below and our field agent will visit.",
    footer: "Paytm for Business",
    buttons: [{ type: "URL", text: "Request replacement" }, { type: "Quick Reply", text: "Talk to support" }],
  },
];

/** Replace {{1}}, {{2}}… with sample params (for the live preview). */
export function fillVariables(text: string, params: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_m, n) => {
    const v = params[Number(n) - 1];
    return v && v.trim() ? v : `{{${n}}}`;
  });
}

/** How many distinct {{n}} variables a string references. */
export function variableCount(text: string): number {
  const set = new Set<string>();
  for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) set.add(m[1]);
  return set.size;
}

/**
 * Meta's character + variable limits for message templates (the ones we enforce
 * and surface in the create form).
 */
export const TEMPLATE_LIMITS = {
  nameMax: 512,
  headerMax: 60,
  bodyMax: 1024,
  footerMax: 60,
  buttonTextMax: 40,
  /** Website (URL) button destination length. */
  buttonUrlMax: 2000,
  /** Phone Number button national-number length. */
  buttonPhoneMax: 20,
  /** Header text supports at most one variable. */
  headerVarsMax: 1,
  /** Footer text supports no variables. */
  footerVarsMax: 0,
  /** Practical cap on body variables. */
  bodyVarsMax: 10,
} as const;

/** Meta rejects templates whose body starts or ends with a variable. */
export function bodyEdgeVariable(text: string): boolean {
  return /^\s*\{\{\s*\d+\s*\}\}/.test(text) || /\{\{\s*\d+\s*\}\}\s*$/.test(text);
}

/**
 * Meta rejects a body that has "too many variables for its length" — there must
 * be enough surrounding copy. We approximate it: the count of non-variable words
 * must be at least the number of distinct variables.
 */
export function bodyTooManyVariables(text: string): boolean {
  const vars = variableCount(text);
  if (vars === 0) return false;
  const fixedWords = text.replace(/\{\{\s*\d+\s*\}\}/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return vars > fixedWords;
}

/** Required-field errors for the current buttons (missing text / URL / phone,
 *  plus Meta's "no two buttons may share the same text" rule). */
export function buttonFieldErrors(buttons: TemplateButton[]): string[] {
  const errors: string[] = [];
  buttons.forEach((b, i) => {
    const n = i + 1;
    if (!b.text.trim()) errors.push(`Button ${n}: add button text.`);
    if (b.type === "URL" && !b.url?.trim()) errors.push(`Button ${n}: add a website URL.`);
    if (b.type === "Phone Number" && !b.phone?.trim()) errors.push(`Button ${n}: add a phone number.`);
  });
  // Duplicate button text (case-insensitive) — Meta blocks identical labels.
  const counts = new Map<string, number>();
  buttons.forEach((b) => {
    const t = b.text.trim().toLowerCase();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  });
  if ([...counts.values()].some((c) => c > 1)) {
    errors.push("Each button needs unique text — two buttons share the same label.");
  }
  return errors;
}

/** Per-button text indexes that duplicate another button's label (for inline flags). */
export function duplicateButtonIndexes(buttons: TemplateButton[]): Set<number> {
  const byText = new Map<string, number[]>();
  buttons.forEach((b, i) => {
    const t = b.text.trim().toLowerCase();
    if (!t) return;
    const arr = byText.get(t) ?? [];
    arr.push(i);
    byText.set(t, arr);
  });
  const dup = new Set<number>();
  for (const arr of byText.values()) if (arr.length > 1) arr.forEach((i) => dup.add(i));
  return dup;
}
