/**
 * Shared agent records store — makes the Agent Builder actually editable.
 *
 * Seeded lazily from `AGENT_RECORDS` in `agent-data.ts` (agent-data re-exports
 * helpers from this module, so eager import creates a TDZ cycle at module
 * load — the lazy getter dodges it). Any Save from the builder mutates the
 * live map and notifies `useSyncExternalStore` subscribers, so the agents
 * list, campaign resolveAgent, analytics lookups, etc. all pick up the new
 * values without a reload. In-memory only (no localStorage).
 */
import { useSyncExternalStore } from "react";
import type { AgentRecord } from "@/lib/agent-data";
import { AGENT_RECORDS } from "@/lib/agent-data";
import { getTool } from "@/lib/tool-registry";

let store: Record<string, AgentRecord> | null = null;
function db(): Record<string, AgentRecord> {
  if (!store) store = { ...(AGENT_RECORDS ?? {}) };
  return store;
}

const listeners = new Set<() => void>();

function emit() {
  // New object identity so useSyncExternalStore sees the change.
  store = { ...db() };
  for (const l of listeners) l();
}

export function subscribeAgents(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Imperative read — handy outside React (analytics / wa-outputs / etc.). */
export function getAgents(): Record<string, AgentRecord> {
  return db();
}

/** Reactive read — used in list views and builder routes. */
export function useAgents(): Record<string, AgentRecord> {
  return useSyncExternalStore(subscribeAgents, db, db);
}

/** Upsert an agent by id. Merges `patch` into the existing record if any. */
export function saveAgent(
  id: string,
  patch: Partial<AgentRecord> & { id?: string },
): void {
  const map = db();
  const existing = map[id];
  const base: AgentRecord = existing ?? {
    id,
    name: "",
    type: "voice",
    status: "draft",
    tools: [],
    masterPrompt: "",
    knowledgeBase: "",
    postCall: [],
  };
  const next: AgentRecord = { ...base, ...patch, id };
  store = { ...map, [id]: next };
  emit();
}

export function deleteAgent(id: string): void {
  const map = db();
  if (!(id in map)) return;
  const next = { ...map };
  delete next[id];
  store = next;
  emit();
}

/* ---------------- Read helpers (moved from agent-data) ---------------- */

export function getAgentRecord(id: string): AgentRecord | undefined {
  return db()[id];
}

/** Resolve an agent by its id OR its name (the voice node stores the name). */
export function resolveAgent(nameOrId?: string): AgentRecord | undefined {
  if (!nameOrId) return undefined;
  const map = db();
  return map[nameOrId] ?? Object.values(map).find((a) => a.name === nameOrId);
}

export function voiceAgents(): AgentRecord[] {
  return Object.values(db()).filter((a) => a.type === "voice");
}

/** Output variables an agent's tools expose downstream (e.g. `order_lookup.delivered_status`). */
export function agentToolOutputVars(
  nameOrId?: string,
): { key: string; source: string }[] {
  const rec = resolveAgent(nameOrId);
  if (!rec) return [];
  const out: { key: string; source: string }[] = [];
  for (const h of rec.tools) {
    const t = getTool(h);
    if (t)
      for (const o of t.outputs)
        out.push({ key: `${h}.${o.varName}`, source: `@${h}` });
  }
  return out;
}
