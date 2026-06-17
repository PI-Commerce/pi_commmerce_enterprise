import { useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background, BackgroundVariant, Controls,
  type Edge, type Node, type NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import { nodeTypes } from "@/components/workflow/nodes";
import { edgeTypes } from "@/components/workflow/edges";
import type { WorkflowNodeData, NodeKind } from "@/lib/campaign-types";
import type { RunRow, SankeyNode, SankeyNodeKind } from "@/lib/analytics-data";
import { elkLayout } from "@/lib/flow-layout";

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

export function CampaignFlowView({
  run,
  onNodeClick,
}: {
  run: RunRow;
  onNodeClick: (n: SankeyNode) => void;
}) {
  // Build the positionless graph (matching the campaign builder visuals), then
  // lay it out with the async ELK layout at render-time.
  const { rawNodes, rawEdges } = useMemo(() => {
    const idToNode = new Map(run.sankey.nodes.map((n) => [n.id, n] as const));

    // Group each node's outgoing edges by source handle (value + label), so a
    // WhatsApp node's outcome split can be shown ON the node (not just the drawer).
    const outByNode = new Map<string, Map<string, { value: number; label?: string }>>();
    run.sankey.edges.forEach((e) => {
      if (!e.sourceHandle) return;
      let m = outByNode.get(e.source);
      if (!m) { m = new Map(); outByNode.set(e.source, m); }
      const prev = m.get(e.sourceHandle);
      if (prev) prev.value += e.value;
      else m.set(e.sourceHandle, { value: e.value, label: e.handleLabel });
    });
    // Nodes that render per-handle output rows (≥2 distinct outcome handles).
    const handleNodeIds = new Set<string>();

    const rawNodes: Node<WorkflowNodeData>[] = run.sankey.nodes.map((n) => {
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

      // WhatsApp outcome distribution shown inline as labeled output handles.
      let outputs: WorkflowNodeData["outputs"];
      if (n.kind === "whatsapp") {
        const m = outByNode.get(n.id);
        if (m && m.size >= 2) {
          const total = [...m.values()].reduce((s, v) => s + v.value, 0) || 1;
          outputs = [...m.entries()].map(([h, v]) => ({
            id: h,
            label: `${v.label ?? h} · ${Math.round((v.value / total) * 100)}%`,
            kind: "outcome" as const,
          }));
          handleNodeIds.add(n.id);
        }
      }

      return {
        id: n.id,
        type: "workflow",
        position: { x: 0, y: 0 },
        draggable: false,
        selectable: false,
        connectable: false,
        data: {
          kind: KIND_MAP[n.kind],
          title,
          subtitle,
          valid: true,
          locked: true,
          outputs,
          metrics: showMetrics
            ? { entered: n.entered, exited: n.exited, dropoffPct }
            : undefined,
        },
      };
    });

    const rawEdges: Edge[] = run.sankey.edges.map((e, i) => {
      const tgt = idToNode.get(e.target);
      const isDrop = tgt?.kind === "end" && !/convert|complete|resubmit/i.test(tgt?.name ?? "");
      const isConv = tgt?.kind === "end" && /convert|complete|resubmit/i.test(tgt?.name ?? "");
      const stroke = isConv ? "rgba(34,197,94,0.55)" : isDrop ? "rgba(239,68,68,0.45)" : "rgba(148,163,184,0.55)";
      return {
        id: `e_${i}`,
        source: e.source,
        // Anchor to the matching outcome handle only when the node renders them.
        sourceHandle: handleNodeIds.has(e.source) ? e.sourceHandle ?? undefined : undefined,
        target: e.target,
        type: "routed",
        animated: false,
        style: { stroke, strokeWidth: 1.5 },
      } satisfies Edge;
    });

    return { rawNodes, rawEdges };
  }, [run]);

  const [layout, setLayout] = useState<{ nodes: Node<WorkflowNodeData>[]; edges: Edge[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLayout(null);
    // elkLayout preserves each edge's colored `style`; it only fills position +
    // routed bend-points, so converted/dropped strokes survive.
    elkLayout(rawNodes, rawEdges).then((laid) => {
      if (!cancelled) setLayout(laid);
    });
    return () => { cancelled = true; };
  }, [rawNodes, rawEdges]);

  const handleNodeClick: NodeMouseHandler = (_evt, n) => {
    const data = run.sankey.nodes.find((x) => x.id === n.id);
    if (data) onNodeClick(data);
  };

  // Mount ReactFlow only once ELK has positioned the graph, so `fitView` runs
  // with real coordinates (and re-runs whenever the selected run changes).
  if (!layout) return <div className="h-full w-full" />;

  return (
    <ReactFlow
      nodes={layout.nodes}
      edges={layout.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
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
      defaultEdgeOptions={{ type: "routed" }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <Controls showInteractive={false} className="!shadow-none" />
    </ReactFlow>
  );
}
