/**
 * Construct validator — the client-side safety net.
 *
 * Prompt-only enforcement of the canonical construct rules (see
 * `pi-construct-rules.ts`) isn't enough. LLMs drift. So every batch of
 * `toolCalls` from Ask Pi flows through `validateAndHealPiToolCalls`
 * before it reaches `applyPiToolCallsToGraph` — the mutations that
 * survive are the ones that respect the platform's grammar.
 *
 * Two output modes:
 *
 *   1. **Auto-heal.** For violations we can safely coerce without changing
 *      the user's intent — wrong edge type, wrong node type on an
 *      insert_node, disallowed kind (aiTransform / abSplit as an
 *      insert), positions in the wrong direction. Silently corrected;
 *      an entry is added to `heals` so the UI can show a subtle
 *      "Pi's plan was cleaned up" note.
 *
 *   2. **Reject.** For violations that would break the graph if we
 *      applied them — inserting Start / Audience / End (they already
 *      exist and are locked), deleting Start / Audience / End,
 *      connecting to a node id that doesn't exist, self-loops. The
 *      offending tool call is dropped; an entry is added to `errors`
 *      that we can bounce back to Pi as a `tool_result` on the next
 *      turn (Phase C wiring) or surface as a chat banner right now.
 *
 * Pure. No IO. Idempotent — running it twice on the same batch produces
 * the same output. Depends only on the node registry + the current DSL
 * snapshot the client already has in memory.
 */
import type { PiToolCallLog } from "@/lib/pi-canvas-apply";
import type { Edge, Node } from "reactflow";
import type { WorkflowNodeData, NodeKind } from "@/lib/campaign-types";
import { NODE_REGISTRY, BUILDER_ALLOWED_KINDS, CANONICAL_UNDELETABLE_KINDS } from "@/lib/node-registry";

export type ValidatorHeal = {
  toolCallIndex: number;
  toolName: string;
  reason: string;
  detail: string;
};

export type ValidatorError = {
  toolCallIndex: number;
  toolName: string;
  reason: string;
  detail: string;
};

export type ValidatorResult = {
  toolCalls: PiToolCallLog[];
  heals: ValidatorHeal[];
  errors: ValidatorError[];
};

const KNOWN_KINDS = new Set(Object.keys(NODE_REGISTRY) as NodeKind[]);
const ALLOWED_INSERT_KINDS = new Set<string>(BUILDER_ALLOWED_KINDS);
const UNDELETABLE_KINDS = new Set<string>(CANONICAL_UNDELETABLE_KINDS);
// Ids the platform reserves for the pre-existing undeletable nodes on every
// blank canvas. Pi must never insert or reuse these ids.
const RESERVED_NODE_IDS = new Set(["start", "audience", "end"]);

/**
 * Validate + heal a batch of Pi tool calls against the canonical construct.
 *
 * `nodes` / `edges` are the CURRENT canvas state — used to check that
 * connect_nodes references real ids, that insert_node isn't duplicating an
 * existing id, that we don't blow away undeletable nodes.
 */
export function validateAndHealPiToolCalls(
  toolCalls: PiToolCallLog[],
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): ValidatorResult {
  const heals: ValidatorHeal[] = [];
  const errors: ValidatorError[] = [];
  // We build a virtual graph as we walk the batch so intra-batch references
  // (an insert_node followed by a connect_nodes to that id) validate
  // correctly. Start with the real state; add / remove as we go.
  const liveIds = new Set(nodes.map((n) => n.id));
  const liveEdgeIds = new Set(edges.map((e) => e.id));

  const out: PiToolCallLog[] = [];

  toolCalls.forEach((tc, i) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.args) as Record<string, unknown>;
    } catch {
      errors.push({ toolCallIndex: i, toolName: tc.name, reason: "malformed_args", detail: "tool call args were not valid JSON" });
      return;
    }

    switch (tc.name) {
      case "insert_node": {
        const node = args.node as {
          id?: string;
          kind?: string;
          title?: string;
          subtitle?: string;
          config?: Record<string, unknown>;
          position?: { x: number; y: number };
        } | undefined;
        if (!node?.id || !node?.kind || !node?.title) {
          errors.push({
            toolCallIndex: i,
            toolName: tc.name,
            reason: "missing_fields",
            detail: "insert_node requires node.id, node.kind, node.title",
          });
          return;
        }
        if (RESERVED_NODE_IDS.has(node.id)) {
          errors.push({
            toolCallIndex: i,
            toolName: tc.name,
            reason: "reserved_id",
            detail: `Node id \`${node.id}\` is reserved for the pre-existing ${node.id} node; Pi never inserts this.`,
          });
          return;
        }
        if (UNDELETABLE_KINDS.has(node.kind)) {
          errors.push({
            toolCallIndex: i,
            toolName: tc.name,
            reason: "cannot_insert_undeletable",
            detail: `Kind \`${node.kind}\` is one of the three pre-existing undeletable nodes; Pi never inserts a new one.`,
          });
          return;
        }
        if (!KNOWN_KINDS.has(node.kind as NodeKind)) {
          errors.push({
            toolCallIndex: i,
            toolName: tc.name,
            reason: "unknown_kind",
            detail: `Kind \`${node.kind}\` is not in the node registry. Allowed: ${[...ALLOWED_INSERT_KINDS].join(", ")}.`,
          });
          return;
        }
        if (!ALLOWED_INSERT_KINDS.has(node.kind)) {
          // aiTransform / abSplit — Pi has historically misused these.
          errors.push({
            toolCallIndex: i,
            toolName: tc.name,
            reason: "disallowed_kind_for_builder",
            detail: `Kind \`${node.kind}\` exists but Pi is not allowed to insert it. Allowed: ${[...ALLOWED_INSERT_KINDS].join(", ")}.`,
          });
          return;
        }
        if (liveIds.has(node.id)) {
          errors.push({
            toolCallIndex: i,
            toolName: tc.name,
            reason: "duplicate_id",
            detail: `Node id \`${node.id}\` already exists on the canvas.`,
          });
          return;
        }
        // Position auto-heal — coerce top-down into left-to-right. If Pi
        // stacked below the bottom-most node (Y increasing more than X),
        // reposition right of the rightmost existing node instead. ELK
        // relays afterwards; this only ensures the initial hint doesn't
        // fight the canonical direction.
        if (node.position && liveIds.size > 0) {
          const maxX = Math.max(...nodes.map((n) => n.position.x));
          if (node.position.x <= maxX && node.position.y > 0) {
            const healedPos = { x: maxX + 260, y: 0 };
            (node as { position?: { x: number; y: number } }).position = healedPos;
            args.node = node;
            heals.push({
              toolCallIndex: i,
              toolName: tc.name,
              reason: "coerced_position_to_ltr",
              detail: `Repositioned \`${node.id}\` to (${healedPos.x}, ${healedPos.y}) — left-to-right layout.`,
            });
          }
        }
        // All checks pass — record in the virtual graph and emit.
        liveIds.add(node.id);
        out.push({ ...tc, args: JSON.stringify(args) });
        return;
      }

      case "connect_nodes": {
        const edge = args.edge as {
          id?: string;
          source?: string;
          target?: string;
          sourceHandle?: string;
        } | undefined;
        if (!edge?.id || !edge?.source || !edge?.target) {
          errors.push({
            toolCallIndex: i,
            toolName: tc.name,
            reason: "missing_fields",
            detail: "connect_nodes requires edge.id, edge.source, edge.target",
          });
          return;
        }
        if (liveEdgeIds.has(edge.id)) {
          errors.push({
            toolCallIndex: i,
            toolName: tc.name,
            reason: "duplicate_edge",
            detail: `Edge id \`${edge.id}\` already exists.`,
          });
          return;
        }
        if (edge.source === edge.target) {
          errors.push({
            toolCallIndex: i,
            toolName: tc.name,
            reason: "self_loop",
            detail: `Edge \`${edge.id}\` is a self-loop (${edge.source} -> ${edge.source}). Not allowed.`,
          });
          return;
        }
        if (!liveIds.has(edge.source)) {
          errors.push({
            toolCallIndex: i,
            toolName: tc.name,
            reason: "unknown_source",
            detail: `Edge \`${edge.id}\` references a source node id \`${edge.source}\` that does not exist on the canvas.`,
          });
          return;
        }
        if (!liveIds.has(edge.target)) {
          errors.push({
            toolCallIndex: i,
            toolName: tc.name,
            reason: "unknown_target",
            detail: `Edge \`${edge.id}\` references a target node id \`${edge.target}\` that does not exist on the canvas.`,
          });
          return;
        }
        // The `type` coercion to `routed` happens inside applyPiToolCallsToGraph
        // already (edges always render as bezier). Nothing to heal here.
        liveEdgeIds.add(edge.id);
        out.push(tc);
        return;
      }

      case "update_node": {
        const nodeId = args.nodeId as string | undefined;
        const patch = args.patch as { title?: string; subtitle?: string; config?: Record<string, unknown> } | undefined;
        if (!nodeId || !patch) {
          errors.push({
            toolCallIndex: i,
            toolName: tc.name,
            reason: "missing_fields",
            detail: "update_node requires nodeId and patch",
          });
          return;
        }
        if (!liveIds.has(nodeId)) {
          errors.push({
            toolCallIndex: i,
            toolName: tc.name,
            reason: "unknown_target",
            detail: `update_node references node id \`${nodeId}\` that does not exist on the canvas.`,
          });
          return;
        }
        // update_node is legal on ALL nodes including undeletable ones
        // (Audience schema edits are Pi's job). We don't gate here.
        out.push(tc);
        return;
      }

      default:
        // Read-only tools (read_campaign / list_agents / count_leads / ...)
        // and propose_draft flow through unchanged — the validator only cares
        // about the three mutation tools.
        out.push(tc);
        return;
    }
  });

  return { toolCalls: out, heals, errors };
}
