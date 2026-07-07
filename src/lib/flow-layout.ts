/**
 * Shared left-to-right graph layout for the campaign canvas.
 *
 * Uses elkjs (ELK "layered" / Sugiyama-style ranking) so branchy flows lay out
 * cleanly — ranks flow left→right, siblings stack vertically with real spacing,
 * and crucially ELK's `considerModelOrder` makes downstream node placement
 * follow the order in which we declared branch output ports/edges, so a branch
 * that sits below keeps its follow-up nodes below (no diagonal cross-overs).
 * Orthogonal edge routing yields interior bend-points that the custom
 * `RoutedEdge` threads through clean lanes. Used by the example library, the
 * campaign builder canvas, and the Analytics flow view so every surface reads
 * the same.
 *
 * ELK is asynchronous, so layout runs at render-time (not module-eval): example
 * graphs ship positionless and are laid out when actually rendered.
 */
import ELK from "elkjs/lib/elk.bundled.js";
import type { Edge, Node } from "reactflow";
import type { NodeKind, WorkflowNodeData } from "./campaign-types";

export type Point = { x: number; y: number };

const elk = new ELK();

const LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  // Respect the order nodes/edges were declared in so branch placement matches
  // the top→bottom port order (the whole point of switching off dagre).
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
  // Orthogonal routing produces edge.sections[].bendPoints that RoutedEdge draws.
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.spacing.nodeNodeBetweenLayers": "120",
  "elk.spacing.nodeNode": "52",
  "elk.spacing.edgeNode": "24",
  "elk.spacing.edgeEdge": "16",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
};

/** Estimate a node's rendered footprint so ELK reserves the right space. */
export function estimateNodeSize(
  kind: NodeKind,
  outputsCount = 0,
  hasMetrics = false,
): { width: number; height: number } {
  if (kind === "start" || kind === "end") return { width: 130, height: 44 };
  let height = 72; // icon + title + subtitle
  if (outputsCount > 0) height += outputsCount * 24 + 8; // stacked output ports
  if (hasMetrics) height += 40; // inline analytics metrics row
  return { width: 240, height };
}

/**
 * Lay a ReactFlow graph out left→right with ELK and return laid-out copies of
 * the nodes (with `position`) and edges (with `type:"routed"` + interior
 * `data.points`). Operates directly on RF nodes so callers don't repeat the
 * size mapping. Never mutates the inputs.
 *
 * ELK node coords are top-left (== RF `position`). Edge `section.bendPoints` are
 * interior route points in the same coordinate space — RoutedEdge supplies its
 * own source/target handle endpoints, so we hand it only the bend-points.
 */
export async function elkLayout(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): Promise<{ nodes: Node<WorkflowNodeData>[]; edges: Edge[] }> {
  if (nodes.length === 0) return { nodes, edges };

  const ids = new Set(nodes.map((n) => n.id));
  const safeEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));

  const graph = {
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
    children: nodes.map((n) => {
      const { width, height } = estimateNodeSize(
        n.data.kind,
        n.data.outputs?.length ?? 0,
        !!n.data.metrics,
      );
      return { id: n.id, width, height };
    }),
    edges: safeEdges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  let laid: Awaited<ReturnType<typeof elk.layout>>;
  try {
    laid = await elk.layout(graph);
  } catch {
    // If ELK ever fails, leave the graph untouched rather than crashing.
    return { nodes, edges };
  }

  const posById = new Map<string, Point>();
  for (const c of laid.children ?? []) {
    posById.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
  }

  const pointsById = new Map<string, Point[]>();
  for (const e of laid.edges ?? []) {
    const section = e.sections?.[0];
    const bends = (section?.bendPoints ?? []).map((p: Point) => ({ x: p.x, y: p.y }));
    pointsById.set(e.id, bends);
  }

  return {
    nodes: nodes.map((n) => ({ ...n, position: posById.get(n.id) ?? n.position })),
    edges: edges.map((e) => ({
      ...e,
      type: "routed",
      data: { ...(e.data ?? {}), points: pointsById.get(e.id) ?? [] },
    })),
  };
}
