/**
 * RCS channel configuration — types + demo data for Channels → RCS → Overview.
 *
 * The RCS brand/agent model (PICOM-4728 §2): a **Brand** is registered under a
 * single **provider** — JIO (direct RBM) or Netcore-VI — and owns one or more
 * **Agents**. An Agent is of a **type** (Transactional or Promotional) and is
 * configured with an Agent Name, Type, Agent ID and Agent Key; the ID and Key
 * are held in the backend and are never shown to the client, so while the model
 * carries them, no component renders them.
 *
 * Everything here is provisioned by the Pi Commerce ops team from the backend;
 * the panel only displays it (same read-only stance as {@link file://./sms-config.ts}).
 */

/** The provider a brand's traffic routes through. */
export type RcsProvider = "JIO" | "Netcore-VI";

/** Agent classification. RCS has no OTP agent type — OTP-style copy rides on a
 *  Transactional agent. */
export type RcsAgentType = "Transactional" | "Promotional";

/** Agent types, in display order. */
export const RCS_AGENT_TYPES: RcsAgentType[] = ["Transactional", "Promotional"];

/** All supported providers, in display order. */
export const RCS_PROVIDERS: RcsProvider[] = ["JIO", "Netcore-VI"];

/** Friendly provider label (Netcore carries the VI pipeline). */
export function providerLabel(p: RcsProvider): string {
  return p === "JIO" ? "JIO" : "Netcore · VI";
}

/** A registered RCS agent under a brand. */
export type RcsAgent = {
  /** Stable id used by templates + the campaign node. */
  id: string;
  /** Agent Name — shown to recipients and in the console. */
  name: string;
  type: RcsAgentType;
  /** Agent ID — backend credential, never rendered to the client. */
  agentId: string;
  /** Agent Key — backend credential, never rendered to the client. */
  agentKey: string;
  /** Whether the provider has verified the agent (gates live sending). */
  verified: boolean;
  registeredOn: string;
};

/** A brand, its provider, and the agents registered under it. */
export type RcsBrand = {
  id: string;
  name: string;
  /** Brand logo (mock URL here). */
  logoUrl: string;
  /** The single provider this brand is registered under. */
  provider: RcsProvider;
  agents: RcsAgent[];
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
      provider: "JIO",
      agents: [
        { id: "acme_promo_bot", name: "ACME Offers", type: "Promotional", agentId: "AG-JIO-10041", agentKey: "•••• stored in backend", verified: true, registeredOn: "04 Jun 2026" },
        { id: "acme_utility_bot", name: "ACME Updates", type: "Transactional", agentId: "AG-JIO-10042", agentKey: "•••• stored in backend", verified: true, registeredOn: "04 Jun 2026" },
        { id: "acme_otp_bot", name: "ACME Verify", type: "Transactional", agentId: "AG-JIO-10043", agentKey: "•••• stored in backend", verified: true, registeredOn: "11 Jun 2026" },
        { id: "acme_promo_bot_2", name: "ACME Deals", type: "Promotional", agentId: "AG-JIO-10044", agentKey: "•••• stored in backend", verified: false, registeredOn: "22 Jun 2026" },
      ],
    },
    {
      id: "brand_acme_retail",
      name: "ACME Retail",
      logoUrl: "https://cdn.picomm.in/rcs/acme-retail-logo.png",
      provider: "Netcore-VI",
      agents: [
        { id: "retail_promo_bot", name: "ACME Retail Offers", type: "Promotional", agentId: "AG-NC-20071", agentKey: "•••• stored in backend", verified: true, registeredOn: "18 Jun 2026" },
        { id: "retail_utility_bot", name: "ACME Retail Updates", type: "Transactional", agentId: "AG-NC-20072", agentKey: "•••• stored in backend", verified: true, registeredOn: "18 Jun 2026" },
      ],
    },
  ],
};

/** Resolve a brand by id. */
export function brandById(config: RcsChannelConfig, brandId?: string): RcsBrand | undefined {
  if (!brandId) return undefined;
  return config.brands.find((b) => b.id === brandId);
}

/** Every agent across all brands. */
export function allAgents(config: RcsChannelConfig): RcsAgent[] {
  return config.brands.flatMap((b) => b.agents);
}

/** Resolve an agent by id, searching every brand. */
export function agentById(config: RcsChannelConfig, agentId?: string): RcsAgent | undefined {
  if (!agentId) return undefined;
  return allAgents(config).find((a) => a.id === agentId);
}

/** Agents under a brand, optionally filtered to one type. */
export function agentsForBrand(config: RcsChannelConfig, brandId?: string, type?: RcsAgentType): RcsAgent[] {
  const agents = brandById(config, brandId)?.agents ?? [];
  return type ? agents.filter((a) => a.type === type) : agents;
}

/** The brand an agent belongs to (its provider drives media rules). */
export function brandForAgent(config: RcsChannelConfig, agentId?: string): RcsBrand | undefined {
  if (!agentId) return undefined;
  return config.brands.find((b) => b.agents.some((a) => a.id === agentId));
}

/** The provider an agent's traffic routes through (via its brand). */
export function providerForAgent(config: RcsChannelConfig, agentId?: string): RcsProvider | undefined {
  return brandForAgent(config, agentId)?.provider;
}
