/**
 * WhatsApp template server functions — client entry points for D1-backed
 * template CRUD.
 *
 * Mirrors {@link ./agents.ts} — every fn degrades gracefully. If D1 isn't
 * bound (prod pre-provisioning), it returns an `ok:false` shape the store can
 * use to fall back to the seed data without dead-ending the UI.
 */
import { createServerFn } from "@tanstack/react-start";
import type { WaTemplate } from "@/lib/waba-templates";
import { getEnv } from "@/lib/db/client";
import * as waDb from "@/lib/db/wa-templates";

export type ListWaTemplatesResult =
  | { ok: true; templates: WaTemplate[] }
  | { ok: false; error: string };

export type SaveWaTemplateResult =
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

/** Return every WA template in D1. Callers merge over their seed list. */
export const listWaTemplatesFn = createServerFn({ method: "POST" })
  .handler(async (): Promise<ListWaTemplatesResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      const templates = await waDb.listWaTemplates();
      return { ok: true, templates };
    } catch (e) {
      return { ok: false, error: `d1_read_failed: ${(e as Error).message}` };
    }
  });

/** Upsert one WA template. */
export const saveWaTemplateFn = createServerFn({ method: "POST" })
  .inputValidator((rec: WaTemplate) => rec)
  .handler(async ({ data }): Promise<SaveWaTemplateResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await waDb.upsertWaTemplate(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_write_failed: ${(e as Error).message}` };
    }
  });

/** Hard-delete one WA template by id. */
export const deleteWaTemplateFn = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }): Promise<SaveWaTemplateResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await waDb.deleteWaTemplate(id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_delete_failed: ${(e as Error).message}` };
    }
  });
