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
import { ShadowWarning } from "@/components/inbound/RoutingByNumber";
import { NumberPicker } from "@/components/inbound/NumberPicker";
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
  /* Splits arrivals, not an audience. Testing two agents or two prompts against
     live inbound traffic is the reason it is here; the earlier palette left it out
     on the grounds that inbound has no audience to fan out over, which confused
     the thing being split with the thing it is drawn from. */
  abSplit: { subtitle: "Split arrivals", valid: false, error: "Set the split" },
  whatsappFreeform: { subtitle: "Send and wait", valid: false, error: "Add a message" },
  agentSession: { subtitle: "Select an agent", valid: false, error: "Select agent" },
  /* Terminal: a person owns the conversation from here, so there is nothing for
     the journey to do next. */
  assignHuman: { subtitle: "Needs a person", valid: true },
  end: { valid: true, locked: true },
};

let nodeSeq = 0;

// ── Graph ⇄ ReactFlow ───────────────────────────────────────────────────────

/**
 * Graph to canvas, stamping the entry point's channel onto every node.
 *
 * Done here rather than in an effect because the layout pass is async: it reads
 * the node array, awaits ELK, then writes the laid-out result back wholesale, so
 * an effect that stamps after mount is simply overwritten. Stamping where the
 * nodes are built means there is no second writer to race.
 */
function toFlow(
  graph: InboundGraph,
  ep: { channel: EntryPoint["channel"]; addresses: string[] },
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: "workflow",
      position: n.position,
      data: { ...n.data, config: { ...n.data.config, channel: ep.channel, address: ep.addresses[0] ?? "" } },
    })),
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
  /* `channel` is stamped onto every node's config rather than stored on it: the
     trigger and agent panels both key off it, and a node carrying its own copy is
     a copy that can disagree with the entry point it lives on. */
  const navigate = useNavigate();
  const initial = useMemo(() => toFlow(ep.graph, ep), [ep]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selected, setSelected] = useState<{ id: string; data: WorkflowNodeData } | null>(null);
  const [name, setName] = useState(ep.name);
  const [addresses, setAddresses] = useState<string[]>(ep.addresses);
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
      /* A node that gains named outputs orphans the edge that left it when it had
         none: that edge carries no handle, and nothing matches it any more. The
         old single path is the catch-all by definition, so adopt it onto
         `default` rather than letting the author discover a broken graph through
         an unreachable-path warning they did not cause. */
      if (patch.outputs?.some((o) => o.id === "default")) {
        setEdges((eds) => eds.map((e) =>
          e.source === id && e.sourceHandle == null
            ? { ...e, sourceHandle: "default" }
            : e));
      }
      markDirty();
    },
    [setNodes, setEdges, markDirty],
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
            /* Every node that has a config panel keying off the entry point gets
               it stamped here. See the note at the top of this component. */
            config: { ...DEFAULTS[kind]?.config, channel: ep.channel, address: addresses[0] ?? "" },
          },
        }];
      });
      markDirty();
    },
    [setNodes, markDirty, ep.channel, addresses],
  );

  /* The number is editable in the header and the codes section renders it into a
     URL the author copies, so a change has to reach the node. Guarded against the
     mount pass, where `toFlow` has already stamped it and the async layout write
     would otherwise race this one. */
  useEffect(() => {
    const primary = addresses[0] ?? "";
    if (primary === (ep.addresses[0] ?? "")) return;
    setNodes((nds) => nds.map((n) =>
      n.data.config?.address === primary
        ? n
        : { ...n, data: { ...n.data, config: { ...n.data.config, address: primary } } }));
  }, [addresses, ep.addresses, setNodes]);

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
    if (addresses.length === 0) return toast.error("Bind at least one number before saving");

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

    saveEntryPoint({ ...ep, name: trimmedName, addresses, status, graph });
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
  }, [name, addresses, status, nodes, graph, ep, isNew, navigate]);

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
          {/* The picker lists WhatsApp numbers, so it is only right on a WhatsApp
              entry point. Voice and webhook bind a DID and a URL, which are not in
              this registry and cannot be created in v1 anyway — shown read-only
              rather than offered a list of the wrong kind of address. */}
          {ep.channel === "whatsapp" ? (
            <NumberPicker
              value={addresses}
              onChange={(next) => { setAddresses(next); markDirty(); }}
            />
          ) : (
            <span className="truncate rounded-md border border-border bg-secondary px-2.5 py-1.5 font-mono text-[12px] text-muted-foreground">
              {addresses[0] ?? "Not bound"}
            </span>
          )}
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

      {/* Whether this entry point will ever receive an arrival, said where it can
          still change what somebody builds. Above the canvas rather than inside a
          node, because it is about the number, not the graph. */}
      <div className="shrink-0 px-3 pt-2 empty:hidden">
        <ShadowWarning ep={{ ...ep, addresses, graph }} />
      </div>

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
