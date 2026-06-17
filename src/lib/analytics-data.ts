/** Mock analytics data tightly coupled to the Campaign DAG model.
 *  Numbers are internally consistent: every Sankey node's inflow == outflow,
 *  every branch ratio is a believable real-world drop-off, and KPIs roll up
 *  from the leaf totals. Reviewers should be able to add up edges by hand.
 */
import { EXAMPLE_CAMPAIGNS, type ExampleCampaign } from "./campaign-examples";
import type { NodeKind } from "./campaign-types";

export type ChannelKind = "whatsapp" | "voice" | "sms" | "ads";

export type SankeyNodeKind =
  | "start"
  | "audience"
  | "abSplit"
  | "whatsapp"
  | "voice"
  | "sms"
  | "ads"
  | "conditional"
  | "delay"
  | "end";

export type SankeyNode = {
  id: string;
  name: string;
  kind: SankeyNodeKind;
  entered: number;
  exited: number;
};

export type SankeyEdge = { source: string; target: string; value: number; sourceHandle?: string; handleLabel?: string };

export type CampaignAnalytics = {
  id: string;
  name: string;
  runs: RunRow[];
};

export type RunRow = {
  id: string;
  startedAt: string;
  status: "completed" | "running" | "failed" | "paused";
  audience: number;
  totalLeads: number;
  leadsProcessed: number;
  successRate: number;
  kpi: { totalLeads: number; validLeads: number; leadsProcessed: number; successRate: number };
  sankey: { nodes: SankeyNode[]; edges: SankeyEdge[] };
};

/* ───────────── Generated from the example campaign library ─────────────
 *  Analytics is contextual to the same 16 example campaigns shown in the
 *  Campaigns table. For each authored builder graph we synthesize one run by
 *  propagating an audience base through the DAG: structural nodes pass everyone
 *  through, channel nodes apply a realistic drop-off, and branch/variant ports
 *  split the flow. Numbers stay internally consistent (a node's inflow == the
 *  sum of its incoming edges).
 */

const KIND_TO_SANKEY: Record<NodeKind, SankeyNodeKind> = {
  start: "start", end: "end", audience: "audience", conditional: "conditional",
  abSplit: "abSplit", delay: "delay", voiceCall: "voice", whatsapp: "whatsapp",
  sms: "sms", adsCampaign: "ads",
};

const PASS_RATE: Record<SankeyNodeKind, number> = {
  start: 1, audience: 1, conditional: 1, abSplit: 1, delay: 1, end: 1,
  voice: 0.72, whatsapp: 0.82, sms: 0.9, ads: 0.95,
};

/** Stable string hash for deterministic per-node variance. */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Per-node pass rate: the kind's base rate plus a deterministic ±8% wobble
 *  keyed off the node id, plus small semantic adjustments (follow-ups / final
 *  calls / reminders drop a bit more; qualification / welcome / intro a bit
 *  less). Keeps every node's drop-off realistic and distinct without breaking
 *  funnel conservation. Pure-structural nodes (start/audience/conditional/
 *  abSplit/delay/end) always pass 100%. */
function nodePassRate(kind: SankeyNodeKind, id: string, title: string, salt: string): number {
  const base = PASS_RATE[kind] ?? 1;
  if (base >= 1) return 1;
  const noise = ((hashStr(salt + ":" + id) % 17) - 8) / 100; // -0.08..+0.08
  const t = title.toLowerCase();
  let bump = 0;
  if (/follow[- ]?up|final|escalat|reminder|nudge/.test(t)) bump -= 0.06;
  if (/qualif|welcome|intro|alert|first/.test(t))           bump += 0.04;
  return Math.max(0.5, Math.min(0.97, base + noise + bump));
}

/** Semantic base weight for a WhatsApp outcome handle — session expiry (no
 *  engagement) is the largest slice, button taps moderate, freeform replies the
 *  smallest. Per-(run, node, handle) noise keeps the split varied and realistic. */
function waHandleBaseWeight(handle: string): number {
  if (handle === "session_expired") return 1.7;
  if (handle === "reply_received") return 0.8;
  if (handle.startsWith("btn_")) return 1.1;
  return 1;
}

/** Propagate `base` leads through an example graph into a consistent run. */
function deriveRun(ex: ExampleCampaign, base: number, runId: string, startedAt: string): RunRow {
  const { nodes, edges } = ex;
  const kindOf = new Map<string, SankeyNodeKind>(nodes.map((n) => [n.id, KIND_TO_SANKEY[n.data.kind]]));
  const titleOf = new Map<string, string>(nodes.map((n) => [n.id, n.data.title]));
  const incoming = new Map<string, string[]>();
  const outIdx = new Map<string, number[]>();
  nodes.forEach((n) => { incoming.set(n.id, []); outIdx.set(n.id, []); });
  edges.forEach((e, i) => { incoming.get(e.target)?.push(e.source); outIdx.get(e.source)?.push(i); });

  // Topological order (parents before children) via post-order DFS on incoming.
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    (incoming.get(id) ?? []).forEach(visit);
    order.push(id);
  };
  nodes.forEach((n) => visit(n.id));

  const entered = new Map<string, number>();
  const exited = new Map<string, number>();
  const edgeValue = new Map<number, number>();

  for (const id of order) {
    const ins = incoming.get(id) ?? [];
    const ent = ins.length === 0
      ? base
      : edges.reduce((s, e, i) => (e.target === id ? s + (edgeValue.get(i) ?? 0) : s), 0);
    const enteredCount = Math.round(ent);
    entered.set(id, enteredCount);
    const kind = kindOf.get(id)!;
    const rate = nodePassRate(kind, id, titleOf.get(id) ?? "", runId);
    const exitedCount = Math.round(enteredCount * rate);
    exited.set(id, exitedCount);

    const outs = outIdx.get(id) ?? [];
    if (outs.length === 0) continue;
    // Group outgoing edges by source port handle.
    const groups = new Map<string, number[]>();
    outs.forEach((i) => {
      const h = edges[i].sourceHandle ?? "__default__";
      if (!groups.has(h)) groups.set(h, []);
      groups.get(h)!.push(i);
    });
    const handleIds = [...groups.keys()];
    const groupArr = [...groups.values()];
    const G = groupArr.length;
    const equal = kind === "abSplit" || G === 1;
    const denom = G * (G + 1) / 2;
    // WhatsApp outcomes split by semantic weight (session/reply/button) with a
    // deterministic per-(run,node,handle) wobble; conditional branches keep the
    // top-to-bottom triangular weighting; A/B and single-output split evenly.
    const waWeights = kind === "whatsapp" && !equal
      ? handleIds.map((h) => waHandleBaseWeight(h) * (1 + ((hashStr(runId + ":" + id + ":" + h) % 17) - 8) / 100))
      : null;
    const waSum = waWeights ? waWeights.reduce((a, b) => a + b, 0) || 1 : 1;
    groupArr.forEach((arr, gi) => {
      const w = equal ? 1 / G : waWeights ? waWeights[gi] / waSum : (G - gi) / denom;
      const groupTotal = exitedCount * w;
      arr.forEach((i) => edgeValue.set(i, Math.round(groupTotal / arr.length)));
    });
  }

  const sankeyNodes: SankeyNode[] = nodes.map((n) => ({
    id: n.id, name: n.data.title, kind: kindOf.get(n.id)!,
    entered: entered.get(n.id) ?? 0, exited: exited.get(n.id) ?? 0,
  }));
  // Map (nodeId, handleId) → the node's output label, so the drawer can show a
  // named outcome distribution (button text / "Replied" / "Session expired").
  const outputLabel = new Map<string, string>();
  nodes.forEach((n) => (n.data.outputs ?? []).forEach((o) => outputLabel.set(n.id + ":" + o.id, o.label)));
  const sankeyEdges: SankeyEdge[] = edges.map((e, i) => ({
    source: e.source, target: e.target, value: edgeValue.get(i) ?? 0,
    sourceHandle: e.sourceHandle ?? undefined,
    handleLabel: e.sourceHandle ? outputLabel.get(e.source + ":" + e.sourceHandle) : undefined,
  }));

  const completed = sankeyNodes.filter((n) => n.kind === "end").reduce((s, n) => s + n.entered, 0);
  const validLeads = Math.round(base * 0.98);
  const successRate = base > 0 ? Math.round((completed / base) * 100) : 0;

  return {
    id: runId, startedAt, status: "completed", audience: base,
    totalLeads: base, leadsProcessed: completed, successRate,
    kpi: { totalLeads: base, validLeads, leadsProcessed: completed, successRate },
    sankey: { nodes: sankeyNodes, edges: sankeyEdges },
  };
}

export const CAMPAIGNS: CampaignAnalytics[] = Object.entries(EXAMPLE_CAMPAIGNS).map(([id, ex], i) => ({
  id,
  name: ex.name,
  runs: [deriveRun(ex, 9000 + i * 600, `r_${id}`, "Today · 09:00")],
}));
export const NODE_METRICS: Partial<Record<
  SankeyNodeKind,
  { label: string; value: number }[]
>> = {
  whatsapp: [
    { label: "Sent",       value: 7441 },
    { label: "Delivered",  value: 6998 },
    { label: "Read",       value: 4120 },
    { label: "Clicked",    value: 2380 },
    { label: "Replied",    value: 1180 },
    { label: "Conversion", value: 1120 },
  ],
  voice: [
    { label: "Attempted",  value: 4961 },
    { label: "Connected",  value: 3372 },
    { label: "Answered",   value: 3372 },
    { label: "Interested", value: 1410 },
    { label: "Conversion", value: 720  },
  ],
  sms: [
    { label: "Sent",      value: 12580 },
    { label: "Delivered", value: 12180 },
    { label: "Failed",    value: 400   },
  ],
  ads: [
    { label: "Impressions", value: 982000 },
    { label: "Clicks",      value: 38210  },
    { label: "CTR",         value: 3.9    },
    { label: "Leads",       value: 4120   },
    { label: "CPL",         value: 1.84   },
  ],
};

// Channel-level trend (last 14 days)
export function trend(seed: number, days = 14): { dates: string[]; values: number[] } {
  const dates: string[] = [];
  const values: number[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(`${d.getMonth() + 1}/${d.getDate()}`);
    // Deterministic-ish wave so the chart looks plausible without re-render jitter
    const wave = 0.75 + Math.sin((i + seed) * 0.6) * 0.18 + Math.cos((i + seed) * 0.21) * 0.1;
    values.push(Math.max(1, Math.round(seed * wave)));
  }
  return { dates, values };
}

export const CHANNEL_CAMPAIGN_BREAKDOWN: { campaign: string; sent: number; converted: number; rate: number }[] = [
  { campaign: "Dormant Trader Reactivation", sent: 50000, converted: 5330, rate: 10.7 },
  { campaign: "New Trader Onboarding",       sent: 4820,  converted: 1840, rate: 38.2 },
  { campaign: "KYC Drop-off Recovery",       sent: 9802,  converted: 1402, rate: 14.3 },
  { campaign: "High-Value Win-Back",         sent: 8420,  converted: 982,  rate: 11.7 },
];
/* ───────────── Node configuration (read-only summary for Drawer) ───────────── */

export type NodeConfigField = { label: string; value: string };

/** Mock per-kind config. Keyed by kind; channel nodes reuse the same template. */
export const NODE_CONFIG_BY_KIND: Partial<Record<SankeyNodeKind, NodeConfigField[]>> = {
  whatsapp: [
    { label: "Template Name", value: "reactivate_v3" },
    { label: "Message Type",  value: "Marketing" },
    { label: "WhatsApp Number", value: "+1 415 555-0142" },
  ],
  voice: [
    { label: "Voice Agent",    value: "Reactivation Voice v2" },
    { label: "Retry Attempts", value: "3" },
    { label: "Retry Interval", value: "30 minutes" },
  ],
  sms: [
    { label: "Template Name", value: "kyc_final_v1" },
    { label: "Sender ID",     value: "PICOMM" },
    { label: "Message Type",  value: "Transactional" },
  ],
  ads: [
    { label: "Campaign Objective", value: "Lead Generation" },
    { label: "Audience Source",    value: "Custom · KYC stalled" },
    { label: "Budget",             value: "$420 / day" },
  ],
  audience: [
    { label: "Source", value: "CSV upload" },
    { label: "Size",   value: "Variable" },
  ],
  abSplit: [
    { label: "Split", value: "60 / 40" },
  ],
  conditional: [
    { label: "Condition", value: "Custom expression" },
  ],
  delay: [
    { label: "Duration", value: "24 hours" },
  ],
};

/* ───────────── Channel assets index (for Channel Asset scope) ─────────────
 *  An "asset" represents a reusable channel resource (Voice Agent, WhatsApp
 *  Number, Sender ID, Ad Campaign). Each asset references the (campaign, run,
 *  node) tuples where it is used across the workspace.
 */

export type ChannelAssetRef = {
  campaignId: string;
  campaignName: string;
  runId: string;
  runStartedAt: string;
  nodeId: string;
  nodeLabel: string;
};
export type ChannelAsset = {
  id: string;
  label: string;
  /** Display kind (e.g. "Voice Agent", "WhatsApp Number"). */
  refs: ChannelAssetRef[];
};

/** Build the asset index by grouping channel nodes across all campaigns/runs.
 *  Asset identity = the part of the node name after "Channel · " (e.g.
 *  "WhatsApp · reactivate_v3" → asset "reactivate_v3").
 */
export function buildChannelAssets(kind: ChannelKind): ChannelAsset[] {
  const byLabel = new Map<string, ChannelAsset>();
  for (const c of CAMPAIGNS) {
    for (const r of c.runs) {
      for (const n of r.sankey.nodes) {
        if (n.kind !== kind) continue;
        const label = n.name.includes(" · ") ? n.name.split(" · ").slice(1).join(" · ") : n.name;
        const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        const existing = byLabel.get(id) ?? { id, label, refs: [] };
        existing.refs.push({
          campaignId: c.id,
          campaignName: c.name,
          runId: r.id,
          runStartedAt: r.startedAt,
          nodeId: n.id,
          nodeLabel: n.name,
        });
        byLabel.set(id, existing);
      }
    }
  }
  return Array.from(byLabel.values());
}
