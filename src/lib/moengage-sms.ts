/**
 * MoEngage Custom Connector for SMS — model, store and derivations.
 *
 * A sibling of `clevertap-sms.ts`, and the PRD is explicit that it is a sibling
 * rather than a variant: the send side ports across almost unchanged, while
 * correlation, callbacks and panel setup are new work. Five properties of
 * MoEngage's contract differ from CleverTap's and each one changes this surface.
 *
 * **Correlation runs on our identifier.** CleverTap substitutes `$$MessageID` and we
 * echo it; MoEngage passes no per-message token at all. It reads a message ID out of
 * our *send response*, at a field the client names, and matches every later callback
 * to it. So there is no token to protect in a recipe here — the equivalent failure is
 * a mistyped field-mapping value, which is why {@link MOE_FIELD_MAPPING} is a
 * first-class thing on the page rather than a footnote.
 *
 * **Delivered is an exact string match.** MoEngage derives its one metric by comparing
 * the callback's status against success values the client types in. `delivered`,
 * `Delivered ` with a trailing space, or anything but `DELIVERED` leaves the count at
 * zero against a fully delivered campaign — silent on both sides. Hence
 * {@link MOE_SUCCESS_VALUE} is a constant, copied rather than typed.
 *
 * **Authentication is a header we build.** MoEngage's provider form has no Basic
 * Authentication field, so we hand over the finished `Basic <base64>` value for the
 * Headers section. The panel therefore shows a header *value*, not a username and a
 * password — see {@link authorizationHeaderValue}.
 *
 * **One provider per domain, one URL for all senders.** Every custom service provider
 * in a MoEngage workspace needs a distinct domain, and all senders under a provider
 * share one Delivery Tracking URL. Pi Commerce has one domain, so a workspace can hold
 * exactly one Pi Commerce provider — which is why this store allows one connection
 * (see {@link canCreateMoeConnection}) and why a second header is a *sender* under the
 * existing provider rather than a second connection.
 */
import { useSyncExternalStore } from "react";
import { CT_HOST } from "@/lib/clevertap";
import { DLT_HEADERS } from "@/lib/clevertap-sms";

/* ────────────────────────────────── State ───────────────────────────────────── */

/**
 * Two states, the same pair every other delivery lane has.
 *
 * Draft and Live are the only ones a connection is ever *in*, and neither is something
 * the panel can set: a connection is Draft from creation until a request passes
 * authentication, at which point it is Live and carries a last-activity timestamp.
 * There is no button for that, here or on the CleverTap lanes, because no button can
 * manufacture real traffic.
 *
 * Disabled is deliberately *not* a third state. It is an {@link MoeConnection.enabled}
 * flag that shadows whichever state the connection is in — exactly as on the CleverTap
 * connectors — so disable and delete behave identically across every lane and live in
 * the one place they live for all of them: the row menu on Connections. FR-8 describes
 * Disabled as a lifecycle state; modelling it as one here would have given MoEngage a
 * second, different set of controls for the same two actions.
 */
export type MoeState = "draft" | "live";

export const MOE_STATE_LABEL: Record<MoeState, string> = {
  draft: "Draft",
  live: "Live",
};

export const MOE_STATE_INFO: Record<MoeState, string> = {
  draft: "Able to accept traffic. No request has arrived yet.",
  live: "Configured and sending.",
};

export const MOE_STATE_TONE: Record<MoeState, string> = {
  draft: "border-border bg-secondary text-muted-foreground",
  live: "border-success/30 bg-success/10 text-success",
};

/** Same collapse as the other lanes: Disabled wins the one slot a pill has. */
export function moeStatePill(c: MoeConnection): { label: string; tone: string } {
  return c.enabled
    ? { label: MOE_STATE_LABEL[c.state], tone: MOE_STATE_TONE[c.state] }
    : { label: "Disabled", tone: "border-destructive/30 bg-destructive/10 text-destructive" };
}

/* ──────────────────────────────── Connection ────────────────────────────────── */

export type MoeConnection = {
  id: string;
  createdAt: string;
  state: MoeState;
  /**
   * Last activity. Absent while Draft — the first valid request is what sets it and
   * what moves the connection to Live, in the same motion.
   */
  lastRequestAt?: string;

  /** FR-6: shown beside the state. Set when the first valid request arrives. */
  enabled: boolean;

  /** The MoEngage workspace this provider lives in. One connection per workspace. */
  workspace: string;

  /**
   * The sender headers this connection covers, defaulting to all (FR-6).
   *
   * Each becomes one *sender* under the single Pi Commerce provider in MoEngage — not
   * a second provider, which MoEngage's distinct-domain rule forbids. A request whose
   * `sender_id` is outside this set is refused with 403 `header_not_authorised`.
   */
  headers: string[];

  /** Basic credentials, delivered to MoEngage as a static header (FR-2). */
  username: string;
  /** Present only in the session it was generated in. Shown once, then rotation only. */
  password?: string;
  rotation?: { until: string; graceDays: number };

  /**
   * MoEngage's SMS Delivery Tracking URL, pasted back after the client edits the saved
   * sender (FR-6).
   *
   * Absent for a while by design: MoEngage only generates it once a sender exists, and
   * a sender cannot be saved before its test send passes. So the first callbacks are
   * produced before this is known — FR-5 holds them for 24 hours and flushes on save,
   * which is what {@link heldCallbacks} stands in for on the panel.
   */
  deliveryTrackingUrl?: string;

  /** FR-7 evidence. Callbacks waiting on a Delivery Tracking URL. */
  heldCallbacks: number;
  /** FR-7 evidence. Callbacks MoEngage never acknowledged, after retries. */
  deadLetteredCallbacks: number;
};

export const MOE_DEFAULT_GRACE_DAYS = 7;

/** FR-5: how long callbacks are held when no Delivery Tracking URL is saved. */
export const MOE_HOLD_HOURS = 24;

/* ──────────────────────────────── Endpoint ──────────────────────────────────── */

/**
 * One path for every connection, like the CleverTap SMS lane and for the same reason:
 * the credential in the request identifies the connection, so the URL does not have to.
 *
 * MoEngage adds a second reason. Every custom service provider in a workspace must
 * have a distinct *domain* — so if the path varied per connection it would still be
 * one domain, one provider, and a per-connection path would imply a second provider
 * were possible when it is not.
 */
export function moeSendEndpoint(): string {
  return `${CT_HOST}/moe/v1/sms/send`;
}

/* ─────────────────────────── Authentication (FR-2) ──────────────────────────── */

/**
 * The finished header value, ready to paste.
 *
 * MoEngage's provider form has no Basic Authentication field — credentials go in the
 * Headers section as an ordinary header — so handing over a username and a password
 * would leave the client to base64 them by hand. That step is both easy to get wrong
 * and invisible when it is: a bad encoding is a 401 on every send, which MoEngage
 * reports as a failed campaign rather than a configuration error.
 *
 * Returns null when the password is not in hand, which is the ordinary case: it is
 * shown once at creation and after that only a rotation can produce it again. The
 * panel says so rather than rendering a header value with dots in the middle, because
 * a value that looks copyable and is not gets pasted.
 */
export function authorizationHeaderValue(c: MoeConnection): string | null {
  if (!c.password) return null;
  return `Basic ${base64(`${c.username}:${c.password}`)}`;
}

/** `btoa` in the browser, Buffer under SSR — this module renders on both. */
function base64(raw: string): string {
  if (typeof btoa === "function") return btoa(raw);
  return Buffer.from(raw, "utf8").toString("base64");
}

export const MOE_CONTENT_TYPE = "application/json";


/* ─────────────────────────── Field mapping (FR-6) ───────────────────────────── */

/**
 * MoEngage's exact-match success value.
 *
 * A constant and not a setting. MoEngage compares the callback's status against this
 * string literally; any other spelling leaves Delivered at 0 with nothing on either
 * side reporting a problem. That is the single highest-consequence character sequence
 * in this integration, which is why it is copied from here rather than typed.
 */
export const MOE_SUCCESS_VALUE = "DELIVERED";

/**
 * The five values a client pastes under "Map fields manually".
 *
 * They must be entered by hand because MoEngage's auto-mapping reads the *test SMS's*
 * callback to infer them — and that callback cannot reach MoEngage until the Delivery
 * Tracking URL has been saved here, which happens after the test. Auto-mapping
 * therefore infers from nothing and silently maps nothing, so the notice that says to
 * choose manual mapping is load-bearing rather than advisory.
 */
export const MOE_FIELD_MAPPING: { field: string; value: string; note: string }[] = [
  {
    field: "Unique sent ID field",
    value: "message_id",
    note: "Read from our send response. This one key carries the whole of delivery reporting.",
  },
  {
    field: "Unique delivery ID field",
    value: "message_id",
    note: "The same key, repeated in every callback, which is how MoEngage matches the two.",
  },
  {
    field: "Delivery status field",
    value: "status",
    note: "Only terminal states are ever sent — DELIVERED or FAILED, never an intermediate.",
  },
  {
    field: "Success values for delivery status",
    value: MOE_SUCCESS_VALUE,
    note: "Exact match. Any other spelling leaves Delivered at 0 against a full send.",
  },
  {
    field: "Failure reason field",
    value: "failure_reason",
    note: "MoEngage groups its error breakdown by this string, so we send a fixed label.",
  },
];

/* ──────────────────── Delivery Tracking URL (FR-6, Q6) ──────────────────────── */

const MOE_DLR_HOST = "moengage.com";
const MOE_DLR_PATH = "/sms/dlr/custom/";

/**
 * FR-6: block the save with the reason shown unless the URL is HTTPS, on a MoEngage
 * host, and carries the custom-DLR path.
 *
 * Stricter than the CleverTap equivalent, which only checks HTTPS and a plausible
 * host. The reason is Q6's answer: this URL takes no authentication, so its path *is*
 * the credential — whoever holds it can write delivery statistics into the client's
 * MoEngage account. A URL pasted from the wrong field is therefore not a typo that
 * fails loudly; it is a working endpoint somewhere else, or a dead one that silently
 * reports nothing.
 */
export function trackingUrlError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Paste the SMS Delivery Tracking URL from the saved sender in MoEngage.";

  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "That is not a URL.";
  }
  if (u.protocol !== "https:") {
    return "Delivery Tracking URLs must use HTTPS. The path is the only thing protecting this endpoint.";
  }
  if (u.hostname !== MOE_DLR_HOST && !u.hostname.endsWith(`.${MOE_DLR_HOST}`)) {
    return `That is not a MoEngage host. The URL MoEngage generates is on ${MOE_DLR_HOST}.`;
  }
  if (!u.pathname.includes(MOE_DLR_PATH)) {
    return `That is not a custom-connector tracking URL — the path should contain ${MOE_DLR_PATH}. Check you copied it from the saved sender's delivery tracking section.`;
  }
  return null;
}

/**
 * Host readable, path hidden (FR-6).
 *
 * The opposite emphasis to the CleverTap mask, which hides everything after the
 * origin. Here the host is the part worth showing — it is how a client confirms they
 * pasted a MoEngage URL at all — and the path is the part that must not be left on
 * screen, because it carries the connector ID that authorises writes.
 */
export function maskTrackingUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}/•••••••••••••••`;
  } catch {
    return "•••••••••••••••";
  }
}

/* ─────────────────────── Failure taxonomy (FR-5) ────────────────────────────── */

/**
 * The canonical failure vocabulary, shared with the CleverTap SMS connector.
 *
 * Sent as `error_code` plus a fixed `failure_reason` label. The label must never carry
 * numbers, identifiers or timestamps, because MoEngage groups its error breakdown by
 * that exact string — a reason containing a message ID would produce one group per
 * message and an error breakdown that explains nothing.
 */
export const MOE_FAILURE_CODES: { code: string; reason: string; cause: string }[] = [
  { code: "900", reason: "DLT template ID missing", cause: "+91 destination sent without dlt_template_id" },
  { code: "900", reason: "Other failure", cause: "Anything unmapped; raw operator code kept here" },
  { code: "901", reason: "DND failure", cause: "National DND registry" },
  { code: "902", reason: "Spam detected", cause: "Carrier spam filter" },
  { code: "903", reason: "Rejected: blocklist or opt-out", cause: "User sent STOP, or operator block" },
  { code: "904", reason: "Provider system error", cause: "Failure inside Pi Commerce or the aggregator" },
  { code: "905", reason: "Subscriber error", cause: "No balance, no network" },
  { code: "906", reason: "Sender header blocked by DLT", cause: "Header mismatch or unregistered" },
  { code: "907", reason: "Entity blocked by DLT", cause: "Entity missing or mismatched" },
  { code: "908", reason: "Template blocked by DLT", cause: "Template ID or content mismatch" },
  { code: "909", reason: "DLT consent error", cause: "Consent registration required" },
  { code: "910", reason: "Invalid number", cause: "Invalid or inactive number" },
  { code: "912", reason: "Inbox full", cause: "Handset storage full" },
  { code: "913", reason: "NDNC rejected", cause: "Registered in NCPR" },
  { code: "914", reason: "Undelivered", cause: "Failed after operator retries" },
  { code: "915", reason: "Dropped", cause: "Series ban or SIM inactivity" },
  { code: "916", reason: "Expired", cause: "Undelivered within validity" },
  { code: "917", reason: "Force expired", cause: "Provider rule or invalid base" },
  { code: "918", reason: "Duplicate message dropped", cause: "Same content to same number within 30 minutes" },
  { code: "919", reason: "DLT failure", cause: "Platform-level DLT issue" },
  { code: "920", reason: "URL not whitelisted", cause: "Operator rejected an unwhitelisted URL" },
];

/* ───────────────────────────────── Store ────────────────────────────────────── */

/**
 * One seeded connection, Live and fully set up, covering every registered header.
 *
 * Only one, and that is the constraint rather than a sample size: FR-6 allows one
 * connection per MoEngage workspace, and the demo has one workspace. Seeding it Live
 * means the ordinary working screen is what opens; the Draft and Disabled screens are
 * reachable by disabling it or by deleting it and creating a new one, which is the
 * same path a client takes.
 */
const SEED: MoeConnection[] = [
  {
    id: "moe_7a41c9",
    createdAt: "2 Sept 2026",
    state: "live",
    enabled: true,
    lastRequestAt: "30 Sept 2026, 14:06",
    workspace: "acme-india",
    headers: DLT_HEADERS.map((h) => h.header),
    username: "moe_7a41c9_pub",
    deliveryTrackingUrl:
      "https://api-01.moengage.com/sms/dlr/custom/8f2a41c907d64b1e9a3c",
    heldCallbacks: 0,
    deadLetteredCallbacks: 0,
  },
];

let current: MoeConnection[] = SEED;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useMoeConnections(): MoeConnection[] {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

export function useMoeConnection(id: string): MoeConnection | undefined {
  return useMoeConnections().find((c) => c.id === id);
}

export function getMoeConnections(): MoeConnection[] {
  return current;
}

/**
 * FR-6: one connection per MoEngage workspace, and we model one workspace — so in
 * practice, one connection at a time.
 *
 * Exposed as a predicate rather than enforced inside {@link addMoeConnection} so the
 * create dialog can disable the option and say why, instead of letting someone fill a
 * form that fails on submit.
 */
export function canCreateMoeConnection(): boolean {
  return current.length === 0;
}

export function addMoeConnection(c: MoeConnection) {
  current = [c, ...current];
  emit();
}

export function updateMoeConnection(id: string, patch: Partial<MoeConnection>) {
  current = current.map((c) => (c.id === id ? { ...c, ...patch } : c));
  emit();
}


export function removeMoeConnection(id: string) {
  current = current.filter((c) => c.id !== id);
  emit();
}

/* ─────────────────────────────── Generators ─────────────────────────────────── */

const HEX = "0123456789abcdef";
const rand = (n: number) =>
  Array.from({ length: n }, () => HEX[Math.floor(Math.random() * 16)]).join("");

export function newMoeConnectionId(): string {
  return `moe_${rand(6)}`;
}
