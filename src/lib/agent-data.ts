/**
 * Agent records — seed data for the agent builder (create starts blank, edit
 * hydrates from here). Tools are referenced by handle from the tool registry.
 *
 * FinServ branch: pruned to a single Collections voice agent. Retail/other
 * agents (pi_concierge, reactivation_voice, kyc_helper, pricing_qa,
 * winback_voice, l1_support) are removed on this branch — a clean Collections
 * demo without unrelated agent clutter. Add new BFSI agents (Onboarding,
 * Renewals, etc.) here as future packs land.
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
  a_collections: {
    id: "a_collections",
    name: "collections_voice",
    type: "voice",
    status: "live",
    tools: ["place_call", "crm_lookup", "payment_link_gen", "check_payment_status", "kyc_status_check", "human_escalation"],
    masterPrompt:
      "# Role\nYou are the **AcmeBank Collections Voice Agent**, calling borrowers whose Personal-Loan EMIs are due or past due.\n\n## Mandatory disclosure (RBI compliance)\nOpen every call with: *\"Namaste, this call is from AcmeBank collections. This call may be recorded for quality and compliance purposes.\"* Identify yourself as an AI assistant if the borrower asks directly.\n\n## Goals\n1. **Right-party verification** — confirm you're speaking to {{first_name}}. If not, disposition as `Wrong-Number` and end politely.\n2. **State the case** — outstanding EMI (₹{{emi_amount}}), due date, and current DPD.\n3. **Offer to pay now** — share a Razorpay link via {{payment_link_gen}}, OR capture a **Promise-to-Pay** (specific date + amount).\n4. **Handle objections** — if the borrower disputes the amount or is unable to pay, capture the reason. Hand off to L2 via {{human_escalation}} only when the borrower asks for a human or the case exceeds the AI's authority.\n\n## Tools\n- {{crm_lookup}} at call open to pull borrower name, segment, active loans, risk grade\n- {{check_payment_status}} to verify whether payment landed (esp. after \"Already-Paid\" claim)\n- {{payment_link_gen}} to share a payment link over WhatsApp\n- {{kyc_status_check}} if the borrower mentions KYC/document issues blocking payment\n- {{human_escalation}} for dispute / complex refusal cases\n\n## Guardrails\n- Calls only within the **07:00–19:00 IST** RBI/TRAI recovery window.\n- Never threaten, intimidate, or use abusive language. Never disclose the debt to third parties.\n- If the borrower asks to stop calling, apologize, end the call, and disposition as `Refuses`.\n- Keep calls under 4 minutes.",
    knowledgeBase:
      "## Promise-to-Pay capture\nAsk for a specific date AND amount. Confirm both before ending. Accept partial promises (any positive amount below the outstanding).\n\n## Settlement authority\nThe AI has no settlement authority. If the borrower asks for a settlement/waiver, offer to escalate to L2 via {{human_escalation}}.\n\n## Payment methods supported\nRazorpay UPI, cards, netbanking. NEFT/RTGS is not supported through the generated link — direct the borrower to internet banking if they insist.\n\n## Common objections\n- **\"Already paid\"** — ask for payment mode + date, then verify with {{check_payment_status}}. If unverified, capture the details and disposition as `Already-Paid` with a note.\n- **\"Salary not credited\"** — capture PTP for the next salary date (typical 1st or 7th of the month).\n- **\"Not my loan\"** — if the borrower is adamant, disposition as `Dispute` and escalate.\n- **\"KYC pending\"** — run {{kyc_status_check}}; if stuck at Video KYC, direct to the Digio self-serve link.",
    postCall: [
      { id: "p1", name: "disposition", prompt:
        "Classify the call into EXACTLY ONE of: PTP-Open, PTP-Kept, PTP-Partial, PTP-Broken, Already-Paid, Unable-to-Pay, Wrong-Number, Callback-Later, Dispute, Refuses, No-Answer. PTP-Kept / PTP-Partial / PTP-Broken are ONLY for follow-up calls where a prior promise existed — for a first call the correct PTP outcome is PTP-Open." },
      { id: "p2", name: "ptp_date", prompt:
        "If disposition is PTP-Open (or any PTP variant with a promised date), extract the promised payment date in YYYY-MM-DD; otherwise null." },
      { id: "p3", name: "ptp_amount", prompt:
        "If a PTP amount was captured, extract the amount in rupees as a number; otherwise null." },
      { id: "p4", name: "callback_time", prompt:
        "If disposition is Callback-Later, extract the borrower's preferred callback date and time; otherwise null." },
      { id: "p5", name: "call_sentiment", prompt:
        "Overall borrower sentiment during the call: positive, neutral, or negative." },
      { id: "p6", name: "escalation_reason", prompt:
        "If {{human_escalation}} was invoked, capture the short reason for escalation; otherwise null." },
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

/** Output variables an agent's tools expose downstream (e.g. `check_payment_status.payment_status`). */
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
