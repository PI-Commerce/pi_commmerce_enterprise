/**
 * Shared inbound presentation pieces — used by the Inbound routes and, once the
 * analytics re-cut lands, by the Analytics Inbound tab. Kept together because
 * they all read the same `Session` shape.
 */
import { cn } from "@/lib/utils";
import {
  STAGE_LABEL,
  STAGE_INFO,
  fmtPct,
  type SessionMetrics,
  type SessionStage,
} from "@/lib/inbound";
import { Info } from "lucide-react";

/** Tone per terminal stage. `unrouted` is deliberately an error tone — it is a
 *  routing gap on our side, not a customer outcome. */
const STAGE_TONE: Record<SessionStage, string> = {
  active: "border-ai/30 bg-ai/10 text-ai",
  resolved: "border-success/30 bg-success/10 text-success",
  handed_off: "border-warning/30 bg-warning/10 text-warning",
  abandoned: "border-muted-foreground/30 bg-muted text-muted-foreground",
  expired: "border-muted-foreground/30 bg-muted text-muted-foreground",
  no_response: "border-muted-foreground/30 bg-muted text-muted-foreground",
  unrouted: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function StageTag({ stage, className }: { stage: SessionStage; className?: string }) {
  return (
    <span
      title={STAGE_INFO[stage]}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STAGE_TONE[stage],
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          stage === "active" ? "bg-current animate-pulse" : "bg-current opacity-60",
        )}
      />
      {STAGE_LABEL[stage]}
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
  const outcomes = [
    { label: "Resolved", value: m.resolved, cls: "bg-success" },
    { label: "Handed off", value: m.handedOff, cls: "bg-warning" },
    { label: "Abandoned", value: m.abandoned, cls: "bg-muted-foreground/50" },
    { label: "Expired", value: m.expired, cls: "bg-muted-foreground/30" },
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
        Only sessions that engaged and finished. In-flight and unrouted arrivals have no
        outcome yet, so counting them here would understate every share.
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

      {m.unrouted > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            <span className="font-medium text-destructive">
              {m.unrouted.toLocaleString()} unrouted
            </span>{" "}
            — the graph has a path that reaches no agent. These contacts were never
            answered. This is a routing gap, not a customer outcome.
          </p>
        </div>
      )}
    </div>
  );
}
