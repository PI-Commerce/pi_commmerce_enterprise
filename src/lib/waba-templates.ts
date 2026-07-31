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
  {
    id: "10248300552310",
    name: "delivery_update_hi",
    category: "Utility",
    language: "hi",
    format: "TEXT",
    status: "Pending",
    createdAt: "12 Jun 2026",
    body: "नमस्ते {{1}}, आपका ऑर्डर {{2}} बाहर डिलीवरी के लिए निकल चुका है और आज {{3}} तक पहुँच जाएगा।",
    footer: "Paytm Commerce",
  },
  {
    id: "10248300118876",
    name: "festive_cashback_diwali",
    category: "Marketing",
    language: "en_US",
    format: "IMAGE",
    status: "Approved",
    createdAt: "06 Jun 2026",
    body: "Happy Diwali, {{1}}! Get flat {{2}}% cashback on your next order above ₹{{3}}. Offer ends {{4}}.",
    footer: "T&C apply",
    buttons: [{ type: "URL", text: "Shop the sale" }],
  },
  {
    id: "10248299884412",
    name: "monthly_statement",
    category: "Utility",
    language: "en",
    format: "DOCUMENT",
    status: "Approved",
    createdAt: "03 Jun 2026",
    body: "Hi {{1}}, your account statement for {{2}} is ready. The PDF is attached for your records.",
    footer: "Paytm",
    buttons: [{ type: "URL", text: "View in app" }],
  },
  {
    id: "10248299772238",
    name: "product_launch_video",
    category: "Marketing",
    language: "en_US",
    format: "VIDEO",
    status: "Approved",
    createdAt: "05 Jun 2026",
    body: "Hi {{1}}, take 30 seconds to see what's new — introducing {{2}}, now live on Paytm.",
    footer: "Reply STOP to opt out",
    buttons: [
      { type: "URL", text: "Explore now", clickTracking: true },
      { type: "Quick Reply", text: "Remind me later" },
    ],
  },
  {
    id: "10248299551098",
    name: "winback_we_miss_you",
    category: "Marketing",
    language: "en_US",
    format: "TEXT",
    status: "Rejected",
    createdAt: "01 Jun 2026",
    body: "We miss you, {{1}}! Come back and claim {{2}} reward points — guaranteed best prices, only on Paytm.",
    footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Claim now" }],
  },
  {
    id: "10248299220674",
    name: "welcome_series_1",
    category: "Marketing",
    language: "en_US",
    format: "TEXT",
    status: "Draft",
    createdAt: "12 Jun 2026",
    body: "Welcome to Paytm Commerce, {{1}}! Here's {{2}} off your first order. Tap below to start shopping.",
    footer: "Paytm Commerce",
    buttons: [{ type: "URL", text: "Start shopping" }],
  },

  /* ---- Journey templates: referenced by the example campaign library
   *      (campaign-examples.ts). A deliberate mix — text-only (no flow branch),
   *      single tracked button (URL / Quick Reply), and two-button templates
   *      that produce the full 4-way outcome split. Resolved by `name`. ---- */

  // BFSI · Lead Qualification
  { id: "10248298000101", name: "application_link_v1", category: "Utility", language: "en", format: "TEXT", status: "Approved", createdAt: "14 Jun 2026",
    body: "Hi {{1}}, your {{2}} application is ready to submit. Tap below to complete it in under 2 minutes.", footer: "Paytm Money",
    buttons: [{ type: "URL", text: "Apply now" }] },
  { id: "10248298000102", name: "lead_urgency_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "14 Jun 2026",
    body: "{{1}}, your eligibility for {{2}} expires soon. Speak to an advisor before the window closes.", footer: "Paytm Money",
    buttons: [{ type: "URL", text: "Talk to an advisor" }] },
  { id: "10248298000103", name: "lead_offer_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "14 Jun 2026",
    body: "Good news {{1}} — you're pre-approved for {{2}}. View your personalised offer below.", footer: "Paytm Money",
    buttons: [{ type: "URL", text: "View offer" }, { type: "Quick Reply", text: "Not now" }] },
  { id: "10248298000104", name: "lead_followup_v1", category: "Utility", language: "en", format: "TEXT", status: "Approved", createdAt: "14 Jun 2026",
    body: "Hi {{1}}, just following up on your {{2}} application. Reply here if you have any questions — we're happy to help.", footer: "Paytm Money" },
  { id: "10248298000105", name: "awareness_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "14 Jun 2026",
    body: "Hi {{1}}, did you know Paytm Money offers commission-free investing? Here's a quick guide to get you started.", footer: "Paytm Money" },

  // BFSI · Insurance Renewal
  { id: "10248298000201", name: "renewal_link_v1", category: "Utility", language: "en", format: "TEXT", status: "Approved", createdAt: "13 Jun 2026",
    body: "Hi {{1}}, your {{2}} policy renews on {{3}}. Renew now to keep your cover active without a break.", footer: "Paytm Insurance",
    buttons: [{ type: "URL", text: "Renew now" }] },
  { id: "10248298000202", name: "renewal_benefits_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "13 Jun 2026",
    body: "{{1}}, renewing your {{2}} keeps your no-claim bonus and adds {{3}} new benefits this year.", footer: "Paytm Insurance",
    buttons: [{ type: "Quick Reply", text: "See benefits" }] },
  { id: "10248298000203", name: "renewal_savings_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "13 Jun 2026",
    body: "{{1}}, renew your {{2}} early and save ₹{{3}} this year. Lock in the lower premium now.", footer: "Paytm Insurance",
    buttons: [{ type: "URL", text: "Renew & save" }, { type: "Quick Reply", text: "Remind me later" }] },
  { id: "10248298000204", name: "renewal_followup_v1", category: "Utility", language: "en", format: "TEXT", status: "Approved", createdAt: "13 Jun 2026",
    body: "Hi {{1}}, a quick reminder that your {{2}} policy is still pending renewal. Let us know if you'd like help.", footer: "Paytm Insurance" },

  // BFSI · Upsell / Cross-Sell
  { id: "10248298000301", name: "offer_apply_v1", category: "Utility", language: "en", format: "TEXT", status: "Approved", createdAt: "12 Jun 2026",
    body: "Hi {{1}}, your pre-approved {{2}} offer is ready. Complete your application below to activate it.", footer: "Paytm Money",
    buttons: [{ type: "URL", text: "Apply now" }] },
  { id: "10248298000302", name: "upsell_offer_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "12 Jun 2026",
    body: "{{1}}, unlock {{2}} with an upgrade tailored to your usage. See what's included below.", footer: "Paytm Money",
    buttons: [{ type: "URL", text: "Upgrade now" }, { type: "Quick Reply", text: "Maybe later" }] },
  { id: "10248298000303", name: "upsell_urgency_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "12 Jun 2026",
    body: "{{1}}, your upgrade offer for {{2}} ends {{3}}. Upgrade now before it's gone.", footer: "Paytm Money",
    buttons: [{ type: "URL", text: "Upgrade now" }] },

  // BFSI · Collections
  { id: "10248298000401", name: "collections_reminder_v1", category: "Utility", language: "en", format: "TEXT", status: "Approved", createdAt: "11 Jun 2026",
    body: "Hi {{1}}, a gentle reminder that ₹{{2}} for {{3}} is now due. Clearing it today helps you avoid late charges.", footer: "Paytm" },
  { id: "10248298000402", name: "payment_link_v1", category: "Utility", language: "en", format: "TEXT", status: "Approved", createdAt: "11 Jun 2026",
    body: "Hi {{1}}, your payment of ₹{{2}} for {{3}} is pending. Pay securely via the link below.", footer: "Paytm",
    buttons: [{ type: "URL", text: "Pay now" }] },

  // Retail · Activation
  { id: "10248298000501", name: "cart_link_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "10 Jun 2026",
    body: "Hi {{1}}, your cart is ready. Complete your order in a tap and we'll get it on its way.", footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Complete order" }] },
  { id: "10248298000502", name: "activation_discount_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "10 Jun 2026",
    body: "Welcome {{1}}! Here's {{2}}% off your first order. Shop now before it expires on {{3}}.", footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Shop now" }, { type: "Quick Reply", text: "Not now" }] },
  { id: "10248298000503", name: "activation_free_delivery_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "10 Jun 2026",
    body: "{{1}}, enjoy free delivery on your first order this week. Tap to start shopping.", footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Order now" }] },

  // Retail · Reward Expiry
  { id: "10248298000601", name: "redemption_link_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "09 Jun 2026",
    body: "Hi {{1}}, you have {{2}} reward points expiring on {{3}}. Redeem them before they're gone.", footer: "Paytm",
    buttons: [{ type: "URL", text: "Redeem now" }] },
  { id: "10248298000602", name: "reward_final_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "09 Jun 2026",
    body: "Last chance {{1}} — your {{2}} reward points expire tonight. Don't let them go to waste.", footer: "Paytm" },
  { id: "10248298000603", name: "reward_urgency_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "09 Jun 2026",
    body: "{{1}}, your {{2}} points expire in {{3}} days. Redeem now for instant savings.", footer: "Paytm",
    buttons: [{ type: "URL", text: "Redeem now" }] },
  { id: "10248298000604", name: "reward_offer_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "09 Jun 2026",
    body: "{{1}}, turn your {{2}} points into ₹{{3}} off your next order. Redeem below.", footer: "Paytm",
    buttons: [{ type: "URL", text: "Redeem now" }, { type: "Quick Reply", text: "Not interested" }] },

  // Retail · Winback
  { id: "10248298000701", name: "purchase_link_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "08 Jun 2026",
    body: "Hi {{1}}, the {{2}} you liked is back in your reach. Buy now and we'll ship it today.", footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Buy now" }] },
  { id: "10248298000702", name: "winback_cashback_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "08 Jun 2026",
    body: "We miss you {{1}}! Come back for ₹{{2}} cashback on your next order. Claim it below.", footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Claim cashback" }, { type: "Quick Reply", text: "No thanks" }] },
  { id: "10248298000703", name: "winback_discount_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "08 Jun 2026",
    body: "{{1}}, here's {{2}}% off to welcome you back. Shop your favourites before {{3}}.", footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Shop now" }] },

  // Retail · Subscription Conversion
  { id: "10248298000801", name: "subscription_link_v1", category: "Utility", language: "en", format: "TEXT", status: "Approved", createdAt: "07 Jun 2026",
    body: "Hi {{1}}, subscribe to {{2}} and never run out. Set it up in a tap below.", footer: "Paytm Commerce",
    buttons: [{ type: "URL", text: "Subscribe now" }] },
  { id: "10248298000802", name: "subscription_extra_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "07 Jun 2026",
    body: "{{1}}, subscribe to {{2}} and get an extra {{3}}% off every delivery. Here's how it works.", footer: "Paytm Commerce",
    buttons: [{ type: "URL", text: "Subscribe" }, { type: "Quick Reply", text: "Tell me more" }] },
  { id: "10248298000803", name: "subscription_urgency_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "07 Jun 2026",
    body: "{{1}}, your intro price for {{2}} ends {{3}}. Lock in the lower rate by subscribing today.", footer: "Paytm Commerce",
    buttons: [{ type: "URL", text: "Subscribe now" }] },

  // Retail · Seasonal Sale
  { id: "10248298000901", name: "sale_link_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "06 Jun 2026",
    body: "Hi {{1}}, our {{2}} sale is live with up to {{3}}% off. Shop the best deals now.", footer: "T&C apply",
    buttons: [{ type: "URL", text: "Shop the sale" }] },
  { id: "10248298000902", name: "seasonal_trends_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "06 Jun 2026",
    body: "{{1}}, this season's top picks are here. Explore the trends everyone's shopping.", footer: "T&C apply",
    buttons: [{ type: "URL", text: "Shop now" }, { type: "Quick Reply", text: "Just browsing" }] },
  { id: "10248298000903", name: "seasonal_limited_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "06 Jun 2026",
    body: "{{1}}, our {{2}} edit is limited and selling fast. Grab yours before it's gone on {{3}}.", footer: "T&C apply",
    buttons: [{ type: "URL", text: "Shop now" }] },
  { id: "10248298000904", name: "sale_reminder_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "06 Jun 2026",
    body: "Hi {{1}}, our {{2}} sale ends tonight. Don't miss your chance to save on the items you've been eyeing." },

  // D2C · Order Confirmation
  { id: "10248298001001", name: "availability_link_v1", category: "Utility", language: "en", format: "TEXT", status: "Approved", createdAt: "05 Jun 2026",
    body: "Hi {{1}}, before we ship — please confirm {{2}} is available at your address using the link below.", footer: "Paytm Commerce",
    buttons: [{ type: "URL", text: "Check availability" }] },
  { id: "10248298001002", name: "order_confirm_v1", category: "Utility", language: "en", format: "TEXT", status: "Approved", createdAt: "05 Jun 2026",
    body: "Hi {{1}}, your order {{2}} is confirmed. We'll notify you as soon as it ships. Thank you for shopping with us.", footer: "Paytm Commerce" },

  // D2C · Outbound Sales
  { id: "10248298001101", name: "outbound_variety_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "04 Jun 2026",
    body: "Hi {{1}}, discover our full range of {{2}} — something for every need. Explore the collection below.", footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Explore range" }, { type: "Quick Reply", text: "Not now" }] },
  { id: "10248298001102", name: "outbound_offers_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "04 Jun 2026",
    body: "{{1}}, this week's offers on {{2}} are live. See what's on sale before it ends.", footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "View offers" }] },

  // D2C · Cart Abandonment
  { id: "10248298001201", name: "cart_discount_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "03 Jun 2026",
    body: "Still thinking it over {{1}}? Here's {{2}}% off to complete your order. Offer ends {{3}}.", footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Claim offer" }, { type: "Quick Reply", text: "Not now" }] },
  { id: "10248298001202", name: "cart_free_shipping_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "03 Jun 2026",
    body: "{{1}}, your cart qualifies for free shipping today. Complete your order before the offer expires.", footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Complete order" }] },

  // E-commerce · Price Drop
  { id: "10248298001301", name: "pricedrop_pct_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "02 Jun 2026",
    body: "Good news {{1}} — {{2}} just dropped {{3}}% in price. Grab it now before stock runs out.", footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Buy now" }, { type: "Quick Reply", text: "Watch item" }] },
  { id: "10248298001302", name: "pricedrop_amount_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "02 Jun 2026",
    body: "{{1}}, the {{2}} on your wishlist is now ₹{{3}} cheaper. Buy now while the price lasts.", footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Buy now" }] },

  // E-commerce · Back In Stock
  { id: "10248298001401", name: "backinstock_scarcity_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "01 Jun 2026",
    body: "{{1}}, the {{2}} you wanted is back — but only {{3}} left. Buy now before it sells out again.", footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Buy now" }, { type: "Quick Reply", text: "Remind me" }] },
  { id: "10248298001402", name: "backinstock_popularity_v1", category: "Marketing", language: "en", format: "TEXT", status: "Approved", createdAt: "01 Jun 2026",
    body: "Great news {{1}}! The popular {{2}} is back in stock. Thousands grabbed it last time — get yours now.", footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Buy now" }] },
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
