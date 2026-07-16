import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { EChart } from "@/components/analytics/EChart";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import {
  COLLECTIONS_KPIS,
  PTP_FUNNEL,
  RECOVERY_BY_DPD,
  RECOVERY_BY_CHANNEL,
  DISPOSITION_MIX,
  AI_VS_HUMAN,
  BOOK_SUMMARY,
} from "@/lib/collections-analytics";
import type { EChartsOption } from "echarts";

export const Route = createFileRoute("/collections/")({
  component: CollectionsDashboard,
  head: () => ({ meta: [{ title: "Collections · Pi Agents FinServ" }] }),
});

function CollectionsDashboard() {
  const ptpFunnelOption = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 90, right: 24, top: 12, bottom: 24 },
    xAxis: { type: "value", axisLabel: { color: "#94a3b8", fontSize: 10 }, splitLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } } },
    yAxis: {
      type: "category",
      data: PTP_FUNNEL.map((f) => f.stage).reverse(),
      axisLabel: { color: "#e2e8f0", fontSize: 11 },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: [{
      type: "bar",
      data: PTP_FUNNEL.map((f) => f.value).reverse(),
      itemStyle: { color: "#22c55e", borderRadius: [0, 6, 6, 0] },
      barMaxWidth: 24,
      label: { show: true, position: "right", color: "#94a3b8", fontSize: 10.5, formatter: "{c}" },
    }],
  }), []);

  const recoveryByDpdOption = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: any) => `₹${(Number(v) / 100000).toFixed(1)}L` },
    legend: { data: ["WhatsApp", "Voice AI", "SMS"], textStyle: { color: "#94a3b8", fontSize: 10.5 }, top: 0 },
    grid: { left: 60, right: 20, top: 30, bottom: 30 },
    xAxis: { type: "category", data: RECOVERY_BY_DPD.map((r) => r.bucket), axisLabel: { color: "#94a3b8", fontSize: 10.5 } },
    yAxis: { type: "value", axisLabel: { color: "#94a3b8", fontSize: 10, formatter: (v: number) => `₹${(v/100000).toFixed(0)}L` }, splitLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } } },
    series: [
      { name: "WhatsApp", type: "bar", stack: "recovery", data: RECOVERY_BY_DPD.map((r) => r.whatsapp), itemStyle: { color: "#22c55e" }, barMaxWidth: 40 },
      { name: "Voice AI", type: "bar", stack: "recovery", data: RECOVERY_BY_DPD.map((r) => r.voice),    itemStyle: { color: "#a78bfa" }, barMaxWidth: 40 },
      { name: "SMS",      type: "bar", stack: "recovery", data: RECOVERY_BY_DPD.map((r) => r.sms),      itemStyle: { color: "#f59e0b" }, barMaxWidth: 40 },
    ],
  }), []);

  const donutRecovery = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: "item", formatter: "{b}<br/>₹{c} · {d}%" },
    legend: { orient: "vertical", right: 10, top: "center", textStyle: { color: "#94a3b8", fontSize: 10.5 } },
    series: [{
      type: "pie",
      radius: ["55%", "80%"], center: ["35%", "50%"],
      avoidLabelOverlap: false,
      itemStyle: { borderColor: "hsl(var(--card))", borderWidth: 2 },
      label: { show: false }, labelLine: { show: false },
      data: RECOVERY_BY_CHANNEL.map((c) => ({ value: c.value, name: c.name, itemStyle: { color: c.tint } })),
    }],
  }), []);

  const donutDisposition = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: "item", formatter: "{b}<br/>{c} calls · {d}%" },
    legend: { orient: "vertical", right: 10, top: "middle", textStyle: { color: "#94a3b8", fontSize: 10.5 }, itemHeight: 8, itemWidth: 8 },
    series: [{
      type: "pie",
      radius: ["45%", "78%"], center: ["32%", "50%"],
      avoidLabelOverlap: false,
      itemStyle: { borderColor: "hsl(var(--card))", borderWidth: 2 },
      label: { show: false }, labelLine: { show: false },
      data: DISPOSITION_MIX.map((c) => ({ value: c.value, name: c.name, itemStyle: { color: c.tint } })),
    }],
  }), []);

  const donutAiHuman = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: "item", formatter: "{b}<br/>{c} interactions · {d}%" },
    series: [{
      type: "pie",
      radius: ["50%", "78%"], center: ["50%", "55%"],
      avoidLabelOverlap: false,
      itemStyle: { borderColor: "hsl(var(--card))", borderWidth: 2 },
      label: { position: "outside", color: "#94a3b8", fontSize: 10.5, formatter: "{b}\n{d}%" },
      labelLine: { length: 6, length2: 8, lineStyle: { color: "rgba(148,163,184,0.4)" } },
      data: AI_VS_HUMAN.map((c) => ({ value: c.value, name: c.name, itemStyle: { color: c.tint } })),
    }],
  }), []);

  return (
    <TooltipProvider>
      <AppShell>
        <PageHeader
          title="Collections dashboard"
          description="Business-outcome view for the FinServ Collections pack — RPC, PTP conversion, recovery and cost-to-collect across active campaigns."
        />

        {/* Book summary strip */}
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
          <BookPill label="Total outstanding" value={BOOK_SUMMARY.totalOutstanding} />
          <span className="h-6 w-px bg-border" />
          <BookPill label="Leads on book"      value={BOOK_SUMMARY.totalLeads.toLocaleString("en-IN")} />
          <span className="h-6 w-px bg-border" />
          <BookPill label="Active campaigns"   value={String(BOOK_SUMMARY.activeCampaigns)} />
        </div>

        {/* 6 KPI cards */}
        <div className="mb-5 grid grid-cols-3 gap-3">
          <Kpi label="Right-party contact rate"    value={String(COLLECTIONS_KPIS.rpcRate.value)}           unit={COLLECTIONS_KPIS.rpcRate.unit}          timeframe={COLLECTIONS_KPIS.rpcRate.timeframe}          info={COLLECTIONS_KPIS.rpcRate.info} />
          <Kpi label="PTP → recovered conversion"  value={String(COLLECTIONS_KPIS.ptpConversionRate.value)} unit={COLLECTIONS_KPIS.ptpConversionRate.unit} timeframe={COLLECTIONS_KPIS.ptpConversionRate.timeframe} info={COLLECTIONS_KPIS.ptpConversionRate.info} />
          <Kpi label="Cost to collect"             value={String(COLLECTIONS_KPIS.costToCollect.value)}     unit={COLLECTIONS_KPIS.costToCollect.unit}     timeframe={COLLECTIONS_KPIS.costToCollect.timeframe}     info={COLLECTIONS_KPIS.costToCollect.info} />
          <Kpi label="Recovery cycle"              value={String(COLLECTIONS_KPIS.recoveryCycle.value)}     unit={COLLECTIONS_KPIS.recoveryCycle.unit}     timeframe={COLLECTIONS_KPIS.recoveryCycle.timeframe}     info={COLLECTIONS_KPIS.recoveryCycle.info} />
          <Kpi label="Amount recovered"            value={String(COLLECTIONS_KPIS.amountRecovered.value)}   unit={COLLECTIONS_KPIS.amountRecovered.unit}   timeframe={COLLECTIONS_KPIS.amountRecovered.timeframe}   info={COLLECTIONS_KPIS.amountRecovered.info} />
          <Kpi label="Upcoming promises"           value={String(COLLECTIONS_KPIS.upcomingPromises.value)}  unit={COLLECTIONS_KPIS.upcomingPromises.unit}  timeframe={COLLECTIONS_KPIS.upcomingPromises.timeframe}  info={COLLECTIONS_KPIS.upcomingPromises.info} />
        </div>

        {/* Row 1: PTP funnel + Recovery by DPD */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <ChartCard title="PTP funnel" subtitle="Captured → kept → broken">
            <EChart option={ptpFunnelOption} style={{ height: 200 }} />
          </ChartCard>
          <ChartCard title="Recovery by DPD bucket" subtitle="₹ recovered · stacked by channel">
            <EChart option={recoveryByDpdOption} style={{ height: 200 }} />
          </ChartCard>
        </div>

        {/* Row 2: Recovery-by-channel donut + Disposition pie */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <ChartCard title="Recovery by channel" subtitle="Share of ₹ recovered">
            <EChart option={donutRecovery} style={{ height: 220 }} />
          </ChartCard>
          <ChartCard title="Disposition mix" subtitle="Voice-agent classifications">
            <EChart option={donutDisposition} style={{ height: 220 }} />
          </ChartCard>
        </div>

        {/* Row 3: AI vs human escalation */}
        <div className="grid grid-cols-2 gap-3">
          <ChartCard title="AI vs human escalation" subtitle="How many interactions the AI resolved end-to-end">
            <EChart option={donutAiHuman} style={{ height: 200 }} />
          </ChartCard>
          <div className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-6">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Coming soon</p>
            <p className="mt-1 text-[13px]">Cohort · day-over-day recovery rate · Channel-effectiveness by DPD bucket (drill-down)</p>
          </div>
        </div>
      </AppShell>
    </TooltipProvider>
  );
}

function BookPill({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[16px] font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Kpi({ label, value, unit, timeframe, info }: { label: string; value: string; unit: string; timeframe: string; info: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <button type="button" aria-label={`About ${label}`}
              className="-mr-1 -mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground">
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px] text-[11px] leading-snug">{info}</TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="text-[12px] text-muted-foreground">{unit}</p>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{timeframe}</p>
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
