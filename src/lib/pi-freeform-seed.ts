/**
 * Freeform Pi — shared node-config seeding logic.
 *
 * Extracted so BOTH the server-side skill (insertFreeformSkeleton in
 * pi-freeform-skills.ts) AND the client-side apply
 * (applyFreeformPiToolCallsToGraph in pi-freeform-apply.ts) run the
 * exact same seeding pipeline. Before this split, only the server
 * seeded — meaning list rows / quick-reply buttons persisted to D1
 * correctly but the client canvas rendered from Pi's raw tool call
 * args (which often omitted `config`) and showed blank cards until
 * the next refresh.
 *
 * The pipeline:
 *  1. Pre-scan the skeleton's edges to discover which node ids need
 *     HOW MANY branching handles (btn_b1..bN, row_r1..rN).
 *  2. Auto-seed a structural config (buttonsBlock / rows) with
 *     placeholder "Option 1..N" labels so handles exist immediately.
 *  3. Merge Pi's per-node config over the auto scaffold — Pi's
 *     labels / links / rows override placeholders BY ID.
 */
import type {
  FreeformNodeConfig,
  FreeformNodeKind,
} from "@/lib/freeform-types";

/** Node kinds owned by the FreeformNode renderer (react-flow
 *  `type: "freeform"`) vs shared logic kinds owned by the campaign
 *  WorkflowNode (`type: "workflow"`). */
export const FREEFORM_OWNED_KINDS = new Set<string>([
  "text",
  "image",
  "video",
  "document",
  "list",
]);

/** Skeleton edge shape used by both call sites. Only the fields
 *  needed for handle-id scanning. */
export type SeedScanEdge = {
  source: string;
  target: string;
  sourceHandle?: string;
};

/**
 * Pre-scan a batch of skeleton edges. Returns per-source-node sets of
 * button ids (from `sourceHandle: "btn_<id>"`) and row ids (from
 * `sourceHandle: "row_<id>"`). Feeds seedFreeformStructuralConfig so
 * the seeded handles match the wired edges exactly.
 */
export function scanBranchingHandles(edges: SeedScanEdge[]): {
  buttonIdsPerNode: Map<string, Set<string>>;
  rowIdsPerNode: Map<string, Set<string>>;
} {
  const buttonIdsPerNode = new Map<string, Set<string>>();
  const rowIdsPerNode = new Map<string, Set<string>>();
  for (const e of edges) {
    const h = e.sourceHandle;
    if (!h) continue;
    if (h.startsWith("btn_")) {
      const set = buttonIdsPerNode.get(e.source) ?? new Set<string>();
      set.add(h.slice(4));
      buttonIdsPerNode.set(e.source, set);
    } else if (h.startsWith("row_")) {
      const set = rowIdsPerNode.get(e.source) ?? new Set<string>();
      set.add(h.slice(4));
      rowIdsPerNode.set(e.source, set);
    }
  }
  return { buttonIdsPerNode, rowIdsPerNode };
}

/**
 * Seed the structural (branching) fields of a freeform node config so
 * the sourceHandle edges in the skeleton land on real handles. Content
 * fields (text, caption, mediaUrl, buttonLabel copy) are left blank
 * unless Pi's `config` provides them — that's Phase 2's job.
 *
 * Placeholder labels ("Option 1", "Option 2", ...) so branches are
 * legible on the node card until Pi's real labels arrive.
 */
export function seedFreeformStructuralConfig(
  kind: string,
  needs: string[] | undefined,
  wiredButtonIds: string[],
  wiredRowIds: string[],
): FreeformNodeConfig | undefined {
  const wantsButtons =
    wiredButtonIds.length > 0
    || (Array.isArray(needs) && needs.includes("buttonsBlock"));
  const wantsRows =
    wiredRowIds.length > 0
    || kind === "list"
    || (Array.isArray(needs) && needs.includes("rows"));

  const canHaveButtons =
    kind === "text" || kind === "image" || kind === "video" || kind === "document";
  if (canHaveButtons && wantsButtons) {
    const buttonIds = wiredButtonIds.length > 0 ? wiredButtonIds : ["b1", "b2", "b3"];
    return {
      buttonsBlock: {
        mode: "quick_reply",
        buttons: buttonIds.map((id, i) => ({ id, label: `Option ${i + 1}` })),
      },
    };
  }

  if (wantsRows) {
    // Meta caps at 10 rows; if Pi's plan wires more we truncate.
    const rowIds = wiredRowIds.length > 0 ? wiredRowIds.slice(0, 10) : ["r1", "r2", "r3"];
    return {
      rows: rowIds.map((id, i) => ({ id, title: `Option ${i + 1}` })),
    };
  }

  // Text without buttons, image / video / document without buttons: no
  // structural seeding — the node needs content (text / caption / media
  // source), not handles.
  return undefined;
}

/**
 * Merge Pi's per-node config over the auto-seeded structural scaffold.
 *
 *  - list.rows: Pi's rows override placeholders BY ID. If Pi supplies
 *    a title for row id "r1", that replaces "Option 1" while r2..r5
 *    keep their placeholders. Row ids Pi wired but didn't seed stay
 *    as placeholders.
 *  - buttonsBlock: Pi's full block replaces the auto scaffold (mode
 *    switch — quick_reply vs cta_url — is meaningful; can't be
 *    partial).
 *  - content fields (text body, caption, mediaUrl, apiTool, ...): pass
 *    through unchanged.
 */
export function mergePiConfig(
  auto: FreeformNodeConfig | undefined,
  pi: FreeformNodeConfig | Record<string, unknown> | undefined,
): FreeformNodeConfig | undefined {
  if (!pi) return auto;
  const merged: FreeformNodeConfig = { ...(auto ?? {}) };
  const piCast = pi as FreeformNodeConfig;

  if (Array.isArray(piCast.rows)) {
    const autoRows = Array.isArray(merged.rows) ? merged.rows : [];
    const piRows = piCast.rows as Array<{ id?: string; title?: string; description?: string }>;
    const byId = new Map(autoRows.map((r) => [r.id, r] as const));
    for (const r of piRows) {
      if (!r.id) continue;
      const existing = byId.get(r.id);
      byId.set(r.id, {
        id: r.id,
        title: r.title ?? existing?.title ?? "",
        ...(r.description
          ? { description: r.description }
          : existing?.description ? { description: existing.description } : {}),
      });
    }
    merged.rows = Array.from(byId.values());
  }

  if (piCast.buttonsBlock) {
    merged.buttonsBlock = piCast.buttonsBlock;
  }

  for (const key of [
    "text", "body", "header", "footer", "buttonLabel",
    "caption", "mediaSource", "mediaUrl", "mediaFileName",
  ] as const) {
    const v = (piCast as Record<string, unknown>)[key];
    if (v !== undefined) (merged as Record<string, unknown>)[key] = v;
  }

  return Object.keys(merged).length ? merged : undefined;
}

/**
 * One-shot: compute the final seeded config for a single skeleton node
 * given the batch's edges + Pi's optional per-node config override.
 * Convenience for callers that want a single call instead of the
 * three-step scan → seed → merge.
 */
export function buildFreeformNodeConfig(
  nodeId: string,
  kind: string,
  needs: string[] | undefined,
  piConfig: Record<string, unknown> | FreeformNodeConfig | undefined,
  handles: {
    buttonIdsPerNode: Map<string, Set<string>>;
    rowIdsPerNode: Map<string, Set<string>>;
  },
): FreeformNodeConfig | undefined {
  const auto = seedFreeformStructuralConfig(
    kind,
    needs,
    Array.from(handles.buttonIdsPerNode.get(nodeId) ?? []),
    Array.from(handles.rowIdsPerNode.get(nodeId) ?? []),
  );
  return mergePiConfig(auto, piConfig);
}

/** Re-export so consumers don't need a second import. */
export type { FreeformNodeConfig, FreeformNodeKind };
