/**
 * Get-cURL helpers — builds the ready-to-fire curl shown in the template row's
 * "Get Curl" dialog. A template is callable directly: POST its id + recipients,
 * the platform creates a campaign + run internally. Mock only; no real backend.
 */

import { type WaTemplate } from "@/lib/waba-templates";
import { type SmsTemplate, smsPlaceholders } from "@/lib/sms-templates";
import { type RcsTemplate, templatePlaceholders } from "@/lib/rcs-templates";

/** The (fake) send endpoint we advertise. */
export const SEND_API_BASE = "https://api.picommerce.paytm.com/v1";

/** A demo API key. Real product would mint merchant-scoped, revocable keys. */
export const DEMO_API_KEY = "pk_live_9f2c7b41a8e34d02b6c1f5e9d7a03c88";

export type CurlChannel = "whatsapp" | "sms" | "rcs";
export type TemplateVar = { token: string; sample: string };

/** Channel-agnostic descriptor the Get-cURL dialog renders from. */
export type CurlTemplate = {
  channel: CurlChannel;
  id: string;
  name: string;
  language?: string;
  variables: TemplateVar[];
};

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

/** Adapt a WhatsApp template into the channel-agnostic curl descriptor. */
export function waToCurlTemplate(t: WaTemplate): CurlTemplate {
  return {
    channel: "whatsapp",
    id: t.id,
    name: t.name,
    language: t.language,
    variables: extractVariables(t.body).map((n) => ({ token: String(n), sample: sampleFor(n) })),
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
  };
}

/** Adapt an RCS template into the channel-agnostic curl descriptor. */
export function rcsToCurlTemplate(t: RcsTemplate): CurlTemplate {
  return {
    channel: "rcs",
    id: t.id,
    name: t.name,
    variables: templatePlaceholders(t).map((name) => ({ token: name, sample: sampleForName(name) })),
  };
}

export function endpointFor(channel: CurlChannel): string {
  return `${SEND_API_BASE}/messages/${channel}/send`;
}

/** The copy-paste curl for a template. */
export function curlSnippet(t: CurlTemplate, opts: { apiKey: string; phone?: string }): string {
  const variables: Record<string, string> = {};
  for (const v of t.variables) variables[v.token] = v.sample;

  const recipient: Record<string, unknown> = { to: opts.phone ?? "+919876543210" };
  if (t.variables.length) recipient.variables = variables;

  const body: Record<string, unknown> = {
    template_id: t.id,
    ...(t.language ? { language: t.language } : {}),
    recipients: [recipient],
  };

  const json = JSON.stringify(body, null, 2)
    .split("\n")
    .map((line, i) => (i === 0 ? line : "  " + line))
    .join("\n");

  return [
    `curl -X POST '${endpointFor(t.channel)}' \\`,
    `  -H 'Authorization: Bearer ${opts.apiKey}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${json}'`,
  ].join("\n");
}
