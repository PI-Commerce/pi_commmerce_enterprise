/**
 * Shared pool — asset-reads.
 *
 * Cross-surface asset introspection. Any surface that declares
 * `uses: ["asset-reads"]` gets Pi the ability to read the FULL
 * internals of a workspace asset (voice agent master prompt + tools;
 * WA / SMS / RCS template bodies; freeform workflow steps; API tool
 * spec) without leaving the current surface.
 *
 * This is the "connected surfaces" primitive from the sidebar
 * discussion — analytics Pi can now explain a chart with reference to
 * the actual voice-agent script that drove the calls; lists Pi can
 * answer "what does the Renewal template say?" without a handoff to
 * /channels. Neither has WRITE access to those assets — that stays
 * inside `agents` and `channels` surfaces (Phase 4 handoff primitive).
 *
 * Read-only. Safe to add to any surface without unlocking mutations.
 */
import { registerPool, type SurfaceTool } from "@/lib/pi/kernel";
import { readAsset, type AssetKind } from "@/lib/pi-skills";

/** Polymorphic asset read — one tool, six kinds. Cheaper on prompt
 *  budget than declaring six separate tools; Pi picks the kind at
 *  call time. Returns { error: "not_found" } on miss so Pi can
 *  narrate the gap rather than blowing up. */
const readAssetTool: SurfaceTool = {
  name: "read_asset",
  description:
    "Fetch the FULL internals of a single asset — use it to explain WHY something is happening (why did that voice agent convert well, what does that WA template say). Returns:\n" +
    "  voiceAgent       → masterPrompt + knowledgeBase + tools[] + postCall[]\n" +
    "  waTemplate       → body + buttons + variables + category\n" +
    "  smsTemplate      → body + category\n" +
    "  rcsTemplate      → cards + suggestions\n" +
    "  freeformWorkflow → steps + variables\n" +
    "  tool             → handle + description + endpoint + auth\n" +
    "Do NOT dump the returned content verbatim to the user — summarize the parts that answer their question.",
  parameters: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["voiceAgent", "waTemplate", "smsTemplate", "rcsTemplate", "freeformWorkflow", "tool"],
      },
      id: { type: "string", description: "Real asset id from the workspace catalog — never invent." },
    },
    required: ["kind", "id"],
  },
  handler: async (args) => await readAsset(args.kind as AssetKind, args.id as string),
};

export const assetReadTools: SurfaceTool[] = [readAssetTool];

registerPool("asset-reads", assetReadTools);
