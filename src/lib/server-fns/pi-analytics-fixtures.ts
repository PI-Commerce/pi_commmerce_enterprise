/**
 * Fixture-backed fallback for the Ask Pi analytics tools.
 *
 * When D1 isn't bound (typical for local dev), the /analytics page still
 * renders numbers from the CAMPAIGNS fixture in `analytics-data.ts`. Pi's
 * tools must return the SAME numbers the user sees on screen, otherwise the
 * demo looks broken.
 *
 * Two rules we mirror from the UI:
 *   1. Top-line KPIs (Total / Eligible / Completed leads) come from
 *      `run.kpi.{totalLeads, validLeads, leadsProcessed}` — NOT from summing
 *      per-channel sankey `entered` (that double-counts leads that touch
 *      multiple channels).
 *   2. Date-range scaling: when the range is <30 days, every count is scaled
 *      by `days/30`. Matches `scaleRunToRange`'s synthetic-ratio fallback.
 */
import { CAMPAIGNS, type RunRow, type SankeyNode, type SankeyNodeKind } from "@/lib/analytics-data";
import type { PresetConfig } from "@/lib/campaign-types";

const CHANNEL_KINDS: readonly SankeyNodeKind[] = ["whatsapp", "voice", "sms", "rcs"] as const;

/** Kinds accepted by the `read_asset` tool — kept as a local literal
 *  union so this fixture module doesn't have to pull in pi-skills. If a
 *  new AssetKind is added there, mirror it here. */
type AssetKind = "voiceAgent" | "waTemplate" | "smsTemplate" | "rcsTemplate" | "freeformWorkflow" | "tool";
type NodeAssetRef = { kind: AssetKind; id: string };

/** Pull the concrete asset refs off a sankey node's saved config so Pi
 *  can chain `read_campaign` → `read_asset` without guessing at ids.
 *  The `PresetConfig` field for each node kind holds the same id the
 *  workspace catalog is keyed on. */
function extractNodeAssets(kind: SankeyNodeKind, config?: PresetConfig): NodeAssetRef[] {
  if (!config) return [];
  switch (kind) {
    case "voice":
      return config.agent ? [{ kind: "voiceAgent", id: config.agent }] : [];
    case "whatsapp":
      return config.waTemplate ? [{ kind: "waTemplate", id: config.waTemplate }] : [];
    case "whatsappFreeform":
      return config.ffWorkflowId ? [{ kind: "freeformWorkflow", id: config.ffWorkflowId }] : [];
    case "sms":
      return config.smsTemplateId ? [{ kind: "smsTemplate", id: config.smsTemplateId }] : [];
    case "rcs":
      return config.rcsTemplateId ? [{ kind: "rcsTemplate", id: config.rcsTemplateId }] : [];
    case "apiToolCall":
      return config.apiTool ? [{ kind: "tool", id: config.apiTool }] : [];
    default:
      return [];
  }
}

/** Public shape returned by `fxReadCampaign` for each node. Exported so
 *  future D1-backed dispatch (in runtool.ts) can mirror the same shape. */
function nodeSummary(n: SankeyNode) {
  return {
    id: n.id,
    serial: n.serial,
    description: n.description,
    kind: n.kind,
    name: n.name,
    entered: n.entered,
    exited: n.exited,
    /** Asset refs Pi can feed straight into `read_asset({ kind, id })`.
     *  Empty for structural nodes (start/end/audience/conditional/…) and
     *  for channel nodes that haven't been bound to a specific asset yet. */
    assets: extractNodeAssets(n.kind, n.config),
  };
}

type F = {
  campaignId?: string;
  runId?: string;
  channel?: string;
  stageNodeId?: string;
  status?: string;
  from?: string;
  to?: string;
};

/* -------------------------------------------------------------------------- */
/* Selection + scaling helpers                                                 */
/* -------------------------------------------------------------------------- */

function pickCampaigns(f: F) {
  if (f.campaignId) {
    const c = CAMPAIGNS.find((c) => c.id === f.campaignId);
    return c ? [c] : [];
  }
  return CAMPAIGNS;
}

function pickRuns(f: F) {
  const cs = pickCampaigns(f);
  const runs: Array<{ campaignId: string; campaignName: string; run: RunRow }> = [];
  for (const c of cs) {
    for (const r of c.runs) {
      if (f.runId && r.id !== f.runId) continue;
      runs.push({ campaignId: c.id, campaignName: c.name, run: r });
    }
  }
  return runs;
}

/** Days in an ISO range (inclusive). Mirrors DateRangePicker.rangeDays —
 *  BOTH bounds at midnight, then round + 1. Using T23:59:59Z on `to` inflates
 *  the delta by ~1 day and breaks parity with the on-screen KPIs. */
function daysInRange(from?: string, to?: string): number | null {
  if (!from || !to) return null;
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  if (!isFinite(a) || !isFinite(b) || b < a) return null;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/** Same synthetic ratio the UI uses when D1 isn't bound: days/30, clamped. */
function rangeRatio(from?: string, to?: string): number {
  const d = daysInRange(from, to);
  if (d == null || d >= 30) return 1;
  return Math.max(0.05, Math.min(1, d / 30));
}

const scale = (n: number, ratio: number) => Math.max(0, Math.round(n * ratio));

/** Scale a run's KPIs + sankey by the same rule scaleRunToRange uses. */
function scaledRun(r: RunRow, ratio: number): RunRow {
  if (ratio >= 1) return r;
  return {
    ...r,
    totalLeads: scale(r.totalLeads, ratio),
    leadsProcessed: scale(r.leadsProcessed, ratio),
    audience: scale(r.audience, ratio),
    kpi: {
      totalLeads: scale(r.kpi.totalLeads, ratio),
      validLeads: scale(r.kpi.validLeads, ratio),
      leadsProcessed: scale(r.kpi.leadsProcessed, ratio),
      successRate: r.kpi.successRate,
    },
    sankey: {
      nodes: r.sankey.nodes.map((n) => ({ ...n, entered: scale(n.entered, ratio), exited: scale(n.exited, ratio) })),
      edges: r.sankey.edges.map((e) => ({ ...e, value: scale(e.value, ratio) })),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Tool implementations (fixture)                                              */
/* -------------------------------------------------------------------------- */

export function fxSummary(f: F) {
  const ratio = rangeRatio(f.from, f.to);
  const scaled = pickRuns(f).map(({ campaignId, campaignName, run }) => ({
    campaignId, campaignName, run: scaledRun(run, ratio),
  }));

  // Top-line lead KPIs: sum across the picked runs, using the SAME fields the
  // UI displays. NEVER sum channel-node entered here — that double-counts.
  const totalLeads     = scaled.reduce((s, x) => s + x.run.kpi.totalLeads, 0);
  const eligibleLeads  = scaled.reduce((s, x) => s + x.run.kpi.validLeads, 0);
  const completedLeads = scaled.reduce((s, x) => s + x.run.kpi.leadsProcessed, 0);
  const failedLeads    = Math.max(0, eligibleLeads - completedLeads);

  // Per-channel touchpoint counts (sends), aggregated from sankey channel nodes.
  // Labelled `sent` so Pi doesn't confuse them with unique leads.
  const perChannel = new Map<string, { sent: number; delivered: number; converted: number }>();
  for (const { run } of scaled) {
    for (const n of run.sankey.nodes) {
      if (!CHANNEL_KINDS.includes(n.kind)) continue;
      if (f.channel && n.kind !== f.channel) continue;
      const cur = perChannel.get(n.kind) ?? { sent: 0, delivered: 0, converted: 0 };
      cur.sent += n.entered;
      cur.delivered += Math.round(n.entered * 0.94);
      cur.converted += n.exited;
      perChannel.set(n.kind, cur);
    }
  }
  const byChannel = Array.from(perChannel, ([channel, v]) => ({
    channel, sent: v.sent, delivered: v.delivered, converted: v.converted,
  })).sort((a, b) => b.sent - a.sent);

  // Approximate status split from the top-line leads.
  const byStatus = [
    { status: "completed", count: completedLeads },
    { status: "delivered_not_completed", count: Math.max(0, eligibleLeads - completedLeads - failedLeads) },
    { status: "failed", count: failedLeads },
    { status: "ineligible", count: Math.max(0, totalLeads - eligibleLeads) },
  ].filter((r) => r.count > 0);

  // Funnel over eligible leads (approximate). NOT channel-touchpoint sums.
  const funnel = {
    sent:      eligibleLeads,
    delivered: Math.round(eligibleLeads * 0.94),
    read:      Math.round(eligibleLeads * 0.68),
    clicked:   Math.round(eligibleLeads * 0.22),
    replied:   Math.round(eligibleLeads * 0.15),
    converted: completedLeads,
    failed:    failedLeads,
  };

  return {
    scope: {
      campaignId: f.campaignId,
      runId: f.runId,
      channel: f.channel,
      from: f.from,
      to: f.to,
      scaledBy: ratio < 1 ? Number(ratio.toFixed(3)) : 1,
    },
    // The three KPIs shown on the /analytics screen — cite these when the
    // user asks about "leads eligible", "total leads", "completed".
    totalLeads,
    eligibleLeads,
    completedLeads,
    failedLeads,
    byStatus,
    byChannel,
    funnel,
  };
}

export function fxCountLeads(f: F): number {
  // "leads" = unique audience under the filter. Use kpi.totalLeads sum.
  const ratio = rangeRatio(f.from, f.to);
  const runs = pickRuns(f);
  if (f.channel || f.stageNodeId) {
    // Narrowing by channel/node — return the channel node's scaled entered.
    let total = 0;
    for (const { run } of runs) {
      for (const n of run.sankey.nodes) {
        if (!CHANNEL_KINDS.includes(n.kind)) continue;
        if (f.channel && n.kind !== f.channel) continue;
        if (f.stageNodeId && n.id !== f.stageNodeId) continue;
        total += scale(n.entered, ratio);
      }
    }
    return total;
  }
  return runs.reduce((s, { run }) => s + scale(run.kpi.totalLeads, ratio), 0);
}

export function fxStatusBreakdown(f: F) {
  return fxSummary(f).byStatus;
}

export function fxWorstDropoffs(runId: string, limit = 5) {
  const rows = pickRuns({ runId }).flatMap(({ run }) =>
    run.sankey.nodes
      .filter((n) => n.entered > 0)
      .map((n) => ({
        nodeId: n.id,
        nodeName: n.name,
        nodeKind: n.kind,
        entered: n.entered,
        exited: n.exited,
        dropPct: n.entered > 0 ? Number((1 - n.exited / n.entered).toFixed(4)) : 0,
      })),
  );
  return rows.sort((a, b) => b.dropPct - a.dropPct).slice(0, limit);
}

export function fxCompareChannels(f: F) {
  const s = fxSummary({ ...f, channel: undefined });
  return s.byChannel.map((c) => ({
    channel: c.channel,
    sent: c.sent,
    delivered: c.delivered,
    converted: c.converted,
    convRate: c.sent > 0 ? Number((c.converted / c.sent).toFixed(4)) : 0,
  }));
}

export function fxCompareRuns(runIdA: string, runIdB: string) {
  const a = fxSummary({ runId: runIdA });
  const b = fxSummary({ runId: runIdB });
  return {
    a,
    b,
    delta: {
      totalLeads: b.totalLeads - a.totalLeads,
      eligibleLeads: b.eligibleLeads - a.eligibleLeads,
      completedLeads: b.completedLeads - a.completedLeads,
    },
  };
}

export function fxLatestRuns(limit = 10) {
  const rows = CAMPAIGNS.flatMap((c) =>
    c.runs.map((r) => ({
      id: r.id,
      campaignId: c.id,
      campaignName: c.name,
      status: r.status,
      runType: r.runType,
      startedAt: Date.parse(r.startedAt) || Date.now(),
      totalLeads: r.kpi.totalLeads,
      eligibleLeads: r.kpi.validLeads,
      completedLeads: r.kpi.leadsProcessed,
    })),
  );
  return rows.sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
}

export function fxListCampaigns() {
  return CAMPAIGNS.map((c) => ({
    id: c.id,
    name: c.name,
    vertical: c.name.split(" · ")[0] ?? "",
    status: c.runs[0]?.status ?? "unknown",
    runCount: c.runs.length,
  }));
}

export function fxReadCampaign(id: string) {
  const c = CAMPAIGNS.find((x) => x.id === id);
  if (!c) return { error: "not_found" };
  return {
    id: c.id,
    name: c.name,
    runs: c.runs.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      kpi: r.kpi,
      // Nodes carry an `assets` array of {kind,id} refs — the ids resolve
      // directly against `read_asset`, so Pi can go from a node in the
      // flow to the voice-agent script / template body / tool spec that
      // drove its numbers, without a handoff to /agents or /channels.
      nodes: r.sankey.nodes.map(nodeSummary),
    })),
  };
}

/**
 * Voice intent distribution — matches the /analytics Voice tab's "Intent
 * distribution" chart. Intent taxonomy is illustrative (per the UI it comes
 * from the selected agent's post-call schema); we return the same 8 labels
 * with a stable per-run distribution normalized to the run's completed
 * voice-call volume.
 */
const VOICE_INTENTS = [
  "No Credit Card Added",
  "Using a Different App",
  "Not Interested",
  "Interested & Ready",
  "Faced Technical Issue",
  "Don't Know How to Use",
  "Forgot About App",
  "Charges are High",
] as const;

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function fxVoiceIntentDistribution(f: F) {
  const ratio = rangeRatio(f.from, f.to);
  const runs = pickRuns(f);
  // Total completed voice calls under scope = sum of voice-node exited (scaled).
  let completed = 0;
  for (const { run } of runs) {
    for (const n of run.sankey.nodes) {
      if (n.kind !== "voice") continue;
      completed += scale(n.exited, ratio);
    }
  }
  if (completed === 0) return { intents: [], totalCompleted: 0 };

  // Deterministic per-run weights so numbers are stable across calls.
  const salt = (f.runId ?? f.campaignId ?? "workspace") + "|voice-intent";
  const weights = VOICE_INTENTS.map((_, i) => {
    // Top intent gets a heavier baseline, tail intents get lighter.
    const base = i === 0 ? 22 : i === 1 ? 14 : i < 4 ? 12 : 10;
    const wobble = ((hashStr(salt + ":" + i) % 40) - 20) / 100; // ±20%
    return Math.max(1, base * (1 + wobble));
  });
  const wSum = weights.reduce((s, w) => s + w, 0);
  const raw = weights.map((w) => (w / wSum) * completed);
  // Round with residual to preserve total exactly.
  const rounded = raw.map((v) => Math.floor(v));
  let leftover = completed - rounded.reduce((s, v) => s + v, 0);
  for (let i = 0; leftover > 0 && i < rounded.length; i++) { rounded[i]++; leftover--; }

  const intents = VOICE_INTENTS.map((intent, i) => ({
    intent,
    count: rounded[i],
    pct: completed > 0 ? Number(((rounded[i] / completed) * 100).toFixed(1)) : 0,
  })).sort((a, b) => b.count - a.count);

  return {
    totalCompleted: completed,
    scope: { campaignId: f.campaignId, runId: f.runId, from: f.from, to: f.to, scaledBy: ratio < 1 ? Number(ratio.toFixed(3)) : 1 },
    intents,
    note: "Intent taxonomy is agent-defined; these labels are illustrative and match the UI's Voice tab.",
  };
}

/**
 * Synthesize a daily time-series over a range. Fixtures don't carry per-day
 * counts, so we spread the metric total across the range with a weekday
 * weight. Approximation — shape-realistic, adequate for trend visualization.
 */
export function fxTimeSeries(args: { metric: string; from: string; to: string; campaignId?: string; channel?: string }) {
  const summary = fxSummary({ campaignId: args.campaignId, channel: args.channel, from: args.from, to: args.to });
  const total = (() => {
    switch (args.metric) {
      case "leads":     return summary.totalLeads;
      case "converted": return summary.completedLeads;
      case "failed":    return summary.failedLeads;
      case "delivered":
      case "read":
      case "clicked":
      case "replied":
        return (summary.funnel as Record<string, number>)[args.metric] ?? 0;
      default: return 0;
    }
  })();
  const start = Date.parse(args.from + "T00:00:00Z");
  const end = Date.parse(args.to + "T23:59:59Z");
  if (!isFinite(start) || !isFinite(end) || end < start) return [];
  const dayMs = 86_400_000;
  const days = Math.max(1, Math.round((end - start) / dayMs) + 1);
  const weights: number[] = [];
  let wSum = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(start + i * dayMs);
    const dow = d.getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 0.6 : 1.0;
    const noise = 0.85 + ((i * 37) % 100) / 333;
    const w = weekend * noise;
    weights.push(w);
    wSum += w;
  }
  return weights.map((w, i) => {
    const d = new Date(start + i * dayMs);
    const iso = d.toISOString().slice(0, 10);
    return { date: iso, count: Math.round((w / wSum) * total) };
  });
}
