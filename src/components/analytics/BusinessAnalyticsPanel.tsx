/**
 * Business Analytics — the top slice of the /analytics page.
 *
 * v1 scope (per FinServ v1 doc):
 *   - 4 KPI cards
 *   - PTP Funnel card
 *   - Recovery Analytics: 3 SEPARATE cards (Rate · Cycle · Channel Effectiveness)
 *
 * The pack is chosen by the selected campaign's useCase. Only
 * `collections` is seeded in v1; every other useCase renders a
 * "scope: TBD" hint so the platform-level extension point is visible.
 *
 * Explanations use ONLY the small "i" info button next to each figure — no
 * banners, no dot-chained subtitles, no variable syntax in copy. The ICP is
 * a non-technical business user.
 */

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "@/components/analytics/EChart";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { analyticsFor, type BusinessAnalyticsPack, type FunnelStage, type ChannelEffectivenessRow } from "@/lib/business-analytics";
import { PRODUCT_LABEL, USE_CASE_TINT_SOLID, type UseCase, type Product } from "@/lib/campaign-types";

export function BusinessAnalyticsPanel({ useCase, product }: { useCase?: UseCase; product?: Product }) {
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
          {product && (
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide", USE_CASE_TINT_SOLID[useCase])}>
              {PRODUCT_LABEL[product]}
            </span>
          )}
          <span>· Business Analytics pack is scope: TBD for v1.</span>
        </div>
      </div>
    );
  }
  return (
    <TooltipProvider>
      <div className="mb-6">
        <PackHeader useCase={useCase} product={product} />
        <KpiGrid kpis={pack.kpis} />
        <ChartGrid pack={pack} />
      </div>
    </TooltipProvider>
  );
}

function PackHeader({ useCase, product }: { useCase: UseCase; product?: Product }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Business Analytics</h2>
      {product && (
        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide", USE_CASE_TINT_SOLID[useCase])}>
          {PRODUCT_LABEL[product]}
        </span>
      )}
    </div>
  );
}

/* ----------------------------- KPI cards ----------------------------- */

function KpiGrid({ kpis }: { kpis: BusinessAnalyticsPack["kpis"] }) {
  return (
    <div className="mb-5 grid grid-cols-5 gap-3">
      {kpis.map((k, i) => {
        const isEscalation = k.label === "Human Escalation";
        return (
          <div key={i} className={cn(
            "rounded-xl border bg-card px-4 py-3.5",
            isEscalation ? "border-warning/40" : "border-border",
          )}>
            <div className="flex items-start justify-between gap-2">
              <p className={cn(
                "text-[11px] uppercase tracking-wider",
                isEscalation ? "text-warning" : "text-muted-foreground",
              )}>{k.label}</p>
              <InfoDot label={k.label} text={k.info} />
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <p className="text-2xl font-semibold tracking-tight tabular-nums">{k.value}</p>
              {k.unit && <p className="text-[12px] text-muted-foreground">{k.unit}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------- Chart grid ----------------------------- *
 * Row 1: PTP Funnel + Recovery Rate (small) side by side.
 * Row 2: Recovery Cycle (small) + Channel Effectiveness (bar).
 * Every card carries its own info dot; no shared banner.
 */
function ChartGrid({ pack }: { pack: BusinessAnalyticsPack }) {
  const funnelOption = useMemo<EChartsOption | undefined>(
    () => pack.ptpFunnel ? funnelBarOption(pack.ptpFunnel.stages, pack.ptpFunnel.tint) : undefined,
    [pack.ptpFunnel],
  );
  return (
    <div className="space-y-3">
      {/* Row 1 — PTP Funnel · Recovery Rate · Recovery Cycle */}
      <div className="grid grid-cols-4 gap-3">
        {pack.ptpFunnel && funnelOption && (
          <CardShell title={pack.ptpFunnel.title} info={pack.ptpFunnel.info} className="col-span-2">
            <EChart option={funnelOption} style={{ height: 200 }} />
          </CardShell>
        )}
        {pack.recoveryRate && (
          <CardShell title={pack.recoveryRate.title} info={pack.recoveryRate.info}>
            <div className="flex h-[200px] flex-col justify-center">
              <p className="text-4xl font-semibold tabular-nums">{pack.recoveryRate.pct}<span className="text-2xl text-muted-foreground">%</span></p>
              <p className="mt-2 text-[12px] text-muted-foreground">{pack.recoveryRate.recovered.toLocaleString()} of {pack.recoveryRate.totalLeads.toLocaleString()} leads recovered</p>
            </div>
          </CardShell>
        )}
        {pack.recoveryCycle && (
          <CardShell title={pack.recoveryCycle.title} info={pack.recoveryCycle.info}>
            <div className="flex h-[200px] flex-col justify-center">
              <p className="text-4xl font-semibold tabular-nums">{pack.recoveryCycle.medianDays}<span className="text-2xl text-muted-foreground">d</span></p>
              <p className="mt-2 text-[12px] text-muted-foreground">median across {pack.recoveryCycle.sampleSize.toLocaleString()} recovered leads</p>
            </div>
          </CardShell>
        )}
      </div>
      {/* Row 2 — Channel Effectiveness (full-width bar) */}
      {pack.channelEffectiveness && (
        <ChannelCard title={pack.channelEffectiveness.title} info={pack.channelEffectiveness.info} rows={pack.channelEffectiveness.rows} />
      )}
    </div>
  );
}

function CardShell({ title, info, children, className }: { title: string; info: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <InfoDot label={title} text={info} />
      </div>
      {children}
    </div>
  );
}

function ChannelCard({ title, info, rows }: { title: string; info: string; rows: ChannelEffectivenessRow[] }) {
  const option = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => `₹${(Number(v) / 100000).toFixed(1)}L` },
    grid: { left: 90, right: 40, top: 8, bottom: 12 },
    xAxis: {
      type: "value",
      axisLabel: { color: "#94a3b8", fontSize: 10, formatter: (v: number) => `₹${(v/100000).toFixed(0)}L` },
      splitLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } },
    },
    yAxis: {
      type: "category",
      data: rows.map((r) => r.channel).reverse(),
      axisLabel: { color: "#e2e8f0", fontSize: 11 },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: [{
      type: "bar",
      data: rows.map((r) => ({ value: r.recovered, itemStyle: { color: r.tint } })).reverse(),
      barMaxWidth: 22,
      label: { show: true, position: "right", color: "#94a3b8", fontSize: 10.5, formatter: (p) => `₹${(Number(p.value) / 100000).toFixed(1)}L` },
      itemStyle: { borderRadius: [0, 4, 4, 0] },
    }],
  }), [rows]);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <InfoDot label={title} text={info} />
      </div>
      <EChart option={option} style={{ height: 180 }} />
    </div>
  );
}

/* Shared info dot — the ONE explanation affordance. Standard across products. */
function InfoDot({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip delayDuration={100}>
      <TooltipTrigger asChild>
        <button type="button" aria-label={`About ${label}`} className="-mr-1 -mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground">
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-[11px] leading-snug">{text}</TooltipContent>
    </Tooltip>
  );
}

function funnelBarOption(stages: FunnelStage[], tint = "#22c55e"): EChartsOption {
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 100, right: 30, top: 12, bottom: 20 },
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
