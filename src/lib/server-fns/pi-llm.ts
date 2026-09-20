/**
 * Ask Pi LLM entry point — the `askPi` server fn.
 *
 * Thin dispatcher on top of the kernel. Maps the client-facing scope
 * string to a registered surface module and delegates. All the product
 * logic (tools, prompts, context assemblers, diagnostics) lives in
 * `pi/surfaces/*` — this file is the wire boundary and nothing more.
 *
 *   scope: "builder"   -> pi/surfaces/builder/
 *   scope: "agents"    -> pi/surfaces/agents/
 *   scope: "analytics" -> pi/surfaces/lists/    (list-table + screen-tool surfaces)
 *
 * The `/analytics` dashboard chat uses a separate server fn
 * (`askPiAnalytics` in `pi-analytics.ts`) which routes to
 * `pi/surfaces/analytics/` because that surface returns a typed
 * structured response instead of free text.
 *
 * Server-only. Accessed via `askPi()` from the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { getEnv } from "@/lib/db/client";
import { runSurface } from "@/lib/pi/kernel";
// Side-effect imports — pools register FIRST so surfaces that opt into
// them via `uses:` see them at dispatch time. Registry is idempotent
// so import order between surfaces themselves doesn't matter.
import "@/lib/pi/common/pools";
import "@/lib/pi/surfaces/agents";
import "@/lib/pi/surfaces/builder";
import "@/lib/pi/surfaces/lists";

export type AskPiScope = "analytics" | "builder" | "agents";

export type AskPiRequest = {
  scope: AskPiScope;
  question: string;
  /** Free-form context bag the client publishes with each turn.
   *   - builder scope carries `campaignId`
   *   - lists scope (via `scope: "analytics"`) carries `surfaceId`,
   *     current filter state, optional selected row ids
   *   - agents scope currently unused; carries nothing */
  context?: Record<string, unknown>;
  /** Optional conversation state (multi-turn). */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

/** Legacy diagnostic shape emitted alongside builder-scope replies.
 *  Owned by the builder surface (see `pi/surfaces/builder/context.ts`);
 *  re-declared here as the response contract so external callers can
 *  type-narrow without importing surface internals. */
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

export type AskPiResponse =
  | { ok: true; answer: string; toolCalls: ToolCallLog[]; diag?: BuilderDiag }
  | { ok: false; error: string };

type ToolCallLog = { name: string; args: string; result: string };

/** Client-facing scope string → registered surface id.
 *  Kept as an internal map (not exported) so scope names remain the
 *  public API even if surface ids diverge later. */
const SCOPE_TO_SURFACE: Record<AskPiScope, string> = {
  builder: "builder",
  agents: "agents",
  // The client-facing "analytics" scope maps to the "lists" surface —
  // the free-text list-controls path. The dedicated /analytics
  // dashboard uses its own server fn (askPiAnalytics), not this one.
  analytics: "lists",
};

/**
 * Live Ask Pi call. Every scope routes through the kernel dispatcher;
 * this file is a wire boundary that resolves the scope to a surface,
 * pulls the runtime env, and forwards.
 */
export const askPi = createServerFn({ method: "POST" })
  .inputValidator((r: AskPiRequest) => r)
  .handler(async ({ data }): Promise<AskPiResponse> => {
    let env;
    try {
      env = getEnv();
    } catch (e) {
      return { ok: false, error: `runtime_env_missing: ${(e as Error).message}` };
    }

    const surfaceId = SCOPE_TO_SURFACE[data.scope];
    const r = await runSurface(surfaceId, {
      question: data.question,
      context: data.context,
      history: data.history,
    }, env);
    return r as AskPiResponse;
  });
