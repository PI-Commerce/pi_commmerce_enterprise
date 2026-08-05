/**
 * API Keys — v1 stub for the Developer surface.
 *
 * API Keys authenticate inbound calls to *our* API. In v1 the surface is
 * table-only (name + prefix + created + last-used) with a create modal that
 * shows the full secret once. Backend never actually authenticates against
 * these — this is a mock read-model, same as the webhook seed.
 */

import { useEffect, useState } from "react";

export type ApiKey = {
  id: string;               // ak_xxxxx
  name: string;
  /** Public prefix that always shows — e.g. `pi_live_a1b2c3`. */
  keyPrefix: string;
  /** Full key — shown once at create time only. Empty string for seed keys
   *  (represents "we no longer have the plaintext, only the prefix is shown"). */
  keyFull: string;
  createdAt: string;        // ISO
  lastUsedAt?: string;      // ISO
  status: "active" | "revoked";
};

function isoDaysAgo(days: number, hour = 10, minute = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
function isoHoursAgo(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() - hours, 0, 0, 0);
  return d.toISOString();
}

export const SEED_API_KEYS: ApiKey[] = [
  {
    id: "ak_prod_ingest",
    name: "Warehouse ingest",
    keyPrefix: "pi_live_wa9k",
    keyFull: "",
    createdAt: isoDaysAgo(120, 11, 15),
    lastUsedAt: isoHoursAgo(3),
    status: "active",
  },
  {
    id: "ak_ops_scripts",
    name: "Ops scripts",
    keyPrefix: "pi_live_op5t",
    keyFull: "",
    createdAt: isoDaysAgo(60, 14, 30),
    lastUsedAt: isoDaysAgo(2, 8),
    status: "active",
  },
  {
    id: "ak_legacy_import",
    name: "Legacy CSV importer",
    keyPrefix: "pi_live_lgc4",
    keyFull: "",
    createdAt: isoDaysAgo(240, 9, 0),
    status: "revoked",
  },
];

/** Generate a fresh API key. Real key would be crypto-random. */
export function generateApiKey(): { prefix: string; full: string } {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const prefix = "pi_live_" + Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  const rest = Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return { prefix, full: `${prefix}_${rest}` };
}

/* --------------------------- store --------------------------- */

let keys: ApiKey[] = [...SEED_API_KEYS];
const listeners = new Set<() => void>();
function notify() { for (const cb of listeners) cb(); }

export function getApiKeys(): ApiKey[] { return keys; }
export function upsertApiKey(next: ApiKey): void {
  const idx = keys.findIndex((k) => k.id === next.id);
  if (idx >= 0) keys = [...keys.slice(0, idx), next, ...keys.slice(idx + 1)];
  else          keys = [next, ...keys];
  notify();
}
export function revokeApiKey(id: string): void {
  keys = keys.map((k) => k.id === id ? { ...k, status: "revoked" } : k);
  notify();
}
export function removeApiKey(id: string): void {
  keys = keys.filter((k) => k.id !== id);
  notify();
}

export function useApiKeys(): ApiKey[] {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, []);
  return keys;
}
