/**
 * useCampaignAgentActions — the CopilotKit frontend-action surface for the
 * template (A1) campaign-creation path.
 *
 * The LLM (Anthropic via the CopilotKit runtime) orchestrates campaign creation
 * by calling these actions; it never invents resource ids. The actions split
 * into two kinds:
 *
 *  - **Data / side-effect actions** (`handler`): registry lookups + the
 *    `instantiateCampaignTemplate` bridge (template → {@link CampaignDSL} →
 *    canvas) + deterministic `validateCampaign`. These return JSON the model
 *    reads; the instantiate/resolve handlers also push the compiled graph onto
 *    the canvas via the provided callbacks.
 *  - **HITL generative-UI cards** (`renderAndWaitForResponse`):
 *    `resolveCampaign` (the single Resolve card listing only the DSL's open
 *    variables, backed by registry pickers) and `confirmCampaign` (sample
 *    messages + assumptions + any carried warn). Each blocks the agent until the
 *    user submits, then `respond`s the outcome back to the model.
 *
 * The working draft lives in a ref so successive actions patch one DSL in place
 * (stable node ids), keeping the agent path and the canvas in lock-step. All
 * data here is metadata + ids only — no PII ever reaches the model.
 */
import { useEffect, useRef, useState } from "react";
import { useCopilotAction } from "@copilotkit/react-core";
import {
  Check,
  ChevronLeft,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  Sparkles,
  MessageSquare,
  Phone,
  LayoutTemplate,
  ArrowRight,
  Split,
  GitBranch,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  SEGMENTS, WA_TEMPLATES, VOICE_AGENTS, PHONE_ATTRIBUTES, CHANNEL_SAMPLE, CHANNEL_META,
  SPLIT_ATTRIBUTES, TENANT_DEFAULTS, DEFAULT_SEND_WINDOW,
  findSegment, findWaTemplate, findVoiceAgent, findSplitAttribute, phoneAttributeLabel,
  analyzeBrief, planFromBrief, channelsSummary,
  applyResolved as applyResolvedToPlan, applySplit, channelAbVariants,
  buildConditionalChannels, buildContentAbChannels, conditionFieldsFor, CHANNEL_NODE_ID,
  branchSeqToId, parseBranchSeq, routeSeqLabel, slugifyArm,
  splitFieldsFor, validateResolved, resolveFromText,
  conditionalArmSteps, conditionalArmRichSteps, abVariantPcts, durationLabel,
  type TemplateVar, type BriefConfig, type Channel, type BranchArm,
} from "@/lib/tenant-registry";
import type { AskPiPlan } from "./AskPiWizard";
import {
  listTemplates, listSegments, listWhatsAppTemplates, listVoiceAgents,
  instantiateTemplate, findTemplate, type TemplateMeta,
} from "@/lib/campaign/registry";
import { compile, applyResolved } from "@/lib/campaign/compiler";
import {
  validate,
  type ValidationResult,
  type ValidationLevel,
} from "@/lib/campaign/validation";
import type { CampaignDSL } from "@/lib/campaign/campaign-dsl";

/* ----------------------------------------------------------------- */
/* Hook                                                              */
/* ----------------------------------------------------------------- */

export type CampaignAgentCallbacks = {
  /** Render the dimmed "building" skeleton on the canvas (optional). */
  onSkeleton?: (skeleton: AskPiPlan) => void;
  /** Render the compiled draft graph on the canvas (real ids bound). */
  onBuild?: (plan: AskPiPlan) => void;
  /** Fires once the Confirm card saves a versioned draft (e.g. "v1"). */
  onSavedDraft?: (version: string) => void;
};

/**
 * Register the A1 template actions on the surrounding CopilotKit provider.
 * Must be called from a component mounted inside `<CopilotKit>` (i.e. the
 * AiComposer on /campaigns/new).
 */
export function useCampaignAgentActions(cb: CampaignAgentCallbacks) {
  // The single working draft. Successive actions patch this one DSL in place so
  // the canvas and the agent never diverge.
  const dslRef = useRef<CampaignDSL | null>(null);

  // The A2 brief path works on a raw AskPiPlan (not a DSL): a brief that names
  // 2+ channels with no fallback plans directly. These refs are the one working
  // plan + its config/gaps/resolved values, patched in place (stable node ids)
  // exactly like the template path patches one DSL.
  const briefTextRef = useRef<string>("");
  const cfgRef = useRef<BriefConfig | null>(null);
  const briefPlanRef = useRef<AskPiPlan | null>(null);
  const briefResolvedRef = useRef<Record<string, string>>({});
  const briefGapsRef = useRef<TemplateVar[]>([]);
  const briefAssumptionsRef = useRef<string[]>([]);
  const briefNameRef = useRef<string>("");

  // The Template card is shown EXACTLY ONCE per session — only when the user
  // first lands on Ask Pi. Set true the first time listCampaignTemplates renders
  // the tiles; any later call routes straight to the brief path instead of
  // re-showing the card (a typed description is a brief, not a re-pick).
  const templateCardShownRef = useRef(false);

  /** Re-apply the placement annotation (conditional / split / A-B) a fresh applyResolved wipes. */
  const annotatePlacement = (plan: AskPiPlan, cfg: BriefConfig, resolved: Record<string, string>): AskPiPlan => {
    // A conditional rebuilds the journey (topology depends on the Match/Else routing),
    // so it reads the resolved values directly rather than annotating in place.
    if (cfg.conditional) return buildConditionalChannels(plan.name, cfg, resolved);
    // An A/B test (content OR channel) rebuilds too — each variant's resource is
    // read from the resolved node-scoped keys (waTemplate@/voiceAgent@lin_ab0_<id>).
    if (cfg.contentAb) return buildContentAbChannels(plan.name, cfg, resolved);
    if (!cfg.fallback && cfg.channels.length > 1) {
      return applySplit(plan, resolved.splitAttribute ?? "", resolved.splitValue ?? resolved.splitThreshold ?? "", cfg.channels);
    }
    return plan;
  };

  /** The placement-specific open vars the validator scores alongside the channel gaps. */
  const placementVarsFor = (cfg: BriefConfig, resolved: Record<string, string>): TemplateVar[] => {
    // N-way categorical: per-arm routes live on the branch card (validated per arm
    // by runChecks 4d), so the only placement gap is the attribute picker — never
    // the binary `conditionValue`/`conditionThreshold`.
    if (cfg.conditional) return conditionFieldsFor(resolved.conditionAttribute, !!(cfg.branchArms && cfg.branchArms.length));
    // An A/B test's per-variant resource/traffic/flow gaps come from channelOpenVars
    // (node-scoped `…@lin_ab0_<id>`), already in briefGapsRef — no extra placement var.
    if (cfg.contentAb) return [];
    if (!cfg.fallback && cfg.channels.length > 1) return splitFieldsFor(resolved.splitAttribute);
    return [];
  };

  /**
   * A concrete placement assumption reflecting the *chosen* split / A-B values
   * (the default planFromBrief copy says "defaulted to 50/50" / "until you set a
   * split rule", which is stale once the user picks a placement). Mirrors the
   * phrasing the validator's split/experiment checks produce. Returns null when
   * nothing concrete has been chosen yet.
   */
  const placementAssumption = (cfg: BriefConfig, resolved: Record<string, string>): string | null => {
    const a = CHANNEL_META[cfg.channels[0]]?.label ?? "priority channel";
    const b = CHANNEL_META[cfg.channels[1]]?.label ?? "other channel";
    if (cfg.conditional) {
      const attr = findSplitAttribute(resolved.conditionAttribute);
      if (!attr) return null;
      // N-way categorical: one route per arm (e.g. "Silver → WhatsApp; Gold → …").
      if (cfg.branchArms && cfg.branchArms.length) {
        const parts = cfg.branchArms.map((arm) => {
          const route = resolved[`branchRoute@${arm.id}`] ?? branchSeqToId(arm.seq, "");
          return `${arm.label} → ${routeSeqLabel(route, "End")}`;
        });
        return `Conditional branch — route on ${attr.label}: ${parts.join("; ")}`;
      }
      const matchTo = routeSeqLabel(resolved.branchMatch, a);
      const elseTo = routeSeqLabel(resolved.branchElse, cfg.channels[1] ? b : "End");
      if (attr.type === "categorical") {
        return resolved.conditionValue ? `Conditional branch — ${attr.label} = ${resolved.conditionValue} → ${matchTo}; everyone else → ${elseTo}` : null;
      }
      return resolved.conditionThreshold ? `Conditional branch — ${attr.label} ≥ ${attr.unit ?? ""}${resolved.conditionThreshold} → ${matchTo}; below → ${elseTo}` : null;
    }
    if (cfg.contentAb) {
      const vs = cfg.contentAb.variants;
      const pcts = abVariantPcts(vs, resolved, "lin_ab0");
      const parts = vs.map((v, k) => `${pcts[k]}% → ${v.label}`);
      return `A/B test — ${parts.join("; ")} (random)`;
    }
    if (!cfg.fallback && cfg.channels.length > 1) {
      const attr = findSplitAttribute(resolved.splitAttribute);
      if (!attr) return null;
      if (attr.type === "categorical") {
        return resolved.splitValue ? `Audience split — ${attr.label} = ${resolved.splitValue} → ${a}; everyone else → ${b}` : null;
      }
      return resolved.splitThreshold ? `Audience split — ${attr.label} ≥ ${attr.unit ?? ""}${resolved.splitThreshold} → ${a}; below → ${b}` : null;
    }
    return null;
  };

  /**
   * Recompute the full brief-path assumptions from the *final* cfg + resolved
   * values. planFromBrief writes its placement / fallback-wait copy before the
   * user has chosen anything ("defaulted to 50/50", "until you set a split rule",
   * "Fallback wait defaulted to …"), and an edited Fallback window in the Resolve
   * card would otherwise be ignored — so we strip those defaults and prepend lines
   * that reflect the chosen values. Sending window + frequency cap carry through.
   */
  const assumptionsFor = (cfg: BriefConfig, resolved: Record<string, string>): string[] => {
    const base = planFromBrief(briefTextRef.current, cfg).assumptions.filter(
      (a) =>
        !/defaulted to a 50\/50 split|target the full segment until you set a split rule|Branch 1 defaults to|Fallback wait defaulted to|^Sending window |^Frequency cap /.test(a),
    );
    const lead: string[] = [];
    const placement = placementAssumption(cfg, resolved);
    if (placement) lead.push(placement);
    if (cfg.channels.some((c) => c === "whatsapp" || c === "voice")) {
      lead.push(`Contact number — reaching contacts on the ${phoneAttributeLabel(resolved.phoneField)} field`);
    }
    if (cfg.conditional) {
      // Per-node choices: each arm channel carries its own template/agent, with an
      // optional wait + disposition-gated follow-up between consecutive channels.
      for (const step of conditionalArmSteps(cfg)) {
        if (step.ch === "whatsapp") {
          const tpl = findWaTemplate(resolved[`waTemplate@${step.nodeId}`] ?? "");
          lead.push(`${step.armLabel} · ${step.serialLabel} — ${tpl?.label ?? "template not set"}`);
        } else {
          const agent = findVoiceAgent(resolved[`voiceAgent@${step.nodeId}`] ?? "");
          lead.push(`${step.armLabel} · ${step.serialLabel} — ${agent?.name ?? "agent not set"}`);
        }
        if (step.nextCh && step.nextNodeId) {
          const nextName = step.nextSerialLabel ?? CHANNEL_META[step.nextCh].label;
          const wait = durationLabel(
            resolved[`armDelay@${step.nodeId}>${step.nextNodeId}`] ?? cfg.fallbackWait ?? "1 hour",
          );
          lead.push(`${step.serialLabel} waits ${wait} before ${nextName}`);
          if (step.ch === "whatsapp") {
            const on = resolved[`followUpOn@${step.nodeId}`]?.trim() || "Failed";
            lead.push(`${step.serialLabel} follows up with ${nextName} when WhatsApp = ${on}`);
          }
        }
      }
      // Nested A/B splits carry their own per-variant traffic % + plain-English
      // "what happens next" flow (set on the Resolve card). Surface each so the
      // assumptions state exactly which flows emanate from the split node.
      for (const rich of conditionalArmRichSteps(cfg)) {
        if (rich.kind !== "abSplit") continue;
        const pcts = abVariantPcts(rich.variants, resolved, rich.nodeId);
        rich.variants.forEach((v, k) => {
          const pct = resolved[`splitPct@${rich.nodeId}_${v.id}`]?.trim() || String(pcts[k]);
          const flow = resolved[`abFlow@${rich.nodeId}_${v.id}`]?.trim() || v.flow || "flow not set";
          lead.push(`${rich.armLabel} · A/B ${v.label} — ${pct}% traffic → ${flow}`);
        });
      }
    } else if (cfg.fallback) {
      const wait = resolved.fallbackWindow?.trim() || cfg.fallbackWait;
      lead.push(`Fallback wait — waits ${wait} after non-delivery before the fallback`);
    }
    // The "when" — folded into the Resolve card, so reflect the resolved value (or
    // the tenant default it still carries) rather than the stale planFromBrief copy.
    const sendWindow = resolved.sendWindow?.trim() || DEFAULT_SEND_WINDOW;
    const freqCap = resolved.frequencyCap?.trim() || TENANT_DEFAULTS.freqCap;
    const start = resolved.startTiming?.trim() || "As soon as approved";
    const tail = [
      `Sending window — ${sendWindow} ${TENANT_DEFAULTS.timezone}`,
      `Frequency cap — ${freqCap} per contact`,
      `Start — ${start}`,
    ];
    return [...lead, ...base, ...tail];
  };

  /* -------- Data / lookup actions (the agent's only id source) -------- */

  useCopilotAction({
    name: "listCampaignTemplates",
    description:
      "Show the Template card: the approved campaign templates the tenant can start from, ranked against the user's stated goal. Renders a picker of template tiles and blocks until the user selects one. Call this first when the user wants to create a campaign from a template; pass their goal as `query` so the most relevant templates surface on top.",
    parameters: [
      { name: "query", type: "string", description: "The user's free-text campaign goal, used to rank templates by relevance.", required: false },
    ],
    renderAndWaitForResponse: ({ args, status, respond }) => (
      <TemplateGate
        query={args?.query}
        done={status === "complete"}
        respond={respond}
        shownRef={templateCardShownRef}
        onSelect={(id, name) =>
          respond?.(
            `User selected template "${id}" (${name}). Now call instantiateCampaignTemplate with templateId="${id}".`,
          )
        }
      />
    ),
  });

  useCopilotAction({
    name: "listSegments",
    description: "List selectable audience segments (id, label, size). Use to describe options; the Resolve card binds the actual picker.",
    parameters: [],
    handler: async () => listSegments(),
  });

  useCopilotAction({
    name: "listWhatsAppTemplates",
    description: "List approved WhatsApp templates (including any pending re-approval, which validation will flag as a warning). Returns ids + metadata only.",
    parameters: [],
    handler: async () => listWhatsAppTemplates(),
  });

  useCopilotAction({
    name: "listVoiceAgents",
    description: "List live voice agents bindable to a voice step. Returns ids + names only.",
    parameters: [],
    handler: async () => listVoiceAgents(),
  });

  /* -------- instantiateCampaignTemplate: template → DSL → canvas -------- */

  useCopilotAction({
    name: "instantiateCampaignTemplate",
    description:
      "Instantiate an approved template into a campaign draft: tenant defaults are pre-filled (surfaced as assumptions, never asked) and the draft graph is rendered on the canvas. Returns the still-open variables the user must resolve plus the baked assumptions. Call after the user picks a template id from listCampaignTemplates.",
    // Silent plumbing step — its result is the draft on the canvas, not a chat
    // bubble. Render nothing so the chat shows cards, never a raw tool-call chip.
    render: () => <></>,
    parameters: [
      { name: "templateId", type: "string", description: "The template id to instantiate (e.g. points_expiry_reminder_v3).", required: true },
    ],
    handler: async ({ templateId }) => {
      let dsl: CampaignDSL;
      try {
        dsl = instantiateTemplate(templateId);
      } catch {
        return { ok: false, error: `Unknown template id: ${templateId}. Call listCampaignTemplates for valid ids.` };
      }
      dslRef.current = dsl;
      const { plan, needsInput, assumptions } = compile(dsl);
      cb.onBuild?.(plan);
      return {
        ok: true,
        name: dsl.name,
        objective: dsl.objective,
        assumptions,
        needsInput: needsInput.map((v) => ({ key: v.key, label: v.label, kind: v.kind })),
        message:
          "Draft rendered on the canvas with tenant defaults pre-filled. Next, call resolveCampaign so the user can fill the open variables.",
      };
    },
  });

  /* -------- resolveCampaign: the single HITL Resolve card -------- */

  useCopilotAction({
    name: "resolveCampaign",
    description:
      "Show the single Resolve card listing ONLY the current draft's open variables (segment, approved WhatsApp template, voice agent, fallback window), each backed by a registry-bound picker. Blocks until the user submits. Call after instantiateCampaignTemplate.",
    parameters: [],
    renderAndWaitForResponse: ({ status, respond }) => {
      const dsl = dslRef.current;
      if (!dsl) {
        return (
          <GuardNote
            text="No draft yet — instantiate a template first."
            reply="There is no draft to resolve yet. First call listCampaignTemplates, then instantiateCampaignTemplate, before resolveCampaign."
            respond={respond}
          />
        );
      }
      const { needsInput } = compile(dsl);
      return (
        <ResolveCard
          vars={needsInput}
          done={status === "complete"}
          onSubmit={(resolved) => {
            const next = applyResolved(dsl, resolved);
            dslRef.current = next;
            cb.onBuild?.(compile(next).plan);
            respond?.(
              `User resolved: ${JSON.stringify(resolved)}. Now call validateCampaign before confirming.`,
            );
          }}
        />
      );
    },
  });

  /* -------- validateCampaign: deterministic gate (never the LLM) -------- */

  useCopilotAction({
    name: "validateCampaign",
    description:
      "Show the Validation card: run the deterministic compliance gate over the current draft and render the granular pass / warn / block checklist. The user resolves the card — on a block they fix it (re-opens resolveCampaign), on a warn they explicitly accept or fix, on a pass they continue. Blocks until the user chooses. The level is computed deterministically here, never by you; act only on the result returned. Call after resolveCampaign.",
    parameters: [],
    renderAndWaitForResponse: ({ status, respond }) => {
      const dsl = dslRef.current;
      if (!dsl) {
        return (
          <GuardNote
            text="No draft to validate — resolve the open variables first."
            reply="There is no draft to validate yet. First call instantiateCampaignTemplate and resolveCampaign before validateCampaign."
            respond={respond}
          />
        );
      }
      const result = validate(dsl);
      const warnText = result.checks
        .filter((c) => c.status === "warn")
        .map((c) => `${c.label}: ${c.detail}`)
        .join(" ");
      return (
        <ValidationCard
          result={result}
          done={status === "complete"}
          onContinue={(level) =>
            level === "warn"
              ? respond?.(
                  `User accepted the validation warning. Call confirmCampaign with warning="${warnText.replace(/"/g, "'")}".`,
                )
              : respond?.("Validation passed. Call confirmCampaign with no warning.")
          }
          onFix={() =>
            respond?.("User chose to fix the flagged checks. Call resolveCampaign again so they can adjust.")
          }
        />
      );
    },
  });

  /* -------- confirmCampaign: the HITL Confirm card -------- */

  useCopilotAction({
    name: "confirmCampaign",
    description:
      "Show the Confirm card: sample WhatsApp message + voice opener rendered from the bound template, the full assumptions list, and any carried validation warning the user must explicitly accept. On confirm, the draft is saved as a version (no launch). Call only after validateCampaign returns pass or warn.",
    parameters: [
      { name: "warning", type: "string", description: "Optional validation warning to surface for explicit acceptance (e.g. a WhatsApp template pending re-approval).", required: false },
    ],
    renderAndWaitForResponse: ({ args, status, respond }) => {
      const dsl = dslRef.current;
      if (!dsl) {
        return (
          <GuardNote
            text="No draft to confirm."
            reply="There is no draft to confirm yet. Build one first via instantiateCampaignTemplate → resolveCampaign → validateCampaign before confirmCampaign."
            respond={respond}
          />
        );
      }
      const { assumptions } = compile(dsl);
      return (
        <ConfirmCard
          dsl={dsl}
          assumptions={assumptions}
          warning={args?.warning}
          done={status === "complete"}
          onBack={() => respond?.("User chose to go back to the Resolve card. Call resolveCampaign again.")}
          onConfirm={() => {
            cb.onSavedDraft?.("v1");
            respond?.("User confirmed. Saved as draft v1. Do not launch.");
          }}
        />
      );
    },
  });

  /* ================================================================= */
  /* A2 — Brief path: plan directly from a free-text brief.            */
  /* A brief that names 2+ channels with NO fallback is planned here   */
  /* (not via a template); the agent then clarifies channel placement  */
  /* — split / parallel / A-B — in a dedicated card before resolving.  */
  /* ================================================================= */

  /* -------- planCampaignFromBrief: brief → plan → canvas -------- */

  useCopilotAction({
    name: "planCampaignFromBrief",
    description:
      "Plan a campaign directly from a free-text brief (no template). Detects the channels, lays the draft on the canvas, and surfaces the inferred objective + tenant-default assumptions. Returns `needsConditional: true` when the brief frames a conditional branch (route the audience Match / Else on an attribute) — resolve the audience via resolveBriefCampaign FIRST, then call setConditionalBranch to define the split. Returns `needsPlacement: true` when the brief names two or more channels with no fallback — call setChannelPlacement next so the user chooses how to place them (fallback / parallel split / A-B test). Otherwise go straight to resolveBriefCampaign. Use this ONLY for a descriptive brief; a named template still goes through listCampaignTemplates.",
    // Silent plumbing step — its result is the draft on the canvas, not a chat
    // bubble. Render nothing so the chat shows cards, never a raw tool-call chip.
    render: () => <></>,
    parameters: [
      { name: "brief", type: "string", description: "The user's free-text campaign description, verbatim.", required: true },
    ],
    handler: async ({ brief }) => {
      const text = brief ?? "";
      const cfg = analyzeBrief(text);
      briefTextRef.current = text;

      // The brief named no channel — capture channels (priority/fallback) via the
      // Channels card before drafting, rather than silently defaulting to WhatsApp.
      if (!cfg.channelsNamed) {
        cfgRef.current = cfg;
        return {
          ok: true,
          needsChannels: true,
          message:
            "The brief didn't name a channel. Call setCampaignChannels so the user picks the channel(s), priority and any fallback, then continue.",
        };
      }

      const bp = planFromBrief(text, cfg);
      cfgRef.current = cfg;
      briefPlanRef.current = bp.plan;
      briefResolvedRef.current = {};
      briefGapsRef.current = bp.gaps;
      briefAssumptionsRef.current = bp.assumptions;
      briefNameRef.current = bp.plan.name;
      cb.onBuild?.(bp.plan);

      const needsConditional = !!cfg.conditional;
      // A brief that already declared an A/B test built the split up front (its
      // per-variant resource gaps are on the Resolve card), so skip the placement
      // card — it only disambiguates 2+ channels with no fallback AND no A/B.
      const needsPlacement = !needsConditional && !cfg.contentAb && cfg.channels.length >= 2 && !cfg.fallback;
      // Explicit flag the LLM can check to know the design shape was already framed
      // by the brief (via A/B, conditional, or fallback), so the design question in
      // PATH B step 1c should be SKIPPED. Without this the LLM only sees the two
      // needs* flags and mistakenly asks "how should this be designed?" for a brief
      // that already said "A/B split, two channels".
      const designFramed = needsConditional || needsPlacement || !!cfg.contentAb || !!cfg.fallback;
      return {
        ok: true,
        name: bp.plan.name,
        objective: bp.objective,
        channels: cfg.channels.map((c) => CHANNEL_META[c].label),
        channelsLine: bp.channelsLine,
        assumptions: bp.assumptions,
        unavailable: cfg.unavailable ?? [],
        needsConditional,
        needsPlacement,
        designFramed,
        message: needsConditional
          ? "The brief frames a conditional branch on an audience attribute. Do NOT ask a design question. Call resolveBriefCampaign FIRST so the user picks the audience + resources, then setConditionalBranch to define the Branch 1 / Branch 2 split on that audience."
          : needsPlacement
            ? "Two channels with no fallback. Do NOT ask a design question — the placement card handles that. Call resolveBriefCampaign FIRST so the user picks the audience and each channel's resource, then setChannelPlacement to choose how the channels run on that audience (fallback / parallel split / A-B test)."
            : cfg.contentAb
              ? "The brief already declared an A/B split — an A/B Split node is drawn with per-variant resource gaps on the Resolve card. Do NOT ask a design question and do NOT call setChannelPlacement. Go straight to resolveBriefCampaign so the user names each variant's template and audience."
              : "Draft rendered on the canvas with no design ambiguity. Do NOT ask a design question. Call resolveBriefCampaign so the user fills the open variables.",
      };
    },
  });

  /* -------- setChannelPlacement: the separate placement Resolve card -------- */

  useCopilotAction({
    name: "setChannelPlacement",
    description:
      "Show the Channel-placement card when a brief names two or more channels with no fallback. The user chooses how the channels are placed: a fallback chain (one after the other on non-delivery), a parallel split (audience divided by an attribute), or an A-B test (random % split to compare them). Patches the canvas with the chosen shape. Blocks until the user submits. Call AFTER resolveBriefCampaign (so the audience is already chosen and the split attribute is meaningful), before validateBriefCampaign.",
    parameters: [],
    renderAndWaitForResponse: ({ status, respond }) => {
      const cfg = cfgRef.current;
      if (!cfg) {
        return (
          <GuardNote
            text="No brief yet — plan one first."
            reply="There is no brief to place channels for yet. Call planCampaignFromBrief first."
            respond={respond}
          />
        );
      }
      return (
        <ChannelPlacementCard
          cfg={cfg}
          done={status === "complete"}
          onSubmit={(payload) => {
            const channels = cfg.channels;
            let nextCfg: BriefConfig;
            const placement: Record<string, string> = {};

            if (payload.mode === "fallback") {
              const fb: Channel = payload.fallbackChannel ?? channels[1] ?? channels[0];
              const primary = channels.find((c) => c !== fb) ?? cfg.primary;
              nextCfg = { ...cfg, primary, fallback: fb, channels: [primary, fb], fallbackWait: payload.fallbackWait || cfg.fallbackWait, contentAb: undefined };
            } else if (payload.mode === "experiment") {
              // A/B test the channels → a channel A/B: one variant per channel, each
              // capturing its own resource + traffic % on the split's Resolve card.
              nextCfg = { ...cfg, fallback: null, contentAb: { ch: cfg.primary, variants: channelAbVariants(channels, payload.splitPct) } };
            } else {
              nextCfg = { ...cfg, fallback: null, contentAb: undefined };
              placement.splitAttribute = payload.splitAttribute ?? "";
              if (payload.splitValue) placement.splitValue = payload.splitValue;
              if (payload.splitThreshold) placement.splitThreshold = payload.splitThreshold;
            }

            const bp = planFromBrief(briefTextRef.current, nextCfg);
            briefResolvedRef.current = { ...briefResolvedRef.current, ...placement };
            // Placement runs AFTER resolveBriefCampaign, so re-apply the already
            // resolved values (segment, channel resources) onto the freshly built
            // plan before annotating the chosen split / A-B / fallback shape.
            const plan = annotatePlacement(
              applyResolvedToPlan(bp.plan, briefResolvedRef.current),
              nextCfg,
              briefResolvedRef.current,
            );

            cfgRef.current = nextCfg;
            briefPlanRef.current = plan;
            briefGapsRef.current = bp.gaps;
            // Reflect the chosen placement values (not planFromBrief's defaults).
            briefAssumptionsRef.current = assumptionsFor(nextCfg, briefResolvedRef.current);
            cb.onBuild?.(plan);

            respond?.(
              `User set channel placement: ${channelsSummary(nextCfg)}. Now call validateBriefCampaign before confirming.`,
            );
          }}
        />
      );
    },
  });

  /* -------- setConditionalBranch: the conditional-branch Resolve card -------- */

  useCopilotAction({
    name: "setConditionalBranch",
    description:
      "Show the Conditional-branch card when a brief frames a Branch 1 / Branch 2 split on an audience attribute. The user picks the attribute (and the value or threshold that defines Branch 1) and which channel each branch routes to (or End). Rebuilds the canvas as a branch node with Branch 1 / Branch 2 outputs. Blocks until the user submits. Call AFTER resolveBriefCampaign (so the audience is already chosen and the split attribute is meaningful), before validateBriefCampaign.",
    parameters: [],
    renderAndWaitForResponse: ({ status, respond }) => {
      const cfg = cfgRef.current;
      if (!cfg) {
        return (
          <GuardNote
            text="No brief yet — plan one first."
            reply="There is no brief to add a conditional branch to yet. Call planCampaignFromBrief first."
            respond={respond}
          />
        );
      }
      return (
        <ConditionalCard
          cfg={cfg}
          done={status === "complete"}
          onSubmit={(payload) => {
            // Each arm can run a channel *sequence* (e.g. WhatsApp → Voice); the
            // channels in play are the union of every arm's sequence, priority first.
            let nextCfg: BriefConfig;
            const placement: Record<string, string> = { conditionAttribute: payload.attribute };

            if (payload.arms) {
              // N-way categorical: one arm per attribute value. Slugged ids are the
              // canvas prefixes and the `branchRoute@<id>` keys the builder reads.
              const taken = new Set<string>();
              const branchArms: BranchArm[] = payload.arms.map((r) => {
                const id = slugifyArm(r.value, taken);
                placement[`branchRoute@${id}`] = r.route;
                return { id, label: r.value, value: r.value, seq: parseBranchSeq(r.route) ?? [] };
              });
              const used: Channel[] = [];
              for (const a of branchArms) for (const ch of a.seq) if (!used.includes(ch)) used.push(ch);
              const channels = used.length ? used : cfg.channels;
              const primary = channels[0];
              nextCfg = {
                ...cfg, conditional: true, contentAb: undefined, fallback: null, channels, primary,
                branchArms, branchMatchSeq: undefined, branchElseSeq: undefined,
                conditionAttribute: payload.attribute,
              };
            } else {
              const matchSeq = parseBranchSeq(payload.branchMatch) ?? [];
              const elseSeq = parseBranchSeq(payload.branchElse) ?? [];
              const used: Channel[] = [];
              for (const ch of [...matchSeq, ...elseSeq]) if (!used.includes(ch)) used.push(ch);
              const channels = used.length ? used : cfg.channels;
              const primary = channels[0];
              nextCfg = {
                ...cfg, conditional: true, contentAb: undefined, fallback: null, channels, primary,
                branchMatchSeq: matchSeq, branchElseSeq: elseSeq, branchArms: undefined,
              };
              if (payload.branchMatch) placement.branchMatch = payload.branchMatch;
              if (payload.branchElse) placement.branchElse = payload.branchElse;
              if (payload.value) placement.conditionValue = payload.value;
              if (payload.threshold) placement.conditionThreshold = payload.threshold;
            }

            const bp = planFromBrief(briefTextRef.current, nextCfg);
            const merged = { ...briefResolvedRef.current, ...placement };
            briefResolvedRef.current = merged;
            const plan = annotatePlacement(bp.plan, nextCfg, merged);

            cfgRef.current = nextCfg;
            briefPlanRef.current = plan;
            briefGapsRef.current = bp.gaps;
            briefAssumptionsRef.current = assumptionsFor(nextCfg, merged);
            cb.onBuild?.(plan);

            respond?.(
              `User set the conditional branch: ${channelsSummary(nextCfg)}. Now call validateBriefCampaign before confirming.`,
            );
          }}
        />
      );
    },
  });

  /* -------- resolveBriefCampaign: the single Resolve card (brief path) -------- */

  useCopilotAction({
    name: "resolveBriefCampaign",
    description:
      "Show the single Resolve card for a brief-planned campaign, listing ONLY its open variables (segment + each channel's resource + any fallback window + the sending window / frequency cap / start timing), each backed by a registry picker or default. Blocks until the user submits, then patches the canvas. Call after planCampaignFromBrief (and setChannelPlacement, if placement was needed). For a conditional brief, call this BEFORE setConditionalBranch so the audience is chosen first; this action then routes to setConditionalBranch.",
    parameters: [],
    renderAndWaitForResponse: ({ status, respond }) => {
      const plan = briefPlanRef.current;
      const cfg = cfgRef.current;
      if (!plan || !cfg) {
        return (
          <GuardNote
            text="No brief draft yet — plan one first."
            reply="There is no brief draft to resolve yet. Call planCampaignFromBrief first."
            respond={respond}
          />
        );
      }
      return (
        <ResolveCard
          vars={briefGapsRef.current}
          seed={briefResolvedRef.current}
          done={status === "complete"}
          onSubmit={(resolved) => {
            const merged = { ...briefResolvedRef.current, ...resolved };
            briefResolvedRef.current = merged;
            const patched = annotatePlacement(applyResolvedToPlan(plan, merged), cfg, merged);
            briefPlanRef.current = patched;
            cb.onBuild?.(patched);
            // Both splits are configured AFTER the audience is chosen here, so the
            // split attribute is meaningful: a conditional brief routes to
            // setConditionalBranch; a plain two-channel brief routes to
            // setChannelPlacement. Each fires once, until its placement is set.
            const needsBranch = cfg.conditional && !merged.conditionAttribute;
            const needsPlacement =
              !cfg.conditional &&
              cfg.channels.length >= 2 &&
              !cfg.fallback &&
              !merged.splitAttribute &&
              !merged.splitPct;
            respond?.(
              needsBranch
                ? `User resolved: ${JSON.stringify(resolved)}. Now call setConditionalBranch so they define the Branch 1 / Branch 2 split on the chosen audience.`
                : needsPlacement
                  ? `User resolved: ${JSON.stringify(resolved)}. Now call setChannelPlacement so they choose how the two channels run on the chosen audience.`
                  : `User resolved: ${JSON.stringify(resolved)}. Now call validateBriefCampaign before confirming.`,
            );
          }}
        />
      );
    },
  });

  /* -------- validateBriefCampaign: deterministic gate (brief path) -------- */

  useCopilotAction({
    name: "validateBriefCampaign",
    description:
      "Show the Validation card for a brief-planned campaign: run the deterministic compliance gate (audience, per-channel resource + compliance, placement split/A-B, sending window, frequency cap) and render the pass / warn / block checklist. On 'block' the user fixes it (re-opens resolveBriefCampaign); on 'warn' they explicitly accept; on 'pass' they continue. The level is computed here, never by you. Call after resolveBriefCampaign.",
    parameters: [],
    renderAndWaitForResponse: ({ status, respond }) => {
      const cfg = cfgRef.current;
      if (!cfg) {
        return (
          <GuardNote
            text="No brief draft to validate — resolve it first."
            reply="There is no brief draft to validate yet. Call planCampaignFromBrief and resolveBriefCampaign first."
            respond={respond}
          />
        );
      }
      const resolved = briefResolvedRef.current;
      const vars = [...briefGapsRef.current, ...placementVarsFor(cfg, resolved)];
      const result = validateResolved(vars, resolved, cfg.channels);
      const warnText = result.checks
        .filter((c) => c.status === "warn")
        .map((c) => `${c.label}: ${c.detail}`)
        .join(" ");
      return (
        <ValidationCard
          result={result}
          done={status === "complete"}
          onContinue={(level) =>
            level === "warn"
              ? respond?.(
                  `User accepted the validation warning. Call confirmBriefCampaign with warning="${warnText.replace(/"/g, "'")}".`,
                )
              : respond?.("Validation passed. Call confirmBriefCampaign with no warning.")
          }
          onFix={() =>
            respond?.("User chose to fix the flagged checks. Call resolveBriefCampaign again so they can adjust.")
          }
        />
      );
    },
  });

  /* -------- confirmBriefCampaign: the Confirm card (brief path) -------- */

  useCopilotAction({
    name: "confirmBriefCampaign",
    description:
      "Show the Confirm card for a brief-planned campaign: the channel-placement summary, a sample message per channel, the full assumptions list, and any carried validation warning the user must explicitly accept. On confirm, the draft is saved as a version (no launch). Call only after validateBriefCampaign returns pass or warn.",
    parameters: [
      { name: "warning", type: "string", description: "Optional validation warning to surface for explicit acceptance (e.g. a WhatsApp template pending re-approval).", required: false },
    ],
    renderAndWaitForResponse: ({ args, status, respond }) => {
      const cfg = cfgRef.current;
      if (!cfg) {
        return (
          <GuardNote
            text="No brief draft to confirm."
            reply="There is no brief draft to confirm yet. Build one via planCampaignFromBrief → resolveBriefCampaign → validateBriefCampaign first."
            respond={respond}
          />
        );
      }
      // Recompute from the final resolved values so a Fallback window edited in the
      // Resolve card (which never re-runs setChannelPlacement) isn't shown stale.
      const assumptions = assumptionsFor(cfg, briefResolvedRef.current);
      return (
        <BriefConfirmCard
          cfg={cfg}
          name={briefNameRef.current}
          summary={channelsSummary(cfg)}
          resolved={briefResolvedRef.current}
          assumptions={assumptions}
          warning={args?.warning}
          done={status === "complete"}
          onBack={() => respond?.("User chose to go back to the Resolve card. Call resolveBriefCampaign again.")}
          onConfirm={() => {
            cb.onSavedDraft?.("v1");
            respond?.("User confirmed. Saved as draft v1. Do not launch.");
          }}
        />
      );
    },
  });

  /* ================================================================= */
  /* Cross-cutting — the typed resolve loop.                           */
  /* The user may answer or edit ANY open variable by typing in chat   */
  /* instead of clicking a card; applyAnswers maps their text to real  */
  /* registry ids and patches whichever draft (DSL or plan) is live.   */
  /* ================================================================= */

  useCopilotAction({
    name: "applyAnswers",
    description:
      "Apply free-text answers the user TYPED in chat (instead of clicking a Resolve card) to the current draft's open variables. Maps the text to real registry ids deterministically — segment, WhatsApp template, voice agent, fallback wait, or split rule — patches the canvas in place, and returns what is still open plus the current assumptions. Call this whenever the user types values or edits while a draft is being resolved (either path). Read `ready`/`stillOpen`/`unmatched`: if `unmatched` is non-empty or `ready` is false, re-show the Resolve card (resolveCampaign / resolveBriefCampaign) for what's left; if `ready` is true, go to the validate step. Never invent ids — this action does the mapping.",
    parameters: [
      { name: "text", type: "string", description: "The user's verbatim message naming the value(s) to set or edit.", required: true },
    ],
    // Side-effect + JSON only; the canvas + the re-shown Resolve card are the UI.
    render: () => <></>,
    handler: async ({ text }) => {
      const message = text ?? "";

      // Template path — a DSL draft is live.
      if (dslRef.current) {
        const open = compile(dslRef.current).needsInput;
        const { values, unmatched } = resolveFromText(open, message);
        const next = applyResolved(dslRef.current, values);
        dslRef.current = next;
        const c = compile(next);
        cb.onBuild?.(c.plan);
        return {
          ok: true,
          applied: values,
          unmatched,
          stillOpen: c.needsInput.map((v) => ({ key: v.key, label: v.label })),
          assumptions: c.assumptions,
          ready: c.needsInput.length === 0,
          message:
            c.needsInput.length === 0
              ? "All open variables are set. Call validateCampaign next."
              : `Applied. Still open: ${c.needsInput.map((v) => v.label).join(", ")}. Re-show resolveCampaign for the rest, or ask the user.`,
        };
      }

      // Brief path — a plan draft is live.
      if (cfgRef.current && briefPlanRef.current) {
        const cfg = cfgRef.current;
        // Placement vars (channel split, conditional attribute/value/threshold, branch routing)
        // are owned by their dedicated cards. Once set there, keep them out of the free-text
        // matcher so an unrelated answer (e.g. a segment phrase containing "elite") can't
        // greedily re-match and overwrite them. Unset placement vars stay typeable.
        const placementOpen = placementVarsFor(cfg, briefResolvedRef.current).filter(
          (v) => !briefResolvedRef.current[v.key],
        );
        const open = [...briefGapsRef.current, ...placementOpen];
        const { values, unmatched } = resolveFromText(open, message);
        const merged = { ...briefResolvedRef.current, ...values };
        briefResolvedRef.current = merged;
        const patched = annotatePlacement(applyResolvedToPlan(briefPlanRef.current, merged), cfg, merged);
        briefPlanRef.current = patched;
        briefAssumptionsRef.current = assumptionsFor(cfg, merged);
        cb.onBuild?.(patched);
        const stillOpen = [...briefGapsRef.current, ...placementVarsFor(cfg, merged)].filter(
          (v) => v.required && !merged[v.key]?.trim(),
        );
        return {
          ok: true,
          applied: values,
          unmatched,
          stillOpen: stillOpen.map((v) => ({ key: v.key, label: v.label })),
          assumptions: briefAssumptionsRef.current,
          ready: stillOpen.length === 0,
          message:
            stillOpen.length === 0
              ? "All open variables are set. Call validateBriefCampaign next."
              : `Applied. Still open: ${stillOpen.map((v) => v.label).join(", ")}. Re-show resolveBriefCampaign for the rest, or ask the user.`,
        };
      }

      return {
        ok: false,
        message:
          "There is no draft to apply answers to yet. Plan one first (listCampaignTemplates → instantiateCampaignTemplate, or planCampaignFromBrief).",
      };
    },
  });

  /* -------- setCampaignChannels: capture channels when a brief names none -------- */

  useCopilotAction({
    name: "setCampaignChannels",
    description:
      "Show the Channels card when a brief names NO channel. The user picks the channel(s) this workspace supports (WhatsApp / Voice), the priority order, and any fallback + wait. Rebuilds the draft on the canvas. Blocks until the user submits. Call after planCampaignFromBrief returns needsChannels, before resolveBriefCampaign.",
    parameters: [],
    renderAndWaitForResponse: ({ status, respond }) => {
      if (!cfgRef.current) {
        return (
          <GuardNote
            text="No brief yet — plan one first."
            reply="There is no brief to set channels for yet. Call planCampaignFromBrief first."
            respond={respond}
          />
        );
      }
      return (
        <ChannelsCard
          done={status === "complete"}
          onSubmit={({ channels, primary, fallback, fallbackWait }) => {
            const base = analyzeBrief(briefTextRef.current);
            const nextCfg: BriefConfig = {
              ...base,
              channels,
              primary,
              fallback,
              fallbackWait: fallbackWait || base.fallbackWait,
              channelsNamed: true,
              // If the brief framed an A/B test but named no channel, re-key it to the
              // channels the user just picked: 2+ channels (no fallback) → a channel
              // A/B; otherwise keep the brief's original content variants.
              contentAb: base.contentAb
                ? (!fallback && channels.length >= 2
                    ? { ch: primary, variants: channelAbVariants(channels) }
                    : base.contentAb)
                : undefined,
            };
            const bp = planFromBrief(briefTextRef.current, nextCfg);
            cfgRef.current = nextCfg;
            briefPlanRef.current = bp.plan;
            briefGapsRef.current = bp.gaps;
            briefResolvedRef.current = {};
            briefAssumptionsRef.current = bp.assumptions;
            briefNameRef.current = bp.plan.name;
            cb.onBuild?.(bp.plan);

            // A conditional brief (a Match / Else split on an audience attribute)
            // is owned by resolveBriefCampaign → setConditionalBranch, never the
            // parallel placement card — even when the channels were named late
            // here rather than in the brief. A plain multi-channel brief resolves
            // the audience first too, then places the channels on it.
            const needsPlacement =
              !nextCfg.conditional && nextCfg.channels.length >= 2 && !nextCfg.fallback;
            respond?.(
              nextCfg.conditional
                ? `User set channels: ${channelsSummary(nextCfg)}. Call resolveBriefCampaign FIRST so they pick the audience, then setConditionalBranch to define the Branch 1 / Branch 2 split on it.`
                : needsPlacement
                  ? `User set channels: ${channelsSummary(nextCfg)}. Now call resolveBriefCampaign so they pick the audience and each channel's resource, then setChannelPlacement to place the channels on that audience.`
                  : `User set channels: ${channelsSummary(nextCfg)}. Now call resolveBriefCampaign so they fill the open variables.`,
            );
          }}
        />
      );
    },
  });
}

/* ----------------------------------------------------------------- */
/* Cards (generative UI rendered inside the CopilotKit chat)         */
/* ----------------------------------------------------------------- */

function CardNote({ tone, text }: { tone: "block" | "pass"; text: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-1.5 rounded-xl border px-3 py-2.5 text-[12.5px] leading-relaxed",
        tone === "block"
          ? "border-destructive/40 bg-destructive/[0.04] text-muted-foreground"
          : "border-success/40 bg-success/[0.05] text-foreground",
      )}
    >
      {tone === "block" ? (
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
      ) : (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
      )}
      <span>{text}</span>
    </div>
  );
}

/**
 * A dead-end branch inside a `renderAndWaitForResponse` action (e.g. the agent
 * called resolve/validate/confirm before a draft existed). It renders the note
 * AND — critically — sends a tool result back to the model exactly once, so the
 * tool call is answered. Without this, the unanswered tool call poisons the
 * CopilotKit thread ("Tool result is missing for tool call …") and every later
 * turn fails. The reply text also tells the agent how to self-correct.
 */
function GuardNote({
  text, reply, respond,
}: {
  text: string;
  reply: string;
  respond?: (msg: string) => void;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (!sent.current && respond) {
      sent.current = true;
      respond(reply);
    }
  }, [respond, reply]);
  return <CardNote tone="block" text={text} />;
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp", voice: "Voice", sms: "SMS", email: "Email",
};
const channelLabel = (c: string) => CHANNEL_LABEL[c] ?? c;

/**
 * Gates the Template card so it shows EXACTLY ONCE per session. The decision is
 * locked on this tool call's first render (status-driven re-renders of the same
 * card never flip it). On the first call it claims the session flag and shows
 * the tiles; on any later call — the user typed another description instead of
 * picking a tile — it renders nothing and routes the model to the brief path,
 * deterministically, regardless of what the model tried to do.
 */
function TemplateGate({
  query, done, respond, shownRef, onSelect,
}: {
  query?: string;
  done: boolean;
  respond?: (msg: string) => void;
  shownRef: { current: boolean };
  onSelect: (id: string, name: string) => void;
}) {
  const templates = listTemplates(query);
  const mode = useRef<null | "card" | "route" | "empty">(null);
  if (mode.current === null) {
    if (templates.length === 0) mode.current = "empty";
    else if (shownRef.current) mode.current = "route";
    else {
      mode.current = "card";
      shownRef.current = true;
    }
  }

  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || !respond) return;
    if (mode.current === "empty") {
      sent.current = true;
      respond("No campaign templates exist for this tenant. Tell the user there are no templates to start from.");
    } else if (mode.current === "route") {
      sent.current = true;
      respond(
        `The template card was already shown this session — do NOT show it again. Treat this message as a descriptive brief and call planCampaignFromBrief with brief="${query ?? ""}".`,
      );
    }
  }, [respond, query]);

  if (mode.current === "empty")
    return <CardNote tone="block" text="No campaign templates are available for this tenant." />;
  if (mode.current === "route") return <></>;
  return <TemplateCard templates={templates} done={done} onSelect={onSelect} />;
}

/** Template card — registry-ranked template tiles; selecting one drives instantiate. */
function TemplateCard({
  templates, done, onSelect,
}: {
  templates: TemplateMeta[];
  done: boolean;
  onSelect: (id: string, name: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  if (done || picked) {
    const p = templates.find((t) => t.id === picked);
    return <CardNote tone="pass" text={p ? `Starting from ${p.name}.` : "Building from your description instead."} />;
  }

  return (
    <div className="w-full max-w-[440px] space-y-3 rounded-2xl border border-border bg-card p-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ai">
        <LayoutTemplate className="h-3.5 w-3.5" /> Start from a template
      </p>
      <div className="space-y-2">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => { setPicked(t.id); onSelect(t.id, t.name); }}
            className="group flex w-full flex-col gap-1 rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-left transition-all hover:border-ai/50 hover:bg-secondary/60"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-foreground">{t.name}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-ai" />
            </span>
            <span className="text-[11px] leading-relaxed text-muted-foreground">{t.tenant} · {t.objective}</span>
            <span className="flex flex-wrap gap-1 pt-0.5">
              {t.channels.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-border bg-card px-1.5 py-px text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {channelLabel(c)}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Validation card — deterministic pass/warn/block checklist with accept-or-fix. */
function ValidationCard({
  result, done, onContinue, onFix,
}: {
  result: ValidationResult;
  done: boolean;
  onContinue: (level: ValidationLevel) => void;
  onFix: () => void;
}) {
  const [choice, setChoice] = useState<"continue" | "fix" | null>(null);

  if (done || choice) {
    const fixed = choice === "fix" || (choice === null && result.level === "block");
    return (
      <CardNote
        tone={fixed ? "block" : "pass"}
        text={
          fixed
            ? "Back to the Resolve card to fix the flagged checks."
            : result.level === "warn"
              ? "Warning accepted — continuing to confirm."
              : "All checks passed — continuing to confirm."
        }
      />
    );
  }

  const levelTone =
    result.level === "block" ? "destructive" : result.level === "warn" ? "warning" : "success";

  return (
    <div className="w-full max-w-[440px] space-y-3 rounded-2xl border border-border bg-card p-3.5">
      <p className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ai">
          <ShieldCheck className="h-3.5 w-3.5" /> Compliance check
        </span>
        <span
          className={cn(
            "rounded-full border px-1.5 py-px text-[9.5px] font-medium uppercase tracking-wide",
            levelTone === "destructive" && "border-destructive/40 bg-destructive/10 text-destructive",
            levelTone === "warning" && "border-warning/40 bg-warning/10 text-warning",
            levelTone === "success" && "border-success/40 bg-success/10 text-success",
          )}
        >
          {result.level}
        </span>
      </p>

      <div className="space-y-1.5">
        {result.checks.map((c) => (
          <div key={c.id} className="flex items-start gap-1.5">
            {c.status === "pass" ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            ) : c.status === "warn" ? (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            ) : (
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            )}
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-foreground">{c.label}</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{c.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 pt-0.5">
        {result.level === "block" && (
          <button
            onClick={() => { setChoice("fix"); onFix(); }}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Fix
          </button>
        )}
        {result.level !== "block" && (
          <button
            onClick={() => { setChoice("continue"); onContinue(result.level); }}
            className="rounded-lg bg-foreground px-3.5 py-1.5 text-[12.5px] font-medium text-background transition-all hover:scale-[1.02]"
          >
            {result.level === "warn" ? "Accept and continue" : "Continue"}
          </button>
        )}
      </div>
    </div>
  );
}

/** The Resolve card — open draft variables, registry-backed, walked one
 *  logical step at a time. Vars are partitioned by their `group` (Audience /
 *  Match arm / Else arm / Sending rules …) in first-appearance order; a single
 *  group degrades to the original one-shot capture. */
function ResolveCard({
  vars, done, onSubmit, seed: seeded,
}: {
  vars: TemplateVar[];
  done: boolean;
  onSubmit: (resolved: Record<string, string>) => void;
  /** Pre-fill already-known values (e.g. ones the user typed in chat). */
  seed?: Record<string, string>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const v of vars) {
      if ((v.kind === "duration" || v.kind === "window" || v.kind === "choice" || v.kind === "phoneField" || v.kind === "percent" || v.kind === "text") && v.default) {
        seed[v.key] = v.default;
      }
    }
    for (const v of vars) if (seeded?.[v.key]?.trim()) seed[v.key] = seeded[v.key];
    return seed;
  });
  const [submitted, setSubmitted] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  // Partition vars into ordered steps by `group` (first-appearance order).
  const steps: { label: string; vars: TemplateVar[] }[] = [];
  const stepOf = new Map<string, number>();
  for (const v of vars) {
    const g = v.group ?? "Resolve open variables";
    let i = stepOf.get(g);
    if (i === undefined) {
      i = steps.length;
      stepOf.set(g, i);
      steps.push({ label: g, vars: [] });
    }
    steps[i].vars.push(v);
  }
  const multiStep = steps.length > 1;
  const idx = Math.min(stepIdx, Math.max(0, steps.length - 1));
  const current = steps[idx] ?? { label: "Resolve open variables", vars };

  const missing = (vs: TemplateVar[]) => vs.filter((v) => v.required && !values[v.key]?.trim());
  const stepReady = missing(current.vars).length === 0;
  const allReady = missing(vars).length === 0;
  const isLast = idx >= steps.length - 1;

  if (done || submitted) {
    return (
      <CardNote
        tone="pass"
        text={`Resolved ${vars.length} ${vars.length === 1 ? "field" : "fields"}.`}
      />
    );
  }

  return (
    <div className="w-full max-w-[440px] space-y-3 rounded-2xl border border-border bg-card p-3.5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ai">
            <Sparkles className="h-3.5 w-3.5" /> {multiStep ? current.label : "Resolve open variables"}
          </p>
          {multiStep && (
            <span className="shrink-0 text-[10.5px] font-medium text-muted-foreground">
              Step {idx + 1} of {steps.length}
            </span>
          )}
        </div>
        {multiStep && (
          <div className="flex items-center gap-1">
            {steps.map((s, i) => (
              <div
                key={s.label}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i < idx ? "bg-ai/60" : i === idx ? "bg-ai" : "bg-muted",
                )}
              />
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2.5">
        {current.vars.map((v) => (
          <ResolveField
            key={v.key}
            v={v}
            value={values[v.key] ?? ""}
            onChange={(val) => setValues((prev) => ({ ...prev, [v.key]: val }))}
          />
        ))}
      </div>
      <div className="flex items-center justify-between pt-0.5">
        {multiStep && idx > 0 ? (
          <button
            onClick={() => setStepIdx(idx - 1)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
        ) : (
          <span />
        )}
        {multiStep && !isLast ? (
          <button
            disabled={!stepReady}
            onClick={() => setStepIdx(idx + 1)}
            className={cn(
              "flex items-center gap-1 rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-all",
              stepReady
                ? "bg-foreground text-background hover:scale-[1.02]"
                : "cursor-not-allowed bg-muted text-muted-foreground/60",
            )}
          >
            Next <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            disabled={!allReady}
            onClick={() => { setSubmitted(true); onSubmit(values); }}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-all",
              allReady
                ? "bg-foreground text-background hover:scale-[1.02]"
                : "cursor-not-allowed bg-muted text-muted-foreground/60",
            )}
          >
            Submit
          </button>
        )}
      </div>
    </div>
  );
}

/** Single Resolve-card field: registry-bound Select for ids, Input for durations. */
function ResolveField({
  v, value, onChange,
}: { v: TemplateVar; value: string; onChange: (val: string) => void }) {
  const liveAgents = VOICE_AGENTS.filter((a) => a.status === "live");
  const resourceEmpty =
    (v.kind === "waTemplate" && WA_TEMPLATES.length === 0) ||
    (v.kind === "voiceAgent" && liveAgents.length === 0);

  return (
    <div>
      <label className="mb-1 block text-[11.5px] font-medium text-foreground">
        {v.label}
        {v.required && <span className="ml-1 text-warning">*</span>}
      </label>

      {resourceEmpty ? (
        <div className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/[0.04] px-2.5 py-2">
          <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            No {v.kind === "waTemplate" ? "approved WhatsApp templates" : "live voice agents"} are available — set one up before this channel can run.
          </p>
        </div>
      ) : v.kind === "duration" ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={v.default}
          className="h-8 text-[12.5px]"
        />
      ) : v.kind === "window" ? (
        (() => {
          const [start, end] = value.split(/[–-]/).map((s) => s.trim());
          const set = (s: string, e: string) => onChange(`${s || "00:00"}–${e || "00:00"}`);
          return (
            <div className="flex items-center gap-1.5">
              <input
                type="time"
                value={start ?? ""}
                onChange={(e) => set(e.target.value, end ?? "")}
                className="h-8 flex-1 rounded-md border border-border bg-transparent px-2 text-[12.5px]"
              />
              <span className="text-[11.5px] text-muted-foreground">to</span>
              <input
                type="time"
                value={end ?? ""}
                onChange={(e) => set(start ?? "", e.target.value)}
                className="h-8 flex-1 rounded-md border border-border bg-transparent px-2 text-[12.5px]"
              />
            </div>
          );
        })()
      ) : v.kind === "choice" ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-[12.5px]">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {v.options.map((o) => (
              <SelectItem key={o} value={o} className="text-[12.5px]">{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : v.kind === "phoneField" ? (
        <Select value={value || v.default} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-[12.5px]">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          {/* The phone field is always the last row on the Audience step, so its
              popover would open below the Next button (or off the bottom of the
              bottom-anchored composer panel) and be invisible. Force it upward. */}
          <SelectContent position="popper" side="top" sideOffset={6} align="start">
            {PHONE_ATTRIBUTES.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-[12.5px]">
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3 text-muted-foreground" /> {p.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : v.kind === "percent" ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={1}
            max={99}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={v.default}
            className="h-8 w-20 text-[12.5px]"
          />
          <span className="text-[11.5px] text-muted-foreground">% of traffic</span>
        </div>
      ) : v.kind === "text" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={v.placeholder ?? v.default}
          rows={2}
          className="w-full resize-none rounded-md border border-border bg-transparent px-2.5 py-1.5 text-[12.5px] leading-relaxed"
        />
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-[12.5px]">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {v.kind === "segment" && SEGMENTS.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-[12.5px]">
                {s.label} · {s.size}
              </SelectItem>
            ))}
            {v.kind === "waTemplate" && WA_TEMPLATES.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-[12.5px]">
                <span className="flex items-center gap-1.5">
                  {t.label}
                  {t.status === "pending_reapproval" && (
                    <span className="inline-flex items-center gap-0.5 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-px text-[9.5px] font-medium text-warning">
                      <AlertTriangle className="h-2.5 w-2.5" /> pending
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
            {v.kind === "voiceAgent" && liveAgents.map((a) => (
              <SelectItem key={a.id} value={a.id} className="text-[12.5px]">
                {a.name} · {a.type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/** Confirm card — sample messages + assumptions + optional warn, save as draft. */
function ConfirmCard({
  dsl, assumptions, warning, done, onBack, onConfirm,
}: {
  dsl: CampaignDSL;
  assumptions: string[];
  warning?: string;
  done: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [choice, setChoice] = useState<"confirmed" | "back" | null>(null);

  const tpl = dsl.source.templateId ? findTemplate(dsl.source.templateId) : undefined;
  const seg = findSegment(dsl.audience.segment.value);
  const waStep = dsl.steps.find((s) => s.type === "whatsapp");
  const voiceStep = dsl.steps.find((s) => s.type === "voice");
  const wa = waStep?.type === "whatsapp" ? findWaTemplate(waStep.waTemplate.value) : undefined;
  const agent = voiceStep?.type === "voice" ? findVoiceAgent(voiceStep.voiceAgent.value) : undefined;

  const waSample = tpl?.samples?.whatsapp ?? CHANNEL_SAMPLE.whatsapp;
  const voiceSample = tpl?.samples?.voice ?? CHANNEL_SAMPLE.voice;

  if (done || choice) {
    return (
      <CardNote
        tone={choice === "back" ? "block" : "pass"}
        text={choice === "back" ? "Back to the Resolve card." : "Saved as draft v1 — review on canvas, launch separately."}
      />
    );
  }

  return (
    <div className="w-full max-w-[440px] space-y-3 rounded-2xl border border-border bg-card p-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ai">
        <ShieldCheck className="h-3.5 w-3.5" /> Confirm draft
      </p>

      <div className="space-y-1 text-[12.5px]">
        <p className="font-medium text-foreground">{dsl.name}</p>
        {seg && <p className="text-muted-foreground">Audience · {seg.label} ({seg.size})</p>}
      </div>

      {/* Sample messages */}
      <div className="space-y-2">
        {wa && (
          <SamplePreview
            icon={<MessageSquare className="h-3.5 w-3.5 text-ai" />}
            title={`WhatsApp · ${wa.label}`}
            body={waSample}
          />
        )}
        {agent && (
          <SamplePreview
            icon={<Phone className="h-3.5 w-3.5 text-ai" />}
            title={`Voice · ${agent.name}`}
            body={voiceSample}
          />
        )}
      </div>

      {/* Assumptions */}
      {assumptions.length > 0 && (
        <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Assumptions</p>
          <ul className="space-y-0.5">
            {assumptions.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" /> {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Carried warning — explicit acceptance */}
      {warning && (
        <div className="flex items-start gap-1.5 rounded-xl border border-warning/40 bg-warning/[0.06] px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="text-[11.5px] leading-relaxed text-foreground">{warning}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <button
          onClick={() => { setChoice("back"); onBack(); }}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <button
          onClick={() => { setChoice("confirmed"); onConfirm(); }}
          className="rounded-lg bg-foreground px-3.5 py-1.5 text-[12.5px] font-medium text-background transition-all hover:scale-[1.02]"
        >
          {warning ? "Accept and confirm" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

function SamplePreview({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2">
      <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon} {title}
      </p>
      <p className="text-[12px] leading-relaxed text-foreground">{body}</p>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Brief-path cards (A2)                                             */
/* ----------------------------------------------------------------- */

type PlacementMode = "fallback" | "parallel" | "experiment";
type PlacementPayload = {
  mode: PlacementMode;
  fallbackChannel?: Channel;
  fallbackWait?: string;
  splitAttribute?: string;
  splitValue?: string;
  splitThreshold?: string;
  splitPct?: string;
};

const PLACEMENT_MODES: { id: PlacementMode; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "fallback", label: "Fallback", hint: "One after the other on non-delivery", icon: <GitBranch className="h-3.5 w-3.5" /> },
  { id: "parallel", label: "Parallel split", hint: "Audience divided by an attribute", icon: <Split className="h-3.5 w-3.5" /> },
  { id: "experiment", label: "A/B test", hint: "Random % split to compare them", icon: <FlaskConical className="h-3.5 w-3.5" /> },
];

/**
 * Channels card — shown when a brief names NO channel. The user picks the
 * supported channel(s) (WhatsApp / Voice), the priority order, and any fallback
 * + wait. Submitting rebuilds the draft; the agent then routes to placement (two
 * channels, no fallback) or straight to resolving the open variables.
 */
function ChannelsCard({
  done, onSubmit,
}: {
  done: boolean;
  onSubmit: (payload: { channels: Channel[]; primary: Channel; fallback: Channel | null; fallbackWait: string }) => void;
}) {
  const all: Channel[] = ["whatsapp", "voice"];
  const [selected, setSelected] = useState<Channel[]>(["whatsapp"]);
  const [primary, setPrimary] = useState<Channel>("whatsapp");
  const [useFallback, setUseFallback] = useState(false);
  const [fallbackWait, setFallbackWait] = useState("1 day");
  const [submitted, setSubmitted] = useState(false);

  const two = selected.length === 2;
  const ready = selected.length >= 1;

  const toggle = (c: Channel) =>
    setSelected((prev) => {
      const next = prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c];
      if (next.length && !next.includes(primary)) setPrimary(next[0]);
      if (next.length < 2) setUseFallback(false);
      return next;
    });

  if (done || submitted) return <CardNote tone="pass" text="Channels set." />;

  const submit = () => {
    setSubmitted(true);
    const other = selected.find((c) => c !== primary) ?? null;
    const fallback = two && useFallback ? other : null;
    const channels = fallback ? [primary, fallback] : [primary, ...selected.filter((c) => c !== primary)];
    onSubmit({ channels, primary, fallback, fallbackWait });
  };

  return (
    <div className="w-full max-w-[440px] space-y-3 rounded-2xl border border-border bg-card p-3.5">
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ai">
          <Sparkles className="h-3.5 w-3.5" /> Which channels?
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
          The brief didn't name a channel — pick the one(s) to use and how they run.
        </p>
      </div>

      <div className="space-y-1.5">
        {all.map((c) => {
          const on = selected.includes(c);
          return (
            <button
              key={c}
              onClick={() => toggle(c)}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all",
                on ? "border-ai/60 bg-ai/[0.06]" : "border-border bg-secondary/30 hover:border-ai/40",
              )}
            >
              <span className={cn("shrink-0", on ? "text-ai" : "text-muted-foreground")}>
                {c === "whatsapp" ? <MessageSquare className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
              </span>
              <span className="text-[12.5px] font-medium text-foreground">{CHANNEL_META[c].label}</span>
              {on && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-ai" />}
            </button>
          );
        })}
      </div>

      {two && (
        <div className="space-y-2.5 border-t border-border pt-3">
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-foreground">Priority channel</label>
            <Select value={primary} onValueChange={(v) => setPrimary(v as Channel)}>
              <SelectTrigger className="h-8 text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {selected.map((c) => (
                  <SelectItem key={c} value={c} className="text-[12.5px]">{CHANNEL_META[c].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-foreground">
            <input
              type="checkbox"
              checked={useFallback}
              onChange={(e) => setUseFallback(e.target.checked)}
              className="h-3.5 w-3.5 accent-ai"
            />
            Use the other channel as a fallback on non-delivery
          </label>
          {useFallback && (
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-foreground">Fallback wait</label>
              <Input value={fallbackWait} onChange={(e) => setFallbackWait(e.target.value)} placeholder="1 day" className="h-8 text-[12.5px]" />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end pt-0.5">
        <button
          disabled={!ready}
          onClick={submit}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-all",
            ready ? "bg-foreground text-background hover:scale-[1.02]" : "cursor-not-allowed bg-muted text-muted-foreground/60",
          )}
        >
          Set channels
        </button>
      </div>
    </div>
  );
}

/**
 * Channel-placement card — the SEPARATE Resolve card the agent shows when a brief
 * names 2+ channels with no fallback. The user picks how the channels are placed
 * (fallback chain / parallel split / A-B test) plus the mode's parameters, and the
 * canvas is patched to that shape before the open variables are resolved.
 */
function ChannelPlacementCard({
  cfg, done, onSubmit,
}: {
  cfg: BriefConfig;
  done: boolean;
  onSubmit: (payload: PlacementPayload) => void;
}) {
  const channels = cfg.channels;
  const [mode, setMode] = useState<PlacementMode>(cfg.contentAb ? "experiment" : "parallel");
  const [fallbackChannel, setFallbackChannel] = useState<Channel>(channels[1] ?? channels[0]);
  const [fallbackWait, setFallbackWait] = useState<string>(cfg.fallbackWait);
  const [splitAttribute, setSplitAttribute] = useState<string>("");
  const [splitValue, setSplitValue] = useState<string>("");
  const [splitThreshold, setSplitThreshold] = useState<string>("");
  const [splitPct, setSplitPct] = useState<string>("50");
  const [submitted, setSubmitted] = useState(false);

  const attr = findSplitAttribute(splitAttribute);
  const pctNum = Number(splitPct);

  const ready =
    mode === "fallback"
      ? !!fallbackChannel
      : mode === "experiment"
        ? !Number.isNaN(pctNum) && pctNum >= 1 && pctNum <= 99
        : !!attr && (attr.type === "categorical" ? !!splitValue : !!splitThreshold.trim());

  if (done || submitted) {
    const label = PLACEMENT_MODES.find((m) => m.id === mode)?.label ?? "Placement";
    return <CardNote tone="pass" text={`Channel placement set — ${label}.`} />;
  }

  const submit = () => {
    setSubmitted(true);
    onSubmit({
      mode,
      ...(mode === "fallback" ? { fallbackChannel, fallbackWait } : {}),
      ...(mode === "experiment" ? { splitPct } : {}),
      ...(mode === "parallel"
        ? { splitAttribute, ...(attr?.type === "categorical" ? { splitValue } : { splitThreshold }) }
        : {}),
    });
  };

  return (
    <div className="w-full max-w-[440px] space-y-3 rounded-2xl border border-border bg-card p-3.5">
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ai">
          <Split className="h-3.5 w-3.5" /> Place the channels
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
          {channels.map((c) => CHANNEL_META[c].label).join(" & ")} were called out with no fallback — choose how they run.
        </p>
      </div>

      {/* Mode picker */}
      <div className="space-y-1.5">
        {PLACEMENT_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all",
              mode === m.id ? "border-ai/60 bg-ai/[0.06]" : "border-border bg-secondary/30 hover:border-ai/40",
            )}
          >
            <span className={cn("shrink-0", mode === m.id ? "text-ai" : "text-muted-foreground")}>{m.icon}</span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-foreground">{m.label}</span>
              <span className="block text-[11px] leading-snug text-muted-foreground">{m.hint}</span>
            </span>
            {mode === m.id && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-ai" />}
          </button>
        ))}
      </div>

      {/* Mode-specific fields */}
      <div className="space-y-2.5 border-t border-border pt-3">
        {mode === "fallback" && (
          <>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-foreground">Fallback channel</label>
              <Select value={fallbackChannel} onValueChange={(v) => setFallbackChannel(v as Channel)}>
                <SelectTrigger className="h-8 text-[12.5px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {channels.map((c) => (
                    <SelectItem key={c} value={c} className="text-[12.5px]">{CHANNEL_META[c].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-foreground">Fallback wait</label>
              <Input value={fallbackWait} onChange={(e) => setFallbackWait(e.target.value)} placeholder="1 day" className="h-8 text-[12.5px]" />
            </div>
          </>
        )}

        {mode === "parallel" && (
          <>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-foreground">
                Split audience by <span className="text-warning">*</span>
              </label>
              <Select value={splitAttribute} onValueChange={(v) => { setSplitAttribute(v); setSplitValue(""); setSplitThreshold(""); }}>
                <SelectTrigger className="h-8 text-[12.5px]"><SelectValue placeholder="Select attribute…" /></SelectTrigger>
                <SelectContent>
                  {SPLIT_ATTRIBUTES.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-[12.5px]">
                      {a.label}{a.unit ? ` · ${a.unit}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {attr && attr.type === "categorical" && (
              <div>
                <label className="mb-1 block text-[11.5px] font-medium text-foreground">
                  {attr.label} to the priority channel ({CHANNEL_META[channels[0]].label}) <span className="text-warning">*</span>
                </label>
                <Select value={splitValue} onValueChange={setSplitValue}>
                  <SelectTrigger className="h-8 text-[12.5px]"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(attr.options ?? []).map((o) => (
                      <SelectItem key={o} value={o} className="text-[12.5px]">{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {attr && attr.type === "numeric" && (
              <div>
                <label className="mb-1 block text-[11.5px] font-medium text-foreground">
                  Threshold — ≥ goes to {CHANNEL_META[channels[0]].label} <span className="text-warning">*</span>
                </label>
                <Input
                  value={splitThreshold}
                  onChange={(e) => setSplitThreshold(e.target.value)}
                  placeholder={`e.g. ${attr.example}${attr.unit ? ` ${attr.unit}` : ""}`}
                  className="h-8 text-[12.5px]"
                />
              </div>
            )}
          </>
        )}

        {mode === "experiment" && (
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-foreground">
              % to the priority channel ({CHANNEL_META[channels[0]].label}) <span className="text-warning">*</span>
            </label>
            <Input value={splitPct} onChange={(e) => setSplitPct(e.target.value)} placeholder="50" className="h-8 text-[12.5px]" />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {!Number.isNaN(pctNum) && pctNum >= 1 && pctNum <= 99
                ? `${pctNum}% ${CHANNEL_META[channels[0]].label} · ${100 - pctNum}% ${CHANNEL_META[channels[1]].label}`
                : "1–99 so both arms get traffic."}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end pt-0.5">
        <button
          disabled={!ready}
          onClick={submit}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-all",
            ready ? "bg-foreground text-background hover:scale-[1.02]" : "cursor-not-allowed bg-muted text-muted-foreground/60",
          )}
        >
          Apply placement
        </button>
      </div>
    </div>
  );
}

type ConditionalPayload = {
  attribute: string;
  value?: string;
  threshold?: string;
  /** Binary numeric path only. */
  branchMatch?: string;
  branchElse?: string;
  /** N-way categorical path: one route per attribute value (drives `branchArms`). */
  arms?: { value: string; route: string }[];
};

/**
 * Conditional-branch card — the Resolve card the agent shows when a brief frames
 * a Match / Else split on an audience attribute ("if VIP send a call, else
 * WhatsApp"). The user picks the attribute (+ value or threshold defining the
 * Match branch) and which channel each branch routes to (or End). Submitting
 * rebuilds the canvas as a branch node with Match / Else outputs before the open
 * variables are resolved.
 */
function ConditionalCard({
  cfg, done, onSubmit,
}: {
  cfg: BriefConfig;
  done: boolean;
  onSubmit: (payload: ConditionalPayload) => void;
}) {
  // Branch targets: a single channel, an ordered two-channel sequence
  // (e.g. WhatsApp → Voice), or End (drop the branch). Sequence routes let one
  // arm chain channels — "WhatsApp followed by Voice for low-LTV customers".
  const supported = ["whatsapp", "voice"] as Channel[];
  const channelOpts: { id: string; label: string }[] = [
    ...supported.map((c) => ({ id: CHANNEL_NODE_ID[c], label: CHANNEL_META[c].label })),
    { id: `${CHANNEL_NODE_ID.whatsapp}>${CHANNEL_NODE_ID.voice}`, label: `${CHANNEL_META.whatsapp.label} → ${CHANNEL_META.voice.label}` },
    { id: `${CHANNEL_NODE_ID.voice}>${CHANNEL_NODE_ID.whatsapp}`, label: `${CHANNEL_META.voice.label} → ${CHANNEL_META.whatsapp.label}` },
    { id: "end", label: "End (no message)" },
  ];
  const otherCh = cfg.channels.find((c) => c !== cfg.primary);
  const defaultMatch = branchSeqToId(cfg.branchMatchSeq, CHANNEL_NODE_ID[cfg.primary]);
  const defaultElse = branchSeqToId(cfg.branchElseSeq, otherCh ? CHANNEL_NODE_ID[otherCh] : "end");

  // Seed from the analyzed attribute so the picker opens on the detected branch
  // (e.g. "Call outcome") instead of blank. A blank picker invites choosing a
  // different attribute, which rebuilds the branch on the wrong option set.
  const [attribute, setAttribute] = useState<string>(cfg.conditionAttribute ?? "");
  const [value, setValue] = useState<string>("");
  const [threshold, setThreshold] = useState<string>("");
  const [branchMatch, setBranchMatch] = useState<string>(defaultMatch);
  const [branchElse, setBranchElse] = useState<string>(defaultElse);
  // N-way categorical routing: one route per attribute value. Lazily defaulted by
  // `routeFor` so picking an attribute doesn't need an effect to seed the map.
  const [armRoutes, setArmRoutes] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const attr = findSplitAttribute(attribute);
  const isCategorical = attr?.type === "categorical";
  const catOptions = isCategorical ? attr?.options ?? [] : [];
  // Default an arm's route from a matching `cfg.branchArms` seq (when re-opening a
  // built categorical branch), else the primary channel.
  const armDefault = (opt: string) =>
    branchSeqToId(cfg.branchArms?.find((a) => a.value === opt)?.seq, CHANNEL_NODE_ID[cfg.primary]);
  const routeFor = (opt: string) => armRoutes[opt] ?? armDefault(opt);

  const ready = isCategorical
    ? !!attr && catOptions.length > 0 && catOptions.every((o) => !!routeFor(o))
    : !!attr && !!threshold.trim() && !!branchMatch && !!branchElse && branchMatch !== branchElse;

  if (done || submitted) return <CardNote tone="pass" text="Conditional branch set." />;

  const submit = () => {
    setSubmitted(true);
    if (isCategorical) {
      onSubmit({ attribute, arms: catOptions.map((o) => ({ value: o, route: routeFor(o) })) });
    } else {
      onSubmit({ attribute, threshold, branchMatch, branchElse });
    }
  };

  return (
    <div className="w-full max-w-[440px] space-y-3 rounded-2xl border border-border bg-card p-3.5">
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ai">
          <GitBranch className="h-3.5 w-3.5" /> Conditional branch
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
          {isCategorical
            ? "Route the audience into one arm per attribute value — set where each value goes."
            : "Route the audience down a Branch 1 / Branch 2 split on an attribute — set the rule and where each branch goes."}
        </p>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="mb-1 block text-[11.5px] font-medium text-foreground">
            Branch audience by <span className="text-warning">*</span>
          </label>
          <Select value={attribute} onValueChange={(v) => { setAttribute(v); setValue(""); setThreshold(""); setArmRoutes({}); }}>
            <SelectTrigger className="h-8 text-[12.5px]"><SelectValue placeholder="Select attribute…" /></SelectTrigger>
            <SelectContent>
              {SPLIT_ATTRIBUTES.map((a) => (
                <SelectItem key={a.id} value={a.id} className="text-[12.5px]">
                  {a.label}{a.unit ? ` · ${a.unit}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {attr && attr.type === "numeric" && (
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-foreground">
              Threshold — ≥ takes Branch 1 <span className="text-warning">*</span>
            </label>
            <Input
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder={`e.g. ${attr.example}${attr.unit ? ` ${attr.unit}` : ""}`}
              className="h-8 text-[12.5px]"
            />
          </div>
        )}
      </div>

      {isCategorical ? (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-[11px] font-medium text-foreground">Route each {attr?.label} value →</p>
          {catOptions.map((o) => (
            <div key={o} className="grid grid-cols-[100px_1fr] items-center gap-2.5">
              <label className="truncate text-[12px] text-muted-foreground">{o}</label>
              <Select value={routeFor(o)} onValueChange={(v) => setArmRoutes((m) => ({ ...m, [o]: v }))}>
                <SelectTrigger className="h-8 text-[12.5px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {channelOpts.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id} className="text-[12.5px]">{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 border-t border-border pt-3">
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-foreground">Branch 1 →</label>
              <Select value={branchMatch} onValueChange={setBranchMatch}>
                <SelectTrigger className="h-8 text-[12.5px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {channelOpts.map((o) => (
                    <SelectItem key={o.id} value={o.id} className="text-[12.5px]">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-foreground">Branch 2 →</label>
              <Select value={branchElse} onValueChange={setBranchElse}>
                <SelectTrigger className="h-8 text-[12.5px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {channelOpts.map((o) => (
                    <SelectItem key={o.id} value={o.id} className="text-[12.5px]">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {branchMatch === branchElse && (
            <p className="text-[11px] text-warning">Branch 1 and Branch 2 must route to different places.</p>
          )}
        </>
      )}

      <div className="flex items-center justify-end pt-0.5">
        <button
          disabled={!ready}
          onClick={submit}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-all",
            ready ? "bg-foreground text-background hover:scale-[1.02]" : "cursor-not-allowed bg-muted text-muted-foreground/60",
          )}
        >
          Apply branch
        </button>
      </div>
    </div>
  );
}

/** Confirm card for the brief path — placement summary + per-channel samples + assumptions. */
function BriefConfirmCard({
  cfg, name, summary, resolved, assumptions, warning, done, onBack, onConfirm,
}: {
  cfg: BriefConfig;
  name: string;
  summary: string;
  resolved: Record<string, string>;
  assumptions: string[];
  warning?: string;
  done: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [choice, setChoice] = useState<"confirmed" | "back" | null>(null);
  const seg = findSegment(resolved.segment);

  if (done || choice) {
    return (
      <CardNote
        tone={choice === "back" ? "block" : "pass"}
        text={choice === "back" ? "Back to the Resolve card." : "Saved as draft v1 — review on canvas, launch separately."}
      />
    );
  }

  return (
    <div className="w-full max-w-[440px] space-y-3 rounded-2xl border border-border bg-card p-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ai">
        <ShieldCheck className="h-3.5 w-3.5" /> Confirm draft
      </p>

      <div className="space-y-1 text-[12.5px]">
        <p className="font-medium text-foreground">{name}</p>
        <p className="text-muted-foreground">{summary}</p>
        {seg && <p className="text-muted-foreground">Audience · {seg.label} ({seg.size})</p>}
      </div>

      {/* Sample messages per channel */}
      <div className="space-y-2">
        {cfg.channels.map((ch) => {
          if (ch === "whatsapp") {
            const wa = findWaTemplate(resolved.waTemplate);
            return (
              <SamplePreview
                key={ch}
                icon={<MessageSquare className="h-3.5 w-3.5 text-ai" />}
                title={`WhatsApp${wa ? ` · ${wa.label}` : ""}`}
                body={CHANNEL_SAMPLE.whatsapp}
              />
            );
          }
          const agent = findVoiceAgent(resolved.voiceAgent);
          return (
            <SamplePreview
              key={ch}
              icon={<Phone className="h-3.5 w-3.5 text-ai" />}
              title={`Voice${agent ? ` · ${agent.name}` : ""}`}
              body={CHANNEL_SAMPLE.voice}
            />
          );
        })}
      </div>

      {/* Assumptions */}
      {assumptions.length > 0 && (
        <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Assumptions</p>
          <ul className="space-y-0.5">
            {assumptions.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" /> {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Carried warning — explicit acceptance */}
      {warning && (
        <div className="flex items-start gap-1.5 rounded-xl border border-warning/40 bg-warning/[0.06] px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="text-[11.5px] leading-relaxed text-foreground">{warning}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <button
          onClick={() => { setChoice("back"); onBack(); }}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <button
          onClick={() => { setChoice("confirmed"); onConfirm(); }}
          className="rounded-lg bg-foreground px-3.5 py-1.5 text-[12.5px] font-medium text-background transition-all hover:scale-[1.02]"
        >
          {warning ? "Accept and confirm" : "Confirm"}
        </button>
      </div>
    </div>
  );
}
