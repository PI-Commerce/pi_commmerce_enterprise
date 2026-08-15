/**
 * Seed CTWA ads and targeting vocabulary.
 *
 * Split out from the store the same way `sms-templates.ts` is split from
 * `sms-store.ts` — the store owns mutation, this owns the fixtures.
 *
 * The six ads are chosen to make the whole feature demonstrable without any
 * user setup: two are deliberately mis-configured in the ways CTWA actually
 * goes wrong (a Leads-objective ad buying cheap chatter, a high-volume ad that
 * has earned the right to switch to Sales), so the recommendation engine has
 * something real to say the moment the page loads.
 */
import type { CtwaAd } from "@/lib/ctwa-types";

export const GEO_OPTIONS = [
  "Mumbai",
  "Delhi NCR",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Pune",
  "Kolkata",
  "Ahmedabad",
  "Jaipur",
  "All India",
];

export const INTEREST_OPTIONS = [
  "Personal finance",
  "Mutual funds",
  "Small business",
  "Online shopping",
  "Credit cards",
  "Insurance",
  "Gold investment",
  "Real estate",
  "Travel",
];

/** Custom audiences already synced to the ad account. */
export const CUSTOM_AUDIENCES = [
  { id: "aud_crm_active", name: "CRM · Active customers", size: 184_000 },
  { id: "aud_cart_abandon", name: "Cart abandoners · 30d", size: 42_500 },
  { id: "aud_app_installs", name: "App installers · 90d", size: 96_200 },
];

export const LOOKALIKE_SOURCES = [
  { id: "lal_high_value", name: "Lookalike 1% · High-value buyers" },
  { id: "lal_converters", name: "Lookalike 2% · WhatsApp converters" },
];

/** Placeholder creative tokens — rendered as generated tiles, never fetched. */
function creative(slug: string) {
  return `picom://creative/${slug}`;
}

export const SEED_ADS: CtwaAd[] = [
  {
    id: "ad_gold_festive",
    name: "Gold Loan · Festive",
    caption:
      "Unlock cash against your gold in 30 minutes. No income proof, no hidden charges. Chat with us to check your eligibility.",
    headline: "Gold loan in 30 minutes",
    mediaUrl: creative("gold-festive"),
    format: "image",
    objective: "OUTCOME_LEADS",
    optimizationGoal: "CONVERSATIONS",
    destination: "whatsapp",
    wabaPhoneNumber: "+91 98100 12345",
    prefilledMessage: "Hi, I'd like to check my gold loan eligibility.",
    targeting: {
      geo: ["Mumbai", "Pune", "Ahmedabad"],
      ageRange: { min: 25, max: 55 },
      gender: "all",
      interests: ["Gold investment", "Personal finance"],
      customAudienceIds: [],
    },
    dailyBudget: 4500,
    startAt: "2026-08-01",
    estimatedReach: { low: 180_000, high: 420_000 },
    status: "active",
    campaignId: "c_ex3",
    adSetId: "adset_gold_metro",
    adSetName: "Gold · Metro 25-55",
    metaCampaignId: "mc_festive_2026",
    metaCampaignName: "Festive Season 2026",
    conversionPoints: [
      { id: "cp_gold_1", event: "qualified_lead", label: "Eligibility confirmed" },
    ],
    createdAt: "2026-07-28",
    submittedAt: "2026-07-29",
  },
  {
    id: "ad_personal_loan",
    name: "Instant Personal Loan",
    caption:
      "Pre-approved personal loans up to ₹5,00,000. Money in your account the same day. Tap to start on WhatsApp.",
    headline: "Pre-approved up to ₹5L",
    mediaUrl: creative("personal-loan"),
    format: "video",
    objective: "OUTCOME_SALES",
    optimizationGoal: "OFFSITE_CONVERSIONS",
    destination: "whatsapp",
    wabaPhoneNumber: "+91 98100 12345",
    prefilledMessage: "Hi, I want to check my pre-approved loan offer.",
    targeting: {
      geo: ["All India"],
      ageRange: { min: 24, max: 50 },
      gender: "all",
      interests: ["Personal finance", "Credit cards"],
      customAudienceIds: ["aud_crm_active"],
      lookalikeSourceId: "lal_high_value",
    },
    dailyBudget: 8000,
    startAt: "2026-07-20",
    estimatedReach: { low: 900_000, high: 2_100_000 },
    status: "active",
    campaignId: "c_ex5",
    adSetId: "adset_pl_lookalike",
    adSetName: "PL · Lookalike 1%",
    metaCampaignId: "mc_lending_always_on",
    metaCampaignName: "Lending · Always-on",
    conversionPoints: [
      { id: "cp_pl_1", event: "qualified_lead", label: "Documents submitted" },
      { id: "cp_pl_2", event: "whatsapp_order", label: "Loan disbursed", value: 4200 },
    ],
    createdAt: "2026-07-18",
    submittedAt: "2026-07-19",
  },
  {
    id: "ad_sip_starter",
    name: "SIP Starter Pack",
    caption:
      "Start investing with ₹500 a month. Our advisor will walk you through it on WhatsApp — no jargon, no paperwork.",
    headline: "Start SIP at ₹500/month",
    mediaUrl: creative("sip-starter"),
    format: "carousel",
    objective: "OUTCOME_LEADS",
    optimizationGoal: "CONVERSATIONS",
    destination: "whatsapp",
    wabaPhoneNumber: "+91 90045 88210",
    prefilledMessage: "Hi, I'd like to start a SIP.",
    targeting: {
      geo: ["Bengaluru", "Hyderabad", "Chennai", "Delhi NCR"],
      ageRange: { min: 22, max: 40 },
      gender: "all",
      interests: ["Mutual funds", "Personal finance"],
      customAudienceIds: ["aud_app_installs"],
    },
    dailyBudget: 6200,
    startAt: "2026-07-25",
    estimatedReach: { low: 520_000, high: 1_100_000 },
    status: "active",
    campaignId: "c_ex4",
    adSetId: "adset_sip_young",
    adSetName: "SIP · Young professionals",
    metaCampaignId: "mc_wealth_2026",
    metaCampaignName: "Wealth Acquisition 2026",
    conversionPoints: [
      { id: "cp_sip_1", event: "appointment_booked", label: "Advisor call booked", value: 1800 },
    ],
    createdAt: "2026-07-22",
    submittedAt: "2026-07-23",
  },
  {
    id: "ad_merchant_qr",
    name: "Merchant QR Onboarding",
    caption:
      "Accept payments with a free Paytm QR. Get set up on WhatsApp in under 10 minutes.",
    headline: "Free QR for your shop",
    mediaUrl: creative("merchant-qr"),
    format: "image",
    objective: "OUTCOME_LEADS",
    optimizationGoal: "CONVERSATIONS",
    destination: "whatsapp",
    wabaPhoneNumber: "+91 98100 12345",
    prefilledMessage: "Hi, I want a QR code for my shop.",
    targeting: {
      geo: ["Jaipur", "Kolkata", "Ahmedabad"],
      ageRange: { min: 21, max: 55 },
      gender: "all",
      interests: ["Small business"],
      customAudienceIds: [],
    },
    dailyBudget: 3000,
    startAt: "2026-08-16",
    estimatedReach: { low: 210_000, high: 480_000 },
    status: "in_review",
    campaignId: "c_ex13",
    adSetId: "adset_qr_tier2",
    adSetName: "QR · Tier-2 merchants",
    metaCampaignId: "mc_merchant_2026",
    metaCampaignName: "Merchant Acquisition 2026",
    conversionPoints: [
      { id: "cp_qr_1", event: "qualified_lead", label: "KYC started" },
    ],
    createdAt: "2026-08-12",
    submittedAt: "2026-08-13",
  },
  {
    id: "ad_diwali_cashback",
    name: "Diwali Cashback Blast",
    caption: "Flat 50% cashback, guaranteed for everyone. Limited time only!",
    headline: "Guaranteed 50% cashback",
    mediaUrl: creative("diwali-cashback"),
    format: "image",
    objective: "OUTCOME_ENGAGEMENT",
    optimizationGoal: "CONVERSATIONS",
    destination: "whatsapp",
    wabaPhoneNumber: "+91 98100 12345",
    prefilledMessage: "Hi, tell me about the Diwali cashback.",
    targeting: {
      geo: ["All India"],
      ageRange: { min: 18, max: 65 },
      gender: "all",
      interests: ["Online shopping"],
      customAudienceIds: [],
    },
    dailyBudget: 2500,
    startAt: "2026-08-05",
    estimatedReach: { low: 1_400_000, high: 3_000_000 },
    status: "rejected",
    rejectionReason:
      "Misleading claim — 'guaranteed for everyone' cannot be substantiated. Remove the absolute guarantee or add qualifying terms to the creative.",
    adSetId: "adset_diwali_broad",
    adSetName: "Diwali · Broad",
    metaCampaignId: "mc_festive_2026",
    metaCampaignName: "Festive Season 2026",
    conversionPoints: [],
    createdAt: "2026-08-04",
    submittedAt: "2026-08-04",
  },
  {
    id: "ad_insurance_winter",
    name: "Health Cover · Winter",
    caption:
      "Family health cover starting ₹9/day. Compare plans with an advisor on WhatsApp.",
    headline: "Family cover from ₹9/day",
    mediaUrl: creative("insurance-winter"),
    format: "image",
    objective: "OUTCOME_SALES",
    optimizationGoal: "OFFSITE_CONVERSIONS",
    destination: "whatsapp",
    wabaPhoneNumber: "+91 98100 12345",
    prefilledMessage: "Hi, I'd like to compare health cover plans.",
    targeting: {
      geo: ["Mumbai", "Delhi NCR", "Bengaluru"],
      ageRange: { min: 28, max: 58 },
      gender: "all",
      interests: ["Insurance", "Personal finance"],
      customAudienceIds: [],
    },
    dailyBudget: 5000,
    startAt: "2026-09-01",
    estimatedReach: { low: 340_000, high: 760_000 },
    status: "draft",
    adSetId: "adset_health_metro",
    adSetName: "Health · Metro families",
    metaCampaignId: "mc_insurance_2026",
    metaCampaignName: "Insurance 2026",
    conversionPoints: [],
    createdAt: "2026-08-14",
  },
];

/** Ads whose taps the feed should generate traffic for. */
export const SEED_AUDIENCE_PRESETS = [
  { stage: "conversation_started" as const, days: 14, name: "Started, no event in 14 days" },
  { stage: "qualified" as const, days: 7, name: "Qualified, no purchase in 7 days" },
];
