/**
 * Shared SMS channel state — the ops-provisioned config plus the mirrored DLT
 * template registry.
 *
 * Mirrors the {@link file://./waba-store.ts} pattern (module-level store +
 * `useSyncExternalStore`) so the registry survives navigation between the
 * Channels → SMS tabs and the campaign builder, which reads the same templates
 * to populate the SMS node's dropdowns.
 *
 * Two deliberate differences from the WABA store:
 *  - the config is never null. SMS provisioning happens in the backend, so from
 *    the panel's point of view the channel is always configured — there is no
 *    disconnected state to model.
 *  - templates live here rather than in component state, because the campaign
 *    builder needs them outside the Channels route.
 *
 * In-memory only (no localStorage): a hard refresh resets to seed data.
 */
import { useSyncExternalStore } from "react";
import { SEED_SMS_CONFIG, type SmsChannelConfig } from "@/lib/sms-config";
import { SEED_SMS_TEMPLATES, type SmsTemplate } from "@/lib/sms-templates";

// Ops-provisioned and immutable from the panel's point of view — the dashboard
// only ever reads it (see sms-config.ts).
const config: SmsChannelConfig = SEED_SMS_CONFIG;
let templates: SmsTemplate[] = SEED_SMS_TEMPLATES;

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/* --------------------------- Config --------------------------- */

/** Imperative read — handy outside React. */
export function getSmsConfig(): SmsChannelConfig {
  return config;
}

/** Reactive hook for the ops-provisioned SMS configuration. */
export function useSmsConfig(): SmsChannelConfig {
  return useSyncExternalStore(subscribe, () => config, () => SEED_SMS_CONFIG);
}

/* --------------------------- Templates --------------------------- */

export function getSmsTemplates(): SmsTemplate[] {
  return templates;
}

/** Reactive hook for the mirrored DLT template registry. */
export function useSmsTemplates(): SmsTemplate[] {
  return useSyncExternalStore(subscribe, () => templates, () => SEED_SMS_TEMPLATES);
}

/** Add a template, or replace the existing entry with the same DLT Template ID. */
export function upsertSmsTemplate(t: SmsTemplate) {
  const i = templates.findIndex((x) => x.id === t.id);
  if (i === -1) templates = [t, ...templates];
  else {
    const next = [...templates];
    next[i] = t;
    templates = next;
  }
  emit();
}

/** Add many at once (bulk upload). Existing IDs are replaced, new ones prepended. */
export function addSmsTemplates(added: SmsTemplate[]) {
  if (added.length === 0) return;
  const byId = new Map(templates.map((t) => [t.id, t]));
  const fresh: SmsTemplate[] = [];
  for (const t of added) {
    if (byId.has(t.id)) byId.set(t.id, t);
    else fresh.push(t);
  }
  templates = [...fresh, ...templates.map((t) => byId.get(t.id) ?? t)];
  emit();
}

export function removeSmsTemplate(id: string) {
  templates = templates.filter((t) => t.id !== id);
  emit();
}

/** Resolve a template by DLT Template ID, or by name as a fallback. */
export function resolveSmsTemplate(idOrName?: string): SmsTemplate | undefined {
  if (!idOrName) return undefined;
  return templates.find((t) => t.id === idOrName) ?? templates.find((t) => t.name === idOrName);
}
