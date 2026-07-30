import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import {
  Send, CheckCircle2, Eye, XCircle,
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
import { templateButtons, type RcsTemplate } from "@/lib/rcs-templates";

/**
 * Channel → RCS. A bespoke view rather than the generic `ChannelDetail`, for
 * reasons specific to RCS (PICOM-4728):
 *
 *  - **delivery and engagement are different layers.** Delivered / Failed / Not
 *    reachable / Timed out are mutually exclusive delivery states (a donut that
 *    sums to Sent); Read and Clicked are *nested* engagement stages inside
 *    Delivered, so they render as a funnel, never as peers in the same pie.
 *  - **the report is per-recipient**, with columns the shared leads table doesn't
 *    carry (sending agent + provider, the full sent→delivered→read→clicked
 *    lifecycle timestamps, the button clicked).
 *  - **RCS is interactive.** RCS reports a click callback for every suggestion
 *    button, so button-click attribution is a first-class chart — but only
 *    meaningful at the level of a single template that actually carries buttons.
 */
export function RcsChannelView({ refs }: { refs: RcsRef[] }) {
  // Outcome tiles are derived from each node's real `entered` volume via the
  // shared delivery rates — NOT counted off the 120-message sample, which would
  // make the tiles swing on sampling luck and disagree with the campaign Sankey.
  const totalSent = refs.reduce((s, { node }) => s + node.entered, 0);
  const { delivered, read, failed } = rcsOutcomeTotals(totalSent);
  const deliveryRate = totalSent > 0 ? (delivered / totalSent) * 100 : 0;
  const readRate = delivered > 0 ? (read / delivered) * 100 : 0;

  // Button-click attribution is only meaningful when the scope resolves to a
  // single template AND that template carries buttons — attributing clicks
  // across a mix of templates (some without buttons) is meaningless.
  const clickTemplate = useMemo(() => {
    const byId = new Map<string, RcsTemplate>();
    for (const ref of refs) {
      const t = templateForNode(ref.node);
      if (t) byId.set(t.id, t);
    }
    const all = [...byId.values()];
    return all.length === 1 && templateButtons(all[0]).length > 0 ? all[0] : undefined;
  }, [refs]);

  return (
    <div className="space-y-6">
      <Section title="Delivery performance" sub="Every RCS node in the selected scope.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={Send} label="Sent" value={totalSent.toLocaleString()} sub="Messages submitted to the provider" />
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
            sub={totalSent > 0 ? `${((failed / totalSent) * 100).toFixed(1)}% of sent · incl. not RCS-capable` : "—"}
            tone="negative"
          />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <OutcomeSplit totalSent={totalSent} />
        <EngagementFunnel totalSent={totalSent} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FailureReasons totalFailed={failed} />
        <TemplateComparison refs={refs} />
      </div>

      {clickTemplate && (
        <ClickAttribution template={clickTemplate} totalSent={totalSent} />
      )}

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
  read: "#6366f1",
  clicked: "#8b5cf6",
  failed: "#ef4444",
  timeout: "#94a3b8",
} as const;

/**
 * Delivery-outcome split — the delivery *layer* only. Delivered / Failed / Not
 * reachable / Timed out are mutually exclusive and sum to Sent, so a donut is
 * the right construct. Read and Clicked are deliberately absent: they are nested
 * *inside* Delivered (a clicked message was also delivered), so putting them in
 * the same pie would double-count. Engagement lives in the funnel beside this.
 */
function OutcomeSplit({ totalSent }: { totalSent: number }) {
  const { delivered, failed, timeout } = rcsOutcomeTotals(totalSent);
  const data = [
    { name: "Delivered", value: delivered, color: OUTCOME_COLOR.delivered },
    { name: "Failed", value: failed, color: OUTCOME_COLOR.failed },
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
    <Card title="Delivery outcomes" sub="Mutually exclusive delivery states — they sum to Sent.">
      <div className="h-[280px]">
        {data.length === 0 ? <Empty hint="No messages in scope." /> : <EChart option={option} />}
      </div>
    </Card>
  );
}

/**
 * Engagement funnel. Sent ⊇ Delivered ⊇ Read ⊇ Clicked — each stage is a strict
 * subset of the one above it, which is exactly what a funnel expresses (and what
 * the delivery-outcome donut deliberately doesn't). This is where Read and
 * Clicked belong, not in a mutually-exclusive pie.
 */
function EngagementFunnel({ totalSent }: { totalSent: number }) {
  const option = useMemo<EChartsOption>(() => {
    const { delivered, read, clicked } = rcsOutcomeTotals(totalSent);
    const stages = [
      { name: "Sent", value: totalSent, color: "#0ea5e9" },
      { name: "Delivered", value: delivered, color: OUTCOME_COLOR.delivered },
      { name: "Read", value: read, color: OUTCOME_COLOR.read },
      { name: "Clicked", value: clicked, color: OUTCOME_COLOR.clicked },
    ];
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        formatter: (p: unknown) => {
          const q = p as { name: string; value: number };
          const pct = totalSent > 0 ? ((q.value / totalSent) * 100).toFixed(1) : "0";
          return `${q.name}<br/><b>${q.value.toLocaleString()}</b> (${pct}% of Sent)`;
        },
      },
      legend: { bottom: 0, itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 11 } },
      series: [
        {
          type: "funnel",
          top: 12,
          bottom: 36,
          left: "8%",
          right: "8%",
          min: 0,
          max: totalSent || 1,
          minSize: "24%",
          maxSize: "100%",
          sort: "descending",
          gap: 2,
          label: {
            show: true,
            position: "inside",
            fontSize: 11,
            color: "#fff",
            formatter: (p: unknown) => {
              const q = p as { name: string; value: number };
              return `${q.name}  ${q.value.toLocaleString()}`;
            },
          },
          labelLine: { show: false },
          itemStyle: { borderColor: "transparent", borderWidth: 0 },
          data: stages.map((s) => ({
            name: s.name,
            value: s.value,
            itemStyle: { color: s.color },
          })),
        },
      ],
    };
  }, [totalSent]);

  return (
    <Card title="Engagement funnel" sub="Nested stages — each is a subset of the one above it.">
      <div className="h-[280px]">
        {totalSent === 0 ? <Empty hint="No messages in scope." /> : <EChart option={option} />}
      </div>
    </Card>
  );
}

/**
 * Button-click attribution — RCS-specific. Only rendered by the parent when the
 * scope is a single template that carries buttons, so this is genuine per-
 * template attribution (never a meaningless mix across templates). RCS reports a
 * click for every suggestion type, so all buttons appear here. Splits the
 * template's total clicks across its buttons with a deterministic per-button
 * weight, so the shape looks organic rather than perfectly uniform.
 */
function ClickAttribution({ template, totalSent }: { template: RcsTemplate; totalSent: number }) {
  const rows = useMemo(() => {
    const { clicked } = rcsOutcomeTotals(totalSent);
    const buttons = templateButtons(template);
    if (buttons.length === 0) return [];
    // Deterministic weight per button (1.00–1.49) so the split isn't uniform but
    // is stable across renders — keyed off the button text, no RNG.
    const weightOf = (text: string) => {
      let h = 0;
      for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
      return 1 + (h % 50) / 100;
    };
    const weights = buttons.map((b) => weightOf(b.text));
    const sum = weights.reduce((a, c) => a + c, 0) || 1;
    return buttons
      .map((b, i) => ({ text: b.text, count: Math.round((clicked * weights[i]) / sum) }))
      .filter((r) => r.count > 0)
      .sort((a, b) => a.count - b.count);
  }, [template, totalSent]);

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
          itemStyle: { color: OUTCOME_COLOR.clicked, borderRadius: [0, 3, 3, 0] },
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
    <Card
      title="Button-click attribution"
      sub={`Clicks on each suggestion button on "${template.name}".`}
    >
      <div className="h-[240px]">
        {rows.length === 0 ? (
          <Empty hint="No clicks attributed in scope." />
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
  Clicked: "bg-primary/10 text-primary",
  Failed: "bg-destructive/10 text-destructive",
  "Timed out": "bg-secondary text-muted-foreground",
};

const STATUS_FILTERS: RcsStatus[] = [
  "Delivered",
  "Read",
  "Clicked",
  "Failed",
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
          !`${m.phone} ${m.templateName} ${m.agentName}`.toLowerCase().includes(q.toLowerCase())
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
              placeholder="Search number, template or agent…"
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
                <th className="px-4 py-2 font-medium">Template / Agent</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Button</th>
                <th className="px-4 py-2 font-medium">Sent</th>
                <th className="px-4 py-2 font-medium">Delivered</th>
                <th className="px-4 py-2 font-medium">Read</th>
                <th className="px-4 py-2 font-medium">Clicked</th>
                <th className="px-4 py-2 font-medium">Failure reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
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
                        {m.agentName}{m.provider !== "—" ? ` · ${m.provider}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("whitespace-nowrap rounded-md px-2 py-0.5 text-[10.5px] font-medium", STATUS_TONE[m.status])}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[11.5px] text-muted-foreground">
                      {m.clickedButton ? (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-medium text-primary">
                          {m.clickedButton}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-muted-foreground">{m.sentAt}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-muted-foreground">{m.deliveredAt ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-muted-foreground">{m.readAt ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-muted-foreground">{m.clickedAt ?? "—"}</td>
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
