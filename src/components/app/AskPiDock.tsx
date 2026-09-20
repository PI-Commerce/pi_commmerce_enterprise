import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { getPiContext } from "@/lib/ask-pi-context";
import { askPi } from "@/lib/server-fns/pi-llm";
import { getAgents, refreshAgentsFromDb, saveAgent, setPiAgentWork } from "@/lib/agent-store";
import { detectDraftAgentIntent } from "@/lib/pi-agent-intent";
import { usePiScreenContext } from "@/lib/pi-screen-context";
import { usePiSurface, dispatchScreenToolCalls, usePiDisabledCopy, useIsPiDockSuppressed } from "@/lib/pi-screen-actions";
import { extractActionLinksFromToolCalls } from "@/lib/pi-canvas-apply";
import { AnalyticsChat } from "@/components/analytics/AnalyticsChat";
import { IntegrationsChat } from "@/components/integrations/IntegrationsChat";
import { DeveloperChat } from "@/components/developer/DeveloperChat";
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
  PiDraftingPill,
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
  // Ask Pi "working on an agent" background state. When set, the dock pill
  // slot renders a PiDraftingPill (label + live timer + rotating step
  // microcopy) instead of the normal Ask Pi pill. Populated by the /agents
  // optimistic draft flow AND by edit-flow submits on /agents/$id.
  // `verb`: 'drafting' for new agents, 'updating' for edits — only the
  // copy differs.
  const [drafting, setDrafting] = useState<
    { label: string; startedAt: number; verb: "drafting" | "updating" } | null
  >(null);
  // I4 — retired nudge ids (✕-dismissed are also persisted; used-nudges are session-only).
  const [hiddenNudges, setHiddenNudges] = useState<string[]>(() => loadDismissedNudges());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Route-driven context. Re-resolves on navigation so chips/placeholder/result
  // always match the surface Pi is summoned from.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ctx = getPiContext(pathname);
  const navigate = useNavigate();

  // /analytics gets a dedicated multi-turn chat with structured answers
  // (insight + recommendation + infographic + follow-ups). Everywhere else keeps
  // the single-shot proposal card path.
  const isAnalyticsSurface = pathname === "/analytics";
  // /integrations gets its own dedicated multi-turn chat shell
  // (IntegrationsChat) — same reason /analytics does. It's a Q&A surface
  // where the user's question must stay on screen and follow-ups are the
  // whole point. The single-shot idle→thinking→result flow is wrong for
  // that shape.
  const isIntegrationsSurface = pathname === "/integrations";
  // /developer is the sibling docs-RAG surface (API Docs + Release Notes).
  // Same reasoning as /integrations — dedicated chat shell so the question
  // stays visible above Pi's answer, markdown answers render cleanly, and
  // follow-ups are one click away.
  const isDeveloperSurface = pathname === "/developer";
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

  // Suppress the global dock when a page has mounted its own in-canvas
  // AiComposer (campaign canvas, freeform canvas). Prevents two Ask Pi
  // pills on the same page — the in-canvas composer is authoritative on
  // those surfaces because it carries the graph editing context. Hooks
  // above this line still fire because they must run on every render.
  const dockSuppressed = useIsPiDockSuppressed();

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

  // Reset the dock's chat state whenever the surface changes underneath it:
  //  - route navigation (pathname)
  //  - published surface (tab-level, e.g. Overview → Templates on Channels)
  //  - dead-zone toggle (e.g. opening the template builder overlay)
  //
  // Without this, a "result" bubble from a previous turn leaks back onto
  // the panel the next time Pi is summoned on a fresh surface — you close
  // the panel, the state stays "result" + `liveAnswer` intact, and the
  // stale answer reappears (with a stale CTA from the old route context)
  // as soon as the panel is visible again. Collapsing back to the pill
  // and clearing the live-answer buffer makes every reopen a clean start.
  const surfaceKey = surface?.surfaceId ?? "";
  useEffect(() => {
    setState("collapsed");
    setValue("");
    setLiveAnswer(null);
    setLiveActionLinks(null);
  }, [pathname, surfaceKey, inDeadZone]);

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
    // Same rationale as /analytics: IntegrationsChat owns its own turn
    // state, the dock's `state` stays "idle", and click-outside would
    // collapse a live conversation on every card click. ✕ / Esc only.
    if (isIntegrationsSurface) return;
    // Same rationale for DeveloperChat on /developer.
    if (isDeveloperSurface) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target as Node)) return;
      if (state !== "idle") return;
      if (value.trim().length > 0) return;
      setState("collapsed");
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [isOpen, value, state, isAnalyticsSurface, isIntegrationsSurface, isDeveloperSurface]);

  const submit = async (q: string = value) => {
    const query = q.trim();
    if (!query) return;
    if (q !== value) setValue(q);

    // Decide agent flow FIRST, before touching state. Agent flows never
    // show the "thinking" panel or the result card — the pill IS the
    // notification, the fresh content in the builder IS the confirmation.
    // Non-agent flows still use the classic idle→thinking→result path.
    let draftHint:
      | { id: string; name: string; topic: string; label: string }
      | undefined;
    let agentFlow: "drafting" | "updating" | null = null;

    if (ctx.scopeMode === "agents") {
      const intent = detectDraftAgentIntent(query);
      if (intent) {
        agentFlow = "drafting";
        draftHint = intent;
        saveAgent(
          intent.id,
          {
            name: intent.name,
            type: "voice",
            status: "draft",
            tools: [],
            masterPrompt: "",
            knowledgeBase: "",
            postCall: [],
          },
          { skipRemote: true },
        );
        const startedAt = Date.now();
        setState("collapsed");
        setValue("");
        setLiveAnswer(null);
        setLiveActionLinks(null);
        setDrafting({ label: intent.name, startedAt, verb: "drafting" });
        setPiAgentWork({ id: intent.id, verb: "drafting", startedAt });
        navigate({ to: "/agents/$id", params: { id: intent.id } });
      } else {
        // Edit flow: /agents/<id> submit that isn't a fresh-draft intent.
        // Pill flips to "updating" with the current agent's name; the
        // composer collapses so the builder is unobstructed while
        // section-scoped tools fire. No result card at the end.
        const editMatch = pathname.match(/^\/agents\/([^/]+)$/);
        const editingId = editMatch?.[1];
        if (editingId) {
          agentFlow = "updating";
          const currentName = getAgents()[editingId]?.name ?? editingId;
          const startedAt = Date.now();
          setState("collapsed");
          setValue("");
          setLiveAnswer(null);
          setLiveActionLinks(null);
          setDrafting({ label: currentName, startedAt, verb: "updating" });
          setPiAgentWork({ id: editingId, verb: "updating", startedAt });
        }
      }
    }

    // Non-agent flows: standard thinking→result path.
    if (!agentFlow) {
      setState("thinking");
      setLiveAnswer(null);
      setLiveActionLinks(null);
    }

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
            // Client-derived id + name for a draft-agent flow. Pi uses
            // these instead of picking its own so we don't get dupe rows.
            ...(draftHint ? { draftHint } : {}),
          },
        },
      });
      // Only surface Pi's free-text reply for non-agent flows. Agent
      // flows (drafts, edits) rely on the pill + the fresh builder
      // content as feedback — a result card on top of that reads as
      // clutter and re-opens the panel over the builder.
      if (!agentFlow && r.ok && r.answer.trim().length > 0) {
        setLiveAnswer(r.answer);
      }
      // Agents-scope mutations: if Pi wrote to the agents table (via any
      // of the mutation tool names), the in-memory agent-store is stale.
      // Force a re-hydrate from D1 so the /agents list AND any open
      // AgentBuilder pick up the change without a manual refresh. Awaited
      // (not fire-and-forget) because the very next steps clear the
      // drafting pill / dispatch open_agent — those must see a fresh
      // store, otherwise the builder flashes "Agent not found" or the
      // shimmer runs after the record is already saved.
      // Every server-side mutation on the agents table. Keep in sync with
      // agent-crud.ts + agent-edit.ts. Missing a name here means the store
      // doesn't refresh and the builder shows stale content.
      const AGENT_MUTATION_TOOLS = new Set([
        "save_agent",
        "save_agent_from_topic",
        "rewrite_master_prompt_section",
        "rewrite_knowledge_section",
        "update_tools",
        "update_postcall_vars",
        "rename_agent",
      ]);
      if (r.ok && ctx.scopeMode === "agents") {
        const mutated = r.toolCalls?.some((tc) => AGENT_MUTATION_TOOLS.has(tc.name));
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
      // buttons above the accept/dismiss row. Non-agent flows only (agent
      // flows don't render a result card, so action links have nowhere
      // to attach).
      if (!agentFlow && r.ok) {
        const links = extractActionLinksFromToolCalls(r.toolCalls ?? []);
        if (links.length > 0) setLiveActionLinks(links);
      }
      // If !ok we simply leave liveAnswer null and the result card shows ctx.result.
    } catch {
      // Network / RPC failure — same fallback.
    }
    // If we showed a PiDraftingPill (drafting OR editing on /agents), clear
    // it once askPi resolves. Keep the panel collapsed — the user is
    // already inside the builder reading the freshly-updated record; don't
    // pop a result card at them. Clear the shared signal too so the
    // builder-local overlay dismisses.
    if (drafting) {
      setDrafting(null);
      setPiAgentWork(null);
      return;
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
  // Page mounted its own in-canvas composer — hide the global dock so
  // there aren't two Ask Pi pills on screen. Kept BELOW every hook call
  // above so React sees the same hook order every render.
  if (dockSuppressed) return null;

  if (inDeadZone) {
    return (
      <div ref={wrapRef} className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
        <div className="pointer-events-none flex flex-col items-center" style={{ transform: `translateX(${dragX}px)` }}>
          <PiDeadZoneNudge nudge={deadZoneCopy!} />
          <PiDeadZonePill pillHandlers={pillHandlers} />
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
      {!isOpen && (
        <div className="pointer-events-none flex flex-col items-center" style={{ transform: `translateX(${dragX}px)` }}>
          {showNudge && !drafting && (
            <PiNudge
              label={nudge!.label}
              onOpen={openFromNudge}
              onDismiss={() => retireNudge(nudge!.id, true)}
            />
          )}
          {drafting ? (
            <PiDraftingPill
              label={drafting.label}
              startedAt={drafting.startedAt}
              pillHandlers={pillHandlers}
              verb={drafting.verb}
            />
          ) : (
            <PiPill onOpen={() => setState("idle")} pillHandlers={pillHandlers} suppressClick={suppressClick} />
          )}
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

      {isOpen && isIntegrationsSurface && (
        // /integrations is a Q&A surface: mount the dedicated multi-turn chat
        // shell so the user's question stays visible above Pi's answer, the
        // composer never disappears, and follow-ups are one click away. The
        // generic proposal-card flow below is wrong for this shape.
        <div className="pointer-events-none" style={{ transform: `translateX(${dragX}px)` }}>
          <PiPanel innerRef={panelRef} className="w-[680px] max-w-[94vw]">
            <IntegrationsChat onClose={() => setState("collapsed")} />
          </PiPanel>
        </div>
      )}

      {isOpen && isDeveloperSurface && (
        // /developer is the sibling docs-RAG surface (API Docs + Release Notes).
        // Same reasoning as /integrations — dedicated chat shell so the question
        // stays visible above Pi's answer, markdown answers render cleanly, and
        // follow-ups are one click away.
        <div className="pointer-events-none" style={{ transform: `translateX(${dragX}px)` }}>
          <PiPanel innerRef={panelRef} className="w-[680px] max-w-[94vw]">
            <DeveloperChat onClose={() => setState("collapsed")} />
          </PiPanel>
        </div>
      )}

      {isOpen && !isAnalyticsSurface && !isIntegrationsSurface && !isDeveloperSurface && (
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
                  //
                  // /integrations is a docs-RAG surface: answers are markdown-heavy
                  // (bold section names, code-fenced scopes, deep links) and there's
                  // nothing to accept/reject — the payload IS the answer. Render
                  // markdown + collapse the accept row to a single "Close".
                  <PiResultCard
                    result={{ text: liveAnswer, cta: ctx.result.cta, actionLinks: liveActionLinks ?? undefined }}
                    onAccept={reset}
                    onDismiss={reset}
                    renderMarkdown={ctx.scopeMode === "integrations" || ctx.scopeMode === "developer"}
                    hideAccept={ctx.scopeMode === "integrations" || ctx.scopeMode === "developer"}
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
