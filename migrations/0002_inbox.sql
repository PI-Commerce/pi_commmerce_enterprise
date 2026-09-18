-- 0002_inbox.sql
--
-- The Inbox surface persists leads + their conversation history as a single
-- row per lead. Messages stay as a JSON blob (`messages_json`) because inbox
-- always fetches by lead id and renders every message at once — a normalized
-- `inbox_messages` table would only add joins for no gain. Same call for
-- campaigns (`campaigns_json`): a lead's campaign chips are read together,
-- never queried by campaign id from this table (analytics owns that path).
--
-- No FKs (see 0001_initial.sql notes — `wrangler d1 execute --file` doesn't
-- reliably honour `PRAGMA foreign_keys`). Referential intent lives in code.

CREATE TABLE IF NOT EXISTS inbox_leads (
  id                   TEXT PRIMARY KEY,           -- l_xxxx
  customer_id          TEXT NOT NULL,
  name                 TEXT NOT NULL,
  phone                TEXT NOT NULL,
  email                TEXT,
  created_at           TEXT NOT NULL,              -- ISO
  last_updated_at      TEXT NOT NULL,              -- ISO
  last_interaction_at  TEXT NOT NULL,              -- ISO — drives the sort order in the list
  campaigns_json       TEXT NOT NULL,              -- LeadCampaignEntry[]
  messages_json        TEXT NOT NULL               -- LeadMessage[] (chat | voice | attempt)
);

-- Sort key for the inbox list rail.
CREATE INDEX IF NOT EXISTS idx_inbox_leads_last_interaction
  ON inbox_leads (last_interaction_at DESC);
-- Phone search lookup.
CREATE INDEX IF NOT EXISTS idx_inbox_leads_phone
  ON inbox_leads (phone);
