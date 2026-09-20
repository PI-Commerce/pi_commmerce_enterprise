/**
 * `propose_draft` — shared types + tool-call extraction.
 *
 * When Pi is ready to build, it emits a `propose_draft` tool call
 * summarizing the plan BEFORE any `insert_node` calls. The client
 * intercepts this, renders a Confirm-Draft card in the chat, and only
 * runs the real inserts after the user confirms.
 *
 * The shape mirrors the tool definition in `pi/surfaces/*` — kept as a
 * separate module so canvas + chat + skeleton generator all agree on
 * the type and the parser.
 *
 * There are TWO shapes propose_draft can carry:
 *
 *  1. `branches` — the campaign-builder shape. Each branch is a linear
 *     path from Audience to End with an ordered list of `channels`
 *     (nodes). Convergence is implicit (all branches end at the pre-
 *     existing End node). Good for standardized campaign flows.
 *
 *  2. `skeleton` — the freeform-builder shape. A real graph with
 *     `nodes[]` (unique per id) and `edges[]` (source/target/handle).
 *     Supports shared prefix nodes, shared convergence nodes, arbitrary
 *     branching. Required for creative freeform flows where the same
 *     node feeds multiple paths or many paths converge into one.
 *
 * The client's Confirm-Draft card renders whichever is present. The
 * client's canvas skeleton generator prefers `skeleton` when present
 * (renders the actual graph) and falls back to expanding `branches`
 * when only that shape is available.
 */
import type { PiToolCallLog } from "@/lib/pi-canvas-apply";

/** One asset pick along a branch — a channel node with the real asset id. */
export type ProposedChannel = {
  kind: string;
  assetId?: string;
  note?: string;
};

/** One branch from Audience to End — an ordered list of channels. */
export type ProposedBranch = {
  label: string;
  channels: ProposedChannel[];
};

/** One node in a proposed skeleton. Same shape as {@link
 *  ../lib/pi-freeform-skills-catalog.ts#FreeformSkeletonNode}. */
export type ProposedSkeletonNode = {
  id: string;
  kind: string;
  title: string;
  description?: string;
  /** Config keys still needed after the skeleton lands. Feeds the "open
   *  config" summary in the Confirm-Draft card + suggest_next_step. */
  needs?: string[];
};

/** One edge in a proposed skeleton. `sourceHandle` names the source
 *  node's output port (e.g. `btn_b1` for a quick-reply button, `row_r1`
 *  for a list row). Omit for the default output. */
export type ProposedSkeletonEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
};

/** A real-graph plan for freeform. Supersedes `branches` when Pi's
 *  brief needs shared prefixes / convergence / arbitrary shape. */
export type ProposedSkeleton = {
  nodes: ProposedSkeletonNode[];
  edges: ProposedSkeletonEdge[];
};

/** The full plan Pi proposes. Rendered as a Confirm-Draft card in chat
 *  and consumed by the canvas skeleton generator on "Draft this".
 *
 *  `campaignId` is really just an opaque target id. For the campaign
 *  builder it carries the campaign id (Pi's tool call has
 *  `args.campaignId`); for the freeform builder it carries the freeform
 *  workflow id (Pi's tool call has `args.workflowId`).
 *
 *  Either `branches` OR `skeleton` is present. `skeleton` wins if both
 *  appear (an LLM oddity we don't want to break on). See {@link
 *  ProposedSkeleton} for the freeform-preferred shape. */
export type ProposedDraft = {
  campaignId: string;
  title: string;
  summary: string;
  branches: ProposedBranch[];
  /** Freeform-only real-graph plan. When present, the client renders
   *  and applies THIS graph directly — no branch expansion. */
  skeleton?: ProposedSkeleton;
  openQuestions?: string[];
};

/**
 * Pull the most recent `propose_draft` tool call out of a turn's
 * toolCalls log and parse its args. If Pi emitted multiple in the same
 * turn (shouldn't happen but LLMs), the last one wins. Returns null if
 * no propose_draft was in the turn OR if the shape is unrecognisable
 * (no branches[] AND no skeleton).
 */
export function extractProposedDraft(toolCalls: PiToolCallLog[]): ProposedDraft | null {
  const relevant = toolCalls.filter((tc) => tc.name === "propose_draft");
  if (relevant.length === 0) return null;
  const last = relevant[relevant.length - 1];
  try {
    const args = JSON.parse(last.args) as Partial<ProposedDraft> & {
      workflowId?: string;
      skeleton?: Partial<ProposedSkeleton>;
    };
    // Campaign builder emits `campaignId`; freeform builder emits
    // `workflowId`. Accept either into the struct's `campaignId` field
    // (which is really just an opaque target-id tag downstream).
    const targetId = args.campaignId ?? args.workflowId;
    if (!targetId || !args.title || !args.summary) return null;

    // Parse skeleton (freeform-preferred). Both nodes and edges must be
    // real arrays for us to consider it valid.
    let skeleton: ProposedSkeleton | undefined;
    if (
      args.skeleton
      && Array.isArray(args.skeleton.nodes)
      && Array.isArray(args.skeleton.edges)
    ) {
      skeleton = {
        nodes: args.skeleton.nodes.map((n) => ({
          id: n?.id ?? "",
          kind: n?.kind ?? "",
          title: n?.title ?? "",
          ...(n?.description ? { description: n.description } : {}),
          ...(Array.isArray(n?.needs) ? { needs: n.needs } : {}),
        })).filter((n) => n.id && n.kind && n.title),
        edges: args.skeleton.edges.map((e) => ({
          id: e?.id ?? "",
          source: e?.source ?? "",
          target: e?.target ?? "",
          ...(e?.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
        })).filter((e) => e.id && e.source && e.target),
      };
    }

    // Parse branches (campaign-preferred, freeform fallback). Freeform
    // often omits this when skeleton is present.
    const branches: ProposedBranch[] = Array.isArray(args.branches)
      ? args.branches.map((b) => ({
          label: b?.label ?? "",
          channels: Array.isArray(b?.channels)
            ? b.channels.map((c) => ({ kind: c?.kind ?? "", assetId: c?.assetId, note: c?.note }))
            : [],
        }))
      : [];

    // Must have at least ONE of the two shapes populated.
    if (!skeleton && branches.length === 0) return null;

    return {
      campaignId: targetId,
      title: args.title,
      summary: args.summary,
      branches,
      ...(skeleton ? { skeleton } : {}),
      openQuestions: Array.isArray(args.openQuestions) ? args.openQuestions : undefined,
    };
  } catch {
    return null;
  }
}
