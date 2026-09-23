/**
 * Lead detail (v2).
 *
 * Top: identity + meta card (name, phone unmasked, email, created, last
 * interaction). No PII toggle, no Segment pill, no Tags.
 *
 * Body: TWO tabs.
 *   1. Campaigns    — the lead's full campaign timeline (Campaign · Run ·
 *                     Status · Entered · Exited · Escalated cell).
 *   2. Conversations — 4 channel sub-tabs (WhatsApp · SMS · RCS · Voice).
 *                     Full-width chat-app layout. Each channel is chat-bubble
 *                     style; Voice renders each completed call as a
 *                     collapsible "session" card whose transcript expands
 *                     inline as chat bubbles. Missed calls render as thin
 *                     centred system rows.
 *                     Per-channel filters top-right: Campaign + Date range.
 */

import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LEAD_RECORDS, formatIso, formatDate, formatDateTime,
  type LeadRecord, type CampaignRunStatus, type LeadMessage, type LeadChatMessage, type LeadVoiceCall, type LeadVoiceAttempt, type LeadChannel,
  type MessageDeliveryStatus, type WaTemplatePreview,
} from "@/lib/leads-data";
import {
  ArrowLeft, User, Phone, Mail, Calendar,
  Check, CheckCheck, CircleAlert, CircleDashed, CircleDot,
  ExternalLink, FileText, Reply, Sparkles, Video,
  MessageCircle, MessageSquare, MessageSquareText,
  Megaphone, Flag, ChevronDown, ChevronRight, PhoneMissed, PhoneCall,
} from "lucide-react";

export const Route = createFileRoute("/inbox/$id")({
  component: LeadDetail,
  head: () => ({ meta: [{ title: "Lead · Pi Commerce Enterprise" }] }),
});

const STATUS_TINT: Record<CampaignRunStatus, string> = {
  running:    "border-ai/30 bg-ai/10 text-ai",
  completed:  "border-success/30 bg-success/10 text-success",
  paused:     "border-border bg-secondary text-muted-foreground",
  failed:     "border-destructive/30 bg-destructive/10 text-destructive",
  terminated: "border-warning/30 bg-warning/10 text-warning",
};

/* ---------- Channel definitions (label + icon + which entries fit here) ---------- */

const CHANNEL_META: Record<LeadChannel, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  wa:    { label: "WhatsApp", icon: MessageCircle },
  sms:   { label: "SMS",      icon: MessageSquare },
  rcs:   { label: "RCS",      icon: MessageSquareText },
  voice: { label: "Voice",    icon: PhoneCall },
};

const CHANNEL_ORDER: LeadChannel[] = ["wa", "sms", "rcs", "voice"];

/* ---------- Route component ---------- */

function LeadDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const lead = LEAD_RECORDS.find((l) => l.id === id);
  const [tab, setTab] = useState<"campaigns" | "conversations">("conversations");

  if (!lead) {
    return (
      <AppShell>
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">Lead not found.</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => navigate({ to: "/inbox" })}>
            Back to leads
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Back link */}
      <div className="mb-4">
        <Link to="/inbox" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All leads
        </Link>
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
                {lead.humanEscalated && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning" title="Human Escalation flagged in at least one run">
                    <Flag className="h-3 w-3" /> Escalated
                  </span>
                )}
              </div>
              <p className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">
                {lead.id} · {lead.customerId}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-[12px] md:grid-cols-4">
          <MetaCell icon={Phone} label="Phone" value={lead.phone} mono />
          <MetaCell icon={Mail}  label="Email" value={lead.email ?? "—"} />
          <MetaCell icon={Calendar} label="Created" value={formatDate(lead.createdAt)} title={formatDateTime(lead.createdAt)} />
          <MetaCell icon={Calendar} label="Last interaction" value={formatIso(lead.lastInteractionAt)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-border">
        <TabBtn active={tab === "campaigns"} onClick={() => setTab("campaigns")}>
          <Megaphone className="h-3.5 w-3.5" /> Campaigns
          <span className="rounded-full bg-secondary px-1.5 text-[10px] text-muted-foreground">{lead.campaigns.length}</span>
        </TabBtn>
        <TabBtn active={tab === "conversations"} onClick={() => setTab("conversations")}>
          <MessageCircle className="h-3.5 w-3.5" /> Conversation history
          <span className="rounded-full bg-secondary px-1.5 text-[10px] text-muted-foreground">{lead.messages.length}</span>
        </TabBtn>
      </div>

      {tab === "campaigns" ? (
        <CampaignsTab lead={lead} />
      ) : (
        <ConversationsTab lead={lead} />
      )}
    </AppShell>
  );
}

/* ---------- Meta helpers ---------- */

function MetaCell({ icon: Icon, label, value, mono, title }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
  title?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("truncate text-[12.5px]", mono && "font-mono")} title={title}>{value}</p>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] font-medium transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/* ---------- Campaigns tab ---------- */

function CampaignsTab({ lead }: { lead: LeadRecord }) {
  if (lead.campaigns.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-[12.5px] text-muted-foreground">
        This lead hasn't been part of any campaigns yet.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-[12.5px]">
        <thead className="bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Campaign</th>
            <th className="px-4 py-2.5 text-left font-medium">Run</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-left font-medium">Entered</th>
            <th className="px-4 py-2.5 text-left font-medium">Exited</th>
            <th className="px-4 py-2.5 text-left font-medium">Human Escalation</th>
          </tr>
        </thead>
        <tbody>
          {lead.campaigns.map((c) => (
            <tr key={c.runId} className="border-t border-border/60">
              <td className="px-4 py-3 font-medium">{c.campaignName}</td>
              <td className="px-4 py-3 font-mono text-[11.5px] text-muted-foreground">{c.runName}</td>
              <td className="px-4 py-3">
                <span className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium capitalize",
                  STATUS_TINT[c.status],
                )}>{c.status}</span>
              </td>
              <td className="px-4 py-3 text-[11.5px] text-muted-foreground">{formatIso(c.enteredAt)}</td>
              <td className="px-4 py-3 text-[11.5px] text-muted-foreground">
                {c.exitedAt ? formatIso(c.exitedAt) : "—"}
              </td>
              <td className="px-4 py-3">
                {c.humanEscalated ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                    <Flag className="h-3 w-3" /> Escalated
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Conversations tab (channel sub-tabs) ---------- */

type DateWindow = "all" | "7d" | "30d" | "90d";
const DATE_WINDOWS: { value: DateWindow; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7d",  label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];
function withinWin(iso: string, win: DateWindow): boolean {
  if (win === "all") return true;
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return win === "7d" ? days <= 7 : win === "30d" ? days <= 30 : days <= 90;
}

function ConversationsTab({ lead }: { lead: LeadRecord }) {
  // Bucket messages by channel — decides which tabs have any content
  // and drives the default-tab selection (first non-empty, fixed order).
  const byChannel = useMemo(() => {
    const b: Record<LeadChannel, LeadMessage[]> = { wa: [], sms: [], rcs: [], voice: [] };
    for (const m of lead.messages) b[m.channel].push(m);
    return b;
  }, [lead.messages]);

  const defaultChannel: LeadChannel =
    CHANNEL_ORDER.find((c) => byChannel[c].length > 0) ?? "wa";
  const [channel, setChannel] = useState<LeadChannel>(defaultChannel);

  // Per-channel filters — each channel has its own state so switching tabs
  // doesn't reset the other tab's filter.
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [dateWin, setDateWin] = useState<DateWindow>("all");

  const active = byChannel[channel];
  const filtered = useMemo(() => {
    return active.filter((m) => {
      if (campaignFilter !== "all" && m.campaignId !== campaignFilter) return false;
      if (!withinWin(m.at, dateWin)) return false;
      return true;
    });
  }, [active, campaignFilter, dateWin]);

  // Campaign dropdown lists only campaigns that ever touched this channel.
  const channelCampaigns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of active) if (!seen.has(m.campaignId)) seen.set(m.campaignId, m.campaignName);
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [active]);

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Channel tabs */}
      <div className="flex items-stretch border-b border-border">
        {CHANNEL_ORDER.map((c) => {
          const meta = CHANNEL_META[c];
          const count = byChannel[c].length;
          const isActive = channel === c;
          const empty = count === 0;
          return (
            <button
              key={c}
              onClick={() => { setChannel(c); setCampaignFilter("all"); setDateWin("all"); }}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 border-r border-border px-3 py-2.5 text-[12px] transition-colors last:border-r-0",
                isActive ? "bg-background font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/40",
                empty && "opacity-60",
              )}
            >
              <meta.icon className="h-3.5 w-3.5" />
              {meta.label}
              <span className={cn(
                "rounded-full px-1.5 text-[10px] font-semibold",
                isActive ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
              )}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Per-channel toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/20 px-3 py-2">
        <ChannelDropdown
          label="Campaign"
          value={campaignFilter}
          options={[{ id: "all", name: "All campaigns" }, ...channelCampaigns]}
          onChange={setCampaignFilter}
        />
        <ChannelDropdown
          label="Date"
          value={dateWin}
          options={DATE_WINDOWS.map((w) => ({ id: w.value, name: w.label }))}
          onChange={(v) => setDateWin(v as DateWindow)}
        />
        <span className="ml-auto text-[11px] text-muted-foreground">
          {filtered.length} of {active.length}
        </span>
      </div>

      {/* Body */}
      {active.length === 0 ? (
        <div className="px-4 py-16 text-center text-[12px] text-muted-foreground">
          No {CHANNEL_META[channel].label} messages yet.
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-16 text-center text-[12px] text-muted-foreground">
          No messages match these filters.
        </div>
      ) : (
        <ChannelBody channel={channel} messages={filtered} leadFirstName={lead.name.split(" ")[0]} />
      )}
    </div>
  );
}

function ChannelDropdown({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] hover:bg-accent/60"
      >
        <span className="text-muted-foreground">{label}:</span>
        <span className="max-w-[180px] truncate font-medium">{current?.name ?? "—"}</span>
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
            {options.map((o) => (
              <button
                key={o.id}
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-accent",
                  value === o.id && "bg-accent",
                )}
              >
                {o.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Channel body: dispatches on channel kind ---------- */

function ChannelBody({
  channel, messages, leadFirstName,
}: {
  channel: LeadChannel;
  messages: LeadMessage[];
  leadFirstName: string;
}) {
  // Group by (campaignId, runId) so we can render "— Run N · date —" dividers
  // between runs, per the locked spec (interleaved chronological but with a
  // visible run boundary between them).
  const runs = useMemo(() => groupByRun(messages), [messages]);
  return (
    <div className="max-h-[640px] space-y-4 overflow-y-auto px-4 py-4 lg:px-8">
      {runs.map((r) => (
        <div key={r.key} className="space-y-2">
          <RunDivider label={r.label} />
          <div className="space-y-2">
            {r.items.map((m) => {
              if (m.channel === "voice") {
                if (m.kind === "attempt") return <VoiceAttemptRow key={m.id} attempt={m} />;
                return <VoiceCallCard key={m.id} call={m} />;
              }
              return <ChatBubble key={m.id} msg={m} leadFirstName={leadFirstName} channel={channel} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupByRun(messages: LeadMessage[]): { key: string; label: string; items: LeadMessage[] }[] {
  const buckets = new Map<string, { label: string; items: LeadMessage[]; firstAt: number }>();
  for (const m of messages) {
    const key = `${m.campaignId}::${m.runId}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.items.push(m);
      existing.firstAt = Math.min(existing.firstAt, Date.parse(m.at));
    } else {
      const runName = anyRunName(m);
      buckets.set(key, {
        label: `${m.campaignName} · ${runName}`,
        items: [m],
        firstAt: Date.parse(m.at),
      });
    }
  }
  return Array.from(buckets.entries())
    .map(([key, v]) => ({ key, label: v.label, items: v.items, firstAt: v.firstAt }))
    .sort((a, b) => a.firstAt - b.firstAt)
    .map(({ key, label, items }) => ({ key, label, items }));
}

function anyRunName(m: LeadMessage): string {
  // The unified message shape carries campaignName but not runName — we
  // recover a short label from the runId for the divider.
  const runId = m.runId;
  return runId.startsWith("r_") ? `Run ${runId.slice(2)}` : runId;
}

function RunDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/* ---------- Chat bubble (WA / SMS / RCS) ---------- */

function ChatBubble({
  msg, leadFirstName, channel,
}: {
  msg: LeadChatMessage;
  leadFirstName: string;
  channel: LeadChannel;
}) {
  void leadFirstName;
  const isOut = msg.direction === "out";
  const tint =
    channel === "wa"  ? (isOut ? "bg-success/10" : "bg-secondary") :
    channel === "sms" ? (isOut ? "bg-warning/10"  : "bg-secondary") :
                        (isOut ? "bg-ai/10"       : "bg-secondary"); // rcs
  // Full WhatsApp template preview when the outbound carries one.
  if (isOut && msg.template) {
    return (
      <div className="flex justify-end">
        <div className={cn("max-w-[75%] overflow-hidden rounded-2xl text-[13px] shadow-sm", tint)}>
          <TemplatePreview t={msg.template} />
          <div className="flex items-center justify-end gap-1 px-3 py-1.5 text-[10px] text-muted-foreground">
            <span>{formatIso(msg.at)}</span>
            <DeliveryStatus status={msg.deliveryStatus} reason={msg.failureReason} />
          </div>
        </div>
      </div>
    );
  }
  // Inbound button-tap reply — small chip above the label so it reads as a tap.
  if (!isOut && msg.buttonReply) {
    return (
      <div className="flex justify-start">
        <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-[13px] shadow-sm", tint)}>
          <div className="mb-1 inline-flex items-center gap-1 rounded-full border border-border bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Reply className="h-2.5 w-2.5" /> Tapped button
          </div>
          <p className="whitespace-pre-wrap leading-snug text-foreground">
            {msg.buttonReply.buttonLabel}
          </p>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>{formatIso(msg.at)}</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex", isOut ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-[13px] shadow-sm", tint)}>
        <p className="leading-snug text-foreground whitespace-pre-wrap">{msg.body}</p>
        {msg.linkLabel && (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-ai/30 bg-ai/10 px-1.5 py-0.5 text-[10.5px] text-ai">
            {msg.linkLabel}
          </span>
        )}
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          <span>{formatIso(msg.at)}</span>
          {isOut && <DeliveryStatus status={msg.deliveryStatus} reason={msg.failureReason} />}
        </div>
      </div>
    </div>
  );
}

/* ---------- Delivery status footer ---------- */

const DLR_SPEC: Record<MessageDeliveryStatus, { label: string; icon: typeof Check; tone: string }> = {
  pending:   { label: "Pending",   icon: CircleDashed, tone: "text-muted-foreground" },
  sent:      { label: "Sent",      icon: Check,        tone: "text-muted-foreground" },
  delivered: { label: "Delivered", icon: CheckCheck,   tone: "text-muted-foreground" },
  read:      { label: "Read",      icon: CheckCheck,   tone: "text-ai" },
  failed:    { label: "Failed",    icon: CircleAlert,  tone: "text-destructive" },
  no_dlr:    { label: "No DLR",    icon: CircleDot,    tone: "text-muted-foreground/70" },
};

function DeliveryStatus({
  status, reason,
}: {
  status?: MessageDeliveryStatus;
  reason?: string;
}) {
  if (!status) return null;
  const spec = DLR_SPEC[status];
  const Icon = spec.icon;
  return (
    <span
      title={status === "failed" && reason ? `Failed · ${reason}` : spec.label}
      className={cn("inline-flex items-center gap-0.5", spec.tone)}
    >
      <Icon className="h-3 w-3" />
      <span className="text-[10px] font-medium">{spec.label}</span>
    </span>
  );
}

/* ---------- WhatsApp template preview ---------- */

function TemplatePreview({ t }: { t: WaTemplatePreview }) {
  return (
    <div>
      {t.header && <TemplateHeader header={t.header} />}
      <div className="px-3 pt-2">
        <p className="whitespace-pre-wrap text-[13px] leading-snug text-foreground">{t.body}</p>
        {t.footer && (
          <p className="mt-1 text-[10.5px] text-muted-foreground">{t.footer}</p>
        )}
      </div>
      {t.buttons?.length ? (
        <div className="mt-1.5 flex flex-col divide-y divide-border/70 border-t border-border/70">
          {t.buttons.map((b, i) => (
            <TemplateButton key={i} btn={b} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TemplateHeader({ header }: { header: NonNullable<WaTemplatePreview["header"]> }) {
  if (header.kind === "text") {
    return (
      <div className="border-b border-border/70 px-3 py-2 text-[13px] font-semibold text-foreground">
        {header.text}
      </div>
    );
  }
  if (header.kind === "image") {
    return (
      <div className="aspect-[16/9] w-full overflow-hidden bg-secondary">
        <img src={header.url} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  if (header.kind === "video") {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center bg-secondary text-muted-foreground">
        <Video className="h-6 w-6" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2 text-[12.5px] text-foreground">
      <FileText className="h-4 w-4 text-muted-foreground" />
      <span className="truncate">{header.fileName ?? "Document"}</span>
    </div>
  );
}

function TemplateButton({ btn }: { btn: NonNullable<WaTemplatePreview["buttons"]>[number] }) {
  const Icon = btn.kind === "quick_reply" ? Reply : btn.kind === "url" ? ExternalLink : Phone;
  return (
    <div className="flex items-center justify-center gap-1.5 px-3 py-2 text-[12.5px] font-medium text-ai">
      <Icon className="h-3.5 w-3.5" />
      <span className="truncate">{btn.label}</span>
    </div>
  );
}

/* ---------- Voice: completed call as collapsible session, attempt as system row ---------- */

const OUTCOME_LABEL: Record<LeadVoiceCall["outcome"], string> = {
  completed: "Completed",
  no_answer: "No answer",
  busy: "Busy",
  failed: "Failed",
};

function VoiceCallCard({ call }: { call: LeadVoiceCall }) {
  const [open, setOpen] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const toggle = () => setOpen((o) => !o);
  const insights = useMemo(() => buildVoiceInsights(call), [call]);
  const summary = useMemo(() => buildVoiceSummary(call), [call]);
  return (
    <div className="rounded-xl border border-border bg-secondary/30">
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-accent/40"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/15 text-success">
          <PhoneCall className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold">
            {call.agentName ?? "Voice agent"} · {formatIso(call.at)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {OUTCOME_LABEL[call.outcome]} · {fmtDuration(call.duration)} · {call.transcript.length} turns
          </p>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>
      {open && (
        <div className="space-y-4 border-t border-border px-3 py-3">
          <div className="grid grid-cols-2 gap-2 text-[11.5px]">
            <IdCell label="Agent" value={call.agentName ?? "Unassigned"} />
            <IdCell label="Outcome" value={OUTCOME_LABEL[call.outcome]} />
            <IdCell label="Duration" value={fmtDuration(call.duration)} />
            <IdCell label="Turns" value={String(call.transcript.length)} />
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-foreground">
              <Sparkles className="h-3 w-3" /> AI Summary
            </div>
            <p className="text-[12.5px] leading-relaxed text-foreground">{summary}</p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                Post-call analysis
              </h4>
              <span className="text-[10.5px] text-muted-foreground">{call.agentName ?? "Voice agent"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {insights.map((it) => (
                <div key={it.label} className="rounded-lg border border-border bg-card px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</p>
                  <p className="mt-0.5 text-[12.5px] font-medium">{it.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <button
              onClick={() => setShowTranscript((v) => !v)}
              className="mb-2 flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left hover:bg-secondary/40"
            >
              <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                Transcript
              </span>
              <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                {showTranscript ? "Click to collapse" : "Expand to load"}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showTranscript && "rotate-180")} />
              </span>
            </button>
            {showTranscript && (
              <div className="space-y-2">
                {call.transcript.map((t, i) => {
                  const isAgent = t.role === "agent";
                  return (
                    <div key={i} className={cn("flex", isAgent ? "justify-start" : "justify-end")}>
                      <div className={cn(
                        "max-w-[75%] rounded-2xl px-3 py-1.5 text-[12.5px] shadow-sm",
                        isAgent ? "bg-secondary" : "bg-success/10",
                      )}>
                        <div className="mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <span>{isAgent ? "Agent" : "Customer"}</span>
                          <span className="font-mono">{t.at}</span>
                        </div>
                        <p className="leading-snug text-foreground">{t.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IdCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-1.5">
      <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[12.5px] font-medium">{value}</p>
    </div>
  );
}

function buildVoiceInsights(call: LeadVoiceCall): { label: string; value: string }[] {
  const rng = seedFromId(call.id);
  const p = (arr: string[]) => arr[Math.floor(rng() * arr.length)];
  const campaign = call.campaignName.toLowerCase();
  const dispositions = campaign.includes("handoff")
    ? ["Resolved", "Escalated", "Follow-up"]
    : campaign.includes("winback") || campaign.includes("cart") || campaign.includes("activation")
      ? ["Interested", "Follow-up", "Not interested"]
      : ["Informed", "Interested", "Not interested"];
  return [
    { label: "Disposition", value: p(dispositions) },
    { label: "Sentiment",   value: p(["Positive", "Neutral", "Negative"]) },
    { label: "Intent",      value: p(["High", "Medium", "Low"]) },
    { label: "Callback",    value: p(["No", "Yes · tomorrow 11 am", "Yes · 6:30 pm"]) },
  ];
}

function buildVoiceSummary(call: LeadVoiceCall): string {
  const rng = seedFromId(call.id + "-summary");
  const p = (arr: string[]) => arr[Math.floor(rng() * arr.length)];
  const campaign = call.campaignName.toLowerCase();
  if (campaign.includes("cart")) return p([
    "Customer confirmed intent to complete the pending cart but wanted a discount before checkout.",
    "Agent shared the 10% coupon and walked through checkout; customer will finish tonight.",
  ]);
  if (campaign.includes("loyalty") || campaign.includes("reward")) return p([
    "Loyalty tier and reward balance explained. Customer agreed to redeem before expiry.",
    "Customer accepted the tier upgrade offer and requested the terms on WhatsApp.",
  ]);
  if (campaign.includes("winback") || campaign.includes("activation")) return p([
    "Customer had drifted over pricing and a competing app. Positive response to the offer; likely to re-engage.",
    "Reactivation offer accepted with a callback requested for onboarding help.",
  ]);
  if (campaign.includes("handoff")) return p([
    "Support query resolved on call. Customer thanked the agent and disconnected.",
    "Issue partially resolved; ticket raised for finance team to complete refund.",
  ]);
  return p([
    "Customer engaged with the offer and requested more details on WhatsApp.",
    "Short informational call. Customer will decide and revert.",
  ]);
}

function seedFromId(s: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function VoiceAttemptRow({ attempt }: { attempt: LeadVoiceAttempt }) {
  const label =
    attempt.reason === "no_answer" ? "No answer"
    : attempt.reason === "busy"    ? "Line busy"
    :                                "Call failed";
  return (
    <div className="flex items-center justify-center gap-2 px-2 py-1 text-[11px] text-muted-foreground">
      <PhoneMissed className="h-3 w-3" />
      <span>Missed call · {label} · {formatIso(attempt.at)}</span>
    </div>
  );
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
