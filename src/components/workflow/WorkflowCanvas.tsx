import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import ReactFlow, {
  Background, BackgroundVariant, Controls, ControlButton, MiniMap,
  addEdge, useEdgesState, useNodesState, getNodesBounds,
  type Connection, type Edge, type Node, type NodeMouseHandler,
  type ReactFlowInstance,
} from "reactflow";
import { Wand2 } from "lucide-react";
import { nodeTypes, CanvasModeContext } from "./nodes";
import { edgeTypes } from "./edges";
import type { WorkflowNodeData, NodeKind, CampaignStatus } from "@/lib/campaign-types";
import { NODE_LABELS } from "@/lib/campaign-types";
import { whatsappOutputs, completedOutput, deriveNodeOutcomeVariables } from "@/lib/wa-outputs";
import { EXAMPLE_CAMPAIGNS } from "@/lib/campaign-examples";
import { elkLayout, type Point } from "@/lib/flow-layout";
import { useRegion, localizeTzAbbrev, localizeCurrency } from "@/lib/region";
import { toast } from "sonner";
import { ConfigPanel } from "./ConfigPanel";
import { AgentComposer } from "./AgentComposer";
import { DemoAskPiComposer } from "./DemoAskPiComposer";
import { NodePalette } from "./NodePalette";
import { getSuggestion } from "@/lib/pi-node-suggestions";


const SEED_NODES: Node<WorkflowNodeData>[] = [
  { id: "start", type: "workflow", position: { x: 0, y: 0 },
    data: { kind: "start", title: "Start", locked: true, valid: true } },
  { id: "audience", type: "workflow", position: { x: 0, y: 120 },
    data: { kind: "audience", title: "Audience", subtitle: "CSV · 12,402 contacts", valid: true, locked: true } },
  { id: "split", type: "workflow", position: { x: 0, y: 250 },
    data: { kind: "abSplit", title: "A/B Split", subtitle: "60% A · 40% B", valid: true,
      outputs: [
        { id: "vA", label: "A · 60%", kind: "variant" },
        { id: "vB", label: "B · 40%", kind: "variant" },
      ] } },
  { id: "wa", type: "workflow", position: { x: 320, y: 215 },
    data: { kind: "whatsapp", title: "WhatsApp", subtitle: "Send WhatsApp message", valid: true, outputs: whatsappOutputs(undefined), piHint: "wa_personalize" } },
  { id: "voice", type: "workflow", position: { x: 320, y: 335 },
    data: { kind: "voiceCall", title: "Voice Call", subtitle: "Conversational reactivation", valid: false, error: "Select voice agent", piHint: "voice_window" } },
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
  conditional: { subtitle: "Route on variable", valid: false, error: "Add a branch" },
  abSplit: { subtitle: "Split traffic", valid: false, error: "Set split %" },
  delay: { subtitle: "Wait", valid: false, error: "Set duration" },
  voiceCall: { subtitle: "AI voice outreach", valid: false, error: "Select agent", outputs: completedOutput() },
  whatsapp: { subtitle: "Send WhatsApp message", valid: false, error: "Pick template", outputs: whatsappOutputs(undefined) },
  sms: { subtitle: "Send SMS", valid: false, error: "Add message body", outputs: completedOutput() },
  
  adsCampaign: { subtitle: "WhatsApp CTWA ad", valid: false, error: "Complete setup" },
};

let nodeCounter = 100;

const BLANK_NODES: Node<WorkflowNodeData>[] = [
  { id: "start", type: "workflow", position: { x: 0, y: 0 },
    data: { kind: "start", title: "Start", locked: true, valid: true } },
];

export function WorkflowCanvas({
  status,
  campaignId,
  onValidityChange,
  onDirty,
  autoStartAskPi = false,
  isNew = false,
  agentChat = false,
  seedName,
  seedDescription,
  seedObjective,
  onAiBuiltName,
  previewOnly = false,
}: {
  status: CampaignStatus;
  campaignId?: string;
  onValidityChange?: (validCount: number, total: number) => void;
  onDirty?: () => void;
  autoStartAskPi?: boolean;
  isNew?: boolean;
  /** `?agent=1` opens the new-campaign Ask Pi straight into the live agent chat. */
  agentChat?: boolean;
  /** Seed name/description/objective from the create-campaign modal — feed the Ask Pi brief. */
  seedName?: string;
  seedDescription?: string;
  seedObjective?: string;
  onAiBuiltName?: (name: string) => void;
  /** Read-only snapshot mode (e.g. Version History): no palette, no Ask Pi, no editing,
   *  no run pulse — but nodes are still clickable and show their config read-only. */
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
    isNew ? [] : example?.edges ?? SEED_EDGES,
  );
  const [selected, setSelected] = useState<{ id: string; data: WorkflowNodeData } | null>(null);
  const [askPiOpen, setAskPiOpen] = useState(false);
  const [aiBuilding, setAiBuilding] = useState(false);
  // ELK runs async at render-time; hide the graph until the initial layout lands
  // so we never flash positionless nodes stacked at the origin. Blank new
  // campaigns (just a Start node) need no initial layout, so they show at once.
  const [layingOut, setLayingOut] = useState(!isNew);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const refitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiBuildingRef = useRef(aiBuilding);
  useEffect(() => { aiBuildingRef.current = aiBuilding; }, [aiBuilding]);
  // Keep live nodes/edges in refs so the run-once layout effect reads current
  // state without re-triggering on every change.
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;
  const didLayoutRef = useRef(false);

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

  const refit = useCallback(() => {
    if (refitTimer.current) clearTimeout(refitTimer.current);
    refitTimer.current = setTimeout(() => {
      const rf = rfRef.current;
      if (!rf) return;
      const ns = rf.getNodes();
      if (ns.length === 0) return;
      const bounds = getNodesBounds(ns);
      const overlay = aiBuildingRef.current ? 380 : 0;
      // Inflate bottom of bounds so fitBounds reserves space below the graph,
      // pushing the visible graph into the upper region above the overlay.
      const inflated = { ...bounds, height: bounds.height + overlay };
      rf.fitBounds(inflated, { padding: 0.2, duration: 500 });
    }, 50);
  }, []);

  // Re-fit whenever the building overlay toggles
  useEffect(() => {
    refit();
  }, [aiBuilding, refit]);

  // Initial ELK layout for the example/seed graph (runs once on mount). Blank
  // new campaigns and AI-built graphs are laid out elsewhere, so skip those.
  useEffect(() => {
    if (didLayoutRef.current || isNew) return;
    didLayoutRef.current = true;
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

  // Auto-launch Ask Pi for brand-new campaigns
  useEffect(() => {
    if (autoStartAskPi) setAskPiOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartAskPi]);

  const editable = !previewOnly && (status === "draft" || status === "ready" || status === "paused") && !aiBuilding;

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

  // Simulated execution pulse for running state
  useEffect(() => {
    if (previewOnly) return;
    if (status !== "running") {
      setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, runState: "idle" as const } })));
      return;
    }
    const order = ["start", "audience", "split", "wa", "voice", "delay", "end"];
    let i = 0;
    const tick = setInterval(() => {
      setNodes((nds) =>
        nds.map((n) => {
          const idx = order.indexOf(n.id);
          if (idx === -1) return n;
          let runState: WorkflowNodeData["runState"] = "idle";
          if (idx < i) runState = "success";
          else if (idx === i) runState = "running";
          return { ...n, data: { ...n.data, runState } };
        }),
      );
      i = (i + 1) % (order.length + 2);
    }, 1100);
    return () => clearInterval(tick);
  }, [status, setNodes, previewOnly]);

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

  // I3 — apply a curated node-hover Pi suggestion. The suggestion's pure graph
  // transform takes the current nodes/edges and returns the next ones (and also
  // clears the source node's `piHint` so the tip retires after one apply). This is
  // wired to {@link DemoAskPiComposer} below, which calls it from the Result card
  // after the canned thinking → result demo loop.
  const applySuggestion = useCallback(
    ({ nodeId, suggestionId }: { nodeId: string; suggestionId: string }) => {
      const sug = getSuggestion(suggestionId);
      if (!sug) return;
      const next = sug.apply(nodes, edges, nodeId);
      setNodes(next.nodes);
      setEdges(next.edges);
      setSelected(null);
      onDirty?.();
      refit();
    },
    [nodes, edges, setNodes, setEdges, onDirty, refit],
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
      setNodes((nds) => [
        ...nds,
        {
          id: newId,
          type: "workflow",
          position: { x: 320, y: 200 + nds.length * 20 },
          data: { kind, title: NODE_LABELS[kind], ...defaults },
        },
      ]);
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

  // I6 — edit focus mode: when a node is selected, spotlight it by dimming everything
  // else. Suppressed mid-build and during the live run pulse so neither is disrupted.
  const focusNodeId = aiBuilding || status === "running" ? null : selected?.id ?? null;
  const displayEdges = useMemo(() => {
    if (!focusNodeId) return edges;
    return edges.map((e) =>
      e.source === focusNodeId || e.target === focusNodeId
        ? e
        : { ...e, style: { ...e.style, opacity: 0.12 } },
    );
  }, [edges, focusNodeId]);

  return (
    <CanvasModeContext.Provider value={{ showPiTips: !previewOnly, focusNodeId }}>
    <div className="relative h-full w-full">
      {layingOut && <div className="absolute inset-0" aria-hidden />}
      {!layingOut && (
      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={editable}
        nodesConnectable={editable}
        elementsSelectable={!aiBuilding}
        nodesFocusable={!aiBuilding}
        panOnDrag={!aiBuilding}
        zoomOnScroll={!aiBuilding}
        zoomOnPinch={!aiBuilding}
        zoomOnDoubleClick={!aiBuilding}
        onInit={(inst) => { rfRef.current = inst; }}
        onNodesChange={(c) => { if (editable) onNodesChange(c); }}
        onEdgesChange={(c) => { if (editable) onEdgesChange(c); }}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={aiBuilding ? undefined : onNodeClick}
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
        node={aiBuilding ? null : selected}
        readOnly={!editable}
        onClose={() => setSelected(null)}
        onChange={(patch) => selected && updateNodeData(selected.id, patch)}
        onDelete={() => selected && deleteNode(selected.id)}
        onDuplicate={() => selected && duplicateNode(selected.id)}
        extraVariables={outcomeVariables.filter((v) => !selected || !v.key.startsWith(`${selected.id}.`))}
      />

      {/* Ask Pi mounts in two flavours on the canvas, depending on whether the
          campaign is being authored or just inspected:
            - New campaigns (`isNew`) get the live CopilotKit/offline-wizard
              creation composer — it actually mutates the graph.
            - Saved/existing campaigns get the read-only {@link DemoAskPiComposer}
              — a visually-identical floating pill that opens a text input but is
              inert on submit, and listens for the node-hover "Pi tip" event so
              the I3 demo flow has a visible destination.
          Read-only snapshots (`previewOnly`, e.g. version-history viewer) get
          neither — there is no editor context to mutate. */}
      {!previewOnly && !isNew && <DemoAskPiComposer onApplySuggestion={applySuggestion} />}
      {!previewOnly && isNew && (
        <AgentComposer
          mode={agentChat ? "chat" : "wizard"}
          nudge={{ label: "Ask Pi to build your campaign", active: autoStartAskPi }}
          autoOpenWizard={askPiOpen}
          seedName={seedName}
          seedDescription={seedDescription}
          seedObjective={seedObjective}
          onBuildingChange={setAiBuilding}
          onWizardSkeleton={(skel) => {
            setSelected(null);
            // The CopilotKit compiler emits nodes at fixed `{ x: 0, y: increasing }`
            // (a top-down stack). Run the shared ELK layout so the skeleton comes up
            // left-to-right, matching every other graph on this canvas.
            void (async () => {
              const laid = await elkLayout(skel.nodes, skel.edges);
              setNodes(laid.nodes);
              setEdges(laid.edges);
              refit();
            })();
          }}
          onWizardBuild={(plan) => {
            setSelected(null);
            void (async () => {
              const laid = await elkLayout(plan.nodes, plan.edges);
              setNodes(laid.nodes);
              setEdges(laid.edges);
              onAiBuiltName?.(plan.name);
              onDirty?.();
              refit();
            })();
          }}
          onSavedDraft={(v) => {
            onDirty?.();
            toast.success(`Saved as draft ${v}`, {
              description: "Review on the canvas — launch is a separate step.",
            });
          }}
        />
      )}
    </div>
    </CanvasModeContext.Provider>
  );
}
