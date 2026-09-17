/**
 * Shared WhatsApp (WABA) connection state.
 *
 * The connected WABA must survive navigation from Integrations → Channels
 * (`/integrations`) to the full Manage page (`/integrations/whatsapp`). A tiny
 * module-level store exposed through `useSyncExternalStore` keeps both routes in
 * sync without prop-drilling or a context provider.
 *
 * Intentionally in-memory only (no localStorage). Seeded to the DEMO_RESULT so
 * WhatsApp is connected on first load — approved templates, freeform workflows,
 * and hero campaign nodes light up without the reviewer having to run Embedded
 * Signup first. Disconnect + Reconnect still work if the reviewer wants to walk
 * through the signup path live. `getServerSnapshot` returns `null` to stay
 * SSR/hydration-safe.
 */
import { useSyncExternalStore } from "react";
import { DEMO_RESULT, type ConnectedWaba } from "@/lib/waba-onboarding";

let current: ConnectedWaba | null = DEMO_RESULT;
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
