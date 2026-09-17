/**
 * Tool registry server functions — client entry points for D1-backed CRUD.
 *
 * Mirrors {@link ./agents.ts}. Every fn degrades gracefully when D1 isn't bound.
 */
import { createServerFn } from "@tanstack/react-start";
import type { ToolDef } from "@/lib/tool-registry";
import { getEnv } from "@/lib/db/client";
import * as toolsDb from "@/lib/db/tools";

// `ToolDef.mockResponse.body` is `unknown` which the react-start serializer
// rejects. Serialize it through a JSON string on the wire and re-parse on the
// client-side merge so the on-disk shape is preserved without lying to TS.
export type WireToolDef = Omit<ToolDef, "mockResponse"> & {
  mockResponse?: Omit<NonNullable<ToolDef["mockResponse"]>, "body"> & { body: string };
};

export type ListToolsResult =
  | { ok: true; tools: WireToolDef[] }
  | { ok: false; error: string };

export type SaveToolResult =
  | { ok: true }
  | { ok: false; error: string };

function toWire(t: ToolDef): WireToolDef {
  const { mockResponse, ...rest } = t;
  return mockResponse
    ? { ...rest, mockResponse: { ...mockResponse, body: JSON.stringify(mockResponse.body) } }
    : rest;
}

function fromWire(t: WireToolDef): ToolDef {
  const { mockResponse, ...rest } = t;
  if (!mockResponse) return rest as ToolDef;
  let body: unknown = mockResponse.body;
  try { body = JSON.parse(mockResponse.body); } catch { /* keep raw string */ }
  return { ...rest, mockResponse: { ...mockResponse, body } } as ToolDef;
}

/** Re-hydrate the `unknown` body on the client after a server-fn call. */
export function hydrateWireTools(list: WireToolDef[]): ToolDef[] {
  return list.map(fromWire);
}

function bailWithoutDb(): { ok: false; error: string } | null {
  try {
    const env = getEnv();
    if (!env.DB) return { ok: false, error: "d1_not_bound" };
    return null;
  } catch (e) {
    return { ok: false, error: `runtime_env_missing: ${(e as Error).message}` };
  }
}

/** Return every tool in D1. */
export const listToolsFn = createServerFn({ method: "POST" })
  .handler(async (): Promise<ListToolsResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      const tools = (await toolsDb.listTools()).map(toWire);
      return { ok: true, tools };
    } catch (e) {
      return { ok: false, error: `d1_read_failed: ${(e as Error).message}` };
    }
  });

/** Upsert one tool. */
export const saveToolFn = createServerFn({ method: "POST" })
  .inputValidator((rec: WireToolDef) => rec)
  .handler(async ({ data }): Promise<SaveToolResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await toolsDb.upsertTool(fromWire(data));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_write_failed: ${(e as Error).message}` };
    }
  });

/** Hard-delete one tool by handle. */
export const deleteToolFn = createServerFn({ method: "POST" })
  .inputValidator((handle: string) => handle)
  .handler(async ({ data: handle }): Promise<SaveToolResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await toolsDb.deleteTool(handle);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_delete_failed: ${(e as Error).message}` };
    }
  });
