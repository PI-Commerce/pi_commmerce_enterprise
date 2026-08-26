/**
 * Developer > API Docs.
 *
 * Standard SaaS API-docs layout: fixed left rail with grouped sections and
 * endpoints, right pane with the selected section. No routing yet; selection
 * is component-local state, so this can live inside the Developer tab shell
 * without touching the router.
 *
 * Sections are:
 *   - Get started (Overview, Authentication, Rate limits, Idempotency,
 *     Response shape, Error codes), prose and cross-cutting
 *   - Campaign Trigger APIs (Single Record, Batch)
 *   - Channel APIs (Send WhatsApp / SMS / RCS Template)
 *
 * Data lives in @/lib/api-docs. This file is pure rendering.
 */

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";
import {
  BASE_URL,
  ENDPOINTS,
  NAV_GROUPS,
  RATE_LIMITS,
  RECORD_ERRORS,
  RESPONSE_200_FIELDS,
  RESPONSE_ERROR_FIELDS,
  RESPONSE_RECORDS_ITEM_FIELDS,
  WHOLE_CALL_ERRORS,
  type Endpoint,
  type Param,
} from "@/lib/api-docs";

/* --------------------------- Root --------------------------- */

export function ApiDocs() {
  const [sectionId, setSectionId] = useState<string>("overview");
  const activeEndpoint = ENDPOINTS.find((e) => e.id === sectionId);

  return (
    <div className="flex min-h-[calc(100vh-13rem)] gap-8">
      {/* Left rail */}
      <aside className="w-[220px] shrink-0 border-r border-border pr-4">
        <NavRail activeId={sectionId} onSelect={setSectionId} />
      </aside>

      {/* Right pane */}
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
  activeId, onSelect,
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

/* --------------------------- Prose sections --------------------------- */

function ProseSection({ id }: { id: string }) {
  switch (id) {
    case "overview":       return <Overview />;
    case "authentication": return <Authentication />;
    case "rate-limits":    return <RateLimitsSection />;
    case "idempotency":    return <Idempotency />;
    case "response-shape": return <ResponseShape />;
    case "errors":         return <ErrorsSection />;
    default:               return <Overview />;
  }
}

function SectionHeader({ eyebrow, title, lede }: { eyebrow?: string; title: string; lede?: string }) {
  return (
    <div className="mb-8 max-w-3xl">
      {eyebrow && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {eyebrow}
        </p>
      )}
      <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
      {lede && <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">{lede}</p>}
    </div>
  );
}

function H2({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-10 mb-3 text-[17px] font-semibold tracking-tight">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 max-w-3xl text-[13.5px] leading-relaxed text-foreground/85">{children}</p>;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-border bg-secondary/60 px-1 py-[1px] font-mono text-[12px] text-foreground">
      {children}
    </code>
  );
}

function Overview() {
  return (
    <div>
      <SectionHeader
        eyebrow="API Docs"
        title="Overview"
        lede="Pi Commerce exposes a set of HTTP APIs to trigger campaigns and send templates directly. Everything below applies to every endpoint unless a specific endpoint page says otherwise."
      />
      <H2>Base URL</H2>
      <div className="mb-3">
        <CodeBlock language="text" code={BASE_URL} />
      </div>

      <H2>What you can do</H2>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li>Push audience into an API based campaign Run (both Time-scoped, and Always-on Runs), one record or up to a thousand per call.</li>
        <li>Send an approved WhatsApp / SMS / RCS template to one or many records, without creating a campaign in the UI.</li>
      </ul>

      <H2>Queued vs rejected</H2>
      <P>
        Every accepted call returns a <Kbd>records</Kbd> array with one entry per record you sent. Each entry has a
        {" "}<Kbd>status</Kbd> of either <Kbd>"queued"</Kbd> or <Kbd>"rejected"</Kbd>.
      </P>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li>
          <strong>queued</strong>: the record passed validation and was accepted for processing. It is not a promise
          of delivery. Business filters (dedupe, DND, channel failures) run afterwards on the queue and may still
          reduce how many are actually contacted. Every queued entry carries a <Kbd>record_id</Kbd> for later
          correlation.
        </li>
        <li>
          <strong>rejected</strong>: the record failed validation (missing field, wrong type, invalid phone number).
          The entry carries an <Kbd>error_code</Kbd> so you know why. One bad record never blocks the rest of the
          batch.
        </li>
      </ul>

      <H2>Conventions</H2>
      <P>
        Every endpoint returns the same response shape on HTTP 200: <Kbd>request_id</Kbd>, counts, and a{" "}
        <Kbd>records</Kbd> array with one entry per submitted record. Whole-call failures return HTTP 4xx or 5xx with{" "}
        <Kbd>request_id</Kbd> and a stable <Kbd>error_code</Kbd>. See <em>Response shape</em> and <em>Error codes</em>.
      </P>
    </div>
  );
}

function Authentication() {
  return (
    <div>
      <SectionHeader
        eyebrow="Get started"
        title="Authentication"
        lede="Every API call must include a valid API key. Keys are scoped to your client and are revocable."
      />
      <H2>Header</H2>
      <P>
        Send your key in the <Kbd>X-API-Key</Kbd> header on every request.
      </P>
      <CodeBlock language="bash" code={`curl -X POST '${BASE_URL}/v1/runs/trigger/r_782' \\\n  -H 'X-API-Key: pk_YOUR_API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -d '[{"phone":"9812345678","name":"Asha"}]'`} />

      <H2>Generating and revoking keys</H2>
      <P>
        Create and manage keys under <strong>Developer &gt; APIs &amp; Webhooks</strong>. The full secret is shown only
        once, at creation time, so save it before closing the dialog. Revoke a key at any point; existing calls using it
        will start failing with <Kbd>auth_rejected</Kbd>.
      </P>
    </div>
  );
}

function RateLimitsSection() {
  return (
    <div>
      <SectionHeader
        eyebrow="Get started"
        title="Rate limits"
        lede="Limits apply per client and pool across all your API keys and runs. They are the same for the Batch Campaign Trigger and the Direct Channel APIs."
      />
      <ul className="mb-6 space-y-2 text-[13.5px] leading-relaxed text-foreground/85">
        {RATE_LIMITS.map((l) => (
          <li key={l} className="flex items-baseline gap-2">
            <span className="text-muted-foreground">•</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>

      <H2>What happens when you exceed a limit</H2>
      <P>
        Breaches return HTTP 429 with <Kbd>error_code</Kbd> <Kbd>rate_limited</Kbd>. The response also includes the
        standard rate-limit headers so your client can back off cleanly:
      </P>
      <ul className="mb-3 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li><Kbd>X-RateLimit-Limit</Kbd>: the ceiling that applies to this endpoint</li>
        <li><Kbd>X-RateLimit-Remaining</Kbd>: how many calls you have left in the current window</li>
        <li><Kbd>Retry-After</Kbd>: seconds until the window resets</li>
      </ul>
    </div>
  );
}

function Idempotency() {
  return (
    <div>
      <SectionHeader
        eyebrow="Get started"
        title="Idempotency"
        lede="Idempotency is opt-in. Send an Idempotency-Key header if you want retry safety, for example when a call times out and you cannot tell whether it was processed."
      />
      <H2>How it works</H2>
      <P>
        Add an <Kbd>Idempotency-Key</Kbd> header on the request. If we have already processed a call with that key from
        your client within the last 15 minutes, we return the original response unchanged, including the same{" "}
        <Kbd>record_id</Kbd>s. No records are queued a second time.
      </P>
      <P>
        Keys are alphanumeric and must be unique per intended call. Common patterns are a UUID or a SHA-256 digest of the
        request body. If the header is absent, the request is processed as new; a retry after a timeout may result in
        duplicate messaging.
      </P>
      <H2>Scope</H2>
      <P>Keys are scoped per client and per run. The same key against a different run is treated as a different request.</P>
    </div>
  );
}

function ResponseShape() {
  return (
    <div>
      <SectionHeader
        eyebrow="Get started"
        title="Response shape"
        lede="Every endpoint uses the same response contract. Code once, use everywhere."
      />

      <H2>HTTP 200</H2>
      <P>
        Every accepted call returns a top-level object with a request identifier, per-run counts, and a{" "}
        <Kbd>records</Kbd> array. The length of <Kbd>records</Kbd> always equals the number of records you sent, and{" "}
        <Kbd>queued + rejected</Kbd> always equals that length.
      </P>
      <ParamTable params={RESPONSE_200_FIELDS} caption="Top-level fields" />
      <ParamTable params={RESPONSE_RECORDS_ITEM_FIELDS} caption="Each entry inside records[]" />

      <H2>HTTP 4xx and 5xx</H2>
      <P>Whole-call failures return the same two-field body regardless of status code.</P>
      <ParamTable params={RESPONSE_ERROR_FIELDS} caption="Error body" />
    </div>
  );
}

function ErrorsSection() {
  return (
    <div>
      <SectionHeader
        eyebrow="Get started"
        title="Error codes"
        lede="Codes are stable machine identifiers. Use error_code in your integration logic; the HTTP status is a hint at the class of error."
      />

      <H2>Whole-call errors</H2>
      <P>Returned as the top-level <Kbd>error_code</Kbd> on HTTP 4xx / 5xx responses.</P>
      <div className="mb-8 max-w-3xl overflow-hidden rounded-lg border border-border">
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-16 px-3 py-2 text-left font-medium">HTTP</th>
              <th className="w-48 px-3 py-2 text-left font-medium">error_code</th>
              <th className="px-3 py-2 text-left font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {WHOLE_CALL_ERRORS.map((e) => (
              <tr key={`${e.http}-${e.code}`} className="border-t border-border/60">
                <td className="px-3 py-2 align-top text-muted-foreground">{e.http}</td>
                <td className="px-3 py-2 align-top">
                  <code className="font-mono text-[12px]">{e.code}</code>
                </td>
                <td className="px-3 py-2 align-top text-foreground/85">{e.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2>Per-record errors</H2>
      <P>Returned as <Kbd>error_code</Kbd> on individual entries inside <Kbd>records[]</Kbd> whose <Kbd>status</Kbd> is <Kbd>"rejected"</Kbd>.</P>
      <div className="max-w-3xl overflow-hidden rounded-lg border border-border">
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-48 px-3 py-2 text-left font-medium">error_code</th>
              <th className="px-3 py-2 text-left font-medium">Covers</th>
            </tr>
          </thead>
          <tbody>
            {RECORD_ERRORS.map((e) => (
              <tr key={e.code} className="border-t border-border/60">
                <td className="px-3 py-2 align-top">
                  <code className="font-mono text-[12px]">{e.code}</code>
                </td>
                <td className="px-3 py-2 align-top text-foreground/85">{e.covers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------- Endpoint view --------------------------- */

function EndpointView({ endpoint }: { endpoint: Endpoint }) {
  return (
    <div>
      <SectionHeader eyebrow="Endpoint" title={endpoint.title} lede={endpoint.short} />

      <div className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <MethodPill method={endpoint.method} />
        <code className="font-mono text-[13px]">{endpoint.path}</code>
      </div>

      <P>{endpoint.description}</P>

      <H2>Authentication</H2>
      <P>{endpoint.auth}</P>

      {endpoint.pathParams.length > 0 && (
        <>
          <H2>Path parameters</H2>
          <ParamTable params={endpoint.pathParams} />
        </>
      )}

      <H2>Headers</H2>
      <ParamTable params={endpoint.headers} />

      <H2>Request body</H2>
      <P>
        {endpoint.bodyRoot.type === "array"
          ? "A JSON array of records. Send an array with a single object when triggering with one record."
          : "A JSON object with the fields below."}
      </P>
      <ParamTable params={endpoint.bodyRoot.fields} />

      <H2>Sample request</H2>
      <CodeBlock language="bash" code={endpoint.requestExample} />

      <H2>Sample response: HTTP 200</H2>
      <CodeBlock language="json" code={endpoint.responseOkExample} />

      <H2>Sample response: whole-call error</H2>
      <CodeBlock language="json" code={endpoint.responseErrorExample} />

      <H2>Rate limits</H2>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        {endpoint.rateLimits.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>

      {endpoint.notes && endpoint.notes.length > 0 && (
        <>
          <H2>Notes</H2>
          <ul className="mb-4 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
            {endpoint.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
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
        compact ? "min-w-[36px] px-1 text-[9.5px]" : "min-w-[48px] px-1.5 py-0.5 text-[10.5px]",
        tone[method] ?? "bg-secondary text-muted-foreground border-border",
      )}
    >
      {method}
    </span>
  );
}

function ParamTable({ params, caption }: { params: Param[]; caption?: string }) {
  return (
    <div className="mb-6 max-w-3xl overflow-hidden rounded-lg border border-border">
      {caption && (
        <div className="border-b border-border bg-secondary/30 px-3 py-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
          {caption}
        </div>
      )}
      <table className="w-full text-[12.5px]">
        <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="w-40 px-3 py-2 text-left font-medium">Field</th>
            <th className="w-40 px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Description</th>
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

function CodeBlock({ code, language }: { code: string; language: "bash" | "json" | "text" }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-4 max-w-3xl overflow-hidden rounded-lg border border-border bg-[#0b1220] text-[#d0d7e2]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-white/60">{language}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              toast.success("Copied");
              setTimeout(() => setCopied(false), 1500);
            }).catch(() => undefined);
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
