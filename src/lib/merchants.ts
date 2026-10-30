/**
 * Merchants (tenants/clients) — admin-panel store for Stop-Campaign configuration.
 *
 * Backs PICOM-4970 "Stop Campaign Execution". A merchant carries a client-level
 * default `StopConfig` (per-channel caps + enforcement) that new campaigns inherit,
 * plus the list of that client's campaigns an admin can hard-stop / resume.
 *
 * Two things define a cap (per the spec):
 *   1. HOW it is measured — fixed by channel type. Messaging (WhatsApp/SMS/RCS) is
 *      measured on messages *sent* (known instantly at dispatch). Voice is measured
 *      on *connected minutes* (reconciled with lag from call callbacks).
 *   2. HOW it is enforced — owner-configurable:
 *      - hard: strict ceiling, campaign stops before exceeding (Voice stops placing
 *        new calls early to absorb in-flight). Default.
 *      - soft: target with allowed overflow of `softOverflowPct`% (0–100), since only
 *        a fraction of in-flight/queued calls actually connect. Set here in the panel.
 *
 * Every channel in a campaign has a cap. The moment any one channel reaches its cap,
 * the whole campaign stops — nothing new goes out until an admin resumes it.
 *
 * In-memory module store + `useSyncExternalStore` (matches `template-store`); a hard
 * reload replays these seeds. No network, no persistence.
 */
import { useSyncExternalStore } from "react";
import {
  MessageCircle, MessageSquare, MessageSquareText, Phone, type LucideIcon,
} from "lucide-react";

export type Channel = "whatsapp" | "sms" | "rcs" | "voice";
export type CapBasis = "sent" | "connected";
export type CapPeriod = "monthly" | "annual";
export type Enforcement = "hard" | "soft";

/** How each channel's cap is measured — fixed by channel type, not interchangeable. */
export const CHANNEL_META: Record<
  Channel,
  { label: string; icon: LucideIcon; basis: CapBasis; unit: string; measuredOn: string }
> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle,       basis: "sent",      unit: "messages", measuredOn: "Messages sent" },
  sms:      { label: "SMS",      icon: MessageSquare,       basis: "sent",      unit: "messages", measuredOn: "Messages sent" },
  rcs:      { label: "RCS",      icon: MessageSquareText,   basis: "sent",      unit: "messages", measuredOn: "Messages sent" },
  voice:    { label: "Voice",    icon: Phone,               basis: "connected", unit: "minutes",  measuredOn: "Connected minutes" },
};

export const CHANNEL_ORDER: Channel[] = ["whatsapp", "sms", "rcs", "voice"];

export const CAP_PERIOD_LABEL: Record<CapPeriod, string> = {
  monthly: "Per month",
  annual: "Annual (rolling)",
};

export type ChannelCap = {
  channel: Channel;
  /** Cap value: sent-count for messaging, connected-minutes for Voice. */
  cap: number;
  period: CapPeriod;
  /** Current usage in the active window (sent count / connected minutes). */
  used: number;
};

export type StopConfig = {
  enforcement: Enforcement;
  /** Allowed overflow above cap when soft (0–100%). Ignored under hard. */
  softOverflowPct: number;
  caps: ChannelCap[];
  /** Voice reconciliation assumptions (spec defaults: 75% connectivity, 2 min/call). */
  avgConnectivityPct: number;
  avgCallMinutes: number;
};

/** API-based (perpetual) runs go PAUSED → BLOCKED; one-time runs simply stop. */
export type RunType = "one-time" | "api";
export type CampaignRunStatus = "running" | "paused" | "stopped" | "blocked";

export type MerchantCampaign = {
  id: string;
  name: string;
  channels: Channel[];
  runType: RunType;
  status: CampaignRunStatus;
  contacted: number;
  total: number;
  /** Set when the stop came from a cap; names the channel that hit its ceiling. */
  cappedChannel?: Channel;
  stoppedReason?: string;
  stoppedBy?: string;
};

export type AuditEntry = { id: string; when: string; actor: string; summary: string };

export type MerchantStatus = "active" | "capped" | "stopped";

/** Merchant type is fixed at onboarding and cannot be changed later. */
export type MerchantType = "ENTERPRISE";

export type MerchantAddress = {
  address: string;
  city: string;
  state: string;
  country: string;
  zipcode: string;
};

/** Onboarding taxonomy — Category drives the Sub Category options. */
export const MERCHANT_CATEGORIES = [
  "BFSI", "Retail", "Telecom", "Healthcare",
  "Travel & Hospitality", "E-commerce", "Education", "Media & Entertainment",
] as const;

export const MERCHANT_SUBCATEGORIES: Record<string, string[]> = {
  "BFSI": ["Banking", "Lending / NBFC", "Insurance", "Payments", "Wealth / Broking"],
  "Retail": ["Fashion", "Grocery", "Electronics", "Home & Living"],
  "Telecom": ["Prepaid", "Postpaid", "Broadband", "Enterprise"],
  "Healthcare": ["Hospitals", "Pharmacy", "Diagnostics", "Wellness"],
  "Travel & Hospitality": ["Airlines", "Hotels", "OTA", "Car Rental"],
  "E-commerce": ["Marketplace", "D2C", "Q-commerce"],
  "Education": ["K-12", "Higher Ed", "Test Prep", "Upskilling"],
  "Media & Entertainment": ["OTT", "Gaming", "Publishing", "Music"],
};

/** The onboarding / edit profile — everything the merchant CRUD form captures. */
export type MerchantProfile = {
  name: string;
  businessName: string;
  countryCode: string;
  phone: string;
  email: string;
  category: string;
  subCategory: string;
  pan: string;
  gstin: string;
  registered: MerchantAddress;
  /** "Communication address is the same as the registered address". */
  sameAsRegistered: boolean;
  communication: MerchantAddress;
};

export type Merchant = MerchantProfile & {
  id: string;
  /** Auto-generated display id shown in the list (fixed after onboarding). */
  merchantId: string;
  type: MerchantType;
  region: string;
  status: MerchantStatus;
  stopConfig: StopConfig;
  campaigns: MerchantCampaign[];
  audit: AuditEntry[];
  updatedBy: string;
  updatedAt: string;
};

/** The exact owner nudge shown when a channel hits its cap (spec, Story 1). */
export function ownerCapNotice(channel: Channel): string {
  return `Further campaign execution is disabled as user has reached interim cap for ${CHANNEL_META[channel].label}. Reach out to Administrator for details.`;
}

/**
 * The effective ceiling a channel is checked against. Hard = the cap exactly; soft =
 * the cap plus the configured overflow fraction.
 */
export function effectiveCeiling(cap: ChannelCap, cfg: StopConfig): number {
  if (cfg.enforcement === "soft") return Math.round(cap.cap * (1 + cfg.softOverflowPct / 100));
  return cap.cap;
}

/** A cap is "reached" once usage meets/exceeds the effective ceiling. */
export function capReached(cap: ChannelCap, cfg: StopConfig): boolean {
  return cap.used >= effectiveCeiling(cap, cfg);
}

/** 0–1 progress toward the effective ceiling (clamped). */
export function capRatio(cap: ChannelCap, cfg: StopConfig): number {
  const ceil = effectiveCeiling(cap, cfg);
  if (ceil <= 0) return 0;
  return Math.min(1, cap.used / ceil);
}

export type CapTone = "ok" | "near" | "reached";
export function capTone(cap: ChannelCap, cfg: StopConfig): CapTone {
  const r = capRatio(cap, cfg);
  if (r >= 1) return "reached";
  if (r >= 0.85) return "near";
  return "ok";
}

// ── seed ─────────────────────────────────────────────────────────────────────

function caps(list: Array<[Channel, number, CapPeriod, number]>): ChannelCap[] {
  return list.map(([channel, cap, period, used]) => ({ channel, cap, period, used }));
}

const SEED: Merchant[] = [
  {
    id: "cl_fcc",
    merchantId: "2664",
    type: "ENTERPRISE",
    name: "FCC — First Choice Credit",
    businessName: "First Choice Credit Pvt Ltd",
    countryCode: "+91",
    phone: "9820011234",
    email: "ops@firstchoicecredit.in",
    category: "BFSI",
    subCategory: "Lending / NBFC",
    pan: "AAFCF1234K",
    gstin: "27AAFCF1234K1Z5",
    registered: { address: "402, Peninsula Tower, Lower Parel", city: "Mumbai", state: "Maharashtra", country: "India", zipcode: "400013" },
    sameAsRegistered: true,
    communication: { address: "402, Peninsula Tower, Lower Parel", city: "Mumbai", state: "Maharashtra", country: "India", zipcode: "400013" },
    region: "India (DLT)",
    status: "capped",
    updatedBy: "Mayan Kansal",
    updatedAt: "5 Aug 2026, 14:10",
    stopConfig: {
      enforcement: "hard",
      softOverflowPct: 20,
      avgConnectivityPct: 75,
      avgCallMinutes: 2,
      caps: caps([
        ["whatsapp", 50000, "monthly", 41200],
        ["sms", 120000, "monthly", 58000],
        ["rcs", 20000, "monthly", 3400],
        ["voice", 8000, "monthly", 8000],
      ]),
    },
    campaigns: [
      { id: "cmp_fcc_1", name: "Card Loyalty · Redemption Nudge", channels: ["whatsapp", "voice"], runType: "one-time", status: "stopped", contacted: 6120, total: 9000, cappedChannel: "voice", stoppedReason: "Voice connected-minutes cap reached", stoppedBy: "System (cap)" },
      { id: "cmp_fcc_2", name: "EMI Reminder — August", channels: ["sms"], runType: "api", status: "running", contacted: 22800, total: 60000 },
    ],
    audit: [
      { id: "au1", when: "5 Aug 2026, 14:10", actor: "Mayan Kansal", summary: "Voice cap set to 8,000 connected minutes / month" },
      { id: "au2", when: "2 Aug 2026, 09:02", actor: "Priya N.", summary: "Enforcement set to Hard cap" },
    ],
  },
  {
    id: "cl_acme",
    merchantId: "2663",
    type: "ENTERPRISE",
    name: "Acme Retail",
    businessName: "Acme Retail Inc.",
    countryCode: "+1",
    phone: "4155550142",
    email: "growth@acmeretail.com",
    category: "Retail",
    subCategory: "Fashion",
    pan: "",
    gstin: "",
    registered: { address: "1200 Market Street, Suite 400", city: "San Francisco", state: "California", country: "United States", zipcode: "94103" },
    sameAsRegistered: true,
    communication: { address: "1200 Market Street, Suite 400", city: "San Francisco", state: "California", country: "United States", zipcode: "94103" },
    region: "US",
    status: "active",
    updatedBy: "Ops Bot",
    updatedAt: "4 Aug 2026, 18:44",
    stopConfig: {
      enforcement: "soft",
      softOverflowPct: 15,
      avgConnectivityPct: 75,
      avgCallMinutes: 2,
      caps: caps([
        ["whatsapp", 200000, "monthly", 88000],
        ["sms", 300000, "monthly", 121000],
        ["rcs", 40000, "monthly", 9000],
        ["voice", 15000, "annual", 4200],
      ]),
    },
    campaigns: [
      { id: "cmp_acme_1", name: "Weekend Flash Sale", channels: ["whatsapp", "sms"], runType: "one-time", status: "running", contacted: 41000, total: 90000 },
    ],
    audit: [
      { id: "au3", when: "4 Aug 2026, 18:44", actor: "Ops Bot", summary: "Soft cap overflow set to 15%" },
    ],
  },
  {
    id: "cl_nova",
    merchantId: "2662",
    type: "ENTERPRISE",
    name: "Nova Telecom",
    businessName: "Nova Telecom Services Ltd",
    countryCode: "+91",
    phone: "9004456789",
    email: "campaigns@novatelecom.in",
    category: "Telecom",
    subCategory: "Postpaid",
    pan: "AABCN5678M",
    gstin: "29AABCN5678M1Z2",
    registered: { address: "Tower B, Prestige Tech Park, Marathahalli", city: "Bengaluru", state: "Karnataka", country: "India", zipcode: "560103" },
    sameAsRegistered: false,
    communication: { address: "7th Floor, DLF Cyber City", city: "Gurugram", state: "Haryana", country: "India", zipcode: "122002" },
    region: "India (DLT)",
    status: "stopped",
    updatedBy: "Rahul V.",
    updatedAt: "6 Aug 2026, 08:15",
    stopConfig: {
      enforcement: "hard",
      softOverflowPct: 10,
      avgConnectivityPct: 75,
      avgCallMinutes: 2,
      caps: caps([
        ["whatsapp", 80000, "monthly", 12000],
        ["sms", 500000, "monthly", 205000],
        ["rcs", 60000, "monthly", 0],
        ["voice", 25000, "monthly", 9100],
      ]),
    },
    campaigns: [
      { id: "cmp_nova_1", name: "Port-in Winback", channels: ["voice", "sms"], runType: "one-time", status: "stopped", contacted: 3300, total: 12000, stoppedReason: "Compliance hold — DLT scrub pending", stoppedBy: "Rahul V." },
      { id: "cmp_nova_2", name: "5G Upgrade Blast", channels: ["whatsapp"], runType: "api", status: "blocked", contacted: 5400, total: 40000, stoppedReason: "Admin hard-stop (billing)", stoppedBy: "Rahul V." },
    ],
    audit: [
      { id: "au4", when: "6 Aug 2026, 08:15", actor: "Rahul V.", summary: "Hard-stopped 'Port-in Winback' — reason: Compliance hold" },
    ],
  },
  {
    id: "cl_orbit",
    merchantId: "2661",
    type: "ENTERPRISE",
    name: "Orbit Financial",
    businessName: "Orbit Financial Group Ltd",
    countryCode: "+44",
    phone: "2079460012",
    email: "marketing@orbitfinancial.co.uk",
    category: "BFSI",
    subCategory: "Wealth / Broking",
    pan: "",
    gstin: "",
    registered: { address: "30 St Mary Axe", city: "London", state: "Greater London", country: "United Kingdom", zipcode: "EC3A 8BF" },
    sameAsRegistered: true,
    communication: { address: "30 St Mary Axe", city: "London", state: "Greater London", country: "United Kingdom", zipcode: "EC3A 8BF" },
    region: "UK",
    status: "active",
    updatedBy: "Mayan Kansal",
    updatedAt: "1 Aug 2026, 11:20",
    stopConfig: {
      enforcement: "hard",
      softOverflowPct: 20,
      avgConnectivityPct: 75,
      avgCallMinutes: 2,
      caps: caps([
        ["whatsapp", 30000, "monthly", 6400],
        ["sms", 60000, "monthly", 12000],
        ["rcs", 10000, "monthly", 0],
        ["voice", 5000, "annual", 1200],
      ]),
    },
    campaigns: [
      { id: "cmp_orbit_1", name: "Wealth Review Q3", channels: ["voice"], runType: "one-time", status: "running", contacted: 600, total: 2500 },
    ],
    audit: [
      { id: "au5", when: "1 Aug 2026, 11:20", actor: "Mayan Kansal", summary: "Client onboarded — default caps applied" },
    ],
  },
  {
    id: "cl_pulse",
    merchantId: "2660",
    type: "ENTERPRISE",
    name: "Pulse Health",
    businessName: "Pulse Health Systems LLC",
    countryCode: "+1",
    phone: "6465550188",
    email: "reminders@pulsehealth.com",
    category: "Healthcare",
    subCategory: "Hospitals",
    pan: "",
    gstin: "",
    registered: { address: "525 East 68th Street", city: "New York", state: "New York", country: "United States", zipcode: "10065" },
    sameAsRegistered: true,
    communication: { address: "525 East 68th Street", city: "New York", state: "New York", country: "United States", zipcode: "10065" },
    region: "US",
    status: "active",
    updatedBy: "Ops Bot",
    updatedAt: "3 Aug 2026, 16:05",
    stopConfig: {
      enforcement: "soft",
      softOverflowPct: 25,
      avgConnectivityPct: 75,
      avgCallMinutes: 2,
      caps: caps([
        ["whatsapp", 45000, "monthly", 15000],
        ["sms", 90000, "monthly", 30000],
        ["rcs", 15000, "monthly", 2000],
        ["voice", 6000, "monthly", 5100],
      ]),
    },
    campaigns: [
      { id: "cmp_pulse_1", name: "Appointment Reminders", channels: ["sms", "voice"], runType: "api", status: "running", contacted: 18000, total: 50000 },
    ],
    audit: [
      { id: "au6", when: "3 Aug 2026, 16:05", actor: "Ops Bot", summary: "Voice cap raised to 6,000 connected minutes" },
    ],
  },
];

let current: Merchant[] = SEED.map((m) => ({ ...m }));
const listeners = new Set<() => void>();

function emit() {
  // Re-derive each merchant's rollup status from its caps + campaigns before notifying.
  current = current.map(deriveStatus);
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function deriveStatus(m: Merchant): Merchant {
  const anyStopped = m.campaigns.some((c) => c.status === "stopped" || c.status === "blocked");
  const anyCapReached = m.stopConfig.caps.some((c) => capReached(c, m.stopConfig));
  const status: MerchantStatus = anyStopped ? "stopped" : anyCapReached ? "capped" : "active";
  return { ...m, status };
}

function nowStamp(): string {
  return new Date().toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).replace(",", "");
}

// ── reads ──────────────────────────────────────────────────────────────────

export function useMerchants(): Merchant[] {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
export function useMerchant(id: string): Merchant | undefined {
  return useMerchants().find((m) => m.id === id);
}
export function getMerchants(): Merchant[] {
  return current;
}

// ── writes ─────────────────────────────────────────────────────────────────

// ── merchant profile (onboard / edit) ────────────────────────────────────────

export function emptyAddress(): MerchantAddress {
  return { address: "", city: "", state: "", country: "", zipcode: "" };
}

/** A blank profile for the Onboard form. */
export function blankProfile(): MerchantProfile {
  return {
    name: "", businessName: "", countryCode: "+91", phone: "", email: "",
    category: "", subCategory: "", pan: "", gstin: "",
    registered: emptyAddress(), sameAsRegistered: true, communication: emptyAddress(),
  };
}

/** Default caps a freshly-onboarded merchant inherits (hard enforcement). */
function defaultStopConfig(): StopConfig {
  return {
    enforcement: "hard",
    softOverflowPct: 20,
    avgConnectivityPct: 75,
    avgCallMinutes: 2,
    caps: caps([
      ["whatsapp", 50000, "monthly", 0],
      ["sms", 100000, "monthly", 0],
      ["rcs", 20000, "monthly", 0],
      ["voice", 8000, "monthly", 0],
    ]),
  };
}

/** Next display id, one past the current max (seeds start at 2660). */
function nextMerchantId(): string {
  const max = current.reduce((n, m) => Math.max(n, Number(m.merchantId) || 0), 2664);
  return String(max + 1);
}

/** Pull just the profile slice out of a merchant (for the edit form). */
export function toProfile(m: Merchant): MerchantProfile {
  return {
    name: m.name, businessName: m.businessName, countryCode: m.countryCode,
    phone: m.phone, email: m.email, category: m.category, subCategory: m.subCategory,
    pan: m.pan, gstin: m.gstin, registered: { ...m.registered },
    sameAsRegistered: m.sameAsRegistered, communication: { ...m.communication },
  };
}

/** Normalise a profile before persisting (communication mirrors registered when linked). */
function normalizeProfile(p: MerchantProfile): MerchantProfile {
  return { ...p, communication: p.sameAsRegistered ? { ...p.registered } : p.communication };
}

/** Onboard a new ENTERPRISE merchant with default caps. Returns the new id. */
export function createMerchant(profile: MerchantProfile, actor = "You"): string {
  const id = `cl_${Date.now().toString(36)}`;
  const when = nowStamp();
  const p = normalizeProfile(profile);
  const merchant: Merchant = {
    ...p,
    id,
    merchantId: nextMerchantId(),
    type: "ENTERPRISE",
    region: p.registered.country || "—",
    status: "active",
    stopConfig: defaultStopConfig(),
    campaigns: [],
    audit: [{ id: `au_${Date.now().toString(36)}`, when, actor, summary: "Merchant onboarded — default caps applied" }],
    updatedBy: actor,
    updatedAt: when,
  };
  current = [merchant, ...current];
  emit();
  return id;
}

/** Update an existing merchant's profile (id and type stay fixed). */
export function saveMerchantProfile(id: string, profile: MerchantProfile, actor = "You") {
  const p = normalizeProfile(profile);
  current = current.map((m) => {
    if (m.id !== id) return m;
    const entry: AuditEntry = {
      id: `au_${Date.now().toString(36)}`,
      when: nowStamp(),
      actor,
      summary: "Merchant profile updated",
    };
    return { ...m, ...p, region: p.registered.country || m.region, updatedBy: actor, updatedAt: entry.when, audit: [entry, ...m.audit] };
  });
  emit();
}

/** Persist a merchant's Stop-Campaign config; records an audit line (who + when). */
export function saveStopConfig(id: string, config: StopConfig, actor = "You") {
  current = current.map((m) => {
    if (m.id !== id) return m;
    const entry: AuditEntry = {
      id: `au_${Date.now().toString(36)}`,
      when: nowStamp(),
      actor,
      summary: `Updated caps & enforcement (${config.enforcement === "soft" ? `Soft · ${config.softOverflowPct}% overflow` : "Hard cap"})`,
    };
    return { ...m, stopConfig: config, updatedBy: actor, updatedAt: entry.when, audit: [entry, ...m.audit] };
  });
  emit();
}

/** Hard-stop a running campaign. Reason is required (Story 3); logged to audit. */
export function stopCampaign(merchantId: string, campaignId: string, reason: string, actor = "You") {
  current = current.map((m) => {
    if (m.id !== merchantId) return m;
    const campaigns = m.campaigns.map((c) => {
      if (c.id !== campaignId) return c;
      // Already stopped → no-op, no re-notify (Story 3 acceptance).
      if (c.status === "stopped" || c.status === "blocked") return c;
      const status: CampaignRunStatus = c.runType === "api" ? "blocked" : "stopped";
      return { ...c, status, stoppedReason: reason, stoppedBy: actor, cappedChannel: undefined };
    });
    const entry: AuditEntry = {
      id: `au_${Date.now().toString(36)}`,
      when: nowStamp(),
      actor,
      summary: `Hard-stopped '${m.campaigns.find((c) => c.id === campaignId)?.name}' — reason: ${reason}`,
    };
    return { ...m, campaigns, updatedBy: actor, updatedAt: entry.when, audit: [entry, ...m.audit] };
  });
  emit();
}

/**
 * Resume a stopped campaign (Story 4). One flow for cap-stops and hard-stops.
 * If the campaign was cap-stopped, the caller must raise that cap in the same action
 * (`raiseCapTo`) — you cannot resume into a cap that is already met.
 */
export function resumeCampaign(
  merchantId: string,
  campaignId: string,
  reason: string,
  actor = "You",
  raiseCapTo?: number,
) {
  current = current.map((m) => {
    if (m.id !== merchantId) return m;
    const target = m.campaigns.find((c) => c.id === campaignId);
    let stopConfig = m.stopConfig;
    if (target?.cappedChannel && typeof raiseCapTo === "number") {
      stopConfig = {
        ...m.stopConfig,
        caps: m.stopConfig.caps.map((c) =>
          c.channel === target.cappedChannel ? { ...c, cap: raiseCapTo } : c,
        ),
      };
    }
    const campaigns = m.campaigns.map((c) =>
      c.id === campaignId ? { ...c, status: "running" as CampaignRunStatus, stoppedReason: undefined, stoppedBy: undefined, cappedChannel: undefined } : c,
    );
    const capNote = target?.cappedChannel && typeof raiseCapTo === "number"
      ? ` (raised ${CHANNEL_META[target.cappedChannel].label} cap to ${raiseCapTo.toLocaleString()})`
      : "";
    const entry: AuditEntry = {
      id: `au_${Date.now().toString(36)}`,
      when: nowStamp(),
      actor,
      summary: `Resumed '${target?.name}' — reason: ${reason}${capNote}. Continues to un-contacted only.`,
    };
    return { ...m, stopConfig, campaigns, updatedBy: actor, updatedAt: entry.when, audit: [entry, ...m.audit] };
  });
  emit();
}
