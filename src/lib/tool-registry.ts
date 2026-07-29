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

/**
 * `agent` is the legacy source used by seeded tools where the LLM fills the
 * value live during an in-call conversation. New tools created via the editor
 * only expose `campaign` and `constant` — `agent` remains in the type union
 * for backwards compatibility with the seed data and is displayed with a
 * "legacy" pill until the user re-maps it.
 */
export type ToolSource = "agent" | "constant" | "campaign";
export type ToolDataType = "String" | "Number" | "Boolean" | "Object" | "Array";
export type ToolParamIn = "header" | "query" | "body" | "path";
export type ToolAuthKind = "none" | "apiKey" | "bearer" | "oauth2" | "jwt";
/**
 * v1 tools are all plain HTTP APIs. The MCP option was cut before launch to
 * keep the editor simple; the union stays a named type so consumers can add
 * variants later without touching every call site.
 */
export type ToolType = "http";
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

/**
 * A single node in the request-body tree. Uniform shape so any node can be a
 * leaf (String/Number/Boolean) or a container (Object/Array):
 *  - Object → `children` holds named fields (leaves or other containers)
 *  - Array  → `children` holds ordered items; each item's `key` is ignored,
 *             the positional index is used when serializing
 *  - Leaf   → `source` + `value` decide what is sent (see {@link ToolSource})
 *
 * The tree collapses cleanly to JSON via {@link serializeBody}; the same tree
 * can be produced back from a JSON blob via {@link parseBody} (in
 * `src/lib/tool-body.ts`), which is how the "Raw JSON" editor tab round-trips
 * user edits without losing variable bindings encoded as `{{campaign.<col>}}`.
 */
export type BodyNode = {
  id: string;
  /** Object-field name. Empty string for array items (position-indexed). */
  key: string;
  dataType: ToolDataType;
  // Leaf-only
  source?: ToolSource;
  value?: string;
  description?: string;
  // Container-only (Object or Array)
  children?: BodyNode[];
};

/** Top-level body shape. Most APIs use `object`; `array` supports batch endpoints. */
export type BodyRoot = { rootType: "object" | "array"; nodes: BodyNode[] };

/**
 * Optional saved test-run response. When present, the editor's Response Schema
 * card renders it as a JSON tree with per-leaf "map to variable" affordances;
 * the tool card also shows a "tested <at>" pill.
 */
export type TestResponse = {
  status: number;
  body: unknown;
  at: string;
  durationMs?: number;
};

export type ToolDef = {
  handle: string;
  description: string;
  type: ToolType;
  method?: string;
  url?: string;
  auth: ToolAuthKind;
  health: ToolHealth;
  status: ToolStatus;
  createdAt: string;
  updatedAt: string;
  inputs: ToolInput[];
  /**
   * Structured request body. When present, `inputs` should not contain any
   * `in: "body"` rows — the body flows entirely through this tree. Legacy
   * tools continue to keep body fields in `inputs`; the editor migrates them
   * into a tree on load.
   */
  body?: BodyRoot;
  outputs: ToolOutput[];
  /** Saved response from the last Test run. See {@link TestResponse}. */
  mockResponse?: TestResponse;
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
    mockResponse: {
      status: 200,
      at: "24 Jul 2026, 11:22",
      durationMs: 384,
      body: {
        id: "plink_9x82c1",
        short_url: "https://p.paytm/ln/9x82c1",
        status: "created",
        amount: 449900,
        currency: "INR",
        expires_at: "2026-07-26T11:22:00Z",
        borrower: { customer_id: "cust_9821", loan_id: "LN-4471" },
      },
    },
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
    mockResponse: {
      status: 200,
      at: "24 Jul 2026, 11:23",
      durationMs: 268,
      body: {
        kyc: {
          status: "pending",
          stage_stuck_at: "Video",
          rejection_reason: null,
          submitted_at: "2026-07-20T09:14:02Z",
        },
        customer_id: "cust_9821",
      },
    },
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
  /**
   * Nested-body demo. Shows off the tree editor + campaign mapping in three
   * shapes at once: a scalar (`customer_id`), a nested object (`pickup_address`),
   * and an array of objects (`items[]`). The mock response is rich enough to
   * exercise the checkbox-based output picker (leaves + array `[*]` mapping).
   */
  {
    handle: "order_return_create",
    description: "Create a return with pickup address and per-line items",
    type: "http",
    method: "POST",
    url: "https://api.orders.pi/v1/returns",
    auth: "bearer",
    health: "ok",
    status: "live",
    createdAt: "22 Jun 2026",
    updatedAt: "24 Jul 2026",
    inputs: [
      { key: "Content-Type", dataType: "String", in: "header", source: "constant", value: "application/json", description: "Payload content type" },
      { key: "Idempotency-Key", dataType: "String", in: "header", source: "campaign", value: "return_request_id", description: "Idempotency key per request" },
    ],
    body: {
      rootType: "object",
      nodes: [
        { id: "seed_ret_1", key: "customer_id", dataType: "String", source: "campaign", value: "customer_id", description: "Internal customer id" },
        { id: "seed_ret_2", key: "order_id", dataType: "String", source: "campaign", value: "order_id", description: "Order the return is against" },
        { id: "seed_ret_3", key: "reason", dataType: "String", source: "constant", value: "customer_request", description: "High-level return reason" },
        {
          id: "seed_ret_4", key: "pickup_address", dataType: "Object", description: "Where the courier collects from",
          children: [
            { id: "seed_ret_4a", key: "line1", dataType: "String", source: "campaign", value: "address_line1", description: "Street address" },
            { id: "seed_ret_4b", key: "city", dataType: "String", source: "campaign", value: "city", description: "City" },
            { id: "seed_ret_4c", key: "pincode", dataType: "String", source: "campaign", value: "pincode", description: "6-digit PIN" },
            { id: "seed_ret_4d", key: "state", dataType: "String", source: "campaign", value: "state", description: "State code" },
          ],
        },
        {
          id: "seed_ret_5", key: "items", dataType: "Array", description: "One entry per SKU being returned",
          children: [
            {
              id: "seed_ret_5a", key: "", dataType: "Object",
              children: [
                { id: "seed_ret_5a1", key: "sku", dataType: "String", source: "campaign", value: "return_sku", description: "SKU to return" },
                { id: "seed_ret_5a2", key: "qty", dataType: "Number", source: "campaign", value: "return_qty", description: "Quantity" },
                { id: "seed_ret_5a3", key: "reason_code", dataType: "String", source: "campaign", value: "return_reason_code", description: "Per-line reason code" },
              ],
            },
          ],
        },
      ],
    },
    outputs: [
      { path: "$.return.id", varName: "return_id", dataType: "String", description: "Return reference" },
      { path: "$.return.status", varName: "return_status", dataType: "String", description: "created / scheduled / rejected" },
    ],
    mockResponse: {
      status: 201,
      at: "24 Jul 2026, 11:04",
      durationMs: 462,
      body: {
        return: {
          id: "ret_51a9c2",
          status: "scheduled",
          pickup: { scheduled_for: "2026-07-27", slot: "10:00-13:00", courier: "BlueDart" },
          refund_estimate: { amount: 149900, currency: "INR", eta_days: 5 },
          items: [
            { sku: "PIX-A100", qty: 1, tracking: "BD9982710021", refund_amount: 149900 },
            { sku: "SCR-GLS", qty: 2, tracking: "BD9982710022", refund_amount: 100000 },
          ],
        },
        customer_id: "cust_9821",
      },
    },
  },
];

/**
 * Note for the tech team on lead-memory computed fields.
 *
 * v1 does not surface Skills as a user-facing construct. The four fields that
 * populate `lead.memory.*` for the collections useCase — dpd_status,
 * dpd_bucket, ptp_rate_pct, ptp_status — are engine computations governed by
 * per-campaign Business Rules (configured on the Start node → Business Rules
 * panel; see Phase 3). Same story for retention when it comes online.
 *
 * RPC (Right-Party Contact) is a cohort-reachability rollup computed at
 * analytics time. Per lead:
 *   is_rpc(lead) = ∃ voice interaction in the run where
 *                    disposition ∉ {"Wrong-Number", "No-Answer", null}
 *   RPC rate    = # leads with is_rpc=true / # leads with any voice attempt.
 *
 * Aggregates across every Voice AI node in the campaign (multi-voice flows
 * just work). WhatsApp / SMS do not contribute to RPC in v1.
 */

export function getTool(handle: string): ToolDef | undefined {
  return TOOLS.find((t) => t.handle === handle);
}
