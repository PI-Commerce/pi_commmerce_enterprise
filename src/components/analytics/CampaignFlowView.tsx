import { useMemo } from "react";
import ReactFlow, {
  Background, BackgroundVariant, Controls,
  type Edge, type Node, type NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import { nodeTypes } from "@/components/workflow/nodes";
import type { WorkflowNodeData, NodeKind } from "@/lib/campaign-types";
import type { RunRow, SankeyNode, SankeyNodeKind } from "@/lib/analytics-data";

/** Map analytics SankeyNodeKind → Campaign Builder NodeKind so we can reuse
 *  the same visual node component the user designs the campaign with. */
const KIND_MAP: Record<SankeyNodeKind, NodeKind> = {
  start:       "start",
  audience:    "audience",
  abSplit:     "abSplit",
  whatsapp:    "whatsapp",
  voice:       "voiceCall",
  sms:         "sms",
  ads:         "adsCampaign",
  conditional: "conditional",
  delay:       "delay",
  end:         "end",
};

/** BFS layered layout: column = longest path from root, row = slot in column. */
function layout(nodes: SankeyNode[], edges: { source: string; target: string }[]) {
  const idToNode = new Map(nodes.map((n) => [n.id, n] as const));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  nodes.forEach((n) => { incoming.set(n.id, []); outgoing.set(n.id, []); });
  edges.forEach((e) => {
    outgoing.get(e.source)?.push(e.target);
    incoming.get(e.target)?.push(e.source);
  });

  // Longest-path depth so end nodes always sit to the right of every predecessor.
  const depth = new Map<string, number>();
  function computeDepth(id: string, seen = new Set<string>()): number {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = incoming.get(id) ?? [];
    const d = parents.length === 0 ? 0 : Math.max(...parents.map((p) => computeDepth(p, seen) + 1));
    depth.set(id, d);
    return d;
  }
  nodes.forEach((n) => computeDepth(n.id));

  // Group by depth, sort end-terminals to bottom of their column
  const cols = new Map<number, string[]>();
  nodes.forEach((n) => {
    const d = depth.get(n.id)!;
    if (!cols.has(d)) cols.set(d, []);
    cols.get(d)!.push(n.id);
  });

  const COL_W = 260;   // horizontal slot spacing
  const ROW_H = 160;   // vertical depth spacing (taller for inline metrics row)

  const positions = new Map<string, { x: number; y: number }>();
  cols.forEach((ids, depthLevel) => {
    ids.sort((a, b) => {
      const ka = idToNode.get(a)!.kind === "end" ? 1 : 0;
      const kb = idToNode.get(b)!.kind === "end" ? 1 : 0;
      return ka - kb;
    });
    const offset = -((ids.length - 1) * COL_W) / 2;
    ids.forEach((id, i) => positions.set(id, { x: offset + i * COL_W, y: depthLevel * ROW_H }));
  });
  return positions;
}

export function CampaignFlowView({
  run,
  onNodeClick,
}: {
  run: RunRow;
  onNodeClick: (n: SankeyNode) => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const positions = layout(run.sankey.nodes, run.sankey.edges);
    const idToNode = new Map(run.sankey.nodes.map((n) => [n.id, n] as const));

    const rfNodes: Node<WorkflowNodeData>[] = run.sankey.nodes.map((n) => {
      const isConverted = n.kind === "end" && /convert|complete|resubmit/i.test(n.name);
      const isDropped   = n.kind === "end" && !isConverted;
      const title = isConverted ? "Converted" : isDropped ? "End" : n.name.split(" · ")[0];
      const subtitle = n.kind === "end"
        ? `${n.entered.toLocaleString()} users`
        : n.name.includes(" · ")
          ? n.name.split(" · ").slice(1).join(" · ")
          : undefined;
      const dropoffPct = n.entered > 0 ? ((n.entered - n.exited) / n.entered) * 100 : 0;
      const showMetrics = n.kind !== "start" && n.kind !== "end";
      return {
        id: n.id,
        type: "workflow",
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        draggable: false,
        selectable: false,
        connectable: false,
        data: {
          kind: KIND_MAP[n.kind],
          title,
          subtitle,
          valid: true,
          locked: true,
          metrics: showMetrics
            ? { entered: n.entered, exited: n.exited, dropoffPct }
            : undefined,
        },
      };
    });


    const rfEdges: Edge[] = run.sankey.edges.map((e, i) => {
      const tgt = idToNode.get(e.target);
      const isDrop = tgt?.kind === "end" && !/convert|complete|resubmit/i.test(tgt?.name ?? "");
      const isConv = tgt?.kind === "end" && /convert|complete|resubmit/i.test(tgt?.name ?? "");
      const stroke = isConv ? "rgba(34,197,94,0.55)" : isDrop ? "rgba(239,68,68,0.45)" : "rgba(148,163,184,0.55)";
      return {
        id: `e_${i}`,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        animated: false,
        style: { stroke, strokeWidth: 1.5 },
      } satisfies Edge;
    });


    return { nodes: rfNodes, edges: rfEdges };
  }, [run]);

  const handleNodeClick: NodeMouseHandler = (_evt, n) => {
    const data = run.sankey.nodes.find((x) => x.id === n.id);
    if (data) onNodeClick(data);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
      minZoom={0.3}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: "smoothstep" }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <Controls showInteractive={false} className="!shadow-none" />
    </ReactFlow>
  );
}
