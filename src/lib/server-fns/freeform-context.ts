/**
 * Freeform-scope context assembler.
 *
 * `askPi` calls this once per turn (freeform scope only) to produce the
 * compact JSON that gets injected into Pi's system context on the
 * WhatsApp Freeform Workflow builder. The goal mirrors the campaign
 * builder's assembler ({@link ./builder-context.ts}) but for the freeform
 * domain — a much smaller graph, no audience, no asset catalog for the
 * message content (which is inline), and a narrower node registry.
 *
 * Pi always sees:
 *   - Which workflow is being edited (id + name + status + locked).
 *   - The current graph (nodes + edges) so Pi can cite what's there.
 *   - The freeform canonical rules (single Start, single End, LTR, buttons /
 *     list rows drive branching, Meta character limits).
 *   - The allowed freeform node kinds with each kind's config shape.
 *   - The workspace's `apiTools` catalog — the only asset kind pickable
 *     on freeform (message content is inline).
 *   - Per-node validity so Pi never claims "ready" while a node still
 *     has an error line on the canvas.
 */
import { getEnv } from "@/lib/db/client";
import * as freeformDb from "@/lib/db/freeform-workflows";
import * as toolsDb from "@/lib/db/tools";
import {
  validateFreeformNode,
  META_LIMITS,
  FREEFORM_NODE_LABELS,
  type FreeformNodeConfig,
  type FreeformNodeKind,
  type FreeformNodeRecord,
  type FreeformEdgeRecord,
} from "@/lib/freeform-types";

export type FreeformContext = {
  surface: "channels.whatsapp.freeform";
  workflow:
    | {
        id: string;
        name: string;
        status: string;
        description?: string;
        locked?: boolean;
      }
    | null;
  dsl: {
    nodes: Array<{
      id: string;
      kind: string;
      title: string;
      description?: string;
      config?: unknown;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
    }>;
  } | null;
  /** Per-node validity — one entry per node in `dsl.nodes`. Pi cites this
   *  when reporting "what's left" and NEVER claims Ready while any entry
   *  has `valid: false`. */
  validity: Array<{
    nodeId: string;
    kind: string;
    valid: boolean;
    error?: string;
  }>;
  /** Freeform canonical grammar — shorter than the campaign builder's since
   *  the surface has fewer degrees of freedom. Prepended verbatim into Pi's
   *  context so the grammar is part of every turn. */
  rules: string;
  /** Node registry limited to freeform-allowed kinds + their config shape.
   *  Same purpose as `nodeKinds` in the builder context. */
  nodeKinds: ReturnType<typeof summarizeFreeformRegistry>;
  /** Meta interactive limits (character caps, max buttons, max list rows).
   *  Pi cites these when a value overflows so the user sees the concrete cap. */
  limits: typeof META_LIMITS;
  /** Only asset kind pickable on freeform: API tools (for `apiToolCall` nodes).
   *  Message content is inline — no template picks here. */
  assets: {
    tools: Array<{ handle: string; description: string }>;
  };
  /** Diagnostic — same shape as builder's diag but slimmer. */
  _diag: {
    hasDb: boolean;
    workflowErr?: string;
    toolsErr?: string;
  };
};

/**
 * The canonical construct rules for freeform. Deliberately short — the
 * surface has fewer moving parts than a campaign, so Pi doesn't need the
 * multi-page grammar the campaign builder ships.
 */
export const FREEFORM_CONSTRUCT_RULES = `Freeform workflow — construct rules.

INVARIANTS (never violate)
- Every workflow has exactly one Start and one End. Both are locked, undeletable, always present.
- Layout is LEFT-to-RIGHT. Edges are bezier ("routed"), never right-angle.
- Only the allowed kinds may be inserted: text, image, video, document, list, apiToolCall, conditional.
- Every non-End node MUST feed into at least one downstream node — a dead-end blocks the workflow from going Ready.

BRANCHING (how flows fork)
- text / image / video / document nodes may attach a Buttons block:
   quick_reply (up to 3 buttons) OR cta_url (exactly 1 URL button). Not both.
   Each quick-reply button becomes an outgoing branch on that node.
   The CTA URL button opens externally (no branch inside the flow).
- list nodes carry rows (up to 10). Each row becomes an outgoing branch.
- Every branchable outgoing port MUST have an edge. An unwired button / row leaves the node invalid.

CONTENT (Meta interactive limits)
- text.body: ${META_LIMITS.textBody} chars
- media.caption: ${META_LIMITS.captionBody} chars (required for image / video / document)
- list.header: ${META_LIMITS.listHeader} chars (optional), list.body: ${META_LIMITS.listBody} chars (required), list.footer: ${META_LIMITS.listFooter} chars (optional)
- list.buttonLabel: ${META_LIMITS.listButtonLabel} chars (required)
- list.rows: 1..${META_LIMITS.listMaxRows}. row.title: ${META_LIMITS.listRowTitle} chars, row.description: ${META_LIMITS.listRowDescription} chars (optional)
- button.label: ${META_LIMITS.buttonLabel} chars

CONFIRM BEFORE BUILD
- Before any insert_node call, emit propose_draft first. The client renders it as a Confirm-Draft card. The user clicks "Draft this" to accept.
- Skipping propose_draft is a violation.

NODE IDS + TITLES
- Node ids follow \`<kind>_<n>\`: text_1, image_1, list_1, apiToolCall_1.
- The two structural anchors are already named \`start\` and \`end\` — reference those exact ids when wiring.
- Titles are human ("Ask for slot", "Confirm booking", "Timeout branch"). Kept short.
- description is optional and short — a concrete detail ("Slot picker with 5 morning rows").`;

/** Compact per-kind registry: what each freeform kind is + its required config
 *  keys. Same purpose as the campaign builder's `summarizeRegistryForContext`,
 *  bespoke here because freeform kinds are a smaller, disjoint set. */
export function summarizeFreeformRegistry(): Array<{
  kind: FreeformNodeKind;
  label: string;
  requires: string[];
  branching?: string;
}> {
  return [
    { kind: "text", label: FREEFORM_NODE_LABELS.text, requires: ["text"], branching: "optional buttonsBlock (quick_reply up to 3 OR cta_url exactly 1)" },
    { kind: "image", label: FREEFORM_NODE_LABELS.image, requires: ["mediaSource", "mediaUrl OR mediaFileName", "caption"], branching: "optional buttonsBlock" },
    { kind: "video", label: FREEFORM_NODE_LABELS.video, requires: ["mediaSource", "mediaUrl OR mediaFileName", "caption"], branching: "optional buttonsBlock" },
    { kind: "document", label: FREEFORM_NODE_LABELS.document, requires: ["mediaSource", "mediaUrl OR mediaFileName", "caption"], branching: "optional buttonsBlock" },
    { kind: "list", label: FREEFORM_NODE_LABELS.list, requires: ["body", "buttonLabel", "rows (1..10)"], branching: "one branch per row" },
  ];
}

/**
 * Assemble the freeform context for a given workflow id. Any single lookup
 * that fails degrades to an empty / null value — we never let one broken
 * catalog dead-end the whole context.
 */
export async function assembleFreeformContext(
  workflowId: string | undefined,
): Promise<FreeformContext> {
  const hasDb = (() => {
    try { return !!getEnv().DB; } catch { return false; }
  })();

  let workflow: FreeformContext["workflow"] = null;
  let nodes: FreeformNodeRecord[] = [];
  let edges: FreeformEdgeRecord[] = [];
  const diag: FreeformContext["_diag"] = { hasDb };

  if (hasDb && workflowId) {
    try {
      const rec = await freeformDb.readFreeformWorkflow(workflowId);
      if (rec) {
        workflow = {
          id: rec.id,
          name: rec.name,
          status: rec.status,
          ...(rec.description ? { description: rec.description } : {}),
          ...(rec.locked ? { locked: true } : {}),
        };
        nodes = rec.nodes ?? [];
        edges = rec.edges ?? [];
      }
    } catch (e) {
      diag.workflowErr = (e as Error).message;
    }
  }

  let tools: FreeformContext["assets"]["tools"] = [];
  if (hasDb) {
    try {
      const list = await toolsDb.listTools();
      tools = list.map((t) => ({ handle: t.handle, description: t.description }));
    } catch (e) {
      diag.toolsErr = (e as Error).message;
    }
  }

  // Server log — visible in Cloudflare Workers logs / `wrangler tail`.
  // eslint-disable-next-line no-console
  console.log("[freeform-context]", JSON.stringify({
    workflowId: workflowId ?? null,
    hasDb,
    nodes: nodes.length,
    edges: edges.length,
    tools: tools.length,
    diag,
  }));

  // Per-node validity — mirror the canvas's `validateFreeformNode`. For
  // shared kinds (apiToolCall, conditional) the freeform validator treats
  // them as always-valid stubs; the campaign validator is what the config
  // panel actually runs when the user opens those. That's fine for now —
  // Pi's job on freeform is authoring message content, not tuning API /
  // conditional configs, and those two kinds are rare in v1 freeform flows.
  const validity = nodes.map((n) => {
    const kind = n.data.kind as string;
    const isFreeformKind =
      kind === "text" || kind === "image" || kind === "video" ||
      kind === "document" || kind === "list" || kind === "start" || kind === "end";
    if (!isFreeformKind) {
      return { nodeId: n.id, kind, valid: true };
    }
    const r = validateFreeformNode(
      kind as FreeformNodeKind,
      n.data.config as FreeformNodeConfig | undefined,
    );
    return { nodeId: n.id, kind, valid: r.valid, ...(r.error ? { error: r.error } : {}) };
  });

  return {
    surface: "channels.whatsapp.freeform",
    workflow,
    dsl: workflow
      ? {
          nodes: nodes.map((n) => ({
            id: n.id,
            kind: String(n.data.kind),
            title: n.data.title,
            ...(n.data.description ? { description: n.data.description } : {}),
            config: n.data.config,
          })),
          edges: edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
          })),
        }
      : null,
    validity,
    rules: FREEFORM_CONSTRUCT_RULES,
    nodeKinds: summarizeFreeformRegistry(),
    limits: META_LIMITS,
    assets: { tools },
    _diag: diag,
  };
}
