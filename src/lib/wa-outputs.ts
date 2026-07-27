/**
 * Action-node output derivation — shared between the config panel (live editing)
 * and the example/library seed data (build-time authoring).
 *
 * Action nodes no longer carry user-defined "exit conditions". Their outputs are
 * derived from real signals: WhatsApp nodes expose one branch per *branchable*
 * template button plus `reply_received` / `session_expired`; Voice exposes a
 * single `completed` output. Downstream branching is done with a Conditional node.
 *
 * SMS is the deliberate exception — see {@link smsOutputs}.
 */
import type { NodeKind, NodeOutput, WorkflowNodeData } from "./campaign-types";
import { SEED_TEMPLATES, type TemplateButton, type WaTemplate } from "./waba-templates";
import { resolveAgent } from "./agent-data";
import { getTool } from "./tool-registry";
import { resolveSmsTemplate } from "./sms-store";
import { smsPlaceholders } from "./sms-templates";

/**
 * Whether a template button produces a usable inbound signal we can branch on.
 *  - Quick Reply (Custom): always branchable — Meta delivers a button-reply webhook.
 *  - URL (Visit website): branchable ONLY when click tracking is enabled on the
 *    button; an untracked URL tap gives us no event, so it folds into "No response".
 *  - Phone Number (Call): no native WhatsApp webhook — never branchable.
 *  - Link Flow: legacy, not offered in v1 — never branchable.
 */
export function isBranchableButton(b: TemplateButton): boolean {
  if (b.type === "Quick Reply") return true;
  if (b.type === "URL") return !!b.clickTracking;
  return false;
}

/** Resolve by template id (showcase campaigns store ids) or by name (the journey
 *  library stores readable names like "renewal_link_v1"). */
export function resolveWaTemplate(idOrName?: string): WaTemplate | undefined {
  if (!idOrName) return undefined;
  return SEED_TEMPLATES.find((t) => t.id === idOrName)
    ?? SEED_TEMPLATES.find((t) => t.name === idOrName);
}

/** Trackable freeform reply — the lead replied without tapping a button. */
const REPLY_OUTPUT: NodeOutput = { id: "reply_received", label: "Replied (no button)", kind: "outcome" };

/** Always-on catch-all: 24h session expiry + every untrackable tap (phone numbers,
 *  untracked URL buttons). Guarantees a lead is never stuck — there is always a
 *  default path forward. */
const NO_RESPONSE_OUTPUT: NodeOutput = { id: "no_response", label: "No response / continue", kind: "default" };

/**
 * Outputs for a WhatsApp node given its selected template. There is no toggle —
 * a WhatsApp node ALWAYS has at least two branches:
 *   - `reply_received`  — a trackable freeform reply (no button tapped)
 *   - `no_response`     — the catch-all default: 24h session expiry + any
 *                         untrackable tap (phone number, untracked URL)
 * plus one tracked handle per branchable button (Quick Reply / tracked URL).
 *
 * Non-trackable buttons (phone numbers, untracked URLs) deliberately get no
 * handle of their own — those taps route through `no_response`.
 */
export function whatsappOutputs(template?: WaTemplate): NodeOutput[] {
  const branchable = (template?.buttons ?? []).filter(isBranchableButton);
  const buttonHandles = branchable.map((b, i) => ({ id: `btn_${i}`, label: b.text, kind: "outcome" as const }));
  return [...buttonHandles, REPLY_OUTPUT, NO_RESPONSE_OUTPUT];
}

/** The single completion output used by Voice nodes. */
export function completedOutput(): NodeOutput[] {
  return [{ id: "completed", label: "Completed", kind: "outcome" }];
}

/**
 * Outputs for an SMS node — the one action node that branches on *delivery*
 * rather than advancing on send (PICOM-4726 §4).
 *
 * Three mutually exclusive terminal outcomes, resolved from the vendor's DLR:
 *   - `delivered`  — a positive DLR arrived
 *   - `failed`     — the vendor rejected the submission, or a negative DLR arrived
 *   - `no_dlr`     — nothing arrived before the node's wait window expired
 *
 * "Sent" is deliberately NOT a branch. Every message that leaves the platform is
 * sent, so a Sent handle would fire alongside Delivered and put the same lead on
 * two paths; submission acceptance is a precondition here, and a rejected
 * submission routes to `failed`. Sent remains a *metric* in Analytics.
 *
 * This makes SMS the only action node that holds a lead until an external event
 * lands or a timer expires — WhatsApp exposes its delivery receipt as the
 * `delivery_state` variable instead and leaves the branching to a Conditional.
 * The divergence is intentional: DLR is the whole point of an SMS step, and the
 * "not delivered within N minutes" path has no equivalent on WhatsApp.
 */
/**
 * The three delivery outcomes every SMS node exposes. The `timeout` handle keeps
 * the internal id `no_dlr` (edges in the example campaigns reference it); only
 * its display label reads "Timeout".
 */
export function smsOutputs(): NodeOutput[] {
  return [
    { id: "delivered", label: "Delivered", kind: "outcome" },
    { id: "failed", label: "Failed", kind: "outcome" },
    { id: "no_dlr", label: "Timeout", kind: "default" },
  ];
}

/** Wait-window options for the `no_dlr` path, longest-plausible DLR latency last. */
export const SMS_DLR_WINDOWS = ["5 minutes", "15 minutes", "30 minutes", "1 hour", "6 hours", "24 hours"] as const;
export const DEFAULT_SMS_DLR_WINDOW = "30 minutes";

/**
 * Outcome handles for an API Tool Call node. Unlike Voice/SMS (single "completed"),
 * an API call branches on the request result so downstream nodes can react to a
 * timeout or failure differently from a success.
 */
export function apiOutcomeOutputs(): NodeOutput[] {
  return [
    { id: "success", label: "Success", kind: "outcome" },
    { id: "timeout", label: "Timeout", kind: "outcome" },
    { id: "failure", label: "Failure", kind: "outcome" },
  ];
}

/** Outputs for any action node, derived from its kind + config. */
export function actionNodeOutputs(kind: NodeKind, config?: WorkflowNodeData["config"]): NodeOutput[] | undefined {
  if (kind === "whatsapp") {
    if (config?.waMode === "freeform") return whatsappOutputs(undefined);
    return whatsappOutputs(resolveWaTemplate(config?.waTemplate));
  }
  if (kind === "apiToolCall") return apiOutcomeOutputs();
  if (kind === "sms") return smsOutputs();
  if (kind === "voiceCall") return completedOutput();
  return undefined;
}

/**
 * Workflow variables produced by the nodes present in a flow, so a downstream
 * Conditional node can branch on them. Action outcomes are namespaced by the
 * node's stable per-kind serial (e.g. `whatsapp_1.button`, `voice_2.call_status`)
 * — the SAME string used in the picker, for v1 consistency. The Audience node
 * contributes `contact.<key>` derived from its actual edited schema rows.
 */
export function deriveNodeOutcomeVariables(
  nodes: { id: string; data: WorkflowNodeData }[],
): { key: string; source: string }[] {
  const vars: { key: string; source: string }[] = [];
  for (const n of nodes) {
    const { kind, title, serial, config } = n.data;
    // The stable per-kind serial (e.g. `whatsapp_1`) is BOTH the variable namespace
    // and the human-readable source — picker renders it as `(serial • variable)`.
    const ns = serial ?? n.id;
    const source = serial || title || kind;
    if (kind === "whatsapp") {
      // Delivery webhook status for THIS message — sent | delivered | read | failed.
      // Always present on every WhatsApp node (it is the message's own delivery
      // receipt), namespaced by serial; there is no generic `wa.delivery_state`.
      vars.push({ key: `${ns}.delivery_state`, source });
      // Booleans the lead's reply produced; `button` (string = clicked label) only
      // exists when the template has a branchable (trackable) button.
      vars.push({ key: `${ns}.session_expired`, source });
      vars.push({ key: `${ns}.reply_received`, source });
      const template = config?.waMode === "freeform" ? undefined : resolveWaTemplate(config?.waTemplate);
      const hasBranchable = (template?.buttons ?? []).some(isBranchableButton);
      if (hasBranchable) vars.push({ key: `${ns}.button`, source });
    } else if (kind === "voiceCall") {
      // Tech defaults present on every voice node…
      vars.push({ key: `${ns}.call_status`, source });   // Pending | Running | Failed | Completed
      vars.push({ key: `${ns}.call_duration`, source });  // seconds
      // …plus the configured agent's post-call analysis eval variables. (Tool
      // outputs are in-call only and are deliberately NOT exposed downstream.)
      const agent = resolveAgent(config?.agent);
      if (agent) for (const pc of agent.postCall) vars.push({ key: `${ns}.${pc.name}`, source });
    } else if (kind === "sms") {
      // Delivery facts this message produced. `delivery_state` mirrors the three
      // output handles (delivered | failed | no_dlr) for Conditionals that would
      // rather test a value than wire three edges; `sms_count` is the billed
      // segment count and `failure_reason` the vendor's rejection text.
      vars.push({ key: `${ns}.delivery_state`, source });
      vars.push({ key: `${ns}.sms_count`, source });
      vars.push({ key: `${ns}.failure_reason`, source });
      // The DLT placeholders of the selected template, so a downstream node can
      // read back exactly what was substituted into this message.
      const template = resolveSmsTemplate(config?.smsTemplateId);
      if (template) {
        for (const p of smsPlaceholders(template.content)) vars.push({ key: `${ns}.var.${p}`, source });
      }
    } else if (kind === "audience") {
      // Contact fields the audience's *actual edited schema* exposes downstream as
      // `contact.<key>` — CSV column keys, or API payload field names.
      const keys = config?.audienceMode === "api"
        ? (config?.fields ?? []).map((f) => f.name)
        : (config?.csvKeys ?? []);
      for (const k of keys) if (k?.trim()) vars.push({ key: `contact.${k.trim()}`, source });
    } else if (kind === "apiToolCall") {
      // A direct API Tool Call exposes the selected tool's response fields
      // downstream, namespaced by the node serial (e.g. `api_1.college_name`).
      const tool = config?.apiTool ? getTool(config.apiTool) : undefined;
      if (tool) for (const o of tool.outputs) vars.push({ key: `${ns}.${o.varName}`, source });
    }
  }
  // Dedupe by key (defensive — duplicates only if two nodes share a serial).
  const seen = new Set<string>();
  return vars.filter((v) => (seen.has(v.key) ? false : (seen.add(v.key), true)));
}
