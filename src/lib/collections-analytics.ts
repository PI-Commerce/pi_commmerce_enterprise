/**
 * Collections-specific business analytics — mock KPIs, funnels, and breakdowns
 * for the `/collections` Business Dashboard. Numbers are internally consistent
 * with the Leads seed (leads-data.ts) so the story hangs together — for
 * example, the disposition pie always sums to the RPC count, and Recovery by
 * DPD bucket adds up to Amount Recovered.
 *
 * Real product: this would be computed from the interactions store + LMS
 * payment feed. Here it's a set of hand-tuned numbers that read plausibly for
 * an Indian personal-loan collections book.
 */

/* ------------------------ KPI cards ------------------------ */

export const COLLECTIONS_KPIS = {
  rpcRate:            { value: 72.4, unit: "%",     timeframe: "Last 7 days",
                        info: "Share of connected calls that reached the right party (borrower or authorized speaker)." },
  ptpConversionRate:  { value: 46.8, unit: "%",     timeframe: "Last 7 days",
                        info: "PTP-captured → recovered within the promised date + grace." },
  costToCollect:      { value: 2.6,  unit: "% of ₹ recovered", timeframe: "Month-to-date",
                        info: "Total AI + channel + human cost divided by amount recovered." },
  recoveryCycle:      { value: 4.2,  unit: "days",  timeframe: "Median · last 30 days",
                        info: "Time from first contact to payment received (median across recovered accounts)." },
  amountRecovered:    { value: "₹18.4L", unit: "recovered", timeframe: "Last 7 days",
                        info: "Amount actually collected in the campaign window (not just promised)." },
  upcomingPromises:   { value: 84,   unit: "PTPs",  timeframe: "Next 3 days",
                        info: "Open PTPs whose promised date falls within the next 3 days." },
} as const;

/* ------------------------ PTP funnel ------------------------ */

export const PTP_FUNNEL = [
  { stage: "PTP captured", value: 1180 },
  { stage: "PTP kept",     value: 862  },
  { stage: "PTP broken",   value: 318  },
];

/* ------------------------ Recovery by DPD bucket ------------------------ */

export const RECOVERY_BY_DPD: { bucket: string; whatsapp: number; voice: number; sms: number }[] = [
  { bucket: "Pre-due",  whatsapp: 720_000, voice: 340_000, sms: 82_000 },
  { bucket: "Early 1–7", whatsapp: 410_000, voice: 620_000, sms: 61_000 },
  { bucket: "Mid 8+",   whatsapp: 120_000, voice: 380_000, sms: 45_000 },
];

/* ------------------------ Recovery by channel (donut) ------------------------ */

export const RECOVERY_BY_CHANNEL = [
  { name: "Voice AI",   value: 1_340_000, tint: "#a78bfa" },
  { name: "WhatsApp",   value: 1_250_000, tint: "#22c55e" },
  { name: "SMS",        value:   188_000, tint: "#f59e0b" },
  { name: "Human L2",   value:    62_000, tint: "#64748b" },
];

/* ------------------------ Disposition pie ------------------------ */

export const DISPOSITION_MIX = [
  { name: "PTP · Open",       value: 1180, tint: "#22c55e" },
  { name: "Already paid",     value:  842, tint: "#0ea5e9" },
  { name: "Callback later",   value:  418, tint: "#a78bfa" },
  { name: "Unable to pay",    value:  312, tint: "#f59e0b" },
  { name: "Wrong number",     value:  246, tint: "#94a3b8" },
  { name: "Dispute",          value:  128, tint: "#f97316" },
  { name: "Refuses",          value:   96, tint: "#ef4444" },
];

/* ------------------------ AI vs human escalation ------------------------ */

export const AI_VS_HUMAN = [
  { name: "AI-resolved",       value: 3_940, tint: "#a78bfa" },
  { name: "Escalated to human", value:   480, tint: "#64748b" },
];

/* ------------------------ Book context ------------------------ */

export const BOOK_SUMMARY = {
  totalOutstanding: "₹8.42 Cr",
  totalLeads: 4_823,
  activeCampaigns: 3,
} as const;
