/**
 * Mock CTWA feed — the thing a real webhook pipeline would replace.
 *
 * Everything the Ads Manager renders (funnel, CAPI log, outcome audiences,
 * recommendations) reads from {@link CtwaFeed}. The mock implementation below
 * generates a deterministic tap log once, then resolves each tap's stage as a
 * pure function of the sim clock — so "advance time" is a clock change, not a
 * mutation, and re-rendering can never produce a different history.
 *
 * Two discipline rules carried over from the analytics mocks:
 *  - one record per click. Impressions, clicks and spend are *derived* from the
 *    record count and per-ad ratios, never counted independently, so the tiles
 *    can't contradict the table underneath them.
 *  - the plan that decides a tap's trajectory is feed-internal. It never leaves
 *    this module — {@link CtwaConversation} carries only what a webhook payload
 *    would carry, so a real feed simply won't have a plan to discard.
 *
 * BACKEND: implement {@link CtwaFeed} against the WhatsApp Business webhook
 * (referral → `ctwa_clid`) and your conversation store. Nothing above this file
 * knows which implementation it holds.
 */
import { LEAD_RECORDS } from "@/lib/leads-data";
import {
  CAPI_WINDOW_MS,
  type AdPerformance,
  type CapiEvent,
  type CapiEventStatus,
  type ConversionEventName,
  type CtwaAd,
  type CtwaConversation,
  type OutcomeStage,
  type PerformanceScope,
} from "@/lib/ctwa-types";

/**
 * The demo's "now" at first load: 15 Aug 2026, 12:00 IST. Fixed rather than
 * `Date.now()` so seeded ad start dates, conversation ages and the 7-day CAPI
 * window all stay in a known relationship no matter when the demo is opened.
 */
export const SIM_EPOCH_MS = Date.UTC(2026, 7, 15, 6, 30);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Taps are generated for this span around the epoch, so advancing time reveals
 * new ones. History runs well past the 7-day attribution window on purpose:
 * without matured clicks there would be no expired conversions to show.
 */
const HISTORY_DAYS = 21;
const FUTURE_DAYS = 7;

/** Conversions upload to Meta on a daily batch, so the last day's worth is still queued. */
const CAPI_BATCH_MS = 24 * 60 * 60 * 1000;

/** A tap that never produced a message is written off after this long. */
const ABANDON_AFTER_MS = 2 * 60 * 60 * 1000;

/* ─────────────────────────── Per-ad behaviour ─────────────────────────── */

/**
 * Delivery and funnel characteristics per ad. These are the demo's editorial
 * content: the seeded ads are deliberately shaped so the recommendation engine
 * has three distinct, defensible findings to make on first load.
 */
type AdTuning = {
  tapsPerDay: number;
  ctr: number;
  cpc: number;
  /** Conditional pass-through rates, each given the previous stage. */
  openRate: number;
  startRate: number;
  qualifyRate: number;
  convertRate: number;
  /** Centre of the first-response latency distribution. */
  responseCentreMs: number;
};

const DEFAULT_TUNING: AdTuning = {
  tapsPerDay: 8,
  ctr: 0.018,
  cpc: 40,
  openRate: 0.9,
  startRate: 0.84,
  qualifyRate: 0.35,
  convertRate: 0.3,
  responseCentreMs: 20_000,
};

const AD_TUNING: Record<string, AdTuning> = {
  // Cheap conversations, almost no qualified intent — the objective trap in numbers.
  ad_gold_festive: {
    tapsPerDay: 12,
    ctr: 0.021,
    cpc: 26,
    openRate: 0.92,
    startRate: 0.88,
    qualifyRate: 0.12,
    convertRate: 0.3,
    responseCentreMs: 16_000,
  },
  // Healthy economics, but the team is slow to pick up the thread.
  ad_personal_loan: {
    tapsPerDay: 9,
    ctr: 0.014,
    cpc: 78,
    openRate: 0.9,
    startRate: 0.82,
    qualifyRate: 0.38,
    convertRate: 0.28,
    responseCentreMs: 34_000,
  },
  // Enough conversion volume to have earned a Sales objective, still stuck on Leads.
  ad_sip_starter: {
    tapsPerDay: 14,
    ctr: 0.026,
    cpc: 48,
    openRate: 0.93,
    startRate: 0.86,
    qualifyRate: 0.42,
    convertRate: 0.32,
    responseCentreMs: 9_000,
  },
};

export function tuningFor(adId: string): AdTuning {
  return AD_TUNING[adId] ?? DEFAULT_TUNING;
}

/* ─────────────────────────── PRNG ─────────────────────────── */

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = seed;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Stable per-ad seed so adding an ad never reshuffles the others' history. */
function seedFor(adId: string): number {
  let h = 2166136261;
  for (let i = 0; i < adId.length; i++) {
    h ^= adId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const CLID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Shaped like Meta's opaque click id so nobody is tempted to parse it. */
function makeClid(rng: () => number): string {
  let s = "AR";
  for (let i = 0; i < 24; i++) s += CLID_ALPHABET[Math.floor(rng() * CLID_ALPHABET.length)];
  return s;
}

/* ─────────────────────────── Tap plans (feed-internal) ─────────────────────────── */

type TapPlan = {
  id: string;
  ctwaClid: string;
  adId: string;
  wabaPhoneNumber: string;
  sourceUrl: string;
  leadId: string;
  clickAtMs: number;
  /** Absolute timestamps for each stage the tap will ever reach. */
  reachedAtMs: Partial<Record<OutcomeStage, number>>;
  /** Furthest stage this tap will ever reach. */
  terminalStage: OutcomeStage;
  firstResponseAtMs?: number;
  conversion?: { event: ConversionEventName; value?: number; atMs: number };
};

/** Leads that will be shown as ad-sourced. The rest of the tap log gets synthetic ids. */
const REAL_LEAD_IDS = LEAD_RECORDS.filter((_, i) => i % 5 < 2).map((l) => l.id);

function planTapsForAd(ad: CtwaAd): TapPlan[] {
  const t = tuningFor(ad.id);
  const rng = mulberry32(seedFor(ad.id));
  const plans: TapPlan[] = [];
  const startMs = SIM_EPOCH_MS - HISTORY_DAYS * DAY_MS;
  const spanMs = (HISTORY_DAYS + FUTURE_DAYS) * DAY_MS;
  const count = Math.round(t.tapsPerDay * (HISTORY_DAYS + FUTURE_DAYS));

  for (let i = 0; i < count; i++) {
    // Spread evenly across the span, then jitter, so density stays even as the
    // clock advances instead of clumping at one end.
    const clickAtMs = Math.round(startMs + ((i + rng()) / count) * spanMs);

    const reachedAtMs: Partial<Record<OutcomeStage, number>> = { clicked: clickAtMs };
    let terminalStage: OutcomeStage = "clicked";
    let firstResponseAtMs: number | undefined;
    let conversion: TapPlan["conversion"];

    if (rng() < t.openRate) {
      const openedAtMs = clickAtMs + 5_000 + Math.round(rng() * 55_000);
      reachedAtMs.opened_whatsapp = openedAtMs;
      terminalStage = "opened_whatsapp";

      if (rng() < t.startRate) {
        const startedAtMs = openedAtMs + 3_000 + Math.round(rng() * 37_000);
        reachedAtMs.conversation_started = startedAtMs;
        terminalStage = "conversation_started";

        // Log-ish spread around the centre: mostly fast, with a heavy tail.
        firstResponseAtMs = startedAtMs + Math.round(t.responseCentreMs * (0.35 + rng() * rng() * 3.4));

        if (rng() < t.qualifyRate) {
          const qualifiedAtMs = startedAtMs + 2 * 60_000 + Math.round(rng() * 6 * 60 * 60_000);
          reachedAtMs.qualified = qualifiedAtMs;
          terminalStage = "qualified";

          if (rng() < t.convertRate) {
            // ~9% convert after the attribution window has closed. Those events
            // are still true — Meta just won't accept them, which is the point.
            const late = rng() < 0.09;
            const convertedAtMs = late
              ? clickAtMs + CAPI_WINDOW_MS + Math.round(rng() * 2 * DAY_MS)
              : qualifiedAtMs + 10 * 60_000 + Math.round(rng() * 1.5 * DAY_MS);
            reachedAtMs.converted = convertedAtMs;
            terminalStage = "converted";

            const point = ad.conversionPoints[Math.floor(rng() * Math.max(1, ad.conversionPoints.length))];
            if (point) conversion = { event: point.event, value: point.value, atMs: convertedAtMs };
          }
        }
      }
    }

    plans.push({
      id: `cv_${ad.id.slice(3)}_${i}`,
      ctwaClid: makeClid(rng),
      adId: ad.id,
      wabaPhoneNumber: ad.wabaPhoneNumber,
      sourceUrl: `https://www.facebook.com/ads/${ad.id}`,
      leadId: "",
      clickAtMs,
      reachedAtMs,
      terminalStage,
      firstResponseAtMs,
      conversion,
    });
  }

  return plans;
}

/** Builds the whole tap log and hands out the real lead ids in chronological order. */
function planAllTaps(ads: CtwaAd[]): TapPlan[] {
  const plans = ads
    .filter((a) => a.status === "active")
    .flatMap(planTapsForAd)
    .sort((a, b) => a.clickAtMs - b.clickAtMs);

  let cursor = 0;
  const stride = Math.max(1, Math.floor(plans.length / Math.max(1, REAL_LEAD_IDS.length)));
  for (let i = 0; i < plans.length; i++) {
    const real = i % stride === 0 && cursor < REAL_LEAD_IDS.length;
    plans[i].leadId = real ? REAL_LEAD_IDS[cursor++] : `l_ctwa_${1000 + i}`;
  }
  return plans;
}

/* ─────────────────────────── Materialisation ─────────────────────────── */

function iso(ms: number) {
  return new Date(ms).toISOString();
}

/** Resolves a plan against the clock. Pure: same plan + same clock → same record. */
function materialize(plan: TapPlan, nowMs: number): CtwaConversation | null {
  if (plan.clickAtMs > nowMs) return null;

  let stage: OutcomeStage = "clicked";
  let stageAtMs = plan.clickAtMs;
  for (const s of ["opened_whatsapp", "conversation_started", "qualified", "converted"] as const) {
    const at = plan.reachedAtMs[s];
    if (at === undefined || at > nowMs) break;
    stage = s;
    stageAtMs = at;
  }

  // A tap that was never going to produce a message, and has had long enough to
  // do so, is a genuine drop-off. Conversations that stalled mid-funnel keep
  // their furthest stage — that stall is exactly what outcome audiences target.
  if (
    (plan.terminalStage === "clicked" || plan.terminalStage === "opened_whatsapp") &&
    stage === plan.terminalStage &&
    nowMs - stageAtMs > ABANDON_AFTER_MS
  ) {
    stage = "dropped";
  }

  const responded = plan.firstResponseAtMs !== undefined && plan.firstResponseAtMs <= nowMs;
  const startedAtMs = plan.reachedAtMs.conversation_started;
  const converted = stage === "converted" && plan.conversion;

  return {
    id: plan.id,
    ctwaClid: plan.ctwaClid,
    sourceType: "ad",
    sourceId: plan.adId,
    sourceUrl: plan.sourceUrl,
    wabaPhoneNumber: plan.wabaPhoneNumber,
    leadId: plan.leadId,
    startedAt: iso(plan.clickAtMs),
    startedAtMs: plan.clickAtMs,
    firstResponseAt: responded ? iso(plan.firstResponseAtMs!) : undefined,
    firstResponseLatencyMs:
      responded && startedAtMs !== undefined ? plan.firstResponseAtMs! - startedAtMs : undefined,
    outcomeStage: stage,
    stageAtMs,
    conversionEvent: converted ? plan.conversion!.event : undefined,
    conversionValue: converted ? plan.conversion!.value : undefined,
  };
}

function capiStatus(clickAtMs: number, eventAtMs: number, nowMs: number): CapiEventStatus {
  if (eventAtMs - clickAtMs > CAPI_WINDOW_MS) return "expired";
  if (nowMs - eventAtMs < CAPI_BATCH_MS) return "pending";
  return "sent";
}

/**
 * One event per converted tap — the 1-per-click cap is structural here, not a
 * check, because a tap has exactly one plan and a plan has at most one
 * conversion. A real feed has to enforce it explicitly.
 */
function materializeCapi(plan: TapPlan, nowMs: number, currency: string): CapiEvent | null {
  const c = plan.conversion;
  if (!c || c.atMs > nowMs) return null;
  return {
    id: `capi_${plan.id}`,
    ctwaClid: plan.ctwaClid,
    conversationId: plan.id,
    adId: plan.adId,
    eventName: c.event,
    actionSource: "business_messaging",
    messagingChannel: "whatsapp",
    eventTimeMs: c.atMs,
    clickTimeMs: plan.clickAtMs,
    value: c.value,
    currency,
    status: capiStatus(plan.clickAtMs, c.atMs, nowMs),
  };
}

/* ─────────────────────────── Feed interface ─────────────────────────── */

/**
 * The stable seam. Swapping the mock for real webhooks means providing another
 * object with these two methods; no consumer changes.
 */
export interface CtwaFeed {
  conversationsAt(nowMs: number): CtwaConversation[];
  capiEventsAt(nowMs: number): CapiEvent[];
}

export function createMockFeed(ads: CtwaAd[], currency = "INR"): CtwaFeed {
  const plans = planAllTaps(ads);
  return {
    conversationsAt(nowMs) {
      const out: CtwaConversation[] = [];
      for (const p of plans) {
        const c = materialize(p, nowMs);
        if (c) out.push(c);
      }
      return out.sort((a, b) => b.startedAtMs - a.startedAtMs);
    },
    capiEventsAt(nowMs) {
      const out: CapiEvent[] = [];
      for (const p of plans) {
        const e = materializeCapi(p, nowMs, currency);
        if (e) out.push(e);
      }
      return out.sort((a, b) => b.eventTimeMs - a.eventTimeMs);
    },
  };
}

/* ─────────────────────────── Performance rollup ─────────────────────────── */

type Bucket = {
  clicks: number;
  conversationsStarted: number;
  qualifiedLeads: number;
  purchases: number;
  impressions: number;
  spend: number;
  revenue: number;
  latencySum: number;
  latencyCount: number;
};

function emptyBucket(): Bucket {
  return {
    clicks: 0,
    conversationsStarted: 0,
    qualifiedLeads: 0,
    purchases: 0,
    impressions: 0,
    spend: 0,
    revenue: 0,
    latencySum: 0,
    latencyCount: 0,
  };
}

function ratio(n: number, d: number) {
  return d > 0 ? n / d : 0;
}

/**
 * Rolls the tap log up to ad, ad-set or Meta-campaign level.
 *
 * Impressions and spend are derived from the click count via each ad's CTR and
 * CPC rather than tracked separately, so every rate on screen reconciles with
 * the conversation table by construction.
 */
export function rollUpPerformance(
  scope: PerformanceScope,
  ads: CtwaAd[],
  conversations: CtwaConversation[],
): AdPerformance[] {
  const adById = new Map(ads.map((a) => [a.id, a]));
  const buckets = new Map<string, { name: string; b: Bucket }>();

  const keyOf = (ad: CtwaAd) =>
    scope === "ad" ? ad.id : scope === "adset" ? ad.adSetId : ad.metaCampaignId;
  const nameOf = (ad: CtwaAd) =>
    scope === "ad" ? ad.name : scope === "adset" ? ad.adSetName : ad.metaCampaignName;

  for (const c of conversations) {
    const ad = adById.get(c.sourceId);
    if (!ad) continue;
    const key = keyOf(ad);
    let entry = buckets.get(key);
    if (!entry) {
      entry = { name: nameOf(ad), b: emptyBucket() };
      buckets.set(key, entry);
    }
    const b = entry.b;
    const t = tuningFor(ad.id);

    b.clicks += 1;
    b.impressions += 1 / t.ctr;
    b.spend += t.cpc;

    if (c.outcomeStage !== "clicked" && c.outcomeStage !== "opened_whatsapp" && c.outcomeStage !== "dropped") {
      b.conversationsStarted += 1;
    }
    if (c.outcomeStage === "qualified" || c.outcomeStage === "converted") b.qualifiedLeads += 1;
    if (c.outcomeStage === "converted") {
      b.purchases += 1;
      b.revenue += c.conversionValue ?? 0;
    }
    if (c.firstResponseLatencyMs !== undefined) {
      b.latencySum += c.firstResponseLatencyMs;
      b.latencyCount += 1;
    }
  }

  return [...buckets.entries()]
    .map(([id, { name, b }]) => ({
      scope,
      id,
      name,
      impressions: Math.round(b.impressions),
      clicks: b.clicks,
      conversationsStarted: b.conversationsStarted,
      costPerConversationStarted: ratio(b.spend, b.conversationsStarted),
      qualifiedLeads: b.qualifiedLeads,
      cpl: ratio(b.spend, b.qualifiedLeads),
      purchases: b.purchases,
      cpp: ratio(b.spend, b.purchases),
      spend: Math.round(b.spend),
      revenue: Math.round(b.revenue),
      roas: ratio(b.revenue, b.spend),
      avgFirstResponseLatencyMs: Math.round(ratio(b.latencySum, b.latencyCount)),
    }))
    .sort((a, b) => b.spend - a.spend);
}
