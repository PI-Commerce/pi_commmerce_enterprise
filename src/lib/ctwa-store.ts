/**
 * CTWA workspace state: the ad set, the outcome audiences, and the sim clock.
 *
 * Same module-store shape as {@link file://./sms-store.ts}. Two things are
 * particular to CTWA:
 *
 *  - conversations and CAPI events are *derived*, not stored. They come from
 *    {@link CtwaFeed} as a pure function of (ads, clock), and are cached here so
 *    `useSyncExternalStore` gets a stable reference between emits. Advancing the
 *    clock is therefore the only way history moves — nothing accumulates, so the
 *    demo can be rewound.
 *  - the only mutable overlay on derived data is the set of CAPI events an
 *    operator has manually dispatched. Everything else the UI edits (ads,
 *    conversion points, audiences) is input to the derivation.
 *
 * In-memory only: a hard refresh resets to seed data and the epoch clock.
 *
 * BACKEND: swap `createMockFeed` for a feed backed by webhooks + your
 * conversation store and delete `advanceSim` / `resetSim`. Every read below
 * keeps working.
 */
import { useMemo, useSyncExternalStore } from "react";
import { SEED_ADS } from "@/lib/ctwa-seed";
import { SIM_EPOCH_MS, createMockFeed, type CtwaFeed } from "@/lib/ctwa-sim";
import {
  MAX_CONVERSION_POINTS,
  type AdStatus,
  type CapiEvent,
  type ConversionPoint,
  type CtwaAd,
  type CtwaConversation,
  type OutcomeAudience,
  type OutcomeAudienceRule,
} from "@/lib/ctwa-types";

const DAY_MS = 24 * 60 * 60 * 1000;

let ads: CtwaAd[] = SEED_ADS;
let audiences: OutcomeAudience[] = [];
let nowMs = SIM_EPOCH_MS;

/** CAPI events an operator pushed early, keyed by event id. */
let dispatched = new Set<string>();

let feed: CtwaFeed = createMockFeed(ads);
let conversations: CtwaConversation[] = [];
let capiEvents: CapiEvent[] = [];

const listeners = new Set<() => void>();

function recompute() {
  conversations = feed.conversationsAt(nowMs);
  capiEvents = feed.capiEventsAt(nowMs).map((e) =>
    e.status === "pending" && dispatched.has(e.id) ? { ...e, status: "sent" as const } : e,
  );
}

recompute();

/**
 * Frozen first-render values. `getServerSnapshot` must not observe client
 * mutations, and the initial derivation is deterministic, so the same arrays are
 * correct on both sides of hydration.
 */
const INITIAL_ADS = ads;
const INITIAL_CONVERSATIONS = conversations;
const INITIAL_CAPI: CapiEvent[] = capiEvents;
const INITIAL_AUDIENCES: OutcomeAudience[] = audiences;

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Ads decide the tap log, so any change to them rebuilds the feed. */
function setAds(next: CtwaAd[]) {
  ads = next;
  feed = createMockFeed(ads);
  recompute();
  emit();
}

/* --------------------------- Ads --------------------------- */

export function getCtwaAds(): CtwaAd[] {
  return ads;
}

export function useCtwaAds(): CtwaAd[] {
  return useSyncExternalStore(subscribe, () => ads, () => INITIAL_ADS);
}

export function getCtwaAd(id: string): CtwaAd | undefined {
  return ads.find((a) => a.id === id);
}

/** Add an ad, or replace the existing entry with the same id. */
export function upsertCtwaAd(ad: CtwaAd) {
  const i = ads.findIndex((a) => a.id === ad.id);
  if (i === -1) setAds([ad, ...ads]);
  else {
    const next = [...ads];
    next[i] = ad;
    setAds(next);
  }
}

export function removeCtwaAd(id: string) {
  setAds(ads.filter((a) => a.id !== id));
}

export function setAdStatus(id: string, status: AdStatus, rejectionReason?: string) {
  const ad = getCtwaAd(id);
  if (!ad) return;
  upsertCtwaAd({
    ...ad,
    status,
    rejectionReason: status === "rejected" ? rejectionReason : undefined,
    submittedAt: status === "in_review" ? new Date(nowMs).toISOString().slice(0, 10) : ad.submittedAt,
  });
}

/** Replace an ad's conversion points, enforcing Meta's cap. */
export function setConversionPoints(adId: string, points: ConversionPoint[]) {
  const ad = getCtwaAd(adId);
  if (!ad) return;
  upsertCtwaAd({ ...ad, conversionPoints: points.slice(0, MAX_CONVERSION_POINTS) });
}

let adSeq = 0;

/** A blank ad in the shape the create flow edits. Not added to the store until saved. */
export function newAdDraft(): CtwaAd {
  const n = ++adSeq;
  return {
    id: `ad_new_${n}`,
    name: "",
    caption: "",
    headline: "",
    mediaUrl: "",
    format: "image",
    objective: "OUTCOME_LEADS",
    optimizationGoal: "CONVERSATIONS",
    destination: "whatsapp",
    wabaPhoneNumber: "",
    prefilledMessage: "",
    targeting: {
      geo: [],
      ageRange: { min: 18, max: 65 },
      gender: "all",
      interests: [],
      customAudienceIds: [],
    },
    dailyBudget: 2500,
    startAt: new Date(nowMs).toISOString().slice(0, 10),
    estimatedReach: { low: 0, high: 0 },
    status: "draft",
    adSetId: `adset_new_${n}`,
    adSetName: "New ad set",
    metaCampaignId: "mc_new",
    metaCampaignName: "New Meta campaign",
    conversionPoints: [],
    createdAt: new Date(nowMs).toISOString().slice(0, 10),
  };
}

/* --------------------------- Conversations --------------------------- */

export function getCtwaConversations(): CtwaConversation[] {
  return conversations;
}

export function useCtwaConversations(): CtwaConversation[] {
  return useSyncExternalStore(subscribe, () => conversations, () => INITIAL_CONVERSATIONS);
}

/** Ad-sourced conversations for a lead — powers the attribution block on Lead detail. */
export function getConversationsForLead(leadId: string): CtwaConversation[] {
  return conversations.filter((c) => c.leadId === leadId);
}

/**
 * Reactive form of {@link getConversationsForLead}.
 *
 * Filters downstream of `useCtwaConversations` rather than inside a snapshot:
 * `getSnapshot` must return a referentially stable value, and a fresh `filter()`
 * on every call would loop forever.
 */
export function useConversationsForLead(leadId: string): CtwaConversation[] {
  const all = useCtwaConversations();
  return useMemo(() => all.filter((c) => c.leadId === leadId), [all, leadId]);
}

/* --------------------------- CAPI --------------------------- */

export function getCapiEvents(): CapiEvent[] {
  return capiEvents;
}

export function useCapiEvents(): CapiEvent[] {
  return useSyncExternalStore(subscribe, () => capiEvents, () => INITIAL_CAPI);
}

/** Ship a queued conversion now instead of waiting for the dispatcher. */
export function dispatchCapiEvent(id: string) {
  if (dispatched.has(id)) return;
  dispatched = new Set(dispatched).add(id);
  recompute();
  emit();
}

export function dispatchAllPendingCapiEvents() {
  const pending = capiEvents.filter((e) => e.status === "pending").map((e) => e.id);
  if (pending.length === 0) return;
  const next = new Set(dispatched);
  for (const id of pending) next.add(id);
  dispatched = next;
  recompute();
  emit();
}

/* --------------------------- Outcome audiences --------------------------- */

export function getOutcomeAudiences(): OutcomeAudience[] {
  return audiences;
}

export function useOutcomeAudiences(): OutcomeAudience[] {
  return useSyncExternalStore(subscribe, () => audiences, () => INITIAL_AUDIENCES);
}

export function addOutcomeAudience(a: OutcomeAudience) {
  audiences = [a, ...audiences];
  emit();
}

export function removeOutcomeAudience(id: string) {
  audiences = audiences.filter((a) => a.id !== id);
  emit();
}

/**
 * Conversations matching "reached this stage, then went quiet".
 *
 * Membership requires the stage to be *exactly* the rule's stage — anything
 * further along is no longer stalled — and the stall to have lasted the full
 * window. Evaluated live rather than snapshotted, so members leave the audience
 * on their own when the conversation moves.
 */
export function outcomeAudienceMembers(
  rule: OutcomeAudienceRule,
  adId?: string,
): CtwaConversation[] {
  const quietMs = rule.noDownstreamEventWithinDays * DAY_MS;
  return conversations.filter(
    (c) =>
      c.outcomeStage === rule.stage &&
      (!adId || c.sourceId === adId) &&
      nowMs - c.stageAtMs >= quietMs,
  );
}

/* --------------------------- Sim clock --------------------------- */

export function getSimNow(): number {
  return nowMs;
}

export function useSimNow(): number {
  return useSyncExternalStore(subscribe, () => nowMs, () => SIM_EPOCH_MS);
}

/** Move the demo clock forward. Never backwards — use `resetSim` for that. */
export function advanceSim(ms: number) {
  if (ms <= 0) return;
  nowMs += ms;
  recompute();
  emit();
}

export function advanceSimDays(days: number) {
  advanceSim(days * DAY_MS);
}

export function resetSim() {
  nowMs = SIM_EPOCH_MS;
  dispatched = new Set();
  recompute();
  emit();
}
