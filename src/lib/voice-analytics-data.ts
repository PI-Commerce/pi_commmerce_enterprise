// Grounding data for the live Thesys Ask Pi on Analytics. Aggregated from a real Volt Money
// voice-AI call dump (459 sessions). These are the ONLY numbers the C1 model is allowed to
// chart — the server prompt instructs it to render exactly what's here and never invent values.
// Counts are exact; percentages are of the classified subset (365 calls with a scored intent).

export const VOICE_ANALYTICS = {
  source: "Volt Money voice AI agent · loan-against-mutual-funds outbound calls",
  totals: { calls: 459, classified: 365, unclassified: 94 },

  // How each scored call ended up, by detected intent.
  byIntent: [
    { label: "No Meaningful Engagement", count: 234, pct: 64 },
    { label: "Engaged - Information Seeking", count: 57, pct: 16 },
    { label: "Not Interested - No Current Need", count: 39, pct: 11 },
    { label: "Interested - Callback Scheduled", count: 13, pct: 4 },
    { label: "Interested - Strong Conversion Signal", count: 11, pct: 3 },
    { label: "Not Interested - Objection Raised", count: 10, pct: 3 },
    { label: "Wrong Contact", count: 1, pct: 0 },
  ],

  // Caller sentiment (of the 365 classified calls).
  bySentiment: [
    { label: "Neutral", count: 295, pct: 81 },
    { label: "Positive", count: 44, pct: 12 },
    { label: "Negative", count: 26, pct: 7 },
  ],

  // Derived engagement funnel: where the conversation collapses.
  funnel: [
    { stage: "Connected", pct: 91 },
    { stage: "Engaged (past intro)", pct: 36 },
    { stage: "Interested", pct: 7 },
    { stage: "Callback / Visit booked", pct: 4 },
  ],

  // The 20-second cliff: outcome by how long the call lasted (DurationMs cohorts).
  // "reachedInterestPct" = share of the cohort scored Engaged-Information-Seeking,
  // Interested-Callback-Scheduled, or Interested-Strong-Conversion. Interest climbs
  // ~20x once a call survives the opening (2% → 19% → 41%), yet 43% of calls die <20s.
  byDuration: [
    { label: "<20s", calls: 197, pct: 43, reachedInterestPct: 2 },
    { label: "20-60s", calls: 135, pct: 29, reachedInterestPct: 19 },
    { label: "60s+", calls: 127, pct: 28, reachedInterestPct: 41 },
  ],

  // Why the telephony leg dropped. 42 of 459 calls (9%) hit a technical error.
  byHangupReason: [
    { label: "Normal call clearing", count: 417 },
    { label: "Request Timeout", count: 14 },
    { label: "Forbidden", count: 11 },
    { label: "Request Terminated", count: 9 },
    { label: "Server Internal Error", count: 8 },
  ],
  technical: { errored: 42, ok: 417, errorPct: 9 },

  // Field-visit scheduling outcomes (sparse — small absolute numbers).
  appointments: { withDate: 69, availableToTalk: 15, connected: 11, visitScheduled: 1 },
} as const;

/** Serialize the grounding data into a compact block for the C1 prompt. */
export function voiceDataBlock(): string {
  return JSON.stringify(VOICE_ANALYTICS, null, 2);
}
