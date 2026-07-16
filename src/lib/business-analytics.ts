/**
 * Per-use-case Business Analytics packs.
 *
 * Each BFSI use case declares its own set of KPIs and charts. When a campaign
 * is selected on `/analytics`, we look up its `useCase` here and render the
 * corresponding pack ABOVE the existing Campaign Analytics section. This is
 * how the same platform surfaces Collections KPIs for a PL Collections
 * campaign and Renewal KPIs for an Insurance Renewal campaign — same shell,
 * different content, driven by data.
 *
 * Numbers are hand-tuned to read plausibly for a mid-size Indian BFSI book.
 */

import type { UseCase } from "./campaign-types";

/* ------------------------ Shape types ------------------------ */

export type Kpi = {
  label: string;
  value: string | number;
  unit: string;
  timeframe: string;
  info: string;
};

export type FunnelStage = { stage: string; value: number };
export type DonutSlice = { name: string; value: number; tint: string };
export type StackedBar = {
  buckets: string[];                                    // x-axis labels
  series: { name: string; data: number[]; tint: string }[]; // one per stack layer
  yFormatter?: "rupees_lakhs" | "count";
};
export type BookSummary = { label: string; value: string }[];

/** A Business Analytics pack for one use case. Any field can be omitted; the
 *  panel skips missing slots. Charts are described declaratively (data + tint)
 *  and rendered by BusinessAnalyticsPanel which owns the ECharts wiring. */
export type BusinessAnalyticsPack = {
  bookSummary: BookSummary;
  kpis: Kpi[];
  funnel?: { title: string; subtitle?: string; stages: FunnelStage[]; tint?: string };
  stackedBar?: { title: string; subtitle?: string; data: StackedBar };
  donutA?: { title: string; subtitle?: string; slices: DonutSlice[] };
  donutB?: { title: string; subtitle?: string; slices: DonutSlice[] };
  donutC?: { title: string; subtitle?: string; slices: DonutSlice[] };
};

/* ------------------------ Personal Loan Collections ------------------------ */

const PL_COLLECTIONS: BusinessAnalyticsPack = {
  bookSummary: [
    { label: "Total outstanding", value: "₹8.42 Cr" },
    { label: "Borrowers on book", value: "4,823" },
    { label: "Active campaigns", value: "3" },
  ],
  kpis: [
    { label: "Right-party contact rate",   value: 72.4, unit: "%",              timeframe: "Last 7 days",           info: "Share of connected calls that reached the right party (borrower or authorized speaker)." },
    { label: "PTP → recovered conversion", value: 46.8, unit: "%",              timeframe: "Last 7 days",           info: "Promises captured that were kept within the promised date + grace period." },
    { label: "Cost to collect",            value: 2.6,  unit: "% of ₹ recovered", timeframe: "Month-to-date",         info: "Total AI + channel + human cost divided by amount collected." },
    { label: "Recovery cycle",             value: 4.2,  unit: "days",            timeframe: "Median · last 30 days", info: "Time from first contact to payment received (median across recovered accounts)." },
    { label: "Amount recovered",           value: "₹18.4L", unit: "recovered",   timeframe: "Last 7 days",           info: "Amount actually collected in the campaign window." },
    { label: "Upcoming promises",          value: 84,   unit: "PTPs",            timeframe: "Next 3 days",           info: "Open PTPs whose promised date falls within the next 3 days." },
  ],
  funnel: {
    title: "PTP funnel",
    subtitle: "Captured → kept → broken",
    stages: [
      { stage: "PTP captured", value: 1180 },
      { stage: "PTP kept",     value: 862  },
      { stage: "PTP broken",   value: 318  },
    ],
    tint: "#22c55e",
  },
  stackedBar: {
    title: "Recovery by DPD bucket",
    subtitle: "₹ recovered · stacked by channel",
    data: {
      buckets: ["Pre-due", "Early 1–7", "Mid 8+"],
      series: [
        { name: "WhatsApp", data: [720_000, 410_000, 120_000], tint: "#22c55e" },
        { name: "Voice AI", data: [340_000, 620_000, 380_000], tint: "#a78bfa" },
        { name: "SMS",      data: [ 82_000,  61_000,  45_000], tint: "#f59e0b" },
      ],
      yFormatter: "rupees_lakhs",
    },
  },
  donutA: {
    title: "Recovery by channel",
    subtitle: "Share of ₹ recovered",
    slices: [
      { name: "Voice AI",   value: 1_340_000, tint: "#a78bfa" },
      { name: "WhatsApp",   value: 1_250_000, tint: "#22c55e" },
      { name: "SMS",        value:   188_000, tint: "#f59e0b" },
      { name: "Human L2",   value:    62_000, tint: "#64748b" },
    ],
  },
  donutB: {
    title: "Disposition mix",
    subtitle: "Voice-agent classifications",
    slices: [
      { name: "PTP · Open",       value: 1180, tint: "#22c55e" },
      { name: "Already paid",     value:  842, tint: "#0ea5e9" },
      { name: "Callback later",   value:  418, tint: "#a78bfa" },
      { name: "Unable to pay",    value:  312, tint: "#f59e0b" },
      { name: "Wrong number",     value:  246, tint: "#94a3b8" },
      { name: "Dispute",          value:  128, tint: "#f97316" },
      { name: "Refuses",          value:   96, tint: "#ef4444" },
    ],
  },
  donutC: {
    title: "AI vs human escalation",
    subtitle: "How many interactions the AI resolved end-to-end",
    slices: [
      { name: "AI-resolved",        value: 3_940, tint: "#a78bfa" },
      { name: "Escalated to human", value:   480, tint: "#64748b" },
    ],
  },
};

/* ------------------------ Insurance Renewal ------------------------ */

const INSURANCE_RENEWAL: BusinessAnalyticsPack = {
  bookSummary: [
    { label: "Premium at risk", value: "₹4.12 Cr" },
    { label: "Policies on book", value: "2,610" },
    { label: "Active campaigns", value: "2" },
  ],
  kpis: [
    { label: "Renewal rate",             value: 68.2, unit: "%",         timeframe: "Rolling 30 days",       info: "Share of policies renewed on or before their expiry date." },
    { label: "Lapsation rate",           value: 12.4, unit: "%",         timeframe: "Rolling 30 days",       info: "Share of policies lapsed after grace period." },
    { label: "Premium retained",         value: "₹1.94 Cr", unit: "retained", timeframe: "Last 30 days",     info: "Total premium re-committed via renewal in the window." },
    { label: "Avg days-before-renewal",  value: 11.6, unit: "days",      timeframe: "Median",                info: "Median gap between renewal and policy expiry (higher = healthier)." },
    { label: "Cross-sell attach rate",   value: 9.8,  unit: "%",         timeframe: "Last 30 days",          info: "Renewed policies that also attached a rider or additional cover." },
    { label: "Upcoming renewals",        value: 328,  unit: "policies",  timeframe: "Next 15 days",          info: "Policies whose renewal date falls within the next 15 days." },
  ],
  funnel: {
    title: "Renewal funnel",
    subtitle: "Notified → engaged → renewed",
    stages: [
      { stage: "Notified", value: 2410 },
      { stage: "Engaged",  value: 1620 },
      { stage: "Renewed",  value: 1104 },
      { stage: "Lapsed",   value:  201 },
    ],
    tint: "#0ea5e9",
  },
  stackedBar: {
    title: "Renewal by days-before-expiry",
    subtitle: "Policies renewed · by outreach window",
    data: {
      buckets: ["T-30", "T-15", "T-7", "T-1", "T-0 / lapsed"],
      series: [
        { name: "Health", data: [180, 220, 160,  60, 30], tint: "#22c55e" },
        { name: "Life",   data: [120, 140,  90,  40, 22], tint: "#a78bfa" },
        { name: "Auto",   data: [ 90, 100,  70,  36, 40], tint: "#f59e0b" },
        { name: "Home",   data: [ 40,  55,  40,  16, 15], tint: "#0ea5e9" },
      ],
      yFormatter: "count",
    },
  },
  donutA: {
    title: "Retention by policy type",
    subtitle: "Renewed policies · last 30 days",
    slices: [
      { name: "Health", value: 480, tint: "#22c55e" },
      { name: "Life",   value: 320, tint: "#a78bfa" },
      { name: "Auto",   value: 210, tint: "#f59e0b" },
      { name: "Home",   value:  94, tint: "#0ea5e9" },
    ],
  },
  donutB: {
    title: "Disposition mix",
    subtitle: "Voice + WhatsApp outcomes",
    slices: [
      { name: "Renewed",        value: 1104, tint: "#22c55e" },
      { name: "Deferred to T-1", value: 386, tint: "#0ea5e9" },
      { name: "Wants human",     value: 240, tint: "#a78bfa" },
      { name: "Opted out",       value: 180, tint: "#f59e0b" },
      { name: "Disputed",        value:  92, tint: "#f97316" },
      { name: "No response",     value: 408, tint: "#94a3b8" },
    ],
  },
  donutC: {
    title: "AI vs human escalation",
    subtitle: "Renewal interactions",
    slices: [
      { name: "AI-resolved",        value: 2_140, tint: "#a78bfa" },
      { name: "Escalated to human", value:   270, tint: "#64748b" },
    ],
  },
};

/* ------------------------ Credit Card Dues (stub) ------------------------ */

const CREDIT_CARD_DUES: BusinessAnalyticsPack = {
  bookSummary: [
    { label: "Total dues", value: "₹2.18 Cr" },
    { label: "Cardholders on book", value: "1,942" },
    { label: "Active campaigns", value: "0 · pack ready" },
  ],
  kpis: [
    { label: "Min-due paid rate",  value: 74.1, unit: "%",       timeframe: "Last statement cycle",  info: "Cardholders who paid at least the minimum due on time." },
    { label: "Full-due paid rate", value: 41.6, unit: "%",       timeframe: "Last statement cycle",  info: "Cardholders who cleared the full statement balance." },
    { label: "Recovery cycle",     value: 5.8,  unit: "days",    timeframe: "Median · last 30 days", info: "Days from statement generation to full payment (median)." },
    { label: "Amount recovered",   value: "₹1.28 Cr", unit: "recovered", timeframe: "Last 30 days",  info: "Amount collected against past-due card balances." },
    { label: "Delinquency migration",  value: 3.2, unit: "%",    timeframe: "Month-over-month",      info: "Share of accounts that moved from Early to Mid DPD." },
    { label: "Upcoming statements",    value: 486, unit: "cards", timeframe: "Next 7 days",           info: "Statements generating in the next week." },
  ],
};

/* ------------------------ Registry ------------------------ */

export const USE_CASE_ANALYTICS: Partial<Record<UseCase, BusinessAnalyticsPack>> = {
  personal_loan_collections: PL_COLLECTIONS,
  insurance_renewal:         INSURANCE_RENEWAL,
  credit_card_dues:          CREDIT_CARD_DUES,
  // kyc_onboarding + cross_sell + generic — panel renders a placeholder for now.
};

export function analyticsFor(useCase?: UseCase): BusinessAnalyticsPack | undefined {
  if (!useCase) return undefined;
  return USE_CASE_ANALYTICS[useCase];
}
