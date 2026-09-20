/**
 * Agents surface — section-scoped EDIT tools (Phase 2).
 *
 * Draft flow ships an SOP-shaped skeleton via `save_agent_from_topic`
 * (deterministic server template). These tools let Pi edit that skeleton
 * one section at a time without regenerating the full prompt. Each tool
 * takes minimal args, does a surgical read + splice + write, and returns
 * `{ok, id}`.
 *
 * Why not just use `save_agent`: that path requires Pi to author the
 * FULL merged AgentRecord (thousands of tokens of Devanagari-heavy
 * masterPrompt) every time. Section-scoped tools keep Pi's output
 * ~50-300 tokens per edit and land in 2-4 seconds.
 */
import * as agentsDb from "@/lib/db/agents";
import type { SurfaceTool } from "@/lib/pi/kernel";
import {
  editMasterPromptSection,
  editKnowledgeSection,
  applyStringSetDiff,
  type EditMode,
} from "../edit-helpers";
import type { PostCallVar } from "@/lib/agent-data";

/**
 * Edit one h1 section of an agent's masterPrompt. Preserves the header
 * line ("# N. Title") — pass only the section body.
 *
 * mode = "replace" (default) swaps the whole body.
 * mode = "append" adds to the end (used for "add an objection", "add an
 *   FAQ", "add a call-flow step" — Pi only outputs the addition).
 */
export const rewriteMasterPromptSection: SurfaceTool = {
  name: "rewrite_master_prompt_section",
  description:
    "Edit one h1 section of an agent's master prompt. sectionNumber matches the H1 heading: 1=Persona, 2=Objective, 3=Variables you receive, 4=Pronunciation rules, 5=Language rule, 6=Call flow, 7=Objection handling, 8=FAQs, 9=Guardrails, 10=Success + failure criteria. newContent is the section BODY ONLY (do NOT include the '# N. Title' header — the server preserves it). mode='replace' swaps the whole section; mode='append' adds to the end (use for 'add an objection', 'add an FAQ', 'add a call-flow step'). Devanagari-only Hindi, never Latin-transliterated.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string" },
      sectionNumber: { type: "integer", minimum: 1, maximum: 10 },
      newContent: { type: "string" },
      mode: { type: "string", enum: ["replace", "append"] },
    },
    required: ["id", "sectionNumber", "newContent"],
  },
  handler: async (args) => {
    const id = args.id as string;
    const record = await agentsDb.readAgent(id);
    if (!record) return { error: "agent_not_found" };
    const updated = editMasterPromptSection(
      record.masterPrompt,
      args.sectionNumber as number,
      args.newContent as string,
      (args.mode as EditMode) ?? "replace",
    );
    if (updated === null)
      return { error: `section_not_found: section ${args.sectionNumber} could not be located — the master prompt may have been manually re-structured` };
    await agentsDb.upsertAgent({ ...record, masterPrompt: updated });
    return { ok: true, id };
  },
};

/**
 * Edit one h2 section of an agent's knowledgeBase, keyed by title.
 * Titles: "Product basics", "Current campaign details", "Escalation
 * paths", "Compliance quick-reference".
 */
export const rewriteKnowledgeSection: SurfaceTool = {
  name: "rewrite_knowledge_section",
  description:
    "Edit one h2 section of an agent's knowledge base. sectionTitle is the exact section title (case-insensitive) — usually one of: 'Product basics', 'Current campaign details', 'Escalation paths', 'Compliance quick-reference'. newContent is the section BODY ONLY (do NOT include the '## Title' header). mode='replace' swaps the whole section; mode='append' adds to the end.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string" },
      sectionTitle: { type: "string" },
      newContent: { type: "string" },
      mode: { type: "string", enum: ["replace", "append"] },
    },
    required: ["id", "sectionTitle", "newContent"],
  },
  handler: async (args) => {
    const id = args.id as string;
    const record = await agentsDb.readAgent(id);
    if (!record) return { error: "agent_not_found" };
    const updated = editKnowledgeSection(
      record.knowledgeBase,
      args.sectionTitle as string,
      args.newContent as string,
      (args.mode as EditMode) ?? "replace",
    );
    if (updated === null)
      return { error: `section_not_found: no h2 section titled '${args.sectionTitle}' — the knowledge base may have been manually re-structured` };
    await agentsDb.upsertAgent({ ...record, knowledgeBase: updated });
    return { ok: true, id };
  },
};

/**
 * Add / remove tool handles atomically. Server merges the diff onto the
 * current tools array so Pi doesn't need to read_agent first for a
 * simple wire-up. Dedup preserves order.
 */
export const updateTools: SurfaceTool = {
  name: "update_tools",
  description:
    "Add or remove tool handles from an agent. Atomic diff — pass `add: [handles]` to wire new tools, `remove: [handles]` to detach. Server preserves order and dedupes. Use real handles: crm_query, order_lookup, knowledge_lookup, policy_lookup, cart_status_check, loyalty_tier_fetch, loyalty_enrollment_check, loyalty_upgrade_status, log_collection_escalation, log_merchant_outreach.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string" },
      add: { type: "array", items: { type: "string" } },
      remove: { type: "array", items: { type: "string" } },
    },
    required: ["id"],
  },
  handler: async (args) => {
    const id = args.id as string;
    const record = await agentsDb.readAgent(id);
    if (!record) return { error: "agent_not_found" };
    const nextTools = applyStringSetDiff(
      record.tools,
      Array.isArray(args.add) ? (args.add as string[]) : [],
      Array.isArray(args.remove) ? (args.remove as string[]) : [],
    );
    await agentsDb.upsertAgent({ ...record, tools: nextTools });
    return { ok: true, id, tools: nextTools };
  },
};

/**
 * Add / remove post-call variables atomically. Adds are appended with
 * fresh ids (p_<random>). Removes match by `name`.
 */
export const updatePostCallVars: SurfaceTool = {
  name: "update_postcall_vars",
  description:
    "Add or remove post-call variables. add: [{name, prompt}] appends new vars; removeNames: [names] prunes matching names. Names must be snake_case. Prompts are one sentence with enums stated inline where applicable. Use for 'add a post-call var for X' or 'drop the callback_requested var'.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string" },
      add: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            prompt: { type: "string" },
          },
          required: ["name", "prompt"],
        },
      },
      removeNames: { type: "array", items: { type: "string" } },
    },
    required: ["id"],
  },
  handler: async (args) => {
    const id = args.id as string;
    const record = await agentsDb.readAgent(id);
    if (!record) return { error: "agent_not_found" };
    const removeSet = new Set(
      Array.isArray(args.removeNames) ? (args.removeNames as string[]) : [],
    );
    const kept = record.postCall.filter((v) => !removeSet.has(v.name));
    const existingNames = new Set(kept.map((v) => v.name));
    const rawAdds = Array.isArray(args.add)
      ? (args.add as Array<{ name?: string; prompt?: string }>)
      : [];
    const additions: PostCallVar[] = [];
    for (const a of rawAdds) {
      if (!a?.name || !a?.prompt) continue;
      if (existingNames.has(a.name)) continue;
      additions.push({
        id: `p_${Math.random().toString(36).slice(2, 8)}`,
        name: a.name,
        prompt: a.prompt,
      });
      existingNames.add(a.name);
    }
    const nextPostCall = [...kept, ...additions];
    await agentsDb.upsertAgent({ ...record, postCall: nextPostCall });
    return { ok: true, id, postCall: nextPostCall };
  },
};

/** Rename an agent (the `name` field only — id stays stable). */
export const renameAgent: SurfaceTool = {
  name: "rename_agent",
  description:
    "Rename an agent. The id stays stable (never changes) — only the display name updates. newName must be snake_case, ends in _voice unless the domain implies it.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string" },
      newName: { type: "string" },
    },
    required: ["id", "newName"],
  },
  handler: async (args) => {
    const id = args.id as string;
    const newName = (args.newName as string).trim();
    if (!newName) return { error: "rename_agent: newName is required" };
    const record = await agentsDb.readAgent(id);
    if (!record) return { error: "agent_not_found" };
    await agentsDb.upsertAgent({ ...record, name: newName });
    return { ok: true, id, name: newName };
  },
};

export const agentEditTools: SurfaceTool[] = [
  rewriteMasterPromptSection,
  rewriteKnowledgeSection,
  updateTools,
  updatePostCallVars,
  renameAgent,
];
