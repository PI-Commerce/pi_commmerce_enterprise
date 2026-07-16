import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getLead, primaryLoan, maskPhone, maskEmail, maskCustomerId, type LeadRecord, type DpdBucket } from "@/lib/leads-data";
import { ArrowLeft, Phone, Mail, ShieldCheck, Sparkles, MessageCircle, MessageSquare, Clock, Calendar, EyeOff, Eye } from "lucide-react";

export const Route = createFileRoute("/leads/$id")({
  component: LeadDetail,
  head: ({ params }) => ({ meta: [{ title: `Lead ${params.id} · Pi Agents FinServ` }] }),
  loader: ({ params }) => {
    const lead = getLead(params.id);
    if (!lead) throw notFound();
    return { lead };
  },
});

const BUCKET_TINT: Record<DpdBucket, string> = {
  "Pre-due": "text-chart-1 bg-chart-1/10 border-chart-1/25",
  "Early":   "text-warning bg-warning/10 border-warning/25",
  "Mid":     "text-destructive bg-destructive/10 border-destructive/25",
};

const GRADE_TINT: Record<string, string> = {
  A: "text-success bg-success/10 border-success/25",
  B: "text-chart-2 bg-chart-2/10 border-chart-2/25",
  C: "text-warning bg-warning/10 border-warning/25",
  D: "text-destructive bg-destructive/10 border-destructive/25",
};

function LeadDetail() {
  const { lead } = Route.useLoaderData() as { lead: LeadRecord };
  const loan = primaryLoan(lead);
  // PII redaction on by default — masks phone / email / customer id in the header.
  const [piiRedacted, setPiiRedacted] = useState(true);
  const phoneDisplay = piiRedacted ? maskPhone(lead.phone) : lead.phone;
  const emailDisplay = piiRedacted && lead.email ? maskEmail(lead.email) : lead.email;
  const customerIdDisplay = piiRedacted ? maskCustomerId(lead.customerId) : lead.customerId;

  return (
    <AppShell>
      {/* Breadcrumb + back */}
      <div className="mb-4 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Link to="/leads" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Leads
        </Link>
        <span>/</span>
        <span className="font-mono text-[11.5px]">{lead.id}</span>
      </div>

      {/* Header card */}
      <div className="mb-5 rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">{lead.customerName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[12.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> <span className="font-mono">{phoneDisplay}</span></span>
              {emailDisplay && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {emailDisplay}</span>}
              <span className="text-[11px] text-muted-foreground/70">· Customer ID <span className="font-mono">{customerIdDisplay}</span></span>
              {piiRedacted && (
                <span className="inline-flex items-center gap-1 rounded-full border border-ai/25 bg-ai/8 px-1.5 py-0.5 text-[10px] font-medium text-ai">
                  <ShieldCheck className="h-2.5 w-2.5" /> PII redacted
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPiiRedacted((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                piiRedacted
                  ? "border-border bg-secondary text-muted-foreground hover:bg-accent"
                  : "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15",
              )}
              title={piiRedacted ? "Reveal PII for troubleshooting" : "Re-mask PII"}
            >
              {piiRedacted ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {piiRedacted ? "Reveal PII" : "Re-mask"}
            </button>
            <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
              {lead.segment}
            </span>
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide", GRADE_TINT[lead.riskGrade])}>
              <ShieldCheck className="h-3 w-3" /> Grade {lead.riskGrade}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Left column — 2/3 width */}
        <div className="col-span-2 space-y-4">
          {/* Loan card */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Personal Loan</h2>
                <span className="font-mono text-[11.5px] text-muted-foreground">{loan.loanId}</span>
              </div>
              <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium", BUCKET_TINT[loan.dpdBucket])}>
                {loan.dpdBucket}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-4 px-4 py-4">
              <Fact label="EMI amount"    value={`₹${loan.emiAmount.toLocaleString("en-IN")}`} />
              <Fact label="Outstanding"   value={`₹${loan.outstanding.toLocaleString("en-IN")}`} />
              <Fact label="Due date"      value={loan.dueDate} />
              <Fact label="DPD"           value={loan.dpdDays > 0 ? `+${loan.dpdDays}d` : `${loan.dpdDays}d`} />
              <Fact label="Disbursed on"  value={loan.disbursedOn} muted />
              <Fact label="Tenure"        value={`${loan.tenureMonths} months`} muted />
              <Fact label="Product"       value="Personal Loan" muted />
            </div>
          </div>

          {/* PTP history */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Promise-to-Pay history</h2>
              <span className="text-[11.5px] text-muted-foreground">{loan.ptpHistory.length} promise{loan.ptpHistory.length === 1 ? "" : "s"}</span>
            </div>
            {loan.ptpHistory.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">No promises captured yet.</div>
            ) : (
              <table className="w-full text-[12.5px]">
                <thead className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Promised date</th>
                    <th className="px-4 py-2 text-left font-medium">Amount</th>
                    <th className="px-4 py-2 text-left font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {loan.ptpHistory.map((p, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-2.5 tabular-nums">{p.date}</td>
                      <td className="px-4 py-2.5 tabular-nums">₹{p.amount.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-2.5">
                        {p.kept
                          ? <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10.5px] font-medium text-success">Kept</span>
                          : <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10.5px] font-medium text-destructive">Broken</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right column — 1/3 width */}
        <div className="space-y-4">
          {/* PTP rate widget */}
          <div className="rounded-xl border border-border bg-card px-4 py-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">PTP kept rate</p>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <p className={cn("text-3xl font-semibold tabular-nums",
                lead.ptpRate.ratePct >= 70 ? "text-success" : lead.ptpRate.ratePct >= 40 ? "text-warning" : "text-destructive")}>
                {lead.ptpRate.ratePct}%
              </p>
              <p className="text-[12px] text-muted-foreground">
                {lead.ptpRate.kept}/{lead.ptpRate.made} promises kept
              </p>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className={cn("h-full transition-all",
                lead.ptpRate.ratePct >= 70 ? "bg-success" : lead.ptpRate.ratePct >= 40 ? "bg-warning" : "bg-destructive")}
                style={{ width: `${lead.ptpRate.ratePct}%` }} />
            </div>
          </div>

          {/* Contact frequency */}
          <div className="rounded-xl border border-border bg-card px-4 py-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Contact frequency (30d)</p>
            <div className="mt-3 space-y-2">
              <FreqRow icon={MessageCircle} label="WhatsApp" value={lead.contactFrequency.whatsapp30d} />
              <FreqRow icon={Phone}         label="Voice"    value={lead.contactFrequency.voice30d} />
              <FreqRow icon={MessageSquare} label="SMS"      value={lead.contactFrequency.sms30d} />
            </div>
          </div>

          {/* Preferences */}
          <div className="rounded-xl border border-border bg-card px-4 py-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Preferences</p>
            <div className="mt-2.5 space-y-2 text-[12.5px]">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Preferred days:</span>
                <span>{lead.preferences.preferredDow.join(" · ")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Preferred time:</span>
                <span>{lead.preferences.preferredTod}</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Language:</span>
                <span className="font-mono text-[11.5px]">{lead.preferences.language}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="outline" className="h-9 justify-start text-[12.5px]" asChild>
              <Link to="/campaigns">Trigger campaign for this lead</Link>
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Fact({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-[13.5px] tabular-nums", muted ? "text-muted-foreground" : "font-medium")}>{value}</p>
    </div>
  );
}

function FreqRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  const max = 15;
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-foreground/40" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
