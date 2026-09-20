/**
 * Pi Screen Action bus.
 *
 * Some Pi tools mutate the CURRENT PAGE's UI state (list filters, search
 * strings, sort order, per-row actions, "open the create-broadcast modal
 * with WhatsApp preselected"). Those tools have no server payload — the
 * work is entirely client-side. The problem is the tool call happens on
 * the server (inside Pi's tool loop) and the state to mutate lives on the
 * page component that summoned Pi.
 *
 * This bus bridges the two. Each page uses {@link usePublishSurface} to:
 *   1. Declare its `surfaceId` (a string like "campaigns.workflows",
 *      "campaigns.runs", "broadcasts.list", "campaigns.data") — the
 *      askPi request forwards this so the server only exposes the screen
 *      tools that make sense on that surface (see `pi-llm.ts`).
 *   2. Register a set of `handlers` — one function per screen tool the
 *      surface supports (`list_filter_status`, `run_action`,
 *      `open_new_broadcast`, ...).
 *
 * After a Pi turn resolves, the dock reads `toolCalls`, and for every
 * call whose name matches a registered handler it dispatches with the
 * parsed args. Unknown / stale tool names are silently ignored — the
 * server-side surface filter means Pi shouldn't call one that isn't
 * available, and defensive dispatch keeps a stale registration from
 * throwing.
 *
 * Non-goals:
 *   - Not a redux store. Just registration + dispatch.
 *   - Not authoritative. The page owns its state; the bus only routes
 *     the intent.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Handler signature for a single screen tool. Args come from the LLM's
 * parsed tool_use.input — always a JSON object.
 */
export type ScreenActionHandler = (args: Record<string, unknown>) => void;

/**
 * The bundle a page publishes: its surface id + one handler per tool
 * it supports on that surface, plus optional per-tab UI overrides that
 * let a page tighten the dock's chips / nudge / placeholder to what
 * this exact tab can actually do.
 *
 * The route-static `PiContext` (from ask-pi-context.ts) supplies the
 * defaults. When a page also publishes `chips` / `nudge` / `placeholder`
 * here, those win — that way a single route (`/campaigns`,
 * `/channels/whatsapp`, ...) can host multiple sub-tabs with
 * distinct chip suggestions and a contextual nudge per tab, without
 * the route context table growing a chip-per-tab tree.
 */
export type SurfaceChip = string;
export type SurfaceNudge = { id: string; label: string; prompt: string };

export type SurfaceRegistration = {
  surfaceId: string;
  handlers: Record<string, ScreenActionHandler>;
  /** Optional per-tab chip overrides. Falls back to `ctx.chips`. */
  chips?: SurfaceChip[];
  /** Optional per-tab proactive nudge. Falls back to `ctx.nudge`. */
  nudge?: SurfaceNudge;
  /** Optional per-tab input placeholder. Falls back to `ctx.placeholder`. */
  placeholder?: string;
};

type BusValue = {
  /** Currently-published surface — null when no page has opted in. */
  surface: SurfaceRegistration | null;
  /** Page registration entry point; wraps into a stable object. */
  publish: (r: SurfaceRegistration | null) => void;
};

const PiSurfaceCtx = createContext<BusValue>({ surface: null, publish: () => {} });

/** Wrap once at the AppShell root so every page + the dock share a bus. */
export function PiSurfaceProvider({ children }: { children: ReactNode }) {
  const [surface, setSurface] = useState<SurfaceRegistration | null>(null);
  const value = useMemo<BusValue>(() => ({ surface, publish: setSurface }), [surface]);
  return <PiSurfaceCtx.Provider value={value}>{children}</PiSurfaceCtx.Provider>;
}

/**
 * Page-level hook. Call with the surface id + handlers on every render;
 * the effect below diffs by surface id + handler names so a re-render
 * with the same shape doesn't churn the bus.
 *
 * The `handlers` map is refs'd so a handler that closes over fresh page
 * state on every render (typical for list filters) always dispatches
 * against the latest closure without re-registering.
 */
export function usePublishSurface(reg: SurfaceRegistration | null) {
  const { publish } = useContext(PiSurfaceCtx);
  const handlersRef = useRef(reg?.handlers ?? {});
  handlersRef.current = reg?.handlers ?? {};

  // A stable identity key so the effect only re-fires when the surface
  // id OR the set of handler names actually changes — not when the
  // handler functions get recreated (they will, every render). Chip /
  // nudge / placeholder text is factored in so a per-tab UI override
  // change also re-publishes.
  const key = reg
    ? [
        reg.surfaceId,
        Object.keys(reg.handlers).sort().join(","),
        (reg.chips ?? []).join("|"),
        reg.nudge?.id ?? "",
        reg.placeholder ?? "",
      ].join("¦")
    : "";

  useEffect(() => {
    if (!reg) {
      publish(null);
      return;
    }
    // Build a stable dispatcher shape: same handler names, each proxying
    // to the LIVE handlersRef so page-state closures stay fresh.
    const proxied: Record<string, ScreenActionHandler> = {};
    for (const name of Object.keys(reg.handlers)) {
      proxied[name] = (args) => handlersRef.current[name]?.(args);
    }
    publish({
      surfaceId: reg.surfaceId,
      handlers: proxied,
      ...(reg.chips ? { chips: reg.chips } : {}),
      ...(reg.nudge ? { nudge: reg.nudge } : {}),
      ...(reg.placeholder ? { placeholder: reg.placeholder } : {}),
    });
    return () => publish(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/**
 * Dock-side reader. Returns the current surface's id and dispatcher.
 * `null` when no page has published, in which case the dock treats every
 * screen-tool call as a no-op.
 */
export function usePiSurface() {
  return useContext(PiSurfaceCtx).surface;
}

// ---------------------------------------------------------------------------
// Ask Pi "dead-zone" channel — shared primitive for surfaces/tabs where Pi
// genuinely has no capability. Pages call `usePiDisabled("copy string")` to
// declare a dead zone; the dock renders a greyed, non-interactive pill with a
// persistent (non-dismissible) playful nudge holding the copy. Pass `null` to
// re-enable Pi. See feedback_askpi_dead_zones.md for the UX contract and
// project_askpi_agents_builder.md for the next planned consumer (Agents > Tools).
// ---------------------------------------------------------------------------

type DisabledBus = {
  copy: string | null;
  publish: (c: string | null) => void;
};

const PiDisabledCtx = createContext<DisabledBus>({ copy: null, publish: () => {} });

/** Wrap once at the app root alongside PiSurfaceProvider. */
export function PiDisabledProvider({ children }: { children: ReactNode }) {
  const [copy, setCopy] = useState<string | null>(null);
  const value = useMemo<DisabledBus>(() => ({ copy, publish: setCopy }), [copy]);
  return <PiDisabledCtx.Provider value={value}>{children}</PiDisabledCtx.Provider>;
}

/**
 * Page-level hook to declare a Pi dead zone. Pass a playful, surface-specific
 * copy string to disable Pi; pass `null` to re-enable. Safe to call in a
 * component that toggles between tabs — the effect re-publishes on change and
 * clears on unmount.
 */
export function usePiDisabled(copy: string | null) {
  const { publish } = useContext(PiDisabledCtx);
  useEffect(() => {
    publish(copy);
    return () => publish(null);
  }, [copy, publish]);
}

/** Dock-side reader. `null` when Pi is active on the current surface. */
export function usePiDisabledCopy() {
  return useContext(PiDisabledCtx).copy;
}

// ---------------------------------------------------------------------------
// Ask Pi "dock suppressed" channel — pages that mount their OWN in-canvas
// composer (campaign builder canvas, freeform builder canvas) publish here
// to hide the global AskPiDock, so the user doesn't see two Ask Pi pills
// on the same page. Different from usePiDisabled which shows a muted pill:
// this hides the pill entirely because another Pi entry point IS present.
// ---------------------------------------------------------------------------

type SuppressBus = {
  count: number;
  claim: () => () => void;
};

const PiDockSuppressCtx = createContext<SuppressBus>({
  count: 0,
  claim: () => () => {},
});

/** Wrap once at the app root alongside PiSurfaceProvider + PiDisabledProvider. */
export function PiDockSuppressProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const value = useMemo<SuppressBus>(
    () => ({
      count,
      claim: () => {
        setCount((n) => n + 1);
        return () => setCount((n) => Math.max(0, n - 1));
      },
    }),
    [count],
  );
  return <PiDockSuppressCtx.Provider value={value}>{children}</PiDockSuppressCtx.Provider>;
}

/**
 * Page-level hook: call from any component that mounts its own in-canvas Pi
 * composer to hide the global AskPiDock while that component is mounted.
 * Ref-counted so multiple claimants stack safely and only the last unmount
 * un-suppresses.
 */
export function useSuppressPiDock() {
  const { claim } = useContext(PiDockSuppressCtx);
  useEffect(() => claim(), [claim]);
}

/** Dock-side reader. `true` when any page has claimed suppression. */
export function useIsPiDockSuppressed(): boolean {
  return useContext(PiDockSuppressCtx).count > 0;
}

// ---------------------------------------------------------------------------
// Ask Pi "surface hint" channel — a short one-line label describing what
// the user is CURRENTLY looking at within a surface (usually the active
// tab). Consumed by dedicated chat shells (DeveloperChat, IntegrationsChat)
// so they can display it in the "Answering about" ribbon AND forward it to
// Pi as prefix context on every turn, without any prop drilling.
//
// Not a full context object — deliberately just a display / prompt-injection
// string. If a surface needs richer per-turn context (filter state, selected
// row), it should use PiScreenContextRoot (see pi-screen-context.tsx).
// ---------------------------------------------------------------------------

type HintBus = {
  hint: string | null;
  publish: (h: string | null) => void;
};

const PiSurfaceHintCtx = createContext<HintBus>({ hint: null, publish: () => {} });

/** Wrap once at the app root alongside PiSurfaceProvider / PiDisabledProvider. */
export function PiSurfaceHintProvider({ children }: { children: ReactNode }) {
  const [hint, setHint] = useState<string | null>(null);
  const value = useMemo<HintBus>(() => ({ hint, publish: setHint }), [hint]);
  return <PiSurfaceHintCtx.Provider value={value}>{children}</PiSurfaceHintCtx.Provider>;
}

/**
 * Page-level hook to publish the user's current sub-surface / tab label
 * (e.g. "Release Notes", "API Docs", "Overview"). Pass `null` to clear.
 * Effect re-publishes on change and clears on unmount.
 */
export function usePiSurfaceHint(hint: string | null) {
  const { publish } = useContext(PiSurfaceHintCtx);
  useEffect(() => {
    publish(hint);
    return () => publish(null);
  }, [hint, publish]);
}

/** Chat-shell reader. `null` when no page has published a hint. */
export function usePiSurfaceHintValue() {
  return useContext(PiSurfaceHintCtx).hint;
}

/**
 * Convenience for the dock — takes the toolCalls array from an askPi
 * response and dispatches every entry whose name matches a registered
 * handler. Silently skips unknown names. Returns the count dispatched
 * so callers can decide (e.g. keep the panel open vs close it).
 */
export function dispatchScreenToolCalls(
  surface: SurfaceRegistration | null,
  toolCalls: Array<{ name: string; args: string }>,
): number {
  if (!surface) return 0;
  let n = 0;
  for (const tc of toolCalls) {
    const handler = surface.handlers[tc.name];
    if (!handler) continue;
    let parsed: Record<string, unknown> = {};
    try {
      parsed = tc.args ? (JSON.parse(tc.args) as Record<string, unknown>) : {};
    } catch {
      // Malformed args from the LLM — drop the call rather than crash.
      continue;
    }
    handler(parsed);
    n++;
  }
  return n;
}
