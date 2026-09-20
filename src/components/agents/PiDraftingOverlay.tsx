import { useEffect, useMemo, useState } from "react";
import { Sparkle } from "lucide-react";

/**
 * Builder-local "Pi is drafting..." bubble.
 *
 * AgentBuilder is a full-screen self-contained layout that does NOT mount
 * AppShell, so the global AskPiDock (and its PiDraftingPill) never renders
 * on /agents/$id. This component fills that gap: same visual language as
 * PiDraftingPill (pulsing sparkle, elapsed timer, rotating step microcopy),
 * fixed at bottom-centre so it lives in the same visual slot Pi occupies
 * everywhere else.
 *
 * When Pi's save arrives and the shell hydrates, the parent stops rendering
 * this and the bubble fades.
 *
 * `startedAt` defaults to first-mount time so the timer is honest even
 * when the parent doesn't track when the draft began.
 */
const DRAFT_STEPS = [
  "Picking a persona",
  "Drafting the call flow",
  "Setting pronunciation rules",
  "Wiring the tools",
  "Composing objections",
  "Writing the knowledge base",
  "Adding post-call variables",
  "Finalising guardrails",
];

const EDIT_STEPS = [
  "Reading the current agent",
  "Deciding what to change",
  "Rewriting the section",
  "Saving the update",
];

export type PiOverlayVerb = "drafting" | "updating";

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PiDraftingOverlay({
  label,
  startedAt,
  verb = "drafting",
}: {
  label?: string;
  startedAt?: number;
  verb?: PiOverlayVerb;
}) {
  const started = useMemo(() => startedAt ?? Date.now(), [startedAt]);
  const [now, setNow] = useState(() => Date.now());
  const [stepIndex, setStepIndex] = useState(0);
  const steps = verb === "updating" ? EDIT_STEPS : DRAFT_STEPS;

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const step = setInterval(() => setStepIndex((i) => (i + 1) % steps.length), 1800);
    return () => {
      clearInterval(tick);
      clearInterval(step);
    };
  }, [steps.length]);

  const elapsed = formatElapsed(now - started);
  const target = label?.trim() || "your agent";
  const verbText = verb === "updating" ? "updating" : "drafting";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div className="pi-drafting-overlay-bubble pointer-events-auto flex max-w-[440px] items-center gap-2.5 rounded-full border border-ai/40 bg-card px-3.5 py-2 text-[12.5px] shadow-[0_10px_30px_-10px_color-mix(in_oklch,var(--ai)_55%,transparent)] animate-slide-up">
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-ai/25 pi-drafting-overlay-pulse" />
          <Sparkle className="relative h-3.5 w-3.5 fill-ai text-ai" />
        </span>
        <span className="min-w-0 truncate font-medium text-foreground">
          Pi is {verbText} <span className="font-mono">{target}</span>
        </span>
        <span className="shrink-0 rounded-md border border-border bg-background/70 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
          {elapsed}
        </span>
        <span className="hidden shrink-0 truncate text-[11.5px] text-muted-foreground sm:inline">
          · {steps[stepIndex]}…
        </span>
      </div>
      <style>{`
        @keyframes piDraftingOverlayPulse {
          0%, 100% { transform: scale(1);    opacity: 0.55; }
          50%      { transform: scale(1.45); opacity: 0.15; }
        }
        .pi-drafting-overlay-pulse { animation: piDraftingOverlayPulse 1.6s ease-in-out infinite; }
        @keyframes piDraftingOverlayGlow {
          0%, 100% { box-shadow: 0 10px 30px -12px color-mix(in oklch, var(--ai) 40%, transparent); }
          50%      { box-shadow: 0 16px 44px -10px color-mix(in oklch, var(--ai) 75%, transparent); }
        }
        .pi-drafting-overlay-bubble { animation: piDraftingOverlayGlow 2.4s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

/**
 * Section-level shimmer strip. Overlays the master-prompt / knowledge-base /
 * post-call textareas while the shell is empty and Pi is generating. Layered
 * absolutely so it dims + shimmers the empty area without shifting layout.
 */
export function PiDraftingShimmer() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
      <div className="pi-shimmer-sweep absolute inset-0" />
      <style>{`
        @keyframes piShimmerSweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .pi-shimmer-sweep {
          background: linear-gradient(
            90deg,
            transparent 0%,
            color-mix(in oklch, var(--ai) 12%, transparent) 45%,
            color-mix(in oklch, var(--ai) 18%, transparent) 50%,
            color-mix(in oklch, var(--ai) 12%, transparent) 55%,
            transparent 100%
          );
          animation: piShimmerSweep 1.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
