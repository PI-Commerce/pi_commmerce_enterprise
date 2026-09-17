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
import { SEED_TEMPLATES, type WaTemplate } from "@/lib/waba-templates";
import {
  listWaTemplatesFn,
  saveWaTemplateFn,
  deleteWaTemplateFn,
} from "@/lib/server-fns/wa-templates";

let current: ConnectedWaba | null = DEMO_RESULT;
let templates: WaTemplate[] = SEED_TEMPLATES;
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

/* --------------------------- WhatsApp templates --------------------------- */
//
// Templates live alongside the connection state so the Template Manager, the
// campaign builder's WhatsApp node, and Ask Pi all read the same list. Seeded
// from `SEED_TEMPLATES` and hydrated on top from D1 on first client mount —
// same shape as `agent-store.ts`.

let hydrateTemplatesPromise: Promise<void> | null = null;

function mergeById(seed: WaTemplate[], fromDb: WaTemplate[]): WaTemplate[] {
  const byId = new Map<string, WaTemplate>();
  for (const t of seed) byId.set(t.id, t);
  for (const t of fromDb) byId.set(t.id, t);
  return [...byId.values()];
}

/**
 * Merge D1 WA templates over the seed. Idempotent — first caller kicks off the
 * fetch, subsequent callers await the same promise. No-op on the server.
 */
export function hydrateWaTemplatesFromDb(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (hydrateTemplatesPromise) return hydrateTemplatesPromise;
  hydrateTemplatesPromise = (async () => {
    try {
      const r = await listWaTemplatesFn();
      if (!r.ok) return;
      templates = mergeById(templates, r.templates);
      emit();
    } catch {
      /* silent fallback */
    }
  })();
  return hydrateTemplatesPromise;
}

/** Force a fresh hydrate — ignores the memoized promise. */
export function refreshWaTemplatesFromDb(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  hydrateTemplatesPromise = null;
  return hydrateWaTemplatesFromDb();
}

export function getWaTemplates(): WaTemplate[] {
  return templates;
}

/** Reactive read — hydrates lazily on first client mount. */
export function useWaTemplates(): WaTemplate[] {
  const list = useSyncExternalStore(subscribe, () => templates, () => SEED_TEMPLATES);
  if (typeof window !== "undefined") void hydrateWaTemplatesFromDb();
  return list;
}

/** Upsert one WA template. Optimistic in-memory, background D1 write. */
export function upsertWaTemplate(t: WaTemplate) {
  const i = templates.findIndex((x) => x.id === t.id);
  if (i === -1) templates = [t, ...templates];
  else {
    const next = [...templates];
    next[i] = t;
    templates = next;
  }
  emit();
  if (typeof window !== "undefined") {
    void saveWaTemplateFn({ data: t }).catch(() => {
      /* silent */
    });
  }
}

/** Remove a WA template by id. Optimistic in-memory, background D1 delete. */
export function removeWaTemplate(id: string) {
  templates = templates.filter((t) => t.id !== id);
  emit();
  if (typeof window !== "undefined") {
    void deleteWaTemplateFn({ data: id }).catch(() => {
      /* silent */
    });
  }
}

/** Resolve a WA template by id, or by name as a fallback. */
export function resolveWaTemplate(idOrName?: string): WaTemplate | undefined {
  if (!idOrName) return undefined;
  return templates.find((t) => t.id === idOrName)
    ?? templates.find((t) => t.name === idOrName);
}
