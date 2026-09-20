/**
 * Common tools that surfaces can opt into.
 *
 * These are NOT auto-attached — a surface must explicitly spread them
 * into its `tools` array. This keeps ownership visible in the surface
 * manifest and prevents accidental cross-surface capability creep.
 *
 *   import { emitActionLink, emitChoiceTool } from "@/lib/pi/common/tools";
 *   export default { id: "builder", tools: [emitActionLink, emitChoiceTool, ...] };
 */
export { emitActionLink } from "./emit-action-link";
export { emitChoiceTool } from "./emit-choice";
export { analyticsReadTools, countLeads, statusBreakdown, worstDropoffs, latestRuns, readCampaign } from "./analytics-reads";
