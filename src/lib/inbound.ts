/**
 * Inbound — Entry Points and Sessions.
 *
 * The inbound counterpart to Campaigns/Runs. The dividing line is *who initiates*
 * and *what the unit of work is*: a campaign Run fans out over a known Audience
 * and terminates; an inbound Session is one person, N turns, open-ended.
 *
 * Two objects:
 *   • EntryPoint — always-on infrastructure. Binds `channel + address` and carries
 *     the graph that routes an arrival to an agent (see `inbound-graph.ts`).
 *   • Session — one customer's continuous interaction through an entry point.
 *
 * All three v1 use cases (CTWA ads, WhatsApp service, inbound call) are the SAME
 * construct — they differ only in graph and handler. See `SEED_ENTRY_POINTS`.
 *
 * Sessions are deterministically generated from the entry point id (same seed →
 * same sessions) so navigation is stable, matching `analytics-leads.generateLeads`.
 * In-memory only: a hard refresh replays from seed.
 */
import { useSyncExternalStore } from "react";
import { getAgents, resolveAgent, type AgentRecord } from "./agent-data";
import type { PresetCondition } from "./campaign-types";
import type { ArrivalTraits, InboundGraph } from "./inbound-graph";
import { resolveViaGraph } from "./inbound-graph";
import { contactAt, leadIdForPoolIndex, POOL_SIZE } from "./contact-pool";

/**
 * What an arrival comes in on.
 *
 * `webhook` is not a messaging channel — it is any system that can POST us an event
 * worth starting a session for: an order placed, a payment failed, a ticket raised in
 * someone else's helpdesk. It sits in the same union because everything downstream of
 * the trigger is identical (route it, run it, hand it to an agent or a human, close
 * it), and the one thing that differs — what the trigger publishes — is already
 * modelled per channel in {@link TRIGGER_VARIABLES}.
 */
export type InboundChannel = "whatsapp" | "voice" | "webhook";

export const CHANNEL_LABEL: Record<InboundChannel, string> = {
  whatsapp: "WhatsApp",
  voice: "Voice",
  webhook: "Webhook",
};

/**
 * Which channels a new entry point can be built on.
 *
 * First cut is WhatsApp only. The other two keep their types and their seeded
 * entry points — an existing voice line still renders, still reports — because
 * deleting the model to express a scope decision is how you lose the work and
 * the history with it. What the scope decision actually governs is whether
 * somebody can start a *new* one, which is this map.
 *
 * Voice waits on DTMF and warm transfer. Webhook waits because it is a second
 * channel, and the first cut is deliberately one.
 */
export const CHANNEL_AVAILABLE: Record<InboundChannel, boolean> = {
  whatsapp: true,
  voice: false,
  webhook: false,
};

export const CHANNEL_WAITING_ON: Record<InboundChannel, string | undefined> = {
  whatsapp: undefined,
  voice: "Waiting on DTMF and warm transfer",
  webhook: "Waiting on multi-channel inbound",
};

/**
 * Where a session is: in flight, or ended in one of three outcomes.
 *
 * Exhaustive and mutually exclusive, so the funnel identity in
 * `computeSessionMetrics` always balances.
 */
export type SessionStage =
  /* In flight. Neither is an outcome — a session that has not ended has none,
     and Status plus Escalation already say exactly where it is. */
  | "active"
  | "handed_off"
  /* The three outcomes. */
  | "resolved"
  | "dropped"
  | "not_handled";

/**
 * Why a session ended the way it did.
 *
 * One field across both unsuccessful outcomes, because the outcome says what
 * happened and the reason says what caused it — and a reader asking "why" wants
 * the same field whichever row they are looking at.
 *
 * Each stays separately countable because each belongs to somebody different:
 * `not_routed` is a configuration mistake, `opted_out` is a compliance figure,
 * `superseded` is the override rate, and `window_closed` is the ordinary case.
 */
export type OutcomeReason =
  | "window_closed"
  | "superseded"
  | "not_routed"
  | "opted_out";

export const OUTCOME_REASONS: OutcomeReason[] = [
  "window_closed", "superseded", "not_routed", "opted_out",
];

export const OUTCOME_REASON_LABEL: Record<OutcomeReason, string> = {
  window_closed: "Customer stopped replying",
  superseded: "A new trigger replaced it",
  not_routed: "No entry point claimed it",
  opted_out: "Customer had opted out",
};

/**
 * Where a session sits for whoever is working it.
 *
 * The only user-facing state axis. There used to be a second one — "outcome",
 * describing how a session ended — and it turned out to be a middle layer:
 * status is a pure function of the stage, so the two had six valid combinations
 * out of twenty. Everything outcome added beyond status was *why* a session
 * ended, which {@link OutcomeReason} carries directly.
 *
 * Escalation remains separate because it is not derivable from either: it
 * records a judgement the agent made, not a consequence of how things ended.
 */
export type SessionStatus = "open" | "pending" | "expired" | "solved";

export const SESSION_STATUSES: SessionStatus[] = ["open", "pending", "expired", "solved"];

export const STATUS_LABEL: Record<SessionStatus, string> = {
  open: "Open",
  /* "Pending" was the single vaguest word in the product: pending on whom? */
  pending: "Waiting on customer",
  /* Was "Expired", which was named for the 24-hour window alone. It now covers
     every ending without a resolution — the window closing, a session
     superseded, an arrival nothing claimed — and the reason says which. */
  expired: "Unresolved",
  solved: "Solved",
};

/**
 * Tied to the channel's own window rather than invented.
 *
 * WhatsApp closes a service window 24 hours after the customer's last message, and
 * after that only a template can reach them. Reusing that boundary as the status
 * means Expired and Solved happen without anyone clicking anything, so the counts
 * stay honest — a ticket lifecycle of our own invention would need operators to
 * maintain it, and the ones they forget are exactly the ones worth measuring.
 */
export const STATUS_INFO: Record<SessionStatus, string> = {
  open: "Live and ours to answer — whoever holds it has not closed it.",
  pending: "Waiting on the customer. We replied; they have not.",
  expired: `Closed with no resolution — past the ${24}-hour window, dropped, opted out or overridden. Only a template can reopen it.`,
  solved: "Closed. Reopens on its own if the customer replies inside the window.",
};

export const STATUS_TONE: Record<SessionStatus, string> = {
  open: "border-ai/30 bg-ai/10 text-ai",
  pending: "border-warning/30 bg-warning/10 text-warning",
  expired: "border-border bg-secondary text-muted-foreground",
  solved: "border-success/30 bg-success/10 text-success",
};

/**
 * Whether a person needs to pick this session up, and whether one has.
 *
 * A third axis, and it earns its place because neither of the other two answers
 * the question. {@link SessionStage} says how the conversation ended;
 * {@link SessionStatus} says whether anyone is still on the hook. Escalation
 * says whether the *agent asked for a human* — which is a judgement the agent
 * made, not a consequence of either.
 *
 * It is set once, when the session closes, from the agent's disposition. The
 * agent is not interrupted mid-conversation to decide it: it finishes, it says
 * how the conversation went, and that answer decides whether a person is needed.
 */
export type EscalationStatus = "none" | "needed" | "handled";

/**
 * "Person", never "human".
 *
 * The product reserves "agent" for the AI, so the counterpart needs a word of its
 * own. "Human agent" keeps both meanings of agent alive in one phrase, which is
 * the ambiguity this vocabulary exists to remove.
 */
export const ESCALATION_LABEL: Record<EscalationStatus, string> = {
  none: "No escalation",
  needed: "Needs a person",
  handled: "Handled by a person",
};

export const ESCALATION_INFO: Record<EscalationStatus, string> = {
  none: "The agent closed it on its own terms.",
  needed: "The agent's disposition marked this for a person, and nobody has picked it up yet.",
  handled: "A person took it on after the agent marked it.",
};

/** The people who work the inbox. Never "agents" — that word is the AI's. */
export const OPERATOR_NOUN = { one: "operator", many: "operators" } as const;

/**
 * Which disposition wordings mean a person is needed.
 *
 * Seed-side only. In the product this is per entry point — the agent node names
 * the dispositions that escalate — and this regex stands in for that choice so
 * the seeded sessions are internally consistent with it.
 */
export const ESCALATING_DISPOSITION = /human|approval|complaint|blocked|out of scope|abusive|transferred/i;

export const ESCALATION_TONE: Record<EscalationStatus, string> = {
  none: "border-border bg-secondary text-muted-foreground",
  needed: "border-warning/40 bg-warning/10 text-warning",
  handled: "border-success/30 bg-success/10 text-success",
};

/** The channel window Expired is derived from. */
export const SESSION_WINDOW_HOURS = 24;

/**
 * Who holds the conversation right now — exactly one, always.
 *
 * The single most valuable thing in the reference model: while a bot or an agent owns
 * a chat, message-triggered rules are switched off, so automation and a human can
 * never talk over each other. Modelled as one field rather than a set of flags
 * precisely so that invariant is unrepresentable-if-violated.
 */
export type SessionOwner = "rule" | "bot" | "agent" | "human";

export const OWNER_LABEL: Record<SessionOwner, string> = {
  rule: "Rule",
  bot: "Chatbot",
  agent: "AI agent",
  human: "Operator",
};

/**
 * Who closed it. Only meaningful on a solved session.
 *
 * Split out rather than folded into status because "solved" on its own hides the one
 * number that says whether the automation is working: a bot that solves nothing still
 * shows a healthy solved count when operators mop up behind it.
 */
export type SolvedBy = "bot" | "operator";

/**
 * Stages a session actually ends in.
 *
 * `handed_off` is deliberately absent, and that is a correction. It describes a
 * session sitting in a person's hands — its working status is Open, somebody owns
 * it, and it has not finished. Counting it as an ending made the funnel claim a
 * conversation was over while the Inbox was still showing it as work to do, and it
 * meant a session a person then resolved had no recorded ending at all.
 *
 * It belongs with `active`: both are in flight, and they differ only by who holds
 * the conversation.
 */
export const TERMINAL_STAGES: SessionStage[] = ["resolved", "dropped", "not_handled"];

/** In flight — no outcome yet. Differ only by who is holding the conversation. */
export const IN_FLIGHT_STAGES: SessionStage[] = ["active", "handed_off"];

export function isInFlight(stage: SessionStage): boolean {
  return IN_FLIGHT_STAGES.includes(stage);
}

/**
 * What became of the conversation — the axis a reader should call "Outcome".
 *
 * Every value here is deliberately a different word from every value of
 * {@link STATUS_LABEL}. They used to share two: "Resolved" against "Solved", which
 * are synonyms, and "Expired" against "Expired", which is the same word. A reader
 * seeing both on one session assumes they mean different things and goes looking
 * for the difference.
 *
 * The two in-flight values say where the conversation is rather than how it ended,
 * because it has not.
 */
/**
 * Internal only — the lifecycle the metrics and the transcript seeder key off.
 *
 * Not a user-facing axis any more: the sessions table shows Status and Reason.
 */
export const STAGE_LABEL: Record<SessionStage, string> = {
  active: "With the agent",
  handed_off: "With a person",
  resolved: "Answered",
  dropped: "Dropped",
  not_handled: "Not handled",
};

export const STAGE_INFO: Record<SessionStage, string> = {
  active: "In flight right now, with the agent.",
  handed_off: "In flight, with a person — not an ending. It finishes when they answer it, the customer stops replying, or the window closes.",
  resolved: "Reached a conclusion. Whether the agent or a person finished it is recorded separately, as solvedBy.",
  dropped: `A conversation happened and ended without a conclusion — the customer went quiet and the ${24}-hour window closed, or a new trigger replaced it.`,
  not_handled: "No conversation happened at all.",
};

/* ──────────────────────── Webhook receiver (inbound) ────────────────────────── */

/**
 * The endpoint a sending system posts to.
 *
 * Generated, never typed. Every inbound-webhook product works this way — Stripe,
 * Twilio, Shopify, Zapier all hand you a URL and you paste it into the sender —
 * because an endpoint the client invents is one we do not route and cannot
 * authenticate.
 *
 * The token is the whole address: it carries no entry point id, because an id in the
 * path lets anyone holding one probe for the others. Rotating the token retires the
 * old URL without touching anything else.
 */
export function webhookEndpoint(token: string): string {
  return `${WEBHOOK_HOST}/inbound/v1/hooks/${token}`;
}

const WEBHOOK_HOST = "https://api.picommerce.paytm.com";

/**
 * The shared secret the sender signs each request with.
 *
 * `whsec_` prefixed by convention, so a leaked string is recognisable for what it is
 * in a log or a paste. We generate it and show it once; the client configures their
 * sender with it, and we reject anything whose signature does not match.
 */
export function newSigningSecret(): string {
  const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return `whsec_${Array.from({ length: 32 }, () => a[Math.floor(Math.random() * a.length)]).join("")}`;
}

export function newWebhookToken(): string {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 20 }, () => a[Math.floor(Math.random() * a.length)]).join("");
}

/* ─────────────────────── Tracked links and QR codes ─────────────────────────── */

/**
 * What Meta tells us about a QR scan: nothing, and not at the moment you expect.
 *
 * Two separate facts, and both matter:
 *
 *   - **Timing.** Scanning a code reaches no server of ours and no API of Meta's.
 *     The camera decodes a `wa.me` link locally and opens a chat. Nothing exists
 *     to listen to until the customer presses send, so scans are uncountable and
 *     the drop-off between scanning and sending is invisible.
 *   - **Content.** When that message does arrive it is an ordinary text message.
 *     No referral, no entry-point field, nothing distinguishing it from a message
 *     somebody typed from scratch.
 *
 * So the marker below is not detected, it is *planted* — put into the link's
 * prefilled text, carried into the customer's composer by WhatsApp, and matched
 * on the way back. Which means it is editable by the customer, forgeable by
 * anyone who types it, and carries no attribution to Meta. The UI says all three
 * rather than letting it look as solid as the ad referral beside it.
 *
 * Generated rather than typed, for the same reason the webhook URL is: a marker
 * the author invents is one we do not look for.
 */
export function newLinkToken(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 — these get read aloud
  return `PI-${Array.from({ length: 5 }, () => a[Math.floor(Math.random() * a.length)]).join("")}`;
}

/**
 * One printable code, of several.
 *
 * A business rarely has one. It has a poster in the window, a sticker on the till
 * and a code on the receipt — and the whole point of putting a code in three
 * places is to tell the three apart. So each carries its own marker *and* its own
 * prefilled message: the marker is what we match, the prefill is what the customer
 * appears to have said, and that is opening context the agent gets for free.
 */
export type TrackedLink = {
  id: string;
  /** What this code is, in the author's words — the output label on the canvas. */
  label: string;
  token: string;
  /** What WhatsApp puts in the customer's composer. Editable per link. */
  prefill: string;
};

/** The default prefill for a newly added code. */
export function trackedLinkText(token: string): string {
  return `Hi, I'd like to know more [${token}]`;
}

/**
 * The link to print on a poster or encode as a QR.
 *
 * `wa.me` wants the number with no `+`, spaces or punctuation. Each bound number
 * produces its own link from the same marker, so one code can be printed per
 * region without the markers multiplying.
 */
export function trackedLink(address: string, prefill: string): string {
  const digits = address.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(prefill)}`;
}

/**
 * One Click-to-WhatsApp ad, named.
 *
 * Meta sends `referral.source_id`, which is an opaque number. An author wiring a
 * Diwali campaign to its own greeting should not have to recognise
 * `120210483726150` on a canvas, so the label is carried alongside and is what
 * the output port shows.
 */
export type AdSource = {
  /** Meta's `referral.source_id`. */
  id: string;
  label: string;
};

/**
 * Which Meta referral sources a CTWA trigger accepts.
 *
 * `referral.source_type` is `"ad"` for a paid Click-to-WhatsApp ad and `"post"` for an
 * organic Facebook or Instagram post carrying a WhatsApp call-to-action. Both arrive
 * through the same `referral` object, which is why one trigger catching both is easy
 * to build and wrong to ship: a business running organic posts would find them
 * counted against its ad spend.
 */
export type AdSourceType = "ad" | "post" | "any";

export const AD_SOURCE_LABEL: Record<AdSourceType, string> = {
  ad: "Paid ads only",
  post: "Organic posts only",
  any: "Ads and organic posts",
};

export const AD_SOURCE_INFO: Record<AdSourceType, string> = {
  ad: "referral.source_type is \"ad\" — a Click-to-WhatsApp ad you paid for.",
  post: "referral.source_type is \"post\" — a Facebook or Instagram post with a WhatsApp button.",
  any: "Either. Ad attribution will include organic traffic, so pick this only if you want that.",
};

/** The signature scheme we verify. One value today; stated because senders ask. */
export const WEBHOOK_SIGNATURE_HEADER = "X-Pi-Signature";
export const WEBHOOK_SIGNATURE_ALGO = "HMAC-SHA256";

/* ───────────────────────────── Trigger kinds ────────────────────────────────── */

/**
 * What starts a session.
 *
 * Previously implicit: the entry point's channel decided everything and the author's
 * only lever was a conditional downstream testing `trigger.referral_ad`. That worked
 * for the one case it was built around and silently excluded the rest — a keyword
 * list, a QR scan and a webhook event are all different arrivals, not different
 * branches of the same one, and each publishes something the others do not.
 *
 * Declaring the kind up front is also what lets the builder offer the right variables:
 * a graph branching on `trigger.matched_keyword` under an "any message" trigger is
 * testing a value that will never be set.
 */
/**
 * NOTE ON `qr_link`, restored after being cut.
 *
 * It was a trigger that matched on a marker we planted in a link's prefilled
 * text, because Meta sends nothing at all that identifies a QR scan or a wa.me
 * click — a message from one is indistinguishable from any other. That made it
 * the only kind here with no platform signal behind it: best-effort, forgeable
 * by anyone who types the marker, lost the moment a customer edits the message
 * WhatsApp handed them, and carrying no attribution back to Meta.
 *
 * A trigger that looks as reliable as the ad referral and is not will be trusted
 * as though it were. Removed rather than kept with a warning on it.
 */
export type TriggerKind =
  | "any_message"
  | "keyword"
  | "ctwa_ad"
  | "qr_link"
  | "webhook";

export const TRIGGER_KIND_LABEL: Record<TriggerKind, string> = {
  any_message: "Any inbound message",
  keyword: "Message matches a keyword",
  ctwa_ad: "Click-to-WhatsApp ad or post",
  qr_link: "Tracked link or QR code",
  webhook: "Webhook event",
};

export const TRIGGER_KIND_INFO: Record<TriggerKind, string> = {
  any_message: "Anything arriving on this entry point, however it got here.",
  keyword: "The first message matches one of the keywords below, exactly.",
  ctwa_ad: "Meta attached a referral to the first message, naming the ad or post it came from.",
  qr_link: "The first message carries a marker we planted in the link. Best-effort — nothing identifies the scan itself.",
  webhook: "Another system posted an event worth starting a session for.",
};

/**
 * Which kinds a channel can carry.
 *
 * A voice line has no message to keyword-match and no ad referral; a webhook has no
 * message at all. Offering a kind the channel cannot produce is how an entry point
 * ends up live and silent.
 */
export const TRIGGER_KINDS_BY_CHANNEL: Record<InboundChannel, TriggerKind[]> = {
  whatsapp: ["any_message", "keyword", "ctwa_ad", "qr_link"],
  voice: ["any_message"],
  webhook: ["webhook"],
};

/* ─────────────────────────── Operators and tags ─────────────────────────────── */

/**
 * The humans a session can be assigned to.
 *
 * A flat seeded list rather than a lookup into `agent-data`: those are AI agents, and
 * conflating the two is exactly what makes a "solved by bot vs operator" number
 * impossible to compute later.
 */
export type Operator = { id: string; name: string; email: string };

export const OPERATORS: Operator[] = [
  /* The signed-in operator. Seeded into the pool rather than kept beside it so every
     count, queue and report treats them as one of the team — a "me" that sits outside
     the roster is how an inbox ends up with a personal view the analytics disagrees
     with. */
  { id: "op_aman",     name: "Aman",          email: "aman@picommerce.com" },
  { id: "op_samson",   name: "Samson",        email: "samson@picommerce.com" },
  { id: "op_rahul",    name: "Rahul Verma",   email: "rahul.verma@picommerce.com" },
  { id: "op_elliot",   name: "Elliot Wong",   email: "elliot@picommerce.com" },
  { id: "op_priyanka", name: "Priyanka Patil", email: "priyanka.patil@picommerce.com" },
  { id: "op_jyoti",    name: "Jyoti",         email: "jyoti@picommerce.com" },
];

/** Whoever is signed in. One constant today; a session lookup when there are accounts. */
export const CURRENT_OPERATOR_ID = "op_aman";

export function currentOperator(): Operator {
  return OPERATORS.find((o) => o.id === CURRENT_OPERATOR_ID) ?? OPERATORS[0];
}

export function operator(id?: string): Operator | undefined {
  return id ? OPERATORS.find((o) => o.id === id) : undefined;
}

/**
 * Queues a session can be assigned to — the tenant's team → user mapping.
 *
 * Tenant-scoped configuration, not graph configuration: the same teams are available
 * to every entry point this client runs, and an `assignHuman` node stores only the
 * team id. That split is what lets someone join or leave a team without anybody
 * editing a routing graph, which is the whole reason assignment targets a team and
 * not a person — a graph naming an individual routes to someone on leave.
 *
 * It is also what the eligibility rules operate over: skip offline, honour working
 * hours, cap open chats all need a pool to choose from.
 */
export type Team = { id: string; name: string; operatorIds: string[] };

export const TEAMS: Team[] = [
  { id: "team_support", name: "Support",  operatorIds: ["op_aman", "op_samson", "op_rahul", "op_jyoti"] },
  { id: "team_sales",   name: "Sales",    operatorIds: ["op_elliot", "op_priyanka"] },
  { id: "team_kyc",     name: "KYC desk", operatorIds: ["op_rahul", "op_priyanka"] },
];

export function team(id?: string): Team | undefined {
  return id ? TEAMS.find((t) => t.id === id) : undefined;
}

/** FR: assignment strategy on an `assignHuman` node. */
export type AssignType = "direct" | "round_robin";

/**
 * The one assignment rule a node applies, if any.
 *
 * Exclusive rather than a set, matching the reference tool: the three answer the same
 * question — which member of the team gets it — and two of them answering at once has
 * no defined resolution.
 */
export type AssignRule = "load_based" | "auto_reassign" | "contact_owner";

export const ASSIGN_RULE_LABEL: Record<AssignRule, string> = {
  load_based: "Load based routing",
  auto_reassign: "Auto reassign on no response",
  contact_owner: "Direct to contact owner",
};

export const ASSIGN_DEFAULT_MAX_OPEN = 50;
export const ASSIGN_DEFAULT_REASSIGN_MINS = 10;

/**
 * Why a conversation left the agent for a person.
 *
 * Closed on purpose. A free-text reason coming out of a model produces "needs
 * human", "Needs a human" and "escalate" as three answers to one question, and
 * nothing downstream can route on it. It is what the operator reads in the Team
 * inbox and what the handoff breakdown groups by.
 */
export const HANDOFF_REASONS = [
  "Customer asked for a human",
  "Outside what the agent handles",
  "Agent could not resolve it",
  "Complaint or escalation",
  "Needs an approval",
] as const;

export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export type BusinessHours = {
  /** Local start/end in 24h "HH:MM". */
  start: string;
  end: string;
  /** 0 = Sunday. */
  days: number[];
  tz: string;
};

export type EntryPoint = {
  id: string;
  name: string;
  description: string;
  channel: InboundChannel;
  /**
   * The channel resources this entry point listens on.
   *
   * A list because one journey often serves several numbers — a brand per region,
   * an outlet per city, an old number kept alive through a migration. Binding one
   * number per entry point forced a copy of the whole journey per number, and
   * every subsequent edit became N edits that drift.
   *
   * Routing is still resolved per number (see {@link routingByAddress}): an entry
   * point bound to three numbers is a claim on each of them independently.
   */
  addresses: string[];
  status: "live" | "paused" | "draft";
  /**
   * What happens to an arrival, as a graph. Replaces the ordered rule table that
   * shipped first: routing now runs through the same primitives campaigns use
   * (conditional, API tool call, AI transform, delay), which only make sense in
   * sequence. First-match-wins survives as conditional branch order. See
   * {@link file://./inbound-graph.ts}.
   */
  graph: InboundGraph;
  hours?: BusinessHours;
  /**
   * Position among the *claims* on this address. Lower is evaluated first.
   *
   * Only meaningful against other entry points sharing the address, and only for
   * claims — the fallback's position is not negotiable (see {@link routingFor}).
   * Absent means "after everything that has a number", which is what a freshly
   * created entry point wants.
   */
  routeOrder?: number;
  createdAt: string;
};

/** The number to show when there is room for one. */
export function primaryAddress(ep: { addresses: string[] }): string {
  return ep.addresses[0] ?? "";
}

/* ───────────────────────── Routing across entry points ──────────────────────── */

/**
 * Whether a kind claims specific arrivals or catches whatever is left.
 *
 * This is the distinction the whole routing model rests on, and getting it wrong
 * is how a number ends up with a Click-to-WhatsApp entry point that never fires.
 * `any_message` is not a peer of the other kinds competing on specificity — it is
 * the default branch, and it has to be evaluated last for any of the others to
 * mean anything.
 */
export function isFallbackKind(kind: TriggerKind): boolean {
  return kind === "any_message";
}

/** The kinds an entry point accepts, tolerating the single-kind shape it used to store. */
export function kindsOf(ep: EntryPoint): TriggerKind[] {
  const cfg = ep.graph.nodes.find((n) => n.data.kind === "inboundTrigger")?.data.config;
  const many = cfg?.triggerKinds as TriggerKind[] | undefined;
  if (many?.length) return many;
  const one = cfg?.triggerKind as TriggerKind | undefined;
  return one ? [one] : ["any_message"];
}

/** True when this entry point is its address's catch-all rather than a claim. */
export function isFallback(ep: EntryPoint): boolean {
  return kindsOf(ep).some(isFallbackKind);
}

export type RoutingConflict =
  | { code: "two_fallbacks"; entryPointIds: string[] }
  | { code: "no_fallback" }
  | { code: "shadowed"; entryPointIds: string[] }
  | { code: "overlapping_claims"; entryPointIds: string[]; detail: string };

/**
 * Everything bound to one address, in the order an arrival is tested against it.
 *
 * Claims first in author order, then the single fallback. The conflicts are the
 * point: a number with two catch-alls has no defined answer, and a number with
 * none silently drops anything unclaimed — both are states the product should
 * refuse to let someone create quietly.
 */
export type NumberRouting = {
  address: string;
  channel: InboundChannel;
  claims: EntryPoint[];
  fallback?: EntryPoint;
  conflicts: RoutingConflict[];
};

/**
 * Default ordering for a newly added claim: provenance above content.
 *
 * A referral is asserted by the platform and the customer cannot forge it. Message
 * text is typed by the customer — and, for a tracked link, planted by us. So when
 * an arrival could match on both, the thing we know about how they got here is the
 * better signal than the thing they typed.
 *
 * It is only a default. Order is author-owned, because the opposite is defensible
 * on a number whose keywords carry more intent than its ads do.
 */
const CLAIM_SPECIFICITY: Record<string, number> = {
  ctwa_ad: 0,
  qr_link: 1,
  keyword: 2,
  webhook: 3,
};

export function defaultRouteOrder(kinds: TriggerKind[]): number {
  return Math.min(...kinds.filter((k) => !isFallbackKind(k)).map((k) => CLAIM_SPECIFICITY[k] ?? 9), 9);
}

/** Group every entry point by the address it binds, resolved into routing order. */
export function routingByAddress(eps: EntryPoint[]): NumberRouting[] {
  const byAddress = new Map<string, EntryPoint[]>();
  for (const ep of eps) {
    /* Listed under every number it binds. The same entry point can be a claim on
       one number and shadowed on another, which is why the conflicts below are
       computed per address rather than per entry point. */
    for (const raw of ep.addresses) {
      const key = raw.trim();
      if (!key) continue;
      byAddress.set(key, [...(byAddress.get(key) ?? []), ep]);
    }
  }
  return [...byAddress.entries()]
    .map(([address, group]) => routingFor(group, address))
    .sort((a, b) => a.address.localeCompare(b.address));
}

/** The routing for one address, from the entry points bound to it. */
export function routingFor(group: EntryPoint[], address: string): NumberRouting {
  const fallbacks = group.filter(isFallback);
  const claims = group
    .filter((ep) => !isFallback(ep))
    .sort((a, b) =>
      (a.routeOrder ?? defaultRouteOrder(kindsOf(a))) - (b.routeOrder ?? defaultRouteOrder(kindsOf(b)))
      || a.createdAt.localeCompare(b.createdAt));

  const conflicts: RoutingConflict[] = [];
  if (fallbacks.length > 1)
    conflicts.push({ code: "two_fallbacks", entryPointIds: fallbacks.map((e) => e.id) });
  /* Only worth saying on a number somebody is actually running claims on. An
     address with one plain entry point and no fallback is just that entry point.

     And only on a messaging channel. An unmatched *message* is a person who wrote
     to you and got nothing back; an unmatched *event* is a system posting something
     this endpoint was never asked to care about, which is the design rather than a
     gap — warning about it would train people to ignore the warning. */
  const channel = group[0]?.channel ?? "whatsapp";
  if (channel !== "webhook" && fallbacks.length === 0 && claims.length > 0)
    conflicts.push({ code: "no_fallback" });

  conflicts.push(...overlappingClaims(claims));

  return {
    address,
    channel,
    claims,
    fallback: fallbacks[0],
    conflicts,
  };
}

/* ──────────────────────── Resolving one arrival ─────────────────────────────── */

/**
 * What we know about an arrival at the moment it lands.
 *
 * Deliberately the shape Meta actually gives us: a referral object when the
 * message came through an ad or a post, and the text. Anything richer would be a
 * resolver that cannot be fed by the real webhook.
 */
export type ArrivalSignals = {
  referral?: { sourceType: "ad" | "post"; sourceId: string };
  text?: string;
};

/**
 * Precedence between kinds inside one entry point: provenance, then content.
 *
 * An arrival can match more than one — a Click-to-WhatsApp message whose text
 * also happens to be a keyword — and something has to decide. The referral wins
 * because Meta asserts it and a customer cannot forge it; a keyword is text the
 * customer typed, and on a tracked campaign it is often text we put in their
 * composer ourselves. Deciding by the stronger evidence is the only ordering
 * that stays right as the other signals get weaker.
 *
 * `any_message` is last by definition — it is the kind that claims nothing in
 * particular.
 */
export const KIND_PRECEDENCE: TriggerKind[] = ["ctwa_ad", "qr_link", "keyword", "webhook", "any_message"];

export const KIND_PRECEDENCE_COPY =
  "An arrival matching more than one of these leaves by the first that applies: ad or post, then QR or link, then keyword. A referral is asserted by Meta and cannot be forged; a planted marker is ours and usually survives; a keyword is whatever the customer typed.";

/** The trigger node's config, which is where everything a claim matches on lives. */
export function triggerConfigOf(ep: EntryPoint) {
  return ep.graph.nodes.find((n) => n.data.kind === "inboundTrigger")?.data.config;
}

export type ClaimMatch = {
  kind: TriggerKind;
  /** The trigger output this arrival leaves by. */
  output: string;
};

/**
 * Whether one entry point wants this arrival, and which of its outputs it leaves by.
 *
 * Shared by the resolver and the overlap detector on purpose: two implementations
 * of "does this match" drift, and the second one to drift is always the one that
 * was supposed to warn you about the first.
 */
export function claimMatch(ep: EntryPoint, a: ArrivalSignals): ClaimMatch | undefined {
  const cfg = triggerConfigOf(ep);
  const kinds = kindsOf(ep);

  for (const kind of KIND_PRECEDENCE) {
    if (!kinds.includes(kind)) continue;

    if (kind === "ctwa_ad") {
      if (!a.referral) continue;
      const want = cfg?.triggerAdSource ?? "ad";
      if (want !== "any" && a.referral.sourceType !== want) continue;
      const named = cfg?.triggerAds ?? [];
      if (named.length === 0) return { kind, output: "default" };
      const hit = named.find((x) => x.id.trim() === a.referral!.sourceId);
      if (hit) return { kind, output: `ad:${hit.id}` };
      /* Named ads narrow the claim: a referral from an ad this entry point did
         not name is not its traffic, so fall through to the next kind. */
      continue;
    }

    if (kind === "qr_link") {
      /* A substring, not an exact match: WhatsApp hands the prefill to the
         customer and many of them type ahead of it or after it before sending.
         Requiring the whole string back would fail on the common case. */
      const text = a.text ?? "";
      const hit = (cfg?.triggerLinks ?? []).find((l) => l.token && text.includes(l.token));
      if (hit) return { kind, output: `link:${hit.token}` };
      continue;
    }

    if (kind === "keyword") {
      const text = (a.text ?? "").trim().toLowerCase();
      const hit = (cfg?.triggerKeywords ?? []).find((k) => k.trim().toLowerCase() === text);
      if (hit) return { kind, output: `kw:${hit}` };
      continue;
    }

    if (kind === "any_message") return { kind, output: "default" };
  }
  return undefined;
}

export type ArrivalRouting = {
  entryPoint?: EntryPoint;
  output?: string;
  /** Why this one, in words — for the trace and for explaining a live decision. */
  reason: string;
};

/**
 * Which entry point answers an arrival on this number.
 *
 * Claims in author order, first match wins, then the fallback. The same
 * first-match-wins shape a conditional uses, because an author already reads the
 * Routing list top to bottom and should not have to learn a second rule.
 */
export function resolveArrival(routing: NumberRouting, a: ArrivalSignals): ArrivalRouting {
  for (const ep of routing.claims) {
    if (ep.status !== "live") continue;
    const m = claimMatch(ep, a);
    if (m) {
      return {
        entryPoint: ep,
        output: m.output,
        reason: `Claimed by ${ep.name} on ${TRIGGER_KIND_LABEL[m.kind].toLowerCase()}.`,
      };
    }
  }
  if (routing.fallback && routing.fallback.status === "live") {
    return {
      entryPoint: routing.fallback,
      output: "default",
      reason: `No claim matched, so ${routing.fallback.name} takes it.`,
    };
  }
  return {
    reason: routing.fallback
      ? "The only entry point that would take this is paused."
      : "Nothing on this number claims it and nothing takes what is left, so it goes unanswered.",
  };
}

/**
 * Two claims on one number that can both want the same arrival.
 *
 * Order already decides this, deterministically — but silently, and an author who
 * put the same keyword on two entry points did not intend one of them to be
 * unreachable for it. The dead-edge detector catches this shape inside a graph;
 * this is the same thing one level up, between graphs.
 *
 * Probed with arrivals built from what the claims themselves declare rather than
 * a generated space: every named ad, every keyword, plus a bare referral and a
 * plain message. That is exhaustive for the kinds that exist, and it keeps the
 * explanation concrete — the warning can name the keyword that collides.
 */
function overlappingClaims(claims: EntryPoint[]): RoutingConflict[] {
  if (claims.length < 2) return [];

  const probes: { signals: ArrivalSignals; describe: string }[] = [
    { signals: { referral: { sourceType: "ad", sourceId: "__any__" } }, describe: "an ad referral" },
    { signals: { referral: { sourceType: "post", sourceId: "__any__" } }, describe: "a post referral" },
  ];
  for (const ep of claims) {
    const cfg = triggerConfigOf(ep);
    for (const ad of cfg?.triggerAds ?? [])
      if (ad.id.trim())
        probes.push({
          signals: { referral: { sourceType: "ad", sourceId: ad.id.trim() } },
          describe: `the ad ${ad.label || ad.id}`,
        });
    for (const k of cfg?.triggerKeywords ?? [])
      probes.push({ signals: { text: k }, describe: `the keyword ${k}` });
  }

  const seen = new Set<string>();
  const out: RoutingConflict[] = [];
  for (const probe of probes) {
    const hits = claims.filter((ep) => claimMatch(ep, probe.signals));
    if (hits.length < 2) continue;
    const key = hits.map((e) => e.id).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      code: "overlapping_claims",
      entryPointIds: hits.map((e) => e.id),
      detail: `${hits.map((e) => e.name).join(" and ")} both claim ${probe.describe}. ${hits[0].name} is higher, so it answers every one of them.`,
    });
  }
  return out;
}

export const ROUTING_CONFLICT_COPY: Record<RoutingConflict["code"], { title: string; detail: string }> = {
  two_fallbacks: {
    title: "Two entry points take any inbound message",
    detail: "Only one can. Narrow one of them to the arrivals it actually wants, or pause it — as it stands, which one answers is undefined.",
  },
  no_fallback: {
    title: "Nothing catches unmatched arrivals",
    detail: "Every entry point on this number claims specific arrivals, so a message matching none of them is not answered at all. Add one that takes any inbound message.",
  },
  shadowed: {
    title: "This claim is never reached",
    detail: "An entry point above it already takes these arrivals.",
  },
  overlapping_claims: {
    title: "Two claims want the same arrivals",
    detail: "Order decides, which is deterministic but silent — reorder them, or narrow one so the overlap is deliberate.",
  },
};

// ── Sessions ────────────────────────────────────────────────────────────────

export type SessionTurn = {
  role: "customer" | "agent" | "system";
  text: string;
  /** Offset from session start, in seconds. */
  at: number;
};

export type Session = {
  id: string;
  entryPointId: string;
  /** Unset when `stage === "unrouted"` — nothing ever handled it. */
  agentId?: string;
  channel: InboundChannel;
  contact: { name: string; phone: string };
  /** The Inbox lead this session's contact resolves to. Sessions and leads seed
   *  from one shared contact pool, so this is always a real lead id. */
  leadId: string;

  stage: SessionStage;

  /** Where this sits for whoever is working it — see {@link SessionStatus}. */
  status: SessionStatus;
  /** Exactly one holder at a time — see {@link SessionOwner}. */
  owner: SessionOwner;
  /** Only set when `status === "solved"`. */
  solvedBy?: SolvedBy;
  /**
   * Operator this was assigned to, by an `assignHuman` node or by hand. Present on a
   * session a human touched at all, not only on one they solved.
   */
  assigneeId?: string;

  /** Why it ended — set on `dropped` and `not_handled`. See {@link OutcomeReason}. */
  outcomeReason?: OutcomeReason;
  /** Set when a new trigger replaced this session — the override link. */
  supersededBy?: string;

  /**
   * Whether a person is needed — set at close from {@link disposition}.
   * See {@link EscalationStatus}.
   */
  escalation: EscalationStatus;
  /**
   * How the agent said the conversation ended, from its own closed list
   * (`AgentRecord.dispositions`). Unset when no agent handled the session.
   */
  disposition?: string;


  /** Node ids the arrival traversed, for routing diagnostics. */
  routePath?: string[];

  startedAt: string; // ISO
  /** Unset while `active`. */
  endedAt?: string;
  /** Time to the agent's first substantive response, ms. */
  firstResponseMs?: number;
  durationMs?: number;
  turnCount: number;

  /** Extracted from the handling agent's `postCall` vars (AC-S3). */
  outcome: Record<string, string>;
  handoffReason?: string;
  cost: number;

  /** CTWA attribution — present only when the message carried a Meta referral. */
  referral?: { adId: string; adName: string };

  transcript: SessionTurn[];
};

// ── Seeds ───────────────────────────────────────────────────────────────────

/**
 * Authoring shorthand for seed graphs.
 *
 * Seeds are written as "branch → agent, else agent" because that is how the
 * routing reads, and expanded to real graphs by {@link seedGraph}. Writing the
 * node/edge literals by hand would be unreadable and easy to get subtly wrong;
 * generating them means the seeded graphs are correct by construction.
 */
type SeedBranch = {
  id: string;
  label: string;
  logic?: "AND" | "OR";
  conditions: PresetCondition[];
  agentId: string;
};

type SeedSpec = {
  /** The entry point's channel, stamped on the trigger so its config panel can offer
   *  only the kinds that channel can produce. */
  channel: InboundChannel;
  /** What starts the session. Defaults to any arrival on the channel. */
  triggerKind?: TriggerKind;
  /** `keyword` triggers only. */
  triggerKeywords?: string[];
  /** `webhook` triggers only. */
  triggerToken?: string;
  triggerSecret?: string;
  triggerEventPath?: string;
  triggerEvents?: string[];
  triggerOutputs?: { id: string; name: string; path: string }[];
  /** Evaluated top → bottom, first match wins — the graph form of AC-E2. */
  branches?: SeedBranch[];
  /** Optional pre-routing step, to show the primitive in seeded data. */
  lookupTool?: string;
  /** Handles everything no branch caught. Unset → those arrivals land `unrouted`. */
  elseAgentId?: string;
};

/**
 * Expand a {@link SeedSpec} into a graph. Positions are all origin — the canvas
 * runs ELK on mount (`elkLayout`), same as campaign example graphs, so seeds ship
 * positionless rather than carrying hand-tuned coordinates that would rot.
 */
function seedGraph(spec: SeedSpec): InboundGraph {
  const nodes: InboundGraph["nodes"] = [];
  const edges: InboundGraph["edges"] = [];
  const at = { x: 0, y: 0 };

  const push = (id: string, data: EntryPoint["graph"]["nodes"][number]["data"]) => {
    nodes.push({ id, position: { ...at }, data });
    return id;
  };
  const link = (source: string, target: string, sourceHandle?: string) => {
    edges.push({ id: `e_${source}__${sourceHandle ?? "out"}`, source, target, sourceHandle });
  };

  let cursor = push("n_trigger", {
    kind: "inboundTrigger",
    title: "Inbound arrival",
    serial: "trigger_1",
    locked: true,
    config: {
      channel: spec.channel,
      triggerKind: spec.triggerKind ?? (spec.channel === "webhook" ? "webhook" : "any_message"),
      triggerKeywords: spec.triggerKeywords,
      triggerToken: spec.triggerToken,
      triggerSecret: spec.triggerSecret,
      triggerEventPath: spec.triggerEventPath,
      triggerEvents: spec.triggerEvents,
      triggerOutputs: spec.triggerOutputs,
    },
  });
  // A handle names an output port on the node it LEAVES, so it has to travel with
  // the cursor rather than being attached at the point the next node is created.
  let cursorHandle: string | undefined;

  if (spec.lookupTool) {
    const api = push("n_lookup", {
      kind: "apiToolCall",
      title: "Customer lookup",
      serial: "api_1",
      config: { apiTool: spec.lookupTool },
      outputs: [
        { id: "success", label: "Success", kind: "outcome" },
        { id: "timeout", label: "Timeout", kind: "outcome" },
        { id: "failure", label: "Failure", kind: "outcome" },
      ],
    });
    link(cursor, api, cursorHandle);
    cursor = api;
    cursorHandle = "success";
  }

  const agent = (id: string, agentId: string, title: string) =>
    push(id, {
      kind: "agentSession",
      title,
      serial: id.replace("n_agent_", "agent_"),
      config: { agentId },
    });

  if (spec.branches?.length) {
    const cond = push("n_route", {
      kind: "conditional",
      title: "Route the arrival",
      serial: "cond_1",
      config: {
        branches: spec.branches.map((b) => ({
          id: b.id,
          label: b.label,
          logic: b.logic ?? "AND",
          conditions: b.conditions,
        })),
      },
      outputs: [
        ...spec.branches.map((b) => ({ id: b.id, label: b.label, kind: "branch" as const })),
        { id: "default", label: "Everything else", kind: "default" as const },
      ],
    });
    link(cursor, cond, cursorHandle);
    spec.branches.forEach((b, i) => {
      link(cond, agent(`n_agent_${i + 1}`, b.agentId, b.label), b.id);
    });
    if (spec.elseAgentId) {
      link(cond, agent("n_agent_else", spec.elseAgentId, "Everything else"), "default");
    } else {
      // Deliberately left with nowhere to go — the arrival lands `unrouted` and
      // the gap shows up in the funnel instead of being silently absorbed.
      link(cond, push("n_unrouted", { kind: "end", title: "Unrouted", locked: true }), "default");
    }
  } else if (spec.elseAgentId) {
    link(cursor, agent("n_agent_1", spec.elseAgentId, "All traffic"), cursorHandle);
  }

  return { nodes, edges };
}

/**
 * Four entry points covering the three v1 use cases. Note that use cases 1 and 2
 * (CTWA and service) are TWO BRANCHES ON ONE ENTRY POINT, not two entry points —
 * they arrive on the same WhatsApp number and are separated only by whether the
 * message carried an ad referral.
 */
export const SEED_ENTRY_POINTS: EntryPoint[] = [
  {
    id: "ep_wa_main",
    name: "WhatsApp · Main line",
    description:
      "The public WhatsApp number. Service enquiries — ad arrivals have their own entry point.",
    channel: "whatsapp",
    /* Three numbers, one journey. The regional lines were opened for local
       marketing and answer exactly as the main line does — which is the case that
       used to force three copies of the same graph. */
    addresses: ["+91 80 4718 2200", "+91 22 6181 4400", "+91 44 4299 7100"],
    status: "live",
    createdAt: "12 Jun 2026",
    /* One trigger, one agent. The ad traffic this number used to branch on is its
       own entry point now (`ep_wa_ctwa`, below) — which is where that distinction
       belongs once the graph stops branching: the trigger discriminates, not a
       condition halfway down a path. */
    graph: seedGraph({ channel: "whatsapp", elseAgentId: "a_support" }),
  },
  /**
   * The other half of the main line, split out rather than branched to.
   *
   * Same number, different trigger: a Click-to-WhatsApp arrival carries a Meta
   * referral and the rest do not, so the two use cases separate at the trigger
   * instead of one node further in. The arrangement is the first cut's answer to
   * every "but I need to route on X" — X is a trigger, and two entry points on one
   * number is the shape that expresses it.
   */
  {
    id: "ep_wa_ctwa",
    name: "WhatsApp · Ad enquiries",
    description: "Arrivals from Click-to-WhatsApp ads on the main number.",
    channel: "whatsapp",
    addresses: ["+91 80 4718 2200"],
    status: "live",
    createdAt: "12 Jun 2026",
    /* A claim, ordered above the main line's fallback. Without the order these two
       entry points shared a number with nothing to resolve them — which is exactly
       the failure this seed is here to show working. */
    routeOrder: 0,
    graph: seedGraph({
      channel: "whatsapp",
      triggerKind: "ctwa_ad",
      elseAgentId: "a_concierge",
    }),
  },
  {
    id: "ep_voice_support",
    name: "Voice · Support line",
    description: "Inbound calls to the published support number.",
    channel: "voice",
    addresses: ["+91 80 4718 2100"],
    status: "live",
    createdAt: "28 Jun 2026",
    hours: { start: "09:00", end: "21:00", days: [1, 2, 3, 4, 5, 6], tz: "Asia/Kolkata" },
    // Deliberately no `elseAgentId`: out-of-hours calls land `unrouted` so the
    // routing gap is visible in analytics rather than silently absorbed.
    graph: seedGraph({
      channel: "voice",
      branches: [
        {
          id: "b_hours",
          label: "Within business hours",
          conditions: [{ variable: "trigger.within_hours", op: "equals", value: "true" }],
          agentId: "a_voice_support",
        },
      ],
    }),
  },
  // The call-back line printed on reactivation comms. It routes to `a_voice_react`
  // — the same agent that *places* the outbound reactivation calls. That overlap is
  // the point: one agent, two directions, and the only surface that shows both
  // halves together is Analytics → Agent.
  {
    id: "ep_voice_sales",
    name: "Voice · Sales call-back",
    description: "Return calls from customers who received a reactivation call.",
    channel: "voice",
    addresses: ["+91 80 4718 2150"],
    status: "live",
    createdAt: "19 Jul 2026",
    hours: { start: "10:00", end: "19:00", days: [1, 2, 3, 4, 5], tz: "Asia/Kolkata" },
    // Every caller reaches the same agent, so there is nothing to branch on —
    // but the CRM lookup runs first, which is the whole reason routing moved to a
    // graph: it is a *step*, not a condition.
    graph: seedGraph({
      channel: "voice", lookupTool: "customer_context", elseAgentId: "a_voice_react" }),
  },
  {
    id: "ep_wa_kyc",
    name: "WhatsApp · KYC line",
    description: "Dedicated number printed on KYC reminder comms.",
    channel: "whatsapp",
    addresses: ["+91 80 4718 2277"],
    status: "paused",
    createdAt: "2 Aug 2026",
    /* A dedicated number carries one kind of traffic, so there is nothing to route —
       but it is printed on KYC comms, so the arrivals worth answering are the ones
       quoting a keyword from them. */
    graph: seedGraph({
      channel: "whatsapp",
      triggerKind: "keyword",
      triggerKeywords: ["KYC", "VERIFY", "DOCUMENT"],
      elseAgentId: "a_kyc",
    }),
  },
  {
    id: "ep_webhook_orders",
    name: "Webhook · Order events",
    description:
      "Events posted by the order system. A failed payment or a stalled delivery starts a session on the customer's number.",
    /* Not a messaging channel: the arrival is an event, and the conversation it opens
       runs on whatever number the payload carries. Everything after the trigger is
       identical to the other entry points, which is why it shares the union. */
    channel: "webhook",
    addresses: ["https://api.picommerce.paytm.com/inbound/v1/hooks/k3f9qx2m7wd4h1npz8ab"],
    status: "live",
    createdAt: "18 Sept 2026",
    /* Branches on the event name rather than on anything channel-shaped — there is no
       referral and no message text to test. */
    graph: seedGraph({
      channel: "webhook",
      /* The order system posts `{"type": "...", "order": {...}}`, so the event name is
         read from `type` and the two fields a graph actually branches on are lifted
         out of the body by path. */
      triggerToken: "k3f9qx2m7wd4h1npz8ab",
      triggerSecret: "whsec_8Hc2pQmR4vK9nX1tLzA7dYwE3sB6uJfG",
      triggerEventPath: "type",
      triggerEvents: ["payment.failed", "delivery.stalled"],
      triggerOutputs: [
        { id: "o_order", name: "order_id", path: "order.id" },
        { id: "o_value", name: "order_value", path: "order.total" },
      ],
      branches: [
        {
          id: "b_payment_failed",
          label: "Payment failed",
          conditions: [
            { variable: "trigger.event", op: "equals", value: "payment.failed" },
          ],
          agentId: "a_support",
        },
      ],
      elseAgentId: "a_concierge",
    }),
  },
];

const AD_POOL = [
  { adId: "ad_5512", adName: "Gold Loyalty · Diwali" },
  { adId: "ad_5518", adName: "Zero brokerage · Retarget" },
  { adId: "ad_5603", adName: "New user · Cashback" },
];


/** FNV-1a seeded PRNG — same shape as `analytics-leads.rng`. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++)
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967295;
  };
}

function pick<T>(rand: () => number, xs: T[]): T {
  return xs[Math.floor(rand() * xs.length)];
}

/**
 * Stage distribution for an arrival that *did* reach an agent. Weighted so the
 * seeded data shows a believable funnel: most sessions engage, containment sits
 * around 60% of engaged.
 *
 * `unrouted` is deliberately absent. It is not a stage anyone draws — it is what
 * is left when the graph has nowhere to send an arrival, so `generateSessions`
 * derives it from the resolver instead. That is what makes rewiring an entry
 * point actually move the funnel.
 */
function drawRoutedStage(rand: () => number): SessionStage {
  const r = rand();
  if (r < 0.04) return "active";
  /* Absorbed into `abandoned`: an agent that opened and got no reply and one the
     customer dropped mid-way are the same outcome, and turn count tells them
     apart for anyone who needs to know which. */
  if (r < 0.16) return "dropped";
  const rest = (r - 0.16) / 0.84;
  if (rest < 0.58) return "resolved";
  if (rest < 0.77) return "handed_off";
  /* Everything that ended without a conclusion is one outcome now: the customer
     going quiet and the window closing are the same event at two moments, and a
     superseded session is a conversation that ended without one too. The reason
     keeps them apart. */
  return "dropped";
}

/** Coherent conversation threads — customer turn i is answered by agent turn i. */
const TRANSCRIPT_TOPICS: { customer: string[]; agent: string[] }[] = [
  {
    customer: [
      "My order hasn't arrived yet, it's been a week.",
      "It still says out for delivery though.",
      "Okay — can you make sure it actually arrives today?",
    ],
    agent: [
      "Let me pull up that order — one moment.",
      "I can see it left the hub this morning and is out for delivery.",
      "I've flagged it as priority and added an SMS alert for you.",
    ],
  },
  {
    customer: [
      "I was charged twice for the same payment.",
      "Yes, both on the 4th, same amount.",
      "How long will the refund take?",
    ],
    agent: [
      "I'm sorry about that. Can you confirm the date and amount?",
      "I've checked the payment log and I can confirm the duplicate charge.",
      "The reversal is initiated — it lands in 3-5 working days.",
    ],
  },
  {
    customer: [
      "How do I finish my KYC?",
      "I did the PAN step already.",
      "Can I do the video part now?",
    ],
    agent: [
      "Happy to help — let me check where you are in the process.",
      "You're on step 2 of 3. Aadhaar e-KYC is done, video KYC is pending.",
      "Yes — I've sent you the video KYC link, it's open for 24 hours.",
    ],
  },
  {
    customer: [
      "I saw an ad about zero brokerage — how does that work?",
      "Is there a catch after the 30 days?",
      "Alright, how do I activate it?",
    ],
    agent: [
      "That offer gives you zero brokerage for 30 days from activation.",
      "No catch — after 30 days standard pricing resumes, and you can cancel anytime.",
      "I've applied it to your account; it's active from today.",
    ],
  },
  {
    customer: [
      "I can't log in, it keeps saying invalid OTP.",
      "Yes, it's the number ending 0518.",
      "Got it now, thanks.",
    ],
    agent: [
      "Let me check the number registered on your account.",
      "I can see three OTP attempts blocked by a carrier delay. I've reset the limit.",
      "Great — you should be able to log in normally now.",
    ],
  },
];

function buildTranscript(
  rand: () => number,
  ep: EntryPoint,
  agent: AgentRecord | undefined,
  stage: SessionStage,
  turnCount: number,
): SessionTurn[] {
  const turns: SessionTurn[] = [];
  if (stage === "not_handled") {
    turns.push({
      role: "system",
      at: 0,
      text:
        ep.channel === "voice"
          ? "Call received outside business hours. The routing graph has no path to an agent from here — call was not answered."
          : "Message received. The routing graph has no path to an agent from here.",
    });
    return turns;
  }

  const opener =
    ep.channel === "voice"
      ? `Thanks for calling. You're speaking with ${agent?.name ?? "the assistant"}. How can I help?`
      : `Hi! You're chatting with ${agent?.name ?? "our assistant"}. How can I help today?`;
  turns.push({ role: "agent", at: 0, text: opener });

  if (turnCount <= 1) return turns;

  // One topic per session, walked in order. Drawing each line independently from
  // a flat pool produced transcripts where the customer asked about KYC and the
  // agent answered about brokerage — unreadable as a demo of a real conversation.
  const topic = pick(rand, TRANSCRIPT_TOPICS);

  let t = 8 + Math.floor(rand() * 20);
  for (let i = 0; i < Math.max(1, turnCount - 1); i++) {
    const isCustomer = i % 2 === 0;
    const lines = isCustomer ? topic.customer : topic.agent;
    turns.push({
      role: isCustomer ? "customer" : "agent",
      at: t,
      // Walk the thread; if the session runs longer than the script, hold on the
      // last line rather than looping back to the opening question.
      text: lines[Math.min(Math.floor(i / 2), lines.length - 1)],
    });
    t += 10 + Math.floor(rand() * 40);
  }

  if (stage === "resolved")
    turns.push({ role: "agent", at: t, text: "Glad that's sorted. Anything else I can help with?" });
  if (stage === "handed_off")
    turns.push({ role: "system", at: t, text: "Escalated to a human agent." });
  if (stage === "dropped")
    turns.push({ role: "system", at: t, text: "Customer stopped responding." });
  if (stage === "dropped" && turnCount > 6)
    turns.push({
      role: "system",
      at: t,
      text: "A new trigger arrived — this session closed and a new one opened.",
    });
  if (false)
    turns.push({
      role: "system",
      at: t,
      text:
        ep.channel === "whatsapp"
          ? "24-hour session window closed."
          : "Call ended on silence timeout.",
    });

  return turns;
}

/**
 * Resolve who handles an arrival by walking the entry point's graph. `traits` is
 * what the arriving contact carries — for seeded data we draw it, at runtime it
 * comes off the webhook.
 */
export function routeSession(ep: EntryPoint, traits: ArrivalTraits) {
  return resolveViaGraph(ep.graph, traits);
}

/** Deterministic session set for an entry point. Same id → same sessions. */
export function generateSessions(ep: EntryPoint, total = 240): Session[] {
  const rand = rng(`sessions_${ep.id}`);
  const out: Session[] = [];

  for (let i = 0; i < total; i++) {
    const hasReferral = ep.channel === "whatsapp" && rand() < 0.42;
    // WhatsApp arrives round the clock; calls skew to business hours. This is the
    // trait that produces out-of-hours `unrouted` volume on a voice line whose
    // graph has no path for it.
    const withinHours = ep.channel === "voice" ? rand() >= 0.14 : true;

    const routed = routeSession(ep, { hasReferral, withinHours });
    /* Checked before the graph, which is the point: an opted-out contact is
       stopped whatever the routing says, and the stage records that it was a
       compliance stop rather than a graph that had nowhere to send them. */
    const optedOut = ep.channel === "whatsapp" && rand() < 0.02;
    const stage: SessionStage =
      optedOut || !routed.agentId ? "not_handled" : drawRoutedStage(rand);
    /* A small share of dropped sessions were replaced rather than left to the
       clock — that is the override rate. */
    const superseded = stage === "dropped" && rand() < 0.06;
    const outcomeReason: OutcomeReason | undefined =
      stage === "not_handled" ? (optedOut ? "opted_out" : "not_routed")
      : stage === "dropped" ? (superseded ? "superseded" : "window_closed")
      : undefined;
    const agent = resolveAgent(routed.agentId);

    // Contact comes from the shared pool so this session belongs to a real lead:
    // the Inbox joins on `contact.phone`, and `leadId` is the same link by id.
    const poolIndex = Math.floor(rand() * POOL_SIZE);
    const contact = contactAt(poolIndex);

    /* Never reached an agent at all — no turns, no duration. A superseded
       session did have a conversation before it was replaced. */
    const neverRan = stage === "not_handled";
    const engaged = !neverRan;
    const turnCount = neverRan ? 0 : 3 + Math.floor(rand() * 9);

    const durationSec = neverRan ? 0 : 45 + Math.floor(rand() * 420);

    /* Spread over a quarter, not a fortnight, and never into the future.
       At 14 days every lead held a session from today, so the Inbox rail — whose only
       sort key is last interaction — showed "today" against 48 of 50 rows and became
       unscannable. Clamping to the past matters as much as the width: `setHours` on
       today's date produced evening timestamps that had not happened yet, which read
       as "today" no matter how wide the window. */
    const started = new Date();
    started.setDate(started.getDate() - Math.floor(rand() * 90));
    started.setHours(9 + Math.floor(rand() * 12), Math.floor(rand() * 59), 0, 0);
    if (started.getTime() > Date.now()) started.setTime(Date.now() - 60_000 * (5 + rand() * 300));

    // Outcome vars come from the handling agent's postCall schema — no parallel
    // schema for inbound (PRD §4.4). Only engaged, ended sessions get them.
    const outcome: Record<string, string> = {};
    if (agent && engaged && stage !== "active") {
      for (const pc of agent.postCall) {
        outcome[pc.name] = sampleOutcome(rand, pc.name, stage);
      }
    }

    /* Status follows from stage. Pending means waiting on *the customer*, which is
       exactly what `no_response` is — the agent spoke and nobody replied. A handed-off
       session is Open, not Pending: a person owns it and the ball is with us, and
       filing it as Pending would empty every operator's open count.

       `opted_out` and `overridden` both close without a resolution, so they land
       in Closed with the rest. Neither is Open: an operator cannot act on either,
       and leaving them Open would put work in a queue that nobody can clear. */
    /* "Waiting on customer" is an in-flight state, not a terminal one — we
       replied and they have not yet. It used to hang off `no_response`, which is
       an *ended* session, so it described a wait that was already over. */
    const waiting = stage === "active" && rand() < 0.45;
    const status: SessionStatus =
      stage === "resolved" ? "solved"
      : stage === "dropped" || stage === "not_handled" ? "expired"
      : waiting ? "pending"
      : "open";

    /* Bot vs operator is drawn rather than derived: an agent can resolve a session
       outright, or hand off to a human who then resolves it, and both land on
       `resolved`. The split is the whole point of the metric, so it is modelled. */
    const solvedBy: SolvedBy | undefined =
      status === "solved" ? (rand() < 0.31 ? "operator" : "bot") : undefined;

    /* One owner, and which one follows from how far the session got: nothing routed
       it (rule), an agent picked it up, or it reached a person. A solved-by-operator
       session was last held by that operator; a solved-by-bot one by the agent. */
    const owner: SessionOwner =
      stage === "not_handled" ? "rule"
      : stage === "handed_off" || solvedBy === "operator" ? "human"
      : "agent";


    /* Assigned whenever a human was involved at all: handed off, solved by one, or —
       for a share of the sessions now waiting on the customer — the operator who sent
       the last message and is still holding it. Without that last case no operator
       ever carries Pending work, which is half of what a load column is for. */
    /* A handoff is not automatically picked up, and that gap is the whole point of
       the escalation axis: an escalated session nobody has claimed is exactly
       "needs a person". Assigning every handoff on creation made that state
       unreachable and left the queue with nothing to sort to the top. */
    const pickedUp = stage === "handed_off" && rand() < 0.55;
    const humanTouched =
      pickedUp || solvedBy === "operator" || (status === "pending" && rand() < 0.45);
    const assigneeId = humanTouched
      ? OPERATORS[Math.floor(rand() * OPERATORS.length)].id
      : undefined;

    /* The disposition, and the escalation mark that follows from it.

       Drawn from the handling agent's own closed list, then read back: the
       entry point names which of that agent's dispositions mean a person is
       needed, and the mark is simply whether this one is on that list. No
       separate decision, which is the point — one answer at close, and
       everything downstream reads it rather than deciding again. */
    const agentRec = routed.agentId ? resolveAgent(routed.agentId) : undefined;
    const disposition =
      agentRec?.dispositions.length && stage !== "not_handled"
        ? (stage === "handed_off"
            ? pick(rand, agentRec.dispositions.filter((d) => ESCALATING_DISPOSITION.test(d)))
              ?? pick(rand, agentRec.dispositions)
            : pick(rand, agentRec.dispositions.filter((d) => !ESCALATING_DISPOSITION.test(d)))
              ?? pick(rand, agentRec.dispositions))
        : undefined;
    /* Durable across the lifecycle, which stage alone is not. A session a person
       picked up and resolved reads `resolved` + `solvedBy: operator` — derive
       escalation from stage only and the record forgets it was ever escalated,
       which is precisely the thing "how much of what we handed over got finished"
       needs to know. */
    const escalation: EscalationStatus =
      solvedBy === "operator" ? "handled"
      : stage !== "handed_off" ? "none"
      : assigneeId ? "handled"
      : "needed";


    out.push({
      // Full entry-point id, not a 4-char slice: `ep_voice_support` and
      // `ep_voice_sales` both sliced to "voic", so their sessions collided on id.
      // The Inbox keys a conversation thread by session id, so a collision there
      // merges two different people's sessions into one thread.
      id: `S-${ep.id.replace(/^ep_/, "")}-${String(1000 + i)}`,
      entryPointId: ep.id,
      agentId: routed.agentId,
      channel: ep.channel,
      contact: { name: contact.name, phone: contact.phone },
      leadId: leadIdForPoolIndex(poolIndex),
      stage,
      status,
      owner,
      solvedBy,
      assigneeId,
      escalation,
      disposition,
      outcomeReason,
      /* The session that replaced this one. Not modelled as a real link in the
         seed — there is no second session to point at — but the field is what
         the override rate and the Inbox trail read in the product. */
      supersededBy: outcomeReason === "superseded" ? "(next session)" : undefined,
      routePath: routed.path,
      startedAt: started.toISOString(),
      endedAt: isInFlight(stage)
        ? undefined
        : new Date(started.getTime() + durationSec * 1000).toISOString(),
      firstResponseMs: turnCount === 0 ? undefined : 800 + Math.floor(rand() * 5200),
      durationMs: isInFlight(stage) ? undefined : durationSec * 1000,
      turnCount,
      outcome,
      handoffReason: stage === "handed_off" ? pick(rand, [...HANDOFF_REASONS]) : undefined,
      cost: +(
        (ep.channel === "voice" ? 0.011 : 0.0032) * Math.max(durationSec, 20)
      ).toFixed(3),
      referral: hasReferral ? pick(rand, AD_POOL) : undefined,
      transcript: buildTranscript(rand, ep, agent, stage, turnCount),
    });
  }

  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Plausible value for a postCall var, biased by how the session ended. */
/**
 * Draw a plausible value for one post-call variable.
 *
 * Variables split into two kinds, and conflating them is what makes mock data
 * read as broken:
 *
 *  - **Stage-derived** (`resolution_status`, `resolved_on_call`, `escalation_reason`,
 *    sentiment, CSAT). These restate the session outcome, so they must be *computed*
 *    from `stage`. Sampling them independently produces contradictions like a
 *    Resolved session reporting `resolved_on_call: no`.
 *  - **Independent** (issue category, KYC step, availability). These are free to draw.
 *
 * Matching is on name *shape* rather than exact strings so a new agent's schema
 * doesn't silently fall through to a meaningless yes/no.
 */
function sampleOutcome(rand: () => number, name: string, stage: SessionStage): string {
  const n = name.toLowerCase();
  const resolved = stage === "resolved";
  const escalated = stage === "handed_off";

  // ── Stage-derived ────────────────────────────────────────────────────────
  if (n.includes("resolution_status"))
    return resolved ? "resolved" : escalated ? "escalated" : "pending";
  if (n.includes("resolved") || n.includes("issue_fixed"))
    return resolved ? "yes" : "no";
  if (n.includes("escalation") || n.includes("handoff_reason"))
    return escalated ? pick(rand, ESCALATION_REASONS) : "none";
  if (n.includes("csat") || n.includes("satisfaction"))
    return String(resolved ? 4 + Math.floor(rand() * 2) : escalated ? 3 : 1 + Math.floor(rand() * 2));
  if (n.includes("sentiment"))
    return resolved ? "positive" : stage === "dropped" ? "negative" : "neutral";

  // ── Independent ──────────────────────────────────────────────────────────
  if (n.includes("issue_category") || n.includes("intent_category"))
    return pick(rand, ["delivery", "payment", "refund", "account", "other"]);
  if (n.includes("refund_initiated")) return rand() < 0.3 ? "yes" : "no";
  if (n.includes("refund_offered")) return rand() < 0.25 ? `₹${500 + Math.floor(rand() * 1500)}` : "none";
  if (n.includes("kyc_stage")) return pick(rand, ["PAN verification", "Aadhaar e-KYC", "Video KYC"]);
  if (n.includes("repeat_contact")) return rand() < 0.22 ? "yes" : "no";
  if (n.includes("lead_status")) return pick(rand, ["interested", "follow-up", "not interested"]);
  if (n.includes("engagement_intent"))
    return pick(rand, ["not interested", "technical issue", "using a different app"]);
  if (n.includes("availability")) return pick(rand, ["available", "busy", "requested a callback"]);
  if (n.includes("competitor")) return rand() < 0.3 ? pick(rand, ["PhonePe", "GPay", "Cred"]) : "none";
  if (n.includes("card_added")) return rand() < 0.45 ? "added" : "not added";
  if (n.includes("charges") || n.includes("feedback"))
    return pick(rand, ["no comment", "found charges high", "happy with pricing"]);
  return pick(rand, ["yes", "no"]);
}

const ESCALATION_REASONS = [
  "caller requested",
  "policy limit",
  "agent could not resolve",
];

// ── Arrival type (channel × trigger) ────────────────────────────────────────

/**
 * How an arrival reached us. This is the analysis axis for inbound.
 *
 * Entry points are *configuration*: which number is bound to which graph. Two of
 * them differ because someone provisioned two DIDs, not because the demand
 * differs, so comparing entry points compares arbitrary setup choices and the
 * comparison stops meaning anything the moment a number is repointed. Channel ×
 * trigger is intrinsic to the arrival itself and survives any amount of
 * rewiring — and it is exactly the three inbound use cases the product exists
 * to serve.
 *
 * Ad and service arrive on the *same* WhatsApp number, so the split cannot come
 * from the entry point: only the Meta referral payload tells them apart.
 */
export type ArrivalType = "wa_ad" | "wa_service" | "voice_call";

export const ARRIVAL_TYPES: ArrivalType[] = ["wa_ad", "wa_service", "voice_call"];

export const ARRIVAL_LABEL: Record<ArrivalType, string> = {
  wa_ad: "WhatsApp · CTWA ad",
  wa_service: "WhatsApp · Service",
  voice_call: "Voice · Inbound call",
};

export const ARRIVAL_INFO: Record<ArrivalType, string> = {
  wa_ad: "Carried a Meta ad referral — demand you paid for.",
  wa_service: "Same number, no referral — unpaid service demand.",
  voice_call: "Dialled an inbound voice number.",
};

/** Derived, never stored — the referral payload is the only thing that separates
 *  a paid arrival from an organic one. */
export function arrivalTypeOf(s: Session): ArrivalType {
  if (s.channel === "voice") return "voice_call";
  return s.referral ? "wa_ad" : "wa_service";
}

// ── Metrics ─────────────────────────────────────────────────────────────────

export type SessionMetrics = {
  received: number;
  routed: number;
  engaged: number;
  active: number;
  resolved: number;
  handedOff: number;
  /** A conversation happened and ended without a conclusion. */
  dropped: number;
  /** No conversation happened at all. */
  notHandled: number;
  /** No entry point claimed it — a configuration mistake. */
  notRouted: number;
  /** Stopped before the agent, because the customer had opted out. */
  optedOut: number;
  /** Cut short because a new trigger replaced it — a reason under `dropped`. */
  superseded: number;
  /** Active plus handed off — engaged conversations with no outcome yet. */
  inFlight: number;
  /** Ever marked for a person, whether or not one has finished it. */
  escalated: number;
  /** Resolved with no person involved — the containment numerator. */
  resolvedByAgent: number;
  /** Resolved, but a person finished it. */
  resolvedByPerson: number;
  /** Engaged sessions that have ended — the denominator for containment. */
  engagedEnded: number;

  routingRate: number;
  engagementRate: number;
  containmentRate: number;
  handoffRate: number;
  dropRate: number;
  overrideRate: number;

  medianFirstResponseMs: number;
  medianHandleMs: number;
  medianTurns: number;
  totalCost: number;
  costPerSession: number;
};

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const rate = (n: number, d: number) => (d === 0 ? 0 : n / d);

/**
 * The whole inbound metric spine. Every rate derives from one identity, so the
 * funnel always balances:
 *   received = notHandled + active + handedOff + resolved + dropped
 */
/* ──────────────────────────── Inbox metrics ─────────────────────────────────── */

/**
 * What a team inbox is measured on — a different question from
 * {@link computeSessionMetrics}, which measures routing.
 *
 * Status counts, who resolved, and per-operator load. The split that matters most is
 * bot versus operator: a solved count on its own stays healthy while the automation
 * quietly stops working and people mop up behind it.
 */
export type InboxMetrics = {
  open: number;
  pending: number;
  expired: number;
  solved: number;
  solvedByBot: number;
  solvedByOperator: number;
  /** Nobody ever picked these up — unrouted, or routed and never answered. */
  missed: number;
  /** Solved ÷ everything that reached a person or an agent. */
  resolutionRate: number;
  /** Solved by the bot ÷ solved at all. The automation's actual contribution. */
  botShare: number;
  operators: OperatorRow[];
  /** One point per day, for the status-over-time chart. */
  daily: { day: string; open: number; pending: number; expired: number; solved: number }[];
};

export type OperatorRow = {
  id: string;
  name: string;
  email: string;
  openNow: number;
  pendingNow: number;
  assigned: number;
  solved: number;
  /** Median handle time across the ones they solved. */
  medianHandleMs: number;
};

export function computeInboxMetrics(sessions: Session[]): InboxMetrics {
  const byStatus = (st: SessionStatus) => sessions.filter((s) => s.status === st).length;
  const open = byStatus("open"), pending = byStatus("pending");
  const expired = byStatus("expired"), solved = byStatus("solved");
  const solvedByBot = sessions.filter((s) => s.solvedBy === "bot").length;
  const solvedByOperator = sessions.filter((s) => s.solvedBy === "operator").length;

  /* Missed is a stage question, not a status one: a session nobody answered is Open
     like any other, and the inbox needs to tell those apart from live work. */
  const missed = sessions.filter((s) => s.stage === "not_handled").length;

  const reached = sessions.length - missed;


  const operators: OperatorRow[] = OPERATORS.map((o) => {
    const mine = sessions.filter((s) => s.assigneeId === o.id);
    const theirSolved = mine.filter((s) => s.status === "solved");
    return {
      id: o.id, name: o.name, email: o.email,
      openNow: mine.filter((s) => s.status === "open").length,
      pendingNow: mine.filter((s) => s.status === "pending").length,
      assigned: mine.length,
      solved: theirSolved.length,
      medianHandleMs: median(theirSolved.map((s) => s.durationMs ?? 0).filter(Boolean)),
    };
  }).sort((a, b) => b.assigned - a.assigned);

  const dayMap = new Map<string, { open: number; pending: number; expired: number; solved: number }>();
  for (const s of sessions) {
    const day = s.startedAt.slice(0, 10);
    const row = dayMap.get(day) ?? { open: 0, pending: 0, expired: 0, solved: 0 };
    row[s.status] += 1;
    dayMap.set(day, row);
  }

  return {
    open, pending, expired, solved, solvedByBot, solvedByOperator, missed,
    resolutionRate: rate(solved, reached),
    botShare: rate(solvedByBot, solved),
    operators,
    daily: [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, ...v })),
  };
}

export function computeSessionMetrics(sessions: Session[]): SessionMetrics {
  const count = (s: SessionStage) => sessions.filter((x) => x.stage === s).length;

  const reason = (r: OutcomeReason) =>
    sessions.filter((x) => x.outcomeReason === r).length;

  const received = sessions.length;
  const notHandled = count("not_handled");
  const dropped = count("dropped");
  /* The causes. Each is still countable even though none occupies a value on the
     outcome axis any more — one is a configuration mistake, one a compliance
     figure, one the override rate, one the ordinary case. */
  const notRouted = reason("not_routed");
  const optedOut = reason("opted_out");
  const superseded = reason("superseded");
  const active = count("active");
  const resolved = count("resolved");
  const handedOff = count("handed_off");

  /* The identity, and it is finally simple:
       routed       = received − notHandled    (notHandled never entered)
       inFlight     = active + handedOff       (no outcome yet)
       engagedEnded = resolved + dropped       (the two real outcomes)

     Three outcomes, three places to be, and no cause straddling two pools —
     which the previous nine-value model did, with `superseded` counted as ended
     while sharing an outcome with two things that never started. */
  const routed = received - notHandled;
  const engaged = routed;
  const inFlight = active + handedOff;
  const engagedEnded = resolved + dropped;

  /* Escalation rather than stage, because stage loses it the moment a person
     resolves the conversation. */
  const escalated = sessions.filter((x) => x.escalation !== "none").length;
  /* Split because they are different claims about the automation. A resolution a
     person finished is still a resolution for the customer and still not
     containment, and one bar covering both hides exactly that. */
  const resolvedByAgent = sessions.filter((x) => x.stage === "resolved" && x.solvedBy !== "operator").length;
  const resolvedByPerson = resolved - resolvedByAgent;

  const ended = sessions.filter(
    (s) => !isInFlight(s.stage) && s.stage !== "not_handled",
  );
  const totalCost = sessions.reduce((a, s) => a + s.cost, 0);

  return {
    received,
    routed,
    engaged,
    active,
    resolved,
    handedOff,
    dropped,
    notHandled,
    notRouted,
    optedOut,
    superseded,
    inFlight,
    escalated,
    resolvedByAgent,
    resolvedByPerson,
    engagedEnded,

    routingRate: rate(routed, received),
    engagementRate: rate(engaged, routed),
    /* Resolved with no person involved — not every resolution. Once an operator
       can finish a handed-off conversation, a raw `resolved` count includes work
       the automation did not contain. */
    containmentRate: rate(resolvedByAgent, engagedEnded),
    /* Over everything that engaged, ended or not, because a handoff still sitting
       with a person is a handoff. */
    handoffRate: rate(escalated, engagedEnded + handedOff),
    dropRate: rate(dropped, engagedEnded),
    overrideRate: rate(superseded, engagedEnded),

    medianFirstResponseMs: median(
      ended.map((s) => s.firstResponseMs ?? 0).filter(Boolean),
    ),
    medianHandleMs: median(ended.map((s) => s.durationMs ?? 0).filter(Boolean)),
    medianTurns: median(ended.map((s) => s.turnCount).filter(Boolean)),
    totalCost,
    costPerSession: rate(totalCost, received),
  };
}

// ── Reactive store ──────────────────────────────────────────────────────────
// Same pattern as `agent-data` / `template-store`: module-level `current` +
// listeners, so an edited entry point is live everywhere without a reload.

let entryPoints: EntryPoint[] = [...SEED_ENTRY_POINTS];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useEntryPoints(): EntryPoint[] {
  return useSyncExternalStore(subscribe, () => entryPoints, () => entryPoints);
}

export function useEntryPoint(id?: string): EntryPoint | undefined {
  return useEntryPoints().find((e) => e.id === id);
}

export function getEntryPoints(): EntryPoint[] {
  return entryPoints;
}

export function saveEntryPoint(ep: EntryPoint) {
  const i = entryPoints.findIndex((x) => x.id === ep.id);
  entryPoints = i === -1 ? [ep, ...entryPoints] : entryPoints.map((x) => (x.id === ep.id ? ep : x));
  // Sessions are derived from the graph, so a saved rewiring has to invalidate
  // them — otherwise the funnel keeps showing the old routing and the edit looks
  // like it did nothing.
  sessionCache.delete(ep.id);
  emit();
}

export function removeEntryPoint(id: string) {
  entryPoints = entryPoints.filter((e) => e.id !== id);
  sessionCache.delete(id);
  emit();
}

export function newEntryPointId(): string {
  return `ep_${Date.now().toString(36)}`;
}

/**
 * Agents selectable for a channel (AC-E4): voice entry points take `voice`
 * agents, WhatsApp takes `chat`. Paused/draft agents are returned too so the
 * detail page can show them as ineligible rather than hiding them.
 */
/**
 * Agents a session on this channel can be handed to.
 *
 * Voice takes voice agents; everything else takes chat agents. A webhook arrival has
 * no live caller, so a voice agent has nothing to pick up — the session it produces is
 * a text exchange or a silent run, which is what a chat agent handles.
 */
export function agentsForChannel(channel: InboundChannel): AgentRecord[] {
  const want = channel === "voice" ? "voice" : "chat";
  return getAgents().filter((a) => a.type === want);
}

// ── Session cache ───────────────────────────────────────────────────────────
// Generation is deterministic but not free; memoise per entry point.

const sessionCache = new Map<string, Session[]>();

export function sessionsFor(ep: EntryPoint): Session[] {
  const hit = sessionCache.get(ep.id);
  if (hit) return hit;
  const made = generateSessions(ep);
  sessionCache.set(ep.id, made);
  return made;
}

/** Every session across every entry point, newest first. */
export function allSessions(eps: EntryPoint[] = getEntryPoints()): Session[] {
  return eps.flatMap(sessionsFor).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

// ── Formatting helpers ──────────────────────────────────────────────────────

export function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export function fmtDuration(ms?: number): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function fmtMs(ms?: number): string {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Money. Totals read best rounded to cents, but unit costs are fractions of a
 * cent apart — `$0.01` for every agent would hide the whole difference — so the
 * caller picks the precision.
 */
export function fmtUsd(x: number, dp = 2): string {
  return `$${x.toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })}`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
