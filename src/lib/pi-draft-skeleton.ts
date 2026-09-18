/**
 * Draft skeleton — the shape-aware pulsating placeholders the canvas
 * shows the moment the user hits "Draft this" on a `propose_draft`
 * card, before Pi's real `insert_node` calls have landed.
 *
 * The placeholders match Pi's proposed shape: one node per channel per
 * branch, laid out left-to-right, all converging into the pre-existing
 * `end` node. They render through the same `workflow` node component
 * but with `data.building: true` (see `campaign-types.ts`), which the
 * node renderer treats as a pulsating skeleton state.
 *
 * Every placeholder id is prefixed `_skel_` so we can strip them
 * cleanly the moment Pi's real insert_node calls arrive
 * (`stripDraftSkeletons` runs inside applyPiToolCallsToGraph).
 */
import type { Edge, Node } from "reactflow";
import type { WorkflowNodeData, NodeKind } from "@/lib/campaign-types";
import { NODE_LABELS } from "@/lib/campaign-types";
import type { ProposedDraft } from "@/lib/pi-propose-draft";

/** Prefix reserved for skeleton nodes / edges. Never used by real Pi
 *  inserts (Pi's ids follow the `<kind>_<n>` convention). */
const SKELETON_PREFIX = "_skel_";

/** Build the skeleton graph from a proposed draft. Positions are LTR
 *  hints (ELK re-lays anyway); the middle band aligns to the audience
 *  row Y. Also returns an updated position for the End node so it stays
 *  the rightmost node (the caller applies it before rendering the
 *  skeleton, otherwise End sits in the middle of the skeleton band and
 *  edges route through it looking chaotic). */
export function buildDraftSkeleton(
  draft: ProposedDraft,
  currentNodes: Node<WorkflowNodeData>[],
): {
  skeletonNodes: Node<WorkflowNodeData>[];
  skeletonEdges: Edge[];
  /** New position for the End node (push it right of the skeleton band). */
  endPositionUpdate?: { id: string; position: { x: number; y: number } };
} {
  const skeletonNodes: Node<WorkflowNodeData>[] = [];
  const skeletonEdges: Edge[] = [];

  // Position anchors — right of the current rightmost node, above/below
  // the audience Y. If somehow no anchors exist, fall back to (500, 0).
  const audience = currentNodes.find((n) => n.data.kind === "audience");
  const anchorX = audience ? audience.position.x + 260 : 500;
  const anchorY = audience ? audience.position.y : 0;

  const branchGap = 160; // vertical gap between parallel branches
  const stepGap = 260;   // horizontal gap between channels along a branch

  // If there are multiple branches AND no obvious splitter in the plan,
  // insert a Conditional skeleton right after Audience so the shape
  // reads correctly. Pi's real inserts will replace it either way.
  const needsSplitter = draft.branches.length > 1;
  let splitterId: string | undefined;
  if (needsSplitter) {
    splitterId = `${SKELETON_PREFIX}split_1`;
    skeletonNodes.push(makeSkeletonNode(splitterId, "conditional", anchorX, anchorY, "Route by condition"));
  }

  // Track the max X the skeleton band will reach — used to push End
  // beyond it so edges to End never route through the skeleton.
  let maxSkeletonX = anchorX;

  // For each branch, walk channels left-to-right.
  draft.branches.forEach((branch, bIdx) => {
    // Center branches vertically around the audience row.
    const branchOffset = (bIdx - (draft.branches.length - 1) / 2) * branchGap;
    const y = anchorY + branchOffset;

    let prevId = splitterId ?? "audience";
    let x = anchorX + (needsSplitter ? stepGap : 0);

    branch.channels.forEach((channel, cIdx) => {
      const id = `${SKELETON_PREFIX}b${bIdx}_c${cIdx}`;
      const kind = normalizeKind(channel.kind);
      const label = channel.assetId ? `${NODE_LABELS[kind] ?? kind}: ${channel.assetId}` : NODE_LABELS[kind] ?? kind;
      skeletonNodes.push(makeSkeletonNode(id, kind, x, y, label, branch.label));
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

  // Push End to the right of the rightmost skeleton pill so the final
  // convergence edges route cleanly left-to-right. Only fire if we know
  // where the current End sits.
  const endNode = currentNodes.find((n) => n.data.kind === "end");
  const endPositionUpdate = endNode
    ? { id: endNode.id, position: { x: maxSkeletonX + stepGap, y: anchorY } }
    : undefined;

  return { skeletonNodes, skeletonEdges, endPositionUpdate };
}

function makeSkeletonNode(
  id: string,
  kind: NodeKind,
  x: number,
  y: number,
  title: string,
  subtitle?: string,
): Node<WorkflowNodeData> {
  return {
    id,
    type: "workflow",
    position: { x, y },
    data: {
      kind,
      title,
      subtitle,
      // `building: true` is the "skeleton wireframe" flag on WorkflowNodeData.
      // The workflow node renderer treats this as a pulsating placeholder.
      building: true,
    } as unknown as WorkflowNodeData,
  };
}

/** Best-effort NodeKind coercion. If Pi emitted a synonym / typo, fall
 *  back to `apiToolCall` so the placeholder still shows as a generic
 *  action instead of throwing. */
function normalizeKind(raw: string): NodeKind {
  const k = raw as NodeKind;
  const legal: NodeKind[] = [
    "start", "end", "audience", "apiToolCall", "conditional", "abSplit",
    "delay", "voiceCall", "whatsapp", "whatsappFreeform", "sms", "rcs", "aiTransform",
  ];
  return legal.includes(k) ? k : "apiToolCall";
}

/** Remove every skeleton node + edge from the graph. Called just before
 *  applying Pi's real insert_node / connect_nodes so the real nodes
 *  replace the placeholders cleanly. */
export function stripDraftSkeletons(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[]; stripped: boolean } {
  const before = nodes.length + edges.length;
  const outNodes = nodes.filter((n) => !n.id.startsWith(SKELETON_PREFIX));
  const outEdges = edges.filter(
    (e) => !e.id.startsWith(SKELETON_PREFIX) && !e.source.startsWith(SKELETON_PREFIX) && !e.target.startsWith(SKELETON_PREFIX),
  );
  return { nodes: outNodes, edges: outEdges, stripped: outNodes.length + outEdges.length !== before };
}

/** Does the graph currently carry any draft skeletons? Used to gate
 *  the "Drafting…" pill state on the chat. */
export function hasDraftSkeletons(nodes: Node<WorkflowNodeData>[]): boolean {
  return nodes.some((n) => n.id.startsWith(SKELETON_PREFIX));
}
