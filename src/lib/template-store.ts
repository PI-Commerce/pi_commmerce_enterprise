/**
 * Shared WhatsApp template state.
 *
 * Templates were previously held in the Template Manager's own `useState`, seeded
 * from `SEED_TEMPLATES`. That made the manager a dead end in two directions: a
 * template you created died when you left the tab, and the campaign builder never
 * saw it at all, because the builder reads the seed array directly. So the one
 * moment you actually need a new template — mid-flow, staring at a picker that
 * doesn't have it — was the one moment you couldn't get one.
 *
 * A template is not a property of the screen that happens to be showing it. It
 * belongs to the WABA, and every surface that names one is naming the same thing:
 * the manager lists them, the node config picks one, `wa-outputs` derives a node's
 * canvas handles from the buttons on one. So it lives in one place and they all
 * read it.
 *
 * Module-level store + `useSyncExternalStore`, matching `waba-store` and
 * `connections`. In-memory only, so a hard refresh replays the demo from seed.
 */
import { useSyncExternalStore } from "react";
import { SEED_TEMPLATES, type WaTemplate } from "./waba-templates";

let current: WaTemplate[] = SEED_TEMPLATES;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive read of every template. */
export function useTemplates(): WaTemplate[] {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

/** Imperative read — for `resolveWaTemplate` and other non-React callers. */
export function getTemplates(): WaTemplate[] {
  return current;
}

/**
 * Upsert by id. New templates go to the front so a just-authored one is the first
 * thing you see in the list you were just looking at.
 */
export function saveTemplate(t: WaTemplate) {
  const i = current.findIndex((x) => x.id === t.id);
  current = i === -1 ? [t, ...current] : current.map((x) => (x.id === t.id ? t : x));
  emit();
}

export function removeTemplate(id: string) {
  current = current.filter((t) => t.id !== id);
  emit();
}
