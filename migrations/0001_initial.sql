-- Phase 3 initial schema.
--
-- Design goals:
--   1. Ask Pi's LLM can read this whole workspace with a small number of
--      strongly-typed SQL queries (campaigns / runs / leads / nodes / templates
--      / agents / tools / freeform_workflows).
--   2. Ask Pi can also *mutate* the workspace through the same shape it reads —
--      creating a campaign is INSERT into `campaigns`, adding a node is one row
--      in `campaign_nodes`, wiring nodes is one row in `campaign_edges`.
--   3. Everything the UI reads today (Analytics dashboards, Leads table,
--      Campaigns list, Templates page, Agents page, Runs list) has a first-class
--      table so migrating a read path from in-memory to D1 is a mechanical swap.
--
-- Two encoding rules:
--   - Anything that varies per-instance and doesn't need query-time filtering
--     (a node's `config`, a tool's `inputs` schema, an agent's `postCall` vars)
--     lives in a JSON TEXT column with a `_json` suffix.
--   - Anything the LLM would want to filter, group, or aggregate is its own
--     column (status, channel, node kind, dpd bucket, ...).

/* ---------- Campaigns ------------------------------------------------------ */
-- Every campaign is a DAG. `campaign_nodes` + `campaign_edges` carry the graph;
-- `campaigns` carries the top-level metadata.
CREATE TABLE IF NOT EXISTS campaigns (
  id                TEXT PRIMARY KEY,          -- e.g. "c_ex4", "c_ex_soundbox"
  name              TEXT NOT NULL,             -- "BFSI · Insurance Renewal"
  vertical          TEXT NOT NULL,             -- "bfsi" | "retail" | "d2c" | "b2b"
  status            TEXT NOT NULL,             -- draft | ready | running | paused | locked
  description       TEXT,
  created_at        INTEGER NOT NULL,          -- unix ms
  updated_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_nodes (
  id                TEXT NOT NULL,             -- unique within campaign, e.g. "apiTier"
  campaign_id       TEXT NOT NULL,
  kind              TEXT NOT NULL,             -- NodeKind: start | end | audience | apiToolCall | conditional | abSplit | delay | voiceCall | whatsapp | whatsappFreeform | sms | rcs | aiTransform
  title             TEXT NOT NULL,
  subtitle          TEXT,
  serial            TEXT,                       -- "whatsapp_2", "voice_1" — matches the canvas
  position_x        REAL DEFAULT 0,
  position_y        REAL DEFAULT 0,
  config_json       TEXT NOT NULL DEFAULT '{}', -- PresetConfig blob
  outputs_json      TEXT NOT NULL DEFAULT '[]', -- NodeOutput[]
  PRIMARY KEY (campaign_id, id)
);
CREATE INDEX idx_campaign_nodes_campaign ON campaign_nodes(campaign_id);
CREATE INDEX idx_campaign_nodes_kind ON campaign_nodes(kind);

CREATE TABLE IF NOT EXISTS campaign_edges (
  id                TEXT NOT NULL,             -- unique within campaign
  campaign_id       TEXT NOT NULL,
  source_id         TEXT NOT NULL,             -- source campaign_node id
  target_id         TEXT NOT NULL,             -- target campaign_node id
  source_handle     TEXT,                       -- e.g. "success", "vA", "gold" — null = default
  PRIMARY KEY (campaign_id, id)
);
CREATE INDEX idx_campaign_edges_campaign ON campaign_edges(campaign_id);

/* ---------- Runs + Leads --------------------------------------------------- */
-- One row per run of a campaign. `leads` gets the per-lead per-run snapshot.
CREATE TABLE IF NOT EXISTS runs (
  id                TEXT PRIMARY KEY,          -- e.g. "r_9001"
  campaign_id       TEXT NOT NULL,
  code              TEXT NOT NULL,             -- "RUN-4201"
  name              TEXT NOT NULL,             -- "Run 1"
  status            TEXT NOT NULL,             -- pending | running | paused | completed | failed | terminated
  run_type          TEXT NOT NULL,             -- time-scoped | always-on
  trigger_mode      TEXT NOT NULL,             -- manual | api | schedule
  audience_source   TEXT NOT NULL,             -- csv | api
  audience_size     INTEGER NOT NULL,          -- total inputs at start
  total_leads       INTEGER NOT NULL,
  valid_leads       INTEGER NOT NULL,
  leads_processed   INTEGER NOT NULL DEFAULT 0,
  success_rate      REAL,                       -- 0..1
  started_at        INTEGER NOT NULL,          -- unix ms
  completed_at      INTEGER
);
CREATE INDEX idx_runs_campaign ON runs(campaign_id);
CREATE INDEX idx_runs_status ON runs(status);

-- Per-node aggregates. This is what Analytics dashboards read.
CREATE TABLE IF NOT EXISTS run_node_metrics (
  run_id            TEXT NOT NULL,
  node_id           TEXT NOT NULL,             -- campaign_nodes.id in this run's campaign
  entered           INTEGER NOT NULL DEFAULT 0,
  exited            INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, node_id)
);

-- Per-edge flow volumes (for the Sankey diagram).
CREATE TABLE IF NOT EXISTS run_edge_metrics (
  run_id            TEXT NOT NULL,
  edge_id           TEXT NOT NULL,
  source_id         TEXT NOT NULL,
  target_id         TEXT NOT NULL,
  source_handle     TEXT,
  value             INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, edge_id)
);

CREATE TABLE IF NOT EXISTS leads (
  id                TEXT PRIMARY KEY,          -- "L-10001"
  run_id            TEXT NOT NULL,
  campaign_id       TEXT NOT NULL,
  name              TEXT NOT NULL,
  phone             TEXT NOT NULL,
  email             TEXT,
  stage_node_id     TEXT NOT NULL,             -- current node in the DAG
  stage_kind        TEXT NOT NULL,             -- denorm of the node's kind, for filter speed
  channel           TEXT,                       -- whatsapp | voice | sms | rcs | null
  status            TEXT,                       -- sent | delivered | read | clicked | replied | converted | failed | dropped | pending | no_dlr | ...
  cost              REAL NOT NULL DEFAULT 0,
  duration_sec      INTEGER,                   -- voice-call duration
  attributes_json   TEXT NOT NULL DEFAULT '{}', -- per-campaign contact vars: policy_no, dpd, cart_value, etc
  updated_at        INTEGER NOT NULL           -- unix ms
);
CREATE INDEX idx_leads_run ON leads(run_id);
CREATE INDEX idx_leads_campaign ON leads(campaign_id);
CREATE INDEX idx_leads_stage_node ON leads(run_id, stage_node_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_channel ON leads(channel);

/* ---------- Templates ------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS wa_templates (
  id                TEXT PRIMARY KEY,          -- Meta numeric id
  name              TEXT NOT NULL UNIQUE,      -- semantic id: fcc_silver_perks
  category          TEXT NOT NULL,             -- Marketing | Utility | Authentication
  language          TEXT NOT NULL,             -- en, hi, ...
  format            TEXT NOT NULL,             -- TEXT | IMAGE | VIDEO | DOCUMENT
  status            TEXT NOT NULL,             -- Approved | Pending | Rejected | Draft
  created_at        TEXT NOT NULL,             -- "13 Jun 2026" display date
  header            TEXT,
  body              TEXT NOT NULL,
  footer            TEXT,
  buttons_json      TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_wa_templates_status ON wa_templates(status);

CREATE TABLE IF NOT EXISTS sms_templates (
  id                TEXT PRIMARY KEY,          -- DLT template id
  name              TEXT NOT NULL,
  pe_id             TEXT NOT NULL,             -- Principal Entity id
  sender_id         TEXT NOT NULL,             -- e.g. "PICOMM"
  category          TEXT NOT NULL,             -- Promotional | Transactional | Service | ...
  encoding          TEXT NOT NULL,             -- Text | Unicode
  body              TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rcs_templates (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  agent_id          TEXT NOT NULL,
  kind              TEXT NOT NULL,             -- text | card | carousel
  body              TEXT NOT NULL,
  suggestions_json  TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL
);

/* ---------- Agents + Tools ------------------------------------------------- */
CREATE TABLE IF NOT EXISTS agents (
  id                TEXT PRIMARY KEY,          -- "a_voice_react"
  name              TEXT NOT NULL,             -- "reactivation_voice"
  type              TEXT NOT NULL,             -- voice | chat
  status            TEXT NOT NULL,             -- live | draft | paused
  tools_json        TEXT NOT NULL DEFAULT '[]',-- string[] of tool handles
  master_prompt     TEXT NOT NULL,
  knowledge_base    TEXT NOT NULL DEFAULT '',
  post_call_json    TEXT NOT NULL DEFAULT '[]',
  eval_prompt       TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tools (
  handle            TEXT PRIMARY KEY,          -- "policy_lookup"
  description       TEXT NOT NULL,
  type              TEXT NOT NULL,             -- http
  method            TEXT NOT NULL,             -- GET | POST | PUT | DELETE
  url               TEXT NOT NULL,
  auth              TEXT NOT NULL,             -- none | apiKey | bearer | oauth2 | jwt
  health            TEXT NOT NULL,             -- ok | warn
  status            TEXT NOT NULL,             -- live | draft
  inputs_json       TEXT NOT NULL DEFAULT '[]',
  outputs_json      TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

/* ---------- Freeform Workflows -------------------------------------------- */
-- WhatsApp Freeform Workflows — sub-flows used inside the 24h customer-service
-- window. Reusable across campaigns; picked by the `whatsappFreeform` node.
CREATE TABLE IF NOT EXISTS freeform_workflows (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL,             -- draft | ready
  locked            INTEGER NOT NULL DEFAULT 0,
  locked_at         INTEGER,
  used_in_campaigns INTEGER NOT NULL DEFAULT 0,
  nodes_json        TEXT NOT NULL DEFAULT '[]',
  edges_json        TEXT NOT NULL DEFAULT '[]',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

/* ---------- Broadcasts + Reports (light tables) --------------------------- */
CREATE TABLE IF NOT EXISTS broadcasts (
  id                TEXT PRIMARY KEY,          -- "bc_5011"
  name              TEXT NOT NULL,
  channel           TEXT NOT NULL,             -- whatsapp | sms | rcs
  asset_name        TEXT NOT NULL,             -- template name for display
  template_id       TEXT NOT NULL,             -- foreign to the channel template store
  csv_name          TEXT NOT NULL,
  status            TEXT NOT NULL,             -- running | paused | completed | terminated
  started_at        TEXT NOT NULL,
  completed_at     TEXT,
  sent              INTEGER NOT NULL DEFAULT 0,
  total             INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reports (
  id                TEXT PRIMARY KEY,          -- "rep_806"
  kind              TEXT NOT NULL,             -- campaign_leads | wa_logs | sms_logs | rcs_logs | voice_logs
  requested_at      INTEGER NOT NULL,          -- unix ms
  range_from        TEXT,                       -- YYYY-MM-DD
  range_to          TEXT,
  status            TEXT NOT NULL,             -- queued | processing | ready | failed | expired
  rows              INTEGER,
  file_size_kb      INTEGER,
  expires_at        INTEGER
);
