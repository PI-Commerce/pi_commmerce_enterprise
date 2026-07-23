import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";
import {
  getLead, maskPhone, maskEmail, maskCustomerId,
  PRODUCT_LABEL, PRODUCT_TINT,
  type LeadRecord, type LeadProduct, type DpdBucket,
} from "@/lib/leads-data";
import {
  ArrowLeft, Phone, Mail, ShieldCheck, MessageCircle, MessageSquare, Clock, Calendar, EyeOff, Eye,
  Landmark, Shield, CreditCard as CreditCardIcon, FileEdit, TrendingUp, Mail as MailIcon,
  Flag, Megaphone, Link as LinkIcon,
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

  const loans = lead.products.filter((p): p is Extract<LeadProduct, { kind: "PersonalLoan" }> => p.kind === "PersonalLoan");
  const policies = lead.products.filter((p): p is Extract<LeadProduct, { kind: "InsurancePolicy" }> => p.kind === "InsurancePolicy");
  const cards = lead.products.filter((p): p is Extract<LeadProduct, { kind: "CreditCard" }> => p.kind === "CreditCard");
  const applications = lead.products.filter((p): p is Extract<LeadProduct, { kind: "Application" }> => p.kind === "Application");
  const investments = lead.products.filter((p): p is Extract<LeadProduct, { kind: "InvestmentAccount" }> => p.kind === "InvestmentAccount");

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

      {/* Human Escalation banner — surfaces the lead-level flag with a link to
          the most recent flagging run. Hidden when the lead has never been flagged. */}
      {lead.humanEscalated && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-[12.5px] text-warning">
          <Flag className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">Human Escalation flagged</p>
            <p className="text-[11.5px] text-warning/90">
              This lead was routed to the escalation queue in {lead.campaigns.filter((c) => c.humanEscalated).length} of the {lead.campaigns.length} campaign runs below. See "Campaign History" for details.
            </p>
          </div>
        </div>
      )}

      {/* Header — Contact Details only. No segment, no risk grade. */}
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
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground/80">
              <span>Created: <span className="tabular-nums text-foreground">{lead.createdAt}</span></span>
              <span>·</span>
              <span>Last updated: <span className="tabular-nums text-foreground">{lead.lastUpdatedAt}</span></span>
              <span>·</span>
              <span>Last interaction: <span className="tabular-nums text-foreground">{lead.lastInteractionAt}</span></span>
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
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Left column — 2/3 width: Financial Portfolio + Activity Log */}
        <div className="col-span-2 space-y-4">
          {/* Financial Portfolio — Loans get full detail; other products are summary lines */}
          <SectionHeader label={`Financial Portfolio (${lead.products.length})`} />

          {loans.length === 0 && policies.length === 0 && cards.length === 0 && applications.length === 0 && investments.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-center text-[12px] text-muted-foreground">
              No financial products on this customer's book.
            </div>
          )}

          {/* Loans — full detail card each (PTP Rate + per-loan) */}
          {loans.map((p, i) => <PersonalLoanCard key={`ln-${i}`} p={p} leadPtpRatePct={lead.ptpRate.ratePct} keptMade={`${lead.ptpRate.kept}/${lead.ptpRate.made}`} />)}

          {/* Non-loan products — collapsed to a single-line portfolio badge each */}
          {policies.length > 0 && (
            <PortfolioLine
              icon={Shield}
              kind="InsurancePolicy"
              title="Insurance Policies"
              lines={policies.map((p) => `${p.policyType} · ${p.policyNumber} · renews ${p.renewalDate}`)}
            />
          )}
          {cards.length > 0 && (
            <PortfolioLine
              icon={CreditCardIcon}
              kind="CreditCard"
              title="Credit Cards"
              lines={cards.map((p) => `${p.cardType} · ${p.cardId} · limit ₹${p.creditLimit.toLocaleString("en-IN")}`)}
            />
          )}
          {applications.length > 0 && (
            <PortfolioLine
              icon={FileEdit}
              kind="Application"
              title="Applications"
              lines={applications.map((p) => `${p.applicationId} · applying for ${p.applyingFor} · stage: ${p.stage}`)}
            />
          )}
          {investments.length > 0 && (
            <PortfolioLine
              icon={TrendingUp}
              kind="InvestmentAccount"
              title="Investment Accounts"
              lines={investments.map((p) => `${p.investmentType} · ${p.accountNumber}`)}
            />
          )}

          {/* Activity Log — chronological cross-campaign events */}
          <div className="pt-2">
            <SectionHeader label="Activity Log" />
            <div className="mt-2 rounded-xl border border-border bg-card">
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
              {lead.interactions.length === 0 && (
                <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">No activity captured yet.</div>
              )}
            </div>
          </div>

          {/* Campaign History — every run this lead has been in. Shows the
              Human Escalation flag per row so ops can see WHICH run flagged them. */}
          <div className="pt-2">
            <SectionHeader label={`Campaign History (${lead.campaigns.length})`} />
            <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card">
              {lead.campaigns.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">Not enrolled in any campaign.</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead className="bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Campaign</th>
                      <th className="px-3 py-2 text-left font-medium">Run</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Entered</th>
                      <th className="px-3 py-2 text-left font-medium">Exited</th>
                      <th className="px-3 py-2 text-left font-medium">Human Escalation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lead.campaigns.map((c, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2">
                          <Link to="/campaigns/$id" params={{ id: c.campaignId }} className="inline-flex items-center gap-1.5 hover:underline">
                            <Megaphone className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate max-w-[240px]">{c.campaignName}</span>
                          </Link>
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{c.runId}</td>
                        <td className="px-3 py-2">
                          <RunStatusChip status={c.status} />
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{c.enteredAt.slice(0, 10)}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{c.exitedAt ? c.exitedAt.slice(0, 10) : "—"}</td>
                        <td className="px-3 py-2">
                          {c.humanEscalated ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10.5px] font-medium text-warning">
                              <Flag className="h-2.5 w-2.5" /> Flagged
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Conversations · WhatsApp — a unified cross-campaign thread. Each
              message carries a small campaign chip so it's clear which campaign
              a given touch belonged to. Chronological, oldest-first. */}
          <div className="pt-2">
            <SectionHeader label={`Conversations · WhatsApp (${lead.whatsappThread.length})`} />
            <div className="mt-2 rounded-xl border border-border bg-card p-4">
              {lead.whatsappThread.length === 0 ? (
                <div className="px-2 py-6 text-center text-[12px] text-muted-foreground">No WhatsApp messages captured.</div>
              ) : (
                <WhatsAppThread messages={lead.whatsappThread} />
              )}
            </div>
          </div>
        </div>

        {/* Right column — 1/3 width: Personal Preferences */}
        <div className="space-y-4">
          <SectionHeader label="Personal Preferences" />

          {/* Connectivity: DoW, ToD, Language */}
          <div className="rounded-xl border border-border bg-card px-4 py-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Connectivity</p>
            <div className="mt-2.5 space-y-2 text-[12.5px]">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Day of week:</span>
                <span>{lead.preferences.preferredDow.join(" · ")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Time of day:</span>
                <span>{lead.preferences.preferredTod}</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Language:</span>
                <span className="font-mono text-[11.5px]">{lead.preferences.language}</span>
              </div>
            </div>
          </div>

          {/* Conversion Propensity: contact frequency × channel */}
          <div className="rounded-xl border border-border bg-card px-4 py-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Conversion propensity</p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground/80">Contact frequency × channel (last 30d)</p>
            <div className="mt-3 space-y-2">
              <FreqRow icon={MessageCircle} label="WhatsApp" value={lead.contactFrequency.whatsapp30d} />
              <FreqRow icon={Phone}         label="Voice"    value={lead.contactFrequency.voice30d} />
              <FreqRow icon={MessageSquare} label="SMS"      value={lead.contactFrequency.sms30d} />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SectionHeader({ label }: { label: string }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</h2>;
}

function Fact({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-[13.5px] tabular-nums", muted ? "text-muted-foreground" : "font-medium")}>{value}</p>
    </div>
  );
}

/** Personal Loan card — the ONLY product type that gets a full detail card in v1.
 *  Includes the PTP rate widget for the whole customer at the top (since we aggregate
 *  PTP history across all loans). */
function PersonalLoanCard({ p, leadPtpRatePct, keptMade }: { p: Extract<LeadProduct, { kind: "PersonalLoan" }>; leadPtpRatePct: number; keptMade: string }) {
  const rateTone = leadPtpRatePct >= 70 ? "success" : leadPtpRatePct >= 40 ? "warning" : "destructive";
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-md border", PRODUCT_TINT.PersonalLoan)}>
            <Landmark className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-[13px] font-semibold">{PRODUCT_LABEL.PersonalLoan}</h3>
          <span className="font-mono text-[11px] text-muted-foreground">{p.loanId}</span>
        </div>
        <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium", BUCKET_TINT[p.dpdBucket])}>
          {p.dpdBucket}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-4 px-4 py-4">
        <Fact label="EMI amount"    value={`₹${p.emiAmount.toLocaleString("en-IN")}`} />
        <Fact label="EMI frequency" value="Monthly" muted />
        <Fact label="Due date"      value={p.dueDate} />
        <Fact label="DPD"           value={p.dpdDays > 0 ? `+${p.dpdDays}d` : `${p.dpdDays}d`} />
        <Fact label="Loan tenure"   value={`${p.tenureMonths} months`} muted />
        <Fact label="Disbursed on"  value={p.disbursedOn} muted />
        <Fact label="Outstanding"   value={`₹${p.outstanding.toLocaleString("en-IN")}`} muted />
        <div>
          <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">PTP rate</p>
          <p className={cn("mt-0.5 text-[13.5px] font-medium tabular-nums", `text-${rateTone}`)}>
            {leadPtpRatePct}% <span className="text-[10.5px] text-muted-foreground">· {keptMade} kept</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/** Slim single-line portfolio entry for non-loan products (per your v1 scope:
 *  Policies + Cards + Applications + Investments are just held; only Loans get
 *  full detail). Renders one row per product with icon, badge, and key ID line. */
function PortfolioLine({ icon: Icon, kind, title, lines }: { icon: React.ComponentType<{ className?: string }>; kind: LeadProduct["kind"]; title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-md border", PRODUCT_TINT[kind])}>
          <Icon className="h-3 w-3" />
        </span>
        <h3 className="text-[12.5px] font-medium">{title}</h3>
        <span className="text-[10.5px] text-muted-foreground">· {lines.length}</span>
      </div>
      <div className="divide-y divide-border/40">
        {lines.map((l, i) => (
          <div key={i} className="px-4 py-2 text-[12px] text-muted-foreground">
            <span className="tabular-nums">{l}</span>
          </div>
        ))}
      </div>
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

/* ----- Campaign run status chip ----- */
function RunStatusChip({ status }: { status: "running" | "completed" | "paused" | "failed" | "terminated" }) {
  const tone =
    status === "running"    ? "border-success/30 bg-success/10 text-success"
    : status === "paused"   ? "border-warning/30 bg-warning/10 text-warning"
    : status === "failed" || status === "terminated" ? "border-destructive/30 bg-destructive/10 text-destructive"
    : "border-border bg-secondary text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium capitalize", tone)}>
      {status}
    </span>
  );
}

/* ----- WhatsApp full-fidelity thread ----- *
 * Chat bubbles with alternating alignment: outbound (right) / inbound (left).
 * Each bubble carries a small campaign chip so ops can see which campaign
 * touched the lead when. Payment/renewal links render as a pill inside the
 * outbound bubble. Timestamps are shown under each bubble in the lead's
 * timezone (no timezone conversion needed — the mock uses ISO). */
function WhatsAppThread({ messages }: { messages: import("@/lib/leads-data").LeadWhatsappMessage[] }) {
  return (
    <div className="space-y-4">
      {messages.map((m, i) => {
        const isOut = m.direction === "outbound";
        return (
          <div key={i} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[75%] space-y-1",
              isOut ? "items-end" : "items-start",
            )}>
              {m.campaignName && (
                <div className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
                    <Megaphone className="h-2.5 w-2.5" />
                    {m.campaignName}
                  </span>
                </div>
              )}
              <div className={cn(
                "rounded-lg px-3 py-2 text-[12.5px] leading-snug shadow-sm",
                isOut
                  ? "bg-success/12 text-foreground rounded-br-none border border-success/20"
                  : "bg-secondary text-foreground rounded-bl-none border border-border",
              )}>
                <p>{m.body}</p>
                {m.linkLabel && (
                  <div className="mt-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md border border-ai/30 bg-ai/10 px-1.5 py-0.5 text-[10.5px] font-medium text-ai">
                      <LinkIcon className="h-2.5 w-2.5" />
                      {m.linkLabel}
                    </span>
                  </div>
                )}
              </div>
              <p className={cn("text-[10px] text-muted-foreground", isOut ? "text-right" : "text-left")}>
                {new Date(m.timestamp).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
