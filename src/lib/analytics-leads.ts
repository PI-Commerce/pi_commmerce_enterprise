/** Deterministic lead-level mock data for analytics drill-downs.
 *  Same seed (run.id) always produces the same leads, so navigation feels stable.
 */
import type {
  ChannelKind,
  RunRow,
  SankeyNode,
  SankeyNodeKind,
} from "@/lib/analytics-data";

export type LeadStatus =
  | "sent"
  | "delivered"
  | "read"
  | "clicked"
  | "replied"
  | "converted"
  | "running"
  | "completed"
  | "failed"
  | "dropped"
  | "pending"
  /** SMS/RCS: the wait window closed without a delivery receipt. */
  | "no_dlr";

/**
 * Journey status for the Campaign Lead report (PICOM-6134). Answers the
 * overall "where is this lead in the workflow?" question, distinct from the
 * per-node node_status that answers "what happened at the current node?".
 *
 *   not_started - payload not shape-checked yet (we never see this in mock data).
 *   entered     - queued, has not moved past Start.
 *   in_progress - somewhere in the DAG.
 *   failed      - hit a terminal failure.
 *   completed   - reached End by whichever path.
 *
 * After failed or completed the lead will not run again.
 */
export type JourneyStatus =
  | "not_started"
  | "entered"
  | "in_progress"
  | "failed"
  | "completed";

/**
 * Derive journey_status from the lead's current node kind and local status.
 * Mirrors the recommendation in PICOM-6134; dev may adopt or substitute.
 */
export function deriveJourneyStatus(
  nodeKind: SankeyNodeKind,
  status: LeadStatus | undefined,
): JourneyStatus {
  if (nodeKind === "start") return "entered";
  if (nodeKind === "end") return "completed";
  if (status === "failed" || status === "dropped") return "failed";
  if (status === "completed" || status === "converted") return "completed";
  return "in_progress";
}

export type Lead = {
  id: string;
  name: string;
  phone: string;
  email: string;
  stageNodeId: string; // current node id in the DAG
  stageLabel: string; // human label of that node, prefixed with run serial
  channel?: ChannelKind;
  status?: LeadStatus; // only action/channel nodes carry a status; blank otherwise
  cost: number;
  duration?: number; // voice call seconds
  updatedAt: string;
  updatedDate: string; // ISO YYYY-MM-DD, used by Date Range filter
};

const FIRST = [
  "Arjun",
  "Priya",
  "Rahul",
  "Anita",
  "Vikram",
  "Sneha",
  "Karan",
  "Meera",
  "Rohan",
  "Divya",
  "Aditya",
  "Pooja",
  "Sanjay",
  "Neha",
  "Ishan",
  "Tara",
  "Manish",
  "Ritu",
  "Aman",
  "Kavya",
  "Yash",
  "Simran",
  "Nikhil",
  "Anjali",
];
const LAST = [
  "Sharma",
  "Patel",
  "Kumar",
  "Reddy",
  "Iyer",
  "Khan",
  "Singh",
  "Gupta",
  "Mehta",
  "Joshi",
  "Nair",
  "Das",
  "Verma",
  "Bose",
  "Rao",
  "Pillai",
  "Banerjee",
  "Kapoor",
  "Malhotra",
];

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++)
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967295;
  };
}

// Only action/channel nodes carry a status. A lead sitting on a structural node
// "just moves forward", so it renders blank (empty array → undefined status).
const STATUS_BY_KIND: Record<SankeyNodeKind, LeadStatus[]> = {
  start: [],
  audience: [],
  apiToolCall: [],
  abSplit: [],
  conditional: [],
  delay: [],
  // Aligned to the Meta delivery callback set (clicked/replied are interaction
  // events, not delivery statuses, so they're excluded here).
  whatsapp: ["sent", "delivered", "read", "failed"],
  // Freeform Workflow lifecycle: the lead is either inside an active session,
  // finished it (completed), let it time out, or hit an error mid-session.
  whatsappFreeform: ["running", "completed", "failed"],
  // Dev team's current voice-call lifecycle statuses.
  voice: ["pending", "running", "completed", "failed"],
  // AI Chat lifecycle: a lead is running while the conversation is open, has
  // replied once the customer engages, completed on a disposition close, failed
  // when the Agentic handover breaks.
  chat: ["running", "replied", "completed", "failed"],
  // Aligned to the SMS node's three delivery outcomes, plus the transient
  // `sent` state a lead occupies while the DLR window is still open.
  sms: ["sent", "delivered", "failed", "no_dlr"],
  // RCS: the node's delivery outcomes — delivered / read (RCS read receipt) /
  // failed (folds in handsets that aren't RCS-capable) / timeout.
  rcs: ["delivered", "read", "failed", "no_dlr"],
  ads: ["clicked", "delivered"],
  aiTransform: [],
  end: [],
  // Terminal — a lead sitting on this node "just moves forward" analytically,
  // even though semantically it's been flagged for human review.
  needsReview: [],
};

const CHANNEL_BY_KIND: Partial<Record<SankeyNodeKind, ChannelKind>> = {
  whatsapp: "whatsapp",
  voice: "voice",
  sms: "sms",
  rcs: "rcs",
  ads: "ads",
};

/**
 * Stage label shown in the Leads table. Prefer the node's per-kind serial +
 * description (`whatsapp_2 • Renewal`, the live builder's identity scheme); fall
 * back to the legacy positional `<n> · <name>` for nodes lacking a serial.
 */
export function stageLabelFor(
  node: SankeyNode,
  serialById: Map<string, number>,
): string {
  if (node.serial)
    return node.description
      ? `${node.serial} • ${node.description}`
      : node.serial;
  return `${serialById.get(node.id) ?? "?"} · ${node.name.split(" · ")[0]}`;
}

/** Generate leads weighted by each node's `entered` count.  */
export function generateLeads(run: RunRow, total = 3990): Lead[] {
  const rand = rng(run.id || "default_run");
  const nodes = run.sankey.nodes;
  // Serial = the node's position in the run's authored flow order (Start = 1),
  // so "<serial> · <name>" unambiguously identifies the exact node.
  const serialById = new Map(nodes.map((n, i) => [n.id, i + 1]));
  // weight = entered, but downweight pipe/system nodes
  const weighted: { node: SankeyNode; w: number }[] = nodes.map((n) => ({
    node: n,
    w: ["start", "audience", "abSplit", "delay", "conditional"].includes(n.kind)
      ? n.entered * 0.05
      : n.entered,
  }));
  const sumW = weighted.reduce((s, x) => s + x.w, 0);

  const leads: Lead[] = [];
  for (let i = 0; i < total; i++) {
    // pick a node by weight
    let r = rand() * sumW,
      pick = weighted[0].node;
    for (const w of weighted) {
      r -= w.w;
      if (r <= 0) {
        pick = w.node;
        break;
      }
    }
    const statuses = STATUS_BY_KIND[pick.kind];
    const status = statuses.length
      ? statuses[Math.floor(rand() * statuses.length)]
      : undefined;
    const first = FIRST[Math.floor(rand() * FIRST.length)];
    const last = LAST[Math.floor(rand() * LAST.length)];
    const phone = `+91 9${Math.floor(100000000 + rand() * 899999999)}`;
    leads.push({
      id: `L-${String(10000 + i).padStart(5, "0")}`,
      name: `${first} ${last}`,
      phone,
      email: `${first}.${last}@example.com`.toLowerCase(),
      stageNodeId: pick.id,
      stageLabel: stageLabelFor(pick, serialById),
      channel: CHANNEL_BY_KIND[pick.kind],
      status,
      cost: +(rand() * 0.18 + 0.02).toFixed(3),
      duration:
        pick.kind === "voice" ? Math.floor(20 + rand() * 240) : undefined,
      updatedAt: (() => {
        const h24 = Math.floor(rand() * 23);
        const m = String(Math.floor(rand() * 59)).padStart(2, "0");
        const period = h24 >= 12 ? "pm" : "am";
        const h12 = h24 % 12 || 12;
        return `${h12}:${m} ${period}`;
      })(),
      updatedDate: (() => {
        // Spread leads deterministically across the last 30 days.
        const daysAgo = Math.floor(rand() * 30);
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - daysAgo);
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, "0");
        const da = String(d.getDate()).padStart(2, "0");
        return `${y}-${mo}-${da}`;
      })(),
    });
  }
  return leads;
}

/**
 * Campaign Lead report CSV (PICOM-6134). Fourteen columns, prod names kept
 * name for name, with campaign + run metadata, journey_status and
 * entered_at / exited_at added.
 *
 * Expects the caller to pass campaign + run context since Lead objects
 * carry only node-level info. node_kind is used to derive journey_status.
 */
export function campaignLeadsToCsv(
  leads: Lead[],
  ctx: {
    campaignId: string;
    campaignName: string;
    campaignVersion: string;
    runId: string;
    runType: "Always-on" | "Time-Scoped";
    runStartedAt: string;
    nodeKindById: Map<string, SankeyNodeKind>;
  },
): string {
  const head = [
    "phone",
    "lead_id",
    "campaign_id",
    "campaign_name",
    "campaign_version",
    "run_id",
    "run_type",
    "run_started_at",
    "journey_status",
    "entered_at",
    "exited_at",
    "current_node_label",
    "node_status",
    "last_updated",
  ];
  const rows = leads.map((l) => {
    const kind = ctx.nodeKindById.get(l.stageNodeId);
    const journey = kind ? deriveJourneyStatus(kind, l.status) : "in_progress";
    const enteredAt = `${l.updatedDate}T09:00:00+05:30`;
    const exitedAt = journey === "failed" || journey === "completed"
      ? `${l.updatedDate}T18:00:00+05:30`
      : "";
    return [
      phoneCsvCell(l.phone),
      l.id,
      ctx.campaignId,
      ctx.campaignName,
      ctx.campaignVersion,
      ctx.runId,
      ctx.runType,
      ctx.runStartedAt,
      journey,
      enteredAt,
      exitedAt,
      l.stageLabel,
      l.status ?? "",
      l.updatedAt,
    ];
  });
  return [head, ...rows]
    .map((r) =>
      r
        .map((v) => {
          const s = String(v ?? "");
          if (/^="[^"\n]*"$/.test(s)) return s;
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

export function leadsToCsv(leads: Lead[]): string {
  const head = [
    "lead_id",
    "name",
    "phone",
    "email",
    "stage",
    "channel",
    "status",
    "duration_sec",
    "cost_usd",
    "updated_date",
    "updated_at",
  ];
  const rows = leads.map((l) => [
    l.id,
    l.name,
    phoneCsvCell(l.phone),
    l.email,
    l.stageLabel,
    l.channel ?? "",
    l.status ?? "",
    l.duration ?? "",
    l.cost,
    l.updatedDate,
    l.updatedAt,
  ]);
  return [head, ...rows]
    .map((r) =>
      r
        .map((v) => {
          const s = String(v ?? "");
          // Preserve pre-formatted CSV literals like ="+91..." from phoneCsvCell.
          if (/^="[^"\n]*"$/.test(s)) return s;
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

/**
 * Wraps phone-like values as ="+91..." so Excel does not strip the leading `+`
 * or interpret the value as scientific notation. Google Sheets handles this too.
 * Use this at the call site for any column that carries an MSISDN.
 */
export function phoneCsvCell(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  // Escape any existing double quotes, then wrap.
  return `="${s.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, csv: string) {
  // Prepend UTF-8 BOM so Excel opens non-Latin characters correctly.
  const BOM = "﻿";
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
