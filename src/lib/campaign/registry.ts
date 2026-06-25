/**
 * Registry — the metadata-only lookups the agent is allowed to surface, plus the
 * `instantiateTemplate` bridge that turns an approved template into a zod-valid
 * {@link CampaignDSL}.
 *
 * These functions are the *only* source of selectable ids. The agent calls them
 * (as CopilotKit frontend actions); it never invents segment / template / agent
 * ids of its own. Everything returned here is metadata + ids — there is no PII in
 * the seed data (no phone numbers, no contact rows), so nothing sensitive is ever
 * handed to the model or placed in chat context.
 *
 * The seed data itself lives in {@link "@/lib/tenant-registry"}; this module is the
 * narrow, agent-facing projection of it.
 */
import {
  CAMPAIGN_TEMPLATES,
  SEGMENTS,
  WA_TEMPLATES,
  VOICE_AGENTS,
  parseDuration,
  type CampaignTemplate,
  type TemplateVar,
} from "@/lib/tenant-registry";
import {
  CampaignDSL,
  parseCampaignDSL,
  type Channel,
  type FieldOrigin,
  type ResolvableId,
  type Step,
} from "./campaign-dsl";

/* ---------------------------------------------------------------- */
/* Agent-facing metadata projections (ids + labels only, no PII)    */
/* ---------------------------------------------------------------- */

export type TemplateMeta = {
  id: string;
  name: string;
  tenant: string;
  objective: string;
  summary: string;
  channels: Channel[];
};
export type SegmentMeta = { id: string; label: string; size: string };
export type WaTemplateMeta = {
  id: string;
  label: string;
  category: "Marketing" | "Utility";
  status: "approved" | "pending_reapproval";
};
export type VoiceAgentMeta = { id: string; name: string; status: string };

/* ---------------------------------------------------------------- */
/* Lookups                                                          */
/* ---------------------------------------------------------------- */

const toTemplateMeta = (t: CampaignTemplate): TemplateMeta => ({
  id: t.id,
  name: t.name,
  tenant: t.tenant,
  objective: t.objective,
  summary: t.summary,
  channels: t.channels as Channel[],
});

/** All campaign templates, optionally ranked against a free-text goal. */
export function listTemplates(query?: string): TemplateMeta[] {
  const q = (query ?? "").toLowerCase().trim();
  if (!q) return CAMPAIGN_TEMPLATES.map(toTemplateMeta);
  const scored = CAMPAIGN_TEMPLATES.map((t) => {
    let score = 0;
    for (const k of t.keywords) if (q.includes(k)) score += 2;
    if (q.includes(t.name.toLowerCase())) score += 3;
    if (q.includes(t.id) || q.includes(t.id.replace(/_/g, " "))) score += 4;
    if (q.includes(t.tenant.toLowerCase())) score += 1;
    return { t, score };
  });
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return (hits.length ? hits.map((s) => s.t) : CAMPAIGN_TEMPLATES).map(toTemplateMeta);
}

export const findTemplate = (id: string): CampaignTemplate | undefined =>
  CAMPAIGN_TEMPLATES.find((t) => t.id === id);

/** Audience segments. */
export function listSegments(): SegmentMeta[] {
  return SEGMENTS.map((s) => ({ id: s.id, label: s.label, size: s.size }));
}

/** WhatsApp templates, including ones pending re-approval (selectable, flagged at validation). */
export function listWhatsAppTemplates(): WaTemplateMeta[] {
  return WA_TEMPLATES.map((t) => ({ id: t.id, label: t.label, category: t.category, status: t.status }));
}

/** Voice agents — live only (the agent must never bind a non-live agent). */
export function listVoiceAgents(): VoiceAgentMeta[] {
  return VOICE_AGENTS.filter((a) => a.status === "live").map((a) => ({ id: a.id, name: a.name, status: a.status }));
}

/* ---------------------------------------------------------------- */
/* instantiateTemplate — template → CampaignDSL                     */
/* ---------------------------------------------------------------- */

/** A required open variable becomes a `must-confirm` resolvable; everything else is a tenant default. */
const mustConfirm = (kind: ResolvableId["kind"]): ResolvableId => ({ value: "", origin: "must-confirm", kind });

/**
 * Build the journey steps for a template from its channels + declared duration var.
 * Today every template is a WhatsApp-primary → wait → Voice-fallback chain; the
 * shape is derived from `channels` order + whether a duration open var exists so
 * new templates don't need bespoke wiring.
 */
function stepsForTemplate(channels: Channel[], durationVar: Extract<TemplateVar, { kind: "duration" }> | undefined): {
  flow: CampaignDSL["flow"];
  steps: Step[];
} {
  const primary = channels[0];
  const fallback = channels[1];
  const channelStep = (ch: Channel): Step =>
    ch === "whatsapp"
      ? { type: "whatsapp", id: "wa", waTemplate: mustConfirm("waTemplate") }
      : { type: "voice", id: "voice", voiceAgent: mustConfirm("voiceAgent") };

  if (fallback && durationVar) {
    const { value, unit } = parseDuration(durationVar.default);
    const origin: FieldOrigin = durationVar.required ? "must-confirm" : "default";
    return {
      flow: "fallback",
      steps: [
        channelStep(primary),
        { type: "delay", id: "delay", wait: { value, unit, origin } },
        channelStep(fallback),
      ],
    };
  }
  return { flow: "sequence", steps: [channelStep(primary)] };
}

/**
 * Instantiate an approved template into a validated {@link CampaignDSL}: tenant
 * defaults are baked (origin `default`, surfaced as assumptions), and the
 * template's declared open variables become `must-confirm` fields that drive the
 * single Resolve card. Throws if the template id is unknown.
 */
export function instantiateTemplate(templateId: string): CampaignDSL {
  const tpl = findTemplate(templateId);
  if (!tpl) {
    throw new Error(`Unknown template id: ${templateId}`);
  }
  const channels = tpl.channels as Channel[];
  const durationVar = tpl.openVars.find(
    (v): v is Extract<TemplateVar, { kind: "duration" }> => v.kind === "duration",
  );
  const { flow, steps } = stepsForTemplate(channels, durationVar);

  const dsl: CampaignDSL = {
    version: 1,
    name: tpl.name,
    objective: tpl.objective,
    source: { kind: "template", templateId: tpl.id },
    tenant: tpl.tenant,
    audience: { segment: mustConfirm("segment") },
    flow,
    channels,
    steps,
    assumptions: tpl.assumptions.slice(),
  };

  // Validate on the way out — a malformed template can never reach the compiler.
  return parseCampaignDSL(dsl);
}
