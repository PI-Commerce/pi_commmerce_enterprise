import { useEffect, useRef, useState } from "react";
import { Sparkle, Sparkles, X } from "lucide-react";
import { CopilotChat, type UserMessageProps } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { cn } from "@/lib/utils";
import { stripPiPrompt } from "@/lib/copilot/endpoint";
import type { AskPiPlan } from "./AskPiWizard";
import { AskPiConversation, type ConversationPhase } from "./AskPiConversation";
import { useCampaignAgentActions } from "./useCampaignAgentActions";

type State = "collapsed" | "idle" | "wizard";

/** System guidance for the live agent driving the A1 template flow. */
const AGENT_INSTRUCTIONS = [
  "You are Pi, the campaign-creation copilot for a marketing platform.",
  "STYLE — be concise AND conversational: reply in at most ONE short sentence (≤14 words). Talk WITH the user; don't go silent, but don't restate detail the cards already show.",
  "Banned openers: 'I'll help you…', 'Let me…', 'Sure,…', 'Great,…'. Skip filler — lead with substance.",
  "FIRST, always reply with ONE short line restating the goal you understood in your own words (e.g. 'Winning back lapsed members over WhatsApp and voice.'). You MAY echo channels the user explicitly named; never invent channels they did not state.",
  "ALWAYS START WITH THE TEMPLATE CARD: on the user's first brief, immediately call listCampaignTemplates with their brief verbatim as `query` so the matching approved templates render as tiles — do this for BOTH a named template and a plain-language brief. NEVER call planCampaignFromBrief before the template card has been shown.",
  "SHOW THE TEMPLATE CARD EXACTLY ONCE PER SESSION — only on that first brief. After it has been shown, NEVER call listCampaignTemplates again: treat any later message that describes a campaign as a brief and go to PATH B (planCampaignFromBrief with that message as `brief`), even if no draft exists yet and even if the message names a template. The user already saw the tiles once; a typed description means build-from-brief, not re-pick.",
  "PATH A — USER PICKS A TEMPLATE (clicks a tile, or names a template id/name directly): create it FROM THAT TEMPLATE by calling these actions strictly IN ORDER: 1) instantiateCampaignTemplate with the chosen id — renders the draft, returns open variables + assumptions. 2) resolveCampaign — Resolve card. 3) validateCampaign — the compliance gate; on 'block' call resolveCampaign again, on 'warn' keep the warning text. 4) confirmCampaign (pass the warning, if any). Do NOT launch.",
  "PATH B — USER DESCRIBES INSTEAD OF PICKING (they type a plain-language brief, or say none of the tiles fit): plan it DIRECTLY from the brief. Call these actions strictly IN ORDER: 1) planCampaignFromBrief — pass the user's brief verbatim as `brief`; it renders the draft and returns `needsChannels` / `needsConditional` / `needsPlacement`. 1b) If `needsChannels` is true (the brief named no channel), call setCampaignChannels so the user picks the channel(s), priority and any fallback, THEN continue. 1c) If `needsConditional` is true (the brief frames a Match / Else branch on an audience attribute), call setConditionalBranch so the user sets the rule and which channel each branch routes to, THEN skip to step 3. 2) If `needsPlacement` is true (two or more channels with no fallback), call setChannelPlacement so the user chooses how the channels are placed (fallback / parallel split / A-B test) BEFORE resolving. If it is false, skip to step 3. 3) resolveBriefCampaign — Resolve card for the remaining open variables. 4) validateBriefCampaign — the compliance gate; on 'block' call resolveBriefCampaign again, on 'warn' keep the warning text. 5) confirmBriefCampaign (pass the warning, if any). Do NOT launch.",
  "TYPED RESOLVE LOOP (both paths) — THIS TAKES PRECEDENCE OVER ROUTING: once a draft already exists this session (you have already called planCampaignFromBrief or instantiateCampaignTemplate), do NOT route to a path again and do NOT call listCampaignTemplates or planCampaignFromBrief — even if the user's message mentions a template name or id. Treat any later message that names a segment, WhatsApp template, voice agent, fallback wait, split rule, sending window, frequency cap, or start timing as ANSWERS to the open variables. Whenever they type such values, call applyAnswers with their message verbatim as `text`, then read its result: if `unmatched` is non-empty, ask them to pick those from the Resolve card (resolveBriefCampaign / resolveCampaign); if `ready` is false, re-show the Resolve card for what's left; if `ready` is true, go to the validate step. Surface each default it reports as an assumption. Never invent ids — applyAnswers does the mapping.",
  "When the user names a template directly, a one-clause acknowledgement is enough. After any pick, reply 'Done.' or one short clause.",
  "NEVER call a resolve/validate/confirm action before its draft exists in this session — Path A needs a template instantiated, Path B needs a brief planned. If a tool says no draft exists yet, go back to that path's first step.",
  "The level returned by validateCampaign / validateBriefCampaign is computed deterministically — act only on the result; never decide pass/warn/block yourself.",
  "Never invent ids — use only ids returned by the list actions.",
].join(" ");

/**
 * Seeds the live agent chat with the campaign description as the opening user turn.
 *
 * The create-campaign modal already captures the goal/description; routing into the
 * agent (`?agent=true`) should NOT make the user re-type it. So on landing we submit
 * that text once, as if the user had typed it — Pi then confirms the channels and
 * proactively calls `listCampaignTemplates(query=seed)` instead of showing a static
 * greeting.
 *
 * Why drive the DOM instead of a hook: CopilotKit 1.61's `<CopilotChat>` already owns
 * the single `useCopilotChatInternal` instance (one connect effect / one agent run).
 * Mounting a SECOND chat hook here (`useCopilotChat*`) spins up a rival connect effect
 * that thrashes the shared connection, so its `isAvailable` never settles and its
 * `sendMessage` never fires (observed: only `agent/connect`, never `agent/run`). The
 * deprecated `appendMessage` is also broken — its GQL→AG-UI conversion drops a foreign
 * message's content and fires an empty run ("messages must not be empty").
 *
 * Driving CopilotChat's own textarea + Send button uses that single working connection
 * on the exact user path: set the value via the native setter (so React's controlled
 * input registers it), dispatch `input`, then click Send once it enables. Polls briefly
 * because the chat input mounts a tick after the panel opens.
 *
 * Mounted only when the chat panel is open and a description exists; the parent's
 * `chatSeeded` latch (via `onSeeded`) keeps it to exactly one seed across open/close.
 */
function ChatSeeder({ seed, onSeeded }: { seed: string; onSeeded: () => void }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    let cancelled = false;
    let filled = false;
    let attempts = 0;
    const setNativeValue = (ta: HTMLTextAreaElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(ta, value);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const tick = () => {
      if (cancelled || sent.current) return;
      attempts += 1;
      const root = document.querySelector(".askpi-chat");
      const ta = root?.querySelector("textarea") as HTMLTextAreaElement | null;
      const send = root?.querySelector('button[aria-label="Send"]') as HTMLButtonElement | null;
      if (ta && !filled) {
        setNativeValue(ta, seed);
        filled = true;
      }
      // Send enables a tick after the input event is processed by React.
      if (filled && send && !send.disabled) {
        sent.current = true;
        send.click();
        onSeeded();
        return;
      }
      if (attempts < 60) setTimeout(tick, 80);
    };
    const id = setTimeout(tick, 80);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [seed, onSeeded]);
  return null;
}

/**
 * User-message renderer that hides the folded system directive. The server steers the
 * model by prepending `PI_SYSTEM_PROMPT` (delimited by the pi-style markers) to the
 * latest user turn, and CopilotKit mirrors that run-input back into its message store —
 * so without this the prompt would render inside the user's own bubble. {@link stripPiPrompt}
 * removes everything up to the closing marker, leaving only what the user actually said.
 * Markup mirrors CopilotKit's default `UserMessage` so styling is unchanged.
 */
function PiUserMessage({ message }: UserMessageProps) {
  const raw = typeof message?.content === "string" ? message.content : "";
  return <div className="copilotKitMessage copilotKitUserMessage">{stripPiPrompt(raw)}</div>;
}

export type AgentComposerProps = {
  /** "wizard" mode shows the deterministic campaign builder Q&A in the expanded panel. */
  mode?: "chat" | "wizard";
  /** When set, collapsed pill shows nudge styling + label instead of the default sparkle. */
  nudge?: { label: string; active: boolean };
  /** Auto-open the wizard immediately on mount (used for brand-new campaigns). */
  autoOpenWizard?: boolean;
  onWizardSkeleton?: (skeleton: AskPiPlan) => void;
  onWizardBuild?: (plan: AskPiPlan) => void;
  onBuildingChange?: (building: boolean) => void;
  /** Fires when the conversation (or agent) saves a versioned draft (e.g. "v1"). */
  onSavedDraft?: (version: string) => void;
  /** Seed campaign name/description/objective used to rank suggested templates. */
  seedName?: string;
  seedDescription?: string;
  seedObjective?: string;
};

export function AgentComposer({
  mode = "chat",
  nudge,
  autoOpenWizard: _autoOpenWizard = false,
  onWizardSkeleton,
  onWizardBuild,
  onBuildingChange,
  onSavedDraft,
  seedName,
  seedDescription,
  seedObjective,
}: AgentComposerProps = {}) {
  const [state, setState] = useState<State>("collapsed");
  // Register the A1 template frontend actions on the surrounding CopilotKit
  // provider (mounted only on /campaigns/new, so this hook is always inside it).
  // The agent calls these to instantiate → resolve → validate → confirm, and the
  // canvas updates via the same onWizardBuild callback the deterministic wizard uses.
  useCampaignAgentActions({
    onSkeleton: onWizardSkeleton,
    onBuild: onWizardBuild,
    onSavedDraft,
  });

  const [wizardPhase, setWizardPhase] = useState<ConversationPhase>("intent");
  // Latch so the live agent chat is seeded with the campaign description exactly once
  // (a brief brief opens the run + suggests templates), even across panel open/close.
  const [chatSeeded, setChatSeeded] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [hasEngaged, setHasEngaged] = useState(false);
  // The blank-canvas build wizard runs once. After it completes, Ask Pi becomes
  // the persistent agent chat composer.
  const [built, setBuilt] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Notify parent of building lock — freeze the canvas only while the
  // deterministic wizard is materializing or validating the draft.
  useEffect(() => {
    onBuildingChange?.(state === "wizard" && (wizardPhase === "planning" || wizardPhase === "validating"));
  }, [state, wizardPhase, onBuildingChange]);

  // Mark engaged + built once the draft is saved — nudge won't reappear, and
  // Ask Pi switches from the conversational builder to the agent chat composer.
  useEffect(() => {
    if (wizardPhase === "saved") { setHasEngaged(true); setBuilt(true); }
  }, [wizardPhase]);

  // When the draft is saved, collapse Ask Pi back to its floating pill.
  useEffect(() => {
    if (state === "wizard" && wizardPhase === "saved") {
      const t = setTimeout(() => setState("collapsed"), 1600);
      return () => clearTimeout(t);
    }
  }, [state, wizardPhase]);

  const collapse = () => {
    if (state === "wizard" && (wizardPhase === "planning" || wizardPhase === "validating")) return;
    setState("collapsed");
  };

  // Wizard only runs for the first blank-canvas build (new campaigns, not yet built).
  // Otherwise Ask Pi opens straight into the agent chat.
  const wizardAvailable = mode === "wizard" && !!nudge?.active && !built;

  const openPrimary = () => {
    setHasEngaged(true);
    setState(wizardAvailable ? "wizard" : "idle");
  };

  const isOpen = state !== "collapsed";
  const isWizard = state === "wizard";
  // The campaign description doubles as the opening brief for the live agent chat.
  const chatSeed = seedDescription?.trim() ?? "";
  const showNudge = !!(nudge?.active && !isOpen && !nudgeDismissed && !hasEngaged);

  // Click-outside collapses, unless in the wizard (the wizard owns its own close).
  // Capture phase is required: the ReactFlow pane (d3-zoom) calls
  // stopImmediatePropagation() on mousedown, so a bubble-phase document listener
  // never fires when clicking the canvas. Capturing runs first.
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      if (state === "wizard") return;
      // Radix Select/Dropdown render their options in a portal at the document
      // root — outside containerRef. Selecting an option must NOT count as an
      // outside click, or the resolve-card pickers would collapse the panel.
      const target = e.target as Element | null;
      if (target?.closest?.("[data-radix-popper-content-wrapper],[data-radix-portal],[role='listbox'],[role='option']")) return;
      collapse();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, state]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4">
      {/* Collapsed pill — sparkle, with optional floating nudge bubble */}
      {!isOpen && (
        <div className="pointer-events-none relative flex flex-col items-center">
          {showNudge && (
            <div className="askpi-nudge-bubble pointer-events-auto relative mb-3 flex items-center gap-2 rounded-2xl border border-ai/30 bg-card px-3 py-2 text-[12.5px] font-medium text-foreground shadow-[0_10px_30px_-10px_color-mix(in_oklch,var(--ai)_45%,transparent)] animate-slide-up">
              <button
                onClick={openPrimary}
                className="flex items-center gap-2 pr-1 text-left"
                aria-label="Open Ask Pi to build campaign"
              >
                <Sparkles className="h-3.5 w-3.5 text-ai" />
                {nudge!.label}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setNudgeDismissed(true); }}
                className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Dismiss nudge"
              >
                <X className="h-3 w-3" />
              </button>
              {/* tail anchoring bubble to pill */}
              <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-ai/30 bg-card" />
              <style>{`
                @keyframes askPiNudgePulse {
                  0%, 100% { box-shadow: 0 10px 30px -12px color-mix(in oklch, var(--ai) 30%, transparent); }
                  50% { box-shadow: 0 14px 34px -10px color-mix(in oklch, var(--ai) 65%, transparent); }
                }
                .askpi-nudge-bubble { animation: askPiNudgePulse 2.4s ease-in-out infinite; }
                .askpi-nudge-bubble:hover { animation: none; }
              `}</style>
            </div>
          )}
          <button
            onClick={openPrimary}
            className="pointer-events-auto group flex h-9 w-24 items-center justify-center rounded-full border border-border bg-secondary text-foreground shadow-[0_4px_16px_-6px_rgba(0,0,0,0.15)] transition-all hover:w-28 hover:bg-accent animate-slide-up"
            aria-label="Open AI assistant"
          >
            <Sparkle className="h-3.5 w-3.5 fill-foreground" />
          </button>
        </div>
      )}

      {/* Expanded composer */}
      {isOpen && (
        <div
          ref={containerRef}
          className={cn(
            "pointer-events-auto overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_12px_40px_-12px_rgba(0,0,0,0.22)] ring-4 ring-ai/5 transition-all duration-300 ease-out animate-slide-up",
            isWizard ? "w-[640px]" : "w-[680px]",
          )}
        >
          {/* Wizard mode body — deterministic conversational campaign builder */}
          {isWizard && (
            <div className="relative">
              {(wizardPhase === "intent" || wizardPhase === "briefConfirm" || wizardPhase === "resolve" || wizardPhase === "blocked" || wizardPhase === "confirm") && (
                <button
                  onClick={collapse}
                  className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Cancel"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <AskPiConversation
                active={isWizard}
                onSkeleton={(s) => onWizardSkeleton?.(s)}
                onBuild={(p) => onWizardBuild?.(p)}
                onPhaseChange={setWizardPhase}
                onSavedDraft={(v) => onSavedDraft?.(v)}
                seedName={seedName}
                seedDescription={seedDescription}
                seedObjective={seedObjective}
              />
            </div>
          )}

          {/* Chat mode — the live agent (Anthropic via CopilotKit runtime). The
              agent drives the A1 template flow and renders the Resolve / Confirm
              HITL cards inline as generative UI. */}
          {!isWizard && (
            <div className="relative flex h-[460px] flex-col">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                  <Sparkle className="h-3.5 w-3.5 fill-ai text-ai" /> Ask Pi
                </span>
                <button
                  onClick={collapse}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="askpi-chat min-h-0 flex-1">
                {/* Seed the run with the campaign description (once) so Pi opens by
                    confirming channels + suggesting templates — no re-typing. */}
                {chatSeed && !chatSeeded && (
                  <ChatSeeder seed={chatSeed} onSeeded={() => setChatSeeded(true)} />
                )}
                <CopilotChat
                  instructions={AGENT_INSTRUCTIONS}
                  className="h-full"
                  UserMessage={PiUserMessage}
                  labels={{
                    title: "Ask Pi",
                    initial: chatSeed
                      ? "Reading your campaign brief…"
                      : "Tell me which campaign template to start from, or describe your goal.",
                    placeholder: "e.g. Start from points_expiry_reminder_v3",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
