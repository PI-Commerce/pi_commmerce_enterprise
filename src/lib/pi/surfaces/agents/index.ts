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
  // Draft flow: ONE tool call (save_agent_from_topic) then ONE line of
  // confirmation. That's 2 rounds. Edit flow: read_agent, save_agent,
  // confirm = 3 rounds. Cap at 3 so Pi can't loop into re-drafting or
  // authoring supplemental content that would blow the <10s budget.
  // Extended thinking at the Anthropic minimum keeps latency down; this
  // surface's job is structural, not analytical.
  loop: {
    maxRounds: 3,
    thinkingBudget: 1024,
  },
  // No context assembler — agents Pi reads workspace state via
  // list_agents / read_agent as needed. Adding a `currentlyOpenAgent`
  // context is a natural Phase 2b+ enhancement.
};

registerSurface(agentsSurface);
