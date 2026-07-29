/**
 * Per-recipient RCS delivery records for the Channel → RCS analytics view.
 *
 * RCS (PICOM-4728) carries fields the shared {@link file://./analytics-leads.ts}
 * `Lead` type doesn't — the sending bot + vendor pipeline, the RCS read receipt,
 * and which quick-reply button (if any) the recipient tapped — so this ships a
 * dedicated {@link RcsMessage} record, the same split `SmsChannelView` /
 * `VoiceChannelView` already make with their own row types.
 *
 * Deterministic: the same (run, node) always produces the same messages, so
 * navigating away and back doesn't reshuffle the table.
 */
import { RCS_DELIVERY_RATES, type RunRow, type SankeyNode } from "@/lib/analytics-data";

export { RCS_DELIVERY_RATES };
import { generateLeads } from "@/lib/analytics-leads";
import { getRcsConfig, resolveRcsTemplate } from "@/lib/rcs-store";
import { replyButtons, type RcsTemplate } from "@/lib/rcs-templates";
import { botById } from "@/lib/rcs-config";

export type RcsStatus =
  | "Delivered"
  | "Read"
  | "Replied"
  | "Failed"
  | "Not reachable"
  | "Timed out";

/**
 * RCS delivery-failure taxonomy, weighted by real-world frequency. Distinct
 * from SMS: an RCS send that lands on a non-RCS handset is reported separately
 * as "Not reachable" (the fallback trigger), so the hard-failure reasons here
 * are the ones that occur *after* the handset was confirmed RCS-capable.
 */
const FAILURE_REASONS: { reason: string; weight: number }[] = [
  { reason: "Invalid or non-existent number", weight: 30 },
  { reason: "Message rejected by carrier RBM", weight: 22 },
  { reason: "Handset unreachable or switched off", weight: 18 },
  { reason: "Payload exceeded 250 KB card limit", weight: 12 },
  { reason: "Bot not provisioned for recipient carrier", weight: 10 },
  { reason: "Message expired before delivery", weight: 8 },
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
 * Derived from the total rather than counted off the sampled table, so the
 * chart can never contradict the Failed KPI beside it.
 */
export function rcsFailureBreakdown(
  totalFailed: number,
): { reason: string; count: number }[] {
  return FAILURE_REASONS.map((f) => ({
    reason: f.reason,
    count: Math.round((totalFailed * f.weight) / REASON_TOTAL),
  })).filter((f) => f.count > 0);
}

/**
 * Outcome totals for a given sent volume, from the shared {@link RCS_DELIVERY_RATES}.
 * `delivered` / `failed` / `notReachable` / `timeout` are the four mutually
 * exclusive terminal states and sum to Sent (timeout absorbs the remainder);
 * `read` and `replied` are engagement sub-slices of `delivered`.
 */
export function rcsOutcomeTotals(sent: number) {
  const delivered = Math.round(sent * RCS_DELIVERY_RATES.delivered);
  const read = Math.round(sent * RCS_DELIVERY_RATES.read);
  const replied = Math.round(sent * RCS_DELIVERY_RATES.replied);
  const failed = Math.round(sent * RCS_DELIVERY_RATES.failed);
  const notReachable = Math.round(sent * RCS_DELIVERY_RATES.notReachable);
  const timeout = Math.max(0, sent - delivered - failed - notReachable);
  return { delivered, read, replied, failed, notReachable, timeout };
}

export type RcsMessage = {
  id: string;
  /** Recipient MSISDN. */
  phone: string;
  customer: string;
  templateName: string;
  templateId: string;
  /** Sending RCS bot + the vendor pipeline it routes through — report-only. */
  botName: string;
  vendor: string;
  status: RcsStatus;
  /** For a "Replied" row, the quick-reply button text the recipient tapped
   *  (null when the reply was free-text or the template has no reply buttons). */
  replyButton: string | null;
  /** Lifecycle timestamps; each is null until that transition happens, and they
   *  are cumulative — a Replied row carries all four of sent/delivered/read/
   *  replied, a Read row the first three, and so on. */
  sentAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  repliedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  /** Seconds from submission to delivery receipt; null unless delivered. */
  deliveryLatency: number | null;
  /** ISO date (YYYY-MM-DD) for date-range filtering. */
  date: string;
};

export type RcsRef = { run: RunRow; node: SankeyNode };

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
 * Per-recipient outcome mix. Matches {@link RCS_DELIVERY_RATES} (and therefore
 * `rcsHandleBaseWeight` in analytics-data.ts) so the campaign Sankey and this
 * table tell the same story: most delivered, of which a share is read and a
 * smaller share replies, with hard failure / not-reachable / timeout tails.
 */
const OUTCOME_MIX: { status: RcsStatus; p: number }[] = [
  { status: "Replied", p: RCS_DELIVERY_RATES.replied },
  { status: "Read", p: RCS_DELIVERY_RATES.read - RCS_DELIVERY_RATES.replied },
  {
    status: "Delivered",
    p:
      RCS_DELIVERY_RATES.delivered -
      RCS_DELIVERY_RATES.read,
  },
  { status: "Failed", p: RCS_DELIVERY_RATES.failed },
  { status: "Not reachable", p: RCS_DELIVERY_RATES.notReachable },
  { status: "Timed out", p: RCS_DELIVERY_RATES.timeout },
];

function pickStatus(r: number): RcsStatus {
  let acc = r;
  for (const o of OUTCOME_MIX) {
    acc -= o.p;
    if (acc <= 0) return o.status;
  }
  return "Delivered";
}

/** The RCS template configured on a node, if it still resolves in the registry. */
export function templateForNode(node: SankeyNode): RcsTemplate | undefined {
  return resolveRcsTemplate(node.config?.rcsTemplateId);
}

/** Per-recipient records for one RCS node in one run. */
export function buildRcsMessages({ run, node }: RcsRef, limit = 120): RcsMessage[] {
  const template = resolveRcsTemplate(node.config?.rcsTemplateId);
  const replies = template ? replyButtons(template) : [];
  const bot = botById(getRcsConfig(), template?.botId ?? node.config?.rcsBotId);
  const leads = generateLeads(run).filter((l) => l.stageNodeId === node.id);
  const r = seed(node.id + run.id);

  return leads.slice(0, limit).map((l) => {
    const status = pickStatus(r());
    const reached =
      status === "Delivered" ||
      status === "Read" ||
      status === "Replied";
    const read = status === "Read" || status === "Replied";
    const replied = status === "Replied";
    const failed = status === "Failed";
    // A "Replied" recipient tapped one of the template's quick-reply buttons
    // (when the template has any); free-text replies leave the button blank.
    const replyButton =
      replied && replies.length
        ? replies[Math.floor(r() * replies.length)].text
        : null;

    // Cumulative lifecycle offsets, in minutes from midnight. Each transition
    // stacks a realistic gap on the previous one, so delivered < read < replied.
    const sentMin = 9 * 60 + Math.floor(r() * 10 * 60);
    const deliverySec = Math.round(2 + r() * r() * 140);
    const deliveredMin = sentMin + deliverySec / 60;
    const readMin = deliveredMin + (30 + r() * 90) / 60;
    const repliedMin = readMin + (20 + r() * 150) / 60;
    // A rejection usually comes back faster than a real delivery.
    const failedMin = sentMin + Math.round(1 + r() * 22) / 60;
    const stamp = (min: number) => `${fmtDate(l.updatedDate)}, ${fmtClock(min)}`;

    return {
      id: l.id,
      phone: l.phone,
      customer: l.name,
      templateName: template?.name ?? "—",
      templateId: template?.id ?? "—",
      botName: bot?.name ?? node.config?.rcsBotId ?? "—",
      vendor: bot?.vendor ?? "—",
      status,
      replyButton,
      sentAt: stamp(sentMin),
      deliveredAt: reached ? stamp(deliveredMin) : null,
      readAt: read ? stamp(readMin) : null,
      repliedAt: replied ? stamp(repliedMin) : null,
      failedAt: failed ? stamp(failedMin) : null,
      failureReason: failed ? pickFailureReason(r()) : null,
      deliveryLatency: reached ? deliverySec : null,
      date: l.updatedDate,
    };
  });
}

export function rcsMessagesToCsv(rows: RcsMessage[]): string {
  const head = [
    "recipient",
    "customer",
    "bot",
    "vendor",
    "template_name",
    "template_id",
    "status",
    "reply_button",
    "sent_at",
    "delivered_at",
    "read_at",
    "replied_at",
    "failed_at",
    "failure_reason",
    "delivery_latency_sec",
  ];
  const body = rows.map((m) => [
    m.phone,
    m.customer,
    m.botName,
    m.vendor,
    m.templateName,
    m.templateId,
    m.status,
    m.replyButton ?? "",
    m.sentAt,
    m.deliveredAt ?? "",
    m.readAt ?? "",
    m.repliedAt ?? "",
    m.failedAt ?? "",
    m.failureReason ?? "",
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
