/**
 * Business Analytics — the top slice of the /analytics page.
 *
 * v1 scope (per FinServ v1 doc):
 *   - 4 KPI cards
 *   - PTP Funnel (captured / kept / broken)
 *   - Recovery Analytics: recovery rate, recovery cycle, channel effectiveness
 *
 * The pack is chosen by the selected campaign's useCase. Only
 * personal_loan_collections is seeded in v1; every other useCase renders a
 * "scope: TBD" hint so the platform-level extension point is visible.
 */

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "@/components/analytics/EChart";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { analyticsFor, type BusinessAnalyticsPack, type FunnelStage, type RecoveryAnalytics } from "@/lib/business-analytics";
import { USE_CASE_LABEL, USE_CASE_TINT, type UseCase } from "@/lib/campaign-types";

export function BusinessAnalyticsPanel({ useCase }: { useCase?: UseCase }) {
  const pack = analyticsFor(useCase);

  if (!useCase) {
    return (
      <div className="mb-5 rounded-xl border border-dashed border-border bg-card/40 px-4 py-4 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">Business Analytics</span> renders per-campaign, driven by its BFSI use case. This campaign has no use case set — Campaign Analytics below is still available.
      </div>
    );
  }
  if (!pack || !pack.kpis?.length) {
    return (
      <div className="mb-5 rounded-xl border border-dashed border-border bg-card/40 px-4 py-4 text-[12px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide", USE_CASE_TINT[useCase])}>
            <Sparkles className="h-2.5 w-2.5 mr-1" />
            {USE_CASE_LABEL[useCase]}
          </span>
          <span>· Business Analytics pack is scope: TBD for v1.</span>
        </div>
      </div>
    );
  }
  return (
    <TooltipProvider>
      <div className="mb-6">
        <PackHeader useCase={useCase} />
        <KpiGrid kpis={pack.kpis} />
        <ChartRows pack={pack} />
      </div>
    </TooltipProvider>
  );
}

function PackHeader({ useCase }: { useCase: UseCase }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Business Analytics</h2>
      <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide", USE_CASE_TINT[useCase])}>
        <Sparkles className="h-2.5 w-2.5 mr-1" />
        {USE_CASE_LABEL[useCase]}
      </span>
    </div>
  );
}

function KpiGrid({ kpis }: { kpis: BusinessAnalyticsPack["kpis"] }) {
  return (
    <div className="mb-5 grid grid-cols-4 gap-3">
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
              <TooltipContent side="top" className="max-w-[240px] text-[11px] leading-snug">{k.info}</TooltipContent>
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

function ChartRows({ pack }: { pack: BusinessAnalyticsPack }) {
  const funnelOption = useMemo<EChartsOption | undefined>(
    () => pack.ptpFunnel ? funnelBarOption(pack.ptpFunnel.stages, pack.ptpFunnel.tint) : undefined,
    [pack.ptpFunnel],
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      {pack.ptpFunnel && funnelOption && (
        <ChartCard title={pack.ptpFunnel.title} subtitle={pack.ptpFunnel.subtitle}>
          <EChart option={funnelOption} style={{ height: 240 }} />
        </ChartCard>
      )}
      {pack.recoveryAnalytics && (
        <RecoveryCard title={pack.recoveryAnalytics.title} subtitle={pack.recoveryAnalytics.subtitle} data={pack.recoveryAnalytics.data} />
      )}
    </div>
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

/** Recovery Analytics card — two numeric cells (rate + cycle) side-by-side,
 *  then a small horizontal-bar breakdown of ₹ recovered per channel. Keeps the
 *  card content matching the sibling PTP Funnel card in visual weight. */
function RecoveryCard({ title, subtitle, data }: { title: string; subtitle?: string; data: RecoveryAnalytics }) {
  const channelBarOption = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => `₹${(Number(v) / 100000).toFixed(1)}L` },
    grid: { left: 78, right: 24, top: 4, bottom: 8 },
    xAxis: {
      type: "value",
      axisLabel: { color: "#94a3b8", fontSize: 10, formatter: (v: number) => `₹${(v/100000).toFixed(0)}L` },
      splitLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } },
    },
    yAxis: {
      type: "category",
      data: data.channelEffectiveness.map((c) => c.channel).reverse(),
      axisLabel: { color: "#e2e8f0", fontSize: 11 },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: [{
      type: "bar",
      data: data.channelEffectiveness.map((c) => ({ value: c.recovered, itemStyle: { color: c.tint } })).reverse(),
      barMaxWidth: 18,
      label: { show: true, position: "right", color: "#94a3b8", fontSize: 10.5, formatter: (p) => `₹${(Number(p.value) / 100000).toFixed(1)}L` },
      itemStyle: { borderRadius: [0, 4, 4, 0] },
    }],
  }), [data]);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
          <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Recovery rate</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{data.recoveryRate.pct}%</p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">{data.recoveryRate.recovered.toLocaleString()} / {data.recoveryRate.totalLeads.toLocaleString()} leads</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
          <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Recovery cycle</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{data.recoveryCycle.medianDays}d</p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">median · n={data.recoveryCycle.sampleSize.toLocaleString()}</p>
        </div>
      </div>
      <p className="mt-3 mb-1 text-[11px] font-medium text-muted-foreground">Channel effectiveness · ₹ recovered</p>
      <EChart option={channelBarOption} style={{ height: 138 }} />
    </div>
  );
}

function funnelBarOption(stages: FunnelStage[], tint = "#22c55e"): EChartsOption {
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 100, right: 30, top: 20, bottom: 24 },
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
      barMaxWidth: 26,
      label: { show: true, position: "right", color: "#94a3b8", fontSize: 10.5, formatter: "{c}" },
    }],
  };
}
