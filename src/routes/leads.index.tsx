import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  LEAD_RECORDS, maskPhone,
  PRODUCT_LABEL, PRODUCT_TINT,
  type ProductKind, type LeadRecord,
} from "@/lib/leads-data";
import {
  ArrowUpDown, Search, ShieldCheck, Eye, EyeOff, Landmark, Shield,
  CreditCard as CreditCardIcon, FileEdit, TrendingUp, Calendar, X, ChevronDown,
} from "lucide-react";

export const Route = createFileRoute("/leads/")({
  component: LeadsManagement,
  head: () => ({ meta: [{ title: "Leads · Pi Agents FinServ" }] }),
});

const ALL_KINDS: ProductKind[] = ["PersonalLoan", "InsurancePolicy", "CreditCard", "Application", "InvestmentAccount"];
const KIND_ICON: Record<ProductKind, React.ComponentType<{ className?: string }>> = {
  PersonalLoan: Landmark,
  InsurancePolicy: Shield,
  CreditCard: CreditCardIcon,
  Application: FileEdit,
  InvestmentAccount: TrendingUp,
};

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

type SortKey = "lastUpdated" | "created" | "lastInteraction" | "name";

function LeadsManagement() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [kinds, setKinds] = useState<Set<ProductKind>>(new Set());
  const [createdWin, setCreatedWin] = useState<DateWindow>("all");
  const [updatedWin, setUpdatedWin] = useState<DateWindow>("all");
  const [interactedWin, setInteractedWin] = useState<DateWindow>("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastUpdated");
  const [sortAsc, setSortAsc] = useState(false);
  const [piiRedacted, setPiiRedacted] = useState(true);

  const rows = useMemo(() => {
    let list = LEAD_RECORDS.slice();
    if (kinds.size) list = list.filter((l) => l.products.some((p) => kinds.has(p.kind)));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((l) =>
        l.customerName.toLowerCase().includes(q)
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
        case "name":            return dir * a.customerName.localeCompare(b.customerName);
        case "created":         return dir * (Date.parse(a.createdAt) - Date.parse(b.createdAt));
        case "lastUpdated":     return dir * (Date.parse(a.lastUpdatedAt) - Date.parse(b.lastUpdatedAt));
        case "lastInteraction": return dir * (Date.parse(a.lastInteractionAt) - Date.parse(b.lastInteractionAt));
      }
    });
    return list;
  }, [kinds, search, createdWin, updatedWin, interactedWin, sortKey, sortAsc]);

  const toggleKind = (k: ProductKind) => {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const clearFilters = () => {
    setKinds(new Set()); setCreatedWin("all"); setUpdatedWin("all"); setInteractedWin("all"); setSearch("");
  };
  const filtersActive = kinds.size > 0 || createdWin !== "all" || updatedWin !== "all" || interactedWin !== "all" || !!search.trim();

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((s) => !s);
    else { setSortKey(k); setSortAsc(false); }
  };

  return (
    <AppShell>
      <PageHeader
        title="Leads"
        description="One customer, many financial products — persistent per-lead memory across loans, policies, cards and applications."
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

      {/* Toolbar: search + filters */}
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
        <ProductFilter kinds={kinds} onToggle={toggleKind} />
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

      {/* Table — every row is clickable */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th>Lead ID</Th>
              <Th onClick={() => toggleSort("name")} sorted={sortKey === "name" ? sortAsc : undefined}>Name</Th>
              <Th>Phone</Th>
              <Th onClick={() => toggleSort("lastUpdated")} sorted={sortKey === "lastUpdated" ? sortAsc : undefined}>Last Updated</Th>
              <Th onClick={() => toggleSort("created")} sorted={sortKey === "created" ? sortAsc : undefined}>Lead Creation</Th>
              <Th onClick={() => toggleSort("lastInteraction")} sorted={sortKey === "lastInteraction" ? sortAsc : undefined}>Last Interaction</Th>
              <Th>Financial Products</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => (
              <Row
                key={lead.id}
                lead={lead}
                piiRedacted={piiRedacted}
                onOpen={() => navigate({ to: "/leads/$id", params: { id: lead.id } })}
              />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-4 py-12 text-center text-[12.5px] text-muted-foreground">
            No leads match the current filters.
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Th({ children, onClick, sorted }: { children?: React.ReactNode; onClick?: () => void; sorted?: boolean }) {
  return (
    <th className={cn("px-3 py-2 text-left font-medium", onClick && "cursor-pointer hover:text-foreground")}
        onClick={onClick}>
      <span className="inline-flex items-center gap-1">
        {children}
        {onClick && <ArrowUpDown className={cn("h-3 w-3", sorted != null ? "text-foreground" : "text-muted-foreground/50")} />}
      </span>
    </th>
  );
}

/** Product-kind multi-select — chips inside a popover so the toolbar stays compact. */
function ProductFilter({ kinds, onToggle }: { kinds: Set<ProductKind>; onToggle: (k: ProductKind) => void }) {
  const [open, setOpen] = useState(false);
  const count = kinds.size;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors",
          count > 0 ? "border-ai/40 bg-ai/5 text-ai" : "border-border bg-card hover:bg-accent/40",
        )}
      >
        Financial Products
        {count > 0 && <span className="rounded-full bg-ai/20 px-1.5 text-[10px] font-semibold">{count}</span>}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-20 w-56 rounded-lg border border-border bg-card p-1.5 shadow-lg" onMouseLeave={() => setOpen(false)}>
          {ALL_KINDS.map((k) => {
            const Icon = KIND_ICON[k];
            const on = kinds.has(k);
            return (
              <button
                key={k}
                onClick={() => onToggle(k)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-left transition-colors",
                  on ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-ai bg-ai text-background" : "border-border")}>
                  {on && <svg viewBox="0 0 12 12" className="h-2.5 w-2.5"><path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </span>
                <Icon className="h-3.5 w-3.5" />
                {PRODUCT_LABEL[k]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Date-window quick-chip filter — All / 7d / 30d / 90d. Uses a popover so the
 *  toolbar reads left→right without an accordion of chips per field. */
function DateFilter({ icon: Icon, label, value, onChange }: { icon: React.ComponentType<{ className?: string }>; label: string; value: DateWindow; onChange: (v: DateWindow) => void }) {
  const [open, setOpen] = useState(false);
  const active = value !== "all";
  const currentLabel = DATE_WINDOWS.find((w) => w.value === value)!.label;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors",
          active ? "border-ai/40 bg-ai/5 text-ai" : "border-border bg-card hover:bg-accent/40",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
        {active && <span className="text-muted-foreground">·</span>}
        {active && <span className="text-[11px]">{currentLabel}</span>}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-20 w-44 rounded-lg border border-border bg-card p-1.5 shadow-lg" onMouseLeave={() => setOpen(false)}>
          {DATE_WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => { onChange(w.value); setOpen(false); }}
              className={cn(
                "flex w-full items-center rounded-md px-2 py-1.5 text-[12px] text-left transition-colors",
                value === w.value ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ lead, piiRedacted, onOpen }: { lead: LeadRecord; piiRedacted: boolean; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} className="cursor-pointer border-t border-border transition-colors hover:bg-accent/40">
      <td className="px-3 py-2.5 font-mono text-[11.5px]">{lead.id}</td>
      <td className="px-3 py-2.5 font-medium">{lead.customerName}</td>
      <td className="px-3 py-2.5 font-mono text-[11.5px]">
        {piiRedacted ? maskPhone(lead.phone) : lead.phone}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{lead.lastUpdatedAt}</td>
      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{lead.createdAt}</td>
      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{lead.lastInteractionAt}</td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {lead.products.map((p, i) => {
            const Icon = KIND_ICON[p.kind];
            return (
              <span key={i}
                className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium", PRODUCT_TINT[p.kind])}
                title={PRODUCT_LABEL[p.kind]}>
                <Icon className="h-2.5 w-2.5" />
                {PRODUCT_LABEL[p.kind]}
              </span>
            );
          })}
        </div>
      </td>
    </tr>
  );
}
