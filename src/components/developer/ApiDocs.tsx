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
