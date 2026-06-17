import { useEffect, useRef, useState } from "react";
import type { Edge, Node } from "reactflow";
import { Sparkles, ArrowRight, Check, Loader2, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowNodeData } from "@/lib/campaign-types";
import { elkLayout } from "@/lib/flow-layout";

/* -------------------------------------------------------- */
/* Question schema                                           */
/* -------------------------------------------------------- */

type Option = { value: string; label: string; hint: string };
type Question = { id: string; title: string; subtitle: string; options: Option[] };

const QUESTIONS: Question[] = [
  {
    id: "goal",
    title: "What outcome should this campaign drive?",
    subtitle: "Pi will pick the right journey shape for this goal.",
    options: [
      { value: "reactivation", label: "Reactivate dormant users", hint: "Wake up inactive accounts (>30d)" },
      { value: "onboarding",   label: "Onboard new signups",      hint: "Drive first deposit / first action" },
      { value: "winback",      label: "Win-back high-value churn", hint: "Premium retention play" },
      { value: "kyc",          label: "Recover KYC drop-offs",    hint: "Compliance completion nudge" },
    ],
  },
  {
    id: "audience",
    title: "Who is this targeting?",
    subtitle: "Minimum audience config — you can refine later.",
    options: [
      { value: "csv",     label: "Upload CSV",     hint: "12,402 contacts ready" },
      { value: "segment", label: "Saved segment",  hint: "Dormant Traders · 90d" },
      { value: "api",     label: "Runtime API",    hint: "Pushed via webhook" },
    ],
  },
  {
    id: "primary",
    title: "Primary outreach channel?",
    subtitle: "Pi will preconfigure the action node.",
    options: [
      { value: "whatsapp", label: "WhatsApp",       hint: "Template: reactivate_v3" },
      { value: "voice",    label: "AI Voice Agent", hint: "Agent: Aria · conversational" },
      { value: "sms",      label: "SMS",            hint: "Sender ID: PICOMM" },
    ],
  },
  {
    id: "fallback",
    title: "If there's no reply, what next?",
    subtitle: "Fallback branch after the primary attempt.",
    options: [
      { value: "voice", label: "Switch to AI Voice", hint: "Higher-intent rescue call" },
      { value: "sms",   label: "Send SMS reminder",  hint: "Lightweight nudge" },
      { value: "end",   label: "End journey",        hint: "No fallback step" },
    ],
  },
  {
    id: "delay",
    title: "Wait window between attempts?",
    subtitle: "Used for the Delay node between primary and fallback.",
    options: [
      { value: "1h",  label: "1 hour",   hint: "Aggressive" },
      { value: "24h", label: "24 hours", hint: "Balanced — recommended" },
      { value: "48h", label: "48 hours", hint: "Conservative" },
    ],
  },
];

/* -------------------------------------------------------- */
/* Plan builder                                              */
/* -------------------------------------------------------- */

type ChannelKind = "whatsapp" | "voice" | "sms";

const GOAL_NAMES: Record<string, string> = {
  reactivation: "Dormant Reactivation",
  onboarding:   "New Trader Onboarding",
  winback:      "High-Value Win-Back",
  kyc:          "KYC Drop-off Recovery",
};

const AUDIENCE_SUB: Record<string, string> = {
  csv:     "CSV · 12,402 contacts",
  segment: "Segment · Dormant 90d",
  api:     "Runtime API · webhook",
};

const CHANNEL_TITLE: Record<ChannelKind, string> = {
  whatsapp: "WhatsApp",
  voice:    "AI Voice Agent",
  sms:      "SMS",
};

const CHANNEL_SUB: Record<ChannelKind, string> = {
  whatsapp: "Template: reactivate_v3",
  voice:    "Agent: Aria · Hindi+English",
  sms:      "Sender ID: PICOMM",
};

const CHANNEL_NODE_KIND: Record<ChannelKind, WorkflowNodeData["kind"]> = {
  whatsapp: "whatsapp",
  voice:    "voiceCall",
  sms:      "sms",
};

export type AskPiPlan = {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  name: string;
};

export function buildPlan(answers: Record<string, string>): AskPiPlan {
  const goal = answers.goal ?? "reactivation";
  const audience = answers.audience ?? "csv";
  const primary = (answers.primary ?? "whatsapp") as ChannelKind;
  const fallback = answers.fallback ?? "voice";
  const delay = answers.delay ?? "24h";

  const nodes: Node<WorkflowNodeData>[] = [
    { id: "start",    type: "workflow", position: { x: 0,    y: 0   },
      data: { kind: "start", title: "Start", locked: true, valid: true } },
    { id: "audience", type: "workflow", position: { x: 0,    y: 120 },
      data: { kind: "audience", title: "Audience", subtitle: AUDIENCE_SUB[audience], valid: true } },
    { id: "primary",  type: "workflow", position: { x: 0,    y: 240 },
      data: { kind: CHANNEL_NODE_KIND[primary], title: CHANNEL_TITLE[primary], subtitle: CHANNEL_SUB[primary], valid: true } },
    { id: "delay",    type: "workflow", position: { x: 0,    y: 360 },
      data: { kind: "delay", title: "Delay", subtitle: delay, valid: true } },
  ];
  const edges: Edge[] = [
    { id: "e_start_aud",   source: "start",    target: "audience" },
    { id: "e_aud_primary", source: "audience", target: "primary"  },
    { id: "e_primary_dly", source: "primary",  target: "delay"    },
  ];

  if (fallback === "end") {
    nodes.push({ id: "end", type: "workflow", position: { x: 0, y: 480 },
      data: { kind: "end", title: "End", locked: true, valid: true } });
    edges.push({ id: "e_dly_end", source: "delay", target: "end" });
  } else {
    const fb = fallback as ChannelKind;
    nodes.push({
      id: "fallback", type: "workflow", position: { x: 0, y: 480 },
      data: { kind: CHANNEL_NODE_KIND[fb], title: CHANNEL_TITLE[fb], subtitle: CHANNEL_SUB[fb], valid: true },
    });
    nodes.push({ id: "end", type: "workflow", position: { x: 0, y: 600 },
      data: { kind: "end", title: "End", locked: true, valid: true } });
    edges.push({ id: "e_dly_fb",  source: "delay",    target: "fallback" });
    edges.push({ id: "e_fb_end",  source: "fallback", target: "end" });
  }

  // Plan ships positionless + routed edges; the build phase runs the async ELK
  // layout (see the building effect) so the animation and the materialized
  // canvas match the rest of the builder.
  const routedEdges = edges.map((e) => ({ ...e, type: "routed" as const }));

  return { nodes, edges: routedEdges, name: GOAL_NAMES[goal] ?? "AI-built campaign" };
}

export function buildSkeleton(plan: AskPiPlan): AskPiPlan {
  return {
    name: plan.name,
    nodes: plan.nodes.map((n) => ({
      ...n,
      draggable: false,
      selectable: false,
      data: {
        ...n.data,
        title: "",
        subtitle: undefined,
        error: undefined,
        valid: true,
        building: true,
      },
    })),
    edges: plan.edges.map((e) => ({ ...e, animated: false, style: { opacity: 0.25 } })),
  };
}

export const BUILD_STEPS = [
  "Analyzing your answers…",
  "Selecting node primitives…",
  "Wiring edges & fallback branch…",
  "Validating minimum config…",
  "Materializing workflow on canvas…",
];

/* -------------------------------------------------------- */
/* Inline wizard body — rendered inside the Ask Pi widget    */
/* -------------------------------------------------------- */

export type WizardPhase = "asking" | "review" | "building" | "done";

export function AskPiWizardBody({
  active,
  onSkeleton,
  onBuild,
  onPhaseChange,
}: {
  /** When false, the wizard resets and pauses its timers. */
  active: boolean;
  onSkeleton: (skeleton: AskPiPlan) => void;
  onBuild: (plan: AskPiPlan) => void;
  onPhaseChange?: (phase: WizardPhase) => void;
}) {
  const [phase, setPhase] = useState<WizardPhase>("asking");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [buildStepIdx, setBuildStepIdx] = useState(0);
  const [draftPlan, setDraftPlan] = useState<AskPiPlan | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (active) {
      setPhase("asking");
      setStep(0);
      setAnswers({});
      setBuildStepIdx(0);
      setDraftPlan(null);
      finishedRef.current = false;
    }
  }, [active]);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  useEffect(() => {
    if (!active || phase !== "building") return;
    let cancelled = false;
    let tick: ReturnType<typeof setInterval> | undefined;
    let finish: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const base = draftPlan ?? buildPlan(answers);
      // Run the async ELK layout once, then drive both the skeleton animation
      // and the final build off the laid-out graph so they line up cleanly.
      const laid = await elkLayout(base.nodes, base.edges);
      if (cancelled) return;
      const plan = { ...base, nodes: laid.nodes, edges: laid.edges };
      onSkeleton(buildSkeleton(plan));
      tick = setInterval(() => {
        setBuildStepIdx((i) => Math.min(i + 1, BUILD_STEPS.length - 1));
      }, 900);
      finish = setTimeout(() => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        onBuild(plan);
        setPhase("done");
      }, 5000);
    })();
    return () => { cancelled = true; if (tick) clearInterval(tick); if (finish) clearTimeout(finish); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, phase]);

  const handlePick = (qid: string, value: string) => {
    const next = { ...answers, [qid]: value };
    setAnswers(next);
    if (step < QUESTIONS.length - 1) {
      setTimeout(() => setStep((s) => s + 1), 180);
    } else {
      setTimeout(() => {
        setDraftPlan(buildPlan(next));
        setPhase("review");
      }, 220);
    }
  };

  const q = phase === "asking" ? QUESTIONS[step] : null;

  // Unified progress across asking → review → building
  const totalUnits = QUESTIONS.length + 1 + BUILD_STEPS.length;
  let completed = 0;
  if (phase === "asking") completed = step;
  else if (phase === "review") completed = QUESTIONS.length;
  else if (phase === "building") completed = QUESTIONS.length + 1 + buildStepIdx;
  else completed = totalUnits;
  const progress = (completed / totalUnits) * 100;

  const headerTitle =
    phase === "asking" ? "Ask Pi · Campaign builder"
    : phase === "review" ? "Ask Pi · Review draft"
    : "Pi is building your campaign";
  const headerSubtitle =
    phase === "asking" ? `Step ${step + 1} of ${QUESTIONS.length} · pick an option to continue`
    : phase === "review" ? "Approve to build on canvas"
    : BUILD_STEPS[buildStepIdx];

  return (
    <div className="animate-fade-in">
      {/* Header strip */}
      <div className="flex items-center gap-2.5 px-5 pb-2 pt-3.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ai/10">
          {phase === "building"
            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" />
            : <Sparkles className="h-3.5 w-3.5 text-ai" />}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[12.5px] font-medium text-foreground">{headerTitle}</p>
          <p className="truncate text-[11px] text-muted-foreground">{headerSubtitle}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="h-[2px] w-full bg-secondary">
        <div className="h-full bg-ai transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {phase === "asking" && q && (
        <div className="px-5 pb-4 pt-4">
          <h3 className="text-[14.5px] font-semibold leading-snug text-foreground">{q.title}</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{q.subtitle}</p>

          <div className="mt-3 grid grid-cols-1 gap-1.5">
            {q.options.map((opt) => {
              const selected = answers[q.id] === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handlePick(q.id, opt.value)}
                  className={cn(
                    "group flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-all",
                    selected
                      ? "border-ai/60 ring-2 ring-ai/20"
                      : "border-border hover:border-ai/40 hover:bg-ai/[0.03]",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">{opt.label}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{opt.hint}</p>
                  </div>
                  <div className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all",
                    selected
                      ? "border-ai bg-ai text-ai-foreground"
                      : "border-border bg-secondary text-muted-foreground group-hover:border-ai/60 group-hover:text-ai",
                  )}>
                    {selected ? <Check className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
                  </div>
                </button>
              );
            })}
          </div>

          {step > 0 && (
            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-3 w-3" /> Back
              </button>
              <p className="text-[10.5px] text-muted-foreground">Click an option to continue</p>
            </div>
          )}
        </div>
      )}

      {phase === "review" && draftPlan && (
        <div className="px-5 pb-4 pt-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai/5 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-ai">
              <Sparkles className="h-3 w-3" /> Draft
            </span>
            <span className="truncate text-[12px] font-medium text-foreground">{draftPlan.name}</span>
          </div>
          <h3 className="mt-2 text-[14.5px] font-semibold leading-snug text-foreground">
            Here's the campaign I'll build
          </h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Review the steps, then approve to materialize on the canvas.
          </p>

          <ol className="mt-3 space-y-1.5">
            {draftPlan.nodes
              .filter((n) => n.data.kind !== "start" && n.data.kind !== "end")
              .map((n, i) => (
                <li
                  key={n.id}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ai/40 bg-ai/5 text-[11px] font-semibold text-ai">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">{n.data.title}</p>
                    {n.data.subtitle && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{n.data.subtitle}</p>
                    )}
                  </div>
                </li>
              ))}
          </ol>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              onClick={() => {
                setDraftPlan(null);
                setPhase("asking");
                setStep(0);
              }}
              className="rounded-md px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              Edit answers
            </button>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setDraftPlan(null);
                  setPhase("asking");
                  setStep(QUESTIONS.length - 1);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-3 w-3" /> Back
              </button>
              <button
                onClick={() => setPhase("building")}
                className="inline-flex items-center gap-1.5 rounded-md bg-ai px-3 py-1.5 text-[11.5px] font-medium text-ai-foreground shadow-[0_8px_20px_-8px_color-mix(in_oklch,var(--ai)_55%,transparent)] hover:opacity-90"
              >
                <Check className="h-3 w-3" /> Approve &amp; build
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "building" && (
        <div className="px-5 pb-4 pt-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-ai" />
            <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
              Build trace
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {BUILD_STEPS.map((s, i) => (
              <li
                key={s}
                className={cn(
                  "flex items-center gap-2 text-[12px] transition-colors",
                  i < buildStepIdx
                    ? "text-muted-foreground"
                    : i === buildStepIdx
                      ? "text-foreground"
                      : "text-muted-foreground/50",
                )}
              >
                {i < buildStepIdx ? (
                  <Check className="h-3 w-3 text-success" />
                ) : i === buildStepIdx ? (
                  <Loader2 className="h-3 w-3 animate-spin text-ai" />
                ) : (
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                )}
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
