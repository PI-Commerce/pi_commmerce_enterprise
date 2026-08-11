import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "reactflow";
import { freeformNodeTypes, type FreeformNodeData } from "./FreeformNodes";
import { nodeTypes as campaignNodeTypes } from "./nodes";
import { edgeTypes } from "./edges";
import {
  FreeformNodePalette,
  type PaletteAdd,
  type LogicKind,
} from "./FreeformNodePalette";
import { FreeformConfigPanel } from "./FreeformConfigPanel";
import { ConfigPanel as CampaignConfigPanel } from "./ConfigPanel";
import {
  FREEFORM_NODE_LABELS,
  FREEFORM_SERIAL_PREFIX,
  validateFreeformNode,
  getBranchOutputs,
  deriveFreeformOutcomes,
  type FreeformNodeKind,
  type FreeformNodeConfig,
  type FreeformNodeRecord,
  type FreeformEdgeRecord,
} from "@/lib/freeform-types";
import {
  NODE_LABELS,
  SERIAL_PREFIX,
  type WorkflowNodeData,
} from "@/lib/campaign-types";
import {
  apiOutcomeOutputs,
  deriveNodeOutcomeVariables,
} from "@/lib/wa-outputs";

/**
 * Freeform workflow canvas.
 *
 * Two node types are registered:
 *  - `freeform`  > freeform-owned WhatsApp primitives (Text/Image/Video/
 *  Document/List, plus locked Start & End). Uses FreeformNode + FreeformConfigPanel.
 *  - `workflow`  > carried from the main campaign builder for logic primitives
 *  (API Call, Conditional). Uses WorkflowNode + the campaign ConfigPanel so
 *  the two surfaces stay 1:1 in look and validation behaviour.
 *
 * ReactFlow selects the renderer by `Node.type`; we route the right config
 * panel by inspecting `Node.type` on click.
 */

const BLANK_NODES: Node[] = [
  {
    id: "start",
    type: "freeform",
    position: { x: 0, y: 60 },
    data: {
      kind: "start",
      title: "Start",
      locked: true,
      valid: true,
    } as FreeformNodeData,
  },
  {
    id: "end",
    type: "freeform",
    position: { x: 520, y: 60 },
    data: {
      kind: "end",
      title: "End",
      locked: true,
      valid: true,
    } as FreeformNodeData,
  },
];

const FREEFORM_DEFAULTS: Record<
  FreeformNodeKind,
  { config?: FreeformNodeConfig }
> = {
  start: {},
  end: {},
  text: { config: {} },
  image: { config: {} },
  video: { config: {} },
  document: { config: {} },
  list: { config: { rows: [] } },
};

let nodeCounter = 100;

export function FreeformCanvas({
  initialNodes,
  initialEdges,
  onValidityChange,
  onDirty,
  onGraphChange,
  previewOnly = false,
  edgeLabels,
}: {
  /** Optional persisted graph. Falls back to the Start>End blank layout when empty. */
  initialNodes?: FreeformNodeRecord[];
  initialEdges?: FreeformEdgeRecord[];
  /** valid = nodes whose validity check passed; total = all nodes; meaningful =
   *  non-terminal node count (used to gate Ready  -  an empty Start>End canvas
   *  shouldn't flip Ready just because both terminals trivially validate). */
  onValidityChange?: (valid: number, total: number, meaningful: number) => void;
  onDirty?: () => void;
  /** Emits the current graph as plain-JSON records after every change, so the
   *  parent (builder route) can persist it on Save. */
  onGraphChange?: (
    nodes: FreeformNodeRecord[],
    edges: FreeformEdgeRecord[],
  ) => void;
  /** Read-only mode used by the campaign side's preview modal  -  no palette,
   *  no config panel, no dragging or edge editing; pan + zoom only. */
  previewOnly?: boolean;
  /** Optional per-edge string labels for the analytics overlay. Keyed by edge
   *  id. The overlay formats these however it wants (percentages, counts, etc.);
   *  the canvas just renders the string on the edge curve. */
  edgeLabels?: Map<string, string>;
}) {
  const seedNodes = useMemo<Node[]>(() => {
    if (!initialNodes || initialNodes.length === 0) return BLANK_NODES;
    return initialNodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data as FreeformNodeData | WorkflowNodeData,
    }));
  }, [initialNodes]);
  const seedEdges = useMemo<Edge[]>(() => {
    if (!initialEdges) return [];
    return initialEdges.map((e) => {
      const label = edgeLabels?.get(e.id);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
        type: "routed" as const,
        // ReactFlow renders `label` in-line on the edge path when set.
        ...(label !== undefined && {
          label,
          labelStyle: { fontSize: 11, fontWeight: 600, fill: "var(--foreground)" },
          labelBgStyle: { fill: "var(--background)", fillOpacity: 0.9 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
        }),
      };
    });
  }, [initialEdges, edgeLabels]);
  const [nodes, setNodes, onNodesChange] = useNodesState(seedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(seedEdges);
  const [selected, setSelected] = useState<{
    id: string;
    type: string;
    data: FreeformNodeData | WorkflowNodeData;
  } | null>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);

  // Combined node types map  -  freeform (own) + workflow (campaign, for logic).
  const nodeTypes = useMemo(
    () => ({ ...freeformNodeTypes, ...campaignNodeTypes }),
    [],
  );

  useEffect(() => {
    const total = nodes.length;
    const valid = nodes.filter(
      (n) => (n.data as { valid?: boolean }).valid !== false,
    ).length;
    const meaningful = nodes.filter((n) => {
      const k = (n.data as { kind: string }).kind;
      return k !== "start" && k !== "end";
    }).length;
    onValidityChange?.(valid, total, meaningful);
  }, [nodes, onValidityChange]);

  // Emit the current graph as plain-JSON records  -  the builder uses this to
  // persist on Save, and the campaign-side WhatsApp Freeform node reads the
  // saved copy for placeholder scanning and preview.
  useEffect(() => {
    if (!onGraphChange) return;
    const nodeRecs: FreeformNodeRecord[] = nodes.map((n) => ({
      id: n.id,
      type: (n.type ?? "freeform") as FreeformNodeRecord["type"],
      position: n.position,
      data: n.data as FreeformNodeRecord["data"],
    }));
    const edgeRecs: FreeformEdgeRecord[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    }));
    onGraphChange(nodeRecs, edgeRecs);
  }, [nodes, edges, onGraphChange]);

  /**
   * Branch-wiring validation. Every button/list-row handle on a freeform node
   * must have an outgoing edge  -  an unwired button is a dead branch the lead
   * could still take. Signature is derived from node config + edge sources so
   * this effect's own writes don't retrigger it.
   */
  const branchWiringSig = useMemo(() => {
    const nodePart = nodes
      .filter((n) => n.type === "freeform")
      .map((n) => {
        const outs = getBranchOutputs(
          (n.data as { kind: FreeformNodeKind }).kind,
          (n.data as { config?: FreeformNodeConfig }).config,
        );
        return `${n.id}:${outs.map((o) => o.id).join(",")}`;
      })
      .join("|");
    const edgePart = edges
      .map((e) => `${e.source}>${e.sourceHandle ?? ""}`)
      .join("|");
    return `${nodePart}#${edgePart}`;
  }, [nodes, edges]);

  useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const next = nds.map((n) => {
        if (n.type !== "freeform") return n;
        const kind = (n.data as { kind: FreeformNodeKind }).kind;
        if (kind === "start" || kind === "end") return n;
        const cfg = (n.data as { config?: FreeformNodeConfig }).config;
        const outs = getBranchOutputs(kind, cfg);
        // Re-run config validation first  -  if the config itself is invalid, keep
        // that error (it's the more actionable one).
        const cfgResult = validateFreeformNode(kind, cfg);
        if (!cfgResult.valid) {
          const data = n.data as { valid?: boolean; error?: string };
          if (data.valid === false && data.error === cfgResult.error) return n;
          changed = true;
          return {
            ...n,
            data: { ...n.data, valid: false, error: cfgResult.error },
          };
        }
        // Config is OK; now check wiring. Every branch needs an edge.
        const unwired = outs.find(
          (o) =>
            !edges.some(
              (e) => e.source === n.id && (e.sourceHandle ?? null) === o.id,
            ),
        );
        if (unwired) {
          const isRow = unwired.id.startsWith("row_");
          const error = isRow
            ? `Row '${unwired.label}' isn't connected`
            : `Button '${unwired.label}' isn't connected`;
          const data = n.data as { valid?: boolean; error?: string };
          if (data.valid === false && data.error === error) return n;
          changed = true;
          return { ...n, data: { ...n.data, valid: false, error } };
        }
        // All good.
        const data = n.data as { valid?: boolean };
        if (data.valid === true) return n;
        changed = true;
        return { ...n, data: { ...n.data, valid: true, error: undefined } };
      });
      return changed ? next : nds;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchWiringSig, setNodes]);

  // Freeform-shaped node outputs (buttons, rows, replied) + campaign-shaped
  // outcomes (API tool response fields). Passed to the Conditional editor as
  // the ONLY variables the workflow can branch on.
  const extraVariables = useMemo(() => {
    const freeform = deriveFreeformOutcomes(
      nodes
        .filter((n) => n.type === "freeform")
        .map((n) => ({
          id: n.id,
          data: n.data as {
            kind: string;
            title?: string;
            serial?: string;
            config?: FreeformNodeConfig;
          },
        })),
    );
    const workflowNodes = nodes
      .filter((n) => n.type === "workflow")
      .map((n) => ({ id: n.id, data: n.data as WorkflowNodeData }));
    const campaign = deriveNodeOutcomeVariables(workflowNodes);
    return [...freeform, ...campaign];
  }, [nodes]);

  const onConnect = useCallback(
    (c: Connection) => {
      setEdges((eds) => addEdge({ ...c, type: "routed" }, eds));
      onDirty?.();
    },
    [setEdges, onDirty],
  );

  const isValidConnection = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return false;
      const src = nodes.find((n) => n.id === c.source);
      const tgt = nodes.find((n) => n.id === c.target);
      if (!src || !tgt) return false;
      const srcKind = (src.data as { kind: string }).kind;
      const tgtKind = (tgt.data as { kind: string }).kind;
      if (tgtKind === "start") return false;
      if (srcKind === "end") return false;
      const srcHandle = c.sourceHandle ?? null;
      if (
        edges.some(
          (e) =>
            e.source === c.source && (e.sourceHandle ?? null) === srcHandle,
        )
      )
        return false;
      return true;
    },
    [nodes, edges],
  );

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    setSelected({
      id: node.id,
      type: node.type ?? "freeform",
      data: node.data,
    });
  }, []);

  const updateNodeData = useCallback(
    (id: string, patch: Partial<FreeformNodeData | WorkflowNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      );
      setSelected((s) =>
        s && s.id === id ? { ...s, data: { ...s.data, ...patch } } : s,
      );
      onDirty?.();
    },
    [setNodes, onDirty],
  );

  const deleteNode = useCallback(
    (id: string) => {
      const target = nodes.find((n) => n.id === id);
      if (!target || (target.data as { locked?: boolean }).locked) return;
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelected(null);
      onDirty?.();
    },
    [nodes, setNodes, setEdges, onDirty],
  );

  const duplicateNode = useCallback(
    (id: string) => {
      const target = nodes.find((n) => n.id === id);
      if (!target || (target.data as { locked?: boolean }).locked) return;
      const newId = `n_${++nodeCounter}`;
      const title = (target.data as { title?: string }).title ?? "";
      setNodes((nds) => [
        ...nds,
        {
          ...target,
          id: newId,
          position: { x: target.position.x + 40, y: target.position.y + 40 },
          data: { ...target.data, title: `${title} (copy)` },
          selected: false,
        },
      ]);
      onDirty?.();
    },
    [nodes, setNodes, onDirty],
  );

  const addFreeform = useCallback(
    (kind: FreeformNodeKind) => {
      const newId = `n_${++nodeCounter}`;
      const defaults = FREEFORM_DEFAULTS[kind];
      setNodes((nds) => {
        const nextIndex =
          nds.filter((n) => (n.data as { kind?: string }).kind === kind)
            .length + 1;
        const serial = `${FREEFORM_SERIAL_PREFIX[kind]}_${nextIndex}`;
        const { valid, error } = validateFreeformNode(kind, defaults.config);
        return [
          ...nds,
          {
            id: newId,
            type: "freeform",
            position: {
              x: 240 + (nds.length % 3) * 40,
              y: 200 + nds.length * 30,
            },
            data: {
              kind,
              title: FREEFORM_NODE_LABELS[kind],
              serial,
              valid,
              error,
              config: defaults.config,
            } as FreeformNodeData,
          },
        ];
      });
      onDirty?.();
    },
    [setNodes, onDirty],
  );

  const addLogic = useCallback(
    (kind: LogicKind) => {
      const newId = `n_${++nodeCounter}`;
      setNodes((nds) => {
        const nextIndex =
          nds.filter((n) => (n.data as { kind?: string }).kind === kind)
            .length + 1;
        const serial = `${SERIAL_PREFIX[kind]}_${nextIndex}`;
        const data: WorkflowNodeData =
          kind === "apiToolCall"
            ? {
                kind,
                title: NODE_LABELS[kind],
                serial,
                subtitle: "Call an API",
                valid: false,
                error: "Select API tool",
                outputs: apiOutcomeOutputs(),
              }
            : // Empty `branches: []` short-circuits ConditionalFields' campaign-style
              // seed (which would otherwise pre-populate `contact.tier` / `wa.*`
              // conditions  -  variables that don't exist in freeform context).
              {
                kind,
                title: NODE_LABELS[kind],
                serial,
                subtitle: "Route on variable",
                valid: false,
                error: "Add a branch",
                config: { branches: [] },
              };
        return [
          ...nds,
          {
            id: newId,
            type: "workflow",
            position: {
              x: 240 + (nds.length % 3) * 40,
              y: 200 + nds.length * 30,
            },
            data,
          },
        ];
      });
      onDirty?.();
    },
    [setNodes, onDirty],
  );

  const handleAdd = useCallback(
    (a: PaletteAdd) => {
      if (a.kind === "freeform") addFreeform(a.freeform);
      else addLogic(a.logic);
    },
    [addFreeform, addLogic],
  );

  const defaultEdgeOptions = useMemo(() => ({ type: "routed" as const }), []);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(inst) => {
          rfRef.current = inst;
        }}
        nodesDraggable={!previewOnly}
        nodesConnectable={!previewOnly}
        elementsSelectable={!previewOnly}
        onNodesChange={(c) => {
          if (previewOnly) return;
          const lockedIds = new Set(
            nodes
              .filter((n) => (n.data as { locked?: boolean }).locked)
              .map((n) => n.id),
          );
          onNodesChange(
            c.filter((ch) => !(ch.type === "remove" && lockedIds.has(ch.id))),
          );
        }}
        onEdgesChange={(c) => {
          if (!previewOnly) onEdgesChange(c);
        }}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={previewOnly ? undefined : onNodeClick}
        onPaneClick={() => setSelected(null)}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.6}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--canvas-dot)"
        />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          maskColor="color-mix(in oklch, var(--background) 70%, transparent)"
          nodeColor={() => "var(--foreground)"}
          nodeStrokeWidth={0}
          nodeBorderRadius={4}
        />
      </ReactFlow>

      {!previewOnly && <FreeformNodePalette onAdd={handleAdd} />}

      {/* Route to the right config panel by node type. Logic nodes reuse the
  campaign panel so API/Conditional behave identically across builders. */}
      {!previewOnly && selected && selected.type === "workflow" ? (
        <CampaignConfigPanel
          key={selected.id}
          node={{ id: selected.id, data: selected.data as WorkflowNodeData }}
          onClose={() => setSelected(null)}
          onChange={(patch) => updateNodeData(selected.id, patch)}
          onDelete={() => deleteNode(selected.id)}
          onDuplicate={() => duplicateNode(selected.id)}
          extraVariables={extraVariables.filter((v) => {
            // Vars are namespaced by serial  -  exclude the selected node's own
            // outputs so it can't reference itself.
            const s =
              (selected.data as { serial?: string }).serial ?? selected.id;
            return !v.key.startsWith(`${s}.`);
          })}
          // Freeform has no Audience node, so the campaign builder's default
          // `contact.*` fallback samples don't apply here.
          suppressSampleVariables
        />
      ) : (
        !previewOnly && (
          <FreeformConfigPanel
            key={selected?.id}
            node={
              selected
                ? { id: selected.id, data: selected.data as FreeformNodeData }
                : null
            }
            onClose={() => setSelected(null)}
            onChange={(patch) => selected && updateNodeData(selected.id, patch)}
            onDelete={() => selected && deleteNode(selected.id)}
            onDuplicate={() => selected && duplicateNode(selected.id)}
          />
        )
      )}
    </div>
  );
}
