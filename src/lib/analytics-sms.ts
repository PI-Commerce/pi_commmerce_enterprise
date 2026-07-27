/**
 * Per-recipient SMS delivery records for the Channel → SMS analytics view.
 *
 * PICOM-4726 §5 requires a per-recipient report carrying recipient number,
 * template name + id, status, sent/delivered/failed timestamps, failure reason
 * and the segment count. Those fields are SMS-only, so this ships a
 * dedicated {@link SmsMessage} record rather than widening the shared
 * {@link file://./analytics-leads.ts} `Lead` type that every channel uses —
 * the same split `VoiceChannelView` already makes with its `Call` type.
 *
 * Deterministic: the same (run, node) always produces the same messages, so
 * navigating away and back doesn't reshuffle the table.
 */
import { SMS_DELIVERY_RATES, type RunRow, type SankeyNode } from "@/lib/analytics-data";

export { SMS_DELIVERY_RATES };
import { generateLeads } from "@/lib/analytics-leads";
import { resolveSmsTemplate } from "@/lib/sms-store";
import { templateSegments, type SmsTemplate } from "@/lib/sms-templates";

export type SmsStatus = "Sent" | "Delivered" | "Failed" | "Timed out";

/**
 * Vendor/operator rejection reasons, weighted by how often they occur in
 * practice — invalid numbers and DND registrations dominate real failure logs.
 */
const FAILURE_REASONS: { reason: string; weight: number }[] = [
  { reason: "Invalid or non-existent number", weight: 34 },
  { reason: "Recipient on DND / NDNC registry", weight: 27 },
  { reason: "Handset unreachable or switched off", weight: 16 },
  { reason: "Operator rejected — template mismatch", weight: 11 },
  { reason: "Sender ID blocked by operator", weight: 7 },
  { reason: "Message expired before delivery", weight: 5 },
];

const REASON_TOTAL = FAILURE_REASONS.reduce((s, r) => s + r.weight, 0);

function pickFailureReason(r: number): string {
  let acc = r * REASON_TOTAL;
  for (const f of FAILURE_REASONS) {
    acc -= f.weight;
    if (acc <= 0) return f.reason;
  }
  return FAILURE_REASONS[0].reason;
}

/**
 * Split a failure total across the reason taxonomy using the canonical weights.
 *
 * Derived from the total rather than counted off the sampled message table: a
 * node whose sample happens to contain two failures would otherwise render a
 * two-bar chart that contradicts the Failed KPI beside it.
 */
export function failureBreakdown(totalFailed: number): { reason: string; count: number }[] {
  return FAILURE_REASONS.map((f) => ({
    reason: f.reason,
    count: Math.round((totalFailed * f.weight) / REASON_TOTAL),
  })).filter((f) => f.count > 0);
}

/** Outcome totals for a given sent volume. `noDlr` absorbs the rounding remainder. */
export function smsOutcomeTotals(sent: number) {
  const delivered = Math.round(sent * SMS_DELIVERY_RATES.delivered);
  const failed = Math.round(sent * SMS_DELIVERY_RATES.failed);
  const noDlr = Math.max(0, sent - delivered - failed);
  return { delivered, failed, noDlr };
}

export type SmsMessage = {
  id: string;
  /** Recipient MSISDN. */
  phone: string;
  customer: string;
  templateName: string;
  templateId: string;
  /** Registered sender (header) and Principal Entity ID — report-only. */
  senderId: string;
  peId: string;
  /** The message body that was sent (the template's registered content). */
  body: string;
  status: SmsStatus;
  /** Display timestamps; null when that transition never happened. */
  sentAt: string;
  deliveredAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  /** Segments consumed by this message — the "SMS count" in §5. Report-only. */
  smsCount: number;
  /** Seconds from submission to delivery receipt; null unless delivered. */
  deliveryLatency: number | null;
  /** ISO date (YYYY-MM-DD) for date-range filtering. */
  date: string;
};

export type SmsRef = { run: RunRow; node: SankeyNode };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-07-24" → "24 Jul 2026". */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS[(m || 1) - 1]} ${y}`;
}

function fmtClock(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const mm = String(Math.floor(totalMinutes) % 60).padStart(2, "0");
  const period = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 || 12;
  return `${h12}:${mm} ${period}`;
}

function seed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967295;
  };
}

/**
 * Delivery-outcome mix. Matches `smsHandleBaseWeight` in analytics-data.ts so the
 * campaign Sankey and this table tell the same story: ~94% delivered, ~4% hard
 * failure, ~2% no DLR — with a small slice still in-flight (Sent).
 */
const OUTCOME_MIX: { status: SmsStatus; p: number }[] = [
  { status: "Delivered", p: 0.925 },
  { status: "Failed", p: 0.04 },
  { status: "Timed out", p: 0.02 },
  { status: "Sent", p: 0.015 },
];

function pickStatus(r: number): SmsStatus {
  let acc = r;
  for (const o of OUTCOME_MIX) {
    acc -= o.p;
    if (acc <= 0) return o.status;
  }
  return "Delivered";
}

/** Per-recipient records for one SMS node in one run. */
export function buildSmsMessages({ run, node }: SmsRef, limit = 120): SmsMessage[] {
  const template = resolveSmsTemplate(node.config?.smsTemplateId);
  const segments = template ? templateSegments(template).segments : 1;
  const leads = generateLeads(run).filter((l) => l.stageNodeId === node.id);
  const r = seed(node.id + run.id);

  return leads.slice(0, limit).map((l) => {
    const status = pickStatus(r());
    // Submission time, then a realistic operator latency on top of it.
    const sentMinutes = 9 * 60 + Math.floor(r() * 10 * 60);
    // Most DLRs land in seconds; a long tail stretches to a couple of minutes.
    const latency = Math.round(2 + r() * r() * 160);
    const delivered = status === "Delivered";
    const failed = status === "Failed";
    // A hard failure usually comes back faster than a successful delivery —
    // the operator rejects rather than attempts.
    const failLatency = Math.round(1 + r() * 25);

    return {
      id: l.id,
      phone: l.phone,
      customer: l.name,
      templateName: template?.name ?? "—",
      templateId: template?.id ?? "—",
      senderId: template?.senderId ?? node.config?.senderId ?? "—",
      peId: template?.peId ?? node.config?.peId ?? "—",
      body: template?.content ?? "—",
      status,
      sentAt: `${fmtDate(l.updatedDate)}, ${fmtClock(sentMinutes)}`,
      deliveredAt: delivered
        ? `${fmtDate(l.updatedDate)}, ${fmtClock(sentMinutes + latency / 60)}`
        : null,
      failedAt: failed
        ? `${fmtDate(l.updatedDate)}, ${fmtClock(sentMinutes + failLatency / 60)}`
        : null,
      failureReason: failed ? pickFailureReason(r()) : null,
      // A hard failure never reached the handset, so it consumes no segments;
      // everything that left the platform consumes its template's segment count.
      smsCount: status === "Failed" ? 0 : segments,
      deliveryLatency: delivered ? latency : null,
      date: l.updatedDate,
    };
  });
}

/** The DLT template configured on a node, if it still resolves in the registry. */
export function templateForNode(node: SankeyNode): SmsTemplate | undefined {
  return resolveSmsTemplate(node.config?.smsTemplateId);
}

export function smsMessagesToCsv(rows: SmsMessage[]): string {
  const head = [
    "recipient",
    "customer",
    "pe_id",
    "sender_id",
    "template_name",
    "template_id",
    "message_body",
    "status",
    "sent_at",
    "delivered_at",
    "failed_at",
    "failure_reason",
    "sms_count",
    "delivery_latency_sec",
  ];
  const body = rows.map((m) => [
    m.phone,
    m.customer,
    m.peId,
    m.senderId,
    m.templateName,
    m.templateId,
    m.body,
    m.status,
    m.sentAt,
    m.deliveredAt ?? "",
    m.failedAt ?? "",
    m.failureReason ?? "",
    m.smsCount,
    m.deliveryLatency ?? "",
  ]);
  return [head, ...body]
    .map((row) =>
      row
        .map((v) => {
          const s = String(v ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}
