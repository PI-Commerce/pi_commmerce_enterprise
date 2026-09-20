/**
 * Ask Pi — /analytics dashboard server fns.
 *
 * Two public server fns:
 *   - `askPiAnalytics`      — the multi-round chat loop (routes through
 *                             `pi/surfaces/analytics/` via the kernel).
 *                             Structured response: terminates on
 *                             `emit_answer` and returns AnalyticsAnswer.
 *   - `generateStarterChips` — one-shot, no tool loop. Kept inline here
 *                              because it doesn't need any loop machinery.
 *
 * The surface itself (tools, prompt, D1 vs fixture dispatch) lives in
 * `pi/surfaces/analytics/`. This file is a wire boundary.
 *
 * Server-only.
 */
import { createServerFn } from "@tanstack/react-start";
import { getEnv } from "@/lib/db/client";
import { runSurface } from "@/lib/pi/kernel";
// Value imports — the surface + pool modules self-register on load via
// top-level `registerSurface` / `registerPool` calls, BUT the TanStack
// Start server-fn bundler DCEs bare `import "…"` side-effect statements
// (and tree-shakes re-exports around them). Prod bundles that only saw
// bare imports shipped without the analytics surface registered and
// every request returned `unknown_surface: analytics`.
//
// Importing a real value from each module and touching it inside the
// handler prevents the bundler from dropping the module init. The
// registration side-effect happens as a byproduct of the module load.
import { assetReadTools } from "@/lib/pi/common/pools/asset-reads";
import {
  analyticsDashboardSurface,
  normalizeAnswer,
  type AnalyticsScreenContext,
  type AnalyticsAnswer,
  type Infographic,
} from "@/lib/pi/surfaces/analytics";

// Re-export types for external consumers (AnalyticsChat.tsx, AskPiDock).
export type { AnalyticsScreenContext, AnalyticsAnswer, Infographic };

export type AskPiAnalyticsRequest = {
  question: string;
  context?: AnalyticsScreenContext;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

type ToolCallLog = { name: string; args: string; result: string };

export type AskPiAnalyticsResponse =
  | { ok: true; answer: AnalyticsAnswer; toolCalls: ToolCallLog[] }
  | { ok: false; error: string };

/* -------------------------------------------------------------------------- */
/* askPiAnalytics — multi-round loop, terminates on emit_answer               */
/* -------------------------------------------------------------------------- */

export const askPiAnalytics = createServerFn({ method: "POST" })
  .inputValidator((r: AskPiAnalyticsRequest) => r)
  .handler(async ({ data }): Promise<AskPiAnalyticsResponse> => {
    let env;
    try {
      env = getEnv();
    } catch (e) {
      return { ok: false, error: `runtime_env_missing: ${(e as Error).message}` };
    }

    // Reference the imported values at runtime so the bundler cannot
    // tree-shake the surface/pool module init. `analyticsDashboardSurface.id`
    // is the same "analytics" literal, just plumbed through the manifest.
    void assetReadTools;
    const r = await runSurface(analyticsDashboardSurface.id, {
      question: data.question,
      // AnalyticsScreenContext is our context shape; kernel accepts any
      // Record<string, unknown> so we cast at the boundary.
      context: data.context as unknown as Record<string, unknown> | undefined,
      history: data.history,
    }, env);

    if (!r.ok) return { ok: false, error: r.error };

    // Kernel's `terminateOnToolCall` returns the raw emit_answer args on
    // `structured`. Normalize into the typed AnalyticsAnswer shape.
    if (r.structured) {
      return {
        ok: true,
        answer: normalizeAnswer(r.structured as Record<string, unknown>),
        toolCalls: r.toolCalls,
      };
    }

    // Salvage: the loop returned a free-text terminal turn instead of
    // hitting emit_answer. Preserve the text as the insight so the UI
    // doesn't render an empty card. Same fallback shape the pre-refactor
    // path produced.
    return {
      ok: true,
      answer: {
        insight: r.answer.trim() || "I couldn't finish that answer. Try rephrasing?",
        followUps: ["Summarize this run", "Compare channels", "What went wrong?"],
      },
      toolCalls: r.toolCalls,
    };
  });

/* -------------------------------------------------------------------------- */
/* generateStarterChips — one-shot LLM call, no tool loop                     */
/* -------------------------------------------------------------------------- */

/**
 * Starter chips generator. Called once on screen-context change to seed the
 * idle-state chips (max 3). Cheap one-shot call, NO tool loop.
 * The 3 chips are second-order inferences based on the visible filter state.
 */
export const generateStarterChips = createServerFn({ method: "POST" })
  .inputValidator((c: AnalyticsScreenContext) => c)
  .handler(async ({ data: context }): Promise<{ ok: true; chips: string[] } | { ok: false; error: string }> => {
    let env;
    try { env = getEnv(); } catch (e) {
      return { ok: false, error: `runtime_env_missing: ${(e as Error).message}` };
    }

    const prompt = `Given the user's current analytics screen state, return the 3 most-likely first questions they'd want answered. Second-order inferences — not "what is this" but "which node leaks the most?", "why did conversion drop?", "compare this run vs last". Under 60 chars each. Return STRICT JSON: { "chips": ["q1", "q2", "q3"] }. No prose.

Screen context:
${JSON.stringify(context, null, 2)}`;

    const parseChips = (text: string): { ok: true; chips: string[] } | { ok: false; error: string } => {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return { ok: false, error: "no_json_in_response" };
      try {
        const parsed = JSON.parse(match[0]) as { chips?: unknown };
        const chips = Array.isArray(parsed.chips)
          ? (parsed.chips as unknown[]).filter((v): v is string => typeof v === "string").slice(0, 3)
          : [];
        if (chips.length === 0) return { ok: false, error: "empty_chips" };
        return { ok: true, chips };
      } catch (e) {
        return { ok: false, error: `json_parse: ${(e as Error).message}` };
      }
    };

    // Prod — Anthropic.
    if (env.ANTHROPIC_API_KEY) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            ...(env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": env.ANTHROPIC_WORKSPACE_ID } : {}),
          },
          body: JSON.stringify({
            model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
            max_tokens: 400,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) return { ok: false, error: `anthropic_${res.status}` };
        const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
        const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
        return parseChips(text);
      } catch (e) {
        return { ok: false, error: `fetch_failed: ${(e as Error).message}` };
      }
    }

    // Local — TFY OpenAI-compat.
    const tfyKey = env.PI_AGENT_API_KEY || env.TFY_API_KEY;
    const tfyBase = env.PI_AGENT_BASE_URL || env.TFY_BASE_URL;
    if (tfyKey && tfyBase) {
      try {
        const res = await fetch(`${tfyBase}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tfyKey}` },
          body: JSON.stringify({
            model: env.PI_AGENT_MODEL || env.TFY_MODEL || "pi-agentic/global.anthropic.claude-sonnet-4-6",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) return { ok: false, error: `tfy_${res.status}` };
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = json.choices?.[0]?.message?.content ?? "";
        return parseChips(text);
      } catch (e) {
        return { ok: false, error: `fetch_failed: ${(e as Error).message}` };
      }
    }

    return { ok: false, error: "No LLM gateway configured" };
  });
