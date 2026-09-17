/**
 * Analytics filter state — stateful, URL-backed, shared across every widget
 * on the Analytics page. Widgets read the same filter object and re-fetch
 * their D1-backed data whenever any field changes, so the page reflows
 * coherently on every filter tweak.
 */
import { useSyncExternalStore } from "react";
import type { AnalyticsFilter } from "@/lib/server-fns/analytics";

const STORAGE_KEY = "picom.analytics.filter";

let current: AnalyticsFilter = load();

const listeners = new Set<() => void>();
function emit() {
  current = { ...current };
  persist();
  for (const l of listeners) l();
}
function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }

function load(): AnalyticsFilter {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultRange();
    return { ...defaultRange(), ...(JSON.parse(raw) as AnalyticsFilter) };
  } catch { return defaultRange(); }
}

function persist() {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* ignore */ }
}

function defaultRange(): AnalyticsFilter {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

/** Read the current filter reactively. */
export function useAnalyticsFilter(): AnalyticsFilter {
  return useSyncExternalStore(subscribe, () => current, () => ({} as AnalyticsFilter));
}

/** Imperative read (outside React). */
export function getAnalyticsFilter(): AnalyticsFilter {
  return current;
}

/** Merge a patch into the filter. Pass `undefined` for a field to clear it. */
export function setAnalyticsFilter(patch: Partial<AnalyticsFilter>): void {
  const next: AnalyticsFilter = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete (next as Record<string, unknown>)[k];
    else (next as Record<string, unknown>)[k] = v;
  }
  current = next;
  emit();
}

/** Restore defaults (last 7 days, no other filters). */
export function resetAnalyticsFilter(): void {
  current = defaultRange();
  emit();
}
