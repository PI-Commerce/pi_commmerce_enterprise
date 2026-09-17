/**
 * WhatsApp template CRUD against D1.
 *
 * Mirrors {@link ./agents.ts} — the `wa_templates` table stores Meta-approved
 * template records the WhatsApp Template Manager renders. Buttons are a JSON
 * blob; everything else is a typed column so LLM tools can index on it.
 *
 * Server-only. Client bundles must not import this file.
 */
import type { TemplateButton, WaTemplate } from "@/lib/waba-templates";
import { getDb } from "./client";

type WaRow = {
  id: string;
  name: string;
  category: string;
  language: string;
  format: string;
  status: string;
  created_at: string;
  header: string | null;
  body: string;
  footer: string | null;
  buttons_json: string;
};

function rowToRecord(row: WaRow): WaTemplate {
  let buttons: TemplateButton[] = [];
  try { buttons = JSON.parse(row.buttons_json) as TemplateButton[]; } catch { /* keep [] */ }
  return {
    id: row.id,
    name: row.name,
    category: row.category as WaTemplate["category"],
    language: row.language,
    format: row.format as WaTemplate["format"],
    status: row.status as WaTemplate["status"],
    createdAt: row.created_at,
    ...(row.header !== null ? { header: row.header } : {}),
    body: row.body,
    ...(row.footer !== null ? { footer: row.footer } : {}),
    ...(buttons.length > 0 ? { buttons } : {}),
  };
}

/** Return every WA template in the workspace. */
export async function listWaTemplates(): Promise<WaTemplate[]> {
  const rows = await getDb()
    .prepare("SELECT * FROM wa_templates")
    .all<WaRow>();
  return (rows.results ?? []).map(rowToRecord);
}

/** Fetch one WA template by id. Returns null when not found. */
export async function readWaTemplate(id: string): Promise<WaTemplate | null> {
  const row = await getDb()
    .prepare("SELECT * FROM wa_templates WHERE id = ?")
    .bind(id)
    .first<WaRow>();
  return row ? rowToRecord(row) : null;
}

/**
 * Upsert a WA template.
 */
export async function upsertWaTemplate(rec: WaTemplate): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO wa_templates (id, name, category, language, format, status, created_at, header, body, footer, buttons_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         category = excluded.category,
         language = excluded.language,
         format = excluded.format,
         status = excluded.status,
         created_at = excluded.created_at,
         header = excluded.header,
         body = excluded.body,
         footer = excluded.footer,
         buttons_json = excluded.buttons_json`,
    )
    .bind(
      rec.id,
      rec.name,
      rec.category,
      rec.language,
      rec.format,
      rec.status,
      rec.createdAt,
      rec.header ?? null,
      rec.body,
      rec.footer ?? null,
      JSON.stringify(rec.buttons ?? []),
    )
    .run();
}

/** Hard-delete a WA template by id. */
export async function deleteWaTemplate(id: string): Promise<void> {
  await getDb().prepare("DELETE FROM wa_templates WHERE id = ?").bind(id).run();
}
