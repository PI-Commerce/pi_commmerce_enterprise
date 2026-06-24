import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getPiContext } from "@/lib/ask-pi-context";
import { Sparkle, X } from "lucide-react";
import { pickGenUiFixtureKey, GENUI_FIXTURES, type GenUiFixtureKey } from "@/lib/pi-genui-fixtures";
import { askPiGenUi } from "@/lib/ask-pi-genui";
import { PiGenUiResult } from "./PiGenUiResult";
import {
  PiPill,
  PiNudge,
  PiPanel,
  PiThinking,
  PiResultCard,
  PiChips,
  PiSendButton,
  PiInputIcon,
  usePiDrag,
} from "./ask-pi-ui";

type State = "collapsed" | "idle" | "thinking" | "result";

// I4 — nudges the user has retired stay retired. The ✕ dismissal persists here
// across reloads; using a nudge (clicking it open) only hides it for the session.
const NUDGE_STORE_KEY = "pi_nudges_dismissed";
function loadDismissedNudges(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(NUDGE_STORE_KEY) ?? "[]"); }
  catch { return []; }
}

/**
 * Global Ask Pi assistant — present on every shell page.
 * Idle: small floating pill. Expands while typing/responding.
 *
 * I2 — Pi Context Bus: the placeholder, suggestion chips, "thinking" trace and the
 * proposed result are reshaped by the current route via {@link getPiContext}, so Pi
 * opens with a different, on-topic proposal on each surface.
 *
 * Look, feel and behaviour come from the shared Ask Pi primitives (./ask-pi-ui) so
 * this dock and the in-canvas composer are visually and interactively identical.
 *
 * NEVER auto-publishes. Always proposes changes for approval.
 */
export function AskPiDock() {
  const [state, setState] = useState<State>("collapsed");
  const [value, setValue] = useState("");
  // I7 — on the Analytics surface, a question yields a GenUI (C1) generative-UI answer.
  // Live path: the C1 API generates a fresh card per question (liveDsl). If the call fails
  // (no key / offline), we fall back to one of the captured static fixtures (genUiKey).
  const [genUiKey, setGenUiKey] = useState<GenUiFixtureKey | null>(null);
  const [liveDsl, setLiveDsl] = useState<string | null>(null);
  // I4 — retired nudge ids (✕-dismissed are also persisted; used-nudges are session-only).
  const [hiddenNudges, setHiddenNudges] = useState<string[]>(() => loadDismissedNudges());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Route-driven context. Re-resolves on navigation so chips/placeholder/result
  // always match the surface Pi is summoned from.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ctx = getPiContext(pathname);

  // Shared horizontal drag (same behaviour + remembered position as the canvas composer).
  const { dragX, pillHandlers, suppressClick } = usePiDrag(wrapRef);

  const isOpen = state !== "collapsed";
  const expanded = state === "thinking" || state === "result";

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

  useEffect(() => {
    if (state === "idle") inputRef.current?.focus();
  }, [state]);

  // Click-outside collapses only from the idle composer. Once Pi is working or showing a
  // result, an outside click is ignored so the answer is never lost by accident — close it
  // with the ✕. Also stays open while the user is mid-prompt.
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target as Node)) return;
      if (state !== "idle") return;
      if (value.trim().length > 0) return;
      setState("collapsed");
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [isOpen, value, state]);

  const submit = async (q: string = value) => {
    const query = q.trim();
    if (!query) return;
    if (q !== value) setValue(q);
    setState("thinking");
    if (ctx.scope === "Analytics") {
      // Generative: ask C1 to build a card from the live question. Fall back to a captured
      // fixture if the API is unreachable or unconfigured so the demo never dead-ends.
      setGenUiKey(null);
      setLiveDsl(null);
      try {
        const r = await askPiGenUi({ data: query });
        if (r.ok) setLiveDsl(r.content);
        else setGenUiKey(pickGenUiFixtureKey(query));
      } catch {
        setGenUiKey(pickGenUiFixtureKey(query));
      }
      setState("result");
    } else {
      // Elsewhere, keep the route's canned text proposal.
      setGenUiKey(null);
      setTimeout(() => setState("result"), 1800);
    }
  };

  const reset = () => { setGenUiKey(null); setLiveDsl(null); setValue(""); setState("idle"); };

  // I4 — proactive nudge plumbing. The route supplies it; it floats above the pill
  // until retired. `persist` writes the ✕-dismissal to localStorage; using a nudge
  // hides it only for this session so it can resurface on a fresh visit.
  const nudge = ctx.nudge;
  const showNudge = state === "collapsed" && !!nudge && !hiddenNudges.includes(nudge.id);
  const retireNudge = (id: string, persist: boolean) => {
    setHiddenNudges((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      if (persist) { try { window.localStorage.setItem(NUDGE_STORE_KEY, JSON.stringify(next)); } catch { /* ignore */ } }
      return next;
    });
  };
  const openFromNudge = () => {
    if (!nudge) return;
    retireNudge(nudge.id, false); // used → hide for the session
    setState("idle");
    setValue(nudge.prompt);
    setTimeout(() => submit(nudge.prompt), 60);
  };

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4">
      {!isOpen && (
        <div className="pointer-events-none flex flex-col items-center" style={{ transform: `translateX(${dragX}px)` }}>
          {showNudge && (
            <PiNudge
              label={nudge!.label}
              onOpen={openFromNudge}
              onDismiss={() => retireNudge(nudge!.id, true)}
            />
          )}
          <PiPill onOpen={() => setState("idle")} pillHandlers={pillHandlers} suppressClick={suppressClick} />
        </div>
      )}

      {isOpen && (
        <div className="pointer-events-none" style={{ transform: `translateX(${dragX}px)` }}>
          <PiPanel innerRef={panelRef} className="w-[680px] max-w-full">
            {expanded && (
              <div className="border-b border-border px-5 py-4 animate-fade-in">
                {state === "thinking" ? (
                  <PiThinking steps={ctx.thinking} />
                ) : liveDsl || genUiKey ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 rounded-full border border-ai/30 bg-ai/5 px-2 py-0.5 text-[9.5px] font-medium text-ai">
                        <Sparkle className="h-2.5 w-2.5 fill-ai" /> Generated by Pi
                      </span>
                      <button
                        onClick={reset}
                        aria-label="Close"
                        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="rounded-xl border border-ai/30 bg-card p-2">
                      <PiGenUiResult c1Response={liveDsl ?? GENUI_FIXTURES[genUiKey!]} />
                    </div>
                  </div>
                ) : (
                  <PiResultCard result={ctx.result} onAccept={reset} onDismiss={reset} />
                )}
              </div>
            )}

            <div className="flex items-center gap-2 px-4 py-2.5">
              <PiInputIcon />
              <textarea
                ref={inputRef}
                rows={1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                  if (e.key === "Escape" && !value) setState("collapsed");
                }}
                placeholder={ctx.placeholder}
                className="scrollbar-thin max-h-32 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14px] text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
              />
              <PiSendButton
                thinking={state === "thinking"}
                disabled={!value.trim() && state !== "thinking"}
                onClick={state === "thinking" ? reset : () => submit()}
              />
            </div>

            {state === "idle" && value.length === 0 && (
              <PiChips chips={ctx.chips} onPick={(s) => submit(s)} />
            )}
          </PiPanel>
        </div>
      )}
    </div>
  );
}
