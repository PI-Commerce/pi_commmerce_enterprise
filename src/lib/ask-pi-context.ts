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

export type PiContext = {
  /** Short human label for the surface (telemetry / headers). */
  scope: string;
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
      placeholder: "Ask Pi about your voice campaign…",
      chips: ["The 20-second cliff: why 42% of calls die early"],
      thinking: ["Replaying 459 voice calls…", "Spotting where callers drop off…", "Drafting the insight…"],
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
    match: (p) => p.startsWith("/campaigns"),
    ctx: {
      scope: "Campaigns",
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
