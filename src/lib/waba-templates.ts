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

export type TemplateButton = { type: TemplateButtonType; text: string };

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

export const TEMPLATE_BUTTON_TYPES: TemplateButtonType[] = ["URL", "Phone Number", "Quick Reply", "Link Flow"];

/** Languages offered in the create form (label shown, code stored). */
export const TEMPLATE_LANGUAGES: { code: string; label: string }[] = [
  { code: "en_US", label: "English (US)" },
  { code: "en", label: "English" },
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
    header: "Order confirmed",
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
      { type: "URL", text: "Pay now" },
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
      { type: "URL", text: "Complete purchase" },
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
