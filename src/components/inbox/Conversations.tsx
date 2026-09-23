/**
 * Inbox / Lead-detail Conversations viewer.
 *
 * Four channel tabs (WhatsApp / SMS / RCS / Voice), each rendering the lead's
 * messages for that channel with:
 *
 *  - `[Campaign Name] · Run [id]` dividers between runs (the campaign name has
 *    its leading `Category · ` prefix stripped since the category was noise).
 *  - WhatsApp / SMS / RCS bubbles (out = right, in = left) with channel tint.
 *    Outbound bubbles carry a small DLR footer (Sent / Delivered / Read /
 *    Failed / No DLR). Outbound template messages render as a full template
 *    preview (header + body + footer + buttons). Inbound button taps render as
 *    a compact reply bubble.
 *  - Voice: completed calls collapse to an expanded detail (AI summary +
 *    insights + transcript) mirroring the CallDrawer layout used on Analytics.
 *
 * Default tab = the channel with the most recent message on this lead.
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Check, CheckCheck, ChevronDown, ChevronRight, CircleAlert, CircleDashed, CircleDot,
  ExternalLink, FileText, MessageCircle, MessageSquare, MessageSquareText,
  Phone, PhoneCall, PhoneMissed, Reply, Sparkles, Video,
} from "lucide-react";
import {
  formatIso,
  type LeadRecord, type LeadChatMessage, type LeadVoiceCall, type LeadVoiceAttempt,
  type LeadMessage, type LeadChannel, type MessageDeliveryStatus, type WaTemplatePreview,
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
        <ChannelBody channel={tab} messages={buckets[tab]} />
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
  channel, messages,
}: {
  channel: LeadChannel;
  messages: LeadMessage[];
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
          <div className="space-y-2">
            {r.items.map((m) => (
              <MessageRow key={m.id} msg={m} channel={channel} />
            ))}
          </div>
        </div>
      ))}
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
  // Full template preview replaces the plain body when set.
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
  // Inbound button-tap replies render with a small chip above the label so it
  // reads as a tap, not a typed reply.
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
        <p className="whitespace-pre-wrap leading-snug text-foreground">{msg.body}</p>
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

/* ---------------------------- Delivery status ---------------------------- */

/** Small footer badge under outbound bubbles: icon + status label. Colour and
 *  glyph mirror WhatsApp conventions where applicable. */
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

const DLR_SPEC: Record<MessageDeliveryStatus, { label: string; icon: typeof Check; tone: string }> = {
  pending:   { label: "Pending",   icon: CircleDashed, tone: "text-muted-foreground" },
  sent:      { label: "Sent",      icon: Check,        tone: "text-muted-foreground" },
  delivered: { label: "Delivered", icon: CheckCheck,   tone: "text-muted-foreground" },
  read:      { label: "Read",      icon: CheckCheck,   tone: "text-ai" },
  failed:    { label: "Failed",    icon: CircleAlert,  tone: "text-destructive" },
  no_dlr:    { label: "No DLR",    icon: CircleDot,    tone: "text-muted-foreground/70" },
};

/* --------------------------- Template preview --------------------------- */

/** Full WhatsApp template bubble: header (text or media) + body + footer +
 *  buttons. Renders inside an outbound chat bubble tint. */
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

function TemplateHeader({
  header,
}: {
  header: NonNullable<WaTemplatePreview["header"]>;
}) {
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

function TemplateButton({
  btn,
}: {
  btn: NonNullable<WaTemplatePreview["buttons"]>[number];
}) {
  const Icon = btn.kind === "quick_reply" ? Reply : btn.kind === "url" ? ExternalLink : Phone;
  return (
    <div className="flex items-center justify-center gap-1.5 px-3 py-2 text-[12.5px] font-medium text-ai">
      <Icon className="h-3.5 w-3.5" />
      <span className="truncate">{btn.label}</span>
    </div>
  );
}

/* ------------------------------ Voice rows ------------------------------ */

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
          {/* Identity + outcome strip */}
          <div className="grid grid-cols-2 gap-2 text-[11.5px]">
            <IdCell label="Agent" value={call.agentName ?? "Unassigned"} />
            <IdCell label="Outcome" value={OUTCOME_LABEL[call.outcome]} />
            <IdCell label="Duration" value={fmtDuration(call.duration)} />
            <IdCell label="Turns" value={String(call.transcript.length)} />
          </div>

          {/* AI Summary */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-foreground">
              <Sparkles className="h-3 w-3" /> AI Summary
            </div>
            <p className="text-[12.5px] leading-relaxed text-foreground">{summary}</p>
          </div>

          {/* Post-call analysis variables */}
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

          {/* Transcript — collapsed by default */}
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

const OUTCOME_LABEL: Record<LeadVoiceCall["outcome"], string> = {
  completed: "Completed",
  no_answer: "No answer",
  busy: "Busy",
  failed: "Failed",
};

/** Deterministic per-call insights. Real values come from the post-call
 *  analysis run — this stands in for demo purposes. */
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

/** Short AI summary keyed to campaign flavour. Deterministic per call. */
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

/* --------------------------- Run dividers --------------------------- */

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

