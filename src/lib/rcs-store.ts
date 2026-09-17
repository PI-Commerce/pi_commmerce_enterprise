/**
 * Shared RCS channel state — the ops-provisioned brand/bot config plus the RCS
 * template registry.
 *
 * Mirrors {@link file://./sms-store.ts} (module-level store + `useSyncExternalStore`)
 * so the registry survives navigation between the Channels → RCS tabs and the
 * campaign builder, which reads the same templates to populate the RCS node's
 * dropdowns. In-memory only: a hard refresh resets to seed data.
 */
import { useSyncExternalStore } from "react";
import { SEED_RCS_CONFIG, type RcsChannelConfig } from "@/lib/rcs-config";
import { SEED_RCS_TEMPLATES, type RcsTemplate } from "@/lib/rcs-templates";
import {
  listRcsTemplatesFn,
  saveRcsTemplateFn,
  deleteRcsTemplateFn,
} from "@/lib/server-fns/rcs-templates";

// Ops-provisioned and immutable from the panel's point of view.
const config: RcsChannelConfig = SEED_RCS_CONFIG;
let templates: RcsTemplate[] = SEED_RCS_TEMPLATES;

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/* --------------------------- Config --------------------------- */

export function getRcsConfig(): RcsChannelConfig {
  return config;
}

/** Reactive hook for the ops-provisioned RCS configuration. */
export function useRcsConfig(): RcsChannelConfig {
  return useSyncExternalStore(subscribe, () => config, () => SEED_RCS_CONFIG);
}

/* --------------------------- Templates --------------------------- */

export function getRcsTemplates(): RcsTemplate[] {
  return templates;
}

/** Reactive hook for the RCS template registry. */
export function useRcsTemplates(): RcsTemplate[] {
  const list = useSyncExternalStore(subscribe, () => templates, () => SEED_RCS_TEMPLATES);
  if (typeof window !== "undefined") void hydrateRcsTemplatesFromDb();
  return list;
}

/* --------------------------- D1 hydration --------------------------- */

let hydrateTemplatesPromise: Promise<void> | null = null;

function mergeById(seed: RcsTemplate[], fromDb: RcsTemplate[]): RcsTemplate[] {
  const byId = new Map<string, RcsTemplate>();
  for (const t of seed) byId.set(t.id, t);
  // Seed-only fields (title / media / approvalStatus for rich cards) are lost
  // because D1 doesn't carry them, so preserve them by re-layering the seed
  // shape onto the D1 row when the id matches.
  const seedById = new Map(seed.map((t) => [t.id, t] as const));
  for (const t of fromDb) {
    const s = seedById.get(t.id);
    byId.set(t.id, s ? { ...s, ...t, buttons: t.buttons, body: t.body, name: t.name, agentId: t.agentId, type: t.type, createdAt: t.createdAt } : t);
  }
  return [...byId.values()];
}

export function hydrateRcsTemplatesFromDb(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (hydrateTemplatesPromise) return hydrateTemplatesPromise;
  hydrateTemplatesPromise = (async () => {
    try {
      const r = await listRcsTemplatesFn();
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
export function refreshRcsTemplatesFromDb(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  hydrateTemplatesPromise = null;
  return hydrateRcsTemplatesFromDb();
}

/** Add a template, or replace the existing entry with the same id. */
export function upsertRcsTemplate(t: RcsTemplate) {
  const i = templates.findIndex((x) => x.id === t.id);
  if (i === -1) templates = [t, ...templates];
  else {
    const next = [...templates];
    next[i] = t;
    templates = next;
  }
  emit();
  if (typeof window !== "undefined") {
    void saveRcsTemplateFn({ data: t }).catch(() => {
      /* silent */
    });
  }
}

export function removeRcsTemplate(id: string) {
  templates = templates.filter((t) => t.id !== id);
  emit();
  if (typeof window !== "undefined") {
    void deleteRcsTemplateFn({ data: id }).catch(() => {
      /* silent */
    });
  }
}

/** Resolve a template by id, or by name as a fallback. */
export function resolveRcsTemplate(idOrName?: string): RcsTemplate | undefined {
  if (!idOrName) return undefined;
  return templates.find((t) => t.id === idOrName) ?? templates.find((t) => t.name === idOrName);
}
