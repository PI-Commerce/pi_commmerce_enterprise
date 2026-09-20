/**
 * Ask Pi kernel — public entry point.
 *
 * Everything downstream of a "surface" imports from here. Nothing else
 * in the kernel is meant to be imported directly.
 *
 *   import { runAnthropicLoop, runTfyLoop } from "@/lib/pi/kernel";
 *   import type { LoopRequest, LoopResult, NormalizedToolDef } from "@/lib/pi/kernel";
 */
export type {
  ToolCallLog,
  NormalizedToolDef,
  ToolExecutor,
  LoopConfig,
  LoopRequest,
  LoopResult,
  SurfaceContext,
  SurfaceTool,
  SurfaceModule,
} from "./types";
export { KERNEL_DEFAULTS } from "./types";

export { runAnthropicLoop } from "./transport/anthropic";
export type { AnthropicLoopInput } from "./transport/anthropic";

export { runTfyLoop } from "./transport/tfy";
export type { TfyLoopInput } from "./transport/tfy";

export { runSurface } from "./dispatch";
export { registerSurface, getSurface, listSurfaces } from "./registry";
export { registerPool, resolvePools, listPools } from "./pool-registry";
