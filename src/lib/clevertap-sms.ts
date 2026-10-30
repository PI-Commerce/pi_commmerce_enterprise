/**
 * CleverTap Generic SMS connection — model, store and derivations.
 *
 * A sibling of `clevertap.ts` and deliberately not a variant of it, because Generic
 * SMS inverts Generic WhatsApp on the one point that decides the whole surface.
 *
 * This file briefly modelled a payload recipe — a JSON block the client pastes into a
 * Parameters field on CleverTap's provider form. That form has no Parameters field:
 * it takes a nickname, a callback URL it generates, a request type, an HTTP endpoint,
 * and Authentication and Headers tabs. The recipe, its validator and the batching
 * constants went with the panel that showed them.
 *
 * $$MessageID is still the whole of delivery reporting. CleverTap substitutes an
 * opaque string and we must return it verbatim on every callback. If it never arrives,
 * the integration sends perfectly and reports nothing — a campaign showing zero
 * delivered against a full send. That failure is silent on both sides, which is why
 * {@link reportingHealth} exists.
 *
 * There is no Validated state. Generic SMS defines no validation call, so nothing on
 * either side could ever move a connection there — unlike the WhatsApp connector,
 * where CleverTap's setup check is a real event. Draft and Live are the only two
 * honest answers.
 */
import { useSyncExternalStore } from "react";
import { CT_HOST } from "@/lib/clevertap";

/* ────────────────────────────────── State ───────────────────────────────────── */

export type SmsState = "draft" | "live";

export const SMS_STATE_LABEL: Record<SmsState, string> = {
  draft: "Draft",
  live: "Live",
};

export const SMS_STATE_INFO: Record<SmsState, string> = {
  draft: "Able to accept traffic. No message has come through yet.",
  live: "Configured and sending.",
};

export const SMS_STATE_TONE: Record<SmsState, string> = {
  draft: "border-border bg-secondary text-muted-foreground",
  live: "border-success/30 bg-success/10 text-success",
};

/** Same collapse as the WhatsApp connector: Disabled wins the one slot it has. */
export function smsStatePill(c: SmsConnection): { label: string; tone: string } {
  return c.enabled
    ? { label: SMS_STATE_LABEL[c.state], tone: SMS_STATE_TONE[c.state] }
    : { label: "Disabled", tone: "border-destructive/30 bg-destructive/10 text-destructive" };
}

/* ──────────────────────── Senders we are registered to ──────────────────────── */

/**
 * The DLT sender headers registered to this merchant.
 *
 * These are the three the messaging API offers on its own send surface, and the list
 * is complete — not a sample. A header is chosen from it rather than typed for the
 * same reason a WhatsApp connector picks its number: an unregistered header is not a
 * value we can validate our way out of. Indian operators reject it at the gateway,
 * the client sees error 906 several minutes later aggregated across a campaign, and
 * the configuration they go back to check looks entirely correct.
 *
 * There is no principal-entity identifier here. The send API takes no `entity_id`
 * field — the header alone resolves the entity on the operator's side — so carrying
 * one would put a value in the recipe that the endpoint ignores, and an ignored field
 * in a copy-pasted block reads as a working field for as long as nobody checks.
 */
export const DLT_HEADERS: { header: string; use: string }[] = [
  { header: "PICOMM", use: "Transactional — order and payment updates" },
  { header: "PICOTP", use: "OTP — one-time passcodes" },
  { header: "PIOFFR", use: "Promotional — offers and campaigns" },
];

export function headerUse(header: string): string | undefined {
  return DLT_HEADERS.find((h) => h.header === header)?.use;
}

/* ──────────────────────────────── Connection ────────────────────────────────── */

export type SmsConnection = {
  id: string;
  createdAt: string;
  state: SmsState;
  lastMessageAt?: string;
  enabled: boolean;

  /**
   * The sender headers this connection is allowed to send from.
   *
   * Disjoint across connections, and that is the constraint that replaces
   * one-connector-per-number on the WhatsApp side. Two connections covering one
   * header would each hold a credential valid for it, so a leaked configuration
   * from either could send under that sender — and a request arriving with a header
   * the credential is not scoped to is exactly what we have to be able to reject.
   */
  headers: string[];

  /** Basic auth we generated for CleverTap to send with. */
  username: string;
  /** Present only in the session it was generated in. Shown once, like WhatsApp. */
  password?: string;
  rotation?: { until: string; graceDays: number };

  /**
   * One URL, not two.
   *
   * CleverTap's SMS provider screen generates a single callback URL and every event
   * type — delivered, failed, clicked, replied — posts to it. The WhatsApp connector
   * has two because CleverTap gives it two; splitting this one to match would be
   * inventing a field their form does not have.
   */
  callbackUrl?: string;

  /**
   * FR-7's evidence, and the only reason the panel can say anything useful about
   * reporting.
   *
   * Counted rather than derived from a flag because the interesting state is
   * partial: a client running two CleverTap providers against one connection can
   * have $$MessageID mapped on one provider and not the other, and a boolean would
   * report that as fine.
   */
  messagesSeen: number;
  messagesWithMessageId: number;
};

export const SMS_DEFAULT_GRACE_DAYS = 7;

/* ──────────────────────────────── Endpoint ──────────────────────────────────── */

/**
 * One path for every connection, unlike the WhatsApp lane's per-connector URL.
 *
 * This is the merchant's ordinary SMS send endpoint — the same one their own cURL
 * examples use — and the Basic credential in the request is what identifies the
 * connection, so the path does not have to. Keeping it static also removes the one
 * copy-paste error a per-connection path invites: a URL carrying another
 * connection's id authenticates fine and sends from a header this credential is not
 * scoped to, which surfaces as a rejection with no obvious cause.
 */
export function smsSendEndpoint(): string {
  return `${CT_HOST}/v1/messages/sms/send`;
}



/* ─────────────────────────── Reporting health (FR-7) ────────────────────────── */

/**
 * `quiet` — nothing has arrived, so there is nothing to diagnose.
 * `reporting` — every message carried a $$MessageID.
 * `partial` — some did not, which means one of the client's CleverTap providers is
 *   missing it while another is not.
 * `unreportable` — none did. Every message delivered and CleverTap knows about none
 *   of it.
 */
export type ReportingHealth = "quiet" | "reporting" | "partial" | "unreportable";

export function reportingHealth(c: SmsConnection): ReportingHealth {
  if (c.messagesSeen === 0) return "quiet";
  if (c.messagesWithMessageId === 0) return "unreportable";
  if (c.messagesWithMessageId < c.messagesSeen) return "partial";
  return "reporting";
}

/* ───────────────────────────────── Store ────────────────────────────────────── */

/**
 * One connection that has carried traffic and reports cleanly, and one that has not
 * been set up on CleverTap's side yet. They differ on every field the page renders
 * differently — state, activity, callback URL, rotation, reporting counts — so both
 * the working screen and the waiting-on-CleverTap screen are reachable without
 * walking setup first.
 *
 * They take one header each and leave PIOFFR free. With only three registered and a
 * header belonging to one connection at a time, seeding both of them onto two headers
 * would leave nothing to create against — so the create dialog's ordinary path is kept
 * reachable, at the cost of no connection here demonstrating a two-header one.
 */
const SEED: SmsConnection[] = [
  {
    id: "cts_5c31ba",
    createdAt: "11 Aug 2026",
    state: "live",
    lastMessageAt: "25 Aug 2026, 18:22",
    enabled: true,
    headers: ["PICOMM"],
    username: "cts_5c31ba_pub",
    rotation: { until: "31 Aug 2026", graceDays: SMS_DEFAULT_GRACE_DAYS },
    callbackUrl: "https://eu1.clevertap.com/provider/sms/dlr/41d90b7ce6a24f18",
    messagesSeen: 184_902,
    messagesWithMessageId: 184_902,
  },
  {
    id: "cts_be7042",
    createdAt: "24 Aug 2026",
    state: "draft",
    enabled: true,
    headers: ["PICOTP"],
    username: "cts_be7042_pub",
    messagesSeen: 0,
    messagesWithMessageId: 0,
  },
];

let current: SmsConnection[] = SEED;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSmsConnections(): SmsConnection[] {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

export function useSmsConnection(id: string): SmsConnection | undefined {
  return useSmsConnections().find((c) => c.id === id);
}

export function getSmsConnections(): SmsConnection[] {
  return current;
}

export function addSmsConnection(c: SmsConnection) {
  current = [c, ...current];
  emit();
}

export function updateSmsConnection(id: string, patch: Partial<SmsConnection>) {
  current = current.map((c) => (c.id === id ? { ...c, ...patch } : c));
  emit();
}

export function removeSmsConnection(id: string) {
  current = current.filter((c) => c.id !== id);
  emit();
}

/* ─────────────────────────────── Generators ─────────────────────────────────── */

const HEX = "0123456789abcdef";
const rand = (n: number) =>
  Array.from({ length: n }, () => HEX[Math.floor(Math.random() * 16)]).join("");

export function newSmsConnectionId(): string {
  return `cts_${rand(6)}`;
}
