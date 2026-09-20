import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getPiContext } from "@/lib/ask-pi-context";
import { askPi } from "@/lib/server-fns/pi-llm";
import { refreshAgentsFromDb } from "@/lib/agent-store";
import { usePiScreenContext } from "@/lib/pi-screen-context";
import { usePiSurface, dispatchScreenToolCalls, usePiDisabledCopy } from "@/lib/pi-screen-actions";
import { extractActionLinksFromToolCalls } from "@/lib/pi-canvas-apply";
import { AnalyticsChat } from "@/components/analytics/AnalyticsChat";
import {
  PiPill,
  PiNudge,
  PiPanel,
  PiThinking,
  PiResultCard,
  PiChips,
  PiSendButton,
  PiInputIcon,
  PiDeadZonePill,
  PiDeadZoneNudge,
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
  // Live LLM answer on non-Analytics surfaces. Populated by the askPi server fn.
  // When null, the result panel falls back to the surface's canned ctx.result.
  // (/analytics uses AnalyticsChat instead and doesn't touch this state.)
  const [liveAnswer, setLiveAnswer] = useState<string | null>(null);
  // P3 escape-hatch buttons for the current turn. Cleared alongside
  // liveAnswer on submit / reset so a stale link from a previous
  // question never sticks around under a fresh answer.
  const [liveActionLinks, setLiveActionLinks] = useState<Array<{ label: string; href: string; hint?: string }> | null>(null);
  // I4 — retired nudge ids (✕-dismissed are also persisted; used-nudges are session-only).
  const [hiddenNudges, setHiddenNudges] = useState<string[]>(() => loadDismissedNudges());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Route-driven context. Re-resolves on navigation so chips/placeholder/result
  // always match the surface Pi is summoned from.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ctx = getPiContext(pathname);

  // /analytics gets a dedicated multi-turn chat with structured answers
  // (insight + recommendation + infographic + follow-ups). Everywhere else keeps
  // the single-shot proposal card path.
  const isAnalyticsSurface = pathname === "/analytics";
  const screenCtx = usePiScreenContext();
  // Surface published by the current page — carries the surfaceId (so the
  // server exposes the right screen tools) and the handler map the dock
  // dispatches to when Pi's response includes screen-tool calls.
  const surface = usePiSurface();

  // Shared horizontal drag (same behaviour + remembered position as the canvas composer).
  const { dragX, pillHandlers, suppressClick } = usePiDrag(wrapRef);

  // Tab-level dead-zone override — pages call `usePiDisabled(copy)` to declare
  // that Pi is off-duty on the current tab (e.g. /developer > APIs & Webhooks
  // when the surrounding route is otherwise live). Bus copy wins over the
  // route-static `ctx.deadZone` so a page can flip Pi off/on as the user
  // switches tabs without touching the route context table.
  const tabDeadZoneCopy = usePiDisabledCopy();
  const deadZoneCopy = tabDeadZoneCopy ?? ctx.deadZone?.nudge ?? null;
  const inDeadZone = deadZoneCopy !== null;

  const isOpen = state !== "collapsed";
  const expanded = state === "thinking" || state === "result";

  useEffect(() => {
    // Dead-zone surfaces: ⌘K is a no-op. Pi is off duty and we don't want the
    // shortcut to open a chat that has nothing to say.
    if (inDeadZone) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setState((s) => (s === "collapsed" ? "idle" : "collapsed"));
      }
      if (e.key === "Escape" && state !== "collapsed") setState("collapsed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, inDeadZone]);

  useEffect(() => {
    if (state === "idle") inputRef.current?.focus();
  }, [state]);

  // Click-outside collapses only from the idle composer. Once Pi is working or showing a
  // result, an outside click is ignored so the answer is never lost by accident — close it
  // with the ✕. Also stays open while the user is mid-prompt.
  //
  // /analytics is a hard exception: the dock's `state` never leaves "idle" there
  // (AnalyticsChat owns its own turn state), so the default rule would collapse
  // the panel on every tab / filter click and destroy the conversation. Only
  // the ✕ (or Esc) should close it on that surface.
  useEffect(() => {
    if (!isOpen) return;
    if (isAnalyticsSurface) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target as Node)) return;
      if (state !== "idle") return;
      if (value.trim().length > 0) return;
      setState("collapsed");
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [isOpen, value, state, isAnalyticsSurface]);

  const submit = async (q: string = value) => {
    const query = q.trim();
    if (!query) return;
    if (q !== value) setValue(q);
    setState("thinking");
    setLiveAnswer(null);
    setLiveActionLinks(null);
    // Every non-/analytics surface — call askPi with the current route's scope +
    // system hint. If it fails (missing D1 binding, missing TFY key, endpoint
    // unreachable from local without VPN), gracefully fall back to the surface's
    // canned proposal so nothing dead-ends.
    try {
      const serverScope =
        ctx.scopeMode === "builder"        ? "builder"
        : ctx.scopeMode === "agents"        ? "agents"
        : ctx.scopeMode === "integrations"  ? "integrations"
        : "analytics";
      const r = await askPi({
        data: {
          scope: serverScope,
          question: query,
          context: {
            pathname,
            surface: ctx.scope,
            systemHint: ctx.systemHint,
            // The page's published surfaceId (if any) tells the server
            // which screen-tool subset to expose for this turn. Undefined
            // on surfaces without any UI-mutation tools registered.
            surfaceId: surface?.surfaceId,
          },
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
        // Awaited (not fire-and-forget) because the very next step may
        // dispatch an `open_agent` screen tool that navigates into the
        // builder for the fresh id — without the await, EditAgent flashes
        // "Agent not found" until the hydrate resolves.
        if (mutated) await refreshAgentsFromDb();
      }
      // Screen-tool dispatch — for any tool call Pi made whose name is
      // registered by the current surface (list filter, sort, run action,
      // open-modal, …), fire the page-registered handler with the parsed
      // args. Server-side execution was a no-op for these; the client is
      // where the UI mutation actually happens.
      if (r.ok && surface) {
        dispatchScreenToolCalls(surface, r.toolCalls ?? []);
      }
      // P3 escape-hatch — Pi's emit_action_link calls become prominent
      // buttons above the accept/dismiss row. New-tab so this dock stays.
      if (r.ok) {
        const links = extractActionLinksFromToolCalls(r.toolCalls ?? []);
        if (links.length > 0) setLiveActionLinks(links);
      }
      // If !ok we simply leave liveAnswer null and the result card shows ctx.result.
    } catch {
      // Network / RPC failure — same fallback.
    }
    setState("result");
  };

  const reset = () => { setLiveAnswer(null); setLiveActionLinks(null); setValue(""); setState("idle"); };

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

  // Dead-zone surfaces (e.g. /reports, /settings) and dead-zone tabs (e.g.
  // /developer > APIs & Webhooks, /developer > Logs): render the muted pill and
  // a persistent playful caption, then bail before any of the chat state
  // machinery renders. Pill still drags so the user's remembered position from
  // other surfaces carries over — presence stays consistent, function is
  // honestly off. `deadZoneCopy` resolves to the page's `usePiDisabled` string
  // if published, otherwise the route's static `ctx.deadZone.nudge`.
  if (inDeadZone) {
    return (
      <div ref={wrapRef} className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4">
        <div className="pointer-events-none flex flex-col items-center" style={{ transform: `translateX(${dragX}px)` }}>
          <PiDeadZoneNudge nudge={deadZoneCopy!} />
          <PiDeadZonePill pillHandlers={pillHandlers} />
        </div>
      </div>
    );
  }

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

      {isOpen && isAnalyticsSurface && (
        // On /analytics we bypass the generic idle→thinking→result state machine
        // and hand the whole panel body to AnalyticsChat, which owns its own
        // multi-turn conversation, screen-context grounding, and infographics.
        // Sized for chart-heavy answers — wider + taller than the generic dock.
        <div className="pointer-events-none" style={{ transform: `translateX(${dragX}px)` }}>
          <PiPanel innerRef={panelRef} className="w-[840px] max-w-[94vw]">
            <AnalyticsChat
              context={screenCtx ?? { pathname: "/analytics" }}
              onClose={() => setState("collapsed")}
            />
          </PiPanel>
        </div>
      )}

      {isOpen && !isAnalyticsSurface && (
        <div className="pointer-events-none" style={{ transform: `translateX(${dragX}px)` }}>
          <PiPanel innerRef={panelRef} className="w-[680px] max-w-full">
            {expanded && (
              <div className="border-b border-border px-5 py-4 animate-fade-in">
                {state === "thinking" ? (
                  <PiThinking steps={ctx.thinking} />
                ) : liveAnswer ? (
                  // Real LLM answer over D1 for this surface. Preserve the surface's
                  // canned CTA so the "next action" language stays on-brand. If Pi
                  // emitted P3 escape-hatch links this turn, they render above the CTA.
                  <PiResultCard
                    result={{ text: liveAnswer, cta: ctx.result.cta, actionLinks: liveActionLinks ?? undefined }}
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
