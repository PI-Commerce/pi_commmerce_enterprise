/**
 * Shared agent records store — makes the Agent Builder actually editable.
 *
 * Seeded lazily from `AGENT_RECORDS` in `agent-data.ts` (agent-data re-exports
 * helpers from this module, so eager import creates a TDZ cycle at module
 * load — the lazy getter dodges it). Any Save from the builder mutates the
 * live map and notifies `useSyncExternalStore` subscribers, so the agents
 * list, campaign resolveAgent, analytics lookups, etc. all pick up the new
 * values without a reload.
 *
 * D1 persistence lives on top of the in-memory map:
 *   - {@link hydrateAgentsFromDb} is called client-side once on first Agents-
 *     surface mount. It reads the D1 rows and merges them over the seed so
 *     any earlier saves survive a refresh.
 *   - {@link saveAgent} writes the change through to D1 in the background
 *     via the `saveAgentFn` server function. The UI stays optimistic — the
 *     in-memory map updates immediately regardless of the D1 round-trip.
 *
 * Both paths degrade gracefully: if D1 isn't bound (prod pre-provisioning),
 * the store keeps behaving exactly like it did before Phase 3.
 */
import { useSyncExternalStore } from "react";
import type { AgentRecord } from "@/lib/agent-data";
import { AGENT_RECORDS } from "@/lib/agent-data";
import { getTool } from "@/lib/tool-registry";
import { listAgentsFn, saveAgentFn, deleteAgentFn } from "@/lib/server-fns/agents";

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

// Hydration state — kicked off once per client. On success, D1 rows replace
// the seed values for that id; agents present only in the seed stay in the
// map (so the demo works even against an empty D1).
let hydratePromise: Promise<void> | null = null;

/**
 * Merge D1 agents over the seed. Idempotent — first caller kicks off the
 * fetch, subsequent callers await the same promise. Safe to call on every
 * mount; only the first triggers work.
 *
 * No-op server-side (would re-enter the server fn which needs the runtime
 * env). Client-only guard keeps SSR quiet.
 */
export function hydrateAgentsFromDb(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const r = await listAgentsFn();
      if (!r.ok) return;
      const map = db();
      const merged: Record<string, AgentRecord> = { ...map, ...r.agents };
      store = merged;
      for (const l of listeners) l();
    } catch {
      // Silent fallback — the store still works from AGENT_RECORDS.
    }
  })();
  return hydratePromise;
}

/**
 * Force a fresh hydrate — called from Ask Pi's agents-scope handler after a
 * `save_agent` tool call so the UI reflects Pi's edit without a refresh.
 * Unlike `hydrateAgentsFromDb` this ignores the memoized promise.
 */
export function refreshAgentsFromDb(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  hydratePromise = null;
  return hydrateAgentsFromDb();
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

/**
 * Reactive read — used in list views and builder routes. Kicks off a
 * one-time D1 hydration on first client mount so refreshes reflect any
 * earlier Save. Subsequent calls are free (the promise memoizes).
 */
export function useAgents(): Record<string, AgentRecord> {
  const map = useSyncExternalStore(subscribeAgents, db, db);
  if (typeof window !== "undefined") void hydrateAgentsFromDb();
  return map;
}

/**
 * Upsert an agent by id. Merges `patch` into the existing record if any,
 * pushes the change into the reactive in-memory map immediately, then
 * fires a background D1 write so the change survives refresh.
 *
 * The D1 write is fire-and-forget: the UI never blocks on it, and any
 * failure is silent (the in-memory update already happened). This matches
 * the "optimistic + always render" feel the builder had before.
 */
export function saveAgent(
  id: string,
  patch: Partial<AgentRecord> & { id?: string },
  opts?: {
    /**
     * Skip the background D1 write. Used by the Ask Pi "optimistic shell"
     * flow: the dock inserts an empty draft locally and navigates the user
     * into the builder while Pi drafts server-side. Pi's own save_agent
     * tool call is the authoritative write; if we also fired a client
     * write for the shell, it could race the real one and clobber content.
     */
    skipRemote?: boolean;
  },
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
  if (opts?.skipRemote) return;
  // Background persist. Only from the client — server callers (campaign
  // resolvers) don't have a Save button so they wouldn't call this anyway.
  if (typeof window !== "undefined") {
    void saveAgentFn({ data: next }).catch(() => {
      // Silent — in-memory update already succeeded.
    });
  }
}

export function deleteAgent(id: string): void {
  const map = db();
  if (!(id in map)) return;
  const next = { ...map };
  delete next[id];
  store = next;
  emit();
  if (typeof window !== "undefined") {
    void deleteAgentFn({ data: id }).catch(() => {
      /* silent */
    });
  }
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
