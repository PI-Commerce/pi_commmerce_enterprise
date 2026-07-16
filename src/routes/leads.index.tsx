import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LEAD_RECORDS, leadCounts, primaryLoan, maskPhone, type DpdBucket, type LeadRecord } from "@/lib/leads-data";
import { ArrowUpDown, Search, Users, ShieldCheck, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/leads/")({
  component: LeadsManagement,
  head: () => ({ meta: [{ title: "Leads · Pi Agents FinServ" }] }),
});

const BUCKETS: (DpdBucket | "All")[] = ["All", "Pre-due", "Early", "Mid"];
const BUCKET_TINT: Record<DpdBucket, string> = {
  "Pre-due": "text-chart-1 bg-chart-1/10 border-chart-1/25",
  "Early":   "text-warning bg-warning/10 border-warning/25",
  "Mid":     "text-destructive bg-destructive/10 border-destructive/25",
};

type SortKey = "customer" | "dpd" | "outstanding" | "ptpRate";

function LeadsManagement() {
  const counts = leadCounts();
  const [bucket, setBucket] = useState<DpdBucket | "All">("All");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("dpd");
  const [sortAsc, setSortAsc] = useState(false);
  // PII redaction on by default (RBI/DPDPA-aligned demo default). Users can
  // temporarily reveal for troubleshooting via the header toggle.
  const [piiRedacted, setPiiRedacted] = useState(true);

  const rows = useMemo(() => {
    let list = LEAD_RECORDS.slice();
    if (bucket !== "All") list = list.filter((l) => primaryLoan(l).dpdBucket === bucket);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((l) =>
        l.customerName.toLowerCase().includes(q)
        || l.phone.toLowerCase().includes(q)
        || primaryLoan(l).loanId.toLowerCase().includes(q)
        || l.customerId.toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      const la = primaryLoan(a), lb = primaryLoan(b);
      const dir = sortAsc ? 1 : -1;
      switch (sortKey) {
        case "customer":    return dir * a.customerName.localeCompare(b.customerName);
        case "dpd":         return dir * (la.dpdDays - lb.dpdDays);
        case "outstanding": return dir * (la.outstanding - lb.outstanding);
        case "ptpRate":     return dir * (a.ptpRate.ratePct - b.ptpRate.ratePct);
      }
    });
    return list;
  }, [bucket, search, sortKey, sortAsc]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((s) => !s);
    else { setSortKey(k); setSortAsc(false); }
  };

  return (
    <AppShell>
      <PageHeader
        title="Leads"
        description="Persistent per-borrower memory across loans and campaigns. Referenceable as lead.memory.* in the campaign builder."
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

      {/* Counters row */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        <BookStat label="Total leads" value={counts.total.toLocaleString()} unit="borrowers" />
        <BookStat label="Pre-due bucket" value={counts.byBucket["Pre-due"].toLocaleString()} unit="borrowers" />
        <BookStat label="Early (1–7 DPD)" value={counts.byBucket["Early"].toLocaleString()} unit="borrowers" />
        <BookStat label="Mid (8+ DPD)"    value={counts.byBucket["Mid"].toLocaleString()} unit="borrowers" />
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {BUCKETS.map((b) => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                bucket === b ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {b}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / phone / loan id"
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
              <Th>Loan ID</Th>
              <Th>Bucket</Th>
              <Th onClick={() => toggleSort("dpd")} sorted={sortKey === "dpd" ? sortAsc : undefined}>DPD</Th>
              <Th onClick={() => toggleSort("outstanding")} sorted={sortKey === "outstanding" ? sortAsc : undefined}>Outstanding</Th>
              <Th>Last PTP</Th>
              <Th onClick={() => toggleSort("ptpRate")} sorted={sortKey === "ptpRate" ? sortAsc : undefined}>PTP rate</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => <Row key={lead.id} lead={lead} piiRedacted={piiRedacted} />)}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-4 py-12 text-center text-[12.5px] text-muted-foreground">
            No leads match the current filter.
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span>Showing <span className="font-medium text-foreground">{rows.length}</span> of {counts.total} leads.</span>
      </div>
    </AppShell>
  );
}

function BookStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
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
  const loan = primaryLoan(lead);
  const lastPtp = loan.ptpHistory[loan.ptpHistory.length - 1];
  const bucketClass = BUCKET_TINT[loan.dpdBucket];
  return (
    <tr className="border-t border-border hover:bg-accent/30">
      <td className="px-3 py-2.5">
        <div className="font-medium">{lead.customerName}</div>
        <div className="mt-0.5 text-[10.5px] text-muted-foreground">{lead.segment} · Grade {lead.riskGrade}</div>
      </td>
      <td className="px-3 py-2.5 font-mono text-[11.5px]">
        {piiRedacted ? maskPhone(lead.phone) : lead.phone}
      </td>
      <td className="px-3 py-2.5 font-mono text-[11.5px]">{loan.loanId}</td>
      <td className="px-3 py-2.5">
        <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium", bucketClass)}>
          {loan.dpdBucket}
        </span>
      </td>
      <td className="px-3 py-2.5 tabular-nums">{loan.dpdDays > 0 ? `+${loan.dpdDays}d` : `${loan.dpdDays}d`}</td>
      <td className="px-3 py-2.5 tabular-nums">₹{loan.outstanding.toLocaleString("en-IN")}</td>
      <td className="px-3 py-2.5">
        {lastPtp
          ? <span className={cn("text-[11.5px]", lastPtp.kept ? "text-success" : "text-destructive")}>
              {lastPtp.date} · {lastPtp.kept ? "Kept" : "Broken"}
            </span>
          : <span className="text-[11.5px] text-muted-foreground">—</span>}
      </td>
      <td className="px-3 py-2.5 tabular-nums">
        <span className={cn(
          lead.ptpRate.ratePct >= 70 ? "text-success" : lead.ptpRate.ratePct >= 40 ? "text-warning" : "text-destructive",
        )}>
          {lead.ptpRate.ratePct}%
        </span>
        <span className="ml-1 text-[10.5px] text-muted-foreground">({lead.ptpRate.kept}/{lead.ptpRate.made})</span>
      </td>
      <td className="px-3 py-2.5 text-right">
        <Button variant="ghost" size="sm" className="h-7 text-[11.5px]" asChild>
          <Link to="/leads/$id" params={{ id: lead.id }}>Open</Link>
        </Button>
      </td>
    </tr>
  );
}
