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
import {
  buildAgentSkeleton,
  type PersonaGender,
} from "../skeleton-template";

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
 * FAST-PATH draft tool. Pi calls this on ANY new-agent request instead of
 * authoring the full masterPrompt as text.
 *
 * Why: the four seeded agents each have ~8-10k characters of masterPrompt.
 * Asking the model to regenerate that shape from scratch is 3000+ output
 * tokens and 60-120s. But the STRUCTURE is invariant — only a handful of
 * decisions actually need an LLM (which persona, which tools, what topic).
 *
 * This tool takes only those decisions as args. The server-side handler
 * calls `buildAgentSkeleton` (a deterministic template renderer) to
 * assemble the full 10-section masterPrompt + 4-section KB + 3 postCall
 * vars, then upserts. Pi's tool call output is ~150 tokens instead of
 * 3000+, so first draft returns in ~5s instead of 2 minutes.
 *
 * Iteration (Phase 2) still uses `save_agent` with a full merged record —
 * that path is only slow when the whole prompt is regenerated at once,
 * which iteration never needs to do.
 */
export const saveAgentFromTopic: SurfaceTool = {
  name: "save_agent_from_topic",
  description:
    "Create a new voice agent from a topic + a few persona/tool picks. Server renders the full masterPrompt/KB/postCall skeleton from a template — you do NOT author them. Use for every fresh draft. For edits to an existing agent, use save_agent instead.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description:
          "Agent id from context.draftHint.id. Do not invent — the client already reserved this id.",
      },
      name: {
        type: "string",
        description:
          "Agent name from context.draftHint.name (snake_case, ends in _voice).",
      },
      topic: {
        type: "string",
        description:
          "Human-readable subject the agent handles, from context.draftHint.topic. Examples: 'cart abandonment', 'loan against mutual funds', 'renewal reminders'. Used verbatim in the persona objective and call-flow scripts.",
      },
      personaName: {
        type: "string",
        enum: [
          "Riya",
          "Meera",
          "Priya",
          "Neha",
          "Kavya",
          "Kabir",
          "Arjun",
          "Rohan",
          "Rahul",
          "Vikram",
        ],
        description:
          "Which persona to voice the agent. Pick one from the allowed list. Match tone to topic: empathetic for reactivation/collections, warm for winback, professional for insurance.",
      },
      personaGender: {
        type: "string",
        enum: ["female", "male"],
        description:
          "Must match the personaName choice (Riya/Meera/Priya/Neha/Kavya = female; Kabir/Arjun/Rohan/Rahul/Vikram = male). Drives Hindi verb agreement in the scripts.",
      },
      tools: {
        type: "array",
        items: { type: "string" },
        description:
          "1-3 tool handles the agent will use during calls. Pick from the known handles: crm_query (tier/LTV/churn), order_lookup (order/cart/eta), knowledge_lookup (FAQ backstop), policy_lookup (insurance), cart_status_check, loyalty_tier_fetch, loyalty_enrollment_check, loyalty_upgrade_status, log_collection_escalation, log_merchant_outreach. Empty array is fine if no tools apply.",
      },
    },
    required: ["id", "name", "topic", "personaName", "personaGender", "tools"],
  },
  handler: async (args) => {
    const id = args.id as string;
    const name = args.name as string;
    const topic = args.topic as string;
    const personaName = args.personaName as string;
    const personaGender = args.personaGender as PersonaGender;
    const tools = Array.isArray(args.tools) ? (args.tools as string[]) : [];
    if (!id || !name || !topic) {
      return { error: "save_agent_from_topic: id, name, and topic are required" };
    }
    const record = buildAgentSkeleton({
      id,
      name,
      topic,
      personaName,
      personaGender,
      tools,
    });
    await agentsDb.upsertAgent(record);
    return { ok: true, id: record.id };
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

export const agentCrudTools: SurfaceTool[] = [
  listAgents,
  readAgent,
  saveAgent,
  saveAgentFromTopic,
  listTools,
  openAgent,
];
