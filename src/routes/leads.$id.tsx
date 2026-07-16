import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getLead, maskPhone, maskEmail, maskCustomerId,
  PRODUCT_LABEL, PRODUCT_TINT,
  type LeadRecord, type LeadProduct, type DpdBucket,
} from "@/lib/leads-data";
import {
  ArrowLeft, Phone, Mail, ShieldCheck, Sparkles, MessageCircle, MessageSquare, Clock, Calendar, EyeOff, Eye,
  Landmark, Shield, CreditCard as CreditCardIcon, FileEdit, TrendingUp, Mail as MailIcon,
} from "lucide-react";

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
const CHANNEL_ICON = {
  WhatsApp: MessageCircle,
  Voice: Phone,
  SMS: MessageSquare,
  Email: MailIcon,
} as const;

function LeadDetail() {
  const { lead } = Route.useLoaderData() as { lead: LeadRecord };
  const [piiRedacted, setPiiRedacted] = useState(true);
  const phoneDisplay = piiRedacted ? maskPhone(lead.phone) : lead.phone;
  const emailDisplay = piiRedacted && lead.email ? maskEmail(lead.email) : lead.email;
  const customerIdDisplay = piiRedacted ? maskCustomerId(lead.customerId) : lead.customerId;

  return (
    <AppShell>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Link to="/leads" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Leads
        </Link>
        <span>/</span>
        <span className="font-mono text-[11.5px]">{lead.id}</span>
      </div>

      {/* Header */}
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
        {/* Left column — 2/3 width: products + interactions */}
        <div className="col-span-2 space-y-4">
          <SectionHeader label={`Products held (${lead.products.length})`} />
          {lead.products.map((p, i) => <ProductCard key={i} product={p} />)}

          <SectionHeader label={`Interactions timeline (last ${lead.interactions.length})`} />
          <div className="rounded-xl border border-border bg-card">
            {lead.interactions.map((it, i) => {
              const Icon = CHANNEL_ICON[it.channel];
              return (
                <div key={i} className={cn("flex items-start gap-3 px-4 py-3", i > 0 && "border-t border-border")}>
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="font-medium">{it.summary}</span>
                      {it.outcome && <span className="text-muted-foreground">· {it.outcome}</span>}
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                      {it.channel} · {it.direction === "outbound" ? "→ outbound" : "← inbound"}
                      {it.productRef && <> · <span className="font-mono">{it.productRef}</span></>}
                      <span className="ml-1.5">· {it.timestamp}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column — 1/3 width */}
        <div className="space-y-4">
          <PtpRateCard lead={lead} />
          <PtpRegisterCard lead={lead} />
          <ContactFreqCard lead={lead} />
          <PreferencesCard lead={lead} />
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="outline" className="h-9 justify-start text-[12.5px]" asChild>
              <Link to="/campaigns">Trigger a campaign for this customer</Link>
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ---- Section header (small helper) ---- */
function SectionHeader({ label }: { label: string }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</h2>;
}

/* ---- One card per product — the dispatch happens here ---- */

function ProductCard({ product }: { product: LeadProduct }) {
  switch (product.kind) {
    case "PersonalLoan":      return <PersonalLoanCard p={product} />;
    case "InsurancePolicy":   return <PolicyCard p={product} />;
    case "CreditCard":        return <CreditCardCard p={product} />;
    case "Application":       return <ApplicationCard p={product} />;
    case "InvestmentAccount": return <InvestmentCard p={product} />;
  }
}

function ProductChrome({ kind, id, header, children }: { kind: LeadProduct["kind"]; id: string; header: React.ReactNode; children: React.ReactNode }) {
  const IconMap = {
    PersonalLoan: Landmark, InsurancePolicy: Shield, CreditCard: CreditCardIcon,
    Application: FileEdit, InvestmentAccount: TrendingUp,
  };
  const Icon = IconMap[kind];
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-md border", PRODUCT_TINT[kind])}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-[13px] font-semibold">{PRODUCT_LABEL[kind]}</h3>
          <span className="font-mono text-[11px] text-muted-foreground">{id}</span>
        </div>
        {header}
      </div>
      {children}
    </div>
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

function PersonalLoanCard({ p }: { p: Extract<LeadProduct, { kind: "PersonalLoan" }> }) {
  return (
    <ProductChrome kind={p.kind} id={p.loanId} header={
      <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium", BUCKET_TINT[p.dpdBucket])}>
        {p.dpdBucket}
      </span>
    }>
      <div className="grid grid-cols-4 gap-4 px-4 py-4">
        <Fact label="EMI amount"    value={`₹${p.emiAmount.toLocaleString("en-IN")}`} />
        <Fact label="Outstanding"   value={`₹${p.outstanding.toLocaleString("en-IN")}`} />
        <Fact label="Due date"      value={p.dueDate} />
        <Fact label="DPD"           value={p.dpdDays > 0 ? `+${p.dpdDays}d` : `${p.dpdDays}d`} />
        <Fact label="Disbursed on"  value={p.disbursedOn} muted />
        <Fact label="Tenure"        value={`${p.tenureMonths} months`} muted />
        <Fact label="PTPs on record" value={String(p.ptpHistory.length)} muted />
      </div>
    </ProductChrome>
  );
}

function PolicyCard({ p }: { p: Extract<LeadProduct, { kind: "InsurancePolicy" }> }) {
  const renewalTone = p.daysToRenewal < 0 ? "text-destructive"
    : p.daysToRenewal <= 15 ? "text-warning" : "text-success";
  return (
    <ProductChrome kind={p.kind} id={p.policyNumber} header={
      <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">{p.policyType}</span>
    }>
      <div className="grid grid-cols-4 gap-4 px-4 py-4">
        <Fact label="Premium (annual)" value={`₹${p.premium.toLocaleString("en-IN")}`} />
        <Fact label="Sum insured"      value={`₹${p.sumInsured.toLocaleString("en-IN")}`} />
        <Fact label="Renewal date"     value={p.renewalDate} />
        <div>
          <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Days to renewal</p>
          <p className={cn("mt-0.5 text-[13.5px] font-medium tabular-nums", renewalTone)}>
            {p.daysToRenewal < 0 ? `Lapsed ${-p.daysToRenewal}d ago` : `in ${p.daysToRenewal}d`}
          </p>
        </div>
        <Fact label="Last renewed" value={p.lastRenewedOn} muted />
        <Fact label="Claims on record" value={String(p.claims.length)} muted />
      </div>
    </ProductChrome>
  );
}

function CreditCardCard({ p }: { p: Extract<LeadProduct, { kind: "CreditCard" }> }) {
  const utilizationPct = Math.round((p.outstanding / p.creditLimit) * 100);
  return (
    <ProductChrome kind={p.kind} id={p.cardId} header={
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">{p.cardType}</span>
        <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium", BUCKET_TINT[p.dpdBucket])}>
          {p.dpdBucket}
        </span>
      </div>
    }>
      <div className="grid grid-cols-4 gap-4 px-4 py-4">
        <Fact label="Outstanding"    value={`₹${p.outstanding.toLocaleString("en-IN")}`} />
        <Fact label="Credit limit"   value={`₹${p.creditLimit.toLocaleString("en-IN")}`} />
        <Fact label="Utilization"    value={`${utilizationPct}%`} />
        <Fact label="Min due"        value={`₹${p.minDue.toLocaleString("en-IN")}`} />
        <Fact label="Total due"      value={`₹${p.totalDue.toLocaleString("en-IN")}`} muted />
        <Fact label="Due date"       value={p.dueDate} muted />
        <Fact label="DPD"            value={p.dpdDays > 0 ? `+${p.dpdDays}d` : `${p.dpdDays}d`} muted />
      </div>
    </ProductChrome>
  );
}

function ApplicationCard({ p }: { p: Extract<LeadProduct, { kind: "Application" }> }) {
  const stageTone = p.stage === "Dropped" ? "text-destructive"
    : p.stage === "OfferShared" ? "text-success"
    : "text-warning";
  return (
    <ProductChrome kind={p.kind} id={p.applicationId} header={
      <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
        Applying for {p.applyingFor}
      </span>
    }>
      <div className="grid grid-cols-4 gap-4 px-4 py-4">
        <div>
          <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Stage</p>
          <p className={cn("mt-0.5 text-[13.5px] font-medium", stageTone)}>{p.stage}</p>
        </div>
        <Fact label="KYC status"    value={p.kycStatus} />
        <Fact label="Stage entered" value={p.stageEnteredAt} muted />
        {p.droppedReason && <Fact label="Drop reason" value={p.droppedReason} muted />}
      </div>
    </ProductChrome>
  );
}

function InvestmentCard({ p }: { p: Extract<LeadProduct, { kind: "InvestmentAccount" }> }) {
  return (
    <ProductChrome kind={p.kind} id={p.accountNumber} header={
      <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">{p.investmentType}</span>
    }>
      <div className="grid grid-cols-4 gap-4 px-4 py-4">
        <Fact label="Portfolio value" value={`₹${p.portfolioValue.toLocaleString("en-IN")}`} />
        <Fact label="Last trade"      value={p.lastTradeOn} />
        <Fact label="Active SIP"      value={p.activeSip ? "Yes" : "No"} muted />
      </div>
    </ProductChrome>
  );
}

/* ---- Sidebar cards ---- */

function PtpRateCard({ lead }: { lead: LeadRecord }) {
  const pct = lead.ptpRate.ratePct;
  const tone = pct >= 70 ? "success" : pct >= 40 ? "warning" : "destructive";
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">PTP kept rate</p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <p className={cn("text-3xl font-semibold tabular-nums", `text-${tone}`)}>{pct}%</p>
        <p className="text-[12px] text-muted-foreground">
          {lead.ptpRate.kept}/{lead.ptpRate.made} promises kept
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full transition-all", `bg-${tone}`)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-[10.5px] text-muted-foreground">Aggregated across all products with PTPs (currently Personal Loans only).</p>
    </div>
  );
}

function PtpRegisterCard({ lead }: { lead: LeadRecord }) {
  if (lead.ptpRegister.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">PTP register</p>
      </div>
      <div className="max-h-52 overflow-y-auto">
        {lead.ptpRegister.map((r, i) => (
          <div key={i} className={cn("flex items-center justify-between px-4 py-2 text-[11.5px]", i > 0 && "border-t border-border/60")}>
            <div>
              <div className="tabular-nums">{r.promisedDate}</div>
              <div className="text-[10px] text-muted-foreground">
                {PRODUCT_LABEL[r.productKind]} · <span className="font-mono">{r.productRef}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="tabular-nums">₹{r.amount.toLocaleString("en-IN")}</div>
              <div className={cn("text-[10px] font-medium", r.kept === true ? "text-success" : r.kept === false ? "text-destructive" : "text-muted-foreground")}>
                {r.kept === true ? "Kept" : r.kept === false ? "Broken" : "Pending"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactFreqCard({ lead }: { lead: LeadRecord }) {
  const rows = [
    { icon: MessageCircle, label: "WhatsApp", value: lead.contactFrequency.whatsapp30d },
    { icon: Phone,         label: "Voice",    value: lead.contactFrequency.voice30d },
    { icon: MessageSquare, label: "SMS",      value: lead.contactFrequency.sms30d },
  ];
  const max = 15;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Contact frequency (30d)</p>
      <div className="mt-3 space-y-2">
        {rows.map(({ icon: Icon, label, value }) => {
          const pct = Math.min(100, Math.round((value / max) * 100));
          return (
            <div key={label}>
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
        })}
      </div>
    </div>
  );
}

function PreferencesCard({ lead }: { lead: LeadRecord }) {
  return (
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
  );
}
