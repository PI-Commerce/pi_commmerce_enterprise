/**
 * SMS template CRUD against D1.
 *
 * Mirrors {@link ./agents.ts}. The DLT-approved template mirror lives in the
 * `sms_templates` table; the D1 `encoding` column carries the app's `smsType`
 * (Text / Unicode / Text-class 0 / Unicode-class 0) verbatim.
 *
 * Server-only.
 */
import type { SmsCategory, SmsTemplate, SmsType } from "@/lib/sms-templates";
import { getDb } from "./client";

type SmsRow = {
  id: string;
  name: string;
  pe_id: string;
  sender_id: string;
  category: string;
  encoding: string;
  body: string;
  created_at: string;
};

function rowToRecord(row: SmsRow): SmsTemplate {
  return {
    id: row.id,
    name: row.name,
    smsType: row.encoding as SmsType,
    category: row.category as SmsCategory,
    peId: row.pe_id,
    senderId: row.sender_id,
    content: row.body,
    createdAt: row.created_at,
  };
}

/** Return every SMS template in the workspace. */
export async function listSmsTemplates(): Promise<SmsTemplate[]> {
  const rows = await getDb()
    .prepare("SELECT * FROM sms_templates")
    .all<SmsRow>();
  return (rows.results ?? []).map(rowToRecord);
}

/** Fetch one SMS template by id. Returns null when not found. */
export async function readSmsTemplate(id: string): Promise<SmsTemplate | null> {
  const row = await getDb()
    .prepare("SELECT * FROM sms_templates WHERE id = ?")
    .bind(id)
    .first<SmsRow>();
  return row ? rowToRecord(row) : null;
}

/** Upsert an SMS template. */
export async function upsertSmsTemplate(rec: SmsTemplate): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO sms_templates (id, name, pe_id, sender_id, category, encoding, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         pe_id = excluded.pe_id,
         sender_id = excluded.sender_id,
         category = excluded.category,
         encoding = excluded.encoding,
         body = excluded.body,
         created_at = excluded.created_at`,
    )
    .bind(
      rec.id,
      rec.name,
      rec.peId,
      rec.senderId,
      rec.category,
      rec.smsType,
      rec.content,
      rec.createdAt,
    )
    .run();
}

/** Hard-delete an SMS template by id. */
export async function deleteSmsTemplate(id: string): Promise<void> {
  await getDb().prepare("DELETE FROM sms_templates WHERE id = ?").bind(id).run();
}
