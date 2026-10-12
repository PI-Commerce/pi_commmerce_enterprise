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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, MoreHorizontal, Copy, CopyPlus, Workflow, Trash2, Power, PowerOff,
  CircleDashed, CircleCheck, CircleX, CirclePause, CircleDot,
  Pause, Play, Square, ArrowUp, ArrowDown, ChevronsUpDown, Check,
  Upload, Download, FileSpreadsheet, Database, ChevronLeft, ChevronRight,
  Webhook, Zap, Megaphone, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { STATUS_TONE, type CampaignStatus, type JourneyType } from "@/lib/campaign-types";
import { EXAMPLE_CAMPAIGN_NAMES } from "@/lib/campaign-examples";
import { CreateRunDialog, type CampaignOption, type CreateRunPayload } from "@/components/workflow/CreateRunDialog";
import { CSV_LIBRARY, makeCsvAsset, type CsvAsset } from "@/lib/data-library";


export const Route = createFileRoute("/journeys/")({
  component: CampaignList,
  head: () => ({
    meta: [
      { title: "Journeys · Pi Commerce Enterprise" },
      { name: "description", content: "Design, run and review every orchestrated journey — outbound and inbound." },
    ],
  }),
});

type RunType = "one-time" | "recurring";
type LastRunStatus = "completed" | "failed" | "running" | "paused" | "—";

type CampaignRow = {
  id: string;
  name: string;
  state: CampaignStatus;
  journeyType: JourneyType;
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
  /** Inbound journeys have no Run construct — their liveness is a simple
   *  Active (listening for trigger events) / Inactive (paused) toggle.
   *  Only meaningful when journeyType === "inbound". */
  inboundActive?: boolean;
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
  journeyType: e.journeyType,
  createdAt: "Today · 09:00",
  createdAtTs: NOW - 1 * H,
  lastEdited: "just now",
  lastEditedTs: NOW - (i + 1) * 1000,
  runType: "one-time" as RunType,
  lastRun: "—" as LastRunStatus,
  activeRuns: e.journeyType === "inbound" ? 0 : e.status === "ready" ? RUN_SEED[i % RUN_SEED.length] : 0,
  // Inbound journeys are either actively listening or paused. Seed a mix so both
  // states are visible; cloned journeys always start inactive.
  inboundActive: e.journeyType === "inbound" ? e.id !== "c_in2" : undefined,
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
  startedAt: string;
  completedAt: string | "ongoing";
  leadsProcessed: number;
  leadsTotal?: number; // present when source is CSV
};

const RUNS: RunRow[] = [
  { id: "\u200B", campaign: "BFSI · Lead Qualification", status: "running",    runType: "one-time",  triggerMode: "manual", startedAt: "Today, 12:04 PM",   completedAt: "ongoing",         leadsProcessed: 630,  leadsTotal: 1500 },
  { id: "r_8420", campaign: "Retail · Activation",       status: "running",    runType: "recurring", triggerMode: "api",    startedAt: "Today, 11:50 AM",   completedAt: "ongoing",         leadsProcessed: 1200 },
  { id: "r_8419", campaign: "BFSI · Collections",       status: "pending",    runType: "one-time",  triggerMode: "manual", startedAt: "Today, 11:48 AM",   completedAt: "ongoing",         leadsProcessed: 0,    leadsTotal: 820 },
  { id: "r_8418", campaign: "Retail · Winback",         status: "paused",     runType: "one-time",  triggerMode: "manual", startedAt: "Today, 11:32 AM",   completedAt: "ongoing",         leadsProcessed: 412,  leadsTotal: 750 },
  { id: "r_8417", campaign: "D2C · Cart Abandonment", status: "completed",  runType: "one-time",  triggerMode: "manual", startedAt: "Today, 10:00 AM",   completedAt: "Today, 11:14 AM", leadsProcessed: 1500, leadsTotal: 1500 },
  { id: "r_8416", campaign: "Retail · Seasonal Sale",       status: "completed",  runType: "one-time",  triggerMode: "manual", startedAt: "Yesterday, 08:00 AM",completedAt: "Yesterday, 09:42 AM", leadsProcessed: 3200, leadsTotal: 3200 },
  { id: "r_8415", campaign: "BFSI · Insurance Renewal",   status: "terminated", runType: "one-time",  triggerMode: "api",    startedAt: "Yesterday, 04:20 PM",completedAt: "Yesterday, 04:38 PM", leadsProcessed: 240 },
  { id: "r_8414", campaign: "E-commerce · Price Drop",       status: "completed",  runType: "recurring", triggerMode: "api",    startedAt: "Yesterday, 09:00 AM",completedAt: "Yesterday, 10:12 AM", leadsProcessed: 980 },
];

// Top-level split: a journey is either Outbound (Start + Audience, broadcast to a
// list, has Runs) or Inbound (Trigger entry, reacts to events in real time, no
// Runs). Outbound further splits into Journeys / Runs / Data; Inbound is just a
// Journeys list.
type Plane = JourneyType;
type OutTab = "journeys" | "runs" | "data";

function CampaignList() {
  const navigate = useNavigate();
  const [plane, setPlane] = useState<Plane>("outbound");
  const [outTab, setOutTab] = useState<OutTab>("journeys");
  const [rows, setRows] = useState<CampaignRow[]>(INITIAL);

  // What the main body shows, derived from the two-level selection.
  const showData = plane === "outbound" && outTab === "data";
  const showRuns = plane === "outbound" && outTab === "runs";
  const showJourneys = !showData && !showRuns;

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
  // Inbound journeys filter on Active/Inactive (their only "status" concept).
  const [fInbound, setFInbound] = useState<"all" | "active" | "inactive">("all");
  const [createOpen, setCreateOpen] = useState(false);
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

  // Rows for the currently-selected plane (Inbound vs Outbound).
  const planeRows = rows.filter((r) => r.journeyType === plane);

  const filtered = planeRows.filter((r) => {
    if (query && !r.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (plane === "inbound") {
      // Inbound journeys have no draft/ready state — filter on Active/Inactive.
      if (fInbound !== "all" && (fInbound === "active") !== !!r.inboundActive) return false;
    } else if (fState !== "all" && r.state !== fState) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const NULL_LO = sortDir === "asc" ? Infinity : -Infinity;
    switch (sortKey) {
      case "name":       return a.name.localeCompare(b.name) * dir;
      case "state": {
        if (plane === "inbound") {
          return ((a.inboundActive ? 1 : 0) - (b.inboundActive ? 1 : 0)) * dir;
        }
        return a.state.localeCompare(b.state) * dir;
      }
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
  useEffect(() => { setCPage(1); }, [query, fState, fInbound, sortKey, sortDir, plane, outTab]);
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

  // Inbound journey row actions. Inbound has no Run construct, so its lifecycle is
  // just: clone, toggle Active/Inactive, and delete.
  const handleClone = (c: CampaignRow) => {
    const now = Date.now();
    const copy: CampaignRow = {
      ...c,
      id: `c_${now.toString(36)}`,
      name: `${c.name} (copy)`,
      lastEdited: "just now",
      lastEditedTs: now,
      createdAt: "just now",
      createdAtTs: now,
      activeRuns: 0,
      inboundActive: false, // clones start paused
    };
    setRows((prev) => [copy, ...prev]);
    toast.success("Journey cloned", { description: copy.name });
  };

  const handleDelete = (c: CampaignRow) => {
    setRows((prev) => prev.filter((r) => r.id !== c.id));
    toast.success("Journey deleted", { description: c.name });
  };

  const toggleInboundActive = (c: CampaignRow) => {
    setRows((prev) => prev.map((r) => (r.id === c.id ? { ...r, inboundActive: !r.inboundActive } : r)));
    toast.success(c.inboundActive ? "Journey deactivated" : "Journey activated", { description: c.name });
  };

  const handleCreate = (journeyType: JourneyType, name: string, description?: string, objective?: string) => {
    setCreateOpen(false);
    toast.success("Journey created", { description: `${name} · opening builder in Draft` });
    navigate({ to: "/journeys/$id", params: { id: "new" }, search: { name, description, objective, journeyType } as never });
  };

  // After an API-sourced run is created, surface its unique trigger endpoint in a
  // follow-up dialog so it can be copied immediately (it's also on the run row).
  const [endpointInfo, setEndpointInfo] = useState<{ runName: string; endpoint: string } | null>(null);

  const handleRunStarted = (payload: CreateRunPayload) => {
    setCreateRunOpen(false);
    setRunFor(null);
    toast.success("Run started", { description: `${payload.runName} · ${payload.triggerMode === "api" ? "API trigger activated" : "running now"}` });
    if (payload.audienceSource === "api") {
      const runId = `run_${Date.now().toString(36)}`;
      setEndpointInfo({ runName: payload.runName, endpoint: `https://api.picommerce.io/v1/runs/trigger/${runId}` });
    }
  };

  const hasAny = planeRows.length > 0;
  const runningCount = RUNS.filter((r) => r.status === "running").length;
  const outboundCount = rows.filter((r) => r.journeyType === "outbound").length;
  const inboundCount = rows.filter((r) => r.journeyType === "inbound").length;

  return (
    <AppShell>
      <PageHeader
        title="Journeys"
        description="Design and orchestrate every customer journey across channels — outbound broadcasts and inbound, event-triggered flows."
        actions={
          showData ? (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Upload CSV
            </Button>
          ) : showRuns ? (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreateRunOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Run journey
            </Button>
          ) : (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Create journey
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

      {/* Primary split: Outbound vs Inbound journeys. */}
      <PageTabs<Plane>
        tabs={[
          { id: "outbound", label: "Outbound", count: outboundCount },
          { id: "inbound", label: "Inbound", count: inboundCount },
        ]}
        value={plane}
        onChange={setPlane}
      />

      {/* Secondary view — only Outbound carries Runs and a Data library.
          Inbound journeys are event-triggered, so they have no Run construct. */}
      {plane === "outbound" && (
        <SubTabs<OutTab>
          tabs={[
            { id: "journeys", label: "Journeys", count: outboundCount },
            { id: "runs", label: "Runs", count: runningCount },
            { id: "data", label: "Data", count: assets.length },
          ]}
          value={outTab}
          onChange={setOutTab}
        />
      )}

      {showData ? (
        <DataLibraryPanel assets={assets} onUpload={() => fileRef.current?.click()} />
      ) : showJourneys ? (
        <>
          {/* Toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search journeys…"
                className="h-8 pl-8 text-xs"
              />
            </div>

            {plane === "inbound" ? (
              <FilterSelect
                label="Status"
                value={fInbound}
                onChange={(v) => setFInbound(v as typeof fInbound)}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
            ) : (
              <FilterSelect
                label="State"
                value={fState}
                onChange={(v) => setFState(v as typeof fState)}
                options={[{ value: "all", label: "All states" }, ...STATES.map((s) => ({ value: s, label: cap(s) }))]}
              />
            )}
          </div>

          {!hasAny ? (
            <EmptyState onCreate={() => setCreateOpen(true)} />
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
              <p className="text-sm text-muted-foreground">No journeys match these filters.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <SortHeader label="Journey name" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Status" k="state" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    {plane === "outbound" && (
                      <th className="px-4 py-2.5 text-left font-medium">Associated runs</th>
                    )}
                    <SortHeader label="Last edited" k="lastEdited" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    {plane === "outbound" && (
                      <SortHeader label="Last run" k="lastRun" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    )}
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
                          <Link to="/journeys/$id" params={{ id: c.id }} className="font-medium hover:underline">
                            {c.name}
                          </Link>
                          <button
                            type="button"
                            onClick={() => copyId(c.id)}
                            title="Copy journey ID"
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
                          {plane === "inbound" ? (
                            <InboundStateTag active={!!c.inboundActive} />
                          ) : (
                            <StateTag state={c.state} />
                          )}
                        </td>
                        {plane === "outbound" && (
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
                        )}
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">{c.lastEdited}</td>
                        {plane === "outbound" && (
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
                        )}
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">{c.createdAt}</td>
                        <td className="px-2 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                          {plane === "outbound" && c.state === "ready" && (
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
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={() => navigate({ to: "/journeys/$id", params: { id: c.id } })}
                                className="gap-2 text-xs"
                              >
                                <Workflow className="h-3.5 w-3.5" /> Open
                              </DropdownMenuItem>
                              {plane === "inbound" && (
                                <>
                                  <DropdownMenuItem onClick={() => toggleInboundActive(c)} className="gap-2 text-xs">
                                    {c.inboundActive ? (
                                      <><PowerOff className="h-3.5 w-3.5" /> Deactivate</>
                                    ) : (
                                      <><Power className="h-3.5 w-3.5" /> Activate</>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleClone(c)} className="gap-2 text-xs">
                                    <CopyPlus className="h-3.5 w-3.5" /> Clone
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(c)}
                                    className="gap-2 text-xs text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> Delete
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
                Showing {cRangeStart}–{cRangeEnd} of {sorted.length} journeys
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
                placeholder="Search by run id or journey…"
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
                  <th className="px-4 py-2.5 text-left font-medium">Journey</th>
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
                      {r.triggerMode === "api" ? (
                        <button
                          type="button"
                          onClick={() => copyId(`https://api.picommerce.io/v1/runs/trigger/${r.id}`)}
                          title="Copy trigger API endpoint"
                          className="group/ep inline-flex items-center gap-1.5 rounded transition-colors hover:text-foreground"
                        >
                          API
                          {copiedId === `https://api.picommerce.io/v1/runs/trigger/${r.id}` ? (
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
        defaultType={plane}
        onCreate={handleCreate}
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

      {/* Post-create: reveal the new run's unique trigger endpoint (API runs only). */}
      <Dialog open={endpointInfo !== null} onOpenChange={(v) => { if (!v) setEndpointInfo(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success/10 text-success">
                <Check className="h-4 w-4" />
              </span>
              Run created
            </DialogTitle>
            <DialogDescription className="text-xs">
              <span className="font-medium text-foreground">{endpointInfo?.runName}</span> is live. POST your
              audience payload to the unique trigger endpoint below to start streaming leads.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 rounded-md border border-input bg-muted/40 p-3">
            <Label className="flex items-center gap-1.5 text-xs">
              <Webhook className="h-3 w-3" /> Trigger API endpoint
            </Label>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded border border-border bg-background px-2 py-1.5 font-mono text-[12px]">
                {endpointInfo?.endpoint}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1.5 text-xs"
                onClick={() => endpointInfo && copyId(endpointInfo.endpoint)}
              >
                {endpointInfo && copiedId === endpointInfo.endpoint ? (
                  <><Check className="h-3.5 w-3.5 text-success" /> Copied</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" /> Copy</>
                )}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              You can copy this again any time from the run's row in the Runs tab.
            </p>
          </div>

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

// Inbound journeys don't have draft/ready — they're either Active (listening for
// trigger events) or Inactive (paused). A live pulse marks the active state.
function InboundStateTag({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        active
          ? "border-success/30 bg-success/10 text-success"
          : "border-border bg-secondary text-muted-foreground",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", active ? "animate-pulse" : "opacity-60")} />
      {active ? "Active" : "Inactive"}
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
  const endpoint = `https://api.picommerce.io/v1/runs/trigger/${runId}`;
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

// Secondary, lighter tab control nested under the primary Outbound/Inbound split.
// A segmented pill row keeps the two levels visually distinct from the primary
// underline tabs above it.
function SubTabs<T extends string>({
  tabs, value, onChange,
}: {
  tabs: ReadonlyArray<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="mb-4 inline-flex items-center gap-0.5 rounded-lg border border-border bg-secondary/40 p-0.5">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="font-mono text-[10px] text-muted-foreground">{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary">
        <Workflow className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">No journeys yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Create your first journey to start orchestrating customer flows across channels.
      </p>
      <Button size="sm" className="mt-5 h-8 gap-1.5 text-xs" onClick={onCreate}>
        <Plus className="h-3.5 w-3.5" /> Create journey
      </Button>
    </div>
  );
}

// Journey-type metadata for the first step of the create dialog. Keeps the card
// copy and the step-2 badge in sync.
const JOURNEY_TYPE_META: Record<JourneyType, { icon: typeof Zap; title: string; blurb: string; detail: string }> = {
  outbound: {
    icon: Megaphone,
    title: "Outbound journey",
    blurb: "Broadcast to an audience",
    detail: "Starts from a Start + Audience node. Push to a CSV or API list on a schedule, then branch across channels. Launched as Runs.",
  },
  inbound: {
    icon: Zap,
    title: "Inbound journey",
    blurb: "React to a live event",
    detail: "Starts from a Trigger node — a connector event, webhook or CTWA ad tap. Leads enter in real time, event by event. No Runs.",
  },
};

function CreateCampaignDialog({
  open, onOpenChange, onCreate, defaultType,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (journeyType: JourneyType, name: string, description?: string, objective?: string) => void;
  defaultType: JourneyType;
}) {
  // Two steps: choose the journey type, then name it.
  const [step, setStep] = useState<"type" | "details">("type");
  const [journeyType, setJourneyType] = useState<JourneyType>(defaultType);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState<string>("");

  const reset = () => {
    setStep("type");
    setJourneyType(defaultType);
    setName("");
    setDescription("");
    setObjective("");
  };

  // When the dialog is (re)opened, start on the type step defaulted to the plane
  // the user is currently viewing.
  useEffect(() => {
    if (open) { setStep("type"); setJourneyType(defaultType); }
  }, [open, defaultType]);

  const pickType = (t: JourneyType) => { setJourneyType(t); setStep("details"); };
  const submit = () => {
    if (!name.trim()) return;
    onCreate(journeyType, name.trim(), description.trim() || undefined, objective || undefined);
    reset();
  };

  const meta = JOURNEY_TYPE_META[journeyType];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        {step === "type" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">Create a journey</DialogTitle>
              <DialogDescription className="text-xs">
                Choose how this journey starts. You'll design the orchestration in the next step.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2.5 py-2">
              {(["outbound", "inbound"] as JourneyType[]).map((t) => {
                const m = JOURNEY_TYPE_META[t];
                const Icon = m.icon;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => pickType(t)}
                    className="group flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-all hover:border-foreground/40 hover:bg-accent/40"
                  >
                    <span className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      t === "inbound" ? "bg-ai/10 text-ai" : "bg-chart-2/10 text-chart-2",
                    )}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{m.title}</p>
                        <span className="text-[11px] text-muted-foreground">{m.blurb}</span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{m.detail}</p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
                  </button>
                );
              })}
            </div>

            <DialogFooter>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>Cancel</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">Name your {meta.title.toLowerCase()}</DialogTitle>
              <DialogDescription className="text-xs">
                {journeyType === "inbound"
                  ? "You'll pick the trigger and build the flow in the next step."
                  : "You'll design the orchestration in the next step."}
              </DialogDescription>
            </DialogHeader>

            <button
              type="button"
              onClick={() => setStep("type")}
              className="flex w-full items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-left transition-colors hover:bg-accent/40"
            >
              <span className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                journeyType === "inbound" ? "bg-ai/10 text-ai" : "bg-chart-2/10 text-chart-2",
              )}>
                <meta.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium">{meta.title}</span>
                <span className="block text-[10.5px] text-muted-foreground">{meta.blurb}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <ArrowLeft className="h-3 w-3" /> Change
              </span>
            </button>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="cname" className="text-xs">Journey name <span className="text-destructive">*</span></Label>
                <Input
                  id="cname"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={journeyType === "inbound" ? "e.g. Payment Failure Recovery" : "e.g. Dormant Trader Reactivation"}
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
                  placeholder="Briefly describe the goal of this journey…"
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
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setStep("type")}>Back</Button>
              <Button size="sm" className="h-8 text-xs" disabled={!name.trim()} onClick={submit}>Create</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
