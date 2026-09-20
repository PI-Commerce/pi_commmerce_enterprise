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
  /** P3 escape-hatch buttons Pi emitted via `emit_action_link`. Rendered
   *  as prominent buttons above the dismiss/accept controls. Each opens
   *  its `href` in a new tab so Pi's context stays alive while the user
   *  goes to unblock (connect a WA number, create an agent, etc.). */
  actionLinks?: Array<{ label: string; href: string; hint?: string }>;
};

/**
 * Which server-side scope this surface maps to.
 *
 * "analytics" → read-only tools over D1 (count_leads, status_breakdown,
 *   worst_dropoffs, latest_runs, list_campaigns, read_campaign). Safe on every
 *   surface, so it's the default. NOTE: `/analytics` itself bypasses this
 *   entirely and mounts AnalyticsChat via AskPiDock (dedicated multi-turn
 *   chat with structured JSON answers + infographics).
 * "builder" → analytics reads plus DAG mutations (insert_node, connect_nodes,
 *   update_node). Only enable on `/campaigns/$id` where an edit could apply.
 * "agents" → analytics reads plus agent mutations (list/read/save_agent).
 */
export type PiScopeMode = "analytics" | "builder" | "agents";

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
      // /analytics is handled entirely by AnalyticsChat (see AskPiDock's
      // `isAnalyticsSurface` branch). This entry stays as a placeholder so
      // any generic scope lookup returns something sensible, but the dock
      // never reads its `result` / `chips` / `thinking` on this route.
      scope: "Analytics",
      scopeMode: "analytics",
      systemHint: "Handled by AnalyticsChat.",
      placeholder: "Ask about this run, channel, funnel, or trend…",
      chips: [],
      thinking: [],
      result: { text: "", cta: "" },
    },
  },
  {
    match: (p) => p.startsWith("/agents"),
    ctx: {
      scope: "Agents",
      // Agents scope adds list_agents / read_agent / save_agent / list_tools
      // to the analytics reads. Pi can actually edit and save voice agents,
      // and the change round-trips through D1 (agent-store re-hydrates after
      // the call so the UI reflects the edit without a refresh).
      scopeMode: "agents",
      systemHint: "The user is on the Agents surface. Draft, edit, tune, or wire tools onto voice agents by natural language. Always read_agent before proposing an edit, list_tools before proposing a tools array, and save_agent with the FULL merged record (never drop fields). Confirm each change in one line.",
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
      systemHint: "The user is on the Broadcasts surface (one-off template blasts). One job here: open the Create Broadcast modal with the user's ask prefilled (channel + template + name + schedule). Once opened, stop — the user completes the send from the modal.",
      placeholder: "Ask Pi to open a new broadcast…",
      chips: ["Send a WhatsApp broadcast", "Open an SMS broadcast for tomorrow", "Draft a Diwali RCS broadcast"],
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
      // The real system prompt (in `pi-llm.ts`) references the canonical
      // construct rules from `pi-construct-rules.ts` — this hint is a short
      // surface tag, not the full grammar.
      scopeMode: "builder",
      systemHint: "The user is on the campaign builder canvas. Pi wires WhatsApp / SMS / RCS / Voice / Delay / Conditional / API Tool nodes into the flow, using real assets from the workspace catalog. Off-topic asks (creating agents, authoring templates) get declined with a deep link.",
      placeholder: "Describe the campaign…",
      // No contextual chips on this surface — pure chat experience per the
      // v1 design decision (efficiency over template shelves).
      chips: [],
      thinking: [
        "Paytm Intelligence is reading the current flow…",
        "Checking assets and node kinds available…",
        "Drafting the plan…",
      ],
      result: {
        text: "Pi is ready to draft the flow. Describe the campaign and Pi will ask a couple of clarifiers before proposing the workflow.",
        cta: "Draft this",
      },
    },
  },
  {
    match: (p) => p.startsWith("/campaigns"),
    ctx: {
      scope: "Campaigns",
      scopeMode: "analytics",
      systemHint: "The user is on the Campaigns list (Workflows / Runs / Data tabs). Directly drive the list: filter by status, search by name, sort. On Runs, take row actions (pause / resume / terminate) when the user names both the run and the action. On Data, run CSV fitness checks against a campaign's Audience schema.",
      placeholder: "Ask Pi to filter, search, sort, or fit-check a CSV…",
      chips: ["Show only drafts", "Find insurance campaigns", "Sort by newest edits"],
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
  systemHint: "The user is inside the campaign canvas composer. Pi reads the injected context (current DSL, canonical rules, allowed kinds, real assets), asks minimum viable clarifiers, then calls propose_draft to confirm the plan before wiring nodes. Third-person tone.",
  placeholder: "Describe the campaign…",
  // No chips on canvas. Pure chat experience.
  chips: [],
  thinking: [
    "Paytm Intelligence is reading the current flow…",
    "Checking assets and node kinds available…",
    "Drafting the plan…",
  ],
  result: {
    text: "Pi is ready to draft the flow.",
    cta: "Draft this",
  },
};
