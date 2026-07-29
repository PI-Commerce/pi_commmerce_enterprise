/**
 * RCS templates — demo data + types for the RCS Template Registry
 * (Channels → RCS → Templates tab).
 *
 * RCS (Rich Communication Services, Google's RBM) templates are richer than SMS:
 * a template is either a plain **Text** message or a **Rich card** (media + title
 * + description + suggestion buttons). Every template belongs to a **bot (agent)**
 * of a given **category** and, unlike the SMS registry, carries an **approval
 * status** — RCS templates are submitted to the vendor for approval (Netcore is
 * async PENDING→APPROVED/REJECTED; Jio auto-approves), so this mirrors the
 * WhatsApp registry's Meta-review model rather than SMS's pre-verified copies.
 *
 * Shapes follow the TOCOM "RCS Template Internal Design Language" (PICOM-4728 /
 * PICOM-4732): Text = body + buttons; Rich card = cardOrientation + title + body
 * + media{type,height,url} + buttons. Buttons (Google "suggestions") are REPLY
 * (a quick-reply chip — the only branchable one), URL, or DIALER.
 *
 * Body content uses named `{{var}}` placeholders. Carousel and the
 * calendar/location action buttons are out of scope for this phase.
 */

export type RcsTemplateType = "TEXT" | "RICH_CARD";

/** Bot/message category (PICOM-4728 §2 brand→bots model). */
export type RcsCategory = "Promotional" | "Utility" | "OTP";

/** Vendor approval state (Netcore async; Jio auto-approves). */
export type RcsApprovalStatus = "Approved" | "Pending" | "Rejected";

export type RcsMediaType = "IMAGE" | "VIDEO";
/** Google RBM card media heights, in density-independent pixels. */
export type RcsMediaHeight = "SHORT" | "MEDIUM" | "TALL";
export type RcsCardOrientation = "VERTICAL" | "HORIZONTAL";

/** A suggestion chip. Only REPLY is branchable (it posts a reply back to us). */
export type RcsButtonType = "REPLY" | "URL" | "DIALER";
export type RcsButton = {
  type: RcsButtonType;
  text: string;
  /** URL button: destination. */
  url?: string;
  /** Dialer button: phone number. */
  phone?: string;
  /** Postback payload echoed back on tap (all types). */
  postback?: string;
};

/** Rich-card media — a public URL or a (mock) uploaded file. */
export type RcsMedia = {
  mediaType: RcsMediaType;
  mediaHeight: RcsMediaHeight;
  /** Where the media came from — a pasted URL or an upload. */
  source: "url" | "upload";
  /** Set when source === "url". */
  url?: string;
  /** Set when source === "upload" — the file name (prototype: no real bytes). */
  fileName?: string;
};

export type RcsTemplate = {
  id: string;
  /** Pi Commerce label for the template. */
  name: string;
  /** The bot (agent) this template is registered under. */
  botId: string;
  category: RcsCategory;
  type: RcsTemplateType;
  approvalStatus: RcsApprovalStatus;
  /** Message body with named `{{var}}` placeholders. */
  body: string;
  /** Rich card only. */
  title?: string;
  orientation?: RcsCardOrientation;
  media?: RcsMedia;
  /** Suggestion chips (REPLY / URL / DIALER). */
  buttons: RcsButton[];
  createdAt: string;
};

export const RCS_TEMPLATE_TYPES: { value: RcsTemplateType; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "RICH_CARD", label: "Rich card" },
];
export const RCS_CATEGORIES: RcsCategory[] = ["Promotional", "Utility", "OTP"];
export const RCS_BUTTON_TYPES: RcsButtonType[] = ["REPLY", "URL", "DIALER"];

/** Friendly labels for the button types (Google's suggestion names). */
export const RCS_BUTTON_LABELS: Record<RcsButtonType, string> = {
  REPLY: "Quick reply",
  URL: "Open URL",
  DIALER: "Dial number",
};

/* --------------------------- Media specs --------------------------- */

/** Accepted image formats (JIO PRD / Google RBM). */
export const RCS_IMAGE_FORMATS = ["jpeg", "jpg", "gif", "png"] as const;
/** Accepted video formats. */
export const RCS_VIDEO_FORMATS = ["mp4", "mpeg", "mpeg4", "webm"] as const;

/** Card media heights with their density-independent pixel size. */
export const RCS_MEDIA_HEIGHTS: { value: RcsMediaHeight; label: string; dp: number }[] = [
  { value: "SHORT", label: "Short", dp: 112 },
  { value: "MEDIUM", label: "Medium", dp: 168 },
  { value: "TALL", label: "Tall", dp: 264 },
];

export const RCS_CARD_ORIENTATIONS: { value: RcsCardOrientation; label: string }[] = [
  { value: "VERTICAL", label: "Vertical" },
  { value: "HORIZONTAL", label: "Horizontal" },
];

/** Max rich-card payload the vendor accepts. */
export const RCS_MAX_CARD_PAYLOAD_KB = 250;

/** The `accept` attribute for the media upload input, per media type. */
export function mediaAccept(type: RcsMediaType): string {
  const exts = type === "IMAGE" ? RCS_IMAGE_FORMATS : RCS_VIDEO_FORMATS;
  return exts.map((e) => `.${e}`).join(",");
}

/** Human hint for accepted formats. */
export function mediaFormatsHint(type: RcsMediaType): string {
  const exts = type === "IMAGE" ? RCS_IMAGE_FORMATS : RCS_VIDEO_FORMATS;
  return exts.map((e) => e.toUpperCase()).join(", ");
}

/* --------------------------- Variables --------------------------- */

/** Distinct named `{{var}}` placeholders in first-appearance order. */
export function rcsPlaceholders(text?: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of (text ?? "").matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
    const name = m[1];
    if (!seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out;
}

/** All placeholders across a template's body + card title (deduped). */
export function templatePlaceholders(t: Pick<RcsTemplate, "body" | "title">): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of [...rcsPlaceholders(t.title), ...rcsPlaceholders(t.body)]) {
    if (!seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out;
}

/** Substitute values into a body for preview; unfilled vars stay literal. */
export function fillRcsVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (m, name: string) => {
    const v = values[name];
    return v && v.trim() ? v : m;
  });
}

/** REPLY buttons are the only branchable ones — each becomes a node output. */
export function replyButtons(t: Pick<RcsTemplate, "buttons">): RcsButton[] {
  return (t.buttons ?? []).filter((b) => b.type === "REPLY" && b.text.trim());
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Today as "22 Jul 2026". */
export function todayLabel(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "22 Jul 2026" → Date (local midnight), for date-range filtering. */
export function parseRcsCreated(s: string): Date {
  const [d, mon, y] = s.split(" ");
  return new Date(Number(y), Math.max(0, MONTHS.indexOf(mon)), Number(d));
}

/* --------------------------- Validation --------------------------- */

/** Validation shared by the create form (single source of truth). */
export function validateRcsTemplate(
  t: Partial<RcsTemplate>,
  existing: RcsTemplate[],
  selfId?: string,
): string[] {
  const errors: string[] = [];
  if (!t.name?.trim()) errors.push("Template Name is required.");
  if (!t.category) errors.push("Category is required.");
  if (!t.botId?.trim()) errors.push("Bot is required.");
  if (!t.type) errors.push("Template type is required.");
  if (!t.body?.trim()) errors.push("Message body is required.");

  if (t.type === "RICH_CARD") {
    if (!t.title?.trim()) errors.push("Card title is required for a rich card.");
    const m = t.media;
    if (!m) errors.push("Media is required for a rich card.");
    else if (m.source === "url" && !m.url?.trim()) errors.push("Media URL is required.");
    else if (m.source === "upload" && !m.fileName?.trim()) errors.push("Upload a media file.");
  }

  // Button rules: text required; URL/DIALER need their target.
  (t.buttons ?? []).forEach((b, i) => {
    const n = i + 1;
    if (!b.text.trim()) errors.push(`Button ${n} needs a label.`);
    if (b.type === "URL" && !b.url?.trim()) errors.push(`Button ${n} (Open URL) needs a URL.`);
    if (b.type === "DIALER" && !b.phone?.trim()) errors.push(`Button ${n} (Dial number) needs a phone number.`);
  });
  if ((t.buttons ?? []).length > MAX_BUTTONS) errors.push(`A template allows at most ${MAX_BUTTONS} buttons.`);

  if (t.id && existing.some((x) => x.id === t.id && x.id !== selfId)) {
    errors.push(`Template ID ${t.id} already exists in the registry.`);
  }
  return errors;
}

/** Google RBM allows up to 11 suggestions on a message; we cap the form lower. */
export const MAX_BUTTONS = 4;

/* --------------------------- Seed data --------------------------- */

/** Mirrored RCS templates for the demo workspace. Bot ids match rcs-config.ts. */
export const SEED_RCS_TEMPLATES: RcsTemplate[] = [
  {
    id: "rcs_tpl_order_shipped",
    name: "order_shipped_card",
    botId: "acme_utility_bot",
    category: "Utility",
    type: "RICH_CARD",
    approvalStatus: "Approved",
    orientation: "VERTICAL",
    title: "Your order is on its way 📦",
    body: "Hi {{name}}, order {{order_id}} has shipped and arrives by {{eta}}. Track it live below.",
    media: { mediaType: "IMAGE", mediaHeight: "MEDIUM", source: "url", url: "https://cdn.picomm.in/rcs/order-shipped.png" },
    buttons: [
      { type: "URL", text: "Track order", url: "https://picomm.in/track/{{order_id}}" },
      { type: "REPLY", text: "Change address", postback: "change_address" },
    ],
    createdAt: "12 Jun 2026",
  },
  {
    id: "rcs_tpl_welcome_offer",
    name: "welcome_offer_card",
    botId: "acme_promo_bot",
    category: "Promotional",
    type: "RICH_CARD",
    approvalStatus: "Approved",
    orientation: "VERTICAL",
    title: "Welcome to ACME, {{name}}! 🎉",
    body: "Here's {{discount}}% off your first order. Tap below to start shopping.",
    media: { mediaType: "IMAGE", mediaHeight: "TALL", source: "url", url: "https://cdn.picomm.in/rcs/welcome.jpg" },
    buttons: [
      { type: "REPLY", text: "Shop now", postback: "shop_now" },
      { type: "REPLY", text: "See offers", postback: "see_offers" },
      { type: "URL", text: "Visit store", url: "https://picomm.in/shop" },
    ],
    createdAt: "18 Jun 2026",
  },
  {
    id: "rcs_tpl_delivery_otp",
    name: "delivery_otp_text",
    botId: "acme_otp_bot",
    category: "OTP",
    type: "TEXT",
    approvalStatus: "Approved",
    body: "{{otp}} is your ACME verification code. Valid for {{minutes}} minutes. Do not share it with anyone.",
    buttons: [],
    createdAt: "12 Jun 2026",
  },
  {
    id: "rcs_tpl_payment_reminder",
    name: "payment_reminder_text",
    botId: "acme_utility_bot",
    category: "Utility",
    type: "TEXT",
    approvalStatus: "Approved",
    body: "Hi {{name}}, your payment of Rs {{amount}} for order {{order_id}} is pending. Complete it to avoid cancellation.",
    buttons: [
      { type: "URL", text: "Pay now", url: "https://picomm.in/pay/{{order_id}}" },
      { type: "REPLY", text: "Need help", postback: "need_help" },
    ],
    createdAt: "02 Jul 2026",
  },
  {
    id: "rcs_tpl_festive_sale",
    name: "festive_sale_card",
    botId: "acme_promo_bot",
    category: "Promotional",
    type: "RICH_CARD",
    approvalStatus: "Pending",
    orientation: "HORIZONTAL",
    title: "{{festival}} Sale is live! 🪔",
    body: "{{name}}, up to {{discount}}% off everything. Offer ends {{expiry_date}}.",
    media: { mediaType: "VIDEO", mediaHeight: "MEDIUM", source: "url", url: "https://cdn.picomm.in/rcs/festive.mp4" },
    buttons: [
      { type: "REPLY", text: "Shop the sale", postback: "shop_sale" },
      { type: "DIALER", text: "Call support", phone: "+911800123456" },
    ],
    createdAt: "15 Jul 2026",
  },
  {
    id: "rcs_tpl_feedback",
    name: "feedback_request_card",
    botId: "acme_utility_bot",
    category: "Utility",
    type: "RICH_CARD",
    approvalStatus: "Rejected",
    orientation: "VERTICAL",
    title: "How did we do, {{name}}?",
    body: "Your order {{order_id}} was delivered. We'd love your feedback.",
    media: { mediaType: "IMAGE", mediaHeight: "SHORT", source: "url", url: "https://cdn.picomm.in/rcs/feedback.png" },
    buttons: [
      { type: "REPLY", text: "👍 Great", postback: "rating_good" },
      { type: "REPLY", text: "👎 Not great", postback: "rating_bad" },
    ],
    createdAt: "21 Jul 2026",
  },
];
