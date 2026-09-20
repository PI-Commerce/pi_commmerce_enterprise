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
import { agentEditTools } from "./tools/agent-edit";

export const agentsSurface: SurfaceModule = {
  id: "agents",
  systemPrompt: SYSTEM_AGENTS,
  tools: [
    // Agent CRUD — list/read/save + the draft fast-path (save_agent_from_topic).
    ...agentCrudTools,
    // Section-scoped edit tools (Phase 2) — atomic diffs on masterPrompt
    // sections, KB sections, tools[], postCall[], name.
    ...agentEditTools,
    // Escape hatch to `/agents/tools/new` when the user needs a tool
    // handle that doesn't exist yet.
    emitActionLink,
  ],
  // Shared pool opt-ins:
  //   analytics-reads — answer "how many leads did the Meera agent
  //     handle last week?" without a handoff.
  uses: ["analytics-reads"],
  // Draft flow: save_agent_from_topic + confirm = 2 rounds. Edit flow
  // that reads first: read_agent + rewrite_master_prompt_section +
  // confirm = 3 rounds. Some edits need to touch 2 sections (e.g.
  // updating persona + call-flow greeting): still 4 rounds max. Cap at
  // 4 so Pi can't loop into re-drafting or authoring supplemental
  // content that would blow the <10s budget. Extended thinking at the
  // Anthropic minimum keeps latency down.
  loop: {
    maxRounds: 4,
    thinkingBudget: 1024,
  },
  // No context assembler — agents Pi reads workspace state via
  // list_agents / read_agent as needed. Adding a `currentlyOpenAgent`
  // context is a natural Phase 2b+ enhancement.
};

registerSurface(agentsSurface);
