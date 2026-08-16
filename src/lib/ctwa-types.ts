/**
 * Click-to-WhatsApp Ads (CTWA) domain model.
 *
 * CTWA is a Meta ad on Facebook/Instagram whose tap target is a WhatsApp
 * conversation rather than a landing page. That single fact drives the whole
 * model: there is no pixel and no site visit, so the *conversation* is the
 * conversion surface and the only durable join key between Meta's side and
 * ours is the `ctwa_clid` Meta stamps on the inbound message.
 *
 * Field names deliberately track Meta Marketing API / Conversions API spelling
 * (`OUTCOME_LEADS`, `action_source`, `messaging_channel`) so a future backend
 * maps 1:1 instead of translating. Everything here is plain data — the mock
 * feed in {@link file://./ctwa-sim.ts} and the real webhook feed a backend will
 * ship both produce these same shapes.
 */

/* ─────────────────────────── Account linkage ─────────────────────────── */

/**
 * A merchant's linked Meta + WhatsApp assets.
 *
 * Modelled as one record rather than separate FB/WABA connections because CTWA
 * only works when *both* halves are present: the ad lives on a Page under a
 * Business Portfolio, and its tap destination is a phone number on a WABA. A
 * half-connected state can't serve an ad, so it isn't worth representing.
 */
export type AdAccountConnection = {
  fbBusinessId: string;
  fbBusinessName: string;
  fbPageId: string;
  fbPageName: string;
  adAccountId: string;
  wabaId: string;
  wabaPhoneNumber: string;
  status: "connected";
  connectedAt: string;
};

/* ─────────────────────────── Ad entity ─────────────────────────── */

export type AdFormat = "image" | "video" | "carousel";

/** Meta campaign objective. Constrains {@link OptimizationGoal} — see {@link allowedGoals}. */
export type AdObjective = "OUTCOME_LEADS" | "OUTCOME_SALES" | "OUTCOME_ENGAGEMENT";

export type OptimizationGoal = "CONVERSATIONS" | "OFFSITE_CONVERSIONS";

export type AdStatus =
  | "draft"
  | "in_review"
  | "active"
  | "rejected"
  | "paused"
  | "completed";

export type AdTargeting = {
  geo: string[];
  ageRange: { min: number; max: number };
  gender: "all" | "male" | "female";
  interests: string[];
  customAudienceIds: string[];
  lookalikeSourceId?: string;
};

export type CtwaAd = {
  // identity + creative
  id: string;
  name: string;
  caption: string;
  headline: string;
  mediaUrl: string;
  format: AdFormat;

  // Meta config
  objective: AdObjective;
  optimizationGoal: OptimizationGoal;
  destination: "whatsapp";
  wabaPhoneNumber: string;
  /** Seeded into the user's WhatsApp composer on tap. Meta calls this the welcome message. */
  prefilledMessage: string;

  targeting: AdTargeting;

  // budget + schedule (minor units are not used — whole currency units, like the rest of the app)
  dailyBudget: number;
  startAt: string;
  endAt?: string;
  estimatedReach: { low: number; high: number };

  // lifecycle
  status: AdStatus;
  rejectionReason?: string;

  /** The PiCom campaign inbound taps enter. Optional: an ad can run unattached. */
  campaignId?: string;

  /** Meta hierarchy this ad sits under — attribution rolls up along these. */
  adSetId: string;
  adSetName: string;
  metaCampaignId: string;
  metaCampaignName: string;

  /** High-value events fed back to Meta. Capped at {@link MAX_CONVERSION_POINTS}. */
  conversionPoints: ConversionPoint[];

  createdAt: string;
  submittedAt?: string;
};

/* ─────────────────────────── Conversion points ─────────────────────────── */

export type ConversionEventName =
  | "qualified_lead"
  | "quote_requested"
  | "appointment_booked"
  | "whatsapp_order";

export type ConversionPoint = {
  id: string;
  event: ConversionEventName;
  label: string;
  /** Revenue attributed when this event fires. Drives ROAS; omit for non-monetary events. */
  value?: number;
};

/**
 * Meta caps the high-value events an ad can optimise against. Beyond a small
 * number the signal stops being "high-value" and delivery optimisation degrades,
 * so the UI enforces the cap rather than letting a merchant dilute their own ad.
 */
export const MAX_CONVERSION_POINTS = 3;

export const CONVERSION_EVENT_LABELS: Record<ConversionEventName, string> = {
  qualified_lead: "Qualified lead",
  quote_requested: "Quote requested",
  appointment_booked: "Appointment booked",
  whatsapp_order: "WhatsApp order",
};

/* ─────────────────────────── Conversation (attribution spine) ─────────────────────────── */

/**
 * Stages a tap moves through. Ordered: each stage implies every earlier one, so
 * funnel counts are cumulative suffix-sums over this list (see `stageAtLeast`).
 * `dropped` is terminal and sits outside the ordering.
 */
export type OutcomeStage =
  | "clicked"
  | "opened_whatsapp"
  | "conversation_started"
  | "qualified"
  | "converted"
  | "dropped";

export const OUTCOME_STAGE_ORDER: OutcomeStage[] = [
  "clicked",
  "opened_whatsapp",
  "conversation_started",
  "qualified",
  "converted",
];

export const OUTCOME_STAGE_LABELS: Record<OutcomeStage, string> = {
  clicked: "Clicked",
  opened_whatsapp: "Opened WhatsApp",
  conversation_started: "Conversation started",
  qualified: "Qualified",
  converted: "Converted",
  dropped: "Dropped",
};

/** True when `stage` is at or beyond `floor` in {@link OUTCOME_STAGE_ORDER}. `dropped` never qualifies. */
export function stageAtLeast(stage: OutcomeStage, floor: OutcomeStage): boolean {
  const s = OUTCOME_STAGE_ORDER.indexOf(stage);
  const f = OUTCOME_STAGE_ORDER.indexOf(floor);
  if (s === -1 || f === -1) return false;
  return s >= f;
}

/**
 * One inbound tap → conversation. The `ctwaClid` is the join key: Meta stamps it
 * on the first inbound message and it is the ONLY way to tie a WhatsApp thread
 * back to the ad that produced it. Everything downstream (CAPI, attribution,
 * outcome audiences) hangs off this record.
 */
export type CtwaConversation = {
  id: string;
  /** Meta click id, `ctwa_clid` on the inbound webhook payload. */
  ctwaClid: string;
  sourceType: "ad";
  /** {@link CtwaAd.id}. */
  sourceId: string;
  sourceUrl: string;
  wabaPhoneNumber: string;
  leadId: string;
  startedAt: string;
  startedAtMs: number;
  /** When the business replied. Drives the fast-first-response quality signal. */
  firstResponseAt?: string;
  firstResponseLatencyMs?: number;
  outcomeStage: OutcomeStage;
  /**
   * Furthest stage actually attained, kept separately because `outcomeStage`
   * flips to `dropped` once a thread is written off and would otherwise erase
   * the fact that it opened WhatsApp first. The funnel counts this; audiences
   * and cost metrics read `outcomeStage`, which is the current truth.
   */
  reachedStage: OutcomeStage;
  /** When the conversation last advanced — the clock the audience rules read. */
  stageAtMs: number;
  /** Set once a conversion point is hit. */
  conversionEvent?: ConversionEventName;
  conversionValue?: number;
};

/**
 * Meta's published guidance is that replies inside ~30s materially lift CTWA
 * conversion. Ads whose average latency breaches this are flagged in analytics.
 */
export const FAST_RESPONSE_THRESHOLD_MS = 30_000;

/* ─────────────────────────── CAPI feedback ─────────────────────────── */

export type CapiEventStatus = "pending" | "sent" | "expired";

/**
 * A conversion sent back to Meta so its delivery model learns which taps became
 * revenue. Without this the optimiser only ever sees "conversation started" and
 * happily buys more cheap chatter.
 */
export type CapiEvent = {
  id: string;
  ctwaClid: string;
  conversationId: string;
  adId: string;
  eventName: ConversionEventName;
  actionSource: "business_messaging";
  messagingChannel: "whatsapp";
  eventTimeMs: number;
  /** The originating click — `eventTimeMs - clickTimeMs` must stay inside {@link CAPI_WINDOW_DAYS}. */
  clickTimeMs: number;
  value?: number;
  currency: string;
  status: CapiEventStatus;
};

/** Meta rejects conversions attributed to a click older than this. */
export const CAPI_WINDOW_DAYS = 7;
export const CAPI_WINDOW_MS = CAPI_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** A click may be credited with at most one conversion. */
export const MAX_CAPI_EVENTS_PER_CLICK = 1;

/** Whether a conversion at `eventTimeMs` still falls inside the attribution window. */
export function withinCapiWindow(clickTimeMs: number, eventTimeMs: number): boolean {
  return eventTimeMs - clickTimeMs <= CAPI_WINDOW_MS;
}

/* ─────────────────────────── Outcome audiences ─────────────────────────── */

/**
 * "Reached `stage`, then went quiet for `noDownstreamEventWithinDays`."
 *
 * This is the retargeting primitive that makes the loop closed: people who
 * started a conversation but never converted are the highest-intent segment a
 * merchant owns, and they are invisible to Meta.
 */
export type OutcomeAudienceRule = {
  stage: OutcomeStage;
  noDownstreamEventWithinDays: number;
};

export type OutcomeAudience = {
  id: string;
  name: string;
  /** Scope to one ad, or omit for workspace-wide. */
  adId?: string;
  rule: OutcomeAudienceRule;
  createdAt: string;
};

/* ─────────────────────────── Performance rollup ─────────────────────────── */

export type PerformanceScope = "ad" | "adset" | "campaign";

export type AdPerformance = {
  scope: PerformanceScope;
  id: string;
  name: string;
  impressions: number;
  clicks: number;
  conversationsStarted: number;
  costPerConversationStarted: number;
  qualifiedLeads: number;
  cpl: number;
  purchases: number;
  cpp: number;
  spend: number;
  revenue: number;
  roas: number;
  avgFirstResponseLatencyMs: number;
};

/* ─────────────────────────── Validation ─────────────────────────── */

/**
 * Optimisation goals selectable for a given objective.
 *
 * This encodes the trap that quietly wastes CTWA budget: `OUTCOME_LEADS` can
 * only optimise for `CONVERSATIONS`, so Meta buys people who *open a chat* —
 * cheap, plentiful, and frequently worthless. Buying people who *purchase*
 * requires `OUTCOME_SALES` + `OFFSITE_CONVERSIONS`, which only works if CAPI is
 * feeding real conversion points back. The UI surfaces this rather than letting
 * the merchant discover it three weeks into a burn.
 */
export function allowedGoals(objective: AdObjective): OptimizationGoal[] {
  switch (objective) {
    case "OUTCOME_LEADS":
    case "OUTCOME_ENGAGEMENT":
      return ["CONVERSATIONS"];
    case "OUTCOME_SALES":
      return ["CONVERSATIONS", "OFFSITE_CONVERSIONS"];
  }
}

export const OBJECTIVE_LABELS: Record<AdObjective, string> = {
  OUTCOME_LEADS: "Leads",
  OUTCOME_SALES: "Sales",
  OUTCOME_ENGAGEMENT: "Engagement",
};

export const GOAL_LABELS: Record<OptimizationGoal, string> = {
  CONVERSATIONS: "Conversations",
  OFFSITE_CONVERSIONS: "Conversions",
};

export const AD_STATUS_LABELS: Record<AdStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  active: "Active",
  rejected: "Rejected",
  paused: "Paused",
  completed: "Completed",
};

export type AdValidation = {
  valid: boolean;
  /** Block publishing. */
  errors: string[];
  /** Advisory — the objective trap and CAPI-readiness notes land here. */
  warnings: string[];
};

/** Field-level completeness + the strategic warnings that make CTWA go wrong. */
export function validateAd(ad: CtwaAd): AdValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!ad.name.trim()) errors.push("Ad name is required.");
  if (!ad.headline.trim()) errors.push("Headline is required.");
  if (!ad.caption.trim()) errors.push("Primary text is required.");
  if (!ad.mediaUrl.trim()) errors.push("Creative media is required.");
  if (!ad.wabaPhoneNumber) errors.push("A WhatsApp destination number is required.");
  if (!ad.prefilledMessage.trim()) errors.push("A pre-filled first message is required.");
  if (ad.dailyBudget <= 0) errors.push("Daily budget must be greater than zero.");
  if (ad.targeting.geo.length === 0) errors.push("Select at least one location.");
  if (!allowedGoals(ad.objective).includes(ad.optimizationGoal)) {
    errors.push(
      `${GOAL_LABELS[ad.optimizationGoal]} is not available for the ${OBJECTIVE_LABELS[ad.objective]} objective.`,
    );
  }

  if (ad.objective === "OUTCOME_LEADS") {
    warnings.push(
      "Leads can only optimise for Conversations — Meta will buy people who open a chat, not people who buy. To optimise for buyers, switch to Sales + Conversions and feed conversion points back through CAPI.",
    );
  }
  if (ad.optimizationGoal === "OFFSITE_CONVERSIONS" && ad.conversionPoints.length === 0) {
    warnings.push(
      "Optimising for Conversions with no conversion points defined — Meta has no signal to learn from. Add at least one.",
    );
  }
  if (!ad.campaignId) {
    warnings.push("No campaign linked — inbound taps will land without an automated flow to enter.");
  }

  return { valid: errors.length === 0, errors, warnings };
}
