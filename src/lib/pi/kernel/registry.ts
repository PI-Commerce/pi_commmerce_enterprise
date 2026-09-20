/**
 * Ask Pi kernel — surface registry.
 *
 * A surface registers itself here (usually from its `index.ts`). The
 * dispatcher then looks up by id.
 *
 * Registration order is arbitrary — each surface module is a leaf; there
 * are no dependencies between surfaces beyond opt-in shared pools
 * (Phase 3, wired via `SurfaceModule.uses`).
 */
import type { SurfaceModule } from "./types";

const SURFACES = new Map<string, SurfaceModule>();

/** Register a surface. Idempotent — a second call with the same id
 *  overwrites (useful for HMR / tests). */
export function registerSurface(surface: SurfaceModule): void {
  SURFACES.set(surface.id, surface);
}

/** Look up a surface by id. Returns undefined if unregistered. */
export function getSurface(id: string): SurfaceModule | undefined {
  return SURFACES.get(id);
}

/** All registered surface ids (for diagnostic / health-check endpoints). */
export function listSurfaces(): string[] {
  return Array.from(SURFACES.keys()).sort();
}
