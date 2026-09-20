/**
 * Ask Pi kernel — shared-pool registry.
 *
 * A "pool" is a named bundle of SurfaceTools that any surface can opt
 * into via `SurfaceModule.uses = ["pool-a", "pool-b"]`. Purpose: stop
 * duplicating the same tool exports across surface manifests (the
 * classic case: five analytics-read tools that every surface wants),
 * and make cross-surface capability spread visible + declarative.
 *
 * Pools are registered on import — each `pi/common/pools/<name>/index.ts`
 * calls `registerPool(id, tools)` at module load. The dispatch layer
 * resolves `surface.uses` -> pool tools at request time, so
 * hot-swapping a pool during dev picks up automatically.
 *
 * Name collisions: when a surface's own tools OR contextualTools share
 * a name with a pool tool, the surface wins. See dispatch.ts for the
 * merge precedence.
 */
import type { SurfaceTool } from "./types";

const POOLS = new Map<string, SurfaceTool[]>();

/** Register a pool. Idempotent — a second call with the same id
 *  replaces (useful for HMR / tests). */
export function registerPool(id: string, tools: SurfaceTool[]): void {
  POOLS.set(id, tools);
}

/** Resolve the tools for a set of pool ids. Unknown ids yield []
 *  (dispatch logs the miss so a typo doesn't fail silently). */
export function resolvePools(ids: string[] | undefined): SurfaceTool[] {
  if (!ids || ids.length === 0) return [];
  const out: SurfaceTool[] = [];
  for (const id of ids) {
    const pool = POOLS.get(id);
    if (!pool) {
      // eslint-disable-next-line no-console
      console.warn(`[pi.pool] unknown pool referenced by uses:`, id);
      continue;
    }
    out.push(...pool);
  }
  return out;
}

/** Every registered pool id — for diagnostics + health-check endpoints. */
export function listPools(): string[] {
  return Array.from(POOLS.keys()).sort();
}
