/**
 * Developer > API Docs (public-docs branch).
 *
 * Every prose block below is VERBATIM from the prod screenshots. No invented
 * copy. Sections we do not have full screenshots for (the three Channel API
 * endpoint pages) render an honest "documentation pending" stub instead of
 * fabricated content.
 *
 * Structure mirrors prod:
 *   - Left rail with Get started, Campaign Trigger APIs, Channel APIs
 *   - Right pane renders the selected prose section or endpoint
 */

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Copy, Check, Link as LinkIcon } from "lucide-react";
import {
  BASE_URL,
  ENDPOINTS,
  ERROR_CATALOG,
  NAV_GROUPS,
  type Endpoint,
  type Param,
} from "@/lib/api-docs";

/* --------------------------- Root --------------------------- */

export function ApiDocs() {
  const [sectionId, setSectionId] = useState<string>("overview");
  const activeEndpoint = ENDPOINTS.find((e) => e.id === sectionId);

  return (
    <div className="flex min-h-[calc(100vh-13rem)] gap-8">
      <aside className="w-[220px] shrink-0 border-r border-border pr-4">
        <NavRail activeId={sectionId} onSelect={setSectionId} />
      </aside>
      <div className="min-w-0 flex-1 pb-16">
        {activeEndpoint ? (
          <EndpointView endpoint={activeEndpoint} />
        ) : (
          <ProseSection id={sectionId} />
        )}
      </div>
    </div>
  );
}

/* --------------------------- Navigation --------------------------- */

function NavRail({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="sticky top-0 space-y-6">
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            {g.title}
          </p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = it.id === activeId;
              return (
                <li key={it.id}>
                  <button
                    onClick={() => onSelect(it.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors",
                      active
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                    )}
                  >
                    {it.kind === "endpoint" && (
                      <MethodPill method={it.method} compact />
                    )}
                    <span className="truncate">{it.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* --------------------------- Prose router --------------------------- */

function ProseSection({ id }: { id: string }) {
  switch (id) {
    case "overview":
      return <Overview />;
    case "authentication":
      return <Authentication />;
    case "rate-limits":
      return <RateLimitsSection />;
    case "idempotency":
      return <Idempotency />;
    case "response-shape":
      return <ResponseShape />;
    case "errors":
      return <ErrorsSection />;
    case "webhooks-overview":
      return <WebhooksOverview />;
    case "webhooks-register":
      return <WebhooksRegister />;
    case "webhooks-auth":
      return <WebhooksAuth />;
    case "webhooks-delivery":
      return <WebhooksDelivery />;
    case "webhooks-payload-whatsapp":
      return <WebhooksPayloadWhatsApp />;
    case "webhooks-payload-sms":
      return <WebhooksPayloadSMS />;
    case "webhooks-payload-rcs":
      return <WebhooksPayloadRCS />;
    case "webhooks-test-event":
      return <WebhooksTestEvent />;
    case "webhooks-reference":
      return <WebhooksReference />;
    default:
      return <Overview />;
  }
}

/* --------------------------- Shared building blocks --------------------------- */

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mb-6 text-[26px] font-semibold tracking-tight">{children}</h1>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 mb-3 text-[17px] font-semibold tracking-tight">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 mb-2 text-[14px] font-semibold tracking-tight">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 max-w-3xl text-[13.5px] leading-relaxed text-foreground/85">
      {children}
    </p>
  );
}

function Bullets({ children }: { children: React.ReactNode }) {
  return (
    <ul className="mb-4 max-w-3xl list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
      {children}
    </ul>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-border bg-secondary/60 px-1 py-[1px] font-mono text-[12px] text-foreground">
      {children}
    </code>
  );
}

/* --------------------------- Prose sections (verbatim from prod) --------------------------- */

function Overview() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Overview</SectionTitle>
      <P>
        Pi Commerce exposes HTTP APIs for campaigns and templates. Authenticate every
        request with a client API key; responses use a consistent envelope with
        per-record outcomes.
      </P>

      <H2>
        Base URL <LinkIcon className="inline h-3 w-3 align-baseline text-muted-foreground" />
      </H2>
      <CodeBlock language="text" code={BASE_URL} />

      <H2>What you can do</H2>
      <Bullets>
        <li>
          Push audience rows into a campaign run (a single JSON object or a JSON array
          of 1–1,000 records per request).
        </li>
        <li>Send approved WhatsApp, SMS, and RCS templates to recipients.</li>
        <li>Inspect per-record queue vs rejection outcomes in the response body.</li>
      </Bullets>

      <H2>Queued vs rejected</H2>
      <P>
        Each item in the <Kbd>records</Kbd> array is evaluated independently. The{" "}
        <Kbd>status</Kbd> field is either <Kbd>"queued"</Kbd> (accepted for processing)
        or <Kbd>"rejected"</Kbd> (validation failed before enqueue). A rejected row
        includes a <Kbd>code</Kbd>; a queued row may include a <Kbd>record_id</Kbd> you
        can correlate in downstream systems.
      </P>
      <Bullets>
        <li>
          <Kbd>queued</Kbd> — passed validation and was accepted into the async pipeline.
        </li>
        <li>
          <Kbd>rejected</Kbd> — failed validation; nothing was enqueued for that row.
        </li>
      </Bullets>
    </div>
  );
}

function Authentication() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Authentication</SectionTitle>
      <P>
        Every request must carry a client API key. Keys are per-workspace and can be
        rotated at any time.
      </P>

      <H2>API key header</H2>
      <P>
        Send your key in the <Kbd>X-API-Key</Kbd> request header. Never place a key in
        a query string or in client-side code that reaches a browser.
      </P>

      <H2>Creating and revoking keys</H2>
      <P>
        Create, view and revoke keys from <strong>Developer › APIs &amp; Webhooks</strong>.
        Revoking a key takes effect immediately; issue a replacement before rotating a
        key in production.
      </P>

      <H2>Unauthorized requests</H2>
      <P>
        A missing, malformed or revoked key is rejected with an HTTP 401 Unauthorized
        status. Requests without a valid key never reach rate limiting or idempotency
        handling.
      </P>
    </div>
  );
}

function RateLimitsSection() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Rate limits</SectionTitle>
      <P>
        Requests are throttled per client and per channel, and each request is bounded
        in both record count and body size.
      </P>

      <H2>Request rate</H2>
      <P>
        Each (client, channel) pair has its own bucket across the four channels. The
        default limit is 15 requests per second; a per-client override can raise or
        lower it. Limits on one channel never consume another channel's allowance.
      </P>

      <H2>Payload limits</H2>
      <Bullets>
        <li>
          Campaign trigger: minimum 1 record, maximum 1,000 records per request. Empty
          array is HTTP 400; more than the maximum is HTTP 413.
        </li>
        <li>
          WhatsApp / SMS / RCS send: minimum 1 recipient, maximum 1,000 recipients per
          request. Empty list is HTTP 400; more than the maximum is HTTP 413.
        </li>
        <li>
          Request body maximum 4 MB on every ingest API; a larger body is rejected with
          HTTP 413 <Kbd>payload_over_limit</Kbd>. There is no separate minimum byte size
          — the body must include at least one record.
        </li>
      </Bullets>

      <H2>429 responses</H2>
      <P>
        When a bucket is exhausted the request is rejected with HTTP 429. Only the 429
        response carries the rate-limit headers <Kbd>X-RateLimit-Limit</Kbd>,{" "}
        <Kbd>X-RateLimit-Remaining</Kbd> (always <Kbd>0</Kbd>) and <Kbd>Retry-After</Kbd>;
        successful responses never include them.
      </P>
    </div>
  );
}

function Idempotency() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Idempotency</SectionTitle>
      <P>
        Optional safety for retries. If a request times out and you are not sure it
        went through, send the same request again with the same key — we will not queue
        duplicate messages.
      </P>

      <H2>When to use it</H2>
      <P>
        Use an idempotency key when your system might retry a call — for example after a
        network timeout or an unclear response. Without a key, a retry is treated as a
        brand-new request and recipients may get the message twice.
      </P>

      <H2>How to use it</H2>
      <ol className="mb-3 max-w-3xl list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li>
          Before the first attempt, pick a unique ID for that send — for example your
          order ID, a UUID, or <Kbd>campaign-12345-attempt-1</Kbd>.
        </li>
        <li>
          Add it as the <Kbd>Idempotency-Key</Kbd> header on the request.
        </li>
        <li>
          If you need to retry, send the <strong>same</strong> header value again. Do
          not generate a new ID for the retry.
        </li>
      </ol>
      <P>
        The first request with that key is processed normally. If we see the same key
        again within 15 minutes, we return the same response and do not queue anything
        again.
      </P>

      <H2>Choosing a key value</H2>
      <P>
        Pi Commerce does not hash or transform your key — send the exact string you want
        us to remember. Use any unique value between 8 and 128 characters. Stick to
        letters, numbers, hyphens (<Kbd>-</Kbd>), dots (<Kbd>.</Kbd>), underscores (<Kbd>_</Kbd>),
        or tildes (<Kbd>~</Kbd>).
      </P>
      <P>
        Good: <Kbd>order-9876543210</Kbd>,{" "}
        <Kbd>550e8400-e29b-41d4-a716-446655440000</Kbd>. Avoid spaces and symbols like{" "}
        <Kbd>/</Kbd> or <Kbd>@</Kbd> — those are rejected.
      </P>

      <H2>Scope</H2>
      <P>
        Keys are tied to your API key (workspace). For campaign trigger calls, the key
        also applies per run — use a new key when you trigger a different run.
      </P>
    </div>
  );
}

function ResponseShape() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Response shape</SectionTitle>
      <P>
        Every endpoint returns the same envelope, whether the call succeeds or fails.
      </P>

      <H2>Success envelope</H2>
      <P>
        A successful call acknowledges with HTTP 202 Accepted and this envelope. The{" "}
        <Kbd>data</Kbd> object is a batch summary; each record has an outcome row.
      </P>
      <CodeBlock
        language="json"
        code={`{
  "status": "SUCCESS",
  "code": "200",
  "message": "successfully processed",
  "data": {
    "run_id": "run_abc123",
    "queued": 2,
    "rejected": 1,
    "records": [
      { "index": 0, "status": "queued", "record_id": "run_abc123_01HZY..." },
      { "index": 1, "status": "queued", "record_id": "run_abc123_01HZZ..." },
      { "index": 2, "status": "rejected", "code": "INVALID_PHONE", "field": "to", "message": "..." }
    ]
  }
}`}
      />

      <H2>Record rows</H2>
      <Bullets>
        <li>
          A queued row carries <Kbd>record_id</Kbd>, formatted{" "}
          <Kbd>{"{runId}_{ulid}"}</Kbd>.
        </li>
        <li>
          A rejected row carries <Kbd>code</Kbd>, <Kbd>field</Kbd> and{" "}
          <Kbd>message</Kbd> — the key is <Kbd>code</Kbd>.
        </li>
        <li>
          The invariant <Kbd>queued + rejected = records.length</Kbd> always holds.
        </li>
      </Bullets>

      <H2>What is not returned</H2>
      <P>
        There is no per-request correlation id on success or error, and no
        correlation-id response header — do not depend on one.
      </P>
    </div>
  );
}

function ErrorsSection() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Error codes</SectionTitle>
      <P>
        Codes are returned exactly as emitted — casing is mixed on purpose. Some fail
        the whole call; others reject a single record inside an otherwise-accepted batch.
      </P>

      <H2>Catalogue</H2>
      <div className="mb-8 max-w-3xl overflow-hidden rounded-lg border border-border">
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-56 px-3 py-2 text-left font-medium">Code</th>
              <th className="w-20 px-3 py-2 text-left font-medium">Status</th>
              <th className="w-32 px-3 py-2 text-left font-medium">Scope</th>
              <th className="px-3 py-2 text-left font-medium">Cause</th>
            </tr>
          </thead>
          <tbody>
            {ERROR_CATALOG.map((e) => (
              <tr key={e.code} className="border-t border-border/60 align-top">
                <td className="px-3 py-2">
                  <code className="font-mono text-[12px]">{e.code}</code>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{e.status}</td>
                <td className="px-3 py-2 text-muted-foreground">{e.scope}</td>
                <td className="px-3 py-2 text-foreground/85">{e.cause}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2>Request and response examples</H2>
      <P>
        Whole-call failures use one of the envelopes below. Per-record rejects inside
        an accepted batch (HTTP 202) are documented on <em>Response shape</em>.
      </P>

      <H3>Empty list (HTTP 400)</H3>
      <P>
        Trigger body is <Kbd>[]</Kbd>. Envelope has no <Kbd>errors</Kbd> array.
      </P>
      <CodeBlock
        language="bash"
        code={`curl -X POST '${BASE_URL}/v1/runs/trigger/{runID}' \\
  -H 'X-API-Key: YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '[]'`}
      />
      <CodeBlock
        language="json"
        code={`{
  "status": "FAILURE",
  "code": "EMPTY_LIST",
  "message": "trigger list must not be empty"
}`}
      />

      <H3>Records over limit (HTTP 413)</H3>
      <P>
        More than 1,000 records in one call. Envelope includes an <Kbd>errors</Kbd>{" "}
        array keyed on <Kbd>code</Kbd>, <Kbd>field</Kbd>, and <Kbd>message</Kbd>.
      </P>
      <CodeBlock
        language="bash"
        code={`curl -X POST '${BASE_URL}/v1/runs/trigger/{runID}' \\
  -H 'X-API-Key: YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '[ /* 1001 record objects */ ]'`}
      />
      <CodeBlock
        language="json"
        code={`{
  "status": "FAILURE",
  "code": "413",
  "message": "records_over_limit: max 1000 records per request, received 1001",
  "errors": [
    {
      "code": "records_over_limit",
      "field": "records",
      "message": "max 1000 records per request, received 1001"
    }
  ]
}`}
      />

      <H3>All recipients rejected (HTTP 422)</H3>
      <P>
        Every recipient failed validation. Same <Kbd>errors</Kbd> envelope as above,
        plus a <Kbd>data</Kbd> payload with the full batch summary.
      </P>
      <CodeBlock
        language="bash"
        code={`curl -X POST '${BASE_URL}/v1/messages/whatsapp/send' \\
  -H 'X-API-Key: YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "template_name": "your_template_name",
    "language": "en_US",
    "from": "YOUR_WHATSAPP_NUMBER",
    "recipients": [
      { "to": "", "variables": { "1": "value1" } },
      { "to": "not-a-phone", "variables": { "1": "value1" } }
    ]
  }'`}
      />
      <CodeBlock
        language="json"
        code={`{
  "status": "FAILURE",
  "code": "422",
  "message": "ALL_RECIPIENTS_REJECTED: no recipient passed validation; see records",
  "data": {
    "run_id": "run_abc123",
    "queued": 0,
    "rejected": 2,
    "records": [
      {
        "index": 0,
        "status": "rejected",
        "code": "INVALID_PHONE",
        "field": "to",
        "message": "'to' is required"
      },
      {
        "index": 1,
        "status": "rejected",
        "code": "INVALID_PHONE",
        "field": "to",
        "message": "'not-a-phone' is not a valid MSISDN"
      }
    ]
  },
  "errors": [
    {
      "code": "ALL_RECIPIENTS_REJECTED",
      "field": "recipients",
      "message": "no recipient passed validation; see records"
    }
  ]
}`}
      />

      <H2>Indistinguishable conditions</H2>
      <P>
        A 404 and each of the six 409 conflict conditions share the same machine code
        (<Kbd>NOT_FOUND</Kbd> / <Kbd>CONFLICT</Kbd>). Read the human-readable{" "}
        <Kbd>message</Kbd> to tell them apart — they cannot be distinguished by code
        alone.
      </P>
    </div>
  );
}

/* --------------------------- Webhooks (verbatim from prod) --------------------------- */

function WebhooksOverview() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Overview</SectionTitle>
      <P>
        Webhooks are the receive side of Pi Commerce. When a message you sent
        changes state - delivered, read, failed - or a contact replies, Pi Commerce
        POSTs a JSON event to an HTTPS endpoint you register.
      </P>

      <H2>How it works</H2>
      <Bullets>
        <li>
          You register an HTTPS endpoint and subscribe it to one or more event types
          on a channel.
        </li>
        <li>
          Pi Commerce POSTs each event to that endpoint with a Bearer token and a set
          of <Kbd>X-Pi-*</Kbd> headers that identify the webhook, the event and the
          delivery attempt.
        </li>
        <li>
          Your endpoint answers with any 2xx status to acknowledge receipt. Non-2xx
          and timeouts are retried.
        </li>
      </Bullets>

      <H2>Event families</H2>
      <P>
        Two families ride the same delivery pipeline: <Kbd>Delivery status</Kbd>{" "}
        events (a message you sent reached a new state) and{" "}
        <Kbd>Incoming message</Kbd> events (a contact replied). Each channel -
        WhatsApp, SMS and RCS - carries its own payload shape, documented per channel
        in this section.
      </P>
      <P>
        Delivery status is available on all three channels. Incoming messages are
        delivered on WhatsApp, and cover every inbound message on the subscribed
        number - not only replies to a campaign you ran.
      </P>

      <H2>What fires and what does not</H2>
      <P>
        Delivery-status events fire for messages you sent through the messages API,
        and for sends made by the CleverTap connector, which reaches the same path.
        Sends that originate from a campaign or workflow node, or from a file-backed
        broadcast run, do not raise delivery-status callbacks.
      </P>
      <P>
        A delivery-status event is also fired for messages you sent, rather than
        delivered, when it cannot be resolved back to a record on your account - so
        treat the events you receive as the subset that correlates cleanly, not as a
        ledger of every send.
      </P>
      <P>
        Incoming-message events fire for every inbound message on the subscribed
        WhatsApp number, including conversations a contact starts themselves. An
        inbound that replies to something you sent additionally carries the
        outbound's record id on the <Kbd>X-Pi-Record-Id</Kbd> header; an unprompted
        inbound has nothing to correlate, so that header is absent.
      </P>

      <H2>Scope</H2>
      <P>
        A webhook is registered against one channel and one sender, and subscribes to
        the event buckets that channel supports:
      </P>
      <Bullets>
        <li>
          <Kbd>WhatsApp</Kbd> - a WABA account and phone number. Subscribes to
          delivery status, incoming messages, or both.
        </li>
        <li>
          <Kbd>SMS</Kbd> - a sender id and principal entity id. Delivery status only.
        </li>
        <li>
          <Kbd>RCS</Kbd> - an agent id and brand id. Delivery status only.
        </li>
      </Bullets>

      <H2>Correlating an event</H2>
      <P>
        Every POST carries the record id it belongs to on the{" "}
        <Kbd>X-Pi-Record-Id</Kbd> header. That header is the one correlation key
        that behaves identically on every channel - the body carries the id only
        where the channel's own schema has a reference field to put it in. The
        header is omitted when an event maps to no record, such as an unprompted
        inbound message.
      </P>

      <H2>What to read next</H2>
      <Bullets>
        <li>
          <Kbd>Register a webhook</Kbd> - create an endpoint from the dashboard and
          pick its events.
        </li>
        <li>
          <Kbd>Auth</Kbd> and <Kbd>Delivery and retries</Kbd> - how each POST is
          signed and how failures are retried.
        </li>
        <li>
          The three payload pages and the Reference - the exact JSON bodies and
          header list you receive.
        </li>
      </Bullets>
    </div>
  );
}

function WebhooksRegister() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Register a webhook</SectionTitle>
      <P>
        Create and manage webhooks from the dashboard under Developer › APIs &amp;
        Webhooks - the same permission model as API keys. Every action is authorised
        against the client scope you select; a scope your account does not own is
        rejected.
      </P>

      <H2>Steps</H2>
      <Bullets>
        <li>Open Developer › APIs &amp; Webhooks and choose Create webhook.</li>
        <li>
          Enter a name. Names are slug-style - lower-case letters, digits, hyphens
          and underscores, 3 to 40 characters - matching{" "}
          <Kbd>{`^[a-z0-9_-]{3,40}$`}</Kbd>, and must be unique across your account.
          Both a malformed name and a name already in use come back as{" "}
          <Kbd>invalid_name</Kbd>, so read the message to tell them apart.
        </li>
        <li>
          Enter an <Kbd>https://</Kbd> endpoint URL. The URL must use HTTPS and
          resolve to a public host - loopback, private and link-local addresses are
          rejected.
        </li>
        <li>Pick the channel and the events the endpoint subscribes to.</li>
        <li>
          Select the scope the webhook applies to. Pi Commerce authorises delivery
          against that client scope; a scope you do not own is rejected.
        </li>
        <li>
          Save. Pi Commerce generates the Bearer token shown on the Auth page and
          begins delivering matching events.
        </li>
      </Bullets>

      <H2>Validation</H2>
      <P>
        The name, channel, scope, events list and endpoint URL are each validated at
        save time. The full set of registration validation codes is on the Reference
        page.
      </P>

      <H2>The fan-out limit</H2>
      <P>
        You may hold up to 5 <strong>active</strong> webhooks against the same
        channel, scope and event subscription. Creating a 6th is rejected with{" "}
        <Kbd>400</Kbd> and the code <Kbd>webhook_limit_exceeded</Kbd> - the message
        reads <em>"Active webhook limit reached for this channel, scope and event."</em>{" "}
        The request is rejected whole; nothing is partially created.
      </P>
      <P>
        Only <Kbd>Active</Kbd> webhooks count toward the limit. Pausing one frees a
        slot immediately, as does deleting one - so if you hit the cap, pause or
        delete a webhook you no longer need rather than trying to raise it. Webhooks
        on a different channel, a different scope, or a different event subscription
        are counted separately and never consume each other's slots.
      </P>

      <H2>After creation</H2>
      <P>
        The scope selectors and the events checklist stay editable. The name, the
        channel and the endpoint URL are fixed once the webhook exists - change one
        of those by deleting the webhook and creating a replacement. A deleted name
        is reusable straight away.
      </P>

      <H2>Scope of these docs</H2>
      <P>
        This page documents the dashboard flow. A programmatic webhook-management
        API is a separate topic and is not covered here.
      </P>
    </div>
  );
}

function WebhooksAuth() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Auth</SectionTitle>
      <P>
        Every webhook has a Bearer token generated when it is created. Pi Commerce
        sends that token as the Authorization header on every POST so your endpoint
        can confirm the request came from Pi Commerce.
      </P>

      <H2>Token format</H2>
      <P>
        A token is the prefix <Kbd>pi_wh_</Kbd> followed by 32 lower-case
        alphanumerics - it matches <Kbd>{`^pi_wh_[a-z0-9]{32}$`}</Kbd>. The token is
        shown once at creation; store it securely.
      </P>

      <H2>Authentication headers</H2>
      <P>
        Three headers carry identity and content type on every POST. They sit
        alongside the <Kbd>X-Pi-*</Kbd> metadata headers, which the Reference page
        lists in full.
      </P>
      <CodeBlock
        language="text"
        code={`Authorization: Bearer pi_wh_ab12cd34ef56gh78ij90kl12mn34op56
Content-Type: application/json
User-Agent: PaytmPiCommerce-Webhook/1.0`}
      />

      <H2>If you lose the token</H2>
      <P>
        The token is shown <strong>once</strong>, in the dialog that opens as soon
        as the webhook is created. It is never returned again - no list, get or
        update response includes it, and there is no reveal, rotate or regenerate
        action. Copy it into your secret store before closing that dialog.
      </P>
      <P>
        If you lose it, the only recovery is to delete the webhook and create a
        replacement, which is issued a fresh token. Point your receiver at the new
        token before deleting the old webhook so you do not drop events in between.
      </P>

      <H2>Verifying the request</H2>
      <Bullets>
        <li>
          Compare the Bearer token on each request against the token you stored for
          that webhook. Reject a request whose token is missing or does not match.
        </li>
        <li>
          A request that presents no valid token receives a 401 from your endpoint
          by convention - Pi Commerce itself uses a 401 numeric status for its own
          auth failures, with no machine code string.
        </li>
      </Bullets>
    </div>
  );
}

function WebhooksDelivery() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Delivery and retries</SectionTitle>
      <P>
        Deliveries are at-least-once and unordered. Your endpoint has 10 seconds to
        answer with a 2xx. Some failures are retried on a fixed ladder; others stop
        delivery on the first attempt, so it is worth knowing which is which.
      </P>

      <H2>Acknowledgement</H2>
      <P>
        Answer with any 2xx status within 10 seconds. The response body is not
        parsed. The 10 seconds are a wall-clock deadline covering connection, TLS
        and the full response - not a per-phase timeout.
      </P>

      <H2>Which failures are retried</H2>
      <P>
        Not every failure enters the ladder, and the difference matters: a failure
        classed permanent is <strong>never retried</strong> and moves the webhook
        straight to <Kbd>Error</Kbd>.
      </P>
      <div className="mb-6 max-w-3xl overflow-hidden rounded-lg border border-border">
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-72 px-3 py-2 text-left font-medium">Your response</th>
              <th className="px-3 py-2 text-left font-medium">What happens</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border/60">
              <td className="px-3 py-2 align-top"><code className="font-mono text-[12px]">2xx</code></td>
              <td className="px-3 py-2 align-top text-foreground/85">Acknowledged. Nothing further.</td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="px-3 py-2 align-top"><code className="font-mono text-[12px]">408, 429, 5xx</code></td>
              <td className="px-3 py-2 align-top text-foreground/85">Retried on the ladder below.</td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="px-3 py-2 align-top"><code className="font-mono text-[12px]">timeout, connection refused, DNS failure, TLS error</code></td>
              <td className="px-3 py-2 align-top text-foreground/85">Retried on the ladder below.</td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="px-3 py-2 align-top"><code className="font-mono text-[12px]">400, 401, 403, 404, 410, any other 4xx</code></td>
              <td className="px-3 py-2 align-top text-foreground/85">Permanent. No retry at all - the webhook moves to <code className="font-mono text-[12px]">Error</code> on this attempt.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <P>
        Worth designing for: if your receiver can return 404 or 401 while you
        deploy, return 503 instead. A single 404 pauses the webhook outright, where
        a 503 is retried for roughly 13 hours and needs no intervention.
      </P>
      <P>
        Redirects are followed rather than treated as a failure, so the status that
        counts is the one at the end of the chain. Register the final URL anyway -
        a redirect costs a round trip on every event and eats into your 10 seconds.
      </P>

      <H2>Retry ladder</H2>
      <P>
        A failed event is retried up to 6 attempts in total (the first send plus 5
        retries). The delay before each retry is fixed, with no jitter:{" "}
        <Kbd>30s, 1m, 15m, 30m, 12h</Kbd> - so the ladder spans roughly 13 hours
        from the first attempt to the last.
      </P>
      <P>
        One exception: if you answer <Kbd>429</Kbd> with a <Kbd>Retry-After</Kbd>{" "}
        header, that value is honoured in place of the ladder delay for the next
        attempt. Use it to pace us when your receiver is saturated.
      </P>

      <H2>The Error state</H2>
      <P>
        A webhook reaches <Kbd>Error</Kbd> two ways: an event exhausts every retry,
        or a single permanent failure lands. Either way the reason is recorded as{" "}
        <Kbd>Auto-paused after retry exhaustion.</Kbd> and no further events are
        delivered to it.
      </P>
      <P>
        Nothing is sent to your endpoint to tell you this happened - a paused
        webhook simply goes quiet. The state is visible in the dashboard, so watch
        it there rather than inferring health from traffic.
      </P>

      <H2>Recovering from Error</H2>
      <P>
        How you recover depends on why the webhook stopped. If it was auto-paused
        because the scope target went away - the WABA was disconnected, the sender
        deprovisioned, the agent deleted - the state clears on its own once that
        target reappears, and deliveries resume without any action from you.
      </P>
      <P>
        If it was retry exhaustion, the state is terminal: Resume answers 409.
        Recover by deleting the webhook and creating a new one; the name is
        reusable immediately. Both are different from a webhook you paused
        yourself, which resumes normally.
      </P>

      <H2>Fan-out, rate limits and idempotency</H2>
      <Bullets>
        <li>
          Up to 5 webhooks may be registered against the same channel, scope and
          event bucket. Every subscribed webhook receives the event, and they all
          fire in parallel.
        </li>
        <li>
          Delivery is per webhook rate-limited to 50 requests/second in a single
          fixed one-second window. Deliveries over that cap are{" "}
          <strong>shed, not queued</strong> - they are dropped and never retried,
          so size your endpoint to absorb the full rate.
        </li>
        <li>
          Each event carries a stable <Kbd>X-Pi-Event-Id</Kbd>, derived from the
          webhook and the event body. A retry reuses the same id, so deduplicate on
          it to make your handler idempotent.
        </li>
        <li>
          Ordering is not guaranteed. Events are delivered at-least-once and may
          arrive out of order, especially across the several webhooks subscribed to
          the same events.
        </li>
      </Bullets>
    </div>
  );
}

function WebhooksPayloadWhatsApp() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Payload: WhatsApp</SectionTitle>
      <P>
        WhatsApp events arrive in Meta's own envelope. Two types are delivered:
        delivery-status updates for messages you sent, and incoming messages when a
        contact replies.
      </P>

      <H2>Envelope</H2>
      <P>
        Every WhatsApp event is the Meta <Kbd>value</Kbd> object carrying{" "}
        <Kbd>messaging_product</Kbd>, <Kbd>metadata</Kbd> and exactly one event in
        either <Kbd>statuses</Kbd> or <Kbd>messages</Kbd>. Each POST carries one
        event, so both arrays always hold a single element.
      </P>
      <P>
        The body carries no Pi Commerce identifier. Correlate an event with the
        record you enqueued using the <Kbd>X-Pi-Record-Id</Kbd> header on the
        request.
      </P>

      <H2>Delivery status</H2>
      <P>
        A delivery-status event reports a new state for a message you sent. The{" "}
        <Kbd>status</Kbd> value is one of <Kbd>sent</Kbd>, <Kbd>delivered</Kbd>,{" "}
        <Kbd>read</Kbd> or <Kbd>failed</Kbd> (lower-case, as the vendor sends it).
        A <Kbd>failed</Kbd> status adds an <Kbd>errors</Kbd> array carrying Meta's{" "}
        <Kbd>code</Kbd> and <Kbd>title</Kbd>.
      </P>
      <CodeBlock
        language="json"
        code={`{
  "messaging_product": "whatsapp",
  "metadata": {
    "display_phone_number": "918031149385",
    "phone_number_id": "1247847365076264"
  },
  "contacts": [
    {
      "wa_id": "918802512442",
      "user_id": "IN.26847259624906067"
    }
  ],
  "statuses": [
    {
      "id": "wamid.HBgMTE4ODAyNTEyNDQyFQIAERgSQTVBNTEzOEVCQjMxQkI2NEM1AA==",
      "status": "delivered",
      "timestamp": "1789382668",
      "recipient_id": "918802512442",
      "recipient_user_id": "IN.26847259624906067"
    }
  ]
}`}
      />

      <H2>Incoming message</H2>
      <P>
        An incoming-message event arrives when a contact replies. A reply to one of
        your messages carries a <Kbd>context</Kbd> block whose <Kbd>id</Kbd> is the{" "}
        <Kbd>wamid</Kbd> of the original outbound message and whose <Kbd>from</Kbd>{" "}
        is the number that sent it. The <Kbd>X-Pi-Record-Id</Kbd> header on the
        same request carries the outbound's record id, so you can thread the reply
        back to what you sent.
      </P>
      <CodeBlock
        language="json"
        code={`{
  "messaging_product": "whatsapp",
  "metadata": {
    "display_phone_number": "918031149385",
    "phone_number_id": "1247847365076264"
  },
  "contacts": [
    {
      "profile": { "name": "Rahul Mehta" },
      "wa_id": "918802512442",
      "user_id": "IN.26847259624906067"
    }
  ],
  "messages": [
    {
      "context": {
        "from": "918031149385",
        "id": "wamid.HBgMTE4ODAyNTEyNDQyFQIAERgSQTVBNTEzOEVCQjMxQkI2NEM1AA=="
      },
      "from": "918802512442",
      "id": "wamid.HBgMTE4ODAyNTEyNDQyFQIAERgSQTVBNTEzOEVCQjMxQkI2NEM1MA",
      "timestamp": "1789407278",
      "text": { "body": "Yes, please confirm my order" },
      "type": "text"
    }
  ]
}`}
      />

      <H2>Message types</H2>
      <P>
        The <Kbd>type</Kbd> field on the message names the type-specific block that
        sits alongside it - a <Kbd>text</Kbd> message carries a <Kbd>text</Kbd>{" "}
        object, a <Kbd>location</Kbd> message carries a <Kbd>location</Kbd> object,
        and so on. Read <Kbd>type</Kbd> first and branch on it rather than probing
        for a particular block.
      </P>
      <P>Meta's inbound types arrive as sent, each with its own block:</P>
      <div className="mb-6 max-w-3xl overflow-hidden rounded-lg border border-border">
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-56 px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Block you read</th>
            </tr>
          </thead>
          <tbody className="[&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">text</code></td><td className="text-foreground/85">text.body</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">image · video · audio · document</code></td><td className="text-foreground/85">(type).id, mime_type, sha256; caption or filename when set</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">sticker</code></td><td className="text-foreground/85">sticker.id, mime_type, sha256, animated</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">location</code></td><td className="text-foreground/85">location.latitude, longitude; name and address when set</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">contacts</code></td><td className="text-foreground/85">contacts[] - an array of contact cards</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">interactive</code></td><td className="text-foreground/85">interactive.button_reply, list_reply or nfm_reply</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">button</code></td><td className="text-foreground/85">button.payload and button.text from a template quick reply</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">reaction</code></td><td className="text-foreground/85">reaction.emoji and the message_id it reacts to</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">order</code></td><td className="text-foreground/85">order - a WhatsApp Commerce order</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">system</code></td><td className="text-foreground/85">system - e.g. the contact changed their number</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">unsupported</code></td><td className="text-foreground/85">a message-level errors[] explaining what Meta could not render</td></tr>
          </tbody>
        </table>
      </div>

      <H2>Fields</H2>
      <Bullets>
        <li><Kbd>metadata.display_phone_number</Kbd> - the WABA number the event belongs to.</li>
        <li><Kbd>statuses[].id</Kbd> / <Kbd>messages[].id</Kbd> - Meta's <Kbd>wamid</Kbd> for the message.</li>
        <li><Kbd>statuses[].status</Kbd> - delivery state, on delivery-status events only.</li>
        <li><Kbd>messages[].type</Kbd> - names the type-specific block on the message.</li>
        <li><Kbd>messages[].context</Kbd> - present when the message replies to one of yours.</li>
      </Bullets>
    </div>
  );
}

function WebhooksPayloadSMS() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Payload: SMS</SectionTitle>
      <P>
        SMS delivery events carry a six-field DLR body. The status value is
        upper-case - DELIVERED or FAILED - following the carrier convention.
      </P>

      <H2>Delivered</H2>
      <CodeBlock
        language="json"
        code={`{
  "referenceId": "rec_7a1c93de20",
  "deliveryTimestamp": "2026-01-16T10:05:45Z",
  "status": "DELIVERED",
  "receiver": "919876543210",
  "code": "000",
  "sender": "PICOMM"
}`}
      />

      <H2>Failed</H2>
      <CodeBlock
        language="json"
        code={`{
  "referenceId": "rec_44b8f1ce07",
  "deliveryTimestamp": "2026-01-16T10:06:12Z",
  "status": "FAILED",
  "receiver": "919876543210",
  "code": "013",
  "sender": "PICOMM"
}`}
      />

      <H2>Fields</H2>
      <Bullets>
        <li><Kbd>referenceId</Kbd> - the record id for the message this DLR belongs to: the same value the send API returned, and the same value carried on the <Kbd>X-Pi-Record-Id</Kbd> header of this request.</li>
        <li><Kbd>deliveryTimestamp</Kbd> - when the carrier reported the final state.</li>
        <li><Kbd>status</Kbd> - <Kbd>DELIVERED</Kbd> or <Kbd>FAILED</Kbd>.</li>
        <li><Kbd>receiver</Kbd> - the recipient MSISDN.</li>
        <li><Kbd>code</Kbd> - the carrier delivery code.</li>
        <li><Kbd>sender</Kbd> - the DLT header the message was sent from.</li>
      </Bullets>
    </div>
  );
}

function WebhooksPayloadRCS() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Payload: RCS</SectionTitle>
      <P>
        RCS delivery events arrive in the upstream provider's own DLR schema. Two
        structures are in use - one posts a flat object, the other nests the event
        under an entity block - so branch on the shape before reading fields.
      </P>

      <H2>Correlating an event</H2>
      <P>
        The reference field on the body carries the public record id for the record
        you enqueued: <Kbd>callbackdata</Kbd> on the flat shape and{" "}
        <Kbd>entity.messageId</Kbd> on the nested shape. The same value is also on
        the <Kbd>X-Pi-Record-Id</Kbd> header of every POST, which is the
        shape-independent way to correlate.
      </P>

      <H2>Delivered</H2>
      <P>
        The flat shape reports state in <Kbd>status</Kbd> using title case -{" "}
        <Kbd>Sent</Kbd>, <Kbd>Delivered</Kbd>, <Kbd>Read</Kbd>. The event time is{" "}
        <Kbd>event_time</Kbd> and the recipient is <Kbd>mobile</Kbd>.
      </P>
      <CodeBlock
        language="json"
        code={`{
  "message_id": "1784909104-tgN1sxsKn-v",
  "callbackdata": "rec_c81f0a2d55",
  "mobile": "919876543210",
  "status": "Delivered",
  "event_time": "2026-01-16T10:05:45Z",
  "channel": "RCS",
  "nc_bot_id": "bot_918273"
}`}
      />

      <H2>Failed</H2>
      <P>
        The nested shape reports state in <Kbd>entity.eventType</Kbd> using upper
        case - <Kbd>SENT</Kbd>, <Kbd>DELIVERED</Kbd>, <Kbd>READ</Kbd>,{" "}
        <Kbd>FAILED</Kbd>. On a failure, <Kbd>entity.error</Kbd> carries the
        reason; it arrives as a bare string on some events and as an object on
        others, so accept both.
      </P>
      <CodeBlock
        language="json"
        code={`{
  "agentId": "jio_agent_5521",
  "entityType": "USER_EVENT",
  "userPhoneNumber": "919876543210",
  "entity": {
    "eventId": "evt_7731aa",
    "eventType": "FAILED",
    "messageId": "rec_a90b7c3e11",
    "sendTime": "2026-01-16T10:07:02Z",
    "error": "Handset unreachable"
  }
}`}
      />

      <H2>Fields</H2>
      <Bullets>
        <li><Kbd>callbackdata</Kbd> / <Kbd>entity.messageId</Kbd> - the public record id for the record this event belongs to.</li>
        <li><Kbd>status</Kbd> / <Kbd>entity.eventType</Kbd> - the delivery state; casing differs between the two shapes, so compare case-insensitively.</li>
        <li><Kbd>event_time</Kbd> / <Kbd>entity.sendTime</Kbd> - when the state was reported.</li>
        <li><Kbd>mobile</Kbd> / <Kbd>userPhoneNumber</Kbd> - the recipient MSISDN.</li>
        <li><Kbd>entity.error</Kbd> - failure reason on a failed event; string or object.</li>
      </Bullets>
    </div>
  );
}

function WebhooksTestEvent() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Test event</SectionTitle>
      <P>
        Send a sample event to a registered webhook from the dashboard to confirm
        your endpoint is reachable and parses the payload correctly, without
        waiting for real traffic.
      </P>

      <H2>Sending a test event</H2>
      <Bullets>
        <li>
          Register the webhook first - see <Kbd>Register a webhook</Kbd>. Test
          events are sent to a saved webhook, not to an endpoint you are still
          typing in.
        </li>
        <li>
          Open the webhook's row menu in Developer › APIs &amp; Webhooks and choose
          Send test event. The same action is offered in the dialog that appears
          right after you create a webhook.
        </li>
        <li>
          If the webhook subscribes to more than one event, name which one to fire;
          with a single subscription it is chosen for you. Naming an event the
          webhook is not subscribed to is rejected with <Kbd>invalid_bucket</Kbd>,
          and omitting it on a multi-event webhook with <Kbd>bucket_required</Kbd>.
        </li>
        <li>
          Pi Commerce builds a representative payload for that combination - the
          same envelope the channel delivers in production, with dummy leaf values.
        </li>
      </Bullets>
      <P>
        Test sends are rate limited per webhook, to two per second by default; over
        that you get <Kbd>429</Kbd> with <Kbd>test_rate_limited</Kbd>. A webhook in
        the <Kbd>Error</Kbd> state cannot be test-sent to at all - that is{" "}
        <Kbd>409</Kbd> with <Kbd>webhook_in_error</Kbd>, and the fix is to delete
        and recreate it.
      </P>

      <H2>What your endpoint receives</H2>
      <P>
        A test send goes to the same endpoint over the same transport, carrying the
        same header <em>names</em> and the same Bearer token as a real delivery. No
        header is added and none is left out, and nothing is added to the body.
      </P>
      <CodeBlock
        language="text"
        code={`X-Pi-Webhook-Id: 481
X-Pi-Event-Id: wh_test_8b28ea41-cd77-4f0a-9a31-6c2f4e77a901
X-Pi-Delivered-At: 2026-01-16T10:05:45Z
X-Pi-Attempt: 1
X-Pi-Record-Id: test_run_test_3f9a12c84b7d4e6fa1c05e9b7d2a8f10
Content-Type: application/json
User-Agent: PaytmPiCommerce-Webhook/1.0
Authorization: Bearer pi_wh_ab12cd34ef56gh78ij90kl12mn34op56`}
      />
      <CodeBlock
        language="json"
        code={`{
  "messaging_product": "whatsapp",
  "metadata": {
    "display_phone_number": "15558100200",
    "phone_number_id": "109988776655443"
  },
  "contacts": [
    { "profile": { "name": "Test Customer" }, "wa_id": "919812345678" }
  ],
  "statuses": [
    {
      "id": "wamid.TEST1737012345",
      "status": "delivered",
      "timestamp": "1737012345",
      "recipient_id": "919812345678",
      "conversation": { "id": "TEST_CONVERSATION_ID" }
    }
  ]
}`}
      />

      <H2>What differs from a real delivery</H2>
      <P>
        Three things carry test-specific values. Everything else -{" "}
        <Kbd>X-Pi-Webhook-Id</Kbd>, <Kbd>X-Pi-Delivered-At</Kbd>,{" "}
        <Kbd>Content-Type</Kbd>, <Kbd>User-Agent</Kbd> and{" "}
        <Kbd>Authorization</Kbd> - is built exactly as it is for real traffic.
      </P>
      <div className="mb-6 max-w-3xl overflow-hidden rounded-lg border border-border">
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-40 px-3 py-2 text-left font-medium">What</th>
              <th className="px-3 py-2 text-left font-medium">On a test send</th>
              <th className="px-3 py-2 text-left font-medium">On a real delivery</th>
            </tr>
          </thead>
          <tbody className="[&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
            <tr className="border-t border-border/60">
              <td><code className="font-mono text-[12px]">X-Pi-Record-Id</code></td>
              <td className="text-foreground/85">Prefixed <code className="font-mono text-[12px]">test_</code> - e.g. <code className="font-mono text-[12px]">{`test_run_test_<32 hex>`}</code>. References no real message.</td>
              <td className="text-foreground/85">The public record id of the message the event belongs to.</td>
            </tr>
            <tr className="border-t border-border/60">
              <td><code className="font-mono text-[12px]">X-Pi-Event-Id</code></td>
              <td className="text-foreground/85">Prefixed <code className="font-mono text-[12px]">wh_test_</code>, followed by a random UUID.</td>
              <td className="text-foreground/85">A 43-character Base64url SHA-256 of the webhook id and the event body.</td>
            </tr>
            <tr className="border-t border-border/60">
              <td><code className="font-mono text-[12px]">Body</code></td>
              <td className="text-foreground/85">The real envelope for the picked channel and event type, with dummy leaf values.</td>
              <td className="text-foreground/85">The event as the upstream provider sent it.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <P>
        Gate on the <Kbd>X-Pi-Record-Id</Kbd> prefix if your receiver needs to
        route test traffic differently - it is the marker intended for that, and
        the one that stays meaningful whatever else changes.
      </P>

      <H2>What a test event does not do</H2>
      <Bullets>
        <li>It is <Kbd>not retried</Kbd>. A non-2xx status or a timeout is reported in the dashboard immediately; the event never enters the retry ladder.</li>
        <li>It does not change the webhook's status and never triggers auto-pause.</li>
        <li>It references no real message, so the record id resolves to no record in your own system.</li>
      </Bullets>
    </div>
  );
}

function WebhooksReference() {
  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>Reference</SectionTitle>
      <P>
        The complete header list on every delivery, the per-channel status
        convention, and the registration validation codes - each pinned to the
        backend that emits it.
      </P>

      <H2>Headers on every POST</H2>
      <div className="mb-6 max-w-3xl overflow-hidden rounded-lg border border-border">
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-56 px-3 py-2 text-left font-medium">Header</th>
              <th className="px-3 py-2 text-left font-medium">Notes</th>
            </tr>
          </thead>
          <tbody className="[&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">X-Pi-Webhook-Id</code></td><td className="text-foreground/85">The id of the webhook the event was delivered to.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">X-Pi-Event-Id</code></td><td className="text-foreground/85">Stable per event; reused across retries - deduplicate on it.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">X-Pi-Delivered-At</code></td><td className="text-foreground/85">The timestamp of this delivery attempt.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">X-Pi-Attempt</code></td><td className="text-foreground/85">The 1-based attempt number for this delivery.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">X-Pi-Record-Id</code></td><td className="text-foreground/85">The public record id; present when the event maps to a record.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">X-Pi-Credit-Consumed</code></td><td className="text-foreground/85">SMS only; present when a credit value is available.</td></tr>
          </tbody>
        </table>
      </div>
      <P>
        Every request also carries <Kbd>Content-Type: application/json</Kbd>, the{" "}
        <Kbd>Authorization: Bearer</Kbd> token and{" "}
        <Kbd>User-Agent: PaytmPiCommerce-Webhook/1.0</Kbd>.
      </P>

      <H2>Status values by channel</H2>
      <P>
        Status values ride verbatim from the upstream provider, so treat them as a
        convention rather than a validated set - and compare case-insensitively,
        because the casing differs per channel and, on RCS, per shape:
      </P>
      <Bullets>
        <li>WhatsApp - <Kbd>statuses[].status</Kbd> is sent, delivered, read, failed (lower-case)</li>
        <li>SMS - <Kbd>status</Kbd> is DELIVERED, FAILED (upper-case)</li>
        <li>RCS (flat shape) - <Kbd>status</Kbd> is Sent, Delivered, Read (title case)</li>
        <li>RCS (nested shape) - <Kbd>entity.eventType</Kbd> is SENT, DELIVERED, READ, FAILED (upper-case)</li>
      </Bullets>

      <H2>Registration validation codes</H2>
      <div className="mb-6 max-w-3xl overflow-hidden rounded-lg border border-border">
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-56 px-3 py-2 text-left font-medium">Code</th>
              <th className="w-20 px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Cause</th>
            </tr>
          </thead>
          <tbody className="[&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">invalid_name</code></td><td className="text-muted-foreground">400</td><td className="text-foreground/85">The webhook name was blank or malformed.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">invalid_channel</code></td><td className="text-muted-foreground">400</td><td className="text-foreground/85">The channel was not one of the supported values.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">invalid_scope</code></td><td className="text-muted-foreground">400</td><td className="text-foreground/85">The subscription scope was missing or unrecognised.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">invalid_events</code></td><td className="text-muted-foreground">400</td><td className="text-foreground/85">One of the requested event types is not a valid event for the channel.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">empty_events</code></td><td className="text-muted-foreground">400</td><td className="text-foreground/85">The events list was empty - subscribe to at least one event.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">endpoint_not_https</code></td><td className="text-muted-foreground">400</td><td className="text-foreground/85">The endpoint URL must use HTTPS.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">endpoint_not_public</code></td><td className="text-muted-foreground">400</td><td className="text-foreground/85">The endpoint URL must resolve to a public host, not a private or loopback address.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">endpoint_locked</code></td><td className="text-muted-foreground">400</td><td className="text-foreground/85">The endpoint is temporarily locked after repeated delivery failures.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">webhook_limit_exceeded</code></td><td className="text-muted-foreground">400</td><td className="text-foreground/85">The client already has the maximum number of active webhooks for this scope.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">scope_target_not_found</code></td><td className="text-muted-foreground">404</td><td className="text-foreground/85">The scope target (e.g. campaign or template) referenced by the subscription does not exist.</td></tr>
          </tbody>
        </table>
      </div>
      <P>
        A missing or invalid Bearer token is answered with a 401 that carries the
        numeric status only - there is no machine code string for it.
      </P>

      <H2>Management and test-send codes</H2>
      <P>
        Managing a webhook after creation, and sending test events to it, can fail
        with codes the registration table does not cover:
      </P>
      <div className="mb-6 max-w-3xl overflow-hidden rounded-lg border border-border">
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-56 px-3 py-2 text-left font-medium">Code</th>
              <th className="w-20 px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Cause</th>
            </tr>
          </thead>
          <tbody className="[&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">bucket_required</code></td><td className="text-muted-foreground">400</td><td className="text-foreground/85">The webhook subscribes to more than one event, so the test send must name which one to fire.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">invalid_bucket</code></td><td className="text-muted-foreground">400</td><td className="text-foreground/85">The named event is not one this webhook subscribes to.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">webhook_in_error</code></td><td className="text-muted-foreground">409</td><td className="text-foreground/85">The webhook is in the Error state. It cannot be resumed or test-sent to - delete it and create a replacement.</td></tr>
            <tr className="border-t border-border/60"><td><code className="font-mono text-[12px]">test_rate_limited</code></td><td className="text-muted-foreground">429</td><td className="text-foreground/85">Too many test events for this webhook in the last second. Retry shortly.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------- Endpoint view --------------------------- */

function EndpointView({ endpoint }: { endpoint: Endpoint }) {
  if (endpoint.stub) {
    return (
      <div>
        <SectionEyebrow>API Docs</SectionEyebrow>
        <SectionTitle>{endpoint.title}</SectionTitle>

        <div className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <MethodPill method={endpoint.method} />
          <code className="font-mono text-[13px]">{endpoint.path}</code>
        </div>

        <P>{endpoint.description}</P>

        <div className="max-w-3xl rounded-lg border border-dashed border-border bg-card/40 px-4 py-6">
          <p className="text-[13px] font-medium">Full reference in progress</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Every endpoint follows the shared contract described under Authentication,
            Response shape and Error codes. Detailed request and response fields for
            this endpoint will land here shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionEyebrow>API Docs</SectionEyebrow>
      <SectionTitle>{endpoint.title}</SectionTitle>

      <div className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <MethodPill method={endpoint.method} />
        <code className="font-mono text-[13px]">{endpoint.path}</code>
      </div>

      <H2>Description</H2>
      <P>{endpoint.description}</P>

      {endpoint.pathParams.length > 0 && (
        <>
          <H2>Path parameters</H2>
          <ParamTable params={endpoint.pathParams} />
        </>
      )}

      {endpoint.headers.length > 0 && (
        <>
          <H2>Headers</H2>
          <ParamTable params={endpoint.headers} />
        </>
      )}

      {endpoint.bodyParams.length > 0 && (
        <>
          <H2>Request body</H2>
          <ParamTable params={endpoint.bodyParams} />
        </>
      )}

      {endpoint.requestExample && (
        <>
          <H2>Sample request</H2>
          <CodeBlock language="bash" code={endpoint.requestExample} />
        </>
      )}

      {endpoint.responseOkExample && (
        <>
          <H2>Sample response</H2>
          <CodeBlock language="json" code={endpoint.responseOkExample} />
        </>
      )}

      {endpoint.rateLimits && (
        <>
          <H2>Rate limits</H2>
          <P>{endpoint.rateLimits}</P>
        </>
      )}

      {endpoint.notes && (
        <>
          <H2>Notes</H2>
          <P>{endpoint.notes}</P>
        </>
      )}
    </div>
  );
}

/* --------------------------- Reusable bits --------------------------- */

function MethodPill({ method, compact }: { method: string; compact?: boolean }) {
  const tone: Record<string, string> = {
    GET: "bg-ai/10 text-ai border-ai/30",
    POST: "bg-success/10 text-success border-success/30",
    PUT: "bg-warning/10 text-warning border-warning/30",
    DELETE: "bg-destructive/10 text-destructive border-destructive/30",
    PATCH: "bg-secondary text-muted-foreground border-border",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded border font-mono font-semibold",
        compact
          ? "min-w-[36px] px-1 text-[9.5px]"
          : "min-w-[48px] px-1.5 py-0.5 text-[10.5px]",
        tone[method] ?? "bg-secondary text-muted-foreground border-border",
      )}
    >
      {method}
    </span>
  );
}

function ParamTable({ params }: { params: Param[] }) {
  return (
    <div className="mb-6 max-w-3xl overflow-hidden rounded-lg border border-border">
      <table className="w-full text-[12.5px]">
        <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="w-56 px-3 py-2 text-left font-medium">Field</th>
            <th className="w-24 px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Details</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name} className="border-t border-border/60">
              <td className="px-3 py-2 align-top">
                <code className="font-mono text-[12px]">{p.name}</code>
                {p.required && (
                  <span className="ml-1 text-[10px] font-medium text-destructive">*</span>
                )}
              </td>
              <td className="px-3 py-2 align-top text-muted-foreground">{p.type}</td>
              <td className="px-3 py-2 align-top text-foreground/85">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border bg-secondary/20 px-3 py-1.5 text-[10.5px] text-muted-foreground">
        <span className="text-destructive">*</span> Required.
      </div>
    </div>
  );
}

function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: "bash" | "json" | "text";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-4 max-w-3xl overflow-hidden rounded-lg border border-border bg-[#0b1220] text-[#d0d7e2]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-white/60">
          {language}
        </span>
        <button
          onClick={() => {
            navigator.clipboard
              ?.writeText(code)
              .then(() => {
                setCopied(true);
                toast.success("Copied");
                setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => undefined);
          }}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-white/70 hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-[12px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
