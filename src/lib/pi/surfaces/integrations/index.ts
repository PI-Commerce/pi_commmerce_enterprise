/**
 * Ask Pi — /integrations surface manifest.
 *
 * Docs-RAG surface: answers "how do I connect / integrate / troubleshoot X"
 * questions for the vendors listed on /integrations by retrieving from a
 * seeded doc corpus (see ./docs.ts) via the search_docs tool. Not an agent,
 * not an analytics scope — no D1 reads, no mutations, no shared pools.
 *
 * Loop is tight: one retrieval round, one answer round, done. If the model
 * wants a second search it can, but three should already flag a docs gap.
 *
 * Self-registers with the kernel registry on import.
 */
import { registerSurface, type SurfaceModule } from "@/lib/pi/kernel";
import { SYSTEM_INTEGRATIONS } from "./system";
import { searchDocs } from "./tools/search-docs";

export const integrationsSurface: SurfaceModule = {
  id: "integrations",
  systemPrompt: SYSTEM_INTEGRATIONS,
  tools: [searchDocs],
  // No shared pools — the whole point of this surface is docs-only.
  // Deliberately keeping asset-reads / analytics-reads out so the surface
  // can't drift into "let me also look up your account state" behavior.
  loop: {
    // Retrieval + answer usually fits in 2 rounds. Cap at 3 so a rare
    // "search again narrower" pass is allowed, but the loop can't grind.
    maxRounds: 3,
    // Small budget — RAG answers should render fast.
    thinkingBudget: 1024,
  },
};

registerSurface(integrationsSurface);
