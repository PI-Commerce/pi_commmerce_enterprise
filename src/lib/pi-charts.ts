// I7 — generative analytics. Ask Pi a question in plain language on the Analytics
// surface and it "generates" a relevant, downloadable chart (à la GetCrux / Julius).
//
// For the prototype this is an intent matcher over a small library of pre-built,
// on-brand ECharts options fed by mock data. `generateChart(query)` always returns
// a chart — Pi never comes back empty-handed — picking the most relevant spec from
// the question's keywords and otherwise falling back to the channel breakdown.

import type { EChartsOption } from "echarts";

export type PiChartSpec = {
  /** Card header title. */
  title: string;
  /** Secondary line under the title (scope / source). */
  sub: string;
  /** The natural-language answer Pi "speaks" above the chart. */
  insight: string;
  /** Slug used for the exported PNG filename. */
  slug: string;
  /** Fully-built ECharts option, themed to match the app. */
  option: EChartsOption;
};

// On-brand literal colors (canvas renderer can't resolve CSS vars), mirroring
// the app's oklch theme tokens in src/styles.css.
const INK = "oklch(0.30 0.02 260)";
const MUTED = "oklch(0.52 0.015 260)";
const GRID = "oklch(0.92 0.006 260)";
const AI = "oklch(0.62 0.18 280)";
const GREEN = "oklch(0.68 0.15 155)";
const AMBER = "oklch(0.78 0.16 75)";
const BLUE = "oklch(0.62 0.16 250)";
const RED = "oklch(0.62 0.22 27)";

const axisLabel = { fontSize: 10, color: MUTED } as const;
const axisLine = { lineStyle: { color: GRID } } as const;
const splitLine = { lineStyle: { color: GRID } } as const;

function barByChannel(): PiChartSpec {
  const channels = ["Voice AI", "WhatsApp", "SMS", "Ads"];
  const values = [25.1, 14.2, 9.8, 6.4];
  const colors = [AI, GREEN, AMBER, BLUE];
  return {
    title: "Conversion by channel",
    sub: "Win-back · latest run",
    insight:
      "Voice AI leads win-back at 25.1% — roughly 11 points ahead of WhatsApp. SMS and Ads trail well behind.",
    slug: "conversion-by-channel",
    option: {
      backgroundColor: "transparent",
      grid: { left: 40, right: 16, top: 24, bottom: 28 },
      tooltip: { trigger: "axis", valueFormatter: (v) => `${v}%` },
      xAxis: { type: "category", data: channels, axisLabel, axisLine, axisTick: { show: false } },
      yAxis: { type: "value", axisLabel: { ...axisLabel, formatter: "{value}%" }, splitLine, axisLine: { show: false } },
      series: [
        {
          type: "bar",
          barWidth: "46%",
          label: { show: true, position: "top", fontSize: 10, color: INK, formatter: "{c}%" },
          data: values.map((v, i) => ({ value: v, itemStyle: { color: colors[i], borderRadius: [4, 4, 0, 0] } })),
        },
      ],
    },
  };
}

function trendLine(): PiChartSpec {
  const dates = ["Jun 5", "Jun 6", "Jun 7", "Jun 8", "Jun 9", "Jun 10", "Jun 11"];
  const thisRun = [3.2, 4.1, 5.0, 5.4, 6.1, 6.8, 7.2];
  const lastRun = [3.0, 3.4, 3.8, 4.0, 4.3, 4.5, 4.6];
  return {
    title: "Conversions over time",
    sub: "This run vs last · 7 days",
    insight:
      "This run is pulling ahead of the previous one — ending +2.6 points higher on day 7, with the gap opening up after day 3.",
    slug: "conversions-this-run-vs-last",
    option: {
      backgroundColor: "transparent",
      grid: { left: 36, right: 16, top: 28, bottom: 28 },
      tooltip: { trigger: "axis", valueFormatter: (v) => `${v}%` },
      legend: { top: 0, right: 0, itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 10, color: MUTED } },
      xAxis: { type: "category", boundaryGap: false, data: dates, axisLabel, axisLine },
      yAxis: { type: "value", axisLabel: { ...axisLabel, formatter: "{value}%" }, splitLine, axisLine: { show: false } },
      series: [
        { name: "This run", type: "line", smooth: true, symbol: "none", data: thisRun, lineStyle: { width: 2.5, color: AI }, areaStyle: { color: AI, opacity: 0.1 } },
        { name: "Last run", type: "line", smooth: true, symbol: "none", data: lastRun, lineStyle: { width: 2, color: MUTED, type: "dashed" } },
      ],
    },
  };
}

function waVsVoice(): PiChartSpec {
  const stages = ["Delivered", "Engaged", "Converted"];
  const voice = [92, 61, 25];
  const wa = [98, 43, 14];
  return {
    title: "WhatsApp vs Voice AI",
    sub: "Funnel rates · win-back",
    insight:
      "WhatsApp wins on delivery, but Voice AI converts ~1.8× better once a contact engages — 25% vs 14%.",
    slug: "whatsapp-vs-voice",
    option: {
      backgroundColor: "transparent",
      grid: { left: 36, right: 16, top: 28, bottom: 28 },
      tooltip: { trigger: "axis", valueFormatter: (v) => `${v}%` },
      legend: { top: 0, right: 0, itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 10, color: MUTED } },
      xAxis: { type: "category", data: stages, axisLabel, axisLine, axisTick: { show: false } },
      yAxis: { type: "value", axisLabel: { ...axisLabel, formatter: "{value}%" }, splitLine, axisLine: { show: false } },
      series: [
        { name: "Voice AI", type: "bar", data: voice, barWidth: "30%", itemStyle: { color: AI, borderRadius: [3, 3, 0, 0] } },
        { name: "WhatsApp", type: "bar", data: wa, barWidth: "30%", itemStyle: { color: GREEN, borderRadius: [3, 3, 0, 0] } },
      ],
    },
  };
}

function reactivationDrop(): PiChartSpec {
  const dates = ["Jun 5", "Jun 6", "Jun 7", "Jun 8", "Jun 9", "Jun 10", "Jun 11"];
  const conv = [22.4, 22.1, 21.6, 18.9, 17.2, 16.8, 16.5];
  return {
    title: "Reactivation conversion",
    sub: "Last 7 days · where it slipped",
    insight:
      "Conversion slid ~8% after Jun 7 (shaded). It lines up with the WhatsApp template hitting a delivery cap before a Voice AI fallback was in the flow.",
    slug: "reactivation-conversion-drop",
    option: {
      backgroundColor: "transparent",
      grid: { left: 40, right: 16, top: 20, bottom: 28 },
      tooltip: { trigger: "axis", valueFormatter: (v) => `${v}%` },
      xAxis: { type: "category", boundaryGap: false, data: dates, axisLabel, axisLine },
      yAxis: { type: "value", axisLabel: { ...axisLabel, formatter: "{value}%" }, splitLine, axisLine: { show: false } },
      series: [
        {
          type: "line",
          smooth: true,
          symbol: "none",
          data: conv,
          lineStyle: { width: 2.5, color: RED },
          areaStyle: { color: RED, opacity: 0.08 },
          markArea: {
            itemStyle: { color: "oklch(0.62 0.22 27 / 0.07)" },
            data: [[{ xAxis: "Jun 7" }, { xAxis: "Jun 9" }]],
          },
        },
      ],
    },
  };
}

const has = (q: string, re: RegExp) => re.test(q);

/**
 * Resolve a natural-language question to a chart. Always returns a spec — the
 * channel breakdown is the catch-all so Pi is never empty on Analytics.
 */
export function generateChart(query: string): PiChartSpec {
  const q = query.toLowerCase();
  if (has(q, /(drop|dip|declin|fell|fall|slip|sank|why)/) && has(q, /(react|conver|campaign|8%)/)) return reactivationDrop();
  if (has(q, /(whatsapp|wa\b)/) && has(q, /(voice|call)/)) return waVsVoice();
  if (has(q, /(trend|over time|vs last|run vs|last run|this run|compare run|growth|daily|timeline)/)) return trendLine();
  if (has(q, /(channel|by channel|split|breakdown|voice|whatsapp|sms|ads)/)) return barByChannel();
  return barByChannel();
}
