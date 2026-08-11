/**
 * Inbox / Lead-detail Conversations viewer.
 *
 * Four channel tabs (WhatsApp / SMS / RCS / Voice), each rendering the lead's
 * messages for that channel with:
 *
 *  - `[Campaign Name] · Run [id]` dividers between runs (the campaign name has
 *    its leading `Category · ` prefix stripped since the category was noise).
 *  - `Entered [Workflow]` / `Exited via [row]` inline dividers inside the
 *    WhatsApp thread when the lead was routed through a freeform workflow in
 *    that run. Synthesised deterministically for demo purposes until real
 *    freeform trace events land.
 *  - WhatsApp / SMS / RCS bubbles (out = right, in = left) with channel tint.
 *  - Voice: completed calls collapse to a transcript on click, missed dials
 *    render as a thin system row.
 *
 * Default tab = the channel with the most recent message on this lead.
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown, ChevronRight, MessageCircle, MessageSquare, MessageSquareText,
  Phone, PhoneCall, PhoneMissed, Play, Workflow,
} from "lucide-react";
import {
  formatIso,
  type LeadRecord, type LeadChatMessage, type LeadVoiceCall, type LeadVoiceAttempt,
  type LeadMessage, type LeadChannel,
} from "@/lib/leads-data";

/* ------------------------------ Public API ------------------------------ */

export function Conversations({ lead }: { lead: LeadRecord }) {
  // Bucket the lead's messages by channel.
  const buckets = useMemo(() => {
    const b: Record<LeadChannel, LeadMessage[]> = { wa: [], sms: [], rcs: [], voice: [] };
    for (const m of lead.messages) {
      if (m.channel === "wa") b.wa.push(m);
      else if (m.channel === "sms") b.sms.push(m);
      else if (m.channel === "rcs") b.rcs.push(m);
      else b.voice.push(m);
    }
    // Sort each bucket by timestamp ascending — oldest to newest, like WhatsApp.
    (Object.keys(b) as LeadChannel[]).forEach((k) => {
      b[k].sort((a, z) => a.at.localeCompare(z.at));
    });
    return b;
  }, [lead]);

  // Pick the default tab: channel with the most recent message. If a lead has
  // nothing on any channel, default to WhatsApp (most-common case).
  const defaultTab = useMemo<LeadChannel>(() => {
    let best: LeadChannel = "wa";
    let bestAt = "";
    (Object.keys(buckets) as LeadChannel[]).forEach((k) => {
      const arr = buckets[k];
      if (!arr.length) return;
      const latest = arr[arr.length - 1].at;
      if (latest > bestAt) { bestAt = latest; best = k; }
    });
    return best;
  }, [buckets]);

  const [tab, setTab] = useState<LeadChannel>(defaultTab);
  // If the lead changes, reset to the new lead's default tab.
  useMemoLastLead(lead.id, () => setTab(defaultTab));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChannelTabs value={tab} onChange={setTab} counts={{
        wa: buckets.wa.length,
        sms: buckets.sms.length,
        rcs: buckets.rcs.length,
        voice: buckets.voice.length,
      }} />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <ChannelBody channel={tab} messages={buckets[tab]} lead={lead} />
      </div>
    </div>
  );
}

/** Fires `effect` exactly once per lead id change. Avoids importing useEffect
 *  for a one-liner — the state hook here doubles as the trigger. */
function useMemoLastLead(id: string, effect: () => void) {
  const [seen, setSeen] = useState(id);
  if (seen !== id) { setSeen(id); effect(); }
}

/* --------------------------------- Tabs --------------------------------- */

const CHANNEL_ICON: Record<LeadChannel, typeof MessageCircle> = {
  wa: MessageCircle,
  sms: MessageSquare,
  rcs: MessageSquareText,
  voice: Phone,
};
const CHANNEL_LABEL: Record<LeadChannel, string> = {
  wa: "WhatsApp",
  sms: "SMS",
  rcs: "RCS",
  voice: "Voice",
};
const CHANNEL_TONE: Record<LeadChannel, string> = {
  wa: "text-success",
  sms: "text-warning",
  rcs: "text-ai",
  voice: "text-chart-1",
};

function ChannelTabs({
  value, onChange, counts,
}: {
  value: LeadChannel;
  onChange: (v: LeadChannel) => void;
  counts: Record<LeadChannel, number>;
}) {
  const order: LeadChannel[] = ["wa", "sms", "rcs", "voice"];
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border px-4">
      {order.map((k) => {
        const Icon = CHANNEL_ICON[k];
        const active = value === k;
        const empty = counts[k] === 0;
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            className={cn(
              "relative flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors",
              active
                ? "border-foreground text-foreground"
                : empty
                  ? "border-transparent text-muted-foreground/60"
                  : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", active && CHANNEL_TONE[k])} />
            {CHANNEL_LABEL[k]}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                active ? "bg-foreground/10 text-foreground" : "bg-secondary text-muted-foreground",
              )}
            >
              {counts[k]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------- Body -------------------------------- */

function ChannelBody({
  channel, messages, lead,
}: {
  channel: LeadChannel;
  messages: LeadMessage[];
  lead: LeadRecord;
}) {
  if (messages.length === 0) {
    return (
      <div className="grid h-full place-items-center text-[13px] text-muted-foreground">
        No {CHANNEL_LABEL[channel]} conversations for this lead.
      </div>
    );
  }
  const runs = useMemo(() => groupByRun(messages), [messages]);
  return (
    <div className="space-y-6">
      {runs.map((r) => (
        <div key={r.key} className="space-y-2">
          <RunDivider label={r.label} />
          <RunThread run={r} channel={channel} lead={lead} />
        </div>
      ))}
    </div>
  );
}

/** Renders a run's messages. For WhatsApp threads, weaves in freeform-workflow
 *  trace dividers when the lead was routed through a workflow in this run. */
function RunThread({
  run, channel, lead,
}: {
  run: RunGroup;
  channel: LeadChannel;
  lead: LeadRecord;
}) {
  const freeform = channel === "wa"
    ? synthesiseFreeformTrace(lead, run.items as LeadChatMessage[])
    : null;
  const items = run.items;
  return (
    <div className="space-y-2">
      {items.map((m, i) => (
        <div key={m.id} className="space-y-2">
          {freeform && i === freeform.beforeIdx && (
            <FreeformTraceDivider tone="enter" label={freeform.enterLabel} />
          )}
          <MessageRow msg={m} channel={channel} />
        </div>
      ))}
      {freeform && freeform.afterIdx >= items.length && (
        <FreeformTraceDivider tone="exit" label={freeform.exitLabel} />
      )}
    </div>
  );
}

/* ---------------------- Message rows by channel ---------------------- */

function MessageRow({ msg, channel }: { msg: LeadMessage; channel: LeadChannel }) {
  if (msg.channel === "voice") {
    if (msg.kind === "call") return <VoiceCallCard call={msg} />;
    return <VoiceAttemptRow attempt={msg} />;
  }
  return <ChatBubble msg={msg} channel={msg.channel as Extract<LeadChannel, "wa" | "sms" | "rcs">} />;
  // channel prop kept in signature for future channel-scoped stylings.
  void channel;
}

function ChatBubble({
  msg, channel,
}: {
  msg: LeadChatMessage;
  channel: Extract<LeadChannel, "wa" | "sms" | "rcs">;
}) {
  const isOut = msg.direction === "out";
  const tint =
    channel === "wa"  ? (isOut ? "bg-success/10" : "bg-secondary") :
    channel === "sms" ? (isOut ? "bg-warning/10" : "bg-secondary") :
                        (isOut ? "bg-ai/10"      : "bg-secondary");
  return (
    <div className={cn("flex", isOut ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-[13px] shadow-sm", tint)}>
        <p className="whitespace-pre-wrap leading-snug text-foreground">{msg.body}</p>
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

function VoiceCallCard({ call }: { call: LeadVoiceCall }) {
  const [open, setOpen] = useState(false);
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
          onClick={(e) => { e.stopPropagation(); }}
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

/* --------------------------- Run + trace dividers --------------------------- */

/** `[Category] · [Campaign Name]` becomes `[Campaign Name]`. Multi-segment
 *  names (e.g. "Retail · Activation · Loyalty") drop only the first segment. */
function stripCategory(campaignName: string): string {
  const parts = campaignName.split(" · ");
  if (parts.length <= 1) return campaignName;
  return parts.slice(1).join(" · ");
}

/** Extract the run number from a runId like `r_8041` → `Run 8041`. */
function runLabel(runId: string): string {
  return runId.startsWith("r_") ? `Run ${runId.slice(2)}` : runId;
}

type RunGroup = { key: string; label: string; items: LeadMessage[]; firstAt: number };

function groupByRun(messages: LeadMessage[]): RunGroup[] {
  const buckets = new Map<string, { label: string; items: LeadMessage[]; firstAt: number }>();
  for (const m of messages) {
    const key = `${m.campaignId}::${m.runId}`;
    const label = `${stripCategory(m.campaignName)} · ${runLabel(m.runId)}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.items.push(m);
      existing.firstAt = Math.min(existing.firstAt, Date.parse(m.at));
    } else {
      buckets.set(key, { label, items: [m], firstAt: Date.parse(m.at) });
    }
  }
  return Array.from(buckets.entries())
    .map(([key, v]) => ({ key, label: v.label, items: v.items, firstAt: v.firstAt }))
    .sort((a, b) => a.firstAt - b.firstAt);
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

/** Freeform workflow entry / exit divider. Uses a subtle amber tint so it
 *  reads as a state change without competing with the run dividers. */
function FreeformTraceDivider({
  tone, label,
}: {
  tone: "enter" | "exit";
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5 text-[10.5px] text-warning">
      <span className="h-px flex-1 bg-warning/30" />
      <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10.5px] font-medium">
        <Workflow className="h-2.5 w-2.5" />
        {tone === "enter" ? "Entered" : "Exited"}: {label}
      </span>
      <span className="h-px flex-1 bg-warning/30" />
    </div>
  );
}

/* ------------------------ Synthesised freeform trace ------------------------ */

/**
 * Deterministically synthesise a freeform trace on a WhatsApp thread. Real
 * freeform trace events don't live in the current lead fixture, so we generate
 * plausible dividers for a subset of leads (id parity) with 3+ WhatsApp
 * messages in the same run. Once real trace events land the caller can pass
 * them straight through and drop this function.
 */
function synthesiseFreeformTrace(
  lead: LeadRecord,
  runMessages: LeadChatMessage[],
): { beforeIdx: number; afterIdx: number; enterLabel: string; exitLabel: string } | null {
  if (runMessages.length < 2) return null;
  // ~50% of leads show a trace, deterministically by id hash.
  const seed = lead.id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  if (seed % 2 === 1) return null;
  // Enter divider sits BEFORE the last message; exit divider AFTER. When there
  // are only 2 messages that means enter goes between them and exit after the
  // last, tracing "lead entered the workflow after the first template message".
  const enterIdx = runMessages.length - 1;
  const afterIdx = runMessages.length; // synthetic "past end" — rendered after the last bubble
  const workflows = [
    "Pre-book & Test Drive Interest",
    "Callback Slot Picker",
    "KYC Document Upload",
  ];
  const exits = [
    "10 AM to 12 PM",
    "12 PM to 2 PM",
    "Timeout (60 min inactivity)",
    "Tomorrow morning",
  ];
  const wf = workflows[seed % workflows.length];
  const ex = exits[Math.floor(seed / 3) % exits.length];
  return {
    beforeIdx: enterIdx,
    afterIdx,
    enterLabel: wf,
    exitLabel: ex,
  };
}
