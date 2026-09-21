/**
 * Server-safe, per-kind node validators.
 *
 * Mirrors the exact validation logic that lives inside `ConfigPanel`'s
 * per-card `useEffect(mark)` blocks — except those only fire when the panel
 * is mounted, so a node that was never opened silently stays `valid: true`.
 * That gap is why Pi kept telling users "All configured" while red errors
 * were visible on the canvas.
 *
 * This module is pure and edge-aware:
 *   - No React, no IO, safe to call from server functions.
 *   - Takes the full graph context (edges + freeform workflow catalog) so
 *     it can check WhatsApp button wiring, freeform variable mapping, etc.
 *   - Error strings match `ConfigPanel` verbatim so the top-bar count and
 *     Pi's replies agree on the same truth.
 *
 * Callers:
 *   - `builder-context.ts` → `computeGraphValidity(nodes, edges, catalog)`
 *     feeds the per-node `validity` array into every Pi turn.
 *   - `computeNodeValidity` (single-node config-only) still exists in
 *     `node-validity.ts` for legacy call-sites (pi-canvas-apply insert /
 *     update handlers). It's a strict subset of `validateNode`.
 */
import type { NodeKind, PresetConfig, PresetTransform, PresetBranch } from "@/lib/campaign-types";
import { branchConditions } from "@/lib/campaign-types";
import type { FreeformWorkflowRow, FreeformNodeRecord } from "@/lib/freeform-types";
import { resolveWaTemplate, isBranchableButton, actionNodeOutputs } from "@/lib/wa-outputs";
import type { WorkflowNodeData } from "@/lib/campaign-types";
import { resolveSmsTemplate } from "@/lib/sms-store";
import { smsPlaceholders } from "@/lib/sms-templates";
import { resolveRcsTemplate } from "@/lib/rcs-store";
import { templatePlaceholders as rcsTemplatePlaceholders } from "@/lib/rcs-templates";
import { validateMediaUrl } from "@/lib/waba-templates";
import { transformsError } from "@/lib/ai-transformations";
import { getFreeformPlaceholders } from "@/lib/freeform-types";

export type NodeValidity = { valid: boolean; error?: string };

/**
 * Edge shape the validator needs — subset of the DSL edge, kept loose so
 * both server DSL edges (`sourceHandle?: string`) and ReactFlow edges
 * (`sourceHandle?: string | null`) satisfy it.
 */
export type ValidatorEdge = {
  source: string;
  target: string;
  sourceHandle?: string | null;
};

/**
 * External context needed to validate certain kinds:
 *   - `edges` — required for WhatsApp button wiring checks (each branchable
 *     button must have an outgoing edge from that node).
 *   - `freeformWorkflows` — required to resolve placeholders inside the
 *     selected WA Freeform workflow (its body isn't in the config).
 */
export type ValidatorContext = {
  edges: ValidatorEdge[];
  freeformWorkflows?: Array<Pick<FreeformWorkflowRow, "id" | "status"> & { nodes?: FreeformNodeRecord[] }>;
};

const EMPTY_CTX: ValidatorContext = { edges: [] };

/**
 * Does `nodeId` have at least one outgoing edge on the given handle id?
 * Handle match is exact (null / undefined sourceHandle counts as no
 * handle, not as a wildcard) so partial wiring is reliably caught.
 */
function isHandleWired(edges: ValidatorEdge[], nodeId: string, handleId: string): boolean {
  return edges.some((e) => e.source === nodeId && (e.sourceHandle ?? null) === handleId);
}

/**
 * Validate one node against its kind-specific rules. Returns
 * `{ valid: true }` when the node is fully configured and correctly wired
 * (per its kind), or `{ valid: false, error }` with the first blocking
 * issue as a human-readable one-liner.
 */
export function validateNode(
  nodeId: string,
  kind: NodeKind,
  config: PresetConfig | undefined,
  ctx: ValidatorContext = EMPTY_CTX,
): NodeValidity {
  switch (kind) {
    case "start":
    case "end":
      return { valid: true };
    case "audience":
      return validateAudience(config);
    case "conditional":
      return validateConditional(nodeId, config, ctx);
    case "abSplit":
      return validateAbSplit(nodeId, config, ctx);
    case "voiceCall":
      return validateVoiceCall(config);
    case "apiToolCall":
      return validateApiToolCall(config);
    case "whatsapp":
      return validateWhatsapp(nodeId, config, ctx);
    case "whatsappFreeform":
      return validateWhatsappFreeform(config, ctx);
    case "sms":
      return validateSms(config);
    case "rcs":
      return validateRcs(config);
    case "delay":
      return validateDelay(config);
    case "aiTransform":
      return validateAiTransform(config);
    default:
      return { valid: true };
  }
}

/**
 * Batch — used by `builder-context.ts` to compute the per-node validity map
 * Pi consumes each turn. Returns one entry per node preserving `nodeId`
 * and `kind` for straightforward citation.
 */
export function computeGraphValidity(
  nodes: Array<{ id: string; kind: string; config?: unknown }>,
  edges: ValidatorEdge[],
  freeformWorkflows?: ValidatorContext["freeformWorkflows"],
): Array<{ nodeId: string; kind: string; valid: boolean; error?: string }> {
  const ctx: ValidatorContext = { edges, freeformWorkflows };
  // Precompute which node ids have any outgoing edge — used by the
  // reachability layer below. A non-End node with zero outgoing edges
  // is a lead-path dead-end that the graph-level check would flag as
  // invalid even when the per-kind config is fine.
  const hasOutgoing = new Set<string>();
  for (const e of edges) hasOutgoing.add(e.source);

  return nodes.map((n) => {
    // Layer 1 — kind-specific config validity (includes per-branch
    // wiring for conditional + abSplit, per-button wiring for whatsapp).
    const v = validateNode(n.id, n.kind as NodeKind, n.config as PresetConfig | undefined, ctx);
    if (!v.valid) {
      return { nodeId: n.id, kind: n.kind, valid: false, error: v.error };
    }
    // Layer 2 — graph reachability. Only End is allowed to have no
    // outgoing edges. Everything else (Start, Audience, every action
    // and branch node) must feed into at least one downstream node —
    // otherwise leads reach that node and get stuck.
    if (n.kind !== "end" && !hasOutgoing.has(n.id)) {
      return {
        nodeId: n.id,
        kind: n.kind,
        valid: false,
        error: "Not wired forward — leads reach a dead-end here. Connect this node into the next step or into End.",
      };
    }
    // Layer 3 — outcome-handle wiring for action nodes (voice / sms /
    // rcs / apiToolCall). Each `outcome`-kind handle is a real path a
    // lead can take (Success vs Failure, Delivered vs Failed, buttons);
    // leaving it unwired silently dead-ends leads on that handle.
    // `default`-kind handles (Timeout / catch-all) are OK unwired —
    // they're the fall-through by design.
    // Conditional branches, abSplit variants, and whatsapp buttons are
    // handled inside their per-kind validators above; this layer
    // catches the remaining action-node outcomes uniformly.
    const cfg = n.config as WorkflowNodeData["config"] | undefined;
    const outputs = actionNodeOutputs(n.kind as NodeKind, cfg);
    if (outputs && outputs.length > 0) {
      const unwiredOutcome = outputs.find((o) => {
        if (o.kind !== "outcome") return false;
        // whatsapp buttons already flagged by validateWhatsapp — skip
        // to avoid double-reporting the same error.
        if (n.kind === "whatsapp" && o.id.startsWith("btn_")) return false;
        return !isHandleWired(edges, n.id, o.id);
      });
      if (unwiredOutcome) {
        return {
          nodeId: n.id,
          kind: n.kind,
          valid: false,
          error: `'${unwiredOutcome.label}' branch has no downstream connection — leads on this outcome dead-end.`,
        };
      }
    }
    return { nodeId: n.id, kind: n.kind, valid: true };
  });
}

/* ------------------------------------------------------------------------ *
 *  Per-kind validators — each mirrors the ConfigPanel useEffect that
 *  currently owns the truth. Error strings must stay in sync so the top-bar
 *  count and Pi's replies read the same thing.
 * ------------------------------------------------------------------------ */

/** Audience: schema fields present, phone field picked, and phone field
 *  must be a `String` (or `phone`) data type. Matches
 *  `AudienceFields` at ConfigPanel line ~574. */
function validateAudience(config?: PresetConfig): NodeValidity {
  const fields = (config?.fields ?? []).filter((f) => f?.name?.trim());
  const schemaOk = fields.length > 0;
  const phoneField = config?.phoneField ?? config?.phoneCol ?? "";
  const keys = fields.map((f) => f.name);
  const phoneRow = fields.find((f) => f.name === phoneField);
  // Match `AudienceFields` exactly: the phone field must be a `String`
  // type (Number / Boolean would not be picker-serializable).
  const phoneTypeOk = !!phoneRow && phoneRow.type === "String";
  if (!schemaOk) return { valid: false, error: "Add at least one schema field" };
  if (!phoneField) return { valid: false, error: "Select the phone number field" };
  if (!keys.includes(phoneField)) return { valid: false, error: "Phone field is not in the current schema" };
  if (!phoneTypeOk) return { valid: false, error: "Phone field must be a String type" };
  return { valid: true };
}

/**
 * Conditional: at least one branch, and each branch must have at least
 * one FULLY-FILLED condition (variable + op set, value set unless the op
 * is valueless, value2 set for range operators). ConfigPanel's own
 * `mark(true)` on every mutation is too optimistic — a branch with a
 * label and an empty "+ Add condition" shows as valid there. Ours is
 * strict so Pi cites the truth.
 */
const VALUELESS_OPS = new Set(["exists", "does not exist"]);
const RANGE_OPS = new Set(["between", "not between"]);

function validateConditional(
  nodeId: string,
  config: PresetConfig | undefined,
  ctx: ValidatorContext,
): NodeValidity {
  const branches = (config?.branches ?? []) as PresetBranch[];
  if (!Array.isArray(branches) || branches.length === 0) {
    return { valid: false, error: "Add at least one branch" };
  }
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    const label = b.label?.trim() || `Branch ${i + 1}`;
    const conds = branchConditions(b);
    if (conds.length === 0) {
      return { valid: false, error: `Branch '${label}' has no condition` };
    }
    for (let ci = 0; ci < conds.length; ci++) {
      const c = conds[ci];
      if (!c.variable?.trim()) return { valid: false, error: `Branch '${label}': pick a variable for condition #${ci + 1}` };
      if (!c.op?.trim()) return { valid: false, error: `Branch '${label}': pick an operator for condition #${ci + 1}` };
      if (VALUELESS_OPS.has(c.op)) continue;
      if (!c.value?.trim()) return { valid: false, error: `Branch '${label}': set a value for condition #${ci + 1}` };
      if (RANGE_OPS.has(c.op) && !c.value2?.trim()) {
        return { valid: false, error: `Branch '${label}': set the upper bound for condition #${ci + 1}` };
      }
    }
    // Per-branch wiring: each configured branch is a separate handle on
    // the node — leads matching it follow that handle's outgoing edge.
    // Unwired branch = silent lead dead-end. The always-present `default`
    // catch-all handle handles leads matching NO branch, so it's OK
    // unwired here (reachability elsewhere covers "node has zero
    // outgoing edges at all").
    if (!isHandleWired(ctx.edges, nodeId, b.id)) {
      return { valid: false, error: `Branch '${label}' has no downstream connection — leads matching it dead-end.` };
    }
  }
  return { valid: true };
}

/** A/B Split: variants must total 100% AND each variant must be wired
 *  forward. Every variant is a real traffic path — unwired = leads on
 *  that variant dead-end silently. Matches `AbSplitFields` line 883
 *  for the totals check; wiring is an additional layer. */
function validateAbSplit(
  nodeId: string,
  config: PresetConfig | undefined,
  ctx: ValidatorContext,
): NodeValidity {
  const variants = config?.splitVariants ?? [];
  if (variants.length === 0) return { valid: false, error: "Add at least one A/B variant" };
  const total = variants.reduce((s, v) => s + (Number(v.pct) || 0), 0);
  if (total !== 100) return { valid: false, error: `Traffic must total 100% (currently ${total}%)` };
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const label = v.label?.trim() || `Variant ${String.fromCharCode(65 + i)}`;
    if (!isHandleWired(ctx.edges, nodeId, v.id)) {
      return { valid: false, error: `Variant '${label}' (${v.pct}%) has no downstream connection — leads on this arm dead-end.` };
    }
  }
  return { valid: true };
}

/** Voice Call: needs an agent id. */
function validateVoiceCall(config?: PresetConfig): NodeValidity {
  const agent = config?.agent?.trim();
  if (!agent) return { valid: false, error: "Pick a voice agent" };
  return { valid: true };
}

/** API Tool: needs a tool handle. Input mapping is not enforced (matches
 *  ConfigPanel comment at line 966 — picking the tool is enough for v1). */
function validateApiToolCall(config?: PresetConfig): NodeValidity {
  const tool = config?.apiTool?.trim();
  if (!tool) return { valid: false, error: "Select an API tool" };
  return { valid: true };
}

/**
 * WhatsApp: mirrors `WhatsAppCore` at line 1490:
 *  - `waNumber` must be selected.
 *  - Template mode: `waTemplate` must resolve; freeform mode: `waBody` must
 *    be present.
 *  - If the template has a media header (IMAGE / VIDEO / DOCUMENT), the
 *    `waMediaUrl` must be mapped (variable) or a valid URL (constant).
 *  - Every branchable button must have an outgoing edge from this node
 *    (matches the client wiring effect at WorkflowCanvas line 310).
 */
function validateWhatsapp(
  nodeId: string,
  config: PresetConfig | undefined,
  ctx: ValidatorContext,
): NodeValidity {
  const mode = config?.waMode ?? "template";
  const numberSelected = !!config?.waNumber;
  const template = mode === "template" ? resolveWaTemplate(config?.waTemplate) : undefined;
  const contentReady = mode === "template"
    ? !!template
    : !!config?.waBody?.trim();

  if (!numberSelected) return { valid: false, error: "Select a connected WhatsApp number" };
  if (!contentReady) {
    return {
      valid: false,
      error: mode === "template" ? "Pick a WhatsApp template" : "Write a message body",
    };
  }

  // Media header check for template mode.
  if (mode === "template" && template && template.format !== "TEXT") {
    const media = config?.waMediaUrl;
    const def = media?.def?.trim() ?? "";
    if (!def) {
      return {
        valid: false,
        error: `Map the ${template.format.toLowerCase()} URL for this template's header`,
      };
    }
    if (media?.mode === "constant") {
      const err = validateMediaUrl(def, template.format);
      if (err) return { valid: false, error: err };
    }
  }

  // Button wiring — every branchable button must have an outgoing edge
  // with a matching sourceHandle (btn_0, btn_1, ...).
  if (mode === "template" && template) {
    const buttons = template.buttons ?? [];
    const branchable = buttons.map((b, i) => ({ b, id: `btn_${i}` })).filter((x) => isBranchableButton(x.b));
    const unwired = branchable.find(({ id }) => !ctx.edges.some((e) => e.source === nodeId && (e.sourceHandle ?? null) === id));
    if (unwired) return { valid: false, error: `Button '${unwired.b.text}' isn't connected` };
  }

  return { valid: true };
}

const FF_TIMER_MIN = 1;
const FF_TIMER_MAX = 1440;

/** WA Freeform node: workflow selected + Ready + timer in [1, 1440]min +
 *  every placeholder mapped. Mirrors `WhatsappFreeformFields` line 1779. */
function validateWhatsappFreeform(
  config: PresetConfig | undefined,
  ctx: ValidatorContext,
): NodeValidity {
  const selectedId = config?.ffWorkflowId?.trim();
  if (!selectedId) return { valid: false, error: "Pick a workflow" };
  const selected = (ctx.freeformWorkflows ?? []).find((w) => w.id === selectedId);
  if (!selected) return { valid: false, error: "Selected workflow no longer exists" };
  if (selected.status !== "ready") return { valid: false, error: "Selected workflow is not Ready" };
  const timer = config?.ffTimerMinutes ?? 60;
  if (timer < FF_TIMER_MIN || timer > FF_TIMER_MAX) {
    return { valid: false, error: `Session timer must be between ${FF_TIMER_MIN} and ${FF_TIMER_MAX} minutes` };
  }
  const placeholders = selected.nodes ? getFreeformPlaceholders(selected.nodes) : [];
  const varMap = config?.ffVarMap ?? [];
  const missing = placeholders.find((p) => !varMap.find((m) => m.v === `{{${p.key}}}` && m.def?.trim()));
  if (missing) return { valid: false, error: `Map variable {{${missing.key}}}` };
  return { valid: true };
}

/** SMS: template selected + every placeholder mapped. Mirrors
 *  `SmsFieldsInner` line 2194. */
function validateSms(config?: PresetConfig): NodeValidity {
  const template = resolveSmsTemplate(config?.smsTemplateId);
  if (!template) return { valid: false, error: "Select a DLT template" };
  const placeholders = smsPlaceholders(template.content);
  const varMap = config?.smsVarMap ?? [];
  const unmapped = placeholders.filter((p) => !varMap.find((m) => m.v === p && m.def?.trim())).length;
  if (unmapped > 0) return { valid: false, error: `Map ${unmapped} template variable${unmapped === 1 ? "" : "s"}` };
  return { valid: true };
}

/** RCS: template selected + every placeholder mapped. Mirrors
 *  `RcsFieldsInner` line 2400. */
function validateRcs(config?: PresetConfig): NodeValidity {
  const template = resolveRcsTemplate(config?.rcsTemplateId);
  if (!template) return { valid: false, error: "Select a template" };
  const placeholders = rcsTemplatePlaceholders(template);
  const varMap = config?.rcsVarMap ?? [];
  const unmapped = placeholders.filter((p) => !varMap.find((m) => m.v === p && m.def?.trim())).length;
  if (unmapped > 0) return { valid: false, error: `Map ${unmapped} template variable${unmapped === 1 ? "" : "s"}` };
  return { valid: true };
}

/** Delay: dynamic mode needs variable + format + fallback duration/unit.
 *  Fixed mode is always valid. Mirrors `DelayFields` line 3373. */
function validateDelay(config?: PresetConfig): NodeValidity {
  if (config?.delayMode !== "variable") return { valid: true };
  if (!config.delayVariable) return { valid: false, error: "Pick a datetime variable" };
  if (!config.delayVariableFormat?.trim()) return { valid: false, error: "Pick a datetime format" };
  if (config.delayFallbackValue == null || config.delayFallbackValue <= 0) return { valid: false, error: "Set a fallback duration" };
  if (!config.delayFallbackUnit) return { valid: false, error: "Set a fallback unit" };
  return { valid: true };
}

/** AI Transform: at least one transform + each transform's own error
 *  (via `transformsError`). Mirrors `AiTransformFields` line 3046. */
function validateAiTransform(config?: PresetConfig): NodeValidity {
  const transforms = (config?.transforms ?? []) as PresetTransform[];
  if (transforms.length === 0) return { valid: false, error: "Add at least one transform" };
  const err = transformsError(transforms);
  if (err) return { valid: false, error: err };
  return { valid: true };
}
