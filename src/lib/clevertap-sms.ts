/**
 * CleverTap Generic SMS connection — model, store and derivations.
 *
 * A sibling of `clevertap.ts` and deliberately not a variant of it, because Generic
 * SMS inverts Generic WhatsApp on the one point that decides the whole surface.
 *
 * Under Generic WhatsApp CleverTap defines the payload and we conform to it, so our
 * page holds nine fixed values to be retyped. Under Generic SMS *the client* defines
 * the payload: CleverTap's provider form asks for our endpoint, our credentials, and
 * then a payload template into which it substitutes a small set of replacement
 * tokens. It sends whatever the client typed. So the highest-leverage thing this
 * screen can produce is not a list of values — it is one recipe, correct by
 * construction, pasted whole.
 *
 * Three consequences run through everything below.
 *
 * Only six tokens can vary per recipient — $$To, $$Body, $$TemplateID,
 * $$TemplateVariables, $$CampaignID and $$MessageID. Anything else our API needs is
 * a static value in the client's configuration, which is why the sender header is
 * baked into the recipe rather than being a request field — and why one recipe
 * serves exactly one header.
 *
 * $$MessageID is the whole of delivery reporting. CleverTap substitutes an opaque
 * string and we must return it verbatim on every callback. Omit it and the
 * integration sends perfectly and reports nothing — a campaign showing zero
 * delivered against a full send. That failure is silent on both sides, which is why
 * {@link reportingHealth} exists and why the recipe editor refuses to let it go.
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
  draft: "Created here, but no message has come through it.",
  live: "At least one real message has been processed.",
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
   * have $$MessageID in one recipe and not the other, and a boolean would report
   * that as fine.
   */
  messagesSeen: number;
  messagesWithMessageId: number;

  /** Set only if the user edited the recipe. Absent means "whatever we generate". */
  recipeOverride?: string;
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

/* ───────────────────────────────── Batching ─────────────────────────────────── */

/**
 * The array key in the recipe. It is a value the client types into CleverTap's own
 * form — batch key name — so it has to be stated, not implied.
 *
 * Batching is settled entirely on that form and nowhere here: name this key and
 * CleverTap packs up to {@link SMS_BATCH_MAX} recipients into one request; leave it
 * blank and it sends the same block once per recipient. The recipe is identical
 * either way, because the send API takes a `recipients` array in both cases and a
 * batch of one is a valid batch.
 *
 * There was briefly a control on the panel offering the two modes. It produced no
 * difference in anything we emit — the only lever is a field on CleverTap's form we
 * cannot render — so it was removed rather than left implying otherwise. An earlier
 * version went further and varied the JSON, flattening the array away for the
 * non-batched case as the PRD sketches; that produced a body with no `recipients`
 * key, which the send API rejects. Do not reintroduce either on the strength of the
 * two modes sounding like they ought to differ here.
 */
export const SMS_BATCH_KEY = "recipients";

/**
 * Records per batch, and the one number in this file with a documented conflict
 * behind it.
 *
 * CleverTap's provider setup page says a single batch can hold 1,000 records; a
 * sample elsewhere in the same Generic SMS documentation says 100. Both cannot be
 * right. Our endpoint caps at 100 and rejects anything larger with an error naming
 * the limit, which is the safe side of the disagreement: a client configured at 100
 * works whichever figure is correct, and one configured at 1,000 against a 100 cap
 * loses 900 records per request with no error if we truncate instead of refusing.
 *
 * The ceiling is carried alongside because a client reading 100 here and 1,000 on
 * CleverTap's screen needs to know which one binds, and the answer is ours.
 */
export const SMS_BATCH_MAX = 100;
export const CT_BATCH_CEILING = 1000;

/* ────────────────────────────────── Recipe ──────────────────────────────────── */

/**
 * The whole product of this integration, in one string.
 *
 * Every client-specific value is filled in — the sender header, nothing left as
 * `<your sender id>` — because a recipe with a placeholder in it is a recipe that
 * gets pasted with the placeholder still in it. The tokens that remain are the ones
 * CleverTap substitutes at send time, and those are meant to survive the paste
 * literally.
 *
 * The keys are the send API's and not ours to choose: `template_id`, `sender_id`,
 * `recipients[].to`. Two of them are asks on that API rather than fields it takes
 * today — `recipients[].message_id`, without which delivery reporting cannot exist at
 * all, and `campaign_id`, which is the only link back from a CleverTap campaign to
 * the run it produces. Both are in the block anyway, because a recipe that omits them
 * is a recipe that has to be repasted later, and repasting is the step clients skip.
 *
 * `variables` holds a token where a direct caller would put an object of named values.
 * CleverTap has one opaque $$TemplateVariables and no way to emit our key names, so
 * the API resolves the names from `template_id` against the DLT mirror. That is why
 * this file models no templates: the mapping belongs where the registry already is.
 *
 * There is no `body` key. The API has no field for a pre-rendered message, so $$Body
 * has nowhere to go — tracked in `docs/clevertap-sms-api-asks.md` rather than papered
 * over with a field the endpoint would ignore.
 */
export function smsRecipe(opts: { header: string }): string {
  const envelope = {
    template_id: "$$TemplateID",
    sender_id: opts.header,
    campaign_id: "$$CampaignID",
  };
  const record = {
    to: "$$To",
    message_id: "$$MessageID",
    variables: "$$TemplateVariables",
  };

  return JSON.stringify({ ...envelope, [SMS_BATCH_KEY]: [record] }, null, 2);
}

/**
 * What is wrong with an edited recipe, in the client's terms.
 *
 * CleverTap's form accepts an invalid recipe without complaint and fails at send
 * time, so this is the last point at which the mistake is cheap. Each message names
 * the missing token *and* what happens without it, because not every one of these
 * failures looks like a failure — a recipe missing $$MessageID sends perfectly and
 * reports nothing, which is the case a client would never think to check.
 *
 * Checked against the raw text rather than the parsed object on purpose. A token can
 * legitimately sit inside a string, as part of one, or as a key's value at any depth,
 * and walking the tree to find it would reject shapes that work. `sender_id` is the
 * one exception and is matched with its key, because unlike the tokens it is an
 * ordinary string that could plausibly appear anywhere.
 */
export function recipeError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "There is nothing here. CleverTap needs a payload structure to send.";

  try {
    JSON.parse(v);
  } catch {
    return "This is not valid JSON. CleverTap's form will save it anyway and every send will fail.";
  }

  if (!v.includes("$$To")) {
    return "$$To is missing. CleverTap has nowhere to put the recipient's number, so nothing will reach anyone.";
  }
  if (!v.includes("$$MessageID")) {
    return "$$MessageID is missing. Messages will send and deliver, and CleverTap's report will show zero of everything — permanently.";
  }
  if (!v.includes("$$TemplateID")) {
    return "$$TemplateID is missing. Indian traffic has to name a registered DLT template, so every send would be rejected at the operator.";
  }
  if (!/"sender_id"\s*:\s*"[A-Z0-9]{3,11}"/.test(v)) {
    return "sender_id is missing or is not a header. CleverTap has no token for it — it is a static value in this block — so a recipe without one sends from nothing.";
  }
  return null;
}

/** The recipe as it stands: the client's edit if there is one, ours otherwise. */
export function effectiveRecipe(c: SmsConnection, opts: { header: string }): string {
  return c.recipeOverride ?? smsRecipe({ header: opts.header });
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
