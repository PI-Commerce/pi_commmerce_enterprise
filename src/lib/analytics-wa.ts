/**
 * Per-recipient WhatsApp delivery records for the Channel > WhatsApp analytics
 * view and the DLR CSV export.
 *
 * PICOM-6131 column spec:
 *   Recipient, Lead ID, Run ID, template_name, waba_id, phone_number_id,
 *   provider_message_id, Source, Status, sent_at, delivered_at, read_at,
 *   replied_at, failed_at, Last Updated, error_code, failure_reason.
 *
 * Notes on data sources:
 *   - waba_id, phone_number_id, provider_message_id, per-stage timestamps,
 *     error_code and failure_reason come from Meta's DLR webhook payload.
 *   - template_name joins through the send record (Meta's DLR payload does
 *     not carry it).
 *   - replied_at requires backend stitching with the Incoming Messages
 *     webhook; the DLR event does not carry it. Mocked here for the demo.
 */

import { generateLeads, phoneCsvCell } from "@/lib/analytics-leads";
import type { RunRow, SankeyNode } from "@/lib/analytics-data";
import { resolveWaTemplate } from "@/lib/wa-outputs";
import { getWorkspaceSession } from "@/lib/waba-store";

export type WaStatus = "Sent" | "Delivered" | "Read" | "Replied" | "Failed";

export type WaMessage = {
  id: string;
  /** Recipient MSISDN. */
  phone: string;
  leadId: string;
  runId: string;
  templateName: string;
  wabaId: string;
  phoneNumberId: string;
  providerMessageId: string;
  source: string;
  status: WaStatus;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  repliedAt: string | null;
  failedAt: string | null;
  lastUpdated: string;
  errorCode: string | null;
  failureReason: string | null;
  /** ISO date (YYYY-MM-DD) for date-range filtering. */
  date: string;
};

export type WaRef = { run: RunRow; node: SankeyNode };

/**
 * Meta's canonical error block on failed status: (code, title, error_data.details).
 * We expose code + title as error_code + failure_reason. error_data.details is
 * skipped in v1 per PICOM-6131.
 */
const META_ERRORS: { code: string; title: string; weight: number }[] = [
  { code: "131026", title: "Message undeliverable", weight: 40 },
  { code: "131047", title: "Re-engagement message outside 24h window", weight: 22 },
  { code: "131053", title: "Media download failed", weight: 12 },
  { code: "131051", title: "Unsupported message type", weight: 8 },
  { code: "132012", title: "Parameter format mismatch", weight: 8 },
  { code: "132001", title: "Template does not exist", weight: 6 },
  { code: "133000", title: "Internal error", weight: 4 },
];

const ERROR_TOTAL = META_ERRORS.reduce((s, e) => s + e.weight, 0);

function pickMetaError(r: number): { code: string; title: string } {
  let acc = r * ERROR_TOTAL;
  for (const e of META_ERRORS) {
    acc -= e.weight;
    if (acc <= 0) return { code: e.code, title: e.title };
  }
  return { code: META_ERRORS[0].code, title: META_ERRORS[0].title };
}

const OUTCOME_MIX: { status: WaStatus; p: number }[] = [
  { status: "Read", p: 0.52 },
  { status: "Delivered", p: 0.26 },
  { status: "Replied", p: 0.08 },
  { status: "Failed", p: 0.1 },
  { status: "Sent", p: 0.04 },
];

function pickStatus(r: number): WaStatus {
  let acc = r;
  for (const o of OUTCOME_MIX) {
    acc -= o.p;
    if (acc <= 0) return o.status;
  }
  return "Delivered";
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

/** Mock Meta wamid like the real "wamid.HBgM..." shape, deterministic from the seed. */
function wamid(r: () => number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "wamid.HBgM";
  for (let i = 0; i < 24; i++) out += chars[Math.floor(r() * chars.length)];
  return out;
}

function isoFromMinutes(dateYmd: string, mins: number): string {
  const d = new Date(dateYmd + "T00:00:00+05:30");
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

export function buildWaMessages({ run, node }: WaRef, limit = 120): WaMessage[] {
  const template = resolveWaTemplate(node.config?.waTemplate);
  const session = getWorkspaceSession();
  const wabaId = session?.selectedWabaId ?? "";
  const phoneNumberId = session?.selectedPhoneNumberId ?? "";
  const leads = generateLeads(run).filter((l) => l.stageNodeId === node.id);
  const r = seed(node.id + run.id);

  return leads.slice(0, limit).map((l) => {
    const status = pickStatus(r());
    const sentMin = 9 * 60 + Math.floor(r() * 10 * 60);
    const delLatency = Math.round(2 + r() * 90);
    const readLatency = Math.round(60 + r() * 1200);
    const replyLatency = Math.round(90 + r() * 1800);
    const failLatency = Math.round(1 + r() * 30);

    const sent = isoFromMinutes(l.updatedDate, sentMin);
    const delivered =
      status === "Delivered" || status === "Read" || status === "Replied"
        ? isoFromMinutes(l.updatedDate, sentMin + delLatency / 60)
        : null;
    const read =
      status === "Read" || status === "Replied"
        ? isoFromMinutes(l.updatedDate, sentMin + (delLatency + readLatency) / 60)
        : null;
    const replied =
      status === "Replied"
        ? isoFromMinutes(l.updatedDate, sentMin + (delLatency + replyLatency) / 60)
        : null;
    const failed =
      status === "Failed"
        ? isoFromMinutes(l.updatedDate, sentMin + failLatency / 60)
        : null;
    const err = status === "Failed" ? pickMetaError(r()) : null;

    return {
      id: l.id,
      phone: l.phone,
      leadId: l.id,
      runId: run.id || "",
      templateName: template?.name ?? "",
      wabaId,
      phoneNumberId,
      providerMessageId: wamid(r),
      source: r() < 0.9 ? "Campaign - CSV Based" : "API",
      status,
      sentAt: status === "Failed" ? null : sent,
      deliveredAt: delivered,
      readAt: read,
      repliedAt: replied,
      failedAt: failed,
      lastUpdated: failed ?? replied ?? read ?? delivered ?? sent,
      errorCode: err?.code ?? null,
      failureReason: err?.title ?? null,
      date: l.updatedDate,
    };
  });
}

export function waMessagesToCsv(rows: WaMessage[]): string {
  // Matches PICOM-6131: 17 columns in the agreed order. Prod columns kept
  // name for name; 11 new columns slot in around them.
  const head = [
    "Recipient",
    "Lead ID",
    "Run ID",
    "template_name",
    "waba_id",
    "phone_number_id",
    "provider_message_id",
    "Source",
    "Status",
    "sent_at",
    "delivered_at",
    "read_at",
    "replied_at",
    "failed_at",
    "Last Updated",
    "error_code",
    "failure_reason",
  ];
  const body = rows.map((m) => [
    phoneCsvCell(m.phone),
    m.leadId,
    m.runId,
    m.templateName,
    m.wabaId,
    m.phoneNumberId,
    m.providerMessageId,
    m.source,
    m.status.toUpperCase(),
    m.sentAt ?? "",
    m.deliveredAt ?? "",
    m.readAt ?? "",
    m.repliedAt ?? "",
    m.failedAt ?? "",
    m.lastUpdated,
    m.errorCode ?? "",
    m.failureReason ?? "",
  ]);
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
