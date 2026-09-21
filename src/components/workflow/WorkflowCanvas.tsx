import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import ReactFlow, {
  Background, BackgroundVariant, Controls, ControlButton, MiniMap,
  addEdge, useEdgesState, useNodesState, getNodesBounds,
  type Connection, type Edge, type Node, type NodeMouseHandler,
  type ReactFlowInstance,
} from "reactflow";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import { nodeTypes, CanvasModeContext } from "./nodes";
import { edgeTypes } from "./edges";
import type { WorkflowNodeData, NodeKind, CampaignStatus } from "@/lib/campaign-types";
import { NODE_LABELS } from "@/lib/campaign-types";
import { whatsappOutputs, completedOutput, deriveNodeOutcomeVariables } from "@/lib/wa-outputs";
import { EXAMPLE_CAMPAIGNS } from "@/lib/campaign-examples";
import { getSuggestion } from "@/lib/pi-node-suggestions";
import { applyPiToolCallsToGraph, type PiToolCallLog } from "@/lib/pi-canvas-apply";
import type { ProposedDraft } from "@/lib/pi-propose-draft";
import { buildDraftSkeleton, resetCanvasForNewDraft } from "@/lib/pi-draft-skeleton";
import { readCampaignFn, updateNodePositionsFn, resetCampaignForNewDraftFn } from "@/lib/server-fns/campaigns";
import { dslToReactFlow } from "@/lib/dsl-convert";
import { elkLayout, type Point } from "@/lib/flow-layout";
import { useRegion, localizeTzAbbrev, localizeCurrency } from "@/lib/region";
import { ConfigPanel } from "./ConfigPanel";
import { AiComposer } from "./AiComposer";
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
  apiToolCall: { subtitle: "Call an API", valid: false, error: "Configure request" },
  conditional: { subtitle: "Route on variable", valid: false, error: "Add a branch" },
  abSplit: { subtitle: "Split traffic", valid: false, error: "Set split %" },
  delay: { subtitle: "Wait", valid: false, error: "Set duration" },
  voiceCall: { subtitle: "AI voice outreach", valid: false, error: "Select agent", outputs: completedOutput() },
  whatsapp: { subtitle: "Send WhatsApp message", valid: false, error: "Pick template", outputs: whatsappOutputs(undefined) },
  whatsappFreeform: { subtitle: "WhatsApp freeform workflow", valid: false, error: "Pick workflow" },
  sms: { subtitle: "Send SMS", valid: false, error: "Add message body", outputs: completedOutput() },
  rcs: { subtitle: "Send RCS", valid: false, error: "Pick template", outputs: completedOutput() },
  aiTransform: { subtitle: "AI transformation", valid: false, error: "Set prompt" },
};

let nodeCounter = 100;

/**
 * The canonical blank-canvas graph. Every fresh campaign renders these three
 * nodes with Start > Audience already wired, matching the exact shape written
 * to D1 by `createBlankCampaign`. On mount the D1 hydrate replaces this in
 * place — but even if the D1 write hasn't landed yet, or D1 is unavailable,
 * the user still sees the three canonical nodes instead of just Start.
 *
 * Positions are LEFT-to-RIGHT (ELK re-lays anyway once branches spread out).
 * Start and End are locked so the delete key can't remove them.
 */
const BLANK_NODES: Node<WorkflowNodeData>[] = [
  { id: "start", type: "workflow", position: { x: 0, y: 0 },
    data: { kind: "start", title: "Start", locked: true, valid: true } },
  { id: "audience", type: "workflow", position: { x: 240, y: 0 },
    data: {
      kind: "audience",
      title: "Audience",
      subtitle: "Configure the source",
      valid: false,
      error: "Select source",
      // Explicit empty schema (both keys present, both empty). This is what
      // stops ConfigPanel's `AudienceFields` from falling back to the
      // sample-CSV columns (customer_id / phone / first_name / …) when the
      // audience config is otherwise blank on a fresh campaign.
      config: { fields: [], csvKeys: [] },
    } },
  { id: "end", type: "workflow", position: { x: 480, y: 0 },
    data: { kind: "end", title: "End", locked: true, valid: true } },
];

const BLANK_EDGES: Edge[] = [
  { id: "e_start_audience", source: "start", target: "audience", type: "routed" },
];

/**
 * Snapshot handle the parent (route) uses to pull the current graph state
 * when Save is pressed, without lifting nodes/edges into the route's state.
 */
export type CanvasGraphSnapshot = {
  nodes: import("reactflow").Node<WorkflowNodeData>[];
  edges: import("reactflow").Edge[];
};

export function WorkflowCanvas({
  status,
  campaignId,
  onValidityChange,
  onDirty,
  autoStartAskPi = false,
  isNew = false,
  onAiBuiltName,
  previewOnly = false,
  onControlReady,
}: {
  status: CampaignStatus;
  campaignId?: string;
  onValidityChange?: (validCount: number, total: number) => void;
  onDirty?: () => void;
  autoStartAskPi?: boolean;
  isNew?: boolean;
  onAiBuiltName?: (name: string) => void;
  /** Read-only snapshot mode (e.g. Version History): no palette, no Ask Pi, no editing,
   *  no run pulse — but nodes are still clickable and show their config read-only. */
  previewOnly?: boolean;
  /**
   * Fired once on mount with a snapshot getter. Parent stores it in a ref
   * and calls it from `performSave` to build the DSL payload for D1 —
   * avoids lifting the entire nodes/edges state up.
   */
  onControlReady?: (getGraph: () => CanvasGraphSnapshot) => void;
}) {
  // Pre-built example campaigns ship their own authored graph; everything else
  // (the existing demo campaigns) falls back to the shared seed graph. On mount
  // we ALSO try to hydrate from D1 — if the campaign has been saved (either by
  // Pi's builder scope or by a previous canvas Save), those changes replace
  // the in-memory seed. Falls back gracefully when D1 isn't bound.
  const example = campaignId ? EXAMPLE_CAMPAIGNS[campaignId] : undefined;
  const { tzAbbrev, symbol } = useRegion();
  const [nodes, setNodes, onNodesChange] = useNodesState(
    isNew ? BLANK_NODES : example?.nodes ?? SEED_NODES,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    isNew ? BLANK_EDGES : example?.edges ?? SEED_EDGES,
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

  // Expose a snapshot getter to the parent. Fires once on mount; the ref-based
  // read means it always returns the LIVE nodes/edges without adding a
  // re-render on every graph change.
  useEffect(() => {
    onControlReady?.(() => ({ nodes: nodesRef.current, edges: edgesRef.current }));
  }, [onControlReady]);

  // D1 hydrate: fire once per campaign id. If D1 returns a saved graph, we
  // replace the seed nodes/edges. This is what lets Pi's builder-scope edits
  // survive refresh — the LLM writes to D1 via insert_node, refresh re-reads
  // from D1, canvas shows the updated graph. Falls back gracefully if D1
  // isn't bound (prod pre-provisioning): the seed graph already rendered.
  useEffect(() => {
    // Skip only when there's no real id (unlikely; the /campaigns/new URL
    // path was retired in favour of minting a real id on Create). `isNew`
    // no longer gates D1 hydration — a freshly created campaign has its
    // baseline (Start, Audience, End) written to D1 at create time by
    // `createBlankCampaignFn`, so hydrating on mount is what makes Ask
    // Pi's context (`getBuilderContext`) see the same state the user does.
    if (!campaignId || campaignId === "new") return;
    let cancelled = false;
    (async () => {
      try {
        const r = await readCampaignFn({ data: campaignId });
        if (cancelled || !r.ok || !r.dsl) return;
        // Only override if the D1 graph is non-empty. An empty D1 row usually
        // means the seed hasn't run remotely; sticking with EXAMPLE_CAMPAIGNS
        // is friendlier than blanking the canvas.
        if (r.dsl.nodes.length === 0) return;
        const { nodes: hn, edges: he } = dslToReactFlow(r.dsl);
        setNodes(hn);
        setEdges(he);
        // Trigger a re-lay: positions from D1 might differ from ELK's layout.
        didLayoutRef.current = false;
      } catch {
        // Silent fallback — the seed graph is already rendered.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

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

  // Reachability — every non-End node needs at least one outgoing edge,
  // otherwise leads walk into a dead-end.
  //
  // Skip cases:
  //   - Nodes with the `_skel_` prefix (transient draft placeholders).
  //   - The ENTIRE graph while ANY draft skeleton is present. During a
  //     Draft-this pass the reset strips downstream edges from Audience
  //     one render before the skeleton edges land — running the check in
  //     that gap flashes a false "Not wired forward" on Audience for a
  //     single frame that users see and think is a real error. Skeletons
  //     get replaced by Pi's real inserts moments later; wiring stabilizes
  //     then and the check resumes.
  const hasSkeletons = useMemo(() => nodes.some((n) => n.id.startsWith("_skel_")), [nodes]);
  const reachabilitySig = useMemo(() => {
    // ALWAYS compute the real signature — even during skeleton passes —
    // so the effect fires and clears stale errors the moment wiring is
    // good. The write-path suppression happens inside the effect body.
    //
    // Sig includes each node's declared handles + which are wired, so
    // a per-handle edge add/remove re-fires the check. Without this,
    // adding an edge on a specific handle wouldn't invalidate the sig
    // if the node already had any outgoing edge.
    const wired = new Set<string>();
    for (const e of edges) wired.add(`${e.source}#${e.sourceHandle ?? ""}`);
    return nodes
      .map((n) => {
        const handles = (n.data.outputs ?? []).map((o) => o.id);
        const key = handles.length > 0
          ? handles.map((h) => `${h}:${wired.has(`${n.id}#${h}`) ? 1 : 0}`).join(",")
          : `_:${edges.some((e) => e.source === n.id) ? 1 : 0}`;
        return `${n.id}|${key}`;
      })
      .join("¦");
  }, [nodes, edges]);

  useEffect(() => {
    if (!editable) return;
    setNodes((nds) => {
      const outgoing = new Set<string>();
      for (const e of edges) outgoing.add(e.source);
      const REACH_ERROR = "Not wired forward — connect this into the next step or into End.";
      // Prefix that identifies wiring errors written by this useEffect.
      // Includes both the reachability error above and any per-handle
      // "'X' branch has no downstream connection" written below. Clean-
      // up on this render must clear ALL of them when wiring is good.
      const isWiringError = (err: string | undefined) =>
        err === REACH_ERROR
        || (typeof err === "string" && err.includes(" branch has no downstream connection"));
      let changed = false;
      const next = nds.map((n) => {
        if (n.id.startsWith("_skel_")) return n;
        if (n.data.kind === "end") return n;
        const hadWiringError = isWiringError(n.data.error);

        // Reachability first — node has zero outgoing edges of any handle.
        if (!outgoing.has(n.id)) {
          // Skeleton-in-progress: DO NOT write new errors (avoid the
          // single-frame flash while the Draft-this reset settles).
          if (hasSkeletons) return n;
          // Config-level errors from ConfigPanel take precedence.
          if (n.data.valid === false && !hadWiringError) return n;
          if (n.data.error === REACH_ERROR) return n;
          changed = true;
          return { ...n, data: { ...n.data, valid: false, error: REACH_ERROR } };
        }

        // Per-handle wiring — EVERY declared handle on this node must
        // have an outgoing edge. Applies to conditional branches +
        // default, abSplit variants, whatsapp buttons + reply_received
        // + timeout + failure, sms/rcs delivery outcomes, voiceCall
        // dispositions, apiToolCall success/timeout/failure. Skeleton
        // pass: skip WRITE, allow CLEAR (same rule as reachability).
        const declared = (n.data.outputs ?? []) as Array<{ id: string; label: string }>;
        if (declared.length > 0) {
          const unwired = declared.find(
            (o) => !edges.some((e) => e.source === n.id && (e.sourceHandle ?? null) === o.id),
          );
          if (unwired) {
            if (hasSkeletons) return n;
            const newErr = `'${unwired.label}' branch has no downstream connection — wire it into End or the next step.`;
            if (n.data.valid === false && !hadWiringError) return n;
            if (n.data.error === newErr) return n;
            changed = true;
            return { ...n, data: { ...n.data, valid: false, error: newErr } };
          }
        }

        // All handles wired — clear any stale wiring error we wrote
        // earlier. Runs even during skeleton passes so an error from
        // before doesn't stick.
        if (hadWiringError) {
          changed = true;
          return { ...n, data: { ...n.data, valid: true, error: undefined } };
        }
        return n;
      });
      return changed ? next : nds;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachabilitySig, editable, setNodes, hasSkeletons, edges]);

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

  // I3 — confirmed a node-level Pi suggestion: run its real graph transform.
  // The suggestion mutates nodes/edges (fix an invalid node, rewrite a message,
  // insert a step) and clears its own hint, so the change lands live on canvas.
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

  // Builder-scope Ask Pi tool calls landed. Fold each insert_node /
  // connect_nodes / update_node into ReactFlow's live state so the graph
  // updates the moment Pi's answer arrives — no refetch, no round-trip.
  // The same tool calls also wrote to D1 server-side (via the askPi
  // handler), so the change survives refresh.
  // Ref-held handle to autoArrange (defined further down). Populated by
  // an effect so `applyDraftSkeleton` and `applyPiToolCalls` (both
  // declared above autoArrange) can trigger a relayout without hitting
  // TDZ on the const reference.
  const autoArrangeRef = useRef<(() => Promise<void>) | null>(null);

  // Confirm-Draft accepted — insert shape-aware pulsating skeletons that
  // mirror Pi's proposed plan (one placeholder per channel per branch,
  // laid out LTR, converging into `end`). Pi's real insert_node calls
  // land in the next turn; applyPiToolCallsToGraph strips the skeletons
  // just before applying the real inserts so the swap is atomic.
  const applyDraftSkeleton = useCallback(
    (draft: ProposedDraft) => {
      // First: strip every non-canonical node from the canvas. Draft this
      // replaces the flow, doesn't append to it. Without this, iterated
      // drafts pile nodes on top of previous drafts and the canvas ends
      // up with dozens of orphaned nodes across multiple sessions.
      const reset = resetCanvasForNewDraft(nodes, edges);
      const baseNodes = reset.nodes;
      const baseEdges = reset.edges;
      const { skeletonNodes, skeletonEdges, endPositionUpdate } = buildDraftSkeleton(draft, baseNodes);
      if (skeletonNodes.length === 0) return;
      setNodes(() => {
        const withEndMoved = endPositionUpdate
          ? baseNodes.map((n) => (n.id === endPositionUpdate.id ? { ...n, position: endPositionUpdate.position } : n))
          : baseNodes;
        return [...withEndMoved, ...skeletonNodes];
      });
      setEdges(() => [...baseEdges, ...skeletonEdges]);
      onDirty?.();

      // Persist the reset to D1 too — otherwise a refresh mid-build would
      // re-hydrate the old accumulated nodes. Fire-and-forget: canvas
      // already looks clean; D1 catches up in the background.
      if (reset.strippedCount > 0 && campaignId && campaignId !== "new") {
        void resetCampaignForNewDraftFn({ data: { campaignId } }).catch(() => {
          /* silent — Pi's follow-up inserts will overwrite anyway */
        });
      }
      // Two rAFs then ELK relayout — same pattern as applyPiToolCalls.
      // ReactFlow needs to mount + measure the new pulsating nodes before
      // ELK can size them correctly. Without this the skeleton lays out
      // haphazardly even with a well-formed proposal.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void autoArrangeRef.current?.();
        });
      });
    },
    [nodes, edges, setNodes, setEdges, onDirty, campaignId],
  );

  const applyPiToolCalls = useCallback(
    (toolCalls: PiToolCallLog[]) => {
      const next = applyPiToolCallsToGraph(toolCalls, nodes, edges);
      // Surface validator errors — one toast per unique reason. These are
      // tool calls the validator dropped because they violated a canonical
      // rule (reserved id, unknown target, disallowed kind for the builder
      // scope, etc.). Pi should retry with the corrected plan; this toast
      // is the demo's "you got saved" note.
      if (next.errors.length > 0) {
        const seen = new Set<string>();
        for (const err of next.errors) {
          if (seen.has(err.reason)) continue;
          seen.add(err.reason);
          toast.warning("Pi's plan needed a fix", { description: err.detail });
        }
      }
      // Focus intent — Pi called `focus_node` to spotlight a node without
      // mutating it. Do this BEFORE the graph-mutation branch so a focus
      // call in a mixed batch still lands even when no nodes changed.
      const focusCall = toolCalls.find((t) => t.name === "focus_node");
      const zoomToNode = (id: string, graphNodes: typeof nodes) => {
        const target = graphNodes.find((n) => n.id === id);
        if (!target) return;
        setSelected({ id: target.id, data: target.data as WorkflowNodeData });
        // Center + zoom in on the node so the user's eye follows Pi.
        // Two rAFs so ReactFlow finishes any pending measure pass first.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try {
              rfRef.current?.setCenter(target.position.x + 120, target.position.y + 40, { duration: 400, zoom: 1 });
            } catch { /* ignore — canvas not ready */ }
          });
        });
      };
      // Heals are auto-coercions (bezier edge type, LTR position, etc.) —
      // the graph mutation still lands, just with the corrected values.
      // Skipped from toasts for now; visible in devtools if needed.
      if (!next.changed) {
        // Pure focus turn (no graph change). Fire the focus behaviour
        // against the CURRENT nodes and exit — no relayout, no dirty.
        if (focusCall) {
          try {
            const args = JSON.parse(focusCall.args) as { nodeId?: string };
            if (args.nodeId) zoomToNode(args.nodeId, nodes);
          } catch { /* ignore */ }
        }
        return;
      }
      setNodes(next.nodes);
      setEdges(next.edges);
      // Focus behaviour during Pi-driven edits:
      //   - `focus_node` in the batch → select + zoom that node (wins over update_node).
      //   - Otherwise, single-update_node → select the updated node (Phase 2 config assist).
      //   - Otherwise (batch inserts / connects / mixed), clear selection.
      if (focusCall) {
        try {
          const args = JSON.parse(focusCall.args) as { nodeId?: string };
          if (args.nodeId) zoomToNode(args.nodeId, next.nodes);
        } catch { setSelected(null); }
      } else {
        const updateOnly = toolCalls.filter((t) => t.name === "update_node");
        const isSingleUpdate = updateOnly.length === 1 && toolCalls.every((t) => t.name === "update_node" || t.name === "propose_draft" || t.name === "emit_choice");
        if (isSingleUpdate) {
          try {
            const args = JSON.parse(updateOnly[0].args) as { nodeId?: string };
            const targetId = args.nodeId;
            if (targetId) zoomToNode(targetId, next.nodes);
            else setSelected(null);
          } catch { setSelected(null); }
        } else {
          setSelected(null);
        }
      }
      onDirty?.();
      // Fire ELK relayout so Pi's new nodes land cleanly aligned — same
      // path the manual Wand2 button uses. Two rAFs give ReactFlow time
      // to flush the setNodes / setEdges and remount + measure the new
      // nodes before ELK reads their sizes. Without this, Pi's insert
      // positions read as messy until the user clicks Wand2.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void autoArrangeRef.current?.();
        });
      });
    },
    [nodes, edges, setNodes, setEdges, onDirty],
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
  // Also persists the laid-out positions back to D1 (skipping skeleton
  // placeholders whose `_skel_` prefix marks them as ephemeral) so a
  // refresh reads back the clean layout, not Pi's raw insert hints.
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

    // Persist positions to D1 (real nodes only — skip _skel_ placeholders).
    // Fire-and-forget: the visual layout already updated in memory; D1
    // catches up in the background. Silent on failure.
    if (campaignId && campaignId !== "new") {
      const positions = laid.nodes
        .filter((n) => !n.id.startsWith("_skel_"))
        .map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
      if (positions.length > 0) {
        void updateNodePositionsFn({ data: { campaignId, positions } }).catch(() => {
          /* silent — refresh will reflect the miss, ELK re-lays anyway */
        });
      }
    }
  }, [setNodes, setEdges, onDirty, campaignId]);

  // Publish autoArrange into the ref so `applyPiToolCalls` (declared
  // earlier in this component) can call it without a forward reference.
  useEffect(() => { autoArrangeRef.current = autoArrange; }, [autoArrange]);

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

      {!previewOnly && (
        <AiComposer
          mode={isNew ? "wizard" : "chat"}
          nudge={{ label: "Ask Pi to design the campaign workflow", active: autoStartAskPi }}
          autoOpenWizard={askPiOpen}
          campaignId={campaignId}
          onBuildingChange={setAiBuilding}
          onApplySuggestion={applySuggestion}
          onPiToolCalls={applyPiToolCalls}
          onDraftAccepted={applyDraftSkeleton}
        />
      )}
    </div>
    </CanvasModeContext.Provider>
  );
}
