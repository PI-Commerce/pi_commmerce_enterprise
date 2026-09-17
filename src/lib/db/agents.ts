/**
 * Agent CRUD against D1.
 *
 * Companion to `campaigns.ts` — the `agents` table stores voice-agent config
 * (name, status, tools, master prompt, knowledge base, post-call vars, eval
 * prompt) and this module reads / writes it in the exact shape the client
 * `agent-store` uses. tools / post_call are JSON blobs; everything else is
 * a typed column so LLM filter tools can index on it.
 *
 * Server-only. Client bundles must not import this file.
 */
import type { AgentRecord, PostCallVar } from "@/lib/agent-data";
import { getDb } from "./client";

type AgentRow = {
  id: string;
  name: string;
  type: "voice";
  status: "live" | "draft" | "paused";
  tools_json: string;
  master_prompt: string;
  knowledge_base: string;
  post_call_json: string;
  eval_prompt: string | null;
  created_at: number;
  updated_at: number;
};

function rowToRecord(row: AgentRow): AgentRecord {
  let tools: string[] = [];
  let postCall: PostCallVar[] = [];
  try { tools = JSON.parse(row.tools_json) as string[]; } catch { /* keep [] */ }
  try { postCall = JSON.parse(row.post_call_json) as PostCallVar[]; } catch { /* keep [] */ }
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    tools,
    masterPrompt: row.master_prompt,
    knowledgeBase: row.knowledge_base,
    postCall,
    ...(row.eval_prompt ? { evalPrompt: row.eval_prompt } : {}),
  };
}

/** Return every agent in the workspace, keyed by id. */
export async function listAgents(): Promise<Record<string, AgentRecord>> {
  const rows = await getDb()
    .prepare("SELECT * FROM agents ORDER BY updated_at DESC")
    .all<AgentRow>();
  const out: Record<string, AgentRecord> = {};
  for (const r of rows.results ?? []) out[r.id] = rowToRecord(r);
  return out;
}

/** Fetch one agent by id. Returns null when not found. */
export async function readAgent(id: string): Promise<AgentRecord | null> {
  const row = await getDb()
    .prepare("SELECT * FROM agents WHERE id = ?")
    .bind(id)
    .first<AgentRow>();
  return row ? rowToRecord(row) : null;
}

/**
 * Upsert an agent. Creates the row on first save (created_at = now) and
 * bumps updated_at on every save so ORDER BY updated_at reflects recency.
 */
export async function upsertAgent(rec: AgentRecord): Promise<void> {
  const now = Date.now();
  await getDb()
    .prepare(
      `INSERT INTO agents (id, name, type, status, tools_json, master_prompt, knowledge_base, post_call_json, eval_prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         type = excluded.type,
         status = excluded.status,
         tools_json = excluded.tools_json,
         master_prompt = excluded.master_prompt,
         knowledge_base = excluded.knowledge_base,
         post_call_json = excluded.post_call_json,
         eval_prompt = excluded.eval_prompt,
         updated_at = excluded.updated_at`,
    )
    .bind(
      rec.id,
      rec.name,
      rec.type,
      rec.status,
      JSON.stringify(rec.tools ?? []),
      rec.masterPrompt ?? "",
      rec.knowledgeBase ?? "",
      JSON.stringify(rec.postCall ?? []),
      rec.evalPrompt ?? null,
      now,
      now,
    )
    .run();
}

/** Hard-delete an agent by id. No-op if the row is absent. */
export async function deleteAgent(id: string): Promise<void> {
  await getDb().prepare("DELETE FROM agents WHERE id = ?").bind(id).run();
}
