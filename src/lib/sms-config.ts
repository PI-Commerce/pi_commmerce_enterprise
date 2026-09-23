/**
 * SMS channel configuration — types + demo data for Channels → SMS → Overview.
 *
 * Everything in this module is **provisioned by the Pi Commerce ops team** from
 * the backend (PICOM-4726 §2): the client registers Principal Entities and
 * Sender IDs on their DLT portal, Paytm approves the binding, and ops records
 * the onboarded entities and their senders here. The panel only *displays* that
 * state — there is no connect wizard and nothing here is editable from the
 * dashboard, which is why this has no counterpart to {@link file://./waba-onboarding.ts}'s
 * Embedded Signup flow.
 *
 * Vendor routing detail (SMPP accounts, hosts, ports, premium vs non-premium
 * failover) is deliberately absent — it is internal infrastructure and never
 * client-visible.
 */
import type { SmsCategory } from "@/lib/sms-templates";

/** A Sender ID (SMS header) registered on DLT under a principal entity. */
export type SmsSenderId = {
  /** The 3-11 character header recipients see, e.g. "PICOMM". */
  id: string;
  /** Template categories this header is approved for. */
  categories: SmsCategory[];
  registeredOn: string;
};

/** An onboarded Principal Entity and the senders registered under it. */
export type SmsPrincipalEntity = {
  /** DLT Principal Entity ID. */
  id: string;
  name: string;
  senderIds: SmsSenderId[];
};

/** The provisioned SMS configuration for a workspace. */
export type SmsChannelConfig = {
  /** Paytm's Telemarketer ID, whitelisted by the client on their DLT portal. */
  telemarketerId: string;
  /** Every Principal Entity onboarded for this workspace. */
  principalEntities: SmsPrincipalEntity[];
};

/** Provisioned configuration for the demo workspace. */
export const SEED_SMS_CONFIG: SmsChannelConfig = {
  telemarketerId: "1101473820000012345",
  principalEntities: [
    {
      id: "1101473820000034521",
      name: "ACME Corp Pvt Ltd",
      senderIds: [
        { id: "PICOMM", categories: ["Transactional", "Promotional"], registeredOn: "04 Jun 2026" },
        { id: "PICOTP", categories: ["Transactional"], registeredOn: "04 Jun 2026" },
        { id: "PIOFFR", categories: ["Promotional"], registeredOn: "18 Jun 2026" },
      ],
    },
    {
      id: "1101473820000098234",
      name: "ACME Retail Pvt Ltd",
      senderIds: [
        { id: "ACMSHP", categories: ["Transactional", "Promotional"], registeredOn: "11 Jun 2026" },
        { id: "ACMOFR", categories: ["Promotional"], registeredOn: "22 Jun 2026" },
      ],
    },
  ],
};

/** Resolve a Principal Entity by its DLT id. */
export function entityById(config: SmsChannelConfig, peId?: string): SmsPrincipalEntity | undefined {
  if (!peId) return undefined;
  return config.principalEntities.find((e) => e.id === peId);
}

/** Senders registered under a given Principal Entity. */
export function sendersForEntity(config: SmsChannelConfig, peId?: string): SmsSenderId[] {
  return entityById(config, peId)?.senderIds ?? [];
}

/** Senders under an entity approved for a given category (drives the template form). */
export function sendersForEntityCategory(
  config: SmsChannelConfig,
  peId: string | undefined,
  category: SmsCategory,
): SmsSenderId[] {
  return sendersForEntity(config, peId).filter((s) => s.categories.includes(category));
}

/**
 * Every sender across all entities approved for a category. The SMS *node*
 * cascade (category → sender → template) isn't PE-scoped — it resolves the PE
 * from the chosen template — so it draws from this flattened, deduped view.
 */
export function sendersForCategory(config: SmsChannelConfig, category: SmsCategory): SmsSenderId[] {
  const seen = new Set<string>();
  const out: SmsSenderId[] = [];
  for (const e of config.principalEntities) {
    for (const s of e.senderIds) {
      if (s.categories.includes(category) && !seen.has(s.id)) {
        seen.add(s.id);
        out.push(s);
      }
    }
  }
  return out;
}
