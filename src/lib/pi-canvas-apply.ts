/**
 * Ask Pi builder-scope → canvas mutation bridge.
 *
 * The `askPi` server function returns a `toolCalls` log alongside the LLM's
 * textual answer. When the LLM is in `builder` scope, those tool calls are
 * the concrete edits the user asked for (insert this node, connect these
 * two, patch that config). This module converts each tool call into a
 * ReactFlow node/edge mutation the WorkflowCanvas can apply on the live
 * graph, without re-fetching from D1.
 *
 * The tool calls have already been executed server-side against D1 by the
 * time they arrive here (so refresh reflects the change). Applying them
 * here on the client is what makes the canvas VISIBLY update the moment
 * Pi answers — no round-trip, no rebuild.
 */
import type { Edge, Node } from "reactflow";
import type { WorkflowNodeData } from "@/lib/campaign-types";

/** One entry in the server fn's `toolCalls` array. */
export type PiToolCallLog = {
  name: string;
  /** JSON-encoded argument object as the LLM emitted it. */
  args: string;
  /** JSON-encoded return value from the server-side tool implementation. */
  result: string;
};

/**
 * Fold Pi's tool calls into ReactFlow nodes/edges. Order matters: an
 * insert_node followed by a connect_nodes referring to that new id
 * must see the inserted node in the same pass. Every mutation returns
 * fresh arrays (never in-place) so ReactFlow re-renders cleanly.
 */
export function applyPiToolCallsToGraph(
  toolCalls: PiToolCallLog[],
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[]; changed: boolean } {
  let ns = nodes;
  let es = edges;
  let changed = false;

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
              subtitle?: string;
              config?: Record<string, unknown>;
              position?: { x: number; y: number };
            }
          | undefined;
        if (!node?.id || !node?.kind || !node?.title) break;
        if (ns.some((n) => n.id === node.id)) break;
        // Compute a position: below the current bottom-most node.
        const maxY = ns.length ? Math.max(...ns.map((n) => n.position.y)) : 0;
        const avgX = ns.length
          ? Math.round(ns.reduce((s, n) => s + n.position.x, 0) / ns.length)
          : 0;
        const pos = node.position ?? { x: avgX, y: maxY + 140 };
        ns = [
          ...ns,
          {
            id: node.id,
            // All non-start/end nodes render through the shared "workflow"
            // node type; kind lives in `data.kind`. Using node.kind as the
            // ReactFlow `type` renders an empty box because no custom
            // nodeType is registered for e.g. "voice" or "conditional".
            type: "workflow",
            position: pos,
            data: {
              title: node.title,
              subtitle: node.subtitle,
              kind: node.kind,
              config: node.config,
              valid: true,
            } as unknown as WorkflowNodeData,
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
            sourceHandle: edge.sourceHandle,
            type: "smoothstep",
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
              subtitle?: string;
              config?: Record<string, unknown>;
            }
          | undefined;
        if (!nodeId || !patch) break;
        const idx = ns.findIndex((n) => n.id === nodeId);
        if (idx < 0) break;
        const existing = ns[idx];
        ns = [
          ...ns.slice(0, idx),
          {
            ...existing,
            data: {
              ...existing.data,
              ...(patch.title !== undefined ? { title: patch.title } : {}),
              ...(patch.subtitle !== undefined ? { subtitle: patch.subtitle } : {}),
              ...(patch.config !== undefined
                ? { config: { ...(existing.data.config ?? {}), ...patch.config } }
                : {}),
            } as WorkflowNodeData,
          },
          ...ns.slice(idx + 1),
        ];
        changed = true;
        break;
      }
      default:
        // Read-only tools (read_campaign, list_campaigns, count_leads, ...)
        // don't mutate the canvas. Silently ignored — their results already
        // fed the LLM's reasoning.
        break;
    }
  }

  return { nodes: ns, edges: es, changed };
}

/**
 * Compact human-readable summary of what Pi did, shown in the composer's
 * result panel above the LLM's textual answer.
 *
 * "+ Voice AI Agent (voice_recovery)\n+ wa_send_1.failed → voice_recovery"
 */
export function summarizePiEdits(toolCalls: PiToolCallLog[]): string[] {
  const lines: string[] = [];
  for (const tc of toolCalls) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.args) as Record<string, unknown>;
    } catch {
      continue;
    }
    switch (tc.name) {
      case "insert_node": {
        const node = args.node as { id?: string; title?: string; kind?: string } | undefined;
        if (node?.title && node?.id) {
          lines.push(`+ ${node.title}${node.kind ? ` (${node.kind})` : ""}`);
        }
        break;
      }
      case "connect_nodes": {
        const edge = args.edge as
          | { source?: string; target?: string; sourceHandle?: string }
          | undefined;
        if (edge?.source && edge?.target) {
          lines.push(
            `+ ${edge.source}${edge.sourceHandle ? `.${edge.sourceHandle}` : ""} → ${edge.target}`,
          );
        }
        break;
      }
      case "update_node": {
        const nodeId = args.nodeId as string | undefined;
        if (nodeId) lines.push(`~ patched ${nodeId}`);
        break;
      }
    }
  }
  return lines;
}
