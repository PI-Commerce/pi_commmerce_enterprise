/**
 * Settings > Usage & Billing (demo data layer).
 *
 * Per-message row generators and CSV builders for the four live channels. This
 * surface answers "how much did we consume?" for finance reconciliation, NOT
 * "which message failed and why?" (that's the Reports DLR exports under
 * PICOM-6126 and its children 6130-6134).
 *
 * Columns per channel were trimmed from the DLR specs:
 *   - WhatsApp: from PICOM-6131 (20 cols) -> 11 billing-relevant cols.
 *   - SMS:      from PICOM-6132 (14 cols) -> 10 billing-relevant cols.
 *   - RCS:      from PICOM-6133 (15 cols) -> 10 billing-relevant cols.
 *   - Voice:    lift-and-shift of the current Voice CSV minus the 21
 *               per-agent custom post-call variables, plus `source`.
 *
 * Two timestamps per row:
 *   - sent_at       : the billable event (the send attempt).
 *   - last_updated  : the final-state timestamp (collapses
 *                     delivered_at / read_at / failed_at into one).
 *
 * Message-wise rows (not aggregate). KPI tiles on the UI aggregate on the fly
 * from the date range + source filter. The CSV is the raw list.
 */

import { phoneCsvCell } from "@/lib/analytics-leads";

// -----------------------------------------------------------------------------
// Sources per channel (locked from the product screenshots + Jira specs)
// -----------------------------------------------------------------------------

/** WhatsApp send sources. Mirrors the "Source" dropdown on the WA Analytics view. */
export const WA_SOURCES = [
  "Template API",
  "Campaign - API Based",
  "Campaign - CSV Based",
  "Clevertap",
  "Broadcast",
  "Moengage",
] as const;
export type WaSource = (typeof WA_SOURCES)[number];

/** SMS send sources. No Clevertap today. */
export const SMS_SOURCES = [
  "Template API",
  "Campaign - API Based",
  "Campaign - CSV Based",
  "Broadcast",
  "Moengage",
] as const;
export type SmsSource = (typeof SMS_SOURCES)[number];

/** RCS send sources. No Clevertap/Moengage integration today. */
export const RCS_SOURCES = [
  "Template API",
  "Campaign - API Based",
  "Campaign - CSV Based",
  "Broadcast",
] as const;
export type RcsSource = (typeof RCS_SOURCES)[number];

/** Voice send sources. Mirrors RCS (campaign-driven channel). */
export const VOICE_SOURCES = [
  "Template API",
  "Campaign - API Based",
  "Campaign - CSV Based",
  "Broadcast",
] as const;
export type VoiceSource = (typeof VOICE_SOURCES)[number];

// -----------------------------------------------------------------------------
// Row types
// -----------------------------------------------------------------------------

/** Meta WhatsApp conversation category (the billing dimension). */
export type WaMessageType = "marketing" | "utility" | "authentication" | "service";

export type WaUsageRow = {
  recipient: string;
  wabaId: string;
  phoneNumberId: string;
  /** ISO-3166 alpha-2. Derived from the +CC prefix of `recipient` at send time.
   *  Open discussion with tech on where this is stamped. */
  country: string;
  messageType: WaMessageType;
  templateName: string;
  providerMessageId: string;
  source: WaSource;
  status: "SENT" | "DELIVERED" | "READ" | "REPLIED" | "FAILED";
  sentAt: string;
  lastUpdated: string;
  /** Pi URL Clicks webhook (bucket wh_wa_url_clicks). First tap only per
   *  message, even for multi-button templates. Blank when the template has
   *  no URL button or when the recipient did not tap. See PICOM-6131. */
  clickedUrl: string | null;
  clickedUrlLabel: string | null;
  urlClickedAt: string | null;
};

export type SmsUsageRow = {
  recipient: string;
  senderId: string;
  peId: string;
  templateName: string;
  templateId: string;
  source: SmsSource;
  status: "SENT" | "DELIVERED" | "FAILED";
  sentAt: string;
  lastUpdated: string;
  /** Billable unit. Same value as the webhook X-Pi-Credit-Consumed header. */
  smsCount: number;
};

export type RcsUsageRow = {
  recipient: string;
  agent: string;
  agentId: string;
  provider: "JIO" | "NETCORE";
  templateName: string;
  templateId: string;
  source: RcsSource;
  status: "SENT" | "DELIVERED" | "READ" | "CLICKED" | "FAILED";
  sentAt: string;
  lastUpdated: string;
};

export type VoiceUsageRow = {
  scheduledAt: string;
  phoneNumber: string;
  customerName: string;
  /** Wall-clock talk time in seconds. 0 for calls that didn't connect. */
  durationSec: number;
  source: VoiceSource;
  callStatus: "COMPLETED" | "FAILED";
  updatedAt: string;
  failureReason: string;
  failureSide: string;
};

// -----------------------------------------------------------------------------
// Deterministic RNG and helpers
// -----------------------------------------------------------------------------

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967295;
  };
}

function pickWeighted<T>(r: () => number, items: { v: T; w: number }[]): T {
  const total = items.reduce((s, x) => s + x.w, 0);
  let roll = r() * total;
  for (const it of items) {
    roll -= it.w;
    if (roll <= 0) return it.v;
  }
  return items[0].v;
}

function daysInRange(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  const start = new Date(startYmd + "T00:00:00+05:30");
  const end = new Date(endYmd + "T00:00:00+05:30");
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function isoStamp(dateYmd: string, hourOffsetMin: number): string {
  const d = new Date(dateYmd + "T00:00:00+05:30");
  d.setMinutes(d.getMinutes() + hourOffsetMin);
  return d.toISOString();
}

// A tiny shared pool of recipient MSISDNs with country spread for WA.
// 90/10 IN/US so "two countries today" (the actual data shape right now) is visible.
const RECIPIENTS_IN = [
  "+919008014329", "+918123169516", "+919948778884", "+916366966161",
  "+917406822018", "+917337058940", "+918884008800", "+919845098450",
];
const RECIPIENTS_US = ["+14155550123", "+14155550145", "+12125550198"];

function pickRecipient(r: () => number, waCountryMix = false): { phone: string; country: string } {
  if (waCountryMix && r() < 0.1) {
    return { phone: RECIPIENTS_US[Math.floor(r() * RECIPIENTS_US.length)], country: "US" };
  }
  return { phone: RECIPIENTS_IN[Math.floor(r() * RECIPIENTS_IN.length)], country: "IN" };
}

function randomHex(r: () => number, n: number): string {
  let out = "";
  const chars = "0123456789abcdef";
  for (let i = 0; i < n; i++) out += chars[Math.floor(r() * chars.length)];
  return out;
}

function wamid(r: () => number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "wamid.HBgM";
  for (let i = 0; i < 24; i++) out += chars[Math.floor(r() * chars.length)];
  return out;
}

// Rough per-day volume targets by channel. Multiplied by (1 +- 0.3) jitter.
const DAILY_VOLUME: Record<"wa" | "sms" | "rcs" | "voice", number> = {
  wa: 420,
  sms: 300,
  rcs: 180,
  voice: 55,
};

// -----------------------------------------------------------------------------
// WhatsApp generator
// -----------------------------------------------------------------------------

const WA_TEMPLATES: { name: string; type: WaMessageType }[] = [
  { name: "order_confirmation_v3",     type: "utility" },
  { name: "shipment_dispatched_v2",    type: "utility" },
  { name: "cart_recovery_festive",     type: "marketing" },
  { name: "flash_sale_nov",            type: "marketing" },
  { name: "loyalty_statement_monthly", type: "marketing" },
  { name: "otp_login_v4",              type: "authentication" },
  { name: "otp_txn_verify",            type: "authentication" },
  { name: "support_followup",          type: "service" },
];

const WA_STATUS_MIX: { v: WaUsageRow["status"]; w: number }[] = [
  { v: "DELIVERED", w: 44 },
  { v: "READ", w: 32 },
  { v: "REPLIED", w: 6 },
  { v: "FAILED", w: 12 },
  { v: "SENT", w: 6 },
];

const WA_SOURCE_MIX: { v: WaSource; w: number }[] = [
  { v: "Campaign - CSV Based", w: 40 },
  { v: "Campaign - API Based", w: 22 },
  { v: "Template API",          w: 14 },
  { v: "Broadcast",             w: 12 },
  { v: "Clevertap",             w: 7 },
  { v: "Moengage",              w: 5 },
];

/** Illustrative URL CTA buttons on live templates (mirrors analytics-wa.ts). */
const WA_URL_BUTTONS: { label: string; destBase: string }[] = [
  { label: "Complete order",       destBase: "https://acme.example.com/cart/" },
  { label: "View invoice",         destBase: "https://acme.example.com/invoice/" },
  { label: "Track delivery",       destBase: "https://acme.example.com/track/" },
  { label: "Confirm appointment",  destBase: "https://acme.example.com/confirm/" },
  { label: "Apply now",            destBase: "https://acme.example.com/apply/" },
];

export function generateWaUsage(startDate: string, endDate: string): WaUsageRow[] {
  const rows: WaUsageRow[] = [];
  const days = daysInRange(startDate, endDate);
  const wabaId = "WABA_0192837465012";
  const phoneNumberId = "PHN_7749201837";
  for (const day of days) {
    const r = rng(`wa_${day}`);
    const count = Math.round(DAILY_VOLUME.wa * (0.7 + r() * 0.6));
    for (let i = 0; i < count; i++) {
      const t = WA_TEMPLATES[Math.floor(r() * WA_TEMPLATES.length)];
      const rec = pickRecipient(r, true);
      const status = pickWeighted(r, WA_STATUS_MIX);
      const source = pickWeighted(r, WA_SOURCE_MIX);
      const sentMin = 9 * 60 + Math.floor(r() * 11 * 60);
      const sent = isoStamp(day, sentMin);
      const settleLatencyMin = status === "FAILED" ? r() * 0.4 : 1 + r() * 60;
      const lastUpdated = isoStamp(day, sentMin + settleLatencyMin);
      // URL click signal: only on rows that at least reached the recipient
      // (Delivered/Read/Replied). ~55% of templates carry a URL button and
      // of delivered-on-those-templates, ~22% get a tap. Mirrors PICOM-6131.
      const canClick = status === "DELIVERED" || status === "READ" || status === "REPLIED";
      const templateHasUrlButton = r() < 0.55;
      const clickRoll = r();
      const didClick = canClick && templateHasUrlButton && clickRoll < 0.22;
      const button = didClick ? WA_URL_BUTTONS[Math.floor(r() * WA_URL_BUTTONS.length)] : null;
      const slug = Math.floor(r() * 2821109907455).toString(36);
      const clickedUrl = button ? button.destBase + slug : null;
      const clickedUrlLabel = button?.label ?? null;
      const clickLatencyMin = 2 + r() * 40;
      const urlClickedAt = didClick ? isoStamp(day, sentMin + clickLatencyMin) : null;
      rows.push({
        recipient: rec.phone,
        wabaId,
        phoneNumberId,
        country: rec.country,
        messageType: t.type,
        templateName: t.name,
        providerMessageId: wamid(r),
        source,
        status,
        sentAt: sent,
        lastUpdated,
        clickedUrl,
        clickedUrlLabel,
        urlClickedAt,
      });
    }
  }
  return rows;
}

// -----------------------------------------------------------------------------
// SMS generator
// -----------------------------------------------------------------------------

const SMS_TEMPLATES: { name: string; id: string }[] = [
  { name: "sms_order_confirm",   id: "1707169834720192475" },
  { name: "sms_otp_login",       id: "1707169834720188211" },
  { name: "sms_shipment_update", id: "1707169834720193332" },
  { name: "sms_payment_success", id: "1707169834720191884" },
  { name: "sms_cart_recovery",   id: "1707169834720197401" },
];

const SMS_STATUS_MIX: { v: SmsUsageRow["status"]; w: number }[] = [
  { v: "DELIVERED", w: 82 },
  { v: "FAILED", w: 10 },
  { v: "SENT", w: 8 },
];

const SMS_SOURCE_MIX: { v: SmsSource; w: number }[] = [
  { v: "Campaign - CSV Based", w: 45 },
  { v: "Campaign - API Based", w: 24 },
  { v: "Template API",          w: 16 },
  { v: "Broadcast",             w: 10 },
  { v: "Moengage",              w: 5 },
];

export function generateSmsUsage(startDate: string, endDate: string): SmsUsageRow[] {
  const rows: SmsUsageRow[] = [];
  const days = daysInRange(startDate, endDate);
  const senderId = "ACMECO";
  const peId = "1001234567890123456";
  for (const day of days) {
    const r = rng(`sms_${day}`);
    const count = Math.round(DAILY_VOLUME.sms * (0.7 + r() * 0.6));
    for (let i = 0; i < count; i++) {
      const t = SMS_TEMPLATES[Math.floor(r() * SMS_TEMPLATES.length)];
      const rec = pickRecipient(r);
      const status = pickWeighted(r, SMS_STATUS_MIX);
      const source = pickWeighted(r, SMS_SOURCE_MIX);
      const sentMin = 9 * 60 + Math.floor(r() * 11 * 60);
      const sent = isoStamp(day, sentMin);
      const settleLatencyMin = status === "FAILED" ? r() * 0.2 : 0.3 + r() * 15;
      const lastUpdated = isoStamp(day, sentMin + settleLatencyMin);
      // sms_count: 1 for short txns, 2-3 for longer promos
      const smsCount = t.name.includes("otp") || t.name.includes("payment") ? 1 : 1 + Math.floor(r() * 3);
      rows.push({
        recipient: rec.phone,
        senderId,
        peId,
        templateName: t.name,
        templateId: t.id,
        source,
        status,
        sentAt: sent,
        lastUpdated,
        smsCount,
      });
    }
  }
  return rows;
}

// -----------------------------------------------------------------------------
// RCS generator
// -----------------------------------------------------------------------------

const RCS_AGENTS: { name: string; id: string; provider: RcsUsageRow["provider"] }[] = [
  { name: "ACME Shop",      id: "agent_acmeshop_jio",   provider: "JIO" },
  { name: "ACME Shop",      id: "agent_acmeshop_nc",    provider: "NETCORE" },
  { name: "ACME Pay",       id: "agent_acmepay_jio",    provider: "JIO" },
  { name: "ACME Rewards",   id: "agent_acmerew_nc",     provider: "NETCORE" },
];

const RCS_TEMPLATES: { name: string; id: string }[] = [
  { name: "rcs_order_card",       id: "tpl_rcs_order_card" },
  { name: "rcs_shipment_card",    id: "tpl_rcs_shipment_card" },
  { name: "rcs_flashsale_carousel", id: "tpl_rcs_flashsale_car" },
  { name: "rcs_statement_text",   id: "tpl_rcs_statement_text" },
];

const RCS_STATUS_MIX: { v: RcsUsageRow["status"]; w: number }[] = [
  { v: "DELIVERED", w: 46 },
  { v: "READ",      w: 28 },
  { v: "CLICKED",   w: 8 },
  { v: "FAILED",    w: 12 },
  { v: "SENT",      w: 6 },
];

const RCS_SOURCE_MIX: { v: RcsSource; w: number }[] = [
  { v: "Campaign - CSV Based", w: 50 },
  { v: "Campaign - API Based", w: 28 },
  { v: "Template API",          w: 14 },
  { v: "Broadcast",             w: 8 },
];

export function generateRcsUsage(startDate: string, endDate: string): RcsUsageRow[] {
  const rows: RcsUsageRow[] = [];
  const days = daysInRange(startDate, endDate);
  for (const day of days) {
    const r = rng(`rcs_${day}`);
    const count = Math.round(DAILY_VOLUME.rcs * (0.7 + r() * 0.6));
    for (let i = 0; i < count; i++) {
      const a = RCS_AGENTS[Math.floor(r() * RCS_AGENTS.length)];
      const t = RCS_TEMPLATES[Math.floor(r() * RCS_TEMPLATES.length)];
      const rec = pickRecipient(r);
      const status = pickWeighted(r, RCS_STATUS_MIX);
      const source = pickWeighted(r, RCS_SOURCE_MIX);
      const sentMin = 9 * 60 + Math.floor(r() * 11 * 60);
      const sent = isoStamp(day, sentMin);
      const settleLatencyMin = status === "FAILED" ? r() * 0.3 : 0.5 + r() * 40;
      const lastUpdated = isoStamp(day, sentMin + settleLatencyMin);
      rows.push({
        recipient: rec.phone,
        agent: a.name,
        agentId: a.id,
        provider: a.provider,
        templateName: t.name,
        templateId: t.id,
        source,
        status,
        sentAt: sent,
        lastUpdated,
      });
    }
  }
  return rows;
}

// -----------------------------------------------------------------------------
// Voice generator
// -----------------------------------------------------------------------------

const VOICE_SOURCE_MIX: { v: VoiceSource; w: number }[] = [
  { v: "Campaign - CSV Based", w: 55 },
  { v: "Campaign - API Based", w: 25 },
  { v: "Template API",          w: 12 },
  { v: "Broadcast",             w: 8 },
];

const VOICE_CUSTOMERS = [
  "", "Ashwin Rao", "Pooja Shetty", "Rahul Verma", "Sanjana Iyer", "Vishal Pillai",
  "Kavya Nair", "Imran Khan", "Deepa Patel", "", "", "Rohit Das",
];

const VOICE_FAIL_REASONS: { reason: string; side: string }[] = [
  { reason: "NO_ANSWER",   side: "CUSTOMER" },
  { reason: "BUSY",        side: "CUSTOMER" },
  { reason: "VOICEMAIL",   side: "CUSTOMER" },
  { reason: "DISCONNECTED", side: "PROVIDER" },
];

export function generateVoiceUsage(startDate: string, endDate: string): VoiceUsageRow[] {
  const rows: VoiceUsageRow[] = [];
  const days = daysInRange(startDate, endDate);
  for (const day of days) {
    const r = rng(`voice_${day}`);
    const count = Math.round(DAILY_VOLUME.voice * (0.7 + r() * 0.6));
    for (let i = 0; i < count; i++) {
      const rec = pickRecipient(r);
      const source = pickWeighted(r, VOICE_SOURCE_MIX);
      const failed = r() < 0.1;
      const callStatus: VoiceUsageRow["callStatus"] = failed ? "FAILED" : "COMPLETED";
      const scheduledMin = 9 * 60 + Math.floor(r() * 11 * 60);
      const scheduledAt = isoStamp(day, scheduledMin);
      // 10..180s for completed, 0 for failed.
      const durationSec = failed ? 0 : Math.round(10 + r() * 170);
      // updated_at ~= scheduled + duration + some ms settle; keep <= 3 min after schedule.
      const updatedMin = scheduledMin + Math.ceil(durationSec / 60) + (failed ? 1 : 0);
      const updatedAt = isoStamp(day, updatedMin);
      const fail = failed ? VOICE_FAIL_REASONS[Math.floor(r() * VOICE_FAIL_REASONS.length)] : null;
      rows.push({
        scheduledAt,
        phoneNumber: rec.phone,
        customerName: VOICE_CUSTOMERS[Math.floor(r() * VOICE_CUSTOMERS.length)],
        durationSec,
        source,
        callStatus,
        updatedAt,
        failureReason: fail?.reason ?? "",
        failureSide: fail?.side ?? "",
      });
    }
  }
  return rows;
}

// -----------------------------------------------------------------------------
// KPI helpers used by the tab UI
// -----------------------------------------------------------------------------

export type WaKpis = {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  byType: Record<WaMessageType, number>;
  /** Count of outbound messages that received at least one URL tap. */
  urlClicks: number;
};

export function computeWaKpis(rows: WaUsageRow[]): WaKpis {
  const kpi: WaKpis = {
    total: rows.length,
    sent: 0,
    delivered: 0,
    read: 0,
    replied: 0,
    failed: 0,
    byType: { marketing: 0, utility: 0, authentication: 0, service: 0 },
    urlClicks: 0,
  };
  for (const r of rows) {
    if (r.status === "SENT") kpi.sent++;
    else if (r.status === "DELIVERED") kpi.delivered++;
    else if (r.status === "READ") kpi.read++;
    else if (r.status === "REPLIED") kpi.replied++;
    else if (r.status === "FAILED") kpi.failed++;
    kpi.byType[r.messageType]++;
    if (r.urlClickedAt) kpi.urlClicks++;
  }
  return kpi;
}

export type SmsKpis = {
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  smsCountTotal: number;
};

export function computeSmsKpis(rows: SmsUsageRow[]): SmsKpis {
  const kpi: SmsKpis = { total: rows.length, sent: 0, delivered: 0, failed: 0, smsCountTotal: 0 };
  for (const r of rows) {
    if (r.status === "SENT") kpi.sent++;
    else if (r.status === "DELIVERED") kpi.delivered++;
    else if (r.status === "FAILED") kpi.failed++;
    kpi.smsCountTotal += r.smsCount;
  }
  return kpi;
}

export type RcsKpis = {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
  failed: number;
  byProvider: Record<RcsUsageRow["provider"], number>;
};

export function computeRcsKpis(rows: RcsUsageRow[]): RcsKpis {
  const kpi: RcsKpis = {
    total: rows.length,
    sent: 0,
    delivered: 0,
    read: 0,
    clicked: 0,
    failed: 0,
    byProvider: { JIO: 0, NETCORE: 0 },
  };
  for (const r of rows) {
    if (r.status === "SENT") kpi.sent++;
    else if (r.status === "DELIVERED") kpi.delivered++;
    else if (r.status === "READ") kpi.read++;
    else if (r.status === "CLICKED") kpi.clicked++;
    else if (r.status === "FAILED") kpi.failed++;
    kpi.byProvider[r.provider]++;
  }
  return kpi;
}

export type VoiceKpis = {
  total: number;
  completed: number;
  failed: number;
  totalDurationSec: number;
  avgDurationSec: number;
};

export function computeVoiceKpis(rows: VoiceUsageRow[]): VoiceKpis {
  let completed = 0, failed = 0, dur = 0;
  for (const r of rows) {
    if (r.callStatus === "COMPLETED") completed++;
    else failed++;
    dur += r.durationSec;
  }
  return {
    total: rows.length,
    completed,
    failed,
    totalDurationSec: dur,
    avgDurationSec: completed ? Math.round(dur / completed) : 0,
  };
}

// -----------------------------------------------------------------------------
// CSV builders. Phone-carrying columns wrap as ="+91..." so Excel keeps the
// country code. Encoding is UTF-8 with BOM (applied by downloadCsv).
// -----------------------------------------------------------------------------

function toCsv(head: string[], body: (string | number)[][]): string {
  return [head, ...body]
    .map((row) =>
      row
        .map((v) => {
          const s = String(v ?? "");
          if (/^="[^"\n]*"$/.test(s)) return s;
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

export function waUsageToCsv(rows: WaUsageRow[]): string {
  const head = [
    "recipient",
    "waba_id",
    "phone_number_id",
    "country",
    "message_type",
    "template_name",
    "provider_message_id",
    "source",
    "status",
    "sent_at",
    "last_updated",
    // URL click triplet, matches PICOM-6131. Finance uses it for ROI
    // reconciliation; blank for rows without a URL button or without a tap.
    "clicked_url",
    "clicked_url_label",
    "url_clicked_at",
  ];
  const body = rows.map((r) => [
    phoneCsvCell(r.recipient),
    r.wabaId,
    r.phoneNumberId,
    r.country,
    r.messageType,
    r.templateName,
    r.providerMessageId,
    r.source,
    r.status,
    r.sentAt,
    r.lastUpdated,
    r.clickedUrl ?? "",
    r.clickedUrlLabel ?? "",
    r.urlClickedAt ?? "",
  ]);
  return toCsv(head, body);
}

export function smsUsageToCsv(rows: SmsUsageRow[]): string {
  const head = [
    "recipient",
    "sender_id",
    "pe_id",
    "template_name",
    "template_id",
    "source",
    "status",
    "sent_at",
    "last_updated",
    "sms_count",
  ];
  const body = rows.map((r) => [
    phoneCsvCell(r.recipient),
    r.senderId,
    r.peId,
    r.templateName,
    r.templateId,
    r.source,
    r.status,
    r.sentAt,
    r.lastUpdated,
    r.smsCount,
  ]);
  return toCsv(head, body);
}

export function rcsUsageToCsv(rows: RcsUsageRow[]): string {
  const head = [
    "recipient",
    "agent",
    "agent_id",
    "provider",
    "template_name",
    "template_id",
    "source",
    "status",
    "sent_at",
    "last_updated",
  ];
  const body = rows.map((r) => [
    phoneCsvCell(r.recipient),
    r.agent,
    r.agentId,
    r.provider,
    r.templateName,
    r.templateId,
    r.source,
    r.status,
    r.sentAt,
    r.lastUpdated,
  ]);
  return toCsv(head, body);
}

export function voiceUsageToCsv(rows: VoiceUsageRow[]): string {
  const head = [
    "scheduled_at",
    "phone_number",
    "customer_name",
    "duration_sec",
    "source",
    "call_status",
    "updated_at",
    "failure_reason",
    "failure_side",
  ];
  const body = rows.map((r) => [
    r.scheduledAt,
    phoneCsvCell(r.phoneNumber),
    r.customerName,
    r.durationSec,
    r.source,
    r.callStatus,
    r.updatedAt,
    r.failureReason,
    r.failureSide,
  ]);
  return toCsv(head, body);
}

// Explicit no-op to silence an unused-import lint for randomHex while it stays
// available for future id columns. Safe at build time.
export const _unusedRandomHex = randomHex;
