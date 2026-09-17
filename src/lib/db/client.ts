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

/**
 * Called by the worker's fetch entry once per request. Nitro's cloudflare-module
 * preset ALSO stashes env at `globalThis.__env__` — we prefer that when
 * present because Nitro replaces our fetch handler and this manual path
 * never fires on the deployed Worker.
 */
export function setRuntimeEnv(env: unknown): void {
  runtimeEnv = env as Env;
}

/**
 * Return the current worker's env.
 *
 * Resolution order:
 *   1. `globalThis.__env__` — Nitro's cloudflare-module preset sets this at
 *      the top of every request (`dist/server/index.mjs`). This is what
 *      the deployed Worker uses; our src/server.ts fetch handler doesn't
 *      run in prod because Nitro swaps it for its own entry.
 *   2. `runtimeEnv` — manually seeded via {@link setRuntimeEnv}. Used by
 *      test harnesses / local dev paths that go through src/server.ts.
 *
 * Throws only if BOTH are missing — that's a bundle-order bug, not a
 * runtime problem.
 */
export function getEnv(): Env {
  const nitroEnv = (globalThis as { __env__?: Env }).__env__;
  if (nitroEnv) return nitroEnv;
  if (runtimeEnv) return runtimeEnv;
  throw new Error(
    "getEnv() called before Nitro populated globalThis.__env__ (and no manual " +
    "setRuntimeEnv seed). This usually means the server fn ran outside a fetch " +
    "handler.",
  );
}

/** Convenience: `getDb()` for the D1 binding. */
export function getDb(): D1Database {
  return getEnv().DB;
}

/** Convenience: `getKv()` for the KV binding. */
export function getKv(): KVNamespace {
  return getEnv().KV;
}
