import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LEAD_RECORDS, maskPhone, formatIso,
  type LeadRecord, type CampaignRunStatus, type Segment, type LeadWhatsappMessage,
} from "@/lib/leads-data";
import {
  ArrowLeft, ShieldCheck, EyeOff, Eye, User, Phone, Mail, Calendar,
  MessageCircle, MessageSquare, Voicemail, Mail as MailIcon, Megaphone,
} from "lucide-react";

export const Route = createFileRoute("/leads/$id")({
  component: LeadDetail,
  head: () => ({ meta: [{ title: "Lead · Pi Commerce Enterprise" }] }),
});

const SEGMENT_TINT: Record<Segment, string> = {
  VIP:    "border-ai/30 bg-ai/10 text-ai",
  Retail: "border-border bg-secondary text-muted-foreground",
  SME:    "border-success/30 bg-success/10 text-success",
};

const STATUS_TINT: Record<CampaignRunStatus, string> = {
  running:    "border-ai/30 bg-ai/10 text-ai",
  completed:  "border-success/30 bg-success/10 text-success",
  paused:     "border-border bg-secondary text-muted-foreground",
  failed:     "border-destructive/30 bg-destructive/10 text-destructive",
  terminated: "border-warning/30 bg-warning/10 text-warning",
};

function LeadDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const lead = LEAD_RECORDS.find((l) => l.id === id);
  const [piiRedacted, setPiiRedacted] = useState(true);

  if (!lead) {
    return (
      <AppShell>
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">Lead not found.</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => navigate({ to: "/leads" })}>
            Back to leads
          </Button>
        </div>
      </AppShell>
    );
  }

  const showPhone = piiRedacted ? maskPhone(lead.phone) : lead.phone;
  const showEmail = piiRedacted && lead.email
    ? lead.email.replace(/^(.).+(@.+)$/, (_m, a, b) => `${a}***${b}`)
    : lead.email;

  return (
    <AppShell>
      {/* Header — back + PII toggle */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link to="/leads" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All leads
        </Link>
        <button
          onClick={() => setPiiRedacted((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
            piiRedacted
              ? "border-ai/30 bg-ai/10 text-ai hover:bg-ai/15"
              : "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15",
          )}
        >
          {piiRedacted ? <ShieldCheck className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {piiRedacted ? "PII redacted" : "PII revealed"}
          {piiRedacted ? <Eye className="h-3.5 w-3.5 opacity-50" /> : null}
        </button>
      </div>

      {/* Identity card */}
      <div className="mb-5 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-foreground">
              <User className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{lead.name}</h1>
                <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium", SEGMENT_TINT[lead.segment])}>
                  {lead.segment}
                </span>
              </div>
              <p className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">
                {lead.id} · {lead.customerId}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-[12px] md:grid-cols-4">
          <MetaCell icon={Phone} label="Phone" value={showPhone} mono />
          <MetaCell icon={Mail}  label="Email" value={showEmail ?? "—"} />
          <MetaCell icon={Calendar} label="Created" value={formatIso(lead.createdAt, { hour: undefined, minute: undefined })} />
          <MetaCell icon={Calendar} label="Last interaction" value={formatIso(lead.lastInteractionAt)} />
        </div>

        {lead.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {lead.tags.map((t) => (
              <span key={t} className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Grid — campaigns | conversations */}
      <div className="grid gap-5 md:grid-cols-2">
        <CampaignHistory lead={lead} />
        <ConversationsCard lead={lead} piiRedacted={piiRedacted} />
      </div>
    </AppShell>
  );
}

function MetaCell({ icon: Icon, label, value, mono }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("truncate text-[12.5px]", mono && "font-mono")}>{value}</p>
      </div>
    </div>
  );
}

function CampaignHistory({ lead }: { lead: LeadRecord }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[12.5px] font-semibold">Campaign history</h2>
        <span className="text-[11px] text-muted-foreground">· {lead.campaigns.length} run{lead.campaigns.length === 1 ? "" : "s"}</span>
      </div>
      {lead.campaigns.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">This lead hasn't been part of any campaigns yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {lead.campaigns.map((c) => (
            <div key={c.runId} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium">{c.campaignName}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{c.runName}</p>
                </div>
                <span className={cn("shrink-0 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium", STATUS_TINT[c.status])}>
                  {c.status}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-[10.5px] text-muted-foreground">
                <span>Entered {formatIso(c.enteredAt)}</span>
                {c.exitedAt && <span>· Exited {formatIso(c.exitedAt)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationsCard({ lead, piiRedacted }: { lead: LeadRecord; piiRedacted: boolean }) {
  const [tab, setTab] = useState<"whatsapp" | "timeline">("whatsapp");
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[12.5px] font-semibold">Conversations</h2>
        <div className="ml-auto flex gap-1 rounded-md border border-border bg-secondary/50 p-0.5">
          <TabBtn active={tab === "whatsapp"} onClick={() => setTab("whatsapp")}>WhatsApp</TabBtn>
          <TabBtn active={tab === "timeline"} onClick={() => setTab("timeline")}>All channels</TabBtn>
        </div>
      </div>
      {tab === "whatsapp" ? (
        <WhatsAppThread thread={lead.whatsappThread} firstName={lead.name.split(" ")[0]} piiRedacted={piiRedacted} />
      ) : (
        <InteractionsList lead={lead} />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function WhatsAppThread({ thread, firstName, piiRedacted }: { thread: LeadWhatsappMessage[]; firstName: string; piiRedacted: boolean }) {
  if (thread.length === 0) {
    return <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No WhatsApp messages yet.</p>;
  }
  return (
    <div className="max-h-[520px] space-y-2 overflow-y-auto p-4">
      {thread.map((m, i) => {
        const isOut = m.direction === "outbound";
        // Redaction is applied lightly — this is copy, not identifiers, but if the
        // body contains phone-like digits we still mask them when PII is on.
        const body = piiRedacted ? m.body.replace(/(\d{6,})/g, (v) => `${"*".repeat(v.length - 4)}${v.slice(-4)}`) : m.body;
        return (
          <div key={i} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[80%] rounded-2xl px-3 py-2 text-[12.5px] shadow-sm",
              isOut ? "bg-success/10 text-foreground" : "bg-secondary text-foreground",
            )}>
              <p className="leading-snug">{body.replace("{firstName}", firstName)}</p>
              {m.linkLabel && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-ai/30 bg-ai/10 px-1.5 py-0.5 text-[10.5px] text-ai">
                  {m.linkLabel}
                </span>
              )}
              <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                <span>{formatIso(m.timestamp)}</span>
                {m.campaignName && (
                  <>
                    <span>·</span>
                    <span className="truncate" title={m.campaignName}>{m.campaignName}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CHANNEL_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  WhatsApp: MessageCircle,
  Voice: Voicemail,
  SMS: MessageSquare,
  Email: MailIcon,
};

function InteractionsList({ lead }: { lead: LeadRecord }) {
  if (lead.interactions.length === 0) {
    return <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No interactions on record.</p>;
  }
  return (
    <div className="max-h-[520px] divide-y divide-border overflow-y-auto">
      {lead.interactions.map((it, i) => {
        const Icon = CHANNEL_ICON[it.channel] ?? MessageCircle;
        return (
          <div key={i} className="flex items-start gap-3 px-4 py-3">
            <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-accent text-muted-foreground">
              <Icon className="h-3 w-3" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11.5px]">
                <span className="font-medium">{it.channel}</span>
                <span className="text-muted-foreground">· {it.direction}</span>
                {it.outcome && <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{it.outcome}</span>}
              </div>
              <p className="mt-0.5 truncate text-[12px]">{it.summary}</p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">{formatIso(it.timestamp)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
