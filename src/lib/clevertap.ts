/**
 * CleverTap Generic WhatsApp connector — model, store and derivations.
 *
 * This is the *third* relationship the Connections page carries, and it is worth
 * being precise about why it is not one of the existing two. An engagement tool
 * pushes people at us and we run the campaign. A CRM holds an audience and we read
 * it. Here CleverTap owns the campaign, the audience and the personalisation, and
 * Pi Commerce is the carrier — CT hands us a message, we deliver it through Meta,
 * and we post the receipt back. Nothing about an audience changes hands.
 *
 * Everything modelled here is what the *client* has to configure or read. The wire
 * contract itself — the messaging endpoint, the queue, the translator, the callback
 * dispatchers — is server work and deliberately absent, and so is anything that only
 * reports on traffic. What survives is the set of values that must be typed into CT
 * by hand — and only those. The tunables that used to sit alongside them (payload
 * encryption, concurrency and import page size, the Basic-or-Bearer choice on the
 * import endpoint) are gone: each was a knob that had one correct setting, so
 * offering it asked the client to make a decision whose only wrong answers were the
 * ones they could reach.
 *
 * One connector per WABA number, per FR-1. That is not a simplification: CT's own
 * provider screen defines the provider nickname as the phone number, so a client
 * with three numbers genuinely does three setups.
 */
import { useSyncExternalStore } from "react";
import type { WaTemplate } from "@/lib/waba-templates";
import { languageLabel } from "@/lib/waba-templates";

/* ──────────────────────────────── Connector ──────────────────────────────── */

/**
 * Draft → Validated → Live is a record of what CT has actually done, not a
 * workflow the client advances. Nothing on the panel can move a connector to
 * Validated; only a real validation payload from CT does that. That is the point —
 * a client who has finished their side and sees Draft learns that CT never called,
 * which is a different problem from CT calling and being rejected.
 */
export type CtConnectorState = "draft" | "validated" | "live";

export const CT_STATE_LABEL: Record<CtConnectorState, string> = {
  draft: "Draft",
  validated: "Validated",
  live: "Live",
};

export const CT_STATE_INFO: Record<CtConnectorState, string> = {
  draft: "Created here, but CleverTap has never called it.",
  validated: "CleverTap's setup check succeeded. No real message yet.",
  live: "At least one real message has been processed.",
};

export const CT_STATE_TONE: Record<CtConnectorState, string> = {
  draft: "border-border bg-secondary text-muted-foreground",
  validated: "border-warning/30 bg-warning/10 text-warning",
  live: "border-success/30 bg-success/10 text-success",
};

/**
 * The one state a row should show.
 *
 * `state` and `enabled` are orthogonal — the first is a record of what CleverTap has
 * done, the second is a switch we hold — and they were rendered as two chips side by
 * side, which asked the reader to combine them. Disabled wins the single slot because
 * it is the half that decides what happens to the next message: a Live connector
 * rejecting everything with 2000 is not usefully described as Live.
 *
 * Only the display collapses. Both fields stay on the record, so re-enabling returns a
 * connector to Live rather than to Draft — which is why this is a function over the
 * connector rather than a fourth member of {@link CtConnectorState}.
 */
export function ctStatePill(c: CtConnector): { label: string; tone: string } {
  return c.enabled
    ? { label: CT_STATE_LABEL[c.state], tone: CT_STATE_TONE[c.state] }
    : { label: "Disabled", tone: "border-destructive/30 bg-destructive/10 text-destructive" };
}

/* ────────────────────────── Numbers we can carry ─────────────────────────── */

/**
 * The WhatsApp senders already provisioned for this merchant.
 *
 * A connector is issued *for* a number that exists; it cannot bring one into being.
 * That is why creating one picks from this list instead of accepting a typed number:
 * a number that has not been through Embedded Signup has no Meta sender behind it, so
 * a connector built on it would accept every send and fail it with 2002 — and the
 * client would spend that time re-checking their CleverTap config for a number we
 * never held. A picker cannot express that mistake.
 *
 * The WABA is carried alongside because the number alone does not say which brand
 * sends from it, and two numbers on different WABAs are two different senders to the
 * person receiving them. Numbers arrive by onboarding a WABA under Channels.
 */
export const WABA_NUMBERS: { e164: string; waba: string }[] = [
  { e164: "+919810012345", waba: "Paytm Commerce WABA" },
  { e164: "+919004588210", waba: "Paytm Commerce WABA" },
  { e164: "+918447120655", waba: "PiWealth Notifications" },
  { e164: "+917012349988", waba: "Paytm Commerce WABA" },
];

export type CtConnector = {
  id: string;
  /** E.164. One connector per number, per FR-1. */
  wabaNumber: string;
  createdAt: string;
  state: CtConnectorState;
  lastValidationAt?: string;
  /**
   * When we last carried a real message on this connector.
   *
   * Absent until one arrives, which is the same condition `state: "live"` records — so
   * the column is blank on exactly the rows whose state already says nothing has
   * happened yet, and the two can never contradict each other. A validation call is
   * deliberately not activity: it proves CleverTap can reach us, not that anyone is
   * being messaged, and `lastValidationAt` already answers that question separately.
   */
  lastMessageAt?: string;
  /** FR-1: disabled connectors reject everything with 2000, but are not deleted. */
  enabled: boolean;

  /** Basic auth we generated for CT to send. */
  username: string;
  /**
   * Present only in the session where it was generated. FR-1 says shown once, so
   * after a reload there is nothing to show and the panel says so rather than
   * inventing a placeholder that looks copyable.
   */
  password?: string;
  /** A rotation in progress: the old password still works until this date. */
  rotation?: { until: string; graceDays: number };

  /** FR-11 only. Blank otherwise, and blank is the honest value. */
  clickTrackingDomain?: string;

  /** Generated by CT, pasted here. Secrets: unauthenticated write access to CT stats. */
  deliveryCallbackUrl?: string;
  inboundCallbackUrl?: string;
};

export const CT_DEFAULT_GRACE_DAYS = 7;

/* ──────────────────────────────── Endpoints ──────────────────────────────── */

/**
 * The live Pi Commerce API host, shared by both CleverTap lanes.
 *
 * Not a placeholder and not a per-merchant derivation. The PRD writes the host as
 * `<region>` and `<tld>`, but a placeholder is not copy-pasteable and these panels
 * exist to be copy-pasted; and every value on them is checked against the real
 * messaging API, so a stand-in host would be the one wrong line in an otherwise
 * verbatim block — the hardest kind of error to notice.
 */
export const CT_HOST = "https://api.picommerce.paytm.com";

export function ctMessagesEndpoint(connectorId: string): string {
  return `${CT_HOST}/ct/v1/messages/${connectorId}`;
}

export function ctTemplatesEndpoint(connectorId: string): string {
  return `${CT_HOST}/ct/v1/templates/${connectorId}`;
}

/* ─────────────────────────────── Validation ──────────────────────────────── */

/**
 * FR-1: accept the number however CT sends it — with a plus, without, or as a
 * national ten-digit number — and store one form. Returns null when there is no
 * defensible reading, so the caller can refuse rather than store something it
 * guessed.
 */
export function normaliseE164(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+91${digits}`; // national, India default
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Display form: `+91 98100 12345`. Grouping is cosmetic — storage stays E.164. */
export function formatWaba(e164: string): string {
  const m = /^\+(\d{2})(\d{5})(\d{5})$/.exec(e164);
  return m ? `+${m[1]} ${m[2]} ${m[3]}` : e164;
}

/**
 * FR-1 blocks a non-HTTPS callback URL. Checked with the URL parser rather than a
 * prefix test so that `https:evil` and a bare `https://` do not pass.
 */
export function callbackUrlError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Paste the URL CleverTap generated.";
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "That is not a URL.";
  }
  if (u.protocol !== "https:") return "Callback URLs must use HTTPS. CleverTap will not accept anything else.";
  if (!u.hostname.includes(".")) return "That host cannot be reached.";
  return null;
}

/**
 * FR-1 masks saved callback URLs. The host is left readable because it is the part
 * a client checks; the path carries the token, so the path is what gets hidden.
 */
export function maskCallbackUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}/••••••••••••`;
  } catch {
    return "••••••••";
  }
}

/* ────────────────────────────── Template setup ───────────────────────────── */

/** Distinct `{{n}}` placeholders in a body, which is what CT must send a value for. */
export function bodyParamCount(body: string): number {
  const found = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) found.add(m[1]);
  return found.size;
}

/** Same count for a text header, which numbers its placeholders independently. */
export function headerParamCount(header?: string): number {
  return header ? bodyParamCount(header) : 0;
}

/**
 * The language forms CT is known to send for one stored code.
 *
 * FR-6 lists four shapes across CT's own documentation — `en`, `en_US`, `en(uk)`
 * and `en(UK)`. Listing them next to the stored code is the difference between a
 * client typing something that resolves and one typing something that does not,
 * and it costs nothing to show.
 */
export function languageVariants(code: string): string[] {
  const base = code.split(/[_(]/)[0].toLowerCase();
  const region = /_([A-Za-z]{2})/.exec(code)?.[1]?.toUpperCase();
  const out = new Set<string>([code, base]);
  if (region) {
    out.add(`${base}_${region}`);
    out.add(`${base}(${region})`);
    out.add(`${base}(${region.toLowerCase()})`);
  }
  return [...out];
}

export type CtTemplateField = {
  label: string;
  value: string;
  /** Why CT needs it — shown small, under the value. */
  note?: string;
  /** Offer a copy control. False for things that are read, not typed. */
  copyable?: boolean;
  /** Draw attention: this is the field that silently breaks a send. */
  critical?: boolean;
};

/**
 * FR-5: exactly what a client must type into CT to recreate this template by hand.
 *
 * Derived rather than stored, so it cannot drift from the template. Name and
 * language are marked critical because they are the only two fields used to
 * resolve a send — everything else is either cosmetic in CT or validated by Meta.
 */
export function ctTemplateSetup(t: WaTemplate): CtTemplateField[] {
  const params = bodyParamCount(t.body);
  const fields: CtTemplateField[] = [
    {
      label: "Template name",
      value: t.name,
      note: "Matched literally, including capitalisation and underscores.",
      copyable: true,
      critical: true,
    },
    {
      label: "Language code",
      value: t.language,
      note: `Also accepted: ${languageVariants(t.language).filter((v) => v !== t.language).join(", ") || "no variants"} · ${languageLabel(t.language)}`,
      copyable: true,
      critical: true,
    },
    { label: "Category", value: t.category, note: "Must match, or CleverTap rejects the template on save." },
    {
      label: "Header",
      value: t.format === "TEXT" ? (t.header ? `Text — ${t.header}` : "None") : `Media — ${t.format}`,
      // A header placeholder is a separate value CleverTap must supply, and it is the
      // easiest one to miss: the body count below does not include it, and Meta
      // rejects the send if it is absent.
      note:
        t.format !== "TEXT"
          ? "Upload a sample of the same type in CleverTap."
          : headerParamCount(t.header) > 0
            ? `Takes ${headerParamCount(t.header)} parameter${headerParamCount(t.header) === 1 ? "" : "s"} of its own — counted separately from the body below.`
            : undefined,
      copyable: t.format === "TEXT" && !!t.header,
      critical: t.format === "TEXT" && headerParamCount(t.header) > 0,
    },
    {
      label: "Body",
      value: t.body,
      note: `${params} parameter${params === 1 ? "" : "s"} — CleverTap must send exactly this many.`,
      copyable: true,
    },
    {
      label: "Body parameters",
      value: String(params),
      note: "A mismatch returns 2001 and the send fails.",
      critical: true,
    },
  ];

  if (t.footer) fields.push({ label: "Footer", value: t.footer, copyable: true });

  // Buttons are positional in both products, so the index is part of the answer —
  // the same two buttons in the other order is a different template to Meta.
  for (const [i, b] of (t.buttons ?? []).entries()) {
    // Only URL and Phone Number buttons carry a destination. Quick Reply posts back
    // to us and Link Flow points at a flow, so neither is missing anything — saying
    // otherwise would be the same false accusation the whole view exists to avoid.
    const needsDestination = b.type === "URL" || b.type === "Phone Number";
    const destination =
      b.url ? b.url
      : b.phone ? `${b.dialCode ?? ""} ${b.phone}`.trim()
      : b.type === "Quick Reply" ? "Posts the button text back to us as a reply."
      : b.type === "Link Flow" ? "Opens a flow. CleverTap needs no destination for this."
      : "No destination set. CleverTap will accept the template and the button will do nothing.";
    fields.push({
      label: `Button ${i + 1}`,
      value: `${b.type} — ${b.text}`,
      note: `Position ${i + 1}, and position matters. ${destination}`,
      copyable: true,
      critical: needsDestination && !b.url && !b.phone,
    });
  }

  return fields;
}

/* ───────────────────────────────── Store ─────────────────────────────────── */

/**
 * Seeded with one configured connector and one untouched one, so both the populated
 * and the empty state are reachable without walking setup first. They differ on every
 * field the page renders differently — validation, activity, callbacks, rotation —
 * rather than being two variations of the same shape.
 *
 * Both numbers are in {@link WABA_NUMBERS}, which is what makes them unselectable in
 * the create dialog: the seed is also the seed for "every number you own is taken".
 */
const SEED: CtConnector[] = [
  {
    id: "ctc_9f2a41",
    wabaNumber: "+919810012345",
    createdAt: "4 Aug 2026",
    state: "live",
    lastValidationAt: "22 Aug 2026, 14:08",
    lastMessageAt: "25 Aug 2026, 09:41",
    enabled: true,
    username: "ct_9f2a41_pub",
    rotation: { until: "29 Aug 2026", graceDays: CT_DEFAULT_GRACE_DAYS },
    deliveryCallbackUrl: "https://eu1.clevertap.com/provider/dlr/8823a1f0c4e94b7d",
    inboundCallbackUrl: "https://eu1.clevertap.com/provider/inbound/8823a1f0c4e94b7d",
  },
  {
    id: "ctc_1b77d0",
    wabaNumber: "+919004588210",
    createdAt: "23 Aug 2026",
    state: "draft",
    enabled: true,
    username: "ct_1b77d0_pub",
  },
];

let current: CtConnector[] = SEED;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCtConnectors(): CtConnector[] {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

export function useCtConnector(id: string): CtConnector | undefined {
  return useCtConnectors().find((c) => c.id === id);
}

export function getCtConnectors(): CtConnector[] {
  return current;
}

export function addCtConnector(c: CtConnector) {
  current = [c, ...current];
  emit();
}

export function updateCtConnector(id: string, patch: Partial<CtConnector>) {
  current = current.map((c) => (c.id === id ? { ...c, ...patch } : c));
  emit();
}

export function removeCtConnector(id: string) {
  current = current.filter((c) => c.id !== id);
  emit();
}

/* ─────────────────────────────── Generators ──────────────────────────────── */

const HEX = "0123456789abcdef";
const rand = (n: number) =>
  Array.from({ length: n }, () => HEX[Math.floor(Math.random() * 16)]).join("");

export function newConnectorId(): string {
  return `ctc_${rand(6)}`;
}

/** Long enough that it is obviously not typeable, which is the point of showing a copy control. */
export function newPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export function today(): string {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function nowStamp(): string {
  const d = new Date();
  return `${today()}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Grace period end for a rotation started today. */
export function graceUntil(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
