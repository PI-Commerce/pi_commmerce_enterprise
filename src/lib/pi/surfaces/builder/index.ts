/**
 * Ask Pi — /campaigns/$id builder surface manifest.
 *
 * The in-canvas workflow-builder copilot. Runs Pi's three-phase flow
 * (Skeleton → Config assist → Ongoing edits) with the full skill
 * catalog and canvas-mutation tools.
 *
 * Self-registers with the kernel registry on import.
 */
import { registerSurface, type SurfaceModule } from "@/lib/pi/kernel";
import {
  emitActionLink,
  emitChoiceTool,
} from "@/lib/pi/common/tools";
import { SYSTEM_BUILDER } from "./system";
import {
  assembleBuilderSurfaceContext,
  attachBuilderDiagnostic,
} from "./context";
import { canvasTools } from "./tools/canvas";
import { skillTools } from "./tools/skills";

export const builderSurface: SurfaceModule = {
  id: "builder",
  systemPrompt: SYSTEM_BUILDER,
  tools: [
    // Canvas + campaign mutations — the DAG editing surface.
    ...canvasTools,
    // Skill tools — classify_brief, suggest_skeleton, insert_skeleton,
    // find_relevant_assets, suggest_next_step.
    // (read_asset used to live here; it moved to the asset-reads pool
    //  so analytics + lists can share it. The surface's kernel merge
    //  gives Pi the same tool via the pool below.)
    ...skillTools,
    // Chips-first + escape-hatch — shared across every surface.
    emitChoiceTool,
    emitActionLink,
  ],
  // Shared pool opt-ins:
  //   analytics-reads — "how many leads went through this WhatsApp
  //     node in the last run?"
  //   asset-reads     — read_asset for comparing template bodies /
  //     voice-agent prompts when the user asks "why pick this one?"
  uses: ["analytics-reads", "asset-reads"],
  assembleContext: assembleBuilderSurfaceContext,
  attachDiagnostic: attachBuilderDiagnostic,
  // Loop config: builder can burn more rounds than agents/analytics —
  // a "build me a full 2-branch renewal skeleton, then walk me through
  // config" flow easily hits 6-7 rounds across two user turns.
  // Kernel defaults are fine (maxRounds: 8, thinkingBudget: 5000).
  // handoffTargets: [] — set in Phase 4 when handoff primitive lands.
};

registerSurface(builderSurface);
