import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Sparkle, X, Download, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { getPiContext } from "@/lib/ask-pi-context";
import { pickThesysFixtureKey, THESYS_FIXTURES, type ThesysFixtureKey } from "@/lib/pi-thesys-fixtures";
import { askPiThesys } from "@/lib/ask-pi-thesys";
import { askPi } from "@/lib/server-fns/pi-llm";
import { refreshAgentsFromDb } from "@/lib/agent-store";
import { PiThesysResult } from "./PiThesysResult";
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
  // I7 — on the Analytics surface, a question yields a Thesys C1 generative-UI card.
  // Live path: the C1 API generates a fresh card per question (liveDsl). If the call fails
  // (no key / offline), we fall back to one of the captured static fixtures (thesysKey).
  const [thesysKey, setThesysKey] = useState<ThesysFixtureKey | null>(null);
  const [liveDsl, setLiveDsl] = useState<string | null>(null);
  // Live LLM answer on non-Analytics surfaces. Populated by the askPi server fn.
  // When null, the result panel falls back to the surface's canned ctx.result.
  const [liveAnswer, setLiveAnswer] = useState<string | null>(null);
  // I4 — retired nudge ids (✕-dismissed are also persisted; used-nudges are session-only).
  const [hiddenNudges, setHiddenNudges] = useState<string[]>(() => loadDismissedNudges());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const thesysCaptureRef = useRef<HTMLDivElement>(null);

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
    // Reset all live-result channels — each submit clears the previous surface's answer.
    setThesysKey(null);
    setLiveDsl(null);
    setLiveAnswer(null);
    if (ctx.scopeMode === "thesys") {
      // Analytics — generative UI card. Ask C1 to build one from the live question;
      // fall back to a captured fixture if the API is unreachable so the demo never
      // dead-ends.
      try {
        const r = await askPiThesys({ data: query });
        if (r.ok) setLiveDsl(r.content);
        else setThesysKey(pickThesysFixtureKey(query));
      } catch {
        setThesysKey(pickThesysFixtureKey(query));
      }
      setState("result");
      return;
    }
    // Every other surface — call the real askPi LLM with the current route's scope
    // + system hint. If it fails (missing D1 binding, missing TFY key, endpoint
    // unreachable from local without VPN), gracefully fall back to the surface's
    // canned proposal so nothing dead-ends.
    try {
      const serverScope =
        ctx.scopeMode === "builder" ? "builder"
        : ctx.scopeMode === "agents"  ? "agents"
        : "analytics";
      const r = await askPi({
        data: {
          scope: serverScope,
          question: query,
          context: { pathname, surface: ctx.scope, systemHint: ctx.systemHint },
        },
      });
      if (r.ok && r.answer.trim().length > 0) {
        setLiveAnswer(r.answer);
      }
      // Agents-scope mutations: if Pi called save_agent, the in-memory
      // agent-store has stale data. Force a re-hydrate from D1 so the /agents
      // list and any open AgentBuilder pick up the change without a refresh.
      if (r.ok && ctx.scopeMode === "agents") {
        const mutated = r.toolCalls?.some((tc) => tc.name === "save_agent");
        if (mutated) void refreshAgentsFromDb();
      }
      // If !ok we simply leave liveAnswer null and the result card shows ctx.result.
    } catch {
      // Network / RPC failure — same fallback.
    }
    setState("result");
  };

  const reset = () => { setThesysKey(null); setLiveDsl(null); setLiveAnswer(null); setValue(""); setState("idle"); };

  // Download the currently rendered Thesys card as a PNG. The Crayon renderer draws
  // regular DOM (no canvas), so we snapshot the wrapper via html-to-image and force a
  // download. Same UX as PiChartResult's Download PNG.
  const downloadThesysPng = async () => {
    const node = thesysCaptureRef.current;
    if (!node) return;
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `pi-analytics-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast.error("Could not export PNG", { description: (err as Error).message });
    }
  };

  const addThesysAsCard = () => {
    toast.success("Added to your dashboard");
    reset();
  };

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
                ) : liveDsl || thesysKey ? (
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
                    <div ref={thesysCaptureRef} className="rounded-xl border border-ai/30 bg-card p-2">
                      <PiThesysResult c1Response={liveDsl ?? THESYS_FIXTURES[thesysKey!]} />
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={reset} className="rounded-md px-2.5 py-1 text-[11.5px] text-muted-foreground hover:text-foreground">
                        Dismiss
                      </button>
                      <button
                        onClick={downloadThesysPng}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11.5px] font-medium text-foreground hover:bg-accent"
                      >
                        <Download className="h-3 w-3" /> Download PNG
                      </button>
                      <button
                        onClick={addThesysAsCard}
                        className="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background"
                      >
                        <LayoutGrid className="h-3 w-3" /> Add as card
                      </button>
                    </div>
                  </div>
                ) : liveAnswer ? (
                  // Real LLM answer over D1 for this surface. Preserve the surface's
                  // canned CTA so the "next action" language stays on-brand.
                  <PiResultCard
                    result={{ text: liveAnswer, cta: ctx.result.cta }}
                    onAccept={reset}
                    onDismiss={reset}
                  />
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
