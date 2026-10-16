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
/** A runtime value passed into an agent per run, referenced in the prompt with {{ }}. */
export type InputVar = { id: string; name: string };

export type AgentRecord = {
  id: string;
  name: string;
  type: AgentType;
  status: "live" | "draft" | "paused";
  tools: string[];
  /** Input variables bound per run, referenced in the prompt with {{ }}. */
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
  /** Hard cap on a single call, in minutes, before the agent wraps up. Voice only. */
  maxCallDuration?: number;
  /** Seconds of caller silence before the agent speaks the nudge message. Voice only. */
  inactivityTimeout?: number;
  /** What the agent says to re-engage a silent caller (the inactivity nudge). Voice only. */
  nudgeMessage?: string;
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
  // Demo agent with a 3-version history (see VERSION_SEEDS below). The canonical
  // record here mirrors the active version (v2).
  a_offers: {
    id: "a_offers",
    name: "festive_offers",
    type: "chat",
    status: "live",
    tools: ["knowledge_lookup", "order_lookup"],
    settings: { primaryLang: "en-IN", replyLength: "balanced" },
    masterPrompt:
      "# Role\nYou are **Festive Offers**, helping Paytm customers discover and claim festive cashback on WhatsApp.\n\n## Goals\n- Explain the current festive offer and how to claim it.\n- Check a specific recharge when the customer asks about it.\n\n## Tools\nUse {{order_lookup}} to confirm whether a recharge qualified for cashback before answering.\n\n## Guardrails\n- Never promise an offer that has expired.\n- Escalate cashback disputes above 500 to a human.",
    knowledgeBase:
      "## Festive offer\nFlat 10% cashback on recharges above 500, capped at 100 per user.\n\n## How to claim\n1. Recharge above 500 from the Paytm app.\n2. Cashback lands within 24 hours.",
    postCall: [
      { id: "p1", name: "offer_outcome", prompt: "Did the customer claim the festive offer?", values: ["claimed", "interested", "declined"] },
    ],
  },
};

export function getAgentRecord(id: string): AgentRecord | undefined {
  return AGENT_RECORDS[id];
}

/* --------------------------------------------------------------------- */
/* Starter templates                                                     */
/*                                                                       */
/* When creating an agent the user either starts from scratch or picks a */
/* template. A template is just a pre-filled AgentRecord the builder     */
/* hydrates from (the new agent gets a fresh id from its name).          */
/* --------------------------------------------------------------------- */

export type AgentTemplate = {
  id: string;
  label: string;
  description: string;
  record: AgentRecord;
};

export const AGENT_TEMPLATES: Record<AgentType, AgentTemplate[]> = {
  voice: [
    {
      id: "t_loan_collection",
      label: "Loan Collection",
      description: "Reminds borrowers of an overdue EMI and secures a payment commitment.",
      record: {
        id: "t_loan_collection",
        name: "loan_collection",
        type: "voice",
        status: "draft",
        tools: ["customer_context", "send_whatsapp"],
        inputVars: [
          { id: "lc1", name: "customer_name" },
          { id: "lc2", name: "amount_due" },
          { id: "lc3", name: "due_date" },
        ],
        settings: { primaryLang: "en-IN", speechRate: "natural", interruption: "balanced" },
        masterPrompt:
          "# Role\nYou are a polite, professional collections agent calling on behalf of the lender.\n\n## Opening\nGreet {{customer_name}} and confirm you are speaking with the right person before discussing any account detail.\n\n## Goal\nRemind them that {{amount_due}} was due on {{due_date}} and secure a clear commitment to pay. Use {{customer_context}} to confirm the account, and {{send_whatsapp}} to send a payment link if they agree.\n\n## Guardrails\n- Never disclose account details until identity is confirmed.\n- Stay respectful even if the customer is upset; never threaten.\n- If they dispute the amount, log it and offer a callback.",
        knowledgeBase:
          "## Payment options\nUPI, debit card, or net banking via the payment link.\n\n## Grace period\nA 3-day grace window applies before late fees accrue.",
        postCall: [
          { id: "lcp1", name: "payment_commitment", prompt: "What did the customer commit to?", values: ["will_pay", "partial", "dispute", "refused", "callback"] },
        ],
      },
    },
    {
      id: "t_lead_qualification",
      label: "Lead Qualification",
      description: "Qualifies an inbound lead against budget, intent, and timeline.",
      record: {
        id: "t_lead_qualification",
        name: "lead_qualification",
        type: "voice",
        status: "draft",
        tools: ["crm_query"],
        inputVars: [
          { id: "lq1", name: "lead_name" },
          { id: "lq2", name: "product_interest" },
        ],
        settings: { primaryLang: "en-IN", speechRate: "natural", interruption: "balanced" },
        masterPrompt:
          "# Role\nYou are a friendly sales qualifier calling a new lead.\n\n## Opening\nGreet {{lead_name}} and reference their interest in {{product_interest}}.\n\n## Goal\nQualify the lead on three things: budget, decision authority, and timeline. Keep it conversational, not an interrogation. Use {{crm_query}} to pull any prior context.\n\n## Guardrails\n- Do not quote final pricing; route pricing questions to a human.\n- Respect a 'not interested' and close politely.",
        knowledgeBase:
          "## Qualification bar\nHot = budget confirmed and buying within 30 days. Warm = interested but no timeline. Cold = no budget or wrong fit.",
        postCall: [
          { id: "lqp1", name: "lead_quality", prompt: "How well does the lead qualify?", values: ["hot", "warm", "cold"] },
        ],
      },
    },
  ],
  chat: [
    {
      id: "t_customer_support",
      label: "Customer Support",
      description: "Answers common questions and resolves issues on WhatsApp.",
      record: {
        id: "t_customer_support",
        name: "customer_support",
        type: "chat",
        status: "draft",
        tools: ["order_lookup", "knowledge_lookup", "send_whatsapp"],
        settings: { primaryLang: "en-IN", replyLength: "balanced" },
        masterPrompt:
          "# Role\nYou are a warm, efficient support agent helping customers on WhatsApp.\n\n## Goals\n- Understand the issue and resolve it on first contact.\n- Keep replies short and friendly.\n\n## Tools\nUse {{order_lookup}} for order status, {{knowledge_lookup}} for policy and how-to questions, and {{send_whatsapp}} to send confirmations.\n\n## Guardrails\n- Never give investment advice.\n- Escalate anything involving a failed payment to a human.",
        knowledgeBase:
          "## Refund policy\nRefunds are processed within 5 to 7 business days to the original payment method.\n\n## Escalation\nFor disputes, collect the order id and route to the support desk.",
        postCall: [
          { id: "csp1", name: "resolution_status", prompt: "Did the agent resolve the customer's issue?", values: ["resolved", "pending", "escalated"] },
        ],
      },
    },
    {
      id: "t_order_tracking",
      label: "Order Tracking",
      description: "Looks up an order and tells the customer where it is.",
      record: {
        id: "t_order_tracking",
        name: "order_tracking",
        type: "chat",
        status: "draft",
        tools: ["order_lookup"],
        inputVars: [{ id: "ot1", name: "order_id" }],
        settings: { primaryLang: "en-IN", replyLength: "concise" },
        masterPrompt:
          "# Role\nYou are an order-tracking assistant on WhatsApp.\n\n## Goal\nWhen a customer asks about {{order_id}}, use {{order_lookup}} to fetch its status and give a clear, short update with the expected delivery date.\n\n## Guardrails\n- If the order id is not found, ask the customer to recheck it.\n- Do not speculate on delays beyond what the lookup returns.",
        knowledgeBase:
          "## Delivery SLAs\n- Metro cities: 2 to 3 days\n- Tier-2 and Tier-3: 4 to 6 days",
        postCall: [
          { id: "otp1", name: "tracking_outcome", prompt: "Was the customer able to get their order status?", values: ["found", "not_found", "escalated"] },
        ],
      },
    },
  ],
};

export function getAgentTemplate(type: AgentType, id: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES[type].find((t) => t.id === id);
}

/* --------------------------------------------------------------------- */
/* Versioning                                                            */
/*                                                                       */
/* Every agent is a stack of immutable versions. Exactly one version is  */
/* `active` (serving in production). Editing produces a `draft` version  */
/* (active+1) that sits alongside the active one until it is published,  */
/* at which point it becomes active and the previous active is archived. */
/* This is an in-memory store seeded from AGENT_RECORDS at v1 active —    */
/* it persists for the browser session (mock, no backend).               */
/* --------------------------------------------------------------------- */

export type VersionState = "active" | "draft" | "archived";
export type AgentVersion = {
  version: number;
  state: VersionState;
  record: AgentRecord;
  /** Human-friendly "last touched" label for display. */
  updatedAt: string;
};

const VERSIONS: Record<string, AgentVersion[]> = {};

/**
 * Agents with a pre-built version history for the demo. `festive_offers` ships
 * at v3: v1 and v2 are prior (v2 is the live one), v3 is a pending draft that
 * adds personalization (input variables) and a WhatsApp confirmation tool.
 */
const VERSION_SEEDS: Record<string, () => AgentVersion[]> = {
  a_offers: () => {
    const active = AGENT_RECORDS.a_offers;
    const v1: AgentRecord = {
      ...active,
      status: "paused",
      tools: ["knowledge_lookup"],
      inputVars: [],
      masterPrompt:
        "# Role\nYou are **Festive Offers**, helping Paytm customers discover festive cashback deals on WhatsApp.\n\n## Goals\n- Tell customers about the current festive offer.\n- Keep replies short and friendly.\n\n## Guardrails\n- Never promise an offer that has expired.",
      knowledgeBase: "## Festive offer\nFlat 10% cashback on recharges above 500, capped at 100 per user.",
    };
    const v3: AgentRecord = {
      ...active,
      status: "draft",
      tools: ["knowledge_lookup", "order_lookup", "send_whatsapp"],
      inputVars: [
        { id: "iv1", name: "first_name" },
        { id: "iv2", name: "cashback_amount" },
      ],
      masterPrompt:
        "# Role\nYou are **Festive Offers**, a personalized festive cashback concierge on WhatsApp.\n\n## Opening\nGreet {{first_name}} by name and mention they have {{cashback_amount}} in unclaimed cashback waiting.\n\n## Tools\nUse {{order_lookup}} to verify qualifying recharges, {{knowledge_lookup}} for offer terms, and {{send_whatsapp}} to send the claim confirmation.\n\n## Guardrails\n- Never promise an offer that has expired.\n- Escalate cashback disputes above 500 to a human.",
      knowledgeBase:
        "## Festive offer\nFlat 10% cashback on recharges above 500, capped at 100 per user.\n\n## How to claim\n1. Recharge above 500 from the Paytm app.\n2. Cashback lands within 24 hours.\n\n## Personalization\nAlways open with the customer's name and their unclaimed cashback amount.",
    };
    return [
      { version: 1, state: "archived", record: v1, updatedAt: "3 weeks ago" },
      { version: 2, state: "active", record: active, updatedAt: "6 days ago" },
      { version: 3, state: "draft", record: v3, updatedAt: "Just now" },
    ];
  },
};

function seedVersions(id: string): AgentVersion[] {
  const custom = VERSION_SEEDS[id];
  if (custom) return custom();
  const rec = AGENT_RECORDS[id];
  if (!rec) return [];
  return [{ version: 1, state: "active", record: rec, updatedAt: "recently" }];
}

/** All versions for an agent, oldest → newest. Seeds v1 on first access. */
export function getVersions(id: string): AgentVersion[] {
  if (!VERSIONS[id]) {
    const seeded = seedVersions(id);
    if (seeded.length === 0) return [];
    VERSIONS[id] = seeded;
  }
  return VERSIONS[id];
}

/** The version currently serving in production (falls back to newest). */
export function getActiveVersion(id: string): AgentVersion | undefined {
  const vers = getVersions(id);
  return vers.find((v) => v.state === "active") ?? vers.at(-1);
}

/** The pending draft, if any. At most one draft exists at a time. */
export function getDraftVersion(id: string): AgentVersion | undefined {
  return getVersions(id).find((v) => v.state === "draft");
}

/** The newest version (draft if present, otherwise active). */
export function getLatestVersion(id: string): AgentVersion | undefined {
  return getVersions(id).at(-1);
}

/** The version the editor should open: resume the draft if one exists, else the active one. */
export function getEditableVersion(id: string): AgentVersion | undefined {
  return getDraftVersion(id) ?? getActiveVersion(id);
}

function nextNumber(vers: AgentVersion[]): number {
  return (vers.at(-1)?.version ?? 0) + 1;
}

/**
 * Save the working copy as a draft. The active version is untouched.
 * If a draft already exists it is updated in place (no v3 stacking).
 */
export function saveDraftVersion(id: string, record: AgentRecord): AgentVersion {
  const vers = getVersions(id);
  const draft = vers.find((v) => v.state === "draft");
  if (draft) {
    draft.record = { ...record, status: "draft" };
    draft.updatedAt = "Just now";
    return draft;
  }
  const created: AgentVersion = {
    version: nextNumber(vers),
    state: "draft",
    record: { ...record, status: "draft" },
    updatedAt: "Just now",
  };
  vers.push(created);
  return created;
}

/**
 * Publish the working copy as the new active version. Any existing active
 * version is archived. Reuses the draft slot if one is in flight.
 */
export function publishVersion(id: string, record: AgentRecord): AgentVersion {
  const vers = getVersions(id);
  for (const v of vers) if (v.state === "active") v.state = "archived";
  const draft = vers.find((v) => v.state === "draft");
  if (draft) {
    draft.record = { ...record, status: "live" };
    draft.state = "active";
    draft.updatedAt = "Just now";
    return draft;
  }
  const created: AgentVersion = {
    version: nextNumber(vers),
    state: "active",
    record: { ...record, status: "live" },
    updatedAt: "Just now",
  };
  vers.push(created);
  return created;
}

/**
 * Revert to an older version: re-activate the chosen version in place and
 * archive whatever was active. The reverted version keeps its number (it does
 * not spawn a new one) and its record flips back to "live". A pending draft is
 * left untouched so an in-flight edit is not lost.
 */
export function revertToVersion(id: string, version: number): AgentVersion | undefined {
  const vers = getVersions(id);
  const target = vers.find((v) => v.version === version);
  if (!target) return undefined;
  for (const v of vers) if (v.state === "active") v.state = "archived";
  target.state = "active";
  target.record = { ...target.record, status: "live" };
  target.updatedAt = "Just now";
  return target;
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
