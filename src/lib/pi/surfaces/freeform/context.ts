/**
 * Freeform surface — context assembler + diagnostic.
 *
 * Every freeform-scope turn re-injects the current workflow's live graph,
 * canonical freeform rules, allowed node kinds, Meta interactive limits,
 * and the API-tools catalog. Pi never has to guess platform state; the
 * answer is always in `Current context`.
 *
 * The underlying assembler lives in `@/lib/server-fns/freeform-context`
 * (mirrors the shape of `builder-context.ts`). This module adapts it to
 * the SurfaceModule contract: `assembleContext(ctx)` and
 * `attachDiagnostic(assembled)`.
 */
import {
  assembleFreeformContext,
  type FreeformContext,
} from "@/lib/server-fns/freeform-context";
import type { SurfaceContext } from "@/lib/pi/kernel";

/**
 * Diagnostic shape returned alongside successful freeform replies. Not
 * read by Pi — surfaced back to the browser console so we can distinguish
 * "no D1 binding" from "workflow read threw an error" from "tools table
 * empty". Shape mirrors the builder's `BuilderDiag` for a familiar
 * client-side logger.
 */
export type FreeformDiag = {
  hasDb: boolean;
  workflowLoaded: boolean;
  nodes: number;
  edges: number;
  tools: number;
  errors: {
    workflowErr?: string;
    toolsErr?: string;
  };
  assembleErr?: string;
};

/** SurfaceModule.assembleContext implementation. Pulls the workflowId
 *  off the client-supplied context.workflowId and defers to the shared
 *  assembler. Returns the full FreeformContext merged with any other
 *  fields the client sent (e.g. `surface: "Freeform canvas"`, `hint`). */
export async function assembleFreeformSurfaceContext(
  ctx: SurfaceContext,
): Promise<Record<string, unknown>> {
  const clientCtx = (ctx.request.context ?? {}) as Record<string, unknown>;
  const workflowId = typeof clientCtx.workflowId === "string"
    ? (clientCtx.workflowId as string)
    : undefined;
  try {
    const freeformCtx = await assembleFreeformContext(workflowId);
    return { ...clientCtx, ...(freeformCtx as unknown as Record<string, unknown>) };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[freeform-context] assemble failed:", (e as Error).message);
    return { ...clientCtx, _assembleErr: (e as Error).message };
  }
}

/** SurfaceModule.attachDiagnostic implementation. Reads the counts +
 *  errors off the assembled context and shapes them into the FreeformDiag
 *  payload the client expects on the response. */
export function attachFreeformDiagnostic(
  assembled: Record<string, unknown> | undefined,
): FreeformDiag | undefined {
  if (!assembled) return undefined;

  const assembleErr = assembled._assembleErr as string | undefined;
  const freeformCtx = assembled as unknown as Partial<FreeformContext>;

  if (assembleErr || !freeformCtx._diag) {
    return {
      hasDb: false,
      workflowLoaded: false,
      nodes: 0,
      edges: 0,
      tools: 0,
      errors: {},
      ...(assembleErr ? { assembleErr } : {}),
    };
  }

  const diag = freeformCtx._diag;
  return {
    hasDb: diag.hasDb,
    workflowLoaded: !!freeformCtx.workflow,
    nodes: freeformCtx.dsl?.nodes.length ?? 0,
    edges: freeformCtx.dsl?.edges.length ?? 0,
    tools: freeformCtx.assets?.tools.length ?? 0,
    errors: {
      workflowErr: diag.workflowErr,
      toolsErr: diag.toolsErr,
    },
  };
}
