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
 * The bundle a page publishes: its surface id + one handler per tool it
 * supports on that surface.
 */
export type SurfaceRegistration = {
  surfaceId: string;
  handlers: Record<string, ScreenActionHandler>;
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
  // handler functions get recreated (they will, every render).
  const key = reg ? `${reg.surfaceId}|${Object.keys(reg.handlers).sort().join(",")}` : "";

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
    publish({ surfaceId: reg.surfaceId, handlers: proxied });
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
