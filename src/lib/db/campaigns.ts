/**
 * Campaign DSL read/write against D1.
 *
 * The DSL is a graph — one `campaigns` row + N `campaign_nodes` + M
 * `campaign_edges`. `readCampaign` reconstructs the same shape the canvas
 * renderer already consumes; `writeCampaign` is idempotent (upsert nodes +
 * edges, delete anything that isn't in the new payload).
 *
 * Server-only.
 */
import type { PresetConfig, NodeKind, NodeOutput, CampaignStatus } from "@/lib/campaign-types";
import { getDb } from "./client";

export type CampaignVertical = "bfsi" | "retail" | "d2c" | "b2b";

export type CampaignDsl = {
  id: string;
  name: string;
  vertical: CampaignVertical;
  status: CampaignStatus;
  description?: string;
  nodes: DslNode[];
  edges: DslEdge[];
  createdAt: number;
  updatedAt: number;
};

export type DslNode = {
  id: string;
  kind: NodeKind;
  title: string;
  subtitle?: string;
  serial?: string;
  position?: { x: number; y: number };
  config?: PresetConfig;
  outputs?: NodeOutput[];
};

export type DslEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
};

/** List every campaign (id + name + status). Cheap enough to fetch for pickers. */
export async function listCampaigns(): Promise<Array<{
  id: string;
  name: string;
  vertical: CampaignVertical;
  status: CampaignStatus;
  updatedAt: number;
}>> {
  const rows = await getDb()
    .prepare(
      "SELECT id, name, vertical, status, updated_at FROM campaigns ORDER BY updated_at DESC",
    )
    .all<{ id: string; name: string; vertical: CampaignVertical; status: CampaignStatus; updated_at: number }>();
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    vertical: r.vertical,
    status: r.status,
    updatedAt: r.updated_at,
  }));
}

/** Fetch a single campaign's full DSL. Returns `null` if not found. */
export async function readCampaign(id: string): Promise<CampaignDsl | null> {
  const db = getDb();
  const [head, nodes, edges] = await Promise.all([
    db.prepare("SELECT * FROM campaigns WHERE id = ?").bind(id).first<{
      id: string;
      name: string;
      vertical: CampaignVertical;
      status: CampaignStatus;
      description: string | null;
      created_at: number;
      updated_at: number;
    }>(),
    db.prepare(
      "SELECT id, kind, title, subtitle, serial, position_x, position_y, config_json, outputs_json FROM campaign_nodes WHERE campaign_id = ?",
    ).bind(id).all<{
      id: string;
      kind: NodeKind;
      title: string;
      subtitle: string | null;
      serial: string | null;
      position_x: number;
      position_y: number;
      config_json: string;
      outputs_json: string;
    }>(),
    db.prepare(
      "SELECT id, source_id, target_id, source_handle FROM campaign_edges WHERE campaign_id = ?",
    ).bind(id).all<{
      id: string;
      source_id: string;
      target_id: string;
      source_handle: string | null;
    }>(),
  ]);
  if (!head) return null;
  return {
    id: head.id,
    name: head.name,
    vertical: head.vertical,
    status: head.status,
    description: head.description ?? undefined,
    createdAt: head.created_at,
    updatedAt: head.updated_at,
    nodes: (nodes.results ?? []).map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      subtitle: n.subtitle ?? undefined,
      serial: n.serial ?? undefined,
      position: { x: n.position_x, y: n.position_y },
      config: JSON.parse(n.config_json) as PresetConfig,
      outputs: JSON.parse(n.outputs_json) as NodeOutput[],
    })),
    edges: (edges.results ?? []).map((e) => ({
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      sourceHandle: e.source_handle ?? undefined,
    })),
  };
}

/**
 * Upsert a campaign. Replaces nodes + edges wholesale — the LLM is expected to
 * pass the full graph. For incremental edits use `insertNode` / `updateNode` /
 * `connectNodes` / `disconnectNodes` (below).
 */
export async function writeCampaign(dsl: CampaignDsl): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.batch([
    db.prepare(
      `INSERT INTO campaigns (id, name, vertical, status, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         vertical = excluded.vertical,
         status = excluded.status,
         description = excluded.description,
         updated_at = excluded.updated_at`,
    ).bind(dsl.id, dsl.name, dsl.vertical, dsl.status, dsl.description ?? null, dsl.createdAt || now, now),
    db.prepare("DELETE FROM campaign_nodes WHERE campaign_id = ?").bind(dsl.id),
    db.prepare("DELETE FROM campaign_edges WHERE campaign_id = ?").bind(dsl.id),
    ...dsl.nodes.map((n) =>
      db.prepare(
        `INSERT INTO campaign_nodes (id, campaign_id, kind, title, subtitle, serial, position_x, position_y, config_json, outputs_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        n.id,
        dsl.id,
        n.kind,
        n.title,
        n.subtitle ?? null,
        n.serial ?? null,
        n.position?.x ?? 0,
        n.position?.y ?? 0,
        JSON.stringify(n.config ?? {}),
        JSON.stringify(n.outputs ?? []),
      ),
    ),
    ...dsl.edges.map((e) =>
      db.prepare(
        `INSERT INTO campaign_edges (id, campaign_id, source_id, target_id, source_handle)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(e.id, dsl.id, e.source, e.target, e.sourceHandle ?? null),
    ),
  ]);
}

/**
 * Bulk-update node positions for a campaign. Fired by the client after
 * ELK re-lays out (either the manual Wand2 button or the auto-arrange
 * that runs after Pi's inserts / skeleton insertion). Without this,
 * Pi's raw position hints (which are just "right of the rightmost")
 * end up as the persisted layout — a refresh reads them back and the
 * graph looks messy until the user manually re-lays.
 */
export async function updateNodePositions(
  campaignId: string,
  positions: Array<{ id: string; x: number; y: number }>,
): Promise<void> {
  if (positions.length === 0) return;
  const db = getDb();
  await db.batch(
    positions.map((p) =>
      db.prepare(
        "UPDATE campaign_nodes SET position_x = ?, position_y = ? WHERE campaign_id = ? AND id = ?",
      ).bind(p.x, p.y, campaignId, p.id),
    ),
  );
}

/** LLM tool primitive: insert a single node into a campaign. */
export async function insertNode(campaignId: string, node: DslNode): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO campaign_nodes (id, campaign_id, kind, title, subtitle, serial, position_x, position_y, config_json, outputs_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      node.id,
      campaignId,
      node.kind,
      node.title,
      node.subtitle ?? null,
      node.serial ?? null,
      node.position?.x ?? 0,
      node.position?.y ?? 0,
      JSON.stringify(node.config ?? {}),
      JSON.stringify(node.outputs ?? []),
    )
    .run();
  await bumpUpdatedAt(campaignId);
}

/**
 * LLM tool primitive: patch one node's title / subtitle / config / outputs.
 *
 * IMPORTANT: `config` and `outputs` are MERGED with the existing row, not
 * replaced. Pi's `update_node` calls typically pass just the changed keys
 * (e.g. `patch.config = { phoneField: "phone" }` on the Audience node),
 * expecting the rest of the config (fields, csvKeys, ...) to stick. If we
 * did `SET config_json = ?` with just the patch, D1 would lose every
 * pre-existing key on the next refresh — that's the "config disappears on
 * refresh" bug from staging.
 *
 * We read the row first, deep-merge the patch, then write. Two round-trips
 * per update, worth it for correctness.
 */
export async function updateNode(
  campaignId: string,
  nodeId: string,
  patch: Partial<Pick<DslNode, "title" | "subtitle" | "config" | "outputs">>,
): Promise<void> {
  const db = getDb();
  // Load current shape for merging (only needed when config / outputs
  // change; skip the read when just title / subtitle move).
  const needsRead = patch.config != null || patch.outputs != null;
  let existing: { config_json: string; outputs_json: string } | null = null;
  if (needsRead) {
    existing = await db
      .prepare("SELECT config_json, outputs_json FROM campaign_nodes WHERE campaign_id = ? AND id = ?")
      .bind(campaignId, nodeId)
      .first<{ config_json: string; outputs_json: string }>();
  }

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.title != null) { sets.push("title = ?"); binds.push(patch.title); }
  if (patch.subtitle != null) { sets.push("subtitle = ?"); binds.push(patch.subtitle); }
  if (patch.config != null) {
    // Merge with existing config so partial patches don't erase other keys.
    let mergedConfig: Record<string, unknown> = {};
    if (existing?.config_json) {
      try { mergedConfig = JSON.parse(existing.config_json) as Record<string, unknown>; }
      catch { /* keep {} */ }
    }
    mergedConfig = { ...mergedConfig, ...(patch.config as Record<string, unknown>) };
    sets.push("config_json = ?");
    binds.push(JSON.stringify(mergedConfig));
  }
  if (patch.outputs != null) {
    // Outputs are replaced (an outputs patch is meant as the full new set;
    // Pi doesn't emit partial output arrays). If a future caller wants
    // append semantics, do that here explicitly.
    sets.push("outputs_json = ?");
    binds.push(JSON.stringify(patch.outputs));
  }
  if (!sets.length) return;
  binds.push(campaignId, nodeId);
  await db
    .prepare(`UPDATE campaign_nodes SET ${sets.join(", ")} WHERE campaign_id = ? AND id = ?`)
    .bind(...binds)
    .run();
  await bumpUpdatedAt(campaignId);
}

/** LLM tool primitive: remove a node (and every edge touching it). */
export async function deleteNode(campaignId: string, nodeId: string): Promise<void> {
  const db = getDb();
  await db.batch([
    db.prepare("DELETE FROM campaign_edges WHERE campaign_id = ? AND (source_id = ? OR target_id = ?)").bind(campaignId, nodeId, nodeId),
    db.prepare("DELETE FROM campaign_nodes WHERE campaign_id = ? AND id = ?").bind(campaignId, nodeId),
  ]);
  await bumpUpdatedAt(campaignId);
}

/** LLM tool primitive: wire two nodes together. */
export async function connectNodes(campaignId: string, edge: DslEdge): Promise<void> {
  await getDb()
    .prepare(
      "INSERT INTO campaign_edges (id, campaign_id, source_id, target_id, source_handle) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(edge.id, campaignId, edge.source, edge.target, edge.sourceHandle ?? null)
    .run();
  await bumpUpdatedAt(campaignId);
}

/** LLM tool primitive: remove one edge. */
export async function disconnectNodes(campaignId: string, edgeId: string): Promise<void> {
  await getDb()
    .prepare("DELETE FROM campaign_edges WHERE campaign_id = ? AND id = ?")
    .bind(campaignId, edgeId)
    .run();
  await bumpUpdatedAt(campaignId);
}

/**
 * Create a fresh campaign with the canonical blank-canvas invariants:
 *   - Start (locked, undeletable)
 *   - Audience (schema seeder, undeletable)
 *   - End (locked, undeletable)
 *   - one edge: start > audience
 *
 * Every campaign in the workspace starts from this baseline. Pi builds
 * BETWEEN Audience and End; it never inserts or deletes these three. The
 * write is a single batch so a partial baseline can never exist in D1.
 *
 * Positions match the LEFT-to-RIGHT canonical direction (ELK re-lays anyway
 * once branches spread out).
 */
export async function createBlankCampaign(
  id: string,
  name: string,
  vertical: CampaignVertical,
  description?: string,
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.batch([
    db.prepare(
      `INSERT INTO campaigns (id, name, vertical, status, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, name, vertical, "draft", description ?? null, now, now),
    // Start
    db.prepare(
      `INSERT INTO campaign_nodes (id, campaign_id, kind, title, subtitle, serial, position_x, position_y, config_json, outputs_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("start", id, "start", "Start", null, "start_1", 0, 0, "{}", "[]"),
    // Audience (blank schema — user or Pi fills fields via update_node).
    // `fields: []` + `csvKeys: []` are explicit so ConfigPanel's schema
    // editor shows the empty state instead of falling back to the
    // sample-CSV column set.
    db.prepare(
      `INSERT INTO campaign_nodes (id, campaign_id, kind, title, subtitle, serial, position_x, position_y, config_json, outputs_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("audience", id, "audience", "Audience", "Configure the source", "audience_1", 240, 0, JSON.stringify({ fields: [], csvKeys: [] }), "[]"),
    // End
    db.prepare(
      `INSERT INTO campaign_nodes (id, campaign_id, kind, title, subtitle, serial, position_x, position_y, config_json, outputs_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("end", id, "end", "End", null, "end_1", 480, 0, "{}", "[]"),
    // Start > Audience — the only pre-wired edge on a blank canvas.
    db.prepare(
      `INSERT INTO campaign_edges (id, campaign_id, source_id, target_id, source_handle)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind("e_start_audience", id, "start", "audience", null),
  ]);
}

async function bumpUpdatedAt(campaignId: string): Promise<void> {
  await getDb()
    .prepare("UPDATE campaigns SET updated_at = ? WHERE id = ?")
    .bind(Date.now(), campaignId)
    .run();
}
