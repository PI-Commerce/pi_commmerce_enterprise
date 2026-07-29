import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import {
  Send, CheckCircle2, Eye, XCircle, WifiOff,
  Search, Download, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { EChart } from "@/components/analytics/EChart";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/analytics-leads";
import {
  buildRcsMessages, rcsMessagesToCsv, templateForNode,
  rcsFailureBreakdown, rcsOutcomeTotals,
  type RcsRef, type RcsStatus,
} from "@/lib/analytics-rcs";
import { replyButtons } from "@/lib/rcs-templates";

/**
 * Channel → RCS. A bespoke view rather than the generic `ChannelDetail`, for the
 * same reasons SMS ships one, plus one that is RCS-only (PICOM-4728):
 *
 *  - **the outcomes don't nest.** Delivered / Failed / Not reachable / Timed out
 *    are mutually exclusive terminal states that sum to Sent, so they render as a
 *    split, not a funnel where each stage is a subset of the one above.
 *  - **the report is per-recipient**, with columns the shared leads table doesn't
 *    carry (sending bot + vendor, read receipt, the quick-reply tapped).
 *  - **RCS is interactive.** Recipients tap quick-reply buttons, so reply
 *    engagement — which button drove response — is a first-class chart no other
 *    channel needs.
 */
export function RcsChannelView({ refs }: { refs: RcsRef[] }) {
  // Outcome tiles are derived from each node's real `entered` volume via the
  // shared delivery rates — NOT counted off the 120-message sample, which would
  // make the tiles swing on sampling luck and disagree with the campaign Sankey.
  const totalSent = refs.reduce((s, { node }) => s + node.entered, 0);
  const { delivered, read, failed, notReachable } = rcsOutcomeTotals(totalSent);
  const deliveryRate = totalSent > 0 ? (delivered / totalSent) * 100 : 0;
  const readRate = delivered > 0 ? (read / delivered) * 100 : 0;

  return (
    <div className="space-y-6">
      <Section title="Delivery performance" sub="Every RCS node in the selected scope.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi icon={Send} label="Sent" value={totalSent.toLocaleString()} sub="Messages submitted to the RBM vendor" />
          <Kpi
            icon={CheckCircle2}
            label="Delivered"
            value={delivered.toLocaleString()}
            sub={`${deliveryRate.toFixed(1)}% of sent`}
            tone="positive"
          />
          <Kpi
            icon={Eye}
            label="Read"
            value={read.toLocaleString()}
            sub={`${readRate.toFixed(1)}% of delivered`}
            tone="positive"
          />
          <Kpi
            icon={XCircle}
            label="Failed"
            value={failed.toLocaleString()}
            sub={totalSent > 0 ? `${((failed / totalSent) * 100).toFixed(1)}% of sent` : "—"}
            tone="negative"
          />
          <Kpi
            icon={WifiOff}
            label="Not Reachable"
            value={notReachable.toLocaleString()}
            sub="Handset not RCS-capable"
            tone="warning"
          />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <OutcomeSplit totalSent={totalSent} />
        <ReplyEngagement refs={refs} totalSent={totalSent} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FailureReasons totalFailed={failed} />
        <TemplateComparison refs={refs} />
      </div>

      <DayWise sent={totalSent} delivered={delivered} read={read} />

      <MessagesTable refs={refs} />
    </div>
  );
}

/* ───────── KPI ───────── */

function Kpi({ icon: Icon, label, value, sub, tone = "neutral" }: {
  icon: LucideIcon; label: string; value: string; sub: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            tone === "positive"
              ? "bg-success/10 text-success"
              : tone === "negative"
                ? "bg-destructive/10 text-destructive"
                : tone === "warning"
                  ? "bg-warning/10 text-warning"
                  : "bg-secondary text-muted-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-primary" />
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Card({ title, sub, children, action }: {
  title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">{title}</h4>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

const OUTCOME_COLOR = {
  delivered: "#22c55e",
  replied: "#6366f1",
  failed: "#ef4444",
  notReachable: "#f59e0b",
  timeout: "#94a3b8",
} as const;

/**
 * Terminal-outcome split. Deliberately a donut, not a funnel: these states are
 * mutually exclusive and sum to Sent. "Delivered" here is delivered-without-a-
 * reply; recipients who tapped a quick-reply are split out as "Replied" so the
 * interactive slice of RCS is visible.
 */
function OutcomeSplit({ totalSent }: { totalSent: number }) {
  const { delivered, replied, failed, notReachable, timeout } = rcsOutcomeTotals(totalSent);
  const deliveredNoReply = Math.max(0, delivered - replied);
  const data = [
    { name: "Delivered", value: deliveredNoReply, color: OUTCOME_COLOR.delivered },
    { name: "Replied", value: replied, color: OUTCOME_COLOR.replied },
    { name: "Failed", value: failed, color: OUTCOME_COLOR.failed },
    { name: "Not reachable", value: notReachable, color: OUTCOME_COLOR.notReachable },
    { name: "Timed out", value: timeout, color: OUTCOME_COLOR.timeout },
  ].filter((d) => d.value > 0);

  const option = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        formatter: (p: unknown) => {
          const q = p as { name: string; value: number; percent: number };
          return `${q.name}<br/><b>${q.value.toLocaleString()}</b> (${q.percent}%)`;
        },
      },
      legend: { bottom: 0, itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 11 } },
      series: [
        {
          type: "pie",
          radius: ["52%", "76%"],
          center: ["50%", "44%"],
          avoidLabelOverlap: true,
          label: { show: false },
          data: data.map((d) => ({
            name: d.name,
            value: d.value,
            itemStyle: { color: d.color },
          })),
        },
      ],
    }),
    [data],
  );

  return (
    <Card title="Delivery outcomes" sub="Mutually exclusive terminal states — they sum to Sent.">
      <div className="h-[280px]">
        {data.length === 0 ? <Empty hint="No messages in scope." /> : <EChart option={option} />}
      </div>
    </Card>
  );
}

/**
 * Quick-reply engagement — RCS-specific. Distributes the scope's total replies
 * across the union of quick-reply buttons on the templates in scope, weighted by
 * how often each was tapped in the sample (even split as a floor). Derived from
 * the total, not raw-counted, so it agrees with the Replied KPI.
 */
function ReplyEngagement({ refs, totalSent }: { refs: RcsRef[]; totalSent: number }) {
  const rows = useMemo(() => {
    const { replied } = rcsOutcomeTotals(totalSent);
    // Union of reply-button texts across every template in scope.
    const buttonSet = new Map<string, number>();
    for (const ref of refs) {
      const t = templateForNode(ref.node);
      if (!t) continue;
      for (const b of replyButtons(t))
        buttonSet.set(b.text, (buttonSet.get(b.text) ?? 0) + ref.node.entered);
    }
    if (buttonSet.size === 0) return [];
    // Distribute the replied total by each button's share of exposure.
    const totalExposure = [...buttonSet.values()].reduce((s, v) => s + v, 0) || 1;
    return [...buttonSet.entries()]
      .map(([text, exposure]) => ({
        text,
        count: Math.round((replied * exposure) / totalExposure),
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => a.count - b.count);
  }, [refs, totalSent]);

  const option = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "value", axisLabel: { fontSize: 10 }, splitLine: { show: true } },
      yAxis: {
        type: "category",
        data: rows.map((r) => r.text),
        axisLabel: { fontSize: 10, width: 150, overflow: "truncate" },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: rows.map((r) => r.count),
          barWidth: 14,
          itemStyle: { color: OUTCOME_COLOR.replied, borderRadius: [0, 3, 3, 0] },
          label: {
            show: true,
            position: "right",
            fontSize: 10,
            formatter: (p: unknown) => (p as { value: number }).value.toLocaleString(),
          },
        },
      ],
    }),
    [rows],
  );

  return (
    <Card title="Quick-reply engagement" sub="Replies attributed to each suggested-reply button in scope.">
      <div className="h-[280px]">
        {rows.length === 0 ? (
          <Empty hint="No quick-reply buttons on the templates in scope." />
        ) : (
          <EChart option={option} />
        )}
      </div>
    </Card>
  );
}

/** Why messages failed — the RCS rejection taxonomy. */
function FailureReasons({ totalFailed }: { totalFailed: number }) {
  const counts = useMemo(
    () => rcsFailureBreakdown(totalFailed).sort((a, b) => a.count - b.count),
    [totalFailed],
  );

  const option = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "value", axisLabel: { fontSize: 10 }, splitLine: { show: true } },
      yAxis: {
        type: "category",
        data: counts.map((c) => c.reason),
        axisLabel: { fontSize: 10, width: 150, overflow: "truncate" },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: counts.map((c) => c.count),
          barWidth: 14,
          itemStyle: { color: OUTCOME_COLOR.failed, borderRadius: [0, 3, 3, 0] },
          label: {
            show: true,
            position: "right",
            fontSize: 10,
            formatter: (p: unknown) => (p as { value: number }).value.toLocaleString(),
          },
        },
      ],
    }),
    [counts],
  );

  return (
    <Card title="Failure reasons" sub="Carrier and RBM rejections across the selected scope.">
      <div className="h-[280px]">
        {counts.length === 0 ? (
          <Empty hint="No failures in scope — nothing to break down." />
        ) : (
          <EChart option={option} />
        )}
      </div>
    </Card>
  );
}

/** Day-wise Sent / Delivered / Read. */
function DayWise({ sent, delivered, read }: { sent: number; delivered: number; read: number }) {
  const LAYERS = ["Sent", "Delivered", "Read"] as const;
  const [on, setOn] = useState<string[]>([...LAYERS]);
  const days = 14;

  const { dates, series } = useMemo(() => {
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const end = new Date();
    const ds: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      ds.push(`${d.getDate()} ${MONTHS[d.getMonth()]}`);
    }
    const totals: Record<string, number> = { Sent: sent, Delivered: delivered, Read: read };
    const s = LAYERS.map((label, idx) => {
      const base = totals[label] / Math.max(1, days);
      const values: number[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const wave = 0.78 + Math.sin((i + idx * 3 + 1) * 0.6) * 0.16 + Math.cos((i + idx) * 0.21) * 0.08;
        values.push(Math.max(0, Math.round(base * wave)));
      }
      return { name: label as string, data: values };
    });
    return { dates: ds, series: s };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent, delivered, read]);

  const LAYER_COLOR: Record<string, string> = {
    Sent: "#0ea5e9",
    Delivered: OUTCOME_COLOR.delivered,
    Read: "#6366f1",
  };

  const option = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      grid: { left: 48, right: 16, top: 32, bottom: 60 },
      tooltip: { trigger: "axis", order: "valueDesc" },
      legend: { top: 0, right: 8, itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 11 } },
      xAxis: { type: "category", boundaryGap: false, data: dates, axisLabel: { fontSize: 10 } },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { fontSize: 10 },
        name: "Volume",
        nameLocation: "middle",
        nameGap: 36,
        nameTextStyle: { fontSize: 10, color: "oklch(0.52 0.015 260)" },
      },
      dataZoom: [
        { type: "slider", height: 18, bottom: 8, minValueSpan: 1 },
        { type: "inside", minValueSpan: 1 },
      ],
      series: series
        .filter((s) => on.includes(s.name))
        .map((s) => {
          const c = LAYER_COLOR[s.name];
          return {
            type: "line" as const,
            name: s.name,
            data: s.data,
            smooth: false,
            symbol: "none" as const,
            lineStyle: { width: 1.5, color: c },
            color: c,
            areaStyle: { color: c, opacity: 0.35 },
            z: 100 - series.findIndex((x) => x.name === s.name),
          };
        }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dates, series, on],
  );

  return (
    <Card
      title="Day-wise performance"
      action={
        <div className="w-[190px]">
          <MultiSelect
            options={LAYERS.map((l) => ({ value: l, label: l }))}
            value={on}
            onChange={setOn}
            allLabel="All layers"
            searchable={false}
          />
        </div>
      }
    >
      <div className="h-[300px]">
        <EChart option={option} />
      </div>
    </Card>
  );
}

/** Volume per RCS template in scope, annotated with the template type. */
function TemplateComparison({ refs }: { refs: RcsRef[] }) {
  const rows = useMemo(() => {
    const byId = new Map<string, { name: string; sent: number; type: string }>();
    for (const ref of refs) {
      const t = templateForNode(ref.node);
      if (!t) continue;
      const cur = byId.get(t.id) ?? {
        name: t.name,
        sent: 0,
        type: t.type === "RICH_CARD" ? "Rich card" : "Text",
      };
      cur.sent += ref.node.entered;
      byId.set(t.id, cur);
    }
    return [...byId.values()].sort((a, b) => a.sent - b.sent);
  }, [refs]);

  const option = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (p: unknown) => {
          const arr = p as { dataIndex: number }[];
          const row = rows[arr[0]?.dataIndex ?? 0];
          if (!row) return "";
          return `${row.name}<br/>${row.type}<br/>Sent <b>${row.sent.toLocaleString()}</b>`;
        },
      },
      xAxis: { type: "value", axisLabel: { fontSize: 10 } },
      yAxis: {
        type: "category",
        data: rows.map((r) => r.name),
        axisLabel: { fontSize: 10, width: 130, overflow: "truncate" },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: rows.map((r) => r.sent),
          barWidth: 14,
          itemStyle: { color: "#6366f1", borderRadius: [0, 3, 3, 0] },
          label: {
            show: true,
            position: "right",
            fontSize: 10,
            formatter: (p: unknown) => {
              const q = p as { dataIndex: number; value: number };
              const row = rows[q.dataIndex];
              return row ? `${q.value.toLocaleString()} · ${row.type}` : q.value.toLocaleString();
            },
          },
        },
      ],
    }),
    [rows],
  );

  return (
    <Card title="Templates in scope" sub="Volume per RCS template, annotated Text or Rich card.">
      <div className="h-[280px]">
        {rows.length === 0 ? <Empty hint="No resolvable templates in scope." /> : <EChart option={option} />}
      </div>
    </Card>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-muted-foreground">
      {hint}
    </div>
  );
}

/* ───────── Per-recipient table (PICOM-4728) ───────── */

const STATUS_TONE: Record<RcsStatus, string> = {
  Delivered: "bg-success/10 text-success",
  Read: "bg-success/10 text-success",
  Replied: "bg-primary/10 text-primary",
  Failed: "bg-destructive/10 text-destructive",
  "Not reachable": "bg-warning/10 text-warning",
  "Timed out": "bg-secondary text-muted-foreground",
};

const STATUS_FILTERS: RcsStatus[] = [
  "Delivered",
  "Read",
  "Replied",
  "Failed",
  "Not reachable",
  "Timed out",
];

function MessagesTable({ refs }: { refs: RcsRef[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<RcsStatus | "any">("any");

  // Like the SMS / Voice tables: the log shows the most recent run in scope, with
  // a banner when other runs are folded into the KPIs above.
  const tableRunId = refs[0]?.run.id;
  const tableRun = refs[0]?.run;
  const runCount = useMemo(() => new Set(refs.map((r) => r.run.id)).size, [refs]);
  const messages = useMemo(
    () => refs.filter((r) => r.run.id === tableRunId).flatMap((ref) => buildRcsMessages(ref)),
    [refs, tableRunId],
  );

  const filtered = useMemo(
    () =>
      messages.filter((m) => {
        if (
          q &&
          !`${m.phone} ${m.templateName} ${m.botName}`.toLowerCase().includes(q.toLowerCase())
        )
          return false;
        if (status !== "any" && m.status !== status) return false;
        return true;
      }),
    [messages, q, status],
  );

  return (
    <Section
      title="Message log"
      sub="Per-recipient delivery detail for every message in the latest run in scope."
    >
      {runCount > 1 && tableRun && (
        <p className="text-[11px] text-muted-foreground">
          Showing messages from {tableRun.startedAt}. {runCount - 1} other run
          {runCount - 1 === 1 ? "" : "s"} are aggregated in the KPIs and charts above.
        </p>
      )}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search number, template or bot…"
              className="h-8 w-[280px] pl-7 text-xs"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as RcsStatus | "any")}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any status</SelectItem>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-8 gap-1.5 text-xs"
            onClick={() => downloadCsv("rcs-messages.csv", rcsMessagesToCsv(filtered))}
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>

        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-card text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Recipient</th>
                <th className="px-4 py-2 font-medium">Template / Bot</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Reply</th>
                <th className="px-4 py-2 font-medium">Sent</th>
                <th className="px-4 py-2 font-medium">Read</th>
                <th className="px-4 py-2 font-medium">Failure reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No messages match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className="block font-mono text-[12px]">{m.phone}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="block">{m.templateName}</span>
                      <span className="block text-[10.5px] text-muted-foreground">
                        {m.botName}{m.vendor !== "—" ? ` · ${m.vendor}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("whitespace-nowrap rounded-md px-2 py-0.5 text-[10.5px] font-medium", STATUS_TONE[m.status])}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[11.5px] text-muted-foreground">{m.replyButton ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-muted-foreground">{m.sentAt}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-muted-foreground">{m.readAt ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[11.5px] text-muted-foreground">{m.failureReason ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-2.5 text-[11.5px] text-muted-foreground">
          Showing {filtered.length.toLocaleString()} of {messages.length.toLocaleString()} messages
        </div>
      </div>
    </Section>
  );
}
