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

export type InboundChannel = "whatsapp" | "voice";

/**
 * Terminal session states, plus `active` for in-flight.
 *
 * These are exhaustive and mutually exclusive (PRD AC-S2): every ended session
 * lands in exactly one, so the funnel identity in `computeSessionMetrics` always
 * balances. `no_response` is distinct from `abandoned` — the first never engaged
 * at all (agent opened, customer never replied), the second dropped mid-conversation.
 */
export type SessionStage =
  | "active"
  | "unrouted"
  | "no_response"
  | "resolved"
  | "handed_off"
  | "abandoned"
  | "expired";

export const TERMINAL_STAGES: SessionStage[] = [
  "unrouted",
  "no_response",
  "resolved",
  "handed_off",
  "abandoned",
  "expired",
];

export const STAGE_LABEL: Record<SessionStage, string> = {
  active: "Active",
  unrouted: "Unrouted",
  no_response: "No response",
  resolved: "Resolved",
  handed_off: "Handed off",
  abandoned: "Abandoned",
  expired: "Expired",
};

/** Why a session ended, for the operator. Keyed by stage. */
export const STAGE_INFO: Record<SessionStage, string> = {
  active: "Conversation is in flight right now.",
  unrouted: "The arrival ran off the end of the graph without reaching an agent. The contact was never answered — this is a routing gap, not a customer outcome.",
  no_response: "Routed and the agent opened, but the customer never replied.",
  resolved: "The agent completed the conversation with no human involvement. This is the containment numerator.",
  handed_off: "Escalated to a human.",
  abandoned: "The customer engaged, then stopped replying mid-conversation.",
  expired: "Timed out — the WhatsApp 24h window closed, or the call hit silence timeout.",
};

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
  /** The bound channel resource — a WhatsApp number or a voice DID. */
  address: string;
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
  createdAt: string;
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

  stage: SessionStage;
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
      "The public WhatsApp number. Carries both ad-driven conversations and inbound service.",
    channel: "whatsapp",
    address: "+91 80 4718 2200",
    status: "live",
    createdAt: "12 Jun 2026",
    // The Meta referral payload is present only when the message originated from
    // a Click-to-WhatsApp ad — that single test is what separates use case 1 from
    // use case 2 on one number.
    graph: seedGraph({
      branches: [
        {
          id: "b_ctwa",
          label: "From an ad",
          conditions: [{ variable: "trigger.referral_ad", op: "exists", value: "" }],
          agentId: "a_concierge",
        },
      ],
      elseAgentId: "a_support",
    }),
  },
  {
    id: "ep_voice_support",
    name: "Voice · Support line",
    description: "Inbound calls to the published support number.",
    channel: "voice",
    address: "+91 80 4718 2100",
    status: "live",
    createdAt: "28 Jun 2026",
    hours: { start: "09:00", end: "21:00", days: [1, 2, 3, 4, 5, 6], tz: "Asia/Kolkata" },
    // Deliberately no `elseAgentId`: out-of-hours calls land `unrouted` so the
    // routing gap is visible in analytics rather than silently absorbed.
    graph: seedGraph({
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
    address: "+91 80 4718 2150",
    status: "live",
    createdAt: "19 Jul 2026",
    hours: { start: "10:00", end: "19:00", days: [1, 2, 3, 4, 5], tz: "Asia/Kolkata" },
    // Every caller reaches the same agent, so there is nothing to branch on —
    // but the CRM lookup runs first, which is the whole reason routing moved to a
    // graph: it is a *step*, not a condition.
    graph: seedGraph({ lookupTool: "customer_context", elseAgentId: "a_voice_react" }),
  },
  {
    id: "ep_wa_kyc",
    name: "WhatsApp · KYC line",
    description: "Dedicated number printed on KYC reminder comms.",
    channel: "whatsapp",
    address: "+91 80 4718 2277",
    status: "paused",
    createdAt: "2 Aug 2026",
    // A dedicated number carries one kind of traffic, so there is nothing to route.
    graph: seedGraph({ elseAgentId: "a_kyc" }),
  },
];

const AD_POOL = [
  { adId: "ad_5512", adName: "Gold Loyalty · Diwali" },
  { adId: "ad_5518", adName: "Zero brokerage · Retarget" },
  { adId: "ad_5603", adName: "New user · Cashback" },
];

const HANDOFF_REASONS = [
  "Customer asked for a human",
  "Dispute above ₹10,000",
  "Agent could not resolve after 3 attempts",
  "Out of policy scope",
];

const FIRST = [
  "Arjun", "Priya", "Rahul", "Anita", "Vikram", "Sneha", "Karan", "Meera",
  "Rohan", "Divya", "Aditya", "Pooja", "Sanjay", "Neha", "Ishan", "Tara",
];
const LAST = [
  "Sharma", "Patel", "Kumar", "Reddy", "Iyer", "Khan", "Singh", "Gupta",
  "Mehta", "Joshi", "Nair", "Das", "Verma", "Bose",
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
  if (r < 0.16) return "no_response";
  const rest = (r - 0.16) / 0.84;
  if (rest < 0.6) return "resolved";
  if (rest < 0.79) return "handed_off";
  if (rest < 0.92) return "abandoned";
  return "expired";
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
  if (stage === "unrouted") {
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

  if (stage === "no_response") return turns;

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
  if (stage === "abandoned")
    turns.push({ role: "system", at: t, text: "Customer stopped responding." });
  if (stage === "expired")
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
    const stage: SessionStage = routed.agentId ? drawRoutedStage(rand) : "unrouted";
    const agent = resolveAgent(routed.agentId);

    const first = pick(rand, FIRST);
    const last = pick(rand, LAST);

    const engaged = !["unrouted", "no_response"].includes(stage);
    const turnCount = stage === "unrouted" ? 0 : engaged ? 3 + Math.floor(rand() * 9) : 1;

    const durationSec =
      stage === "unrouted" ? 0 : engaged ? 45 + Math.floor(rand() * 420) : 12 + Math.floor(rand() * 30);

    const started = new Date();
    started.setDate(started.getDate() - Math.floor(rand() * 14));
    started.setHours(9 + Math.floor(rand() * 12), Math.floor(rand() * 59), 0, 0);

    // Outcome vars come from the handling agent's postCall schema — no parallel
    // schema for inbound (PRD §4.4). Only engaged, ended sessions get them.
    const outcome: Record<string, string> = {};
    if (agent && engaged && stage !== "active") {
      for (const pc of agent.postCall) {
        outcome[pc.name] = sampleOutcome(rand, pc.name, stage);
      }
    }

    out.push({
      id: `S-${ep.id.slice(3, 7)}-${String(1000 + i)}`,
      entryPointId: ep.id,
      agentId: routed.agentId,
      channel: ep.channel,
      contact: {
        name: `${first} ${last}`,
        phone: `+91 9${Math.floor(100000000 + rand() * 899999999)}`,
      },
      stage,
      routePath: routed.path,
      startedAt: started.toISOString(),
      endedAt:
        stage === "active"
          ? undefined
          : new Date(started.getTime() + durationSec * 1000).toISOString(),
      firstResponseMs: stage === "unrouted" ? undefined : 800 + Math.floor(rand() * 5200),
      durationMs: stage === "active" ? undefined : durationSec * 1000,
      turnCount,
      outcome,
      handoffReason: stage === "handed_off" ? pick(rand, HANDOFF_REASONS) : undefined,
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
    return resolved ? "positive" : stage === "abandoned" ? "negative" : "neutral";

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
  abandoned: number;
  expired: number;
  noResponse: number;
  unrouted: number;
  /** Engaged sessions that have ended — the denominator for containment. */
  engagedEnded: number;

  routingRate: number;
  engagementRate: number;
  containmentRate: number;
  handoffRate: number;
  abandonRate: number;

  medianFirstResponseMs: number;
  medianHandleMs: number;
  medianTurns: number;
  totalCost: number;
  costPerSession: number;
  costPerResolution: number;
};

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const rate = (n: number, d: number) => (d === 0 ? 0 : n / d);

/**
 * The whole inbound metric spine (PRD §8.2). Every rate derives from the AC-S2
 * identity, so the funnel always balances:
 *   received = unrouted + no_response + active + resolved + handed_off + abandoned + expired
 */
export function computeSessionMetrics(sessions: Session[]): SessionMetrics {
  const count = (s: SessionStage) => sessions.filter((x) => x.stage === s).length;

  const received = sessions.length;
  const unrouted = count("unrouted");
  const noResponse = count("no_response");
  const active = count("active");
  const resolved = count("resolved");
  const handedOff = count("handed_off");
  const abandoned = count("abandoned");
  const expired = count("expired");

  const routed = received - unrouted;
  const engaged = routed - noResponse;
  const engagedEnded = resolved + handedOff + abandoned + expired;

  const ended = sessions.filter((s) => s.stage !== "active" && s.stage !== "unrouted");
  const totalCost = sessions.reduce((a, s) => a + s.cost, 0);

  return {
    received,
    routed,
    engaged,
    active,
    resolved,
    handedOff,
    abandoned,
    expired,
    noResponse,
    unrouted,
    engagedEnded,

    routingRate: rate(routed, received),
    engagementRate: rate(engaged, routed),
    containmentRate: rate(resolved, engagedEnded),
    handoffRate: rate(handedOff, engagedEnded),
    abandonRate: rate(abandoned, engagedEnded),

    medianFirstResponseMs: median(
      ended.map((s) => s.firstResponseMs ?? 0).filter(Boolean),
    ),
    medianHandleMs: median(ended.map((s) => s.durationMs ?? 0).filter(Boolean)),
    medianTurns: median(ended.map((s) => s.turnCount).filter(Boolean)),
    totalCost,
    costPerSession: rate(totalCost, received),
    costPerResolution: rate(totalCost, resolved),
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
