/**
 * RCS templates — demo data + types for the RCS Template Registry
 * (Channels → RCS → Templates tab).
 *
 * RCS (Rich Communication Services, Google's RBM) templates are richer than SMS:
 * a template is either a plain **Text** message or a **Rich card** (media + title
 * + description + suggestion buttons). Every template is created under an
 * **Agent** (see {@link file://./rcs-config.ts}); the agent's **Type**
 * (Transactional / Promotional) and its brand's **provider** (JIO / Netcore-VI)
 * are inherited rather than chosen on the template. Templates carry an **approval
 * status** — RCS templates are submitted to the provider for approval (Netcore is
 * async PENDING→APPROVED/REJECTED; Jio auto-approves).
 *
 * Media rules are **provider-specific** (PICOM-4728 §4-5): the aspect ratios,
 * heights, alignments, formats and size caps differ between JIO and Netcore-VI,
 * so the accepted shapes live in {@link RCS_MEDIA_SPECS} and the form reads them
 * off the selected agent's provider.
 *
 * Body content uses named `{{var}}` placeholders. Carousel is out of scope.
 */
import type { RcsProvider } from "@/lib/rcs-config";

export type RcsTemplateType = "TEXT" | "RICH_CARD";

/** Provider approval state (Netcore async; Jio auto-approves). */
export type RcsApprovalStatus = "Approved" | "Pending" | "Rejected";

export type RcsMediaType = "IMAGE" | "VIDEO";
export type RcsCardOrientation = "VERTICAL" | "HORIZONTAL";
/** Card media heights (largest offered set — a provider/orientation may expose
 *  only a subset, per {@link RCS_MEDIA_SPECS}). */
export type RcsMediaHeight = "SHORT" | "MEDIUM" | "LARGE";
/** Horizontal-card image alignment (Netcore-VI only). */
export type RcsAlignment = "LEFT" | "RIGHT";

/** A suggestion chip. All three types post a click callback, so all three are
 *  branchable in the campaign node. */
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

/**
 * Rich-card media. `orientation` is always set; `height` or `alignment` is set
 * only when the selected provider + orientation offers that dimension (JIO
 * horizontal → height; Netcore horizontal → alignment; Netcore vertical →
 * height; JIO vertical → neither).
 */
export type RcsMedia = {
  mediaType: RcsMediaType;
  orientation: RcsCardOrientation;
  height?: RcsMediaHeight;
  alignment?: RcsAlignment;
  /** Where the media came from — a pasted URL or an upload. */
  source: "url" | "upload";
  /** Set when source === "url". */
  url?: string;
  /** Set when source === "upload" — the file name (prototype: no real bytes). */
  fileName?: string;
  /** Optional poster thumbnail (video only) — a public URL or an upload. */
  thumbnail?: {
    source: "url" | "upload";
    url?: string;
    fileName?: string;
  };
};

export type RcsTemplate = {
  id: string;
  /** Pi Commerce label for the template. */
  name: string;
  /** The agent this template is registered under (drives Type + provider). */
  agentId: string;
  type: RcsTemplateType;
  approvalStatus: RcsApprovalStatus;
  /** Message body with named `{{var}}` placeholders. */
  body: string;
  /** Rich card only. */
  title?: string;
  media?: RcsMedia;
  /** Suggestion chips (REPLY / URL / DIALER). */
  buttons: RcsButton[];
  createdAt: string;
};

export const RCS_TEMPLATE_TYPES: { value: RcsTemplateType; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "RICH_CARD", label: "Rich card" },
];
export const RCS_BUTTON_TYPES: RcsButtonType[] = ["REPLY", "URL", "DIALER"];

/** Friendly labels for the button types (Google's suggestion names). */
export const RCS_BUTTON_LABELS: Record<RcsButtonType, string> = {
  REPLY: "Quick reply",
  URL: "Open URL",
  DIALER: "Dial number",
};

export const RCS_CARD_ORIENTATIONS: { value: RcsCardOrientation; label: string }[] = [
  { value: "VERTICAL", label: "Vertical" },
  { value: "HORIZONTAL", label: "Horizontal" },
];

/* --------------------------- Media specs (provider-driven) --------------------------- */

/** Accepted image formats (both providers). */
export const RCS_IMAGE_FORMATS = ["jpg", "jpeg", "gif", "png"] as const;
/** Accepted video formats (both providers). */
export const RCS_VIDEO_FORMATS = ["mp4", "mpeg", "webm"] as const;

/** Max rich-card payload the provider accepts. */
export const RCS_MAX_CARD_PAYLOAD_KB = 250;

export type RcsHeightOption = { key: RcsMediaHeight; label: string; aspect?: string };
export type RcsAlignmentOption = { key: RcsAlignment; label: string };

/** What a given provider + orientation offers. */
export type OrientationSpec = {
  /** Recommended aspect ratio when fixed for the whole orientation. */
  aspect?: string;
  /** Height choices (each may carry its own recommended aspect). */
  heights?: RcsHeightOption[];
  /** Alignment choices (Netcore-VI horizontal). */
  alignments?: RcsAlignmentOption[];
};

export type MediaKindSpec = {
  formats: readonly string[];
  maxSizeMb: number;
  orientations: Partial<Record<RcsCardOrientation, OrientationSpec>>;
  /** Video-only thumbnail requirements. */
  thumbnail?: {
    maxSizeKb: number;
    /** Fixed thumbnail aspect (Netcore-VI). */
    aspect?: string;
    /** Thumbnail aspect per height (JIO). */
    perHeightAspect?: Partial<Record<RcsMediaHeight, string>>;
  };
};

export type ProviderMediaSpec = { image: MediaKindSpec; video: MediaKindSpec };

/**
 * The accepted media shapes per provider (PICOM-4728 §4-5).
 *
 * JIO — image: Vertical is a plain 2:1 card (no height); Horizontal offers Short
 * (3:1) / Medium (2:1) / Large (2:1). Video: Horizontal Short/Medium/Large with a
 * thumbnail whose aspect tracks the height (Short 3:1, Medium/Large 7:3).
 *
 * Netcore-VI — image: Vertical offers Short / Medium; Horizontal is a 3:4 card
 * with Left / Right alignment. Video mirrors the image orientations at 3:4 with a
 * 25:33 thumbnail. Image ≤ 2 MB, video ≤ 10 MB, thumbnail ≤ 40 KB throughout.
 */
export const RCS_MEDIA_SPECS: Record<RcsProvider, ProviderMediaSpec> = {
  JIO: {
    image: {
      formats: RCS_IMAGE_FORMATS,
      maxSizeMb: 2,
      orientations: {
        VERTICAL: { aspect: "2:1" },
        HORIZONTAL: {
          heights: [
            { key: "SHORT", label: "Short", aspect: "3:1" },
            { key: "MEDIUM", label: "Medium", aspect: "2:1" },
            { key: "LARGE", label: "Large", aspect: "2:1" },
          ],
        },
      },
    },
    video: {
      formats: RCS_VIDEO_FORMATS,
      maxSizeMb: 10,
      orientations: {
        HORIZONTAL: {
          heights: [
            { key: "SHORT", label: "Short", aspect: "3:1" },
            { key: "MEDIUM", label: "Medium", aspect: "7:3" },
            { key: "LARGE", label: "Large", aspect: "7:3" },
          ],
        },
      },
      thumbnail: { maxSizeKb: 40, perHeightAspect: { SHORT: "3:1", MEDIUM: "7:3", LARGE: "7:3" } },
    },
  },
  "Netcore-VI": {
    image: {
      formats: RCS_IMAGE_FORMATS,
      maxSizeMb: 2,
      orientations: {
        VERTICAL: {
          heights: [
            { key: "SHORT", label: "Short" },
            { key: "MEDIUM", label: "Medium" },
          ],
        },
        HORIZONTAL: {
          aspect: "3:4",
          alignments: [
            { key: "LEFT", label: "Left" },
            { key: "RIGHT", label: "Right" },
          ],
        },
      },
    },
    video: {
      formats: RCS_VIDEO_FORMATS,
      maxSizeMb: 10,
      orientations: {
        VERTICAL: {
          heights: [
            { key: "SHORT", label: "Short" },
            { key: "MEDIUM", label: "Medium" },
          ],
        },
        HORIZONTAL: {
          aspect: "3:4",
          alignments: [
            { key: "LEFT", label: "Left" },
            { key: "RIGHT", label: "Right" },
          ],
        },
      },
      thumbnail: { maxSizeKb: 40, aspect: "25:33" },
    },
  },
};

/** The media-kind spec for a provider + media type. */
export function mediaKindSpec(provider: RcsProvider, mediaType: RcsMediaType): MediaKindSpec {
  return RCS_MEDIA_SPECS[provider][mediaType === "IMAGE" ? "image" : "video"];
}

/** The orientation spec (heights / alignments / aspect) for a selection. */
export function orientationSpec(
  provider: RcsProvider,
  mediaType: RcsMediaType,
  orientation: RcsCardOrientation,
): OrientationSpec | undefined {
  return mediaKindSpec(provider, mediaType).orientations[orientation];
}

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

/** Recommended aspect ratio for a fully-specified media selection (if any). */
export function mediaAspectHint(
  provider: RcsProvider,
  media: Pick<RcsMedia, "mediaType" | "orientation" | "height">,
): string | undefined {
  const spec = orientationSpec(provider, media.mediaType, media.orientation);
  if (!spec) return undefined;
  if (spec.heights && media.height)
    return spec.heights.find((h) => h.key === media.height)?.aspect ?? spec.aspect;
  return spec.aspect;
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

/**
 * Every button is branchable: RCS posts a click callback for REPLY, URL and
 * DIALER alike, so each labelled button becomes a campaign-node output branch.
 */
export function templateButtons(t: Pick<RcsTemplate, "buttons">): RcsButton[] {
  return (t.buttons ?? []).filter((b) => b.text.trim());
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

/** Google RBM allows up to 11 suggestions on a message; we cap the form lower. */
export const MAX_BUTTONS = 4;

/** Validation shared by the create form (single source of truth). */
export function validateRcsTemplate(
  t: Partial<RcsTemplate>,
  existing: RcsTemplate[],
  selfId?: string,
): string[] {
  const errors: string[] = [];
  if (!t.name?.trim()) errors.push("Template Name is required.");
  if (!t.agentId?.trim()) errors.push("Agent is required.");
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

/* --------------------------- Seed data --------------------------- */

/** Mirrored RCS templates for the demo workspace. Agent ids match rcs-config.ts. */
export const SEED_RCS_TEMPLATES: RcsTemplate[] = [
  {
    id: "rcs_tpl_order_shipped",
    name: "order_shipped_card",
    agentId: "acme_utility_bot",
    type: "RICH_CARD",
    approvalStatus: "Approved",
    title: "Your order is on its way 📦",
    body: "Hi {{name}}, order {{order_id}} has shipped and arrives by {{eta}}. Track it live below.",
    // JIO image, Vertical → plain 2:1 card, no height.
    media: { mediaType: "IMAGE", orientation: "VERTICAL", source: "url", url: "https://cdn.picomm.in/rcs/order-shipped.png" },
    buttons: [
      { type: "URL", text: "Track order", url: "https://picomm.in/track/{{order_id}}" },
      { type: "REPLY", text: "Change address", postback: "change_address" },
    ],
    createdAt: "12 Jun 2026",
  },
  {
    id: "rcs_tpl_welcome_offer",
    name: "welcome_offer_card",
    agentId: "acme_promo_bot",
    type: "RICH_CARD",
    approvalStatus: "Approved",
    title: "Welcome to ACME, {{name}}! 🎉",
    body: "Here's {{discount}}% off your first order. Tap below to start shopping.",
    // JIO image, Vertical → plain 2:1 card, no height.
    media: { mediaType: "IMAGE", orientation: "VERTICAL", source: "url", url: "https://cdn.picomm.in/rcs/welcome.jpg" },
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
    agentId: "acme_otp_bot",
    type: "TEXT",
    approvalStatus: "Approved",
    body: "{{otp}} is your ACME verification code. Valid for {{minutes}} minutes. Do not share it with anyone.",
    buttons: [],
    createdAt: "12 Jun 2026",
  },
  {
    id: "rcs_tpl_payment_reminder",
    name: "payment_reminder_text",
    agentId: "acme_utility_bot",
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
    agentId: "acme_promo_bot",
    type: "RICH_CARD",
    approvalStatus: "Pending",
    title: "{{festival}} Sale is live! 🪔",
    body: "{{name}}, up to {{discount}}% off everything. Offer ends {{expiry_date}}.",
    // JIO video, Horizontal → Medium (7:3), with a thumbnail.
    media: { mediaType: "VIDEO", orientation: "HORIZONTAL", height: "MEDIUM", source: "url", url: "https://cdn.picomm.in/rcs/festive.mp4" },
    buttons: [
      { type: "REPLY", text: "Shop the sale", postback: "shop_sale" },
      { type: "DIALER", text: "Call support", phone: "+911800123456" },
    ],
    createdAt: "15 Jul 2026",
  },
  {
    id: "rcs_tpl_feedback",
    name: "feedback_request_card",
    // Registered under the Netcore-VI retail brand — exercises Netcore's
    // Vertical Short/Medium heights.
    agentId: "retail_utility_bot",
    type: "RICH_CARD",
    approvalStatus: "Rejected",
    title: "How did we do, {{name}}?",
    body: "Your order {{order_id}} was delivered. We'd love your feedback.",
    media: { mediaType: "IMAGE", orientation: "VERTICAL", height: "SHORT", source: "url", url: "https://cdn.picomm.in/rcs/feedback.png" },
    buttons: [
      { type: "REPLY", text: "👍 Great", postback: "rating_good" },
      { type: "REPLY", text: "👎 Not great", postback: "rating_bad" },
    ],
    createdAt: "21 Jul 2026",
  },
];
