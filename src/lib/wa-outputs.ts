/**
 * Action-node output derivation — shared between the config panel (live editing)
 * and the example/library seed data (build-time authoring).
 *
 * Action nodes no longer carry user-defined "exit conditions". Their outputs are
 * derived from real signals: WhatsApp nodes expose one branch per *branchable*
 * template button plus `reply_received` / `session_expired`; Voice and SMS expose
 * a single `completed` output. Downstream branching is done with a Conditional node.
 */
import type { NodeKind, NodeOutput, WorkflowNodeData } from "./campaign-types";
import { SEED_TEMPLATES, type TemplateButtonType, type WaTemplate } from "./waba-templates";
import { agentToolOutputVars } from "./agent-data";
import { getTool } from "./tool-registry";

/**
 * Button types that produce a usable inbound signal we can branch on.
 * Phone Number ("Call now") taps have no native WhatsApp webhook, so they render
 * on the template but never become a flow branch. URL taps are assumed tracked.
 */
export const BRANCHABLE_BUTTON_TYPES: ReadonlySet<TemplateButtonType> = new Set([
  "URL",
  "Quick Reply",
  "Link Flow",
]);

/** Resolve by template id (showcase campaigns store ids) or by name (the journey
 *  library stores readable names like "renewal_link_v1"). */
export function resolveWaTemplate(idOrName?: string): WaTemplate | undefined {
  if (!idOrName) return undefined;
  return SEED_TEMPLATES.find((t) => t.id === idOrName)
    ?? SEED_TEMPLATES.find((t) => t.name === idOrName);
}

const REPLY_OUTPUT = (hasButtons: boolean): NodeOutput => ({
  id: "reply_received",
  label: hasButtons ? "Replied (no button)" : "Reply received",
  kind: "outcome",
});

const SESSION_OUTPUT: NodeOutput = {
  id: "session_expired",
  label: "Session expired (24h)",
  kind: "outcome",
};

/**
 * Outputs for a WhatsApp node given its selected template.
 *  - Type 2 (>=1 branchable button): always one output per branchable button +
 *    reply_received + session_expired.
 *  - Type 1 (no branchable buttons / freeform / no template): governed by the
 *    per-node split toggle — `splitType1` false (default) collapses to a single
 *    "advance" handle (returns []); true splits into reply_received + session_expired.
 */
export function whatsappOutputs(template?: WaTemplate, splitType1 = false): NodeOutput[] {
  const branchable = (template?.buttons ?? []).filter((b) => BRANCHABLE_BUTTON_TYPES.has(b.type));
  if (branchable.length === 0) {
    return splitType1 ? [REPLY_OUTPUT(false), SESSION_OUTPUT] : [];
  }
  return [
    ...branchable.map((b, i) => ({ id: `btn_${i}`, label: b.text, kind: "outcome" as const })),
    REPLY_OUTPUT(true),
    SESSION_OUTPUT,
  ];
}

/** The single completion output shared by Voice and SMS nodes. */
export function completedOutput(): NodeOutput[] {
  return [{ id: "completed", label: "Completed", kind: "outcome" }];
}

/** Outputs for any action node, derived from its kind + config. */
export function actionNodeOutputs(kind: NodeKind, config?: WorkflowNodeData["config"]): NodeOutput[] | undefined {
  if (kind === "whatsapp") {
    const split = config?.waSplitOutcomes ?? false;
    if (config?.waMode === "freeform") return whatsappOutputs(undefined, split);
    return whatsappOutputs(resolveWaTemplate(config?.waTemplate), split);
  }
  if (kind === "voiceCall" || kind === "sms" || kind === "apiToolCall") return completedOutput();
  return undefined;
}

/**
 * Workflow variables exposed by the action nodes present in a flow, so a
 * downstream Conditional node can branch on what happened to a send/call.
 * Namespaced by node id to avoid collisions across multiple action nodes.
 */
export function deriveNodeOutcomeVariables(
  nodes: { id: string; data: WorkflowNodeData }[],
): { key: string; source: string }[] {
  const vars: { key: string; source: string }[] = [];
  for (const n of nodes) {
    const { kind, title, config } = n.data;
    const source = title || kind;
    if (kind === "whatsapp") {
      vars.push({ key: `${n.id}.session_expired`, source });
      vars.push({ key: `${n.id}.reply_received`, source });
      const template = config?.waMode === "freeform" ? undefined : resolveWaTemplate(config?.waTemplate);
      const hasBranchable = (template?.buttons ?? []).some((b) => BRANCHABLE_BUTTON_TYPES.has(b.type));
      if (hasBranchable) vars.push({ key: `${n.id}.button`, source });
    } else if (kind === "voiceCall" || kind === "sms") {
      vars.push({ key: `${n.id}.completed`, source });
      // A configured voice agent's tools expose their outputs downstream
      // (e.g. `order_lookup.delivered_status`), namespaced by tool handle.
      if (kind === "voiceCall" && config?.agent) {
        for (const tv of agentToolOutputVars(config.agent)) vars.push(tv);
      }
    } else if (kind === "apiToolCall") {
      // A direct API Tool Call exposes the selected tool's response fields
      // downstream, namespaced by node id (e.g. `<id>.college_name`).
      const tool = config?.apiTool ? getTool(config.apiTool) : undefined;
      if (tool) for (const o of tool.outputs) vars.push({ key: `${n.id}.${o.varName}`, source });
    }
  }
  // Tool output vars are namespaced by tool (not node) so two voice nodes on the
  // same agent would repeat them — dedupe by key.
  const seen = new Set<string>();
  return vars.filter((v) => (seen.has(v.key) ? false : (seen.add(v.key), true)));
}
