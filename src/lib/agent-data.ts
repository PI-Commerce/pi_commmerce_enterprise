/**
 * Agent records — seed data for the agent builder (create starts blank, edit
 * hydrates from here). Tools are referenced by handle from the tool registry.
 */

export type AgentType = "voice" | "chat";
export type PostCallVar = { id: string; name: string; prompt: string };

export type AgentRecord = {
  id: string;
  name: string;
  type: AgentType;
  status: "live" | "draft" | "paused";
  tools: string[];
  masterPrompt: string;
  knowledgeBase: string;
  postCall: PostCallVar[];
};

export const AGENT_RECORDS: Record<string, AgentRecord> = {
  a_concierge: {
    id: "a_concierge",
    name: "pi_concierge",
    type: "chat",
    status: "live",
    tools: ["send_whatsapp", "order_lookup", "knowledge_lookup"],
    masterPrompt:
      "# Role\nYou are **Pi Concierge**, the first line of help for Paytm customers on WhatsApp.\n\n## Goals\n- Understand why the customer reached out and resolve it on first contact.\n- Be warm, concise, and never over-promise.\n\n## Tools\nUse {{order_lookup}} to check delivery status before answering order questions, and {{knowledge_lookup}} for policy or how-to questions. Send confirmations with {{send_whatsapp}}.\n\n## Guardrails\n- Never give investment advice.\n- Escalate anything involving a failed payment over ₹10,000 to a human.",
    knowledgeBase:
      "## Refund policy\nRefunds are processed within **5–7 business days** to the original payment method.\n\n## Delivery SLAs\n- Metro cities: 2–3 days\n- Tier-2/3: 4–6 days\n\n## Escalation\nFor disputes above ₹10,000, collect the order id and route to the payments desk.",
    postCall: [
      { id: "p1", name: "resolution_status", prompt: "Did the agent resolve the customer's issue? Answer one of: resolved, pending, escalated." },
      { id: "p2", name: "csat_estimate", prompt: "Estimate the customer's satisfaction from 1-5 based on their tone in the transcript." },
    ],
  },
  a_voice_react: {
    id: "a_voice_react",
    name: "reactivation_voice",
    type: "voice",
    status: "live",
    tools: ["place_call", "crm_query", "order_lookup"],
    masterPrompt:
      "# Role\nYou are **Reactivation Voice**, calling dormant Paytm traders to bring them back.\n\n## Opening\nGreet the customer by first name and reference how long they've been away.\n\n## Tools\nPull context with {{crm_query}} at the start of the call so you can personalize the pitch.\n\n## Guardrails\n- Keep the call under 3 minutes.\n- If the customer asks to stop, apologize and end the call immediately.",
    knowledgeBase:
      "## Win-back offer\nEligible traders get **zero brokerage for 30 days**.\n\n## Objection handling\n- \"Too busy\": offer a callback at a time they choose.\n- \"Not interested\": thank them and close politely.",
    postCall: [
      { id: "p1", name: "callback_requested", prompt: "Did the customer ask for a callback? If yes, capture the requested time." },
      { id: "p2", name: "reactivation_intent", prompt: "Rate the customer's intent to reactivate: high, medium, or low." },
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
    masterPrompt:
      "# Role\nYou are **Win-back Voice**, calling high-value lapsed customers.\n\n## Tools\nCheck history with {{crm_query}}. If the customer left over a billing dispute, you may offer a goodwill refund via {{refund_initiate}} (max ₹2,000).\n\n## Guardrails\n- Confirm the refund amount with the customer before initiating.",
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
    masterPrompt:
      "# Role\nYou are **L1 Support** for Paytm orders and payments.\n\n## Tools\nLook up orders with {{order_lookup}}, answer policy questions with {{knowledge_lookup}}, and for confirmed failures initiate a refund with {{refund_initiate}}.\n\n## Guardrails\n- Verify the order belongs to the customer before any refund.",
    knowledgeBase: "## Refund eligibility\nOnly orders marked `returned` or `failed` are refundable.",
    postCall: [
      { id: "p1", name: "issue_category", prompt: "Categorize the issue: delivery, payment, refund, or other." },
      { id: "p2", name: "refund_initiated", prompt: "Was a refund initiated during this conversation? yes or no." },
    ],
  },
};

export function getAgentRecord(id: string): AgentRecord | undefined {
  return AGENT_RECORDS[id];
}
