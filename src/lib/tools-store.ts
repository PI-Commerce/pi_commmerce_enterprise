/**
 * Shared tool registry store — mirrors {@link ./agent-store.ts}.
 *
 * The Tools page + Voice Agent tool picker read the same list; keeping it in a
 * `useSyncExternalStore` module means edits from the tool editor land on every
 * surface immediately without prop-drilling. Seeded eagerly from `TOOLS` and
 * hydrated on top from D1 on first client mount.
 *
 * D1 persistence layers on top of the in-memory list:
 *   - {@link hydrateToolsFromDb} is called client-side once on first tools
 *     surface mount. It reads D1 rows and merges them over the seed so any
 *     earlier saves survive a refresh.
 *   - {@link upsertTool} writes the change through to D1 in the background via
 *     the `saveToolFn` server function.
 *
 * Every D1 path degrades gracefully — if D1 isn't bound (prod pre-provisioning),
 * the store behaves exactly like a plain seed list.
 */
import { useSyncExternalStore } from "react";
import { TOOLS, type ToolDef } from "@/lib/tool-registry";
import {
  listToolsFn, saveToolFn, deleteToolFn, hydrateWireTools,
  type WireToolDef,
} from "@/lib/server-fns/tools";

// Mirror of `fromWire` — the wire type serialises `mockResponse.body` as a
// JSON string. We only need the write direction here.
function toWire(t: ToolDef): WireToolDef {
  const { mockResponse, ...rest } = t;
  return mockResponse
    ? { ...rest, mockResponse: { ...mockResponse, body: JSON.stringify(mockResponse.body) } }
    : rest;
}

let tools: ToolDef[] = [...TOOLS];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let hydratePromise: Promise<void> | null = null;

function mergeByHandle(seed: ToolDef[], fromDb: ToolDef[]): ToolDef[] {
  const byHandle = new Map<string, ToolDef>();
  for (const t of seed) byHandle.set(t.handle, t);
  for (const t of fromDb) byHandle.set(t.handle, t);
  return [...byHandle.values()];
}

/**
 * Merge D1 tools over the seed. Idempotent — first caller kicks off the fetch,
 * subsequent callers await the same promise. No-op on the server.
 */
export function hydrateToolsFromDb(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const r = await listToolsFn();
      if (!r.ok) return;
      tools = mergeByHandle(tools, hydrateWireTools(r.tools));
      emit();
    } catch {
      /* silent fallback */
    }
  })();
  return hydratePromise;
}

/** Force a fresh hydrate — ignores the memoized promise. */
export function refreshToolsFromDb(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  hydratePromise = null;
  return hydrateToolsFromDb();
}

/** Imperative read — handy outside React. */
export function getTools(): ToolDef[] {
  return tools;
}

/** Reactive read — hydrates lazily on first client mount. */
export function useTools(): ToolDef[] {
  const list = useSyncExternalStore(subscribe, () => tools, () => TOOLS);
  if (typeof window !== "undefined") void hydrateToolsFromDb();
  return list;
}

/** Upsert a tool. Optimistic in-memory, background D1 write. */
export function upsertTool(t: ToolDef) {
  const i = tools.findIndex((x) => x.handle === t.handle);
  if (i === -1) tools = [t, ...tools];
  else {
    const next = [...tools];
    next[i] = t;
    tools = next;
  }
  emit();
  if (typeof window !== "undefined") {
    void saveToolFn({ data: toWire(t) }).catch(() => {
      /* silent */
    });
  }
}

/** Remove a tool by handle. */
export function removeTool(handle: string) {
  tools = tools.filter((t) => t.handle !== handle);
  emit();
  if (typeof window !== "undefined") {
    void deleteToolFn({ data: handle }).catch(() => {
      /* silent */
    });
  }
}

/** Resolve a tool by handle — mirrors `getTool` from tool-registry. */
export function getToolByHandle(handle: string): ToolDef | undefined {
  return tools.find((t) => t.handle === handle);
}
