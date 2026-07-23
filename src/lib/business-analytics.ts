/**
 * Per-use-case Business Analytics packs.
 *
 * FinServ v1 scope: ONLY the `collections` pack is populated. Other BFSI
 * packs (Insurance Renewal, Credit Card Dues, KYC Onboarding, Cross-sell) are
 * intentionally out of scope for v1 — the platform can render them, but there
 * is no seeded data. When a campaign carries an out-of-scope useCase, the
 * BusinessAnalyticsPanel falls back to a "scope: TBD" hint.
 *
 * Scope per the FinServ v1 doc:
 *   KPI cards (4): RPC rate · PTP conversion rate · Amount Recovered · Upcoming Promises
 *   Charts:
 *     - PTP Funnel: captured / kept / broken
 *     - Recovery Rate (single-number card)
 *     - Recovery Cycle (single-number card)
 *     - Channel Effectiveness (horizontal bar)
 *
 * All figures are "run-to-date" — i.e. across every lead touched in this
 * campaign run. No trailing-window framing (no "last 7 days"). The KPIs and
 * cards below carry no `timeframe` field for that reason.
 */

import type { UseCase } from "./campaign-types";

/* ------------------------ Shape types ------------------------ */

export type Kpi = {
  label: string;
  value: string | number;
  unit: string;
  /** Plain-English explanation for the info button. No variable syntax, no
   *  jargon — the ICP is a non-technical business user. */
  info: string;
};

export type FunnelStage = { stage: string; value: number };

export type ChannelEffectivenessRow = { channel: string; recovered: number; tint: string };

export type BusinessAnalyticsPack = {
  kpis: Kpi[];
  ptpFunnel?: { title: string; stages: FunnelStage[]; tint?: string; info: string };
  /** Three separate cards under Recovery Analytics — not merged into one. */
  recoveryRate?: { title: string; pct: number; totalLeads: number; recovered: number; info: string };
  recoveryCycle?: { title: string; medianDays: number; sampleSize: number; info: string };
  channelEffectiveness?: { title: string; rows: ChannelEffectivenessRow[]; info: string };
};

/* ------------------------ Collections (Loan) ------------------------ */

/**
 * RPC (Right-Party Contact) — analytics-only, computed by the tech team's
 * analytics pipeline. Not a Skill, not a lead-memory attribute.
 *
 * Definition (per lead, per run):
 *   is_rpc(lead) = ∃ voice interaction in this run where
 *                    disposition ∉ {"Wrong-Number", "No-Answer", null}
 *
 * KPI value:
 *   RPC rate = # leads with is_rpc=true / # leads with any voice attempt.
 *
 * Aggregates across every Voice AI node in the campaign — multi-voice flows
 * just work. WhatsApp / SMS do not contribute to RPC in v1.
 */
const PL_COLLECTIONS: BusinessAnalyticsPack = {
  kpis: [
    {
      label: "Right-Party Contact Rate",
      value: 72.4,
      unit: "%",
      info: "Share of the cohort we successfully reached by voice at least once. Calculated per lead across every voice attempt in the run.",
    },
    {
      label: "PTP Conversion Rate",
      value: 46.8,
      unit: "%",
      info: "Of the promises the AI captured, how many were kept and turned into actual payments.",
    },
    {
      label: "Amount Recovered",
      value: "₹18.4L",
      unit: "",
      info: "Total money collected from all borrowers in this campaign run.",
    },
    {
      label: "Upcoming Promises",
      value: 84,
      unit: "",
      info: "Open promises where the borrower is due to pay in the next 3 days.",
    },
    {
      label: "Human Escalation",
      value: 127,
      unit: "leads",
      info: "Leads flagged by a Human Escalation node in this campaign run. Ops teams pick these up from the queue for manual review.",
    },
  ],
  ptpFunnel: {
    title: "PTP Funnel",
    stages: [
      { stage: "PTP captured", value: 1180 },
      { stage: "PTP kept",     value: 862  },
      { stage: "PTP broken",   value: 318  },
    ],
    tint: "#22c55e",
    info: "How every promise-to-pay played out. Every captured promise either becomes a kept payment or a broken PTP that needs re-work.",
  },
  recoveryRate: {
    title: "Recovery Rate",
    pct: 38.2,
    totalLeads: 4823,
    recovered: 1842,
    info: "Share of leads in this campaign run where the borrower has paid.",
  },
  recoveryCycle: {
    title: "Recovery Cycle",
    medianDays: 4.2,
    sampleSize: 1842,
    info: "Median number of days between the first outreach and payment received. Lower is better.",
  },
  channelEffectiveness: {
    title: "Channel Effectiveness",
    rows: [
      { channel: "Voice AI",  recovered: 1_340_000, tint: "#a78bfa" },
      { channel: "WhatsApp",  recovered: 1_250_000, tint: "#22c55e" },
      { channel: "SMS",       recovered:   188_000, tint: "#f59e0b" },
      { channel: "Human L2",  recovered:    62_000, tint: "#64748b" },
    ],
    info: "Money recovered attributed to each channel. Attribution follows the last-touch channel before payment.",
  },
};

/* ------------------------ Registry ------------------------ */

export const USE_CASE_ANALYTICS: Partial<Record<UseCase, BusinessAnalyticsPack>> = {
  collections: PL_COLLECTIONS,
  // retention / onboarding / cross_sell — OOS for v1.
};

export function analyticsFor(useCase?: UseCase): BusinessAnalyticsPack | undefined {
  if (!useCase) return undefined;
  return USE_CASE_ANALYTICS[useCase];
}
