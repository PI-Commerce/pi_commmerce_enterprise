import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, MoreHorizontal, Copy, Workflow,
  CircleDashed, CircleCheck, CircleX, CirclePause, CircleDot,
  Pause, Play, Square, ArrowUp, ArrowDown, ChevronsUpDown, Check,
  Upload, Download, FileSpreadsheet, Database, ChevronLeft, ChevronRight, ChevronDown,
  Webhook, Plug, Rocket, AlertCircle,
  LayoutTemplate, Sparkles, MessageCircle, Phone, MessageSquare, ArrowRight, FilePlus2,
  ListChecks, Users, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { STATUS_TONE, type CampaignStatus } from "@/lib/campaign-types";
import { EXAMPLE_CAMPAIGN_NAMES, EXAMPLE_CAMPAIGNS } from "@/lib/campaign-examples";
import { lockFreeformWorkflow } from "@/lib/freeform-types";
import { CreateRunDialog, type CampaignOption, type CreateRunPayload } from "@/components/workflow/CreateRunDialog";
import { CSV_LIBRARY, makeCsvAsset, type CsvAsset } from "@/lib/data-library";
import { runEndpoint, pushTarget, pushBody, campaignFields, curlSample, PUSH_TARGETS } from "@/lib/connections";
import {
  useCampaignCopies, useTemplates, forkTemplateToCampaign, CATEGORY_LABEL, TEMPLATE_CATEGORIES,
  type CampaignTemplate, type ChannelLabel, type TemplateCategory,
} from "@/lib/campaign-templates";
import { PublishTemplateDialog } from "@/components/templates/PublishTemplateDialog";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";


export const Route = createFileRoute("/campaigns/")({
  component: CampaignList,
  head: () => ({
    meta: [
      { title: "Campaigns · Pi Commerce Enterprise" },
      { name: "description", content: "Design, run and review every orchestrated campaign." },
    ],
  }),
});

type RunType = "one-time" | "recurring";
type LastRunStatus = "completed" | "failed" | "running" | "paused" | "—";

type CampaignRow = {
  id: string;
  name: string;
  state: CampaignStatus;
  createdAt: string;
  createdAtTs: number;
  lastEdited: string;
  lastEditedTs: number;
  runType: RunType;
  lastRun: LastRunStatus;
  lastRunAt?: string;
  lastRunTs?: number;
  lastRunId?: string;
  /** Count of live/associated runs — surfaced so the user sees editing risk
   *  (publishing edits mints a new version that only new leads follow). */
  activeRuns: number;
  /** Set on tenant copies forked from a template — drives the Incomplete badge. */
  incomplete?: boolean;
  /** Nodes still missing a bound resource (copies only). */
  errorCount?: number;
  /** Template this row was copied from (copies only). */
  fromTemplate?: string;
};

const NOW = Date.now();
const M = 60_000, H = 60 * M, D = 24 * H;

// Sales-team example library — the showcase campaigns shown at the top of the
// table. Names + ids come straight from the authored graphs so they stay in sync
// and are searchable by their chosen names. Sub-second stagger keeps them ordered
// (and above the demo campaigns) under the default "last edited" sort.
// Deterministic mock of associated-run counts. Only `ready` campaigns can have
// runs (a `draft` is by definition not run-ready), so drafts always show 0.
const RUN_SEED = [3, 1, 0, 2, 1, 0, 4, 1];

const EXAMPLE_ROWS: CampaignRow[] = EXAMPLE_CAMPAIGN_NAMES.map((e, i) => ({
  id: e.id,
  name: e.name,
  state: e.status,
  createdAt: "Today · 09:00",
  createdAtTs: NOW - 1 * H,
  lastEdited: "just now",
  lastEditedTs: NOW - (i + 1) * 1000,
  runType: "one-time" as RunType,
  lastRun: "—" as LastRunStatus,
  activeRuns: e.status === "ready" ? RUN_SEED[i % RUN_SEED.length] : 0,
}));

// Only the sales-team example library is shown — older demo campaigns were
// retired so the platform stays contextual to these examples end-to-end.
const INITIAL: CampaignRow[] = [...EXAMPLE_ROWS];

const STATES: CampaignStatus[] = ["draft", "ready"];

const LAST_RUN_META: Record<LastRunStatus, { icon: typeof CircleDashed; tone: string; label: string }> = {
  completed: { icon: CircleCheck,  tone: "text-success",          label: "Completed" },
  failed:  { icon: CircleX,      tone: "text-destructive",      label: "Failed"  },
  running: { icon: CircleDot,    tone: "text-success",          label: "Running" },
  paused:  { icon: CirclePause,  tone: "text-warning",          label: "Paused"  },
  "—":     { icon: CircleDashed, tone: "text-muted-foreground", label: "—"       },
};

// ============= Runs =============

// Run lifecycle (PRD): pending (queued) → running → completed (time-scoped only).
// paused (mainly API/always-on), terminated (manual stop), failed (tech failure).
type RunStatus = "pending" | "running" | "paused" | "completed" | "failed" | "terminated";

const RUN_TONE: Record<RunStatus, string> = {
  pending:    "border-border bg-secondary text-muted-foreground",
  running:    "border-success/30 bg-success/10 text-success",
  paused:     "border-warning/30 bg-warning/10 text-warning",
  completed:  "border-border bg-secondary text-muted-foreground",
  failed:     "border-destructive/30 bg-destructive/10 text-destructive",
  terminated: "border-destructive/30 bg-destructive/10 text-destructive",
};

const RUN_STATUSES: RunStatus[] = ["pending", "running", "paused", "completed", "failed", "terminated"];

type TriggerMode = "manual" | "api";

type RunRow = {
  id: string;
  campaign: string;
  status: RunStatus;
  runType: RunType;
  triggerMode: TriggerMode;
  /** Where this run's audience came from. Named on the row because "why did these
   *  people get contacted" is the first question asked of any run. */
  audienceSource: "csv" | "connection" | "api";
  /** Present when audienceSource === "connection" — the client's own label for it. */
  connectionLabel?: string;
  /** Present when audienceSource === "api" — whose journey posts into this run. */
  pushTargetKey?: string;
  startedAt: string;
  completedAt: string | "ongoing";
  leadsProcessed: number;
  leadsTotal?: number; // present when source is CSV
};

const RUNS: RunRow[] = [
  { id: "\u200B", campaign: "BFSI · Lead Qualification", status: "running",    runType: "one-time",  triggerMode: "manual", audienceSource: "csv",                                                    startedAt: "Today, 12:04 PM",   completedAt: "ongoing",         leadsProcessed: 630,  leadsTotal: 1500 },
  { id: "r_8420", campaign: "Retail · Activation",       status: "running",    runType: "recurring", triggerMode: "api",    audienceSource: "api",        pushTargetKey: "clevertap",                startedAt: "Today, 11:50 AM",   completedAt: "ongoing",         leadsProcessed: 1200 },
  { id: "r_8419", campaign: "BFSI · Collections",       status: "pending",    runType: "one-time",  triggerMode: "api",    audienceSource: "connection", connectionLabel: "LeadSquared · Lending",   startedAt: "Today, 11:48 AM",   completedAt: "ongoing",         leadsProcessed: 0,    leadsTotal: 820 },
  { id: "r_8418", campaign: "Retail · Winback",         status: "paused",     runType: "one-time",  triggerMode: "manual", audienceSource: "csv",                                                    startedAt: "Today, 11:32 AM",   completedAt: "ongoing",         leadsProcessed: 412,  leadsTotal: 750 },
  { id: "r_8417", campaign: "D2C · Cart Abandonment", status: "completed",  runType: "one-time",  triggerMode: "manual", audienceSource: "csv",                                                    startedAt: "Today, 10:00 AM",   completedAt: "Today, 11:14 AM", leadsProcessed: 1500, leadsTotal: 1500 },
  { id: "r_8416", campaign: "Retail · Seasonal Sale",       status: "completed",  runType: "one-time",  triggerMode: "api",    audienceSource: "connection", connectionLabel: "LeadSquared · Lending",       startedAt: "Yesterday, 08:00 AM",completedAt: "Yesterday, 09:42 AM", leadsProcessed: 3200, leadsTotal: 3200 },
  { id: "r_8415", campaign: "BFSI · Insurance Renewal",   status: "terminated", runType: "one-time",  triggerMode: "api",    audienceSource: "api",        pushTargetKey: "webengage",                startedAt: "Yesterday, 04:20 PM",completedAt: "Yesterday, 04:38 PM", leadsProcessed: 240 },
  { id: "r_8414", campaign: "E-commerce · Price Drop",       status: "completed",  runType: "recurring", triggerMode: "api",    audienceSource: "api",        pushTargetKey: "moengage",                 startedAt: "Yesterday, 09:00 AM",completedAt: "Yesterday, 10:12 AM", leadsProcessed: 980 },
];

type Tab = "data" | "campaigns" | "runs";

function CampaignList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("campaigns");
  // Tenant copies forked from templates land at the top of the list as drafts
  // carrying their setup debt. They live in the copies store so the builder and
  // this table stay in sync; example rows are static below them.
  const copies = useCampaignCopies();
  const [publishFor, setPublishFor] = useState<string | null>(null);
  const rows: CampaignRow[] = [
    ...[...copies]
      .sort((a, b) => b.createdAtTs - a.createdAtTs)
      .map((c) => ({
        id: c.id,
        name: c.name,
        state: "draft" as CampaignStatus,
        createdAt: "just now",
        createdAtTs: c.createdAtTs,
        lastEdited: "just now",
        lastEditedTs: c.createdAtTs,
        runType: "one-time" as RunType,
        lastRun: "—" as LastRunStatus,
        activeRuns: 0,
        incomplete: c.errorCount > 0,
        errorCount: c.errorCount,
        fromTemplate: c.templateName,
      })),
    ...INITIAL,
  ];

  // Data library (CSV library tab — scope C1–C3). Shared source of truth with
  // the Run modal's "select previously uploaded CSV" dropdown (WS6).
  const [assets, setAssets] = useState<CsvAsset[]>(() =>
    [...CSV_LIBRARY].sort((a, b) => b.uploadedTs - a.uploadedTs),
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const onPickCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    // v1: read file-level metadata only — never parse or store row contents.
    const asset = makeCsvAsset({
      id: `csv_${Date.now()}`,
      name: file.name,
      uploadedTs: Date.now(),
      columns: [],
      rowCount: 0,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
      source: "uploaded",
    });
    setAssets((prev) => [asset, ...prev]);
    toast.success("CSV added to library", { description: file.name });
  };
  const [query, setQuery] = useState("");
  const [fState, setFState] = useState<"all" | CampaignStatus>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [createRunOpen, setCreateRunOpen] = useState(false);
  const [runFor, setRunFor] = useState<CampaignRow | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyId = (id: string) => {
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
  };

  // Runs filters
  const [rQuery, setRQuery] = useState("");
  const [rStatus, setRStatus] = useState<"all" | RunStatus>("all");
  const [rType, setRType] = useState<"all" | RunType>("all");

  // Sort state
  type SortKey = "name" | "state" | "lastEdited" | "lastRun" | "createdAt";
  const [sortKey, setSortKey] = useState<SortKey>("lastEdited");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "name" || k === "state" ? "asc" : "desc"); }
  };

  const filtered = rows.filter((r) => {
    if (fState !== "all" && r.state !== fState) return false;
    if (query && !r.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const NULL_LO = sortDir === "asc" ? Infinity : -Infinity;
    switch (sortKey) {
      case "name":       return a.name.localeCompare(b.name) * dir;
      case "state":      return a.state.localeCompare(b.state) * dir;
      case "lastEdited": return (a.lastEditedTs - b.lastEditedTs) * dir;
      case "createdAt":  return (a.createdAtTs - b.createdAtTs) * dir;
      case "lastRun": {
        const av = a.lastRunTs ?? NULL_LO;
        const bv = b.lastRunTs ?? NULL_LO;
        return (av - bv) * dir;
      }
    }
  });

  // Pagination for the campaigns table.
  const C_PAGE_SIZE = 8;
  const [cPage, setCPage] = useState(1);
  useEffect(() => { setCPage(1); }, [query, fState, sortKey, sortDir]);
  const cTotalPages = Math.max(1, Math.ceil(sorted.length / C_PAGE_SIZE));
  const cPageSafe = Math.min(cPage, cTotalPages);
  const pageRows = sorted.slice((cPageSafe - 1) * C_PAGE_SIZE, cPageSafe * C_PAGE_SIZE);
  const cRangeStart = sorted.length === 0 ? 0 : (cPageSafe - 1) * C_PAGE_SIZE + 1;
  const cRangeEnd = Math.min(cPageSafe * C_PAGE_SIZE, sorted.length);


  const filteredRuns = RUNS.filter((r) => {
    if (rStatus !== "all" && r.status !== rStatus) return false;
    if (rType !== "all" && r.runType !== rType) return false;
    if (rQuery) {
      const q = rQuery.toLowerCase();
      if (!r.id.toLowerCase().includes(q) && !r.campaign.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Duplicate & Archive campaign are OOS for v1 (scope D1/D2) — handlers removed.

  const handleCreate = (name: string, description?: string, objective?: string) => {
    setCreateOpen(false);
    toast.success("Campaign created", { description: `${name} · opening builder in Draft` });
    navigate({ to: "/campaigns/$id", params: { id: "new" }, search: { name, description, objective } as never });
  };

  // Fork a template into a draft and drop the tenant straight into the builder to
  // bind their own resources. Uses the section-independent fork — it never routes
  // into, nor mutates, the super-admin Template section (catalog analytics/state).
  const handleUseTemplate = (template: CampaignTemplate) => {
    const newId = forkTemplateToCampaign(template);
    setTemplatePickerOpen(false);
    setCreateOpen(false);
    toast.success("Template applied", {
      description: `${template.name} added as a draft · bind your resources to launch`,
    });
    navigate({ to: "/campaigns/$id", params: { id: newId } });
  };

  // The trigger endpoint carries the run ID, so it cannot exist until the run does.
  // That is why it is revealed here rather than in the create dialog — and why it is
  // repeated on the run's row, since this dialog is dismissed once and the URL is
  // needed again every time someone rebuilds the journey on the other side.
  const [endpointInfo, setEndpointInfo] = useState<{
    runName: string;
    runId: string;
    campaignId: string;
    endpoint: string;
  } | null>(null);

  // Which engagement tool the sample body is templated for. Purely cosmetic — every
  // tool posts to the same endpoint in the same shape; this only swaps the
  // personalisation-token syntax. Lives here, on the endpoint-discovery screen,
  // rather than in the create dialog, because the body it re-templates can't exist
  // until the run (and therefore the endpoint) does.
  const [previewTarget, setPreviewTarget] = useState("clevertap");

  const handleRunStarted = (payload: CreateRunPayload) => {
    setCreateRunOpen(false);
    setRunFor(null);
    const how =
      payload.audienceSource === "connection"
        ? `audience from ${payload.connectionLabel}`
        : payload.audienceSource === "api"
          ? "waiting for your first call"
          : "running now";
    toast.success("Run started", { description: `${payload.runName} · ${how}` });
    // Freeform workflow edit-lock. On run creation, freeze every workflow this
    // campaign's graph references so its analytics stays pinned to a stable
    // graph and no in-flight edits can shift the meaning of collected data.
    // Only wired for example (seeded) campaigns today — user-built campaign
    // graphs aren't persisted in this demo, so we can't scan those.
    const example = EXAMPLE_CAMPAIGNS[payload.campaignId];
    if (example) {
      const refs = new Set<string>();
      for (const n of example.nodes) {
        if (n.data?.kind === "whatsappFreeform") {
          const wf = n.data.config?.ffWorkflowId as string | undefined;
          if (wf) refs.add(wf);
        }
      }
      for (const id of refs) lockFreeformWorkflow(id);
    }
    if (payload.audienceSource === "api") {
      const runId = `run_${Date.now().toString(36)}`;
      setPreviewTarget("clevertap");
      setEndpointInfo({
        runName: payload.runName,
        runId,
        campaignId: payload.campaignId,
        endpoint: runEndpoint(runId),
      });
    }
  };

  const hasAny = rows.length > 0;
  const runningCount = RUNS.filter((r) => r.status === "running").length;

  return (
    <AppShell>
      <PageHeader
        title="Campaigns"
        description="Design and orchestrate every customer journey across channels."
        actions={
          tab === "data" ? (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Upload CSV
            </Button>
          ) : tab === "campaigns" ? (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Create campaign
            </Button>
          ) : (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreateRunOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Run Campaign
            </Button>
          )
        }

      />

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onPickCsv}
      />

      <PageTabs<Tab>
        tabs={[
          { id: "data", label: "Data", count: assets.length },
          { id: "campaigns", label: "Campaigns", count: rows.length },
          { id: "runs", label: "Runs", count: runningCount },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "data" ? (
        <DataLibraryPanel assets={assets} onUpload={() => fileRef.current?.click()} />
      ) : tab === "campaigns" ? (
        <>
          {/* Toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search campaigns…"
                className="h-8 pl-8 text-xs"
              />
            </div>

            <FilterSelect
              label="State"
              value={fState}
              onChange={(v) => setFState(v as typeof fState)}
              options={[{ value: "all", label: "All states" }, ...STATES.map((s) => ({ value: s, label: cap(s) }))]}
            />
          </div>

          {!hasAny ? (
            <EmptyState onCreate={() => setCreateOpen(true)} />
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
              <p className="text-sm text-muted-foreground">No campaigns match these filters.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <SortHeader label="Campaign name" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Status" k="state" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <th className="px-4 py-2.5 text-left font-medium">Associated runs</th>
                    <SortHeader label="Last edited" k="lastEdited" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Last run" k="lastRun" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Created at" k="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <th className="w-10 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageRows.map((c) => {
                    const LR = LAST_RUN_META[c.lastRun];
                    return (
                      <tr key={c.id} className="transition-colors hover:bg-accent/30">
                        <td className="px-4 py-3">
                          <Link to="/campaigns/$id" params={{ id: c.id }} className="font-medium hover:underline">
                            {c.name}
                          </Link>
                          <button
                            type="button"
                            onClick={() => copyId(c.id)}
                            title="Copy campaign ID"
                            className="group/id flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {c.id}
                            {copiedId === c.id ? (
                              <Check className="h-3 w-3 text-success" />
                            ) : (
                              <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover/id:opacity-100" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <StateTag state={c.state} />
                            {c.incomplete && (
                              <span
                                title={`Copied from ${c.fromTemplate ?? "a template"} — ${c.errorCount} resource${c.errorCount === 1 ? "" : "s"} still need binding before this can go live`}
                                className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10.5px] font-medium text-destructive"
                              >
                                <AlertCircle className="h-3 w-3" />
                                {c.errorCount} to fix
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {c.activeRuns > 0 ? (
                            <span
                              title={`${c.activeRuns} associated run${c.activeRuns > 1 ? "s" : ""} — editing and publishing mints a new version that only new leads follow`}
                              className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning"
                            >
                              <CircleDot className="h-3 w-3" />
                              {c.activeRuns} run{c.activeRuns > 1 ? "s" : ""}
                            </span>
                          ) : (
                            <span className="text-[12px] text-muted-foreground">No runs</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">{c.lastEdited}</td>
                        <td className="px-4 py-3">
                          {c.lastRunAt ? (
                            <div className="flex flex-col leading-tight">
                              <span className={cn("inline-flex items-center gap-1.5 text-[12px]", LR.tone)}>
                                <LR.icon className={cn("h-3.5 w-3.5", c.lastRun === "running" && "animate-pulse")} />
                                {c.lastRunAt}
                              </span>
                              {c.lastRunId && (
                                <span className="ml-5 font-mono text-[11px] text-muted-foreground">{c.lastRunId}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[12px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">{c.createdAt}</td>
                        <td className="px-2 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                          {c.state === "ready" && (
                            <Button
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => setRunFor(c)}
                            >
                              <Play className="h-3.5 w-3.5" /> Run
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() => navigate({ to: "/campaigns/$id", params: { id: c.id } })}
                                className="gap-2 text-xs"
                              >
                                <Workflow className="h-3.5 w-3.5" /> Open
                              </DropdownMenuItem>
                              {c.state === "ready" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setPublishFor(c.id)}
                                    className="gap-2 text-xs"
                                  >
                                    <Rocket className="h-3.5 w-3.5" /> Publish as template
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[12px] text-muted-foreground">
                Showing {cRangeStart}–{cRangeEnd} of {sorted.length} campaigns
              </p>
              {cTotalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline" size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={cPageSafe <= 1}
                    onClick={() => setCPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </Button>
                  <span className="px-1 text-[12px] tabular-nums text-muted-foreground">Page {cPageSafe} of {cTotalPages}</span>
                  <Button
                    variant="outline" size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={cPageSafe >= cTotalPages}
                    onClick={() => setCPage((p) => Math.min(cTotalPages, p + 1))}
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Runs toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={rQuery}
                onChange={(e) => setRQuery(e.target.value)}
                placeholder="Search by run id or campaign…"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <FilterSelect
              label="Status"
              value={rStatus}
              onChange={(v) => setRStatus(v as typeof rStatus)}
              options={[{ value: "all", label: "All statuses" }, ...RUN_STATUSES.map((s) => ({ value: s, label: cap(s) }))]}
            />
            <FilterSelect
              label="Run type"
              value={rType}
              onChange={(v) => setRType(v as typeof rType)}
              options={[
                { value: "all", label: "All run types" },
                { value: "one-time", label: "Time-Scoped" },
                { value: "recurring", label: "Always-on" },
              ]}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Run ID</th>
                  <th className="px-4 py-2.5 text-left font-medium">Campaign</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Run type</th>
                  <th className="px-4 py-2.5 text-left font-medium">Audience source</th>
                  <th className="px-4 py-2.5 text-left font-medium">Started at</th>
                  <th className="px-4 py-2.5 text-left font-medium">Completed at</th>
                  <th className="px-4 py-2.5 text-left font-medium w-[200px]">Progress</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRuns.map((r) => {
                  const pct = r.leadsTotal
                    ? Math.round((r.leadsProcessed / r.leadsTotal) * 100)
                    : r.status === "completed" ? 100 : r.leadsProcessed > 0 ? 100 : 0;
                  return (
                  <tr key={r.id} className="transition-colors hover:bg-accent/30">
                    <td className="px-4 py-3 font-mono text-[12px]">{r.id}</td>
                    <td className="px-4 py-3 font-medium">{r.campaign}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", RUN_TONE[r.status])}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", r.status === "running" ? "bg-success animate-pulse" : "bg-current opacity-60")} />
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">
                      {r.runType === "recurring" ? "Always-on" : "Time-Scoped"}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">
                      {r.audienceSource === "connection" ? (
                        <Link
                          to="/integrations"
                          title="View connections"
                          className="inline-flex max-w-[180px] items-center gap-1.5 truncate rounded transition-colors hover:text-foreground"
                        >
                          <Plug className="h-3 w-3 shrink-0" />
                          <span className="truncate">{r.connectionLabel}</span>
                        </Link>
                      ) : r.audienceSource === "api" ? (
                        <button
                          type="button"
                          onClick={() => copyId(runEndpoint(r.id))}
                          title="Copy this run's trigger endpoint"
                          className="group/ep inline-flex items-center gap-1.5 rounded transition-colors hover:text-foreground"
                        >
                          <Webhook className="h-3 w-3 shrink-0" />
                          {r.pushTargetKey ? pushTarget(r.pushTargetKey).name : "API"}
                          {copiedId === runEndpoint(r.id) ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover/ep:opacity-100" />
                          )}
                        </button>
                      ) : (
                        "CSV"
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{r.startedAt}</td>
                    <td className={cn("px-4 py-3 text-[12px]", r.completedAt === "ongoing" ? "italic text-muted-foreground/70" : "text-muted-foreground")}>
                      {r.completedAt}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Progress value={pct} className="h-1.5 w-40" />
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {r.leadsTotal
                            ? `${r.leadsProcessed.toLocaleString()}/${r.leadsTotal.toLocaleString()} leads processed`
                            : `${r.leadsProcessed.toLocaleString()} leads processed`}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right">
                      <RunRowMenu status={r.status} runId={r.id} triggerMode={r.triggerMode} />
                    </td>
                  </tr>
                  );
                })}
                {filteredRuns.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-sm text-muted-foreground">
                      No runs match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <CreateCampaignDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreate}
        onExploreTemplates={() => { setCreateOpen(false); setTemplatePickerOpen(true); }}
      />
      <TemplatePickerDialog
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onUse={handleUseTemplate}
        onPreview={(id) => { setTemplatePickerOpen(false); setPreviewTemplateId(id); }}
        onBlank={() => { setTemplatePickerOpen(false); setCreateOpen(true); }}
      />
      <TemplatePreviewOverlay
        templateId={previewTemplateId}
        onClose={() => setPreviewTemplateId(null)}
        onBack={() => { setPreviewTemplateId(null); setTemplatePickerOpen(true); }}
        onUse={(t) => { setPreviewTemplateId(null); handleUseTemplate(t); }}
      />
      <CreateRunDialog
        open={createRunOpen}
        onOpenChange={setCreateRunOpen}
        onStart={handleRunStarted}
      />
      <CreateRunDialog
        open={runFor !== null}
        onOpenChange={(v) => { if (!v) setRunFor(null); }}
        campaign={runFor ? ({ id: runFor.id, name: runFor.name, audienceSource: "csv" } satisfies CampaignOption) : undefined}
        onStart={handleRunStarted}
      />
      <PublishTemplateDialog
        open={publishFor !== null}
        onOpenChange={(v) => { if (!v) setPublishFor(null); }}
        sourceCampaignId={publishFor ?? undefined}
      />

      {/* Post-create: everything needed to wire up the other side (API runs only).
          This screen exists because none of it can be shown any earlier — the endpoint
          carries the run ID, and the run ID does not exist until now. It is deliberately
          the whole set (ids, endpoint, a request you can run, the body to paste) rather
          than just the URL: the person who receives this is switching to a different
          product to finish the job, and a second trip back here costs more than the
          scroll does. Every panel is min-w-0 and every block scrolls on its own axis,
          because URLs and curl lines are single unbreakable tokens that would otherwise
          widen the dialog's grid track past its own max-width. */}
      <Dialog open={endpointInfo !== null} onOpenChange={(v) => { if (!v) setEndpointInfo(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success/10 text-success">
                <Check className="h-4 w-4" />
              </span>
              Run created
            </DialogTitle>
            <DialogDescription className="text-xs">
              <span className="font-medium text-foreground">{endpointInfo?.runName}</span> is live and waiting.
              Point{" "}
              {previewTarget === "custom"
                ? "your system"
                : <span className="font-medium text-foreground">{pushTarget(previewTarget).name}</span>}
              {" "}at the endpoint below and post the body as-is.
            </DialogDescription>
          </DialogHeader>

          {endpointInfo && (() => {
            // The body is generated from the campaign's own fields, in the chosen
            // tool's token syntax. Recomputed on every toggle — it's the only thing
            // the vendor choice changes, so nothing else in the dialog depends on it.
            const previewBody = pushBody(previewTarget, campaignFields(endpointInfo.campaignId));
            return (
            <div className="max-h-[60vh] min-w-0 space-y-3 overflow-y-auto py-1 pr-1">
              {/* Which engagement tool this sample is templated for. Cosmetic: swaps the
                  personalisation-token syntax of the body below and the paste-into note,
                  nothing else — every tool posts to the same endpoint in the same shape. */}
              <div className="space-y-1.5">
                <Label className="text-xs">Building the body for</Label>
                <div className="grid grid-cols-4 rounded-md border border-input bg-background p-0.5">
                  {PUSH_TARGETS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setPreviewTarget(t.key)}
                      className={cn(
                        "h-8 truncate rounded px-1 text-[11.5px] font-medium transition-colors",
                        previewTarget === t.key
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t.key === "custom" ? "Other" : t.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* The two ids people are asked for by support and by their own logs. */}
              <div className="grid min-w-0 grid-cols-2 gap-2">
                <IdCell label="Run ID" value={endpointInfo.runId} />
                <IdCell label="Campaign ID" value={endpointInfo.campaignId} />
              </div>

              <div className="min-w-0 space-y-1.5 rounded-md border border-input bg-muted/40 p-3">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Webhook className="h-3 w-3" /> Trigger API endpoint
                </Label>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded border border-border bg-background px-2 py-1.5 font-mono text-[12px]">
                    {endpointInfo.endpoint}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    onClick={() => copyId(endpointInfo.endpoint)}
                  >
                    {copiedId === endpointInfo.endpoint ? (
                      <><Check className="h-3.5 w-3.5 text-success" /> Copied</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copy</>
                    )}
                  </Button>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  One journey points at one run, so this URL is not reusable — the run ID in it
                  is how we know who an arriving person belongs to. You can copy it again any
                  time from the run's row in the Runs tab.
                </p>
              </div>

              {/* A request you can actually run. The body alone cannot tell you whether
                  the key is right or the run is listening; one curl can, before anyone
                  commits a journey to it. */}
              <CodePanel
                label="Sample request"
                code={curlSample(endpointInfo.endpoint, previewBody)}
                copiedId={copiedId}
                onCopy={copyId}
                note="Swap in the API key from Settings and send it once — a 200 here means the run is listening before you wire up the journey."
              />

              {/* The payload, in the receiving tool's own personalisation syntax, so it
                  is paste-able rather than translate-able. */}
              <CodePanel
                label="Body to configure"
                code={previewBody}
                copiedId={copiedId}
                onCopy={copyId}
                note={`POST one flat-JSON object per audience record using the schema defined in the campaign's Audience node. Paste this into ${pushTarget(previewTarget).pasteInto}.`}
              />
            </div>
            );
          })()}

          <DialogFooter>
            <Button size="sm" className="h-8 text-xs" onClick={() => setEndpointInfo(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

/** An identifier someone will be asked to quote back — so it is copyable, not just legible. */
function IdCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-input bg-muted/40 px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate font-mono text-[12.5px] text-foreground">{value}</div>
    </div>
  );
}

/**
 * A block of code that exists to leave this screen. Everything about it is in service
 * of the copy button: the label says what you are copying, the note says where it goes,
 * and the pre scrolls sideways rather than wrapping, because a wrapped curl line looks
 * like two commands.
 */
function CodePanel({
  label,
  code,
  note,
  copiedId,
  onCopy,
}: {
  label: string;
  code: string;
  note: string;
  copiedId: string | null;
  onCopy: (v: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5 rounded-md border border-input bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1.5 text-[11px]"
          onClick={() => onCopy(code)}
        >
          {copiedId === code ? (
            <><Check className="h-3 w-3 text-success" /> Copied</>
          ) : (
            <><Copy className="h-3 w-3" /> Copy</>
          )}
        </Button>
      </div>
      <pre className="min-w-0 overflow-x-auto rounded border border-border bg-background px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-foreground">
        {code}
      </pre>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}


// ============= Data library (CSV library tab — scope C2) =============
// File-level metadata only — columns CSV Name / Date Uploaded / Download.
// No row-data preview in v1.
function DataLibraryPanel({ assets, onUpload }: { assets: CsvAsset[]; onUpload: () => void }) {
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary">
          <Database className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold">No CSVs yet</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Upload a CSV to reuse it as a campaign audience. Files uploaded during a run show up here automatically.
        </p>
        <Button size="sm" className="mt-5 h-8 gap-1.5 text-xs" onClick={onUpload}>
          <Upload className="h-3.5 w-3.5" /> Upload CSV
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">CSV Name</th>
            <th className="px-4 py-2.5 text-left font-medium">Date Uploaded</th>
            <th className="w-32 px-4 py-2.5 text-right font-medium">Download</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {assets.map((a) => (
            <tr key={a.id} className="transition-colors hover:bg-accent/30">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/40">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {a.rowCount > 0 ? `${a.rowCount.toLocaleString("en-IN")} rows · ` : ""}
                      {a.sizeKb >= 1024 ? `${(a.sizeKb / 1024).toFixed(1)} MB` : `${a.sizeKb} KB`}
                      {a.source === "run" ? " · added from a run" : ""}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-[12px] text-muted-foreground">{a.uploadedAt}</td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => toast.success("Download started", { description: a.name })}
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cap(s: string) { return s[0].toUpperCase() + s.slice(1); }

function StateTag({ state }: { state: CampaignStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", STATUS_TONE[state])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      {state}
    </span>
  );
}

function RunRowMenu({ status, runId, triggerMode }: { status: RunStatus; runId: string; triggerMode: TriggerMode }) {
  const canPause = status === "running";
  const canResume = status === "paused";
  // Pending (queued) and live (running/paused) runs can be terminated/cancelled.
  const canTerminate = status === "running" || status === "paused" || status === "pending";
  // API-triggered runs expose their unique endpoint for re-copy (also on the row).
  const isApi = triggerMode === "api";
  const endpoint = runEndpoint(runId);
  const copyEndpoint = () => {
    navigator.clipboard?.writeText(endpoint);
    toast.success("Trigger endpoint copied", { description: endpoint });
  };

  const hasLifecycle = canPause || canResume || canTerminate;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {isApi && (
          <DropdownMenuItem className="gap-2 text-xs" onClick={copyEndpoint}>
            <Webhook className="h-3.5 w-3.5" /> Copy trigger endpoint
          </DropdownMenuItem>
        )}
        {isApi && hasLifecycle && <DropdownMenuSeparator />}
        {canPause && (
          <DropdownMenuItem className="gap-2 text-xs" onClick={() => toast.success("Run paused", { description: runId })}><Pause className="h-3.5 w-3.5" /> Pause</DropdownMenuItem>
        )}
        {canResume && (
          <DropdownMenuItem className="gap-2 text-xs" onClick={() => toast.success("Run resumed", { description: runId })}><Play className="h-3.5 w-3.5" /> Resume</DropdownMenuItem>
        )}
        {canTerminate && (
          <DropdownMenuItem className="gap-2 text-xs text-destructive focus:text-destructive" onClick={() => toast.error("Run terminated", { description: `${runId} · cannot be resumed` })}>
            <Square className="h-3.5 w-3.5" /> Terminate
          </DropdownMenuItem>
        )}
        {!isApi && !hasLifecycle && (
          <DropdownMenuItem disabled className="gap-2 text-xs">No actions available</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortHeader<K extends string>({
  label, k, sortKey, sortDir, onSort, className,
}: {
  label: string;
  k: K;
  sortKey: K;
  sortDir: "asc" | "desc";
  onSort: (k: K) => void;
  className?: string;
}) {
  const active = sortKey === k;
  const Icon = !active ? ChevronsUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("px-4 py-2.5 text-left font-medium", className)}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 -mx-1 px-1 rounded transition-colors hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")} />
      </button>
    </th>
  );
}




function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto gap-1.5 px-2.5 text-xs">
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary">
        <Workflow className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">No campaigns yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Create your first campaign to start orchestrating customer journeys across channels.
      </p>
      <Button size="sm" className="mt-5 h-8 gap-1.5 text-xs" onClick={onCreate}>
        <Plus className="h-3.5 w-3.5" /> Create campaign
      </Button>
    </div>
  );
}

function CreateCampaignDialog({
  open, onOpenChange, onCreate, onExploreTemplates,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (name: string, description?: string, objective?: string) => void;
  onExploreTemplates: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState<string>("");

  const reset = () => { setName(""); setDescription(""); setObjective(""); };
  const submit = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), description.trim() || undefined, objective || undefined);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Create a Campaign</DialogTitle>
          <DialogDescription className="text-xs">
            Start from a proven template, or name a blank campaign and design it yourself.
          </DialogDescription>
        </DialogHeader>

        {/* Template entry point — couples the library into the create flow */}
        <button
          type="button"
          onClick={onExploreTemplates}
          className="group flex w-full items-center gap-3 rounded-lg border border-border bg-accent/30 p-3 text-left transition-colors hover:border-foreground/20 hover:bg-accent/60"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground">
            <LayoutTemplate className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">Explore templates</span>
            <span className="block truncate text-[11.5px] text-muted-foreground">
              Copy a pre-built, multi-channel journey and bind your resources.
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>

        <div className="relative py-1 text-center">
          <span className="relative z-10 bg-background px-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            or start blank
          </span>
          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-border" />
        </div>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="cname" className="text-xs">Campaign name <span className="text-destructive">*</span></Label>
            <Input
              id="cname"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dormant Trader Reactivation"
              className="h-9 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) submit(); }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cdesc" className="text-xs">Description</Label>
            <Textarea
              id="cdesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe the goal of this campaign…"
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Objective</Label>
            <Select value={objective} onValueChange={setObjective}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select an objective" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reactivation">Reactivation</SelectItem>
                <SelectItem value="onboarding">Onboarding</SelectItem>
                <SelectItem value="retention">Retention</SelectItem>
                <SelectItem value="conversion">Conversion</SelectItem>
                <SelectItem value="winback">Win-back</SelectItem>
                <SelectItem value="awareness">Awareness</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="h-8 text-xs" disabled={!name.trim()} onClick={submit}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const PICKER_CHANNEL_ICON: Record<ChannelLabel, typeof MessageCircle> = {
  WhatsApp: MessageCircle,
  Voice: Phone,
  SMS: MessageSquare,
  API: Webhook,
};

/**
 * Self-contained template chooser for the campaign create flow. It is intentionally
 * independent of the super-admin Template section: browsing, preview and use all
 * happen in-dialog and never navigate into /campaigns/templates/*. It reads the
 * published catalog read-only and forks via `forkTemplateToCampaign` (no analytics).
 */
function TemplatePickerDialog({
  open, onOpenChange, onUse, onPreview, onBlank,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUse: (template: CampaignTemplate) => void;
  onPreview: (templateId: string) => void;
  onBlank: () => void;
}) {
  const templates = useTemplates();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | TemplateCategory>("all");
  const [channels, setChannels] = useState<ChannelLabel[]>([]);

  const toggleChannel = (ch: ChannelLabel) =>
    setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));

  const published = templates.filter((t) => t.status === "published");
  const filtered = published.filter((t) => {
    if (category !== "all" && t.category !== category) return false;
    // Multi-select: keep a template if it carries ANY of the selected channels.
    if (channels.length > 0 && !channels.some((c) => t.channels.includes(c))) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const hasFilters = category !== "all" || channels.length > 0 || query.trim() !== "";
  const clearFilters = () => { setQuery(""); setCategory("all"); setChannels([]); };

  // Reset search + filters whenever the dialog is closed.
  useEffect(() => { if (!open) clearFilters(); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <LayoutTemplate className="h-4 w-4 text-muted-foreground" /> Start from a template
          </DialogTitle>
          <DialogDescription className="text-xs">
            Copy a proven journey into a draft. Tenant-bound resources are stripped so you can bind your own and launch.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 space-y-2.5 border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates…"
              className="h-9 pl-8 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger className="h-8 w-auto gap-1.5 px-2.5 text-xs">
                <span className="text-muted-foreground">Category:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All categories</SelectItem>
                {TEMPLATE_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs transition-colors hover:bg-accent"
                >
                  <span className="text-muted-foreground">Channels:</span>
                  <span className="text-foreground">
                    {channels.length === 0 ? "All" : channels.length === 1 ? channels[0] : `${channels.length} selected`}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[160px]">
                {(["WhatsApp", "Voice", "SMS", "API"] as ChannelLabel[]).map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c}
                    checked={channels.includes(c)}
                    onCheckedChange={() => toggleChannel(c)}
                    onSelect={(e) => e.preventDefault()}
                    className="text-xs"
                  >
                    {c}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
              <LayoutTemplate className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {published.length === 0 ? "No templates published yet." : "No templates match your filters."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filtered.map((t) => (
                <PickerCard
                  key={t.id}
                  template={t}
                  onUse={() => onUse(t)}
                  onPreview={() => onPreview(t.id)}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 items-center border-t border-border px-5 py-3 sm:justify-between">
          <button
            type="button"
            onClick={onBlank}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <FilePlus2 className="h-3.5 w-3.5" /> Start blank instead
          </button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickerCard({
  template: t, onUse, onPreview,
}: {
  template: CampaignTemplate;
  onUse: () => void;
  onPreview: () => void;
}) {
  return (
    <div className="group flex flex-col rounded-lg border border-border bg-card p-3.5 transition-colors hover:border-foreground/20">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
          <LayoutTemplate className="h-3 w-3" /> {CATEGORY_LABEL[t.category]}
        </span>
        <span className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          v{t.version}
        </span>
      </div>

      <h4 className="text-[13.5px] font-semibold leading-tight tracking-tight">{t.name}</h4>
      <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">{t.description}</p>

      {t.performance && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-success">
          <Sparkles className="h-3 w-3" /> {t.performance}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {t.channels.map((ch) => {
          const Icon = PICKER_CHANNEL_ICON[ch];
          return (
            <span
              key={ch}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <Icon className="h-3 w-3" /> {ch}
            </span>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <Button size="sm" className="h-7 flex-1 gap-1.5 text-xs" onClick={onUse}>
          <Copy className="h-3.5 w-3.5" /> Use template
        </Button>
        <button
          type="button"
          onClick={onPreview}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
      </div>
    </div>
  );
}

/**
 * Full-page template preview — a read-only look at a template before forking it.
 * Rendered as a fixed full-screen overlay (state-driven, not a route) so it stays
 * independent of the super-admin Template section and its detail route. Left: the
 * source journey on a non-interactive canvas; right: setup/audience metadata rail.
 */
function TemplatePreviewOverlay({
  templateId, onClose, onBack, onUse,
}: {
  templateId: string | null;
  onClose: () => void;
  onBack: () => void;
  onUse: (template: CampaignTemplate) => void;
}) {
  const templates = useTemplates();
  const t = templateId ? templates.find((x) => x.id === templateId) ?? null : null;

  // Close on Escape.
  useEffect(() => {
    if (!t) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onBack(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t, onBack]);

  if (!t) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back to template picker"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="truncate text-[15px] font-semibold tracking-tight">{t.name}</h1>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
          <LayoutTemplate className="h-3 w-3" /> {CATEGORY_LABEL[t.category]}
        </span>
        <span className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          v{t.version}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => onUse(t)}>
            <Copy className="h-3.5 w-3.5" /> Use template
          </Button>
        </div>
      </div>

      {/* Body: canvas + metadata rail */}
      <div className="flex min-h-0 flex-1">
        {/* Read-only journey preview */}
        <div className="relative min-w-0 flex-1 bg-muted/20">
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-3 py-1 text-[11px] font-medium shadow-sm backdrop-blur">
              <Eye className="h-3 w-3 text-muted-foreground" /> Journey preview
            </div>
          </div>
          <WorkflowCanvas status="ready" campaignId={t.sourceCampaignId} previewOnly />
        </div>

        {/* Metadata rail */}
        <div className="w-[380px] shrink-0 overflow-y-auto border-l border-border">
          <div className="space-y-5 px-5 py-5">
            <p className="text-[13px] leading-relaxed text-muted-foreground">{t.description}</p>

            {t.performance && (
              <p className="inline-flex items-center gap-1.5 rounded-md border border-success/25 bg-success/10 px-2 py-1 text-[12px] font-medium text-success">
                <Sparkles className="h-3.5 w-3.5" /> {t.performance}
              </p>
            )}

            <section>
              <PreviewLabel icon={Webhook} text="Channels" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.channels.map((ch) => {
                  const Icon = PICKER_CHANNEL_ICON[ch];
                  return (
                    <span key={ch} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-2 py-1 text-[11.5px] text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" /> {ch}
                    </span>
                  );
                })}
              </div>
            </section>

            <section>
              <PreviewLabel icon={ListChecks} text={`Setup before launch · ${t.setupSteps.length}`} />
              {t.setupSteps.length === 0 ? (
                <p className="mt-2 text-[12px] text-muted-foreground">Ready to run — no bindings needed.</p>
              ) : (
                <ol className="mt-2 space-y-1.5">
                  {t.setupSteps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground">
                        {i + 1}
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {t.audienceSchema.length > 0 && (
              <section>
                <PreviewLabel icon={Users} text={`Audience schema · ${t.audienceSchema.length}`} />
                <div className="mt-2 overflow-hidden rounded-md border border-border">
                  <table className="w-full text-[12px]">
                    <tbody className="divide-y divide-border">
                      {t.audienceSchema.map((a) => (
                        <tr key={a.name}>
                          <td className="px-3 py-1.5 font-mono text-[11.5px]">{a.name}</td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground">{a.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {t.audienceNotes && (
                  <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{t.audienceNotes}</p>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewLabel({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {text}
    </div>
  );
}
