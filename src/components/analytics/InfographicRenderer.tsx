/**
 * Client-side renderer for the Infographic spec Pi emits from `emit_answer`.
 *
 * No 3rd-party gen-UI SDK — Pi returns a shape-and-data spec, we translate it
 * to an ECharts option here. Same visual language as the rest of /analytics.
 */
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import type { Infographic } from "@/lib/server-fns/pi-analytics";

/** Palette lifted from the analytics page ECharts callers for visual continuity. */
const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export function InfographicRenderer({ spec }: { spec: Infographic }) {
  if (spec.kind === "kpi") return <KpiStrip spec={spec} />;
  return <ChartCard spec={spec} />;
}

function ChartCard({ spec }: { spec: Exclude<Infographic, { kind: "kpi" }> }) {
  const option = useMemo<EChartsOption>(() => toEchartsOption(spec), [spec]);
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2">
        <div className="text-[13px] font-semibold text-foreground">{spec.title}</div>
        {spec.subtitle && (
          <div className="text-[11px] text-muted-foreground">{spec.subtitle}</div>
        )}
      </div>
      <EChart option={option} className="h-[240px] w-full" />
    </div>
  );
}

function KpiStrip({ spec }: { spec: Extract<Infographic, { kind: "kpi" }> }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2">
        <div className="text-[13px] font-semibold text-foreground">{spec.title}</div>
        {spec.subtitle && (
          <div className="text-[11px] text-muted-foreground">{spec.subtitle}</div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {spec.data.map((k, i) => (
          <div key={i} className="rounded-md border border-border/60 bg-background/50 p-2">
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className="mt-0.5 text-[18px] font-semibold text-foreground">{k.value}</div>
            {k.delta && (
              <div
                className={
                  k.delta.startsWith("-")
                    ? "text-[10.5px] font-medium text-red-500"
                    : "text-[10.5px] font-medium text-emerald-600"
                }
              >
                {k.delta}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function toEchartsOption(spec: Exclude<Infographic, { kind: "kpi" }>): EChartsOption {
  const base: EChartsOption = {
    color: PALETTE,
    grid: { left: 40, right: 20, top: 20, bottom: 30, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    animation: false,
  };

  if (spec.kind === "bar" || spec.kind === "line") {
    const { categories, series } = spec.data;
    return {
      ...base,
      legend: series.length > 1 ? { top: 0, textStyle: { fontSize: 11 } } : undefined,
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: { fontSize: 10, color: "#64748b" },
      },
      yAxis: {
        type: "value",
        axisLabel: { fontSize: 10, color: "#64748b" },
        splitLine: { lineStyle: { color: "#e2e8f0" } },
      },
      series: series.map((s) => ({
        name: s.name,
        type: spec.kind,
        data: s.values,
        smooth: spec.kind === "line",
        barMaxWidth: 32,
      })),
    };
  }

  if (spec.kind === "pie") {
    return {
      color: PALETTE,
      tooltip: { trigger: "item" },
      legend: { orient: "vertical", right: 8, top: "center", textStyle: { fontSize: 11 } },
      series: [
        {
          type: "pie",
          radius: ["45%", "70%"],
          center: ["38%", "50%"],
          data: spec.data,
          label: { fontSize: 10 },
        },
      ],
      animation: false,
    };
  }

  // funnel
  return {
    color: PALETTE,
    tooltip: { trigger: "item" },
    series: [
      {
        type: "funnel",
        left: "10%",
        right: "10%",
        top: 10,
        bottom: 10,
        data: spec.data,
        label: { fontSize: 11 },
        gap: 2,
      },
    ],
    animation: false,
  };
}
