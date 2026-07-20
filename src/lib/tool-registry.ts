/**
 * Shared tool registry — the single source of truth for the Tools surface.
 *
 * The Tools table, the tool editor, and the campaign builder's Voice Agent node all
 * read from here. A tool's input parameters each declare a *source*:
 *   - "agent"    — the LLM fills it live from the conversation (declared, not pre-bound)
 *   - "constant" — fixed at tool-config time (API key, a fixed flag)
 *   - "campaign" — a CSV/audience column; only the *slot* is declared here, the actual
 *                  column→slot mapping happens at the Voice Agent node.
 * Outputs are fully bound here and become named variables agents can read downstream.
 */

export type ToolSource = "agent" | "constant" | "campaign";
export type ToolDataType = "String" | "Number" | "Boolean" | "Object" | "Array";
export type ToolParamIn = "header" | "query" | "body" | "path";
export type ToolAuthKind = "none" | "apiKey" | "bearer" | "oauth2" | "jwt";
export type ToolType = "http" | "mcp";
export type ToolHealth = "ok" | "warn";
export type ToolStatus = "draft" | "live";

export type ToolInput = {
  key: string;
  dataType: ToolDataType;
  in: ToolParamIn;
  source: ToolSource;
  /** Constant literal, or — for campaign inputs — the audience column the slot expects. */
  value?: string;
  description: string;
};

export type ToolOutput = { path: string; varName: string; description: string; dataType?: ToolDataType };

export type ToolDef = {
  handle: string;
  description: string;
  type: ToolType;
  method?: string;
  url?: string;
  /** MCP transport (only when type === "mcp"). */
  transport?: "http" | "sse";
  auth: ToolAuthKind;
  health: ToolHealth;
  status: ToolStatus;
  createdAt: string;
  updatedAt: string;
  inputs: ToolInput[];
  outputs: ToolOutput[];
  /**
   * When true, this entry is a **Skill** — an internally-available capability
   * (no external API, no auth, no side-effects) that agents and campaign nodes
   * can invoke. Skills surface on the Skills tab of /agents; Tools surface on
   * the Tools tab.
   */
  isSkill?: boolean;
  /**
   * Skills come in two flavours:
   *   - "function" — a piece of deterministic compute (e.g. calculate DPD from
   *     a date). Returns a typed value (enum · number · boolean).
   *   - "llm"      — a prompt template (a markdown-authored instruction) the
   *     agent invokes with variables. Returns free-form text.
   * Undefined when isSkill is not true.
   */
  skillType?: "function" | "llm";
  /** For enum outputs on Skills — the allowed values. Displayed as chips on the
   *  Skill card and used as the enum source in the campaign-builder picker. */
  outputEnumValues?: Partial<Record<string, string[]>>;
};

export const SKILL_TYPE_LABEL: Record<"function" | "llm", string> = {
  function: "Function",
  llm: "LLM Skill",
};

export const AUTH_LABEL: Record<ToolAuthKind, string> = {
  none: "No auth",
  apiKey: "API key",
  bearer: "Bearer token",
  oauth2: "OAuth 2.0",
  jwt: "JWT",
};

export const TYPE_LABEL: Record<ToolType, string> = {
  http: "HTTP API",
  mcp: "MCP",
};

export const STATUS_LABEL: Record<ToolStatus, string> = {
  draft: "Draft",
  live: "Live",
};

export const TOOLS: ToolDef[] = [
  {
    handle: "send_whatsapp",
    description: "Send a WhatsApp template or session message",
    type: "http",
    method: "POST",
    url: "https://graph.facebook.com/v19.0/{phone_number_id}/messages",
    auth: "apiKey",
    health: "ok",
    status: "live",
    createdAt: "08 Jan 2026",
    updatedAt: "02 Jun 2026",
    inputs: [
      { key: "phone_number_id", dataType: "String", in: "path", source: "constant", value: "10925431", description: "WABA phone number id" },
      { key: "Content-Type", dataType: "String", in: "header", source: "constant", value: "application/json", description: "Payload content type" },
      { key: "to", dataType: "String", in: "body", source: "campaign", value: "phone", description: "Recipient phone (E.164)" },
      { key: "template_name", dataType: "String", in: "body", source: "agent", description: "Template the agent chose to send" },
      { key: "body_text", dataType: "String", in: "body", source: "agent", description: "Resolved message body" },
    ],
    outputs: [
      { path: "$.messages[0].id", varName: "message_id", dataType: "String", description: "WhatsApp message id" },
      { path: "$.messages[0].message_status", varName: "delivery_status", dataType: "String", description: "queued / sent / delivered" },
    ],
  },
  {
    handle: "send_sms",
    description: "Send a DLT-registered transactional SMS",
    type: "http",
    method: "POST",
    url: "https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
    auth: "apiKey",
    health: "ok",
    status: "live",
    createdAt: "08 Jan 2026",
    updatedAt: "19 May 2026",
    inputs: [
      { key: "account_sid", dataType: "String", in: "path", source: "constant", value: "AC_pi_prod", description: "Provider account id" },
      { key: "To", dataType: "String", in: "body", source: "campaign", value: "phone", description: "Recipient phone (E.164)" },
      { key: "From", dataType: "String", in: "body", source: "constant", value: "PAYTM", description: "Registered sender id" },
      { key: "Body", dataType: "String", in: "body", source: "agent", description: "SMS copy" },
    ],
    outputs: [
      { path: "$.sid", varName: "sms_sid", dataType: "String", description: "Message id" },
      { path: "$.status", varName: "sms_status", dataType: "String", description: "Delivery status" },
    ],
  },
  {
    handle: "place_call",
    description: "Place an outbound voice call to a contact",
    type: "http",
    method: "POST",
    url: "https://api.telephony.pi/v1/calls",
    auth: "bearer",
    health: "ok",
    status: "live",
    createdAt: "14 Feb 2026",
    updatedAt: "10 Jun 2026",
    inputs: [
      { key: "to_number", dataType: "String", in: "body", source: "campaign", value: "phone", description: "Number to dial (E.164)" },
      { key: "customer_name", dataType: "String", in: "body", source: "campaign", value: "first_name", description: "Greeting name" },
      { key: "from_number", dataType: "String", in: "body", source: "constant", value: "+911246000000", description: "Caller line" },
      { key: "agent_id", dataType: "String", in: "body", source: "constant", value: "voice_react_v3", description: "Voice agent to attach" },
    ],
    outputs: [
      { path: "$.call.id", varName: "call_id", dataType: "String", description: "Telephony call id" },
      { path: "$.call.status", varName: "call_status", dataType: "String", description: "answered / no_answer / busy" },
      { path: "$.call.duration_sec", varName: "duration_sec", dataType: "Number", description: "Call length in seconds" },
    ],
  },
  /* ---- FinServ · Collections in-call tools ---- */
  {
    handle: "crm_lookup",
    description: "Look up a borrower's loan portfolio and CRM profile from the connected LMS",
    type: "http",
    method: "GET",
    url: "https://api.acmebank.in/crm/v1/borrowers/{customer_id}",
    auth: "oauth2",
    health: "ok",
    status: "live",
    createdAt: "12 Jul 2026",
    updatedAt: "16 Jul 2026",
    inputs: [
      { key: "customer_id", dataType: "String", in: "path", source: "campaign", value: "customer_id", description: "Internal borrower id" },
    ],
    outputs: [
      { path: "$.borrower.name", varName: "borrower_name", dataType: "String", description: "Full name on record" },
      { path: "$.borrower.segment", varName: "segment", dataType: "String", description: "Retail / SME / HNI" },
      { path: "$.borrower.loan_count", varName: "loan_count", dataType: "Number", description: "Active loans on record" },
      { path: "$.borrower.risk_grade", varName: "risk_grade", dataType: "String", description: "A / B / C / D" },
    ],
  },
  {
    handle: "payment_link_gen",
    description: "Generate a Paytm PG payment link for an EMI amount",
    type: "http",
    method: "POST",
    url: "https://securegw.paytm.in/link/create",
    auth: "apiKey",
    health: "ok",
    status: "live",
    createdAt: "12 Jul 2026",
    updatedAt: "16 Jul 2026",
    inputs: [
      { key: "customer_id", dataType: "String", in: "body", source: "campaign", value: "customer_id", description: "Borrower id" },
      { key: "loan_id", dataType: "String", in: "body", source: "campaign", value: "loan_id", description: "Loan reference" },
      { key: "amount", dataType: "Number", in: "body", source: "agent", description: "EMI amount in paise" },
      { key: "expires_in_hours", dataType: "Number", in: "body", source: "constant", value: "48", description: "Link validity" },
    ],
    outputs: [
      { path: "$.short_url", varName: "payment_url", dataType: "String", description: "Paytm PG short link" },
      { path: "$.id", varName: "payment_link_id", dataType: "String", description: "Payment link id" },
      { path: "$.status", varName: "link_status", dataType: "String", description: "created / paid / expired" },
    ],
  },
  {
    handle: "kyc_status_check",
    description: "Check the borrower's KYC completion status via Digio",
    type: "http",
    method: "GET",
    url: "https://api.digio.in/v1/kyc/{customer_id}/status",
    auth: "bearer",
    health: "ok",
    status: "live",
    createdAt: "12 Jul 2026",
    updatedAt: "16 Jul 2026",
    inputs: [
      { key: "customer_id", dataType: "String", in: "path", source: "campaign", value: "customer_id", description: "Borrower id" },
    ],
    outputs: [
      { path: "$.kyc.status", varName: "kyc_status", dataType: "String", description: "verified / pending / failed" },
      { path: "$.kyc.stage_stuck_at", varName: "kyc_stage", dataType: "String", description: "PAN / Aadhaar / Video / null" },
      { path: "$.kyc.rejection_reason", varName: "kyc_reject_reason", dataType: "String", description: "Rejection reason if any" },
    ],
  },
  {
    handle: "check_payment_status",
    description: "Check whether a specific EMI has been paid via the LMS + payment gateway",
    type: "http",
    method: "GET",
    url: "https://api.acmebank.in/lms/v1/loans/{loan_id}/emi_status",
    auth: "oauth2",
    health: "ok",
    status: "live",
    createdAt: "12 Jul 2026",
    updatedAt: "16 Jul 2026",
    inputs: [
      { key: "loan_id", dataType: "String", in: "path", source: "campaign", value: "loan_id", description: "Loan reference" },
      { key: "due_date", dataType: "String", in: "query", source: "campaign", value: "due_date", description: "EMI due date to check" },
    ],
    outputs: [
      { path: "$.emi.status", varName: "payment_status", dataType: "String", description: "paid / unpaid / partial" },
      { path: "$.emi.paid_amount", varName: "paid_amount", dataType: "Number", description: "Amount received (paise)" },
      { path: "$.emi.paid_at", varName: "paid_at", dataType: "String", description: "Timestamp of last payment" },
    ],
  },
  {
    handle: "human_escalation",
    description: "Transfer the live call to a human collections L2 queue",
    type: "http",
    method: "POST",
    url: "https://api.telephony.pi/v1/calls/{call_id}/transfer",
    auth: "bearer",
    health: "ok",
    status: "live",
    createdAt: "12 Jul 2026",
    updatedAt: "16 Jul 2026",
    inputs: [
      { key: "call_id", dataType: "String", in: "path", source: "agent", description: "Live telephony call id" },
      { key: "queue", dataType: "String", in: "body", source: "constant", value: "collections_l2", description: "Target agent queue" },
      { key: "context_note", dataType: "String", in: "body", source: "agent", description: "Short handoff note for the human" },
    ],
    outputs: [
      { path: "$.transfer.status", varName: "transfer_status", dataType: "String", description: "queued / connected / failed" },
      { path: "$.transfer.wait_sec", varName: "wait_sec", dataType: "Number", description: "Estimated wait in seconds" },
    ],
  },
  /* ---- FinServ · Skills (v1) ------------------------------------------ *
   * Skills = deterministic compute over lead memory + upstream vars, returning
   * a typed value (enum / number / boolean). No external URL, no auth, no
   * side-effects. Every Skill has isSkill=true and surfaces on the Skills tab
   * of /agents. Skills are still invokable from an API Tool Call node in the
   * campaign builder — the picker groups Skills + Tools together.
   */
  {
    handle: "calculate_dpd_status",
    description: "Derive DPD status from an EMI due date (Skill · deterministic compute)",
    type: "http",           // stored as "http" so the shared schema fits; UI treats it as Skill via isSkill
    method: "COMPUTE",
    url: "local://skill/calculate_dpd_status",
    auth: "none",
    health: "ok",
    status: "live",
    createdAt: "16 Jul 2026",
    updatedAt: "17 Jul 2026",
    isSkill: true,
    skillType: "function",
    inputs: [
      { key: "due_date", dataType: "String", in: "body", source: "campaign", value: "due_date", description: "EMI due date (YYYY-MM-DD)" },
    ],
    outputs: [
      { path: "$.dpd_status", varName: "dpd_status", dataType: "String", description: "pre_due / due_today / post_due" },
    ],
    outputEnumValues: { dpd_status: ["pre_due", "due_today", "post_due"] },
  },
  {
    handle: "calculate_dpd_bucket",
    description: "If DPD status is post_due, classify into DPD bucket (Skill · deterministic compute)",
    type: "http",
    method: "COMPUTE",
    url: "local://skill/calculate_dpd_bucket",
    auth: "none",
    health: "ok",
    status: "live",
    createdAt: "16 Jul 2026",
    updatedAt: "17 Jul 2026",
    isSkill: true,
    skillType: "function",
    inputs: [
      { key: "due_date", dataType: "String", in: "body", source: "campaign", value: "due_date", description: "EMI due date (YYYY-MM-DD)" },
    ],
    outputs: [
      { path: "$.dpd_bucket", varName: "dpd_bucket", dataType: "String", description: "early_bucket / mid_bucket / late_bucket · null if not post_due" },
    ],
    outputEnumValues: { dpd_bucket: ["early_bucket (1–7d)", "mid_bucket", "late_bucket (30+ d)"] },
  },
  {
    handle: "calculate_ptp_rate",
    description: "Compute lead's Promise-to-Pay kept rate from PTP register (Skill · deterministic compute)",
    type: "http",
    method: "COMPUTE",
    url: "local://skill/calculate_ptp_rate",
    auth: "none",
    health: "ok",
    status: "live",
    createdAt: "17 Jul 2026",
    updatedAt: "17 Jul 2026",
    isSkill: true,
    skillType: "function",
    inputs: [
      { key: "customer_id", dataType: "String", in: "body", source: "campaign", value: "customer_id", description: "Borrower id" },
    ],
    outputs: [
      { path: "$.ptp_rate_pct", varName: "ptp_rate_pct", dataType: "Number", description: "(promises_kept / promises_made) × 100" },
    ],
  },
  {
    handle: "check_ptp_status",
    description: "Classify PTP status for the current EMI (Skill · deterministic compute)",
    type: "http",
    method: "COMPUTE",
    url: "local://skill/check_ptp_status",
    auth: "none",
    health: "ok",
    status: "live",
    createdAt: "17 Jul 2026",
    updatedAt: "17 Jul 2026",
    isSkill: true,
    skillType: "function",
    inputs: [
      { key: "loan_id",  dataType: "String", in: "body", source: "campaign", value: "loan_id",  description: "Loan reference" },
      { key: "due_date", dataType: "String", in: "body", source: "campaign", value: "due_date", description: "EMI due date" },
    ],
    outputs: [
      { path: "$.ptp_status", varName: "ptp_status", dataType: "String", description: "no_ptp / kept / broken" },
    ],
    outputEnumValues: { ptp_status: ["no_ptp", "kept", "broken"] },
  },
  {
    handle: "check_right_party_connectivity",
    description: "Was the last outreach on a given channel a Right-Party Contact? (Skill · deterministic compute)",
    type: "http",
    method: "COMPUTE",
    url: "local://skill/check_rpc",
    auth: "none",
    health: "ok",
    status: "live",
    createdAt: "17 Jul 2026",
    updatedAt: "17 Jul 2026",
    isSkill: true,
    skillType: "function",
    inputs: [
      { key: "customer_id", dataType: "String", in: "body", source: "campaign", value: "customer_id", description: "Borrower id" },
      { key: "channel",     dataType: "String", in: "body", source: "agent",                              description: "voice / whatsapp / sms" },
    ],
    outputs: [
      { path: "$.is_rpc", varName: "is_rpc", dataType: "Boolean", description: "true if the last touch on this channel reached the right party" },
    ],
  },
  /* ---- LLM Skill · one prompt-template example -----------------------
   * LLM Skills are markdown-authored instructions the agent invokes with
   * variables. The engine sends the prompt + variables to the LLM and returns
   * the response as a free-form text output. No enum, no typed compute — the
   * value of the skill is the prompt itself, versioned + reusable across
   * campaigns and agents.
   */
  {
    handle: "compose_pl_call_summary",
    description: "Compose a 2-line disposition summary for a Personal-Loan collections call (LLM Skill · prompt template)",
    type: "http",
    method: "COMPUTE",
    url: "local://skill/compose_pl_call_summary",
    auth: "none",
    health: "ok",
    status: "live",
    createdAt: "17 Jul 2026",
    updatedAt: "18 Jul 2026",
    isSkill: true,
    skillType: "llm",
    inputs: [
      { key: "disposition",      dataType: "String", in: "body", source: "agent", description: "Voice agent's captured disposition" },
      { key: "ptp_date",         dataType: "String", in: "body", source: "agent", description: "Promised-to-pay date if captured" },
      { key: "ptp_amount",       dataType: "Number", in: "body", source: "agent", description: "Promised amount if captured" },
      { key: "borrower_context", dataType: "String", in: "body", source: "campaign", value: "segment", description: "Any context lines from the lead memory" },
    ],
    outputs: [
      { path: "$.summary", varName: "call_summary", dataType: "String", description: "Two-line CRM-friendly summary of the call" },
    ],
  },
];

export function getTool(handle: string): ToolDef | undefined {
  return TOOLS.find((t) => t.handle === handle);
}
