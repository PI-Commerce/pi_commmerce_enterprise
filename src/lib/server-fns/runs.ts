/**
 * Run server functions — client entry points for D1-backed run mutations.
 *
 * The Campaigns > Runs table pauses / resumes / terminates runs from the
 * row menu. Those actions call `updateRunStatusFn` in the background so
 * the change survives a refresh. `listRunStatusesFn` hydrates the table on
 * mount so any earlier status change is reflected.
 *
 * Both fns degrade gracefully — `ok:false` when D1 isn't bound so the UI
 * falls back to its INITIAL_RUNS defaults without dead-ending.
 */
import { createServerFn } from "@tanstack/react-start";
import type { CampaignRunStatus } from "@/lib/leads-data";
import { getEnv } from "@/lib/db/client";
import * as runsDb from "@/lib/db/runs";

export type ListRunStatusesResult =
  | { ok: true; statuses: Record<string, CampaignRunStatus> }
  | { ok: false; error: string };

export type UpdateRunStatusResult =
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

export const listRunStatusesFn = createServerFn({ method: "POST" })
  .handler(async (): Promise<ListRunStatusesResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      const statuses = await runsDb.listRunStatuses();
      return { ok: true, statuses };
    } catch (e) {
      return { ok: false, error: `d1_read_failed: ${(e as Error).message}` };
    }
  });

export const updateRunStatusFn = createServerFn({ method: "POST" })
  .inputValidator((p: { id: string; status: CampaignRunStatus }) => p)
  .handler(async ({ data }): Promise<UpdateRunStatusResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await runsDb.updateRunStatus(data.id, data.status);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_write_failed: ${(e as Error).message}` };
    }
  });
