/**
 * Compiler — the deterministic translation from a {@link CampaignDSL} into the
 * ReactFlow graph the canvas renders, plus the derived "needs input" list that
 * drives the single Resolve card and the assumptions surfaced in chat.
 *
 * This replaces the per-template `build()` closures: one compiler keyed off the
 * DSL `flow` + `steps`, so any template (or, later, any planned brief) renders the
 * same way and patches the same stable node ids.
 *
 * Node "needs input" state reuses the canvas's existing `valid:false` + `error`
 * convention, so a freshly instantiated template lights up exactly the nodes whose
 * resources are still unresolved.
 */
import type { Edge, Node } from "reactflow";
import type { WorkflowNodeData } from "@/lib/campaign-types";
import {
  TENANT_DEFAULTS,
  findSegment,
  findWaTemplate,
  findVoiceAgent,
  parseDuration,
  type TemplateVar,
} from "@/lib/tenant-registry";
import type { AskPiPlan } from "@/components/workflow/AskPiWizard";
import {
  delayStep,
  type CampaignDSL,
  type DurationValue,
  type Step,
} from "./campaign-dsl";

export type CompileResult = {
  /** ReactFlow nodes/edges for the canvas. */
  plan: AskPiPlan;
  /** Open variables still requiring user input — drives the single Resolve card. */
  needsInput: TemplateVar[];
  /** Tenant defaults / inferred values surfaced to the user (never asked). */
  assumptions: string[];
};

const Y_STEP = 120;

/* ---------------------------------------------------------------- */
/* Node builders                                                    */
/* ---------------------------------------------------------------- */

function startNode(): Node<WorkflowNodeData> {
  return { id: "start", type: "workflow", position: { x: 0, y: 0 },
    data: { kind: "start", title: "Start", locked: true, valid: true } };
}

function audienceNode(dsl: CampaignDSL, y: number): Node<WorkflowNodeData> {
  const seg = findSegment(dsl.audience.segment.value);
  return { id: "audience", type: "workflow", position: { x: 0, y },
    data: {
      kind: "audience", title: "Audience",
      subtitle: seg ? `${seg.label} · ${seg.size}` : "Select segment",
      valid: !!seg, error: seg ? undefined : "Select segment",
      config: { audienceMode: "api", phoneField: "contact.phone" },
    } };
}

function whatsappNode(waTemplateId: string, y: number): Node<WorkflowNodeData> {
  const wa = findWaTemplate(waTemplateId);
  return { id: "wa", type: "workflow", position: { x: 0, y },
    data: {
      kind: "whatsapp", title: "WhatsApp message",
      subtitle: wa ? `Template: ${wa.label}` : "Pick template",
      valid: !!wa, error: wa ? undefined : "Pick template",
      config: {
        waNumber: TENANT_DEFAULTS.waNumber, waMode: "template",
        waTemplate: wa ? `${wa.label} · ${wa.category}` : undefined,
        waVarMap: [{ v: "{{1}}", def: "contact.first_name" }, { v: "{{2}}", def: "payload.order_id" }],
      },
    } };
}

function voiceNode(voiceAgentId: string, y: number): Node<WorkflowNodeData> {
  const agent = findVoiceAgent(voiceAgentId);
  return { id: "voice", type: "workflow", position: { x: 0, y },
    data: {
      kind: "voiceCall", title: "Voice call",
      subtitle: agent ? `Agent: ${agent.name}` : "Select voice agent",
      valid: !!agent, error: agent ? undefined : "Select agent",
      config: {
        agent: agent?.name, callStart: TENANT_DEFAULTS.windowStart,
        callEnd: TENANT_DEFAULTS.windowEnd, timezone: TENANT_DEFAULTS.timezone,
        maxAttempts: 3, retryInterval: "1 hour",
        voiceVarMap: [{ v: "{{name}}", def: "contact.first_name" }],
      },
    } };
}

function delayNode(wait: DurationValue, y: number): Node<WorkflowNodeData> {
  return { id: "delay", type: "workflow", position: { x: 0, y },
    data: {
      kind: "delay", title: "Fallback wait", subtitle: `${wait.value} ${wait.unit}`, valid: true,
      config: { delayValue: wait.value, delayUnit: wait.unit },
    } };
}

function endNode(y: number): Node<WorkflowNodeData> {
  return { id: "end", type: "workflow", position: { x: 0, y },
    data: { kind: "end", title: "End", locked: true, valid: true } };
}

/* ---------------------------------------------------------------- */
/* needsInput + assumptions                                         */
/* ---------------------------------------------------------------- */

/** Map the DSL's still-open fields to the Resolve card's TemplateVar specs. */
function deriveNeedsInput(dsl: CampaignDSL): TemplateVar[] {
  const vars: TemplateVar[] = [];
  if (dsl.audience.segment.origin === "must-confirm") {
    vars.push({ key: "segment", kind: "segment", label: "Audience segment", required: true });
  }
  for (const step of dsl.steps) {
    if (step.type === "whatsapp" && step.waTemplate.origin === "must-confirm") {
      vars.push({ key: "waTemplate", kind: "waTemplate", label: "Approved WhatsApp template", required: true });
    } else if (step.type === "voice" && step.voiceAgent.origin === "must-confirm") {
      vars.push({ key: "voiceAgent", kind: "voiceAgent", label: "Voice agent", required: true });
    } else if (step.type === "delay" && step.wait.origin === "must-confirm") {
      vars.push({
        key: "fallbackWindow", kind: "duration", label: "Fallback window",
        default: `${step.wait.value} ${step.wait.unit}`, required: true,
      });
    }
  }
  return vars;
}

/** Assumptions = the DSL's baked tenant defaults + any default (un-asked) fallback wait. */
function deriveAssumptions(dsl: CampaignDSL): string[] {
  const out = dsl.assumptions.slice();
  const delay = delayStep(dsl);
  if (delay && delay.wait.origin === "default") {
    out.unshift(`Fallback wait ${delay.wait.value} ${delay.wait.unit}`);
  }
  return out;
}

/* ---------------------------------------------------------------- */
/* compile                                                          */
/* ---------------------------------------------------------------- */

/**
 * Compile a CampaignDSL into a canvas plan + the Resolve card spec + assumptions.
 * Linear journeys (sequence / fallback) are laid out top-to-bottom with stable
 * node ids; parallel / experiment shapes (M2) fall through to the same linear
 * layout for now.
 */
export function compile(dsl: CampaignDSL): CompileResult {
  const nodes: Node<WorkflowNodeData>[] = [startNode()];
  let y = Y_STEP;
  nodes.push(audienceNode(dsl, y));
  y += Y_STEP;

  for (const step of dsl.steps) {
    if (step.type === "whatsapp") nodes.push(whatsappNode(step.waTemplate.value, y));
    else if (step.type === "voice") nodes.push(voiceNode(step.voiceAgent.value, y));
    else if (step.type === "delay") nodes.push(delayNode(step.wait, y));
    y += Y_STEP;
  }
  nodes.push(endNode(y));

  const ids = nodes.map((n) => n.id);
  const edges: Edge[] = ids.slice(1).map((id, i) => ({ id: `e_${ids[i]}_${id}`, source: ids[i], target: id }));

  return {
    plan: { nodes, edges, name: dsl.name },
    needsInput: deriveNeedsInput(dsl),
    assumptions: deriveAssumptions(dsl),
  };
}

/* ---------------------------------------------------------------- */
/* applyResolved — fold Resolve-card answers back into the DSL      */
/* ---------------------------------------------------------------- */

/**
 * Patch a DSL with the values collected by the Resolve card (keyed by the
 * TemplateVar keys the compiler emitted). Each touched field flips to
 * `origin: "resolved"`. Node ids are untouched, so the next `compile` re-renders
 * the same graph with the chosen resources bound.
 */
export function applyResolved(dsl: CampaignDSL, resolved: Record<string, string>): CampaignDSL {
  const segment = resolved.segment
    ? { value: resolved.segment, origin: "resolved" as const, kind: "segment" as const }
    : dsl.audience.segment;

  const steps: Step[] = dsl.steps.map((step) => {
    if (step.type === "whatsapp" && resolved.waTemplate) {
      return { ...step, waTemplate: { value: resolved.waTemplate, origin: "resolved", kind: "waTemplate" } };
    }
    if (step.type === "voice" && resolved.voiceAgent) {
      return { ...step, voiceAgent: { value: resolved.voiceAgent, origin: "resolved", kind: "voiceAgent" } };
    }
    if (step.type === "delay" && resolved.fallbackWindow) {
      const { value, unit } = parseDuration(resolved.fallbackWindow);
      return { ...step, wait: { value, unit, origin: "resolved" } };
    }
    return step;
  });

  return { ...dsl, audience: { segment }, steps };
}
