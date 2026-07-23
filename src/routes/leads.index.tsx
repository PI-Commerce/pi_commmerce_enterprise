import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LEAD_RECORDS, maskPhone, type LeadRecord, type Segment } from "@/lib/leads-data";
import {
  ArrowUpDown, Search, ShieldCheck, Eye, EyeOff, Calendar, X, ChevronDown, Megaphone,
} from "lucide-react";

export const Route = createFileRoute("/leads/")({
  component: LeadsManagement,
  head: () => ({ meta: [{ title: "Leads · Pi Commerce Enterprise" }] }),
});

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
function relTime(iso: string): string {
  const d = daysAgo(iso);
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  if (d < 30) return `${d} days ago`;
  if (d < 60) return `1 month ago`;
  return `${Math.floor(d / 30)} months ago`;
}

type SortKey = "lastUpdated" | "created" | "lastInteraction" | "name";

const ALL_CAMPAIGNS = (() => {
  const map = new Map<string, string>();
  for (const l of LEAD_RECORDS) for (const c of l.campaigns) if (!map.has(c.campaignId)) map.set(c.campaignId, c.campaignName);
  return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
})();

const SEGMENT_TINT: Record<Segment, string> = {
  VIP:    "border-ai/30 bg-ai/10 text-ai",
  Retail: "border-border bg-secondary text-muted-foreground",
  SME:    "border-success/30 bg-success/10 text-success",
};

function LeadsManagement() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [segments, setSegments] = useState<Set<Segment>>(new Set());
  const [campaigns, setCampaigns] = useState<Set<string>>(new Set());
  const [createdWin, setCreatedWin] = useState<DateWindow>("all");
  const [updatedWin, setUpdatedWin] = useState<DateWindow>("all");
  const [interactedWin, setInteractedWin] = useState<DateWindow>("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastUpdated");
  const [sortAsc, setSortAsc] = useState(false);
  const [piiRedacted, setPiiRedacted] = useState(true);

  const rows = useMemo(() => {
    let list = LEAD_RECORDS.slice();
    if (segments.size) list = list.filter((l) => segments.has(l.segment));
    if (campaigns.size) list = list.filter((l) => l.campaigns.some((c) => campaigns.has(c.campaignId)));
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
    list = list.filter((l) => withinWindow(l.lastUpdatedAt, updatedWin));
    list = list.filter((l) => withinWindow(l.lastInteractionAt, interactedWin));
    list.sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      switch (sortKey) {
        case "name":            return dir * a.name.localeCompare(b.name);
        case "created":         return dir * (Date.parse(a.createdAt) - Date.parse(b.createdAt));
        case "lastUpdated":     return dir * (Date.parse(a.lastUpdatedAt) - Date.parse(b.lastUpdatedAt));
        case "lastInteraction": return dir * (Date.parse(a.lastInteractionAt) - Date.parse(b.lastInteractionAt));
      }
    });
    return list;
  }, [segments, campaigns, search, createdWin, updatedWin, interactedWin, sortKey, sortAsc]);

  const toggleSeg = (s: Segment) => {
    setSegments((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };
  const toggleCampaign = (id: string) => {
    setCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearFilters = () => {
    setSegments(new Set()); setCampaigns(new Set());
    setCreatedWin("all"); setUpdatedWin("all"); setInteractedWin("all"); setSearch("");
  };
  const filtersActive = segments.size > 0 || campaigns.size > 0
    || createdWin !== "all" || updatedWin !== "all" || interactedWin !== "all" || !!search.trim();

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((s) => !s);
    else { setSortKey(k); setSortAsc(false); }
  };

  return (
    <AppShell>
      <PageHeader
        title="Leads"
        description="One contact, many campaigns — persistent per-lead memory across every touchpoint."
        actions={
          <button
            onClick={() => setPiiRedacted((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
              piiRedacted
                ? "border-ai/30 bg-ai/10 text-ai hover:bg-ai/15"
                : "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15",
            )}
            title={piiRedacted ? "PII currently masked · click to reveal" : "PII revealed · click to mask"}
          >
            {piiRedacted ? <ShieldCheck className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {piiRedacted ? "PII redacted" : "PII revealed"}
            {piiRedacted ? <Eye className="h-3.5 w-3.5 opacity-50" /> : null}
          </button>
        }
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
        <SegmentFilter selected={segments} onToggle={toggleSeg} />
        <CampaignFilter selected={campaigns} onToggle={toggleCampaign} />
        <DateFilter icon={Calendar} label="Created"          value={createdWin}    onChange={setCreatedWin} />
        <DateFilter icon={Calendar} label="Last updated"     value={updatedWin}    onChange={setUpdatedWin} />
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
              <Th>Segment</Th>
              <Th onClick={() => toggleSort("lastUpdated")} sorted={sortKey === "lastUpdated" ? sortAsc : undefined}>Last Updated</Th>
              <Th onClick={() => toggleSort("lastInteraction")} sorted={sortKey === "lastInteraction" ? sortAsc : undefined}>Last Interaction</Th>
              <Th>Active in</Th>
              <Th>Tags</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => (
              <Row key={lead.id} lead={lead} piiRedacted={piiRedacted} onOpen={() => navigate({ to: "/leads/$id", params: { id: lead.id } })} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[12px] text-muted-foreground">
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

function Row({ lead, piiRedacted, onOpen }: { lead: LeadRecord; piiRedacted: boolean; onOpen: () => void }) {
  const primary = lead.campaigns[0];
  const overflow = lead.campaigns.length - 1;
  return (
    <tr onClick={onOpen} className="cursor-pointer border-t border-border/60 transition-colors hover:bg-accent/30">
      <td className="px-4 py-3 font-mono text-[11.5px] text-muted-foreground">{lead.id}</td>
      <td className="px-4 py-3 font-medium">{lead.name}</td>
      <td className="px-4 py-3 font-mono text-[11.5px]">{piiRedacted ? maskPhone(lead.phone) : lead.phone}</td>
      <td className="px-4 py-3">
        <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium", SEGMENT_TINT[lead.segment])}>
          {lead.segment}
        </span>
      </td>
      <td className="px-4 py-3 text-[11.5px] text-muted-foreground">{relTime(lead.lastUpdatedAt)}</td>
      <td className="px-4 py-3 text-[11.5px] text-muted-foreground">{relTime(lead.lastInteractionAt)}</td>
      <td className="px-4 py-3">
        {primary ? (
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[11.5px]" title={primary.campaignName}>{primary.campaignName}</span>
            {overflow > 0 && (
              <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">+{overflow}</span>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {lead.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

function SegmentFilter({ selected, onToggle }: { selected: Set<Segment>; onToggle: (s: Segment) => void }) {
  const [open, setOpen] = useState(false);
  const all: Segment[] = ["VIP", "Retail", "SME"];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors",
          selected.size ? "border-ai/40 bg-ai/5 text-foreground" : "border-border bg-card hover:bg-accent/40",
        )}
      >
        Segment
        {selected.size > 0 && <span className="rounded-full bg-ai/15 px-1.5 text-[10px] font-semibold text-ai">{selected.size}</span>}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 w-48 rounded-lg border border-border bg-card p-1 shadow-lg">
            {all.map((s) => (
              <button
                key={s}
                onClick={() => onToggle(s)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-accent",
                  selected.has(s) && "bg-accent",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", selected.has(s) ? "bg-ai" : "bg-muted-foreground/30")} />
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

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
          <div className="absolute z-40 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
            {ALL_CAMPAIGNS.map((c) => (
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
