/**
 * D1 client accessor.
 *
 * Phase 3 storage — everything Ask Pi's LLM tools read or mutate goes through
 * a small set of typed helpers on top of the Cloudflare D1 binding.
 *
 * The worker's `env` (containing the D1 binding, KV binding, and secrets) is
 * stashed on module init at the top of every fetch handler via
 * {@link setRuntimeEnv}. Server functions read it back with {@link getEnv}.
 *
 * This works because a Cloudflare Worker isolate serves one request at a time
 * on a single JS thread. In local dev the `@cloudflare/vite-plugin` binds the
 * same shape to `.wrangler/state/v3/d1/…` so callers don't need to branch.
 *
 * Server-only. Must not be imported from client bundles.
 */
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

export type Env = {
  DB: D1Database;
  KV: KVNamespace;
  /**
   * Ask Pi LLM gateway. The "PI_AGENT_*" trio is the current working
   * gateway (`llm.tfy.pi.mypaytm.com/openai/v1`, service account
   * `foundary-ai-workflows`). "TFY_*" is retained for backward-compat but
   * the underlying service account has been rotated out — new deployments
   * should populate PI_AGENT_*.
   */
  PI_AGENT_API_KEY?: string;
  PI_AGENT_BASE_URL?: string;
  PI_AGENT_MODEL?: string;
  TFY_API_KEY?: string;
  TFY_BASE_URL?: string;
  TFY_MODEL?: string;
  THESYS_API_KEY?: string;
  THESYS_MODEL?: string;
};

let runtimeEnv: Env | null = null;

/** Called by the worker's fetch entry once per request. */
export function setRuntimeEnv(env: unknown): void {
  runtimeEnv = env as Env;
}

/**
 * Return the current worker's env.
 *
 * Throws if the caller runs before `setRuntimeEnv` (which the fetch handler
 * always calls) — that's a bundle-order bug, not a runtime problem.
 */
export function getEnv(): Env {
  if (!runtimeEnv) {
    throw new Error(
      "getEnv() called before setRuntimeEnv. This module is server-only; " +
      "the fetch handler in src/server.ts must call setRuntimeEnv(env) before " +
      "any server function reaches DB / KV.",
    );
  }
  return runtimeEnv;
}

/** Convenience: `getDb()` for the D1 binding. */
export function getDb(): D1Database {
  return getEnv().DB;
}

/** Convenience: `getKv()` for the KV binding. */
export function getKv(): KVNamespace {
  return getEnv().KV;
}
