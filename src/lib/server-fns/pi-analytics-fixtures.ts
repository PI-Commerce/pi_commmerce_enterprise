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
import {
  CAMPAIGNS,
  RCS_DELIVERY_RATES,
  SMS_DELIVERY_RATES,
  type RunRow,
  type SankeyNode,
  type SankeyNodeKind,
} from "@/lib/analytics-data";
import type { PresetConfig } from "@/lib/campaign-types";
import { getDb } from "@/lib/db/client";

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

/** Screen context can inject a list of resolved (campaign, run, node) refs.
 *  When present the fx functions sum over exactly those refs (matching the
 *  KPI cards' per-ref math); when absent they fall back to their filter-
 *  driven pickRuns / pickCampaigns behavior. */
export type ResolvedRefLite = { campaignId: string; runId: string; nodeId: string };

/** Group resolved refs by run so we can iterate {campaignId, campaignName,
 *  run, nodeIds} for asset-mode fixture math. Runs that don't resolve in
 *  CAMPAIGNS are silently dropped. */
function groupResolvedRefs(refs: ResolvedRefLite[]) {
  const runMap = new Map<string, { campaignId: string; campaignName: string; run: RunRow; nodeIds: Set<string> }>();
  for (const r of refs) {
    const c = CAMPAIGNS.find((x) => x.id === r.campaignId);
    if (!c) continue;
    const run = c.runs.find((x) => x.id === r.runId);
    if (!run) continue;
    const key = `${r.campaignId}|${r.runId}`;
    const existing = runMap.get(key);
    if (existing) existing.nodeIds.add(r.nodeId);
    else runMap.set(key, { campaignId: c.id, campaignName: c.name, run, nodeIds: new Set([r.nodeId]) });
  }
  return [...runMap.values()];
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

/**
 * D1-derived range ratio — mirrors `useD1RangeRatio` on the client. Runs two
 * COUNT queries (scoped vs base) against the leads table and returns
 * `scoped/base`. Returns `null` when D1 isn't bound, when either query fails,
 * or when the base count is zero — the caller then falls back to `rangeRatio`.
 *
 * This is the whole reason Pi's numbers used to disagree with the KPI cards:
 * the UI scales fixture KPIs by THIS ratio (real D1 fraction), but the
 * fixture-only path scaled by `days/30`. For runs where actual D1 data doesn't
 * distribute evenly across the seeded 30-day window, the two disagree by 2×+.
 */
async function d1RangeRatio(f: F): Promise<number | null> {
  if (!f.from || !f.to) return null;
  let db;
  try { db = getDb(); } catch { return null; }
  try {
    const scopedWhere = buildLeadsWhere(f);
    const baseWhere = buildLeadsWhere({ ...f, from: undefined, to: undefined });
    const scoped = await db
      .prepare(`SELECT COUNT(*) AS c FROM leads ${scopedWhere.where}`)
      .bind(...scopedWhere.binds)
      .first<{ c: number }>();
    const base = await db
      .prepare(`SELECT COUNT(*) AS c FROM leads ${baseWhere.where}`)
      .bind(...baseWhere.binds)
      .first<{ c: number }>();
    const bCount = base?.c ?? 0;
    if (bCount === 0) return null;
    const ratio = (scoped?.c ?? 0) / bCount;
    // Same clamp `scaleRunToRange` uses so a tiny slice doesn't zero the KPIs.
    return Math.max(0.05, Math.min(1, ratio));
  } catch {
    return null;
  }
}

/** Resolve the ratio for a filter — D1 first, `days/30` fallback. Async. */
async function resolveRatio(f: F): Promise<number> {
  const d1 = await d1RangeRatio(f);
  if (typeof d1 === "number") return d1;
  return rangeRatio(f.from, f.to);
}

function buildLeadsWhere(f: F): { where: string; binds: unknown[] } {
  const clauses: string[] = ["1=1"];
  const binds: unknown[] = [];
  if (f.campaignId) { clauses.push("campaign_id = ?"); binds.push(f.campaignId); }
  if (f.runId) { clauses.push("run_id = ?"); binds.push(f.runId); }
  if (f.channel) { clauses.push("channel = ?"); binds.push(f.channel); }
  if (f.stageNodeId) { clauses.push("stage_node_id = ?"); binds.push(f.stageNodeId); }
  if (f.status) { clauses.push("status = ?"); binds.push(f.status); }
  if (f.from) { clauses.push("updated_at >= ?"); binds.push(Date.parse(f.from + "T00:00:00Z")); }
  if (f.to) { clauses.push("updated_at <= ?"); binds.push(Date.parse(f.to + "T23:59:59Z")); }
  return { where: `WHERE ${clauses.join(" AND ")}`, binds };
}

const scale = (n: number, ratio: number) => Math.max(0, Math.round(n * ratio));

/**
 * Channel-specific funnel derivation. Mirrors the UI's `deriveChannelValues`
 * (analytics.tsx) + `smsOutcomeTotals` / `rcsOutcomeTotals` bit-for-bit so
 * Pi's numbers match the KPI cards on every channel view. The generic
 * fallback (0.94 / 0.68 / …) that used to sit in fxSummary was fine for the
 * Campaign tab but drifted 7-10% on channel views. When we know the scope
 * is one channel, use its real rates.
 *
 *   whatsapp — 0.94 / 0.55 / 0.32 / 0.16 (delivered/read/clicked/replied)
 *   sms      — SMS_DELIVERY_RATES (delivered 0.94, failed 0.04)
 *   rcs      — RCS_DELIVERY_RATES (delivered 0.88, read 0.62, clicked 0.11, failed 0.10)
 *   voice    — completed 0.72, failed 0.14 (matches deriveChannelValues)
 */
function channelFunnel(sent: number, kind: SankeyNodeKind | undefined) {
  switch (kind) {
    case "whatsapp":
    case "whatsappFreeform": {
      const delivered = Math.round(sent * 0.94);
      const read = Math.round(sent * 0.55);
      const clicked = Math.round(sent * 0.32);
      const replied = Math.round(sent * 0.16);
      const failed = Math.round(sent * 0.06);
      return { sent, delivered, read, clicked, replied, converted: replied, failed };
    }
    case "sms": {
      const delivered = Math.round(sent * SMS_DELIVERY_RATES.delivered);
      const failed = Math.round(sent * SMS_DELIVERY_RATES.failed);
      return { sent, delivered, read: 0, clicked: 0, replied: 0, converted: delivered, failed };
    }
    case "rcs": {
      const delivered = Math.round(sent * RCS_DELIVERY_RATES.delivered);
      const read = Math.round(sent * RCS_DELIVERY_RATES.read);
      const clicked = Math.round(sent * RCS_DELIVERY_RATES.clicked);
      const failed = Math.round(sent * RCS_DELIVERY_RATES.failed);
      return { sent, delivered, read, clicked, replied: 0, converted: clicked, failed };
    }
    case "voice": {
      // Voice matches `deriveChannelValues("voice", ...)` above: 8% running,
      // 14% failed, 6% pending, 72% completed.
      const failed = Math.round(sent * 0.14);
      const completed = Math.max(0, sent - Math.round(sent * 0.06) - Math.round(sent * 0.08) - failed);
      return { sent, delivered: completed, read: 0, clicked: 0, replied: 0, converted: completed, failed };
    }
    default: {
      // Campaign-tab / mixed-channel scope — generic funnel over eligible
      // leads. Matches the pre-channel-specific behavior for back-compat.
      const delivered = Math.round(sent * 0.94);
      const read = Math.round(sent * 0.68);
      const clicked = Math.round(sent * 0.22);
      const replied = Math.round(sent * 0.15);
      return { sent, delivered, read, clicked, replied, converted: 0, failed: 0 };
    }
  }
}

/** Peek at the resolved refs and return a single channel kind if every ref
 *  points to a node of the same kind, else undefined (Campaign tab or mixed).
 *  Used to pick channel-specific delivery rates in fxSummary. */
function inferChannelKind(refs?: ResolvedRefLite[]): SankeyNodeKind | undefined {
  if (!refs || refs.length === 0) return undefined;
  const kinds = new Set<SankeyNodeKind>();
  for (const r of refs) {
    const c = CAMPAIGNS.find((x) => x.id === r.campaignId);
    const run = c?.runs.find((x) => x.id === r.runId);
    const node = run?.sankey.nodes.find((x) => x.id === r.nodeId);
    if (node) kinds.add(node.kind);
    if (kinds.size > 1) return undefined;
  }
  return kinds.size === 1 ? [...kinds][0] : undefined;
}

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

export async function fxSummary(f: F, opts?: { resolvedRefs?: ResolvedRefLite[] }) {
  const ratio = await resolveRatio(f);
  const refs = opts?.resolvedRefs;

  // Two math paths. Both apply the same range ratio (D1 first, days/30
  // fallback) so the scaling matches the UI's `scaleRunToRange`.
  //   A. resolvedRefs present (asset / broadcast / channel-tab view) —
  //      iterate ONLY those (run, node) triples. The "sent" KPI card sums
  //      node.entered over exactly this list; Pi mirrors that.
  //   B. resolvedRefs absent (Campaign-tab, or Pi calling without context) —
  //      fall back to pickRuns(f), summing at the run.kpi level.
  let totalLeads = 0;
  let eligibleLeads = 0;
  let completedLeads = 0;
  const perChannel = new Map<string, { sent: number; delivered: number; converted: number }>();

  if (refs && refs.length > 0) {
    // Asset / channel view: KPIs come from summing node.entered over the
    // exact resolved refs. `sent` is the channel-touchpoint total (matches
    // the UI's "Sent" card exactly). Total/eligible/completed leads are
    // derived from the same node.entered pool with the same 98% / 91%
    // ratios the fixture uses elsewhere, so all three KPIs stay coherent.
    let sentSum = 0;
    let convertedSum = 0;
    for (const g of groupResolvedRefs(refs)) {
      const scaled = scaledRun(g.run, ratio);
      for (const n of scaled.sankey.nodes) {
        if (!g.nodeIds.has(n.id)) continue;
        sentSum += n.entered;
        convertedSum += n.exited;
        if (CHANNEL_KINDS.includes(n.kind) && (!f.channel || n.kind === f.channel)) {
          const cur = perChannel.get(n.kind) ?? { sent: 0, delivered: 0, converted: 0 };
          const cf = channelFunnel(n.entered, n.kind);
          cur.sent += cf.sent;
          cur.delivered += cf.delivered;
          cur.converted += cf.converted;
          perChannel.set(n.kind, cur);
        }
      }
    }
    // The UI shows Sent/Delivered/Failed/Timeout on channel views — same
    // node.entered pool, ratioed. Total leads for the SCREEN's aggregate
    // block is `sent` when we're in asset-mode (the user is looking at a
    // template's send volume, not a per-lead audience).
    totalLeads = sentSum;
    eligibleLeads = sentSum; // asset-mode: eligible == sent (all in-scope)
    completedLeads = convertedSum;
  } else {
    // Full-run / Campaign-tab math — sum kpi fields per selected run.
    const scaled = pickRuns(f).map(({ campaignId, campaignName, run }) => ({
      campaignId, campaignName, run: scaledRun(run, ratio),
    }));
    totalLeads     = scaled.reduce((s, x) => s + x.run.kpi.totalLeads, 0);
    eligibleLeads  = scaled.reduce((s, x) => s + x.run.kpi.validLeads, 0);
    completedLeads = scaled.reduce((s, x) => s + x.run.kpi.leadsProcessed, 0);
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
  }
  // Channel-scoped views (asset/broadcast/channel tab) use channel-specific
  // funnel rates from the same source of truth the KPI cards use — mirroring
  // deriveChannelValues + smsOutcomeTotals / rcsOutcomeTotals. When we're on
  // the Campaign tab or a mixed-channel scope, fall through to the generic
  // funnel where completed drives the "converted" number.
  const scopedKind: SankeyNodeKind | undefined = refs
    ? inferChannelKind(refs)
    : (f.channel as SankeyNodeKind | undefined);
  const isChannelScope = scopedKind !== undefined;
  const funnel = isChannelScope
    ? channelFunnel(eligibleLeads, scopedKind)
    : {
        sent:      eligibleLeads,
        delivered: Math.round(eligibleLeads * 0.94),
        read:      Math.round(eligibleLeads * 0.68),
        clicked:   Math.round(eligibleLeads * 0.22),
        replied:   Math.round(eligibleLeads * 0.15),
        converted: completedLeads,
        failed:    Math.max(0, eligibleLeads - completedLeads),
      };
  // Channel scope: failed comes from the channel-specific rate, not
  // eligible-completed. Otherwise it's the residual.
  const failedLeads = isChannelScope
    ? funnel.failed
    : Math.max(0, eligibleLeads - completedLeads);
  if (isChannelScope) completedLeads = funnel.converted;

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

  return {
    scope: {
      campaignId: f.campaignId,
      runId: f.runId,
      channel: f.channel,
      from: f.from,
      to: f.to,
      scaledBy: ratio < 1 ? Number(ratio.toFixed(3)) : 1,
      refCount: refs?.length ?? 0,
      resolvedRefs: refs && refs.length ? refs : undefined,
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

export async function fxCountLeads(f: F, opts?: { resolvedRefs?: ResolvedRefLite[] }): Promise<number> {
  const ratio = await resolveRatio(f);
  const refs = opts?.resolvedRefs;

  // resolvedRefs path — sum node.entered over the exact triples in scope.
  if (refs && refs.length > 0) {
    let total = 0;
    for (const g of groupResolvedRefs(refs)) {
      const scaled = scaledRun(g.run, ratio);
      for (const n of scaled.sankey.nodes) {
        if (!g.nodeIds.has(n.id)) continue;
        total += n.entered;
      }
    }
    return total;
  }

  // Filter-driven path.
  const runs = pickRuns(f);
  if (f.channel || f.stageNodeId) {
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

export async function fxStatusBreakdown(f: F, opts?: { resolvedRefs?: ResolvedRefLite[] }) {
  return (await fxSummary(f, opts)).byStatus;
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

export async function fxCompareChannels(f: F, opts?: { resolvedRefs?: ResolvedRefLite[] }) {
  const s = await fxSummary({ ...f, channel: undefined }, opts);
  return s.byChannel.map((c) => ({
    channel: c.channel,
    sent: c.sent,
    delivered: c.delivered,
    converted: c.converted,
    convRate: c.sent > 0 ? Number((c.converted / c.sent).toFixed(4)) : 0,
  }));
}

export async function fxCompareRuns(runIdA: string, runIdB: string) {
  const [a, b] = await Promise.all([
    fxSummary({ runId: runIdA }),
    fxSummary({ runId: runIdB }),
  ]);
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

export async function fxVoiceIntentDistribution(f: F, opts?: { resolvedRefs?: ResolvedRefLite[] }) {
  const ratio = await resolveRatio(f);
  const refs = opts?.resolvedRefs;
  // Total completed voice calls under scope = sum of voice-node exited (scaled).
  let completed = 0;
  if (refs && refs.length > 0) {
    for (const g of groupResolvedRefs(refs)) {
      const scaled = scaledRun(g.run, ratio);
      for (const n of scaled.sankey.nodes) {
        if (n.kind !== "voice") continue;
        if (!g.nodeIds.has(n.id)) continue;
        completed += n.exited;
      }
    }
  } else {
    for (const { run } of pickRuns(f)) {
      for (const n of run.sankey.nodes) {
        if (n.kind !== "voice") continue;
        completed += scale(n.exited, ratio);
      }
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
export async function fxTimeSeries(
  args: { metric: string; from: string; to: string; campaignId?: string; channel?: string },
  opts?: { resolvedRefs?: ResolvedRefLite[] },
) {
  const summary = await fxSummary(
    { campaignId: args.campaignId, channel: args.channel, from: args.from, to: args.to },
    opts,
  );
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
