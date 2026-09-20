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
import { emitActionLink, analyticsReadTools } from "@/lib/pi/common/tools";
import { SYSTEM_AGENTS } from "./system";
import { agentCrudTools } from "./tools/agent-crud";

export const agentsSurface: SurfaceModule = {
  id: "agents",
  systemPrompt: SYSTEM_AGENTS,
  tools: [
    // Analytics reads — so Pi can answer "how many leads did the Meera
    // agent handle last week?" without a handoff.
    ...analyticsReadTools,
    // Agent CRUD — the surface's actual mutation surface.
    ...agentCrudTools,
    // Escape hatch to `/agents/tools/new` when the user needs a tool
    // handle that doesn't exist yet.
    emitActionLink,
  ],
  // No context assembler — agents Pi reads workspace state via
  // list_agents / read_agent as needed. Adding a `currentlyOpenAgent`
  // context is a natural Phase 2b+ enhancement.
  // Standard loop config — 8 rounds, 5000 thinking tokens. Agents work
  // rarely needs more than 3-4 rounds; cap can tighten in a future pass.
};

registerSurface(agentsSurface);
