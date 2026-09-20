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
   * Ask Pi LLM. Preferred path: Anthropic direct (public network, reachable
   * from Cloudflare Workers). Falls back to the older TrueFoundry gateways
   * (PI_AGENT_* / TFY_*) which are Paytm-internal and only reachable when
   * the request originates from inside the corporate network (i.e. local
   * dev with a laptop on the Paytm VPN).
   */
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_WORKSPACE_ID?: string;
  /** Extended-thinking budget (tokens) for the Ask Pi loop. Overrides the
   *  code default of 5000. Bump higher for harder builds; drop to 0 to
   *  effectively disable thinking (Anthropic still needs the block > 0). */
  ANTHROPIC_THINKING_BUDGET?: string;
  /** Legacy TrueFoundry paths (kept as fallback for local dev on Paytm net). */
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
 *      test harnesses / paths that route through src/server.ts.
 *   3. `process.env` — local dev fallback. `bun run dev` uses vite (not
 *      Nitro), which doesn't populate globalThis.__env__ or call our
 *      fetch handler. We synthesize a minimal Env from `.env` values so
 *      the LLM path works locally. D1/KV bindings aren't in process.env
 *      — those callers get `undefined` and hit the graceful `d1_not_bound`
 *      path.
 *
 * Throws only if none of the three has anything — that's a bundle-order
 * bug, not a runtime problem.
 */
export function getEnv(): Env {
  const nitroEnv = (globalThis as { __env__?: Env }).__env__;
  if (nitroEnv) return nitroEnv;
  if (runtimeEnv) return runtimeEnv;
  // Local dev fallback via process.env. Safe in prod too: CF Worker with
  // `nodejs_compat` exposes process.env, but the earlier branches short-
  // circuit so this only runs when the request didn't come through a
  // Cloudflare fetch handler.
  if (typeof process !== "undefined" && process.env) {
    return {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
      ANTHROPIC_WORKSPACE_ID: process.env.ANTHROPIC_WORKSPACE_ID,
      ANTHROPIC_THINKING_BUDGET: process.env.ANTHROPIC_THINKING_BUDGET,
      PI_AGENT_API_KEY: process.env.PI_AGENT_API_KEY,
      PI_AGENT_BASE_URL: process.env.PI_AGENT_BASE_URL,
      PI_AGENT_MODEL: process.env.PI_AGENT_MODEL,
      TFY_API_KEY: process.env.TFY_API_KEY,
      TFY_BASE_URL: process.env.TFY_BASE_URL,
      TFY_MODEL: process.env.TFY_MODEL,
      THESYS_API_KEY: process.env.THESYS_API_KEY,
      THESYS_MODEL: process.env.THESYS_MODEL,
    } as Env;
  }
  throw new Error(
    "getEnv() called before Nitro populated globalThis.__env__ (and no manual " +
    "setRuntimeEnv seed, and no process.env fallback). This usually means the " +
    "server fn ran outside a fetch handler.",
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
