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

/** A regular chat-style message (WhatsApp / SMS / RCS). */
export type LeadChatMessage = {
  id: string;
  channel: "wa" | "sms" | "rcs";
  direction: "in" | "out";
  at: string;                    // ISO
  body: string;
  campaignId: string;
  campaignName: string;
  runId: string;
  /** Optional CTA label — renders as an inline chip on outbound messages. */
  linkLabel?: string;
};

/** A completed voice call with its inline transcript. */
export type LeadVoiceCall = {
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
  campaignId: string;
  campaignName: string;
  runId: string;
};

/** A missed dial attempt — no transcript. Rendered as a thin system row. */
export type LeadVoiceAttempt = {
  id: string;
  channel: "voice";
  kind: "attempt";
  at: string;                    // ISO
  reason: "no_answer" | "busy" | "failed";
  campaignId: string;
  campaignName: string;
  runId: string;
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
  if (days <= 0) return "today";
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

const FIRST_NAMES = [
  "Aarav", "Vihaan", "Aditya", "Arjun", "Kabir", "Sai", "Ishaan", "Reyansh",
  "Ananya", "Aadhya", "Diya", "Ira", "Kavya", "Meera", "Riya", "Sara",
  "Rohan", "Neha", "Priya", "Rahul", "Sneha", "Vikram", "Anjali", "Karan",
  "Nisha", "Pooja", "Ravi", "Shreya", "Tanya", "Yash", "Zara", "Aman",
  "Divya", "Farhan", "Gauri", "Harsh", "Ishita", "Jai", "Kiran", "Lakshmi",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Iyer", "Nair", "Menon", "Reddy", "Rao",
  "Patel", "Shah", "Mehta", "Kapoor", "Malhotra", "Chopra", "Bhat",
  "Rangan", "Krishnan", "Bhargava", "Singhal", "Agarwal",
];

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

function fakePhone(rng: () => number): string {
  const rest = String(Math.floor(rng() * 1_000_000_000)).padStart(9, "0");
  const first = String(6 + Math.floor(rng() * 4)); // 6/7/8/9
  return `+91 ${first}${rest.slice(0, 4)} ${rest.slice(4, 8)}`;
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
    out.push({
      id: `m_${c.runId}_${idx++}`,
      channel: "wa",
      direction: "out",
      at: new Date(enteredMs).toISOString(),
      body: wa.body,
      linkLabel: wa.linkLabel,
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      runId: c.runId,
    });
    // ~55% probability of an inbound reply within a few hours.
    if (rng() < 0.55) {
      const replyDelayMin = 5 + Math.floor(rng() * 240);
      out.push({
        id: `m_${c.runId}_${idx++}`,
        channel: "wa",
        direction: "in",
        at: new Date(enteredMs + replyDelayMin * 60_000).toISOString(),
        body: inboundReplyFor(c.campaignName, rng),
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        runId: c.runId,
      });
    }
    // ~50% chance of a following SMS the next day (transactional confirm / reminder).
    if (rng() < 0.5) {
      out.push({
        id: `m_${c.runId}_${idx++}`,
        channel: "sms",
        direction: "out",
        at: new Date(enteredMs + 24 * 60 * 60_000).toISOString(),
        body: smsBodyFor(c.campaignName, firstName),
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        runId: c.runId,
      });
    }
    // ~30% chance of an RCS rich-card follow-up two days in.
    if (rng() < 0.3) {
      out.push({
        id: `m_${c.runId}_${idx++}`,
        channel: "rcs",
        direction: "out",
        at: new Date(enteredMs + 2 * 24 * 60 * 60_000).toISOString(),
        body: rcsBodyFor(c.campaignName, firstName),
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

function buildLead(i: number): LeadRecord {
  const rng = mulberry32(i + 91);
  const firstName = pick(rng, FIRST_NAMES);
  const lastName = pick(rng, LAST_NAMES);
  const createdDaysAgo = 5 + Math.floor(rng() * 300);
  const createdAt = isoDaysAgo(createdDaysAgo, 10, Math.floor(rng() * 59));
  const campaigns = buildCampaignsFor(rng, createdDaysAgo);
  const lastCampaign = campaigns[0];
  const lastInteractionAt = lastCampaign?.enteredAt ?? createdAt;
  const lastUpdatedAt = lastCampaign?.exitedAt ?? lastInteractionAt;
  const messages = buildMessages(campaigns, firstName, rng);
  return {
    id: `l_${String(1000 + i)}`,
    customerId: `cust_${String(100000 + i * 37)}`,
    name: `${firstName} ${lastName}`,
    phone: fakePhone(rng),
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
    createdAt,
    lastUpdatedAt,
    lastInteractionAt,
    humanEscalated: campaigns.some((c) => c.humanEscalated),
    campaigns,
    messages,
  };
}

/** ~50 seeded leads — deterministic so hot-reload doesn't shuffle rows. */
export const LEAD_RECORDS: LeadRecord[] = Array.from({ length: 50 }, (_, i) => buildLead(i));
