// Pi-generated analytics cards (openui-lang DSL, version 2) for the Analytics "Ask Pi"
// surface. UI only, no secrets, no network: PiThesysResult renders these fully offline.
//
// Two families of captured cards live here:
//   - duration_cliff   → the flagship insight from a real Volt Money voice-AI dump (459 calls).
//   - channel/trend/wa_vs_voice/reactivation_drop → win-back campaign chart answers, captured
//     once from the C1 API using our mock analytics numbers.
//
// The live path (askPiThesys → C1 API) can answer any question from the grounding data; these
// fixtures are the offline fallback so the demo never dead-ends when the API isn't reachable.

export type ThesysFixtureKey =
  | "duration_cliff"
  | "channel"
  | "trend"
  | "wa_vs_voice"
  | "reactivation_drop";

// Resolve a natural-language Ask Pi question to the closest captured card. Keyword-based;
// the live C1 path always runs first, so this only fires on offline/error.
export function pickThesysFixtureKey(query: string): ThesysFixtureKey {
  const q = query.toLowerCase();
  if (/reactiv|drop|slid|decline/.test(q)) return "reactivation_drop";
  if (/whatsapp.*voice|voice.*whatsapp|wa vs voice|funnel/.test(q)) return "wa_vs_voice";
  if (/this run|last run|compare|trend|over time|day/.test(q)) return "trend";
  if (/channel|by channel|conversions by/.test(q)) return "channel";
  return "duration_cliff";
}

export const THESYS_FIXTURES: Record<ThesysFixtureKey, string> = {
  "duration_cliff": "<content thesys=\"true\" version=\"2\">\n```openui-lang\nroot = Card([header, insight1, insight2, recommendation, chart])\nheader = Header(&quot;The 20-second cliff&quot;, &quot;Volt Money voice agent · 459 calls&quot;)\ninsight1 = TextContent(&quot;42% of calls end in under 20 seconds, and almost none of them ever show interest. That entire bucket converts at roughly zero.&quot;)\ninsight2 = TextContent(&quot;When a call gets past 60 seconds, about 40% of callers turn interested or have a genuinely meaningful conversation.&quot;)\nrecommendation = CalloutV2(&quot;success&quot;, &quot;Pi Recommends&quot;, &quot;Rewrite the opening hook (agent prompt §9, Call Opening Beat 1): lead with a 10-second curiosity hook before the formal eligibility line, so more callers survive past the 20-second cliff.&quot;)\nchart = BarChart([&quot;Under 20s&quot;, &quot;20-60s&quot;, &quot;Over 60s&quot;], [calls, reached], &quot;default&quot;, &quot;grouped&quot;, &quot;Most calls land where conversion is lowest&quot;, &quot;Volt Money voice agent · 459 calls&quot;, &quot;Call length&quot;, &quot;Percent (%)&quot;)\ncalls = { category: &quot;Share of all calls&quot;, values: [43, 29, 28] }\nreached = { category: &quot;Reached interest&quot;, values: [2, 19, 41] }\n```\n</content>",
  "channel": "<content thesys=\"true\" version=\"2\">\n```openui-lang\nroot = Card([header, insight, chart])\nheader = Header(&quot;Conversions by Channel&quot;, &quot;Win-back campaign · Latest run&quot;)\ninsight = TextContent(&quot;Voice AI leads win-back at 25.1% — about 11 points ahead of WhatsApp; SMS and Ads trail.&quot;)\nchart = BarChart([&quot;Voice AI&quot;, &quot;WhatsApp&quot;, &quot;SMS&quot;, &quot;Ads&quot;], [series], &quot;default&quot;, &quot;grouped&quot;, &quot;Conversion Rate by Channel&quot;, &quot;% conversion · win-back, latest run&quot;, &quot;Channel&quot;, &quot;Conversion (%)&quot;)\nseries = { category: &quot;Conversion %&quot;, values: [25.1, 14.2, 9.8, 6.4] }\n```\n</content>",
  "trend": "<content thesys=\"true\" version=\"2\">\n```openui-lang\nroot = Card([insight, chart])\ninsight = TextContent(&quot;This run is pulling ahead — ending +2.6 points higher on day 7, with the gap opening after day 3.&quot;)\nchart = LineChart([&quot;Jun 5&quot;, &quot;Jun 6&quot;, &quot;Jun 7&quot;, &quot;Jun 8&quot;, &quot;Jun 9&quot;, &quot;Jun 10&quot;, &quot;Jun 11&quot;], [thisRun, lastRun], &quot;default&quot;, &quot;natural&quot;, &quot;This Run vs Last Run&quot;, &quot;Conversion rate over 7 days&quot;, &quot;Date&quot;, &quot;Conversion (%)&quot;)\nthisRun = { category: &quot;This run&quot;, values: [3.2, 4.1, 5, 5.4, 6.1, 6.8, 7.2] }\nlastRun = { category: &quot;Last run&quot;, values: [3, 3.4, 3.8, 4, 4.3, 4.5, 4.6] }\n```\n</content>",
  "wa_vs_voice": "<content thesys=\"true\" version=\"2\">\n```openui-lang\nroot = Card([insight, chart])\ninsight = TextContent(&quot;WhatsApp wins on delivery, but Voice AI converts ~1.8× better once a contact engages — 25% vs 14%.&quot;)\nchart = BarChart([&quot;Delivered&quot;, &quot;Engaged&quot;, &quot;Converted&quot;], [voiceSeries, whatsappSeries], &quot;default&quot;, &quot;grouped&quot;, &quot;WhatsApp vs Voice AI — Win-Back Funnel&quot;, &quot;% funnel rate by channel&quot;, &quot;Funnel Stage&quot;, &quot;Funnel Rate (%)&quot;)\nvoiceSeries = { category: &quot;Voice AI&quot;, values: [92, 61, 25] }\nwhatsappSeries = { category: &quot;WhatsApp&quot;, values: [98, 43, 14] }\n```\n</content>",
  "reactivation_drop": "<content thesys=\"true\" version=\"2\">\n```openui-lang\nroot = Card([insight, chart])\ninsight = TextContent(&quot;Conversion slid ~8% after Jun 7 — it lines up with the WhatsApp template hitting a delivery cap before a Voice AI fallback was in the flow.&quot;)\nchart = LineChart([&quot;Jun 5&quot;, &quot;Jun 6&quot;, &quot;Jun 7&quot;, &quot;Jun 8&quot;, &quot;Jun 9&quot;, &quot;Jun 10&quot;, &quot;Jun 11&quot;], [series], &quot;default&quot;, &quot;linear&quot;, &quot;Reactivation Conversion Drop&quot;, &quot;% reactivation conversion · Jun 5–11&quot;, &quot;Date&quot;, &quot;Conversion (%)&quot;)\nseries = { category: &quot;Reactivation Conversion&quot;, values: [22.4, 22.1, 21.6, 18.9, 17.2, 16.8, 16.5] }\n```\n</content>",
};
