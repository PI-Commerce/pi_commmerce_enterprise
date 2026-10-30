/**
 * Agent records — the source of truth for the agent builder AND every surface
 * that names an agent (the campaign Voice Call node, analytics, wa-outputs).
 *
 * `AGENT_RECORDS` is the seed; the live list is a module-level `current` array so
 * an agent authored in the builder is immediately visible everywhere that reads
 * agents — the same reactive-store pattern as `template-store`/`connections`.
 * Resolvers (`resolveAgent`, `voiceAgents`, …) read `current`, not the frozen
 * seed map, so newly saved agents resolve. In-memory only: a hard refresh
 * replays the demo from seed.
 *
 * The store lives here (rather than a separate `agent-store`) so the many
 * existing `@/lib/agent-data` importers keep working and there's no import cycle
 * between the seed and the resolvers.
 */
import { useSyncExternalStore } from "react";
import { getTool } from "./tool-registry";

export type AgentType = "voice" | "chat";
export type PostCallVar = { id: string; name: string; prompt: string };

export type AgentAttributeType = "String" | "Number" | "Boolean";

/**
 * What the agent needs handed to it to open a conversation.
 *
 * The agent's half of the contract: it declares what it needs, and whatever
 * invokes it — a campaign node against an Audience schema, an inbound entry
 * point against what the trigger published — maps each one. Declaring the type
 * and the requiredness here is what lets the caller be told it has not finished
 * wiring, instead of finding out when the agent opens with an empty name.
 */
export type AgentAttribute = {
  id: string;
  name: string;
  type: AgentAttributeType;
  /** Unmapped required attributes block the calling node from saving. */
  required: boolean;
};

export type AgentRecord = {
  id: string;
  name: string;
  type: AgentType;
  status: "live" | "draft" | "paused";
  tools: string[];
  masterPrompt: string;
  knowledgeBase: string;
  postCall: PostCallVar[];
  /**
   * How the agent says a conversation ended — a closed list, picked from at
   * session close.
   *
   * Distinct from {@link PostCallVar}, which is free-text extraction ("which
   * plan did they ask about"). A disposition is the one value everything
   * downstream keys on: it decides whether the session is marked for human
   * escalation, and it becomes the label an operator reads in the Inbox.
   *
   * Closed for the same reason the session tags are. A free-text ending coming
   * out of a model gives "needs human", "Needs a human" and "escalate" as three
   * different answers to one question, and nothing can route on it.
   */
  dispositions: string[];
  /** What it needs to start — see {@link AgentAttribute}. */
  attributes: AgentAttribute[];
  /** Optional eval instruction; when omitted the builder shows a boilerplate default. */
  evalPrompt?: string;
  /** Shared model config this agent runs on (see `model-config`). */
  modelConfigId?: string;
};

export const AGENT_RECORDS: Record<string, AgentRecord> = {
  a_concierge: {
    id: "a_concierge",
    name: "pi_concierge",
    type: "chat",
    status: "live",
    modelConfigId: "mc_default",
    tools: ["send_whatsapp", "order_lookup", "knowledge_lookup"],
    masterPrompt:
      "# Role\nYou are **Pi Concierge**, the first line of help for Paytm customers on WhatsApp.\n\n## Goals\n- Understand why the customer reached out and resolve it on first contact.\n- Be warm, concise, and never over-promise.\n\n## Tools\nUse {{order_lookup}} to check delivery status before answering order questions, and {{knowledge_lookup}} for policy or how-to questions. Send confirmations with {{send_whatsapp}}.\n\n## Guardrails\n- Never give investment advice.\n- Escalate anything involving a failed payment over ₹10,000 to a human.",
    knowledgeBase:
      "## Refund policy\nRefunds are processed within **5–7 business days** to the original payment method.\n\n## Delivery SLAs\n- Metro cities: 2–3 days\n- Tier-2/3: 4–6 days\n\n## Escalation\nFor disputes above ₹10,000, collect the order id and route to the payments desk.",
    attributes: [{ id: "at1", name: "name", type: "String", required: true }, { id: "at2", name: "phone", type: "String", required: true }, { id: "at3", name: "ad_name", type: "String", required: false }],
    dispositions: ["Answered", "Browsing, no intent", "Wants a human", "Out of scope", "Abusive or spam"],
    postCall: [
      {
        id: "p1",
        name: "resolution_status",
        prompt:
          "Did the agent resolve the customer's issue? Answer one of: resolved, pending, escalated.",
      },
      {
        id: "p2",
        name: "csat_estimate",
        prompt:
          "Estimate the customer's satisfaction from 1-5 based on their tone in the transcript.",
      },
    ],
  },
  a_voice_react: {
    id: "a_voice_react",
    name: "reactivation_voice",
    type: "voice",
    status: "live",
    modelConfigId: "mc_default",
    tools: ["place_call", "crm_query", "order_lookup"],
    masterPrompt:
      "# Role\nYou are **Reactivation Voice**, calling dormant Paytm traders to bring them back.\n\n## Opening\nGreet the customer by first name and reference how long they've been away.\n\n## Tools\nPull context with {{crm_query}} at the start of the call so you can personalize the pitch.\n\n## Guardrails\n- Keep the call under 3 minutes.\n- If the customer asks to stop, apologize and end the call immediately.",
    knowledgeBase:
      '## Win-back offer\nEligible traders get **zero brokerage for 30 days**.\n\n## Objection handling\n- "Too busy": offer a callback at a time they choose.\n- "Not interested": thank them and close politely.',
    attributes: [{ id: "at1", name: "name", type: "String", required: true }, { id: "at2", name: "phone", type: "String", required: true }, { id: "at3", name: "eli_amt", type: "Number", required: true }, { id: "at4", name: "dormant_days", type: "Number", required: false }],
    dispositions: ["Interested", "Call back later", "Not interested", "Wrong number"],
    postCall: [
      {
        id: "p1",
        name: "call_sentiment",
        prompt:
          "Overall customer sentiment during the call: positive, neutral, or negative.",
      },
      {
        id: "p2",
        name: "engagement_intent",
        prompt:
          "Primary reason the customer gave about using the app (e.g. not interested, technical issue, using a different app).",
      },
      {
        id: "p3",
        name: "user_availability",
        prompt:
          "Was the customer available to talk? available, busy, or requested a callback.",
      },
      {
        id: "p4",
        name: "competitor_app",
        prompt:
          "If the customer mentioned a competing app they use instead, capture its name; otherwise none.",
      },
      {
        id: "p5",
        name: "credit_card_added",
        prompt:
          "Does the customer have a credit card added to the app? added or not added.",
      },
      {
        id: "p6",
        name: "charges_feedback",
        prompt:
          "Did the customer mention the charges being high? Capture their view.",
      },
      {
        id: "p7",
        name: "callback_requested",
        prompt:
          "Did the customer ask for a callback? If yes, capture the requested time.",
      },
      {
        id: "p8",
        name: "final_lead_status",
        prompt:
          "Final disposition of the lead after the call (e.g. interested, follow-up, not interested).",
      },
    ],
  },
  a_kyc: {
    id: "a_kyc",
    name: "kyc_helper",
    type: "chat",
    status: "live",
    tools: ["knowledge_lookup", "customer_context"],
    masterPrompt:
      "# Role\nYou are **KYC Helper**. You guide customers through completing KYC.\n\n## Tools\nUse {{customer_context}} to see which KYC stage the customer is stuck at, then give the exact next step.\n\n## Guardrails\n- Never ask the customer to share OTPs or passwords.",
    knowledgeBase:
      "## KYC stages\n1. PAN verification\n2. Aadhaar e-KYC\n3. Video KYC\n\n## Common blockers\n- Name mismatch between PAN and Aadhaar — direct to the correction flow.",
    attributes: [{ id: "at1", name: "name", type: "String", required: true }, { id: "at2", name: "phone", type: "String", required: true }, { id: "at3", name: "kyc_stage", type: "String", required: false }],
    dispositions: ["KYC completed", "Guided, customer continuing", "Blocked — needs an agent", "Document mismatch", "Wants a human"],
    postCall: [
      {
        id: "p1",
        name: "kyc_stage_reached",
        prompt:
          "Which KYC stage did the customer reach by the end of the conversation?",
      },
    ],
  },
  a_pricing: {
    id: "a_pricing",
    name: "pricing_qa",
    type: "chat",
    status: "draft",
    tools: ["knowledge_lookup"],
    masterPrompt:
      "# Role\nYou answer pricing and plan questions for Paytm products.\n\n## Tools\nGround every answer in {{knowledge_lookup}} — never invent prices.",
    knowledgeBase:
      "## Plans\n- Basic: free\n- Pro: ₹299/mo\n- Enterprise: custom",
    attributes: [{ id: "at1", name: "name", type: "String", required: true }, { id: "at2", name: "phone", type: "String", required: true }, { id: "at3", name: "plan", type: "String", required: false }],
    dispositions: ["Answered", "Quote requested", "Wants a human", "Out of scope"],
    postCall: [
      {
        id: "p1",
        name: "plan_interest",
        prompt: "Which plan did the customer show the most interest in?",
      },
    ],
  },
  a_winback: {
    id: "a_winback",
    name: "winback_voice",
    type: "voice",
    status: "paused",
    tools: ["place_call", "crm_query", "refund_initiate"],
    masterPrompt:
      "# Role\nYou are **Win-back Voice**, calling high-value lapsed customers.\n\n## Tools\nCheck history with {{crm_query}}. If the customer left over a billing dispute, you may offer a goodwill refund via {{refund_initiate}} (max ₹2,000).\n\n## Guardrails\n- Confirm the refund amount with the customer before initiating.",
    knowledgeBase:
      "## Goodwill refunds\nCap: ₹2,000. Requires the customer to confirm verbally.",
    attributes: [{ id: "at1", name: "name", type: "String", required: true }, { id: "at2", name: "phone", type: "String", required: true }, { id: "at3", name: "eli_amt", type: "Number", required: true }],
    dispositions: ["Reactivated", "Call back later", "Declined", "Wrong number"],
    postCall: [
      {
        id: "p1",
        name: "refund_offered",
        prompt:
          "Did the agent offer a goodwill refund? Capture the amount if so.",
      },
    ],
  },
  // The only voice agent built to *receive* a call rather than place one. Inbound
  // entry points need this: the other voice agents open by pitching, which is wrong
  // when the customer is the one who dialled and already has a reason for calling.
  a_voice_support: {
    id: "a_voice_support",
    name: "support_voice",
    type: "voice",
    status: "live",
    modelConfigId: "mc_default",
    tools: ["order_lookup", "crm_query", "knowledge_lookup", "refund_initiate"],
    masterPrompt:
      "# Role\nYou are **Support Voice**, answering inbound calls to the Paytm support line.\n\n## Opening\nThe customer called you — do not pitch. Greet them, then ask what you can help with.\n\n## Tools\nIdentify the caller with {{crm_query}}, pull order state with {{order_lookup}}, and answer policy questions with {{knowledge_lookup}}.\n\n## Guardrails\n- Verify the order belongs to the caller before discussing or refunding it.\n- If the caller asks for a human, hand off immediately rather than retrying.",
    knowledgeBase:
      "## Refund eligibility\nOnly orders marked `returned` or `failed` are refundable.\n\n## Escalation\nHand off to a human for disputes above ₹10,000, suspected fraud, or any second call about the same unresolved issue.",
    attributes: [{ id: "at1", name: "name", type: "String", required: true }, { id: "at2", name: "phone", type: "String", required: true }],
    dispositions: ["Resolved", "Transferred", "Dropped", "Wants a human"],
    postCall: [
      {
        id: "p1",
        name: "issue_category",
        prompt: "Categorize the caller's issue: delivery, payment, refund, account, or other.",
      },
      {
        id: "p2",
        name: "resolved_on_call",
        prompt:
          "Was the caller's issue fully resolved on this call without a human? yes or no.",
      },
      {
        id: "p3",
        name: "escalation_reason",
        prompt:
          "If the call was handed to a human, the reason: caller requested, policy limit, agent could not resolve, or none.",
      },
      {
        id: "p4",
        name: "repeat_contact",
        prompt:
          "Did the caller say they had contacted support about this before? yes or no.",
      },
      {
        id: "p5",
        name: "csat",
        prompt: "Estimate caller satisfaction from 1-5 based on their tone at the end of the call.",
      },
    ],
  },
  a_support: {
    id: "a_support",
    name: "l1_support",
    type: "chat",
    status: "live",
    tools: [
      "send_whatsapp",
      "order_lookup",
      "refund_initiate",
      "knowledge_lookup",
    ],
    masterPrompt:
      "# Role\nYou are **L1 Support** for Paytm orders and payments.\n\n## Tools\nLook up orders with {{order_lookup}}, answer policy questions with {{knowledge_lookup}}, and for confirmed failures initiate a refund with {{refund_initiate}}.\n\n## Guardrails\n- Verify the order belongs to the customer before any refund.",
    knowledgeBase:
      "## Refund eligibility\nOnly orders marked `returned` or `failed` are refundable.",
    attributes: [{ id: "at1", name: "name", type: "String", required: true }, { id: "at2", name: "phone", type: "String", required: true }, { id: "at3", name: "last_order_id", type: "String", required: false }],
    dispositions: ["Resolved", "Workaround given", "Wants a human", "Needs an approval", "Complaint", "Out of scope"],
    postCall: [
      {
        id: "p1",
        name: "issue_category",
        prompt: "Categorize the issue: delivery, payment, refund, or other.",
      },
      {
        id: "p2",
        name: "refund_initiated",
        prompt: "Was a refund initiated during this conversation? yes or no.",
      },
    ],
  },
};

// ── Reactive store ─────────────────────────────────────────────────────────

let current: AgentRecord[] = Object.values(AGENT_RECORDS);
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive read of every agent. */
export function useAgents(): AgentRecord[] {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

/** Reactive read of one agent by id. */
export function useAgent(id?: string): AgentRecord | undefined {
  const all = useAgents();
  return id ? all.find((a) => a.id === id) : undefined;
}

/** Imperative read — for non-React callers (resolvers, analytics). */
export function getAgents(): AgentRecord[] {
  return current;
}

/** Upsert by id. New agents go to the front so a just-saved one leads the list. */
export function saveAgent(a: AgentRecord) {
  const i = current.findIndex((x) => x.id === a.id);
  current = i === -1 ? [a, ...current] : current.map((x) => (x.id === a.id ? a : x));
  emit();
}

export function removeAgent(id: string) {
  current = current.filter((a) => a.id !== id);
  emit();
}

/** Mint a fresh agent id, matching the store/template id style. */
export function newAgentId(): string {
  return `a_${Date.now().toString(36)}`;
}

// ── Resolvers (read the live `current` list, not the frozen seed) ────────────

export function getAgentRecord(id: string): AgentRecord | undefined {
  return current.find((a) => a.id === id);
}

/** Resolve an agent by its id OR its name (the voice node stores the name). */
export function resolveAgent(nameOrId?: string): AgentRecord | undefined {
  if (!nameOrId) return undefined;
  return (
    current.find((a) => a.id === nameOrId) ??
    current.find((a) => a.name === nameOrId)
  );
}

export function voiceAgents(): AgentRecord[] {
  return current.filter((a) => a.type === "voice");
}

/** Output variables an agent's tools expose downstream (e.g. `order_lookup.delivered_status`). */
export function agentToolOutputVars(
  nameOrId?: string,
): { key: string; source: string }[] {
  const rec = resolveAgent(nameOrId);
  if (!rec) return [];
  const out: { key: string; source: string }[] = [];
  for (const h of rec.tools) {
    const t = getTool(h);
    if (t)
      for (const o of t.outputs)
        out.push({ key: `${h}.${o.varName}`, source: `@${h}` });
  }
  return out;
}
