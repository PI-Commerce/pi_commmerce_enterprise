/**
 * Leads Management — list surface (v2).
 *
 * One consolidated table across all campaigns / runs, keyed by unique person.
 * Segment / Tags / PII redaction were dropped from this pass — the filter bar
 * (Campaign → Run + date range + search) IS the segmentation for v2.
 *
 * The `Human Escalation` column is conditional — it only renders when the
 * currently-active filter scope includes at least one campaign whose graph
 * contains a Human Escalation (needsReview) node. Rationale: outside of that
 * scope the column would always read "—", which is noise.
 */

import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  LEAD_RECORDS, formatDate, formatDateTime, relTime, scopeHasHitl,
  CAMPAIGN_CATALOG,
  type LeadRecord, type LeadCampaignEntry,
} from "@/lib/leads-data";
import {
  ArrowUpDown, Search, Calendar, X, ChevronDown, Megaphone, Flag,
} from "lucide-react";

export const Route = createFileRoute("/leads/")({
  component: LeadsManagement,
  head: () => ({ meta: [{ title: "Leads · Pi Commerce Enterprise" }] }),
});

/* ---------- Date-window filter (unchanged from v2-alpha) ---------- */

type DateWindow = "all" | "7d" | "30d" | "90d";
const DATE_WINDOWS: { value: DateWindow; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7d",  label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];
function daysAgo(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}
function withinWindow(iso: string | undefined, win: DateWindow): boolean {
  if (!iso || win === "all") return true;
  const d = daysAgo(iso);
  return win === "7d" ? d <= 7 : win === "30d" ? d <= 30 : d <= 90;
}

type SortKey = "lastInteraction" | "created" | "name";

function LeadsManagement() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [campaigns, setCampaigns] = useState<Set<string>>(new Set());
  /** When a single campaign is selected, this narrows to a specific Run within it. */
  const [runId, setRunId] = useState<string | null>(null);
  const [createdWin, setCreatedWin] = useState<DateWindow>("all");
  const [interactedWin, setInteractedWin] = useState<DateWindow>("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastInteraction");
  const [sortAsc, setSortAsc] = useState(false);

  /** Runs available in the currently-selected single campaign, else empty. */
  const availableRuns = useMemo(() => {
    if (campaigns.size !== 1) return [];
    const only = [...campaigns][0];
    const seen = new Map<string, string>();
    for (const l of LEAD_RECORDS) for (const c of l.campaigns) {
      if (c.campaignId === only && !seen.has(c.runId)) seen.set(c.runId, c.runName);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [campaigns]);

  // If the currently-picked Run disappears (e.g. after Campaign filter change), clear it.
  const runIdEffective = useMemo(() => {
    if (!runId) return null;
    return availableRuns.some((r) => r.id === runId) ? runId : null;
  }, [runId, availableRuns]);

  // Filter pass — apply search + campaigns + run + date windows.
  const rows = useMemo(() => {
    let list = LEAD_RECORDS.slice();
    if (campaigns.size) {
      list = list.filter((l) => l.campaigns.some((c) => campaigns.has(c.campaignId)));
    }
    if (runIdEffective) {
      list = list.filter((l) => l.campaigns.some((c) => c.runId === runIdEffective));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((l) =>
        l.name.toLowerCase().includes(q)
        || l.phone.toLowerCase().includes(q)
        || l.id.toLowerCase().includes(q)
        || l.customerId.toLowerCase().includes(q),
      );
    }
    list = list.filter((l) => withinWindow(l.createdAt, createdWin));
    list = list.filter((l) => withinWindow(l.lastInteractionAt, interactedWin));
    list.sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      switch (sortKey) {
        case "name":            return dir * a.name.localeCompare(b.name);
        case "created":         return dir * (Date.parse(a.createdAt) - Date.parse(b.createdAt));
        case "lastInteraction": return dir * (Date.parse(a.lastInteractionAt) - Date.parse(b.lastInteractionAt));
      }
    });
    return list;
  }, [campaigns, runIdEffective, search, createdWin, interactedWin, sortKey, sortAsc]);

  const toggleCampaign = (id: string) => {
    setCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    // Clear the Run filter whenever the campaign selection changes — it's only
    // meaningful when exactly one campaign is picked, and even then the runs
    // change with the pick.
    setRunId(null);
  };

  const clearFilters = () => {
    setCampaigns(new Set());
    setRunId(null);
    setCreatedWin("all");
    setInteractedWin("all");
    setSearch("");
  };
  const filtersActive = campaigns.size > 0 || !!runIdEffective
    || createdWin !== "all" || interactedWin !== "all" || !!search.trim();

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((s) => !s);
    else { setSortKey(k); setSortAsc(false); }
  };

  // Conditional Human Escalation column: shown only when the current scope
  // includes at least one campaign that has an HITL node in its graph. If no
  // campaigns are picked, we consider all campaigns in-scope.
  const scopeIds = campaigns.size ? campaigns : new Set(CAMPAIGN_CATALOG.map((c) => c.id));
  const showEscalation = scopeHasHitl(scopeIds);

  return (
    <AppShell>
      <PageHeader
        title="Leads"
        description="One contact, many campaigns — persistent per-lead memory across every touchpoint."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name · phone · Lead ID"
            className="h-9 pl-8 text-[12.5px]"
          />
        </div>
        <CampaignFilter selected={campaigns} onToggle={toggleCampaign} />
        {campaigns.size === 1 && availableRuns.length > 0 && (
          <RunFilter runs={availableRuns} value={runIdEffective} onChange={setRunId} />
        )}
        <DateFilter icon={Calendar} label="Created"          value={createdWin}    onChange={setCreatedWin} />
        <DateFilter icon={Calendar} label="Last interaction" value={interactedWin} onChange={setInteractedWin} />
        {filtersActive && (
          <button onClick={clearFilters} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{rows.length.toLocaleString()}</span> of {LEAD_RECORDS.length} leads
        </span>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th>Lead ID</Th>
              <Th onClick={() => toggleSort("name")} sorted={sortKey === "name" ? sortAsc : undefined}>Name</Th>
              <Th>Phone</Th>
              <Th onClick={() => toggleSort("lastInteraction")} sorted={sortKey === "lastInteraction" ? sortAsc : undefined}>
                Last interaction
              </Th>
              <Th>Campaigns</Th>
              <Th onClick={() => toggleSort("created")} sorted={sortKey === "created" ? sortAsc : undefined}>Created</Th>
              {showEscalation && <Th>Human Escalation</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => (
              <Row
                key={lead.id}
                lead={lead}
                showEscalation={showEscalation}
                scopeIds={scopeIds}
                runIdFilter={runIdEffective}
                onOpen={() => navigate({ to: "/leads/$id", params: { id: lead.id } })}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={showEscalation ? 7 : 6} className="px-4 py-12 text-center text-[12px] text-muted-foreground">
                  No leads match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function Th({ children, onClick, sorted }: { children: React.ReactNode; onClick?: () => void; sorted?: boolean }) {
  return (
    <th className="px-4 py-2.5 text-left font-medium">
      {onClick ? (
        <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground">
          {children}
          <ArrowUpDown className={cn("h-3 w-3 transition-opacity", sorted === undefined ? "opacity-40" : "opacity-100")} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Row({
  lead, showEscalation, scopeIds, runIdFilter, onOpen,
}: {
  lead: LeadRecord;
  showEscalation: boolean;
  scopeIds: Set<string>;
  runIdFilter: string | null;
  onOpen: () => void;
}) {
  // Campaigns column: show a count pill + hover popover with the run list.
  const campaignsForLead = lead.campaigns;
  const escalatedEntries = campaignsForLead.filter(
    (c) => c.humanEscalated && scopeIds.has(c.campaignId) && (!runIdFilter || c.runId === runIdFilter),
  );
  return (
    <tr onClick={onOpen} className="cursor-pointer border-t border-border/60 transition-colors hover:bg-accent/30">
      <td className="px-4 py-3 font-mono text-[11.5px] text-muted-foreground">{lead.id}</td>
      <td className="px-4 py-3 font-medium">{lead.name}</td>
      <td className="px-4 py-3 font-mono text-[11.5px]">{lead.phone}</td>
      <td
        className="px-4 py-3 text-[11.5px] text-muted-foreground"
        title={formatDateTime(lead.lastInteractionAt)}
      >
        {relTime(lead.lastInteractionAt)}
      </td>
      <td className="px-4 py-3">
        <CampaignsCell campaigns={campaignsForLead} />
      </td>
      <td className="px-4 py-3 text-[11.5px] text-muted-foreground">
        {formatDate(lead.createdAt)}
      </td>
      {showEscalation && (
        <td className="px-4 py-3">
          {escalatedEntries.length > 0 ? (
            <EscalatedCell entries={escalatedEntries} />
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          )}
        </td>
      )}
    </tr>
  );
}

/* ---------- Cells ---------- */

/** Campaigns cell: renders a count pill with a hover popover listing all
 *  Campaign · Run · Status rows for this lead. Hovering the pill (not the row)
 *  triggers it — click-through on the row still opens the lead. */
function CampaignsCell({ campaigns }: { campaigns: LeadCampaignEntry[] }) {
  if (campaigns.length === 0) return <span className="text-[11px] text-muted-foreground">—</span>;
  const label = campaigns.length === 1 ? "In 1 campaign" : `In ${campaigns.length} campaigns`;
  return (
    <div className="relative inline-flex group">
      <span
        onClick={(e) => e.stopPropagation()}
        className="inline-flex cursor-help items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <Megaphone className="h-3 w-3" />
        {label}
      </span>
      {/* Popover — CSS-only via group-hover; positioned absolutely so it doesn't
          reflow the table rows. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-72 rounded-lg border border-border bg-card p-2 text-[11.5px] shadow-lg group-hover:block group-hover:pointer-events-auto"
      >
        <ul className="divide-y divide-border/60">
          {campaigns.map((c) => (
            <li key={c.runId} className="flex items-start justify-between gap-2 py-1.5">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{c.campaignName}</p>
                <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{c.runName}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <StatusPill status={c.status} />
                {c.humanEscalated && (
                  <span className="inline-flex items-center gap-0.5 rounded-full border border-warning/40 bg-warning/10 px-1 py-0.5 text-[9.5px] font-medium text-warning">
                    <Flag className="h-2.5 w-2.5" /> Escalated
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EscalatedCell({ entries }: { entries: LeadCampaignEntry[] }) {
  return (
    <div className="relative inline-flex group">
      <span
        onClick={(e) => e.stopPropagation()}
        className="inline-flex cursor-help items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning"
      >
        <Flag className="h-3 w-3" /> Yes
      </span>
      <div
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-72 rounded-lg border border-border bg-card p-2 text-[11.5px] shadow-lg group-hover:block group-hover:pointer-events-auto"
      >
        <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Escalated in
        </p>
        <ul className="divide-y divide-border/60">
          {entries.map((c) => (
            <li key={c.runId} className="py-1.5">
              <p className="truncate text-foreground">{c.campaignName}</p>
              <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{c.runName}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const STATUS_TINT: Record<LeadCampaignEntry["status"], string> = {
  running:    "border-ai/30 bg-ai/10 text-ai",
  completed:  "border-success/30 bg-success/10 text-success",
  paused:     "border-border bg-secondary text-muted-foreground",
  failed:     "border-destructive/30 bg-destructive/10 text-destructive",
  terminated: "border-warning/30 bg-warning/10 text-warning",
};

function StatusPill({ status }: { status: LeadCampaignEntry["status"] }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9.5px] font-medium capitalize",
      STATUS_TINT[status],
    )}>
      {status}
    </span>
  );
}

/* ---------- Filter controls ---------- */

function CampaignFilter({ selected, onToggle }: { selected: Set<string>; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors",
          selected.size ? "border-ai/40 bg-ai/5 text-foreground" : "border-border bg-card hover:bg-accent/40",
        )}
      >
        <Megaphone className="h-3.5 w-3.5" />
        Campaign
        {selected.size > 0 && <span className="rounded-full bg-ai/15 px-1.5 text-[10px] font-semibold text-ai">{selected.size}</span>}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 max-h-80 w-80 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
            {CAMPAIGN_CATALOG.map((c) => (
              <button
                key={c.id}
                onClick={() => onToggle(c.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-accent",
                  selected.has(c.id) && "bg-accent",
                )}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", selected.has(c.id) ? "bg-ai" : "bg-muted-foreground/30")} />
                <span className="truncate">{c.name}</span>
                {c.hasHitl && (
                  <span className="ml-auto inline-flex items-center gap-0.5 rounded border border-warning/30 bg-warning/10 px-1 py-0.5 text-[9.5px] font-medium text-warning" title="Campaign includes a Human Escalation node">
                    <Flag className="h-2.5 w-2.5" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RunFilter({
  runs, value, onChange,
}: {
  runs: { id: string; name: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentLabel = runs.find((r) => r.id === value)?.name;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors",
          value ? "border-ai/40 bg-ai/5 text-foreground" : "border-border bg-card hover:bg-accent/40",
        )}
      >
        Run
        {currentLabel && <span className="max-w-[160px] truncate text-[10.5px] text-ai">· {currentLabel}</span>}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-accent", value === null && "bg-accent")}
            >
              All runs
            </button>
            {runs.map((r) => (
              <button
                key={r.id}
                onClick={() => { onChange(r.id); setOpen(false); }}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-accent", value === r.id && "bg-accent")}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", value === r.id ? "bg-ai" : "bg-muted-foreground/30")} />
                <span className="truncate">{r.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DateFilter({ icon: Icon, label, value, onChange }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: DateWindow;
  onChange: (v: DateWindow) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = value !== "all";
  const currentLabel = DATE_WINDOWS.find((w) => w.value === value)?.label ?? "";
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors",
          active ? "border-ai/40 bg-ai/5 text-foreground" : "border-border bg-card hover:bg-accent/40",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
        {active && <span className="text-[10.5px] text-ai">· {currentLabel}</span>}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 w-40 rounded-lg border border-border bg-card p-1 shadow-lg">
            {DATE_WINDOWS.map((w) => (
              <button
                key={w.value}
                onClick={() => { onChange(w.value); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-accent",
                  value === w.value && "bg-accent",
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
