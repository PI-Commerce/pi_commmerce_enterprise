/**
 * Inbox lead CRUD against D1.
 *
 * `inbox_leads` stores one row per lead with `messages_json` and
 * `campaigns_json` as blobs — Inbox always reads by lead id and renders the
 * whole conversation at once, so normalising messages would just add joins
 * for no gain. Analytics owns the per-campaign lead queries in a separate
 * table (`leads`).
 *
 * Server-only. Client bundles must not import this file.
 */
import type { LeadRecord, LeadCampaignEntry, LeadMessage } from "@/lib/leads-data";
import { getDb } from "./client";

type InboxLeadRow = {
  id: string;
  customer_id: string;
  name: string;
  phone: string;
  email: string | null;
  created_at: string;
  last_updated_at: string;
  last_interaction_at: string;
  campaigns_json: string;
  messages_json: string;
};

function rowToRecord(row: InboxLeadRow): LeadRecord {
  let campaigns: LeadCampaignEntry[] = [];
  let messages: LeadMessage[] = [];
  try { campaigns = JSON.parse(row.campaigns_json) as LeadCampaignEntry[]; } catch { /* keep [] */ }
  try { messages = JSON.parse(row.messages_json) as LeadMessage[]; } catch { /* keep [] */ }
  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    phone: row.phone,
    ...(row.email ? { email: row.email } : {}),
    createdAt: row.created_at,
    lastUpdatedAt: row.last_updated_at,
    lastInteractionAt: row.last_interaction_at,
    campaigns,
    messages,
  };
}

/** Return every inbox lead, sorted by most-recent interaction first. */
export async function listInboxLeads(): Promise<LeadRecord[]> {
  const rows = await getDb()
    .prepare("SELECT * FROM inbox_leads ORDER BY last_interaction_at DESC")
    .all<InboxLeadRow>();
  return (rows.results ?? []).map(rowToRecord);
}

/** Fetch one inbox lead by id. Returns null when not found. */
export async function readInboxLead(id: string): Promise<LeadRecord | null> {
  const row = await getDb()
    .prepare("SELECT * FROM inbox_leads WHERE id = ?")
    .bind(id)
    .first<InboxLeadRow>();
  return row ? rowToRecord(row) : null;
}

/**
 * Upsert an inbox lead. Full-row replace — callers who only want to append a
 * message should read, mutate the returned record, and write back. Kept simple
 * because the demo currently only reads from D1 (seed writes at build time).
 */
export async function upsertInboxLead(rec: LeadRecord): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO inbox_leads (id, customer_id, name, phone, email, created_at, last_updated_at, last_interaction_at, campaigns_json, messages_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         customer_id = excluded.customer_id,
         name = excluded.name,
         phone = excluded.phone,
         email = excluded.email,
         last_updated_at = excluded.last_updated_at,
         last_interaction_at = excluded.last_interaction_at,
         campaigns_json = excluded.campaigns_json,
         messages_json = excluded.messages_json`,
    )
    .bind(
      rec.id,
      rec.customerId,
      rec.name,
      rec.phone,
      rec.email ?? null,
      rec.createdAt,
      rec.lastUpdatedAt,
      rec.lastInteractionAt,
      JSON.stringify(rec.campaigns ?? []),
      JSON.stringify(rec.messages ?? []),
    )
    .run();
}
