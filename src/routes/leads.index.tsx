import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  LEAD_RECORDS, leadCounts, activeTasksFor, maskPhone,
  PRODUCT_LABEL, PRODUCT_TINT,
  type ProductKind, type LeadRecord,
} from "@/lib/leads-data";
import { ArrowUpDown, Search, Users, ShieldCheck, Eye, EyeOff, Landmark, Shield, CreditCard as CreditCardIcon, FileEdit, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/leads/")({
  component: LeadsManagement,
  head: () => ({ meta: [{ title: "Leads · Pi Agents FinServ" }] }),
});

type FilterKind = "All" | ProductKind;
const KIND_FILTERS: FilterKind[] = ["All", "PersonalLoan", "InsurancePolicy", "CreditCard", "Application", "InvestmentAccount"];

const KIND_ICON: Record<ProductKind, React.ComponentType<{ className?: string }>> = {
  PersonalLoan: Landmark,
  InsurancePolicy: Shield,
  CreditCard: CreditCardIcon,
  Application: FileEdit,
  InvestmentAccount: TrendingUp,
};

const TASK_TONE = {
  info:   "border-border bg-secondary text-muted-foreground",
  warn:   "border-warning/40 bg-warning/10 text-warning",
  urgent: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;

type SortKey = "customer" | "products" | "tasks";

function LeadsManagement() {
  const counts = leadCounts();
  const [kind, setKind] = useState<FilterKind>("All");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("tasks");
  const [sortAsc, setSortAsc] = useState(false);
  const [piiRedacted, setPiiRedacted] = useState(true);

  const rows = useMemo(() => {
    let list = LEAD_RECORDS.slice();
    if (kind !== "All") list = list.filter((l) => l.products.some((p) => p.kind === kind));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((l) =>
        l.customerName.toLowerCase().includes(q)
        || l.phone.toLowerCase().includes(q)
        || l.customerId.toLowerCase().includes(q)
        || l.products.some((p) => {
          if (p.kind === "PersonalLoan") return p.loanId.toLowerCase().includes(q);
          if (p.kind === "InsurancePolicy") return p.policyNumber.toLowerCase().includes(q);
          if (p.kind === "CreditCard") return p.cardId.toLowerCase().includes(q);
          if (p.kind === "Application") return p.applicationId.toLowerCase().includes(q);
          if (p.kind === "InvestmentAccount") return p.accountNumber.toLowerCase().includes(q);
          return false;
        }),
      );
    }
    list.sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      switch (sortKey) {
        case "customer": return dir * a.customerName.localeCompare(b.customerName);
        case "products": return dir * (a.products.length - b.products.length);
        case "tasks":    return dir * (activeTasksFor(a).length - activeTasksFor(b).length);
      }
    });
    return list;
  }, [kind, search, sortKey, sortAsc]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((s) => !s);
    else { setSortKey(k); setSortAsc(false); }
  };

  return (
    <AppShell>
      <PageHeader
        title="Leads"
        description="One customer, many products — persistent per-borrower memory across loans, policies, cards and applications. Referenceable as lead.memory.* in the campaign builder."
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

      {/* Product-mix counters */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        <BookStat label="Total customers"    value={counts.total.toLocaleString()}                    unit="on the book" />
        <BookStat label="Personal Loans"     value={counts.byKind.PersonalLoan.toLocaleString()}      unit="active loans" tint="chart-1" />
        <BookStat label="Insurance Policies" value={counts.byKind.InsurancePolicy.toLocaleString()}   unit="active policies" tint="chart-2" />
        <BookStat label="Credit Cards"       value={counts.byKind.CreditCard.toLocaleString()}        unit="active cards" tint="chart-4" />
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {KIND_FILTERS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                kind === k ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {k === "All" ? "All" : PRODUCT_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / phone / product id"
            className="h-9 pl-8 text-[12.5px]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th onClick={() => toggleSort("customer")} sorted={sortKey === "customer" ? sortAsc : undefined}>Customer</Th>
              <Th>Phone</Th>
              <Th onClick={() => toggleSort("products")} sorted={sortKey === "products" ? sortAsc : undefined}>Products</Th>
              <Th onClick={() => toggleSort("tasks")} sorted={sortKey === "tasks" ? sortAsc : undefined}>Active tasks</Th>
              <Th>Last interaction</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => <Row key={lead.id} lead={lead} piiRedacted={piiRedacted} />)}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-4 py-12 text-center text-[12.5px] text-muted-foreground">
            No customers match the current filter.
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span>Showing <span className="font-medium text-foreground">{rows.length}</span> of {counts.total} customers.</span>
      </div>
    </AppShell>
  );
}

function BookStat({ label, value, unit, tint }: { label: string; value: string; unit: string; tint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <p className={cn("text-[11px] uppercase tracking-wider", tint ? `text-${tint}` : "text-muted-foreground")}>{label}</p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="text-[12px] text-muted-foreground">{unit}</p>
      </div>
    </div>
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

function Row({ lead, piiRedacted }: { lead: LeadRecord; piiRedacted: boolean }) {
  const tasks = activeTasksFor(lead);
  const lastInteraction = lead.interactions[0];
  return (
    <tr className="border-t border-border hover:bg-accent/30">
      <td className="px-3 py-2.5">
        <div className="font-medium">{lead.customerName}</div>
        <div className="mt-0.5 text-[10.5px] text-muted-foreground">{lead.segment} · Grade {lead.riskGrade}</div>
      </td>
      <td className="px-3 py-2.5 font-mono text-[11.5px]">
        {piiRedacted ? maskPhone(lead.phone) : lead.phone}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {lead.products.map((p, i) => {
            const Icon = KIND_ICON[p.kind];
            return (
              <span key={i}
                className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium",
                  PRODUCT_TINT[p.kind])}
                title={PRODUCT_LABEL[p.kind]}>
                <Icon className="h-2.5 w-2.5" />
                {PRODUCT_LABEL[p.kind]}
              </span>
            );
          })}
        </div>
      </td>
      <td className="px-3 py-2.5">
        {tasks.length === 0
          ? <span className="text-[11.5px] text-muted-foreground/70">—</span>
          : (
            <div className="flex flex-wrap gap-1">
              {tasks.slice(0, 3).map((t, i) => (
                <span key={i} className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium", TASK_TONE[t.tone])}>
                  {t.label}
                </span>
              ))}
              {tasks.length > 3 && (
                <span className="inline-flex items-center rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                  +{tasks.length - 3}
                </span>
              )}
            </div>
          )}
      </td>
      <td className="px-3 py-2.5">
        {lastInteraction
          ? <span className="text-[11.5px] text-muted-foreground">
              <span className="text-foreground">{lastInteraction.channel}</span> · {lastInteraction.timestamp}
            </span>
          : <span className="text-[11.5px] text-muted-foreground/70">—</span>}
      </td>
      <td className="px-3 py-2.5 text-right">
        <Button variant="ghost" size="sm" className="h-7 text-[11.5px]" asChild>
          <Link to="/leads/$id" params={{ id: lead.id }}>Open</Link>
        </Button>
      </td>
    </tr>
  );
}
