/**
 * Agent records — seed data for the agent builder (create starts blank, edit
 * hydrates from here). Tools are referenced by handle from the tool registry.
 */
import { getTool } from "./tool-registry";

export type AgentType = "voice" | "chat";
export type PostCallVar = {
  id: string;
  name: string;
  prompt: string;
  /** Optional predefined values the extracted result must map to (enum). Empty = free-form. */
  values?: string[];
};
/** A runtime value passed into a voice agent, referenced in the prompt with {{ }}. */
export type InputVar = { id: string; name: string };

export type AgentRecord = {
  id: string;
  name: string;
  type: AgentType;
  status: "live" | "draft" | "paused";
  tools: string[];
  /** Voice-only: input variables bound per call, referenced in the prompt with {{ }}. */
  inputVars?: InputVar[];
  masterPrompt: string;
  knowledgeBase: string;
  postCall: PostCallVar[];
  /** Settings: speech + telephony config (voice agents). */
  settings?: AgentSettings;
  /** Legacy: disposition enum read by the workflow canvas AI Chat node config. */
  dispositions?: string[];
};

export type SpeechRate = "slow" | "natural" | "fast";
export type Interruption = "sensitive" | "balanced" | "strict";
export type ReplyLength = "concise" | "balanced" | "detailed";

export type AgentSettings = {
  primaryLang?: string;
  secondaryLang?: string;
  /** Selected voice id from the voice registry. */
  voiceId?: string;
  /** Selected phone number id the agent calls from. */
  phoneNumberId?: string;
  /** How fast the assistant speaks (worded, not numeric). Voice only. */
  speechRate?: SpeechRate;
  /** How readily the assistant yields when the caller speaks over it. Voice only. */
  interruption?: Interruption;
  /** How long the assistant's written replies run. Chat only. */
  replyLength?: ReplyLength;
};

export const AGENT_RECORDS: Record<string, AgentRecord> = {
  a_concierge: {
    id: "a_concierge",
    name: "pi_concierge",
    type: "chat",
    status: "live",
    tools: ["send_whatsapp", "order_lookup", "knowledge_lookup"],
    settings: { primaryLang: "en-IN", replyLength: "balanced" },
    masterPrompt:
      "# Role\nYou are **Pi Concierge**, the first line of help for Paytm customers on WhatsApp.\n\n## Goals\n- Understand why the customer reached out and resolve it on first contact.\n- Be warm, concise, and never over-promise.\n\n## Tools\nUse {{order_lookup}} to check delivery status before answering order questions, and {{knowledge_lookup}} for policy or how-to questions. Send confirmations with {{send_whatsapp}}.\n\n## Guardrails\n- Never give investment advice.\n- Escalate anything involving a failed payment over ₹10,000 to a human.",
    knowledgeBase:
      "## Refund policy\nRefunds are processed within **5–7 business days** to the original payment method.\n\n## Delivery SLAs\n- Metro cities: 2–3 days\n- Tier-2/3: 4–6 days\n\n## Escalation\nFor disputes above ₹10,000, collect the order id and route to the payments desk.",
    postCall: [
      { id: "p1", name: "resolution_status", prompt: "Did the agent resolve the customer's issue?", values: ["resolved", "pending", "escalated"] },
      { id: "p2", name: "csat_estimate", prompt: "Estimate the customer's satisfaction based on their tone in the transcript.", values: ["1", "2", "3", "4", "5"] },
    ],
  },
  a_voice_react: {
    id: "a_voice_react",
    name: "reactivation_voice",
    type: "voice",
    status: "live",
    tools: ["place_call", "crm_query", "order_lookup"],
    inputVars: [
      { id: "iv1", name: "first_name" },
      { id: "iv2", name: "days_since_active" },
    ],
    settings: { primaryLang: "en-IN", secondaryLang: "hi-IN", voiceId: "sarvam_riya", phoneNumberId: "pn_mum", speechRate: "natural", interruption: "balanced" },
    masterPrompt:
      "# Role\nYou are **Reactivation Voice**, calling dormant Paytm traders to bring them back.\n\n## Opening\nGreet {{first_name}} by name and note it has been {{days_since_active}} days since they last traded.\n\n## Tools\nPull context with @crm_query at the start of the call so you can personalize the pitch.\n\n## Guardrails\n- Keep the call under 3 minutes.\n- If the customer asks to stop, apologize and end the call immediately.",
    knowledgeBase:
      "## Win-back offer\nEligible traders get **zero brokerage for 30 days**.\n\n## Objection handling\n- \"Too busy\": offer a callback at a time they choose.\n- \"Not interested\": thank them and close politely.",
    postCall: [
      { id: "p1", name: "callback_requested", prompt: "Did the customer ask for a callback? If yes, capture the requested time." },
      { id: "p2", name: "reactivation_intent", prompt: "Rate the customer's intent to reactivate.", values: ["high", "medium", "low"] },
    ],
  },
  a_kyc: {
    id: "a_kyc",
    name: "kyc_helper",
    type: "chat",
    status: "live",
    tools: ["knowledge_lookup", "customer_context"],
    settings: { primaryLang: "en-IN", replyLength: "concise" },
    masterPrompt:
      "# Role\nYou are **KYC Helper**. You guide customers through completing KYC.\n\n## Tools\nUse {{customer_context}} to see which KYC stage the customer is stuck at, then give the exact next step.\n\n## Guardrails\n- Never ask the customer to share OTPs or passwords.",
    knowledgeBase:
      "## KYC stages\n1. PAN verification\n2. Aadhaar e-KYC\n3. Video KYC\n\n## Common blockers\n- Name mismatch between PAN and Aadhaar — direct to the correction flow.",
    postCall: [
      { id: "p1", name: "kyc_stage_reached", prompt: "Which KYC stage did the customer reach by the end of the conversation?" },
    ],
  },
  a_pricing: {
    id: "a_pricing",
    name: "pricing_qa",
    type: "chat",
    status: "draft",
    tools: ["knowledge_lookup"],
    settings: { primaryLang: "en-IN", replyLength: "detailed" },
    masterPrompt:
      "# Role\nYou answer pricing and plan questions for Paytm products.\n\n## Tools\nGround every answer in {{knowledge_lookup}} — never invent prices.",
    knowledgeBase: "## Plans\n- Basic: free\n- Pro: ₹299/mo\n- Enterprise: custom",
    postCall: [
      { id: "p1", name: "plan_interest", prompt: "Which plan did the customer show the most interest in?" },
    ],
  },
  a_winback: {
    id: "a_winback",
    name: "winback_voice",
    type: "voice",
    status: "paused",
    tools: ["place_call", "crm_query", "refund_initiate"],
    inputVars: [
      { id: "iv1", name: "first_name" },
      { id: "iv2", name: "lifetime_value" },
    ],
    settings: { primaryLang: "en-IN", secondaryLang: "hi-IN", voiceId: "sarvam_kashish", phoneNumberId: "pn_del", speechRate: "slow", interruption: "strict" },
    masterPrompt:
      "# Role\nYou are **Win-back Voice**, calling high-value lapsed customers.\n\n## Opening\nAddress {{first_name}} warmly; their lifetime value with us is {{lifetime_value}}.\n\n## Tools\nCheck history with @crm_query. If the customer left over a billing dispute, you may offer a goodwill refund via @refund_initiate (max ₹2,000).\n\n## Guardrails\n- Confirm the refund amount with the customer before initiating.",
    knowledgeBase: "## Goodwill refunds\nCap: ₹2,000. Requires the customer to confirm verbally.",
    postCall: [
      { id: "p1", name: "refund_offered", prompt: "Did the agent offer a goodwill refund? Capture the amount if so." },
    ],
  },
  a_support: {
    id: "a_support",
    name: "l1_support",
    type: "chat",
    status: "live",
    tools: ["send_whatsapp", "order_lookup", "refund_initiate", "knowledge_lookup"],
    settings: { primaryLang: "en-IN", replyLength: "balanced" },
    masterPrompt:
      "# Role\nYou are **L1 Support** for Paytm orders and payments.\n\n## Tools\nLook up orders with {{order_lookup}}, answer policy questions with {{knowledge_lookup}}, and for confirmed failures initiate a refund with {{refund_initiate}}.\n\n## Guardrails\n- Verify the order belongs to the customer before any refund.",
    knowledgeBase: "## Refund eligibility\nOnly orders marked `returned` or `failed` are refundable.",
    postCall: [
      { id: "p1", name: "issue_category", prompt: "Categorize the issue.", values: ["delivery", "payment", "refund", "other"] },
      { id: "p2", name: "refund_initiated", prompt: "Was a refund initiated during this conversation?", values: ["yes", "no"] },
    ],
  },
};

export function getAgentRecord(id: string): AgentRecord | undefined {
  return AGENT_RECORDS[id];
}

/** Resolve an agent by its id OR its name (the voice node stores the name). */
export function resolveAgent(nameOrId?: string): AgentRecord | undefined {
  if (!nameOrId) return undefined;
  return AGENT_RECORDS[nameOrId] ?? Object.values(AGENT_RECORDS).find((a) => a.name === nameOrId);
}

export function voiceAgents(): AgentRecord[] {
  return Object.values(AGENT_RECORDS).filter((a) => a.type === "voice");
}

/** Legacy: chat-type agents, consumed by the workflow canvas AI Chat node config. */
export function chatAgents(): AgentRecord[] {
  return Object.values(AGENT_RECORDS).filter((a) => a.type === "chat");
}

/** Output variables an agent's tools expose downstream (e.g. `order_lookup.delivered_status`). */
export function agentToolOutputVars(nameOrId?: string): { key: string; source: string }[] {
  const rec = resolveAgent(nameOrId);
  if (!rec) return [];
  const out: { key: string; source: string }[] = [];
  for (const h of rec.tools) {
    const t = getTool(h);
    if (t) for (const o of t.outputs) out.push({ key: `${h}.${o.varName}`, source: `@${h}` });
  }
  return out;
}
