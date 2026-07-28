/** Mock analytics data tightly coupled to the Campaign DAG model.
 *  Numbers are internally consistent: every Sankey node's inflow == outflow,
 *  every branch ratio is a believable real-world drop-off, and KPIs roll up
 *  from the leaf totals. Reviewers should be able to add up edges by hand.
 */
import { EXAMPLE_CAMPAIGNS, type ExampleCampaign } from "./campaign-examples";
import type { NodeKind, PresetConfig } from "./campaign-types";
import { resolveWaTemplate } from "./wa-outputs";
import { languageLabel } from "./waba-templates";
import { resolveAgent } from "./agent-data";
import { resolveSmsTemplate } from "./sms-store";
import { templateSegments } from "./sms-templates";

export type ChannelKind = "whatsapp" | "voice" | "sms" | "ads";

export type SankeyNodeKind =
  | "start"
  | "audience"
  | "apiToolCall"
  | "abSplit"
  | "whatsapp"
  | "voice"
  | "sms"
  | "ads"
  | "conditional"
  | "delay"
  | "aiTransform"
  | "end";

export type SankeyNode = {
  id: string;
  name: string;
  /** Per-kind serial (`whatsapp_2`) carried over from the campaign node. */
  serial?: string;
  /** Short user label (≤12 chars) carried over from the campaign node. */
  description?: string;
  kind: SankeyNodeKind;
  entered: number;
  exited: number;
  /** The node's real saved configuration, carried from the campaign builder so
   *  the drawer's Configuration Snapshot reflects what was actually configured. */
  config?: PresetConfig;
};

export type SankeyEdge = {
  source: string;
  target: string;
  value: number;
  sourceHandle?: string;
  handleLabel?: string;
};

export type CampaignAnalytics = {
  id: string;
  name: string;
  runs: RunRow[];
};

export type RunType = "time-scoped" | "always-on";

export type RunRow = {
  id: string;
  name: string;
  code: string;
  startedAt: string;
  status: "completed" | "running" | "failed" | "paused";
  runType: RunType;
  audience: number;
  totalLeads: number;
  leadsProcessed: number;
  successRate: number;
  kpi: {
    totalLeads: number;
    validLeads: number;
    leadsProcessed: number;
    successRate: number;
  };
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
  start: "start",
  end: "end",
  audience: "audience",
  conditional: "conditional",
  abSplit: "abSplit",
  delay: "delay",
  voiceCall: "voice",
  whatsapp: "whatsapp",
  sms: "sms",
  adsCampaign: "ads",
  // API Tool Call is its own node in analytics: a data/processing step that every
  // lead flows through. It shows Common Metrics + a Configuration Snapshot, but
  // has no channel funnel of its own.
  apiToolCall: "apiToolCall",
  aiTransform: "aiTransform",
};

const PASS_RATE: Record<SankeyNodeKind, number> = {
  start: 1,
  audience: 1,
  apiToolCall: 1,
  conditional: 1,
  abSplit: 1,
  delay: 1,
  aiTransform: 1,
  end: 1,
  voice: 0.72,
  whatsapp: 0.82,
  sms: 0.9,
  ads: 0.95,
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
function nodePassRate(
  kind: SankeyNodeKind,
  id: string,
  title: string,
  salt: string,
): number {
  const base = PASS_RATE[kind] ?? 1;
  if (base >= 1) return 1;
  const noise = ((hashStr(salt + ":" + id) % 17) - 8) / 100; // -0.08..+0.08
  const t = title.toLowerCase();
  let bump = 0;
  if (/follow[- ]?up|final|escalat|reminder|nudge/.test(t)) bump -= 0.06;
  if (/qualif|welcome|intro|alert|first/.test(t)) bump += 0.04;
  return Math.max(0.5, Math.min(0.97, base + noise + bump));
}

/** Semantic base weight for a WhatsApp outcome handle — session expiry (no
 *  engagement) is the largest slice, button taps moderate, freeform replies the
 *  smallest. Per-(run, node, handle) noise keeps the split varied and realistic. */
function waHandleBaseWeight(handle: string): number {
  // "no_response" (split) / "advance" (collapsed) are the no-engagement catch-all
  // — the largest slice; button taps moderate, freeform replies the smallest.
  if (
    handle === "no_response" ||
    handle === "advance" ||
    handle === "session_expired"
  )
    return 1.7;
  if (handle === "reply_received") return 0.8;
  if (handle.startsWith("btn_")) return 1.1;
  return 1;
}

/**
 * Delivery-outcome rates for SMS — the single source of truth for how SMS
 * traffic splits. Consumed by the Sankey weighting below, by the node drawer's
 * metric tiles and by the SMS channel view (via `smsOutcomeTotals`), so those
 * three surfaces cannot drift apart. Lives here, in the lowest layer, so the
 * dependency only ever points upward.
 */
export const SMS_DELIVERY_RATES = { delivered: 0.94, failed: 0.04 } as const;

/**
 * Semantic base weight for an SMS delivery handle. SMS delivery is overwhelmingly
 * successful, so the generic triangular fallback (which would hand `delivered`
 * only ~50% of traffic) reads as broken.
 */
function smsHandleBaseWeight(handle: string): number {
  if (handle === "delivered") return SMS_DELIVERY_RATES.delivered * 100;
  if (handle === "failed") return SMS_DELIVERY_RATES.failed * 100;
  if (handle === "no_dlr")
    return (1 - SMS_DELIVERY_RATES.delivered - SMS_DELIVERY_RATES.failed) * 100;
  return 1;
}

/** Propagate `base` leads through an example graph into a consistent run. */
function deriveRun(
  ex: ExampleCampaign,
  base: number,
  runId: string,
  startedAt: string,
  runType: RunType,
  name: string,
  code: string,
): RunRow {
  const { nodes, edges } = ex;
  const kindOf = new Map<string, SankeyNodeKind>(
    nodes.map((n) => [n.id, KIND_TO_SANKEY[n.data.kind]]),
  );
  const titleOf = new Map<string, string>(
    nodes.map((n) => [n.id, n.data.title]),
  );
  const incoming = new Map<string, string[]>();
  const outIdx = new Map<string, number[]>();
  nodes.forEach((n) => {
    incoming.set(n.id, []);
    outIdx.set(n.id, []);
  });
  edges.forEach((e, i) => {
    incoming.get(e.target)?.push(e.source);
    outIdx.get(e.source)?.push(i);
  });

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
    const ent =
      ins.length === 0
        ? base
        : edges.reduce(
            (s, e, i) => (e.target === id ? s + (edgeValue.get(i) ?? 0) : s),
            0,
          );
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
    const denom = (G * (G + 1)) / 2;
    // WhatsApp outcomes split by semantic weight (session/reply/button) with a
    // deterministic per-(run,node,handle) wobble; conditional branches keep the
    // top-to-bottom triangular weighting; A/B and single-output split evenly.
    const baseWeight =
      kind === "whatsapp" ? waHandleBaseWeight : kind === "sms" ? smsHandleBaseWeight : null;
    const waWeights =
      baseWeight && !equal
        ? handleIds.map(
            (h) =>
              baseWeight(h) *
              (1 + ((hashStr(runId + ":" + id + ":" + h) % 17) - 8) / 100),
          )
        : null;
    const waSum = waWeights ? waWeights.reduce((a, b) => a + b, 0) || 1 : 1;
    groupArr.forEach((arr, gi) => {
      const w = equal
        ? 1 / G
        : waWeights
          ? waWeights[gi] / waSum
          : (G - gi) / denom;
      const groupTotal = exitedCount * w;
      arr.forEach((i) => edgeValue.set(i, Math.round(groupTotal / arr.length)));
    });
  }

  const sankeyNodes: SankeyNode[] = nodes.map((n) => ({
    id: n.id,
    name: n.data.title,
    serial: n.data.serial,
    description: n.data.description,
    kind: kindOf.get(n.id)!,
    entered: entered.get(n.id) ?? 0,
    exited: exited.get(n.id) ?? 0,
    config: n.data.config,
  }));
  // Map (nodeId, handleId) → the node's output label, so the drawer can show a
  // named outcome distribution (button text / "Replied" / "Session expired").
  const outputLabel = new Map<string, string>();
  nodes.forEach((n) =>
    (n.data.outputs ?? []).forEach((o) =>
      outputLabel.set(n.id + ":" + o.id, o.label),
    ),
  );
  const sankeyEdges: SankeyEdge[] = edges.map((e, i) => ({
    source: e.source,
    target: e.target,
    value: edgeValue.get(i) ?? 0,
    sourceHandle: e.sourceHandle ?? undefined,
    handleLabel: e.sourceHandle
      ? outputLabel.get(e.source + ":" + e.sourceHandle)
      : undefined,
  }));

  const completed = sankeyNodes
    .filter((n) => n.kind === "end")
    .reduce((s, n) => s + n.entered, 0);
  const validLeads = Math.round(base * 0.98);
  const successRate = base > 0 ? Math.round((completed / base) * 100) : 0;

  return {
    id: runId,
    name,
    code,
    startedAt,
    status: "completed",
    runType,
    audience: base,
    totalLeads: base,
    leadsProcessed: completed,
    successRate,
    kpi: {
      totalLeads: base,
      validLeads,
      leadsProcessed: completed,
      successRate,
    },
    sankey: { nodes: sankeyNodes, edges: sankeyEdges },
  };
}

export const CAMPAIGNS: CampaignAnalytics[] = Object.entries(
  EXAMPLE_CAMPAIGNS,
).map(([id, ex], i) => ({
  id,
  name: ex.name,
  // Alternate run types so both the badge and the Always-on-only date filter are demonstrable.
  runs: [
    deriveRun(
      ex,
      9000 + i * 600,
      `r_${id}`,
      "Today · 09:00",
      i % 2 === 0 ? "time-scoped" : "always-on",
      "Run 1",
      `RUN-${4200 + i}`,
    ),
  ],
}));
export const NODE_METRICS: Partial<
  Record<SankeyNodeKind, { label: string; value: number }[]>
> = {
  whatsapp: [
    { label: "Sent", value: 7441 },
    { label: "Delivered", value: 6998 },
    { label: "Read", value: 4120 },
    { label: "Clicked", value: 2380 },
    { label: "Replied", value: 1180 },
    { label: "Conversion", value: 1120 },
  ],
  voice: [
    { label: "Attempted", value: 4961 },
    { label: "Connected", value: 3372 },
    { label: "Answered", value: 3372 },
    { label: "Interested", value: 1410 },
    { label: "Conversion", value: 720 },
  ],
  sms: [
    { label: "Sent", value: 12580 },
    { label: "Delivered", value: 12180 },
    { label: "Failed", value: 400 },
  ],
  ads: [
    { label: "Impressions", value: 982000 },
    { label: "Clicks", value: 38210 },
    { label: "CTR", value: 3.9 },
    { label: "Leads", value: 4120 },
    { label: "CPL", value: 1.84 },
  ],
};

// Channel-level trend (last 14 days)
export function trend(
  seed: number,
  days = 14,
): { dates: string[]; values: number[] } {
  const dates: string[] = [];
  const values: number[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(`${d.getMonth() + 1}/${d.getDate()}`);
    // Deterministic-ish wave so the chart looks plausible without re-render jitter
    const wave =
      0.75 +
      Math.sin((i + seed) * 0.6) * 0.18 +
      Math.cos((i + seed) * 0.21) * 0.1;
    values.push(Math.max(1, Math.round(seed * wave)));
  }
  return { dates, values };
}

export const CHANNEL_CAMPAIGN_BREAKDOWN: {
  campaign: string;
  sent: number;
  converted: number;
  rate: number;
}[] = [
  {
    campaign: "Dormant Trader Reactivation",
    sent: 50000,
    converted: 5330,
    rate: 10.7,
  },
  {
    campaign: "New Trader Onboarding",
    sent: 4820,
    converted: 1840,
    rate: 38.2,
  },
  {
    campaign: "KYC Drop-off Recovery",
    sent: 9802,
    converted: 1402,
    rate: 14.3,
  },
  { campaign: "High-Value Win-Back", sent: 8420, converted: 982, rate: 11.7 },
];
/* ───────────── Node configuration (read-only summary for Drawer) ───────────── */

export type NodeConfigField = { label: string; value: string };

/** Render an empty/missing config value as an em-dash so a snapshot row never looks broken. */
function dash(v: unknown): string {
  const s = v == null ? "" : String(v).trim();
  return s.length ? s : "—";
}

/**
 * Real per-node Configuration Snapshot for the node drawer. Reads the node's
 * actual saved {@link PresetConfig} (threaded from the campaign builder) and
 * projects the handful of fields that matter per kind — exactly what the user
 * configured, not a hardcoded stub. Channel/template/agent ids are resolved to
 * readable names so the drawer matches the builder.
 */
export function nodeConfigSnapshot(node: SankeyNode): NodeConfigField[] {
  const c = node.config ?? {};
  switch (node.kind) {
    case "whatsapp": {
      const out: NodeConfigField[] = [
        { label: "WhatsApp Number", value: dash(c.waNumber) },
        {
          label: "Message Mode",
          value: c.waMode === "freeform" ? "Freeform" : "Template",
        },
      ];
      if (c.waMode !== "freeform") {
        const tpl = resolveWaTemplate(c.waTemplate);
        if (tpl) {
          out.push({ label: "Template", value: tpl.name });
          out.push({ label: "Category", value: tpl.category });
          out.push({ label: "Language", value: languageLabel(tpl.language) });
        } else {
          out.push({ label: "Template", value: dash(c.waTemplate) });
        }
      }
      return out;
    }
    case "voice": {
      const agent = resolveAgent(c.agent);
      const out: NodeConfigField[] = [
        { label: "Voice Agent", value: agent?.name ?? dash(c.agent) },
        {
          label: "Max Attempts",
          value: c.maxAttempts != null ? String(c.maxAttempts) : "—",
        },
        { label: "Retry Interval", value: dash(c.retryInterval) },
      ];
      if (c.callStart || c.callEnd)
        out.push({
          label: "Call Window",
          value: `${dash(c.callStart)}–${dash(c.callEnd)}`,
        });
      if (c.timezone) out.push({ label: "Timezone", value: dash(c.timezone) });
      return out;
    }
    case "apiToolCall":
      return [
        { label: "Tool", value: dash(c.apiTool) },
        { label: "Inputs Mapped", value: String(c.apiInputMap?.length ?? 0) },
      ];
    case "aiTransform": {
      // Every transform gets its own row so the reader sees exactly what this
      // node emits (and in what order). Ordered `#N type · in → out`.
      const list = c.transforms ?? [];
      if (list.length === 0) return [{ label: "Transformations", value: "—" }];
      return list.map((t, i) => ({
        label: `#${i + 1} ${t.type}${t.label ? ` · ${t.label}` : ""}`,
        value: `${t.input || "?"} → ${t.output || "?"}`,
      }));
    }
    case "sms": {
      // The DLT template is the node's real identity — sender and category are
      // properties of it, so lead with the template and show the segment count.
      const t = resolveSmsTemplate(c.smsTemplateId);
      const out = [
        { label: "Template", value: t?.name ?? dash(c.smsTemplateId) },
        { label: "Template ID", value: dash(c.smsTemplateId) },
        { label: "Sender ID", value: dash(t?.senderId ?? c.senderId) },
        { label: "Category", value: dash(t?.category ?? c.smsCategory) },
      ];
      if (t) {
        const seg = templateSegments(t);
        out.push({
          label: "Segments",
          value: `${seg.segments} · ${seg.encoding}`,
        });
      }
      out.push({ label: "Variables Mapped", value: String(c.smsVarMap?.length ?? 0) });
      if (c.smsDlrWindow) out.push({ label: "DLR Wait Window", value: c.smsDlrWindow });
      return out;
    }
    case "delay": {
      // Delay v2 has two modes. Dynamic delay keeps the target variable +
      // parsing format visible in the drawer so the reader sees exactly which
      // upstream field drives the wait and how it will be parsed; the
      // fallback duration is surfaced too so it's obvious what happens when
      // the variable is missing/unparseable at runtime.
      if (c.delayMode === "variable") {
        const fallback = c.delayFallbackValue != null
          ? `${c.delayFallbackValue} ${c.delayFallbackUnit ?? ""}`.trim()
          : "—";
        return [
          { label: "Mode", value: "Dynamic delay" },
          { label: "Variable", value: dash(c.delayVariable) },
          { label: "Format", value: dash(c.delayVariableFormat) },
          { label: "Fallback", value: fallback },
        ];
      }
      return [
        { label: "Mode", value: "Static delay" },
        {
          label: "Duration",
          value: c.delayValue != null
            ? `${c.delayValue} ${c.delayUnit ?? ""}`.trim()
            : "—",
        },
      ];
    }
    case "abSplit": {
      const variants = c.splitVariants ?? c.abVariants ?? [];
      return [
        {
          label: "Split",
          value: variants.length
            ? variants.map((v) => String(v.pct)).join(" / ")
            : "—",
        },
      ];
    }
    case "conditional":
      return [{ label: "Branches", value: String(c.branches?.length ?? 0) }];
    case "audience":
      return [
        {
          label: "Source",
          value: c.audienceMode === "api" ? "Runtime API" : "CSV upload",
        },
        { label: "File", value: dash(c.fileName) },
        { label: "Rows", value: dash(c.rowCount) },
      ];
    default:
      return [];
  }
}

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

/** Build the asset index for the channel-tab "Asset" filter (WhatsApp Number /
 *  Voice Agent). Identity is the real configured asset on each node — the
 *  resolved Voice Agent or WhatsApp sender number — NOT the node's display
 *  name. This keeps the filter coherent with intent gating (single-agent rule)
 *  and with the per-number template scope, and stops the dropdown from listing
 *  node titles ("Welcome to Gold") in place of phone numbers.
 *  Falls back to the node-name suffix when the config is missing so legacy
 *  fixtures still surface something selectable.
 */
export function buildChannelAssets(kind: ChannelKind): ChannelAsset[] {
  const byLabel = new Map<string, ChannelAsset>();
  for (const c of CAMPAIGNS) {
    for (const r of c.runs) {
      for (const n of r.sankey.nodes) {
        if (n.kind !== kind) continue;
        let id: string;
        let label: string;
        if (kind === "voice") {
          const agent = resolveAgent(n.config?.agent);
          if (!agent) continue;
          id = agent.id;
          label = agent.name;
        } else if (kind === "whatsapp") {
          const num = n.config?.waNumber;
          if (!num) continue;
          label = num;
          id = num.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        } else {
          label = n.name.includes(" · ")
            ? n.name.split(" · ").slice(1).join(" · ")
            : n.name;
          id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        }
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
