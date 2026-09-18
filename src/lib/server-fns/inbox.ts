/**
 * Inbox server functions — client entry points for D1-backed lead reads.
 *
 * The inbox routes (`/inbox`, `/inbox/$id`) call these to hydrate their view
 * from D1 at mount. On a cold prod (D1 not bound) or a read failure the fn
 * returns an `ok:false` shape so the routes can fall back to the seed
 * `LEAD_RECORDS` array without dead-ending the UI.
 */
import { createServerFn } from "@tanstack/react-start";
import type { LeadRecord } from "@/lib/leads-data";
import { getEnv } from "@/lib/db/client";
import * as inboxDb from "@/lib/db/inbox";

export type ListInboxLeadsResult =
  | { ok: true; leads: LeadRecord[] }
  | { ok: false; error: string };

export type ReadInboxLeadResult =
  | { ok: true; lead: LeadRecord | null }
  | { ok: false; error: string };

export type WriteInboxLeadResult =
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

/** Every inbox lead, sorted by last-interaction desc (WhatsApp-web convention). */
export const listInboxLeadsFn = createServerFn({ method: "POST" })
  .handler(async (): Promise<ListInboxLeadsResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      const leads = await inboxDb.listInboxLeads();
      return { ok: true, leads };
    } catch (e) {
      return { ok: false, error: `d1_read_failed: ${(e as Error).message}` };
    }
  });

/** One lead by id — full record with messages + campaign chips. */
export const readInboxLeadFn = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }): Promise<ReadInboxLeadResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      const lead = await inboxDb.readInboxLead(id);
      return { ok: true, lead };
    } catch (e) {
      return { ok: false, error: `d1_read_failed: ${(e as Error).message}` };
    }
  });

/** Upsert one inbox lead record. */
export const upsertInboxLeadFn = createServerFn({ method: "POST" })
  .inputValidator((rec: LeadRecord) => rec)
  .handler(async ({ data }): Promise<WriteInboxLeadResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await inboxDb.upsertInboxLead(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_write_failed: ${(e as Error).message}` };
    }
  });
