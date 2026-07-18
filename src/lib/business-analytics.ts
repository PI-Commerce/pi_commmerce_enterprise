/**
 * Per-use-case Business Analytics packs.
 *
 * FinServ v1 scope: ONLY Personal Loan Collections is populated. Other BFSI
 * packs (Insurance Renewal, Credit Card Dues, KYC Onboarding, Cross-sell) are
 * intentionally out of scope for v1 — the platform can render them, but there
 * is no seeded data. When a campaign carries an out-of-scope useCase, the
 * BusinessAnalyticsPanel falls back to a "scope: TBD" hint.
 *
 * Scope per the FinServ v1 doc:
 *   KPI cards (4): RPC rate · PTP conversion rate · Amount Recovered · Upcoming Promises
 *   Charts (2 groups):
 *     - PTP Funnel: captured / kept / broken
 *     - Recovery Analytics: recovery rate, recovery cycle, channel effectiveness
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

/** Recovery Analytics is a small composite: an overall recovery-rate figure +
 *  a median recovery-cycle figure + a per-channel breakdown of ₹ recovered. */
export type RecoveryAnalytics = {
  recoveryRate: { pct: number; totalLeads: number; recovered: number };
  recoveryCycle: { medianDays: number; sampleSize: number };
  channelEffectiveness: { channel: string; recovered: number; tint: string }[];
};

export type BusinessAnalyticsPack = {
  kpis: Kpi[];
  ptpFunnel?: { title: string; subtitle?: string; stages: FunnelStage[]; tint?: string };
  recoveryAnalytics?: { title: string; subtitle?: string; data: RecoveryAnalytics };
};

/* ------------------------ Personal Loan Collections ------------------------ */

const PL_COLLECTIONS: BusinessAnalyticsPack = {
  kpis: [
    { label: "Right-party contact rate",   value: 72.4,      unit: "%",       timeframe: "Last 7 days",   info: "Share of connected calls that reached the right party (borrower or authorized speaker). Calculated from Voice-agent dispositions." },
    { label: "PTP → recovered conversion", value: 46.8,      unit: "%",       timeframe: "Last 7 days",   info: "PTPs captured that resulted in payment_status = received within the promised date + grace period." },
    { label: "Amount recovered",           value: "₹18.4L",  unit: "recovered", timeframe: "Last 7 days", info: "Sum of emi_amount across leads where payment_status = received during the campaign window." },
    { label: "Upcoming promises",          value: 84,        unit: "PTPs",    timeframe: "Next 3 days",   info: "Open PTPs (PTP = true, kept = null) whose promised date falls within the next 3 days." },
  ],
  ptpFunnel: {
    title: "PTP Funnel",
    subtitle: "Captured → kept → broken",
    stages: [
      { stage: "PTP captured", value: 1180 },
      { stage: "PTP kept",     value: 862  },
      { stage: "PTP broken",   value: 318  },
    ],
    tint: "#22c55e",
  },
  recoveryAnalytics: {
    title: "Recovery Analytics",
    subtitle: "Rate · Cycle · Channel effectiveness",
    data: {
      recoveryRate:  { pct: 38.2, totalLeads: 4823, recovered: 1842 },
      recoveryCycle: { medianDays: 4.2, sampleSize: 1842 },
      channelEffectiveness: [
        { channel: "Voice AI",  recovered: 1_340_000, tint: "#a78bfa" },
        { channel: "WhatsApp",  recovered: 1_250_000, tint: "#22c55e" },
        { channel: "SMS",       recovered:   188_000, tint: "#f59e0b" },
        { channel: "Human L2",  recovered:    62_000, tint: "#64748b" },
      ],
    },
  },
};

/* ------------------------ Registry ------------------------ */

export const USE_CASE_ANALYTICS: Partial<Record<UseCase, BusinessAnalyticsPack>> = {
  personal_loan_collections: PL_COLLECTIONS,
  // insurance_renewal / credit_card_dues / kyc_onboarding / cross_sell — OOS for v1.
};

export function analyticsFor(useCase?: UseCase): BusinessAnalyticsPack | undefined {
  if (!useCase) return undefined;
  return USE_CASE_ANALYTICS[useCase];
}
