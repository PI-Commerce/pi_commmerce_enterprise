/**
 * Ask Pi kernel — surface dispatcher.
 *
 * The one entry point every server fn calls. Given a surface id and a
 * request, it:
 *   1. Looks up the surface module
 *   2. Assembles context (if the surface has an assembler)
 *   3. Resolves the system prompt (string or fn)
 *   4. Builds a tool executor closure that dispatches to the surface's
 *      colocated handler
 *   5. Picks a transport based on env (Anthropic direct → TFY fallback)
 *   6. Runs the loop
 *   7. Attaches per-surface diagnostic if provided
 *
 * The server fn wrappers (`askPi`, `askPiAnalytics`, …) collapse to a
 * one-liner: `return runSurface(surfaceId, req, env)`.
 */
import type { LoopResult, NormalizedToolDef, SurfaceContext } from "./types";
import { getSurface } from "./registry";
import { runAnthropicLoop } from "./transport/anthropic";
import { runTfyLoop } from "./transport/tfy";

/** Minimal env shape the dispatcher reads. Anything else the surface
 *  handlers need (D1, KV, feature flags) they pull from `getEnv()`
 *  themselves — the dispatcher only cares about which LLM route to
 *  take. */
export type DispatchEnv = {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_WORKSPACE_ID?: string;
  ANTHROPIC_THINKING_BUDGET?: string;
  PI_AGENT_API_KEY?: string;
  PI_AGENT_BASE_URL?: string;
  PI_AGENT_MODEL?: string;
  TFY_API_KEY?: string;
  TFY_BASE_URL?: string;
  TFY_MODEL?: string;
};

export type DispatchRequest = {
  question: string;
  context?: Record<string, unknown>;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

export type DispatchResult = LoopResult & { diag?: unknown };

/** Run one turn through a registered surface. */
export async function runSurface(
  surfaceId: string,
  request: DispatchRequest,
  env: DispatchEnv,
): Promise<DispatchResult> {
  const surface = getSurface(surfaceId);
  if (!surface) {
    return { ok: false, error: `unknown_surface: ${surfaceId}` };
  }

  const ctx: SurfaceContext = {
    surfaceId,
    request: {
      question: request.question,
      context: request.context,
      history: request.history,
    },
    env,
  };

  // Assemble surface-specific context (D1 reads, catalog fetches, etc.).
  // Falls back to the client-supplied context if the assembler throws
  // so a transient DB blip doesn't 500 the whole turn.
  let assembled: Record<string, unknown> | undefined;
  try {
    assembled = surface.assembleContext ? await surface.assembleContext(ctx) : request.context;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[pi.dispatch] assembleContext threw for ${surfaceId}:`, (e as Error).message);
    assembled = request.context;
  }

  // Resolve the system prompt. Fn form lets the prompt vary with the
  // assembled context (e.g. screen-tool addendum keyed on surfaceId).
  const systemContent = typeof surface.systemPrompt === "function"
    ? surface.systemPrompt(ctx)
    : surface.systemPrompt;

  // Merge unconditional tools with any per-request additions from
  // `contextualTools`. Name collisions win to `tools` so a surface can't
  // accidentally shadow its own permanent tools from context.
  const unconditional = surface.tools;
  const contextual = surface.contextualTools ? surface.contextualTools(ctx) : [];
  const seen = new Set(unconditional.map((t) => t.name));
  const allTools = [
    ...unconditional,
    ...contextual.filter((t) => !seen.has(t.name)),
  ];

  // Normalize tool defs — the kernel loop only wants { name, description, parameters }.
  const normalizedTools: NormalizedToolDef[] = allTools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  // Handler map built once per turn; kernel calls this per tool_use block.
  const handlerByName = new Map(allTools.map((t) => [t.name, t.handler]));
  const executor = async (name: string, args: Record<string, unknown>) => {
    const h = handlerByName.get(name);
    if (!h) return { error: `unknown_tool: ${name}` };
    try {
      return await h(args, ctx);
    } catch (e) {
      return { error: `tool_failed: ${(e as Error).message}` };
    }
  };

  // Pick transport. Anthropic direct is prod; TFY is the Paytm-net fallback.
  const loopArgs = {
    systemContent,
    tools: normalizedTools,
    question: request.question,
    history: request.history,
    context: assembled,
    executor,
    config: {
      ...surface.loop,
      // Env override for thinking budget applies to Anthropic path only.
      thinkingBudget: surface.loop?.thinkingBudget
        ?? (env.ANTHROPIC_THINKING_BUDGET ? Number(env.ANTHROPIC_THINKING_BUDGET) : undefined),
    },
  };

  let result: LoopResult;
  if (env.ANTHROPIC_API_KEY) {
    result = await runAnthropicLoop({
      ...loopArgs,
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      workspaceId: env.ANTHROPIC_WORKSPACE_ID,
    });
  } else {
    const tfyKey = env.PI_AGENT_API_KEY || env.TFY_API_KEY;
    const tfyBase = env.PI_AGENT_BASE_URL || env.TFY_BASE_URL;
    if (!tfyKey || !tfyBase) {
      return {
        ok: false,
        error: "LLM gateway not configured — set ANTHROPIC_API_KEY (preferred) or PI_AGENT_API_KEY + PI_AGENT_BASE_URL in .env / wrangler secrets",
      };
    }
    result = await runTfyLoop({
      ...loopArgs,
      apiKey: tfyKey,
      baseUrl: tfyBase,
      model: env.PI_AGENT_MODEL || env.TFY_MODEL || "pi-agentic/global.anthropic.claude-sonnet-4-6",
    });
  }

  // Per-surface diagnostic (opt-in). Only attached to successful responses;
  // errors already have their own error shape.
  if (result.ok && surface.attachDiagnostic) {
    const diag = surface.attachDiagnostic(assembled);
    if (diag !== undefined) return { ...result, diag };
  }
  return result;
}
