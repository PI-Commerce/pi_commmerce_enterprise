/**
 * Report server functions — client entry points for D1-backed CRUD.
 *
 * Mirrors {@link ./agents.ts}. Every fn degrades gracefully when D1 isn't bound.
 */
import { createServerFn } from "@tanstack/react-start";
import type { ReportRow } from "@/lib/reports";
import { getEnv } from "@/lib/db/client";
import * as reportsDb from "@/lib/db/reports";

export type ListReportsResult =
  | { ok: true; reports: ReportRow[] }
  | { ok: false; error: string };

export type SaveReportResult =
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

/** Return every report in D1. Callers merge over their seed list. */
export const listReportsFn = createServerFn({ method: "POST" })
  .handler(async (): Promise<ListReportsResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      const reports = await reportsDb.listReports();
      return { ok: true, reports };
    } catch (e) {
      return { ok: false, error: `d1_read_failed: ${(e as Error).message}` };
    }
  });

/** Upsert one report. */
export const saveReportFn = createServerFn({ method: "POST" })
  .inputValidator((rec: ReportRow) => rec)
  .handler(async ({ data }): Promise<SaveReportResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await reportsDb.upsertReport(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_write_failed: ${(e as Error).message}` };
    }
  });

/** Hard-delete one report by id. */
export const deleteReportFn = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }): Promise<SaveReportResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await reportsDb.deleteReport(id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_delete_failed: ${(e as Error).message}` };
    }
  });
