import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { AskPiWizardBody, type AskPiPlan, type WizardPhase } from "./AskPiWizard";
import { CANVAS_CONTEXT, type PiResult } from "@/lib/ask-pi-context";
import { getSuggestion } from "@/lib/pi-node-suggestions";
import { askPi } from "@/lib/server-fns/pi-llm";
import { summarizePiEdits, type PiToolCallLog } from "@/lib/pi-canvas-apply";
import {
  PiPill,
  PiPanel,
  PiThinking,
  PiResultCard,
  PiChips,
  PiSendButton,
  PiInputIcon,
  usePiDrag,
} from "@/components/app/ask-pi-ui";

type State = "collapsed" | "idle" | "typing" | "thinking" | "result" | "wizard";

export type AiComposerProps = {
  /** "wizard" mode shows the campaign builder Q&A inside the expanded panel. */
  mode?: "chat" | "wizard";
  /** When set, collapsed pill shows nudge styling + label instead of the default sparkle. */
  nudge?: { label: string; active: boolean };
  /** Auto-open the wizard immediately on mount (used for brand-new campaigns). */
  autoOpenWizard?: boolean;
  onWizardSkeleton?: (skeleton: AskPiPlan) => void;
  onWizardBuild?: (plan: AskPiPlan) => void;
  onBuildingChange?: (building: boolean) => void;
  /** I3 — confirm a node-level Pi suggestion; the canvas runs its real graph transform. */
  onApplySuggestion?: (s: { nodeId: string; suggestionId: string }) => void;
  /**
   * Builder scope — the current campaign id (needed by the askPi server fn
   * so the LLM's mutation tools know which campaign to write to in D1).
   */
  campaignId?: string;
  /**
   * Builder scope — called with the LLM's `toolCalls` array after every
   * successful answer. The canvas parses these and applies them to
   * ReactFlow's node/edge state so the graph changes are visible immediately.
   */
  onPiToolCalls?: (toolCalls: PiToolCallLog[]) => void;
};

export function AiComposer({
  mode = "chat",
  nudge,
  autoOpenWizard: _autoOpenWizard = false,
  onWizardSkeleton,
  onWizardBuild,
  onBuildingChange,
  onApplySuggestion,
  campaignId,
  onPiToolCalls,
}: AiComposerProps = {}) {
  const [state, setState] = useState<State>("collapsed");
  const [value, setValue] = useState("");
  const [wizardPhase, setWizardPhase] = useState<WizardPhase>("asking");
  // I3 — a node's "Ask Pi to apply" proposes a real edit; held here until confirmed.
  const [pendingSuggestion, setPendingSuggestion] = useState<
    { nodeId: string; suggestionId: string; result: PiResult } | null
  >(null);
  // Live LLM answer surfaced from askPi. When present, PiResultCard shows it
  // (with a summary of any canvas edits Pi made) instead of the canned copy.
  const [liveResult, setLiveResult] = useState<PiResult | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [hasEngaged, setHasEngaged] = useState(false);
  // The blank-canvas build wizard runs once. After it completes, Ask Pi becomes a chat composer.
  const [built, setBuilt] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Shared horizontal drag — identical behaviour + remembered position as the global dock.
  const { dragX, pillHandlers, suppressClick } = usePiDrag(wrapRef);

  useEffect(() => {
    if (state === "idle" || state === "typing") inputRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (value.length > 0 && state === "idle") setState("typing");
    if (value.length === 0 && state === "typing") setState("idle");
  }, [value, state]);

  // I3 — a node's "Ask Pi to apply" hint opens this composer pre-filled with its prompt.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      const prompt = (e as CustomEvent<string>).detail;
      if (!prompt) return;
      setHasEngaged(true);
      setState("idle");
      setValue(prompt);
      inputRef.current?.focus();
    };
    window.addEventListener("askpi:prompt", onPrompt);
    return () => window.removeEventListener("askpi:prompt", onPrompt);
  }, []);

  // I3 — a node's "Ask Pi to apply" opens the composer, pre-fills the ask, "thinks",
  // then shows the proposed change. The graph only mutates once the user confirms.
  useEffect(() => {
    const onSuggest = (e: Event) => {
      const detail = (e as CustomEvent<{ nodeId: string; suggestionId: string }>).detail;
      const sug = getSuggestion(detail?.suggestionId);
      if (!sug) return;
      setHasEngaged(true);
      setPendingSuggestion({ nodeId: detail.nodeId, suggestionId: detail.suggestionId, result: sug.result });
      setValue(sug.prompt);
      setState("thinking");
      setTimeout(() => setState("result"), 1800);
    };
    window.addEventListener("askpi:suggest", onSuggest);
    return () => window.removeEventListener("askpi:suggest", onSuggest);
  }, []);

  // Notify parent of building lock
  useEffect(() => {
    onBuildingChange?.(state === "wizard" && wizardPhase === "building");
  }, [state, wizardPhase, onBuildingChange]);

  // Mark engaged + built once the wizard completes — nudge won't reappear, and
  // Ask Pi switches from the one-time build wizard to a persistent chat composer.
  useEffect(() => {
    if (wizardPhase === "done") { setHasEngaged(true); setBuilt(true); }
  }, [wizardPhase]);

  // When the build wizard finishes, collapse Ask Pi back to its floating pill.
  // Clicking the pill reopens it as the persistent chat composer (built ⇒ no wizard).
  useEffect(() => {
    if (state === "wizard" && wizardPhase === "done") {
      const t = setTimeout(() => setState("collapsed"), 600);
      return () => clearTimeout(t);
    }
  }, [state, wizardPhase]);

  const submit = async () => {
    const question = value.trim();
    if (!question) return;
    setPendingSuggestion(null);
    setLiveResult(null);
    setState("thinking");
    // Builder-scope call: LLM has read + mutate tools over D1's DSL. If the
    // call fails (missing D1, missing TFY key, endpoint unreachable), we fall
    // back to the canned CANVAS_CONTEXT.result so the demo never dead-ends.
    try {
      const r = await askPi({
        data: {
          scope: "builder",
          question,
          context: campaignId ? { campaignId, surface: "Campaign canvas" } : { surface: "Campaign canvas" },
        },
      });
      if (r.ok) {
        const toolCalls = r.toolCalls as PiToolCallLog[];
        // Fire canvas mutations first so the graph visibly updates before the
        // result panel renders — feels instant.
        if (toolCalls.length > 0) onPiToolCalls?.(toolCalls);
        const edits = summarizePiEdits(toolCalls);
        setLiveResult({
          text: r.answer,
          diff: edits.length > 0 ? edits : undefined,
          cta: edits.length > 0 ? "Got it" : "Got it",
        });
      }
      // If !ok, liveResult stays null → PiResultCard shows CANVAS_CONTEXT.result.
    } catch {
      // Same fallback path.
    }
    setState("result");
  };

  const reset = () => {
    setPendingSuggestion(null);
    setLiveResult(null);
    setValue("");
    setState("idle");
  };

  const collapse = () => {
    if (state === "wizard" && wizardPhase === "building") return;
    setPendingSuggestion(null);
    setValue("");
    setState("collapsed");
  };

  // Confirm the proposed suggestion: run the real graph transform, then collapse
  // back to the pill so the live canvas change is unobstructed.
  const confirmSuggestion = () => {
    if (pendingSuggestion) {
      onApplySuggestion?.({ nodeId: pendingSuggestion.nodeId, suggestionId: pendingSuggestion.suggestionId });
    }
    setPendingSuggestion(null);
    setValue("");
    setState("collapsed");
  };

  // Wizard only runs for the first blank-canvas build (new campaigns, not yet built).
  // Otherwise Ask Pi opens straight into the chat text-input.
  const wizardAvailable = mode === "wizard" && !!nudge?.active && !built;

  const openPrimary = () => {
    setHasEngaged(true);
    setState(wizardAvailable ? "wizard" : "idle");
  };

  const isOpen = state !== "collapsed";
  const expandedTall = state === "thinking" || state === "result";
  const isWizard = state === "wizard";
  const showNudge = !!(nudge?.active && !isOpen && !nudgeDismissed && !hasEngaged);

  // Click-outside collapses, unless in wizard or user is typing.
  // Capture phase is required: the ReactFlow pane (d3-zoom) calls
  // stopImmediatePropagation() on mousedown, so a bubble-phase document
  // listener never fires when clicking the canvas. Capturing runs first.
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      if (state === "wizard") return;
      if (value.trim().length > 0) return;
      collapse();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, state, value]);

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4">
      {/* Collapsed pill — original Google-Docs-style sparkle, with optional floating nudge bubble */}
      {!isOpen && (
        <div
          className="pointer-events-none relative flex flex-col items-center"
          style={{ transform: `translateX(${dragX}px)` }}
        >
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
          <PiPill onOpen={openPrimary} pillHandlers={pillHandlers} suppressClick={suppressClick} />
        </div>
      )}

      {/* Expanded composer — drag offset lives on this non-animated wrapper so it
          never collides with the panel's slide-up entrance / transition-all. */}
      {isOpen && (
        <div className="pointer-events-none" style={{ transform: `translateX(${dragX}px)` }}>
          <PiPanel innerRef={containerRef} className={isWizard ? "w-[640px]" : "w-[680px]"}>
            {/* Wizard mode body (canvas-only build flow) */}
            {isWizard && (
              <div className="relative">
                {(wizardPhase === "asking" || wizardPhase === "review") && (
                  <button
                    onClick={collapse}
                    className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <AskPiWizardBody
                  active={isWizard}
                  onSkeleton={(s) => onWizardSkeleton?.(s)}
                  onBuild={(p) => onWizardBuild?.(p)}
                  onPhaseChange={setWizardPhase}
                />
              </div>
            )}

            {/* Chat mode — result / thinking surface */}
            {!isWizard && expandedTall && (
              <div className="border-b border-border px-5 py-4 animate-fade-in">
                {state === "thinking" ? (
                  <PiThinking steps={CANVAS_CONTEXT.thinking} />
                ) : pendingSuggestion ? (
                  <PiResultCard result={pendingSuggestion.result} onAccept={confirmSuggestion} onDismiss={reset} />
                ) : liveResult ? (
                  // Real LLM answer + summary of edits Pi just applied to the canvas.
                  // Canvas is already mutated by this point (onPiToolCalls fired first).
                  <PiResultCard result={liveResult} onAccept={reset} onDismiss={reset} />
                ) : (
                  <PiResultCard result={CANVAS_CONTEXT.result} onAccept={reset} onDismiss={reset} />
                )}
              </div>
            )}

            {/* Chat mode — single-line input row */}
            {!isWizard && (
              <div className="flex items-center gap-2 px-4 py-2.5">
                <PiInputIcon />
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                    if (e.key === "Escape" && !value) collapse();
                  }}
                  placeholder={CANVAS_CONTEXT.placeholder}
                  className="scrollbar-thin max-h-32 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14px] text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
                />
                <PiSendButton
                  thinking={state === "thinking"}
                  disabled={!value.trim() && state !== "thinking"}
                  onClick={state === "thinking" ? reset : submit}
                />
              </div>
            )}

            {/* Chat mode — suggestion chips */}
            {!isWizard && state === "idle" && value.length === 0 && (
              <PiChips chips={CANVAS_CONTEXT.chips} onPick={(s) => { setValue(s); setTimeout(submit, 50); }} />
            )}
          </PiPanel>
        </div>
      )}
    </div>
  );
}
