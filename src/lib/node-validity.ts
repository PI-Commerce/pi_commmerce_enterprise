/**
 * Registry-driven per-node validity.
 *
 * Kills the "every LLM-inserted node has data.valid = true" lie. A node
 * is only valid when EVERY `requires` key on its registry entry is set
 * to a non-empty value in the node's config. When something's missing,
 * we surface a concrete one-line error the config panel + Ask Pi both
 * consume.
 *
 * Pure. No IO. No React. Used by:
 *   - `pi-canvas-apply.ts` (`insert_node` handler) — sets initial validity
 *     when Pi drops a new node on the canvas.
 *   - `builder-context.ts` — includes per-node `validity` in Pi's
 *     injected context so Pi can proactively surface "your Voice node is
 *     missing an agent, want me to pick renewal_voice?".
 *   - `ConfigPanel` field-level validators (not touched here — those
 *     are the interactive editor's own logic; this module is the
 *     `save-gate` view of validity).
 *
 * Registry `requires` field naming maps directly to `PresetConfig` keys
 * (see `campaign-types.ts`) — so as long as the registry stays honest,
 * this module keeps working without hardcoded per-kind logic.
 */
import type { WorkflowNodeData, PresetConfig, NodeKind } from "@/lib/campaign-types";
import { NODE_REGISTRY } from "@/lib/node-registry";

export type NodeValidity = { valid: boolean; error?: string };

/** Human-facing label for a `requires` key. Keeps Pi's error messages
 *  natural ("Voice node is missing an agent") instead of dev-y
 *  ("agent is required"). Falls back to the raw key. */
const REQUIRES_LABEL: Record<string, string> = {
  fields: "at least one schema field",
  phoneField: "the phone number field",
  branches: "at least one branch",
  splitVariants: "at least one A/B variant",
  agent: "a voice agent",
  waTemplate: "a WhatsApp template",
  smsTemplateId: "an SMS template",
  rcsTemplateId: "an RCS template",
  ffWorkflowId: "a freeform workflow",
  apiTool: "an API tool",
  transforms: "at least one transform",
  delayMode: "static or dynamic delay",
};

function labelFor(requiresKey: string): string {
  return REQUIRES_LABEL[requiresKey] ?? requiresKey;
}

/** Does the config carry a non-empty value for this key? String, array,
 *  and object treatments differ. Anything explicitly `false` counts as
 *  set (some kinds toggle booleans). */
function hasValue(config: unknown, key: string): boolean {
  if (!config || typeof config !== "object") return false;
  const v = (config as Record<string, unknown>)[key];
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true; // number, boolean, etc.
}

/**
 * Compute validity for one node. Reads the registry entry for the
 * node's kind and checks every `requires` key against the node's
 * config. Returns `{ valid: true }` when everything's set; otherwise
 * `{ valid: false, error: "Missing <first-missing>" }`.
 *
 * Undeletable system nodes (Start / End) have `requires: []` so they
 * always return valid — matches their pre-existing `locked` render.
 *
 * Unknown kinds (Pi somehow got past the validator) return valid so
 * we don't leave a permanently-red node on the canvas — the construct
 * validator should have caught the insert anyway.
 */
export function computeNodeValidity(kind: NodeKind, config: PresetConfig | undefined): NodeValidity {
  const entry = NODE_REGISTRY[kind];
  if (!entry) return { valid: true };
  if (entry.requires.length === 0) return { valid: true };
  const missing = entry.requires.filter((k) => !hasValue(config, k));
  if (missing.length === 0) return { valid: true };
  // Show the first missing thing — one clear ask beats a laundry list.
  return { valid: false, error: `Missing ${labelFor(missing[0])}` };
}

/** Overload for callers that hold WorkflowNodeData already. */
export function computeNodeValidityFromData(data: WorkflowNodeData): NodeValidity {
  return computeNodeValidity(data.kind, data.config);
}

/**
 * Batch validity — returns one entry per node. Used by the builder-context
 * assembler so Pi sees the full validity map on every turn.
 */
export function computeAllValidity(
  nodes: Array<{ id: string; kind: string; config?: unknown }>,
): Array<{ nodeId: string; kind: string; valid: boolean; error?: string }> {
  return nodes.map((n) => {
    const v = computeNodeValidity(n.kind as NodeKind, n.config as PresetConfig | undefined);
    return { nodeId: n.id, kind: n.kind, valid: v.valid, ...(v.error ? { error: v.error } : {}) };
  });
}
