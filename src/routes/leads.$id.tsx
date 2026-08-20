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
import { LeadAdSource } from "@/components/ads/LeadAdSource";
import { cn } from "@/lib/utils";
import {
  LEAD_RECORDS, formatIso, formatDate, formatDateTime,
  type LeadRecord, type CampaignRunStatus, type LeadMessage, type LeadChatMessage, type LeadVoiceCall, type LeadVoiceAttempt, type LeadChannel,
} from "@/lib/leads-data";
import {
  ArrowLeft, User, Phone, Mail, Calendar,
  MessageCircle, MessageSquare, MessageSquareText,
  Megaphone, Flag, ChevronDown, ChevronRight, PhoneMissed, PhoneCall, Play,
} from "lucide-react";

export const Route = createFileRoute("/leads/$id")({
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
          <Button size="sm" variant="outline" className="mt-4" onClick={() => navigate({ to: "/leads" })}>
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
        <Link to="/leads" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
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

      {/* Ad attribution. Renders only for leads that arrived through a CTWA ad. */}
      <LeadAdSource leadId={lead.id} />

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
  return (
    <div className={cn("flex", isOut ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-[13px] shadow-sm", tint)}>
        <p className="leading-snug text-foreground whitespace-pre-wrap">{msg.body}</p>
        {msg.linkLabel && (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-ai/30 bg-ai/10 px-1.5 py-0.5 text-[10.5px] text-ai">
            {msg.linkLabel}
          </span>
        )}
        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>{formatIso(msg.at)}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Voice: completed call as collapsible session, attempt as system row ---------- */

function VoiceCallCard({ call }: { call: LeadVoiceCall }) {
  const [open, setOpen] = useState(false);
  // Header row is a `div` with role=button rather than a `<button>` — the
  // header contains an inner Play <button>, which is invalid HTML if the
  // header itself is a button (nested buttons ⇒ hydration warning).
  const toggle = () => setOpen((o) => !o);
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
            Completed · {fmtDuration(call.duration)} · {call.transcript.length} turns
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); /* placeholder for future audio playback */ }}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10.5px] text-muted-foreground hover:text-foreground"
          title="Playback not wired in this demo"
        >
          <Play className="h-3 w-3" /> Play
        </button>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-3">
          {call.transcript.map((t, i) => {
            const isAgent = t.role === "agent";
            return (
              <div key={i} className={cn("flex", isAgent ? "justify-start" : "justify-end")}>
                <div className={cn(
                  "max-w-[75%] rounded-2xl px-3 py-1.5 text-[12.5px] shadow-sm",
                  isAgent ? "bg-secondary" : "bg-success/10",
                )}>
                  <p className="leading-snug text-foreground">{t.text}</p>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {isAgent ? call.agentName ?? "Agent" : "Customer"} · {t.at}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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
