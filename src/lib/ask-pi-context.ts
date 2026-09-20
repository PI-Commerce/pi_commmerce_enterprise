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
 * "integrations" → docs-RAG only (search_docs over seeded vendor docs). No
 *   D1 reads, no mutations. Used solely by `/integrations`.
 * "developer" → sibling docs-RAG (search_docs over API Docs + Release Notes
 *   chunks). No D1 reads, no mutations. Used solely by `/developer`.
 * "freeform" → freeform-scope in-canvas builder on
 *   `/channels/whatsapp_/freeform/$id`. Mirrors "builder" (propose_draft +
 *   insert_node + connect_nodes + update_node) but on a smaller domain
 *   (WhatsApp Freeform Workflows — text/media/list messages with buttons /
 *   row branching, no audience, mostly inline content).
 */
export type PiScopeMode = "analytics" | "builder" | "agents" | "integrations" | "developer" | "freeform";

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
  /**
   * Dead-zone marker. On surfaces where Pi genuinely cannot add value (e.g.
   * Settings, Agents > Tools), we keep the pill visible for pattern consistency
   * but non-interactive, with a persistent playful message. When present, the
   * dock ignores click / ⌘K / chips / placeholder / result — only the pill and
   * the caption render, and the pill is greyed.
   *
   * The nudge string is caption copy, not a prompt. Keep it short, playful,
   * surface-specific. No ✕, no click-through — it's honest signage that Pi is
   * off-duty here.
   */
  deadZone?: { nudge: string };
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
      // Dashboard is a Pi dead zone (for now). The right job here is a cross-object
      // router (tiny insight + link to Analytics / Campaigns / Agents), but that
      // depends on the KPI tiles + runs table getting wired to D1 first — today
      // they're seed values, so Pi has nothing honest to riff on. Rather than a
      // hardcoded demo card that lies about the workspace, pill stays visible for
      // consistency with a persistent caption pointing users into the surfaces
      // where Pi actually earns its keep.
      scope: "Dashboard",
      scopeMode: "analytics",
      systemHint: "",
      placeholder: "",
      chips: [],
      thinking: [],
      result: { text: "", cta: "" },
      deadZone: { nudge: "Pi's just people-watching from here. Pop into a campaign, an agent, or Analytics to see the magic." },
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
      // Integrations Pi is a docs-RAG surface (not analytics): it answers
      // "how do I connect / integrate / troubleshoot X" for the listed
      // vendors by retrieving from seeded vendor docs and citing the
      // source. See src/lib/pi/surfaces/integrations/ for the tool + system
      // prompt. No D1 reads, no mutations — off-topic asks get declined
      // with a one-line redirect from the surface's own system prompt.
      scope: "Integrations",
      scopeMode: "integrations",
      systemHint: "The user is on the Integrations surface. Docs Q&A only — answer how-to-connect and integration-setup questions for the listed vendors using search_docs, and cite the vendor + section. Decline off-topic asks.",
      placeholder: "Ask how to connect a vendor…",
      chips: ["How do I connect Shopify?", "Set up Paytm Payment Gateway", "Wire CleverTap events"],
      thinking: ["Searching vendor docs…", "Pulling the relevant steps…", "Drafting the walkthrough…"],
      result: {
        text: "Pi can walk you through connecting any listed vendor. Ask about Paytm Payment Gateway, CleverTap, or Shopify — Pi will cite the doc section it's reading from.",
        cta: "Got it",
      },
    },
  },
  {
    match: (p) => p.startsWith("/developer"),
    ctx: {
      // Developer Pi is a docs-RAG surface (not analytics): it answers questions
      // about the API Docs and Release Notes by retrieving from a seeded corpus
      // and citing the source + section. See src/lib/pi/surfaces/developer/ for
      // the tool + system prompt. No D1 reads, no mutations — off-topic asks
      // get declined with a one-line redirect from the surface's own system
      // prompt. Sibling of /integrations; AskPiDock mounts the DeveloperChat
      // shell here for the same reasons (Q&A shape, markdown answers, follow-
      // ups are the norm, question must stay visible above Pi's answer).
      scope: "Developer",
      scopeMode: "developer",
      systemHint: "The user is on the Developer surface (API Docs + Release Notes + APIs & Webhooks + Logs tabs). Docs Q&A only — answer questions about endpoints, webhooks, auth, error codes, rate limits, idempotency, and what shipped when, using search_docs. Cite source + section. Decline off-topic asks.",
      placeholder: "Ask about the API docs or release notes…",
      chips: ["How do I authenticate?", "What's the Idempotency-Key TTL?", "What shipped on 25 August 2026?"],
      thinking: ["Searching the docs…", "Pulling the relevant section…", "Drafting the answer…"],
      result: {
        text: "Pi can answer questions about the API Docs and Release Notes — endpoints, webhooks, auth, error codes, rate limits, and what shipped when. Pi will cite the section it's reading from.",
        cta: "Got it",
      },
    },
  },
  {
    match: (p) => p.startsWith("/settings"),
    ctx: {
      // Settings is a Pi dead zone. Config lives in the human's hands; Pi shouldn't
      // mutate roles / billing / integrations and shouldn't half-answer read-only
      // questions when the rest of the pattern is action-forward. Pill stays visible
      // for consistency but is non-interactive with a persistent caption.
      scope: "Settings",
      scopeMode: "analytics",
      systemHint: "",
      placeholder: "",
      chips: [],
      thinking: [],
      result: { text: "", cta: "" },
      deadZone: { nudge: "Pi's off-duty here. Settings are a you thing." },
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
  // ----- Channels > WhatsApp > Freeform Workflow builder (canvas) -----
  // Full-screen builder canvas (`/channels/whatsapp_/freeform/$id`). The
  // canvas renders WITHOUT the AppShell, so the global dock never mounts
  // here — Pi lives IN the canvas via AiComposer (mirrors the campaign
  // builder's in-canvas Pi). This entry is defensive: if a future refactor
  // drops the shell back in, the dock reads this and behaves. The real
  // in-canvas config lives in {@link CANVAS_FREEFORM_CONTEXT} below.
  {
    match: (p) => /^\/channels\/whatsapp_\/freeform\/[^/]+$/.test(p),
    ctx: {
      scope: "Freeform workflow canvas",
      scopeMode: "freeform",
      systemHint:
        "The user is inside the WhatsApp Freeform Workflow builder canvas. Pi lives IN the canvas via AiComposer, not via the shell dock. If the dock somehow rendered here, stay quiet.",
      placeholder: "",
      chips: [],
      thinking: [],
      result: { text: "", cta: "" },
    },
  },
  // ----- Channels > WhatsApp (Overview / Templates / Freeform list) -----
  // Overview + template-builder + freeform-canvas dead-zones are declared
  // by their components via `usePiDisabled`; this entry is what the dock
  // reads on the Templates + Freeform-list tabs. Chips lean toward the
  // two things Pi can actually do: search the table and draft a new
  // template or freeform workflow.
  {
    match: (p) => p.startsWith("/channels/whatsapp"),
    ctx: {
      scope: "WhatsApp Channel",
      scopeMode: "analytics",
      systemHint: "The user is on Channels > WhatsApp. Pi drives the Templates list (search) and the Freeform Workflows list (search) and can open the new-template form or new-workflow dialog with prefill. Overview and the template-builder / freeform-canvas surfaces are dead-zones — Pi is off-duty there.",
      placeholder: "Ask Pi to search or draft a template / workflow…",
      chips: ["Find renewal templates", "Draft a new promo template", "Start a freeform test-drive workflow"],
      thinking: ["Reading the WhatsApp registry…", "Scanning workflows…", "Drafting…"],
      result: {
        text: "Pi can search the templates and freeform workflows lists, and start a new one with a prefilled name and category. Say what you want to draft.",
        cta: "Got it",
      },
    },
  },
  // ----- Channels > SMS (Templates list) -----
  // Overview + template-builder are dead-zones. Chips omit "Draft a
  // template" — SMS templates only enter the registry via DLT approval +
  // import, not via Pi.
  {
    match: (p) => p.startsWith("/channels/sms"),
    ctx: {
      scope: "SMS Channel",
      scopeMode: "analytics",
      systemHint: "The user is on Channels > SMS. Pi drives the Templates list (search + category filter). SMS templates are DLT-approved and imported — Pi does NOT open the new-template form here. Overview and the template-builder surfaces are dead-zones.",
      placeholder: "Ask Pi to search or filter SMS templates…",
      chips: ["Find OTP templates", "Show only Transactional", "Search for payment reminders"],
      thinking: ["Reading the SMS DLT registry…", "Filtering…", "Summarizing…"],
      result: {
        text: "Pi can search and filter this DLT-approved list. New SMS templates are added on your DLT portal and imported — Pi can't author those here.",
        cta: "Got it",
      },
    },
  },
  // ----- Channels > RCS (Templates list) -----
  // Overview + template-builder are dead-zones. Chips highlight the
  // three real filters (search, agent-type, status) and the draft-new
  // hook Pi can use to seed the RCS template form.
  {
    match: (p) => p.startsWith("/channels/rcs"),
    ctx: {
      scope: "RCS Channel",
      scopeMode: "analytics",
      systemHint: "The user is on Channels > RCS. Pi drives the Templates list (search + agent-type filter + approval-status filter) and can open the new-template form with prefill. Overview and the template-builder surface are dead-zones.",
      placeholder: "Ask Pi to search, filter, or draft a template…",
      chips: ["Show only Approved", "Filter to Transactional agents", "Draft a rich-card promo template"],
      thinking: ["Reading the RCS registry…", "Filtering by agent…", "Drafting…"],
      result: {
        text: "Pi can search, narrow by agent type or approval status, and start a new template with a prefilled name and shape.",
        cta: "Got it",
      },
    },
  },
  // Fallback for /channels itself. There is no landing page today (the
  // index redirects to /channels/whatsapp), so this entry only fires
  // during the redirect flash. Kept as a generic to avoid the DEFAULT
  // fallback showing "Workspace" copy on a Channels URL.
  {
    match: (p) => p.startsWith("/channels"),
    ctx: {
      scope: "Channels",
      scopeMode: "analytics",
      systemHint: "The user is on the Channels surface. Pick a channel (WhatsApp / SMS / RCS) to see what Pi can drive on each.",
      placeholder: "Pick a channel to see Pi's options…",
      chips: [],
      thinking: [],
      result: { text: "", cta: "" },
    },
  },
  {
    match: (p) => p.startsWith("/reports"),
    ctx: {
      // Reports is a Pi dead zone. It's a passive drop for async exports — the
      // useful intelligence (queue an export, answer without downloading, schedule
      // recurring) lives upstream in Analytics / Campaigns where Pi is already
      // active. Rather than a half-baked chatbox on a file cabinet, pill stays
      // visible for consistency with a persistent caption pointing users back.
      // Wire real Pi behaviour here only once the agent-loop overhaul lands and
      // there's a clear job Pi does on this specific surface.
      scope: "Reports",
      scopeMode: "analytics",
      systemHint: "",
      placeholder: "",
      chips: [],
      thinking: [],
      result: { text: "", cta: "" },
      deadZone: { nudge: "Pi's off-duty here. Just grab your download." },
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

/**
 * Canvas (freeform workflow builder) context — used by the in-canvas
 * AiComposer on `/channels/whatsapp_/freeform/$id`. Same shape as
 * {@link CANVAS_CONTEXT} but scoped to the freeform surface (freeform
 * DSL, freeform kinds, Meta interactive limits) so Pi never confuses
 * itself with the campaign builder's grammar.
 */
export const CANVAS_FREEFORM_CONTEXT: PiContext = {
  scope: "Freeform canvas",
  scopeMode: "freeform",
  systemHint: "The user is inside the WhatsApp Freeform Workflow canvas composer. Pi reads the injected context (current graph, freeform canonical rules, allowed kinds, Meta interactive limits), asks minimum viable clarifiers, then calls propose_draft to confirm the plan before wiring nodes. Freeform content is inline (no template picks for messages).",
  placeholder: "Describe the reply flow…",
  // No chips on canvas. Pure chat experience.
  chips: [],
  thinking: [
    "Paytm Intelligence is reading the current flow…",
    "Checking allowed kinds and Meta limits…",
    "Drafting the plan…",
  ],
  result: {
    text: "Pi is ready to draft the flow.",
    cta: "Draft this",
  },
};
