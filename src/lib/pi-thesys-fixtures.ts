// Pi-generated analytics cards (openui-lang DSL, version 2) for the Analytics "Ask Pi"
// surface. The numbers are derived from a real Volt Money voice-AI call dump (459 sessions).
// UI only, no secrets, no network: PiThesysResult renders these fully offline. We keep one
// curated example for now (the 20-second cliff); more second-order insights land later.

export type ThesysFixtureKey = "duration_cliff";

// Resolve a natural-language Ask Pi question to a captured card. One example for now, so the
// catch-all always returns it; the live path can still answer any question from the data.
export function pickThesysFixtureKey(_query: string): ThesysFixtureKey {
  return "duration_cliff";
}

export const THESYS_FIXTURES: Record<ThesysFixtureKey, string> = {
  "duration_cliff": "<content thesys=\"true\" version=\"2\">\n```openui-lang\nroot = Card([header, insight1, insight2, recommendation, chart])\nheader = Header(&quot;The 20-second cliff&quot;, &quot;Volt Money voice agent · 459 calls&quot;)\ninsight1 = TextContent(&quot;42% of calls end in under 20 seconds, and almost none of them ever show interest. That entire bucket converts at roughly zero.&quot;)\ninsight2 = TextContent(&quot;When a call gets past 60 seconds, about 40% of callers turn interested or have a genuinely meaningful conversation.&quot;)\nrecommendation = CalloutV2(&quot;success&quot;, &quot;Pi Recommends&quot;, &quot;Rewrite the opening hook (agent prompt §9, Call Opening Beat 1): lead with a 10-second curiosity hook before the formal eligibility line, so more callers survive past the 20-second cliff.&quot;)\nchart = BarChart([&quot;Under 20s&quot;, &quot;20-60s&quot;, &quot;Over 60s&quot;], [calls, reached], &quot;default&quot;, &quot;grouped&quot;, &quot;Most calls land where conversion is lowest&quot;, &quot;Volt Money voice agent · 459 calls&quot;, &quot;Call length&quot;, &quot;Percent (%)&quot;)\ncalls = { category: &quot;Share of all calls&quot;, values: [43, 29, 28] }\nreached = { category: &quot;Reached interest&quot;, values: [2, 19, 41] }\n```\n</content>",
};
