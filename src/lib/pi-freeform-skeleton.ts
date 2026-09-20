/**
 * Freeform draft skeleton — the shape-aware pulsating placeholders the
 * canvas shows the moment the user hits "Draft this" on a `propose_draft`
 * card, BEFORE Pi's real `insert_node` calls have landed.
 *
 * Analogue of {@link ./pi-draft-skeleton.ts} for the freeform builder.
 * The placeholders match Pi's proposed shape: one node per step per
 * branch, laid out left-to-right, all converging into the pre-existing
 * `end` node.
 *
 * The freeform canvas renders every skeleton through the same "freeform"
 * ReactFlow node type as real freeform nodes but with `data.building:
 * true`, which the FreeformNode renderer treats as a pulsating wireframe.
 * Shared kinds (apiToolCall / conditional) render through the campaign's
 * "workflow" node type, matching the split real freeform inserts use.
 *
 * Every placeholder id is prefixed `_skel_` so we can strip them cleanly
 * the moment Pi's real insert_node calls arrive
 * (`stripFreeformDraftSkeletons` runs inside applyFreeformPiToolCalls).
 */
import type { Edge, Node } from "reactflow";
import type {
  FreeformNodeKind,
  FreeformNodeRecord,
} from "@/lib/freeform-types";
import { FREEFORM_NODE_LABELS } from "@/lib/freeform-types";
import type { ProposedDraft } from "@/lib/pi-propose-draft";

/** Node kinds the freeform canvas knows about — plus the two shared
 *  logic kinds. Matches FREEFORM_ALLOWED_KINDS on the server side. */
type FreeformSkeletonKind =
  | FreeformNodeKind
  | "apiToolCall"
  | "conditional";

/** Prefix reserved for skeleton nodes / edges. Never used by real Pi
 *  inserts (Pi's ids follow the `<kind>_<n>` convention). */
const SKELETON_PREFIX = "_skel_";

/** ReactFlow Node shape the FreeformCanvas expects. Kept loose (Node<any>)
 *  because the canvas uses two different data shapes (FreeformNodeData for
 *  freeform-owned kinds; WorkflowNodeData for shared kinds), and coercing
 *  through a union here would fight the renderers. */
type CanvasNode = Node<Record<string, unknown>>;

/** Build the freeform skeleton graph from a proposed draft. Positions are
 *  LTR hints (ELK re-lays anyway); branches stack vertically around the
 *  Start node's Y. Also returns an updated position for the End node so
 *  it stays the rightmost node. */
export function buildFreeformDraftSkeleton(
  draft: ProposedDraft,
  currentNodes: CanvasNode[],
): {
  skeletonNodes: CanvasNode[];
  skeletonEdges: Edge[];
  /** New position for the End node (push it right of the skeleton band). */
  endPositionUpdate?: { id: string; position: { x: number; y: number } };
} {
  const skeletonNodes: CanvasNode[] = [];
  const skeletonEdges: Edge[] = [];

  // Position anchors — right of the Start node (freeform's leftmost
  // structural anchor). Fall back to (240, 0) if for some reason Start
  // isn't in the graph.
  const start = currentNodes.find((n) => getKind(n) === "start");
  const anchorX = start ? start.position.x + 260 : 240;
  const anchorY = start ? start.position.y : 0;

  const branchGap = 160; // vertical gap between parallel branches
  const stepGap = 260;   // horizontal gap between steps along a branch

  // If there are multiple branches AND no obvious splitter in the plan,
  // insert a List skeleton right after Start so the shape reads
  // correctly. Freeform's "splitter" is a List message (rows -> branches)
  // or a Text with quick_reply buttons; List is the more general shape,
  // pick that as the pre-real placeholder. Pi's real inserts replace
  // whichever it actually picks.
  const needsSplitter = draft.branches.length > 1;
  let splitterId: string | undefined;
  if (needsSplitter) {
    splitterId = `${SKELETON_PREFIX}split_1`;
    skeletonNodes.push(
      makeFreeformSkeletonNode(splitterId, "list", anchorX, anchorY, "Pick an option"),
    );
  }

  // Track the max X the skeleton band will reach — used to push End
  // beyond it so edges to End never route through the skeleton.
  let maxSkeletonX = anchorX;

  // For each branch, walk steps left-to-right.
  draft.branches.forEach((branch, bIdx) => {
    // Center branches vertically around the Start row.
    const branchOffset = (bIdx - (draft.branches.length - 1) / 2) * branchGap;
    const y = anchorY + branchOffset;

    let prevId = splitterId ?? "start";
    let x = anchorX + (needsSplitter ? stepGap : 0);

    branch.channels.forEach((channel, cIdx) => {
      const id = `${SKELETON_PREFIX}b${bIdx}_c${cIdx}`;
      const kind = normalizeFreeformKind(channel.kind);
      const label = channel.assetId
        ? `${FREEFORM_NODE_LABELS[kind as FreeformNodeKind] ?? kind}: ${channel.assetId}`
        : FREEFORM_NODE_LABELS[kind as FreeformNodeKind] ?? kind;
      skeletonNodes.push(
        makeFreeformSkeletonNode(id, kind, x, y, label, branch.label),
      );
      skeletonEdges.push({
        id: `${SKELETON_PREFIX}e_${prevId}_${id}`,
        source: prevId,
        target: id,
        type: "routed",
      });
      prevId = id;
      if (x > maxSkeletonX) maxSkeletonX = x;
      x += stepGap;
    });

    // Wire the last node on this branch into `end`. Pi's real inserts
    // will overwrite this edge with the actual final connection.
    skeletonEdges.push({
      id: `${SKELETON_PREFIX}e_${prevId}_end`,
      source: prevId,
      target: "end",
      type: "routed",
    });
  });

  // Push End to the right of the rightmost skeleton pill so convergence
  // edges route cleanly LTR.
  const endNode = currentNodes.find((n) => getKind(n) === "end");
  const endPositionUpdate = endNode
    ? { id: endNode.id, position: { x: maxSkeletonX + stepGap, y: anchorY } }
    : undefined;

  return { skeletonNodes, skeletonEdges, endPositionUpdate };
}

/** Read the `kind` off a canvas node. Both freeform and shared workflow
 *  nodes carry `data.kind`, so a single accessor is safe. */
function getKind(n: CanvasNode): string {
  const data = n.data as { kind?: string } | undefined;
  return data?.kind ?? "";
}

/** Build one skeleton node. Freeform-owned kinds use the "freeform"
 *  ReactFlow node type; shared logic kinds use "workflow" (rendered by
 *  the campaign WorkflowNode). Matches the real-insert split so the
 *  canvas swaps skeleton → real without re-registering renderers. */
function makeFreeformSkeletonNode(
  id: string,
  kind: FreeformSkeletonKind,
  x: number,
  y: number,
  title: string,
  description?: string,
): CanvasNode {
  const nodeType: string =
    kind === "apiToolCall" || kind === "conditional" ? "workflow" : "freeform";
  return {
    id,
    type: nodeType,
    position: { x, y },
    data: {
      kind,
      title,
      ...(description ? { description } : {}),
      // `building: true` is the skeleton-wireframe flag. Both node
      // renderers treat this as a pulsating placeholder.
      building: true,
    },
  };
}

/** Best-effort kind coercion. If Pi emitted a synonym / typo, fall back
 *  to `text` so the placeholder still shows as a message instead of
 *  crashing. `apiToolCall` / `conditional` are legal freeform-adjacent
 *  kinds shared with the campaign builder. */
function normalizeFreeformKind(raw: string): FreeformSkeletonKind {
  const k = raw as FreeformSkeletonKind;
  const legal: FreeformSkeletonKind[] = [
    "start", "end", "text", "image", "video", "document", "list",
    "apiToolCall", "conditional",
  ];
  return legal.includes(k) ? k : "text";
}

/** Remove every freeform skeleton node + edge from the graph. Called
 *  just before applying Pi's real insert_node / connect_nodes so the
 *  real nodes replace the placeholders cleanly. */
export function stripFreeformDraftSkeletons(
  nodes: CanvasNode[],
  edges: Edge[],
): { nodes: CanvasNode[]; edges: Edge[]; stripped: boolean } {
  const before = nodes.length + edges.length;
  const outNodes = nodes.filter((n) => !n.id.startsWith(SKELETON_PREFIX));
  const outEdges = edges.filter(
    (e) =>
      !e.id.startsWith(SKELETON_PREFIX) &&
      !e.source.startsWith(SKELETON_PREFIX) &&
      !e.target.startsWith(SKELETON_PREFIX),
  );
  return {
    nodes: outNodes,
    edges: outEdges,
    stripped: outNodes.length + outEdges.length !== before,
  };
}

/**
 * Strip EVERY non-canonical node from the freeform canvas — the two
 * structural anchors (start, end) stay, everything else goes. Called
 * when the user accepts a new "Draft this" so Pi rebuilds from a clean
 * slate instead of piling nodes on top of a previous plan.
 *
 * Without this, every propose_draft cycle would accumulate nodes.
 */
const FREEFORM_CANONICAL_IDS = new Set(["start", "end"]);

export function resetFreeformCanvasForNewDraft(
  nodes: CanvasNode[],
  edges: Edge[],
): { nodes: CanvasNode[]; edges: Edge[]; strippedCount: number } {
  const outNodes = nodes.filter((n) => FREEFORM_CANONICAL_IDS.has(n.id));
  const outEdges = edges.filter(
    (e) =>
      FREEFORM_CANONICAL_IDS.has(e.source) && FREEFORM_CANONICAL_IDS.has(e.target),
  );
  const strippedCount =
    nodes.length - outNodes.length + (edges.length - outEdges.length);
  return { nodes: outNodes, edges: outEdges, strippedCount };
}

/** Does the graph currently carry any freeform draft skeletons? Used
 *  to gate the "Drafting…" pill state on the composer. */
export function hasFreeformDraftSkeletons(nodes: CanvasNode[]): boolean {
  return nodes.some((n) => n.id.startsWith(SKELETON_PREFIX));
}

// Type re-export so the canvas can import FreeformNodeRecord from here
// if convenient; primary source is still freeform-types.ts.
export type { FreeformNodeRecord };
