/**
 * RCS template CRUD against D1.
 *
 * Mirrors {@link ./agents.ts}. The D1 `rcs_templates` table is intentionally
 * narrower than the runtime {@link RcsTemplate} type — it stores id / name /
 * agent_id / kind (TEXT / RICH_CARD) / body / suggestions_json / created_at.
 * Rich-card media (title / media block / provider-specific dimensions) is not
 * persisted in this phase; the seed keeps rich cards intact in memory. On
 * hydrate, we merge D1 rows over the seed, so seed-only fields (title, media,
 * approvalStatus) survive the round-trip for the seed rows.
 *
 * Server-only.
 */
import type { RcsButton, RcsTemplate, RcsTemplateType } from "@/lib/rcs-templates";
import { getDb } from "./client";

type RcsRow = {
  id: string;
  name: string;
  agent_id: string;
  kind: string;
  body: string;
  suggestions_json: string;
  created_at: string;
};

function rowToRecord(row: RcsRow): RcsTemplate {
  let buttons: RcsButton[] = [];
  try { buttons = JSON.parse(row.suggestions_json) as RcsButton[]; } catch { /* keep [] */ }
  // Normalise legacy `kind` values ("text", "card") the seed script may emit
  // into the runtime type union.
  const upper = row.kind?.toUpperCase();
  const type: RcsTemplateType = upper === "RICH_CARD" || upper === "CARD" ? "RICH_CARD" : "TEXT";
  return {
    id: row.id,
    name: row.name,
    agentId: row.agent_id,
    type,
    approvalStatus: "Approved",
    body: row.body,
    buttons,
    createdAt: row.created_at,
  };
}

/** Return every RCS template in the workspace. */
export async function listRcsTemplates(): Promise<RcsTemplate[]> {
  const rows = await getDb()
    .prepare("SELECT * FROM rcs_templates")
    .all<RcsRow>();
  return (rows.results ?? []).map(rowToRecord);
}

/** Fetch one RCS template by id. Returns null when not found. */
export async function readRcsTemplate(id: string): Promise<RcsTemplate | null> {
  const row = await getDb()
    .prepare("SELECT * FROM rcs_templates WHERE id = ?")
    .bind(id)
    .first<RcsRow>();
  return row ? rowToRecord(row) : null;
}

/** Upsert an RCS template. */
export async function upsertRcsTemplate(rec: RcsTemplate): Promise<void> {
  const kind = rec.type === "RICH_CARD" ? "card" : "text";
  await getDb()
    .prepare(
      `INSERT INTO rcs_templates (id, name, agent_id, kind, body, suggestions_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         agent_id = excluded.agent_id,
         kind = excluded.kind,
         body = excluded.body,
         suggestions_json = excluded.suggestions_json,
         created_at = excluded.created_at`,
    )
    .bind(
      rec.id,
      rec.name,
      rec.agentId,
      kind,
      rec.body,
      JSON.stringify(rec.buttons ?? []),
      rec.createdAt,
    )
    .run();
}

/** Hard-delete an RCS template by id. */
export async function deleteRcsTemplate(id: string): Promise<void> {
  await getDb().prepare("DELETE FROM rcs_templates WHERE id = ?").bind(id).run();
}
