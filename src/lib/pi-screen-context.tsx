/**
 * Pi Screen Context bus.
 *
 * The AskPiDock is mounted at the AppShell level, but the analytics page owns
 * the live filter state (campaign / run / channel / date range / tab / selected
 * node). This provider lets the page publish that state so the dock can pipe
 * it into Ask Pi as `screen context` on every turn — no prop drilling, no
 * global store.
 *
 * Any page can opt into publishing context by wrapping its content in
 * `<PiScreenContextProvider value={ctx}>`. Pages that don't set it fall back
 * to `null` and Pi defaults to workspace-wide.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { AnalyticsScreenContext } from "@/lib/server-fns/pi-analytics";

type Ctx = {
  screen: AnalyticsScreenContext | null;
  setScreen: (c: AnalyticsScreenContext | null) => void;
};

const PiScreenCtx = createContext<Ctx>({ screen: null, setScreen: () => {} });

/** Wrap once at the AppShell / root so any page can publish + any consumer can read. */
export function PiScreenContextRoot({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<AnalyticsScreenContext | null>(null);
  const value = useMemo(() => ({ screen, setScreen }), [screen]);
  return <PiScreenCtx.Provider value={value}>{children}</PiScreenCtx.Provider>;
}

/** Read the current screen context. Returns null if no page has published one. */
export function usePiScreenContext(): AnalyticsScreenContext | null {
  return useContext(PiScreenCtx).screen;
}

/** Page-level hook. Call with the assembled context whenever it changes. */
export function usePublishScreenContext(ctx: AnalyticsScreenContext | null) {
  const { setScreen } = useContext(PiScreenCtx);
  // Publish on every render — cheap object identity check inside the provider
  // would add complexity for no real win at this scale.
  useMemoPublish(ctx, setScreen);
}

// Small helper that keeps publish in a useEffect so it doesn't happen during render.
import { useEffect } from "react";
function useMemoPublish(
  ctx: AnalyticsScreenContext | null,
  setScreen: (c: AnalyticsScreenContext | null) => void,
) {
  const key = JSON.stringify(ctx);
  useEffect(() => {
    setScreen(ctx);
    return () => setScreen(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
