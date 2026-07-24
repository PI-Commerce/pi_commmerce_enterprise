/**
 * SMS channel configuration — types + demo data for Channels → SMS → Overview.
 *
 * Everything in this module is **provisioned by the Pi Commerce ops team** from
 * the backend (PICOM-4726 §2): the client whitelists Paytm's Telemarketer ID on
 * their DLT portal, Paytm approves it to establish the PE-TM binding, and ops
 * records the resulting Principal Entity, Sender IDs and use cases. The panel
 * only *displays* that state — there is no connect wizard and nothing here is
 * editable from the dashboard, which is why this has no counterpart to
 * {@link file://./waba-onboarding.ts}'s Embedded Signup flow.
 *
 * Vendor routing detail (SMPP accounts, hosts, ports, premium vs non-premium
 * failover) is deliberately absent — it is internal infrastructure and never
 * client-visible.
 */

/** A Sender ID (SMS header) registered on DLT under the principal entity. */
export type SmsSenderId = {
  /** The 3-11 character header recipients see, e.g. "PICOMM". */
  id: string;
  /** Pipelines this header is approved for. */
  useCases: ("Promotional" | "Transactional" | "OTP")[];
  registeredOn: string;
};

/** PE-TM binding state reported by ops. */
export type SmsBindingStatus = "Active" | "Pending approval" | "Not configured";

/** The provisioned SMS configuration for a workspace. */
export type SmsChannelConfig = {
  /** Paytm's Telemarketer ID, whitelisted by the client on their DLT portal. */
  telemarketerId: string;
  /** The client's Principal Entity, as registered on DLT. */
  principalEntity: { name: string; id: string };
  binding: {
    status: SmsBindingStatus;
    /** When ops approved the PE-TM binding. */
    approvedOn: string;
    /** DLT portal the entity is registered with (there are several in India). */
    dltOperator: string;
  };
  senderIds: SmsSenderId[];
  /** Pipelines enabled for this workspace. */
  pipelines: ("Promotional" | "Transactional" | "OTP")[];
};

/** Provisioned configuration for the demo workspace. */
export const SEED_SMS_CONFIG: SmsChannelConfig = {
  telemarketerId: "1101473820000012345",
  principalEntity: { name: "ACME Corp Pvt Ltd", id: "1101473820000034521" },
  binding: {
    status: "Active",
    approvedOn: "04 Jun 2026, 11:20 IST",
    dltOperator: "Vodafone Idea DLT",
  },
  senderIds: [
    { id: "PICOMM", useCases: ["Transactional", "Promotional"], registeredOn: "04 Jun 2026" },
    { id: "PICOTP", useCases: ["OTP"], registeredOn: "04 Jun 2026" },
    { id: "PIOFFR", useCases: ["Promotional"], registeredOn: "18 Jun 2026" },
  ],
  pipelines: ["Transactional", "Promotional", "OTP"],
};

/** Sender IDs approved for a given campaign type. */
export function sendersForCampaignType(
  config: SmsChannelConfig,
  campaignType: "Promotional" | "Transactional" | "OTP",
): SmsSenderId[] {
  return config.senderIds.filter((s) => s.useCases.includes(campaignType));
}
