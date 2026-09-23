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
    case "overview":            return <Overview />;
    case "authentication":      return <Authentication />;
    case "rate-limits":         return <RateLimitsSection />;
    case "idempotency":         return <Idempotency />;
    case "response-shape":      return <ResponseShape />;
    case "errors":              return <ErrorsSection />;
    case "webhooks-overview":   return <WebhooksOverview />;
    case "webhooks-register":   return <WebhooksRegister />;
    case "webhooks-auth":       return <WebhooksAuth />;
    case "webhooks-delivery":   return <WebhooksDelivery />;
    case "webhooks-wa":         return <WebhooksWA />;
    case "webhooks-sms":        return <WebhooksSMS />;
    case "webhooks-rcs":        return <WebhooksRCS />;
    case "webhooks-testing":    return <WebhooksTesting />;
    case "webhooks-reference":  return <WebhooksReference />;
    default:                    return <Overview />;
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

/* --------------------------- Webhooks prose --------------------------- */

function WebhooksOverview() {
  return (
    <div>
      <SectionHeader
        eyebrow="Webhooks"
        title="Overview"
        lede="Pi Commerce POSTs channel events to an HTTPS endpoint you register. Delivery Status and Incoming Messages fire in real time as events arrive from the underlying vendor."
      />
      <H2>What you get</H2>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li>One POST per event to your endpoint. No batching.</li>
        <li>Body follows the vendor's own webhook shape as received. WhatsApp uses Meta's shape, SMS uses the canonicalised Bulk Panel DLR, RCS is normalised to a Meta-flavoured Pi shape.</li>
        <li>Pi metadata (record id, event id, attempt count, etc.) rides in HTTP headers, never inside the body.</li>
      </ul>

      <H2>Scope</H2>
      <P>
        You register a webhook against one channel and one sender. Options per channel:
      </P>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li><strong>WhatsApp:</strong> WABA + phone number, subscribed to Delivery Status and/or Incoming Messages.</li>
        <li><strong>SMS:</strong> Sender ID, subscribed to Delivery Status.</li>
        <li><strong>RCS:</strong> Agent, subscribed to Delivery Status.</li>
      </ul>

      <H2>Correlation</H2>
      <P>
        Every callback carries <Kbd>X-Pi-Record-Id</Kbd> in the headers. That is the same <Kbd>record_id</Kbd> we returned to you when you called our send API, so you can join a callback back to the message you sent. For inbound WhatsApp replies to messages you sent via API, the same header carries the outbound's record id so you can thread the reply.
      </P>

      <H2>What fires and what does not</H2>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li><strong>Delivery Status</strong> fires only for messages you sent via the API. Messages sent from file-upload campaigns or the Broadcasts UI do not trigger callbacks.</li>
        <li><strong>Incoming Messages</strong> is currently available on WhatsApp only. It fires for every inbound message on the phone number you subscribed the webhook against. Cold-start inbounds and replies both flow through.</li>
      </ul>
    </div>
  );
}

function WebhooksRegister() {
  return (
    <div>
      <SectionHeader
        eyebrow="Webhooks"
        title="Register a webhook"
        lede="Create and manage your webhooks under Developer > APIs & Webhooks."
      />
      <H2>Register from the dashboard</H2>
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li>Go to <strong>Developer &gt; APIs &amp; Webhooks</strong>. The Channel webhooks section sits below API keys.</li>
        <li>Click <Kbd>+ Add webhook</Kbd>.</li>
        <li>Give it a name (slug-style: lowercase letters, digits, hyphens or underscores; 3 to 40 characters).</li>
        <li>Pick a channel and the sender it should listen on.</li>
        <li>Paste your HTTPS endpoint URL. Private and internal hosts are not allowed.</li>
        <li>Pick which event buckets to subscribe to (Delivery Status, Incoming Messages if WhatsApp).</li>
        <li>Submit. An auth token is generated and shown once. Save it. It is not shown again.</li>
      </ol>

      <H2>Limits</H2>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li>Maximum <strong>5 webhooks per (channel, scope, bucket)</strong>. Fan-out to more than 5 receivers on the same event set is not supported.</li>
        <li>Endpoint must be a public HTTPS URL. Loopback, RFC1918, link-local, <Kbd>.internal</Kbd> and <Kbd>.local</Kbd> are rejected.</li>
      </ul>

      <H2>Edit and delete</H2>
      <P>
        You can edit the scope selectors and events checklist on any webhook. Name, channel and endpoint URL are fixed after creation. If you lose the auth token, delete the webhook and create a new one.
      </P>

      <H2>Roles</H2>
      <P>
        Both <Kbd>ORG_OWNER</Kbd> and <Kbd>MEMBER</Kbd> can create, edit, pause, resume and delete channel webhooks. Same permission model as API keys.
      </P>
    </div>
  );
}

function WebhooksAuth() {
  return (
    <div>
      <SectionHeader
        eyebrow="Webhooks"
        title="Auth"
        lede="Every webhook has a Bearer token generated on creation. Pi Commerce sends it as the Authorization header on every POST. Your receiver validates by string-comparing against the token you saved."
      />
      <H2>Token format</H2>
      <P>
        Prefix <Kbd>pi_wh_</Kbd> plus 32 alphanumerics. Example: <Kbd>pi_wh_c0hc5lr76qj9wa2m1gircpz37qp8xx8a</Kbd>.
      </P>

      <H2>Every POST carries</H2>
      <CodeBlock language="text" code={`Authorization: Bearer pi_wh_c0hc5lr76qj9wa2m1gircpz37qp8xx8a\nContent-Type: application/json`} />

      <H2>Verify on your side</H2>
      <P>
        String-compare the <Kbd>Authorization</Kbd> header against the token you stored at webhook creation. Reject any request whose header does not match verbatim.
      </P>

      <H2>Losing the token</H2>
      <P>
        The full token is shown once at creation and is never returned again by any list, get, or update response. If you lose it, delete the webhook and create a new one with a fresh token.
      </P>
    </div>
  );
}

function WebhooksDelivery() {
  return (
    <div>
      <SectionHeader
        eyebrow="Webhooks"
        title="Delivery and retries"
        lede="Deliveries are at-least-once and unordered. Your endpoint has 10 seconds to respond with a 2xx. Anything else counts as a failure and enters the retry ladder."
      />
      <H2>Response requirement</H2>
      <P>
        Return HTTP <Kbd>2xx</Kbd> within <strong>10 seconds</strong>. The response body is not parsed. Non-2xx, timeouts, network errors, and TLS errors all count as a failed delivery.
      </P>

      <H2>Retry ladder</H2>
      <P>
        We retry a failed delivery five times, then auto-pause the webhook.
      </P>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li>Attempt 1: initial send</li>
        <li>Attempt 2: 30 seconds after the previous failure</li>
        <li>Attempt 3: 1 minute later</li>
        <li>Attempt 4: 15 minutes later</li>
        <li>Attempt 5: 30 minutes later</li>
        <li>Attempt 6: 12 hours later</li>
      </ul>
      <P>
        Total window: roughly 13 hours. After the sixth failed attempt, the webhook moves to <Kbd>Error</Kbd> in the dashboard with reason <em>Auto-paused after retry exhaustion</em>. No further deliveries fire.
      </P>

      <H2>Idempotency</H2>
      <P>
        Every delivery carries a stable <Kbd>X-Pi-Event-Id</Kbd> header. On retries the same id is repeated. Use it to dedupe on your side so a retried event does not double-process.
      </P>

      <H2>Recovering from Error</H2>
      <P>
        If the auto-pause was due to a scope change on our side (WABA disconnected, sender deprovisioned, agent deleted), the state clears automatically when the scope target reappears. If it was due to retry exhaustion, delete the webhook and create a new one.
      </P>

      <H2>Fan-out and rate limits</H2>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li>Up to <strong>5 webhooks</strong> per (channel, scope, bucket). All subscribed webhooks fire in parallel.</li>
        <li>Up to <strong>25 requests per second</strong> sustained per single webhook URL, with a burst of 50.</li>
      </ul>
    </div>
  );
}

function WebhooksWA() {
  const dlrExample = `{
  "messaging_product": "whatsapp",
  "metadata": {
    "display_phone_number": "918031149385",
    "phone_number_id": "1247847365076264"
  },
  "contacts": [{
    "wa_id": "918802512442",
    "user_id": "IN.26847259624906067"
  }],
  "statuses": [{
    "id": "wamid.HBgMOTE4ODAyNTEyNDQyFQIAERgSQTVBNTEzOEVCQjMxQkI2NEM1AA==",
    "status": "delivered",
    "timestamp": "1789382668",
    "recipient_id": "918802512442",
    "recipient_user_id": "IN.26847259624906067"
  }]
}`;
  const inboundExample = `{
  "messaging_product": "whatsapp",
  "metadata": {
    "display_phone_number": "918031149385",
    "phone_number_id": "1247847365076264"
  },
  "contacts": [{
    "profile": { "name": "Rahul Mehta" },
    "wa_id": "918802512442",
    "user_id": "IN.26847259624906067"
  }],
  "messages": [{
    "context": {
      "from": "918031149385",
      "id": "wamid.HBgMOTE4ODAyNTEyNDQyFQIAERgSRUFFMTBGMzVFM0JCREExNDNCAA=="
    },
    "from": "918802512442",
    "from_user_id": "IN.26847259624906067",
    "id": "wamid.HBgMOTE4ODAyNTEyNDQyFQIAEhgUM0EyNTM0QjU4MzlEMUVCNzFCQjMA",
    "timestamp": "1789407278",
    "text": { "body": "Hhhh" },
    "type": "text"
  }]
}`;
  return (
    <div>
      <SectionHeader
        eyebrow="Webhooks"
        title="Payload: WhatsApp"
        lede="WhatsApp callbacks follow Meta's own shape, as received. One event per POST. Pi metadata rides in headers."
      />
      <H2>Delivery Status</H2>
      <P>
        Fires on each status transition for a message you sent via the API: <Kbd>sent</Kbd>, <Kbd>delivered</Kbd>, <Kbd>read</Kbd>, or <Kbd>failed</Kbd>.
      </P>
      <CodeBlock language="json" code={dlrExample} />
      <P>
        On <Kbd>failed</Kbd>, <Kbd>statuses[0]</Kbd> adds an <Kbd>errors</Kbd> array with <Kbd>code</Kbd>, <Kbd>title</Kbd> and <Kbd>error_data.details</Kbd> from Meta.
      </P>

      <H2>Incoming Messages</H2>
      <P>
        Fires for every inbound message on the phone number the webhook is scoped to. This includes cold-start conversations, replies, forwards, quick-reply / interactive responses, media, location, reactions, orders, system events, and Meta's unsupported bucket.
      </P>
      <CodeBlock language="json" code={inboundExample} />
      <P>
        For replies to outbound messages you sent via API, <Kbd>messages[0].context.id</Kbd> holds the outbound's wamid and the <Kbd>X-Pi-Record-Id</Kbd> header holds the outbound's record id so you can thread.
      </P>

      <H2>Type-specific blocks on inbound</H2>
      <P>
        The <Kbd>messages[0].type</Kbd> field tells you which block to read. Meta types passed through as received:
      </P>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li><Kbd>text</Kbd> — <Kbd>text.body</Kbd></li>
        <li><Kbd>image</Kbd>, <Kbd>video</Kbd>, <Kbd>audio</Kbd>, <Kbd>document</Kbd> — <Kbd>{"{type}.id"}</Kbd>, <Kbd>mime_type</Kbd>, <Kbd>sha256</Kbd>, optional <Kbd>caption</Kbd> / <Kbd>filename</Kbd></li>
        <li><Kbd>sticker</Kbd> — id, mime, sha256, <Kbd>animated</Kbd></li>
        <li><Kbd>location</Kbd> — <Kbd>latitude</Kbd>, <Kbd>longitude</Kbd>, optional name / address</li>
        <li><Kbd>contacts</Kbd> — array of contact cards</li>
        <li><Kbd>interactive</Kbd> — <Kbd>button_reply</Kbd> / <Kbd>list_reply</Kbd> / <Kbd>nfm_reply</Kbd></li>
        <li><Kbd>button</Kbd> — quick-reply payload from a template</li>
        <li><Kbd>reaction</Kbd> — emoji reaction on a prior message</li>
        <li><Kbd>order</Kbd> — WhatsApp Commerce order</li>
        <li><Kbd>system</Kbd> — user changed number event</li>
        <li><Kbd>unsupported</Kbd> — Meta got something it cannot render, with a message-level <Kbd>errors</Kbd> array</li>
      </ul>
    </div>
  );
}

function WebhooksSMS() {
  const example = `{
  "referenceId": "run_abc123_01HZYABCXYZ...",
  "deliveryTimestamp": "2026-09-08T03:52:27",
  "status": "DELIVERED",
  "receiver": "919676166793",
  "code": "000",
  "sender": "iPaytm"
}`;
  return (
    <div>
      <SectionHeader
        eyebrow="Webhooks"
        title="Payload: SMS"
        lede="SMS callbacks follow the canonicalised Bulk Panel DLR shape. One event per POST. Two status values only: DELIVERED and FAILED."
      />
      <H2>Delivery Status</H2>
      <CodeBlock language="json" code={example} />

      <H2>Fields</H2>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li><Kbd>referenceId</Kbd> — your record id, the same value we returned in the send API response. Also mirrored in the <Kbd>X-Pi-Record-Id</Kbd> header.</li>
        <li><Kbd>deliveryTimestamp</Kbd> — ISO 8601 timestamp of the delivery outcome.</li>
        <li><Kbd>status</Kbd> — <Kbd>DELIVERED</Kbd> or <Kbd>FAILED</Kbd>. No intermediate states.</li>
        <li><Kbd>receiver</Kbd> — recipient MSISDN.</li>
        <li><Kbd>code</Kbd> — operator status code. <Kbd>000</Kbd> for delivery success. Other codes for failure buckets (see Reference).</li>
        <li><Kbd>sender</Kbd> — the Sender ID header, matches what your webhook is scoped against.</li>
      </ul>

    </div>
  );
}

function WebhooksRCS() {
  const example = `{
  "messaging_product": "rcs",
  "metadata": {
    "agent_id": "acme_promo_bot"
  },
  "statuses": [{
    "id": "run_abc123_01HZYABCXYZ...",
    "record_id": "run_abc123_01HZYABCXYZ...",
    "status": "delivered",
    "timestamp": "1725678427",
    "recipient_id": "+919951900895"
  }]
}`;
  const failedExample = `{
  "messaging_product": "rcs",
  "metadata": { "agent_id": "acme_promo_bot" },
  "statuses": [{
    "id": "run_abc123_01HZYABCXYZ...",
    "record_id": "run_abc123_01HZYABCXYZ...",
    "status": "failed",
    "timestamp": "1725678427",
    "recipient_id": "+919951900895",
    "errors": [{
      "code": "not_found",
      "title": "User Not Found",
      "error_data": { "details": "..." }
    }]
  }]
}`;
  return (
    <div>
      <SectionHeader
        eyebrow="Webhooks"
        title="Payload: RCS"
        lede="RCS callbacks are normalised to a Meta-flavoured Pi shape regardless of the underlying vendor. Your code stays vendor-agnostic."
      />
      <H2>Why normalised</H2>
      <P>
        RCS in India runs on multiple vendors. Which vendor delivers a given message is decided by our routing at send time and can change. Instead of exposing two different vendor shapes to you, we translate both into a single stable Pi shape. Your receiver codes once and never has to know which vendor is behind the scenes.
      </P>

      <H2>Delivery Status</H2>
      <CodeBlock language="json" code={example} />

      <H2>Failure</H2>
      <CodeBlock language="json" code={failedExample} />

      <H2>Fields</H2>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li><Kbd>id</Kbd> and <Kbd>record_id</Kbd> — both carry your record id. Two names for the same value: <Kbd>id</Kbd> matches WhatsApp's shape (helps if you reuse a parser), <Kbd>record_id</Kbd> is our stable naming across channels.</li>
        <li><Kbd>status</Kbd> — one of <Kbd>sent</Kbd>, <Kbd>delivered</Kbd>, <Kbd>read</Kbd>, <Kbd>failed</Kbd>. Same enum as WhatsApp.</li>
        <li><Kbd>recipient_id</Kbd> — recipient MSISDN.</li>
        <li><Kbd>metadata.agent_id</Kbd> — the agent id you registered the webhook against.</li>
        <li><Kbd>errors[]</Kbd> — present only when <Kbd>status: "failed"</Kbd>. Same shape as Meta's WhatsApp failed callback.</li>
      </ul>

      <H2>What is not on the wire</H2>
      <P>
        The payload never carries a vendor identifier. Fields specific to any upstream RCS provider (for example <Kbd>vendor</Kbd>, <Kbd>nc_bot_id</Kbd>, <Kbd>entityType</Kbd>, or <Kbd>callbackdata</Kbd>) are not present.
      </P>
    </div>
  );
}

function WebhooksTesting() {
  return (
    <div>
      <SectionHeader
        eyebrow="Webhooks"
        title="Test event"
        lede="Send a synthetic event through the exact same delivery path as a real one, so you can verify your endpoint before wiring up a real send."
      />
      <H2>How to trigger</H2>
      <P>
        From the row menu on Developer &gt; APIs &amp; Webhooks, click <Kbd>Send test event</Kbd>. You can also trigger from inside the Create / Edit dialog once the URL is valid. If your webhook is subscribed to more than one event bucket, we ask which bucket to test.
      </P>

      <H2>What we send</H2>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li>Body: a realistic payload of the picked bucket, using dummy values.</li>
        <li>All Pi envelope headers (Bearer token, Event-Id, Delivered-At, Attempt, Webhook-Id, Record-Id).</li>
        <li>Extra header <Kbd>X-Pi-Test: true</Kbd> so your receiver can branch on it and skip DB writes if you prefer.</li>
        <li><Kbd>X-Pi-Record-Id</Kbd> is prefixed with <Kbd>test_</Kbd> so even code that ignores the header can tell.</li>
      </ul>

      <H2>What you see back</H2>
      <P>
        The dashboard shows a toast with the receiver's actual HTTP response: <em>Test event delivered (200 OK)</em> on any 2xx, or the failure code / <em>connection timeout</em> otherwise. Same 10-second timeout as production.
      </P>

      <H2>What test events do not do</H2>
      <P>
        A test event does not retry on failure. If your endpoint is down, we tell you once and stop. No auto-pause on test failure either. Retries and auto-pause apply only to real production events.
      </P>
    </div>
  );
}

function WebhooksReference() {
  return (
    <div>
      <SectionHeader
        eyebrow="Webhooks"
        title="Reference"
        lede="Header list, status enum, and error codes."
      />
      <H2>Headers on every POST</H2>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li><Kbd>Authorization: Bearer &lt;token&gt;</Kbd> — the auth token for this webhook</li>
        <li><Kbd>Content-Type: application/json</Kbd></li>
        <li><Kbd>User-Agent: PaytmPiCommerce-Webhook/1.0</Kbd></li>
        <li><Kbd>X-Pi-Webhook-Id</Kbd> — the receiving webhook's id in our system</li>
        <li><Kbd>X-Pi-Event-Id</Kbd> — stable across retries, use for dedup on your side</li>
        <li><Kbd>X-Pi-Delivered-At</Kbd> — ISO 8601 timestamp of the current attempt</li>
        <li><Kbd>X-Pi-Attempt</Kbd> — attempt number, 1 through 6</li>
        <li><Kbd>X-Pi-Record-Id</Kbd> — the record id you got back from the send API (or the outbound's record id, if this is an inbound reply)</li>
        <li><Kbd>X-Pi-Test: true</Kbd> — present only on test events</li>
      </ul>

      <H2>Status enum</H2>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li><strong>WhatsApp:</strong> <Kbd>sent</Kbd>, <Kbd>delivered</Kbd>, <Kbd>read</Kbd>, <Kbd>failed</Kbd></li>
        <li><strong>SMS:</strong> <Kbd>DELIVERED</Kbd>, <Kbd>FAILED</Kbd></li>
        <li><strong>RCS:</strong> <Kbd>sent</Kbd>, <Kbd>delivered</Kbd>, <Kbd>read</Kbd>, <Kbd>failed</Kbd></li>
      </ul>

      <H2>Registration error codes</H2>
      <P>
        Returned by the dashboard (and the future registration API) when a create or edit fails whole-call.
      </P>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/85">
        <li><Kbd>invalid_name</Kbd> — Name does not match the slug rule</li>
        <li><Kbd>invalid_channel</Kbd> — Channel is not one of whatsapp / sms / rcs</li>
        <li><Kbd>invalid_scope</Kbd> — Scope object is missing required fields for the channel</li>
        <li><Kbd>endpoint_not_https</Kbd> — URL scheme is not HTTPS</li>
        <li><Kbd>endpoint_not_public</Kbd> — Host is loopback, RFC1918, link-local, .internal, or .local</li>
        <li><Kbd>empty_events</Kbd> — No event bucket selected</li>
        <li><Kbd>too_many_webhooks</Kbd> — Fan-out limit hit (5 per channel + scope + bucket)</li>
        <li><Kbd>auth_rejected</Kbd> — API key missing or invalid</li>
        <li><Kbd>scope_target_not_found</Kbd> — WABA, sender or agent does not exist for your account</li>
      </ul>
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
          ? "A JSON array. Send an array with a single object for one, or many objects to submit in a batch. Every entry is validated on its own; one bad entry never blocks the rest. The fields below describe the shape of each array entry."
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
