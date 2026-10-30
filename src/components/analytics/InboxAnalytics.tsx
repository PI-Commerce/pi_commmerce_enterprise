/**
 * Team inbox analytics — the consolidated view across every entry point.
 *
 * A different question from the Inbound tab next door, which measures *routing*: did
 * an arrival reach an agent, and where did the funnel lose it. This one measures the
 * inbox as a place work sits in — what is open, what is waiting, who is carrying it,
 * and who actually closed it.
 *
 * The one number to design the page around is the bot/operator split. A solved count
 * on its own stays healthy while the automation quietly stops working and people mop
 * up behind it, so the tile strip shows both halves next to the total rather than
 * making anyone divide two figures from different panels.
 *
 * Missed sits in that strip too, and it is the only tile that is not a status: a
 * session nobody answered is Open like any other, and a team reading "412 open" needs
 * to know how much of that was never picked up at all.
 */
import { useMemo } from "react";
import { Panel } from "@/components/connections/Panel";
import { cn } from "@/lib/utils";
import {
  allSessions,
  computeInboxMetrics,
  fmtDuration,
  fmtPct,
  useEntryPoints,
  STATUS_LABEL,
  SESSION_WINDOW_HOURS,
  type InboxMetrics,
  type SessionStatus,
} from "@/lib/inbound";
import { Bot, UserRound } from "lucide-react";

export function InboxAnalytics() {
  const eps = useEntryPoints();
  const sessions = useMemo(() => allSessions(eps), [eps]);
  const m = useMemo(() => computeInboxMetrics(sessions), [sessions]);

  return (
    <div className="space-y-5">
      <Overview m={m} total={sessions.length} />

      <div className="grid gap-5 lg:grid-cols-2">
        <StatusOverTime m={m} />
        <CountByStatus m={m} />
      </div>

      <ResolutionSplit m={m} />
      <OperatorPerformance m={m} />
    </div>
  );
}

/* ──────────────────────────────── Overview ──────────────────────────────────── */

function Overview({ m, total }: { m: InboxMetrics; total: number }) {
  const tiles: { label: string; value: string; hint?: string; tone?: string }[] = [
    { label: STATUS_LABEL.open, value: m.open.toLocaleString(), tone: "text-ai" },
    { label: STATUS_LABEL.pending, value: m.pending.toLocaleString(), tone: "text-warning" },
    { label: STATUS_LABEL.solved, value: m.solved.toLocaleString(), tone: "text-success" },
    { label: "Solved by agent", value: m.solvedByBot.toLocaleString(), hint: fmtPct(m.botShare) + " of solved" },
    { label: "Solved by a person", value: m.solvedByOperator.toLocaleString() },
    { label: STATUS_LABEL.expired, value: m.expired.toLocaleString(), hint: `Past the ${SESSION_WINDOW_HOURS}h window` },
    { label: "Missed", value: m.missed.toLocaleString(), hint: "Never picked up" },
  ];
  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="text-[13px] font-semibold">Overview</h2>
        <span className="text-[11.5px] text-muted-foreground">
          {total.toLocaleString()} sessions across every entry point
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t.label}</p>
            <p className={cn("mt-1 text-xl font-semibold tracking-tight", t.tone)}>{t.value}</p>
            {t.hint && (
              <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{t.hint}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── Status over time ─────────────────────────────────── */

const STATUS_COLOR: Record<SessionStatus, string> = {
  open: "bg-ai",
  pending: "bg-warning",
  expired: "bg-muted-foreground/40",
  solved: "bg-success",
};

/**
 * Stacked bars rather than four overlaid lines.
 *
 * The reference draws lines, and at this density they cross so often that the only
 * readable fact — how the day's volume split — is the one the chart hides. Stacking
 * puts the split in the bar and the volume in its height.
 */
function StatusOverTime({ m }: { m: InboxMetrics }) {
  const days = m.daily.slice(-14);
  const peak = Math.max(1, ...days.map((d) => d.open + d.pending + d.expired + d.solved));
  const order: SessionStatus[] = ["solved", "pending", "open", "expired"];

  return (
    <Panel title="Status over time" caption="Last 14 days by the day the session started.">
      <div className="flex h-[180px] items-end gap-1">
        {days.map((d) => {
          const tot = d.open + d.pending + d.expired + d.solved;
          return (
            <div
              key={d.day}
              className="flex min-w-0 flex-1 flex-col-reverse"
              style={{ height: `${(tot / peak) * 100}%` }}
              title={`${d.day} · ${tot} sessions`}
            >
              {order.map((st) =>
                d[st] > 0 ? (
                  <div
                    key={st}
                    className={cn("w-full", STATUS_COLOR[st])}
                    style={{ height: `${(d[st] / tot) * 100}%` }}
                    title={`${STATUS_LABEL[st]}: ${d[st]}`}
                  />
                ) : null,
              )}
            </div>
          );
        })}
      </div>
      <Legend />
    </Panel>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {(["open", "pending", "expired", "solved"] as SessionStatus[]).map((st) => (
        <span key={st} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-sm", STATUS_COLOR[st])} />
          {STATUS_LABEL[st]}
        </span>
      ))}
    </div>
  );
}

/* ───────────────────────── Count by status ──────────────────────────────────── */

function CountByStatus({ m }: { m: InboxMetrics }) {
  const rows: { label: string; n: number; cls: string }[] = [
    { label: STATUS_LABEL.open, n: m.open, cls: "bg-ai" },
    { label: STATUS_LABEL.pending, n: m.pending, cls: "bg-warning" },
    { label: STATUS_LABEL.solved, n: m.solved, cls: "bg-success" },
    { label: STATUS_LABEL.expired, n: m.expired, cls: "bg-muted-foreground/40" },
    { label: "Missed", n: m.missed, cls: "bg-destructive/60" },
  ];
  const peak = Math.max(1, ...rows.map((r) => r.n));
  return (
    <Panel title="Total by status" caption="Where every session currently sits.">
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="w-[72px] shrink-0 text-[11.5px] text-muted-foreground">{r.label}</span>
            <span className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-secondary">
              <span
                className={cn("block h-full rounded", r.cls)}
                style={{ width: `${(r.n / peak) * 100}%` }}
              />
            </span>
            <span className="w-12 shrink-0 text-right font-mono text-[12px]">{r.n}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ──────────────────── Agent vs person ───────────────────────────────────────── */

/**
 * The page's headline comparison, given its own panel rather than two tiles.
 *
 * Share of *solved*, not of all sessions: the question is "of the work that got
 * closed, how much did the automation close", and dividing by everything that ever
 * arrived answers a different one.
 */
function ResolutionSplit({ m }: { m: InboxMetrics }) {
  const botPct = m.solved ? (m.solvedByBot / m.solved) * 100 : 0;
  return (
    <Panel
      title="Who resolved it"
      caption="Share of solved sessions. A solved count alone stays healthy while automation quietly stops pulling its weight."
    >
      <div className="flex h-7 overflow-hidden rounded-lg bg-secondary">
        <div className="flex items-center bg-ai/80 px-2" style={{ width: `${botPct}%` }}>
          <Bot className="h-3.5 w-3.5 shrink-0 text-background" />
        </div>
        <div className="flex flex-1 items-center justify-end bg-foreground/70 px-2">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-background" />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[12px]">
        <span>
          <span className="font-semibold">{m.solvedByBot.toLocaleString()}</span>{" "}
          <span className="text-muted-foreground">by the agent · {fmtPct(m.botShare)}</span>
        </span>
        <span>
          <span className="font-semibold">{m.solvedByOperator.toLocaleString()}</span>{" "}
          <span className="text-muted-foreground">by a person</span>
        </span>
        <span className="text-muted-foreground">
          Resolution rate {fmtPct(m.resolutionRate)} of sessions that reached anyone
        </span>
      </div>
    </Panel>
  );
}

/* ──────────────────────── Operator performance ──────────────────────────────── */

function OperatorPerformance({ m }: { m: InboxMetrics }) {
  return (
    <Panel
      title="Operator performance"
      caption="Current load and what each person has closed. Open and Waiting are live counts, not totals for the period."
      flush
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Operator</th>
            <th className="px-4 py-2.5 text-right font-medium">Open now</th>
            <th className="px-4 py-2.5 text-right font-medium">Waiting now</th>
            <th className="px-4 py-2.5 text-right font-medium">Assigned</th>
            <th className="px-4 py-2.5 text-right font-medium">Solved</th>
            <th className="px-4 py-2.5 text-right font-medium">Median handle</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {m.operators.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-2.5">
                <div className="text-[12.5px] font-medium">{o.name}</div>
                <div className="text-[11px] text-muted-foreground">{o.email}</div>
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-[12px]">{o.openNow}</td>
              <td className="px-4 py-2.5 text-right font-mono text-[12px]">{o.pendingNow}</td>
              <td className="px-4 py-2.5 text-right font-mono text-[12px]">{o.assigned}</td>
              <td className="px-4 py-2.5 text-right font-mono text-[12px]">{o.solved}</td>
              <td className="px-4 py-2.5 text-right font-mono text-[12px] text-muted-foreground">
                {o.medianHandleMs ? fmtDuration(o.medianHandleMs) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
