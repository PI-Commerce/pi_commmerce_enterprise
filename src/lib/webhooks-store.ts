/**
 * Webhooks store — in-memory, same pattern as sms-store / rcs-store.
 */

import { useEffect, useState } from "react";
import {
  SEED_WEBHOOKS, SEED_DELIVERIES,
  type Webhook, type DeliveryAttempt, type WebhookType,
} from "./webhooks-data";

let webhooks: Webhook[] = [...SEED_WEBHOOKS];
let deliveries: DeliveryAttempt[] = [...SEED_DELIVERIES];
const listeners = new Set<() => void>();

function notify() { for (const cb of listeners) cb(); }

export function getWebhooks(): Webhook[] {
  return webhooks;
}
export function getDeliveries(): DeliveryAttempt[] {
  return deliveries;
}

export function upsertWebhook(next: Webhook): void {
  const idx = webhooks.findIndex((w) => w.id === next.id);
  if (idx >= 0) webhooks = [...webhooks.slice(0, idx), next, ...webhooks.slice(idx + 1)];
  else          webhooks = [next, ...webhooks];
  notify();
}
export function removeWebhook(id: string): void {
  webhooks = webhooks.filter((w) => w.id !== id);
  deliveries = deliveries.filter((d) => d.webhookId !== id);
  notify();
}
export function toggleWebhook(id: string): void {
  webhooks = webhooks.map((w) => w.id === id ? { ...w, status: w.status === "active" ? "paused" : "active" } : w);
  notify();
}
/** Retained for API compatibility with earlier callers. Rotation is no longer
 *  surfaced in the UI on the channel webhooks first cut. */
export function rotateSecret(id: string, nextToken: string): void {
  webhooks = webhooks.map((w) => w.id === id ? { ...w, authToken: nextToken } : w);
  notify();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useWebhooks(): Webhook[] {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  return webhooks;
}
export function useDeliveries(webhookId?: string): DeliveryAttempt[] {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  return webhookId ? deliveries.filter((d) => d.webhookId === webhookId) : deliveries;
}

/** Filter helper — used by the HITL node's multi-select to only offer
 *  webhooks of type `human_escalation`. */
export function webhooksOfType(type: WebhookType): Webhook[] {
  return webhooks.filter((w) => w.type === type);
}
/** Given a set of webhook ids, resolve to full records (drops any that
 *  reference a webhook that has since been deleted). */
export function webhooksById(ids: readonly string[]): Webhook[] {
  const set = new Set(ids);
  return webhooks.filter((w) => set.has(w.id));
}
/** Active-only count of webhooks matching a type — used by the HITL node's
 *  info tooltip when no per-node selection is made. */
export function activeCountForType(type: WebhookType): number {
  return webhooks.filter((w) => w.type === type && w.status === "active").length;
}
