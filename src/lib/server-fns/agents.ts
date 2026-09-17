/**
 * Agent server functions — client entry points for D1-backed agent CRUD.
 *
 * The client `agent-store` uses these to hydrate its in-memory map from D1
 * on first read, and to persist a Save (upsert) back to D1 so edits survive
 * a page refresh. Every fn degrades gracefully — if D1 isn't bound (prod
 * before provisioning), it returns an `ok:false` shape the store can use
 * to fall back to the seed data without dead-ending the UI.
 */
import { createServerFn } from "@tanstack/react-start";
import type { AgentRecord } from "@/lib/agent-data";
import { getEnv } from "@/lib/db/client";
import * as agentDb from "@/lib/db/agents";

export type ListAgentsResult =
  | { ok: true; agents: Record<string, AgentRecord> }
  | { ok: false; error: string };

export type SaveAgentResult =
  | { ok: true }
  | { ok: false; error: string };

function bailWithoutDb(): { ok: false; error: string } | null {
  try {
    const env = getEnv();
    if (!env.DB) return { ok: false, error: "d1_not_bound" };
    return null;
  } catch (e) {
    return { ok: false, error: `runtime_env_missing: ${(e as Error).message}` };
  }
}

/** Return every agent in D1 keyed by id. Callers merge over their seed map. */
export const listAgentsFn = createServerFn({ method: "POST" })
  .handler(async (): Promise<ListAgentsResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      const agents = await agentDb.listAgents();
      return { ok: true, agents };
    } catch (e) {
      return { ok: false, error: `d1_read_failed: ${(e as Error).message}` };
    }
  });

/** Upsert one agent record. Called by `saveAgent` in the client store. */
export const saveAgentFn = createServerFn({ method: "POST" })
  .inputValidator((rec: AgentRecord) => rec)
  .handler(async ({ data }): Promise<SaveAgentResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await agentDb.upsertAgent(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_write_failed: ${(e as Error).message}` };
    }
  });

/** Hard-delete one agent by id. */
export const deleteAgentFn = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }): Promise<SaveAgentResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await agentDb.deleteAgent(id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_delete_failed: ${(e as Error).message}` };
    }
  });
