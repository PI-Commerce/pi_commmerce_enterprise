/**
 * Ask Pi — Channels > WhatsApp > Freeform Workflow builder surface manifest.
 *
 * The in-canvas freeform copilot. Runs Pi's three-phase flow (Skeleton ->
 * Config assist -> Ongoing edits) with a freeform-specific tool set and
 * system prompt. Sibling to `pi/surfaces/builder/` — same shape, smaller
 * domain (no audience, no big asset catalog, inline message content).
 *
 * Self-registers with the kernel registry on import.
 */
import { registerSurface, type SurfaceModule } from "@/lib/pi/kernel";
import {
  emitActionLink,
  emitChoiceTool,
} from "@/lib/pi/common/tools";
import { SYSTEM_FREEFORM } from "./system";
import {
  assembleFreeformSurfaceContext,
  attachFreeformDiagnostic,
} from "./context";
import { canvasTools } from "./tools/canvas";
import { skillTools } from "./tools/skills";

export const freeformSurface: SurfaceModule = {
  id: "freeform",
  systemPrompt: SYSTEM_FREEFORM,
  tools: [
    // Canvas + workflow mutations — the freeform graph editing surface.
    ...canvasTools,
    // Skill tools — classify_brief, suggest_skeleton, insert_skeleton,
    // find_relevant_assets, suggest_next_step. Same names + shapes as
    // the campaign builder's skill tools; enum values differ (freeform
    // intents instead of industry × usecase).
    ...skillTools,
    // Chips-first + escape-hatch — shared across every surface.
    emitChoiceTool,
    emitActionLink,
  ],
  // No shared pool opt-ins for freeform in v1: analytics reads reference
  // audience / campaign runs (not meaningful here — freeform workflows
  // run inside parent campaigns), and asset-reads references template
  // internals (also not meaningful — freeform content is inline). Add
  // opt-ins if a concrete need shows up.
  uses: [],
  assembleContext: assembleFreeformSurfaceContext,
  attachDiagnostic: attachFreeformDiagnostic,
  // Loop config: freeform flows are smaller than campaigns, but a full
  // "draft the flow + walk me through config" turn can still burn 5-6
  // rounds. Kernel defaults are fine (maxRounds: 8, thinkingBudget: 5000).
};

registerSurface(freeformSurface);
