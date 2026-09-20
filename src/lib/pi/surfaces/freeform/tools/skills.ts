/**
 * Freeform surface — skill tools.
 *
 * Higher-level reasoning tools Pi uses BEFORE it mutates the freeform
 * canvas: classifying the brief, pulling a canonical skeleton,
 * installing that skeleton in one atomic call, ranking API tools,
 * proposing next steps. Analogue of the campaign builder's
 * `tools/skills.ts` — same pattern, freeform-adapted.
 *
 * All handlers wrap pure functions in `@/lib/pi-freeform-skills` — the
 * runtime behavior is deterministic and unit-testable without an LLM.
 *
 * Separate from the sibling `canvas.ts` (raw graph mutations) so the
 * two mental models stay distinct: canvas tools change the graph, skills
 * reason about it.
 */
import { assembleFreeformContext } from "@/lib/server-fns/freeform-context";
import {
  classifyFreeformBrief,
  findRelevantFreeformTools,
  insertFreeformSkeleton,
  suggestFreeformNextStep,
  suggestFreeformSkeleton,
} from "@/lib/pi-freeform-skills";
import {
  FREEFORM_INTENTS,
  type FreeformIntent,
} from "@/lib/pi-freeform-skills-catalog";
import { FREEFORM_ALLOWED_KINDS } from "./canvas";
import type { SurfaceTool } from "@/lib/pi/kernel";

/** Extract structured intent + missing[] from a natural brief. */
export const classifyBriefTool: SurfaceTool = {
  name: "classify_brief",
  description:
    "Extract the structured shape of a user's natural-language freeform brief: `intent` (support_faq / appointment_booking / feedback_capture / cart_recovery / product_info / notify_confirm / quick_answer / other) plus a `missing` array listing what the brief didn't say (intent, tone, audience, branches). Call this on the FIRST turn of any new freeform brief. Deterministic keyword classifier — cheap, always call before proposing anything.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The user's natural-language brief. Usually their first message.",
      },
    },
    required: ["text"],
  },
  handler: (args) => classifyFreeformBrief(String(args.text ?? "")),
};

/** Pull the canonical skeleton for a given intent. */
export const suggestSkeletonTool: SurfaceTool = {
  name: "suggest_skeleton",
  description:
    "Return the canonical skeleton shape (node kinds + wiring, structural fields seeded, content fields BLANK) for a given freeform intent. Draws from the curated catalog. Use this the moment you know the intent — do NOT hand-roll a shape when a canonical one exists. Returns { ok, entry: { intent, label, hint, skeleton: { title, summary, nodes, edges }, followUps } } or { ok:false, alternates }.",
  parameters: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: FREEFORM_INTENTS as unknown as string[],
      },
    },
    required: ["intent"],
  },
  handler: (args) =>
    suggestFreeformSkeleton(args.intent as FreeformIntent),
};

/** Install a full skeleton onto the workflow in one atomic call. */
export const insertSkeletonTool: SurfaceTool = {
  name: "insert_skeleton",
  description:
    "Atomically install a freeform skeleton onto the current workflow — writes every skeleton node + edge to the workflow's D1 row in ONE round-trip and returns { nodeIds, edgeIds, openConfig }. Nodes are inserted WITHOUT content config (bodies / captions / list rows blank); structural fields (quick-reply button ids, list row ids) ARE seeded so branching handles are real from turn 1. Use this AFTER the user has accepted the skeleton (`Draft this` on the plan card). Do NOT call insert_node individually when installing a full skeleton — this is the one-shot version, and hammering insert_node in a loop is a bug. `openConfig` tells you which nodes still need content, feed that into your next chip question.",
  parameters: {
    type: "object",
    properties: {
      workflowId: { type: "string" },
      skeleton: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                kind: {
                  type: "string",
                  enum: FREEFORM_ALLOWED_KINDS,
                },
                title: { type: "string" },
                description: { type: "string" },
                needs: { type: "array", items: { type: "string" } },
              },
              required: ["id", "kind", "title"],
            },
          },
          edges: {
            type: "array",
            items: {
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
        },
        required: ["title", "summary", "nodes", "edges"],
      },
    },
    required: ["workflowId", "skeleton"],
  },
  handler: async (args) =>
    await insertFreeformSkeleton(
      args.workflowId as string,
      args.skeleton as Parameters<typeof insertFreeformSkeleton>[1],
    ),
};

/**
 * Rank the workspace's API tools against an intent + optional query.
 * The only pickable-asset skill on the freeform surface — message
 * content is inline, so no template / voice-agent ranking here.
 */
export const findRelevantAssetsTool: SurfaceTool = {
  name: "find_relevant_assets",
  description:
    "Rank the workspace's API tools against a freeform intent (and optional free-text query). Returns top 5 with a `reasons` array explaining why each row scored. Only meaningful when the workflow includes an apiToolCall node — freeform message content (text bodies, media, list rows) is inline, so this skill only covers the tools catalog. Use BEFORE presenting an apiToolCall pick — instead of dumping the whole catalog, cite only the relevant few.",
  parameters: {
    type: "object",
    properties: {
      // `kind` is here for shape parity with the campaign builder's
      // find_relevant_assets. Only "tool" is meaningful on freeform.
      kind: { type: "string", enum: ["tool"] },
      intent: { type: "string", enum: FREEFORM_INTENTS as unknown as string[] },
      query: {
        type: "string",
        description: "Optional free-text hint from the user.",
      },
      limit: { type: "number", description: "Default 5." },
    },
    required: ["kind"],
  },
  handler: async (args) =>
    await findRelevantFreeformTools(
      args.intent as FreeformIntent | undefined,
      args.query as string | undefined,
      (args.limit as number) ?? 5,
    ),
};

/** 2-4 next-best actions given current graph + classified intent. */
export const suggestNextStepTool: SurfaceTool = {
  name: "suggest_next_step",
  description:
    "Return 2-4 next-best actions given the current freeform graph + classified intent. Prioritizes invalid nodes ('fix text_1'), then skeleton follow-ups, then a save-workflow chip. Use this after `insert_skeleton` and after any batch of `update_node` calls — so the user always has clickable next actions instead of an open-ended 'what next?' prompt.",
  parameters: {
    type: "object",
    properties: {
      workflowId: {
        type: "string",
        description: "Workflow whose graph + validity should drive the suggestions.",
      },
      classifiedIntent: {
        type: "string",
        enum: FREEFORM_INTENTS as unknown as string[],
      },
    },
    required: ["workflowId"],
  },
  handler: async (args) => {
    // Pull fresh graph + validity for the workflow so suggestions reflect
    // real state, not stale client context.
    const ctx = await assembleFreeformContext(args.workflowId as string | undefined);
    const classified = args.classifiedIntent
      ? { intent: args.classifiedIntent as FreeformIntent }
      : undefined;
    return suggestFreeformNextStep(ctx.dsl, ctx.validity, classified);
  },
};

export const skillTools: SurfaceTool[] = [
  classifyBriefTool,
  suggestSkeletonTool,
  insertSkeletonTool,
  findRelevantAssetsTool,
  suggestNextStepTool,
];
