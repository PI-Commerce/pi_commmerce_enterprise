/**
 * Campaign server functions — client entry points for D1-backed campaign CRUD.
 *
 * The Campaigns list, campaign canvas, version history, and Save-to-D1 all
 * route through here. `askPi` (builder scope) uses the underlying `db/campaigns`
 * module directly on the server; these fns are what CLIENT components call.
 *
 * All fns degrade gracefully — `ok:false` when D1 isn't bound so the UI can
 * fall back to the in-memory seed (EXAMPLE_CAMPAIGNS / INITIAL) without a
 * dead-end.
 */
import { createServerFn } from "@tanstack/react-start";
import { getEnv } from "@/lib/db/client";
import * as campaignsDb from "@/lib/db/campaigns";
import type { CampaignDsl } from "@/lib/db/campaigns";

export type ListCampaignsResult =
  | {
      ok: true;
      campaigns: Array<{
        id: string;
        name: string;
        vertical: campaignsDb.CampaignVertical;
        status: import("@/lib/campaign-types").CampaignStatus;
        updatedAt: number;
      }>;
    }
  | { ok: false; error: string };

export type ReadCampaignResult =
  | { ok: true; dsl: CampaignDsl | null }
  | { ok: false; error: string };

export type WriteCampaignResult =
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

/** Full workspace campaign list — for the Campaigns index table. */
export const listCampaignsFn = createServerFn({ method: "POST" })
  .handler(async (): Promise<ListCampaignsResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      const campaigns = await campaignsDb.listCampaigns();
      return { ok: true, campaigns };
    } catch (e) {
      return { ok: false, error: `d1_read_failed: ${(e as Error).message}` };
    }
  });

/** Single campaign's full DSL (nodes + edges) — for canvas hydration. */
export const readCampaignFn = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }): Promise<ReadCampaignResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      const dsl = await campaignsDb.readCampaign(id);
      return { ok: true, dsl };
    } catch (e) {
      return { ok: false, error: `d1_read_failed: ${(e as Error).message}` };
    }
  });

/**
 * Upsert a campaign's full DSL. Replaces nodes + edges wholesale — the caller
 * passes the full graph (this is what the canvas Save does). Idempotent.
 */
export const writeCampaignFn = createServerFn({ method: "POST" })
  .inputValidator((dsl: CampaignDsl) => dsl)
  .handler(async ({ data: dsl }): Promise<WriteCampaignResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await campaignsDb.writeCampaign(dsl);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_write_failed: ${(e as Error).message}` };
    }
  });

export type CreateBlankCampaignResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Create a fresh campaign with the canonical blank canvas already persisted
 * (Start, Audience, End + start > audience edge). Called from the Campaigns
 * index "Create" flow so Ask Pi sees a real 3-node DSL on turn 1 instead of
 * an empty stub.
 */
export const createBlankCampaignFn = createServerFn({ method: "POST" })
  .inputValidator(
    (r: { id: string; name: string; vertical: campaignsDb.CampaignVertical; description?: string }) => r,
  )
  .handler(async ({ data }): Promise<CreateBlankCampaignResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await campaignsDb.createBlankCampaign(data.id, data.name, data.vertical, data.description);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_write_failed: ${(e as Error).message}` };
    }
  });

export type ResetCampaignResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Wipe every non-canonical node + edge for a campaign. Fired by the
 * canvas when the user accepts a new Draft this, so Pi's fresh build
 * doesn't accumulate on top of the previous draft. Start / Audience
 * / End stay put; everything Pi inserted in prior turns goes.
 */
export const resetCampaignForNewDraftFn = createServerFn({ method: "POST" })
  .inputValidator((r: { campaignId: string }) => r)
  .handler(async ({ data }): Promise<ResetCampaignResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await campaignsDb.resetCampaignForNewDraft(data.campaignId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_write_failed: ${(e as Error).message}` };
    }
  });

export type UpdateNodePositionsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Persist ELK-laid positions to D1 after the canvas relays out. Called
 * from `autoArrange` in WorkflowCanvas so a refresh reads back the
 * clean laid-out positions, not Pi's raw "right of the rightmost"
 * hints. Batched into a single D1 request.
 */
export const updateNodePositionsFn = createServerFn({ method: "POST" })
  .inputValidator(
    (r: { campaignId: string; positions: Array<{ id: string; x: number; y: number }> }) => r,
  )
  .handler(async ({ data }): Promise<UpdateNodePositionsResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await campaignsDb.updateNodePositions(data.campaignId, data.positions);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_write_failed: ${(e as Error).message}` };
    }
  });

/** Delete a campaign (and cascading nodes/edges/runs via app-level cleanup). */
export const deleteCampaignFn = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }): Promise<WriteCampaignResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      const env = getEnv();
      // No FK cascades in the schema — clean up in the app layer.
      await env.DB.batch([
        env.DB.prepare("DELETE FROM campaign_nodes WHERE campaign_id = ?").bind(id),
        env.DB.prepare("DELETE FROM campaign_edges WHERE campaign_id = ?").bind(id),
        env.DB.prepare("DELETE FROM campaigns WHERE id = ?").bind(id),
      ]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_delete_failed: ${(e as Error).message}` };
    }
  });
