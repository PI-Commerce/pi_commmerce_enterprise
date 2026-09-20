/**
 * Builder surface — context assembler + diagnostic.
 *
 * Every builder-scope turn re-injects the current campaign's live DSL,
 * canonical construct rules, node registry (limited to allowed kinds),
 * skill catalog index, and the real workspace asset catalogs. Pi never
 * has to guess platform state; the answer is always in `Current context`.
 *
 * The underlying assembler lives in `@/lib/server-fns/builder-context`
 * (predates this refactor). This module adapts it to the SurfaceModule
 * contract: `assembleContext(ctx)` and `attachDiagnostic(assembled)`.
 */
import {
  assembleBuilderContext,
  type BuilderContext,
} from "@/lib/server-fns/builder-context";
import type { SurfaceContext } from "@/lib/pi/kernel";

/** Diagnostic shape returned alongside successful builder replies. Not
 *  read by Pi — surfaced back to the browser console so we can distinguish
 *  "no D1 binding" from "table is empty" from "read threw an error".
 *  Legacy shape; kept identical to what the old pi-llm.ts emitted so
 *  client-side logs / dashboards don't need to update. */
export type BuilderDiag = {
  hasDb: boolean;
  voiceAgents: number;
  waTemplates: number;
  freeformWorkflows: number;
  smsTemplates: number;
  rcsTemplates: number;
  tools: number;
  errors: {
    voiceAgentsErr?: string;
    waTemplatesErr?: string;
    freeformWorkflowsErr?: string;
    smsTemplatesErr?: string;
    rcsTemplatesErr?: string;
    toolsErr?: string;
  };
  assembleErr?: string;
};

/** SurfaceModule.assembleContext implementation. Pulls the campaignId
 *  off the client-supplied context.campaignId and defers to the shared
 *  assembler. Returns the full BuilderContext merged with any other
 *  fields the client sent (e.g. `surface: "Campaign canvas"`, `hint`). */
export async function assembleBuilderSurfaceContext(
  ctx: SurfaceContext,
): Promise<Record<string, unknown>> {
  const clientCtx = (ctx.request.context ?? {}) as Record<string, unknown>;
  const campaignId = typeof clientCtx.campaignId === "string"
    ? (clientCtx.campaignId as string)
    : undefined;
  try {
    const builderCtx = await assembleBuilderContext(campaignId);
    // Merge client-supplied fields FIRST, then let the assembled context
    // override — the assembled shape is authoritative on the fields it
    // owns (dsl, validity, assets, rules, nodeKinds, skillCatalog).
    return { ...clientCtx, ...(builderCtx as unknown as Record<string, unknown>) };
  } catch (e) {
    // Preserve client context so Pi has SOMETHING to work with; the
    // diag hook below will note the failure.
    // eslint-disable-next-line no-console
    console.warn("[builder-context] assemble failed:", (e as Error).message);
    return { ...clientCtx, _assembleErr: (e as Error).message };
  }
}

/** SurfaceModule.attachDiagnostic implementation. Reads the counts +
 *  errors off the assembled context and shapes them into the legacy
 *  BuilderDiag payload the client expects on the response. */
export function attachBuilderDiagnostic(
  assembled: Record<string, unknown> | undefined,
): BuilderDiag | undefined {
  if (!assembled) return undefined;

  // If assembleContext threw and only client fields survived, emit the
  // "everything empty" diagnostic with the error stash. Client renders
  // this as "no D1 bound / read failed" hints.
  const assembleErr = assembled._assembleErr as string | undefined;
  const builderCtx = assembled as unknown as Partial<BuilderContext>;

  if (assembleErr || !builderCtx._diag) {
    return {
      hasDb: false,
      voiceAgents: 0,
      waTemplates: 0,
      freeformWorkflows: 0,
      smsTemplates: 0,
      rcsTemplates: 0,
      tools: 0,
      errors: {},
      ...(assembleErr ? { assembleErr } : {}),
    };
  }

  const diag = builderCtx._diag;
  const assets = builderCtx.assets;
  return {
    hasDb: diag.hasDb,
    voiceAgents: assets?.voiceAgents.length ?? 0,
    waTemplates: assets?.waTemplates.length ?? 0,
    freeformWorkflows: assets?.freeformWorkflows.length ?? 0,
    smsTemplates: assets?.smsTemplates.length ?? 0,
    rcsTemplates: assets?.rcsTemplates.length ?? 0,
    tools: assets?.tools.length ?? 0,
    errors: {
      voiceAgentsErr: diag.voiceAgentsErr,
      waTemplatesErr: diag.waTemplatesErr,
      freeformWorkflowsErr: diag.freeformWorkflowsErr,
      smsTemplatesErr: diag.smsTemplatesErr,
      rcsTemplatesErr: diag.rcsTemplatesErr,
      toolsErr: diag.toolsErr,
    },
  };
}
