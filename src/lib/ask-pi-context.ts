// I2 — Pi Context Bus (v1: route-driven).
// Pi is omnipresent but should never feel generic. Each surface gives Pi a
// different opening: its placeholder, suggestion chips, "thinking" trace, and
// the shape of the proposal it returns. For the prototype this is a static
// lookup keyed by route; later it becomes a live read of {route, selection, data}.

export type PiResult = {
  /** One-paragraph answer Pi "returns". */
  text: string;
  /** Optional diff-style lines (monospace) for a proposed change. */
  diff?: string[];
  /** Primary CTA label on the result card. */
  cta?: string;
};

/**
 * Which server-side scope this surface maps to.
 *
 * "analytics" → read-only tools over D1 (count_leads, status_breakdown,
 *   worst_dropoffs, latest_runs, list_campaigns, read_campaign). Safe on every
 *   surface, so it's the default.
 * "builder" → analytics reads plus DAG mutations (insert_node, connect_nodes,
 *   update_node). Only enable on `/campaigns/$id` where an edit could apply.
 * "thesys" → keep the existing generative-UI card path (Analytics). Not a
 *   server-fn scope; the dock branches on this at call time.
 */
export type PiScopeMode = "analytics" | "builder" | "thesys";

export type PiContext = {
  /** Short human label for the surface (telemetry / headers). */
  scope: string;
  /** Which backend the dock's submit should target for this surface. */
  scopeMode: PiScopeMode;
  /**
   * One-line hint fed to the LLM as a `system` message so it knows what
   * surface the user is on and can offer the most relevant next actions.
   */
  systemHint: string;
  placeholder: string;
  chips: string[];
  /** Step lines shown while Pi is "working". */
  thinking: string[];
  result: PiResult;
  /**
   * I4 — proactive nudge. When present, the omnipresent dock floats a small,
   * dismissible bubble above its pill that surfaces a contextual insight. Clicking
   * it opens Pi pre-filled with `prompt` and runs it; the `id` keys dismissal so a
   * retired nudge stays gone (per-session when used, persisted when X-dismissed).
   */
  nudge?: { id: string; label: string; prompt: string };
};

const DEFAULT: PiContext = {
  scope: "Workspace",
  scopeMode: "analytics",
  systemHint: "The user is on a general workspace surface. Answer any workspace question using the read tools; if the question would need mutations, describe what you would do without acting.",
  placeholder: "Ask Pi to plan, build, or explain anything…",
  chips: ["Summarize my workspace", "Create a campaign", "Explain a metric"],
  thinking: ["Reading current context…", "Gathering recent activity…", "Drafting a response…"],
  result: {
    text: "Here's a quick read of your workspace. Tell me what you'd like to dig into and I'll take it from there.",
    cta: "Got it",
  },
};

// Ordered most-specific → least-specific; first prefix match wins.
const ROUTES: { match: (p: string) => boolean; ctx: PiContext }[] = [
  {
    match: (p) => p === "/",
    ctx: {
      scope: "Dashboard",
      scopeMode: "analytics",
      systemHint: "The user is on the workspace dashboard. Cross-campaign summaries, movers, and week-over-week deltas are the frame. Call latest_runs and status_breakdown to answer; recommend one concrete next click when relevant.",
      placeholder: "Ask Pi to summarize, plan, or jump into a campaign…",
      chips: ["Summarize performance this week", "Which campaigns need attention?", "Draft a win-back campaign"],
      thinking: ["Scanning 6 active campaigns…", "Aggregating the last 7 days of runs…", "Ranking movers by delta…"],
      result: {
        text: "Reactivation is your biggest mover — conversions up 6% WoW — while KYC Drop-off Recovery slipped 8%. Want me to open KYC Drop-off and suggest a fix?",
        cta: "Open KYC Drop-off",
      },
      nudge: {
        id: "dash_attention_kyc",
        label: "1 campaign needs attention — KYC Drop-off slipped 8%",
        prompt: "Which campaigns need attention this week?",
      },
    },
  },
  {
    match: (p) => p.startsWith("/analytics"),
    ctx: {
      scope: "Analytics",
      // Analytics keeps the generative-UI card path (Thesys). Text-only answers
      // sell short here — the visual is the payoff.
      scopeMode: "thesys",
      systemHint: "The user is on the analytics surface. Chart or compare metrics; ground every number in the data block.",
      placeholder: "Ask Pi to chart, compare, or explain a metric…",
      chips: [
        "The 20-second cliff: why 42% of calls die early",
        "Why did reactivation drop 8%?",
        "Chart conversions by channel",
        "Compare this run vs last",
      ],
      thinking: ["Reading the current dashboard scope…", "Pulling the relevant slice…", "Drafting the insight…"],
      result: {
        text: "Across the last 459 voice calls, 42% end inside 20 seconds and convert at roughly zero, while calls past a minute turn interested 40% of the time. I can pin this as a card or export it.",
        diff: ["+ chart  Conversion by call length", "+ source  Volt Money voice agent · 459 calls"],
        cta: "Add as card",
      },
      nudge: {
        id: "analytics_20s_cliff",
        label: "You're losing 43% of voice callers before the pitch. Pi found why.",
        prompt: "The 20-second cliff: why 42% of calls die early",
      },
    },
  },
  {
    match: (p) => p.startsWith("/agents"),
    ctx: {
      scope: "Agents",
      // Analytics-only reads for now; write tools (list_agents / save_agent)
      // land in the next PR where AgentBuilder wires Save through to D1.
      scopeMode: "analytics",
      systemHint: "The user is on the Agents surface. Answer with the specific agent(s) they mean; use list_campaigns to trace which campaigns bind which agent. Propose config edits in a diff-style summary; do not claim to have saved.",
      placeholder: "Ask Pi to draft, edit, or wire up an agent…",
      chips: ["Draft a win-back voice agent", "Which tools does Pi Concierge use?", "Add a refund tool"],
      thinking: ["Reading the agent registry…", "Reviewing tools & scopes…", "Drafting the agent config…"],
      result: {
        text: "I drafted a win-back Voice agent — warm tone, barge-in on, wired to the place_call and order_lookup tools. Review the config before you publish.",
        diff: ["+ agent  “Win-back Voice” (voice)", "+ tools  @place_call, @order_lookup", "+ guardrail  no discounts above 15%"],
        cta: "Review & open",
      },
    },
  },
  {
    match: (p) => p.startsWith("/integrations"),
    ctx: {
      scope: "Integrations",
      scopeMode: "analytics",
      systemHint: "The user is on the Integrations surface. Report which providers are connected and which campaigns depend on them; use list_campaigns and read_campaign to trace dependencies.",
      placeholder: "Ask Pi about connections, tools, and health…",
      chips: ["What's connected?", "Show failing integrations", "Set up WhatsApp"],
      thinking: ["Checking connected providers…", "Reading health signals…", "Summarizing status…"],
      result: {
        text: "8 of 9 tools are healthy. Meta Ads · Push audience is degraded (rate-limited in the last hour). Everything else is nominal.",
        cta: "Got it",
      },
    },
  },
  {
    match: (p) => p.startsWith("/settings"),
    ctx: {
      scope: "Settings",
      scopeMode: "analytics",
      systemHint: "The user is on Settings. There is no D1 data for workspace membership yet; answer from context and describe what changing a setting would do without pretending to change it.",
      placeholder: "Ask Pi about workspace settings…",
      chips: ["Who has admin access?", "Change workspace name", "Notification settings"],
      thinking: ["Reading workspace settings…", "Checking roles & access…", "Summarizing…"],
      result: {
        text: "Your workspace ‘ABC Enterprises’ has 3 admins and 11 members. I can walk you to any setting — which one?",
        cta: "Got it",
      },
    },
  },
  {
    match: (p) => p.startsWith("/inbox"),
    ctx: {
      scope: "Inbox",
      scopeMode: "analytics",
      systemHint: "The user is in the Inbox surface (customer conversations). Summarize conversation threads, route replies, or identify unresolved queries. Use read_campaign to link a conversation back to the campaign that opened it.",
      placeholder: "Ask Pi to summarize, tag, or route conversations…",
      chips: ["Show unresolved threads over 24h", "Summarize the top escalations today", "Which conversations came from Cart Abandonment?"],
      thinking: ["Reading the inbox queue…", "Grouping by campaign of origin…", "Ranking by staleness…"],
      result: {
        text: "You have 12 unresolved threads over 24 hours old — 7 came from Cart Abandonment, 3 from Insurance Renewal, 2 from Loyalty Card. I can auto-tag them by campaign for triage.",
        cta: "Auto-tag by campaign",
      },
    },
  },
  {
    match: (p) => p.startsWith("/broadcasts"),
    ctx: {
      scope: "Broadcasts",
      scopeMode: "analytics",
      systemHint: "The user is on the Broadcasts surface (one-off template blasts). Help them pick a template, size the audience, and time the send. Use read_campaign to check what templates each vertical uses.",
      placeholder: "Ask Pi to schedule, size, or design a broadcast…",
      chips: ["Best time to send a WhatsApp broadcast", "Size the audience for a renewal blast", "Draft a Diwali offer broadcast"],
      thinking: ["Reading approved templates…", "Estimating audience size…", "Drafting the send plan…"],
      result: {
        text: "For a WhatsApp renewal blast to lapsed Insurance customers, aim for Tue-Thu 11am IST — that window historically opens 34% higher than weekends. Estimated audience: 8.4k contacts.",
        cta: "Draft this broadcast",
      },
    },
  },
  {
    match: (p) => p.startsWith("/channels"),
    ctx: {
      scope: "Channels",
      scopeMode: "analytics",
      systemHint: "The user is on the Channels surface (template registries for WhatsApp, SMS, RCS). Answer with which templates exist, which are approved, and which campaigns use each. Suggest new template variants when relevant but don't claim to have created them.",
      placeholder: "Ask Pi about templates, approvals, or usage…",
      chips: ["Which templates are pending approval?", "What's the best-performing WA template?", "Draft a variant of the renewal template"],
      thinking: ["Reading template registries…", "Cross-referencing campaign usage…", "Summarizing…"],
      result: {
        text: "21 WhatsApp templates are live, 4 SMS, 2 RCS. Renewal-reminder is your highest-performing WA template at 47% read rate. I can draft a shorter variant to A/B test.",
        cta: "Draft a variant",
      },
    },
  },
  {
    match: (p) => p.startsWith("/reports"),
    ctx: {
      scope: "Reports",
      scopeMode: "analytics",
      systemHint: "The user is on Reports. Answer with what data would be exported and offer to shape a CSV/report. Use count_leads and status_breakdown to preview report totals.",
      placeholder: "Ask Pi to shape, preview, or schedule a report…",
      chips: ["Weekly performance report", "Voice agent handoff quality report", "Export all Loyalty Gold leads"],
      thinking: ["Reading run history…", "Aggregating for the report window…", "Drafting the report shape…"],
      result: {
        text: "I can build a weekly performance report grouped by vertical, with delivery / conversion / cost per channel. Runs Monday 9am IST.",
        cta: "Preview report",
      },
    },
  },
  {
    match: (p) => /^\/campaigns\/[^/]+$/.test(p),
    ctx: {
      scope: "Campaign builder",
      // On a specific campaign, Pi can actually edit the DAG. Builder scope
      // adds insert_node / update_node / connect_nodes on top of the reads.
      scopeMode: "builder",
      systemHint: "The user is viewing a specific campaign's canvas. Read the campaign with read_campaign before proposing edits, then use insert_node / update_node / connect_nodes to apply changes. Never invent DSL — always call a tool.",
      placeholder: "Ask Pi to edit, extend, or explain this campaign…",
      chips: ["Add a WhatsApp follow-up after Voice fail", "Why is this run dropping at Sent → Delivered?", "Insert a wait 24h before the reminder"],
      thinking: ["Reading the campaign graph…", "Planning the minimal edit…", "Drafting the proposal…"],
      result: {
        text: "I can insert a Voice AI Agent on the WhatsApp failure branch and route accepted users back into the nurture loop. Review before applying.",
        diff: ["+ insert  Voice AI Agent · after wa_send_1", "+ connect wa_send_1.failed → voice_agent"],
        cta: "Apply changes",
      },
    },
  },
  {
    match: (p) => p.startsWith("/campaigns"),
    ctx: {
      scope: "Campaigns",
      scopeMode: "analytics",
      systemHint: "The user is on the Campaigns list. Answer with list_campaigns and latest_runs; recommend opening a specific campaign when relevant.",
      placeholder: "Ask Pi to build, find, or compare campaigns…",
      chips: ["Create an onboarding campaign", "Which campaign converts best?", "Compare WhatsApp vs Voice"],
      thinking: ["Reading your campaign list…", "Reviewing recent runs…", "Drafting the proposal…"],
      result: {
        text: "I drafted a 4-step onboarding journey for new traders with no first deposit in 48h. Review the proposed graph before publishing.",
        diff: ["+ create  campaign “New Trader Onboarding”", "+ nodes   Audience → AI Copy → WhatsApp → Wait 24h → Voice AI"],
        cta: "Review & apply",
      },
    },
  },
];

/** Resolve the Pi context for a given pathname. Falls back to a generic context. */
export function getPiContext(pathname: string): PiContext {
  return ROUTES.find((r) => r.match(pathname))?.ctx ?? DEFAULT;
}

/**
 * Canvas (campaign builder) context — used by the in-canvas AiComposer, which
 * lives outside the AppShell. Node-level suggestions; benchmark copy lands in I3.
 */
export const CANVAS_CONTEXT: PiContext = {
  scope: "Campaign canvas",
  scopeMode: "builder",
  systemHint: "The user is inside the campaign canvas composer. Propose a minimal, valid edit to the current graph and apply it via insert_node / update_node / connect_nodes. Never emit raw DSL — always call the tools.",
  placeholder: "Ask Pi anything…",
  chips: ["Add dormant trader reactivation", "Insert Voice AI after WhatsApp fail"],
  thinking: [
    "Reading current graph (10 nodes, 10 edges)…",
    "Identifying failure branch on WhatsApp send…",
    "Proposing Voice AI Agent insertion…",
  ],
  result: {
    text: "I'll add a Voice AI Agent after the WhatsApp failure branch, then route accepted users back into the nurture loop.",
    diff: ["+ insert  Voice AI Agent · after node wa_send_1", "+ connect edge wa_send_1.failed → voice_agent"],
    cta: "Apply changes",
  },
};
