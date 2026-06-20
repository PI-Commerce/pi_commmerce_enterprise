// Real Thesys C1 generative-UI responses (openui-lang DSL, version 2), captured ONCE from
// the C1 API via scripts/capture-thesys.mjs using OUR mock analytics numbers (mirrored from
// src/lib/pi-charts.ts). UI only — contains no secrets. PiThesysResult renders these fully
// offline; the keys mirror the four generateChart() intents so both compare panels answer
// identically. Re-run the capture script only if the prompts or mock data change.

export type ThesysFixtureKey = "channel" | "trend" | "wa_vs_voice" | "reactivation_drop";

// Resolve a natural-language Ask Pi question to one of the captured fixtures. Mirrors the
// keyword routing of generateChart() in pi-charts.ts so the Thesys-driven Ask Pi answers the
// same intents; the channel breakdown is the catch-all so Pi is never empty on Analytics.
export function pickThesysFixtureKey(query: string): ThesysFixtureKey {
  const q = query.toLowerCase();
  const has = (re: RegExp) => re.test(q);
  if (has(/(drop|dip|declin|fell|fall|slip|sank|why)/) && has(/(react|conver|campaign|8%)/)) return "reactivation_drop";
  if (has(/(whatsapp|wa\b)/) && has(/(voice|call)/)) return "wa_vs_voice";
  if (has(/(trend|over time|vs last|run vs|last run|this run|compare run|growth|daily|timeline)/)) return "trend";
  return "channel";
}

export const THESYS_FIXTURES: Record<ThesysFixtureKey, string> = {
  "channel": "<content thesys=\"true\" version=\"2\">\n```openui-lang\nroot = Card([header, insight, chart])\nheader = Header(&quot;Conversions by Channel&quot;, &quot;Win-back campaign · Latest run&quot;)\ninsight = TextContent(&quot;Voice AI leads win-back at 25.1% — about 11 points ahead of WhatsApp; SMS and Ads trail.&quot;)\nchart = BarChart([&quot;Voice AI&quot;, &quot;WhatsApp&quot;, &quot;SMS&quot;, &quot;Ads&quot;], [series], &quot;default&quot;, &quot;grouped&quot;, &quot;Conversion Rate by Channel&quot;, &quot;% conversion · win-back, latest run&quot;, &quot;Channel&quot;, &quot;Conversion (%)&quot;)\nseries = { category: &quot;Conversion %&quot;, values: [25.1, 14.2, 9.8, 6.4] }\n```\n</content>",
  "trend": "<content thesys=\"true\" version=\"2\">\n```openui-lang\nroot = Card([insight, chart])\ninsight = TextContent(&quot;This run is pulling ahead — ending +2.6 points higher on day 7, with the gap opening after day 3.&quot;)\nchart = LineChart([&quot;Jun 5&quot;, &quot;Jun 6&quot;, &quot;Jun 7&quot;, &quot;Jun 8&quot;, &quot;Jun 9&quot;, &quot;Jun 10&quot;, &quot;Jun 11&quot;], [thisRun, lastRun], &quot;default&quot;, &quot;natural&quot;, &quot;This Run vs Last Run&quot;, &quot;Conversion rate over 7 days&quot;, &quot;Date&quot;, &quot;Conversion (%)&quot;)\nthisRun = { category: &quot;This run&quot;, values: [3.2, 4.1, 5, 5.4, 6.1, 6.8, 7.2] }\nlastRun = { category: &quot;Last run&quot;, values: [3, 3.4, 3.8, 4, 4.3, 4.5, 4.6] }\n```\n</content>",
  "wa_vs_voice": "<content thesys=\"true\" version=\"2\">\n```openui-lang\nroot = Card([insight, chart])\ninsight = TextContent(&quot;WhatsApp wins on delivery, but Voice AI converts ~1.8× better once a contact engages — 25% vs 14%.&quot;)\nchart = BarChart([&quot;Delivered&quot;, &quot;Engaged&quot;, &quot;Converted&quot;], [voiceSeries, whatsappSeries], &quot;default&quot;, &quot;grouped&quot;, &quot;WhatsApp vs Voice AI — Win-Back Funnel&quot;, &quot;% funnel rate by channel&quot;, &quot;Funnel Stage&quot;, &quot;Funnel Rate (%)&quot;)\nvoiceSeries = { category: &quot;Voice AI&quot;, values: [92, 61, 25] }\nwhatsappSeries = { category: &quot;WhatsApp&quot;, values: [98, 43, 14] }\n```\n</content>",
  "reactivation_drop": "<content thesys=\"true\" version=\"2\">\n```openui-lang\nroot = Card([insight, chart])\ninsight = TextContent(&quot;Conversion slid ~8% after Jun 7 — it lines up with the WhatsApp template hitting a delivery cap before a Voice AI fallback was in the flow.&quot;)\nchart = LineChart([&quot;Jun 5&quot;, &quot;Jun 6&quot;, &quot;Jun 7&quot;, &quot;Jun 8&quot;, &quot;Jun 9&quot;, &quot;Jun 10&quot;, &quot;Jun 11&quot;], [series], &quot;default&quot;, &quot;linear&quot;, &quot;Reactivation Conversion Drop&quot;, &quot;% reactivation conversion · Jun 5–11&quot;, &quot;Date&quot;, &quot;Conversion (%)&quot;)\nseries = { category: &quot;Reactivation Conversion&quot;, values: [22.4, 22.1, 21.6, 18.9, 17.2, 16.8, 16.5] }\n```\n</content>",
};
