/**
 * Get-cURL helpers — builds the ready-to-fire curl shown in the template row's
 * "Get Curl" dialog. A template is callable directly: POST its id + recipients,
 * the platform creates a campaign + run internally. Mock only; no real backend.
 */

import { type WaTemplate } from "@/lib/waba-templates";
import { type SmsTemplate, smsPlaceholders } from "@/lib/sms-templates";
import { type RcsTemplate, templatePlaceholders } from "@/lib/rcs-templates";
import { SEED_RCS_CONFIG, agentById } from "@/lib/rcs-config";

/** The send endpoint we advertise (mirrors production BFF). */
export const SEND_API_BASE = "https://pi-commerce-bff.paytm.com/api/pi-commerce/v1";

/** A demo API key. Real product would mint merchant-scoped, revocable keys. */
export const DEMO_API_KEY = "pk_live_9f2c7b41a8e34d02b6c1f5e9d7a03c88";

export type CurlChannel = "whatsapp" | "sms" | "rcs";

/**
 * A single template variable. WhatsApp numbers {{n}} PER COMPONENT: the header,
 * the body, and each button all restart at {{1}}, so a header {{1}} and a body
 * {{1}} are different values. We therefore tag every WhatsApp var with the
 * component it belongs to; without that they collide on one flat key (the bug
 * this fixes). SMS/RCS use flat named variables, so `component`/`buttonIndex`
 * stay undefined there.
 */
export type VarComponent = "header" | "body" | "button";
export type TemplateVar = {
  token: string;
  sample: string;
  component?: VarComponent;
  /** 0-based button position, set only when component === "button". */
  buttonIndex?: number;
};

/**
 * A media header (image/video/document) has no {{n}} token — it binds a media
 * link (and, for documents, a filename) instead of positional text.
 */
export type HeaderMedia = {
  format: "IMAGE" | "VIDEO" | "DOCUMENT";
  sampleUrl: string;
  filename?: string;
};

/** Channel-agnostic descriptor the Get-cURL dialog renders from. */
export type CurlTemplate = {
  channel: CurlChannel;
  id: string;
  name: string;
  language?: string;
  variables: TemplateVar[];
  /** WhatsApp media-header templates only: the header media link binding. */
  headerMedia?: HeaderMedia;
  /**
   * The sender this template is already pinned to, if any. SMS templates carry a
   * DLT header and RCS templates carry an agent, so those resolve automatically;
   * WhatsApp templates belong to a WABA that may hold several numbers, so there is
   * no default and the caller must choose one.
   */
  defaultSenderId?: string;
};

/**
 * A sending identity for a channel. The API key scopes to a *merchant*, not a
 * *sender*, and a merchant can run several per channel — multiple WhatsApp numbers
 * under one WABA, multiple DLT headers, multiple RCS agents — so the send payload
 * must name the one to use.
 */
export type Sender = { id: string; label: string; meta?: string };

/**
 * Per-channel sender metadata: the JSON field the API expects, plus the copy used
 * in the dialog. WhatsApp sends from a phone number (`from`), SMS from a DLT header
 * (`sender_id`), RCS from an agent (`agent_name`).
 */
export const SENDER_META: Record<
  CurlChannel,
  { field: string; label: string; hint: string; placeholder: string; empty: string }
> = {
  whatsapp: {
    field: "from",
    label: "Send from",
    hint: "A WABA can hold several numbers, so the API needs an explicit one.",
    placeholder: "YOUR_WHATSAPP_NUMBER",
    empty: "No WhatsApp number connected — add one in Channels → WhatsApp.",
  },
  sms: {
    field: "sender_id",
    label: "Sender ID (DLT header)",
    hint: "The DLT-registered header the SMS is sent under.",
    placeholder: "SENDER_ID",
    empty: "No SMS header registered.",
  },
  rcs: {
    field: "agent_name",
    label: "RCS agent",
    hint: "The RCS agent the message is sent from.",
    placeholder: "AGENT_NAME",
    empty: "No RCS agent configured.",
  },
};

/**
 * Merchant's WhatsApp numbers (a WABA can hold more than one). The `id` is the
 * E.164 number the caller puts in `from` — human-readable and consistent with
 * SMS/RCS, which also expose a friendly sender. The platform resolves it to
 * Meta's phone_number_id server-side; the opaque id is never in the payload.
 */
const WHATSAPP_SENDERS: Sender[] = [
  { id: "+919810012345", label: "+91 98100 12345", meta: "Paytm Commerce · verified" },
  { id: "+919004588210", label: "+91 90045 88210", meta: "Paytm Offers · verified" },
];

/** Merchant's DLT-registered headers. */
const SMS_SENDERS: Sender[] = [
  { id: "PICOMM", label: "PICOMM", meta: "Transactional" },
  { id: "PICOTP", label: "PICOTP", meta: "OTP" },
  { id: "PIOFFR", label: "PIOFFR", meta: "Promotional" },
];

/** The senders available for a channel, in display order. */
export function sendersFor(channel: CurlChannel): Sender[] {
  if (channel === "whatsapp") return WHATSAPP_SENDERS;
  if (channel === "sms") return SMS_SENDERS;
  // RCS — flatten every agent across the merchant's brands. The payload field is
  // `agent_name`, so the sender id IS the agent name (what production sends).
  return SEED_RCS_CONFIG.brands.flatMap((b) =>
    b.agents.map((a) => ({ id: a.name, label: a.name, meta: `${b.name} · ${a.type}` })),
  );
}

const SAMPLE_VALUES = ["Aniket", "OD-2291", "12 Aug", "499", "20", "Paytm", "31 Dec", "Gold", "5", "Mumbai"];

/** A friendly sample value for variable {{n}}. */
export function sampleFor(n: number): string {
  return SAMPLE_VALUES[(n - 1) % SAMPLE_VALUES.length];
}

/** Distinct {{n}} tokens across one or more strings, ascending. */
export function extractVariables(...texts: (string | undefined)[]): number[] {
  const set = new Set<number>();
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) set.add(Number(m[1]));
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Header/button sample values are deliberately kept DIFFERENT from the body
 * samples so a template that reuses {{1}} across components (e.g. header {{1}} +
 * body {{1}}) shows two distinct values in the curl — making it obvious they no
 * longer collide.
 */
const SAMPLE_REFERENCE = "OD-2291";

function sampleMediaUrl(format: HeaderMedia["format"]): string {
  if (format === "IMAGE") return "https://cdn.picomm.in/media/banner.jpg";
  if (format === "VIDEO") return "https://cdn.picomm.in/media/promo.mp4";
  return "https://cdn.picomm.in/docs/statement.pdf";
}

/**
 * Adapt a WhatsApp template into the channel-agnostic curl descriptor. WhatsApp
 * numbers {{n}} per component, so scan the header, body, and each button
 * separately and tag every variable with the component it belongs to. A media
 * header (image/video/document) carries no {{n}} — it binds a link instead.
 */
export function waToCurlTemplate(t: WaTemplate): CurlTemplate {
  const variables: TemplateVar[] = [];

  // Header text variable (Meta allows exactly one). Media-format headers bind a
  // link via `headerMedia` instead, so only scan TEXT headers for tokens.
  if (t.format === "TEXT" && t.header) {
    for (const n of extractVariables(t.header)) {
      variables.push({ token: String(n), sample: SAMPLE_REFERENCE, component: "header" });
    }
  }

  // Body variables — the common case.
  for (const n of extractVariables(t.body)) {
    variables.push({ token: String(n), sample: sampleFor(n), component: "body" });
  }

  // Dynamic URL button variables, keyed by the button's position in the list.
  (t.buttons ?? []).forEach((b, i) => {
    if (b.type === "URL" && b.urlType === "Dynamic" && b.urlSuffix) {
      for (const n of extractVariables(b.urlSuffix)) {
        variables.push({ token: String(n), sample: SAMPLE_REFERENCE, component: "button", buttonIndex: i });
      }
    }
  });

  const headerMedia: HeaderMedia | undefined =
    t.format === "TEXT"
      ? undefined
      : {
          format: t.format,
          sampleUrl: sampleMediaUrl(t.format),
          ...(t.format === "DOCUMENT" ? { filename: "statement.pdf" } : {}),
        };

  return {
    channel: "whatsapp",
    id: t.id,
    name: t.name,
    language: t.language,
    variables,
    headerMedia,
  };
}

/**
 * A friendly sample value for a NAMED variable (SMS/RCS use `{{name}}` not
 * `{{1}}`). Matches on the variable name so the curl reads like a real payload;
 * falls back to a generic token for anything unrecognised.
 */
const NAMED_SAMPLES: Record<string, string> = {
  name: "Aniket",
  order_id: "OD-2291",
  amount: "499",
  eta: "12 Aug",
  link: "https://picomm.in/x/aZ92",
  otp: "482913",
  minutes: "5",
  hours: "6",
  plan: "Gold",
  discount: "20",
  expiry_date: "31 Aug",
  due_date: "31 Aug",
  item: "Wireless Earbuds",
  festival: "Diwali",
  city: "Mumbai",
};

export function sampleForName(name: string): string {
  return NAMED_SAMPLES[name.toLowerCase()] ?? `sample_${name}`;
}

/** Adapt an SMS DLT template into the channel-agnostic curl descriptor. */
export function smsToCurlTemplate(t: SmsTemplate): CurlTemplate {
  return {
    channel: "sms",
    id: t.id,
    name: t.name,
    variables: smsPlaceholders(t.content).map((name) => ({ token: name, sample: sampleForName(name) })),
    defaultSenderId: t.senderId,
  };
}

/** Adapt an RCS template into the channel-agnostic curl descriptor. */
export function rcsToCurlTemplate(t: RcsTemplate): CurlTemplate {
  return {
    channel: "rcs",
    id: t.id,
    name: t.name,
    variables: templatePlaceholders(t).map((name) => ({ token: name, sample: sampleForName(name) })),
    // The template pins an agent by its stable id; the payload names it by
    // `agent_name`, so resolve the id to the agent's display name.
    defaultSenderId: agentById(SEED_RCS_CONFIG, t.agentId)?.name,
  };
}

export function endpointFor(channel: CurlChannel): string {
  return `${SEND_API_BASE}/messages/${channel}/send`;
}

/** Gather one component's vars into a positional map, or null if it has none. */
function collectScope(vars: TemplateVar[], component: VarComponent): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const v of vars) if (v.component === component) out[v.token] = v.sample;
  return Object.keys(out).length ? out : null;
}

/** The copy-paste curl for a template. */
export function curlSnippet(
  t: CurlTemplate,
  opts: { apiKey: string; phone?: string; senderId?: string; defaultCountry?: string },
): string {
  const recipient: Record<string, unknown> = { to: opts.phone ?? "+919876543210" };

  if (t.channel === "whatsapp") {
    // Component-scoped: header / body / buttons each keep their own {{n}}, so a
    // token reused across components (header {{1}} + body {{1}}) never collides.
    // The BFF maps each scope onto Meta's template.components[].parameters[].
    const scoped: Record<string, unknown> = {};

    if (t.headerMedia) {
      scoped.header = {
        media_url: t.headerMedia.sampleUrl,
        ...(t.headerMedia.filename ? { filename: t.headerMedia.filename } : {}),
      };
    } else {
      const header = collectScope(t.variables, "header");
      if (header) scoped.header = header;
    }

    const body = collectScope(t.variables, "body");
    if (body) scoped.body = body;

    const buttons: Record<string, Record<string, string>> = {};
    for (const v of t.variables) {
      if (v.component !== "button") continue;
      const idx = String(v.buttonIndex ?? 0);
      (buttons[idx] ??= {})[v.token] = v.sample;
    }
    if (Object.keys(buttons).length) scoped.buttons = buttons;

    if (Object.keys(scoped).length) recipient.variables = scoped;
  } else {
    // SMS / RCS: flat named variables, no components.
    const variables: Record<string, string> = {};
    for (const v of t.variables) variables[v.token] = v.sample;
    if (t.variables.length) recipient.variables = variables;
  }

  // Sender is a top-level field (per channel: `from` / `sender_id` / `agent_name`).
  // Fall back to the channel placeholder so the shape is always visible even
  // before the caller has picked one.
  const senderField = SENDER_META[t.channel].field;
  const senderValue = opts.senderId ?? SENDER_META[t.channel].placeholder;

  // WhatsApp names the template by `template_name`; SMS/RCS name it by
  // `template_id`. WhatsApp is the only channel that carries a `language`.
  const isWhatsApp = t.channel === "whatsapp";
  const templateRef = isWhatsApp ? { template_name: t.name } : { template_id: t.id };

  // Every template channel accepts an optional `default_country`: a recipient carrying
  // its own +code is used as-is, and a bare national number is parsed against this ISO
  // code (passed straight to libphonenumber as its defaultCountry). WhatsApp can send
  // anywhere, so this is a plain parse hint. For SMS/RCS it is accepted too and not
  // gated here — if the resolved country does not match where the sender/carrier
  // operates, the send still queues and the failure surfaces later in Analytics/DLT.
  const body: Record<string, unknown> = {
    ...templateRef,
    ...(t.language ? { language: t.language } : {}),
    [senderField]: senderValue,
    ...(opts.defaultCountry ? { default_country: opts.defaultCountry } : {}),
    recipients: [recipient],
  };

  const json = JSON.stringify(body, null, 2)
    .split("\n")
    .map((line, i) => (i === 0 ? line : "  " + line))
    .join("\n");

  return [
    `curl -X POST '${endpointFor(t.channel)}' \\`,
    `  -H 'X-API-Key: ${opts.apiKey}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${json}'`,
  ].join("\n");
}
