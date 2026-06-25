/**
 * Campaign DSL — the typed, tenant-agnostic, ID-based intermediate representation
 * that sits between the agent / registry and the canvas compiler.
 *
 * The agent produces a CampaignDSL by **instantiating a template** (M1) or, later,
 * by **planning from a brief** (M2). It is always zod-validated on the way out of a
 * tool call, so the agent can never smuggle through a malformed shape or an
 * invented resource ID — every selectable value originates from a registry lookup.
 *
 * Every resolvable field carries a {@link FieldOrigin} so the UI can tell the user
 * exactly where a value came from:
 *  - `default`      — a tenant default was pre-filled (surfaced as an assumption, never asked).
 *  - `inferred`     — derived from the brief/template wording (mostly M2).
 *  - `must-confirm` — an open variable the user must resolve before saving (drives the Resolve card).
 *  - `resolved`     — the user picked a real registry ID via the Resolve card.
 *
 * Node ids are stable (`audience` / `wa` / `voice` / `delay`) so a later refinement
 * can patch a single node in place rather than rebuilding the graph.
 */
import { z } from "zod";

/* ---------------------------------------------------------------- */
/* Field provenance                                                 */
/* ---------------------------------------------------------------- */

export const FieldOrigin = z.enum(["default", "inferred", "must-confirm", "resolved"]);
export type FieldOrigin = z.infer<typeof FieldOrigin>;

/** The registry-backed resource kinds a resolvable id can bind to. */
export const ResolvableKind = z.enum(["segment", "waTemplate", "voiceAgent"]);
export type ResolvableKind = z.infer<typeof ResolvableKind>;

/**
 * A value that resolves to a real registry id. `value` is the registry id once
 * chosen, or `""` while it is still `must-confirm`. `kind` says which registry the
 * Resolve card binds the picker to (so only real/approved ids can be selected).
 */
export const ResolvableId = z.object({
  value: z.string(),
  origin: FieldOrigin,
  kind: ResolvableKind,
});
export type ResolvableId = z.infer<typeof ResolvableId>;

/** A duration (e.g. a fallback wait) with provenance. */
export const DurationValue = z.object({
  value: z.number().int().nonnegative(),
  unit: z.enum(["Minutes", "Hours", "Days"]),
  origin: FieldOrigin,
});
export type DurationValue = z.infer<typeof DurationValue>;

/* ---------------------------------------------------------------- */
/* Journey steps                                                    */
/* ---------------------------------------------------------------- */

/** WhatsApp send — bound to an approved WhatsApp template. */
export const WhatsAppStep = z.object({
  type: z.literal("whatsapp"),
  id: z.string(),
  waTemplate: ResolvableId,
});
export type WhatsAppStep = z.infer<typeof WhatsAppStep>;

/** AI voice call — bound to a live voice agent. */
export const VoiceStep = z.object({
  type: z.literal("voice"),
  id: z.string(),
  voiceAgent: ResolvableId,
});
export type VoiceStep = z.infer<typeof VoiceStep>;

/** A wait between two steps (the fallback window). */
export const DelayStep = z.object({
  type: z.literal("delay"),
  id: z.string(),
  wait: DurationValue,
});
export type DelayStep = z.infer<typeof DelayStep>;

export const Step = z.discriminatedUnion("type", [WhatsAppStep, VoiceStep, DelayStep]);
export type Step = z.infer<typeof Step>;

/* ---------------------------------------------------------------- */
/* Journey shape                                                    */
/* ---------------------------------------------------------------- */

/**
 * How the steps connect:
 *  - `sequence`   — single channel, no fallback.
 *  - `fallback`   — primary → wait → fallback on non-delivery.
 *  - `parallel`   — channels fan out from the audience (split rule applied later).
 *  - `experiment` — A/B split between channels.
 */
export const Flow = z.enum(["sequence", "fallback", "parallel", "experiment"]);
export type Flow = z.infer<typeof Flow>;

export const Channel = z.enum(["whatsapp", "voice"]);
export type Channel = z.infer<typeof Channel>;

/* ---------------------------------------------------------------- */
/* Campaign DSL                                                     */
/* ---------------------------------------------------------------- */

export const CampaignDSL = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  objective: z.string(),
  source: z.object({
    kind: z.enum(["template", "brief"]),
    templateId: z.string().optional(),
  }),
  tenant: z.string(),
  audience: z.object({ segment: ResolvableId }),
  flow: Flow,
  channels: z.array(Channel).min(1),
  steps: z.array(Step).min(1),
  /** Tenant defaults / inferred choices surfaced to the user, never asked. */
  assumptions: z.array(z.string()),
});
export type CampaignDSL = z.infer<typeof CampaignDSL>;

/* ---------------------------------------------------------------- */
/* Helpers                                                          */
/* ---------------------------------------------------------------- */

/** Parse + validate an unknown value (e.g. an agent tool result) into a CampaignDSL. */
export function parseCampaignDSL(value: unknown): CampaignDSL {
  return CampaignDSL.parse(value);
}

/** Safe variant — returns the zod result without throwing. */
export function safeParseCampaignDSL(value: unknown) {
  return CampaignDSL.safeParse(value);
}

/** Every resolvable id field in the DSL, in journey order (audience first). */
export function resolvableFields(dsl: CampaignDSL): { key: string; field: ResolvableId }[] {
  const out: { key: string; field: ResolvableId }[] = [{ key: "segment", field: dsl.audience.segment }];
  for (const step of dsl.steps) {
    if (step.type === "whatsapp") out.push({ key: "waTemplate", field: step.waTemplate });
    else if (step.type === "voice") out.push({ key: "voiceAgent", field: step.voiceAgent });
  }
  return out;
}

/** The duration step (fallback wait), if the journey declares one. */
export function delayStep(dsl: CampaignDSL): DelayStep | undefined {
  return dsl.steps.find((s): s is DelayStep => s.type === "delay");
}
