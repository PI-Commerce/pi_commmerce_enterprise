/**
 * Freeform workflow CRUD against D1.
 *
 * Mirrors {@link ./agents.ts}. The `freeform_workflows` table persists the
 * WhatsApp Freeform Workflow rows — id / name / description / status / lock
 * state / usedInCampaigns count / serialised graph (nodes + edges JSON).
 *
 * Timestamps: the D1 columns are `INTEGER` (unix ms), but the runtime record
 * exposes ISO strings on `createdAt` / `lastModified`. We round-trip through
 * Date.parse / toISOString so the on-disk shape stays queryable while the
 * client keeps working with ISO strings.
 *
 * Server-only.
 */
import type {
  FreeformEdgeRecord,
  FreeformNodeRecord,
  FreeformStatus,
  FreeformWorkflowRow,
} from "@/lib/freeform-types";
import { getDb } from "./client";

type FreeformDbRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  locked: number;
  locked_at: number | null;
  used_in_campaigns: number;
  nodes_json: string;
  edges_json: string;
  created_at: number;
  updated_at: number;
};

function rowToRecord(row: FreeformDbRow): FreeformWorkflowRow {
  let nodes: FreeformNodeRecord[] = [];
  let edges: FreeformEdgeRecord[] = [];
  try { nodes = JSON.parse(row.nodes_json) as FreeformNodeRecord[]; } catch { /* keep [] */ }
  try { edges = JSON.parse(row.edges_json) as FreeformEdgeRecord[]; } catch { /* keep [] */ }
  return {
    id: row.id,
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    status: row.status as FreeformStatus,
    lastModified: new Date(row.updated_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    usedInCampaigns: row.used_in_campaigns,
    nodes,
    edges,
    ...(row.locked ? { locked: true } : {}),
    ...(row.locked_at ? { lockedAt: new Date(row.locked_at).toISOString() } : {}),
  };
}

/** Return every freeform workflow in the workspace. */
export async function listFreeformWorkflows(): Promise<FreeformWorkflowRow[]> {
  const rows = await getDb()
    .prepare("SELECT * FROM freeform_workflows ORDER BY updated_at DESC")
    .all<FreeformDbRow>();
  return (rows.results ?? []).map(rowToRecord);
}

/** Fetch one workflow by id. Returns null when not found. */
export async function readFreeformWorkflow(id: string): Promise<FreeformWorkflowRow | null> {
  const row = await getDb()
    .prepare("SELECT * FROM freeform_workflows WHERE id = ?")
    .bind(id)
    .first<FreeformDbRow>();
  return row ? rowToRecord(row) : null;
}

/** Upsert a freeform workflow. */
export async function upsertFreeformWorkflow(rec: FreeformWorkflowRow): Promise<void> {
  const createdAt = Date.parse(rec.createdAt);
  const updatedAt = Date.parse(rec.lastModified) || Date.now();
  const lockedAt = rec.lockedAt ? Date.parse(rec.lockedAt) : null;
  await getDb()
    .prepare(
      `INSERT INTO freeform_workflows (id, name, description, status, locked, locked_at, used_in_campaigns, nodes_json, edges_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         status = excluded.status,
         locked = excluded.locked,
         locked_at = excluded.locked_at,
         used_in_campaigns = excluded.used_in_campaigns,
         nodes_json = excluded.nodes_json,
         edges_json = excluded.edges_json,
         updated_at = excluded.updated_at`,
    )
    .bind(
      rec.id,
      rec.name,
      rec.description ?? null,
      rec.status,
      rec.locked ? 1 : 0,
      lockedAt,
      rec.usedInCampaigns ?? 0,
      JSON.stringify(rec.nodes ?? []),
      JSON.stringify(rec.edges ?? []),
      createdAt,
      updatedAt,
    )
    .run();
}

/** Hard-delete a freeform workflow by id. */
export async function deleteFreeformWorkflow(id: string): Promise<void> {
  await getDb().prepare("DELETE FROM freeform_workflows WHERE id = ?").bind(id).run();
}
