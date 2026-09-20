/**
 * Freeform surface — canvas + workflow tools.
 *
 * The tools that mutate the on-screen freeform graph or read workflow
 * metadata. Analogue of the campaign builder's `tools/canvas.ts` but
 * adapted to freeform's storage (single row + JSON blob for nodes/edges)
 * and node kinds (text/image/video/document/list + shared apiToolCall/
 * conditional).
 *
 * Storage note: freeform workflows persist as one D1 row per workflow
 * with `nodes_json` + `edges_json`. Every mutation is a read-modify-write
 * of the whole row. That's fine — the surface is single-user single-tab
 * in v1 and the row is tiny (dozens of nodes at most).
 */
import * as freeformDb from "@/lib/db/freeform-workflows";
import type {
  FreeformEdgeRecord,
  FreeformNodeConfig,
  FreeformNodeKind,
  FreeformNodeRecord,
} from "@/lib/freeform-types";
import { FREEFORM_SERIAL_PREFIX, validateFreeformNode } from "@/lib/freeform-types";
import type { SurfaceTool } from "@/lib/pi/kernel";

/** All node kinds Pi is allowed to insert on the freeform canvas. Matches
 *  the palette FreeformNodePalette exposes to the user, plus the two
 *  shared kinds (apiToolCall, conditional) rendered by the campaign
 *  WorkflowNode. Structural anchors (start, end) are always present and
 *  never inserted by Pi. */
export const FREEFORM_ALLOWED_KINDS = [
  "text",
  "image",
  "video",
  "document",
  "list",
  "apiToolCall",
  "conditional",
] as const;

type FreeformAllowedKind = (typeof FREEFORM_ALLOWED_KINDS)[number];

/** Return every freeform workflow in the workspace. */
export const listFreeformWorkflows: SurfaceTool = {
  name: "list_freeform_workflows",
  description:
    "Return every WhatsApp Freeform workflow in the workspace with id, name, status, and locked state.",
  parameters: { type: "object", properties: {} },
  handler: async () => {
    const list = await freeformDb.listFreeformWorkflows();
    return list.map((w) => ({
      id: w.id,
      name: w.name,
      status: w.status,
      locked: !!w.locked,
      usedInCampaigns: w.usedInCampaigns,
    }));
  },
};

/** Announce the plan to the user for confirmation. Client-only tool:
 *  server always returns `{ ok, awaiting_user: true }` and the client
 *  reads the args to render the Confirm-Draft card.
 *
 *  The plan is a REAL GRAPH (nodes + edges) — same shape as
 *  insert_skeleton's payload. This is deliberate: propose_draft's plan
 *  and insert_skeleton's install target are literally the same object.
 *  On "Draft this", Pi calls insert_skeleton and passes THIS exact
 *  skeleton. No branch abstraction, no repeated shared nodes, no
 *  translation. Shared prefixes and convergence nodes appear ONCE in
 *  nodes[] and are referenced by many edges. */
export const proposeDraft: SurfaceTool = {
  name: "propose_draft",
  description:
    "Propose the freeform workflow plan to the user for confirmation BEFORE any insert_skeleton call. The plan IS the graph (nodes + edges) — the same skeleton that will be installed on 'Draft this'. Every node appears ONCE in nodes[], even when many edges reference it. Shared prefix nodes (e.g. an opening image that feeds two branches) are ONE node with two outgoing edges. Convergence nodes (e.g. a shared thank-you that many branches feed into) are ONE node with many incoming edges. Never duplicate a node across branches. Never call insert_skeleton or insert_node without a prior propose_draft with the same graph.",
  parameters: {
    type: "object",
    properties: {
      workflowId: { type: "string" },
      title: { type: "string", description: "Short human title for the proposed workflow." },
      summary: {
        type: "string",
        description:
          "One-line human summary of the flow (e.g. 'Image with 2 buttons → callback API OR issue list → shared thank-you → End').",
      },
      skeleton: {
        type: "object",
        description:
          "The plan as a real graph. nodes[] lists every node ONCE (unique ids). edges[] wires them. Shared prefix nodes appear once with multiple outgoing edges. Shared convergence nodes appear once with multiple incoming edges. This IS the payload passed to insert_skeleton on 'Draft this'.",
        properties: {
          nodes: {
            type: "array",
            description:
              "Every node in the workflow, appearing ONCE. Do NOT list a shared node in multiple 'branches' — list it once with a stable id. Use ids like text_1, text_2, list_1, image_1, apiToolCall_1, text_thanks.",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Stable unique id, e.g. text_1 / list_1 / image_1 / apiToolCall_1 / text_thanks.",
                },
                kind: {
                  type: "string",
                  enum: FREEFORM_ALLOWED_KINDS,
                  description: "Node kind — must be one of the allowed freeform kinds.",
                },
                title: {
                  type: "string",
                  description: "Short human title shown on the node card, e.g. 'Callback confirm' or 'Thank you'.",
                },
                description: {
                  type: "string",
                  description: "Optional short subtitle, e.g. 'converges from api + all 5 issue replies'.",
                },
                needs: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Config keys still needed after the skeleton lands (e.g. ['text'] for a text node, ['body', 'buttonLabel', 'rows'] for a list, ['text', 'buttonsBlock'] for a text with buttons). Feeds the 'open config' summary.",
                },
              },
              required: ["id", "kind", "title"],
            },
          },
          edges: {
            type: "array",
            description:
              "Every edge in the workflow. `source` and `target` reference node ids from nodes[]. `sourceHandle` names the source node's output port: `btn_<id>` for a quick-reply button (e.g. btn_b1), `row_<id>` for a list row (e.g. row_r1). Omit for the default output.",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Stable unique edge id, e.g. e_start_image_1 or e_image_1_apiToolCall_1.",
                },
                source: { type: "string" },
                target: { type: "string" },
                sourceHandle: {
                  type: "string",
                  description: "For branching from a message with buttons or list: btn_b1/btn_b2/btn_b3 or row_r1/row_r2/... Omit for a node's default output.",
                },
              },
              required: ["id", "source", "target"],
            },
          },
        },
        required: ["nodes", "edges"],
      },
      openQuestions: {
        type: "array",
        description:
          "Things Pi still isn't sure about. Empty means Pi is ready to build. Non-empty means Pi is asking the user to resolve these before Draft.",
        items: { type: "string" },
      },
    },
    required: ["workflowId", "title", "summary", "skeleton"],
  },
  handler: () => ({ ok: true, awaiting_user: true }),
};

/** Insert a new node into the freeform workflow. AFTER propose_draft is accepted. */
export const insertNode: SurfaceTool = {
  name: "insert_node",
  description:
    "Insert a new node into a freeform workflow's graph. Only callable AFTER the user has accepted a propose_draft. Must use an allowed freeform kind. Config may be empty on skeleton insert — the node lands with a red 'needs config' state on the canvas and Phase 2 fills it in. Position hints should be right of the rightmost existing node.",
  parameters: {
    type: "object",
    properties: {
      workflowId: { type: "string" },
      node: {
        type: "object",
        properties: {
          id: { type: "string", description: "Stable per-kind id (e.g. 'text_1', 'list_2', 'apiToolCall_1')." },
          kind: {
            type: "string",
            enum: FREEFORM_ALLOWED_KINDS,
            description: "Node kind — must be one of the allowed freeform kinds.",
          },
          title: { type: "string" },
          description: { type: "string" },
          config: {
            type: "object",
            description: "Config for this kind (see system prompt 'What Pi CAN change' for the exact shape). Empty is allowed on skeleton insert.",
          },
          position: {
            type: "object",
            properties: { x: { type: "number" }, y: { type: "number" } },
          },
        },
        required: ["id", "kind", "title"],
      },
    },
    required: ["workflowId", "node"],
  },
  handler: async (args) => {
    const workflowId = args.workflowId as string;
    const nodeArg = args.node as {
      id: string;
      kind: FreeformAllowedKind;
      title: string;
      description?: string;
      config?: FreeformNodeConfig | Record<string, unknown>;
      position?: { x: number; y: number };
    };
    const rec = await freeformDb.readFreeformWorkflow(workflowId);
    if (!rec) return { error: `workflow_not_found: ${workflowId}` };
    if (rec.locked) return { error: "workflow_locked: cannot insert into a locked workflow" };

    if (rec.nodes.some((n) => n.id === nodeArg.id)) {
      // Idempotent — Pi occasionally re-emits the same insert. Skip cleanly.
      return { ok: true, skipped: "duplicate_id" };
    }

    // Position hint: right of the rightmost node so LTR reads correctly
    // pre-ELK relayout. `end` may currently be the rightmost — that's
    // fine, the client relayout moves End back to the true rightmost
    // position once the new nodes are placed.
    const maxX = rec.nodes.length ? Math.max(...rec.nodes.map((n) => n.position.x)) : 0;
    const avgY = rec.nodes.length
      ? Math.round(rec.nodes.reduce((s, n) => s + n.position.y, 0) / rec.nodes.length)
      : 0;
    const position = nodeArg.position ?? { x: maxX + 260, y: avgY };

    // Freeform nodes render through the "freeform" ReactFlow node type
    // (FreeformNode), except the two shared logic kinds which reuse the
    // campaign WorkflowNode. Match the split so the canvas picks the
    // right renderer without special-casing on kind at render time.
    const nodeType: FreeformNodeRecord["type"] =
      nodeArg.kind === "apiToolCall" || nodeArg.kind === "conditional"
        ? "workflow"
        : "freeform";

    // Derive a serial (used by ConfigPanel to show "text_1" in the
    // outputs picker). SERIAL_PREFIX is the same convention the palette
    // uses when the user drags a node from the sidebar.
    const serial = deriveSerial(nodeArg.id, nodeArg.kind, rec.nodes);

    // Skeleton inserts arrive with empty config — validity computes
    // false with the concrete "Add X" error string, which is exactly
    // what we want the canvas to show.
    const validity = validateFreeformNode(
      nodeArg.kind as FreeformNodeKind,
      nodeArg.config as FreeformNodeConfig | undefined,
    );

    const inserted: FreeformNodeRecord = {
      id: nodeArg.id,
      type: nodeType,
      position,
      data: {
        kind: nodeArg.kind,
        title: nodeArg.title,
        ...(nodeArg.description ? { description: nodeArg.description } : {}),
        ...(serial ? { serial } : {}),
        ...(nodeArg.config !== undefined ? { config: nodeArg.config as FreeformNodeConfig } : {}),
        valid: validity.valid,
        ...(validity.error ? { error: validity.error } : {}),
      },
    };

    await freeformDb.upsertFreeformWorkflow({
      ...rec,
      nodes: [...rec.nodes, inserted],
      lastModified: new Date().toISOString(),
    });
    return { ok: true };
  },
};

/** Wire two nodes together. Every terminal branch must reach `end`. */
export const connectNodes: SurfaceTool = {
  name: "connect_nodes",
  description:
    "Wire two nodes together in the freeform workflow. Every terminal branch of the flow must eventually connect into the single `end` node. `sourceHandle` names the source node's output port: `btn_<id>` for a quick-reply button, `row_<id>` for a list row. Omit `sourceHandle` for a node's default output.",
  parameters: {
    type: "object",
    properties: {
      workflowId: { type: "string" },
      edge: {
        type: "object",
        properties: {
          id: { type: "string" },
          source: { type: "string" },
          target: { type: "string" },
          sourceHandle: { type: "string" },
        },
        required: ["id", "source", "target"],
      },
    },
    required: ["workflowId", "edge"],
  },
  handler: async (args) => {
    const workflowId = args.workflowId as string;
    const edgeArg = args.edge as {
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
    };
    const rec = await freeformDb.readFreeformWorkflow(workflowId);
    if (!rec) return { error: `workflow_not_found: ${workflowId}` };
    if (rec.locked) return { error: "workflow_locked: cannot wire a locked workflow" };
    if (rec.edges.some((e) => e.id === edgeArg.id)) {
      return { ok: true, skipped: "duplicate_id" };
    }
    const nextEdge: FreeformEdgeRecord = {
      id: edgeArg.id,
      source: edgeArg.source,
      target: edgeArg.target,
      ...(edgeArg.sourceHandle ? { sourceHandle: edgeArg.sourceHandle } : {}),
    };
    await freeformDb.upsertFreeformWorkflow({
      ...rec,
      edges: [...rec.edges, nextEdge],
      lastModified: new Date().toISOString(),
    });
    return { ok: true };
  },
};

/** Patch one existing node's title / description / config. Shallow-merges config. */
export const updateNode: SurfaceTool = {
  name: "update_node",
  description:
    "Patch one existing node's title / description / config in the freeform workflow. Works on every node except the structural `start` / `end` anchors. Never use it to change a node's `kind` — insert a new node of the correct kind and reconnect edges. `patch.config` is shallow-merged onto the existing config, so pass only the keys that change.",
  parameters: {
    type: "object",
    properties: {
      workflowId: { type: "string" },
      nodeId: { type: "string" },
      patch: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          config: {
            type: "object",
            description: "Partial config object. Merged into the node's existing config. Follow the kind's shape (see system prompt 'What Pi CAN change').",
          },
        },
      },
    },
    required: ["workflowId", "nodeId", "patch"],
  },
  handler: async (args) => {
    const workflowId = args.workflowId as string;
    const nodeId = args.nodeId as string;
    const patch = args.patch as {
      title?: string;
      description?: string;
      config?: Record<string, unknown>;
    };
    const rec = await freeformDb.readFreeformWorkflow(workflowId);
    if (!rec) return { error: `workflow_not_found: ${workflowId}` };
    if (rec.locked) return { error: "workflow_locked: cannot patch a locked workflow" };
    const idx = rec.nodes.findIndex((n) => n.id === nodeId);
    if (idx < 0) return { error: `node_not_found: ${nodeId}` };
    if (nodeId === "start" || nodeId === "end") {
      return { error: `node_locked: ${nodeId} is a structural anchor` };
    }
    const existing = rec.nodes[idx];
    const nextConfig = patch.config !== undefined
      ? { ...(existing.data.config ?? {}), ...(patch.config as Record<string, unknown>) }
      : existing.data.config;
    const kind = existing.data.kind as string;
    const validity =
      kind === "text" || kind === "image" || kind === "video" ||
      kind === "document" || kind === "list"
        ? validateFreeformNode(kind as FreeformNodeKind, nextConfig as FreeformNodeConfig | undefined)
        : { valid: true as const };
    const nextNode: FreeformNodeRecord = {
      ...existing,
      data: {
        ...existing.data,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.config !== undefined ? { config: nextConfig as FreeformNodeConfig } : {}),
        valid: validity.valid,
        ...("error" in validity && validity.error
          ? { error: validity.error }
          : { error: undefined }),
      },
    };
    const nextNodes = [...rec.nodes.slice(0, idx), nextNode, ...rec.nodes.slice(idx + 1)];
    await freeformDb.upsertFreeformWorkflow({
      ...rec,
      nodes: nextNodes,
      lastModified: new Date().toISOString(),
    });
    return { ok: true };
  },
};

/** Pure UI intent — client selects the node + centers viewport + opens
 *  the config panel. Server never mutates. */
export const focusNode: SurfaceTool = {
  name: "focus_node",
  description:
    "Spotlight a node on the freeform canvas without mutating it. Use whenever you say 'now on node X' / 'let's fix X next' so the user's canvas selects that node and opens its config panel. Fire this BEFORE talking about a node so the user sees what you're referring to. Pure UI intent — no state change.",
  parameters: {
    type: "object",
    properties: {
      nodeId: { type: "string", description: "The node id from the current graph (e.g. `text_1`)." },
    },
    required: ["nodeId"],
  },
  handler: (args) => ({ ok: true, ui: true, focused: args.nodeId as string }),
};

/**
 * Compute a stable serial for a freshly-inserted node, mirroring the
 * SERIAL_PREFIX convention the palette uses ("text_1", "text_2", ...).
 * If Pi's id already carries the serial ("text_2"), reuse it directly;
 * otherwise derive the next available number for this kind.
 */
function deriveSerial(
  id: string,
  kind: FreeformAllowedKind,
  existingNodes: FreeformNodeRecord[],
): string | undefined {
  // Only freeform-owned kinds get a serial (matches FREEFORM_SERIAL_PREFIX).
  if (kind === "apiToolCall" || kind === "conditional") return undefined;
  const prefix = FREEFORM_SERIAL_PREFIX[kind];
  if (!prefix) return undefined;
  // If the id already looks like `<prefix>_<n>`, reuse the n.
  const match = new RegExp(`^${prefix}_(\\d+)$`).exec(id);
  if (match) return `${prefix}_${match[1]}`;
  // Otherwise pick the next free number in this workflow.
  const used = new Set<number>();
  for (const n of existingNodes) {
    const m = new RegExp(`^${prefix}_(\\d+)$`).exec(n.data.serial ?? "");
    if (m) used.add(Number(m[1]));
  }
  let next = 1;
  while (used.has(next)) next++;
  return `${prefix}_${next}`;
}

export const canvasTools: SurfaceTool[] = [
  listFreeformWorkflows,
  proposeDraft,
  insertNode,
  connectNodes,
  updateNode,
  focusNode,
];
