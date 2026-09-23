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
  return useSyncExternalStore(subscribe, () => templates, () => SEED_RCS_TEMPLATES);
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
}

export function removeRcsTemplate(id: string) {
  templates = templates.filter((t) => t.id !== id);
  emit();
}

/** Resolve a template by id, or by name as a fallback. */
export function resolveRcsTemplate(idOrName?: string): RcsTemplate | undefined {
  if (!idOrName) return undefined;
  return templates.find((t) => t.id === idOrName) ?? templates.find((t) => t.name === idOrName);
}
