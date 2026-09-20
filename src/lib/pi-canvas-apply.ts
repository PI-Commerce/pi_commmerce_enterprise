/**
 * Ask Pi builder-scope → canvas mutation bridge.
 *
 * The `askPi` server function returns a `toolCalls` log alongside the LLM's
 * textual answer. When the LLM is in `builder` scope, those tool calls are
 * the concrete edits the user asked for (insert this node, connect these
 * two, patch that config). This module converts each tool call into a
 * ReactFlow node/edge mutation the WorkflowCanvas can apply on the live
 * graph, without re-fetching from D1.
 *
 * The tool calls have already been executed server-side against D1 by the
 * time they arrive here (so refresh reflects the change). Applying them
 * here on the client is what makes the canvas VISIBLY update the moment
 * Pi answers — no round-trip, no rebuild.
 */
import type { Edge, Node } from "reactflow";
import type { WorkflowNodeData, NodeKind, PresetConfig } from "@/lib/campaign-types";
import { validateAndHealPiToolCalls, type ValidatorHeal, type ValidatorError } from "@/lib/pi-construct-validator";
import { stripDraftSkeletons, hasDraftSkeletons } from "@/lib/pi-draft-skeleton";
import { computeNodeValidity } from "@/lib/node-validity";
import { actionNodeOutputs } from "@/lib/wa-outputs";

/** One entry in the server fn's `toolCalls` array. */
export type PiToolCallLog = {
  name: string;
  /** JSON-encoded argument object as the LLM emitted it. */
  args: string;
  /** JSON-encoded return value from the server-side tool implementation. */
  result: string;
};

/** What `applyPiToolCallsToGraph` returns. */
export type ApplyResult = {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  changed: boolean;
  /** Heals + errors from the validator, so the chat can surface them. */
  heals: ValidatorHeal[];
  errors: ValidatorError[];
};

/**
 * Fold Pi's tool calls into ReactFlow nodes/edges. Order matters: an
 * insert_node followed by a connect_nodes referring to that new id
 * must see the inserted node in the same pass. Every mutation returns
 * fresh arrays (never in-place) so ReactFlow re-renders cleanly.
 */
export function applyPiToolCallsToGraph(
  toolCalls: PiToolCallLog[],
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): ApplyResult {
  // If Pi is about to insert real nodes, strip any draft skeletons first
  // so the real nodes replace the placeholders cleanly. Detected by any
  // `_skel_*` id in the graph AND the presence of an insert_node in the
  // batch — the check on both sides means the strip only fires when
  // it's actually appropriate.
  let ns = nodes;
  let es = edges;
  let changed = false;
  const hasInsert = toolCalls.some((t) => t.name === "insert_node");
  if (hasInsert && hasDraftSkeletons(ns)) {
    const stripped = stripDraftSkeletons(ns, es);
    ns = stripped.nodes;
    es = stripped.edges;
    if (stripped.stripped) changed = true;
  }

  // Every batch of tool calls gets validated + healed against the canonical
  // construct BEFORE any mutation touches ReactFlow state. Rejected calls
  // are dropped (their reasons go back via `errors`); coerced calls (wrong
  // position direction, etc.) show up in `heals`. Pure — the returned
  // toolCalls array is what we apply below.
  const { toolCalls: validated, heals, errors } = validateAndHealPiToolCalls(toolCalls, ns, es);

  for (const tc of validated) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.args) as Record<string, unknown>;
    } catch {
      continue;
    }
    switch (tc.name) {
      case "insert_node": {
        const node = args.node as
          | {
              id?: string;
              kind?: string;
              title?: string;
              subtitle?: string;
              config?: Record<string, unknown>;
              position?: { x: number; y: number };
            }
          | undefined;
        if (!node?.id || !node?.kind || !node?.title) break;
        if (ns.some((n) => n.id === node.id)) break;
        // Canonical layout direction is LEFT-to-RIGHT (ELK is configured with
        // `elk.direction: RIGHT` in flow-layout.ts). Position hints go RIGHT
        // of the rightmost node, not below the bottom, so the first render
        // pre-ELK doesn't visually clash with the canonical direction. ELK
        // will re-lay anyway once the graph is stable.
        const maxX = ns.length ? Math.max(...ns.map((n) => n.position.x)) : 0;
        const avgY = ns.length
          ? Math.round(ns.reduce((s, n) => s + n.position.y, 0) / ns.length)
          : 0;
        const pos = node.position ?? { x: maxX + 260, y: avgY };
        // Compute real validity for the freshly-inserted node using the
        // registry's `requires` list. Pi's insert_node calls almost never
        // arrive with a fully-populated config, so this typically lands
        // as { valid: false, error: "Missing a voice agent" } — the
        // canvas shows a red error tag, the config panel guides the fix,
        // and the next update_node from Pi (or user) flips it green.
        const validity = computeNodeValidity(
          node.kind as NodeKind,
          node.config as PresetConfig | undefined,
        );
        // Derive output handles from the picked asset (WA buttons, voice
        // success/failure, SMS DLR, etc). Without this, Pi's newly-
        // inserted node renders with just the default handle — the
        // template-specific button branches only appear after the user
        // clicks in and the config panel derives them. Same deriver as
        // the ConfigPanel's own recompute path.
        const derivedOutputs = actionNodeOutputs(
          node.kind as NodeKind,
          node.config as WorkflowNodeData["config"],
        );
        ns = [
          ...ns,
          {
            id: node.id,
            // Only the "workflow" node type is registered (see nodes.tsx).
            // Kind lives in `data.kind`, which drives the icon + config panel.
            type: "workflow",
            position: pos,
            data: {
              title: node.title,
              subtitle: node.subtitle,
              kind: node.kind,
              config: node.config,
              valid: validity.valid,
              ...(validity.error ? { error: validity.error } : {}),
              ...(derivedOutputs ? { outputs: derivedOutputs } : {}),
            } as unknown as WorkflowNodeData,
          },
        ];
        changed = true;
        break;
      }
      case "connect_nodes": {
        const edge = args.edge as
          | {
              id?: string;
              source?: string;
              target?: string;
              sourceHandle?: string;
            }
          | undefined;
        if (!edge?.id || !edge?.source || !edge?.target) break;
        if (es.some((e) => e.id === edge.id)) break;
        es = [
          ...es,
          {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            // Canonical edge type is the workspace's bezier `routed` edge
            // (see edges.tsx `RoutedEdge`). `smoothstep` produces the square
            // right-angle edges that don't match the rest of the canvas.
            type: "routed",
          },
        ];
        changed = true;
        break;
      }
      case "update_node": {
        const nodeId = args.nodeId as string | undefined;
        const patch = args.patch as
          | {
              title?: string;
              subtitle?: string;
              config?: Record<string, unknown>;
            }
          | undefined;
        if (!nodeId || !patch) break;
        const idx = ns.findIndex((n) => n.id === nodeId);
        if (idx < 0) break;
        const existing = ns[idx];
        // Merge the config first, then recompute validity + outputs from
        // the merged shape. A patch that satisfies the last missing
        // `requires` key flips valid: false → true (and clears the error
        // line); a patch that picks a WA template hydrates the button
        // branches into `data.outputs` in the same tick.
        const nextConfig = patch.config !== undefined
          ? { ...(existing.data.config ?? {}), ...patch.config }
          : existing.data.config;
        const validity = computeNodeValidity(
          existing.data.kind as NodeKind,
          nextConfig as PresetConfig | undefined,
        );
        const derivedOutputs = actionNodeOutputs(
          existing.data.kind as NodeKind,
          nextConfig as WorkflowNodeData["config"],
        );
        ns = [
          ...ns.slice(0, idx),
          {
            ...existing,
            data: {
              ...existing.data,
              ...(patch.title !== undefined ? { title: patch.title } : {}),
              ...(patch.subtitle !== undefined ? { subtitle: patch.subtitle } : {}),
              ...(patch.config !== undefined ? { config: nextConfig } : {}),
              valid: validity.valid,
              ...(validity.error ? { error: validity.error } : { error: undefined }),
              // Only overwrite outputs when the deriver has an opinion —
              // authored preset nodes carry hand-tuned outputs we don't
              // want to blow away.
              ...(derivedOutputs ? { outputs: derivedOutputs } : {}),
            } as WorkflowNodeData,
          },
          ...ns.slice(idx + 1),
        ];
        changed = true;
        break;
      }
      default:
        // Read-only tools (read_campaign, list_campaigns, count_leads, ...)
        // don't mutate the canvas. Silently ignored — their results already
        // fed the LLM's reasoning.
        break;
    }
  }

  return { nodes: ns, edges: es, changed, heals, errors };
}

/**
 * Expand `insert_skeleton` tool calls into synthetic `insert_node` +
 * `connect_nodes` entries so applyPiToolCallsToGraph can consume them
 * uniformly. Pi may batch a full skeleton install into ONE server-side
 * insert_skeleton call (see pi-skills.ts); this expansion is how the
 * client canvas learns about each individual node/edge.
 *
 * Non-insert_skeleton calls pass through untouched.
 */
export function expandSkeletonCalls(toolCalls: PiToolCallLog[]): PiToolCallLog[] {
  const out: PiToolCallLog[] = [];
  for (const tc of toolCalls) {
    if (tc.name !== "insert_skeleton") {
      out.push(tc);
      continue;
    }
    let args: { campaignId?: string; skeleton?: { nodes?: Array<Record<string, unknown>>; edges?: Array<Record<string, unknown>> } } = {};
    try {
      args = JSON.parse(tc.args);
    } catch {
      out.push(tc);
      continue;
    }
    const campaignId = args.campaignId;
    const nodes = args.skeleton?.nodes ?? [];
    const edges = args.skeleton?.edges ?? [];
    for (const n of nodes) {
      out.push({
        name: "insert_node",
        args: JSON.stringify({ campaignId, node: n }),
        result: JSON.stringify({ ok: true, fromSkeleton: true }),
      });
    }
    for (const e of edges) {
      out.push({
        name: "connect_nodes",
        args: JSON.stringify({ campaignId, edge: e }),
        result: JSON.stringify({ ok: true, fromSkeleton: true }),
      });
    }
  }
  return out;
}

/**
 * Turn a Pi `emit_choice` or `suggest_next_step` tool call into a
 * ChatChoice-shaped card the composer can render. Returns the first
 * chip-emitting tool call; undefined if none. Tool-based chips are more
 * reliable than prose fenced blocks and take precedence when both appear.
 */
export type ChipsFromTool = {
  type: "single";
  key?: string;
  question?: string;
  options: Array<{ id: string; label: string; hint?: string }>;
};

export function extractChipsFromToolCalls(toolCalls: PiToolCallLog[]): ChipsFromTool | undefined {
  for (const tc of toolCalls) {
    if (tc.name === "emit_choice") {
      let args: { key?: string; prompt?: string; options?: Array<{ id?: string; label?: string; hint?: string }> } = {};
      try {
        args = JSON.parse(tc.args);
      } catch {
        continue;
      }
      const opts = (args.options ?? []).filter((o) => typeof o?.label === "string");
      if (opts.length === 0) continue;
      return {
        type: "single",
        key: args.key,
        question: args.prompt,
        options: opts.map((o) => ({ id: o.id ?? o.label!, label: o.label!, hint: o.hint })),
      };
    }
    if (tc.name === "suggest_next_step") {
      // suggest_next_step returns the chip list in `result`, not `args`.
      let list: Array<{ id?: string; label?: string; hint?: string }> = [];
      try {
        list = JSON.parse(tc.result) as typeof list;
      } catch {
        continue;
      }
      if (!Array.isArray(list) || list.length === 0) continue;
      return {
        type: "single",
        key: "next_step",
        question: "What next?",
        options: list
          .filter((o) => typeof o?.label === "string")
          .map((o) => ({ id: o.id ?? o.label!, label: o.label!, hint: o.hint })),
      };
    }
  }
  return undefined;
}

/**
 * Compact human-readable summary of what Pi did, shown in the composer's
 * result panel above the LLM's textual answer.
 *
 * "+ Voice AI Agent (voice_recovery)\n+ wa_send_1.failed → voice_recovery"
 */
export function summarizePiEdits(toolCalls: PiToolCallLog[]): string[] {
  const lines: string[] = [];
  for (const tc of toolCalls) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.args) as Record<string, unknown>;
    } catch {
      continue;
    }
    switch (tc.name) {
      case "insert_node": {
        const node = args.node as { id?: string; title?: string; kind?: string } | undefined;
        if (node?.title && node?.id) {
          lines.push(`+ ${node.title}${node.kind ? ` (${node.kind})` : ""}`);
        }
        break;
      }
      case "connect_nodes": {
        const edge = args.edge as
          | { source?: string; target?: string; sourceHandle?: string }
          | undefined;
        if (edge?.source && edge?.target) {
          lines.push(
            `+ ${edge.source}${edge.sourceHandle ? `.${edge.sourceHandle}` : ""} → ${edge.target}`,
          );
        }
        break;
      }
      case "update_node": {
        const nodeId = args.nodeId as string | undefined;
        if (nodeId) lines.push(`~ patched ${nodeId}`);
        break;
      }
    }
  }
  return lines;
}
