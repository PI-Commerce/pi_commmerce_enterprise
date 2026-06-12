/**
 * Shared WhatsApp (WABA) connection state.
 *
 * The connected WABA must survive navigation from Integrations → Channels
 * (`/integrations`) to the full Manage page (`/integrations/whatsapp`). A tiny
 * module-level store exposed through `useSyncExternalStore` keeps both routes in
 * sync without prop-drilling or a context provider.
 *
 * Intentionally in-memory only (no localStorage): a hard refresh resets the demo
 * to the not-connected state, so the full Embedded Signup can be replayed live.
 * `getServerSnapshot` returns `null` to stay SSR/hydration-safe.
 */
import { useSyncExternalStore } from "react";
import type { ConnectedWaba } from "@/lib/waba-onboarding";

let current: ConnectedWaba | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Set (or clear) the connected WABA and notify subscribers. */
export function setWabaConnection(next: ConnectedWaba | null) {
  current = next;
  emit();
}

/** Imperative read — handy outside React. */
export function getWabaConnection() {
  return current;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive hook: returns the connected WABA, or `null` when disconnected. */
export function useWabaConnection(): ConnectedWaba | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
