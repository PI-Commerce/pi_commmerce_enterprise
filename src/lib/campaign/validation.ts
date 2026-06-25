/**
 * Validation — the deterministic, never-LLM gate that decides whether a campaign
 * draft can be saved. It runs over a {@link CampaignDSL} and returns a granular
 * checklist plus an overall level:
 *  - `pass`  — green, ready to save.
 *  - `warn`  — savable as a draft but needs explicit acceptance at Confirm
 *              (e.g. a WhatsApp template pending re-approval).
 *  - `block` — must be fixed in the Resolve card before saving (e.g. no segment).
 *
 * The compliance rules themselves live in {@link "@/lib/tenant-registry"}'s
 * `runChecks` (audience, per-channel resource + opt-in, fallback timing, sending
 * window / DND, frequency cap) — the single source of truth. This module is the
 * thin adapter that projects a DSL into the inputs those checks expect, so the
 * agent path and any deterministic path validate identically.
 */
import {
  validateResolved,
  type Channel,
  type TemplateVar,
  type ValidationCheck,
  type ValidationLevel,
  type ValidationResult,
} from "@/lib/tenant-registry";
import { delayStep, type CampaignDSL } from "./campaign-dsl";

export type { ValidationCheck, ValidationLevel, ValidationResult };

/** Project the DSL's resolved values into the flat record the checks read. */
function resolvedFrom(dsl: CampaignDSL): Record<string, string> {
  const resolved: Record<string, string> = {};
  if (dsl.audience.segment.value) resolved.segment = dsl.audience.segment.value;
  for (const step of dsl.steps) {
    if (step.type === "whatsapp" && step.waTemplate.value) resolved.waTemplate = step.waTemplate.value;
    else if (step.type === "voice" && step.voiceAgent.value) resolved.voiceAgent = step.voiceAgent.value;
    else if (step.type === "delay") resolved.fallbackWindow = `${step.wait.value} ${step.wait.unit}`;
  }
  return resolved;
}

/** The check-driving var specs implied by the DSL's shape (currently the fallback wait). */
function varsFrom(dsl: CampaignDSL): TemplateVar[] {
  const vars: TemplateVar[] = [];
  const delay = delayStep(dsl);
  if (delay) {
    vars.push({
      key: "fallbackWindow", kind: "duration", label: "Fallback window",
      default: `${delay.wait.value} ${delay.wait.unit}`,
      required: delay.wait.origin === "must-confirm",
    });
  }
  return vars;
}

/** Validate a campaign DSL → granular checklist + gate level + warn/block messages. */
export function validate(dsl: CampaignDSL): ValidationResult {
  return validateResolved(varsFrom(dsl), resolvedFrom(dsl), dsl.channels as Channel[]);
}
