/**
 * Freeform workflow server functions — client entry points for D1-backed CRUD.
 *
 * Mirrors {@link ./agents.ts}. Every fn degrades gracefully when D1 isn't bound.
 *
 * Wire shape: `FreeformNodeRecord.data.config` is typed as
 * `FreeformNodeConfig | Record<string, unknown>` which the react-start
 * serializer refuses. So we JSON-stringify the whole nodes + edges arrays on
 * the wire and re-parse on the client, same trick as `tools.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import type {
  FreeformEdgeRecord,
  FreeformNodeRecord,
  FreeformWorkflowRow,
} from "@/lib/freeform-types";
import { getEnv } from "@/lib/db/client";
import * as freeformDb from "@/lib/db/freeform-workflows";

// Wire replaces the two graph arrays with JSON strings so `unknown` payloads
// don't hit the serializer.
export type WireFreeformWorkflow = Omit<FreeformWorkflowRow, "nodes" | "edges"> & {
  nodesJson: string;
  edgesJson: string;
};

export type ListFreeformWorkflowsResult =
  | { ok: true; workflows: WireFreeformWorkflow[] }
  | { ok: false; error: string };

export type SaveFreeformWorkflowResult =
  | { ok: true }
  | { ok: false; error: string };

function toWire(w: FreeformWorkflowRow): WireFreeformWorkflow {
  const { nodes, edges, ...rest } = w;
  return {
    ...rest,
    nodesJson: JSON.stringify(nodes ?? []),
    edgesJson: JSON.stringify(edges ?? []),
  };
}

function fromWire(w: WireFreeformWorkflow): FreeformWorkflowRow {
  const { nodesJson, edgesJson, ...rest } = w;
  let nodes: FreeformNodeRecord[] = [];
  let edges: FreeformEdgeRecord[] = [];
  try { nodes = JSON.parse(nodesJson) as FreeformNodeRecord[]; } catch { /* keep [] */ }
  try { edges = JSON.parse(edgesJson) as FreeformEdgeRecord[]; } catch { /* keep [] */ }
  return { ...rest, nodes, edges };
}

/** Re-hydrate the graph arrays on the client after a server-fn call. */
export function hydrateWireFreeformWorkflows(list: WireFreeformWorkflow[]): FreeformWorkflowRow[] {
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

/** Return every freeform workflow in D1. */
export const listFreeformWorkflowsFn = createServerFn({ method: "POST" })
  .handler(async (): Promise<ListFreeformWorkflowsResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      const workflows = (await freeformDb.listFreeformWorkflows()).map(toWire);
      return { ok: true, workflows };
    } catch (e) {
      return { ok: false, error: `d1_read_failed: ${(e as Error).message}` };
    }
  });

/** Upsert one freeform workflow. */
export const saveFreeformWorkflowFn = createServerFn({ method: "POST" })
  .inputValidator((rec: WireFreeformWorkflow) => rec)
  .handler(async ({ data }): Promise<SaveFreeformWorkflowResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await freeformDb.upsertFreeformWorkflow(fromWire(data));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_write_failed: ${(e as Error).message}` };
    }
  });

/** Hard-delete one freeform workflow by id. */
export const deleteFreeformWorkflowFn = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }): Promise<SaveFreeformWorkflowResult> => {
    const bail = bailWithoutDb();
    if (bail) return bail;
    try {
      await freeformDb.deleteFreeformWorkflow(id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `d1_delete_failed: ${(e as Error).message}` };
    }
  });

/** Helper for client callers: convert a runtime record to wire shape. */
export function freeformToWire(w: FreeformWorkflowRow): WireFreeformWorkflow {
  return toWire(w);
}
