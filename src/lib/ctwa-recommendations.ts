/**
 * Grounded recommendations for the Ads Manager.
 *
 * Not a list of tips. Every rule below reads the same tap log the analytics tab
 * renders, and every recommendation it emits carries the measurement that fired
 * it — so a merchant can disagree with the advice by checking the number, which
 * is the only kind of advice worth showing. A rule that cannot cite evidence
 * does not get to speak.
 *
 * The findings are deliberately the ones CTWA gets wrong in practice:
 *   - buying chat opens because the objective can't buy anything else
 *   - replying too slowly for Meta's own quality signal to work
 *   - having earned a Sales objective and still running Leads
 *   - reporting conversions Meta has already stopped accepting
 *   - optimising for conversions that were never defined
 *   - owning a high-intent stalled segment and never retargeting it
 *
 * BACKEND: an LLM ranker slots behind {@link getRecommendations} unchanged — same
 * input, same output. What it replaces is the ordering and the prose, not the
 * grounding: the rules below are what you hand it as context so it cannot invent
 * a finding the data doesn't support.
 */
import {
  CAPI_WINDOW_DAYS,
  FAST_RESPONSE_THRESHOLD_MS,
  GOAL_LABELS,
  OBJECTIVE_LABELS,
  type AdPerformance,
  type CapiEvent,
  type CtwaAd,
  type CtwaConversation,
  type OutcomeAudience,
} from "@/lib/ctwa-types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RecommendationKind =
  | "objective_trap"
  | "slow_first_response"
  | "graduate_objective"
  | "expired_conversions"
  | "missing_conversion_points"
  | "stalled_audience";

export type RecommendationSeverity = "critical" | "warning" | "opportunity";

/** Where the recommendation wants to take you. The surface decides how. */
export type RecommendationTarget = "ad" | "loop" | "audiences";

export type Recommendation = {
  id: string;
  kind: RecommendationKind;
  severity: RecommendationSeverity;
  title: string;
  body: string;
  /** The measurement that triggered this. Always present by construction. */
  evidence: { label: string; value: string; comparison?: string };
  adId?: string;
  action?: { label: string; target: RecommendationTarget };
};

export type RecommendationInput = {
  ads: CtwaAd[];
  conversations: CtwaConversation[];
  capiEvents: CapiEvent[];
  /** Ad-scope rollup. Passed in rather than recomputed so the panel and the table cite identical numbers. */
  performance: AdPerformance[];
  audiences: OutcomeAudience[];
  nowMs: number;
  currencySymbol: string;
};

/* ─────────────────────────── Thresholds ─────────────────────────── */

/** Below this many conversations an ad hasn't earned an opinion yet. */
const MIN_CONVERSATIONS = 15;
/** Qualify rate this far under the account average is a targeting/objective problem, not noise. */
const UNDERPERFORM_RATIO = 0.7;
/** Purchases needed before Meta's conversion optimiser has enough signal to run on. */
const GRADUATION_PURCHASES = 12;
/** A stalled segment worth an ad rather than a follow-up message. */
const AUDIENCE_FLOOR = 10;
const STALL_DAYS = 3;

const SEVERITY_RANK: Record<RecommendationSeverity, number> = {
  critical: 0,
  warning: 1,
  opportunity: 2,
};

/* ─────────────────────────── Formatting ─────────────────────────── */

// Local rather than imported from the Ads Manager's `ui.tsx`: a lib should not
// reach up into components, and these two are three lines each.
function money(n: number, symbol: string): string {
  return `${symbol}${Math.round(n).toLocaleString("en-IN")}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;
}

function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/* ─────────────────────────── Engine ─────────────────────────── */

export function getRecommendations(input: RecommendationInput): Recommendation[] {
  const { ads, conversations, capiEvents, performance, audiences, nowMs, currencySymbol: sym } = input;
  const out: Recommendation[] = [];
  const perfById = new Map(performance.map((p) => [p.id, p]));
  const active = ads.filter((a) => a.status === "active");

  // Account baseline. Every per-ad comparison is against the merchant's own
  // account, never an invented industry benchmark.
  const totalStarted = performance.reduce((n, p) => n + p.conversationsStarted, 0);
  const totalQualified = performance.reduce((n, p) => n + p.qualifiedLeads, 0);
  const accountQualifyRate = totalStarted > 0 ? totalQualified / totalStarted : 0;

  for (const ad of active) {
    const p = perfById.get(ad.id);
    const enoughData = p && p.conversationsStarted >= MIN_CONVERSATIONS;
    const qualifyRate = p && p.conversationsStarted > 0 ? p.qualifiedLeads / p.conversationsStarted : 0;

    /* 1. The objective trap, in this ad's numbers. */
    if (
      enoughData &&
      ad.objective === "OUTCOME_LEADS" &&
      accountQualifyRate > 0 &&
      qualifyRate < accountQualifyRate * UNDERPERFORM_RATIO
    ) {
      out.push({
        id: `objective_trap_${ad.id}`,
        kind: "objective_trap",
        severity: "critical",
        title: `${ad.name} is buying conversations, not customers`,
        body:
          `The ${OBJECTIVE_LABELS[ad.objective]} objective can only optimise for ` +
          `${GOAL_LABELS.CONVERSATIONS}, so Meta is spending this budget on whoever is cheapest to ` +
          `get into a chat. It is succeeding — conversations here cost ` +
          `${money(p!.costPerConversationStarted, sym)} — and almost none of them qualify. ` +
          `Move to Sales + Conversions so the conversion points you already report become what ` +
          `delivery optimises against.`,
        evidence: {
          label: "Qualify rate",
          value: `${pct(qualifyRate)} of conversations`,
          comparison: `account average ${pct(accountQualifyRate)}`,
        },
        adId: ad.id,
        action: { label: "Change objective", target: "ad" },
      });
    }

    /* 2. Slow first response — Meta's own quality signal, unattended. */
    if (enoughData && p!.avgFirstResponseLatencyMs > FAST_RESPONSE_THRESHOLD_MS) {
      const bad = p!.avgFirstResponseLatencyMs > FAST_RESPONSE_THRESHOLD_MS * 1.5;
      out.push({
        id: `slow_first_response_${ad.id}`,
        kind: "slow_first_response",
        severity: bad ? "critical" : "warning",
        title: `Replies to ${ad.name} land after the window that matters`,
        body:
          `Meta's guidance is that a first reply inside ` +
          `${FAST_RESPONSE_THRESHOLD_MS / 1000}s materially lifts CTWA conversion, and this ad is ` +
          `past it on average. Nothing about the creative or the targeting will fix it — the leak ` +
          `is between the tap and the first message. Put an automated first response on the ` +
          `campaign this ad feeds, or route its threads to a staffed queue.`,
        evidence: {
          label: "Avg first response",
          value: secs(p!.avgFirstResponseLatencyMs),
          comparison: `target under ${FAST_RESPONSE_THRESHOLD_MS / 1000}s`,
        },
        adId: ad.id,
        action: { label: "Open ad", target: "ad" },
      });
    }

    /* 3. Earned a Sales objective and still running Leads. */
    if (
      enoughData &&
      ad.objective !== "OUTCOME_SALES" &&
      ad.conversionPoints.length > 0 &&
      p!.purchases >= GRADUATION_PURCHASES &&
      qualifyRate >= accountQualifyRate
    ) {
      out.push({
        id: `graduate_objective_${ad.id}`,
        kind: "graduate_objective",
        severity: "opportunity",
        title: `${ad.name} has enough conversion signal to graduate`,
        body:
          `This ad has reported ${p!.purchases} conversions back through CAPI — past the point ` +
          `where Meta's conversion optimiser has something to learn from. It is still running on ` +
          `${OBJECTIVE_LABELS[ad.objective]}, which means that signal is being collected and not ` +
          `used. Switching to Sales + Conversions puts the ${money(p!.revenue, sym)} it has already ` +
          `attributed to work on delivery.`,
        evidence: {
          label: "Conversions reported",
          value: `${p!.purchases} in window`,
          comparison: `${GRADUATION_PURCHASES}+ needed to optimise`,
        },
        adId: ad.id,
        action: { label: "Change objective", target: "ad" },
      });
    }

    /* 4. Optimising for conversions nobody defined. */
    if (ad.conversionPoints.length === 0) {
      const starved = ad.optimizationGoal === "OFFSITE_CONVERSIONS";
      out.push({
        id: `missing_conversion_points_${ad.id}`,
        kind: "missing_conversion_points",
        severity: starved ? "critical" : "warning",
        title: `${ad.name} has no conversion point defined`,
        body: starved
          ? `This ad optimises for Conversions and has not been told what one is. Meta cannot see ` +
            `inside a WhatsApp thread, so with no conversion point there is no signal at all — ` +
            `delivery is running blind on a goal it can never measure.`
          : `Nothing in this ad's threads is being reported back to Meta as an outcome. It will keep ` +
            `working, but every conversation it produces looks identical to the delivery model ` +
            `whether it ended in revenue or silence.`,
        evidence: {
          label: "Conversion points",
          value: "0 defined",
          comparison: `optimising for ${GOAL_LABELS[ad.optimizationGoal]}`,
        },
        adId: ad.id,
        action: { label: "Define outcome", target: "loop" },
      });
    }

    /* 5. Conversions Meta has already refused. */
    const adEvents = capiEvents.filter((e) => e.adId === ad.id);
    const expired = adEvents.filter((e) => e.status === "expired");
    if (expired.length >= 2) {
      const lost = expired.reduce((n, e) => n + (e.value ?? 0), 0);
      out.push({
        id: `expired_conversions_${ad.id}`,
        kind: "expired_conversions",
        severity: "warning",
        title: `${expired.length} conversions from ${ad.name} arrived too late to count`,
        body:
          `These threads did convert. They converted more than ${CAPI_WINDOW_DAYS} days after the ` +
          `click, so Meta will not attribute them and the delivery model never learned that the ` +
          `taps which produced them were worth buying. The revenue is real; the optimisation ` +
          `signal is gone. Either shorten the path to conversion or report an earlier event — a ` +
          `qualified lead inside the window is worth more to delivery than a purchase outside it.`,
        evidence: {
          label: "Expired conversions",
          value: `${expired.length} of ${adEvents.length}`,
          comparison: lost > 0 ? `${money(lost, sym)} unattributed` : `${CAPI_WINDOW_DAYS}-day window`,
        },
        adId: ad.id,
        action: { label: "Open CAPI log", target: "loop" },
      });
    }
  }

  /* 6. A high-intent segment sitting unclaimed. */
  const stalled = conversations.filter(
    (c) => c.outcomeStage === "conversation_started" && nowMs - c.stageAtMs >= STALL_DAYS * DAY_MS,
  );
  if (stalled.length >= AUDIENCE_FLOOR && audiences.length === 0) {
    out.push({
      id: "stalled_audience_account",
      kind: "stalled_audience",
      severity: "opportunity",
      title: `${stalled.length} people asked a question and went quiet`,
      body:
        `They opened a thread, said something, and nothing has happened for ${STALL_DAYS} days. ` +
        `This is the densest intent in the account and Meta cannot see any of it — a conversation ` +
        `that stalls looks exactly like a conversation that never happened. Build it as an outcome ` +
        `audience and run a second creative at it; membership re-evaluates itself, so anyone who ` +
        `comes back and converts leaves on their own.`,
      evidence: {
        label: "Stalled conversations",
        value: `${stalled.length} threads`,
        comparison: `quiet ${STALL_DAYS}d+`,
      },
      action: { label: "Build audience", target: "audiences" },
    });
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
