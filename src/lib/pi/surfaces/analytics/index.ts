/**
 * Ask Pi — /analytics dashboard surface manifest.
 *
 * Structured-response surface. The kernel's `terminateOnToolCall`
 * catches `emit_answer` and returns its args as the typed
 * `AnalyticsAnswer` payload — no free-text path.
 *
 * Runs a slightly tighter loop than builder (analytics questions
 * usually resolve in 2-4 rounds; capping at 8 leaves plenty of room
 * for compare_runs / compare_channels chains).
 *
 * Self-registers with the kernel registry on import.
 */
import { registerSurface, type SurfaceModule } from "@/lib/pi/kernel";
import { SYSTEM_ANALYTICS_DASHBOARD } from "./system";
import { analyticsTools } from "./tools";

export const analyticsDashboardSurface: SurfaceModule = {
  id: "analytics",
  systemPrompt: SYSTEM_ANALYTICS_DASHBOARD,
  tools: analyticsTools,
  // Shared pool opt-ins:
  //   asset-reads — NEW cross-surface capability. Pi can now
  //     read_asset("voiceAgent", "obd_meera") to explain WHY a voice
  //     campaign converted the way it did, without a handoff to
  //     /agents. This is exactly the "connected surface" pattern.
  //
  // NOT opting into analytics-reads — the dashboard ships its own
  // fixture-aware variants of count_leads / status_breakdown / ...
  // that stay live even when D1 is unbound (local dev, no persistence).
  uses: ["asset-reads"],
  loop: {
    // Terminator: kernel returns the moment the model calls emit_answer.
    // Prevents a stray tool-call round from tacking on extra latency.
    terminateOnToolCall: "emit_answer",
  },
  // No context assembler — the /analytics page publishes screen context
  // (filter, tab, selected node, visible KPIs) via `data.context` and Pi
  // reads it verbatim from the injected `Screen context` block.
};

registerSurface(analyticsDashboardSurface);

// Re-export the public types so `AnalyticsChat.tsx` can keep importing
// them from a stable location. The old paths still work because
// pi-analytics.ts re-exports.
export type { AnalyticsScreenContext, AnalyticsAnswer, Infographic } from "./types";
export { normalizeAnswer } from "./types";
