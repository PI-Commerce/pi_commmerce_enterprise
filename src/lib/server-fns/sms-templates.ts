/**
 * SMS template server functions — client entry points for D1-backed CRUD.
 *
 * Mirrors {@link ./agents.ts}. Every fn degrades gracefully when D1 isn't bound.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SmsTemplate } from "@/lib/sms-templates";
import { getEnv } from "@/lib/db/client";
import * as smsDb from "@/lib/db/sms-templates";

export type ListSmsTemplatesResult =
  | { ok: true; templates: SmsTemplate[] }
  | { ok: false; error: string };

export type SaveSmsTemplateResult =
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

/** Return every SMS template in D1. */
export const listSmsTemplatesFn = createServerFn({ method: "POST" })
  .handler(async (): Promise<ListSmsTemplatesResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      const templates = await smsDb.listSmsTemplates();
      return { ok: true, templates };
    } catch (e) {
      return { ok: false, error: `d1_read_failed: ${(e as Error).message}` };
    }
  });

/** Upsert one SMS template. */
export const saveSmsTemplateFn = createServerFn({ method: "POST" })
  .inputValidator((rec: SmsTemplate) => rec)
  .handler(async ({ data }): Promise<SaveSmsTemplateResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await smsDb.upsertSmsTemplate(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_write_failed: ${(e as Error).message}` };
    }
  });

/** Hard-delete one SMS template by id. */
export const deleteSmsTemplateFn = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }): Promise<SaveSmsTemplateResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await smsDb.deleteSmsTemplate(id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_delete_failed: ${(e as Error).message}` };
    }
  });
