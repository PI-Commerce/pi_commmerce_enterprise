/**
 * Team Inbox / Agent Suite model.
 *
 * The Inbox is conversations-first (see leads-data + components/inbox/Conversations).
 * The *Agent Suite* adds the human-operations layer on top: every lead thread
 * becomes a **Conversation** with a lifecycle status, an optional human owner,
 * a priority and an SLA clock, so a team can triage inbound the way Sprinklr /
 * Wati / AiSensy do.
 *
 * Lifecycle (the "case" status):
 *   bot      — With bot. An aiChat agent is handling it; no human involved.
 *   queued   — In queue. The bot escalated (a needsReview / "talk to human" tap)
 *              or the customer asked for an agent. Unassigned, waiting for pickup.
 *   assigned — With agent. A teammate owns it and can reply.
 *   resolved — Closed. Can be reopened.
 *
 * This is a mock read-model. The route holds the mutable overlay (status +
 * assignee + agent replies) in local state and seeds it from {@link CONVERSATIONS}.
 */

import {
  LEAD_RECORDS, type LeadRecord, type LeadChannel, type LeadMessage,
} from "@/lib/leads-data";

/* -------------------------------------------------------------------------- *
 *  Team roster (human agents)
 * -------------------------------------------------------------------------- */

export type Presence = "online" | "away" | "offline";
export type TeammateRole = "agent" | "supervisor";

export type Teammate = {
  id: string;
  name: string;
  initials: string;
  role: TeammateRole;
  presence: Presence;
  /** Tailwind bg/text tone for the avatar fallback. */
  tone: string;
  /** The signed-in operator — drives the "Assigned to me" queue. */
  isYou?: boolean;
};

export const TEAMMATES: Teammate[] = [
  { id: "u_you",   name: "Riya Kapoor",  initials: "RK", role: "supervisor", presence: "online",  tone: "bg-ai/15 text-ai",           isYou: true },
  { id: "u_arjun", name: "Arjun Mehta",  initials: "AM", role: "agent",      presence: "online",  tone: "bg-success/15 text-success" },
  { id: "u_sneha", name: "Sneha Nair",   initials: "SN", role: "agent",      presence: "online",  tone: "bg-warning/15 text-warning" },
  { id: "u_karan", name: "Karan Singh",  initials: "KS", role: "agent",      presence: "away",    tone: "bg-chart-1/15 text-chart-1" },
  { id: "u_pooja", name: "Pooja Rao",    initials: "PR", role: "agent",      presence: "offline", tone: "bg-destructive/15 text-destructive" },
];

export const CURRENT_USER_ID = "u_you";

const TEAMMATE_BY_ID = new Map(TEAMMATES.map((t) => [t.id, t]));
export function getTeammate(id: string | null | undefined): Teammate | undefined {
  return id ? TEAMMATE_BY_ID.get(id) : undefined;
}

/** Agents eligible for auto-assignment — online only. */
export const ASSIGNABLE_TEAMMATES = TEAMMATES.filter((t) => t.presence !== "offline");

/* -------------------------------------------------------------------------- *
 *  Assignment routing (config surfaced in the queue header)
 * -------------------------------------------------------------------------- */

export type RoutingMode = "manual" | "round_robin" | "least_busy";

export const ROUTING_META: Record<RoutingMode, { label: string; desc: string }> = {
  manual:      { label: "Manual",       desc: "Agents claim conversations from the queue themselves." },
  round_robin: { label: "Round-robin",  desc: "New conversations rotate across online agents evenly." },
  least_busy:  { label: "Least busy",   desc: "New conversations go to the online agent with the fewest open chats." },
};

/* -------------------------------------------------------------------------- *
 *  Conversation status + priority metadata
 * -------------------------------------------------------------------------- */

export type ConversationStatus = "bot" | "queued" | "assigned" | "resolved";

export const STATUS_META: Record<
  ConversationStatus,
  { label: string; short: string; tone: string; dot: string }
> = {
  bot:      { label: "With bot",   short: "Bot",      tone: "border-ai/30 bg-ai/10 text-ai",                        dot: "bg-ai" },
  queued:   { label: "In queue",   short: "Queue",    tone: "border-warning/30 bg-warning/10 text-warning",        dot: "bg-warning" },
  assigned: { label: "With agent", short: "Agent",    tone: "border-success/30 bg-success/10 text-success",        dot: "bg-success" },
  resolved: { label: "Resolved",   short: "Resolved", tone: "border-muted-foreground/30 bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

export type Priority = "urgent" | "high" | "normal" | "low";

export const PRIORITY_META: Record<Priority, { label: string; tone: string; rank: number }> = {
  urgent: { label: "Urgent", tone: "border-destructive/30 bg-destructive/10 text-destructive", rank: 0 },
  high:   { label: "High",   tone: "border-warning/30 bg-warning/10 text-warning",             rank: 1 },
  normal: { label: "Normal", tone: "border-border bg-secondary text-muted-foreground",          rank: 2 },
  low:    { label: "Low",    tone: "border-border bg-secondary/60 text-muted-foreground/80",    rank: 3 },
};

/** First-response SLA target for a queued conversation, in minutes. */
export const SLA_TARGET_MIN = 15;

/* -------------------------------------------------------------------------- *
 *  Conversation record (the overlay on a lead)
 * -------------------------------------------------------------------------- */

export type Conversation = {
  id: string;
  leadId: string;
  status: ConversationStatus;
  /** Owning teammate — set only when status === "assigned". */
  assigneeId: string | null;
  priority: Priority;
  /** Short reason the customer is here — shown on queued/assigned cards. */
  intent: string;
  tags: string[];
  unread: boolean;
  channel: LeadChannel;
  /** ISO — when it entered the queue (drives the SLA / wait clock). */
  waitingSince: string;
  /** ISO — timestamp of the most recent message on the thread. */
  lastMessageAt: string;
  /** One-line preview for the list card. */
  preview: string;
};

/* -------------------------------------------------------------------------- *
 *  Seeding — deterministic so the queue is stable across reloads
 * -------------------------------------------------------------------------- */

function rngFromId(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function minutesAgoIso(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

function lastChannelOf(lead: LeadRecord): LeadChannel {
  if (!lead.messages.length) return "wa";
  const sorted = [...lead.messages].sort((a, b) => a.at.localeCompare(b.at));
  return sorted[sorted.length - 1].channel;
}

/** A readable one-line preview of the lead's most recent message. */
function previewOf(lead: LeadRecord): string {
  if (!lead.messages.length) return "No messages yet";
  const last = [...lead.messages].sort((a, b) => a.at.localeCompare(b.at))[lead.messages.length - 1];
  if (last.channel === "voice") {
    return last.kind === "call" ? "Voice call" : "Missed call";
  }
  if (last.buttonReply) return `Tapped: ${last.buttonReply.buttonLabel}`;
  const who = last.direction === "in" ? "" : "You: ";
  return `${who}${last.body}`;
}

const HANDOFF_INTENTS = [
  "Refund not received", "Order not delivered", "Payment failed",
  "Wrong item shipped", "Cancel my order", "Account locked", "Talk to a human",
];
const GENERIC_INTENTS = [
  "Pricing question", "How do I redeem?", "Change delivery address",
  "Is this in stock?", "Offer details", "Need more info",
];
const TAG_POOL = ["VIP", "Repeat buyer", "High value", "At risk", "New", "Escalation"];

function buildConversation(lead: LeadRecord, idx: number): Conversation {
  const rng = rngFromId(lead.id + "_conv");
  const channel = lastChannelOf(lead);
  const lastMessageAt = lead.lastInteractionAt;
  const escalated = lead.humanEscalated;

  // Status distribution — escalated leads lean toward needing a human.
  const roll = rng();
  let status: ConversationStatus;
  if (escalated) {
    status = roll < 0.4 ? "queued" : roll < 0.85 ? "assigned" : "resolved";
  } else {
    status = roll < 0.45 ? "bot" : roll < 0.8 ? "resolved" : roll < 0.92 ? "queued" : "assigned";
  }

  // Assignee — bias ~45% of assigned chats to the current user so "Assigned to
  // me" is populated. Only online/away agents can own a chat.
  let assigneeId: string | null = null;
  if (status === "assigned") {
    assigneeId = rng() < 0.45
      ? CURRENT_USER_ID
      : pick(rng, ASSIGNABLE_TEAMMATES.filter((t) => t.id !== CURRENT_USER_ID)).id;
  }

  // Priority — escalated + queued skew urgent/high.
  const pr = rng();
  let priority: Priority;
  if (escalated) priority = pr < 0.3 ? "urgent" : pr < 0.7 ? "high" : "normal";
  else priority = pr < 0.1 ? "high" : pr < 0.6 ? "normal" : "low";

  const intent = escalated ? pick(rng, HANDOFF_INTENTS) : pick(rng, GENERIC_INTENTS);

  // Wait clock — queued chats carry a live-ish wait; some breach SLA.
  const waitMin =
    status === "queued" ? 1 + Math.floor(rng() * 48)
    : status === "assigned" ? 20 + Math.floor(rng() * 300)
    : 0;

  const tags: string[] = [];
  if (escalated) tags.push("Escalation");
  if (rng() < 0.3) tags.push(pick(rng, TAG_POOL));

  const unread =
    status === "queued" ? true
    : status === "assigned" ? rng() < 0.4
    : status === "bot" ? rng() < 0.2
    : false;

  return {
    id: `conv_${lead.id}`,
    leadId: lead.id,
    status,
    assigneeId,
    priority,
    intent,
    tags: Array.from(new Set(tags)),
    unread,
    channel,
    waitingSince: minutesAgoIso(waitMin || idx),
    lastMessageAt,
    preview: previewOf(lead),
  };
}

/** Seeded conversations — one per lead. */
export const CONVERSATIONS: Conversation[] = LEAD_RECORDS.map((l, i) => buildConversation(l, i));

const LEAD_BY_ID = new Map(LEAD_RECORDS.map((l) => [l.id, l]));
export function getLead(leadId: string): LeadRecord | undefined {
  return LEAD_BY_ID.get(leadId);
}

/* -------------------------------------------------------------------------- *
 *  Derived helpers
 * -------------------------------------------------------------------------- */

/** Minutes since the conversation entered the queue. */
export function waitMinutes(conv: Conversation): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(conv.waitingSince)) / 60_000));
}

/** Compact wait label — "3m", "1h 20m", "2d". */
export function waitLabel(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** True when a queued conversation has waited past the first-response SLA. */
export function isSlaBreached(conv: Conversation): boolean {
  return conv.status === "queued" && waitMinutes(conv) > SLA_TARGET_MIN;
}

/** Count of open (non-resolved) conversations owned by a teammate. */
export function openLoadFor(convs: Conversation[], teammateId: string): number {
  return convs.filter((c) => c.assigneeId === teammateId && c.status === "assigned").length;
}

/**
 * Round-robin / least-busy pick for auto-assignment. Returns a teammate id or
 * null when nobody is assignable. Deterministic given the inputs.
 */
export function autoPickAssignee(
  convs: Conversation[],
  mode: RoutingMode,
  seed: string,
): string | null {
  const pool = ASSIGNABLE_TEAMMATES;
  if (!pool.length) return null;
  if (mode === "least_busy") {
    return [...pool].sort((a, b) => openLoadFor(convs, a.id) - openLoadFor(convs, b.id))[0].id;
  }
  if (mode === "round_robin") {
    const rng = rngFromId(seed);
    return pick(rng, pool).id;
  }
  return null; // manual
}

/* -------------------------------------------------------------------------- *
 *  Agent reply — an outbound message a human adds to the thread
 * -------------------------------------------------------------------------- */

/** Build an agent-authored outbound chat message to append to a lead's thread. */
export function makeAgentReply(
  conv: Conversation,
  teammate: Teammate,
  body: string,
): LeadMessage {
  const lead = getLead(conv.leadId);
  const lastCampaign = lead?.campaigns[0];
  return {
    id: `m_agent_${conv.id}_${Date.now()}`,
    channel: conv.channel === "voice" ? "wa" : conv.channel,
    direction: "out",
    at: new Date().toISOString(),
    body,
    deliveryStatus: "sent",
    authoredBy: { teammateId: teammate.id, teammateName: teammate.name },
    campaignId: lastCampaign?.campaignId ?? "manual",
    campaignName: lastCampaign?.campaignName ?? "Agent reply",
    runId: lastCampaign?.runId ?? "manual",
  };
}

/** Canned quick-replies offered in the composer. */
export const QUICK_REPLIES = [
  "Hi! You're now chatting with a human agent. How can I help?",
  "I'm checking that for you — one moment please.",
  "Apologies for the trouble. I've raised this and will update you shortly.",
  "Your refund has been initiated and should reflect in 3–5 business days.",
  "Is there anything else I can help you with?",
];
