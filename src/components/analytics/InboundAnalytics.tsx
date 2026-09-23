/**
 * Analytics · Inbound tab.
 *
 * The campaign tab draws a Sankey over an *authored* graph, so its shape differs
 * per campaign and two campaigns are only loosely comparable. Inbound is the
 * opposite: every session walks the same fixed lifecycle, so arrival types and
 * agents sit on one directly-comparable axis. That is the whole reason this is
 * a separate tab rather than a campaign filter — see PRD §8.
 *
 * Sliced by **arrival type (channel × trigger)**, not by entry point. An entry
 * point is configuration — which number is bound to which graph — so comparing
 * two of them compares provisioning decisions, and the comparison is invalidated
 * the moment a number is repointed. Arrival type is a property of the demand and
 * survives any rewiring. Per-entry-point numbers stay where they are actionable:
 * the `/inbound` list, next to the graph that produces them.
 *
 * There is no "all arrivals" view. A paid ad click, a service message and a phone
 * call have different costs, different latencies and different success bars;
 * averaged together the number describes no real population and moves whenever
 * the *mix* moves, which reads as a change in performance when nothing changed.
 * The cross-type view is the comparison table, which keeps the types apart.
 *
 * Deliberately NOT here: a "Session × Channel" pivot. A session is single-channel
 * for its whole life (PRD §8.4), so that pivot is degenerate — channel is already
 * one half of the arrival type.
 */
import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "@/components/analytics/EChart";
import { MetricCard, OutcomeSplit } from "@/components/inbound/SessionBits";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ARRIVAL_INFO,
  ARRIVAL_LABEL,
  ARRIVAL_TYPES,
  allSessions,
  arrivalTypeOf,
  computeSessionMetrics,
  fmtDuration,
  fmtMs,
  fmtPct,
  fmtUsd,
  useEntryPoints,
  type ArrivalType,
  type Session,
} from "@/lib/inbound";
import { resolveAgent } from "@/lib/agent-data";
import { cn } from "@/lib/utils";

export function InboundAnalytics() {
  const eps = useEntryPoints();
  const [arrival, setArrival] = useState<ArrivalType>(ARRIVAL_TYPES[0]);

  const sessions = useMemo(() => allSessions(eps), [eps]);

  const scoped = useMemo(
    () => sessions.filter((s) => arrivalTypeOf(s) === arrival),
    [sessions, arrival],
  );

  const m = useMemo(() => computeSessionMetrics(scoped), [scoped]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={arrival} onValueChange={(v) => setArrival(v as ArrivalType)}>
          <SelectTrigger className="h-8 w-[240px] text-[12.5px]">
            <SelectValue placeholder="Arrival type" />
          </SelectTrigger>
          <SelectContent>
            {ARRIVAL_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {ARRIVAL_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11.5px] text-muted-foreground">{ARRIVAL_INFO[arrival]}</p>
        <p className="ml-auto text-[11.5px] text-muted-foreground">
          {scoped.length.toLocaleString()} sessions in scope
        </p>
      </div>

      {/* Handoff and Abandon are deliberately absent: both are counts over
          `engagedEnded`, which the outcome split below already draws. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <MetricCard label="Sessions" value={m.received.toLocaleString()} />
        <MetricCard
          label="Active now"
          value={m.active.toLocaleString()}
          hint="In flight — no outcome yet, so excluded from every rate below."
        />
        <MetricCard
          label="Unrouted"
          value={m.unrouted.toLocaleString()}
          tone={m.unrouted > 0 ? "bad" : "default"}
          hint="Reached no agent. A routing gap, not a customer outcome."
        />
        <MetricCard
          label="Containment"
          value={fmtPct(m.containmentRate)}
          tone={m.containmentRate >= 0.6 ? "good" : "warn"}
          hint="Resolved ÷ engaged sessions that ended."
        />
        <MetricCard label="Median handle" value={fmtDuration(m.medianHandleMs)} />
        <MetricCard
          label="Median turns"
          value={m.medianTurns ? m.medianTurns.toLocaleString() : "—"}
          hint="Effort per session. The measure that works on async WhatsApp, where elapsed time says little."
        />
      </div>

      {/* Volume is a 14-point series and wants the width; the outcome split is a
          bar and four rows and does not. Side by side they answer the two
          questions in order — how much arrived, and how it ended. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <VolumeByDay sessions={scoped} />
        <OutcomeSplit m={m} />
      </div>

      <ArrivalComparison sessions={sessions} />

      <div className="grid gap-5 lg:grid-cols-2">
        <AgentComparison sessions={scoped} />
        <AdBreakdown sessions={scoped} />
      </div>
    </div>
  );
}

/* ───────────── Volume by day ───────────── */

function VolumeByDay({ sessions }: { sessions: Session[] }) {
  const opt = useMemo<EChartsOption>(() => {
    const byDay = new Map<string, { total: number; unrouted: number }>();
    for (const s of sessions) {
      const d = new Date(s.startedAt);
      const key = `${d.getDate()}/${d.getMonth() + 1}`;
      const cur = byDay.get(key) ?? { total: 0, unrouted: 0 };
      cur.total += 1;
      if (s.stage === "unrouted") cur.unrouted += 1;
      byDay.set(key, cur);
    }
    const keys = [...byDay.keys()].sort((a, b) => {
      const [da, ma] = a.split("/").map(Number);
      const [db, mb] = b.split("/").map(Number);
      return ma - mb || da - db;
    });
    return {
      grid: { left: 36, right: 12, top: 28, bottom: 24 },
      tooltip: { trigger: "axis" },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { fontSize: 11, color: "#94a3b8" },
      },
      xAxis: {
        type: "category",
        data: keys,
        axisLabel: { fontSize: 10, color: "#94a3b8" },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.14)" } },
        axisLabel: { fontSize: 10, color: "#94a3b8" },
      },
      series: [
        {
          name: "Answered",
          type: "bar",
          stack: "v",
          data: keys.map((k) => byDay.get(k)!.total - byDay.get(k)!.unrouted),
          itemStyle: { color: "#6366f1", borderRadius: [0, 0, 2, 2] },
          barMaxWidth: 18,
        },
        {
          name: "Unrouted",
          type: "bar",
          stack: "v",
          data: keys.map((k) => byDay.get(k)!.unrouted),
          itemStyle: { color: "#ef4444", borderRadius: [2, 2, 0, 0] },
          barMaxWidth: 18,
        },
      ],
    };
  }, [sessions]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold">Arrival volume</h3>
        <p className="text-[11px] text-muted-foreground">Last 14 days</p>
      </div>
      <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
        Inbound has no send schedule — volume is demand, not something you set. Unrouted
        stacked on top shows demand you did not answer.
      </p>
      <EChart option={opt} style={{ height: 220 }} />
    </div>
  );
}

/* ───────────── Arrival type comparison ───────────── */

/**
 * The payoff of the fixed lifecycle: one row per arrival type, same columns,
 * genuinely comparable. The campaign tab cannot do this because no two campaigns
 * share a funnel shape.
 *
 * Always shows all three rows regardless of the filter above — the point of this
 * table is the comparison, and a table that shrinks to the row you already
 * selected tells you nothing.
 */
function ArrivalComparison({ sessions }: { sessions: Session[] }) {
  const rows = useMemo(() => {
    const byType = new Map<ArrivalType, Session[]>(ARRIVAL_TYPES.map((t) => [t, []]));
    for (const s of sessions) byType.get(arrivalTypeOf(s))!.push(s);
    return ARRIVAL_TYPES.map((t) => ({
      type: t,
      m: computeSessionMetrics(byType.get(t)!),
    }));
  }, [sessions]);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-[13px] font-semibold">Arrival types compared</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Channel × trigger. Same stages, same denominators — the columns mean the same
          thing on every row.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-2 text-left font-medium">Arrival type</th>
              <th className="px-3 py-2 text-right font-medium">Sessions</th>
              <th className="px-3 py-2 text-right font-medium">Unrouted</th>
              <th className="px-3 py-2 text-right font-medium">Containment</th>
              <th className="px-3 py-2 text-right font-medium">Median TTFR</th>
              <th className="px-3 py-2 text-right font-medium">Total cost</th>
              <th className="px-5 py-2 text-right font-medium">Cost / res.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ type, m }) => (
              <tr key={type} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-2.5">
                  <p className="font-medium">{ARRIVAL_LABEL[type]}</p>
                  <p className="text-[11px] text-muted-foreground">{ARRIVAL_INFO[type]}</p>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {m.received.toLocaleString()}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right tabular-nums",
                    m.unrouted > 0 ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {m.unrouted > 0
                    ? `${m.unrouted} (${fmtPct(m.unrouted / Math.max(1, m.received))})`
                    : "0"}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right tabular-nums font-medium",
                    m.received === 0 ? "text-muted-foreground"
                    : m.containmentRate >= 0.6 ? "text-success"
                    : "text-warning",
                  )}
                >
                  {m.received === 0 ? "—" : fmtPct(m.containmentRate)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtMs(m.medianFirstResponseMs)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtUsd(m.totalCost)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">
                  {m.resolved === 0 ? "—" : fmtUsd(m.costPerResolution, 3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────── Agent comparison ───────────── */

/**
 * Inbound containment split by handling agent. This is the bridge to the Agent tab:
 * the same agent may also run outbound nodes, and only the Agent tab shows both
 * halves of its behaviour together.
 */
function AgentComparison({ sessions }: { sessions: Session[] }) {
  const rows = useMemo(() => {
    const byAgent = new Map<string, Session[]>();
    for (const s of sessions) {
      if (!s.agentId) continue;
      const cur = byAgent.get(s.agentId) ?? [];
      cur.push(s);
      byAgent.set(s.agentId, cur);
    }
    return [...byAgent.entries()]
      .map(([id, list]) => ({
        id,
        name: resolveAgent(id)?.name ?? id,
        m: computeSessionMetrics(list),
      }))
      .sort((a, b) => b.m.received - a.m.received);
  }, [sessions]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-[13px] font-semibold">Containment by agent</h3>
      <p className="mt-0.5 mb-3 text-[11px] leading-snug text-muted-foreground">
        Inbound half only. An agent's outbound behaviour lives on the Agent tab.
      </p>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.id}>
            <div className="mb-1 flex items-baseline justify-between text-[12px]">
              <span className="font-medium">{r.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {fmtPct(r.m.containmentRate)} · {r.m.received} sessions
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  r.m.containmentRate >= 0.6 ? "bg-success" : "bg-warning",
                )}
                style={{ width: `${Math.max(2, r.m.containmentRate * 100)}%` }}
              />
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="py-8 text-center text-[12px] text-muted-foreground">
            No routed sessions in scope.
          </p>
        )}
      </div>
    </div>
  );
}

/* ───────────── CTWA attribution ───────────── */

/**
 * Which ads produced the paid demand. The ad-vs-service split this card used to
 * lead with is now two rows of the arrival table above, so only the per-ad
 * breakdown is left — that is the part the type axis genuinely cannot express.
 *
 * This is the one place inbound analytics meets paid spend, and it is why CTWA
 * does not need its own entry point construct: the ads land on the same number
 * as service traffic and only the referral payload separates them.
 */
function AdBreakdown({ sessions }: { sessions: Session[] }) {
  const ads = useMemo(() => {
    const byAd = new Map<string, Session[]>();
    for (const s of sessions) {
      if (!s.referral) continue;
      const cur = byAd.get(s.referral.adName) ?? [];
      cur.push(s);
      byAd.set(s.referral.adName, cur);
    }
    return [...byAd.entries()]
      .map(([name, list]) => ({ name, m: computeSessionMetrics(list) }))
      .sort((a, b) => b.m.received - a.m.received);
  }, [sessions]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-[13px] font-semibold">CTWA ads</h3>
      <p className="mt-0.5 mb-3 text-[11px] leading-snug text-muted-foreground">
        Paid demand by source ad. Cost here is what answering it cost — not ad spend.
      </p>

      {ads.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-muted-foreground">
          No ad-referred arrivals in scope.
        </p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <th className="pb-1.5 text-left font-medium">Ad</th>
              <th className="pb-1.5 text-right font-medium">Sessions</th>
              <th className="pb-1.5 pl-2 text-right font-medium">Contained</th>
              <th className="pb-1.5 pl-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {ads.map((a) => (
              <tr key={a.name} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-2">{a.name}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {a.m.received}
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums font-medium">
                  {fmtPct(a.m.containmentRate)}
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums text-muted-foreground">
                  {fmtUsd(a.m.totalCost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
