/**
 * Analytics dashboard surface — public types.
 *
 * Extracted from the pre-refactor pi-analytics.ts so the client (AnalyticsChat)
 * imports remain stable while the innards move. Kept in the surface folder
 * because they describe the SHAPE of what this surface produces + consumes.
 */

/** A concrete (campaign, run, node) triple in scope on the current screen.
 *  The Channel tab's asset/broadcast modes span multiple runs across multiple
 *  campaigns, so a single `campaignId`+`runId` pair can't describe the scope.
 *  The client resolves the selection into this list and Pi's tools honor it
 *  verbatim, so the numbers Pi cites match the on-screen KPI cards. */
export type ResolvedRef = { campaignId: string; runId: string; nodeId: string };

/** Everything the /analytics page is currently showing. Fed to Pi verbatim
 *  as the injected `Screen context` block on every turn so Pi grounds
 *  answers in what the user is actually looking at. */
export type AnalyticsScreenContext = {
  pathname?: string;
  filter?: {
    campaignId?: string;
    runId?: string;
    channel?: "whatsapp" | "voice" | "sms" | "rcs";
    stageNodeId?: string;
    from?: string;   // ISO yyyy-mm-dd
    to?: string;     // ISO yyyy-mm-dd
    status?: string;
    /** Channel-tab View-by mode. Undefined on the Campaign tab. */
    mode?: "campaign" | "asset" | "broadcast";
    /** The template / agent / broadcast the user picked in asset/broadcast
     *  mode. Ids from the workspace registry. */
    assetKind?: "template" | "agent";
    assetId?: string;
    broadcastId?: string;
    /** Pre-resolved (campaign, run, node) triples in scope. Populated by the
     *  client when the selection spans more than one (run, node) — asset and
     *  broadcast modes especially. Pi's tools sum over exactly these refs so
     *  they match the KPI cards; when empty/absent the tools fall back to
     *  their filter-driven behavior. */
    resolvedRefs?: ResolvedRef[];
  };
  tab?: string;                // "campaign" | "channel"
  selectedNodeId?: string;     // if a node drawer is open
  visibleKpis?: Record<string, unknown>;
  /** Human labels for the persistent context ribbon in the chat UI. */
  labels?: {
    campaignName?: string;
    runLabel?: string;
    channelLabel?: string;
    rangeLabel?: string;
    /** Asset picker label (template name / agent name / broadcast name). */
    assetLabel?: string;
    /** "Workflow run" / "Template" / "Agent" / "Broadcast" — the mode label
     *  the user sees in the View by dropdown. */
    modeLabel?: string;
  };
};

/** The chart spec Pi emits with each answer. Rendered client-side by ECharts. */
export type Infographic =
  | {
      kind: "bar";
      title: string;
      subtitle?: string;
      data: { categories: string[]; series: Array<{ name: string; values: number[] }> };
    }
  | {
      kind: "line";
      title: string;
      subtitle?: string;
      data: { categories: string[]; series: Array<{ name: string; values: number[] }> };
    }
  | {
      kind: "pie";
      title: string;
      subtitle?: string;
      data: Array<{ name: string; value: number }>;
    }
  | {
      kind: "funnel";
      title: string;
      subtitle?: string;
      data: Array<{ name: string; value: number }>;
    }
  | {
      kind: "kpi";
      title: string;
      subtitle?: string;
      data: Array<{ label: string; value: string | number; delta?: string }>;
    };

/** Structured answer Pi emits via the `emit_answer` terminator tool. */
export type AnalyticsAnswer = {
  insight: string;
  recommendation?: string;
  infographic?: Infographic;
  followUps: string[];
};

/** Normalize the raw `emit_answer` tool args (unknown-typed at kernel level)
 *  into the typed AnalyticsAnswer shape. Drops missing / malformed fields
 *  gracefully so a partial tool call still yields a renderable answer. */
export function normalizeAnswer(args: Record<string, unknown>): AnalyticsAnswer {
  const insight = typeof args.insight === "string" ? args.insight : "";
  const recommendation = typeof args.recommendation === "string" ? args.recommendation : undefined;
  const followUps = Array.isArray(args.followUps)
    ? (args.followUps as unknown[]).filter((v): v is string => typeof v === "string").slice(0, 3)
    : [];
  let infographic: Infographic | undefined;
  const ig = args.infographic as Record<string, unknown> | undefined;
  if (ig && typeof ig.kind === "string" && typeof ig.title === "string" && ig.data != null) {
    infographic = {
      kind: ig.kind as Infographic["kind"],
      title: ig.title,
      subtitle: typeof ig.subtitle === "string" ? ig.subtitle : undefined,
      data: ig.data,
    } as Infographic;
  }
  return { insight, recommendation, infographic, followUps };
}
