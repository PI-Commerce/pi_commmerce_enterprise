/**
 * Shared pool — analytics-reads.
 *
 * The five D1 read primitives every non-analytics surface benefits from:
 * count_leads, status_breakdown, worst_dropoffs, latest_runs, read_campaign.
 * Read-only — safe to expose from any surface without unlocking mutations.
 *
 * Opt in from a surface manifest with:
 *
 *   export default {
 *     ...
 *     uses: ["analytics-reads"],
 *   };
 *
 * The kernel dispatch resolves `uses` at request time via the pool
 * registry (see kernel/pool-registry.ts). Surfaces can override a
 * pool tool by declaring their own with the same name — analytics-
 * dashboard does this so it can supply fixture-aware variants.
 *
 * The underlying `SurfaceTool[]` bundle is still exported from
 * `common/tools/analytics-reads.ts` for legacy inline spreads; this
 * module just wraps + registers it as a pool.
 */
import { registerPool } from "@/lib/pi/kernel";
import { analyticsReadTools } from "@/lib/pi/common/tools/analytics-reads";

registerPool("analytics-reads", analyticsReadTools);

export { analyticsReadTools };
