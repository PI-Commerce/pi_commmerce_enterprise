import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  PiPill,
  PiPanel,
  PiSendButton,
  PiInputIcon,
  PiThinking,
  PiResultCard,
  usePiDrag,
} from "@/components/app/ask-pi-ui";
import { getSuggestion, type NodeSuggestion } from "@/lib/pi-node-suggestions";

type State = "collapsed" | "idle" | "thinking" | "result";

/**
 * Ask Pi composer for saved/existing campaigns.
 *
 * Free-form text in this composer is intentionally INERT — typing works, but Enter
 * and the Send button are no-ops. We don't have a live agent wired to saved
 * campaigns, so a stray prompt has nowhere safe to go.
 *
 * The one path that DOES run is the curated I3 node-hover demo: when a user clicks
 * "Ask Pi to apply" inside a node's Pi-tip popover, the composer receives the
 * `askpi:suggest` window event and plays the full scripted loop — input pre-fills,
 * "Pi is working" thinking trace runs, the proposed-change result card appears with
 * the diff, and confirming actually applies the suggestion's pure graph transform
 * via `onApplySuggestion`. Dismiss collapses without mutating.
 *
 * Visually identical to the global {@link AskPiDock} — same pill, panel, drag
 * behaviour and input chrome from `ask-pi-ui` — so the assistant feels like one
 * consistent surface across the product even though THIS one only acts on the
 * scripted node tips.
 */
export function DemoAskPiComposer({
  onApplySuggestion,
}: {
  /** Apply a node-hover Pi suggestion to the live graph. Owned by the parent canvas
   *  so the transform has access to `setNodes`/`setEdges`. */
  onApplySuggestion?: (args: { nodeId: string; suggestionId: string }) => void;
}) {
  const [state, setState] = useState<State>("collapsed");
  const [value, setValue] = useState("");
  // The suggestion currently being demoed via the askpi:suggest path. While
  // non-null, the panel runs the scripted thinking → result loop and the
  // result card's Confirm button calls onApplySuggestion with this nodeId.
  const [pending, setPending] = useState<
    { nodeId: string; suggestion: NodeSuggestion } | null
  >(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Shared horizontal drag (same persisted position as the global dock).
  const { dragX, pillHandlers, suppressClick } = usePiDrag(wrapRef);

  const isOpen = state !== "collapsed";
  const expanded = state === "thinking" || state === "result";
  // Free-text input is only available in the plain idle state — once a curated
  // suggestion is mid-flight we hide the textarea so the user can't interleave.
  const showInput = state === "idle";

  // Cmd/Ctrl-K toggles the panel; Esc collapses. Mirrors the global dock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setState((s) => (s === "collapsed" ? "idle" : "collapsed"));
      }
      if (e.key === "Escape" && state !== "collapsed") setState("collapsed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  // Focus the textarea every time the plain idle panel opens.
  useEffect(() => {
    if (state === "idle") inputRef.current?.focus();
  }, [state]);

  // Click-outside collapses, but only when:
  //  - the input is empty (so a half-typed message isn't lost), AND
  //  - no curated suggestion is mid-thinking/result (don't dismiss a demo by accident).
  // ReactFlow's pane swallows mousedown via stopImmediatePropagation, so we listen
  // in the capture phase to catch it.
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target as Node)) return;
      if (value.trim().length > 0) return;
      if (state !== "idle") return;
      setState("collapsed");
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [isOpen, value, state]);

  // Node-hover Pi tips dispatch `askpi:suggest` when a user clicks "Ask Pi to apply".
  // Open the composer, pre-fill the input with the suggestion's prompt, then run the
  // canned thinking → result loop. The result card's Confirm button calls
  // onApplySuggestion (which the canvas owns) and actually mutates the graph.
  useEffect(() => {
    const onSuggest = (e: Event) => {
      const detail = (e as CustomEvent<{ nodeId?: string; suggestionId?: string }>).detail;
      if (!detail?.nodeId || !detail?.suggestionId) return;
      const suggestion = getSuggestion(detail.suggestionId);
      if (!suggestion) return;
      setValue(suggestion.prompt);
      setPending({ nodeId: detail.nodeId, suggestion });
      setState("thinking");
    };
    window.addEventListener("askpi:suggest", onSuggest);
    return () => window.removeEventListener("askpi:suggest", onSuggest);
  }, []);

  // Thinking → result auto-advance. Mirrors the AskPiDock's 1.8s "Pi is working"
  // dwell so the demo's pacing feels deliberate rather than instant.
  useEffect(() => {
    if (state !== "thinking") return;
    const t = setTimeout(() => setState("result"), 1800);
    return () => clearTimeout(t);
  }, [state]);

  const reset = () => {
    setPending(null);
    setValue("");
    setState("collapsed");
  };

  const acceptPending = () => {
    if (pending) onApplySuggestion?.({ nodeId: pending.nodeId, suggestionId: pending.suggestion.id });
    reset();
  };

  // No-op: free-form Enter / Send do nothing on saved campaigns.
  const noop = () => {};

  // Generic "Pi is working" steps — generic-but-on-brand; the suggestion type
  // doesn't carry its own thinking lines, so we keep these constant.
  const thinkingSteps = [
    "Reading the node configuration…",
    "Looking up the benchmark…",
    "Drafting the change…",
  ];

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4"
    >
      {!isOpen && (
        <div
          className="pointer-events-none flex flex-col items-center"
          style={{ transform: `translateX(${dragX}px)` }}
        >
          <PiPill
            onOpen={() => setState("idle")}
            pillHandlers={pillHandlers}
            suppressClick={suppressClick}
          />
        </div>
      )}

      {isOpen && (
        <div className="pointer-events-none" style={{ transform: `translateX(${dragX}px)` }}>
          <PiPanel innerRef={panelRef} className="w-[680px] max-w-full">
            {/* Header: tells the user this composer is read-only for free-form text,
                but the curated Pi-tip path still runs end-to-end. */}
            <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
              <span>
                {pending
                  ? "Ask Pi · proposing a change"
                  : "Ask Pi · read-only on saved campaigns"}
              </span>
              <button
                onClick={reset}
                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {/* Expanded body — only renders for the curated suggestion flow. */}
            {expanded && pending && (
              <div className="border-b border-border px-5 py-4 animate-fade-in">
                {state === "thinking" ? (
                  <PiThinking steps={thinkingSteps} />
                ) : (
                  <PiResultCard
                    result={pending.suggestion.result}
                    onAccept={acceptPending}
                    onDismiss={reset}
                  />
                )}
              </div>
            )}

            {/* Input row — only shown in plain idle (free-form, inert) mode. While a
                curated suggestion is mid-flight we hide it so the user can't muddle
                the demo with stray typing. */}
            {showInput && (
              <div className="flex items-center gap-2 px-4 py-2.5">
                <PiInputIcon />
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      // Suppress newlines, but no submit — saved campaigns are inert.
                      e.preventDefault();
                    }
                    if (e.key === "Escape" && !value) setState("collapsed");
                  }}
                  placeholder="Ask Pi about this campaign… (demo — try the “Pi tip” chips on the WhatsApp nodes)"
                  className="scrollbar-thin max-h-32 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14px] text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
                />
                <PiSendButton thinking={false} disabled onClick={noop} />
              </div>
            )}
          </PiPanel>
        </div>
      )}
    </div>
  );
}
