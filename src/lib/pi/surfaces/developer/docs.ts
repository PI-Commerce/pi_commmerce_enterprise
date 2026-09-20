/**
 * Ask Pi — /developer surface: docs corpus (Phase B prep, unwired).
 *
 * Corpus for the future Developer docs-RAG (API Docs tab + Release Notes tab).
 * Shape mirrors `src/lib/pi/surfaces/integrations/docs.ts` verbatim so the
 * eventual `search_docs` tool + system prompt + surface manifest can be near
 * copy-paste from the integrations surface — only the corpus and the
 * per-source filter differ.
 *
 * PROVENANCE
 * ----------
 * Two kinds of chunks:
 *   1. Structured chunks, generated at module load from the app's own source
 *      of truth (`src/lib/api-docs.ts` ENDPOINTS + `src/lib/release-notes.ts`
 *      RELEASE_ENTRIES). If either file changes, this corpus is auto-fresh
 *      at build time. Zero maintenance for endpoints and release notes.
 *   2. Prose chunks, hand-transcribed once from `src/components/developer/
 *      ApiDocs.tsx` (Overview, Authentication, Rate limits, Idempotency,
 *      Response shape, Error codes, and all 9 Webhooks sub-pages). These
 *      live in JSX in the render code, so extraction is manual. Refresh
 *      by re-reading the source function and editing the matching `body`
 *      below when copy changes materially. Ids stay stable.
 *
 * Not authoritative — this is a compact seed corpus optimised for a keyword
 * retriever. Verbose enough for Pi to answer specific questions ("what's the
 * Idempotency-Key TTL?" → 15 minutes) without dragging the model's context.
 *
 * WIRING PLAN (do NOT wire until Mayan greenlights Phase B)
 * ---------------------------------------------------------
 * When ready to flip on:
 *   1. Add `src/lib/pi/surfaces/developer/tools/search-docs.ts` — copy the
 *      integrations tool, swap `vendor` → `source`, swap `VENDOR_DOCS` →
 *      `DEVELOPER_DOCS`. The tokeniser / scorer stay identical.
 *   2. Add `src/lib/pi/surfaces/developer/system.ts` — Developer-topic prompt
 *      (mirror integrations/system.ts). Enumerate the two sources; hard-rule
 *      against fabricating endpoints, headers, error codes, or dates.
 *   3. Add `src/lib/pi/surfaces/developer/index.ts` — `SurfaceModule` with
 *      `id: "developer"`, `tools: [searchDocs]`, `loop: { maxRounds: 3,
 *      thinkingBudget: 1024 }`, self-register.
 *   4. Add `"developer"` to `PiScopeMode` in `src/lib/ask-pi-context.ts` and
 *      to `AskPiScope` in `src/lib/server-fns/pi-llm.ts`; import the surface
 *      module in pi-llm.ts for side-effect registration.
 *   5. In `src/routes/developer.tsx`, publish scopeMode "developer" only on
 *      the API Docs + Release Notes tabs. Whether to add tab-level dead-zone
 *      on APIs & Webhooks + Logs stays a separate product decision (see
 *      feedback_askpi_dead_zones.md — don't proactively apply).
 */

/** Which of the two Developer content surfaces a chunk belongs to. */
export type DocSource = "api-docs" | "release-notes";

/** Chunk shape. Deliberately matches integrations/docs.ts DocChunk 1:1 so
 *  the search_docs tool can be lifted with only two field renames. */
export type DeveloperDocChunk = {
  /** Machine id of the source this chunk belongs to. */
  source: DocSource;
  /** Human source name for citation ("API Docs" | "Release Notes"). */
  sourceName: string;
  /** Section within the source ("Webhooks > Auth", "RCS as a Channel · 25 Aug 2026"). */
  section: string;
  /** The chunk body Pi reads. Prose kept ~80-200 words; endpoint and release
   *  chunks may be denser because they are dominated by structured fields. */
  body: string;
  /** Optional in-app deep link Pi can surface as a citation ("/developer" for now,
   *  finer-grained anchors when the API Docs sub-nav gains routing). */
  sourceUrl?: string;
};

// ---------------------------------------------------------------------------
// 1. Prose chunks — API Docs (hand-transcribed from
//    src/components/developer/ApiDocs.tsx). Refresh when copy changes.
// ---------------------------------------------------------------------------

const PROSE_CHUNKS: DeveloperDocChunk[] = [
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Get started · Overview",
    body: "Pi Commerce exposes a set of HTTP APIs to trigger campaigns and send templates directly. Base URL: https://api.picommerce.paytm.com. Two things you can do: push audience into an API-based campaign Run (Time-scoped or Always-on), one record or up to a thousand per call; and send an approved WhatsApp / SMS / RCS template to one or many records without creating a campaign in the UI. Every accepted call returns a records[] array with one entry per record you sent. Each entry has status \"queued\" or \"rejected\". Queued means the record passed validation and was accepted for processing — not a promise of delivery (business filters like dedupe, DND, channel failures run afterwards and may still reduce the count). Every queued entry carries a record_id for later correlation. Rejected means the record failed validation (missing field, wrong type, invalid phone number); the entry carries an error_code. One bad record never blocks the rest of the batch. Response conventions: every endpoint returns the same 200 shape (request_id, counts, records array). Whole-call failures return 4xx/5xx with request_id and a stable error_code.",
    sourceUrl: "/developer",
  },
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Get started · Authentication",
    body: "Every API call must include a valid API key. Send your key in the X-API-Key header on every request. Example: curl -X POST 'https://api.picommerce.paytm.com/v1/runs/trigger/r_782' -H 'X-API-Key: pk_YOUR_API_KEY' -H 'Content-Type: application/json' -d '[{\"phone\":\"9812345678\",\"name\":\"Asha\"}]'. Create and manage keys under Developer > APIs & Webhooks. The full secret is shown only once, at creation time — save it before closing the dialog. Keys are scoped to your client and are revocable. Revoke a key at any point; existing calls using it will start failing with error_code auth_rejected.",
    sourceUrl: "/developer",
  },
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Get started · Rate limits",
    body: "Limits apply per client and pool across all your API keys and runs. Same for the Batch Campaign Trigger and the Direct Channel APIs. The three limits: 1,000 records per call; 4 MB body per call; 15 calls per second per client. Breaches return HTTP 429 with error_code rate_limited. Rate-limit headers on every response help your client back off cleanly: X-RateLimit-Limit (the ceiling for this endpoint), X-RateLimit-Remaining (how many calls left in the current window), and Retry-After (seconds until the window resets).",
    sourceUrl: "/developer",
  },
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Get started · Idempotency",
    body: "Idempotency is opt-in. Send an Idempotency-Key header if you want retry safety (for example when a call times out and you cannot tell whether it was processed). If we have already processed a call with that key from your client within the last 15 minutes, we return the original response unchanged, including the same record_ids. No records are queued a second time. Keys must be alphanumeric and unique per intended call — common patterns are a UUID or a SHA-256 digest of the request body. If the header is absent, the request is processed as new; a retry after a timeout may result in duplicate messaging. Scope: keys are per client and per run. The same key against a different run is treated as a different request.",
    sourceUrl: "/developer",
  },
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Get started · Response shape",
    body: "Every endpoint uses the same response contract. HTTP 200 returns a top-level object with a request identifier, per-run counts, and a records[] array. The length of records always equals the number of records you sent, and queued + rejected always equals that length. Top-level fields: request_id (string, always), run_id (string, present on trigger endpoints), queued (integer count of records accepted for processing), rejected (integer count that failed validation), records (array of one entry per request record, in request order). Each entry inside records[] has: index (integer 0-indexed position), status (\"queued\" or \"rejected\"), record_id (present when queued — opaque, stable, unique across runs and clients), error_code (present when rejected — one of the record-level codes). HTTP 4xx/5xx whole-call failures return a two-field body regardless of status: request_id (present even on errors) and error_code (stable machine identifier).",
    sourceUrl: "/developer",
  },
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Get started · Error codes",
    body: "Codes are stable machine identifiers. Use error_code in your integration logic; the HTTP status is a hint at the class of error. Whole-call errors (top-level error_code on 4xx / 5xx responses): 400 invalid_body (body is not valid JSON); 400 empty_list (body is an empty array); 401 auth_rejected (API key missing or invalid); 404 run_not_found (run in the URL does not exist for this client); 409 run_not_live (run exists but is not in a live state); 413 records_over_limit (more than 1,000 records in one call); 413 payload_over_limit (body larger than 4 MB); 429 rate_limited (calls-per-second exceeded, Retry-After header set). Per-record errors (on individual records[] entries with status \"rejected\"): invalid_payload (a required field is missing, a field holds the wrong kind of value, or the record is not an object); invalid_number (the phone value cannot be read as a valid phone number).",
    sourceUrl: "/developer",
  },
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Webhooks · Overview",
    body: "Pi Commerce POSTs channel events to an HTTPS endpoint you register. Delivery Status and Incoming Messages fire in real time as events arrive from the underlying vendor. One POST per event to your endpoint (no batching). Body follows the vendor's own webhook shape as received: WhatsApp uses Meta's shape, SMS uses the canonicalised Bulk Panel DLR, RCS is normalised to a Meta-flavoured Pi shape. Pi metadata (record id, event id, attempt count, etc.) rides in HTTP headers, never inside the body. Scope: one channel and one sender per webhook. WhatsApp scope is WABA + phone number, subscribed to Delivery Status and/or Incoming Messages. SMS scope is Sender ID, subscribed to Delivery Status. RCS scope is Agent, subscribed to Delivery Status. Correlation: every callback carries X-Pi-Record-Id in the headers — the same record_id we returned to you when you called our send API. Delivery Status fires only for messages sent via the API; file-upload campaigns or the Broadcasts UI do not trigger callbacks. Incoming Messages is WhatsApp-only right now.",
    sourceUrl: "/developer",
  },
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Webhooks · Register a webhook",
    body: "Create and manage webhooks under Developer > APIs & Webhooks. Steps: (1) Go to Developer > APIs & Webhooks; the Channel webhooks section sits below API keys. (2) Click + Add webhook. (3) Give it a name (slug-style: lowercase letters, digits, hyphens or underscores; 3 to 40 characters). (4) Pick a channel and the sender it should listen on. (5) Paste your HTTPS endpoint URL — private and internal hosts are not allowed. (6) Pick which event buckets to subscribe to (Delivery Status, Incoming Messages if WhatsApp). (7) Submit. An auth token is generated and shown once — save it, it is not shown again. Limits: maximum 5 webhooks per (channel, scope, bucket) — fan-out to more than 5 receivers on the same event set is not supported. Endpoint must be a public HTTPS URL; loopback, RFC1918, link-local, .internal and .local are rejected. Edit and delete: scope selectors and events checklist are editable on any webhook; name, channel, and endpoint URL are fixed after creation. If you lose the auth token, delete and recreate. Roles: both ORG_OWNER and MEMBER can create, edit, pause, resume and delete channel webhooks (same permission model as API keys).",
    sourceUrl: "/developer",
  },
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Webhooks · Auth",
    body: "Every webhook has a Bearer token generated on creation. Pi Commerce sends it as the Authorization header on every POST. Your receiver validates by string-comparing against the token you saved. Token format: prefix pi_wh_ plus 32 alphanumerics (example: pi_wh_c0hc5lr76qj9wa2m1gircpz37qp8xx8a). Every POST carries: Authorization: Bearer <token>; Content-Type: application/json. Verify on your side by string-comparing the Authorization header against the token you stored at webhook creation — reject any request whose header does not match verbatim. Losing the token: the full token is shown once at creation and is never returned again by any list, get, or update response. If you lose it, delete the webhook and create a new one with a fresh token.",
    sourceUrl: "/developer",
  },
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Webhooks · Delivery and retries",
    body: "Deliveries are at-least-once and unordered. Your endpoint has 10 seconds to respond with a 2xx. Anything else (non-2xx, timeout, network error, TLS error) counts as a failed delivery. Retry ladder: five retries then auto-pause. Attempt 1 initial send; attempt 2 at 30 seconds after previous failure; attempt 3 at 1 minute later; attempt 4 at 15 minutes; attempt 5 at 30 minutes; attempt 6 at 12 hours. Total window ~13 hours. After the sixth failed attempt, the webhook moves to Error in the dashboard with reason \"Auto-paused after retry exhaustion\" — no further deliveries fire. Idempotency: every delivery carries a stable X-Pi-Event-Id header; on retries the same id is repeated. Dedupe on your side. Recovering from Error: if auto-pause was due to a scope change on our side (WABA disconnected, sender deprovisioned, agent deleted), the state clears automatically when the scope target reappears. If it was retry exhaustion, delete the webhook and create a new one. Fan-out and rate limits: up to 5 webhooks per (channel, scope, bucket) fire in parallel; up to 25 requests per second sustained per single webhook URL with a burst of 50.",
    sourceUrl: "/developer",
  },
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Webhooks · Payload: WhatsApp",
    body: "WhatsApp callbacks follow Meta's own shape, as received. One event per POST. Pi metadata rides in headers. Delivery Status fires on each status transition for a message you sent via the API: sent, delivered, read, or failed. On failed, statuses[0] adds an errors array with code, title and error_data.details from Meta. Incoming Messages fires for every inbound message on the phone number the webhook is scoped to — cold-start conversations, replies, forwards, quick-reply / interactive responses, media, location, reactions, orders, system events, and Meta's unsupported bucket. For replies to outbound messages you sent via API, messages[0].context.id holds the outbound's wamid and the X-Pi-Record-Id header holds the outbound's record id so you can thread. Type-specific blocks on inbound (read messages[0].type first): text (text.body); image/video/audio/document (id, mime_type, sha256, optional caption/filename); sticker (id, mime, sha256, animated); location (latitude, longitude, optional name/address); contacts (array of contact cards); interactive (button_reply / list_reply / nfm_reply); button (quick-reply payload from a template); reaction (emoji reaction on a prior message); order (WhatsApp Commerce order); system (user changed number event); unsupported (Meta cannot render, with a message-level errors array).",
    sourceUrl: "/developer",
  },
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Webhooks · Payload: SMS",
    body: "SMS callbacks follow the canonicalised Bulk Panel DLR shape. One event per POST. Two status values only: DELIVERED and FAILED — no intermediate states. Example body: { \"referenceId\": \"run_abc123_01HZYABCXYZ...\", \"deliveryTimestamp\": \"2026-09-08T03:52:27\", \"status\": \"DELIVERED\", \"receiver\": \"919676166793\", \"code\": \"000\", \"sender\": \"iPaytm\" }. Fields: referenceId (your record id — same value returned in the send API response, also mirrored in the X-Pi-Record-Id header); deliveryTimestamp (ISO 8601 timestamp of the delivery outcome); status (DELIVERED or FAILED); receiver (recipient MSISDN); code (operator status code — 000 for delivery success, other codes for failure buckets); sender (the Sender ID header, matches what your webhook is scoped against).",
    sourceUrl: "/developer",
  },
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Webhooks · Payload: RCS",
    body: "RCS callbacks are normalised to a Meta-flavoured Pi shape regardless of the underlying vendor. Your code stays vendor-agnostic. Why normalised: RCS in India runs on multiple vendors; which vendor delivers a given message is decided by our routing at send time and can change. Instead of exposing two different vendor shapes, we translate both into a single stable Pi shape. Delivery Status example: { \"messaging_product\": \"rcs\", \"metadata\": { \"agent_id\": \"acme_promo_bot\" }, \"statuses\": [{ \"id\": \"run_abc123_...\", \"record_id\": \"run_abc123_...\", \"status\": \"delivered\", \"timestamp\": \"1725678427\", \"recipient_id\": \"+919951900895\" }] }. On failure, statuses[0] adds errors[] with the same shape as Meta's WhatsApp failed callback (code, title, error_data.details). Fields: id and record_id (both carry your record id — two names for the same value; id matches WhatsApp shape, record_id is our stable naming across channels); status (sent, delivered, read, failed — same enum as WhatsApp); recipient_id (recipient MSISDN); metadata.agent_id (the agent id you registered the webhook against); errors[] (present only when status: failed). What is NOT on the wire: no vendor identifier — fields specific to any upstream RCS provider (vendor, nc_bot_id, entityType, callbackdata) are not present.",
    sourceUrl: "/developer",
  },
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Webhooks · Test event",
    body: "Send a synthetic event through the exact same delivery path as a real one, so you can verify your endpoint before wiring up a real send. How to trigger: from the row menu on Developer > APIs & Webhooks, click Send test event. You can also trigger from inside the Create/Edit dialog once the URL is valid. If your webhook is subscribed to more than one event bucket, we ask which bucket to test. What we send: a realistic payload of the picked bucket using dummy values; all Pi envelope headers (Bearer token, Event-Id, Delivered-At, Attempt, Webhook-Id, Record-Id); an extra header X-Pi-Test: true so your receiver can branch on it (skip DB writes if you prefer); X-Pi-Record-Id is prefixed with test_ so even code that ignores the header can tell. What you see back: the dashboard shows a toast with the receiver's actual HTTP response — \"Test event delivered (200 OK)\" on any 2xx, or the failure code / \"connection timeout\" otherwise. Same 10-second timeout as production. What test events do NOT do: no retries on failure — we tell you once and stop. No auto-pause on test failure either. Retries and auto-pause apply only to real production events.",
    sourceUrl: "/developer",
  },
  {
    source: "api-docs",
    sourceName: "API Docs",
    section: "Webhooks · Reference",
    body: "Headers on every POST: Authorization: Bearer <token> (the auth token for this webhook); Content-Type: application/json; User-Agent: PaytmPiCommerce-Webhook/1.0; X-Pi-Webhook-Id (the receiving webhook's id in our system); X-Pi-Event-Id (stable across retries, use for dedup); X-Pi-Delivered-At (ISO 8601 timestamp of the current attempt); X-Pi-Attempt (attempt number, 1 through 6); X-Pi-Record-Id (the record id from the send API, or the outbound's record id for inbound replies); X-Pi-Test: true (present only on test events). Status enum: WhatsApp — sent, delivered, read, failed. SMS — DELIVERED, FAILED. RCS — sent, delivered, read, failed. Registration error codes (from dashboard create/edit): invalid_name (does not match slug rule); invalid_channel (not one of whatsapp/sms/rcs); invalid_scope (scope object missing required fields for the channel); endpoint_not_https (URL scheme not HTTPS); endpoint_not_public (host is loopback, RFC1918, link-local, .internal, or .local); empty_events (no event bucket selected); too_many_webhooks (fan-out limit hit — 5 per channel + scope + bucket); auth_rejected (API key missing or invalid); scope_target_not_found (WABA, sender or agent does not exist for your account).",
    sourceUrl: "/developer",
  },
];

// ---------------------------------------------------------------------------
// 2. Structured chunks — auto-extracted from source-of-truth data files.
//    If ENDPOINTS or RELEASE_ENTRIES change, these regenerate at build time.
// ---------------------------------------------------------------------------

import { ENDPOINTS, BASE_URL, type Endpoint } from "@/lib/api-docs";
import { RELEASE_ENTRIES, formatReleaseDate, type ReleaseEntry } from "@/lib/release-notes";

function endpointToChunk(e: Endpoint): DeveloperDocChunk {
  const headerLine = e.headers.length
    ? `Headers: ${e.headers.map((h) => `${h.name} (${h.required ? "required" : "optional"}) — ${h.description}`).join(" · ")}.`
    : "";
  const pathParamsLine = e.pathParams.length
    ? `Path params: ${e.pathParams.map((p) => `${p.name} — ${p.description}`).join(" · ")}.`
    : "";
  const bodyLine = (() => {
    if (e.bodyRoot.type === "array") {
      return `Body is a JSON array. Each item: ${e.bodyRoot.fields.map((f) => `${f.name} (${f.type}${f.required ? ", required" : ""}) — ${f.description}`).join(" · ")}.`;
    }
    return `Body is a JSON object with fields: ${e.bodyRoot.fields.map((f) => `${f.name} (${f.type}${f.required ? ", required" : ""}) — ${f.description}`).join(" · ")}.`;
  })();
  const rateLimitsLine = e.rateLimits.length ? `Rate limits: ${e.rateLimits.join(" · ")}.` : "";
  const notesLine = e.notes && e.notes.length ? `Notes: ${e.notes.join(" | ")}` : "";

  const parts = [
    `${e.method} ${BASE_URL}${e.path}`,
    e.description,
    e.auth,
    headerLine,
    pathParamsLine,
    bodyLine,
    rateLimitsLine,
    `Sample request: ${e.requestExample.replace(/\s+/g, " ").trim()}`,
    `Sample 200 response: ${e.responseOkExample.replace(/\s+/g, " ").trim()}`,
    `Sample error response: ${e.responseErrorExample.replace(/\s+/g, " ").trim()}`,
    notesLine,
  ].filter(Boolean);

  return {
    source: "api-docs",
    sourceName: "API Docs",
    section: `Endpoint · ${e.title} (${e.method} ${e.path})`,
    body: parts.join(" "),
    sourceUrl: "/developer",
  };
}

function releaseEntryToChunk(r: ReleaseEntry): DeveloperDocChunk {
  const body = [
    `${r.title} — released ${formatReleaseDate(r.date)} in ${r.version.toUpperCase()}, category ${r.category}.`,
    r.summary,
    r.highlights.length ? `Highlights: ${r.highlights.join(" · ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    source: "release-notes",
    sourceName: "Release Notes",
    section: `${r.title} · ${formatReleaseDate(r.date)}`,
    body,
    sourceUrl: r.linkTo ?? "/developer",
  };
}

// ---------------------------------------------------------------------------
// Assembled corpus — order does not matter for the retriever, but grouping
// keeps the file readable when someone opens it to add or edit content.
// ---------------------------------------------------------------------------

export const DEVELOPER_DOCS: DeveloperDocChunk[] = [
  ...PROSE_CHUNKS,
  ...ENDPOINTS.map(endpointToChunk),
  ...RELEASE_ENTRIES.map(releaseEntryToChunk),
];

/** Public source-id → name map. Used by the future system prompt to enumerate
 *  what Pi can answer from without leaking the whole corpus into context. */
export const DEVELOPER_DOC_SOURCES: Record<DocSource, string> = {
  "api-docs": "API Docs",
  "release-notes": "Release Notes",
};
