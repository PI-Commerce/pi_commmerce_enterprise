import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import ReactFlow, {
  Background, BackgroundVariant, Controls, ControlButton, MiniMap,
  addEdge, useEdgesState, useNodesState,
  type Connection, type Edge, type Node, type NodeMouseHandler,
  type ReactFlowInstance,
} from "reactflow";
import { Wand2 } from "lucide-react";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges";
import type { WorkflowNodeData, NodeKind, CampaignStatus } from "@/lib/campaign-types";
import { NODE_LABELS, SERIAL_PREFIX } from "@/lib/campaign-types";
import { whatsappOutputs, completedOutput, smsOutputs, apiOutcomeOutputs, deriveNodeOutcomeVariables } from "@/lib/wa-outputs";
import { EXAMPLE_CAMPAIGNS } from "@/lib/campaign-examples";
import { elkLayout, type Point } from "@/lib/flow-layout";
import { useRegion, localizeTzAbbrev, localizeCurrency } from "@/lib/region";
import { ConfigPanel } from "./ConfigPanel";
import { NodePalette } from "./NodePalette";


const SEED_NODES: Node<WorkflowNodeData>[] = [
  { id: "start", type: "workflow", position: { x: 0, y: 0 },
    data: { kind: "start", title: "Start", locked: true, valid: true } },
  { id: "audience", type: "workflow", position: { x: 0, y: 120 },
    data: { kind: "audience", title: "Audience", subtitle: "CSV · 12,402 contacts", valid: true } },
  { id: "split", type: "workflow", position: { x: 0, y: 250 },
    data: { kind: "abSplit", title: "A/B Split", subtitle: "60% A · 40% B", valid: true,
      outputs: [
        { id: "vA", label: "A · 60%", kind: "variant" },
        { id: "vB", label: "B · 40%", kind: "variant" },
      ] } },
  { id: "wa", type: "workflow", position: { x: 320, y: 215 },
    data: { kind: "whatsapp", title: "WhatsApp", subtitle: "Send WhatsApp message", valid: true, outputs: whatsappOutputs(undefined) } },
  { id: "voice", type: "workflow", position: { x: 320, y: 335 },
    data: { kind: "voiceCall", title: "Voice Call", subtitle: "Conversational reactivation", valid: false, error: "Select voice agent" } },
  { id: "delay", type: "workflow", position: { x: 0, y: 470 },
    data: { kind: "delay", title: "Delay", subtitle: "24h", valid: true } },
  { id: "end", type: "workflow", position: { x: 0, y: 590 },
    data: { kind: "end", title: "End", locked: true, valid: true } },
];

const SEED_EDGES: Edge[] = [
  { id: "e1", source: "start", target: "audience" },
  { id: "e2", source: "audience", target: "split" },
  { id: "e3", source: "split", sourceHandle: "vA", target: "wa" },
  { id: "e4", source: "split", sourceHandle: "vB", target: "voice" },
  { id: "e5", source: "wa", target: "delay" },
  { id: "e6", source: "voice", target: "delay" },
  { id: "e7", source: "delay", target: "end" },
];

const DEFAULT_NODE_DATA: Record<NodeKind, Partial<WorkflowNodeData>> = {
  start: { valid: true, locked: true },
  end: { valid: true, locked: true },
  audience: { subtitle: "CSV or runtime API", valid: false, error: "Select source" },
  apiToolCall: { subtitle: "Call an API", valid: false, error: "Select API tool", outputs: apiOutcomeOutputs() },
  conditional: { subtitle: "Route on variable", valid: false, error: "Add a branch" },
  abSplit: { subtitle: "Split traffic", valid: false, error: "Set split %" },
  delay: { subtitle: "Wait", valid: false, error: "Set duration" },
  voiceCall: { subtitle: "AI voice outreach", valid: false, error: "Select agent", outputs: completedOutput() },
  whatsapp: { subtitle: "Send WhatsApp message", valid: false, error: "Pick template", outputs: whatsappOutputs(undefined) },
  sms: { subtitle: "Send SMS", valid: false, error: "Select a DLT template", outputs: smsOutputs() },
  aiTransform: { subtitle: "Derive AI variables", valid: true },
  adsCampaign: { subtitle: "WhatsApp CTWA ad", valid: false, error: "Complete setup" },
};

let nodeCounter = 100;

// A fresh canvas always has the three structural nodes — Start, Audience, End —
// and all three are non-deletable (locked). Audience is the single entry point for
// contacts, so it can be neither duplicated nor added a second time (see NodePalette).
// Positions are pre-laid out left→right (same reading direction as example graphs
// and the ELK layout used everywhere else). End sits after Audience as a placeholder
// endpoint the user wires up once they've inserted action nodes.
const BLANK_NODES: Node<WorkflowNodeData>[] = [
  { id: "start", type: "workflow", position: { x: 0, y: 0 },
    data: { kind: "start", title: "Start", locked: true, valid: true } },
  { id: "audience", type: "workflow", position: { x: 230, y: 0 },
    data: { kind: "audience", title: "Audience", subtitle: "Drop a CSV", locked: true, valid: false, error: "Select source" } },
  { id: "end", type: "workflow", position: { x: 570, y: 0 },
    data: { kind: "end", title: "End", locked: true, valid: true } },
];

const BLANK_EDGES: Edge[] = [
  { id: "be1", source: "start", target: "audience" },
];

export function WorkflowCanvas({
  status,
  campaignId,
  onValidityChange,
  onDirty,
  isNew = false,
  previewOnly = false,
}: {
  status: CampaignStatus;
  campaignId?: string;
  onValidityChange?: (validCount: number, total: number) => void;
  onDirty?: () => void;
  isNew?: boolean;
  /** Read-only snapshot mode (e.g. Version History): no palette, no editing, no run
   *  pulse — but nodes are still clickable and show their config read-only. */
  previewOnly?: boolean;
}) {
  // Pre-built example campaigns ship their own authored graph; everything else
  // (the existing demo campaigns) falls back to the shared seed graph.
  const example = campaignId ? EXAMPLE_CAMPAIGNS[campaignId] : undefined;
  const { tzAbbrev, symbol } = useRegion();
  const [nodes, setNodes, onNodesChange] = useNodesState(
    isNew ? BLANK_NODES : example?.nodes ?? SEED_NODES,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    isNew ? BLANK_EDGES : example?.edges ?? SEED_EDGES,
  );
  const [selected, setSelected] = useState<{ id: string; data: WorkflowNodeData } | null>(null);
  // ELK runs async at render-time for example/seed graphs; hide the graph until the
  // initial layout lands so we never flash positionless nodes stacked at the origin.
  // Blank new campaigns ship pre-laid-out and render immediately.
  const [layingOut, setLayingOut] = useState(!isNew);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  // Keep live nodes/edges in refs so the run-once layout effect reads current
  // state without re-triggering on every change.
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;

  // Localize region-sensitive node text — timezone abbreviations (e.g. the Voice
  // "Call window … IST" subtitle) and currency symbols in conditional labels
  // (e.g. "> ₹25,000") — to the active country, on both the subtitle and the
  // output port labels. Runs on mount and whenever the country changes; the
  // localizers are reversible so toggling is safe.
  useEffect(() => {
    const fix = (t: string) => localizeCurrency(localizeTzAbbrev(t, tzAbbrev), symbol);
    setNodes((nds) =>
      nds.map((n) => {
        const nextSub = n.data.subtitle != null ? fix(n.data.subtitle) : n.data.subtitle;
        const nextOuts = n.data.outputs?.map((o) => ({ ...o, label: fix(o.label) }));
        const subChanged = nextSub !== n.data.subtitle;
        const outsChanged = !!nextOuts && nextOuts.some((o, i) => o.label !== n.data.outputs![i].label);
        if (!subChanged && !outsChanged) return n;
        return { ...n, data: { ...n.data, subtitle: nextSub, outputs: nextOuts ?? n.data.outputs } };
      }),
    );
  }, [tzAbbrev, symbol, setNodes]);

  // Initial ELK layout for the example/seed graph. Blank new campaigns ship
  // pre-laid-out (see BLANK_NODES) so skip them here.
  //
  // Deliberately NO run-once ref guard: React can mount → clean up → remount the
  // same instance (client-side route navigation, StrictMode, Fast Refresh). A
  // ref guard survives that cycle and strands the reveal — the first run is
  // cancelled by the cleanup while the guard blocks the second from ever calling
  // setLayingOut(false), so the canvas stays blank until a full page reload. The
  // effect's deps are stable, so it only fires on a real (re)mount anyway, and
  // re-laying an example graph is idempotent. The `cancelled` flag alone is the
  // correct guard: on a double-invoke the second run reveals with a fresh flag.
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      const laid = await elkLayout(nodesRef.current, edgesRef.current);
      if (cancelled) return;
      setNodes(laid.nodes);
      setEdges(laid.edges);
      // Reveal ReactFlow only now — mounting it with the laid-out graph lets the
      // `fitView` prop do its nodesInitialized-aware fit (centered), instead of
      // a premature manual fit against unmeasured nodes that pins the graph to a
      // corner.
      setLayingOut(false);
    })();
    return () => { cancelled = true; };
  }, [isNew, setNodes, setEdges]);

  // Editing is allowed in every campaign status — even while a run is live
  // (publishing then mints a new version that only new leads follow).
  const editable = !previewOnly;

  // Report validity upwards
  useEffect(() => {
    const total = nodes.length;
    const valid = nodes.filter((n) => n.data.valid !== false).length;
    onValidityChange?.(valid, total);
  }, [nodes, onValidityChange]);

  // Each WhatsApp template-button output must be wired onward (it's a real branch
  // a lead can take). Only enforced in the editable builder — preset/read-only
  // example graphs are authored complete. Keyed on a signature of the button
  // outputs + edge wiring (NOT valid/error) so the effect's own valid/error
  // writes don't re-trigger it into an infinite update loop.
  const waButtonWiringSig = useMemo(() => {
    const waPart = nodes
      .filter((n) => n.data.kind === "whatsapp")
      .map((n) => n.id + ":" + (n.data.outputs ?? []).filter((o) => o.id.startsWith("btn_")).map((o) => o.id).join(","))
      .join("|");
    const edgePart = edges.map((e) => e.source + ">" + (e.sourceHandle ?? "")).join("|");
    return waPart + "#" + edgePart;
  }, [nodes, edges]);

  useEffect(() => {
    if (!editable) return;
    setNodes((nds) => {
      let changed = false;
      const next = nds.map((n) => {
        if (n.data.kind !== "whatsapp") return n;
        const buttonOuts = (n.data.outputs ?? []).filter((o) => o.id.startsWith("btn_"));
        const unwired = buttonOuts.find((o) => !edges.some((e) => e.source === n.id && (e.sourceHandle ?? null) === o.id));
        const error = unwired ? `Button '${unwired.label}' isn't connected` : undefined;
        // Don't override a pre-existing config error (e.g. "Pick template").
        const hadButtonError = (n.data.error ?? "").startsWith("Button '");
        if (error) {
          if (n.data.error === error && n.data.valid === false) return n;
          changed = true;
          return { ...n, data: { ...n.data, valid: false, error } };
        }
        if (hadButtonError) {
          changed = true;
          return { ...n, data: { ...n.data, valid: true, error: undefined } };
        }
        return n;
      });
      return changed ? next : nds;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waButtonWiringSig, editable, setNodes]);

  const outcomeVariables = useMemo(() => deriveNodeOutcomeVariables(nodes), [nodes]);

  // Campaign status is config-only (draft | ready) — liveness lives on Runs, not
  // the campaign — so the builder canvas always renders nodes idle (no run pulse).
  useEffect(() => {
    if (previewOnly) return;
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, runState: "idle" as const } })));
  }, [setNodes, previewOnly]);

  const onConnect = useCallback(
    (c: Connection) => {
      if (!editable) return;
      setEdges((eds) => addEdge(c, eds));
      onDirty?.();
    },
    [setEdges, editable, onDirty],
  );

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    setSelected({ id: node.id, data: node.data as WorkflowNodeData });
  }, []);
  // Block invalid edges at the UI layer (self-loops, into Start, out of End, duplicates).
  const isValidConnection = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return false;
      if (c.source === c.target) return false;
      const src = nodes.find((n) => n.id === c.source);
      const tgt = nodes.find((n) => n.id === c.target);
      if (!src || !tgt) return false;
      if (tgt.data.kind === "start") return false;
      if (src.data.kind === "end") return false;
      // Each output handle (branch / variant / exit path) routes to exactly one target.
      const srcHandle = c.sourceHandle ?? null;
      if (edges.some((e) => e.source === c.source && (e.sourceHandle ?? null) === srcHandle)) return false;
      // Don't allow the same handle→target pair twice.
      if (edges.some((e) => e.source === c.source && (e.sourceHandle ?? null) === srcHandle && e.target === c.target)) return false;
      return true;
    },
    [nodes, edges],
  );


  const updateNodeData = useCallback(
    (id: string, patch: Partial<WorkflowNodeData>) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
      setSelected((s) => (s && s.id === id ? { ...s, data: { ...s.data, ...patch } } : s));
      onDirty?.();
    },
    [setNodes, onDirty],
  );

  const deleteNode = useCallback(
    (id: string) => {
      const target = nodes.find((n) => n.id === id);
      if (!target || target.data.locked) return;
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
      if (!target || target.data.locked) return;
      const newId = `n_${++nodeCounter}`;
      setNodes((nds) => [
        ...nds,
        {
          ...target,
          id: newId,
          position: { x: target.position.x + 40, y: target.position.y + 40 },
          data: { ...target.data, title: `${target.data.title} (copy)` },
          selected: false,
        },
      ]);
      onDirty?.();
    },
    [nodes, setNodes, onDirty],
  );

  const addNode = useCallback(
    (kind: NodeKind) => {
      const newId = `n_${++nodeCounter}`;
      const defaults = DEFAULT_NODE_DATA[kind];
      setNodes((nds) => {
        // Per-kind, add-order serial (e.g. whatsapp_2, voice_1) — stable identity
        // consumed by the node sub-heading and the Conditional variable picker.
        const nextIndex = nds.filter((n) => n.data.kind === kind).length + 1;
        const serial = `${SERIAL_PREFIX[kind]}_${nextIndex}`;
        return [
          ...nds,
          {
            id: newId,
            type: "workflow",
            position: { x: 320, y: 200 + nds.length * 20 },
            data: { kind, title: NODE_LABELS[kind], serial, ...defaults },
          },
        ];
      });
      onDirty?.();
    },
    [setNodes, onDirty],
  );

  const defaultEdgeOptions = useMemo(() => ({ type: "routed" as const }), []);

  // One-click clean-up: re-run the ELK left-to-right layout on the current
  // graph (positions + routed edge lanes), then fit it to the viewport.
  const autoArrange = useCallback(async () => {
    const rf = rfRef.current;
    if (!rf) return;
    const ns = rf.getNodes() as Node<WorkflowNodeData>[];
    const es = rf.getEdges();
    if (ns.length === 0) return;
    const laid = await elkLayout(ns, es);
    const posById = new Map(laid.nodes.map((n) => [n.id, n.position] as const));
    const ptsById = new Map(laid.edges.map((e) => [e.id, (e.data?.points as Point[] | undefined) ?? []] as const));
    setNodes((nds) => nds.map((n) => ({ ...n, position: posById.get(n.id) ?? n.position })));
    setEdges((eds) => eds.map((e) => ({ ...e, type: "routed", data: { ...(e.data ?? {}), points: ptsById.get(e.id) ?? [] } })));
    onDirty?.();
    setTimeout(() => rfRef.current?.fitView({ padding: 0.2, duration: 400 }), 60);
  }, [setNodes, setEdges, onDirty]);

  return (
    <div className="relative h-full w-full">
      {layingOut && <div className="absolute inset-0" aria-hidden />}
      {!layingOut && (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={editable}
        nodesConnectable={editable}
        onInit={(inst) => { rfRef.current = inst; }}
        onNodesChange={(c) => {
          if (!editable) return;
          // Locked structural nodes (Start, Audience, End) are non-deletable —
          // drop any removal change that targets one.
          const lockedIds = new Set(nodes.filter((n) => n.data.locked).map((n) => n.id));
          onNodesChange(c.filter((ch) => !(ch.type === "remove" && lockedIds.has(ch.id))));
        }}
        onEdgesChange={(c) => { if (editable) onEdgesChange(c); }}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelected(null)}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.6}
      >

        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-dot)" />
        <Controls position="bottom-left" showInteractive={false}>
          {editable && (
            <ControlButton onClick={autoArrange} title="Auto-arrange & fit">
              <Wand2 />
            </ControlButton>
          )}
        </Controls>
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
      )}

      {!previewOnly && <NodePalette onAdd={addNode} disabled={!editable} />}

      <ConfigPanel
        key={selected?.id}
        node={selected}
        readOnly={!editable}
        onClose={() => setSelected(null)}
        onChange={(patch) => selected && updateNodeData(selected.id, patch)}
        onDelete={() => selected && deleteNode(selected.id)}
        onDuplicate={() => selected && duplicateNode(selected.id)}
        extraVariables={outcomeVariables.filter((v) => {
          // Vars are namespaced by serial (e.g. `whatsapp_1.*`) — exclude the
          // selected node's own outputs so it can't reference itself.
          const ns = selected?.data?.serial ?? selected?.id;
          return !selected || !v.key.startsWith(`${ns}.`);
        })}
      />
    </div>
  );
}
