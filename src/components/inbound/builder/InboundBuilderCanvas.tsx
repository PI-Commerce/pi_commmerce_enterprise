/**
 * Full-screen entry-point builder — the canvas that replaced the ordered rule form.
 *
 * The graph describes what happens to ONE arrival, so it reuses the campaign DSL
 * wholesale (`WorkflowNodeData`, the node renderer, `ConfigPanel`). What is inbound-
 * specific lives here: a channel-scoped variable universe, a palette without the
 * outbound-only primitives, and two analyses that run continuously against the real
 * resolver rather than against the shape of the graph —
 *
 *   - **unreachable edges**, because on a canvas the branch order that shadows a path
 *     is hidden inside a conditional's config panel; and
 *   - **trace**, which answers "where does this arrival actually go" without saving.
 *
 * Both call `resolveViaGraph`, so neither can drift from what the funnel will show.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useBlocker } from "@tanstack/react-router";
import ReactFlow, {
  Background, BackgroundVariant, Controls, ControlButton, MiniMap,
  addEdge, useEdgesState, useNodesState,
  type Connection, type Edge, type Node, type NodeMouseHandler, type ReactFlowInstance,
} from "reactflow";
import { ChevronLeft, Wand2, AlertTriangle, Route as RouteIcon, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { elkLayout, type Point } from "@/lib/flow-layout";
import { nodeTypes } from "@/components/workflow/nodes";
import { edgeTypes } from "@/components/workflow/edges";
import { ConfigPanel } from "@/components/workflow/ConfigPanel";
import { NodePalette, INBOUND_SECTIONS } from "@/components/workflow/NodePalette";
import { NODE_LABELS, SERIAL_PREFIX, type NodeKind, type WorkflowNodeData } from "@/lib/campaign-types";
import { apiOutcomeOutputs, deriveNodeOutcomeVariables } from "@/lib/wa-outputs";
import { saveEntryPoint, type EntryPoint } from "@/lib/inbound";
import { useAgents } from "@/lib/agent-data";
import {
  deadEdges, describeRoute, isRoutingTerminal, resolveViaGraph, TRIGGER_VARIABLES,
  type ArrivalTraits, type InboundGraph,
} from "@/lib/inbound-graph";

/** Per-kind starting state for a node dropped on an inbound canvas. */
const DEFAULTS: Partial<Record<NodeKind, Partial<WorkflowNodeData>>> = {
  apiToolCall: { subtitle: "Call an API", valid: false, error: "Select API tool", outputs: apiOutcomeOutputs() },
  aiTransform: { subtitle: "Extract with a model", valid: false, error: "Add a prompt" },
  // Seeded explicitly so `ConditionalFields` never reaches for its campaign demo
  // branches, which key on `contact.*` / `wa.*` — variables an inbound graph has no
  // way to produce. `trigger.within_hours` is published on both channels.
  conditional: {
    subtitle: "Route on a signal",
    valid: false,
    error: "Add a branch",
    config: {
      branches: [{
        id: "b1",
        label: "Within business hours",
        conditions: [{ variable: "trigger.within_hours", op: "equals", value: "true" }],
      }],
    },
  },
  delay: { subtitle: "Wait", valid: true },
  agentSession: { subtitle: "Select an agent", valid: false, error: "Select agent" },
  end: { valid: true, locked: true },
};

let nodeSeq = 0;

// ── Graph ⇄ ReactFlow ───────────────────────────────────────────────────────

function toFlow(graph: InboundGraph): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({ id: n.id, type: "workflow", position: n.position, data: n.data })),
    edges: graph.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined, type: "routed",
    })),
  };
}

function toGraph(nodes: Node<WorkflowNodeData>[], edges: Edge[]): InboundGraph {
  return {
    nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
    edges: edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null,
    })),
  };
}

// ── Trace scenarios ─────────────────────────────────────────────────────────

/**
 * The arrivals worth showing an author. Channel-scoped for the same reason the
 * trigger's variables are: there is no such thing as a phone call from an ad, so
 * offering that scenario would invite a branch that can never fire.
 */
function scenarios(ep: EntryPoint): { label: string; traits: ArrivalTraits }[] {
  const hours = ep.hours
    ? [{ suffix: " · in hours", withinHours: true }, { suffix: " · after hours", withinHours: false }]
    : [{ suffix: "", withinHours: true }];
  const bases = ep.channel === "whatsapp"
    ? [{ label: "From an ad", hasReferral: true }, { label: "Direct message", hasReferral: false }]
    : [{ label: "Incoming call", hasReferral: false }];
  return bases.flatMap((b) =>
    hours.map((h) => ({
      label: b.label + h.suffix,
      traits: { hasReferral: b.hasReferral, withinHours: h.withinHours },
    })),
  );
}

// ── Canvas ──────────────────────────────────────────────────────────────────

export function InboundBuilderCanvas({ ep, isNew }: { ep: EntryPoint; isNew: boolean }) {
  const navigate = useNavigate();
  const initial = useMemo(() => toFlow(ep.graph), [ep.graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selected, setSelected] = useState<{ id: string; data: WorkflowNodeData } | null>(null);
  const [name, setName] = useState(ep.name);
  const [address, setAddress] = useState(ep.address);
  // Liveness is edited here because the canvas is the only surface an entry point
  // has. Unlike the detail page it replaced, the toggle does not write through
  // immediately — it is folded into Save, so routing and liveness commit together
  // and you cannot set a half-wired graph live by accident.
  const [status, setStatus] = useState(ep.status);
  const [dirty, setDirty] = useState(false);
  const [tracing, setTracing] = useState(false);
  const [layingOut, setLayingOut] = useState(true);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const savingRef = useRef(false);
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;

  const markDirty = useCallback(() => setDirty(true), []);

  // Seeded graphs ship positionless (see `seedGraph`), so lay them out before the
  // first paint or every node stacks at the origin.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const laid = await elkLayout(nodesRef.current, edgesRef.current);
      if (cancelled) return;
      setNodes(laid.nodes);
      setEdges(laid.edges);
      setLayingOut(false);
    })();
    return () => { cancelled = true; };
  }, [setNodes, setEdges]);

  // ── Continuous analysis against the real resolver ─────────────────────────
  const graph = useMemo(() => toGraph(nodes, edges), [nodes, edges]);
  const dead = useMemo(() => deadEdges(graph), [graph]);

  const styledEdges = useMemo(
    () => edges.map((e) => (dead.has(e.id)
      ? { ...e, style: { stroke: "var(--destructive)", strokeDasharray: "5 4" }, animated: false }
      : e)),
    [edges, dead],
  );

  const variables = useMemo(
    () => [...TRIGGER_VARIABLES[ep.channel], ...deriveNodeOutcomeVariables(nodes)],
    [ep.channel, nodes],
  );

  // ── Editing ───────────────────────────────────────────────────────────────
  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    setSelected({ id: node.id, data: node.data as WorkflowNodeData });
  }, []);

  const updateNodeData = useCallback(
    (id: string, patch: Partial<WorkflowNodeData>) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
      setSelected((s) => (s && s.id === id ? { ...s, data: { ...s.data, ...patch } } : s));
      markDirty();
    },
    [setNodes, markDirty],
  );

  const deleteNode = useCallback(
    (id: string) => {
      const target = nodes.find((n) => n.id === id);
      if (!target || target.data.kind === "inboundTrigger") return;
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelected(null);
      markDirty();
    },
    [nodes, setNodes, setEdges, markDirty],
  );

  const duplicateNode = useCallback(
    (id: string) => {
      const target = nodes.find((n) => n.id === id);
      if (!target || target.data.kind === "inboundTrigger") return;
      const newId = `n_${++nodeSeq}_${Date.now().toString(36)}`;
      setNodes((nds) => [...nds, {
        ...target, id: newId, selected: false,
        position: { x: target.position.x + 40, y: target.position.y + 40 },
        data: { ...target.data, title: `${target.data.title} (copy)` },
      }]);
      markDirty();
    },
    [nodes, setNodes, markDirty],
  );

  const addNode = useCallback(
    (kind: NodeKind) => {
      const newId = `n_${++nodeSeq}_${Date.now().toString(36)}`;
      setNodes((nds) => {
        const serial = `${SERIAL_PREFIX[kind]}_${nds.filter((n) => n.data.kind === kind).length + 1}`;
        return [...nds, {
          id: newId,
          type: "workflow",
          position: { x: 340, y: 160 + nds.length * 24 },
          data: {
            kind, title: NODE_LABELS[kind], serial,
            ...DEFAULTS[kind],
            // The agent picker gates itself on this rather than reaching for the
            // entry point — see PresetConfig.channel.
            ...(kind === "agentSession" ? { config: { channel: ep.channel } } : {}),
          },
        }];
      });
      markDirty();
    },
    [setNodes, markDirty, ep.channel],
  );

  const onConnect = useCallback((c: Connection) => {
    setEdges((eds) => addEdge({ ...c, type: "routed" }, eds));
    markDirty();
  }, [setEdges, markDirty]);

  // The graph's shape enforces the model: nothing precedes the trigger, and nothing
  // follows an agent session (a Session is a leaf — one agent, one transcript).
  const isValidConnection = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return false;
      const src = nodes.find((n) => n.id === c.source);
      const tgt = nodes.find((n) => n.id === c.target);
      if (!src || !tgt) return false;
      if (tgt.data.kind === "inboundTrigger") return false;
      if (isRoutingTerminal(src.data.kind)) return false;
      const handle = c.sourceHandle ?? null;
      // One target per output port — a branch that forked would have no defined order.
      return !edges.some((e) => e.source === c.source && (e.sourceHandle ?? null) === handle);
    },
    [nodes, edges],
  );

  const autoArrange = useCallback(async () => {
    const rf = rfRef.current;
    if (!rf) return;
    const laid = await elkLayout(rf.getNodes() as Node<WorkflowNodeData>[], rf.getEdges());
    const posById = new Map(laid.nodes.map((n) => [n.id, n.position] as const));
    const ptsById = new Map(laid.edges.map((e) => [e.id, (e.data?.points as Point[] | undefined) ?? []] as const));
    setNodes((nds) => nds.map((n) => ({ ...n, position: posById.get(n.id) ?? n.position })));
    setEdges((eds) => eds.map((e) => ({ ...e, type: "routed", data: { ...(e.data ?? {}), points: ptsById.get(e.id) ?? [] } })));
    setTimeout(() => rfRef.current?.fitView({ padding: 0.2, duration: 400 }), 60);
  }, [setNodes, setEdges]);

  // ── Save ──────────────────────────────────────────────────────────────────
  //
  // The gate is about wiring, not coverage. An arrival with nowhere to go is a
  // legitimate design (an out-of-hours voice line deliberately drops the call and
  // the funnel reports it as a routing gap); an arrival that stops mid-graph on a
  // dangling edge is not — it means the author left an output unwired.
  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return toast.error("Name this entry point before saving");
    if (!address.trim()) return toast.error("Bind a number before saving");

    const invalid = nodes.find((n) => n.data.valid === false);
    if (invalid) {
      setSelected({ id: invalid.id, data: invalid.data });
      return toast.error(`${invalid.data.title} isn't configured`, { description: invalid.data.error });
    }

    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const s of scenarios(ep)) {
      const { path } = resolveViaGraph(graph, s.traits);
      const last = byId.get(path[path.length - 1]);
      if (last && !isRoutingTerminal(last.data.kind)) {
        setSelected({ id: last.id, data: last.data });
        return toast.error("A path stops mid-graph", {
          description: `“${s.label}” reaches ${last.data.title} and has nowhere to go next.`,
        });
      }
    }

    saveEntryPoint({ ...ep, name: trimmedName, address: address.trim(), status, graph });
    setDirty(false);
    toast.success(isNew ? "Entry point created" : "Changes saved", { description: trimmedName });

    // Saving keeps you on the canvas — it is the entry point's only view, so there
    // is nowhere to go. A new one is the exception: it was minted under a generated
    // id, and that id has to reach the URL or the next Save would create a second
    // record instead of editing this one.
    if (isNew) {
      savingRef.current = true;
      void navigate({ to: "/inbound/$id", params: { id: ep.id }, replace: true })
        .finally(() => { savingRef.current = false; });
    }
  }, [name, address, status, nodes, graph, ep, isNew, navigate]);

  // ── Unsaved-changes guard ─────────────────────────────────────────────────
  const { status: blockStatus, proceed, reset } = useBlocker({
    shouldBlockFn: () => dirty && !savingRef.current,
    enableBeforeUnload: false,
    withResolver: true,
  });
  useEffect(() => {
    if (blockStatus !== "blocked") return;
    toast.warning("Unsaved changes", {
      id: "unsaved-inbound-blocker",
      description: "Leave the builder? Your routing changes will be lost.",
      duration: Infinity,
      action: { label: "Leave", onClick: () => proceed?.() },
      cancel: { label: "Stay", onClick: () => reset?.() },
      onDismiss: () => reset?.(),
    });
  }, [blockStatus, proceed, reset]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/inbound" className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Inbound</span>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <Input
            value={name}
            onChange={(e) => { setName(e.target.value); markDirty(); }}
            placeholder="Entry point name"
            className="h-8 w-[220px] text-[13.5px] font-medium"
          />
          <span className="rounded-md border border-border bg-secondary px-2 py-1 text-[11px] capitalize text-muted-foreground">
            {ep.channel === "voice" ? "Voice" : "WhatsApp"}
          </span>
          <Input
            value={address}
            onChange={(e) => { setAddress(e.target.value); markDirty(); }}
            placeholder={ep.channel === "voice" ? "+91 80 4718 2200" : "+91 98765 43210"}
            className="h-8 w-[180px] font-mono text-[12px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setStatus((s) => (s === "live" ? "paused" : "live")); markDirty(); }}
            title={status === "live"
              ? "Pause — arrivals stop being answered"
              : "Set live — start answering arrivals"}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium capitalize transition-colors",
              status === "live" ? "border-success/30 bg-success/10 text-success hover:bg-success/20"
              : status === "draft" ? "border-warning/30 bg-warning/10 text-warning hover:bg-warning/20"
              : "border-muted-foreground/30 bg-muted text-muted-foreground hover:bg-accent",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", status === "live" ? "bg-success animate-pulse" : "bg-current opacity-60")} />
            {status}
          </button>
          {dead.size > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] font-medium text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {dead.size} unreachable {dead.size === 1 ? "path" : "paths"}
            </span>
          )}
          <Button
            variant="outline" size="sm"
            className={cn("h-8 gap-1.5 px-3 text-xs", tracing && "bg-accent")}
            onClick={() => setTracing((v) => !v)}
          >
            <RouteIcon className="h-3.5 w-3.5" /> Trace
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => navigate({ to: "/inbound" })}>
            Cancel
          </Button>
          <Button size="sm" className="h-8 px-4 text-xs" onClick={handleSave}>
            {isNew ? "Create entry point" : "Save routing"}
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {!layingOut && (
          <ReactFlow
            nodes={nodes}
            edges={styledEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(inst) => { rfRef.current = inst; }}
            onNodesChange={(c) => {
              // The trigger is the one node an entry point cannot be without.
              const triggerIds = new Set(nodes.filter((n) => n.data.kind === "inboundTrigger").map((n) => n.id));
              onNodesChange(c.filter((ch) => !(ch.type === "remove" && triggerIds.has(ch.id))));
            }}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelected(null)}
            defaultEdgeOptions={{ type: "routed" }}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
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
        )}

        <NodePalette onAdd={addNode} sections={INBOUND_SECTIONS} />

        {tracing && <TracePanel ep={ep} graph={graph} onClose={() => setTracing(false)} />}

        <ConfigPanel
          key={selected?.id}
          node={selected}
          onClose={() => setSelected(null)}
          onChange={(patch) => selected && updateNodeData(selected.id, patch)}
          onDelete={() => selected && deleteNode(selected.id)}
          onDuplicate={() => selected && duplicateNode(selected.id)}
          suppressSampleVariables
          extraVariables={variables.filter((v) => {
            const ns = selected?.data?.serial ?? selected?.id;
            return !selected || !v.key.startsWith(`${ns}.`);
          })}
        />
      </div>
    </div>
  );
}

// ── Trace ───────────────────────────────────────────────────────────────────

/**
 * Where each kind of arrival actually ends up, run through the same resolver the
 * funnel uses. This is what the canvas owes the author in exchange for hiding
 * branch order inside a config panel.
 */
function TracePanel({ ep, graph, onClose }: { ep: EntryPoint; graph: InboundGraph; onClose: () => void }) {
  const agents = useAgents();
  const rows = scenarios(ep).map((s) => {
    const r = resolveViaGraph(graph, s.traits);
    return {
      ...s,
      route: describeRoute(graph, r.path),
      agent: agents.find((a) => a.id === r.agentId)?.name,
    };
  });

  return (
    <div className="absolute right-4 top-4 z-20 w-[300px] overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_40px_-12px_rgba(0,0,0,0.2)] animate-fade-in">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Trace an arrival</p>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="scrollbar-thin max-h-[420px] space-y-2 overflow-y-auto p-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-border bg-background p-2.5">
            <p className="text-[11.5px] font-medium">{r.label}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{r.route}</p>
            <p className={cn("mt-1.5 text-[11px] font-medium", r.agent ? "text-foreground" : "text-destructive")}>
              {r.agent ?? "Nobody answers"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
