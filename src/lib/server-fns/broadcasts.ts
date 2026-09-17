/**
 * Broadcast server functions — client entry points for D1-backed CRUD.
 *
 * Mirrors {@link ./agents.ts}. Every fn degrades gracefully when D1 isn't bound.
 */
import { createServerFn } from "@tanstack/react-start";
import type { BroadcastRow } from "@/lib/broadcasts-seed";
import { getEnv } from "@/lib/db/client";
import * as broadcastsDb from "@/lib/db/broadcasts";

export type ListBroadcastsResult =
  | { ok: true; broadcasts: BroadcastRow[] }
  | { ok: false; error: string };

export type SaveBroadcastResult =
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

/** Return every broadcast in D1. Callers merge over their seed list. */
export const listBroadcastsFn = createServerFn({ method: "POST" })
  .handler(async (): Promise<ListBroadcastsResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      const broadcasts = await broadcastsDb.listBroadcasts();
      return { ok: true, broadcasts };
    } catch (e) {
      return { ok: false, error: `d1_read_failed: ${(e as Error).message}` };
    }
  });

/** Upsert one broadcast. */
export const saveBroadcastFn = createServerFn({ method: "POST" })
  .inputValidator((rec: BroadcastRow) => rec)
  .handler(async ({ data }): Promise<SaveBroadcastResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await broadcastsDb.upsertBroadcast(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_write_failed: ${(e as Error).message}` };
    }
  });

/** Hard-delete one broadcast by id. */
export const deleteBroadcastFn = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }): Promise<SaveBroadcastResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await broadcastsDb.deleteBroadcast(id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_delete_failed: ${(e as Error).message}` };
    }
  });
