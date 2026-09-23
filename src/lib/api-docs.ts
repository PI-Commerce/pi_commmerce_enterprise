/**
 * API Docs data (public-docs branch).
 *
 * VERBATIM from prod screenshots. Anything I did not have a screenshot for
 * is either omitted or left as a "documentation pending" placeholder rather
 * than invented.
 *
 * Prod structure (from Developer > API Docs left nav):
 *
 *   GET STARTED
 *     - Overview
 *     - Authentication
 *     - Rate limits
 *     - Idempotency
 *     - Response shape
 *     - Error codes
 *
 *   CAMPAIGN TRIGGER APIS
 *     - Trigger Campaign Run   POST
 *
 *   CHANNEL APIS
 *     - Send WhatsApp Template  POST
 *     - Send SMS Template       POST
 *     - Send RCS Template       POST
 */

export type Method = "POST" | "GET" | "PUT" | "DELETE" | "PATCH";

export type Param = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

/**
 * Error catalog row, as shown in the prod Error codes screen.
 * Casing is preserved exactly as emitted by prod.
 */
export type ErrorRow = {
  code: string;
  status: string;
  scope: string;
  cause: string;
};

export type Endpoint = {
  id: string;
  method: Method;
  path: string;
  title: string;
  /** Short prose that sits under the title. */
  description: string;
  pathParams: Param[];
  headers: Param[];
  bodyDescription: string;
  /** Body parameter rows. */
  bodyParams: Param[];
  requestExample: string;
  responseOkExample: string;
  /** When true, this endpoint is a stub — no verbatim prod screenshot to draw from. */
  stub?: boolean;
};

/* ---------------------------- Base URL ---------------------------- */

export const BASE_URL = "https://pi-commerce-api.paytm.com/api/pi-commerce";

/* ---------------------------- Error catalog (prod) ---------------------------- */

export const ERROR_CATALOG: ErrorRow[] = [
  {
    code: "EMPTY_LIST",
    status: "400",
    scope: "Whole call",
    cause: "The request body was an empty array `[]` — send at least one record.",
  },
  {
    code: "INVALID_PAYLOAD",
    status: "202",
    scope: "Per record",
    cause:
      "An array element was not a JSON object; that index is rejected inside the 202.",
  },
  {
    code: "INVALID_PHONE",
    status: "202",
    scope: "Per record",
    cause:
      "A recipient `to` value failed validation; that row is rejected inside the 202.",
  },
  {
    code: "duplicate_request",
    status: "409",
    scope: "Whole call",
    cause:
      "Same Idempotency-Key seen within the 15-minute window — not a replay of the result.",
  },
  {
    code: "invalid_idempotency_key",
    status: "400",
    scope: "Whole call",
    cause: "Idempotency-Key did not match `^[A-Za-z0-9._~-]{8,128}$`.",
  },
  {
    code: "payload_over_limit",
    status: "413",
    scope: "Whole call",
    cause: "Request body exceeded 4 MB.",
  },
  {
    code: "ALL_RECIPIENTS_REJECTED",
    status: "422",
    scope: "Whole call",
    cause:
      "Every record was rejected; the response still carries the full BatchSendResponse.",
  },
  {
    code: "NOT_FOUND",
    status: "404",
    scope: "Whole call",
    cause:
      "The referenced run/template was not found. Shares a code with no finer distinction.",
  },
  {
    code: "CONFLICT",
    status: "409",
    scope: "Whole call",
    cause:
      "One of six conflict conditions. All six emit the same code — not machine-distinguishable.",
  },
];

/* ---------------------------- Endpoints ---------------------------- */

const TRIGGER_CAMPAIGN_HEADERS: Param[] = [
  { name: "X-API-Key", type: "string", required: true, description: "Your client API key." },
  { name: "Content-Type", type: "string", required: true, description: "Must be application/json." },
  {
    name: "Idempotency-Key",
    type: "string",
    required: false,
    description: "Optional retry-safety key; see Idempotency.",
  },
];

const TRIGGER_CAMPAIGN_PATH_PARAMS: Param[] = [
  { name: "runID", type: "string", required: true, description: "The id of the campaign run to trigger." },
];

const TRIGGER_CAMPAIGN_BODY_PARAMS: Param[] = [
  {
    name: "[] (array of records)",
    type: "array",
    required: true,
    description:
      "JSON array of 1 to 1,000 audience record objects. Each object must include phone (E.164) plus any merge fields your run expects. For a single audience record, send a one-element array — the same shape as a batch call with one item.",
  },
];

const TRIGGER_CAMPAIGN_REQUEST = `curl -X POST '${BASE_URL}/v1/runs/trigger/{runID}' \\
  -H 'X-API-Key: YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: order-12345-retry-1' \\
  -d '[
    {
      "phone": "+919812345678",
      "field_name": "Asha"
    },
    {
      "phone": "+919812345679",
      "field_name": "Ravi"
    }
  ]'`;

const TRIGGER_CAMPAIGN_RESPONSE = `{
  "status": "SUCCESS",
  "code": "200",
  "message": "successfully processed",
  "data": {
    "run_id": "run_abc123",
    "queued": 2,
    "rejected": 1,
    "records": [
      { "index": 0, "status": "queued", "record_id": "run_abc123_01HZY..." },
      { "index": 1, "status": "queued", "record_id": "run_abc123_01HZZ..." }
    ]
  }
}`;

export const ENDPOINTS: Endpoint[] = [
  {
    id: "trigger-campaign-run",
    method: "POST",
    path: "/v1/runs/trigger/{runID}",
    title: "Trigger Campaign Run",
    description:
      "Push audience records into a campaign run. Send the body as a JSON array of 1 to 1,000 record objects (use a one-element array for a single record). Request body maximum 4 MB.",
    pathParams: TRIGGER_CAMPAIGN_PATH_PARAMS,
    headers: TRIGGER_CAMPAIGN_HEADERS,
    bodyDescription:
      "JSON array of 1 to 1,000 audience record objects.",
    bodyParams: TRIGGER_CAMPAIGN_BODY_PARAMS,
    requestExample: TRIGGER_CAMPAIGN_REQUEST,
    responseOkExample: TRIGGER_CAMPAIGN_RESPONSE,
  },

  /* --- Channel APIs: nav entries only. Prod screenshots do not show the
   * full endpoint pages, so we render a "documentation pending" note rather
   * than invent field lists / samples. --- */
  {
    id: "send-whatsapp-template",
    method: "POST",
    path: "/v1/messages/whatsapp/send",
    title: "Send WhatsApp Template",
    description:
      "Send an approved WhatsApp template directly, without creating a campaign.",
    pathParams: [],
    headers: [],
    bodyDescription: "",
    bodyParams: [],
    requestExample: "",
    responseOkExample: "",
    stub: true,
  },
  {
    id: "send-sms-template",
    method: "POST",
    path: "/v1/messages/sms/send",
    title: "Send SMS Template",
    description:
      "Send an approved DLT-registered SMS template directly, without creating a campaign.",
    pathParams: [],
    headers: [],
    bodyDescription: "",
    bodyParams: [],
    requestExample: "",
    responseOkExample: "",
    stub: true,
  },
  {
    id: "send-rcs-template",
    method: "POST",
    path: "/v1/messages/rcs/send",
    title: "Send RCS Template",
    description:
      "Send an approved RCS template directly, without creating a campaign.",
    pathParams: [],
    headers: [],
    bodyDescription: "",
    bodyParams: [],
    requestExample: "",
    responseOkExample: "",
    stub: true,
  },
];

/* ---------------------------- Navigation ---------------------------- */

export type NavSection =
  | { kind: "prose"; id: string; title: string }
  | { kind: "endpoint"; id: string; title: string; method: Method };

export const NAV_GROUPS: { title: string; items: NavSection[] }[] = [
  {
    title: "Get started",
    items: [
      { kind: "prose", id: "overview", title: "Overview" },
      { kind: "prose", id: "authentication", title: "Authentication" },
      { kind: "prose", id: "rate-limits", title: "Rate limits" },
      { kind: "prose", id: "idempotency", title: "Idempotency" },
      { kind: "prose", id: "response-shape", title: "Response shape" },
      { kind: "prose", id: "errors", title: "Error codes" },
    ],
  },
  {
    title: "Campaign Trigger APIs",
    items: ENDPOINTS.filter((e) => e.id === "trigger-campaign-run").map((e) => ({
      kind: "endpoint" as const,
      id: e.id,
      title: e.title,
      method: e.method,
    })),
  },
  {
    title: "Channel APIs",
    items: ENDPOINTS.filter((e) => e.id.startsWith("send-")).map((e) => ({
      kind: "endpoint" as const,
      id: e.id,
      title: e.title,
      method: e.method,
    })),
  },
];
