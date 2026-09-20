/**
 * Ask Pi — Skills catalog.
 *
 * The curated "book of moves" Pi draws on for skeleton-first campaign
 * building. Each entry is one (industry × usecase) pair with:
 *   - keywords that classify_brief matches against a user's natural brief
 *   - a canonical skeleton DAG (kinds + wiring, no asset ids)
 *   - a follow-up prompt list surfaced by suggest_next_step
 *
 * Kept as a plain TS module (not D1) so the catalog is deterministic and
 * ships with the code. Extend by adding entries here, not by touching Pi's
 * runtime.
 */
import type { NodeKind } from "@/lib/campaign-types";

export type SkeletonNode = {
  /** Placeholder id following the workspace `<kind>_<n>` convention. */
  id: string;
  kind: NodeKind;
  title: string;
  subtitle?: string;
  /** Config keys the user (or Pi) still needs to fill after the skeleton
   *  lands. Feeds suggest_next_step and the "open config" tally. */
  needs?: string[];
};

export type SkeletonEdge = {
  id: string;
  source: string;
  target: string;
  /** Named handle when the source has multiple outputs (e.g. `timeout`,
   *  `failure`, a conditional branch id). Omit for the default output. */
  sourceHandle?: string;
};

export type Skeleton = {
  /** Human title for the shape ("Insurance renewal — 2-branch"). */
  title: string;
  /** One-line summary. Shown in chips + confirm cards. */
  summary: string;
  nodes: SkeletonNode[];
  edges: SkeletonEdge[];
};

export type SkillCatalogEntry = {
  industry: Industry;
  usecase: Usecase;
  /** Label shown in chips ("Insurance renewal reminder"). */
  label: string;
  /** One-line description. Chip hint. */
  hint: string;
  /** Words / phrases the classifier looks for in a natural brief. Case-
   *  insensitive. Match ANY = considered a hit. */
  keywords: string[];
  skeleton: Skeleton;
  /** Suggested next steps after the skeleton lands. Pi surfaces these as
   *  chips via suggest_next_step. */
  followUps: FollowUp[];
};

export type FollowUp = {
  id: string;
  label: string;
  /** Optional hint under the chip label. */
  hint?: string;
};

export const INDUSTRIES = [
  "bfsi",
  "retail",
  "travel",
  "edtech",
  "healthtech",
  "utilities",
  "other",
] as const;
export type Industry = typeof INDUSTRIES[number];

export const USECASES = [
  "renewal",
  "collection",
  "cart_abandonment",
  "order_confirmation",
  "onboarding",
  "cross_sell",
  "broadcast_offer",
  "feedback_nps",
  "reactivation",
  "activation",
  "delivery_update",
  "other",
] as const;
export type Usecase = typeof USECASES[number];

/** Keyword hints per industry. Used by classify_brief. */
export const INDUSTRY_KEYWORDS: Record<Industry, string[]> = {
  bfsi: ["insurance", "policy", "premium", "loan", "emi", "credit card", "bank", "renewal", "kyc", "mutual fund", "sip"],
  retail: ["cart", "checkout", "order", "product", "sku", "discount", "coupon", "shop", "brand", "purchase"],
  travel: ["flight", "hotel", "booking", "trip", "itinerary", "check-in", "boarding"],
  edtech: ["course", "class", "lesson", "batch", "enrollment", "student", "tutor"],
  healthtech: ["appointment", "consultation", "prescription", "lab", "clinic", "doctor", "patient"],
  utilities: ["bill", "recharge", "electricity", "gas", "broadband", "dth", "postpaid", "prepaid"],
  other: [],
};

/** Keyword hints per usecase. */
export const USECASE_KEYWORDS: Record<Usecase, string[]> = {
  renewal: ["renewal", "renew", "expires", "expiring", "expiry"],
  collection: ["overdue", "collection", "dues", "recovery", "delinquent", "dpd", "past due"],
  cart_abandonment: ["cart", "abandon", "left", "checkout drop"],
  order_confirmation: ["order confirm", "order confirmation", "confirmed order", "shipped", "dispatched"],
  onboarding: ["onboarding", "welcome", "first time", "new user", "signed up"],
  cross_sell: ["cross sell", "cross-sell", "upsell", "recommend", "next best", "add-on"],
  broadcast_offer: ["broadcast", "offer", "promo", "campaign blast", "announcement", "sale"],
  feedback_nps: ["feedback", "nps", "rating", "review", "csat", "survey"],
  reactivation: ["reactivate", "winback", "dormant", "inactive", "lapsed"],
  activation: ["activate", "activation", "not activated"],
  delivery_update: ["delivery", "tracking", "shipment", "eta", "out for delivery"],
  other: [],
};

const $node = (id: string, kind: NodeKind, title: string, subtitle?: string, needs?: string[]): SkeletonNode =>
  ({ id, kind, title, ...(subtitle ? { subtitle } : {}), ...(needs ? { needs } : {}) });

const $edge = (id: string, source: string, target: string, sourceHandle?: string): SkeletonEdge =>
  ({ id, source, target, ...(sourceHandle ? { sourceHandle } : {}) });

/**
 * The catalog itself. Order matters ONLY for tie-breaking in
 * classify_brief; when two entries score the same, the earlier one wins,
 * so put the higher-conviction defaults first per industry.
 */
export const SKILL_CATALOG: SkillCatalogEntry[] = [
  {
    industry: "bfsi",
    usecase: "renewal",
    label: "Insurance renewal reminder",
    hint: "Nudge policy holders in the renewal window; voice fallback if WA times out",
    keywords: ["insurance renewal", "policy renewal", "renewal reminder", "premium due"],
    skeleton: {
      title: "Insurance renewal — 2-branch",
      summary: "Audience > branch by renewal window > WA template > Voice fallback on timeout > End",
      nodes: [
        $node("conditional_1", "conditional", "Renewal window", "Split by days-to-renewal", ["branches"]),
        $node("whatsapp_1", "whatsapp", "WA reminder (5-day)", "Renewal in 5 days", ["templateId"]),
        $node("voiceCall_1", "voiceCall", "Voice fallback", "Runs on WA timeout", ["agentId"]),
        $node("whatsapp_2", "whatsapp", "WA reminder (30-day)", "Renewal in 30 days", ["templateId"]),
      ],
      edges: [
        $edge("e_a_c1", "audience", "conditional_1"),
        $edge("e_c1_wa1", "conditional_1", "whatsapp_1", "branch_1"),
        $edge("e_c1_wa2", "conditional_1", "whatsapp_2", "branch_2"),
        $edge("e_wa1_vc1", "whatsapp_1", "voiceCall_1", "timeout"),
        $edge("e_wa1_end", "whatsapp_1", "end"),
        $edge("e_vc1_end", "voiceCall_1", "end"),
        $edge("e_wa2_end", "whatsapp_2", "end"),
      ],
    },
    followUps: [
      { id: "pick_wa_5d", label: "Pick WhatsApp template for the 5-day branch" },
      { id: "pick_wa_30d", label: "Pick WhatsApp template for the 30-day branch" },
      { id: "pick_voice", label: "Pick voice agent for the fallback call" },
      { id: "add_sms", label: "Add SMS fallback if voice also fails", hint: "Extra safety net" },
    ],
  },
  {
    industry: "bfsi",
    usecase: "collection",
    label: "Loan / EMI collection",
    hint: "Bucketed reminder ladder by DPD (days past due)",
    keywords: ["emi collection", "loan collection", "loan overdue", "dpd bucket", "recovery"],
    skeleton: {
      title: "Collection — 3-bucket ladder",
      summary: "Audience > branch by DPD bucket > SMS (0-30) / WA+Voice (30-60) / Voice (60+) > End",
      nodes: [
        $node("conditional_1", "conditional", "DPD bucket", "0-30 / 30-60 / 60+", ["branches"]),
        $node("sms_1", "sms", "Soft reminder SMS", "DPD 0-30", ["templateId"]),
        $node("whatsapp_1", "whatsapp", "WA payment reminder", "DPD 30-60", ["templateId"]),
        $node("voiceCall_1", "voiceCall", "Voice recovery call", "WA timeout fallback", ["agentId"]),
        $node("voiceCall_2", "voiceCall", "Hard recovery call", "DPD 60+", ["agentId"]),
      ],
      edges: [
        $edge("e_a_c1", "audience", "conditional_1"),
        $edge("e_c1_sms1", "conditional_1", "sms_1", "branch_1"),
        $edge("e_c1_wa1", "conditional_1", "whatsapp_1", "branch_2"),
        $edge("e_c1_vc2", "conditional_1", "voiceCall_2", "branch_3"),
        $edge("e_wa1_vc1", "whatsapp_1", "voiceCall_1", "timeout"),
        $edge("e_wa1_end", "whatsapp_1", "end"),
        $edge("e_vc1_end", "voiceCall_1", "end"),
        $edge("e_sms1_end", "sms_1", "end"),
        $edge("e_vc2_end", "voiceCall_2", "end"),
      ],
    },
    followUps: [
      { id: "pick_sms_soft", label: "Pick SMS template for the soft-reminder branch" },
      { id: "pick_wa_mid", label: "Pick WA template for the mid-DPD branch" },
      { id: "pick_voice_soft", label: "Pick voice agent for the soft recovery call" },
      { id: "pick_voice_hard", label: "Pick voice agent for the hard recovery call" },
    ],
  },
  {
    industry: "bfsi",
    usecase: "activation",
    label: "Credit card activation",
    hint: "Nudge card-holders to activate; voice fallback if still inactive after 24h",
    keywords: ["credit card activation", "card activation", "activate card"],
    skeleton: {
      title: "Card activation — nudge + fallback",
      summary: "Audience > WA activation nudge > Delay 24h > Conditional (activated?) > Voice or End",
      nodes: [
        $node("whatsapp_1", "whatsapp", "WA activation nudge", undefined, ["templateId"]),
        $node("delay_1", "delay", "Wait 24h", "Give the user time to activate", ["duration"]),
        $node("conditional_1", "conditional", "Activated?", "Branch on activation status", ["branches"]),
        $node("voiceCall_1", "voiceCall", "Voice reminder", "Only if still inactive", ["agentId"]),
      ],
      edges: [
        $edge("e_a_wa1", "audience", "whatsapp_1"),
        $edge("e_wa1_d1", "whatsapp_1", "delay_1"),
        $edge("e_d1_c1", "delay_1", "conditional_1"),
        $edge("e_c1_vc1", "conditional_1", "voiceCall_1", "branch_1"),
        $edge("e_c1_end", "conditional_1", "end", "branch_2"),
        $edge("e_vc1_end", "voiceCall_1", "end"),
      ],
    },
    followUps: [
      { id: "pick_wa", label: "Pick WhatsApp activation template" },
      { id: "pick_voice", label: "Pick voice agent for the reminder call" },
      { id: "tune_delay", label: "Change the delay window", hint: "Default 24h" },
    ],
  },
  {
    industry: "retail",
    usecase: "cart_abandonment",
    label: "Cart abandonment recovery",
    hint: "WA nudge, wait, then SMS discount if not purchased",
    keywords: ["cart abandonment", "abandoned cart", "checkout drop"],
    skeleton: {
      title: "Cart abandonment — 2-step",
      summary: "Audience > WA cart nudge > Delay 2h > Conditional (purchased?) > SMS discount or End",
      nodes: [
        $node("whatsapp_1", "whatsapp", "WA cart nudge", undefined, ["templateId"]),
        $node("delay_1", "delay", "Wait 2h", "Give the user time to complete", ["duration"]),
        $node("conditional_1", "conditional", "Purchased?", "Branch on purchase status", ["branches"]),
        $node("sms_1", "sms", "SMS with discount", "Only if not purchased", ["templateId"]),
      ],
      edges: [
        $edge("e_a_wa1", "audience", "whatsapp_1"),
        $edge("e_wa1_d1", "whatsapp_1", "delay_1"),
        $edge("e_d1_c1", "delay_1", "conditional_1"),
        $edge("e_c1_sms1", "conditional_1", "sms_1", "branch_1"),
        $edge("e_c1_end", "conditional_1", "end", "branch_2"),
        $edge("e_sms1_end", "sms_1", "end"),
      ],
    },
    followUps: [
      { id: "pick_wa", label: "Pick WhatsApp cart-recovery template" },
      { id: "pick_sms", label: "Pick SMS discount template" },
      { id: "tune_delay", label: "Change the wait window", hint: "Default 2h" },
    ],
  },
  {
    industry: "retail",
    usecase: "order_confirmation",
    label: "Order confirmation",
    hint: "Single WA confirmation with order details",
    keywords: ["order confirmation", "order confirmed", "purchase confirmation"],
    skeleton: {
      title: "Order confirmation — 1-step",
      summary: "Audience > WA order confirmation > End",
      nodes: [
        $node("whatsapp_1", "whatsapp", "WA order confirmation", undefined, ["templateId"]),
      ],
      edges: [
        $edge("e_a_wa1", "audience", "whatsapp_1"),
        $edge("e_wa1_end", "whatsapp_1", "end"),
      ],
    },
    followUps: [
      { id: "pick_wa", label: "Pick WA order-confirmation template" },
      { id: "add_delivery", label: "Add a delivery-status update flow later" },
    ],
  },
  {
    industry: "other",
    usecase: "broadcast_offer",
    label: "Broadcast offer with A/B",
    hint: "Split audience 50/50 across two channels or two templates",
    keywords: ["broadcast", "promo", "offer", "sale", "announcement"],
    skeleton: {
      title: "Broadcast offer — A/B split",
      summary: "Audience > A/B split 50/50 > WA (A) / SMS (B) > End",
      nodes: [
        $node("abSplit_1", "abSplit", "A/B split", "50/50", ["variants"]),
        $node("whatsapp_1", "whatsapp", "WA variant A", "50%", ["templateId"]),
        $node("sms_1", "sms", "SMS variant B", "50%", ["templateId"]),
      ],
      edges: [
        $edge("e_a_ab1", "audience", "abSplit_1"),
        $edge("e_ab1_wa1", "abSplit_1", "whatsapp_1", "variant_a"),
        $edge("e_ab1_sms1", "abSplit_1", "sms_1", "variant_b"),
        $edge("e_wa1_end", "whatsapp_1", "end"),
        $edge("e_sms1_end", "sms_1", "end"),
      ],
    },
    followUps: [
      { id: "pick_wa_a", label: "Pick WA template for variant A" },
      { id: "pick_sms_b", label: "Pick SMS template for variant B" },
      { id: "change_split", label: "Change the split ratio", hint: "Default 50/50" },
    ],
  },
  {
    industry: "other",
    usecase: "feedback_nps",
    label: "Feedback / NPS",
    hint: "WA rating, branch by score, callback for detractors",
    keywords: ["nps", "feedback", "rating", "csat"],
    skeleton: {
      title: "Feedback — rate + branch",
      summary: "Audience > WA rating > Conditional (score) > Voice callback (low) / SMS thanks (high)",
      nodes: [
        $node("whatsapp_1", "whatsapp", "WA rating request", "Buttons: 1-5", ["templateId"]),
        $node("conditional_1", "conditional", "Score?", "Low vs high", ["branches"]),
        $node("voiceCall_1", "voiceCall", "Callback (low score)", undefined, ["agentId"]),
        $node("sms_1", "sms", "Thanks (high score)", undefined, ["templateId"]),
      ],
      edges: [
        $edge("e_a_wa1", "audience", "whatsapp_1"),
        $edge("e_wa1_c1", "whatsapp_1", "conditional_1"),
        $edge("e_c1_vc1", "conditional_1", "voiceCall_1", "branch_1"),
        $edge("e_c1_sms1", "conditional_1", "sms_1", "branch_2"),
        $edge("e_vc1_end", "voiceCall_1", "end"),
        $edge("e_sms1_end", "sms_1", "end"),
      ],
    },
    followUps: [
      { id: "pick_wa", label: "Pick WA rating template" },
      { id: "pick_voice", label: "Pick voice agent for the callback" },
      { id: "pick_sms", label: "Pick SMS thank-you template" },
    ],
  },
  {
    industry: "other",
    usecase: "reactivation",
    label: "Dormant user reactivation",
    hint: "WA nudge with offer, escalate to voice if no response",
    keywords: ["reactivate", "winback", "dormant", "inactive"],
    skeleton: {
      title: "Reactivation — nudge + escalate",
      summary: "Audience > WA winback > Voice on timeout > End",
      nodes: [
        $node("whatsapp_1", "whatsapp", "WA winback nudge", undefined, ["templateId"]),
        $node("voiceCall_1", "voiceCall", "Voice escalation", "On WA timeout", ["agentId"]),
      ],
      edges: [
        $edge("e_a_wa1", "audience", "whatsapp_1"),
        $edge("e_wa1_vc1", "whatsapp_1", "voiceCall_1", "timeout"),
        $edge("e_wa1_end", "whatsapp_1", "end"),
        $edge("e_vc1_end", "voiceCall_1", "end"),
      ],
    },
    followUps: [
      { id: "pick_wa", label: "Pick WA winback template" },
      { id: "pick_voice", label: "Pick voice agent for the escalation" },
    ],
  },
];

/** Compact catalog shape for Pi's context — no full skeletons, just the
 *  index so Pi knows what's available without ballooning the prompt. */
export function summarizeCatalogForContext(): Array<{
  industry: Industry;
  usecase: Usecase;
  label: string;
  hint: string;
}> {
  return SKILL_CATALOG.map((e) => ({
    industry: e.industry,
    usecase: e.usecase,
    label: e.label,
    hint: e.hint,
  }));
}
