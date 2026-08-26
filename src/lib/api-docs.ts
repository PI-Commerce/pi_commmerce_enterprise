/**
 * API Docs, data model.
 *
 * A structured catalog of the platform's public HTTP APIs, rendered in
 * Developer > API Docs. Kept as data (not JSX) so we can:
 *   - reuse a single error-code catalogue across endpoints,
 *   - keep sample requests / responses in one place,
 *   - later regenerate this from a spec (OpenAPI) if we want to.
 *
 * Endpoints are bucketed into two groups the way merchants think about them:
 *
 *   Campaign Trigger APIs
 *     - Single Record  (POST /v1/runs/trigger/{run_id}, one-object body)
 *     - Batch          (POST /v1/runs/trigger/{run_id}, array body)
 *
 *   Channel APIs
 *     - Send WhatsApp Template  (POST /v1/messages/whatsapp/send)
 *     - Send SMS Template       (POST /v1/messages/sms/send)
 *     - Send RCS Template       (POST /v1/messages/rcs/send)
 *
 * Note for the dev team: the fields, error codes and rate limits here are
 * placeholders in the sense that engineering owns the exact final shape.
 * The larger structure (grouping, per-endpoint sections, shared response
 * shape, shared error catalogue) is the important thing to keep.
 */

export type Method = "POST" | "GET" | "PUT" | "DELETE" | "PATCH";

export type Param = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

export type WholeCallErrorCode = {
  http: number;
  code: string;
  when: string;
};

export type RecordErrorCode = {
  code: string;
  covers: string;
};

export type Endpoint = {
  id: string;
  method: Method;
  path: string;
  title: string;
  short: string;
  description: string;
  auth: string;
  headers: Param[];
  pathParams: Param[];
  bodyRoot: {
    type: "object" | "array";
    /** For arrays: the shape of each item; for objects: the top-level fields. */
    fields: Param[];
  };
  requestExample: string;
  responseOkExample: string;
  responseErrorExample: string;
  rateLimits: string[];
  notes?: string[];
};

/* ---------------- Shared: base URL, response fields, errors ---------------- */

export const BASE_URL = "https://api.picommerce.paytm.com";

/** Fields returned inside the top-level HTTP 200 response for every endpoint. */
export const RESPONSE_200_FIELDS: Param[] = [
  { name: "request_id", type: "string", required: true, description: "Server-generated identifier for this call. Include when contacting support." },
  { name: "run_id",     type: "string", required: false, description: "Present on trigger endpoints; echoes the run receiving the audience. Direct Channel APIs also generate a backend run_id (not visible in the Runs list)." },
  { name: "queued",     type: "integer", required: true, description: "Count of records that passed validation and were accepted for processing. Not a promise of delivery." },
  { name: "rejected",   type: "integer", required: true, description: "Count of records that failed validation." },
  { name: "records",    type: "array<object>", required: true, description: "One entry per record in the request, in request order. Length equals request size. queued + rejected equals length." },
];

export const RESPONSE_RECORDS_ITEM_FIELDS: Param[] = [
  { name: "index",     type: "integer", required: true, description: "Position of this record in the request array (0-indexed)." },
  { name: "status",    type: "string",  required: true, description: '"queued" or "rejected".' },
  { name: "record_id", type: "string",  required: false, description: 'Present when status is "queued". Opaque, stable, unique across runs and clients. Use it to correlate later.' },
  { name: "error_code",type: "string",  required: false, description: 'Present when status is "rejected". One of the record-level error codes below.' },
];

export const RESPONSE_ERROR_FIELDS: Param[] = [
  { name: "request_id", type: "string", required: true, description: "Server-generated identifier for this call, present even on errors. Include when contacting support." },
  { name: "error_code", type: "string", required: true, description: "Stable machine identifier for the failure. See the error-code table below." },
];

/** Errors that can appear inside a records[] entry with status "rejected". */
export const RECORD_ERRORS: RecordErrorCode[] = [
  { code: "invalid_payload", covers: "A required field is missing, a field holds the wrong kind of value, or the record is not an object." },
  { code: "invalid_number",  covers: "The phone value cannot be read as a valid phone number." },
];

/** Errors returned as HTTP 4xx / 5xx with the standard error body. */
export const WHOLE_CALL_ERRORS: WholeCallErrorCode[] = [
  { http: 400, code: "invalid_body",       when: "Body is not valid JSON." },
  { http: 400, code: "empty_list",         when: "Body is an empty array." },
  { http: 401, code: "auth_rejected",      when: "API key missing or invalid." },
  { http: 404, code: "run_not_found",      when: "Run in the URL does not exist for this client." },
  { http: 409, code: "run_not_live",       when: "Run exists but is not in a live state." },
  { http: 413, code: "records_over_limit", when: "More than 1,000 records in one call." },
  { http: 413, code: "payload_over_limit", when: "Body larger than 4 MB." },
  { http: 429, code: "rate_limited",       when: "Calls-per-second exceeded. Retry-After header set." },
];

/** Rate-limit values that apply uniformly to every endpoint. */
export const RATE_LIMITS = [
  "1,000 records per call",
  "4 MB body per call",
  "15 calls per second per client",
];

/* ------------------------------ Endpoints ------------------------------ */

const AUTH_LINE =
  "Send X-API-Key with an API key generated under Developer > APIs & Webhooks. Keys are scoped to your client and can be revoked at any time.";

const CAMPAIGN_TRIGGER_HEADERS: Param[] = [
  { name: "Content-Type",     type: "string", required: true, description: "application/json" },
  { name: "X-API-Key",        type: "string", required: true, description: "Your API key." },
  { name: "Idempotency-Key",  type: "string", required: false, description: "Optional. Alphanumeric, unique per intended call. If sent, a repeat within 15 minutes returns the original response, including the same record_ids. Typical patterns: UUID or SHA-256 of the body." },
];

const CAMPAIGN_TRIGGER_PATH_PARAMS: Param[] = [
  { name: "run_id", type: "string", required: true, description: "Identifier of the run receiving audience. Found in the Run details drawer under the campaign." },
];

const CAMPAIGN_TRIGGER_BODY_ITEM: Param = {
  name: "<record>",
  type: "object",
  required: true,
  description: 'A record matching the Audience-node schema for this run (for example { "phone": "...", "name": "..." }).',
};

const SINGLE_RECORD_REQUEST = `curl -X POST '${BASE_URL}/v1/runs/trigger/r_782' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: pk_YOUR_API_KEY' \\
  -d '[
        { "phone": "9812345678", "name": "Asha" }
      ]'`;

const SINGLE_RECORD_OK = `{
  "request_id": "req_8f14e45f",
  "run_id": "r_782",
  "queued": 1,
  "rejected": 0,
  "records": [
    { "index": 0, "status": "queued", "record_id": "rec_01HX7Y8ABCD" }
  ]
}`;

const BATCH_REQUEST = `curl -X POST '${BASE_URL}/v1/runs/trigger/r_782' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: pk_YOUR_API_KEY' \\
  -H 'Idempotency-Key: 8f14e45f-ea8d-4b9a-9c1f-2b3d4e5f6a7b' \\
  -d '[
        { "phone": "9812345678", "name": "Asha" },
        { "phone": "9812345679", "name": "Ravi" },
        { "phone": "9812345680", "name": "Neha" }
      ]'`;

const BATCH_OK = `{
  "request_id": "req_8f14e45f",
  "run_id": "r_782",
  "queued": 997,
  "rejected": 3,
  "records": [
    { "index": 0,   "status": "queued",   "record_id": "rec_01HX7Y8ABCD" },
    { "index": 1,   "status": "queued",   "record_id": "rec_01HX7Y8ABCE" },
    { "index": 12,  "status": "rejected", "error_code": "invalid_payload" },
    { "index": 340, "status": "rejected", "error_code": "invalid_number" },
    { "index": 811, "status": "rejected", "error_code": "invalid_payload" }
  ]
}`;

const TRIGGER_ERROR = `{
  "request_id": "req_8f14e45f",
  "error_code": "run_not_found"
}`;

const DIRECT_CHANNEL_HEADERS: Param[] = [
  { name: "Content-Type",     type: "string", required: true, description: "application/json" },
  { name: "X-API-Key",        type: "string", required: true, description: "Your API key." },
  { name: "Idempotency-Key",  type: "string", required: false, description: "Optional. Same semantics as Batch Campaign Trigger." },
];

const WA_BODY: Param[] = [
  { name: "template_id", type: "string", required: true, description: "Approved WhatsApp template ID." },
  { name: "language",    type: "string", required: true, description: "BCP-47 language code, for example en_US." },
  { name: "from",        type: "string", required: true, description: "WhatsApp phone number ID (WABA sender)." },
  { name: "records",     type: "array<object>", required: true, description: "Recipients and template variables. Each item: { to, variables }." },
];
const SMS_BODY: Param[] = [
  { name: "template_id", type: "string", required: true, description: "Approved DLT-registered SMS template ID." },
  { name: "sender_id",   type: "string", required: true, description: "DLT-registered sender ID." },
  { name: "records",     type: "array<object>", required: true, description: "Recipients and template variables. Each item: { to, variables }." },
];
const RCS_BODY: Param[] = [
  { name: "template_id", type: "string", required: true, description: "Approved RCS template ID." },
  { name: "agent_id",    type: "string", required: true, description: "Registered RCS bot / agent ID." },
  { name: "records",     type: "array<object>", required: true, description: "Recipients and template variables. Each item: { to, variables }." },
];

const DIRECT_OK = `{
  "request_id": "req_8f14e45f",
  "run_id": "r_9033",
  "queued": 2,
  "rejected": 1,
  "records": [
    { "index": 0, "status": "queued",   "record_id": "msg_01HZX8A1", "to": "919876500001" },
    { "index": 1, "status": "queued",   "record_id": "msg_01HZX8A2", "to": "919876500002" },
    { "index": 2, "status": "rejected", "error_code": "invalid_number", "to": "91987650" }
  ]
}`;

const DIRECT_ERROR = `{
  "request_id": "req_8f14e45f",
  "error_code": "auth_rejected"
}`;

const WA_REQUEST = `curl -X POST '${BASE_URL}/v1/messages/whatsapp/send' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: pk_YOUR_API_KEY' \\
  -d '{
        "template_id": "10248301552093",
        "language": "en_US",
        "from": "PHONE_NUMBER_ID",
        "records": [
          { "to": "919876500001", "variables": { "1": "Aniket", "2": "ORD-4471", "3": "\\u20B91,299" } },
          { "to": "919876500002", "variables": { "1": "Priya",  "2": "ORD-4472", "3": "\\u20B9899"   } }
        ]
      }'`;

const SMS_REQUEST = `curl -X POST '${BASE_URL}/v1/messages/sms/send' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: pk_YOUR_API_KEY' \\
  -d '{
        "template_id": "1707172700123456",
        "sender_id":   "PIMKTG",
        "records": [
          { "to": "919876500001", "variables": { "1": "Aniket", "2": "ORD-4471" } }
        ]
      }'`;

const RCS_REQUEST = `curl -X POST '${BASE_URL}/v1/messages/rcs/send' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: pk_YOUR_API_KEY' \\
  -d '{
        "template_id": "rcs_tpl_welcome_offer",
        "agent_id":    "acme_promo_bot",
        "records": [
          { "to": "919876500001", "variables": { "name": "Aniket", "offer": "20% off" } }
        ]
      }'`;

export const ENDPOINTS: Endpoint[] = [
  {
    id: "campaign-trigger-single",
    method: "POST",
    path: "/v1/runs/trigger/{run_id}",
    title: "Single Record",
    short: "Push one audience record into a running campaign.",
    description:
      "Use this shape when you want to send one record at a time. The body is a JSON array with a single object. Every field must match the run's Audience-node schema.",
    auth: AUTH_LINE,
    headers: CAMPAIGN_TRIGGER_HEADERS,
    pathParams: CAMPAIGN_TRIGGER_PATH_PARAMS,
    bodyRoot: { type: "array", fields: [CAMPAIGN_TRIGGER_BODY_ITEM] },
    requestExample: SINGLE_RECORD_REQUEST,
    responseOkExample: SINGLE_RECORD_OK,
    responseErrorExample: TRIGGER_ERROR,
    rateLimits: RATE_LIMITS,
    notes: [
      'The endpoint always accepts an array. For one record, send an array of one: [{...}].',
      'For pushing many records in a single call, see Batch.',
    ],
  },
  {
    id: "campaign-trigger-batch",
    method: "POST",
    path: "/v1/runs/trigger/{run_id}",
    title: "Batch",
    short: "Push up to 1,000 audience records into a running campaign in one call.",
    description:
      "Same endpoint as Single Record. The body is a JSON array of records, up to 1,000 per call. Each record is validated on its own; a bad record never blocks the rest of the batch.",
    auth: AUTH_LINE,
    headers: CAMPAIGN_TRIGGER_HEADERS,
    pathParams: CAMPAIGN_TRIGGER_PATH_PARAMS,
    bodyRoot: { type: "array", fields: [CAMPAIGN_TRIGGER_BODY_ITEM] },
    requestExample: BATCH_REQUEST,
    responseOkExample: BATCH_OK,
    responseErrorExample: TRIGGER_ERROR,
    rateLimits: RATE_LIMITS,
    notes: [
      '"queued" means accepted for processing, not a promise of delivery. Business filters (dedupe, DND, channel failures) run on the queue afterwards.',
      "Template and variable-substitution errors are never returned here. They show up in the run's analytics when the campaign node runs.",
    ],
  },

  {
    id: "channel-whatsapp",
    method: "POST",
    path: "/v1/messages/whatsapp/send",
    title: "Send WhatsApp Template",
    short: "Send an approved WhatsApp template directly, without creating a campaign.",
    description:
      "Sends one WhatsApp template to one or many recipients in a single call. A backend run is created for reporting (visible in Channel Analytics) but does not surface in the Runs list.",
    auth: AUTH_LINE,
    headers: DIRECT_CHANNEL_HEADERS,
    pathParams: [],
    bodyRoot: { type: "object", fields: WA_BODY },
    requestExample: WA_REQUEST,
    responseOkExample: DIRECT_OK,
    responseErrorExample: DIRECT_ERROR,
    rateLimits: RATE_LIMITS,
    notes: [
      'Variables use positional keys ("1", "2", ...) matching the template\'s variable positions.',
      "Sends are counted in Channel Analytics > WhatsApp exactly like any other send.",
    ],
  },
  {
    id: "channel-sms",
    method: "POST",
    path: "/v1/messages/sms/send",
    title: "Send SMS Template",
    short: "Send an approved DLT template directly, without creating a campaign.",
    description:
      "Sends one DLT-approved SMS template to one or many recipients in a single call. A backend run is created for reporting (visible in Channel Analytics) but does not surface in the Runs list.",
    auth: AUTH_LINE,
    headers: DIRECT_CHANNEL_HEADERS,
    pathParams: [],
    bodyRoot: { type: "object", fields: SMS_BODY },
    requestExample: SMS_REQUEST,
    responseOkExample: DIRECT_OK,
    responseErrorExample: DIRECT_ERROR,
    rateLimits: RATE_LIMITS,
    notes: [
      'Variables use positional keys ("1", "2", ...) matching the DLT template.',
      "Sends are counted in Channel Analytics > SMS.",
    ],
  },
  {
    id: "channel-rcs",
    method: "POST",
    path: "/v1/messages/rcs/send",
    title: "Send RCS Template",
    short: "Send an approved RCS template directly, without creating a campaign.",
    description:
      "Sends one RCS template to one or many recipients in a single call. A backend run is created for reporting (visible in Channel Analytics) but does not surface in the Runs list.",
    auth: AUTH_LINE,
    headers: DIRECT_CHANNEL_HEADERS,
    pathParams: [],
    bodyRoot: { type: "object", fields: RCS_BODY },
    requestExample: RCS_REQUEST,
    responseOkExample: DIRECT_OK,
    responseErrorExample: DIRECT_ERROR,
    rateLimits: RATE_LIMITS,
    notes: [
      'Variables use named keys ("{{name}}") matching the RCS template placeholders.',
      "Sends are counted in Channel Analytics > RCS.",
    ],
  },
];

/* ------------------------------ Navigation ------------------------------ */

export type NavSection =
  | { kind: "prose"; id: string; title: string }
  | { kind: "endpoint"; id: string; title: string; method: Method };

export const NAV_GROUPS: { title: string; items: NavSection[] }[] = [
  {
    title: "Get started",
    items: [
      { kind: "prose", id: "overview",       title: "Overview" },
      { kind: "prose", id: "authentication", title: "Authentication" },
      { kind: "prose", id: "rate-limits",    title: "Rate limits" },
      { kind: "prose", id: "idempotency",    title: "Idempotency" },
      { kind: "prose", id: "response-shape", title: "Response shape" },
      { kind: "prose", id: "errors",         title: "Error codes" },
    ],
  },
  {
    title: "Campaign Trigger APIs",
    items: ENDPOINTS
      .filter((e) => e.id.startsWith("campaign-trigger-"))
      .map((e) => ({ kind: "endpoint" as const, id: e.id, title: e.title, method: e.method })),
  },
  {
    title: "Channel APIs",
    items: ENDPOINTS
      .filter((e) => e.id.startsWith("channel-"))
      .map((e) => ({ kind: "endpoint" as const, id: e.id, title: e.title, method: e.method })),
  },
];
