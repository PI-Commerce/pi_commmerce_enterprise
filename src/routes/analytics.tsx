import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { EChartsOption } from "echarts";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
  Info, Download, Search, MessageCircle, Phone, MessageSquare, Megaphone,
  ExternalLink,
} from "lucide-react";
import { EChart } from "@/components/analytics/EChart";
import { MultiSelect } from "@/components/ui/multi-select";
import { DateRangePicker, defaultDateRange, rangeDays } from "@/components/analytics/DateRangePicker";
import type { DateRange } from "react-day-picker";
import { CampaignFlowView } from "@/components/analytics/CampaignFlowView";
import { VoiceChannelView } from "@/components/analytics/VoiceChannelView";
import {
  CAMPAIGNS, NODE_METRICS, NODE_CONFIG_BY_KIND, buildChannelAssets,
  type ChannelKind, type SankeyNode, type SankeyNodeKind, type RunRow,
  type ChannelAsset, type CampaignAnalytics as CampaignAnalyticsData,
} from "@/lib/analytics-data";
import { generateLeads, leadsToCsv, downloadCsv, type Lead } from "@/lib/analytics-leads";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analytics")({
  component: Analytics,
  head: () => ({ meta: [{ title: "Analytics · Pi Commerce Enterprise" }] }),
});

type Tab = "campaign" | "channel";

const CHANNEL_CTA_LABEL: Record<ChannelKind, string> = {
  whatsapp: "View Detailed WhatsApp Analytics",
  voice:    "View Detailed Voice Analytics",
  sms:      "View Detailed SMS Analytics",
  ads:      "View Detailed Ads Analytics",
};

// PRD-aligned KPI definitions used by info tooltips on drawer + channel cards.
const METRIC_INFO: Record<string, string> = {
  "Total Base":    "Contacts available for this node in the selected run.",
  "Initiated":     "Calls dialed out by the system.",
  "Connected":     "Calls where the carrier completed the connection.",
  "Answered":      "Calls picked up by the customer.",
  "Sent":          "Messages handed off to the provider for delivery.",
  "Delivered":     "Messages confirmed delivered to the device.",
  "Read":          "Messages the recipient opened.",
  "Clicked":       "Messages where the recipient tapped a link or CTA.",
  "Replied":       "Messages the recipient responded to.",
  "Failed":        "Sends rejected or undeliverable.",
  "Impressions":   "Times the ad was shown to a user.",
  "Clicks":        "Ad interactions that resulted in a click.",
  "Total Leads":   "Leads captured from the ad campaign.",
  "Entered":       "Users who arrived at this node.",
  "Exited":        "Users who left this node toward a downstream step.",
  "Conversion":    "Exited ÷ Entered for this node.",
  "Conversion %":  "Exited ÷ Entered for this node.",
  "Drop-off %":    "Share of users who did not exit the node downstream.",
};

const CHANNEL_COLORS: Record<ChannelKind, string> = {
  whatsapp: "#22c55e", voice: "#a78bfa", sms: "#f59e0b", ads: "#06b6d4",
};
const NODE_COLOR: Record<SankeyNodeKind, string> = {
  start: "#22c55e", audience: "#94a3b8", abSplit: "#64748b",
  whatsapp: "#22c55e", voice: "#a78bfa", sms: "#f59e0b", ads: "#06b6d4",
  conditional: "#64748b", delay: "#94a3b8", end: "#f59e0b",
};
const NODE_TYPE_LABEL: Record<SankeyNodeKind, string> = {
  start: "Start", audience: "Audience", abSplit: "A/B Split",
  whatsapp: "WhatsApp", voice: "Voice Call", sms: "SMS", ads: "Ads Campaign",
  conditional: "Conditional Branch", delay: "Delay", end: "End",
};
const STATUS_TONE: Record<string, string> = {
  delivered: "text-emerald-600 bg-emerald-500/10",
  read: "text-sky-600 bg-sky-500/10",
  clicked: "text-violet-600 bg-violet-500/10",
  replied: "text-indigo-600 bg-indigo-500/10",
  converted: "text-emerald-600 bg-emerald-500/10",
  connected: "text-sky-600 bg-sky-500/10",
  answered: "text-emerald-600 bg-emerald-500/10",
  interested: "text-violet-600 bg-violet-500/10",
  voicemail: "text-amber-600 bg-amber-500/10",
  failed: "text-rose-600 bg-rose-500/10",
  dropped: "text-rose-600 bg-rose-500/10",
  pending: "text-muted-foreground bg-secondary",
};

const CHANNEL_TABS: { kind: ChannelKind; label: string; icon: typeof MessageCircle; assetLabel: string }[] = [
  { kind: "whatsapp", label: "WhatsApp", icon: MessageCircle,   assetLabel: "WhatsApp Number" },
  { kind: "voice",    label: "Voice",    icon: Phone,           assetLabel: "Voice Agent" },
  { kind: "sms",      label: "SMS",      icon: MessageSquare,   assetLabel: "Sender ID" },
  { kind: "ads",      label: "Ads",      icon: Megaphone,       assetLabel: "Ad Campaign" },
];

/* ───────────── Channel selection state (lifted, supports deep-link) ─────────────
 *  Each filter is a list of selected IDs. An empty/undefined list means "All".
 */

type ChannelSelection = {
  kind: ChannelKind;
  assetIds?: string[];
  campaignIds?: string[];
  runIds?: string[];
  nodeIds?: string[];
};

function Analytics() {
  const [tab, setTab] = useState<Tab>("campaign");
  const [channelSel, setChannelSel] = useState<ChannelSelection>({ kind: "whatsapp" });
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => defaultDateRange(14));

  function goToChannel(opts: { kind: ChannelKind; campaignId: string; runId: string; nodeId: string }) {
    setChannelSel({
      kind: opts.kind,
      campaignIds: [opts.campaignId],
      runIds: [opts.runId],
      nodeIds: [opts.nodeId],
    });
    setTab("channel");
  }

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Analytics"
          description="Campaign, and node-level performance across your workspace."
        />
        <div className="pt-1">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>
      <PageTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "campaign", label: "Campaign" },
          { id: "channel",  label: "Channel" },
        ]}
      />
      {tab === "campaign"
        ? <CampaignAnalytics goToChannel={goToChannel} dateRange={dateRange} />
        : <ChannelAnalytics selection={channelSel} onSelectionChange={setChannelSel} dateRange={dateRange} />
      }
    </AppShell>
  );
}

/* ───────────── Campaign Analytics ───────────── */

/**
 * Synthesize a campaign-version label per run so Analytics aligns with the new
 * Campaign Version Management construct: a run always executes a specific
 * version, and the most recent run reflects the current (highest) version.
 */
function runVersionLabel(c: CampaignAnalyticsData, runIndex: number): string {
  return `v${c.runs.length - runIndex}`;
}

function CampaignAnalytics({
  goToChannel,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  dateRange: _dateRange,
}: {
  goToChannel: (opts: { kind: ChannelKind; campaignId: string; runId: string; nodeId: string }) => void;
  dateRange: DateRange | undefined;
}) {
  const [campaignId, setCampaignId] = useState(CAMPAIGNS[0].id);
  const campaign = CAMPAIGNS.find((c) => c.id === campaignId)!;
  // Version scopes the visible runs (Campaign → Version → Run cascade). "all" = every version.
  const [version, setVersion] = useState<string>("all");
  const versions = useMemo(() => campaign.runs.map((_, i) => runVersionLabel(campaign, i)), [campaign]);
  const visibleRuns = useMemo(
    () => (version === "all" ? campaign.runs : campaign.runs.filter((_, i) => runVersionLabel(campaign, i) === version)),
    [campaign, version],
  );
  const [runId, setRunId] = useState(campaign.runs[0].id);
  const run = visibleRuns.find((r) => r.id === runId) ?? visibleRuns[0] ?? campaign.runs[0];
  const [openNode, setOpenNode] = useState<SankeyNode | null>(null);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={campaignId}
          onValueChange={(v) => {
            setCampaignId(v);
            const next = CAMPAIGNS.find((c) => c.id === v)!;
            setVersion("all");
            setRunId(next.runs[0].id);
          }}
        >
          <SelectTrigger className="h-9 w-[280px] text-xs"><SelectValue placeholder="Campaign" /></SelectTrigger>
          <SelectContent>
            {CAMPAIGNS.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select
          value={version}
          onValueChange={(v) => {
            setVersion(v);
            const next = v === "all" ? campaign.runs : campaign.runs.filter((_, i) => runVersionLabel(campaign, i) === v);
            setRunId((next[0] ?? campaign.runs[0]).id);
          }}
        >
          <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Version" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All versions</SelectItem>
            {versions.map((v, i) => (
              <SelectItem key={v} value={v}>{v}{i === 0 && " (current)"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={run.id} onValueChange={setRunId}>
          <SelectTrigger className="h-9 w-[280px] text-xs"><SelectValue placeholder="Run" /></SelectTrigger>
          <SelectContent>
            {visibleRuns.map((r) => {
              const idx = campaign.runs.indexOf(r);
              return (
                <SelectItem key={r.id} value={r.id}>
                  {r.startedAt} · {runVersionLabel(campaign, idx)}{idx === 0 && " (latest)"}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="ml-auto text-[11px] capitalize">
          {run.status}
        </Badge>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KPI label="Total Leads"      value={run.kpi.totalLeads.toLocaleString()}     info="Total Leads available for the Run, at a point in time." />
        <KPI label="Valid Leads"      value={run.kpi.validLeads.toLocaleString()}     info="Total Leads that were addressable, to enter the campaign workflow." />
        <KPI label="Completed Leads"  value={run.kpi.leadsProcessed.toLocaleString()} info="Total Leads that reached the End Node of the selected Run." />
        <KPI label="Success Rate"     value={`${run.kpi.successRate.toLocaleString()}%`} info="The success rate, w.r.t. the total Valid Leads that entered the campaign workflow." />
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Campaign Flow</h3>
            <p className="text-[11px] text-muted-foreground">
              Each node shows Entered, Exited and Conversion %. Click a node for details.
            </p>
          </div>
        </div>
        <div className="h-[520px]">
          <CampaignFlowView run={run} onNodeClick={(n) => setOpenNode(n)} />
        </div>
      </div>

      <LeadsTable run={run} />

      <NodeDrawer
        node={openNode}
        run={run}
        onClose={() => setOpenNode(null)}
        onOpenChannelAnalytics={(n) => {
          goToChannel({ kind: n.kind as ChannelKind, campaignId, runId: run.id, nodeId: n.id });
          setOpenNode(null);
        }}
      />
    </>
  );
}

function KPI({ label, value, info }: { label: string; value: string; info: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-muted-foreground/70 hover:text-foreground"><Info className="h-3 w-3" /></button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[220px] text-[11px]">{info}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

/* ───────────── Leads Table (per Run) ───────────── */

function LeadsTable({ run, restrictToNodeIds, title = "Lead Analytics", hideStage = false }: {
  run: RunRow;
  restrictToNodeIds?: string[];
  title?: string;
  hideStage?: boolean;
}) {
  const allLeads = useMemo(() => generateLeads(run), [run]);
  const scoped = useMemo(
    () => (restrictToNodeIds ? allLeads.filter((l) => restrictToNodeIds.includes(l.stageNodeId)) : allLeads),
    [allLeads, restrictToNodeIds],
  );

  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);
  const [leadDateRange, setLeadDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => { setPage(1); }, [stageFilter, statusFilter, q, pageSize, run.id, restrictToNodeIds, leadDateRange]);

  const stageOptions = useMemo(() => {
    const ids = restrictToNodeIds ?? run.sankey.nodes.map((n) => n.id);
    return run.sankey.nodes.filter((n) => ids.includes(n.id));
  }, [run, restrictToNodeIds]);

  const statusOptions = useMemo(
    () => Array.from(new Set(scoped.map((l) => l.status))),
    [scoped],
  );

  const filtered = useMemo(() => scoped.filter((l) => {
    if (stageFilter !== "all" && l.stageNodeId !== stageFilter) return false;
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (leadDateRange?.from) {
      const from = new Date(leadDateRange.from); from.setHours(0,0,0,0);
      const to = new Date(leadDateRange.to ?? leadDateRange.from); to.setHours(23,59,59,999);
      const d = new Date(l.updatedDate + "T00:00:00");
      if (d < from || d > to) return false;
    }
    if (q) {
      const s = q.toLowerCase();
      const hay = [l.id, l.name, l.phone, l.email, l.stageLabel, l.status, l.channel ?? "", l.updatedDate]
        .join(" ").toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }), [scoped, stageFilter, statusFilter, q, leadDateRange]);

  const isVoice = restrictToNodeIds && run.sankey.nodes.find((n) => restrictToNodeIds.includes(n.id))?.kind === "voice";

  return (
    <div className="mt-4 rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-[11px] text-muted-foreground">{filtered.length.toLocaleString()} {filtered.length === 1 ? "lead" : "leads"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all columns…" className="h-8 w-[200px] pl-7 text-xs" />
          </div>
          {!hideStage && (
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Current Node" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All nodes</SelectItem>
                {stageOptions.map((n) => (
                  <SelectItem key={n.id} value={n.id}>{n.name.split(" · ")[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Run Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statusOptions.map((s) => (<SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>))}
            </SelectContent>
          </Select>
          <DateRangePicker value={leadDateRange} onChange={setLeadDateRange} />
          <Button
            variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
            onClick={() => downloadCsv(`${run.id || "run"}_leads.csv`, leadsToCsv(filtered))}
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left font-medium">Lead ID</th>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Phone</th>
              {!hideStage && <th className="px-4 py-2 text-left font-medium">Node Stage</th>}
              <th className="px-4 py-2 text-left font-medium">Status</th>
              {isVoice && <th className="px-4 py-2 text-right font-medium">Duration</th>}
              <th className="px-4 py-2 text-right font-medium">Last Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.slice((page - 1) * pageSize, page * pageSize).map((l) => (
              <LeadRow key={l.id} l={l} showDuration={!!isVoice} hideStage={hideStage} />
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-muted-foreground">No leads match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (() => {
        const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        const currentPage = Math.min(page, totalPages);
        const start = (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, filtered.length);
        return (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
            <div>Showing {start.toLocaleString()}–{end.toLocaleString()} of {filtered.length.toLocaleString()}</div>
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-7 w-[72px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[25, 50, 100, 250, 500].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Prev</Button>
              <span>Page {currentPage} / {totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</Button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function LeadRow({ l, showDuration, hideStage }: { l: Lead; showDuration: boolean; hideStage?: boolean }) {
  return (
    <tr className="hover:bg-secondary/40">
      <td className="px-4 py-2.5 font-mono text-[12px]">{l.id}</td>
      <td className="px-4 py-2.5">{l.name}</td>
      <td className="px-4 py-2.5 font-mono text-[12px] text-muted-foreground">{l.phone}</td>
      {!hideStage && <td className="px-4 py-2.5 text-[12px]">{l.stageLabel}</td>}
      <td className="px-4 py-2.5">
        <span className={cn("rounded-md px-2 py-0.5 text-[10.5px] font-medium capitalize", STATUS_TONE[l.status] ?? STATUS_TONE.pending)}>{l.status}</span>
      </td>
      {showDuration && (
        <td className="px-4 py-2.5 text-right font-mono text-[12px]">{l.duration ? `${Math.floor(l.duration/60)}:${String(l.duration%60).padStart(2,"0")}` : "—"}</td>
      )}
      <td className="px-4 py-2.5 text-right font-mono text-[12px] text-muted-foreground">{l.updatedAt}</td>
    </tr>
  );
}

/* ───────────── Node Drawer ───────────── */

const CHANNEL_KINDS = new Set<SankeyNodeKind>(["whatsapp", "voice", "sms", "ads"]);

/** Compute per-kind metric tiles per PRD. */
function buildNodeMetrics(node: SankeyNode): { label: string; value: string }[] {
  const k = node.kind;
  if (k === "start" || k === "end") return [{ label: "Entered", value: node.entered.toLocaleString() }];

  if (k === "voice") {
    const totalBase = node.entered;
    const initiated = Math.round(totalBase * 0.149);
    const connected = Math.round(initiated * 0.803);
    const answered  = Math.round(connected * 0.919);
    return [
      { label: "Total Base", value: totalBase.toLocaleString() },
      { label: "Initiated",  value: initiated.toLocaleString() },
      { label: "Connected",  value: connected.toLocaleString() },
      { label: "Answered",   value: answered.toLocaleString() },
    ];
  }
  if (k === "whatsapp" || k === "sms" || k === "ads") {
    const m = NODE_METRICS[k as ChannelKind] ?? [];
    const keep: Record<string, string[]> = {
      whatsapp: ["Sent","Delivered","Read","Clicked","Replied"],
      sms:      ["Sent","Delivered","Failed"],
      ads:      ["Impressions","Clicks","Leads"],
    };
    return m
      .filter((x) => keep[k].includes(x.label))
      .map((x) => ({
        label: x.label === "Leads" ? "Total Leads" : x.label,
        value: typeof x.value === "number" ? x.value.toLocaleString() : String(x.value),
      }));
  }
  // audience / conditional / abSplit / delay → common drop-off view only
  const dropPct = node.entered > 0 ? ((node.entered - node.exited) / node.entered) * 100 : 0;
  return [
    { label: "Entered", value: node.entered.toLocaleString() },
    { label: "Exited",  value: node.exited.toLocaleString() },
    { label: "Drop-off %", value: `${dropPct.toFixed(1)}%` },
  ];
}

function NodeDrawer({
  node, run, onClose, onOpenChannelAnalytics,
}: {
  node: SankeyNode | null;
  run: RunRow;
  onClose: () => void;
  onOpenChannelAnalytics: (n: SankeyNode) => void;
}) {
  const open = !!node;
  const kind = node?.kind;
  const isChannel = !!kind && CHANNEL_KINDS.has(kind);
  const isTerminal = kind === "start" || kind === "end";
  const config = kind && !isTerminal ? NODE_CONFIG_BY_KIND[kind] ?? [] : [];
  const convPct = node && node.entered > 0 ? (node.exited / node.entered) * 100 : 0;
  const nodeMetrics = node ? buildNodeMetrics(node) : [];

  // Branch distribution for conditional / A-B split.
  const branchDist = useMemo(() => {
    if (!node || (kind !== "conditional" && kind !== "abSplit")) return [];
    const out = run.sankey.edges.filter((e) => e.source === node.id);
    const total = out.reduce((s, e) => s + e.value, 0) || 1;
    return out.map((e, i) => {
      const tgt = run.sankey.nodes.find((n) => n.id === e.target);
      const label = kind === "abSplit" ? `Variant ${String.fromCharCode(65 + i)}` : `Branch ${String.fromCharCode(65 + i)}`;
      return {
        label,
        target: tgt?.name.split(" · ")[0] ?? e.target,
        value: e.value,
        pct: (e.value / total) * 100,
      };
    });
  }, [node, kind, run]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[460px] overflow-y-auto sm:max-w-[460px]">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: kind ? NODE_COLOR[kind] : "" }} />
            <SheetTitle className="text-base">{node?.name}</SheetTitle>
          </div>
          <SheetDescription className="text-[11px]">
            {kind ? NODE_TYPE_LABEL[kind] : ""} node
          </SheetDescription>
          {isChannel && node && (
            <button
              onClick={() => onOpenChannelAnalytics(node)}
              className="mt-2 inline-flex items-center gap-1.5 self-start rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary"
            >
              {CHANNEL_CTA_LABEL[kind as ChannelKind]}
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </SheetHeader>

        {/* Common metrics — every node */}
        {!isTerminal && (
          <section className="mt-5">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Common Metrics</h4>
            <div className="grid grid-cols-3 gap-2">
              <Stat small label="Entered" value={node?.entered.toLocaleString() ?? "—"} info={METRIC_INFO.Entered} />
              <Stat small label="Exited"  value={node?.exited.toLocaleString() ?? "—"} info={METRIC_INFO.Exited} />
              <Stat small label="Conversion %" value={node ? `${convPct.toFixed(1)}%` : "—"} info={METRIC_INFO["Conversion %"]} />
            </div>
          </section>
        )}

        {/* Node-specific metrics */}
        {nodeMetrics.length > 0 && (
          <section className="mt-5">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {kind ? NODE_TYPE_LABEL[kind] : ""} Metrics
            </h4>
            <div className={cn("grid gap-2", nodeMetrics.length > 3 ? "grid-cols-2" : "grid-cols-3")}>
              {nodeMetrics.map((m) => (
                <Stat key={m.label} small label={m.label} value={m.value} info={METRIC_INFO[m.label]} />
              ))}
            </div>
            {isChannel && (
              <div className="mt-2 h-[200px] rounded-lg border border-border bg-card p-2">
                <MiniFunnel
                  metrics={nodeMetrics.map((m) => ({ label: m.label, value: Number(m.value.replace(/[^\d.-]/g, "")) || 0 }))}
                  color={NODE_COLOR[kind!]}
                />
              </div>
            )}
          </section>
        )}

        {/* Branch distribution — conditional / A-B split */}
        {branchDist.length > 0 && (
          <section className="mt-5">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Branch Distribution</h4>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {branchDist.map((b) => (
                <div key={b.label} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]">
                  <span className="font-medium">{b.label}</span>
                  <span className="text-muted-foreground">→ {b.target}</span>
                  <span className="ml-auto font-mono tabular-nums">{b.value.toLocaleString()}</span>
                  <span className="w-12 text-right font-medium tabular-nums">{b.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {config.length > 0 && (
          <section className="mt-5">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Configuration Snapshot</h4>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {config.map((f) => (
                <div key={f.label} className="flex items-center justify-between px-3 py-2 text-[12px]">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="font-medium">{f.value}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </SheetContent>
    </Sheet>
  );
}


function MiniFunnel({ metrics, color }: { metrics: { label: string; value: number }[]; color: string }) {
  const option = useMemo<EChartsOption>(() => ({
    backgroundColor: "transparent",
    tooltip: { trigger: "item", formatter: "{b}: {c}" },
    series: [{
      type: "funnel", left: "5%", right: "5%", top: 8, bottom: 8,
      sort: "none", gap: 2,
      funnelAlign: "center",
      minSize: "30%", maxSize: "100%",
      label: { fontSize: 11, formatter: "{b}  {c}" },
      itemStyle: { borderColor: "transparent", color },
      data: metrics.map((m, i) => ({ name: m.label, value: m.value, itemStyle: { color, opacity: 1 - i * 0.13 } })),
    }],
  }), [metrics, color]);
  return <EChart option={option} />;
}

function Stat({ label, value, small, info }: { label: string; value: string | number; small?: boolean; info?: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        {info && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground/70 hover:text-foreground"><Info className="h-3 w-3" /></button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px] text-[11px]">{info}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <p className={cn("mt-0.5 font-semibold tracking-tight", small ? "text-base" : "text-lg")}>{value}</p>
    </div>
  );
}

/* ───────────── Channel Analytics ───────────── */

type Ref = { campaignId: string; runId: string; nodeId: string };

const CHANNEL_KPI_LABELS: Record<ChannelKind, string[]> = {
  whatsapp: ["Sent", "Delivered", "Read", "Clicked", "Replied"],
  voice:    ["Total Base", "Initiated", "Connected", "Answered"],
  sms:      ["Sent", "Delivered", "Failed"],
  ads:      ["Impressions", "Clicks", "Total Leads"],
};
const CHANNEL_TREND_LABELS: Record<ChannelKind, string[]> = {
  whatsapp: ["Sent", "Delivered", "Read"],
  voice:    ["Initiated", "Connected", "Answered"],
  sms:      ["Sent", "Delivered"],
  ads:      ["Impressions", "Clicks", "Total Leads"],
};

function deriveChannelValues(kind: ChannelKind, entered: number): Record<string, number> {
  switch (kind) {
    case "whatsapp": {
      const sent = entered;
      return {
        Sent: sent,
        Delivered: Math.round(sent * 0.94),
        Read: Math.round(sent * 0.55),
        Clicked: Math.round(sent * 0.32),
        Replied: Math.round(sent * 0.16),
      };
    }
    case "voice": {
      const base = entered;
      const initiated = Math.round(base * 0.149);
      const connected = Math.round(initiated * 0.803);
      const answered  = Math.round(connected * 0.919);
      return { "Total Base": base, Initiated: initiated, Connected: connected, Answered: answered };
    }
    case "sms": {
      const sent = entered;
      return { Sent: sent, Delivered: Math.round(sent * 0.969), Failed: Math.round(sent * 0.031) };
    }
    case "ads": {
      const base = Math.max(entered, 1);
      return {
        Impressions: base * 100,
        Clicks: Math.round(base * 3.9),
        "Total Leads": Math.round(base * 0.42),
      };
    }
  }
}

function ChannelAnalytics({
  selection, onSelectionChange, dateRange,
}: {
  selection: ChannelSelection;
  onSelectionChange: (s: ChannelSelection) => void;
  dateRange: DateRange | undefined;
}) {
  const { kind } = selection;

  // Asset index for current kind.
  const assets = useMemo<ChannelAsset[]>(() => buildChannelAssets(kind), [kind]);

  // All refs (campaign, run, node) belonging to this channel kind.
  const allRefs: Ref[] = useMemo(() => {
    const refs: Ref[] = [];
    for (const c of CAMPAIGNS) {
      for (const r of c.runs) {
        for (const n of r.sankey.nodes) {
          if (n.kind === kind) refs.push({ campaignId: c.id, runId: r.id, nodeId: n.id });
        }
      }
    }
    return refs;
  }, [kind]);

  // Asset → set of refs covered.
  const refsByAsset = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of assets) {
      map.set(a.id, new Set(a.refs.map((r) => `${r.campaignId}|${r.runId}|${r.nodeId}`)));
    }
    return map;
  }, [assets]);

  const assetSel = selection.assetIds ?? [];
  const campaignSel = selection.campaignIds ?? [];
  const runSel = selection.runIds ?? [];
  const nodeSel = selection.nodeIds ?? [];

  // Cascade filters: asset → campaign → run → node
  const refsAfterAsset = useMemo(() => {
    if (assetSel.length === 0) return allRefs;
    const allowed = new Set<string>();
    for (const aid of assetSel) {
      const s = refsByAsset.get(aid);
      if (s) s.forEach((k) => allowed.add(k));
    }
    return allRefs.filter((r) => allowed.has(`${r.campaignId}|${r.runId}|${r.nodeId}`));
  }, [allRefs, assetSel, refsByAsset]);

  const campaignOptions = useMemo(() => {
    const ids = new Set(refsAfterAsset.map((r) => r.campaignId));
    return CAMPAIGNS.filter((c) => ids.has(c.id));
  }, [refsAfterAsset]);

  const refsAfterCampaign = useMemo(
    () => (campaignSel.length === 0 ? refsAfterAsset : refsAfterAsset.filter((r) => campaignSel.includes(r.campaignId))),
    [refsAfterAsset, campaignSel],
  );

  const runOptions = useMemo(() => {
    const ids = new Set(refsAfterCampaign.map((r) => r.runId));
    const rows: { run: RunRow; campaignName: string }[] = [];
    for (const c of CAMPAIGNS) {
      for (const r of c.runs) {
        if (ids.has(r.id)) rows.push({ run: r, campaignName: c.name });
      }
    }
    return rows;
  }, [refsAfterCampaign]);

  const refsAfterRun = useMemo(
    () => (runSel.length === 0 ? refsAfterCampaign : refsAfterCampaign.filter((r) => runSel.includes(r.runId))),
    [refsAfterCampaign, runSel],
  );

  const nodeOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    for (const ref of refsAfterRun) {
      const campaign = CAMPAIGNS.find((c) => c.id === ref.campaignId);
      const run = campaign?.runs.find((r) => r.id === ref.runId);
      const node = run?.sankey.nodes.find((n) => n.id === ref.nodeId);
      if (!node) continue;
      const key = `${ref.runId}::${ref.nodeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const nodeLabel = node.name.split(" · ").slice(1).join(" · ") || node.name;
      opts.push({ value: key, label: `${nodeLabel} · ${run!.startedAt}` });
    }
    return opts;
  }, [refsAfterRun]);

  const selectedRefs = useMemo(() => {
    if (nodeSel.length === 0) return refsAfterRun;
    const keep = new Set(nodeSel);
    return refsAfterRun.filter((r) => keep.has(`${r.runId}::${r.nodeId}`));
  }, [refsAfterRun, nodeSel]);

  const tabMeta = CHANNEL_TABS.find((c) => c.kind === kind)!;

  return (
    <>
      {/* Channel sub-tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        {CHANNEL_TABS.map((c) => {
          const Icon = c.icon;
          const active = c.kind === kind;
          return (
            <button
              key={c.kind}
              onClick={() => onSelectionChange({ kind: c.kind })}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: active ? CHANNEL_COLORS[c.kind] : undefined }} />
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Standardized filter row: Asset · Campaign · Run · Node — all multi-select with "All" */}
      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
        <FilterField label={tabMeta.assetLabel}>
          <MultiSelect
            options={assets.map((a) => ({ value: a.id, label: a.label }))}
            value={assetSel}
            onChange={(v) => onSelectionChange({ ...selection, assetIds: v, campaignIds: [], runIds: [], nodeIds: [] })}
            allLabel={`All ${tabMeta.assetLabel}s`}
          />
        </FilterField>
        <FilterField label="Campaign">
          <MultiSelect
            options={campaignOptions.map((c) => ({ value: c.id, label: c.name }))}
            value={campaignSel}
            onChange={(v) => onSelectionChange({ ...selection, campaignIds: v, runIds: [], nodeIds: [] })}
            allLabel="All Campaigns"
          />
        </FilterField>
        <FilterField label="Run">
          <MultiSelect
            options={runOptions.map(({ run, campaignName }) => ({
              value: run.id,
              label: `${run.startedAt} · ${campaignName}`,
            }))}
            value={runSel}
            onChange={(v) => onSelectionChange({ ...selection, runIds: v, nodeIds: [] })}
            allLabel="All Runs"
          />
        </FilterField>
        <FilterField label="Node">
          <MultiSelect
            options={nodeOptions}
            value={nodeSel}
            onChange={(v) => onSelectionChange({ ...selection, nodeIds: v })}
            allLabel="All Nodes"
          />
        </FilterField>
      </div>

      {selectedRefs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No {tabMeta.label} nodes found in scope.
        </div>
      ) : kind === "voice" ? (() => {
          // Voice analytics view is locked to the dashboard design from 29 May.
          // Always render VoiceChannelView using the first selected voice node.
          const ref = selectedRefs[0];
          const run = CAMPAIGNS.find((c) => c.id === ref.campaignId)!.runs.find((r) => r.id === ref.runId)!;
          const node = run.sankey.nodes.find((n) => n.id === ref.nodeId)!;
          return <VoiceChannelView run={run} node={node} />;
        })()
        : <ChannelDetail kind={kind} refs={selectedRefs} dateRange={dateRange} />
      }
    </>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}


function ChannelDetail({ kind, refs, dateRange }: { kind: ChannelKind; refs: Ref[]; dateRange: DateRange | undefined }) {
  const color = CHANNEL_COLORS[kind];
  const [trendMetrics, setTrendMetrics] = useState<string[]>(() => CHANNEL_TREND_LABELS[kind]);
  const days = rangeDays(dateRange);

  // Reset trend selection when kind changes.
  useEffect(() => { setTrendMetrics(CHANNEL_TREND_LABELS[kind]); }, [kind]);

  // Aggregate entered across all selected refs, then derive channel values.
  const totals = useMemo(() => {
    let entered = 0;
    for (const ref of refs) {
      const run = CAMPAIGNS.find((c) => c.id === ref.campaignId)?.runs.find((r) => r.id === ref.runId);
      const node = run?.sankey.nodes.find((n) => n.id === ref.nodeId);
      if (node) entered += node.entered;
    }
    return deriveChannelValues(kind, entered);
  }, [kind, refs]);

  const kpiLabels = CHANNEL_KPI_LABELS[kind];
  // Per PRD funnel order = same as KPI order
  const funnelOrdered = useMemo(
    () => kpiLabels.map((l) => ({ label: l, value: totals[l] ?? 0 })),
    [kpiLabels, totals],
  );

  const trendSeries = useMemo(() => {
    const labels = trendMetrics.length > 0 ? trendMetrics : CHANNEL_TREND_LABELS[kind];
    const today = new Date();
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(`${d.getMonth() + 1}/${d.getDate()}`);
    }
    const series = labels.map((label, idx) => {
      const seed = (totals[label] ?? 100) / days;
      const values: number[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const wave = 0.78 + Math.sin((i + idx * 3 + 1) * 0.6) * 0.16 + Math.cos((i + idx) * 0.21) * 0.08;
        values.push(Math.max(1, Math.round(seed * wave)));
      }
      return { name: label, data: values };
    });
    return { dates, series };
  }, [trendMetrics, totals, kind, days]);

  const trendOption = useMemo<EChartsOption>(() => ({
    backgroundColor: "transparent",
    grid: { left: 44, right: 16, top: 32, bottom: 36 },
    tooltip: { trigger: "axis" },
    legend: { top: 0, right: 8, itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 11 } },
    xAxis: {
      type: "category", data: trendSeries.dates, axisLabel: { fontSize: 10 },
      name: "Date", nameLocation: "middle", nameGap: 24, nameTextStyle: { fontSize: 10, color: "oklch(0.52 0.015 260)" },
    },
    yAxis: {
      type: "value", axisLine: { show: false }, axisLabel: { fontSize: 10 },
      name: "Volume", nameLocation: "middle", nameGap: 36, nameTextStyle: { fontSize: 10, color: "oklch(0.52 0.015 260)" },
    },
    series: trendSeries.series.map((s, i) => ({
      type: "line", name: s.name, data: s.data, smooth: true, symbol: "none",
      lineStyle: { width: 2, color: i === 0 ? color : undefined },
      areaStyle: i === 0 ? { color, opacity: 0.12 } : undefined,
    })),
  }), [trendSeries, color]);

  const funnelOption = useMemo<EChartsOption>(() => ({
    backgroundColor: "transparent",
    tooltip: { trigger: "item", formatter: "{b}: {c}" },
    series: [{
      type: "funnel", left: "5%", right: "5%", top: 10, bottom: 10,
      sort: "none", gap: 2,
      funnelAlign: "center",
      minSize: "30%", maxSize: "100%",
      label: { fontSize: 11, formatter: "{b}  {c}" },
      data: funnelOrdered.map((m, i) => ({
        name: m.label, value: m.value,
        itemStyle: { color, opacity: 1 - i * 0.13 },
      })),
    }],
  }), [funnelOrdered, color]);

  // Logs: pick the latest selected run, restrict to that run's selected nodes.
  const logsRun = useMemo<RunRow | undefined>(() => {
    if (refs.length === 0) return undefined;
    const lastRef = refs[0];
    return CAMPAIGNS.find((c) => c.id === lastRef.campaignId)?.runs.find((r) => r.id === lastRef.runId);
  }, [refs]);
  const logsNodeIds = useMemo(
    () => (logsRun ? refs.filter((r) => r.runId === logsRun.id).map((r) => r.nodeId) : []),
    [refs, logsRun],
  );
  const otherRunsInScope = useMemo(
    () => new Set(refs.map((r) => r.runId)).size,
    [refs],
  );

  const logTitle = "Logs";

  const trendOptionsForSelect = CHANNEL_TREND_LABELS[kind].map((l) => ({ value: l, label: l }));

  return (
    <>
      <div className={cn("grid gap-3", kpiLabels.length >= 5 ? "grid-cols-5" : kpiLabels.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
        {kpiLabels.map((label) => (
          <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
              {METRIC_INFO[label] && (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground/70 hover:text-foreground"><Info className="h-3 w-3" /></button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px] text-[11px]">{METRIC_INFO[label]}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="mt-1 text-xl font-semibold tracking-tight">{(totals[label] ?? 0).toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Trend Chart</h3>
            <div className="flex items-center gap-2">
              <div className="w-[180px]">
                <MultiSelect
                  options={trendOptionsForSelect}
                  value={trendMetrics}
                  onChange={setTrendMetrics}
                  allLabel="All metrics"
                  searchable={false}
                />
              </div>
            </div>
          </div>
          <div className="h-[280px] p-2"><EChart option={trendOption} /></div>
        </div>
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3"><h3 className="text-sm font-semibold">Funnel</h3></div>
          <div className="h-[280px] p-2"><EChart option={funnelOption} /></div>
        </div>
      </div>

      {logsRun && (
        <>
          {otherRunsInScope > 1 && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Showing logs from {logsRun.startedAt}. {otherRunsInScope - 1} other run{otherRunsInScope - 1 === 1 ? "" : "s"} are aggregated in KPIs and charts above.
            </p>
          )}
          <LeadsTable run={logsRun} restrictToNodeIds={logsNodeIds} title={logTitle} hideStage={kind === "whatsapp"} />
        </>
      )}
    </>
  );
}

