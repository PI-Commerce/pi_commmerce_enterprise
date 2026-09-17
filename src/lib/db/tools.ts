/**
 * Tool registry CRUD against D1.
 *
 * Mirrors {@link ./agents.ts}. The `tools` table stores the shape the Tools
 * page + Voice Agent tool picker read. `inputs_json` / `outputs_json` hold the
 * structured input / output declarations; the request-body tree, if any, is
 * serialised into `body` on the `inputs_json` blob (round-trip preserved as an
 * extra `_body` field). Legacy tools without a structured body are unaffected.
 *
 * Server-only.
 */
import type {
  BodyRoot,
  TestResponse,
  ToolAuthKind,
  ToolDef,
  ToolHealth,
  ToolInput,
  ToolOutput,
  ToolStatus,
  ToolType,
} from "@/lib/tool-registry";
import { getDb } from "./client";

type ToolRow = {
  handle: string;
  description: string;
  type: string;
  method: string;
  url: string;
  auth: string;
  health: string;
  status: string;
  inputs_json: string;
  outputs_json: string;
  created_at: string;
  updated_at: string;
};

type InputsBlob = {
  inputs?: ToolInput[];
  body?: BodyRoot;
  mockResponse?: TestResponse;
};

function rowToRecord(row: ToolRow): ToolDef {
  let inputs: ToolInput[] = [];
  let body: BodyRoot | undefined;
  let mockResponse: TestResponse | undefined;
  try {
    const parsed = JSON.parse(row.inputs_json) as ToolInput[] | InputsBlob;
    if (Array.isArray(parsed)) {
      inputs = parsed;
    } else {
      inputs = parsed.inputs ?? [];
      body = parsed.body;
      mockResponse = parsed.mockResponse;
    }
  } catch {
    /* keep defaults */
  }
  let outputs: ToolOutput[] = [];
  try { outputs = JSON.parse(row.outputs_json) as ToolOutput[]; } catch { /* keep [] */ }
  return {
    handle: row.handle,
    description: row.description,
    type: row.type as ToolType,
    method: row.method,
    url: row.url,
    auth: row.auth as ToolAuthKind,
    health: row.health as ToolHealth,
    status: row.status as ToolStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    inputs,
    ...(body ? { body } : {}),
    outputs,
    ...(mockResponse ? { mockResponse } : {}),
  };
}

/** Return every tool in the workspace. */
export async function listTools(): Promise<ToolDef[]> {
  const rows = await getDb()
    .prepare("SELECT * FROM tools")
    .all<ToolRow>();
  return (rows.results ?? []).map(rowToRecord);
}

/** Fetch one tool by handle. Returns null when not found. */
export async function readTool(handle: string): Promise<ToolDef | null> {
  const row = await getDb()
    .prepare("SELECT * FROM tools WHERE handle = ?")
    .bind(handle)
    .first<ToolRow>();
  return row ? rowToRecord(row) : null;
}

/** Upsert a tool. */
export async function upsertTool(rec: ToolDef): Promise<void> {
  // Store the body / mockResponse alongside inputs so the current D1 columns
  // carry every runtime field a caller might set.
  const inputsBlob: InputsBlob = {
    inputs: rec.inputs ?? [],
    ...(rec.body ? { body: rec.body } : {}),
    ...(rec.mockResponse ? { mockResponse: rec.mockResponse } : {}),
  };
  await getDb()
    .prepare(
      `INSERT INTO tools (handle, description, type, method, url, auth, health, status, inputs_json, outputs_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(handle) DO UPDATE SET
         description = excluded.description,
         type = excluded.type,
         method = excluded.method,
         url = excluded.url,
         auth = excluded.auth,
         health = excluded.health,
         status = excluded.status,
         inputs_json = excluded.inputs_json,
         outputs_json = excluded.outputs_json,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      rec.handle,
      rec.description,
      rec.type,
      rec.method ?? "",
      rec.url ?? "",
      rec.auth,
      rec.health,
      rec.status,
      JSON.stringify(inputsBlob),
      JSON.stringify(rec.outputs ?? []),
      rec.createdAt,
      rec.updatedAt,
    )
    .run();
}

/** Hard-delete a tool by handle. */
export async function deleteTool(handle: string): Promise<void> {
  await getDb().prepare("DELETE FROM tools WHERE handle = ?").bind(handle).run();
}
