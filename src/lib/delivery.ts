/**
 * The lanes we can carry someone else's campaign on — platform × channel.
 *
 * This exists because "Platforms we deliver for" was built for one lane and reads
 * like the whole product. A client looking at that group cannot currently tell
 * whether MoEngage is unsupported, unbuilt, or simply not set up yet, and those are
 * three different answers. Enumerating the matrix with a built/planned flag makes
 * the group answer the question it is on the page to answer.
 *
 * Platform-major rather than a flat list of six pairs, because that is the shape the
 * UI renders: one tile per platform, its channels as chips inside. A flat list would
 * need regrouping at every call site and would have no other consumer.
 *
 * No state, no store, no hooks. What is built is a fact about our codebase, not
 * about a merchant, so it is a constant and changes in a commit.
 */
import { pushTarget, type PushTarget } from "@/lib/connections";

/**
 * Narrower than `Channel` in `merchants.ts` on purpose. That union carries `rcs` and
 * `voice` because a merchant can be capped on them; a *delivery lane* for voice is
 * meaningless — nobody hands us a finished phone call to carry. Sharing the wider
 * type would let `{ channel: "voice" }` typecheck here, so this is a deliberate
 * subset rather than a fork.
 */
export type DeliveryChannel = "whatsapp" | "sms";

export const DELIVERY_CHANNEL_LABEL: Record<DeliveryChannel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
};

/**
 * One platform we carry for, and which of its channels are actually built.
 *
 * `platform` keys into {@link PushTarget} rather than naming the vendor again. The
 * same three products already appear on this page as engagement tools, and letting
 * them drift to two spellings and two brand colours is exactly what happened the
 * first time — the connector badge was hand-coded `#e8492f` while the registry said
 * `#F04E5E`.
 */
export type DeliveryLane = {
  platform: PushTarget["key"];
  channels: { channel: DeliveryChannel; live: boolean }[];
};

/**
 * `custom` is absent, and not by oversight: it is the *absence* of a named platform,
 * so there is nothing to be a carrier for. `LISTED_PUSH_TARGETS` excludes it for the
 * same reason.
 *
 * There is no per-cell reason field, and the table does not print one. Every
 * `live: false` cell now has the same single cause — that platform's delivery
 * contract is not written — and it is not something a client can act on. Four rows
 * carrying a variation on "not built yet" is the roadmap restated four times, which
 * is why `live` alone is what this type models.
 */
export const DELIVERY_LANES: DeliveryLane[] = [
  {
    platform: "clevertap",
    channels: [
      { channel: "whatsapp", live: true },
      { channel: "sms", live: true },
    ],
  },
  {
    platform: "webengage",
    channels: [
      { channel: "whatsapp", live: false },
      { channel: "sms", live: false },
    ],
  },
  {
    platform: "moengage",
    channels: [
      { channel: "whatsapp", live: false },
      { channel: "sms", live: false },
    ],
  },
];

/**
 * Every lane a connector can currently be created on.
 *
 * Read by the new-connector dialog's first step, so the picker is the registry rather
 * than a hardcoded pair. It now yields two — CleverTap on WhatsApp and on SMS — and
 * that is what the dialog's lane step is for: the two lanes are issued differently
 * enough (one number versus a set of sender headers) that the choice decides the rest
 * of the dialog rather than just labelling it.
 */
export function liveLanes(): { platform: PushTarget["key"]; channel: DeliveryChannel }[] {
  return DELIVERY_LANES.flatMap((lane) =>
    lane.channels
      .filter((c) => c.live)
      .map((c) => ({ platform: lane.platform, channel: c.channel })),
  );
}

/**
 * The one vendor a carry connector can currently belong to, resolved once.
 *
 * Read from the shared registry rather than restated, because it already drifted:
 * the connector row used to hand-code `#e8492f` while `PUSH_TARGETS` said `#F04E5E`,
 * so the same product wore two colours in two groups of one page. It lives here
 * rather than in a route because both the Connections index and the connector detail
 * page need the mark, and the second re-deriving it is how the first drift happened.
 */
export const CT_TARGET = pushTarget("clevertap");
