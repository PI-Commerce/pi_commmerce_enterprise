/**
 * Outbound webhooks — v2 (typed model).
 *
 * A webhook is a registered receiver. Each webhook has a `type` that
 * determines two things:
 *   1. Which auto-included fields go in the payload envelope
 *   2. Where in the app it can be attached
 *
 * The registry only knows URL + auth + type. Per-node payload extras
 * (workflow variables specific to a particular Human Escalation node)
 * live on the node's config, not on the webhook.
 *
 *   Type              Attached where                                Delivers
 *   ------------------------------------------------------------------------
 *   Channels          Channels → <channel> settings                 Delivery events (sent/delivered/read/replied/failed)
 *   Campaign          Start node config, per campaign               Lifecycle (started/paused/completed/failed)
 *   Human Escalation  Human Escalation node config, per node        lead.escalated
 *
 * v1 is in-memory. Store lives in webhooks-store.ts.
 */

/* -------------------------------------------------------------------------- *
 *  Types
 * -------------------------------------------------------------------------- */

export type WebhookType = "channels" | "campaign" | "human_escalation";

export const WEBHOOK_TYPE_LABEL: Record<WebhookType, string> = {
  channels:         "Channels",
  campaign:         "Campaign",
  human_escalation: "Human Escalation",
};

/**
 * Human Escalation + Channels ship in the developer surface. Campaign is
 * declared in the type system but not yet exposed in the create picker.
 */
export const WEBHOOK_TYPE_ENABLED: Record<WebhookType, boolean> = {
  channels:         true,
  campaign:         false,
  human_escalation: true,
};

/* -------------------------------------------------------------------------- *
 *  Channels sub-model
 * -------------------------------------------------------------------------- */

export type WebhookChannel = "whatsapp" | "sms" | "rcs";

export const WEBHOOK_CHANNEL_LABEL: Record<WebhookChannel, string> = {
  whatsapp: "WhatsApp",
  sms:      "SMS",
  rcs:      "RCS",
};

/**
 * Event *buckets* per channel. v1 ships Delivery Status for all three
 * channels, and Incoming Messages for WhatsApp + RCS. Bodies mirror the
 * vendor's own webhook shape (Meta for WhatsApp, Jio for SMS, RBM for RCS).
 * Templates bucket is planned for a follow-up.
 */
export const CHANNEL_EVENTS: Record<WebhookChannel, { id: string; label: string }[]> = {
  whatsapp: [
    { id: "delivery_status", label: "Delivery Status" },
    { id: "incoming",        label: "Incoming Messages" },
  ],
  sms: [
    { id: "delivery_status", label: "Delivery Status" },
  ],
  rcs: [
    { id: "delivery_status", label: "Delivery Status" },
    { id: "incoming",        label: "Incoming Messages" },
  ],
};

export const WEBHOOK_TYPE_DESCRIPTION: Record<WebhookType, string> = {
  channels:         "Delivery events for a specific channel instance.",
  campaign:         "Campaign lifecycle events (started, paused, completed, failed).",
  human_escalation: "Fires when a lead reaches a Human Escalation node.",
};

/** HMAC signature header name. Signature is HMAC-SHA256 over the raw POST
 *  body bytes, lowercase hex output. */
export const SIGNATURE_HEADER = "X-Webhook-Signature";

/**
 * Auto-included fields per event type. Kept minimal on purpose — only what
 * backend guarantees. Per-node "payload extras" (upstream workflow variables)
 * are added on top at the node config, not here.
 */
export const AUTO_INCLUDED_FIELDS: Record<WebhookType, string[]> = {
  // Deferred to a follow-up — payload shape needs alignment with backend
  // once channel-side event catalog is settled.
  channels: [],
  campaign: [],
  human_escalation: [
    "timestamp", "campaign_id", "lead_id", "phone", "run_id",
  ],
};

/** Example payload rendered in the webhook dialog's Payload preview — literal
 *  values illustrate the shape a receiver will see. */
export const PAYLOAD_EXAMPLE: Record<WebhookType, Record<string, string | number | boolean>> = {
  channels: {},
  campaign: {},
  human_escalation: {
    timestamp:   "2026-08-04T14:22:00Z",
    campaign_id: "c_ex20",
    lead_id:     "l_1040",
    phone:       "+919812340000",
    run_id:      "r_8041",
  },
};

export type WebhookHeader = { key: string; value: string };

/**
 * Scope inside a channel. What is required depends on the channel:
 *   whatsapp: wabaId + phoneNumberId (WABA + one of its numbers)
 *   sms:      senderId              (DLT-registered sender header)
 *   rcs:      agentId               (RBM agent under a brand)
 * Only the fields relevant to the picked channel are populated.
 */
export type WebhookScope = {
  wabaId?: string;
  phoneNumberId?: string;
  senderId?: string;
  agentId?: string;
};

export type Webhook = {
  id: string;                  // wh_xxxxx
  name: string;
  type: WebhookType;
  /** Only set when `type === "channels"`. Pins the webhook to one channel
   *  so its event catalog is unambiguous. */
  channel?: WebhookChannel;
  /** Channel-local scope (see {@link WebhookScope}). */
  scope?: WebhookScope;
  /** Subscribed event bucket ids. For channels webhooks these come from
   *  {@link CHANNEL_EVENTS}. Empty = subscribed to every bucket for this channel. */
  events?: string[];
  endpointUrl: string;
  /** Static bearer token sent on every webhook POST as
   *  `Authorization: Bearer <token>`. Shown once at creation, not shown again.
   *  Simplest possible receiver-side check: string compare against the value
   *  the client saved on their side. */
  authToken: string;
  headers: WebhookHeader[];
  status: "active" | "paused";
  createdAt: string;           // ISO
  lastDeliveryAt?: string;     // ISO — for the table's "Last delivery" cell
};

export type DeliveryAttempt = {
  id: string;                  // del_xxxxx
  webhookId: string;
  /** Concrete event name — e.g. "lead.escalated", "whatsapp.delivered". Used
   *  for filtering the delivery log. */
  event: string;
  at: string;                  // ISO
  responseCode: number | null; // null = network fail / TLS / timeout
  latencyMs: number | null;
  success: boolean;
  eventId: string;             // envelope id
  errorMessage?: string;
};

/* -------------------------------------------------------------------------- *
 *  Seed
 * -------------------------------------------------------------------------- */

function isoDaysAgo(days: number, hour = 10, minute = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
function isoHoursAgo(hours: number, minute = 0): string {
  const d = new Date();
  d.setHours(d.getHours() - hours, minute, 0, 0);
  return d.toISOString();
}

export const SEED_WEBHOOKS: Webhook[] = [
  {
    id: "wh_crm_esc",
    name: "Client CRM · Escalations",
    type: "human_escalation",
    endpointUrl: "https://crm.acmecorp.internal/hooks/pi/escalations",
    authToken: "whsec_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p",
    headers: [{ key: "Authorization", value: "Bearer <acme-crm-token>" }],
    status: "active",
    createdAt: isoDaysAgo(42, 9, 12),
    lastDeliveryAt: isoHoursAgo(2, 14),
  },
  {
    id: "wh_ops_slack_esc",
    name: "Ops Slack · Escalation queue",
    type: "human_escalation",
    endpointUrl: "https://hooks.slack.com/services/T00/B00/pi-esc-alerts",
    authToken: "whsec_9z8y7x6w5v4u3t2s1r0q9p8o7n6m5l4k",
    headers: [],
    status: "active",
    createdAt: isoDaysAgo(30, 15, 40),
    lastDeliveryAt: isoHoursAgo(6, 22),
  },
  {
    id: "wh_wa_events",
    name: "wa-delivery-events",
    type: "channels",
    channel: "whatsapp",
    scope: { wabaId: "104882190034771", phoneNumberId: "10934471290017" },
    events: ["delivery_status", "incoming"],
    endpointUrl: "https://hooks.acmecorp.com/pi/whatsapp",
    authToken: "pi_wh_5m5m5m5m5m5m5m5m5m5m5m5m5m5m5m5m",
    headers: [],
    status: "active",
    createdAt: isoDaysAgo(60, 11, 5),
    lastDeliveryAt: isoHoursAgo(0, 8),
  },
  {
    id: "wh_sms_dlr",
    name: "sms-dlr-billing",
    type: "channels",
    channel: "sms",
    scope: { senderId: "PICOMM" },
    events: ["delivery_status"],
    endpointUrl: "https://hooks.acmecorp.com/pi/sms/dlr",
    authToken: "pi_wh_sms111sms222sms333sms444sms5555",
    headers: [],
    status: "active",
    createdAt: isoDaysAgo(15, 12, 20),
    lastDeliveryAt: isoHoursAgo(1, 30),
  },
  {
    id: "wh_rcs_dlr",
    name: "rcs-delivery-crm",
    type: "channels",
    channel: "rcs",
    scope: { agentId: "acme_promo_bot" },
    events: ["delivery_status"],
    endpointUrl: "https://hooks.acmecorp.com/pi/rcs/dlr",
    authToken: "pi_wh_rcsrcsrcsrcsrcsrcsrcsrcsrcsrcs00",
    headers: [],
    status: "active",
    createdAt: isoDaysAgo(7, 10, 0),
    lastDeliveryAt: isoHoursAgo(4, 5),
  },
  {
    id: "wh_campaign_lifecycle",
    name: "Campaign lifecycle → Ops dashboard",
    type: "campaign",
    endpointUrl: "https://ops.acmecorp.internal/pi/campaign-events",
    authToken: "whsec_c4mp41gnli4ecycl3c4mp41gnli4ecyc",
    headers: [],
    status: "active",
    createdAt: isoDaysAgo(21, 8, 40),
    lastDeliveryAt: isoDaysAgo(1, 16),
  },
  {
    id: "wh_disabled_test",
    name: "Legacy sandbox (paused)",
    type: "human_escalation",
    endpointUrl: "https://old-sandbox.acmecorp.internal/pi-webhook",
    authToken: "whsec_pauseddemosecretpauseddemosecret",
    headers: [],
    status: "paused",
    createdAt: isoDaysAgo(120, 14, 30),
    lastDeliveryAt: isoDaysAgo(30, 9, 15),
  },
];

/* -------------------------------------------------------------------------- *
 *  Delivery log seed
 * -------------------------------------------------------------------------- */

/** Stable hash for deterministic seed. */
function h(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return Math.abs(x);
}

/** A representative event name per webhook type. Used to seed the delivery
 *  log with realistic topics on each row. */
const SAMPLE_EVENTS: Record<WebhookType, string[]> = {
  channels: [
    "whatsapp.delivered", "whatsapp.read", "whatsapp.replied", "whatsapp.failed",
  ],
  campaign: [
    "campaign.started", "campaign.completed", "campaign.failed", "campaign.paused",
  ],
  human_escalation: [
    "lead.escalated",
  ],
};

function buildDeliveries(): DeliveryAttempt[] {
  const out: DeliveryAttempt[] = [];
  for (const wh of SEED_WEBHOOKS) {
    if (wh.status === "paused") continue;
    const events = SAMPLE_EVENTS[wh.type];
    const n = wh.type === "channels" ? 40 : wh.type === "campaign" ? 12 : 22;
    for (let i = 0; i < n; i++) {
      const hoursAgo = Math.floor(((h(wh.id + i) % 168) / 168) * 168);
      const event = events[h(wh.id + ":" + i) % events.length];
      const roll = h(wh.id + "^" + i) % 100;
      const successThreshold = wh.type === "channels" ? 98 : wh.type === "campaign" ? 97 : 94;
      const success = roll < successThreshold;
      const responseCode = success ? 200 : roll % 3 === 0 ? 429 : roll % 3 === 1 ? 500 : null;
      const latencyMs = success
        ? 80 + (h(wh.id + "$" + i) % 620)
        : responseCode == null ? null : 3000 + (h(wh.id + "!" + i) % 2000);
      out.push({
        id: `del_${wh.id.slice(3)}_${i}`,
        webhookId: wh.id,
        event,
        at: isoHoursAgo(hoursAgo, h(wh.id + i + "min") % 60),
        responseCode,
        latencyMs,
        success,
        eventId: `evt_${(h(wh.id + i + "e") % 1_000_000).toString(36)}`,
        errorMessage: success ? undefined
          : responseCode === 429 ? "Rate limited — retry-after 30s"
          : responseCode === 500 ? "Upstream 500 Internal Server Error"
          :                         "Connection timeout after 30s",
      });
    }
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export const SEED_DELIVERIES: DeliveryAttempt[] = buildDeliveries();

/* -------------------------------------------------------------------------- *
 *  Auth helpers
 * -------------------------------------------------------------------------- */

export function maskToken(token: string): string {
  if (token.length <= 8) return "•".repeat(token.length);
  return `${token.slice(0, 6)}${"•".repeat(24)}${token.slice(-4)}`;
}

/** Generate a fresh Bearer token. Same shape as our API keys (`pi_wh_…`). */
export function generateAuthToken(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "pi_wh_";
  for (let i = 0; i < 32; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** Back-compat re-exports so any callers that still import the old names
 *  (Human Escalation node) keep compiling. Safe to remove after those
 *  are migrated. */
export const maskSecret = maskToken;
export const generateSigningSecret = generateAuthToken;
