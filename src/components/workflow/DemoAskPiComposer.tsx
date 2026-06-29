import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  PiPill,
  PiPanel,
  PiSendButton,
  PiInputIcon,
  usePiDrag,
} from "@/components/app/ask-pi-ui";
import { getSuggestion } from "@/lib/pi-node-suggestions";

type State = "collapsed" | "idle";

/**
 * Read-only Ask Pi composer for *saved* campaigns.
 *
 * Existing campaigns aren't editable through Pi yet — the live agent (`AgentComposer`)
 * only mounts during new-campaign creation. But we still want users browsing a saved
 * campaign to *see* Pi in the canvas: a floating pill that opens into a text input,
 * and a visible response loop to the node-hover "Pi tip" demo (I3) so the optimization
 * affordance has somewhere to dispatch to.
 *
 * Therefore this composer is deliberately INERT:
 *  - Typing + Enter + clicking Send do nothing. The Send button stays disabled and the
 *    textarea is the only interaction.
 *  - It still listens for the `askpi:suggest` window event (fired when a user clicks
 *    the "Ask Pi to apply" button inside a node-hover Pi tip popover) and opens with
 *    the suggestion's prompt pre-filled, so the I3 demo flow has a visible destination.
 *
 * Visually identical to the global {@link AskPiDock} — uses the same pill, panel, drag
 * behaviour and input chrome from `ask-pi-ui` — so users feel one consistent assistant
 * across the product, even when this particular surface is read-only.
 */
export function DemoAskPiComposer() {
  const [state, setState] = useState<State>("collapsed");
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Shared horizontal drag (same persisted position as the global dock).
  const { dragX, pillHandlers, suppressClick } = usePiDrag(wrapRef);

  const isOpen = state !== "collapsed";

  // Cmd/Ctrl-K toggles the panel; Esc collapses. Same shortcuts as the global dock so
  // muscle memory carries over to saved-campaign view.
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

  // Focus the textarea every time the panel opens — same UX as the global dock.
  useEffect(() => {
    if (state === "idle") inputRef.current?.focus();
  }, [state]);

  // Click-outside collapses, but only when the input is empty (so a half-typed message
  // isn't lost to a stray click). ReactFlow's pane swallows mousedown via
  // stopImmediatePropagation, so we listen in the capture phase to catch it.
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target as Node)) return;
      if (value.trim().length > 0) return;
      setState("collapsed");
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [isOpen, value]);

  // Node-hover Pi tips dispatch `askpi:suggest` when a user clicks "Ask Pi to apply".
  // Open the composer + pre-fill the input with the suggestion's narrative prompt so
  // the I3 demo has a visible response, even though we don't apply anything here.
  useEffect(() => {
    const onSuggest = (e: Event) => {
      const detail = (e as CustomEvent<{ suggestionId?: string }>).detail;
      const suggestion = getSuggestion(detail?.suggestionId);
      if (!suggestion) return;
      setValue(suggestion.prompt);
      setState("idle");
    };
    window.addEventListener("askpi:suggest", onSuggest);
    return () => window.removeEventListener("askpi:suggest", onSuggest);
  }, []);

  // No-op: pressing Enter / clicking Send does nothing on saved campaigns.
  const noop = () => {};

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
            <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
              <span>Ask Pi · read-only on saved campaigns</span>
              <button
                onClick={() => setState("collapsed")}
                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5">
              <PiInputIcon />
              <textarea
                ref={inputRef}
                rows={1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    // Suppress newlines, but the composer doesn't actually submit.
                    e.preventDefault();
                  }
                  if (e.key === "Escape" && !value) setState("collapsed");
                }}
                placeholder="Ask Pi about this campaign… (demo — try the “Pi tip” chips on the WhatsApp nodes)"
                className="scrollbar-thin max-h-32 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14px] text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
              />
              <PiSendButton thinking={false} disabled onClick={noop} />
            </div>
          </PiPanel>
        </div>
      )}
    </div>
  );
}
