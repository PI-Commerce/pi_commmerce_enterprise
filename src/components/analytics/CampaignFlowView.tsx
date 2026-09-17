import { createContext, useEffect, useMemo, useState, useContext } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { nodeTypes as builderNodeTypes, WorkflowNode } from "@/components/workflow/nodes";
import { edgeTypes } from "@/components/workflow/edges";
import { Eye } from "lucide-react";
import type { WorkflowNodeData, NodeKind } from "@/lib/campaign-types";
import type { RunRow, SankeyNode, SankeyNodeKind } from "@/lib/analytics-data";
import { elkLayout } from "@/lib/flow-layout";

/** Map analytics SankeyNodeKind → Campaign Builder NodeKind so we can reuse
 *  the same visual node component the user designs the campaign with. */
const KIND_MAP: Record<SankeyNodeKind, NodeKind> = {
  start: "start",
  audience: "audience",
  apiToolCall: "apiToolCall",
  abSplit: "abSplit",
  whatsapp: "whatsapp",
  whatsappFreeform: "whatsappFreeform",
  voice: "voiceCall",
  sms: "sms",
  rcs: "rcs",
  ads: "adsCampaign",
  conditional: "conditional",
  delay: "delay",
  aiTransform: "aiTransform",
  end: "end",
  needsReview: "needsReview",
};

/** Context carries the analytics-only "expand freeform" handler down to the
 *  wrapped node component so freeform nodes can render an eye button that fires
 *  the expansion overlay directly (bypassing the drawer). */
const FreeformExpandContext = createContext<((n: SankeyNode) => void) | null>(null);

/** Wrapped WorkflowNode used only in the analytics view. Adds a small eye
 *  button in the node card's top-right corner, but ONLY for freeform kinds. */
function AnalyticsWorkflowNode(props: NodeProps<WorkflowNodeData & { __sankey?: SankeyNode }>) {
  const onExpand = useContext(FreeformExpandContext);
  const sankey = props.data.__sankey;
  const isFreeform = props.data.kind === "whatsappFreeform";
  return (
    <div className="relative">
      <WorkflowNode {...props} />
      {isFreeform && sankey && onExpand && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExpand(sankey);
          }}
          className="pointer-events-auto absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-md border border-border bg-background/95 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
          title="Expand freeform workflow"
        >
          <Eye className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/** Analytics-scoped node types map. Overrides the builder's `workflow` entry so
 *  freeform nodes pick up the eye-button decoration. */
const nodeTypes = { ...builderNodeTypes, workflow: AnalyticsWorkflowNode };

export function CampaignFlowView({
  run,
  onNodeClick,
  onExpandFreeform,
}: {
  run: RunRow;
  onNodeClick: (n: SankeyNode) => void;
  onExpandFreeform?: (n: SankeyNode) => void;
}) {
  // Build the positionless graph (matching the campaign builder visuals), then
  // lay it out with the async ELK layout at render-time.
  const { rawNodes, rawEdges } = useMemo(() => {
    const idToNode = new Map(run.sankey.nodes.map((n) => [n.id, n] as const));
    // Serial = the node's position in the run's authored flow order (Start = 1).
    // Shown in the node sub-heading so it matches the Leads table's "<serial> · name".
    const serialById = new Map(
      run.sankey.nodes.map((n, i) => [n.id, i + 1] as const),
    );

    // Group each node's outgoing edges by source handle (value + label), so a
    // WhatsApp node's outcome split can be shown ON the node (not just the drawer).
    const outByNode = new Map<
      string,
      Map<string, { value: number; label?: string }>
    >();
    run.sankey.edges.forEach((e) => {
      if (!e.sourceHandle) return;
      let m = outByNode.get(e.source);
      if (!m) {
        m = new Map();
        outByNode.set(e.source, m);
      }
      const prev = m.get(e.sourceHandle);
      if (prev) prev.value += e.value;
      else m.set(e.sourceHandle, { value: e.value, label: e.handleLabel });
    });
    // Nodes that render per-handle output rows (≥2 distinct outcome handles).
    const handleNodeIds = new Set<string>();

    const rawNodes: Node<WorkflowNodeData>[] = run.sankey.nodes.map((n) => {
      const isConverted =
        n.kind === "end" && /convert|complete|resubmit/i.test(n.name);
      const isDropped = n.kind === "end" && !isConverted;
      const title = isConverted
        ? "Converted"
        : isDropped
          ? "End"
          : n.name.split(" · ")[0];
      const serial = serialById.get(n.id);
      const baseSubtitle =
        n.kind === "end"
          ? `${n.entered.toLocaleString()} users`
          : n.name.includes(" · ")
            ? n.name.split(" · ").slice(1).join(" · ")
            : undefined;
      // Prefix the positional serial so a node without a builder serial (Start/End)
      // is still unambiguously the one referenced in the Leads table.
      const subtitle = baseSubtitle
        ? `${serial} · ${baseSubtitle}`
        : `#${serial}`;
      const dropoffPct =
        n.entered > 0 ? ((n.entered - n.exited) / n.entered) * 100 : 0;
      const showMetrics = n.kind !== "start" && n.kind !== "end";

      // Branching nodes (WhatsApp outcomes, conditional, A/B split) render their
      // per-handle splits ON the node so the journey is readable without opening
      // the drawer. Mirrors the builder's labeled output handles.
      let outputs: WorkflowNodeData["outputs"];
      if (n.kind === "whatsapp" || n.kind === "conditional" || n.kind === "abSplit") {
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
          // Carry the builder identity so the flow node sub-heading reads
          // `serial • description` (matching the live builder + Leads table). Falls
          // back to the positional `subtitle` for nodes without a serial (Start/End).
          serial: n.serial,
          description: n.description,
          subtitle,
          valid: true,
          locked: true,
          outputs,
          metrics: showMetrics
            ? { entered: n.entered, exited: n.exited, dropoffPct }
            : undefined,
          // Attach the original Sankey node so the analytics wrapper can pass
          // it up when the user clicks the freeform eye button.
          __sankey: n,
        } as WorkflowNodeData & { __sankey: SankeyNode },
      };
    });

    const rawEdges: Edge[] = run.sankey.edges.map((e, i) => {
      const tgt = idToNode.get(e.target);
      const isDrop =
        tgt?.kind === "end" &&
        !/convert|complete|resubmit/i.test(tgt?.name ?? "");
      const isConv =
        tgt?.kind === "end" &&
        /convert|complete|resubmit/i.test(tgt?.name ?? "");
      const stroke = isConv
        ? "rgba(34,197,94,0.55)"
        : isDrop
          ? "rgba(239,68,68,0.45)"
          : "rgba(148,163,184,0.55)";
      return {
        id: `e_${i}`,
        source: e.source,
        // Anchor to the matching outcome handle only when the node renders them.
        sourceHandle: handleNodeIds.has(e.source)
          ? (e.sourceHandle ?? undefined)
          : undefined,
        target: e.target,
        type: "routed",
        animated: false,
        style: { stroke, strokeWidth: 1.5 },
      } satisfies Edge;
    });

    return { rawNodes, rawEdges };
  }, [run]);

  const [layout, setLayout] = useState<{
    nodes: Node<WorkflowNodeData>[];
    edges: Edge[];
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLayout(null);
    // elkLayout preserves each edge's colored `style`; it only fills position +
    // routed bend-points, so converted/dropped strokes survive.
    elkLayout(rawNodes, rawEdges).then((laid) => {
      if (!cancelled) setLayout(laid);
    });
    return () => {
      cancelled = true;
    };
  }, [rawNodes, rawEdges]);

  const handleNodeClick: NodeMouseHandler = (_evt, n) => {
    const data = run.sankey.nodes.find((x) => x.id === n.id);
    if (data) onNodeClick(data);
  };

  // Mount ReactFlow only once ELK has positioned the graph, so `fitView` runs
  // with real coordinates (and re-runs whenever the selected run changes).
  if (!layout) return <div className="h-full w-full" />;

  return (
    <FreeformExpandContext.Provider value={onExpandFreeform ?? null}>
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
    </FreeformExpandContext.Provider>
  );
}
