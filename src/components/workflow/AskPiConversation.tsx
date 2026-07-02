import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, Check, Loader2, ChevronLeft, ArrowRight, ArrowUp,
  AlertTriangle, XCircle, ShieldCheck, Wand2, FileText, MessageSquare, Phone,
  Target, Users, Workflow, ListChecks, GitBranch, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { buildSkeleton, type AskPiPlan } from "./AskPiWizard";
import {
  SEGMENTS, WA_TEMPLATES, VOICE_AGENTS, SPLIT_ATTRIBUTES,
  CHANNEL_META,
  matchTemplate, planFromBrief, analyzeBrief, suggestTemplates, channelsSummary,
  applyResolved, applyRefinement, applySplit, buildContentAbChannels, channelAbVariants,
  validateResolved, runChecks,
  splitFieldsFor, findSplitAttribute,
  type CampaignTemplate, type BriefPlan, type TemplateVar,
  type BriefConfig, type Channel, type ValidationCheck,
} from "@/lib/tenant-registry";

/* ----------------------------------------------------------------- */
/* Types                                                             */
/* ----------------------------------------------------------------- */

export type ConversationPhase =
  | "intent" | "briefConfirm" | "planning" | "resolve" | "journey" | "splitResolve"
  | "validating" | "blocked" | "confirm" | "saved";

type Mode = "a1" | "a2";
type Msg = { id: string; from: "pi" | "user"; text: string };

export type AskPiConversationProps = {
  /** When false the conversation resets and pauses timers. */
  active: boolean;
  onSkeleton: (skeleton: AskPiPlan) => void;
  onBuild: (plan: AskPiPlan) => void;
  onPhaseChange?: (phase: ConversationPhase) => void;
  onSavedDraft?: (version: string) => void;
  /** Seed campaign name/description/objective used to rank suggested templates. */
  seedName?: string;
  seedDescription?: string;
  seedObjective?: string;
};

const CHANNEL_ORDER: Channel[] = ["whatsapp", "voice"];
type SplitChoice = "split" | "broadcast" | "experiment" | null;

let _mid = 0;
const nextId = () => `m${++_mid}`;

// The single percentage field the wizard's A/B (channel-experiment) split card
// captures — % of the audience to the priority channel. The remaining traffic
// goes to the other channel. Node-scoped per-variant capture (as the agent flow
// uses) is unnecessary here because both variants inherit the globally-resolved
// channel resource; this card only needs the split ratio.
const EXPERIMENT_VARS: TemplateVar[] = [
  { key: "splitPct", kind: "percent", label: "% of audience to the priority channel (A/B)", default: "50", required: true },
];

/* ----------------------------------------------------------------- */
/* Conversational engine                                             */
/* ----------------------------------------------------------------- */

export function AskPiConversation({
  active,
  onSkeleton,
  onBuild,
  onPhaseChange,
  onSavedDraft,
  seedName,
  seedDescription,
  seedObjective,
}: AskPiConversationProps) {
  const [phase, setPhase] = useState<ConversationPhase>("intent");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [refineText, setRefineText] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [template, setTemplate] = useState<CampaignTemplate | null>(null);
  const [, setBrief] = useState<BriefPlan | null>(null);
  const [openVars, setOpenVars] = useState<TemplateVar[]>([]);
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [warnMessages, setWarnMessages] = useState<string[]>([]);
  const [validationChecks, setValidationChecks] = useState<ValidationCheck[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [briefText, setBriefText] = useState("");
  const [briefConfig, setBriefConfig] = useState<BriefConfig | null>(null);
  const [objective, setObjective] = useState("");
  // null until the journey step; "split" routes through the split Resolve card,
  // "experiment" through the A/B percentage card, "broadcast" sends both channels
  // to the full segment.
  const [splitChoice, setSplitChoice] = useState<SplitChoice>(null);
  // Which logical step of the Resolve card is showing. Open variables are
  // partitioned by `group` (Audience / Branch 1 arm / Branch 2 arm / Sending rules …);
  // a single group degrades to the original one-shot capture.
  const [resolveStep, setResolveStep] = useState(0);

  const seedText = useMemo(
    () => [seedName, seedObjective, seedDescription].filter(Boolean).join(" · "),
    [seedName, seedObjective, seedDescription],
  );
  const suggestedTemplates = useMemo(() => suggestTemplates(seedText), [seedText]);

  // Refs to read fresh values inside timeouts.
  const pendingPlanRef = useRef<AskPiPlan | null>(null);
  const openVarsRef = useRef<TemplateVar[]>([]);
  const resolvedRef = useRef<Record<string, string>>({});
  const channelsRef = useRef<Channel[]>([]);
  const splitChoiceRef = useRef<SplitChoice>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const intentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { openVarsRef.current = openVars; }, [openVars]);
  useEffect(() => { resolvedRef.current = resolved; }, [resolved]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);
  useEffect(() => { splitChoiceRef.current = splitChoice; }, [splitChoice]);
  useEffect(() => { onPhaseChange?.(phase); }, [phase, onPhaseChange]);

  // Reset whenever the panel (re)opens.
  useEffect(() => {
    if (!active) return;
    setPhase("intent");
    setMessages([]);
    setInput("");
    setRefineText("");
    setMode(null);
    setTemplate(null);
    setBrief(null);
    setOpenVars([]);
    setResolved({});
    setAssumptions([]);
    setWarnMessages([]);
    setValidationChecks([]);
    setChannels([]);
    setBriefText("");
    setBriefConfig(null);
    setObjective("");
    setSplitChoice(null);
    pendingPlanRef.current = null;
  }, [active]);

  // Auto-scroll the chat trace.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, phase]);

  const pushPi = (text: string) => {
    const id = nextId();
    setMessages((m) => [...m, { id, from: "pi", text }]);
  };
  const pushUser = (text: string) => {
    const id = nextId();
    setMessages((m) => [...m, { id, from: "user", text }]);
  };

  /* --------------------------- routing --------------------------- */

  function startA1(tpl: CampaignTemplate) {
    setMode("a1");
    setTemplate(tpl);
    setBrief(null);
    setObjective(tpl.objective);
    setOpenVars(tpl.openVars);
    setAssumptions(tpl.assumptions);
    setChannels(tpl.channels);
    setWarnMessages([]);
    setResolved({});
    pendingPlanRef.current = tpl.build({});
    setPhase("planning");
  }

  /** A2 entry: confirm channels / priority / fallback before drafting. */
  function goToBriefConfirm(text: string) {
    const cfg = analyzeBrief(text);
    setMode("a2");
    setTemplate(null);
    setBrief(null);
    setBriefText(text);
    setBriefConfig(cfg);
    setPhase("briefConfirm");
  }

  function startA2(text: string, cfg: BriefConfig) {
    const bp = planFromBrief(text, cfg);
    setMode("a2");
    setBrief(bp);
    setTemplate(null);
    setObjective(bp.objective);
    setOpenVars(bp.gaps);
    setAssumptions(bp.assumptions);
    setChannels(bp.channels);
    setWarnMessages([]);
    setResolved({});
    pendingPlanRef.current = bp.plan;
    setPhase("planning");
  }

  function confirmBrief() {
    if (!briefConfig) return;
    // With a fallback it's a primary→fallback chain. With no fallback but several
    // channels selected, keep them all (priority first) so the audience can be
    // split across them; a single channel stays single.
    const channels: Channel[] = briefConfig.fallback
      ? [briefConfig.primary, briefConfig.fallback]
      : [briefConfig.primary, ...briefConfig.channels.filter((c) => c !== briefConfig.primary)];
    const norm: BriefConfig = { ...briefConfig, channels };
    startA2(briefText, norm);
  }

  function handleIntentSubmit() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const tpl = matchTemplate(text);
    if (tpl) startA1(tpl);
    else goToBriefConfirm(text);
  }

  /* ---------------------- journey (chat split) ------------------- */

  // Multiple channels chosen with no fallback → after resolve we ask, in chat,
  // how the audience flows across them (split by attribute vs. broadcast).
  const isParallel = useMemo(
    () => mode === "a2" && channels.length > 1 && !openVars.some((v) => v.kind === "duration"),
    [mode, channels, openVars],
  );

  function enterJourney() {
    const labels = channels.map((c) => CHANNEL_META[c].label).join(" and ");
    const abHint = briefConfig?.contentAb ? " — sounds like an A/B test" : "";
    pushPi(`You've picked ${labels} with no fallback${abHint}. How should the audience flow through them — A/B test the two channels, split by an audience attribute, or reach everyone on both?`);
    setPhase("journey");
  }

  function chooseExperiment() {
    pushUser("A/B test the two channels");
    setSplitChoice("experiment");
    pushPi("Got it — I'll randomly split the audience between the two channels to compare them. Set the split below (defaults to 50/50).");
    setPhase("splitResolve");
  }

  function chooseSplit() {
    pushUser("Split the audience");
    setSplitChoice("split");
    pushPi("Got it. Pick the attribute below — for a numeric attribute, contacts at or above your threshold take the priority channel; for a category, the value you choose takes it.");
    setPhase("splitResolve");
  }

  function chooseBroadcast() {
    pushUser("Send to everyone on both");
    setSplitChoice("broadcast");
    pushPi("Done — both channels reach the full segment in parallel. Validating the draft…");
    setPhase("validating");
  }

  function handleJourneyInput() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    pushUser(text);
    const t = text.toLowerCase();
    if (/a\/b|a-b|ab test|experiment|test (the )?(two )?channels|head\s?to\s?head/.test(t)) {
      chooseExperimentFromInput();
    } else if (/split|divide|threshold|segment by|based on|above|below|cart|value|score|loyal|type|tier|language/.test(t)) {
      setSplitChoice("split");
      pushPi("Got it. Pick the attribute below — for a numeric attribute, contacts at or above your threshold take the priority channel; for a category, the value you choose takes it.");
      setPhase("splitResolve");
    } else if (/both|everyone|all|broadcast|same|parallel|no split/.test(t)) {
      setSplitChoice("broadcast");
      pushPi("Done — both channels reach the full segment in parallel. Validating the draft…");
      setPhase("validating");
    } else {
      pushPi("I can A/B test the two channels, split the audience by an attribute (e.g. cart value, customer type), or reach everyone on both. Which would you like?");
    }
  }

  function chooseExperimentFromInput() {
    setSplitChoice("experiment");
    pushPi("Got it — I'll randomly split the audience between the two channels to compare them. Set the split below (defaults to 50/50).");
    setPhase("splitResolve");
  }

  // The open variables the split Resolve card shows, by journey choice:
  // experiment → the A/B percentage; attribute split → the attribute + its
  // (numeric threshold | categorical value), shaped by the chosen attribute.
  const splitFields = useMemo<TemplateVar[]>(
    () =>
      splitChoice === "experiment"
        ? EXPERIMENT_VARS
        : splitFieldsFor(resolved.splitAttribute),
    [splitChoice, resolved.splitAttribute],
  );

  // Split Resolve card readiness, by journey choice.
  const splitReady = useMemo(() => {
    if (splitChoice === "experiment") {
      const p = Number(resolved.splitPct);
      return !Number.isNaN(p) && p >= 1 && p <= 99;
    }
    const attr = findSplitAttribute(resolved.splitAttribute);
    if (!attr) return false;
    if (attr.type === "categorical") return !!resolved.splitValue;
    return !!resolved.splitThreshold && !Number.isNaN(Number(resolved.splitThreshold));
  }, [splitChoice, resolved]);

  function confirmSplit() {
    const priorityLabel = channels[0] ? CHANNEL_META[channels[0]].label : "priority channel";
    const otherLabel = channels[1] ? CHANNEL_META[channels[1]].label : "other channel";
    const stripPrior = (a: string) =>
      !/^Audience split:/.test(a) && !/^A\/B test:/.test(a) && !/both target the full segment/.test(a);
    if (splitChoice === "experiment") {
      const p = Number(resolved.splitPct);
      const line = `A/B test: ${p}% ${priorityLabel} / ${100 - p}% ${otherLabel} (random)`;
      setAssumptions((prev) => [...prev.filter(stripPrior), line]);
    } else {
      const attr = findSplitAttribute(resolved.splitAttribute);
      if (attr && attr.type === "categorical" && resolved.splitValue) {
        const line = `Audience split: ${attr.label} = ${resolved.splitValue} → ${priorityLabel}`;
        setAssumptions((prev) => [...prev.filter(stripPrior), line]);
      } else if (attr && resolved.splitThreshold) {
        const line = `Audience split: ${attr.label} ≥ ${attr.unit}${resolved.splitThreshold} → ${priorityLabel}`;
        setAssumptions((prev) => [...prev.filter(stripPrior), line]);
      }
    }
    setPhase("validating");
  }

  /* ----------------------- brief-confirm edits ------------------- */

  function toggleChannel(ch: Channel) {
    setBriefConfig((cfg) => {
      if (!cfg) return cfg;
      let next = cfg.channels.includes(ch)
        ? cfg.channels.filter((c) => c !== ch)
        : [...cfg.channels, ch];
      if (next.length === 0) next = [ch];
      const primary = next.includes(cfg.primary) ? cfg.primary : next[0];
      const fallback =
        cfg.fallback && next.includes(cfg.fallback) && cfg.fallback !== primary
          ? cfg.fallback
          : (next.find((c) => c !== primary) ?? null);
      return { ...cfg, channels: next, primary, fallback };
    });
  }

  function setPrimaryChannel(ch: Channel) {
    setBriefConfig((cfg) => {
      if (!cfg) return cfg;
      const next = cfg.channels.includes(ch) ? cfg.channels : [...cfg.channels, ch];
      const fallback = cfg.fallback === ch ? null : cfg.fallback;
      return { ...cfg, channels: next, primary: ch, fallback };
    });
  }

  function setFallbackChannel(val: string) {
    setBriefConfig((cfg) => {
      if (!cfg) return cfg;
      if (val === "__none") return { ...cfg, fallback: null };
      const ch = val as Channel;
      const next = cfg.channels.includes(ch) ? cfg.channels : [...cfg.channels, ch];
      return { ...cfg, fallback: ch, channels: next };
    });
  }

  /* ------------------------- planning ---------------------------- */

  useEffect(() => {
    if (phase !== "planning") return;
    const p = pendingPlanRef.current;
    if (!p) return;
    onSkeleton(buildSkeleton(p));
    const done = setTimeout(() => {
      onBuild(p);
      // Pre-fill duration defaults so the Resolve card opens ready.
      setResolved((prev) => {
        const next = { ...prev };
        for (const v of openVarsRef.current) {
          if (v.kind === "duration" && !next[v.key]) next[v.key] = v.default;
        }
        return next;
      });
      setPhase("resolve");
    }, 1400);
    return () => clearTimeout(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* ------------------------- validating -------------------------- */

  useEffect(() => {
    if (phase !== "validating") return;
    const t = setTimeout(() => {
      const choice = splitChoiceRef.current;
      const split = choice === "split";
      const experiment = choice === "experiment";
      const extra = experiment
        ? EXPERIMENT_VARS
        : split
          ? splitFieldsFor(resolvedRef.current.splitAttribute)
          : [];
      const vars = [...openVarsRef.current, ...extra];
      const res = validateResolved(vars, resolvedRef.current, channelsRef.current);
      setValidationChecks(res.checks);
      if (res.level === "block") {
        setPhase("blocked");
        return;
      }
      const base = pendingPlanRef.current!;
      let patched = applyResolved(base, resolvedRef.current);
      if (experiment) {
        // A CHANNEL A/B: draw a visible A/B Split whose variants are the two
        // channels (each inheriting its globally-resolved resource via
        // channelNode's node-scoped fallback), splitting on the captured %.
        const chs = channelsRef.current;
        const abCfg: BriefConfig = {
          channels: chs,
          primary: chs[0],
          fallback: null,
          fallbackWait: "1 day",
          contentAb: { ch: chs[0], variants: channelAbVariants(chs, resolvedRef.current.splitPct) },
        };
        patched = buildContentAbChannels(base.name, abCfg, resolvedRef.current);
      } else if (split) {
        const attr = findSplitAttribute(resolvedRef.current.splitAttribute);
        const value = attr?.type === "categorical"
          ? resolvedRef.current.splitValue
          : resolvedRef.current.splitThreshold;
        patched = applySplit(patched, resolvedRef.current.splitAttribute, value, channelsRef.current);
      }
      pendingPlanRef.current = patched;
      onBuild(patched);
      const warns = res.checks.filter((c) => c.status === "warn").map((c) => c.detail);
      setWarnMessages(res.level === "warn" ? warns : []);
      setPhase("confirm");
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* --------------------------- actions --------------------------- */

  const setField = (key: string, val: string) =>
    setResolved((r) => ({ ...r, [key]: val }));

  // Live pre-flight checks shown under the Resolve fields so the user sees
  // exactly what's still blocking before they hit "Validate & continue".
  const liveChecks = useMemo(
    () => (openVars.length ? runChecks(openVars, resolved, channels) : []),
    [openVars, resolved, channels],
  );
  const liveBlocks = useMemo(
    () => liveChecks.filter((c) => c.status === "block").length,
    [liveChecks],
  );

  // Partition the open variables into ordered steps by `group` (first-appearance
  // order). One group → a single-step card (original behaviour); multiple groups
  // → a Back / Next wizard, gated step-by-step on each step's required fields.
  const resolveSteps = useMemo(() => {
    const steps: { label: string; vars: TemplateVar[] }[] = [];
    const idxOf = new Map<string, number>();
    for (const v of openVars) {
      const g = v.group ?? "Resolve open variables";
      let i = idxOf.get(g);
      if (i === undefined) { i = steps.length; idxOf.set(g, i); steps.push({ label: g, vars: [] }); }
      steps[i].vars.push(v);
    }
    return steps;
  }, [openVars]);

  // Re-enter the Resolve phase at the first step (e.g. after a review edit).
  useEffect(() => { if (phase === "resolve") setResolveStep(0); }, [phase]);

  // Free-text edit from the campaign-review screen. Applies a refinement when
  // it matches (e.g. fallback wait), then drops the user back into the resolve
  // loop so they can keep adjusting open variables until it's done.
  function handleReviewEdit() {
    const text = refineText.trim();
    if (!text) return;
    setRefineText("");
    pushUser(text);
    const base = pendingPlanRef.current;
    if (base) {
      const r = applyRefinement(text, base);
      if (r) {
        pendingPlanRef.current = r.plan;
        onBuild(r.plan);
        const durationVar = openVarsRef.current.find((v) => v.kind === "duration");
        if (durationVar) setResolved((prev) => ({ ...prev, [durationVar.key]: r.duration }));
        setAssumptions((prev) =>
          prev.map((a) => (/fallback wait/i.test(a) ? `Fallback wait set to ${r.duration}` : a)),
        );
        pushPi(`${r.echo} Adjust anything else below, then continue.`);
      } else {
        pushPi("Let's refine it — update the open variables below, then continue.");
      }
    }
    setPhase("resolve");
  }

  function confirmDraft() {
    pushPi("Saved as draft v1 — review on the canvas. Launch stays a separate step.");
    setPhase("saved");
    onSavedDraft?.("v1");
  }

  /* --------------------------- review ---------------------------- */

  // Plain-language campaign review derived from the resolved draft.
  const review = useMemo(() => {
    const goal = objective || template?.objective || "—";
    const segVar = openVars.find((v) => v.kind === "segment");
    const seg = segVar ? SEGMENTS.find((s) => s.id === resolved[segVar.key]) : undefined;
    const audience = seg ? `${seg.label} · ${seg.size}` : "All eligible contacts";
    const durVar = openVars.find((v) => v.kind === "duration");
    const wait = durVar ? resolved[durVar.key] : undefined;
    return { goal, audience, wait };
  }, [objective, template, openVars, resolved]);

  const warnChecks = useMemo(
    () => validationChecks.filter((c) => c.status === "warn"),
    [validationChecks],
  );

  /* ----------------------------------------------------------------- */
  /* Render                                                            */
  /* ----------------------------------------------------------------- */

  const headerTitle =
    phase === "intent" ? "Ask Pi · Create a campaign"
      : phase === "briefConfirm" ? "Ask Pi · Confirm channels"
        : phase === "planning" ? "Pi is drafting your campaign"
          : phase === "resolve" ? "Ask Pi · Resolve open variables"
            : phase === "journey" ? "Ask Pi · Resolve the journey"
              : phase === "splitResolve" ? "Ask Pi · Split the audience"
                : phase === "validating" ? "Validating…"
                  : phase === "blocked" ? "Ask Pi · Validation failed"
                    : phase === "confirm" ? "Ask Pi · Campaign review"
                      : "Saved as draft v1";
  const headerSubtitle =
    phase === "intent" ? "Pick a suggested template or describe a campaign"
      : phase === "briefConfirm" ? "Channels, priority & fallback before I draft"
        : phase === "planning" ? "Drafting the journey on the canvas…"
          : phase === "resolve" ? "Set the open variables, then continue"
            : phase === "journey" ? "How should the audience flow across channels?"
              : phase === "splitResolve" ? "Pick the attribute & threshold to split on"
                : phase === "validating" ? "Checking audience, channels, approvals & compliance"
                  : phase === "blocked" ? "Fix the blocked checks, then re-validate"
                    : phase === "confirm" ? "Audience, channels & fallback — edit or confirm"
                      : "Review on canvas · launch separately";

  const PROGRESS: Record<ConversationPhase, number> = {
    intent: 8, briefConfirm: 22, planning: 35, resolve: 55, journey: 62, splitResolve: 66,
    validating: 72, blocked: 72, confirm: 88, saved: 100,
  };

  return (
    <div className="flex max-h-[min(600px,75vh)] flex-col animate-fade-in">
      {/* Pinned: header + progress (stay visible while the body scrolls) */}
      <div className="shrink-0">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 pb-2 pt-3.5">
        <div className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md",
          phase === "blocked" ? "bg-destructive/10" : "bg-ai/10",
        )}>
          {phase === "planning" || phase === "validating"
            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" />
            : phase === "saved"
              ? <Check className="h-3.5 w-3.5 text-success" />
              : phase === "blocked"
                ? <XCircle className="h-3.5 w-3.5 text-destructive" />
                : <Sparkles className="h-3.5 w-3.5 text-ai" />}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[12.5px] font-medium text-foreground">{headerTitle}</p>
          <p className="truncate text-[11px] text-muted-foreground">{headerSubtitle}</p>
        </div>
      </div>

        {/* Progress */}
        <div className="h-[2px] w-full bg-secondary">
          <div className="h-full bg-ai transition-all duration-500" style={{ width: `${PROGRESS[phase]}%` }} />
        </div>
      </div>

      {/* Scrollable conversation body — fixed max height, internal scroll */}
      <div ref={logRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {/* Intent */}
      {phase === "intent" && (
        <div className="px-5 pb-4 pt-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3.5 w-3.5 text-ai" />
            {seedText ? "Suggested for your campaign" : "Suggested templates"}
          </p>

          <div className="mt-2 space-y-2">
            {suggestedTemplates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => startA1(tpl)}
                className="group flex w-full items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-all hover:border-ai/40 hover:bg-ai/[0.03]"
              >
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ai/10">
                  <Sparkles className="h-3.5 w-3.5 text-ai" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-medium text-foreground">{tpl.name}</span>
                    <span className="shrink-0 rounded-full bg-secondary px-1.5 py-px text-[9.5px] text-muted-foreground">{tpl.tenant}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{tpl.summary}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {tpl.channels.map((ch) => (
                      <span key={ch} className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[9.5px] text-muted-foreground">
                        <ChannelIcon ch={ch} className="h-2.5 w-2.5" /> {CHANNEL_META[ch].label}
                      </span>
                    ))}
                  </div>
                </div>
                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-ai" />
              </button>
            ))}
          </div>

          <div className="mt-3.5 flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10.5px] text-muted-foreground">or describe your campaign</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="mt-2.5 flex items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2">
            <Wand2 className="mb-1.5 h-3.5 w-3.5 shrink-0 text-ai" />
            <textarea
              ref={intentRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleIntentSubmit(); }
              }}
              placeholder="e.g. Recover abandoned carts on WhatsApp with a voice win-back fallback"
              className="max-h-28 min-w-0 flex-1 resize-none bg-transparent py-1 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
            />
            <button
              onClick={handleIntentSubmit}
              disabled={!input.trim()}
              className={cn(
                "mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all",
                input.trim() ? "bg-foreground text-background hover:scale-[1.04]" : "bg-muted text-muted-foreground/60",
              )}
              aria-label="Send"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Brief confirm — channels / priority / fallback */}
      {phase === "briefConfirm" && briefConfig && (
        <div className="px-5 pb-4 pt-3">
          <div className="rounded-2xl border border-ai/30 bg-ai/[0.03] p-3.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ai">
              <Sparkles className="h-3 w-3" /> Confirm
            </span>

            {/* Channels */}
            <p className="mt-3 text-[11.5px] font-medium text-foreground">Channels to use</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CHANNEL_ORDER.map((ch) => {
                const on = briefConfig.channels.includes(ch);
                return (
                  <button
                    key={ch}
                    onClick={() => toggleChannel(ch)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                      on ? "border-ai/40 bg-ai/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <ChannelIcon ch={ch} className="h-3 w-3" /> {CHANNEL_META[ch].label}
                    {on && <Check className="h-3 w-3 text-ai" />}
                  </button>
                );
              })}
            </div>

            {/* Priority + Fallback. A conditional brief routes by an audience
                attribute (Branch 1 / Branch 2), so a delivery-failure fallback doesn't
                apply — the split is owned by the branch rule resolved next. */}
            <div className={cn("mt-3 grid gap-2.5", briefConfig.conditional ? "grid-cols-1" : "grid-cols-2")}>
              <div>
                <p className="mb-1 text-[11.5px] font-medium text-foreground">Priority channel</p>
                <Select value={briefConfig.primary} onValueChange={(v) => setPrimaryChannel(v as Channel)}>
                  <SelectTrigger className="h-8 text-[12.5px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {briefConfig.channels.map((ch) => (
                      <SelectItem key={ch} value={ch} className="text-[12.5px]">{CHANNEL_META[ch].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!briefConfig.conditional && (
                <div>
                  <p className="mb-1 text-[11.5px] font-medium text-foreground">Fallback</p>
                  <Select value={briefConfig.fallback ?? "__none"} onValueChange={setFallbackChannel}>
                    <SelectTrigger className="h-8 text-[12.5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none" className="text-[12.5px]">No fallback</SelectItem>
                      {CHANNEL_ORDER.filter((ch) => ch !== briefConfig.primary).map((ch) => (
                        <SelectItem key={ch} value={ch} className="text-[12.5px]">{CHANNEL_META[ch].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {briefConfig.conditional && (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-ai/25 bg-ai/[0.04] px-2.5 py-2">
                <GitBranch className="mt-0.5 h-3 w-3 shrink-0 text-ai" />
                <p className="text-[11px] leading-snug text-muted-foreground">
                  This brief splits the audience by an attribute (Branch 1 / Branch 2). You'll set the branch rule
                  next — there's no delivery-failure fallback to choose here.
                </p>
              </div>
            )}

            {/* Fallback wait */}
            {briefConfig.fallback && (
              <div className="mt-3">
                <p className="mb-1 text-[11.5px] font-medium text-foreground">Fallback wait (after non-delivery)</p>
                <Input
                  value={briefConfig.fallbackWait}
                  onChange={(e) => setBriefConfig((cfg) => (cfg ? { ...cfg, fallbackWait: e.target.value } : cfg))}
                  placeholder="e.g. 6 hours"
                  className="h-8 text-[12.5px]"
                />
              </div>
            )}

            <p className="mt-3 text-[11px] text-muted-foreground">{channelsSummary(briefConfig)}.</p>

            {/* Channels the brief asked for that this workspace can't run. */}
            {briefConfig.unavailable && briefConfig.unavailable.length > 0 && (
              <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/5 px-2.5 py-2">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">{briefConfig.unavailable.join(", ")}</span>{" "}
                  {briefConfig.unavailable.length === 1 ? "was" : "were"} mentioned but {briefConfig.unavailable.length === 1 ? "isn't" : "aren't"} available here — this workspace supports WhatsApp and Voice (AI) only. I've left {briefConfig.unavailable.length === 1 ? "it" : "them"} out.
                </p>
              </div>
            )}

            <div className="mt-3.5 flex items-center justify-between gap-2">
              <button
                onClick={() => setPhase("intent")}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-3 w-3" /> Back
              </button>
              <button
                onClick={confirmBrief}
                className="inline-flex items-center gap-1.5 rounded-md bg-ai px-3 py-1.5 text-[11.5px] font-medium text-ai-foreground hover:opacity-90"
              >
                Draft this <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Planning trace */}
      {phase === "planning" && (
        <div className="flex items-center gap-2 px-5 pb-5 pt-3 text-[12.5px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" /> Drafting the journey on the canvas…
        </div>
      )}

      {/* Resolve card — walked one logical step (group) at a time. */}
      {phase === "resolve" && (() => {
        const multiStep = resolveSteps.length > 1;
        const idx = Math.min(resolveStep, Math.max(0, resolveSteps.length - 1));
        const current = resolveSteps[idx] ?? { label: "Resolve open variables", vars: openVars };
        const isLast = idx >= resolveSteps.length - 1;
        const stepMissing = current.vars.filter((v) => v.required && !resolved[v.key]?.trim()).length;
        return (
        <div className="px-5 pb-4 pt-3">
          <div className="rounded-2xl border border-ai/30 bg-ai/[0.03] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ai">
                <Sparkles className="h-3 w-3" /> {multiStep ? current.label : "Resolve"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {multiStep
                  ? `Step ${idx + 1} of ${resolveSteps.length}`
                  : `${openVars.length} open variable${openVars.length === 1 ? "" : "s"}`}
              </span>
            </div>

            {multiStep && (
              <div className="mt-2.5 flex items-center gap-1">
                {resolveSteps.map((s, i) => (
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

            <div className="mt-3 space-y-3">
              {current.vars.map((v) => (
                <ResolveField key={v.key} v={v} value={resolved[v.key] ?? ""} onChange={(val) => setField(v.key, val)} />
              ))}
            </div>

            <div className="mt-3.5 flex items-center gap-2">
              {multiStep && idx > 0 && (
                <button
                  onClick={() => setResolveStep(idx - 1)}
                  className="flex items-center gap-1 rounded-md px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Back
                </button>
              )}
              {multiStep && !isLast ? (
                <button
                  onClick={() => setResolveStep(idx + 1)}
                  disabled={stepMissing > 0}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium transition-all",
                    stepMissing > 0
                      ? "cursor-not-allowed bg-muted text-muted-foreground/60"
                      : "bg-ai text-ai-foreground hover:opacity-90",
                  )}
                >
                  {stepMissing > 0
                    ? `Set ${stepMissing} required field${stepMissing === 1 ? "" : "s"} to continue`
                    : "Next"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => (isParallel ? enterJourney() : setPhase("validating"))}
                  disabled={liveBlocks > 0}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium transition-all",
                    liveBlocks > 0
                      ? "cursor-not-allowed bg-muted text-muted-foreground/60"
                      : "bg-ai text-ai-foreground hover:opacity-90",
                  )}
                >
                  {liveBlocks > 0
                    ? `Set ${liveBlocks} required field${liveBlocks === 1 ? "" : "s"} to continue`
                    : isParallel
                      ? "Continue to journey"
                      : "Continue to campaign review"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Journey — chat: how does the audience split across parallel channels? */}
      {phase === "journey" && (
        <div className="px-5 pb-4 pt-3">
          <ChatTrace messages={messages} />
          <div className="mt-2.5 rounded-2xl border border-ai/30 bg-ai/[0.03] p-3.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ai">
              <GitBranch className="h-3 w-3" /> Resolve journey
            </span>

            <div className="mt-3 grid gap-2">
              <button
                onClick={chooseExperiment}
                className="group flex items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-all hover:border-ai/40 hover:bg-ai/[0.03]"
              >
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-ai" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-foreground">A/B test the channels</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Randomly split the audience between {channels.map((c) => CHANNEL_META[c].label).join(" &amp; ")} to compare them.
                  </p>
                </div>
                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-ai" />
              </button>
              <button
                onClick={chooseSplit}
                className="group flex items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-all hover:border-ai/40 hover:bg-ai/[0.03]"
              >
                <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-ai" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-foreground">Split the audience</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Route by an attribute — numeric threshold or category value picks the priority channel.
                  </p>
                </div>
                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-ai" />
              </button>
              <button
                onClick={chooseBroadcast}
                className="group flex items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-all hover:border-ai/40 hover:bg-ai/[0.03]"
              >
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-ai" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-foreground">Send to everyone</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Both channels reach the full segment in parallel.
                  </p>
                </div>
                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-ai" />
              </button>
            </div>

            {/* Or reply in chat */}
            <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5">
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleJourneyInput(); } }}
                placeholder="or reply — e.g. split by cart value"
                className="min-w-0 flex-1 bg-transparent py-1 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
              />
              <button
                onClick={handleJourneyInput}
                disabled={!input.trim()}
                className={cn(
                  "shrink-0 rounded-md p-1 transition-colors",
                  input.trim() ? "text-ai hover:bg-ai/10" : "text-muted-foreground/50",
                )}
                aria-label="Send reply"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split resolve — attribute + threshold via structured pickers */}
      {phase === "splitResolve" && (
        <div className="px-5 pb-4 pt-3">
          <ChatTrace messages={messages} />
          <div className="mt-2.5 rounded-2xl border border-ai/30 bg-ai/[0.03] p-3.5">
            <div className="flex items-center gap-1.5">
              {splitChoice === "experiment" ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ai">
                    <Target className="h-3 w-3" /> A/B test
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {channels[0] ? CHANNEL_META[channels[0]].label : "A"} vs{" "}
                    {channels[1] ? CHANNEL_META[channels[1]].label : "B"} · random split
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ai">
                    <GitBranch className="h-3 w-3" /> Split audience
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {channels[0] ? CHANNEL_META[channels[0]].label : "Priority"} ·{" "}
                    {channels[1] ? CHANNEL_META[channels[1]].label : "Other"}
                  </span>
                </>
              )}
            </div>

            <div className="mt-3 space-y-3">
              {splitFields.map((v) => (
                <ResolveField key={v.key} v={v} value={resolved[v.key] ?? ""} onChange={(val) => setField(v.key, val)} />
              ))}
            </div>

            <div className="mt-3.5 flex items-center justify-between gap-2">
              <button
                onClick={() => setPhase("journey")}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-3 w-3" /> Back
              </button>
              <button
                onClick={confirmSplit}
                disabled={!splitReady}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-all",
                  splitReady
                    ? "bg-ai text-ai-foreground hover:opacity-90"
                    : "cursor-not-allowed bg-muted text-muted-foreground/60",
                )}
              >
                Continue to review <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validating spinner */}
      {phase === "validating" && (
        <div className="flex items-center gap-2 px-5 pb-5 pt-3 text-[12.5px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" /> Validating the resolved draft…
        </div>
      )}

      {/* Validation-failed card — shown when one or more checks block the draft */}
      {phase === "blocked" && (
        <div className="px-5 pb-4 pt-3">
          <div className="rounded-2xl border border-destructive/40 bg-destructive/[0.04] p-3.5">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-destructive">
                <XCircle className="h-3 w-3" /> Validation failed
              </span>
              <span className="text-[11px] text-muted-foreground">
                {validationChecks.filter((c) => c.status === "block").length} check
                {validationChecks.filter((c) => c.status === "block").length === 1 ? "" : "s"} need fixing
              </span>
            </div>

            <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
              The draft can&rsquo;t move to confirmation until these are resolved. Fix the flagged items, then re-validate.
            </p>

            {validationChecks.length > 0 && (
              <div className="mt-3">
                <ValidationChecklist checks={validationChecks} title="Validation results" />
              </div>
            )}

            <button
              onClick={() => setPhase(splitChoice === "split" || splitChoice === "experiment" ? "splitResolve" : "resolve")}
              className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-[12px] font-medium text-background transition-all hover:opacity-90"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back to fix &amp; re-validate
            </button>
          </div>
        </div>
      )}

      {/* Confirm card — campaign review + warnings */}
      {phase === "confirm" && (
        <div className="px-5 pb-4 pt-3">
          <div className="space-y-2.5">
            {/* Campaign review */}
            <div className="rounded-xl border border-border bg-card">
              <p className="border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Campaign review
              </p>
              <div className="divide-y divide-border/60">
                <div className="flex items-start gap-2.5 px-3 py-2.5">
                  <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai" />
                  <div>
                    <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">Goal</p>
                    <p className="text-[12.5px] text-foreground">{review.goal}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 px-3 py-2.5">
                  <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai" />
                  <div>
                    <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">Audience</p>
                    <p className="text-[12.5px] text-foreground">{review.audience}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 px-3 py-2.5">
                  <Workflow className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai" />
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">Journey</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[12.5px] text-foreground">
                      {channels.map((ch, i) => (
                        <Fragment key={ch}>
                          {i > 0 && (isParallel
                            ? <span className="px-0.5 text-[12px] text-muted-foreground">+</span>
                            : <ArrowRight className="h-3 w-3 text-muted-foreground" />)}
                          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5">
                            <ChannelIcon ch={ch} className="h-2.5 w-2.5" /> {CHANNEL_META[ch].label}
                          </span>
                        </Fragment>
                      ))}
                    </div>
                    {review.wait && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Fallback waits {review.wait} after non-delivery.
                      </p>
                    )}
                    {isParallel && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {splitChoice === "experiment"
                          ? "A/B test — audience randomly split between the two channels to compare them."
                          : splitChoice === "split"
                            ? "Audience split between channels by your rule."
                            : "Both channels reach the full segment in parallel."}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2.5 px-3 py-2.5">
                  <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai" />
                  <div>
                    <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">Assumptions</p>
                    <ul className="mt-1 space-y-1">
                      {assumptions.map((a) => (
                        <li key={a} className="flex items-start gap-1.5 text-[12px] text-foreground">
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" /> {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Warnings the user needs to set up */}
            {warnChecks.length > 0 && (
              <div className="rounded-xl border border-warning/40 bg-warning/5">
                <p className="flex items-center gap-1.5 border-b border-warning/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Needs your setup
                </p>
                <ul className="divide-y divide-warning/20">
                  {warnChecks.map((c) => (
                    <li key={c.id} className="px-3 py-2">
                      <p className="text-[12px] font-medium text-foreground">{c.label}</p>
                      <p className="text-[11.5px] text-muted-foreground">{c.detail}</p>
                    </li>
                  ))}
                </ul>
                <p className="px-3 py-2 text-[11px] text-muted-foreground">
                  &ldquo;Accept &amp; confirm&rdquo; saves the draft anyway; it won&rsquo;t launch until resolved.
                </p>
              </div>
            )}
          </div>

          {/* Free-text edit — sends the user back into the resolve loop */}
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5">
            <Wand2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleReviewEdit(); } }}
              placeholder="Edit in plain language — e.g. switch the segment, or wait 3 hours"
              className="min-w-0 flex-1 bg-transparent py-1 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
            />
            <button
              onClick={handleReviewEdit}
              disabled={!refineText.trim()}
              className={cn(
                "shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                refineText.trim() ? "text-ai hover:bg-ai/10" : "text-muted-foreground/50",
              )}
            >
              Edit
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              onClick={() => setPhase("resolve")}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" /> Back
            </button>
            <button
              onClick={confirmDraft}
              className="inline-flex items-center gap-1.5 rounded-md bg-ai px-3 py-1.5 text-[11.5px] font-medium text-ai-foreground hover:opacity-90"
            >
              <Check className="h-3 w-3" /> {warnChecks.length > 0 ? "Accept & confirm" : "Confirm"}
            </button>
          </div>
        </div>
      )}

      {/* Saved */}
      {phase === "saved" && (
        <div className="px-5 pb-5 pt-3">
          <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-3 py-2.5">
            <Check className="h-4 w-4 text-success" />
            <p className="text-[12.5px] font-medium text-foreground">
              Saved as draft v1 — review on the canvas, launch separately.
            </p>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Resolve field renderer (registry-backed pickers)                  */
/* ----------------------------------------------------------------- */

function ResolveField({
  v, value, onChange,
}: { v: TemplateVar; value: string; onChange: (val: string) => void }) {
  // Only live voice agents are bindable; surface a block note if none exist.
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
      ) : v.kind === "duration" || v.kind === "threshold" || v.kind === "percent" ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={v.kind === "duration" ? v.default : v.kind === "percent" ? v.default : "e.g. 5000"}
          inputMode={v.kind === "threshold" || v.kind === "percent" ? "numeric" : undefined}
          className="h-8 text-[12.5px]"
        />
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-[12.5px]">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {v.kind === "splitAttribute" && SPLIT_ATTRIBUTES.map((a) => (
              <SelectItem key={a.id} value={a.id} className="text-[12.5px]">
                {a.label}{a.unit ? ` · ${a.unit}` : ""}{a.type === "categorical" ? " · category" : ""}
              </SelectItem>
            ))}
            {v.kind === "splitValue" && v.options.map((o) => (
              <SelectItem key={o} value={o} className="text-[12.5px]">
                {o}
              </SelectItem>
            ))}
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

/** Granular pre-flight validation checklist shown on the Resolve + Confirm cards. */
function ValidationChecklist({ checks, title }: { checks: ValidationCheck[]; title: string }) {
  const blocks = checks.filter((c) => c.status === "block").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const passes = checks.length - blocks - warns;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-ai" /> {title}
        </p>
        <span className="flex shrink-0 items-center gap-2 text-[10px] font-medium">
          <span className="text-success">{passes} pass</span>
          {warns > 0 && <span className="text-warning">{warns} warn</span>}
          {blocks > 0 && <span className="text-destructive">{blocks} blocked</span>}
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-1.5 text-[12px] leading-relaxed">
            {c.status === "pass" ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            ) : c.status === "warn" ? (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            ) : (
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            )}
            <span className="min-w-0">
              <span className="font-medium text-foreground">{c.label}</span>
              <span className="text-muted-foreground"> — {c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChannelIcon({ ch, className = "h-3.5 w-3.5 text-ai" }: { ch: Channel; className?: string }) {
  if (ch === "voice") return <Phone className={className} />;
  return <MessageSquare className={className} />;
}

/** Compact chat transcript shown on the conversational (journey/split) steps. */
function ChatTrace({ messages }: { messages: Msg[] }) {
  if (messages.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {messages.map((m) => (
        <div
          key={m.id}
          className={cn("flex", m.from === "user" ? "justify-end" : "justify-start")}
        >
          <div
            className={cn(
              "max-w-[85%] rounded-2xl px-3 py-1.5 text-[12px] leading-relaxed",
              m.from === "user"
                ? "bg-foreground text-background"
                : "border border-border bg-card text-foreground",
            )}
          >
            {m.from === "pi" && (
              <span className="mb-0.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-ai">
                <Sparkles className="h-2.5 w-2.5" /> Pi
              </span>
            )}
            {m.text}
          </div>
        </div>
      ))}
    </div>
  );
}
