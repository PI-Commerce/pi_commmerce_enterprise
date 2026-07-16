/**
 * Business Analytics — the top slice of the /analytics page.
 *
 * Renders the KPIs + charts pack for the campaign's `useCase`. Different
 * BFSI use cases (Personal Loan Collections, Insurance Renewal, Credit Card
 * Dues, ...) contribute different packs from lib/business-analytics.ts. If
 * the campaign has no useCase or the pack is empty, we render a small hint
 * so the empty state is legible instead of blank.
 */

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "@/components/analytics/EChart";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { analyticsFor, type BusinessAnalyticsPack, type FunnelStage, type DonutSlice, type StackedBar } from "@/lib/business-analytics";
import { USE_CASE_LABEL, USE_CASE_TINT, type UseCase } from "@/lib/campaign-types";

export function BusinessAnalyticsPanel({ useCase }: { useCase?: UseCase }) {
  const pack = analyticsFor(useCase);

  // No useCase → generic hint (Business Analytics is verticalized).
  if (!useCase) {
    return (
      <div className="mb-5 rounded-xl border border-dashed border-border bg-card/40 px-4 py-4 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">Business Analytics</span> renders per-campaign, driven by its BFSI use case (Collections, Renewal, Cards Dues, …). This campaign has no use case set — Campaign Analytics below is still available.
      </div>
    );
  }
  // useCase set but no pack seeded yet → "coming soon" chip.
  if (!pack || !pack.kpis?.length) {
    return (
      <div className="mb-5 rounded-xl border border-dashed border-border bg-card/40 px-4 py-4 text-[12px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide", USE_CASE_TINT[useCase])}>
            <Sparkles className="h-2.5 w-2.5 mr-1" />
            {USE_CASE_LABEL[useCase]}
          </span>
          <span>pack is scaffolded — KPIs + charts land in the next drop.</span>
        </div>
      </div>
    );
  }
  return (
    <TooltipProvider>
      <div className="mb-6">
        <PackHeader useCase={useCase} pack={pack} />
        <KpiGrid kpis={pack.kpis} />
        <ChartRows pack={pack} />
      </div>
    </TooltipProvider>
  );
}

/* ---- Header + book summary ---- */

function PackHeader({ useCase, pack }: { useCase: UseCase; pack: BusinessAnalyticsPack }) {
  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Business Analytics</h2>
        <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide", USE_CASE_TINT[useCase])}>
          <Sparkles className="h-2.5 w-2.5 mr-1" />
          {USE_CASE_LABEL[useCase]}
        </span>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
        {pack.bookSummary.map((s, i) => (
          <div key={i} className="flex items-center gap-4">
            {i > 0 && <span className="h-6 w-px bg-border" />}
            <div>
              <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className="mt-0.5 text-[16px] font-semibold tabular-nums">{s.value}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---- KPI cards ---- */

function KpiGrid({ kpis }: { kpis: BusinessAnalyticsPack["kpis"] }) {
  return (
    <div className="mb-5 grid grid-cols-3 gap-3">
      {kpis.map((k, i) => (
        <div key={i} className="rounded-xl border border-border bg-card px-4 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.label}</p>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <button type="button" aria-label={`About ${k.label}`} className="-mr-1 -mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground">
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-[11px] leading-snug">{k.info}</TooltipContent>
            </Tooltip>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{k.value}</p>
            <p className="text-[12px] text-muted-foreground">{k.unit}</p>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{k.timeframe}</p>
        </div>
      ))}
    </div>
  );
}

/* ---- Charts (funnel + stacked bar + donuts) ---- */

function ChartRows({ pack }: { pack: BusinessAnalyticsPack }) {
  const funnelOption = useMemo<EChartsOption | undefined>(
    () => pack.funnel ? funnelBarOption(pack.funnel.stages, pack.funnel.tint) : undefined,
    [pack.funnel],
  );
  const barOption = useMemo<EChartsOption | undefined>(
    () => pack.stackedBar ? stackedBarOption(pack.stackedBar.data) : undefined,
    [pack.stackedBar],
  );
  const donutAOption = useMemo<EChartsOption | undefined>(
    () => pack.donutA ? donutOption(pack.donutA.slices, "outside") : undefined,
    [pack.donutA],
  );
  const donutBOption = useMemo<EChartsOption | undefined>(
    () => pack.donutB ? donutOption(pack.donutB.slices, "legend") : undefined,
    [pack.donutB],
  );
  const donutCOption = useMemo<EChartsOption | undefined>(
    () => pack.donutC ? donutOption(pack.donutC.slices, "outside") : undefined,
    [pack.donutC],
  );
  return (
    <>
      {(pack.funnel || pack.stackedBar) && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          {pack.funnel && funnelOption && (
            <ChartCard title={pack.funnel.title} subtitle={pack.funnel.subtitle}>
              <EChart option={funnelOption} style={{ height: 220 }} />
            </ChartCard>
          )}
          {pack.stackedBar && barOption && (
            <ChartCard title={pack.stackedBar.title} subtitle={pack.stackedBar.subtitle}>
              <EChart option={barOption} style={{ height: 220 }} />
            </ChartCard>
          )}
        </div>
      )}
      {(pack.donutA || pack.donutB) && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          {pack.donutA && donutAOption && (
            <ChartCard title={pack.donutA.title} subtitle={pack.donutA.subtitle}>
              <EChart option={donutAOption} style={{ height: 220 }} />
            </ChartCard>
          )}
          {pack.donutB && donutBOption && (
            <ChartCard title={pack.donutB.title} subtitle={pack.donutB.subtitle}>
              <EChart option={donutBOption} style={{ height: 220 }} />
            </ChartCard>
          )}
        </div>
      )}
      {pack.donutC && donutCOption && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <ChartCard title={pack.donutC.title} subtitle={pack.donutC.subtitle}>
            <EChart option={donutCOption} style={{ height: 200 }} />
          </ChartCard>
          <div className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-6">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Coming soon</p>
            <p className="mt-1 text-[13px]">Cohort · day-over-day · channel-effectiveness drill-downs land next.</p>
          </div>
        </div>
      )}
    </>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/* ---- ECharts option builders (declarative → chart) ---- */

function funnelBarOption(stages: FunnelStage[], tint = "#22c55e"): EChartsOption {
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 100, right: 30, top: 12, bottom: 24 },
    xAxis: { type: "value", axisLabel: { color: "#94a3b8", fontSize: 10 }, splitLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } } },
    yAxis: {
      type: "category",
      data: stages.map((f) => f.stage).reverse(),
      axisLabel: { color: "#e2e8f0", fontSize: 11 },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: [{
      type: "bar",
      data: stages.map((f) => f.value).reverse(),
      itemStyle: { color: tint, borderRadius: [0, 6, 6, 0] },
      barMaxWidth: 24,
      label: { show: true, position: "right", color: "#94a3b8", fontSize: 10.5, formatter: "{c}" },
    }],
  };
}

function stackedBarOption(bar: StackedBar): EChartsOption {
  const isRupees = bar.yFormatter === "rupees_lakhs";
  return {
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      valueFormatter: (v) => isRupees ? `₹${(Number(v) / 100000).toFixed(1)}L` : String(v),
    },
    legend: { data: bar.series.map((s) => s.name), textStyle: { color: "#94a3b8", fontSize: 10.5 }, top: 0 },
    grid: { left: 60, right: 20, top: 30, bottom: 30 },
    xAxis: { type: "category", data: bar.buckets, axisLabel: { color: "#94a3b8", fontSize: 10.5 } },
    yAxis: {
      type: "value",
      axisLabel: { color: "#94a3b8", fontSize: 10, formatter: (v: number) => isRupees ? `₹${(v/100000).toFixed(0)}L` : String(v) },
      splitLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } },
    },
    series: bar.series.map((s) => ({
      name: s.name, type: "bar", stack: "s", data: s.data,
      itemStyle: { color: s.tint }, barMaxWidth: 40,
    })),
  };
}

function donutOption(slices: DonutSlice[], labelMode: "outside" | "legend"): EChartsOption {
  const base: EChartsOption = {
    tooltip: { trigger: "item", formatter: "{b}<br/>{c} · {d}%" },
    series: [{
      type: "pie",
      radius: labelMode === "outside" ? ["50%", "76%"] : ["45%", "78%"],
      center: labelMode === "outside" ? ["50%", "55%"] : ["32%", "50%"],
      avoidLabelOverlap: false,
      itemStyle: { borderColor: "hsl(var(--card))", borderWidth: 2 },
      label: labelMode === "outside"
        ? { position: "outside", color: "#94a3b8", fontSize: 10.5, formatter: "{b}\n{d}%" }
        : { show: false },
      labelLine: labelMode === "outside" ? { length: 6, length2: 8, lineStyle: { color: "rgba(148,163,184,0.4)" } } : { show: false },
      data: slices.map((s) => ({ value: s.value, name: s.name, itemStyle: { color: s.tint } })),
    }],
  };
  if (labelMode === "legend") {
    base.legend = { orient: "vertical", right: 10, top: "middle", textStyle: { color: "#94a3b8", fontSize: 10.5 }, itemHeight: 8, itemWidth: 8 };
  }
  return base;
}
