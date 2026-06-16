/** Mock analytics data tightly coupled to the Campaign DAG model.
 *  Numbers are internally consistent: every Sankey node's inflow == outflow,
 *  every branch ratio is a believable real-world drop-off, and KPIs roll up
 *  from the leaf totals. Reviewers should be able to add up edges by hand.
 */

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

export type SankeyEdge = { source: string; target: string; value: number };

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

/* ───────────── Dormant Trader Reactivation ─────────────
 *  Mirrors the campaign-builder DAG exactly:
 *
 *    Start → Audience(12,402) → Channel routing(60/40)
 *                                 ├─ WhatsApp(reactivate_v3)
 *                                 └─ Voice Call(conversational)
 *                                 → Delay(24h) → End
 *
 *  Edge values are the absolute users who progressed; percentages on the
 *  Sankey come from value / source.exited so each label reads as a real
 *  channel KPI (delivery %, connect %, etc.).
 */
const dormantR1: RunRow = {
  id: "\u200B",
  startedAt: "Today · 12:04",
  status: "running",
  audience: 12402,
  totalLeads: 4000,
  leadsProcessed: 1840,
  successRate: 25,
  kpi: { totalLeads: 4000, validLeads: 3990, leadsProcessed: 1840, successRate: 25 },
  sankey: {
    nodes: [
      { id: "start",    name: "Start",                     kind: "start",    entered: 12402, exited: 12402 },
      { id: "audience", name: "Audience · CSV 12,402",     kind: "audience", entered: 12402, exited: 12402 },
      { id: "split",    name: "Channel routing · 60/40",   kind: "conditional", entered: 12402, exited: 12402 },
      { id: "whatsapp", name: "WhatsApp · reactivate_v3",  kind: "whatsapp", entered: 7441,  exited: 6998  }, // 5.9% drop-off (undelivered / no engagement)
      { id: "voice",    name: "Voice Call · Reactivation", kind: "voice",    entered: 4961,  exited: 3372  }, // 32.0% drop-off (no connect / no answer)
      { id: "delay",    name: "Delay · 24h",               kind: "delay",    entered: 10370, exited: 10370 },
      { id: "end",      name: "End",                       kind: "end",      entered: 10370, exited: 10370 },
    ],
    edges: [
      { source: "start",    target: "audience", value: 12402 },
      { source: "audience", target: "split",    value: 12402 },
      { source: "split",    target: "whatsapp", value: 7441  }, // 60% A
      { source: "split",    target: "voice",    value: 4961  }, // 40% B
      { source: "whatsapp", target: "delay",    value: 6998  }, // 94.0% delivered
      { source: "voice",    target: "delay",    value: 3372  }, // 68.0% connected
      { source: "delay",    target: "end",      value: 10370 },
    ],
  },
};

// Run 8420: completed earlier today, smaller batch, slightly worse delivery
const dormantR2: RunRow = {
  id: "r_8420",
  startedAt: "Today · 06:00",
  status: "completed",
  audience: 11840,
  totalLeads: 3750,
  leadsProcessed: 1620,
  successRate: 24,
  kpi: { totalLeads: 3750, validLeads: 3702, leadsProcessed: 1620, successRate: 24 },
  sankey: {
    nodes: [
      { id: "start",    name: "Start",                     kind: "start",    entered: 11840, exited: 11840 },
      { id: "audience", name: "Audience · CSV 11,840",     kind: "audience", entered: 11840, exited: 11840 },
      { id: "split",    name: "Channel routing · 60/40",   kind: "conditional", entered: 11840, exited: 11840 },
      { id: "whatsapp", name: "WhatsApp · reactivate_v3",  kind: "whatsapp", entered: 7104,  exited: 6580  }, // 7.4% drop-off
      { id: "voice",    name: "Voice Call · Reactivation", kind: "voice",    entered: 4736,  exited: 3132  }, // 33.9% drop-off
      { id: "delay",    name: "Delay · 24h",               kind: "delay",    entered: 9712,  exited: 9712  },
      { id: "end",      name: "End",                       kind: "end",      entered: 9712,  exited: 9712  },
    ],
    edges: [
      { source: "start",    target: "audience", value: 11840 },
      { source: "audience", target: "split",    value: 11840 },
      { source: "split",    target: "whatsapp", value: 7104  },
      { source: "split",    target: "voice",    value: 4736  },
      { source: "whatsapp", target: "delay",    value: 6580  }, // 92.6% delivered
      { source: "voice",    target: "delay",    value: 3132  }, // 66.1% connected
      { source: "delay",    target: "end",      value: 9712  },
    ],
  },
};

// Run 8418: failed mid-run — WhatsApp template was rejected by Meta
const dormantR3: RunRow = {
  id: "r_8418",
  startedAt: "Yesterday · 18:30",
  status: "failed",
  audience: 12402,
  totalLeads: 1620,
  leadsProcessed: 0,
  successRate: 0,
  kpi: { totalLeads: 1620, validLeads: 410, leadsProcessed: 0, successRate: 0 },
  sankey: {
    nodes: [
      { id: "start",    name: "Start",                     kind: "start",    entered: 12402, exited: 12402 },
      { id: "audience", name: "Audience · CSV 12,402",     kind: "audience", entered: 12402, exited: 12402 },
      { id: "split",    name: "Channel routing · 60/40",   kind: "conditional", entered: 12402, exited: 12402 },
      { id: "whatsapp", name: "WhatsApp · reactivate_v3",  kind: "whatsapp", entered: 7441,  exited: 412   }, // 94.5% drop-off — template rejected by Meta
      { id: "voice",    name: "Voice Call · Reactivation", kind: "voice",    entered: 4961,  exited: 1208  }, // 75.6% drop-off — run aborted
      { id: "delay",    name: "Delay · 24h",               kind: "delay",    entered: 1620,  exited: 1620  },
      { id: "end",      name: "End",                       kind: "end",      entered: 1620,  exited: 1620  },
    ],
    edges: [
      { source: "start",    target: "audience", value: 12402 },
      { source: "audience", target: "split",    value: 12402 },
      { source: "split",    target: "whatsapp", value: 7441  },
      { source: "split",    target: "voice",    value: 4961  },
      { source: "whatsapp", target: "delay",    value: 412   }, // 5.5% delivered — template rejected
      { source: "voice",    target: "delay",    value: 1208  }, // 24.4% connected — run aborted
      { source: "delay",    target: "end",      value: 1620  },
    ],
  },
};


/* ───────────── New Trader Onboarding (simpler 2-channel flow) ───────────── */
const onboardingR1: RunRow = {
  id: "r_7102",
  startedAt: "Today · 09:10",
  status: "completed",
  audience: 4820,
  totalLeads: 4612,
  leadsProcessed: 1840,
  successRate: 15,
  kpi: { totalLeads: 4612, validLeads: 2980, leadsProcessed: 1840, successRate: 15 },
  sankey: {
    nodes: [
      { id: "audience",  name: "New signups · last 24h",  kind: "audience",    entered: 4820, exited: 4820 },
      { id: "whatsapp",  name: "WhatsApp · Welcome",      kind: "whatsapp",    entered: 4820, exited: 4612 },
      { id: "engaged",   name: "KYC started?",            kind: "conditional", entered: 4612, exited: 4612 },
      { id: "voice",     name: "Voice · KYC Assist",      kind: "voice",       entered: 1632, exited: 492  }, // 69.9% drop-off (assisted, did not complete)
      { id: "converted", name: "KYC Completed",           kind: "end",         entered: 1840, exited: 1840 },
      { id: "dropped",   name: "Dropped Off",             kind: "end",         entered: 2980, exited: 2980 },
    ],
    edges: [
      { source: "audience", target: "whatsapp",  value: 4820 },
      { source: "whatsapp", target: "engaged",   value: 4612 },
      { source: "whatsapp", target: "dropped",   value: 208  },
      { source: "engaged",  target: "converted", value: 1348 },  // KYC started from WA
      { source: "engaged",  target: "voice",     value: 1632 },  // KYC started but stalled → voice assist
      { source: "engaged",  target: "dropped",   value: 1632 },  // ignored
      { source: "voice",    target: "converted", value: 492  },
      { source: "voice",    target: "dropped",   value: 1140 },
    ],
  },
};

/* ───────────── KYC Drop-off Recovery (WhatsApp + Voice) ───────────── */
const kycR1: RunRow = {
  id: "r_6988",
  startedAt: "Apr 12 · 18:00",
  status: "completed",
  audience: 9802,
  totalLeads: 8210,
  leadsProcessed: 1402,
  successRate: 18,
  kpi: { totalLeads: 8210, validLeads: 3920, leadsProcessed: 1402, successRate: 18 },
  sankey: {
    nodes: [
      { id: "audience",  name: "Audience · KYC stalled",  kind: "audience",    entered: 9802, exited: 9802 },
      { id: "whatsapp",  name: "WhatsApp · KYC Reminder", kind: "whatsapp",    entered: 9802, exited: 8210 },
      { id: "engaged",   name: "Returned to app?",        kind: "conditional", entered: 8210, exited: 8210 },
      { id: "voice",     name: "Voice · KYC Assist",      kind: "voice",       entered: 4290, exited: 482  }, // 88.8% drop-off (assisted, did not resubmit)
      { id: "converted", name: "KYC Resubmitted",         kind: "end",         entered: 1402, exited: 1402 },
      { id: "dropped",   name: "Dropped Off",             kind: "end",         entered: 8400, exited: 8400 },
    ],
    edges: [
      { source: "audience", target: "whatsapp",  value: 9802 },
      { source: "whatsapp", target: "engaged",   value: 8210 },
      { source: "whatsapp", target: "dropped",   value: 1592 },
      { source: "engaged",  target: "converted", value: 920  },
      { source: "engaged",  target: "voice",     value: 4290 },
      { source: "engaged",  target: "dropped",   value: 3000 },
      { source: "voice",    target: "converted", value: 482  },
      { source: "voice",    target: "dropped",   value: 3808 },
    ],
  },
};

export const CAMPAIGNS: CampaignAnalytics[] = [
  { id: "c_001", name: "Dormant Trader Reactivation", runs: [dormantR1, dormantR2, dormantR3] },
  { id: "c_002", name: "New Trader Onboarding",        runs: [onboardingR1] },
  { id: "c_004", name: "KYC Drop-off Recovery",        runs: [kycR1] },
];
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
