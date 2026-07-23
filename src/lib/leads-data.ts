/**
 * Leads Management — a lightweight, generic customer directory for v2.
 *
 * Deliberately kept product-agnostic. The FinServ branch has a much richer
 * shape (per-loan / per-policy / per-card sub-objects) — that surface will be
 * revisited later. This v2 pass just gives every campaign-touched contact a
 * stable identity, a rolling WhatsApp thread, and a "campaigns I've been in"
 * timeline. No PII persistence in production, no runtime writes: this is a
 * mock read-model.
 *
 * The seed reuses names from the campaigns already registered in
 * `campaign-examples.ts` so the Campaign filter in the Leads list feels
 * connected to what the user sees under `/campaigns`.
 */

export type Segment = "VIP" | "Retail" | "SME";

/** A run status snapshot for a Lead's participation in a campaign. */
export type CampaignRunStatus = "running" | "completed" | "paused" | "failed" | "terminated";

/** A single association: this lead flowed through this campaign's run. */
export type LeadCampaignEntry = {
  campaignId: string;
  campaignName: string;
  runId: string;
  runName: string;
  status: CampaignRunStatus;
  /** ISO timestamps for the timeline column. */
  enteredAt: string;
  exitedAt?: string;
};

/** A single message on the lead's cross-campaign WhatsApp thread. */
export type LeadWhatsappMessage = {
  timestamp: string;                    // ISO
  direction: "outbound" | "inbound";
  body: string;
  campaignId?: string;
  campaignName?: string;
  /** Optional CTA label — renders as an inline link pill. */
  linkLabel?: string;
};

/** A single row in the timeline of interactions (WhatsApp / Voice / SMS / Email). */
export type InteractionChannel = "WhatsApp" | "Voice" | "SMS" | "Email";
export type InteractionEntry = {
  timestamp: string;                    // human-friendly, e.g. "2 days ago"
  channel: InteractionChannel;
  direction: "outbound" | "inbound";
  summary: string;
  outcome?: string;
};

export type LeadRecord = {
  id: string;                           // stable Lead id (l_xxxx)
  customerId: string;                   // client-side customer id
  name: string;
  phone: string;
  email?: string;
  segment: Segment;
  /** Free-form tags — the platform surface for arbitrary categorisation. */
  tags: string[];
  createdAt: string;                    // ISO
  lastUpdatedAt: string;                // ISO
  lastInteractionAt: string;            // ISO
  campaigns: LeadCampaignEntry[];
  interactions: InteractionEntry[];
  whatsappThread: LeadWhatsappMessage[];
};

/* -------------------------------------------------------------------------- *
 *  Utilities
 * -------------------------------------------------------------------------- */

/** Mask a phone number to `+91 ******7823` — keeps last 4 visible. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return phone;
  const last4 = digits.slice(-4);
  const cc = phone.startsWith("+") ? phone.slice(0, phone.indexOf(digits[0])) : "";
  return `${cc}${"*".repeat(Math.max(6, digits.length - 4))}${last4}`.trim();
}

/** Format an ISO timestamp as "MMM d, yyyy · h:mm a" (India-friendly). */
export function formatIso(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
    ...opts,
  });
}

/* -------------------------------------------------------------------------- *
 *  Campaign catalog (seed-only)
 *
 *  Kept small on purpose — the Leads section is meant to demonstrate the
 *  memory + campaign-attribution story. When the user wires a real customer
 *  360, this list is replaced by whatever `campaign-examples.ts` publishes.
 * -------------------------------------------------------------------------- */

const CAMPAIGN_CATALOG: Array<{ id: string; name: string }> = [
  { id: "c_ex17", name: "Retail · ACME Corp FCC Loyalty" },
  { id: "c_ex7",  name: "Retail · Activation" },
  { id: "c_ex8",  name: "Retail · Reward Expiry" },
  { id: "c_ex9",  name: "Retail · Winback" },
  { id: "c_ex11", name: "Retail · Seasonal Sale" },
  { id: "c_ex14", name: "D2C · Cart Abandonment" },
  { id: "c_ex15", name: "E-commerce · Price Drop" },
];

const FIRST_NAMES = [
  "Aarav", "Vihaan", "Aditya", "Arjun", "Kabir", "Sai", "Ishaan", "Reyansh",
  "Ananya", "Aadhya", "Diya", "Ira", "Kavya", "Meera", "Riya", "Sara",
  "Rohan", "Neha", "Priya", "Rahul", "Sneha", "Vikram", "Anjali", "Karan",
  "Nisha", "Pooja", "Ravi", "Shreya", "Tanya", "Yash", "Zara", "Aman",
  "Divya", "Farhan", "Gauri", "Harsh", "Ishita", "Jai", "Kiran", "Lakshmi",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Iyer", "Nair", "Menon", "Reddy", "Rao",
  "Patel", "Shah", "Mehta", "Kapoor", "Malhotra", "Chopra", "Bhat",
  "Rangan", "Krishnan", "Bhargava", "Singhal", "Agarwal",
];

const SEGMENTS: Segment[] = ["VIP", "Retail", "SME"];
const TAG_POOL = [
  "loyalty", "new-customer", "high-ltv", "win-back", "cart-abandoner",
  "kyc-pending", "opt-in-marketing", "premium-tier", "app-user", "web-only",
];

/* -------------------------------------------------------------------------- *
 *  Deterministic PRNG so the seed stays stable across renders
 * -------------------------------------------------------------------------- */

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = seed;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function isoDaysAgo(days: number, hour = 10, minute = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function fakePhone(rng: () => number): string {
  const rest = String(Math.floor(rng() * 1_000_000_000)).padStart(9, "0");
  const first = String(6 + Math.floor(rng() * 4)); // 6/7/8/9
  return `+91 ${first}${rest.slice(0, 4)} ${rest.slice(4, 8)}`;
}

/* -------------------------------------------------------------------------- *
 *  Thread builder — cross-campaign WhatsApp history
 * -------------------------------------------------------------------------- */

function buildWhatsappThread(
  entries: LeadCampaignEntry[],
  firstName: string,
  rng: () => number,
): LeadWhatsappMessage[] {
  const messages: LeadWhatsappMessage[] = [];
  for (const c of entries) {
    const enteredAtMs = Date.parse(c.enteredAt);
    // Outbound greeting
    messages.push({
      timestamp: new Date(enteredAtMs).toISOString(),
      direction: "outbound",
      body: outboundBodyFor(c.campaignName, firstName),
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      linkLabel: hasLinkFor(c.campaignName) ? "View offer" : undefined,
    });
    // ~55% probability of an inbound reply
    if (rng() < 0.55) {
      const replyDelayMin = 5 + Math.floor(rng() * 240);
      messages.push({
        timestamp: new Date(enteredAtMs + replyDelayMin * 60_000).toISOString(),
        direction: "inbound",
        body: inboundBodyFor(c.campaignName, rng),
        campaignId: c.campaignId,
        campaignName: c.campaignName,
      });
    }
  }
  return messages.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function outboundBodyFor(campaignName: string, firstName: string): string {
  if (campaignName.includes("Loyalty"))         return `Hi ${firstName}, thanks for being a loyal customer! Here's an exclusive reward for you.`;
  if (campaignName.includes("Activation"))      return `Welcome ${firstName}! Complete your first purchase and get 15% off.`;
  if (campaignName.includes("Reward Expiry"))   return `Hi ${firstName}, your reward points expire in 7 days — redeem now.`;
  if (campaignName.includes("Winback"))         return `${firstName}, we've missed you! Here's a special offer to bring you back.`;
  if (campaignName.includes("Seasonal"))        return `${firstName}, our seasonal sale is live — up to 40% off.`;
  if (campaignName.includes("Cart Abandonment")) return `Hi ${firstName}, you left something in your cart. Complete your purchase now.`;
  if (campaignName.includes("Price Drop"))      return `${firstName}, the item you saved just dropped in price!`;
  return `Hi ${firstName}, we have an update for you.`;
}

function hasLinkFor(campaignName: string): boolean {
  return campaignName.includes("Cart") || campaignName.includes("Price") || campaignName.includes("Seasonal") || campaignName.includes("Loyalty");
}

function inboundBodyFor(campaignName: string, rng: () => number): string {
  const generic = ["Ok", "Thanks!", "Not interested", "Tell me more", "Sure"];
  if (campaignName.includes("Cart"))       return pick(rng, ["Already ordered", "Not now", "Show me options"]);
  if (campaignName.includes("Loyalty"))    return pick(rng, ["Redeemed!", "Nice, thanks", "I'll check"]);
  if (campaignName.includes("Winback"))    return pick(rng, ["Maybe", "Not interested", "What's the offer?"]);
  return pick(rng, generic);
}

/* -------------------------------------------------------------------------- *
 *  Seed generator
 * -------------------------------------------------------------------------- */

function buildCampaignsFor(rng: () => number, createdDaysAgo: number): LeadCampaignEntry[] {
  const nEntries = 1 + Math.floor(rng() * 3);   // 1..3
  const chosen = new Set<string>();
  const entries: LeadCampaignEntry[] = [];
  while (chosen.size < nEntries) {
    const c = pick(rng, CAMPAIGN_CATALOG);
    if (chosen.has(c.id)) continue;
    chosen.add(c.id);
    const enteredDaysAgo = Math.max(0, Math.floor(rng() * createdDaysAgo));
    const statusRoll = rng();
    const status: CampaignRunStatus = statusRoll < 0.55 ? "completed" : statusRoll < 0.85 ? "running" : "terminated";
    entries.push({
      campaignId: c.id,
      campaignName: c.name,
      runId: `r_${Math.floor(1000 + rng() * 9000)}`,
      runName: `${c.name} · Run ${Math.floor(1 + rng() * 6)}`,
      status,
      enteredAt: isoDaysAgo(enteredDaysAgo, 9 + Math.floor(rng() * 8), Math.floor(rng() * 59)),
      exitedAt: status === "completed"
        ? isoDaysAgo(Math.max(0, enteredDaysAgo - 1 - Math.floor(rng() * 4)), 14, Math.floor(rng() * 59))
        : undefined,
    });
  }
  return entries.sort((a, b) => Date.parse(b.enteredAt) - Date.parse(a.enteredAt));
}

function buildInteractions(entries: LeadCampaignEntry[]): InteractionEntry[] {
  const out: InteractionEntry[] = [];
  for (const c of entries) {
    out.push({
      timestamp: c.enteredAt,
      channel: "WhatsApp",
      direction: "outbound",
      summary: `Sent template for ${c.campaignName}`,
      outcome: "Delivered",
    });
    if (c.exitedAt) {
      out.push({
        timestamp: c.exitedAt,
        channel: "WhatsApp",
        direction: "inbound",
        summary: `Reply received on ${c.campaignName}`,
        outcome: c.status === "completed" ? "Converted" : "No action",
      });
    }
  }
  return out.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

function buildLead(i: number): LeadRecord {
  const rng = mulberry32(i + 91);
  const firstName = pick(rng, FIRST_NAMES);
  const lastName = pick(rng, LAST_NAMES);
  const createdDaysAgo = 5 + Math.floor(rng() * 300);
  const createdAt = isoDaysAgo(createdDaysAgo, 10, Math.floor(rng() * 59));
  const campaigns = buildCampaignsFor(rng, createdDaysAgo);
  const lastCampaign = campaigns[0];
  const lastInteractionAt = lastCampaign?.enteredAt ?? createdAt;
  const lastUpdatedAt = lastCampaign?.exitedAt ?? lastInteractionAt;
  const tagCount = 1 + Math.floor(rng() * 3);
  const tags = Array.from({ length: tagCount }, () => pick(rng, TAG_POOL));
  const dedupedTags = Array.from(new Set(tags));
  const interactions = buildInteractions(campaigns);
  const whatsappThread = buildWhatsappThread(campaigns, firstName, rng);
  return {
    id: `l_${String(1000 + i)}`,
    customerId: `cust_${String(100000 + i * 37)}`,
    name: `${firstName} ${lastName}`,
    phone: fakePhone(rng),
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
    segment: pick(rng, SEGMENTS),
    tags: dedupedTags,
    createdAt,
    lastUpdatedAt,
    lastInteractionAt,
    campaigns,
    interactions,
    whatsappThread,
  };
}

/** ~50 seeded leads — deterministic so hot-reload doesn't shuffle rows. */
export const LEAD_RECORDS: LeadRecord[] = Array.from({ length: 50 }, (_, i) => buildLead(i));
