/**
 * Builder surface — skill tools.
 *
 * Higher-level reasoning tools Pi uses BEFORE it mutates the canvas:
 * classifying the brief, pulling a canonical skeleton, ranking existing
 * assets by relevance, reading their internals, and proposing the next
 * click. All handlers wrap pure functions in `@/lib/pi-skills` — the
 * runtime behavior is deterministic and unit-testable.
 *
 * Separate from `canvas.ts` (raw DAG mutations) so the two mental
 * models stay distinct: canvas tools change the graph, skills reason
 * about it.
 */
import { assembleBuilderContext } from "@/lib/server-fns/builder-context";
import {
  classifyBrief,
  findRelevantAssets,
  readAsset,
  suggestSkeleton,
  insertSkeleton,
  suggestNextStep,
  type AssetKind,
} from "@/lib/pi-skills";
import { BUILDER_ALLOWED_KINDS } from "@/lib/node-registry";
import { INDUSTRIES, USECASES, type Industry, type Usecase } from "@/lib/pi-skills-catalog";
import type { SurfaceTool } from "@/lib/pi/kernel";

/** Extract structured industry/usecase/missing[] from a natural brief. */
export const classifyBriefTool: SurfaceTool = {
  name: "classify_brief",
  description:
    "Extract the structured shape of a user's natural-language marketing brief: industry (bfsi/retail/travel/edtech/healthtech/utilities/other), usecase (renewal/collection/cart_abandonment/order_confirmation/onboarding/cross_sell/broadcast_offer/feedback_nps/reactivation/activation/delivery_update/other), plus a `missing` array listing what the brief didn't say (audience, tone, timing). Call this on the FIRST turn of any new campaign brief. Deterministic keyword classifier — cheap, always call before proposing anything.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "The user's natural-language brief. Usually their first message." },
    },
    required: ["text"],
  },
  handler: (args) => classifyBrief(String(args.text ?? "")),
};

/** Pull the canonical DAG shape for a given (industry, usecase) pair. */
export const suggestSkeletonTool: SurfaceTool = {
  name: "suggest_skeleton",
  description:
    "Return the canonical skeleton DAG (node kinds + wiring, NO asset ids) for a given industry+usecase. Draws from the curated catalog. Use this the moment you know the industry+usecase — don't hand-roll a shape when a canonical one exists. Returns { ok, entry: { skeleton: { nodes, edges }, followUps } } or { ok:false, alternates }.",
  parameters: {
    type: "object",
    properties: {
      industry: { type: "string", enum: INDUSTRIES as unknown as string[] },
      usecase: { type: "string", enum: USECASES as unknown as string[] },
    },
    required: ["industry", "usecase"],
  },
  handler: (args) =>
    suggestSkeleton(
      args.industry as Parameters<typeof suggestSkeleton>[0],
      args.usecase as Parameters<typeof suggestSkeleton>[1],
    ),
};

/** Install a full skeleton onto the campaign in one atomic transaction. */
export const insertSkeletonTool: SurfaceTool = {
  name: "insert_skeleton",
  description:
    "Atomically install a skeleton onto the current campaign — batches all insert_node + connect_nodes calls into one server-side transaction and returns { nodeIds, edgeIds, openConfig }. Nodes are inserted WITHOUT asset config (skeleton-first). Use this AFTER the user has accepted the skeleton (`Draft this` on the plan card). Do NOT call insert_node individually when you're installing a full skeleton — this is the one-shot version. `openConfig` tells you which nodes still need a pick, feed that into your next chip question.",
  parameters: {
    type: "object",
    properties: {
      campaignId: { type: "string" },
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
                kind: { type: "string", enum: BUILDER_ALLOWED_KINDS },
                title: { type: "string" },
                subtitle: { type: "string" },
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
    required: ["campaignId", "skeleton"],
  },
  handler: async (args) =>
    await insertSkeleton(
      args.campaignId as string,
      args.skeleton as Parameters<typeof insertSkeleton>[1],
    ),
};

/** Score existing workspace assets against a usecase — top 5 with reasons. */
export const findRelevantAssetsTool: SurfaceTool = {
  name: "find_relevant_assets",
  description:
    "Rank the workspace's existing assets (voiceAgent / waTemplate / smsTemplate / rcsTemplate / freeformWorkflow / tool) against an industry+usecase (and optional free-text query). Returns top 5 with a `reasons` array explaining why each row scored. Use this BEFORE presenting asset chips — instead of dumping the whole catalog, cite only the relevant few. Cheap, deterministic — always call it before `emit_choice` for an asset pick.",
  parameters: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["voiceAgent", "waTemplate", "smsTemplate", "rcsTemplate", "freeformWorkflow", "tool"] },
      industry: { type: "string", enum: INDUSTRIES as unknown as string[] },
      usecase: { type: "string", enum: USECASES as unknown as string[] },
      query: { type: "string", description: "Optional free-text hint from the user (e.g. 'renewal reminder for HNI segment')." },
      limit: { type: "number", description: "Default 5." },
    },
    required: ["kind"],
  },
  handler: async (args) =>
    await findRelevantAssets(
      args.kind as AssetKind,
      args.industry as Parameters<typeof findRelevantAssets>[1],
      args.usecase as Parameters<typeof findRelevantAssets>[2],
      args.query as string | undefined,
      (args.limit as number) ?? 5,
    ),
};

/** Fetch the FULL internals of one asset — voice agent prompt, template body, etc. */
export const readAssetTool: SurfaceTool = {
  name: "read_asset",
  description:
    "Fetch the FULL internals of a single asset (voiceAgent → masterPrompt + KB + tools + postCall; waTemplate → body + buttons + variables; smsTemplate → body; rcsTemplate → cards; freeformWorkflow → steps; tool → spec). Use this when you need to compare candidate templates by content, not just by name — for example to explain to the user WHY one WA template fits the brief better than another. Do NOT dump the returned content back verbatim to the user; summarize.",
  parameters: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["voiceAgent", "waTemplate", "smsTemplate", "rcsTemplate", "freeformWorkflow", "tool"] },
      id: { type: "string" },
    },
    required: ["kind", "id"],
  },
  handler: async (args) => await readAsset(args.kind as AssetKind, args.id as string),
};

/** 2-4 next-best actions given current DSL + classified brief. */
export const suggestNextStepTool: SurfaceTool = {
  name: "suggest_next_step",
  description:
    "Return 2-4 next-best actions given the current DSL + classified brief. Prioritizes invalid nodes ('pick agent for voiceCall_1'), then skeleton follow-ups, then a review-and-save chip. Use this after `insert_skeleton` and after any batch of `update_node` calls — so the user always has clickable next actions instead of an open-ended 'what next?' prompt.",
  parameters: {
    type: "object",
    properties: {
      campaignId: { type: "string", description: "Campaign whose DSL + validity should drive the suggestions." },
      classifiedIndustry: { type: "string", enum: INDUSTRIES as unknown as string[] },
      classifiedUsecase: { type: "string", enum: USECASES as unknown as string[] },
    },
    required: ["campaignId"],
  },
  handler: async (args) => {
    // Pull fresh DSL + validity for the campaign so the suggestions reflect
    // real state, not stale client context.
    const ctx = await assembleBuilderContext(args.campaignId as string | undefined);
    const classified = args.classifiedIndustry && args.classifiedUsecase
      ? { industry: args.classifiedIndustry as Industry, usecase: args.classifiedUsecase as Usecase }
      : undefined;
    return suggestNextStep(ctx.dsl, ctx.validity, classified);
  },
};

export const skillTools: SurfaceTool[] = [
  classifyBriefTool,
  suggestSkeletonTool,
  insertSkeletonTool,
  findRelevantAssetsTool,
  readAssetTool,
  suggestNextStepTool,
];
