import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { EChartsOption } from "echarts";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { BusinessAnalyticsPanel } from "@/components/analytics/BusinessAnalyticsPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
  Info,
  Download,
  Search,
  MessageCircle,
  Phone,
  ExternalLink,
} from "lucide-react";
import { EChart } from "@/components/analytics/EChart";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  DateRangePicker,
  defaultDateRange,
  rangeDays,
} from "@/components/analytics/DateRangePicker";
import type { DateRange } from "react-day-picker";
import { CampaignFlowView } from "@/components/analytics/CampaignFlowView";
import { VoiceChannelView } from "@/components/analytics/VoiceChannelView";
import {
  CAMPAIGNS,
  NODE_METRICS,
  nodeConfigSnapshot,
  buildChannelAssets,
  type ChannelKind,
  type SankeyNode,
  type SankeyNodeKind,
  type RunRow,
  type ChannelAsset,
  type CampaignAnalytics as CampaignAnalyticsData,
} from "@/lib/analytics-data";
import {
  generateLeads,
  leadsToCsv,
  downloadCsv,
  stageLabelFor,
  type Lead,
} from "@/lib/analytics-leads";
import { resolveWaTemplate, isBranchableButton } from "@/lib/wa-outputs";
import { resolveAgent } from "@/lib/agent-data";
import type { WaTemplate } from "@/lib/waba-templates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analytics")({
  component: Analytics,
  head: () => ({ meta: [{ title: "Analytics · Pi Agents FinServ" }] }),
});

type Tab = "campaign" | "channel";

const CHANNEL_CTA_LABEL: Record<ChannelKind, string> = {
  whatsapp: "View Detailed WhatsApp Analytics",
  voice: "View Detailed Voice Analytics",
  sms: "View Detailed SMS Analytics",
  ads: "View Detailed Ads Analytics",
};

// PRD-aligned KPI definitions used by info tooltips on drawer + channel cards.
const METRIC_INFO: Record<string, string> = {
  "Total Base":
    "Leads in this node's call base. Keeps accruing as new contacts enter (always-on) or is the fixed uploaded batch (time-scoped). Equals Pending + Running + Completed + Failed.",
  Running:
    "Calls currently in flight — dialing, ringing, or connected. A transient state that always resolves to Completed or Failed.",
  Completed:
    "Calls that finished successfully and produced a post-call analysis.",
  Sent: "Messages handed off to the provider for delivery.",
  Delivered: "Messages confirmed delivered to the device.",
  Read: "Messages the recipient opened.",
  Clicked: "Messages where the recipient tapped a link or CTA.",
  Replied: "Messages the recipient responded to.",
  Failed:
    "Attempts that did not succeed — a failed call, or a message rejected/undeliverable.",
  Impressions: "Times the ad was shown to a user.",
  Clicks: "Ad interactions that resulted in a click.",
  "Total Leads": "Leads captured from the ad campaign.",
  Entered: "Users who arrived at this node.",
  Exited: "Users who left this node toward a downstream step.",
  Conversion: "Exited ÷ Entered for this node.",
  "Conversion %": "Exited ÷ Entered for this node.",
  "Drop-off %": "Share of users who did not exit the node downstream.",
};

const CHANNEL_COLORS: Record<ChannelKind, string> = {
  whatsapp: "#22c55e",
  voice: "#a78bfa",
  sms: "#f59e0b",
  ads: "#06b6d4",
};
const NODE_COLOR: Record<SankeyNodeKind, string> = {
  start: "#22c55e",
  audience: "#94a3b8",
  apiToolCall: "#0ea5e9",
  aiTransform: "#a855f7",
  abSplit: "#64748b",
  whatsapp: "#22c55e",
  voice: "#a78bfa",
  sms: "#f59e0b",
  ads: "#06b6d4",
  conditional: "#64748b",
  delay: "#94a3b8",
  end: "#f59e0b",
};
const NODE_TYPE_LABEL: Record<SankeyNodeKind, string> = {
  start: "Start",
  audience: "Audience",
  apiToolCall: "API Tool Call",
  aiTransform: "AI Transformation",
  abSplit: "A/B Split",
  whatsapp: "WhatsApp",
  voice: "Voice Call",
  sms: "SMS",
  ads: "Ads Campaign",
  conditional: "Conditional Branch",
  delay: "Delay",
  end: "End",
};
const STATUS_TONE: Record<string, string> = {
  sent: "text-sky-600 bg-sky-500/10",
  delivered: "text-emerald-600 bg-emerald-500/10",
  read: "text-sky-600 bg-sky-500/10",
  clicked: "text-violet-600 bg-violet-500/10",
  replied: "text-indigo-600 bg-indigo-500/10",
  converted: "text-emerald-600 bg-emerald-500/10",
  running: "text-sky-600 bg-sky-500/10",
  completed: "text-emerald-600 bg-emerald-500/10",
  failed: "text-rose-600 bg-rose-500/10",
  dropped: "text-rose-600 bg-rose-500/10",
  pending: "text-muted-foreground bg-secondary",
};

// SMS and Ads channels are out of scope for v1 — only the live channels
// (WhatsApp / Voice) are exposed in Channel analytics.
const CHANNEL_TABS: {
  kind: ChannelKind;
  label: string;
  icon: typeof MessageCircle;
  assetLabel: string;
}[] = [
  {
    kind: "whatsapp",
    label: "WhatsApp",
    icon: MessageCircle,
    assetLabel: "Template",
  },
  { kind: "voice", label: "Voice", icon: Phone, assetLabel: "Voice Agent" },
];

/* ───────────── Channel selection state (lifted, supports deep-link) ─────────────
 *  Two viewing modes per channel tab:
 *    asset    — "How is THIS asset (template/agent) performing?" Single asset +
 *               date window; auto-rolls all C/V/R that include the asset within
 *               the window. Default landing for both Voice and WhatsApp.
 *    campaign — "How is the WhatsApp channel doing inside THIS one run?" Single
 *               Campaign / Version / Run; aggregates across all nodes of the
 *               channel kind within that one run.
 */

type ChannelMode = "asset" | "campaign";

type ChannelSelection = {
  kind: ChannelKind;
  mode: ChannelMode;
  /** Asset-mode: single Voice Agent id (Voice) or single Template id (WhatsApp). */
  assetId?: string;
  /** Asset-mode optional nested narrowing — campaign IDs DESELECTED from the
   *  default-all set; runs DESELECTED within still-included campaigns. */
  excludedCampaignIds?: string[];
  excludedRunIds?: string[];
  /** Campaign-mode: single ids. */
  campaignId?: string;
  versionId?: string;
  runId?: string;
};

/** Pre-select the "most recent" asset for asset-mode landing:
 *   • Voice  → the voice agent used by the latest run that contains a voice node.
 *   • WhatsApp → the template with the highest Sent (= node entered) volume in
 *                the latest run that contains a whatsapp node.
 *  Both resolve deterministically from the dev fixtures.
 */
function pickDefaultAsset(kind: ChannelKind): string | undefined {
  if (kind === "voice") {
    for (const c of CAMPAIGNS) {
      for (const r of c.runs) {
        for (const n of r.sankey.nodes) {
          if (n.kind === "voice") {
            const a = resolveAgent(n.config?.agent);
            if (a) return a.id;
          }
        }
      }
    }
    return undefined;
  }
  if (kind === "whatsapp") {
    for (const c of CAMPAIGNS) {
      for (const r of c.runs) {
        const byTpl = new Map<string, number>();
        for (const n of r.sankey.nodes) {
          if (n.kind !== "whatsapp" || n.config?.waMode === "freeform") continue;
          const tpl = resolveWaTemplate(n.config?.waTemplate);
          if (!tpl) continue;
          byTpl.set(tpl.id, (byTpl.get(tpl.id) ?? 0) + n.entered);
        }
        if (byTpl.size === 0) continue;
        let best: string | undefined;
        let bestSent = -1;
        for (const [id, sent] of byTpl)
          if (sent > bestSent) {
            best = id;
            bestSent = sent;
          }
        return best;
      }
    }
    return undefined;
  }
  return undefined;
}

/** Pre-select the latest campaign/version/run that contains a node of this kind
 *  — for Campaign-mode landing. */
function pickDefaultCampaignTriple(kind: ChannelKind): {
  campaignId?: string;
  versionId?: string;
  runId?: string;
} {
  for (const c of CAMPAIGNS) {
    for (let i = c.runs.length - 1; i >= 0; i--) {
      const r = c.runs[i];
      if (r.sankey.nodes.some((n) => n.kind === kind)) {
        return {
          campaignId: c.id,
          versionId: runVersionLabel(c, i),
          runId: r.id,
        };
      }
    }
  }
  return {};
}

/** Default landing state for a channel: Asset-mode with the most recent asset
 *  pre-selected; falls back to Campaign-mode only if no asset can be found. */
function defaultChannelSelection(kind: ChannelKind): ChannelSelection {
  const assetId = pickDefaultAsset(kind);
  if (assetId) return { kind, mode: "asset", assetId };
  return { kind, mode: "campaign", ...pickDefaultCampaignTriple(kind) };
}

function Analytics() {
  const [tab, setTab] = useState<Tab>("campaign");
  const [channelSel, setChannelSel] = useState<ChannelSelection>(() =>
    defaultChannelSelection("whatsapp"),
  );
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() =>
    defaultDateRange(7),
  );

  /** Drawer CTA → Channel tab. Deep-links into Campaign-mode pinned to the same
   *  C/V/R the user just inspected, so the channel view aggregates ALL nodes of
   *  that kind inside that one run (the natural "what is the channel doing in
   *  this run" question). */
  function goToChannel(opts: {
    kind: ChannelKind;
    campaignId: string;
    runId: string;
    nodeId: string;
  }) {
    const campaign = CAMPAIGNS.find((c) => c.id === opts.campaignId);
    const runIdx = campaign?.runs.findIndex((r) => r.id === opts.runId) ?? -1;
    setChannelSel({
      kind: opts.kind,
      mode: "campaign",
      campaignId: opts.campaignId,
      runId: opts.runId,
      versionId:
        campaign && runIdx >= 0 ? runVersionLabel(campaign, runIdx) : undefined,
    });
    setTab("channel");
  }

  return (
    <AppShell>
      <PageHeader
        title="Analytics"
        description="Campaign, and node-level performance across your workspace."
      />
      <PageTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "campaign", label: "Campaign" },
          { id: "channel", label: "Channel" },
        ]}
      />
      {tab === "campaign" ? (
        <CampaignAnalytics
          goToChannel={goToChannel}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />
      ) : (
        <ChannelAnalytics
          selection={channelSel}
          onSelectionChange={setChannelSel}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />
      )}
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
  dateRange,
  onDateRangeChange,
}: {
  goToChannel: (opts: {
    kind: ChannelKind;
    campaignId: string;
    runId: string;
    nodeId: string;
  }) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (r: DateRange | undefined) => void;
}) {
  const [campaignId, setCampaignId] = useState(CAMPAIGNS[0].id);
  const campaign = CAMPAIGNS.find((c) => c.id === campaignId)!;
  const [runId, setRunId] = useState(campaign.runs[0].id);
  // Campaign → Version → Run drill-down. A run is pinned to a specific published
  // version (editing on the fly mints a new version; the run id never changes),
  // so Analytics can scope by version then by an individual run within it.
  const [version, setVersion] = useState<string>("all");
  const versionLabels = useMemo(
    () =>
      Array.from(
        new Set(campaign.runs.map((_, i) => runVersionLabel(campaign, i))),
      ),
    [campaign],
  );
  const visibleRuns = useMemo(
    () =>
      version === "all"
        ? campaign.runs
        : campaign.runs.filter(
            (_, i) => runVersionLabel(campaign, i) === version,
          ),
    [campaign, version],
  );
  const run =
    visibleRuns.find((r) => r.id === runId) ??
    visibleRuns[0] ??
    campaign.runs[0];
  const [openNode, setOpenNode] = useState<SankeyNode | null>(null);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <FilterField label="Campaign">
          <Select
            value={campaignId}
            onValueChange={(v) => {
              setCampaignId(v);
              const next = CAMPAIGNS.find((c) => c.id === v)!;
              setVersion("all");
              setRunId(next.runs[0].id);
            }}
          >
            <SelectTrigger className="h-9 w-[280px] text-xs">
              <SelectValue placeholder="Campaign" />
            </SelectTrigger>
            <SelectContent>
              {CAMPAIGNS.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Version">
          <Select
            value={version}
            onValueChange={(v) => {
              setVersion(v);
              const next =
                v === "all"
                  ? campaign.runs
                  : campaign.runs.filter(
                      (_, i) => runVersionLabel(campaign, i) === v,
                    );
              if (next[0]) setRunId(next[0].id);
            }}
          >
            <SelectTrigger className="h-9 w-[140px] text-xs">
              <SelectValue placeholder="Version" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All versions</SelectItem>
              {versionLabels.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Run">
          <Select value={run.id} onValueChange={setRunId}>
            <SelectTrigger className="h-9 w-[420px] text-xs">
              <SelectValue placeholder="Run" />
            </SelectTrigger>
            <SelectContent>
              {visibleRuns.map((r) => {
                const idx = campaign.runs.indexOf(r);
                return (
                  <SelectItem key={r.id} value={r.id}>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-muted-foreground">
                        {r.code} · {runVersionLabel(campaign, idx)}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {r.runType === "always-on"
                          ? "Always-on"
                          : "Time-Scoped"}
                      </Badge>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </FilterField>
        {/* Date range is meaningful only for Always-on runs; a Time-Scoped run is a fixed batch. */}
        {run.runType === "always-on" && (
          <FilterField label="Date range">
            <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
          </FilterField>
        )}
      </div>

      {/* Business Analytics — per-useCase pack, above Campaign Analytics.
          Empty campaigns (no useCase) render a small hint instead of the pack. */}
      <BusinessAnalyticsPanel useCase={campaign.useCase} />

      {/* Campaign Analytics header, so the switch from Business → Campaign is obvious. */}
      <h2 className="mb-3 mt-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Campaign Analytics</h2>

      <div className="grid grid-cols-3 gap-3">
        <KPI
          label="Total Leads"
          value={run.kpi.totalLeads.toLocaleString()}
          info="Total input leads available to the Run, at a point in time."
        />
        <KPI
          label="Eligible Leads"
          value={run.kpi.validLeads.toLocaleString()}
          info="Leads that were valid and addressable, and entered the campaign workflow."
        />
        <KPI
          label="Completed Leads"
          value={run.kpi.leadsProcessed.toLocaleString()}
          info="Leads that completed the full campaign (reached the End Node of the selected Run)."
        />
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Campaign Flow</h3>
            <p className="text-[11px] text-muted-foreground">
              Each node shows Entered, Exited and Drop-off %. Click a node for
              details.
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
          goToChannel({
            kind: n.kind as ChannelKind,
            campaignId,
            runId: run.id,
            nodeId: n.id,
          });
          setOpenNode(null);
        }}
      />
    </>
  );
}

function KPI({
  label,
  value,
  info,
}: {
  label: string;
  value: string;
  info: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-muted-foreground/70 hover:text-foreground">
                <Info className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[220px] text-[11px]">
              {info}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

/* ───────────── Leads Table (per Run) ───────────── */

function LeadsTable({
  run,
  restrictToNodeIds,
  title = "Lead Analytics",
  hideStage = false,
}: {
  run: RunRow;
  restrictToNodeIds?: string[];
  title?: string;
  hideStage?: boolean;
}) {
  const allLeads = useMemo(() => generateLeads(run, run.kpi.validLeads), [run]);
  const scoped = useMemo(
    () =>
      restrictToNodeIds
        ? allLeads.filter((l) => restrictToNodeIds.includes(l.stageNodeId))
        : allLeads,
    [allLeads, restrictToNodeIds],
  );

  const [stageSel, setStageSel] = useState<string[]>([]);
  const [statusSel, setStatusSel] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);

  useEffect(() => {
    setPage(1);
  }, [stageSel, statusSel, q, pageSize, run.id, restrictToNodeIds]);

  // Two filter groups that narrow each other (bidirectional), mirroring the
  // Channel-analytics pattern: Group A = Node Stage, Group B = Status. Since a
  // node's possible statuses depend on its kind, picking node stages limits the
  // status list and vice-versa — so e.g. selecting only WhatsApp stages drops
  // voice-only statuses out of the Status menu.
  const passStage = (l: Lead) =>
    stageSel.length === 0 || stageSel.includes(l.stageNodeId);
  const passStatus = (l: Lead) =>
    statusSel.length === 0 || (!!l.status && statusSel.includes(l.status));

  // Node identity prefers the per-kind serial + description (the live builder's
  // scheme, e.g. `whatsapp_2 • Renewal`), falling back to the legacy positional
  // serial — matching the Leads "Stage" column and the Campaign Flow sub-headings.
  const serialByNode = useMemo(
    () => new Map(run.sankey.nodes.map((n, i) => [n.id, i + 1] as const)),
    [run],
  );

  const stageOptions = useMemo(() => {
    const ids = new Set(scoped.filter(passStatus).map((l) => l.stageNodeId));
    return run.sankey.nodes
      .filter((n) => ids.has(n.id))
      .map((n) => ({ value: n.id, label: stageLabelFor(n, serialByNode) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, statusSel, run, serialByNode]);

  const statusOptions = useMemo(() => {
    const set = new Set(
      scoped
        .filter(passStage)
        .map((l) => l.status)
        .filter(Boolean) as string[],
    );
    return Array.from(set).map((s) => ({
      value: s,
      label: s.charAt(0).toUpperCase() + s.slice(1),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, stageSel]);

  const filtered = useMemo(
    () =>
      scoped.filter((l) => {
        if (!passStage(l)) return false;
        if (!passStatus(l)) return false;
        if (q) {
          const s = q.toLowerCase();
          const hay = [
            l.id,
            l.name,
            l.phone,
            l.email,
            l.stageLabel,
            l.status ?? "",
            l.channel ?? "",
            l.updatedDate,
          ]
            .join(" ")
            .toLowerCase();
          if (!hay.includes(s)) return false;
        }
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, stageSel, statusSel, q],
  );

  const isVoice =
    restrictToNodeIds &&
    run.sankey.nodes.find((n) => restrictToNodeIds.includes(n.id))?.kind ===
      "voice";

  return (
    <div className="mt-4 rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-[11px] text-muted-foreground">
          {filtered.length.toLocaleString()}{" "}
          {filtered.length === 1 ? "lead" : "leads"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search all columns…"
              className="h-8 w-[200px] pl-7 text-xs"
            />
          </div>
          {!hideStage && (
            <div className="w-[190px]">
              <MultiSelect
                options={stageOptions}
                value={stageSel}
                onChange={setStageSel}
                allLabel="All nodes"
                triggerClassName="h-8"
              />
            </div>
          )}
          <div className="w-[160px]">
            <MultiSelect
              options={statusOptions}
              value={statusSel}
              onChange={setStatusSel}
              allLabel="All statuses"
              triggerClassName="h-8 capitalize"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() =>
              downloadCsv(`${run.id || "run"}_leads.csv`, leadsToCsv(filtered))
            }
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
              {!hideStage && (
                <th className="px-4 py-2 text-left font-medium">Node Stage</th>
              )}
              <th className="px-4 py-2 text-left font-medium">Status</th>
              {isVoice && (
                <th className="px-4 py-2 text-right font-medium">Duration</th>
              )}
              <th className="px-4 py-2 text-right font-medium">Last Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.slice((page - 1) * pageSize, page * pageSize).map((l) => (
              <LeadRow
                key={l.id}
                l={l}
                showDuration={!!isVoice}
                hideStage={hideStage}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-xs text-muted-foreground"
                >
                  No leads match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 &&
        (() => {
          const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
          const currentPage = Math.min(page, totalPages);
          const start = (currentPage - 1) * pageSize + 1;
          const end = Math.min(currentPage * pageSize, filtered.length);
          return (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              <div>
                Showing {start.toLocaleString()}–{end.toLocaleString()} of{" "}
                {filtered.length.toLocaleString()}
              </div>
              <div className="flex items-center gap-2">
                <span>Rows per page</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => setPageSize(Number(v))}
                >
                  <SelectTrigger className="h-7 w-[72px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[25, 50, 100, 250, 500].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Prev
                </Button>
                <span>
                  Page {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

function LeadRow({
  l,
  showDuration,
  hideStage,
}: {
  l: Lead;
  showDuration: boolean;
  hideStage?: boolean;
}) {
  return (
    <tr className="hover:bg-secondary/40">
      <td className="px-4 py-2.5 font-mono text-[12px]">{l.id}</td>
      <td className="px-4 py-2.5">{l.name}</td>
      <td className="px-4 py-2.5 font-mono text-[12px] text-muted-foreground">
        {l.phone}
      </td>
      {!hideStage && (
        <td className="px-4 py-2.5 text-[12px]">{l.stageLabel}</td>
      )}
      <td className="px-4 py-2.5">
        {l.status ? (
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-[10.5px] font-medium capitalize",
              STATUS_TONE[l.status] ?? STATUS_TONE.pending,
            )}
          >
            {l.status}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      {showDuration && (
        <td className="px-4 py-2.5 text-right font-mono text-[12px]">
          {l.duration
            ? `${Math.floor(l.duration / 60)}:${String(l.duration % 60).padStart(2, "0")}`
            : "—"}
        </td>
      )}
      <td className="px-4 py-2.5 text-right font-mono text-[12px] text-muted-foreground">
        {l.updatedAt}
      </td>
    </tr>
  );
}

/* ───────────── Node Drawer ───────────── */

const CHANNEL_KINDS = new Set<SankeyNodeKind>([
  "whatsapp",
  "voice",
  "sms",
  "ads",
]);

/** Compute per-kind metric tiles per PRD. */
function buildNodeMetrics(
  node: SankeyNode,
): { label: string; value: string }[] {
  const k = node.kind;
  if (k === "start" || k === "end")
    return [{ label: "Entered", value: node.entered.toLocaleString() }];

  if (k === "voice") {
    // Voice lifecycle KPI tiles match the Channel Voice view: Total Base /
    // Running / Completed / Failed. (Pending is implied by Total Base − the
    // other three and is rendered only inside the funnel, not as its own tile.)
    const totalBase = node.entered;
    const running = Math.round(totalBase * 0.08);
    const failed = Math.round(totalBase * 0.14);
    const completed = Math.max(
      0,
      totalBase - Math.round(totalBase * 0.06) - running - failed,
    );
    return [
      { label: "Total Base", value: totalBase.toLocaleString() },
      { label: "Running", value: running.toLocaleString() },
      { label: "Completed", value: completed.toLocaleString() },
      { label: "Failed", value: failed.toLocaleString() },
    ];
  }
  if (k === "whatsapp" || k === "sms" || k === "ads") {
    const m = NODE_METRICS[k as ChannelKind] ?? [];
    const keep: Record<string, string[]> = {
      whatsapp: ["Sent", "Delivered", "Read", "Clicked", "Replied"],
      sms: ["Sent", "Delivered", "Failed"],
      ads: ["Impressions", "Clicks", "Leads"],
    };
    return m
      .filter((x) => keep[k].includes(x.label))
      .map((x) => ({
        label: x.label === "Leads" ? "Total Leads" : x.label,
        value:
          typeof x.value === "number"
            ? x.value.toLocaleString()
            : String(x.value),
      }));
  }
  // audience / conditional / abSplit / delay → no node-specific metrics.
  // Entered / Exited / Drop-off already live in the Common Metrics block, so a
  // duplicate tile section here would just repeat it. Conditional / A-B split
  // still get their Branch Distribution section below.
  return [];
}

function NodeDrawer({
  node,
  run,
  onClose,
  onOpenChannelAnalytics,
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
  const config = node && !isTerminal ? nodeConfigSnapshot(node) : [];
  const dropPct =
    node && node.entered > 0
      ? ((node.entered - node.exited) / node.entered) * 100
      : 0;
  const nodeMetrics = node ? buildNodeMetrics(node) : [];

  // Branch distribution for conditional / A-B split. Labels prefer the real
  // handle label saved on the edge (e.g. "> ₹25,000", "Benefits") so the
  // drawer reads the same as the flow node and the builder. Falls back to a
  // generic A/B/C only when no handle label exists (legacy fixtures).
  const branchDist = useMemo(() => {
    if (!node || (kind !== "conditional" && kind !== "abSplit")) return [];
    const out = run.sankey.edges.filter((e) => e.source === node.id);
    const total = out.reduce((s, e) => s + e.value, 0) || 1;
    return out.map((e, i) => {
      const tgt = run.sankey.nodes.find((n) => n.id === e.target);
      const fallback =
        kind === "abSplit"
          ? `Variant ${String.fromCharCode(65 + i)}`
          : `Branch ${String.fromCharCode(65 + i)}`;
      return {
        label: e.handleLabel || e.sourceHandle || fallback,
        target: tgt?.name.split(" · ")[0] ?? e.target,
        value: e.value,
        pct: (e.value / total) * 100,
      };
    });
  }, [node, kind, run]);

  // Outcome distribution for WhatsApp nodes that expose ≥2 handles (button
  // templates, or Type-1 nodes with the split toggle on). Grouped by handle.
  const waOutcomeDist = useMemo(() => {
    if (!node || kind !== "whatsapp") return [];
    const out = run.sankey.edges.filter((e) => e.source === node.id);
    const byHandle = new Map<
      string,
      { label: string; target: string; value: number }
    >();
    out.forEach((e) => {
      const h = e.sourceHandle ?? "__advance__";
      const tgt = run.sankey.nodes.find((n) => n.id === e.target);
      const prev = byHandle.get(h);
      const label =
        e.handleLabel ??
        (h === "no_response"
          ? "No response"
          : h === "session_expired"
            ? "Session expired"
            : h === "reply_received"
              ? "Replied"
              : h === "advance" || h === "__advance__"
                ? "Continue"
                : h);
      if (prev) prev.value += e.value;
      else
        byHandle.set(h, {
          label,
          target: tgt?.name.split(" · ")[0] ?? e.target,
          value: e.value,
        });
    });
    const rows = [...byHandle.values()];
    if (rows.length < 2) return [];
    const total = rows.reduce((s, r) => s + r.value, 0) || 1;
    return rows.map((r) => ({ ...r, pct: (r.value / total) * 100 }));
  }, [node, kind, run]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[460px] max-w-[92vw] overflow-y-auto overflow-x-hidden sm:max-w-[460px]">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: kind ? NODE_COLOR[kind] : "" }}
            />
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
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Common Metrics
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <Stat
                small
                label="Entered"
                value={node?.entered.toLocaleString() ?? "—"}
                info={METRIC_INFO.Entered}
              />
              <Stat
                small
                label="Exited"
                value={node?.exited.toLocaleString() ?? "—"}
                info={METRIC_INFO.Exited}
              />
              <Stat
                small
                label="Drop-off %"
                value={node ? `${dropPct.toFixed(1)}%` : "—"}
                info={METRIC_INFO["Drop-off %"]}
              />
            </div>
          </section>
        )}

        {/* Node-specific metrics */}
        {nodeMetrics.length > 0 && (
          <section className="mt-5">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {kind ? NODE_TYPE_LABEL[kind] : ""} Metrics
            </h4>
            <div
              className={cn(
                "grid gap-2",
                nodeMetrics.length > 3 ? "grid-cols-2" : "grid-cols-3",
              )}
            >
              {nodeMetrics.map((m) => (
                <Stat
                  key={m.label}
                  small
                  label={m.label}
                  value={m.value}
                  info={METRIC_INFO[m.label]}
                />
              ))}
            </div>
            {isChannel && (
              <div className="mt-2 rounded-lg border border-border bg-card p-2">
                <MiniFunnel
                  kind={kind!}
                  metrics={nodeMetrics.map((m) => ({
                    label: m.label,
                    value: Number(m.value.replace(/[^\d.-]/g, "")) || 0,
                  }))}
                  color={NODE_COLOR[kind!]}
                />
              </div>
            )}
          </section>
        )}

        {/* Branch distribution — conditional / A-B split */}
        {branchDist.length > 0 && (
          <section className="mt-5">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Branch Distribution
            </h4>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {branchDist.map((b) => (
                <div
                  key={b.label}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]"
                >
                  <span className="font-medium">{b.label}</span>
                  <span className="text-muted-foreground">→ {b.target}</span>
                  <span className="ml-auto font-mono tabular-nums">
                    {b.value.toLocaleString()}
                  </span>
                  <span className="w-12 text-right font-medium tabular-nums">
                    {b.pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Outcome distribution — WhatsApp nodes with multiple handles */}
        {waOutcomeDist.length > 0 && (
          <section className="mt-5">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Outcome Distribution
            </h4>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {waOutcomeDist.map((b) => (
                <div
                  key={b.label}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]"
                >
                  <span className="font-medium">{b.label}</span>
                  <span className="text-muted-foreground">→ {b.target}</span>
                  <span className="ml-auto font-mono tabular-nums">
                    {b.value.toLocaleString()}
                  </span>
                  <span className="w-12 text-right font-medium tabular-nums">
                    {b.pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {config.length > 0 && (
          <section className="mt-5">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Configuration Snapshot
            </h4>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {config.map((f) => (
                <div
                  key={f.label}
                  className="flex items-center justify-between px-3 py-2 text-[12px]"
                >
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

function MiniFunnel({
  metrics,
  color,
  kind,
}: {
  metrics: { label: string; value: number }[];
  color: string;
  kind: SankeyNodeKind;
}) {
  // Per-kind funnel composition diverges from the KPI tile list:
  //  • whatsapp: funnel = Sent→Delivered→Read; Clicked + Replied are parallel
  //    terminal CONVERSIONS off Read, rendered as a combined container below.
  //  • voice: funnel = Total Base→Pending→Running→Completed; Failed is shown
  //    only in the KPI tiles, never in the funnel (it's a terminal failure
  //    state, not a stage on the success path). Pending is derived as
  //    base − (running + completed + failed).
  let linear: { label: string; value: number }[] = metrics;
  let outcomes: { label: string; value: number }[] = [];
  let readBase = 0;
  if (kind === "whatsapp") {
    const OUTCOME_LABELS = ["Clicked", "Replied"];
    linear = metrics.filter((m) => !OUTCOME_LABELS.includes(m.label));
    outcomes = metrics.filter((m) => OUTCOME_LABELS.includes(m.label));
    readBase = linear.find((m) => m.label === "Read")?.value ?? 0;
  } else if (kind === "voice") {
    const get = (l: string) => metrics.find((m) => m.label === l)?.value ?? 0;
    const totalBase = get("Total Base");
    const running = get("Running");
    const completed = get("Completed");
    const failed = get("Failed");
    const pending = Math.max(0, totalBase - running - completed - failed);
    linear = [
      { label: "Total Base", value: totalBase },
      { label: "Pending", value: pending },
      { label: "Running", value: running },
      { label: "Completed", value: completed },
    ];
  }
  const option = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      tooltip: { trigger: "item", formatter: "{b}: {c}" },
      series: [
        {
          type: "funnel",
          left: "5%",
          right: "5%",
          top: 8,
          bottom: 8,
          width: "90%",
          sort: "none",
          gap: 2,
          funnelAlign: "center",
          minSize: "30%",
          maxSize: "100%",
          // Labels render INSIDE the segments so they never overflow the narrow drawer.
          label: {
            position: "inside",
            fontSize: 10,
            color: "#fff",
            formatter: "{b} · {c}",
            overflow: "truncate",
          },
          labelLayout: { hideOverlap: true },
          itemStyle: { borderColor: "transparent", color },
          data: linear.map((m, i) => ({
            name: m.label,
            value: m.value,
            itemStyle: { color, opacity: 1 - i * 0.13 },
          })),
        },
      ],
    }),
    [linear, color],
  );
  return (
    <>
      <div className="h-[180px]">
        <EChart option={option} />
      </div>
      {outcomes.length > 0 && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Conversions from Read messages
          </p>
          <div className="grid grid-cols-2 gap-2 px-1" data-mini-conversions>
            {outcomes.map((m) => {
              const pct = readBase > 0 ? Math.round((m.value / readBase) * 100) : 0;
              return (
                <div key={m.label} className="rounded-md bg-muted/40 px-2 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {m.label}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {pct}% of Read
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">
                    {m.value.toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  small,
  info,
}: {
  label: string;
  value: string | number;
  small?: boolean;
  info?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {info && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground/70 hover:text-foreground">
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px] text-[11px]">
                {info}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <p
        className={cn(
          "mt-0.5 font-semibold tracking-tight",
          small ? "text-base" : "text-lg",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* ───────────── Channel Analytics ───────────── */

type Ref = { campaignId: string; runId: string; nodeId: string };

const CHANNEL_KPI_LABELS: Record<ChannelKind, string[]> = {
  whatsapp: ["Sent", "Delivered", "Read", "Clicked", "Replied"],
  // Voice renders via VoiceChannelView, not ChannelDetail; kept only for completeness.
  voice: ["Total Base", "Running", "Completed", "Failed"],
  sms: ["Sent", "Delivered", "Failed"],
  ads: ["Impressions", "Clicks", "Total Leads"],
};
const CHANNEL_TREND_LABELS: Record<ChannelKind, string[]> = {
  whatsapp: ["Sent", "Delivered", "Read"],
  voice: ["Completed", "Failed"],
  sms: ["Sent", "Delivered"],
  ads: ["Impressions", "Clicks", "Total Leads"],
};

function deriveChannelValues(
  kind: ChannelKind,
  entered: number,
): Record<string, number> {
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
      const running = Math.round(base * 0.08);
      const failed = Math.round(base * 0.14);
      const completed = Math.max(
        0,
        base - Math.round(base * 0.06) - running - failed,
      );
      return {
        "Total Base": base,
        Running: running,
        Completed: completed,
        Failed: failed,
      };
    }
    case "sms": {
      const sent = entered;
      return {
        Sent: sent,
        Delivered: Math.round(sent * 0.969),
        Failed: Math.round(sent * 0.031),
      };
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
  selection,
  onSelectionChange,
  dateRange,
  onDateRangeChange,
}: {
  selection: ChannelSelection;
  onSelectionChange: (s: ChannelSelection) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (r: DateRange | undefined) => void;
}) {
  const { kind, mode } = selection;
  const tabMeta = CHANNEL_TABS.find((c) => c.kind === kind)!;

  // ── Static indexes ─────────────────────────────────────────────────────────
  // Every (campaign, run, node) triple belonging to this channel kind.
  const allRefs: Ref[] = useMemo(() => {
    const refs: Ref[] = [];
    for (const c of CAMPAIGNS) {
      for (const r of c.runs) {
        for (const n of r.sankey.nodes) {
          if (n.kind === kind)
            refs.push({ campaignId: c.id, runId: r.id, nodeId: n.id });
        }
      }
    }
    return refs;
  }, [kind]);

  // refKey → the template the node sends (WhatsApp only; freeform → none).
  const templateByRefKey = useMemo(() => {
    const map = new Map<string, WaTemplate>();
    if (kind !== "whatsapp") return map;
    for (const c of CAMPAIGNS) {
      for (const r of c.runs) {
        for (const n of r.sankey.nodes) {
          if (n.kind !== "whatsapp") continue;
          const tpl =
            n.config?.waMode === "freeform"
              ? undefined
              : resolveWaTemplate(n.config?.waTemplate);
          if (tpl) map.set(`${c.id}|${r.id}|${n.id}`, tpl);
        }
      }
    }
    return map;
  }, [kind]);

  // refKey → the resolved Voice Agent on the node.
  const agentByRefKey = useMemo(() => {
    const map = new Map<string, ReturnType<typeof resolveAgent>>();
    if (kind !== "voice") return map;
    for (const c of CAMPAIGNS) {
      for (const r of c.runs) {
        for (const n of r.sankey.nodes) {
          if (n.kind !== "voice") continue;
          const a = resolveAgent(n.config?.agent);
          if (a) map.set(`${c.id}|${r.id}|${n.id}`, a);
        }
      }
    }
    return map;
  }, [kind]);

  // Asset picker options (Asset-mode): voice = unique resolved agents touching
  // any ref; whatsapp = unique templates touching any ref. Sorted by latest-use.
  const assetOptions = useMemo(() => {
    if (kind === "voice") {
      const m = new Map<string, { id: string; label: string }>();
      for (const r of allRefs) {
        const a = agentByRefKey.get(`${r.campaignId}|${r.runId}|${r.nodeId}`);
        if (a) m.set(a.id, { id: a.id, label: a.name });
      }
      return [...m.values()];
    }
    if (kind === "whatsapp") {
      const m = new Map<string, { id: string; label: string }>();
      for (const r of allRefs) {
        const t = templateByRefKey.get(`${r.campaignId}|${r.runId}|${r.nodeId}`);
        if (t) m.set(t.id, { id: t.id, label: t.name });
      }
      return [...m.values()];
    }
    return [] as { id: string; label: string }[];
  }, [kind, allRefs, agentByRefKey, templateByRefKey]);

  // refKey → asset id (voice agent id OR template id) — for Asset-mode scope.
  const refAssetId = (r: Ref): string | undefined => {
    const k = `${r.campaignId}|${r.runId}|${r.nodeId}`;
    if (kind === "voice") return agentByRefKey.get(k)?.id;
    if (kind === "whatsapp") return templateByRefKey.get(k)?.id;
    return undefined;
  };

  // ── Mode-driven resolved refs ──────────────────────────────────────────────
  const selectedRefs = useMemo(() => {
    if (mode === "asset") {
      const assetId = selection.assetId;
      const excludedCampaigns = new Set(selection.excludedCampaignIds ?? []);
      const excludedRuns = new Set(selection.excludedRunIds ?? []);
      return allRefs.filter((r) => {
        if (refAssetId(r) !== assetId) return false;
        if (excludedCampaigns.has(r.campaignId)) return false;
        if (excludedRuns.has(r.runId)) return false;
        return true;
      });
    }
    // campaign mode: pin to single campaign + run.
    return allRefs.filter(
      (r) =>
        r.campaignId === selection.campaignId && r.runId === selection.runId,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selection, allRefs, kind]);

  // Campaign-mode option lists (single-select cascade).
  const campaignChoices = useMemo(() => {
    const ids = new Set(allRefs.map((r) => r.campaignId));
    return CAMPAIGNS.filter((c) => ids.has(c.id));
  }, [allRefs]);
  const versionChoices = useMemo(() => {
    if (!selection.campaignId) return [] as string[];
    const c = CAMPAIGNS.find((x) => x.id === selection.campaignId);
    if (!c) return [];
    return [...new Set(c.runs.map((_, i) => runVersionLabel(c, i)))];
  }, [selection.campaignId]);
  const runChoices = useMemo(() => {
    if (!selection.campaignId) return [] as RunRow[];
    const c = CAMPAIGNS.find((x) => x.id === selection.campaignId);
    if (!c) return [];
    return c.runs.filter((_, i) => {
      if (!selection.versionId) return true;
      return runVersionLabel(c, i) === selection.versionId;
    });
  }, [selection.campaignId, selection.versionId]);

  // Asset-mode: list of (campaign, run) pairs touching the picked asset, for
  // the "Narrow campaigns" nested-tree filter.
  const assetCampaignTree = useMemo(() => {
    if (mode !== "asset" || !selection.assetId)
      return [] as { campaign: CampaignAnalyticsData; runs: RunRow[] }[];
    const byCampaign = new Map<string, Set<string>>();
    for (const r of allRefs) {
      if (refAssetId(r) !== selection.assetId) continue;
      let s = byCampaign.get(r.campaignId);
      if (!s) {
        s = new Set();
        byCampaign.set(r.campaignId, s);
      }
      s.add(r.runId);
    }
    return CAMPAIGNS.filter((c) => byCampaign.has(c.id)).map((c) => ({
      campaign: c,
      runs: c.runs.filter((r) => byCampaign.get(c.id)!.has(r.id)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selection.assetId, allRefs, kind]);

  // Date range visibility:
  //  • asset-mode → always shown (date is the primary control)
  //  • campaign-mode → shown only if the pinned run is always-on
  const pinnedRun =
    mode === "campaign"
      ? CAMPAIGNS.find((c) => c.id === selection.campaignId)?.runs.find(
          (r) => r.id === selection.runId,
        )
      : undefined;
  const showDateRange =
    mode === "asset" ||
    (mode === "campaign" && pinnedRun?.runType === "always-on");

  // Default the date window to "last 7 days" the first time we enter Asset-mode.
  useEffect(() => {
    if (mode === "asset" && !dateRange) onDateRangeChange(defaultDateRange(7));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Helpers for Asset-mode nested-tree toggles.
  const excludedCampaigns = new Set(selection.excludedCampaignIds ?? []);
  const excludedRuns = new Set(selection.excludedRunIds ?? []);
  const toggleCampaign = (cid: string) => {
    const next = new Set(excludedCampaigns);
    if (next.has(cid)) next.delete(cid);
    else next.add(cid);
    onSelectionChange({
      ...selection,
      excludedCampaignIds: [...next],
    });
  };
  const toggleRun = (rid: string) => {
    const next = new Set(excludedRuns);
    if (next.has(rid)) next.delete(rid);
    else next.add(rid);
    onSelectionChange({ ...selection, excludedRunIds: [...next] });
  };

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
              onClick={() => onSelectionChange(defaultChannelSelection(c.kind))}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className="h-3.5 w-3.5"
                style={{ color: active ? CHANNEL_COLORS[c.kind] : undefined }}
              />
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Mode dropdown sits inline left of the filters — reading flows
          left-to-right: pick mode → narrow within mode. Dropdown (not pill)
          keeps the row compact and aligned with the other field controls. */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <FilterField label="View by" className="sm:w-[200px]">
          <Select
            value={mode}
            onValueChange={(m) => {
              if (m === selection.mode) return;
              if (m === "asset") {
                const assetId =
                  selection.assetId ?? pickDefaultAsset(kind) ?? "";
                onSelectionChange({ kind, mode: "asset", assetId });
              } else {
                const t = pickDefaultCampaignTriple(kind);
                onSelectionChange({ kind, mode: "campaign", ...t });
              }
            }}
          >
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asset">{tabMeta.assetLabel}</SelectItem>
              <SelectItem value="campaign">Campaign run</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        {/* Mode-driven filter row */}
        {mode === "asset" ? (
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
            <FilterField label={tabMeta.assetLabel} className="sm:w-[280px]">
              <Select
                value={selection.assetId ?? ""}
                onValueChange={(v) =>
                  onSelectionChange({
                    kind,
                    mode: "asset",
                    assetId: v,
                  })
                }
              >
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue placeholder={`Pick a ${tabMeta.assetLabel}`} />
                </SelectTrigger>
                <SelectContent>
                  {assetOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Date range" className="sm:w-[280px]">
              <DateRangePicker
                value={dateRange}
                onChange={onDateRangeChange}
                align="start"
                className="w-full"
              />
            </FilterField>
            <FilterField label="Narrow campaigns (optional)" className="sm:w-[300px]">
              <CampaignTreeFilter
                tree={assetCampaignTree}
                excludedCampaigns={excludedCampaigns}
                excludedRuns={excludedRuns}
                onToggleCampaign={toggleCampaign}
                onToggleRun={toggleRun}
              />
            </FilterField>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
            <FilterField label="Campaign" className="sm:w-[260px]">
              <Select
                value={selection.campaignId ?? ""}
                onValueChange={(v) => {
                  const c = CAMPAIGNS.find((x) => x.id === v);
                  const lastIdx = c ? c.runs.length - 1 : -1;
                  onSelectionChange({
                    kind,
                    mode: "campaign",
                    campaignId: v,
                    versionId: c ? runVersionLabel(c, lastIdx) : undefined,
                    runId: c?.runs[lastIdx]?.id,
                  });
                }}
              >
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue placeholder="Pick a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaignChoices.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Version" className="sm:w-[140px]">
              <Select
                value={selection.versionId ?? ""}
                onValueChange={(v) => {
                  const c = CAMPAIGNS.find(
                    (x) => x.id === selection.campaignId,
                  );
                  let idx = -1;
                  if (c)
                    for (let i = c.runs.length - 1; i >= 0; i--)
                      if (runVersionLabel(c, i) === v) {
                        idx = i;
                        break;
                      }
                  onSelectionChange({
                    ...selection,
                    versionId: v,
                    runId: c && idx >= 0 ? c.runs[idx].id : undefined,
                  });
                }}
              >
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue placeholder="Pick a version" />
                </SelectTrigger>
                <SelectContent>
                  {versionChoices.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Run" className="sm:w-[300px]">
              <Select
                value={selection.runId ?? ""}
                onValueChange={(v) =>
                  onSelectionChange({ ...selection, runId: v })
                }
              >
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue placeholder="Pick a run" />
                </SelectTrigger>
                <SelectContent>
                  {runChoices.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{r.name}</span>
                        <span className="text-muted-foreground">
                          {r.code}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {r.runType === "always-on"
                            ? "Always-on"
                            : "Time-Scoped"}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            {showDateRange && (
              <FilterField label="Date range" className="sm:w-[260px]">
                <DateRangePicker
                  value={dateRange}
                  onChange={onDateRangeChange}
                  align="start"
                  className="w-full"
                />
              </FilterField>
            )}
          </div>
        )}
      </div>

      {selectedRefs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No {tabMeta.label} nodes found in scope.
        </div>
      ) : kind === "voice" ? (
        (() => {
          const vrefs = selectedRefs.map((ref) => {
            const run = CAMPAIGNS.find(
              (c) => c.id === ref.campaignId,
            )!.runs.find((r) => r.id === ref.runId)!;
            const node = run.sankey.nodes.find((n) => n.id === ref.nodeId)!;
            return { run, node };
          });
          return (
            <VoiceChannelView
              refs={vrefs}
              agentExplicitlyOne={mode === "asset" && !!selection.assetId}
            />
          );
        })()
      ) : (
        <ChannelDetail kind={kind} refs={selectedRefs} dateRange={dateRange} />
      )}
    </>
  );
}

/** Asset-mode optional narrower: a popover that lists every (campaign → its
 *  runs) touched by the selected asset. Default = nothing excluded (all in
 *  scope). Top-level checkbox deselects a whole campaign; expand a campaign to
 *  deselect individual runs. */
function CampaignTreeFilter({
  tree,
  excludedCampaigns,
  excludedRuns,
  onToggleCampaign,
  onToggleRun,
}: {
  tree: { campaign: CampaignAnalyticsData; runs: RunRow[] }[];
  excludedCampaigns: Set<string>;
  excludedRuns: Set<string>;
  onToggleCampaign: (id: string) => void;
  onToggleRun: (id: string) => void;
}) {
  const totalRuns = tree.reduce((s, t) => s + t.runs.length, 0);
  const activeCampaigns = tree.filter(
    (t) => !excludedCampaigns.has(t.campaign.id),
  ).length;
  const activeRuns = tree.reduce((s, t) => {
    if (excludedCampaigns.has(t.campaign.id)) return s;
    return s + t.runs.filter((r) => !excludedRuns.has(r.id)).length;
  }, 0);
  const allOn = activeCampaigns === tree.length && activeRuns === totalRuns;
  const display = allOn
    ? `All ${tree.length} campaign${tree.length === 1 ? "" : "s"}`
    : `${activeCampaigns}/${tree.length} campaigns · ${activeRuns}/${totalRuns} runs`;
  return (
    <details className="group relative">
      <summary className="flex h-9 w-full cursor-pointer list-none items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm">
        <span className="truncate">{display}</span>
        <span className="ml-2 text-muted-foreground">▾</span>
      </summary>
      <div className="absolute z-50 mt-1 max-h-[320px] w-[300px] overflow-auto rounded-md border border-border bg-popover p-2 shadow-md">
        {tree.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            No campaigns
          </p>
        ) : (
          tree.map(({ campaign, runs }) => {
            const cExcluded = excludedCampaigns.has(campaign.id);
            return (
              <div key={campaign.id} className="mb-1">
                <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={!cExcluded}
                    onChange={() => onToggleCampaign(campaign.id)}
                  />
                  <span className="truncate font-medium">{campaign.name}</span>
                </label>
                {!cExcluded && (
                  <div className="ml-6 border-l border-border pl-2">
                    {runs.map((r) => {
                      const idx = campaign.runs.indexOf(r);
                      const version = runVersionLabel(campaign, idx);
                      return (
                        <label
                          key={r.id}
                          className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-[11px] hover:bg-accent"
                        >
                          <input
                            type="checkbox"
                            checked={!excludedRuns.has(r.id)}
                            onChange={() => onToggleRun(r.id)}
                          />
                          <span className="truncate text-muted-foreground">
                            {version} · {r.name} · {r.code}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}

function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function FilterGroup({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-muted/30 p-2.5 ${className ?? ""}`}
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function ChannelDetail({
  kind,
  refs,
  dateRange,
}: {
  kind: ChannelKind;
  refs: Ref[];
  dateRange: DateRange | undefined;
}) {
  const color = CHANNEL_COLORS[kind];
  const days = rangeDays(dateRange);

  // Day-wise performance: which layers are visible (user-toggleable). For
  // WhatsApp that's Sent / Delivered / Read / Converted (combined Clicked+Replied).
  // Default = all four ON. Resets when kind changes.
  const DAYWISE_LABELS_WA = ["Sent", "Delivered", "Read", "Converted"] as const;
  const DAYWISE_LABELS = useMemo<readonly string[]>(
    () =>
      kind === "whatsapp"
        ? DAYWISE_LABELS_WA
        : (CHANNEL_TREND_LABELS[kind] as readonly string[]),
    [kind],
  );
  const [daywiseOn, setDaywiseOn] = useState<string[]>(() => [...DAYWISE_LABELS]);
  useEffect(() => {
    setDaywiseOn([...DAYWISE_LABELS]);
  }, [DAYWISE_LABELS]);

  // Aggregate entered across all selected refs, then derive channel values.
  //
  // Always-on partial-window math: for ALWAYS-ON runs that pre-date the date
  // window, only count leads that ENTERED the run within the window — so a
  // 7-day filter on a 30-day-old always-on run reports ~7/30 of its lifetime
  // total. Time-scoped runs ignore the date window (their span is fixed and
  // the date filter is hidden anyway). The scale is a linear approximation
  // sufficient for the prototype's deterministic mock data; production would
  // bucket events by their real timestamp.
  const totals = useMemo(() => {
    const ASSUMED_ALWAYS_ON_DAYS = 30;
    let entered = 0;
    for (const ref of refs) {
      const run = CAMPAIGNS.find((c) => c.id === ref.campaignId)?.runs.find(
        (r) => r.id === ref.runId,
      );
      const node = run?.sankey.nodes.find((n) => n.id === ref.nodeId);
      if (!node) continue;
      let e = node.entered;
      if (run?.runType === "always-on") {
        const frac = Math.min(1, days / ASSUMED_ALWAYS_ON_DAYS);
        e = Math.round(e * frac);
      }
      entered += e;
    }
    return deriveChannelValues(kind, entered);
  }, [kind, refs, days]);

  // WhatsApp templates in the current scope (one per node), with their pooled
  // base. Drives the Template-comparison chart and the "are clicks measurable?"
  // decision (only templates with a trackable button can produce a Clicked event).
  const scopeTemplates = useMemo(() => {
    if (kind !== "whatsapp")
      return [] as { template: WaTemplate; entered: number }[];
    const byId = new Map<string, { template: WaTemplate; entered: number }>();
    for (const ref of refs) {
      const run = CAMPAIGNS.find((c) => c.id === ref.campaignId)?.runs.find(
        (r) => r.id === ref.runId,
      );
      const node = run?.sankey.nodes.find((n) => n.id === ref.nodeId);
      if (!node) continue;
      const tpl =
        node.config?.waMode === "freeform"
          ? undefined
          : resolveWaTemplate(node.config?.waTemplate);
      if (!tpl) continue;
      const cur = byId.get(tpl.id) ?? { template: tpl, entered: 0 };
      cur.entered += node.entered;
      byId.set(tpl.id, cur);
    }
    return Array.from(byId.values());
  }, [kind, refs]);

  // Clicked is only a real, measurable outcome when at least one in-scope template
  // carries a trackable button (a tracked URL or a Quick Reply). Otherwise we hide
  // the Clicked KPI + funnel outcome entirely rather than showing a misleading 0.
  const clicksPossible = useMemo(
    () =>
      kind === "whatsapp" &&
      scopeTemplates.some(({ template }) =>
        (template.buttons ?? []).some(isBranchableButton),
      ),
    [kind, scopeTemplates],
  );

  // KPI cards: for WhatsApp, drop Clicked when no trackable template is in scope.
  const kpiLabels = useMemo(() => {
    if (kind !== "whatsapp") return CHANNEL_KPI_LABELS[kind];
    return CHANNEL_KPI_LABELS.whatsapp.filter(
      (l) => l !== "Clicked" || clicksPossible,
    );
  }, [kind, clicksPossible]);

  // The funnel is the linear delivery path (Sent → Delivered → Read); Clicked and
  // Replied are PARALLEL terminal outcomes that both branch off Read (neither is a
  // subset of the other). Non-WhatsApp channels keep a single linear funnel.
  const deliveryLabels =
    kind === "whatsapp"
      ? ["Sent", "Delivered", "Read"]
      : CHANNEL_KPI_LABELS[kind];
  const outcomeLabels =
    kind === "whatsapp"
      ? clicksPossible
        ? ["Clicked", "Replied"]
        : ["Replied"]
      : [];
  const funnelOrdered = useMemo(
    () => deliveryLabels.map((l) => ({ label: l, value: totals[l] ?? 0 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, clicksPossible, totals],
  );
  const readBase = totals["Read"] ?? 0;

  // Day-wise performance: per-day values per visible layer. WhatsApp layers
  // nest (Sent ⊇ Delivered ⊇ Read ⊇ Converted), so we DO NOT stack — each
  // layer is an independent filled area on the same baseline, drawn
  // largest-behind / smallest-in-front. Math stays honest. Day count derives
  // from the active date window (or run span in Campaign-mode).
  const daywise = useMemo(() => {
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const end = new Date();
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      dates.push(`${d.getDate()} ${MONTHS[d.getMonth()]}`);
    }
    const layerValue = (label: string): number => {
      if (label === "Converted")
        return (totals["Clicked"] ?? 0) + (totals["Replied"] ?? 0);
      return totals[label] ?? 0;
    };
    const series = DAYWISE_LABELS.map((label, idx) => {
      const seed = layerValue(label) / Math.max(1, days);
      const values: number[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const wave =
          0.78 +
          Math.sin((i + idx * 3 + 1) * 0.6) * 0.16 +
          Math.cos((i + idx) * 0.21) * 0.08;
        values.push(Math.max(0, Math.round(seed * wave)));
      }
      return { name: label, data: values };
    });
    return { dates, series };
  }, [DAYWISE_LABELS, totals, days]);

  const LAYER_COLOR: Record<string, string> = {
    Sent: "#22c55e",
    Delivered: "#0ea5e9",
    Read: "#a78bfa",
    Converted: "#f59e0b",
    Completed: "#22c55e",
    Failed: "#ef4444",
    Impressions: "#22c55e",
    Clicks: "#0ea5e9",
    "Total Leads": "#a78bfa",
  };

  const daywiseOption = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      grid: { left: 48, right: 16, top: 32, bottom: 60 },
      tooltip: { trigger: "axis", order: "valueDesc" },
      legend: {
        top: 0,
        right: 8,
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { fontSize: 11 },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: daywise.dates,
        axisLabel: { fontSize: 10 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { fontSize: 10 },
        name: "Volume",
        nameLocation: "middle",
        nameGap: 36,
        nameTextStyle: { fontSize: 10, color: "oklch(0.52 0.015 260)" },
      },
      dataZoom: [
        { type: "slider", height: 18, bottom: 8, minValueSpan: 1 },
        { type: "inside", minValueSpan: 1 },
      ],
      series: daywise.series
        .filter((s) => daywiseOn.includes(s.name))
        .map((s) => {
          const c = LAYER_COLOR[s.name] ?? color;
          return {
            type: "line",
            name: s.name,
            data: s.data,
            smooth: false,
            symbol: "none",
            lineStyle: { width: 1.5, color: c },
            color: c,
            areaStyle: { color: c, opacity: 0.35 },
            z: 100 - daywise.series.findIndex((x) => x.name === s.name),
          };
        }),
    }),
    [daywise, daywiseOn, color],
  );

  const funnelOption = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      tooltip: { trigger: "item", formatter: "{b}: {c}" },
      series: [
        {
          type: "funnel",
          left: "5%",
          right: "5%",
          top: 10,
          bottom: 10,
          sort: "none",
          gap: 2,
          funnelAlign: "center",
          minSize: "30%",
          maxSize: "100%",
          label: {
            position: "inside",
            color: "#fff",
            fontSize: 11,
            formatter: (p) => `${p.name}  ${Number(p.value).toLocaleString()}`,
          },
          data: funnelOrdered.map((m, i) => ({
            name: m.label,
            value: m.value,
            itemStyle: { color, opacity: 1 - i * 0.13 },
          })),
        },
      ],
    }),
    [funnelOrdered, color],
  );

  // Logs: pick the latest selected run, restrict to that run's selected nodes.
  const logsRun = useMemo<RunRow | undefined>(() => {
    if (refs.length === 0) return undefined;
    const lastRef = refs[0];
    return CAMPAIGNS.find((c) => c.id === lastRef.campaignId)?.runs.find(
      (r) => r.id === lastRef.runId,
    );
  }, [refs]);
  const logsNodeIds = useMemo(
    () =>
      logsRun
        ? refs.filter((r) => r.runId === logsRun.id).map((r) => r.nodeId)
        : [],
    [refs, logsRun],
  );
  const otherRunsInScope = useMemo(
    () => new Set(refs.map((r) => r.runId)).size,
    [refs],
  );

  const logTitle = "Logs";

  const daywiseOptionsForSelect = DAYWISE_LABELS.map((l) => ({
    value: l,
    label: l,
  }));

  return (
    <>
      <div
        className={cn(
          "grid gap-3",
          kpiLabels.length >= 5
            ? "grid-cols-5"
            : kpiLabels.length === 4
              ? "grid-cols-4"
              : "grid-cols-3",
        )}
      >
        {kpiLabels.map((label) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-card px-4 py-3"
          >
            <div className="flex items-center gap-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              {METRIC_INFO[label] && (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground/70 hover:text-foreground">
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px] text-[11px]">
                      {METRIC_INFO[label]}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="mt-1 text-xl font-semibold tracking-tight">
              {(totals[label] ?? 0).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Day-wise performance</h3>
            <div className="flex items-center gap-2">
              <div className="w-[200px]">
                <MultiSelect
                  options={daywiseOptionsForSelect}
                  value={daywiseOn}
                  onChange={setDaywiseOn}
                  allLabel="All layers"
                  searchable={false}
                />
              </div>
            </div>
          </div>
          <div className="h-[320px] p-2">
            <EChart option={daywiseOption} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Funnel</h3>
          </div>
          <div className="p-2">
            <div className={outcomeLabels.length ? "h-[196px]" : "h-[280px]"}>
              <EChart option={funnelOption} />
            </div>
            {outcomeLabels.length > 0 && (
              <div className="mt-1 border-t border-border/60 px-2 pt-2">
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Conversions from Read messages
                  </p>
                  <div
                    className={cn(
                      "grid gap-3",
                      outcomeLabels.length === 2 ? "grid-cols-2" : "grid-cols-1",
                    )}
                  >
                    {outcomeLabels.map((label) => {
                      const value = totals[label] ?? 0;
                      const pct =
                        readBase > 0 ? Math.round((value / readBase) * 100) : 0;
                      return (
                        <div key={label}>
                          <div className="flex items-baseline justify-between">
                            <span className="text-[11px] font-medium text-foreground">
                              {label}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {pct}% of Read
                            </span>
                          </div>
                          <p className="mt-0.5 text-base font-semibold tracking-tight tabular-nums">
                            {value.toLocaleString()}
                          </p>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {logsRun && (
        <>
          {otherRunsInScope > 1 && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Showing logs from {logsRun.startedAt}. {otherRunsInScope - 1}{" "}
              other run{otherRunsInScope - 1 === 1 ? "" : "s"} are aggregated in
              KPIs and charts above.
            </p>
          )}
          <LeadsTable
            run={logsRun}
            restrictToNodeIds={logsNodeIds}
            title={logTitle}
            hideStage={kind === "whatsapp"}
          />
        </>
      )}
    </>
  );
}
