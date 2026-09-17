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
  {
    handle: "crm_query",
    description: "Look up a customer's CRM profile and segment",
    type: "http",
    method: "GET",
    url: "https://api.crm.pi/v2/customers/{customer_id}",
    auth: "oauth2",
    health: "ok",
    status: "live",
    createdAt: "21 Nov 2025",
    updatedAt: "30 May 2026",
    inputs: [
      { key: "customer_id", dataType: "String", in: "path", source: "campaign", value: "customer_id", description: "Internal customer id" },
    ],
    outputs: [
      { path: "$.data.tier", varName: "tier", dataType: "String", description: "Loyalty tier" },
      { path: "$.data.lifetime_value", varName: "lifetime_value", dataType: "Number", description: "LTV in paise" },
      { path: "$.data.churn_risk", varName: "churn_risk", dataType: "String", description: "low / medium / high" },
    ],
  },
  {
    handle: "push_audience",
    description: "Sync a contact into a Meta custom audience",
    type: "http",
    method: "POST",
    url: "https://graph.facebook.com/v19.0/{audience_id}/users",
    auth: "oauth2",
    health: "warn",
    status: "draft",
    createdAt: "03 Jun 2026",
    updatedAt: "12 Jun 2026",
    inputs: [
      { key: "audience_id", dataType: "String", in: "path", source: "constant", value: "23847900112", description: "Custom audience id" },
      { key: "schema", dataType: "String", in: "body", source: "constant", value: "PHONE_SHA256", description: "Hashing schema" },
      { key: "data", dataType: "String", in: "body", source: "campaign", value: "phone", description: "Hashed phone to upload" },
    ],
    outputs: [
      { path: "$.num_received", varName: "num_received", dataType: "Number", description: "Rows accepted" },
      { path: "$.num_invalid_entries", varName: "num_invalid", dataType: "Number", description: "Rows rejected" },
    ],
  },
  {
    handle: "customer_context",
    description: "Fetch real-time customer context for the agent",
    type: "http",
    method: "GET",
    url: "https://internal.pi/context/v1/customer",
    auth: "none",
    health: "ok",
    status: "live",
    createdAt: "29 Mar 2026",
    updatedAt: "07 Jun 2026",
    inputs: [
      { key: "customer_id", dataType: "String", in: "query", source: "campaign", value: "customer_id", description: "Internal customer id" },
      { key: "include", dataType: "String", in: "query", source: "constant", value: "segment,last_seen,lang", description: "Context blocks to return" },
    ],
    outputs: [
      { path: "$.segment", varName: "segment", dataType: "String", description: "Behavioural segment" },
      { path: "$.last_seen", varName: "last_seen", dataType: "String", description: "Last active timestamp" },
      { path: "$.preferred_lang", varName: "preferred_lang", dataType: "String", description: "Preferred language" },
    ],
  },
  {
    handle: "order_lookup",
    description: "Look up a customer's latest order and delivery status",
    type: "http",
    method: "GET",
    url: "https://api.orders.pi/v1/orders",
    auth: "apiKey",
    health: "ok",
    status: "live",
    createdAt: "11 Dec 2025",
    updatedAt: "05 Jun 2026",
    inputs: [
      { key: "customer_id", dataType: "String", in: "query", source: "campaign", value: "customer_id", description: "Internal customer id" },
      { key: "order_id", dataType: "String", in: "query", source: "agent", description: "Order the customer is asking about" },
    ],
    outputs: [
      { path: "$.order.delivery_status", varName: "delivered_status", dataType: "String", description: "in_transit / delivered / returned" },
      { path: "$.order.eta", varName: "eta", dataType: "String", description: "Estimated delivery date" },
      { path: "$.order.total", varName: "order_total", dataType: "Number", description: "Order value in paise" },
    ],
    mockResponse: {
      status: 200,
      at: "10 Jun 2026, 14:22",
      durationMs: 384,
      body: {
        order: {
          id: "ORD-99213",
          delivery_status: "in_transit",
          eta: "2026-06-12",
          total: 249900,
          items: [
            { sku: "PIX-A100", name: "Pixel A100 case", qty: 1, price: 149900 },
            { sku: "SCR-GLS", name: "Screen guard", qty: 2, price: 50000 },
          ],
          address: { city: "Bengaluru", pincode: "560068", state: "KA" },
        },
        customer_id: "cust_9821",
      },
    },
  },
  {
    handle: "refund_initiate",
    description: "Initiate a refund against a paid order",
    type: "http",
    method: "POST",
    url: "https://api.payments.pi/v1/refunds",
    auth: "bearer",
    health: "ok",
    status: "live",
    createdAt: "18 Apr 2026",
    updatedAt: "01 Jun 2026",
    inputs: [
      { key: "customer_id", dataType: "String", in: "body", source: "campaign", value: "customer_id", description: "Internal customer id" },
      { key: "order_id", dataType: "String", in: "body", source: "agent", description: "Order to refund" },
      { key: "amount", dataType: "Number", in: "body", source: "agent", description: "Refund amount in paise" },
      { key: "reason", dataType: "String", in: "body", source: "agent", description: "Why the customer wants a refund" },
    ],
    outputs: [
      { path: "$.refund.id", varName: "refund_id", dataType: "String", description: "Refund reference" },
      { path: "$.refund.status", varName: "refund_status", dataType: "String", description: "initiated / failed" },
    ],
    mockResponse: {
      status: 201,
      at: "01 Jun 2026, 09:14",
      durationMs: 512,
      body: {
        refund: { id: "rfnd_28c1f9", status: "initiated", amount: 149900, currency: "INR" },
        events: [
          { at: "2026-06-01T09:14:02Z", type: "created" },
          { at: "2026-06-01T09:14:03Z", type: "queued_for_bank" },
        ],
      },
    },
  },
  {
    handle: "knowledge_lookup",
    description: "Answer a question from the knowledge base",
    type: "http",
    method: "GET",
    url: "https://kb.pi/v1/search",
    auth: "none",
    health: "ok",
    status: "draft",
    createdAt: "06 Jun 2026",
    updatedAt: "13 Jun 2026",
    inputs: [
      { key: "query", dataType: "String", in: "query", source: "agent", description: "The customer's question" },
      { key: "top_k", dataType: "Number", in: "query", source: "constant", value: "3", description: "Passages to retrieve" },
    ],
    outputs: [
      { path: "$.answer", varName: "answer", dataType: "String", description: "Grounded answer" },
      { path: "$.citations", varName: "citations", dataType: "String", description: "Source passages" },
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
  {
    handle: "policy_lookup",
    description: "Fetch an insurance policy's premium, expiry and status",
    type: "http",
    method: "GET",
    url: "https://api.insurance.paytm.in/v1/policies/{policy_id}",
    auth: "bearer",
    health: "ok",
    status: "live",
    createdAt: "12 Feb 2026",
    updatedAt: "04 Jun 2026",
    inputs: [
      { key: "policy_id", dataType: "String", in: "path", source: "campaign", value: "policy_no", description: "Policy number" },
      { key: "customer_id", dataType: "String", in: "query", source: "campaign", value: "customer_id", description: "Internal customer id" },
    ],
    outputs: [
      { path: "$.policy.premium", varName: "premium", dataType: "Number", description: "Annual premium in paise" },
      { path: "$.policy.expiry_date", varName: "expiry_date", dataType: "String", description: "Policy expiry date" },
      { path: "$.policy.status", varName: "policy_status", dataType: "String", description: "active / lapsed / expired" },
      { path: "$.policy.product_name", varName: "product_name", dataType: "String", description: "Insurance product name" },
    ],
  },
  {
    handle: "cart_status_check",
    description: "Check the live status and value of a customer's cart",
    type: "http",
    method: "GET",
    url: "https://api.orders.paytm.in/v1/carts/{cart_id}",
    auth: "apiKey",
    health: "ok",
    status: "live",
    createdAt: "18 Feb 2026",
    updatedAt: "07 Jun 2026",
    inputs: [
      { key: "cart_id", dataType: "String", in: "path", source: "campaign", value: "cart_id", description: "Cart reference id" },
      { key: "customer_id", dataType: "String", in: "query", source: "campaign", value: "customer_id", description: "Internal customer id" },
    ],
    outputs: [
      { path: "$.cart.status", varName: "cart_status", dataType: "String", description: "active / purchased / expired" },
      { path: "$.cart.value", varName: "cart_value", dataType: "Number", description: "Cart total in paise" },
      { path: "$.cart.items_count", varName: "cart_items_count", dataType: "Number", description: "Number of SKUs in cart" },
      { path: "$.cart.last_activity", varName: "cart_last_activity", dataType: "String", description: "Last cart activity timestamp" },
    ],
  },
  {
    handle: "loyalty_tier_fetch",
    description: "Fetch a Loyalty Card member's current tier and spend signals",
    type: "http",
    method: "GET",
    url: "https://api.loyalty.paytm.in/v1/members/{customer_id}/tier",
    auth: "bearer",
    health: "ok",
    status: "live",
    createdAt: "22 Feb 2026",
    updatedAt: "09 Jun 2026",
    inputs: [
      { key: "customer_id", dataType: "String", in: "path", source: "campaign", value: "customer_id", description: "Internal customer id" },
    ],
    outputs: [
      { path: "$.member.tier", varName: "loyalty_tier", dataType: "String", description: "silver / gold" },
      { path: "$.member.acv_6m", varName: "acv_6m", dataType: "Number", description: "6-month average cart value in paise" },
      { path: "$.member.orders_6m", varName: "orders_6m", dataType: "Number", description: "Orders in the last 6 months" },
      { path: "$.member.lifetime_value", varName: "lifetime_value", dataType: "Number", description: "Lifetime value in paise" },
    ],
  },
  {
    handle: "loyalty_enrollment_check",
    description: "Check whether a member has enrolled in the Silver Loyalty programme",
    type: "http",
    method: "GET",
    url: "https://api.loyalty.paytm.in/v1/members/{customer_id}/enrollment",
    auth: "bearer",
    health: "ok",
    status: "live",
    createdAt: "22 Feb 2026",
    updatedAt: "09 Jun 2026",
    inputs: [
      { key: "customer_id", dataType: "String", in: "path", source: "campaign", value: "customer_id", description: "Internal customer id" },
    ],
    outputs: [
      { path: "$.enrollment.status", varName: "enrollment_status", dataType: "String", description: "enrolled / pending / declined" },
      { path: "$.enrollment.enrolled_at", varName: "enrolled_at", dataType: "String", description: "Enrollment timestamp" },
      { path: "$.enrollment.plan", varName: "enrolled_plan", dataType: "String", description: "Plan the member enrolled in" },
    ],
  },
  {
    handle: "loyalty_upgrade_status",
    description: "Check whether a Silver member has upgraded to paid Gold",
    type: "http",
    method: "GET",
    url: "https://api.loyalty.paytm.in/v1/members/{customer_id}/upgrade",
    auth: "bearer",
    health: "ok",
    status: "live",
    createdAt: "22 Feb 2026",
    updatedAt: "09 Jun 2026",
    inputs: [
      { key: "customer_id", dataType: "String", in: "path", source: "campaign", value: "customer_id", description: "Internal customer id" },
    ],
    outputs: [
      { path: "$.upgrade.status", varName: "upgrade_status", dataType: "String", description: "upgraded / not_upgraded / pending" },
      { path: "$.upgrade.new_tier", varName: "new_tier", dataType: "String", description: "Tier the member upgraded to" },
      { path: "$.upgrade.upgraded_at", varName: "upgraded_at", dataType: "String", description: "Upgrade timestamp" },
    ],
  },
  {
    handle: "log_collection_escalation",
    description: "Log a PL collections escalation to CRM after a no-commitment voice call",
    type: "http",
    method: "POST",
    url: "https://api.crm.paytm.in/v1/collections/escalations",
    auth: "bearer",
    health: "ok",
    status: "live",
    createdAt: "05 Mar 2026",
    updatedAt: "10 Jun 2026",
    inputs: [
      { key: "Content-Type", dataType: "String", in: "header", source: "constant", value: "application/json", description: "Payload content type" },
      { key: "loan_id", dataType: "String", in: "body", source: "campaign", value: "loan_id", description: "PL loan id" },
      { key: "customer_id", dataType: "String", in: "body", source: "campaign", value: "customer_id", description: "Internal customer id" },
      { key: "dpd", dataType: "Number", in: "body", source: "campaign", value: "dpd", description: "Days past due" },
      { key: "amount_due", dataType: "Number", in: "body", source: "campaign", value: "amount_due", description: "Outstanding amount in paise" },
      { key: "escalation_reason", dataType: "String", in: "body", source: "constant", value: "voice_ai_no_commitment", description: "Why we're escalating" },
    ],
    outputs: [
      { path: "$.escalation.id", varName: "escalation_id", dataType: "String", description: "Escalation reference id" },
      { path: "$.escalation.assigned_to", varName: "assigned_agent", dataType: "String", description: "Agent the case was routed to" },
      { path: "$.escalation.sla_hours", varName: "sla_hours", dataType: "Number", description: "Follow-up SLA in hours" },
    ],
  },
  {
    handle: "log_merchant_outreach",
    description: "Log a Soundbox merchant reactivation outreach attempt to CRM",
    type: "http",
    method: "POST",
    url: "https://api.crm.paytm.in/v1/merchant/outreach-log",
    auth: "bearer",
    health: "ok",
    status: "live",
    createdAt: "12 Mar 2026",
    updatedAt: "11 Jun 2026",
    inputs: [
      { key: "Content-Type", dataType: "String", in: "header", source: "constant", value: "application/json", description: "Payload content type" },
      { key: "device_id", dataType: "String", in: "body", source: "campaign", value: "device_id", description: "Soundbox device id" },
      { key: "merchant_id", dataType: "String", in: "body", source: "campaign", value: "merchant_id", description: "Merchant id" },
      { key: "outreach_type", dataType: "String", in: "body", source: "constant", value: "soundbox_reactivation_final", description: "Outreach programme tag" },
      { key: "last_txn_days", dataType: "Number", in: "body", source: "campaign", value: "last_txn_days", description: "Days since last transaction" },
    ],
    outputs: [
      { path: "$.log.id", varName: "log_id", dataType: "String", description: "CRM log id" },
      { path: "$.log.followup_scheduled_at", varName: "followup_at", dataType: "String", description: "Scheduled follow-up timestamp" },
    ],
  },
];

export function getTool(handle: string): ToolDef | undefined {
  return TOOLS.find((t) => t.handle === handle);
}
