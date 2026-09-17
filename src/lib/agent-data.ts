/**
 * Agent records — seed data for the agent builder (create starts blank, edit
 * hydrates from here). Tools are referenced by handle from the tool registry.
 */
import { getTool } from "./tool-registry";

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
  /** Optional eval instruction; when omitted the builder shows a boilerplate default. */
  evalPrompt?: string;
};

export const AGENT_RECORDS: Record<string, AgentRecord> = {
  a_voice_react: {
    id: "a_voice_react",
    name: "reactivation_voice",
    type: "voice",
    status: "live",
    tools: ["place_call", "crm_query", "order_lookup"],
    masterPrompt:
      "# Role\nYou are **Reactivation Voice**. You power outbound reactivation calls for two campaigns: **Soundbox Reactivation** (dormant Paytm Soundbox merchants — chai wallahs, kirana stores, small retailers whose device has been idle for weeks) and **Cart Abandonment** (D2C shoppers who left items in the cart).\n\n## Opening\nGreet the customer or merchant by first name and reference the specific reason for calling — 'we noticed your Soundbox has been quiet for a while' or 'we saw you didn't finish your order'.\n\n## Tools\nStart every call by pulling context with {{crm_query}}. For merchant callbacks, check the last active date. For cart callbacks, use {{order_lookup}} to see what was left behind. Only place the call after that lookup with {{place_call}}.\n\n## Guardrails\n- Keep the call under 3 minutes.\n- Never pressure. If the customer asks to stop, apologise and end the call immediately.\n- Do not quote offers we haven't approved for their tier.",
    knowledgeBase:
      "## Soundbox reactivation offers\n- Waived rental for 2 months for merchants dormant 30-90 days.\n- Free device replacement for merchants dormant 90+ days whose device may be faulty.\n\n## Cart abandonment offers\n- Free shipping on orders above ₹499.\n- Up to 10% discount code (share only if the customer asks about price).\n\n## Objection handling\n- 'Too busy': schedule a callback at a time they choose.\n- 'Device not working': offer to route to the replacement queue.\n- 'Not interested': thank them and end warmly.",
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
  a_collections_voice: {
    id: "a_collections_voice",
    name: "pl_collections_voice",
    type: "voice",
    status: "live",
    tools: ["place_call", "crm_query", "send_whatsapp"],
    masterPrompt:
      "# Role\nYou are **PL Collections Voice**. You power the **Personal Loan DPD Collections** campaign — outbound calls to borrowers whose EMI is past its due date.\n\n## Opening\nGreet the borrower by first name. Reference their loan account by the last four digits only. State the overdue amount and days past due plainly.\n\n## Tools\nPull the account with {{crm_query}} before dialling. Place the call with {{place_call}}. If the borrower asks for a payment link on WhatsApp, send it with {{send_whatsapp}}.\n\n## Guardrails\n- Follow RBI fair-practices tone: polite, no threats, no calls before 8am or after 7pm local time.\n- Never disclose the overdue amount to anyone other than the borrower.\n- If the borrower disputes the amount, do not push — route to a human agent and close the call.",
    knowledgeBase:
      "## Bucket-based scripts\n- DPD 1-15 (soft): remind, offer autopay setup.\n- DPD 16-30 (firm): explain late-fee accrual, offer partial payment.\n- DPD 31-60 (recovery): warn about credit-bureau reporting, offer a settlement path.\n\n## Payment options\n- WhatsApp payment link (default).\n- UPI collect request.\n- Bank transfer to the loan account.",
    postCall: [
      {
        id: "p1",
        name: "promise_to_pay",
        prompt: "Did the borrower give a promise-to-pay? Capture the amount and date.",
      },
      {
        id: "p2",
        name: "payment_link_sent",
        prompt: "Was a payment link sent during or after the call? yes or no.",
      },
      {
        id: "p3",
        name: "dispute_raised",
        prompt: "Did the borrower dispute the amount? yes or no; if yes capture the reason.",
      },
    ],
  },
  a_renewal_voice: {
    id: "a_renewal_voice",
    name: "renewal_voice",
    type: "voice",
    status: "live",
    tools: ["crm_query", "place_call", "knowledge_lookup"],
    masterPrompt:
      "# Role\nYou are **Renewal Voice**, the consult agent for the **Insurance Renewal** campaign. You call policyholders whose motor or health cover is about to lapse and help them renew without a break.\n\n## Opening\nGreet the customer by first name. Say which policy is up for renewal (motor / health / two-wheeler) and the exact expiry date.\n\n## Tools\nStart with {{crm_query}} to pull the policy record and any pending claim. Use {{knowledge_lookup}} to answer questions about no-claim bonus, add-ons, and price differences with last year. Place the call with {{place_call}}.\n\n## Guardrails\n- Never quote a premium you haven't looked up.\n- If the customer wants to change cover, book a call-back with an insurance advisor. Do not sell add-ons on your own.\n- End the call the moment the customer asks to stop.",
    knowledgeBase:
      "## Renewal talking points\n- No-claim bonus is preserved if renewed before expiry — restart if late.\n- Early-bird discount up to 5% if renewed 15+ days before expiry.\n- Instant renewal via WhatsApp link, no paperwork.\n\n## Objections\n- 'Getting a cheaper quote elsewhere' → offer to match up to 3%.\n- 'Don't need it this year' → explain third-party liability requirement for motor.",
    postCall: [
      {
        id: "p1",
        name: "renewal_intent",
        prompt: "Did the customer intend to renew? yes / no / undecided.",
      },
      {
        id: "p2",
        name: "callback_requested",
        prompt: "Did the customer ask for a callback with a human advisor? If yes capture the time.",
      },
      {
        id: "p3",
        name: "objection_reason",
        prompt: "If the customer declined, capture the primary reason (price, alternative provider, no longer needed, other).",
      },
    ],
  },
  a_winback: {
    id: "a_winback",
    name: "loyalty_voice",
    type: "voice",
    status: "live",
    tools: ["place_call", "crm_query", "send_whatsapp"],
    masterPrompt:
      "# Role\nYou are **Loyalty Voice**. You power the **First Citizens Loyalty Card Upsell** campaign — outbound calls that invite existing retail customers to enrol in a Loyalty Card tier (Silver, Gold, Platinum, Black) or upgrade the tier they already hold.\n\n## Opening\nGreet the customer by first name. Reference their most recent purchase to make the call feel personal, then explain the tier you're inviting them to and one concrete benefit that matches their shopping pattern.\n\n## Tools\nStart with {{crm_query}} to pull their 12-month spend, current tier, and last-purchased category. Place the call with {{place_call}}. If the customer wants to enrol on the spot, send the enrolment link on WhatsApp with {{send_whatsapp}}.\n\n## Guardrails\n- Only invite to a tier they qualify for (Silver ≥ ₹5k/yr, Gold ≥ ₹25k/yr, Platinum ≥ ₹1L/yr, Black by-invite only).\n- Do not disclose other customers' Black-tier status.\n- If they decline, thank them and do not retry within 30 days.",
    knowledgeBase:
      "## First Citizens tiers at a glance\n- **Silver**: 2% back, free tailoring on ethnic wear, early sale access.\n- **Gold**: 4% back, free alterations, priority checkout, birthday voucher.\n- **Platinum**: 6% back, dedicated stylist, home trials, free shipping.\n- **Black**: by invite only, private previews, concierge, home delivery from every store.\n\n## Objection handling\n- 'Already have a card elsewhere' → explain non-exclusivity, offer welcome credit.\n- 'Don't shop enough' → offer Silver (free, no minimum).\n- 'What's the catch' → confirm no annual fee up to Gold; Platinum has ₹2,000 annual fee waived on ₹1L+ spend.",
    postCall: [
      {
        id: "p1",
        name: "tier_offered",
        prompt: "Which tier did the agent invite the customer to? Silver / Gold / Platinum / Black.",
      },
      {
        id: "p2",
        name: "enrolment_status",
        prompt: "Did the customer enrol? enrolled, requested link, considering, or declined.",
      },
      {
        id: "p3",
        name: "primary_benefit_liked",
        prompt: "Which benefit did the customer respond to most positively (if any)?",
      },
    ],
  },
};

export function getAgentRecord(id: string): AgentRecord | undefined {
  return AGENT_RECORDS[id];
}

/** Resolve an agent by its id OR its name (the voice node stores the name). */
export function resolveAgent(nameOrId?: string): AgentRecord | undefined {
  if (!nameOrId) return undefined;
  return (
    AGENT_RECORDS[nameOrId] ??
    Object.values(AGENT_RECORDS).find((a) => a.name === nameOrId)
  );
}

export function voiceAgents(): AgentRecord[] {
  return Object.values(AGENT_RECORDS).filter((a) => a.type === "voice");
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
