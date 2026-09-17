/**
 * RCS template server functions — client entry points for D1-backed CRUD.
 *
 * Mirrors {@link ./agents.ts}. Every fn degrades gracefully when D1 isn't bound.
 */
import { createServerFn } from "@tanstack/react-start";
import type { RcsTemplate } from "@/lib/rcs-templates";
import { getEnv } from "@/lib/db/client";
import * as rcsDb from "@/lib/db/rcs-templates";

export type ListRcsTemplatesResult =
  | { ok: true; templates: RcsTemplate[] }
  | { ok: false; error: string };

export type SaveRcsTemplateResult =
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

/** Return every RCS template in D1. */
export const listRcsTemplatesFn = createServerFn({ method: "POST" })
  .handler(async (): Promise<ListRcsTemplatesResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      const templates = await rcsDb.listRcsTemplates();
      return { ok: true, templates };
    } catch (e) {
      return { ok: false, error: `d1_read_failed: ${(e as Error).message}` };
    }
  });

/** Upsert one RCS template. */
export const saveRcsTemplateFn = createServerFn({ method: "POST" })
  .inputValidator((rec: RcsTemplate) => rec)
  .handler(async ({ data }): Promise<SaveRcsTemplateResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await rcsDb.upsertRcsTemplate(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_write_failed: ${(e as Error).message}` };
    }
  });

/** Hard-delete one RCS template by id. */
export const deleteRcsTemplateFn = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }): Promise<SaveRcsTemplateResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await rcsDb.deleteRcsTemplate(id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_delete_failed: ${(e as Error).message}` };
    }
  });
