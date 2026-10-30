/**
 * Full-screen agent builder. A fixed-topology ReactFlow canvas where a Model, a
 * Knowledge base, and any number of Tool nodes all feed a single Agent hub.
 * Selecting a node opens the right-side inspector (AgentConfigPanel). The hub
 * node is the single source of truth for the agent's name/type/status/prompt;
 * the header simply mirrors it. On Save the graph is folded back into an
 * `AgentRecord` and pushed to the reactive `agent-data` store, so a saved agent
 * is immediately visible in /agents and (for voice agents) in the campaign
 * Voice Call picker.
 *
 * Self-contained (own header + dirty-guard + save) mirroring the read-only
 * AgentBuilder.tsx layout, rather than splitting a top-bar out — there's a
 * single source of truth (the hub node) so no cross-component name sync.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useBlocker } from "@tanstack/react-router";
import ReactFlow, {
  Background, BackgroundVariant, Controls, ControlButton, MiniMap,
  useEdgesState, useNodesState,
  type Edge, type Node, type NodeMouseHandler, type ReactFlowInstance,
} from "reactflow";
import { ChevronLeft, Wand2, Plus, X, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { elkLayout, type Point } from "@/lib/flow-layout";
import { getTool, TOOLS } from "@/lib/tool-registry";
import { getModelConfig } from "@/lib/model-config";
import { saveAgent, type AgentRecord } from "@/lib/agent-data";
import { agentNodeTypes, type AgentNodeData } from "./nodes";
import { edgeTypes } from "@/components/workflow/edges";
import { AgentConfigPanel } from "./AgentConfigPanel";

/** Recompute a node's display fields (title/subtitle/valid) from its raw data. */
function decorate(data: AgentNodeData): AgentNodeData {
  switch (data.kind) {
    case "agent": {
      const named = (data.name ?? "").trim();
      return {
        ...data,
        title: named || "Agent",
        subtitle: `${data.agentType ?? "chat"} · ${data.status ?? "draft"}`,
        valid: !!named,
        error: named ? undefined : "Name required",
      };
    }
    case "model": {
      const cfg = getModelConfig(data.modelConfigId);
      return {
        ...data,
        title: "Model",
        subtitle: cfg?.name ?? "Select a config",
        valid: !!cfg,
        error: cfg ? undefined : "Select model config",
      };
    }
    case "knowledge": {
      const kb = (data.knowledgeBase ?? "").trim();
      return {
        ...data,
        title: "Knowledge",
        subtitle: kb ? `${kb.split(/\s+/).length} words` : "Empty",
        valid: true,
      };
    }
    case "tool": {
      const t = data.toolHandle ? getTool(data.toolHandle) : undefined;
      return {
        ...data,
        title: data.toolHandle ?? "Tool",
        subtitle: t?.description,
        valid: true,
      };
    }
  }
}

/** Build the initial node/edge graph from an AgentRecord (pre-laid-out L→R). */
function buildGraph(record: AgentRecord): { nodes: Node<AgentNodeData>[]; edges: Edge[] } {
  const sources: Node<AgentNodeData>[] = [
    { id: "model", type: "agentNode", position: { x: 0, y: 0 },
      data: decorate({ kind: "model", title: "", modelConfigId: record.modelConfigId }) },
    { id: "knowledge", type: "agentNode", position: { x: 0, y: 110 },
      data: decorate({ kind: "knowledge", title: "", knowledgeBase: record.knowledgeBase }) },
    ...record.tools.map((h, i) => ({
      id: `tool_${h}`, type: "agentNode", position: { x: 0, y: 220 + i * 96 },
      data: decorate({ kind: "tool" as const, title: "", toolHandle: h }),
    })),
  ];
  const hub: Node<AgentNodeData> = {
    id: "agent", type: "agentNode", position: { x: 360, y: 120 },
    data: decorate({
      kind: "agent", title: "",
      name: record.name, agentType: record.type, status: record.status,
      masterPrompt: record.masterPrompt, evalPrompt: record.evalPrompt, postCall: record.postCall,
    }),
  };
  const edges: Edge[] = sources.map((s) => ({
    id: `e_${s.id}`, source: s.id, target: "agent", type: "routed",
  }));
  return { nodes: [...sources, hub], edges };
}

let toolSeq = 0;

export function AgentBuilderCanvas({ record, isNew }: { record: AgentRecord; isNew: boolean }) {
  const navigate = useNavigate();
  const initial = useMemo(() => buildGraph(record), [record]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selected, setSelected] = useState<{ id: string; data: AgentNodeData } | null>(null);
  const [dirty, setDirty] = useState(false);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const savingRef = useRef(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const hub = nodes.find((n) => n.data.kind === "agent");
  const name = hub?.data.name ?? "";
  const status = hub?.data.status ?? "draft";

  const markDirty = useCallback(() => setDirty(true), []);

  const updateNodeData = useCallback(
    (id: string, patch: Partial<AgentNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: decorate({ ...n.data, ...patch }) } : n)),
      );
      setSelected((s) => (s && s.id === id ? { ...s, data: decorate({ ...s.data, ...patch }) } : s));
      markDirty();
    },
    [setNodes, markDirty],
  );

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    setSelected({ id: node.id, data: node.data as AgentNodeData });
  }, []);

  // Only Tool nodes are deletable; the Agent/Model/Knowledge hubs are fixed.
  const deleteNode = useCallback(
    (id: string) => {
      const target = nodes.find((n) => n.id === id);
      if (!target || target.data.kind !== "tool") return;
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelected(null);
      markDirty();
    },
    [nodes, setNodes, setEdges, markDirty],
  );

  const addTool = useCallback(
    (handle: string) => {
      const id = `tool_${handle}`;
      if (nodes.some((n) => n.id === id)) return;
      const y = 220 + nodes.filter((n) => n.data.kind === "tool").length * 96 + (toolSeq++ % 2) * 8;
      setNodes((nds) => [
        ...nds,
        { id, type: "agentNode", position: { x: 0, y }, data: decorate({ kind: "tool", title: "", toolHandle: handle }) },
      ]);
      setEdges((eds) => [...eds, { id: `e_${id}`, source: id, target: "agent", type: "routed" }]);
      setPaletteOpen(false);
      markDirty();
    },
    [nodes, setNodes, setEdges, markDirty],
  );

  const defaultEdgeOptions = useMemo(() => ({ type: "routed" as const }), []);

  const autoArrange = useCallback(async () => {
    const rf = rfRef.current;
    if (!rf) return;
    const ns = rf.getNodes() as Node<AgentNodeData>[];
    const es = rf.getEdges();
    if (ns.length === 0) return;
    const laid = await elkLayout(ns, es);
    const posById = new Map(laid.nodes.map((n) => [n.id, n.position] as const));
    const ptsById = new Map(laid.edges.map((e) => [e.id, (e.data?.points as Point[] | undefined) ?? []] as const));
    setNodes((nds) => nds.map((n) => ({ ...n, position: posById.get(n.id) ?? n.position })));
    setEdges((eds) => eds.map((e) => ({ ...e, type: "routed", data: { ...(e.data ?? {}), points: ptsById.get(e.id) ?? [] } })));
    setTimeout(() => rfRef.current?.fitView({ padding: 0.2, duration: 400 }), 60);
  }, [setNodes, setEdges]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const hubNode = nodes.find((n) => n.data.kind === "agent");
    const trimmed = (hubNode?.data.name ?? "").trim();
    if (!trimmed) {
      toast.error("Name your agent before saving");
      if (hubNode) setSelected({ id: hubNode.id, data: hubNode.data });
      return;
    }
    const modelNode = nodes.find((n) => n.data.kind === "model");
    const kbNode = nodes.find((n) => n.data.kind === "knowledge");
    const toolNodes = nodes.filter((n) => n.data.kind === "tool");
    const rec: AgentRecord = {
      id: record.id,
      name: trimmed,
      type: hubNode!.data.agentType ?? "chat",
      status: hubNode!.data.status ?? "draft",
      tools: toolNodes.map((n) => n.data.toolHandle).filter((h): h is string => !!h),
      masterPrompt: hubNode!.data.masterPrompt ?? "",
      knowledgeBase: kbNode?.data.knowledgeBase ?? "",
      postCall: hubNode!.data.postCall ?? [],
      /* Carried through rather than rebuilt from the canvas: this builder has
         no editor for either yet. Defaulting them here would silently wipe an
         agent's dispositions the first time somebody renamed it, and every
         inbound journey branching on those dispositions would lose its
         outputs. */
      dispositions: record.dispositions,
      attributes: record.attributes,
      evalPrompt: hubNode!.data.evalPrompt,
      modelConfigId: modelNode?.data.modelConfigId,
    };
    saveAgent(rec);
    // Bypass the unsaved-changes guard for this intentional navigation — the
    // `dirty` state won't have flushed to false yet when the blocker re-checks.
    savingRef.current = true;
    setDirty(false);
    toast.success(isNew ? "Agent created" : "Changes saved", { description: trimmed });
    navigate({ to: "/agents" });
  }, [nodes, record, isNew, navigate]);

  // ── Unsaved-changes guard (same toast pattern as the campaign builder) ──────
  const { status: blockStatus, proceed, reset } = useBlocker({
    shouldBlockFn: () => dirty && !savingRef.current,
    enableBeforeUnload: false,
    withResolver: true,
  });
  useEffect(() => {
    if (blockStatus !== "blocked") return;
    toast.warning("Unsaved changes", {
      id: "unsaved-agent-blocker",
      description: "Leave the builder? Your changes will be lost.",
      duration: Infinity,
      action: { label: "Leave", onClick: () => proceed?.() },
      cancel: { label: "Stay", onClick: () => reset?.() },
      onDismiss: () => reset?.(),
    });
  }, [blockStatus, proceed, reset]);

  const availableTools = TOOLS.filter((t) => !nodes.some((n) => n.data.toolHandle === t.handle));

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/agents" className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Agents</span>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <Input
            value={name}
            onChange={(e) => hub && updateNodeData(hub.id, { name: e.target.value })}
            placeholder="agent_name"
            className="h-8 w-[220px] font-mono text-[13.5px] font-medium"
          />
          <span className={cn(
            "ml-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
            status === "live" ? "border-success/30 bg-success/10 text-success"
              : status === "paused" ? "border-muted-foreground/30 bg-muted text-muted-foreground"
              : "border-warning/30 bg-warning/10 text-warning",
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full", status === "live" ? "bg-success" : status === "paused" ? "bg-muted-foreground" : "bg-warning")} />
            {status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => navigate({ to: "/agents" })}>
            Cancel
          </Button>
          <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={handleSave}>
            {isNew ? "Create agent" : "Save agent"}
          </Button>
        </div>
      </header>

      {/* Canvas + inspector */}
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={agentNodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable
          nodesConnectable={false}
          onInit={(inst) => { rfRef.current = inst; }}
          onNodesChange={(c) => {
            // Agent / Model / Knowledge nodes are fixed — drop removals that target them.
            const fixedIds = new Set(nodes.filter((n) => n.data.kind !== "tool").map((n) => n.id));
            onNodesChange(c.filter((ch) => !(ch.type === "remove" && fixedIds.has(ch.id))));
          }}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelected(null)}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={1.6}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-dot)" />
          <Controls position="bottom-left" showInteractive={false}>
            <ControlButton onClick={autoArrange} title="Auto-arrange & fit">
              <Wand2 />
            </ControlButton>
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

        {/* Tool palette */}
        <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-col items-start gap-2">
          <button
            onClick={() => setPaletteOpen((v) => !v)}
            className="pointer-events-auto flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[12.5px] font-medium shadow-sm transition-colors hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" /> Add tool
          </button>
          {paletteOpen && (
            <div className="pointer-events-auto w-[280px] overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_40px_-12px_rgba(0,0,0,0.2)] animate-fade-in">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tools</p>
                <button onClick={() => setPaletteOpen(false)} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="scrollbar-thin max-h-[420px] overflow-y-auto py-1">
                {availableTools.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">All tools added.</p>
                ) : (
                  availableTools.map((t) => (
                    <button
                      key={t.handle}
                      onClick={() => addTool(t.handle)}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block font-mono text-[12.5px] text-foreground">{t.handle}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{t.description}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <AgentConfigPanel
          key={selected?.id}
          node={selected}
          onChange={(patch) => selected && updateNodeData(selected.id, patch)}
          onClose={() => setSelected(null)}
          onDelete={() => selected && deleteNode(selected.id)}
        />
      </div>
    </div>
  );
}
