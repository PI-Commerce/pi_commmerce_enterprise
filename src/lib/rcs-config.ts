/**
 * RCS channel configuration — types + demo data for Channels → RCS → Overview.
 *
 * The RCS brand/bot model (PICOM-4728 §2): a **Brand** owns **bots (agents)**,
 * each registered for a message **category** (Promotional / Utility / OTP) and
 * routed through a **vendor pipeline** — JIO (direct RBM) or Netcore, which
 * carries the VI pipeline. Multiple bots per category are allowed (cap 10).
 *
 * Everything here is provisioned by the Pi Commerce ops team from the backend;
 * the panel only displays it (same read-only stance as {@link file://./sms-config.ts}).
 * Vendor routing internals (bot keys, API endpoints) are not client-visible.
 */
import type { RcsCategory } from "@/lib/rcs-templates";

/** Which vendor pipeline a bot's traffic routes through. */
export type RcsVendor = "JIO" | "Netcore-VI";

/** A registered RCS bot (agent) under a brand. */
export type RcsBot = {
  /** Stable bot id used by templates + the campaign node. */
  id: string;
  /** Display name shown to recipients as the agent. */
  name: string;
  category: RcsCategory;
  vendor: RcsVendor;
  /** Whether Google has verified the agent (gates live sending). */
  verified: boolean;
  registeredOn: string;
};

/** A brand and the bots registered under it. */
export type RcsBrand = {
  id: string;
  name: string;
  /** Brand logo — 224x224 px, ≤50 KB per the JIO PRD (mock URL here). */
  logoUrl: string;
  bots: RcsBot[];
};

/** The provisioned RCS configuration for a workspace. */
export type RcsChannelConfig = {
  brands: RcsBrand[];
};

/** Provisioned configuration for the demo workspace. */
export const SEED_RCS_CONFIG: RcsChannelConfig = {
  brands: [
    {
      id: "brand_acme",
      name: "ACME Corp",
      logoUrl: "https://cdn.picomm.in/rcs/acme-logo.png",
      bots: [
        { id: "acme_promo_bot", name: "ACME Offers", category: "Promotional", vendor: "JIO", verified: true, registeredOn: "04 Jun 2026" },
        { id: "acme_utility_bot", name: "ACME Updates", category: "Utility", vendor: "JIO", verified: true, registeredOn: "04 Jun 2026" },
        { id: "acme_otp_bot", name: "ACME Verify", category: "OTP", vendor: "Netcore-VI", verified: true, registeredOn: "11 Jun 2026" },
        { id: "acme_promo_bot_2", name: "ACME Deals", category: "Promotional", vendor: "Netcore-VI", verified: false, registeredOn: "22 Jun 2026" },
      ],
    },
    {
      id: "brand_acme_retail",
      name: "ACME Retail",
      logoUrl: "https://cdn.picomm.in/rcs/acme-retail-logo.png",
      bots: [
        { id: "retail_promo_bot", name: "ACME Retail Offers", category: "Promotional", vendor: "JIO", verified: true, registeredOn: "18 Jun 2026" },
        { id: "retail_utility_bot", name: "ACME Retail Updates", category: "Utility", vendor: "Netcore-VI", verified: true, registeredOn: "18 Jun 2026" },
      ],
    },
  ],
};

/** Resolve a brand by id. */
export function brandById(config: RcsChannelConfig, brandId?: string): RcsBrand | undefined {
  if (!brandId) return undefined;
  return config.brands.find((b) => b.id === brandId);
}

/** Every bot across all brands. */
export function allBots(config: RcsChannelConfig): RcsBot[] {
  return config.brands.flatMap((b) => b.bots);
}

/** Resolve a bot by id, searching every brand. */
export function botById(config: RcsChannelConfig, botId?: string): RcsBot | undefined {
  if (!botId) return undefined;
  return allBots(config).find((b) => b.id === botId);
}

/** Bots registered for a given category (drives the node/template cascade). */
export function botsForCategory(config: RcsChannelConfig, category: RcsCategory): RcsBot[] {
  return allBots(config).filter((b) => b.category === category);
}

/** Bots under a brand, optionally filtered to one category. */
export function botsForBrand(config: RcsChannelConfig, brandId?: string, category?: RcsCategory): RcsBot[] {
  const bots = brandById(config, brandId)?.bots ?? [];
  return category ? bots.filter((b) => b.category === category) : bots;
}
