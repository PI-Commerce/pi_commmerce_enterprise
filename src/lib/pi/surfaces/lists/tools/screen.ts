/**
 * Lists surface — screen-tool adapter.
 *
 * The screen-tool registry lives in `@/lib/server-fns/pi-screen-tools`
 * (predates this refactor) and exposes tools in OpenAI shape plus a
 * single `executeScreenTool(name, args, surfaceId)` executor.
 *
 * This module wraps them as `SurfaceTool[]` filtered by the client-
 * published `surfaceId` so the kernel's contextualTools hook can hand
 * Pi ONLY the screen tools that make sense on the current page.
 *
 * Not moved into the surface folder because the underlying tool defs
 * are still consumed by the executor + `SURFACE_SCREEN_TOOLS` map that
 * the client relies on. Once the client dispatcher migrates too, this
 * whole adapter collapses.
 */
import {
  screenToolsForSurface,
  executeScreenTool,
} from "@/lib/server-fns/pi-screen-tools";
import type { SurfaceTool, SurfaceContext } from "@/lib/pi/kernel";

/** Build the surface-scoped screen tool list for a request. Called by
 *  the lists surface's `contextualTools`. Returns [] when no surfaceId
 *  is present or when the surface has no registered screen tools. */
export function screenToolsForContext(ctx: SurfaceContext): SurfaceTool[] {
  const raw = ctx.request.context?.surfaceId;
  const surfaceId = typeof raw === "string" ? raw : undefined;
  const defs = screenToolsForSurface(surfaceId);
  return defs.map((def) => ({
    name: def.function.name,
    description: def.function.description,
    parameters: def.function.parameters,
    handler: async (args) => await executeScreenTool(def.function.name, args, surfaceId),
  }));
}
