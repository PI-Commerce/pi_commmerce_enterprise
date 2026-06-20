// Thesys C1 generative-UI responses (openui-lang DSL, version 2) for the analytics "Pi Magic"
// demo. The numbers are derived from a real Volt Money voice-AI call dump (459 sessions:
// call_intent, customer_sentiment, hang-up reasons, lead status). UI only — no secrets, no
// network. PiThesysResult renders these fully offline. The three keys mirror the three Ask Pi
// example chips on Analytics so each clickable question returns a coherent, on-topic answer.

export type ThesysFixtureKey = "call_outcomes" | "conversion_funnel" | "sentiment";

// Resolve a natural-language Ask Pi question to one of the captured fixtures. `call_outcomes`
// is the catch-all so Pi is never empty on the voice-analytics surface.
export function pickThesysFixtureKey(query: string): ThesysFixtureKey {
  const q = query.toLowerCase();
  const has = (re: RegExp) => re.test(q);
  if (has(/(sentiment|positive|negative|happy|unhappy|mood|tone|frustrat|angry)/)) return "sentiment";
  if (has(/(funnel|losing|lose|lost|convert|conversion|interested|leak|stage|where|drop)/)) return "conversion_funnel";
  return "call_outcomes";
}

export const THESYS_FIXTURES: Record<ThesysFixtureKey, string> = {
  "call_outcomes": "<content thesys=\"true\" version=\"2\">\n```openui-lang\nroot = Card([header, insight, chart])\nheader = Header(&quot;Call Outcomes by Intent&quot;, &quot;Volt Money voice agent · last 459 calls&quot;)\ninsight = TextContent(&quot;Most calls never get going — 64% end with no meaningful engagement, usually a quick hang-up or language mismatch before the loan offer lands. Only ~7% reach real buying intent.&quot;)\nchart = BarChart([&quot;No Meaningful Engagement&quot;, &quot;Information Seeking&quot;, &quot;Not Interested&quot;, &quot;Interested&quot;], [series], &quot;default&quot;, &quot;grouped&quot;, &quot;Call Outcomes by Intent&quot;, &quot;% of classified calls&quot;, &quot;Call Intent&quot;, &quot;Share of Calls (%)&quot;)\nseries = { category: &quot;Share of calls&quot;, values: [64, 16, 13, 7] }\n```\n</content>",
  "conversion_funnel": "<content thesys=\"true\" version=\"2\">\n```openui-lang\nroot = Card([insight, chart])\ninsight = TextContent(&quot;The funnel collapses at first contact: 92% of calls connect, but only 36% engage past the intro and just 7% turn interested. The biggest leak is the engage step — win the first 20 seconds and conversion roughly doubles.&quot;)\nchart = BarChart([&quot;Connected&quot;, &quot;Engaged&quot;, &quot;Interested&quot;, &quot;Callback / Visit&quot;], [series], &quot;default&quot;, &quot;grouped&quot;, &quot;Voice Agent Conversion Funnel&quot;, &quot;% of calls reaching each stage&quot;, &quot;Funnel Stage&quot;, &quot;Reach (%)&quot;)\nseries = { category: &quot;Reach&quot;, values: [92, 36, 7, 4] }\n```\n</content>",
  "sentiment": "<content thesys=\"true\" version=\"2\">\n```openui-lang\nroot = Card([insight, chart])\ninsight = TextContent(&quot;Sentiment skews neutral — 81% of callers stay non-committal, while positives (12%) outnumber negatives (7%) nearly 2 to 1. Negative calls cluster on interest-rate and processing-fee objections.&quot;)\nchart = BarChart([&quot;Neutral&quot;, &quot;Positive&quot;, &quot;Negative&quot;], [series], &quot;default&quot;, &quot;grouped&quot;, &quot;Customer Sentiment Split&quot;, &quot;% of classified calls&quot;, &quot;Sentiment&quot;, &quot;Share of Calls (%)&quot;)\nseries = { category: &quot;Share of calls&quot;, values: [81, 12, 7] }\n```\n</content>",
};
