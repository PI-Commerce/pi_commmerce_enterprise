import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import {
  Send, CheckCircle2, XCircle, Clock, Layers, Timer,
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
  buildSmsMessages, smsMessagesToCsv, templateForNode,
  failureBreakdown, smsOutcomeTotals,
  SMS_DELIVERY_RATES,
  type SmsRef, type SmsStatus,
} from "@/lib/analytics-sms";
import { templateSegments } from "@/lib/sms-templates";

/**
 * Channel → SMS. A bespoke view rather than the generic `ChannelDetail`, for
 * three reasons specific to SMS (PICOM-4726 §5):
 *
 *  - **the outcomes don't nest.** Delivered / Failed / DLR-not-received are the
 *    node's three mutually exclusive terminal states, so they render as a split,
 *    not as a funnel where each stage is a subset of the one above it.
 *  - **the report is per-recipient**, with columns the shared leads table
 *    doesn't carry (template name + id, three timestamps, failure reason,
 *    segment count).
 *  - **SMS is measured in segments.** A Unicode template consumes two segments
 *    per recipient, so message count and segment volume genuinely diverge and
 *    both need surfacing.
 */
export function SmsChannelView({ refs }: { refs: SmsRef[] }) {
  const messages = useMemo(() => refs.flatMap((ref) => buildSmsMessages(ref)), [refs]);

  // Outcome tiles are derived from the node's real `entered` volume via the
  // shared delivery rates — NOT counted off the 120-message sample, which would
  // make the Failed tile swing on sampling luck and disagree with the campaign
  // Sankey. The sample is used only for distributional detail (latency) and for
  // the message log itself.
  const totalSent = refs.reduce((s, { node }) => s + node.entered, 0);
  const { delivered, failed, noDlr } = smsOutcomeTotals(totalSent);
  const deliveryRate = totalSent > 0 ? (delivered / totalSent) * 100 : 0;

  // Segments per template: a 2-segment Unicode template consumes double per
  // recipient, which is exactly the divergence this tile exists to show. Hard
  // failures never reach the handset, so they consume nothing.
  const segments = useMemo(
    () =>
      refs.reduce((sum, { node }) => {
        const t = templateForNode(node);
        const segs = t ? templateSegments(t).segments : 1;
        const reached = Math.round(node.entered * (1 - SMS_DELIVERY_RATES.failed));
        return sum + reached * segs;
      }, 0),
    [refs],
  );

  const deliveredMsgs = messages.filter((m) => m.deliveryLatency != null);
  const avgLatency = deliveredMsgs.length
    ? Math.round(
        deliveredMsgs.reduce((s, m) => s + (m.deliveryLatency ?? 0), 0) / deliveredMsgs.length,
      )
    : 0;

  return (
    <div className="space-y-6">
      <Section title="Delivery performance" sub="Every SMS node in the selected scope.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi icon={Send} label="Sent" value={totalSent.toLocaleString()} sub="Messages submitted to the operator" />
          <Kpi
            icon={CheckCircle2}
            label="Delivered"
            value={delivered.toLocaleString()}
            sub={`${deliveryRate.toFixed(1)}% delivery rate`}
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
            icon={Clock}
            label="No DLR in window"
            value={noDlr.toLocaleString()}
            sub="Wait window closed with no receipt"
          />
          <Kpi
            icon={Layers}
            label="Segments"
            value={segments.toLocaleString()}
            sub={
              totalSent > 0
                ? `${(segments / totalSent).toFixed(2)} SMS parts per message`
                : "Total SMS parts sent"
            }
          />
          <Kpi
            icon={Timer}
            label="Avg time to delivery"
            value={avgLatency > 0 ? `${avgLatency}s` : "—"}
            sub="Submission to delivery receipt"
          />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <OutcomeSplit delivered={delivered} failed={failed} noDlr={noDlr} />
        <FailureReasons totalFailed={failed} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DayWise delivered={delivered} failed={failed} sent={totalSent} />
        <TemplateComparison refs={refs} />
      </div>

      <MessagesTable refs={refs} />
    </div>
  );
}

/* ───────── KPI ───────── */

function Kpi({ icon: Icon, label, value, sub, tone = "neutral" }: {
  icon: LucideIcon; label: string; value: string; sub: string;
  tone?: "neutral" | "positive" | "negative";
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
  failed: "#ef4444",
  noDlr: "#f59e0b",
  inFlight: "#94a3b8",
} as const;

/**
 * Terminal-outcome split. Deliberately a donut, not a funnel: these four states
 * are mutually exclusive and sum to Sent, so stacking them as a funnel would
 * imply Failed is a subset of Delivered.
 */
function OutcomeSplit({ delivered, failed, noDlr }: {
  delivered: number; failed: number; noDlr: number;
}) {
  const data = [
    { name: "Delivered", value: delivered, color: OUTCOME_COLOR.delivered },
    { name: "Failed", value: failed, color: OUTCOME_COLOR.failed },
    { name: "No DLR in window", value: noDlr, color: OUTCOME_COLOR.noDlr },
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

/** Why messages failed — required by §5's per-recipient failure reason. */
function FailureReasons({ totalFailed }: { totalFailed: number }) {
  const counts = useMemo(
    () => failureBreakdown(totalFailed).sort((a, b) => a.count - b.count),
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
    <Card title="Failure reasons" sub="Operator and vendor rejections across the selected scope.">
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

/** Day-wise Sent / Delivered / Failed, matching the ChannelDetail chart idiom. */
function DayWise({ sent, delivered, failed }: { sent: number; delivered: number; failed: number }) {
  const LAYERS = ["Sent", "Delivered", "Failed"] as const;
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
    const totals: Record<string, number> = { Sent: sent, Delivered: delivered, Failed: failed };
    const s = LAYERS.map((label, idx) => {
      const seed = totals[label] / Math.max(1, days);
      const values: number[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const wave = 0.78 + Math.sin((i + idx * 3 + 1) * 0.6) * 0.16 + Math.cos((i + idx) * 0.21) * 0.08;
        values.push(Math.max(0, Math.round(seed * wave)));
      }
      return { name: label as string, data: values };
    });
    return { dates: ds, series: s };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent, delivered, failed]);

  const LAYER_COLOR: Record<string, string> = {
    Sent: "#0ea5e9",
    Delivered: OUTCOME_COLOR.delivered,
    Failed: OUTCOME_COLOR.failed,
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
      // Layers nest (Sent ⊇ Delivered ⊇ Failed is false — Failed is disjoint from
      // Delivered — but both are subsets of Sent), so draw each on its own
      // baseline rather than stacking, same as the WhatsApp chart.
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

/** Delivery rate per DLT template in scope — the SMS analogue of the WhatsApp
 *  template comparison. Also surfaces each template's segment count. */
function TemplateComparison({ refs }: { refs: SmsRef[] }) {
  const rows = useMemo(() => {
    const byId = new Map<string, { name: string; sent: number; segments: number }>();
    for (const ref of refs) {
      const t = templateForNode(ref.node);
      if (!t) continue;
      const cur = byId.get(t.id) ?? {
        name: t.name,
        sent: 0,
        segments: templateSegments(t).segments,
      };
      cur.sent += ref.node.entered;
      byId.set(t.id, cur);
    }
    return [...byId.values()].sort((a, b) => a.sent - b.sent);
  }, [refs]);

  const option = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (p: unknown) => {
          const arr = p as { name: string; value: number; dataIndex: number }[];
          const row = rows[arr[0]?.dataIndex ?? 0];
          if (!row) return "";
          return `${row.name}<br/>Sent <b>${row.sent.toLocaleString()}</b><br/>Segments each <b>${row.segments}</b><br/>Total segments <b>${(row.sent * row.segments).toLocaleString()}</b>`;
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
          itemStyle: { color: "#f59e0b", borderRadius: [0, 3, 3, 0] },
          label: {
            show: true,
            position: "right",
            fontSize: 10,
            formatter: (p: unknown) => {
              const q = p as { dataIndex: number; value: number };
              const row = rows[q.dataIndex];
              return row && row.segments > 1
                ? `${q.value.toLocaleString()} · ${row.segments}seg`
                : q.value.toLocaleString();
            },
          },
        },
      ],
    }),
    [rows],
  );

  return (
    <Card title="Templates in scope" sub="Volume per DLT template, annotated where a template spans more than one segment.">
      <div className="h-[300px]">
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

/* ───────── Per-recipient table (PICOM-4726 §5) ───────── */

const STATUS_TONE: Record<SmsStatus, string> = {
  Delivered: "bg-success/10 text-success",
  Failed: "bg-destructive/10 text-destructive",
  "DLR not received": "bg-warning/10 text-warning",
  Sent: "bg-secondary text-muted-foreground",
};

const STATUS_FILTERS: SmsStatus[] = ["Delivered", "Failed", "DLR not received", "Sent"];

function MessagesTable({ refs }: { refs: SmsRef[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<SmsStatus | "any">("any");

  // Like the Voice calls table: the log shows the most recent run in scope, with
  // a banner when other runs are folded into the KPIs above.
  const tableRunId = refs[0]?.run.id;
  const tableRun = refs[0]?.run;
  const runCount = useMemo(() => new Set(refs.map((r) => r.run.id)).size, [refs]);
  const messages = useMemo(
    () => refs.filter((r) => r.run.id === tableRunId).flatMap((ref) => buildSmsMessages(ref)),
    [refs, tableRunId],
  );

  const filtered = useMemo(
    () =>
      messages.filter((m) => {
        if (q && !`${m.phone} ${m.customer} ${m.templateName}`.toLowerCase().includes(q.toLowerCase()))
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
              placeholder="Search number, name or template…"
              className="h-8 w-[260px] pl-7 text-xs"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as SmsStatus | "any")}>
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
            onClick={() => downloadCsv("sms-messages.csv", smsMessagesToCsv(filtered))}
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>

        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-card text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Recipient</th>
                <th className="px-4 py-2 font-medium">Template</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Sent</th>
                <th className="px-4 py-2 font-medium">Delivered</th>
                <th className="px-4 py-2 font-medium">Failed</th>
                <th className="px-4 py-2 font-medium">Failure reason</th>
                <th className="px-4 py-2 text-right font-medium">SMS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    No messages match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className="block font-mono text-[12px]">{m.phone}</span>
                      <span className="block text-[11px] text-muted-foreground">{m.customer}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="block">{m.templateName}</span>
                      <span className="block font-mono text-[10.5px] text-muted-foreground">{m.templateId}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("whitespace-nowrap rounded-md px-2 py-0.5 text-[10.5px] font-medium", STATUS_TONE[m.status])}>
                        {m.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-muted-foreground">{m.sentAt}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-muted-foreground">
                      {m.deliveredAt ?? "—"}
                      {m.deliveryLatency != null && (
                        <span className="ml-1 text-[10.5px] text-muted-foreground/70">+{m.deliveryLatency}s</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-muted-foreground">{m.failedAt ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[11.5px] text-muted-foreground">{m.failureReason ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px]">{m.smsCount}</td>
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
