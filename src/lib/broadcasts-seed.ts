/**
 * Broadcast seed data — the source of truth for the Broadcasts list and the
 * Channel Analytics "View by Broadcast" panel.
 *
 * A Broadcast is a one-shot direct-channel send: pick a channel, pick a
 * template, upload a CSV, hit send. Each row here is a single send run.
 * KPIs are the flat set common to WA / SMS / RCS: Sent, Delivered, Read,
 * Replied, Failed. Analytics wires these numbers into simple cards; no flow.
 */

export type BroadcastChannel = "whatsapp" | "sms" | "rcs";

export type BroadcastStatus =
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "terminated";

export type BroadcastRow = {
  id: string;
  name: string;
  channel: BroadcastChannel;
  /** Template name displayed inline in the runs table. */
  assetName: string;
  /**
   * Underlying template id. Broadcasts are a UI wrapper over a template send,
   * so "View by Broadcast" in Channel Analytics resolves through this id to the
   * same asset-mode template analytics used by workflow runs. Kept private to
   * the analytics wiring; not surfaced on the Broadcasts table.
   */
  templateId: string;
  csvName: string;
  status: BroadcastStatus;
  startedAt: string;
  completedAt: string | "ongoing";
  sent: number;
  total: number;
};

/** Flat KPI shape used by Channel Analytics for a single broadcast. */
export type BroadcastKPIs = {
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
};

/** Derive plausible KPIs from a row. Delivered ~= 97 percent of sent, Read
 *  ~= 62 percent of delivered, Replied ~= 4 percent of delivered, Failed is
 *  the remainder. Kept deterministic (no randomness) so numbers stay stable
 *  across renders. */
export function kpisForRow(r: BroadcastRow): BroadcastKPIs {
  const sent = r.sent;
  const delivered = Math.round(sent * 0.97);
  const read = Math.round(delivered * 0.62);
  const replied = Math.round(delivered * 0.04);
  const failed = sent - delivered;
  return { sent, delivered, read, replied, failed };
}

export const SEED_BROADCASTS: BroadcastRow[] = [
  // bc_5011 uses payment_reminder (10248301338871) because that template lives
  // in the workflow-run analytics dataset, so "View by Broadcast" here renders
  // real Channel Analytics numbers instead of the empty-scope state.
  { id: "bc_5011", name: "Payment reminder blast · TIER-1", channel: "whatsapp", assetName: "payment_reminder",       templateId: "10248301338871",      csvName: "tier1_pending_50k.csv",    status: "running",    startedAt: "Today, 12:12 PM",     completedAt: "ongoing",             sent: 18200, total: 50000 },
  { id: "bc_5010", name: "Delivery OTP burst",           channel: "sms",      assetName: "delivery_otp",            templateId: "1107168421004829376", csvName: "otp_batch_aug27.csv",      status: "paused",     startedAt: "Today, 12:05 PM",     completedAt: "ongoing",             sent: 3400,  total: 9200 },
  { id: "bc_5008", name: "Order shipped notice",         channel: "rcs",      assetName: "order_shipped_card",      templateId: "rcs_tpl_order_shipped", csvName: "shipped_orders_aug27.csv", status: "completed",  startedAt: "Today, 09:00 AM",     completedAt: "Today, 09:14 AM",     sent: 4200,  total: 4200 },
  { id: "bc_5007", name: "Payment reminder blast",       channel: "sms",      assetName: "payment_failed_txn",      templateId: "1107168421220847665", csvName: "pending_pay_aug26.csv",    status: "completed",  startedAt: "Yesterday, 04:00 PM", completedAt: "Yesterday, 04:23 PM", sent: 8600,  total: 8600 },
  { id: "bc_5006", name: "Cart recovery WA",             channel: "whatsapp", assetName: "abandoned_cart_offer",    templateId: "10248300981244",      csvName: "cart_abandon_aug25.csv",   status: "terminated", startedAt: "Yesterday, 01:15 PM", completedAt: "Yesterday, 01:22 PM", sent: 120,   total: 3400 },
  { id: "bc_5005", name: "Renewal reminder promo",       channel: "sms",      assetName: "renewal_reminder_promo",  templateId: "1107168421118290043", csvName: "renewals_aug26.csv",       status: "completed",  startedAt: "Yesterday, 10:15 AM", completedAt: "Yesterday, 10:38 AM", sent: 2100,  total: 2100 },
];
