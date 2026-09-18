/**
 * `propose_draft` — shared types + tool-call extraction.
 *
 * When Pi is ready to build, it emits a `propose_draft` tool call
 * summarizing the plan BEFORE any `insert_node` calls. The client
 * intercepts this, renders a Confirm-Draft card in the chat, and only
 * runs the real inserts after the user confirms.
 *
 * The shape mirrors the tool definition in `server-fns/pi-llm.ts` —
 * kept as a separate module so canvas + chat + skeleton generator all
 * agree on the type and the parser.
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

/** The full plan Pi proposes. Rendered as a Confirm-Draft card in chat
 *  and consumed by the canvas skeleton generator on "Draft this". */
export type ProposedDraft = {
  campaignId: string;
  title: string;
  summary: string;
  branches: ProposedBranch[];
  openQuestions?: string[];
};

/**
 * Pull the most recent `propose_draft` tool call out of a turn's
 * toolCalls log and parse its args. If Pi emitted multiple in the same
 * turn (shouldn't happen but LLMs), the last one wins. Returns null if
 * no propose_draft was in the turn.
 */
export function extractProposedDraft(toolCalls: PiToolCallLog[]): ProposedDraft | null {
  const relevant = toolCalls.filter((tc) => tc.name === "propose_draft");
  if (relevant.length === 0) return null;
  const last = relevant[relevant.length - 1];
  try {
    const args = JSON.parse(last.args) as Partial<ProposedDraft>;
    if (!args.campaignId || !args.title || !args.summary || !Array.isArray(args.branches)) {
      return null;
    }
    return {
      campaignId: args.campaignId,
      title: args.title,
      summary: args.summary,
      branches: args.branches.map((b) => ({
        label: b?.label ?? "",
        channels: Array.isArray(b?.channels)
          ? b.channels.map((c) => ({ kind: c?.kind ?? "", assetId: c?.assetId, note: c?.note }))
          : [],
      })),
      openQuestions: Array.isArray(args.openQuestions) ? args.openQuestions : undefined,
    };
  } catch {
    return null;
  }
}
