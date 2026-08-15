/**
 * Shared Meta Ads + WhatsApp connection state for the CTWA Ads Manager.
 *
 * Same shape and lifetime as {@link file://./waba-store.ts}: a module-level
 * store read through `useSyncExternalStore`, so the connection survives
 * navigation between the Ads Manager tabs and the campaign builder (the
 * `adsCampaign` node needs to know whether an ad account is linked at all).
 *
 * In-memory only, and `getServerSnapshot` returns `null`, so a hard refresh
 * drops back to the not-connected state and the mock OAuth handshake can be
 * replayed live.
 *
 * BACKEND: replace the setter's caller with the Meta OAuth callback; the shape
 * read by the UI does not change.
 */
import { useSyncExternalStore } from "react";
import type { AdAccountConnection } from "@/lib/ctwa-types";

let current: AdAccountConnection | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Set (or clear) the linked ad account and notify subscribers. */
export function setAdConnection(next: AdAccountConnection | null) {
  current = next;
  emit();
}

/** Imperative read — handy outside React. */
export function getAdConnection(): AdAccountConnection | null {
  return current;
}

/** Reactive hook: the linked Meta + WABA assets, or `null` when disconnected. */
export function useAdConnection(): AdAccountConnection | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
