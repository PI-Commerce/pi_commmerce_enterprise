/**
 * Shared inbound presentation pieces — used by the Inbound routes and, once the
 * analytics re-cut lands, by the Analytics Inbound tab. Kept together because
 * they all read the same `Session` shape.
 */
import { cn } from "@/lib/utils";
import {
  STAGE_LABEL,
  STAGE_INFO,
  STATUS_LABEL,
  STATUS_INFO,
  STATUS_TONE,
  fmtPct,
  type SessionMetrics,
  type SessionStage,
  type SessionStatus,
  type InboundChannel,
} from "@/lib/inbound";
import { Info, Phone, MessageCircle, Webhook } from "lucide-react";


/**
 * The glyph for a channel, in one place.
 *
 * It was branched inline at three call sites as `voice ? Phone : MessageCircle`,
 * which quietly made every non-voice channel look like WhatsApp — so the moment a
 * webhook entry point existed it arrived wearing a chat bubble.
 */
export function ChannelIcon({ channel, className }: { channel: InboundChannel; className?: string }) {
  const Icon = channel === "voice" ? Phone : channel === "webhook" ? Webhook : MessageCircle;
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} />;
}

/** Status pill — now the only state axis the sessions table shows. */
export function StatusTag({ status, className }: { status: SessionStatus; className?: string }) {
  return (
    <span
      title={STATUS_INFO[status]}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STATUS_TONE[status],
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "open" ? "bg-current animate-pulse" : "bg-current opacity-60",
        )}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** The tags a session carries, truncated — a row is not where you read all of them. */
export function TagList({ tags, max = 2 }: { tags: readonly string[]; max?: number }) {
  if (tags.length === 0) return <span className="text-[11.5px] text-muted-foreground">—</span>;
  const shown = tags.slice(0, max);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((t) => (
        <span
          key={t}
          className="rounded border border-border bg-secondary px-1.5 py-px text-[10.5px] text-muted-foreground"
        >
          {t}
        </span>
      ))}
      {tags.length > max && (
        <span className="text-[10.5px] text-muted-foreground">+{tags.length - max}</span>
      )}
    </span>
  );
}


export function MetricCard({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const valueTone =
    tone === "good" ? "text-success"
    : tone === "warn" ? "text-warning"
    : tone === "bad" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        {hint && <Info className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-label={hint} />}
      </div>
      <p className={cn("mt-1.5 text-[22px] font-semibold leading-none tracking-tight", valueTone)}>
        {value}
        {unit && <span className="ml-1 text-[12px] font-normal text-muted-foreground">{unit}</span>}
      </p>
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * How ended sessions divided between the four terminal outcomes.
 *
 * Card-less on purpose: it is both a section of {@link SessionFunnel} and a
 * standalone card on the Inbound tab, which shows it without the funnel. One
 * body, two frames — the alternative is two copies that drift apart.
 *
 * The stacked bar carries the mix and the rows carry the numbers. Percentages
 * are printed rather than left to be eyeballed off the bar, because the two
 * small outcomes are visually indistinguishable at these widths.
 */
export function OutcomeBars({ m }: { m: SessionMetrics }) {
  /* Every ended outcome and nothing else, so the bars sum to `engagedEnded`
     exactly. Handed off is deliberately absent: a conversation in a person's hands
     has not ended, and it was counted here while the denominator excluded it —
     which is the quiet kind of wrong, because the shares still looked plausible
     and were all simply too big.

     Resolved splits by who finished it. A resolution a person completed is still a
     resolution and still not containment, and one bar covering both hides the gap
     between this panel and the containment figure above it. */
  const outcomes = [
    { label: "Resolved by agent", value: m.resolvedByAgent, cls: "bg-success" },
    { label: "Resolved by a person", value: m.resolvedByPerson, cls: "bg-success/50" },
    /* Dropped split by cause rather than one bar, because "the customer went
       quiet" and "we replaced the session ourselves" are not the same news. */
    { label: "Dropped · customer went quiet", value: m.dropped - m.superseded, cls: "bg-muted-foreground/50" },
    { label: "Dropped · superseded", value: m.superseded, cls: "bg-ai/40" },
  ];
  const total = Math.max(1, m.engagedEnded);

  return (
    <>
      <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
        {outcomes.map((o) => (
          <div
            key={o.label}
            className={cn("h-full", o.cls)}
            style={{ width: `${(o.value / total) * 100}%` }}
            title={`${o.label}: ${o.value}`}
          />
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {outcomes.map((o) => (
          <div key={o.label} className="flex items-center gap-2 text-[11.5px]">
            <span className={cn("h-2 w-2 shrink-0 rounded-sm", o.cls)} />
            <span className="text-muted-foreground">{o.label}</span>
            <span className="ml-auto font-mono tabular-nums">{o.value.toLocaleString()}</span>
            <span className="w-[48px] text-right font-mono tabular-nums text-muted-foreground">
              {fmtPct(o.value / total)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export function OutcomeSplit({ m }: { m: SessionMetrics }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold">Outcome split</h3>
        <p className="text-[11px] text-muted-foreground">
          {m.engagedEnded.toLocaleString()} engaged &amp; ended
        </p>
      </div>
      <p className="mb-4 text-[11px] leading-snug text-muted-foreground">
        Only sessions that reached an agent and ended. In-flight conversations and
        arrivals nothing handled have no outcome yet, so counting them here would
        understate every share.
      </p>
      <OutcomeBars m={m} />
    </div>
  );
}

/**
 * The session lifecycle funnel.
 *
 * Unlike the campaign Sankey — which is drawn over an *authored* graph and so
 * differs per campaign — these stages are fixed for every session. That is what
 * makes agents and arrival types directly comparable on one axis.
 */
export function SessionFunnel({ m }: { m: SessionMetrics }) {
  const steps = [
    { label: "Received", value: m.received, sub: "Events that arrived" },
    { label: "Routed", value: m.routed, sub: `${fmtPct(m.routingRate)} of received` },
    { label: "Engaged", value: m.engaged, sub: `${fmtPct(m.engagementRate)} of routed` },
    // Denominator is engaged-*and-ended*, not engaged. A session still in flight
    // has no outcome yet, so counting it against containment would understate it.
    { label: "Resolved", value: m.resolved, sub: `${fmtPct(m.containmentRate)} of engaged & ended` },
  ];
  const max = Math.max(1, m.received);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold">Session lifecycle</h3>
        <p className="text-[11px] text-muted-foreground">
          Fixed stages — identical for every session, on every channel
        </p>
      </div>

      <div className="space-y-2.5">
        {steps.map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-[74px] shrink-0 text-[12px] text-muted-foreground">{s.label}</span>
            <div className="h-7 flex-1 overflow-hidden rounded-md bg-secondary/40">
              <div
                className="flex h-full items-center rounded-md bg-foreground/85 px-2.5 transition-[width] duration-500"
                style={{ width: `${Math.max(4, (s.value / max) * 100)}%` }}
              >
                <span className="font-mono text-[11px] font-medium text-background">
                  {s.value.toLocaleString()}
                </span>
              </div>
            </div>
            <span className="w-[112px] shrink-0 text-right text-[11px] text-muted-foreground">
              {s.sub}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-2.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          Outcome split · {m.engagedEnded.toLocaleString()} engaged &amp; ended
        </p>
        <OutcomeBars m={m} />
      </div>

      {m.notRouted > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            <span className="font-medium text-destructive">
              {m.notRouted.toLocaleString()} not routed
            </span>{" "}
            — the graph has a path that reaches no agent. These contacts were never
            answered. This is a routing gap, not a customer outcome.
          </p>
        </div>
      )}
    </div>
  );
}
