/**
 * DSL ↔ ReactFlow shape conversion.
 *
 * D1 stores each node as a {@link DslNode} (flat fields: id, kind, title,
 * subtitle, position, config, outputs). ReactFlow renders each node as
 * `Node<WorkflowNodeData>` (id, type, position, wrapped `data` object).
 * These helpers convert between them so the canvas can hydrate FROM D1 and
 * save BACK to D1 without duplicating shape logic across call sites.
 */
import type { Edge, Node } from "reactflow";
import type { WorkflowNodeData, NodeKind, NodeOutput } from "@/lib/campaign-types";
import type { CampaignDsl, DslNode, DslEdge } from "@/lib/db/campaigns";

export function dslNodeToReactFlow(n: DslNode): Node<WorkflowNodeData> {
  return {
    id: n.id,
    // Only the "workflow" node type is registered (see nodes.tsx `nodeTypes`).
    // The node's semantic kind lives in `data.kind`. Using `n.kind` here
    // would render every non-workflow node as an empty box on hydrate.
    type: "workflow",
    position: n.position ?? { x: 0, y: 0 },
    data: {
      kind: n.kind,
      title: n.title,
      subtitle: n.subtitle,
      serial: n.serial,
      config: n.config as WorkflowNodeData["config"],
      outputs: n.outputs,
      // Preserve Start / End immutability across hydrate — matches the
      // WorkflowCanvas INITIAL seed where these two are `locked: true`.
      ...(n.kind === "start" || n.kind === "end" ? { locked: true } : {}),
    },
  };
}

export function dslEdgeToReactFlow(e: DslEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    // Canonical bezier edge (see edges.tsx `RoutedEdge`). `smoothstep` gives
    // the wrong shape — square right-angle edges that clash with authored
    // example campaigns.
    type: "routed",
  };
}

export function reactFlowNodeToDsl(n: Node<WorkflowNodeData>): DslNode {
  return {
    id: n.id,
    kind: (n.data.kind ?? (n.type as NodeKind)) as NodeKind,
    title: n.data.title,
    subtitle: n.data.subtitle,
    serial: n.data.serial,
    position: n.position,
    config: n.data.config,
    outputs: n.data.outputs as NodeOutput[] | undefined,
  };
}

export function reactFlowEdgeToDsl(e: Edge): DslEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
  };
}

/** Full-graph conversion: DSL → ReactFlow. Used to hydrate the canvas. */
export function dslToReactFlow(dsl: CampaignDsl): {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
} {
  return {
    nodes: dsl.nodes.map(dslNodeToReactFlow),
    edges: dsl.edges.map(dslEdgeToReactFlow),
  };
}

/** Full-graph conversion: ReactFlow → DSL. Used by canvas Save. */
export function reactFlowToDsl(
  head: Omit<CampaignDsl, "nodes" | "edges">,
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): CampaignDsl {
  return {
    ...head,
    nodes: nodes.map(reactFlowNodeToDsl),
    edges: edges.map(reactFlowEdgeToDsl),
  };
}
