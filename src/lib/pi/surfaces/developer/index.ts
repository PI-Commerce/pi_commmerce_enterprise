/**
 * Ask Pi — /developer surface manifest.
 *
 * Docs-RAG surface: answers questions about the API Docs and Release Notes.
 * Three tools, each with a clear job:
 *   - search_docs      → prose retrieval (how-to, troubleshooting, "what
 *                        does X return", inline field / header / error
 *                        lookups). Keyword scoring over the corpus in
 *                        ./docs.ts.
 *   - list_releases    → structural query over Release Notes ("latest",
 *                        "what shipped in v2", "what changed since
 *                        [date]"). Sort + filter, not keyword.
 *   - list_endpoints   → structural query over API Docs endpoints ("what
 *                        endpoints exist", "list SMS APIs"). Filter, not
 *                        keyword.
 *
 * Not an agent, not an analytics scope — no D1 reads, no mutations, no
 * shared pools. Sibling of /integrations.
 *
 * The two structural tools were added after observing that search_docs
 * kept coming back empty for perfectly reasonable questions like "latest
 * features?" — the corpus doesn't literally use the words users use, so
 * keyword retrieval whiffs. Structural queries answer those directly.
 *
 * Self-registers with the kernel registry on import.
 */
import { registerSurface, type SurfaceModule } from "@/lib/pi/kernel";
import { SYSTEM_DEVELOPER } from "./system";
import { searchDocs } from "./tools/search-docs";
import { listReleases } from "./tools/list-releases";
import { listEndpoints } from "./tools/list-endpoints";

export const developerSurface: SurfaceModule = {
  id: "developer",
  systemPrompt: SYSTEM_DEVELOPER,
  tools: [searchDocs, listReleases, listEndpoints],
  // No shared pools — the whole point of this surface is docs-only.
  // Deliberately keeping asset-reads / analytics-reads out so the surface
  // can't drift into "let me also look up your account state" behavior.
  loop: {
    // Kernel counts every LLM turn as a round (tool calls AND the final
    // text answer). To honour the system prompt's "up to 3 search_docs
    // calls then answer" budget we need 4: 3 tool rounds + 1 answer
    // round. maxRounds: 3 was off-by-one — vague queries ("latest
    // features?") hit `exceeded_tool_rounds` because Pi burned all 3
    // rounds on searches and never got a chance to write text.
    maxRounds: 4,
    // Small budget — RAG answers should render fast.
    thinkingBudget: 1024,
  },
};

registerSurface(developerSurface);
