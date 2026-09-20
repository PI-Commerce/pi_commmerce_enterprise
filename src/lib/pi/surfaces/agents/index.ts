/**
 * Ask Pi — /agents surface manifest.
 *
 * First-class surface: voice-agent authoring copilot on `/agents`.
 * Reads workspace agents, drafts / edits / tunes voice-agent records,
 * saves via `save_agent`.
 *
 * Self-registers with the kernel registry on import.
 */
import { registerSurface, type SurfaceModule } from "@/lib/pi/kernel";
import { emitActionLink } from "@/lib/pi/common/tools";
import { SYSTEM_AGENTS } from "./system";
import { agentCrudTools } from "./tools/agent-crud";

export const agentsSurface: SurfaceModule = {
  id: "agents",
  systemPrompt: SYSTEM_AGENTS,
  tools: [
    // Agent CRUD — the surface's own mutation surface.
    ...agentCrudTools,
    // Escape hatch to `/agents/tools/new` when the user needs a tool
    // handle that doesn't exist yet.
    emitActionLink,
  ],
  // Shared pool opt-ins:
  //   analytics-reads — answer "how many leads did the Meera agent
  //     handle last week?" without a handoff.
  uses: ["analytics-reads"],
  // Draft flow is deterministic: plan (list_agents + list_tools), then
  // author (save_agent + open_agent), then confirm. 6 rounds gives
  // headroom for a retry or clarifier without letting Pi over-think.
  // Extended thinking at the Anthropic minimum keeps latency down.
  loop: {
    maxRounds: 6,
    thinkingBudget: 1024,
  },
  // No context assembler — agents Pi reads workspace state via
  // list_agents / read_agent as needed. Adding a `currentlyOpenAgent`
  // context is a natural Phase 2b+ enhancement.
};

registerSurface(agentsSurface);
