// One-off dev tool: capture real GenUI (C1) DSL responses for the Ask Pi analytics
// surface. Feeds OUR mock analytics numbers (mirrored from src/lib/pi-charts.ts)
// through the C1 API so the GenUI panel answers identically to the ECharts panel.
//
// Run once (key via env, never committed):
//   ASKPI_API_KEY=sk-... node scripts/capture-genui.mjs
//
// Writes src/lib/pi-genui-fixtures.ts — that file (UI only, no secret) is what the
// app renders offline. Re-run only if the prompts/data change.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KEY = process.env.ASKPI_API_KEY;
if (!KEY) {
  console.error("Missing ASKPI_API_KEY env var.");
  process.exit(1);
}

const BASE = "https://api.thesys.dev/v1/embed/chat/completions";
const MODEL = process.env.ASKPI_MODEL || "c1/anthropic/claude-sonnet-4.6/v-20260331";

const SYSTEM = `You are Pi, the analytics copilot inside PiCom, a marketing-automation platform.
When given an analytics question plus a data block, respond with a single compact generative-UI card:
- one short, plain-language insight sentence at the top (sound like an analyst, not a robot),
- then ONE chart that visualizes EXACTLY the numbers provided — never invent, round, or alter values,
- give the chart a clear title and a short subtitle (scope/source).
Keep it to one card and one chart. Percentages are percentages. Do not add filler text or extra sections.`;

// Mirrors the four specs in src/lib/pi-charts.ts so both panels show the same answer.
const TASKS = [
  {
    key: "channel",
    question: "Chart conversions by channel",
    data: {
      chart: "grouped/vertical bar",
      unit: "% conversion (win-back, latest run)",
      categories: ["Voice AI", "WhatsApp", "SMS", "Ads"],
      values: [25.1, 14.2, 9.8, 6.4],
      insight: "Voice AI leads win-back at 25.1% — about 11 points ahead of WhatsApp; SMS and Ads trail.",
    },
  },
  {
    key: "trend",
    question: "Compare this run vs last",
    data: {
      chart: "multi-series line",
      unit: "% conversion over 7 days",
      x: ["Jun 5", "Jun 6", "Jun 7", "Jun 8", "Jun 9", "Jun 10", "Jun 11"],
      series: {
        "This run": [3.2, 4.1, 5.0, 5.4, 6.1, 6.8, 7.2],
        "Last run": [3.0, 3.4, 3.8, 4.0, 4.3, 4.5, 4.6],
      },
      insight: "This run is pulling ahead — ending +2.6 points higher on day 7, with the gap opening after day 3.",
    },
  },
  {
    key: "wa_vs_voice",
    question: "Compare WhatsApp vs Voice",
    data: {
      chart: "grouped vertical bar (two series)",
      unit: "% funnel rate (win-back)",
      stages: ["Delivered", "Engaged", "Converted"],
      series: { "Voice AI": [92, 61, 25], WhatsApp: [98, 43, 14] },
      insight: "WhatsApp wins on delivery, but Voice AI converts ~1.8× better once a contact engages — 25% vs 14%.",
    },
  },
  {
    key: "reactivation_drop",
    question: "Why did reactivation drop 8%?",
    data: {
      chart: "single line, highlight the drop after Jun 7",
      unit: "% reactivation conversion, last 7 days",
      x: ["Jun 5", "Jun 6", "Jun 7", "Jun 8", "Jun 9", "Jun 10", "Jun 11"],
      values: [22.4, 22.1, 21.6, 18.9, 17.2, 16.8, 16.5],
      insight: "Conversion slid ~8% after Jun 7 — it lines up with the WhatsApp template hitting a delivery cap before a Voice AI fallback was in the flow.",
    },
  },
];

async function capture(task) {
  const userContent =
    `Question: ${task.question}\n\n` +
    `Data (render exactly these numbers):\n${JSON.stringify(task.data, null, 2)}`;
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`C1 API ${res.status} for "${task.key}": ${body.slice(0, 500)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error(`No content for "${task.key}": ${JSON.stringify(json).slice(0, 500)}`);
  }
  return content;
}

const out = {};
for (const task of TASKS) {
  process.stdout.write(`Capturing "${task.key}" (${MODEL})… `);
  out[task.key] = await capture(task);
  console.log(`ok (${out[task.key].length} chars)`);
}

const keys = Object.keys(out);
const header =
  "// Real GenUI (C1) generative-UI responses (openui-lang DSL, version 2), captured ONCE from\n" +
  "// the C1 API via scripts/capture-genui.mjs using OUR mock analytics numbers (mirrored from\n" +
  "// src/lib/pi-charts.ts). UI only — contains no secrets. PiGenUiResult renders these fully\n" +
  "// offline; the keys mirror the four generateChart() intents so both compare panels answer\n" +
  "// identically. Re-run the capture script only if the prompts or mock data change.\n\n";
const body =
  `export type GenUiFixtureKey = ${keys.map((k) => JSON.stringify(k)).join(" | ")};\n\n` +
  "export const GENUI_FIXTURES: Record<GenUiFixtureKey, string> = {\n" +
  keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(out[k])},`).join("\n") +
  "\n};\n";
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "pi-genui-fixtures.ts");
writeFileSync(dest, header + body);
console.log(`\nWrote ${keys.length} fixtures → src/lib/pi-genui-fixtures.ts`);
