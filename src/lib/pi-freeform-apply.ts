/**
 * Ask Pi freeform-scope → freeform canvas mutation bridge.
 *
 * Analogue of {@link ./pi-canvas-apply.ts} for the WhatsApp Freeform
 * Workflow builder. Pi's freeform-scope `toolCalls` (insert_node /
 * connect_nodes / update_node against a workflowId) are folded into
 * ReactFlow node/edge mutations the FreeformCanvas can apply live on
 * the graph — no D1 re-read needed.
 *
 * The tool calls have already been executed server-side against D1 by
 * the time they arrive here (so refresh reflects the change). Applying
 * them here on the client is what makes the canvas VISIBLY update the
 * moment Pi answers — no round-trip, no rebuild.
 */
import type { Edge, Node } from "reactflow";
import type {
  FreeformNodeConfig,
  FreeformNodeKind,
} from "@/lib/freeform-types";
import { validateFreeformNode } from "@/lib/freeform-types";
import type { PiToolCallLog } from "@/lib/pi-canvas-apply";

/**
 * Expand a batched `insert_skeleton` server call into per-node
 * synthetic `insert_node` / `connect_nodes` entries the canvas apply
 * pipeline can consume uniformly. Mirrors `expandSkeletonCalls` in
 * `pi-canvas-apply.ts` but reads `workflowId` (freeform surface) instead
 * of `campaignId`.
 *
 * The server-side `insertFreeformSkeleton` already wrote every node +
 * edge to D1 in one round-trip — this expansion is purely how the
 * client canvas learns about each node individually so the incremental
 * ReactFlow state updates + skeleton strip logic keeps working without
 * a new code path.
 */
export function expandFreeformSkeletonCalls(
  toolCalls: PiToolCallLog[],
): PiToolCallLog[] {
  const out: PiToolCallLog[] = [];
  for (const tc of toolCalls) {
    if (tc.name !== "insert_skeleton") {
      out.push(tc);
      continue;
    }
    let args: {
      workflowId?: string;
      skeleton?: {
        nodes?: Array<Record<string, unknown>>;
        edges?: Array<Record<string, unknown>>;
      };
    } = {};
    try {
      args = JSON.parse(tc.args);
    } catch {
      out.push(tc);
      continue;
    }
    const workflowId = args.workflowId;
    const nodes = args.skeleton?.nodes ?? [];
    const edges = args.skeleton?.edges ?? [];
    for (const n of nodes) {
      out.push({
        name: "insert_node",
        args: JSON.stringify({ workflowId, node: n }),
        result: JSON.stringify({ ok: true, fromSkeleton: true }),
      });
    }
    for (const e of edges) {
      out.push({
        name: "connect_nodes",
        args: JSON.stringify({ workflowId, edge: e }),
        result: JSON.stringify({ ok: true, fromSkeleton: true }),
      });
    }
  }
  return out;
}
import {
  stripFreeformDraftSkeletons,
  hasFreeformDraftSkeletons,
} from "@/lib/pi-freeform-skeleton";

/** Loose ReactFlow node shape — the freeform canvas mixes two data
 *  shapes (FreeformNodeData for freeform-owned kinds; WorkflowNodeData
 *  for shared logic kinds) and forcing one union here would fight the
 *  renderers. */
type CanvasNode = Node<Record<string, unknown>>;

/** Return value of `applyFreeformPiToolCallsToGraph`. */
export type FreeformApplyResult = {
  nodes: CanvasNode[];
  edges: Edge[];
  changed: boolean;
};

/**
 * Fold Pi's freeform tool calls into ReactFlow nodes/edges. Order
 * matters: an insert_node followed by a connect_nodes referring to that
 * new id must see the inserted node in the same pass. Every mutation
 * returns fresh arrays (never in-place) so ReactFlow re-renders cleanly.
 *
 * Read-only tools (list_freeform_workflows, focus_node) don't mutate;
 * they're silently ignored here. `focus_node` is handled by a separate
 * dispatcher on the canvas that selects the node + opens its config
 * panel.
 */
export function applyFreeformPiToolCallsToGraph(
  toolCalls: PiToolCallLog[],
  nodes: CanvasNode[],
  edges: Edge[],
): FreeformApplyResult {
  let ns = nodes;
  let es = edges;
  let changed = false;

  // If Pi is about to insert real nodes, strip any draft skeletons first
  // so the real nodes replace the placeholders cleanly. Detected by any
  // `_skel_*` id in the graph AND the presence of an insert_node in the
  // batch — the check on both sides means the strip only fires when
  // it's actually appropriate.
  const hasInsert = toolCalls.some((t) => t.name === "insert_node");
  if (hasInsert && hasFreeformDraftSkeletons(ns)) {
    const stripped = stripFreeformDraftSkeletons(ns, es);
    ns = stripped.nodes;
    es = stripped.edges;
    if (stripped.stripped) changed = true;
  }

  for (const tc of toolCalls) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.args) as Record<string, unknown>;
    } catch {
      continue;
    }

    switch (tc.name) {
      case "insert_node": {
        const node = args.node as
          | {
              id?: string;
              kind?: string;
              title?: string;
              description?: string;
              config?: Record<string, unknown>;
              position?: { x: number; y: number };
            }
          | undefined;
        if (!node?.id || !node?.kind || !node?.title) break;
        if (ns.some((n) => n.id === node.id)) break;

        // LTR position hint: right of the rightmost node. ELK will re-lay
        // once the graph stabilises.
        const maxX = ns.length ? Math.max(...ns.map((n) => n.position.x)) : 0;
        const avgY = ns.length
          ? Math.round(ns.reduce((s, n) => s + n.position.y, 0) / ns.length)
          : 0;
        const pos = node.position ?? { x: maxX + 260, y: avgY };

        // Freeform-owned kinds render through the "freeform" node type
        // (FreeformNode). Shared logic kinds (apiToolCall, conditional)
        // render through the campaign "workflow" node type. Matches
        // the split the server tool uses when persisting.
        const nodeType: string =
          node.kind === "apiToolCall" || node.kind === "conditional"
            ? "workflow"
            : "freeform";

        // Compute validity for freeform-owned kinds. Shared logic kinds
        // are treated as always-valid here (their real validators live
        // on the campaign side and run when the config panel opens).
        const isFreeformKind =
          node.kind === "text" || node.kind === "image" ||
          node.kind === "video" || node.kind === "document" ||
          node.kind === "list";
        const validity = isFreeformKind
          ? validateFreeformNode(
              node.kind as FreeformNodeKind,
              node.config as FreeformNodeConfig | undefined,
            )
          : { valid: true as const };

        ns = [
          ...ns,
          {
            id: node.id,
            type: nodeType,
            position: pos,
            data: {
              kind: node.kind,
              title: node.title,
              ...(node.description ? { description: node.description } : {}),
              ...(node.config !== undefined ? { config: node.config } : {}),
              valid: validity.valid,
              ...("error" in validity && validity.error
                ? { error: validity.error }
                : {}),
            },
          },
        ];
        changed = true;
        break;
      }

      case "connect_nodes": {
        const edge = args.edge as
          | {
              id?: string;
              source?: string;
              target?: string;
              sourceHandle?: string;
            }
          | undefined;
        if (!edge?.id || !edge?.source || !edge?.target) break;
        if (es.some((e) => e.id === edge.id)) break;
        es = [
          ...es,
          {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
            // Canonical edge type is the workspace's bezier `routed` edge
            // (matches the campaign canvas and freeform's own edge type).
            type: "routed",
          },
        ];
        changed = true;
        break;
      }

      case "update_node": {
        const nodeId = args.nodeId as string | undefined;
        const patch = args.patch as
          | {
              title?: string;
              description?: string;
              config?: Record<string, unknown>;
            }
          | undefined;
        if (!nodeId || !patch) break;
        const idx = ns.findIndex((n) => n.id === nodeId);
        if (idx < 0) break;
        const existing = ns[idx];
        const existingData = existing.data as {
          kind?: string;
          config?: Record<string, unknown>;
        };

        const nextConfig = patch.config !== undefined
          ? { ...(existingData.config ?? {}), ...patch.config }
          : existingData.config;
        const kind = existingData.kind ?? "";
        const isFreeformKind =
          kind === "text" || kind === "image" ||
          kind === "video" || kind === "document" ||
          kind === "list";
        const validity = isFreeformKind
          ? validateFreeformNode(
              kind as FreeformNodeKind,
              nextConfig as FreeformNodeConfig | undefined,
            )
          : { valid: true as const };

        ns = [
          ...ns.slice(0, idx),
          {
            ...existing,
            data: {
              ...existing.data,
              ...(patch.title !== undefined ? { title: patch.title } : {}),
              ...(patch.description !== undefined
                ? { description: patch.description }
                : {}),
              ...(patch.config !== undefined ? { config: nextConfig } : {}),
              valid: validity.valid,
              ...("error" in validity && validity.error
                ? { error: validity.error }
                : { error: undefined }),
            },
          },
          ...ns.slice(idx + 1),
        ];
        changed = true;
        break;
      }

      default:
        // Read-only / UI-intent tools (list_freeform_workflows, focus_node,
        // propose_draft, emit_choice, emit_action_link) don't mutate the
        // canvas. Silently ignored here — the composer handles them
        // separately (draft card, chips, action links, focus dispatch).
        break;
    }
  }

  return { nodes: ns, edges: es, changed };
}
