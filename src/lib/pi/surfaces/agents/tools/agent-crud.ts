/**
 * Agents surface — CRUD tools for voice-agent records.
 *
 * Colocated cluster (Option C from the design pass): the 4 tools that
 * read/write the agents table sit in one file because they share the
 * same D1 module. Schema + handler live together per tool.
 */
import * as agentsDb from "@/lib/db/agents";
import type { AgentRecord } from "@/lib/agent-data";
import { getEnv } from "@/lib/db/client";
import type { SurfaceTool } from "@/lib/pi/kernel";

/** Return every voice agent in the workspace (compact — no masterPrompt
 *  in a list call, that's what read_agent is for). */
export const listAgents: SurfaceTool = {
  name: "list_agents",
  description: "Return every voice agent in the workspace with id, name, status, tools[].",
  parameters: { type: "object", properties: {} },
  handler: async () => {
    const map = await agentsDb.listAgents();
    return Object.values(map).map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      tools: a.tools,
    }));
  },
};

/** Full record for one agent — including masterPrompt, KB, post-call vars, eval. */
export const readAgent: SurfaceTool = {
  name: "read_agent",
  description: "Fetch the full record for one agent by id — including masterPrompt, knowledgeBase, tools, postCall vars, evalPrompt.",
  parameters: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  handler: async (args) => {
    return (await agentsDb.readAgent(args.id as string)) ?? { error: "agent_not_found" };
  },
};

/** Upsert an agent. Pi is expected to read → merge → save the full
 *  record so partial fields never wipe out authored content. */
export const saveAgent: SurfaceTool = {
  name: "save_agent",
  description:
    "Upsert an agent. Pass a full AgentRecord: { id, name, type: 'voice', status: 'live' | 'draft' | 'paused', tools: string[], masterPrompt: string, knowledgeBase: string, postCall: { id, name, prompt }[], evalPrompt?: string }. Merge on top of the existing record if you're editing — always call read_agent first, then send the merged object back.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      type: { type: "string", enum: ["voice"] },
      status: { type: "string", enum: ["live", "draft", "paused"] },
      tools: { type: "array", items: { type: "string" } },
      masterPrompt: { type: "string" },
      knowledgeBase: { type: "string" },
      postCall: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            prompt: { type: "string" },
          },
          required: ["id", "name", "prompt"],
        },
      },
      evalPrompt: { type: "string" },
    },
    required: ["id", "name", "type", "status", "tools", "masterPrompt", "knowledgeBase", "postCall"],
  },
  handler: async (args) => {
    const rec = args as unknown as AgentRecord;
    if (!rec?.id || !rec?.name) return { error: "save_agent: id and name are required" };
    // Backfill safe defaults so a partial patch from the LLM never wipes
    // fields the model chose to omit.
    const full: AgentRecord = {
      id: rec.id,
      name: rec.name,
      type: rec.type ?? "voice",
      status: rec.status ?? "draft",
      tools: rec.tools ?? [],
      masterPrompt: rec.masterPrompt ?? "",
      knowledgeBase: rec.knowledgeBase ?? "",
      postCall: rec.postCall ?? [],
      ...(rec.evalPrompt ? { evalPrompt: rec.evalPrompt } : {}),
    };
    await agentsDb.upsertAgent(full);
    return { ok: true, id: full.id };
  },
};

/** Read the tools registry so Pi never invents a handle. */
export const listTools: SurfaceTool = {
  name: "list_tools",
  description: "Return every tool handle the agents can use (policy_lookup, order_lookup, crm_query, place_call, …) with a one-line description. Use this before you propose a `tools` array on save_agent so you never invent a handle.",
  parameters: { type: "object", properties: {} },
  handler: async () => {
    const rows = await getEnv().DB
      .prepare("SELECT handle, description FROM tools ORDER BY handle")
      .all<{ handle: string; description: string }>();
    return rows.results ?? [];
  },
};

/**
 * Screen-only tool. Signals the client to navigate to the builder page for
 * the given agent id. Server-side handler is a no-op that returns { ok }; the
 * real work happens in the AskPiDock dispatcher, which routes the tool call
 * to the handler registered by the /agents layout via `usePublishSurface`.
 *
 * Pi calls this immediately after `save_agent` on a fresh DRAFT so the user
 * lands inside the builder without a click. Do NOT call on edits (see the
 * system prompt's edit-flow rule).
 */
export const openAgent: SurfaceTool = {
  name: "open_agent",
  description:
    "Navigate the user to the builder page for the agent with the given id. Call this once, immediately after save_agent when drafting a NEW agent, so the user lands inside the builder. Do not call on edits unless the user asks.",
  parameters: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  // No-op on the server. The dock dispatches to the page-registered handler
  // that actually navigates. Return ok so the model doesn't retry.
  handler: async (args) => ({ ok: true, id: args.id as string }),
};

export const agentCrudTools: SurfaceTool[] = [listAgents, readAgent, saveAgent, listTools, openAgent];
