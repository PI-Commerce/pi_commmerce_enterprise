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
// Value imports — each surface + pool module self-registers on load via
// top-level `registerSurface` / `registerPool` calls, BUT the TanStack
// Start server-fn bundler DCEs bare `import "…"` side-effect statements
// and tree-shakes re-exports around them. Prod bundles that only saw
// bare imports shipped without any surface registered and every request
// returned `unknown_surface: <scope>`. See the pi-analytics.ts hotfix
// at 2632bd1 for the same pattern.
//
// Importing a real VALUE from each module and touching it inside the
// handler prevents the bundler from proving the module unused. The
// registration side-effect happens as a byproduct of the module load.
// The pools barrel itself is bare-imports of its children, so import
// directly from the leaf files (agents / builder / lists / lists sub-tools).
import { analyticsReadTools } from "@/lib/pi/common/pools/analytics-reads";
import { assetReadTools } from "@/lib/pi/common/pools/asset-reads";
import { agentsSurface } from "@/lib/pi/surfaces/agents";
import { builderSurface } from "@/lib/pi/surfaces/builder";
import { listsSurface } from "@/lib/pi/surfaces/lists";

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

    // Runtime touch to defeat bundler DCE on the surface + pool imports.
    // Without at least one live reference the TanStack Start server-fn
    // bundler drops the module init and the surface / pool registrations
    // never run — the kernel then returns `unknown_surface`. Cheap no-op
    // that the minifier can't eliminate because the array reads have
    // observable-ish side effects behind an `if` guard on a runtime value.
    if (!agentsSurface.id || !builderSurface.id || !listsSurface.id) {
      throw new Error("pi surfaces missing at load — check registrations");
    }
    void analyticsReadTools;
    void assetReadTools;

    const surfaceId = SCOPE_TO_SURFACE[data.scope];
    const r = await runSurface(surfaceId, {
      question: data.question,
      context: data.context,
      history: data.history,
    }, env);
    return r as AskPiResponse;
  });
