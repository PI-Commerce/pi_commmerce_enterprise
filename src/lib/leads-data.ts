/**
 * Leads Management — a lightweight, product-agnostic customer directory for v2.
 *
 * v2 scope decisions (see PICOM Lead Mgmt + HITL locking pass):
 *   - No PII masking / redaction toggle in the UI.
 *   - No Segment / Tags model on the lead — the campaigns a lead is in ARE the
 *     segmentation for v2.
 *   - `humanEscalated` rolled up from LeadCampaignEntry.humanEscalated — true
 *     whenever any run has flagged the lead via a Human Escalation node.
 *   - All four channels (WhatsApp, SMS, RCS, Voice) collapse into ONE array
 *     `messages: LeadMessage[]`, typed by `channel`. WA/SMS/RCS render as chat
 *     bubbles; Voice entries carry their transcript inline (each call is a
 *     collapsible session) with missed attempts shown as thin system rows.
 *
 * This is a mock read-model — no runtime writes.
 */

/** A run status snapshot for a Lead's participation in a campaign. */
import { contactAt } from "./contact-pool";
import { SEED_ENTRY_POINTS, generateSessions, operator, type Session, type SessionStatus, type EscalationStatus } from "./inbound";
import { resolveAgent } from "./agent-data";

export type CampaignRunStatus = "running" | "completed" | "paused" | "failed" | "terminated";

/** A single association: this lead flowed through this campaign's run. */
export type LeadCampaignEntry = {
  campaignId: string;
  campaignName: string;
  runId: string;
  runName: string;
  status: CampaignRunStatus;
  /** True if a Human Escalation (needsReview) node fired for this lead in this run. */
  humanEscalated: boolean;
  /** ISO timestamps for the campaign timeline. */
  enteredAt: string;
  exitedAt?: string;
};

/** Discriminator for channel — matches SankeyNodeKind action-node names sans "voiceCall". */
export type LeadChannel = "wa" | "sms" | "rcs" | "voice";

/**
 * Per-message delivery status, roughly Meta's WhatsApp DLR states plus a
 * `pending` sender-side placeholder and a `no_dlr` bucket for SMS/RCS routes
 * where the provider does not surface a receipt.
 */
export type MessageDeliveryStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "no_dlr";

/**
 * Full WhatsApp template preview payload. Renders the header (text or media),
 * body (variable-substituted), optional footer, and buttons (quick reply / URL
 * / phone). Only used when a template message is sent — plain freeform text
 * uses `body` on LeadChatMessage.
 */
export type WaTemplatePreview = {
  header?:
    | { kind: "text"; text: string }
    | { kind: "image" | "video" | "document"; url: string; fileName?: string };
  body: string;
  footer?: string;
  buttons?: Array<
    | { kind: "quick_reply"; label: string }
    | { kind: "url"; label: string; url: string }
    | { kind: "phone"; label: string; phone: string }
  >;
};

/** A regular chat-style message (WhatsApp / SMS / RCS). */
/**
 * Where a message came from. Campaign messages are something we initiated over a
 * known audience; inbound messages are one person's session against an always-on
 * entry point. They share a thread in the Inbox but are never the same thing, so
 * every message carries its origin and the Inbox demarcates the two.
 */
export type MessageOrigin = "campaign" | "inbound";

/** Attribution carried by every message: the campaign run, or the entry-point
 *  session, that produced it. Discriminated by `origin`. */
export type CampaignSource = {
  origin: "campaign";
  campaignId: string;
  campaignName: string;
  runId: string;
};
export type InboundSource = {
  origin: "inbound";
  /** Entry point the arrival landed on — see `inbound.ts`. */
  entryPointId: string;
  entryPointName: string;
  /** The session this message belongs to (`s-voic-1030`, `s-wa_m-1073`, …). */
  sessionId: string;
  /** Agent that handled the session, when one did. */
  agentName?: string;
  /**
   * The session's working state, carried onto the message so the Inbox can show it.
   *
   * These three live on `Session` in `inbound.ts`, and until they were copied here the
   * Inbox could say which entry point a thread came from but not whether it was open,
   * who held it, or what it was about — the three questions an inbox exists to answer.
   */
  status: SessionStatus;
  /** Whether the agent marked this session for a person. */
  escalation: EscalationStatus;
  /** The agent's own word for how it ended. */
  disposition?: string;
  assigneeName?: string;
};
export type MessageSource = CampaignSource | InboundSource;

export type LeadChatMessage = MessageSource & {
  id: string;
  channel: "wa" | "sms" | "rcs";
  direction: "in" | "out";
  at: string;                    // ISO
  body: string;
  /** Optional CTA label — renders as an inline chip on outbound messages. */
  linkLabel?: string;
  /** DLR state — outbound only. Inbound messages leave this unset. */
  deliveryStatus?: MessageDeliveryStatus;
  /** Human-readable failure reason when deliveryStatus is `failed`. */
  failureReason?: string;
  /** When set, renders as a full WhatsApp template preview (header + body + buttons). */
  template?: WaTemplatePreview;
  /** Inbound only — the customer tapped a button on a prior template. */
  buttonReply?: { buttonLabel: string };
};

/** A completed voice call with its inline transcript. */
export type LeadVoiceCall = MessageSource & {
  id: string;
  channel: "voice";
  kind: "call";
  at: string;                    // ISO
  /** Call duration in seconds. */
  duration: number;
  agentId?: string;
  agentName?: string;
  outcome: "completed" | "no_answer" | "busy" | "failed";
  transcript: { role: "agent" | "customer"; text: string; at: string }[];
  /** Inbound only — outcome variables the handling agent extracted. */
  sessionOutcome?: Record<string, string>;
};

/** A missed dial attempt — no transcript. Rendered as a thin system row. */
export type LeadVoiceAttempt = MessageSource & {
  id: string;
  channel: "voice";
  kind: "attempt";
  at: string;                    // ISO
  reason: "no_answer" | "busy" | "failed";
};

export type LeadMessage = LeadChatMessage | LeadVoiceCall | LeadVoiceAttempt;

export type LeadRecord = {
  id: string;                    // stable Lead id (l_xxxx)
  customerId: string;            // client-side customer id
  name: string;
  phone: string;                 // stored + shown as-is (no masking in v2)
  email?: string;
  createdAt: string;             // ISO — first time we saw this lead on the platform
  lastUpdatedAt: string;         // ISO
  lastInteractionAt: string;     // ISO
  /** Rolled up: true if ANY of the lead's runs flagged Human Escalation. */
  humanEscalated: boolean;
  campaigns: LeadCampaignEntry[];
  messages: LeadMessage[];
  /**
   * Current inbound state, rolled up for the list rail.
   *
   * A lead can hold several sessions; the rail has room for one answer, and the one
   * that matters is the newest — "is this person waiting on us right now". The open
   * count rides along because one open thread among five closed ones is a different
   * situation from one open thread outright.
   */
  inbound?: {
    status: SessionStatus;
    /** The session these facts describe — what an Inbox edit addresses. */
    sessionId: string;
    /** As the agent left it. An operator's change lives in `inbox-store`. */
    escalation: EscalationStatus;
    /** How the agent said it ended, when one handled it. */
    disposition?: string;
    assigneeId?: string;
    assigneeName?: string;
    openCount: number;
  };
};

/* -------------------------------------------------------------------------- *
 *  Utilities
 * -------------------------------------------------------------------------- */

/** Format an ISO timestamp as "MMM d, yyyy · h:mm a" (India-friendly). */
export function formatIso(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
    ...opts,
  });
}

/** Absolute date only — "8 Aug 2026". Used for the Created column per Q6. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Absolute date + time — "8 Aug 2026, 4:12 pm". Used for hover titles. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

/** Relative label — "2 days ago", "3 months ago". Absolute is available via
 *  {@link formatDateTime} for hover titles. */
export function relTime(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  /* Today gets a clock time, not the word "today". In a list sorted by recency the
     top rows are all from today by definition, so the word distinguishes nothing —
     the hour is the only part carrying information at that range. */
  if (days <= 0) {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  }
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

/* -------------------------------------------------------------------------- *
 *  Campaign catalog (seed-only)
 *
 *  Ids match `src/lib/campaign-examples.ts` so the Campaign filter on the
 *  Leads page maps 1:1 to what the user sees under `/campaigns`.
 *
 *  `hasHitl` = the campaign's graph includes a Human Escalation node. Only
 *  campaigns with `hasHitl` can produce escalated leads. The Leads list uses
 *  this to conditionally show the "Human Escalation" column.
 * -------------------------------------------------------------------------- */

export type CampaignCatalogEntry = { id: string; name: string; hasHitl: boolean };

export const CAMPAIGN_CATALOG: CampaignCatalogEntry[] = [
  { id: "c_ex17", name: "Retail · ACME Corp FCC Loyalty",             hasHitl: false },
  { id: "c_ex7",  name: "Retail · Activation",                        hasHitl: false },
  { id: "c_ex8",  name: "Retail · Reward Expiry",                     hasHitl: false },
  { id: "c_ex9",  name: "Retail · Winback",                           hasHitl: false },
  { id: "c_ex11", name: "Retail · Seasonal Sale",                     hasHitl: false },
  { id: "c_ex14", name: "D2C · Cart Abandonment",                     hasHitl: false },
  { id: "c_ex15", name: "E-commerce · Price Drop",                    hasHitl: false },
  // Demo campaign that wires the Human Escalation node — see campaign-examples.
  { id: "c_ex20", name: "Support · WhatsApp with human handoff",      hasHitl: true  },
];

/** True if any campaign in the given ids has a Human Escalation node.
 *  The Leads list uses this to decide whether to show the Escalation column. */
export function scopeHasHitl(campaignIds: Iterable<string>): boolean {
  const ids = new Set(campaignIds);
  return CAMPAIGN_CATALOG.some((c) => ids.has(c.id) && c.hasHitl);
}

const HITL_CAMPAIGN_IDS = new Set(CAMPAIGN_CATALOG.filter((c) => c.hasHitl).map((c) => c.id));


/* -------------------------------------------------------------------------- *
 *  Deterministic PRNG so the seed stays stable across renders
 * -------------------------------------------------------------------------- */

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = seed;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function isoDaysAgo(days: number, hour = 10, minute = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}


/* -------------------------------------------------------------------------- *
 *  Message builders — one per channel
 * -------------------------------------------------------------------------- */

function waBodyFor(campaignName: string, firstName: string): { body: string; linkLabel?: string } {
  if (campaignName.includes("Loyalty"))           return { body: `Hi ${firstName}, thanks for being a loyal customer! Here's an exclusive reward for you.`, linkLabel: "Redeem now" };
  if (campaignName.includes("Activation"))        return { body: `Welcome ${firstName}! Complete your first purchase and get 15% off.`, linkLabel: "Shop now" };
  if (campaignName.includes("Reward Expiry"))     return { body: `Hi ${firstName}, your reward points expire in 7 days — redeem now.` };
  if (campaignName.includes("Winback"))           return { body: `${firstName}, we've missed you! Here's a special offer to bring you back.`, linkLabel: "See offer" };
  if (campaignName.includes("Seasonal"))          return { body: `${firstName}, our seasonal sale is live — up to 40% off.`, linkLabel: "Browse sale" };
  if (campaignName.includes("Cart Abandonment"))  return { body: `Hi ${firstName}, you left something in your cart. Complete your purchase now.`, linkLabel: "Resume checkout" };
  if (campaignName.includes("Price Drop"))        return { body: `${firstName}, the item you saved just dropped in price!`, linkLabel: "View item" };
  if (campaignName.includes("human handoff"))     return { body: `Hi ${firstName}, this is Pi Support — how can I help today?` };
  return { body: `Hi ${firstName}, we have an update for you.` };
}

function smsBodyFor(campaignName: string, firstName: string): string {
  if (campaignName.includes("Cart Abandonment"))  return `${firstName}, complete your order at picomm.in/cart before it clears. - PICOMM`;
  if (campaignName.includes("Reward"))            return `Hi ${firstName}, your reward expires soon. Redeem: picomm.in/r - PICOMM`;
  if (campaignName.includes("Seasonal"))          return `${firstName}, up to 40% off ends tonight. picomm.in/sale - PICOMM`;
  if (campaignName.includes("Loyalty"))           return `${firstName}, exclusive loyalty voucher inside. picomm.in/loyal - PICOMM`;
  if (campaignName.includes("Winback"))           return `${firstName}, we miss you — 20% off any order. picomm.in/back - PICOMM`;
  return `Hi ${firstName}, an update from PICOMM. picomm.in - PICOMM`;
}

function rcsBodyFor(campaignName: string, firstName: string): string {
  if (campaignName.includes("Price Drop"))        return `${firstName}, prices just dropped on 3 items in your wishlist.`;
  if (campaignName.includes("Loyalty"))           return `${firstName}, you've unlocked Gold tier — new benefits inside.`;
  if (campaignName.includes("Seasonal"))          return `${firstName}, tap below to see today's flash-sale picks curated for you.`;
  return `${firstName}, here's an update tailored for you.`;
}

function inboundReplyFor(campaignName: string, rng: () => number): string {
  const generic = ["Ok", "Thanks!", "Not interested", "Tell me more", "Sure", "Later maybe"];
  if (campaignName.includes("Cart"))      return pick(rng, ["Already ordered", "Not now", "Show me options"]);
  if (campaignName.includes("Loyalty"))   return pick(rng, ["Redeemed!", "Nice, thanks", "I'll check"]);
  if (campaignName.includes("Winback"))   return pick(rng, ["Maybe", "Not interested", "What's the offer?"]);
  if (campaignName.includes("handoff"))   return pick(rng, ["I need help with my order", "Where's my refund?", "Something's broken"]);
  return pick(rng, generic);
}

/** Build a voice transcript — deterministic, ~5–9 turns. */
function buildTranscript(campaignName: string, firstName: string, rng: () => number): { role: "agent" | "customer"; text: string; at: string }[] {
  const lines: Array<["agent" | "customer", string]> = [
    ["agent",    `Hi ${firstName}, this is Maya from Pi Commerce. Is now a good time to talk?`],
    ["customer", pick(rng, ["Yes, but just a minute.", "Sure, go ahead.", "Ok."])],
    ["agent",    `I'm reaching out about ${campaignName.toLowerCase()}. May I share a quick offer?`],
    ["customer", pick(rng, ["Alright.", "What's the offer?", "Ok.", "Sure."])],
    ["agent",    `We've got 20% off just for you, valid until Sunday. Would you like me to send the link on WhatsApp?`],
    ["customer", pick(rng, ["Yes please.", "Sure, send it.", "Maybe later.", "Yes."])],
    ["agent",    `Perfect, sending now. Thanks for your time, ${firstName}!`],
  ];
  let t = 0;
  return lines.map(([role, text]) => {
    const at = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
    t += 6 + Math.floor(rng() * 10);
    return { role, text, at };
  });
}

/* -------------------------------------------------------------------------- *
 *  Message stream builder — cross-channel, cross-campaign
 * -------------------------------------------------------------------------- */

/**
 * Pick a plausible outbound DLR state. In the field ~90% of WA outbounds land as
 * delivered/read; a small tail fails on carrier or spam. SMS/RCS don't always
 * surface receipts so they get `no_dlr` a chunk of the time.
 */
function pickDeliveryStatus(
  channel: "wa" | "sms" | "rcs",
  rng: () => number,
): { status: MessageDeliveryStatus; reason?: string } {
  const roll = rng();
  if (channel === "wa") {
    if (roll < 0.55) return { status: "read" };
    if (roll < 0.88) return { status: "delivered" };
    if (roll < 0.95) return { status: "sent" };
    return {
      status: "failed",
      reason: roll < 0.98 ? "Recipient not on WhatsApp" : "24-hour session expired",
    };
  }
  if (channel === "sms") {
    if (roll < 0.55) return { status: "delivered" };
    if (roll < 0.75) return { status: "sent" };
    if (roll < 0.95) return { status: "no_dlr" };
    return { status: "failed", reason: "Carrier rejected" };
  }
  // rcs
  if (roll < 0.5) return { status: "read" };
  if (roll < 0.8) return { status: "delivered" };
  if (roll < 0.92) return { status: "sent" };
  if (roll < 0.97) return { status: "no_dlr" };
  return { status: "failed", reason: "Recipient not RCS-capable" };
}

/** Occasional full WhatsApp template payload. About 25% of outbound WA. */
function maybeTemplateFor(
  campaignName: string,
  firstName: string,
  body: string,
  linkLabel: string | undefined,
  rng: () => number,
): WaTemplatePreview | undefined {
  if (rng() > 0.25) return undefined;
  if (campaignName.includes("Cart Abandonment")) {
    return {
      header: { kind: "text", text: "Your cart is waiting" },
      body,
      footer: "Reply STOP to unsubscribe",
      buttons: [
        { kind: "url", label: "Resume checkout", url: "https://picomm.in/cart" },
        { kind: "quick_reply", label: "Not now" },
      ],
    };
  }
  if (campaignName.includes("Loyalty")) {
    return {
      header: {
        kind: "image",
        url: "https://images.unsplash.com/photo-1607082349566-187342175e2f?w=600",
      },
      body,
      footer: "PICOMM Loyalty",
      buttons: [
        { kind: "quick_reply", label: "Redeem" },
        { kind: "quick_reply", label: "See rewards" },
      ],
    };
  }
  if (campaignName.includes("Seasonal") || campaignName.includes("Price Drop")) {
    return {
      header: { kind: "text", text: `Hi ${firstName}` },
      body,
      buttons: [
        { kind: "url", label: linkLabel ?? "Shop now", url: "https://picomm.in/sale" },
        { kind: "phone", label: "Call support", phone: "+911800123456" },
      ],
    };
  }
  if (campaignName.includes("handoff")) {
    return {
      body,
      buttons: [
        { kind: "quick_reply", label: "Track order" },
        { kind: "quick_reply", label: "Talk to human" },
      ],
    };
  }
  return undefined;
}

/** Pull a button label off a template so the follow-up inbound tap looks natural. */
function firstButtonLabel(t: WaTemplatePreview | undefined): string | undefined {
  if (!t?.buttons?.length) return undefined;
  return t.buttons[0].label;
}

function buildMessages(
  entries: LeadCampaignEntry[],
  firstName: string,
  rng: () => number,
): LeadMessage[] {
  const out: LeadMessage[] = [];
  let idx = 0;
  for (const c of entries) {
    const enteredMs = Date.parse(c.enteredAt);
    // Every campaign always includes at least a WhatsApp touch.
    const wa = waBodyFor(c.campaignName, firstName);
    const waDlr = pickDeliveryStatus("wa", rng);
    const waTemplate = maybeTemplateFor(c.campaignName, firstName, wa.body, wa.linkLabel, rng);
    out.push({
      id: `m_${c.runId}_${idx++}`,
      channel: "wa",
      direction: "out",
      at: new Date(enteredMs).toISOString(),
      body: wa.body,
      linkLabel: wa.linkLabel,
      template: waTemplate,
      deliveryStatus: waDlr.status,
      failureReason: waDlr.reason,
      origin: "campaign",
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      runId: c.runId,
    });
    // ~55% probability of an inbound reply within a few hours. If the outbound
    // was a template with buttons, ~60% of those replies come back as a
    // button-tap reply carrying the label; the rest are free text.
    if (rng() < 0.55) {
      const replyDelayMin = 5 + Math.floor(rng() * 240);
      const buttonLabel = firstButtonLabel(waTemplate);
      const asButtonTap = buttonLabel && rng() < 0.6;
      out.push({
        id: `m_${c.runId}_${idx++}`,
        channel: "wa",
        direction: "in",
        at: new Date(enteredMs + replyDelayMin * 60_000).toISOString(),
        body: asButtonTap ? buttonLabel! : inboundReplyFor(c.campaignName, rng),
        buttonReply: asButtonTap ? { buttonLabel: buttonLabel! } : undefined,
        origin: "campaign",
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        runId: c.runId,
      });
    }
    // ~50% chance of a following SMS the next day (transactional confirm / reminder).
    if (rng() < 0.5) {
      const smsDlr = pickDeliveryStatus("sms", rng);
      out.push({
        id: `m_${c.runId}_${idx++}`,
        channel: "sms",
        direction: "out",
        at: new Date(enteredMs + 24 * 60 * 60_000).toISOString(),
        body: smsBodyFor(c.campaignName, firstName),
        deliveryStatus: smsDlr.status,
        failureReason: smsDlr.reason,
        origin: "campaign",
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        runId: c.runId,
      });
    }
    // ~30% chance of an RCS rich-card follow-up two days in.
    if (rng() < 0.3) {
      const rcsDlr = pickDeliveryStatus("rcs", rng);
      out.push({
        id: `m_${c.runId}_${idx++}`,
        channel: "rcs",
        direction: "out",
        at: new Date(enteredMs + 2 * 24 * 60 * 60_000).toISOString(),
        body: rcsBodyFor(c.campaignName, firstName),
        deliveryStatus: rcsDlr.status,
        failureReason: rcsDlr.reason,
        origin: "campaign",
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        runId: c.runId,
      });
    }
    // ~25% chance of a voice attempt on day 3 — first attempt might be missed.
    if (rng() < 0.25) {
      const firstDial = enteredMs + 3 * 24 * 60 * 60_000;
      const missedRoll = rng();
      if (missedRoll < 0.4) {
        // Missed attempt then a completed retry ~2 hours later.
        out.push({
          id: `m_${c.runId}_${idx++}`,
          channel: "voice",
          kind: "attempt",
          at: new Date(firstDial).toISOString(),
          reason: missedRoll < 0.2 ? "no_answer" : "busy",
          origin: "campaign",
          campaignId: c.campaignId,
          campaignName: c.campaignName,
          runId: c.runId,
        });
        out.push({
          id: `m_${c.runId}_${idx++}`,
          channel: "voice",
          kind: "call",
          at: new Date(firstDial + 2 * 60 * 60_000).toISOString(),
          duration: 45 + Math.floor(rng() * 180),
          agentId: "a_voice_react",
          agentName: "Reactivation Voice",
          outcome: "completed",
          transcript: buildTranscript(c.campaignName, firstName, rng),
          origin: "campaign",
          campaignId: c.campaignId,
          campaignName: c.campaignName,
          runId: c.runId,
        });
      } else {
        // Straight-to-completed call.
        out.push({
          id: `m_${c.runId}_${idx++}`,
          channel: "voice",
          kind: "call",
          at: new Date(firstDial).toISOString(),
          duration: 45 + Math.floor(rng() * 180),
          agentId: "a_voice_react",
          agentName: "Reactivation Voice",
          outcome: "completed",
          transcript: buildTranscript(c.campaignName, firstName, rng),
          origin: "campaign",
          campaignId: c.campaignId,
          campaignName: c.campaignName,
          runId: c.runId,
        });
      }
    }
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/* -------------------------------------------------------------------------- *
 *  Seed generator
 * -------------------------------------------------------------------------- */

function buildCampaignsFor(rng: () => number, createdDaysAgo: number): LeadCampaignEntry[] {
  const nEntries = 1 + Math.floor(rng() * 3);   // 1..3
  const chosen = new Set<string>();
  const entries: LeadCampaignEntry[] = [];
  while (chosen.size < nEntries) {
    const c = pick(rng, CAMPAIGN_CATALOG);
    if (chosen.has(c.id)) continue;
    chosen.add(c.id);
    const enteredDaysAgo = Math.max(0, Math.floor(rng() * createdDaysAgo));
    const statusRoll = rng();
    const status: CampaignRunStatus = statusRoll < 0.55 ? "completed" : statusRoll < 0.85 ? "running" : "terminated";
    // Escalation is only possible when the campaign's graph includes an HITL node.
    // ~35% of leads inside an HITL campaign get escalated (roughly matches finserv).
    const humanEscalated = HITL_CAMPAIGN_IDS.has(c.id) && rng() < 0.35;
    entries.push({
      campaignId: c.id,
      campaignName: c.name,
      runId: `r_${Math.floor(1000 + rng() * 9000)}`,
      runName: `${c.name} · Run ${Math.floor(1 + rng() * 6)}`,
      status,
      humanEscalated,
      enteredAt: isoDaysAgo(enteredDaysAgo, 9 + Math.floor(rng() * 8), Math.floor(rng() * 59)),
      exitedAt: status === "completed"
        ? isoDaysAgo(Math.max(0, enteredDaysAgo - 1 - Math.floor(rng() * 4)), 14, Math.floor(rng() * 59))
        : undefined,
    });
  }
  return entries.sort((a, b) => Date.parse(b.enteredAt) - Date.parse(a.enteredAt));
}

/* -------------------------------------------------------------------------- *
 *  Inbound sessions → Inbox messages
 *
 *  A session is one person's conversation against an always-on entry point. The
 *  Inbox is where conversations are read, so a session's turns belong here as
 *  ordinary messages — tagged `origin: "inbound"` so the thread can demarcate
 *  them from campaign sends, which we initiated rather than answered.
 *
 *  Sessions whose stage never produced a conversation (`unrouted`) are skipped:
 *  nothing was said, so there is nothing to read.
 * -------------------------------------------------------------------------- */

/** Every seeded session, bucketed by the lead it belongs to. Computed once. */
const SESSIONS_BY_LEAD: Map<string, Session[]> = (() => {
  const map = new Map<string, Session[]>();
  for (const ep of SEED_ENTRY_POINTS) {
    // A slice of each entry point's pool keeps the Inbox readable — the full 240
    // sessions per entry point would bury the campaign threads.
    for (const sess of generateSessions(ep).slice(0, 40)) {
      /* Never reached an agent, so there is no conversation to show in a thread. */
      if (sess.stage === "not_handled") continue;
      const list = map.get(sess.leadId);
      if (list) list.push(sess);
      else map.set(sess.leadId, [sess]);
    }
  }
  return map;
})();

const EP_NAME = new Map(SEED_ENTRY_POINTS.map((e) => [e.id, e.name] as const));

/** Agent display name for a session's handler, when one handled it. */
function agentNameFor(id?: string): string | undefined {
  return id ? resolveAgent(id)?.name : undefined;
}

/** Session turns → Inbox messages. Voice sessions collapse into one call card
 *  (the transcript is the call); chat sessions expand to one bubble per turn. */
function inboundMessagesFor(leadId: string): LeadMessage[] {
  const sessions = SESSIONS_BY_LEAD.get(leadId) ?? [];
  const out: LeadMessage[] = [];

  for (const sess of sessions) {
    const source: InboundSource = {
      origin: "inbound",
      entryPointId: sess.entryPointId,
      entryPointName: EP_NAME.get(sess.entryPointId) ?? sess.entryPointId,
      sessionId: sess.id,
      agentName: agentNameFor(sess.agentId),
      status: sess.status,
      escalation: sess.escalation,
      disposition: sess.disposition,
      assigneeName: operator(sess.assigneeId)?.name,
    };
    const startMs = Date.parse(sess.startedAt);

    if (sess.channel === "voice") {
      out.push({
        ...source,
        id: `${sess.id}-call`,
        channel: "voice",
        kind: "call",
        at: sess.startedAt,
        duration: Math.round((sess.durationMs ?? 0) / 1000),
        agentId: sess.agentId,
        agentName: source.agentName,
        outcome: sess.turnCount <= 1 ? "no_answer" : "completed",
        // System turns are routing narration, not speech — they belong to the
        // session's diagnostics, not to a transcript a human reads.
        transcript: sess.transcript
          .filter((t) => t.role !== "system")
          .map((t) => ({
            role: t.role as "agent" | "customer",
            text: t.text,
            at: new Date(startMs + t.at * 1000).toISOString(),
          })),
        sessionOutcome: Object.keys(sess.outcome).length ? sess.outcome : undefined,
      });
      continue;
    }

    for (const [n, turn] of sess.transcript.entries()) {
      if (turn.role === "system") continue;
      out.push({
        ...source,
        id: `${sess.id}-t${n}`,
        channel: "wa",
        direction: turn.role === "customer" ? "in" : "out",
        at: new Date(startMs + turn.at * 1000).toISOString(),
        body: turn.text,
        // Inbound replies are session traffic, not a broadcast: there is no DLR
        // to report, so the bubble renders without a delivery footer.
        deliveryStatus: undefined,
      });
    }
  }
  return out;
}

function buildLead(i: number): LeadRecord {
  const rng = mulberry32(i + 91);
  // Identity comes from the shared pool, not a local name/phone roll: inbound
  // sessions seed from the same pool, and `phone` is what joins them to a lead.
  const contact = contactAt(i);
  const [firstName, ...restName] = contact.name.split(" ");
  const lastName = restName.join(" ");
  const createdDaysAgo = 5 + Math.floor(rng() * 300);
  const createdAt = isoDaysAgo(createdDaysAgo, 10, Math.floor(rng() * 59));
  const campaigns = buildCampaignsFor(rng, createdDaysAgo);
  const lastCampaign = campaigns[0];
  const lastInteractionAt = lastCampaign?.enteredAt ?? createdAt;
  const lastUpdatedAt = lastCampaign?.exitedAt ?? lastInteractionAt;
  const leadId = `l_${String(1000 + i)}`;
  const mySessions = (SESSIONS_BY_LEAD.get(leadId) ?? [])
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  /* The headline status is the most *actionable* one, not the newest.
     Newest produced rows reading "Solved · 3 open", which is both true and useless:
     an operator scanning the rail is asking "does this person need me", and the one
     solved thread that happens to be most recent is not the answer. Open outranks
     Pending outranks everything closed; the assignee and tags come from whichever
     session set that status, so the three facts describe one thread. */
  /* An escalation outranks an open thread. Open means a conversation is live;
     "needs a human" means the agent has already decided it cannot finish this
     one, which is the only row in the rail that is waiting on a person rather
     than on time. */
  const lead0 =
    mySessions.find((x) => x.escalation === "needed") ??
    mySessions.find((x) => x.status === "open") ??
    mySessions.find((x) => x.status === "pending") ??
    mySessions[0];
  const openCount = mySessions.filter(
    (x) => x.status === "open" || x.status === "pending",
  ).length;
  const inbound = lead0
    ? {
        status: lead0.status,
        sessionId: lead0.id,
        escalation: lead0.escalation,
        disposition: lead0.disposition,
        assigneeId: lead0.assigneeId,
        assigneeName: operator(lead0.assigneeId)?.name,
        openCount,
      }
    : undefined;
  const campaignMessages = buildMessages(campaigns, firstName, rng);
  const inboundMessages = inboundMessagesFor(leadId);
  const messages = [...campaignMessages, ...inboundMessages].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  // An inbound session can be the most recent thing that happened to a lead.
  const lastAt = messages.length
    ? messages[messages.length - 1].at
    : lastInteractionAt;
  return {
    id: leadId,
    customerId: `cust_${String(100000 + i * 37)}`,
    name: contact.name,
    phone: contact.phone,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
    createdAt,
    lastUpdatedAt: lastAt > lastUpdatedAt ? lastAt : lastUpdatedAt,
    lastInteractionAt: lastAt > lastInteractionAt ? lastAt : lastInteractionAt,
    humanEscalated: campaigns.some((c) => c.humanEscalated),
    campaigns,
    messages,
    inbound,
  };
}

/** ~50 seeded leads — deterministic so hot-reload doesn't shuffle rows. */
export const LEAD_RECORDS: LeadRecord[] = Array.from({ length: 50 }, (_, i) => buildLead(i));
