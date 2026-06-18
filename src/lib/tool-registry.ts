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

export type ToolOutput = { path: string; varName: string; description: string };

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
      { path: "$.messages[0].id", varName: "message_id", description: "WhatsApp message id" },
      { path: "$.messages[0].message_status", varName: "delivery_status", description: "queued / sent / delivered" },
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
      { path: "$.sid", varName: "sms_sid", description: "Message id" },
      { path: "$.status", varName: "sms_status", description: "Delivery status" },
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
      { path: "$.call.id", varName: "call_id", description: "Telephony call id" },
      { path: "$.call.status", varName: "call_status", description: "answered / no_answer / busy" },
      { path: "$.call.duration_sec", varName: "duration_sec", description: "Call length in seconds" },
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
      { path: "$.data.tier", varName: "tier", description: "Loyalty tier" },
      { path: "$.data.lifetime_value", varName: "lifetime_value", description: "LTV in paise" },
      { path: "$.data.churn_risk", varName: "churn_risk", description: "low / medium / high" },
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
      { path: "$.num_received", varName: "num_received", description: "Rows accepted" },
      { path: "$.num_invalid_entries", varName: "num_invalid", description: "Rows rejected" },
    ],
  },
  {
    handle: "customer_context",
    description: "Fetch real-time customer context for the agent",
    type: "mcp",
    transport: "http",
    url: "https://internal.pi/mcp/context",
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
      { path: "$.segment", varName: "segment", description: "Behavioural segment" },
      { path: "$.last_seen", varName: "last_seen", description: "Last active timestamp" },
      { path: "$.preferred_lang", varName: "preferred_lang", description: "Preferred language" },
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
      { path: "$.order.delivery_status", varName: "delivered_status", description: "in_transit / delivered / returned" },
      { path: "$.order.eta", varName: "eta", description: "Estimated delivery date" },
      { path: "$.order.total", varName: "order_total", description: "Order value in paise" },
    ],
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
      { path: "$.refund.id", varName: "refund_id", description: "Refund reference" },
      { path: "$.refund.status", varName: "refund_status", description: "initiated / failed" },
    ],
  },
  {
    handle: "knowledge_lookup",
    description: "Answer a question from the knowledge base",
    type: "mcp",
    transport: "sse",
    url: "https://kb.pi/mcp/search",
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
      { path: "$.answer", varName: "answer", description: "Grounded answer" },
      { path: "$.citations", varName: "citations", description: "Source passages" },
    ],
  },
];

export function getTool(handle: string): ToolDef | undefined {
  return TOOLS.find((t) => t.handle === handle);
}
