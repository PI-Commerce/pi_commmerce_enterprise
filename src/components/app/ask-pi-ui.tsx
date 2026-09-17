// Shared Ask Pi UI — one visual language for the assistant everywhere it appears.
//
// Both the omnipresent global dock (AskPiDock, on shell pages) and the in-canvas
// composer (AiComposer, on the campaign builder) render these exact primitives, so
// the pill, the expanded panel chrome, the "thinking" trace, the result card, the
// suggestion chips, the send button and the drag behaviour stay identical and can't
// drift apart. Each surface keeps its own orchestration (routing, wizard, nudges);
// only the look-and-feel lives here.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { ArrowUp, Square, Check, Loader2, Sparkle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PiResult } from "@/lib/ask-pi-context";

// ---- Shared floating geometry ----
export const PI_EXPANDED_W = 680;
const PI_EDGE_BUFFER = 48;
const PI_DRAG_THRESHOLD = 4;
const PI_DRAG_STORE_KEY = "pi_composer_x";

export type PiPillHandlers = {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
};

/**
 * Horizontal-only drag for the floating pill — clamped so the widest expanded view
 * keeps an edge buffer and never clips. Shared by the dock and the canvas composer
 * (one localStorage key) so Pi remembers a single position across surfaces.
 */
export function usePiDrag(wrapRef: RefObject<HTMLElement | null>) {
  const [dragX, setDragX] = useState(0);
  const dragRef = useRef<{ startX: number; baseX: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const clampX = (x: number) => {
    const w = wrapRef.current?.offsetWidth ?? (typeof window !== "undefined" ? window.innerWidth : PI_EXPANDED_W);
    const max = Math.max(0, (w - PI_EXPANDED_W) / 2 - PI_EDGE_BUFFER);
    return Math.min(max, Math.max(-max, x));
  };

  // Restore persisted offset (clamped to the current viewport) on mount.
  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(PI_DRAG_STORE_KEY) : null;
    if (raw != null) setDragX(clampX(parseFloat(raw) || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-clamp on resize so the expanded panel never drifts off-screen.
  useEffect(() => {
    const onResize = () => setDragX((x) => clampX(x));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pillHandlers: PiPillHandlers = {
    onPointerDown: (e) => {
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
      dragRef.current = { startX: e.clientX, baseX: dragX, moved: false };
    },
    onPointerMove: (e) => {
      const st = dragRef.current;
      if (!st) return;
      const dx = e.clientX - st.startX;
      if (Math.abs(dx) > PI_DRAG_THRESHOLD) st.moved = true;
      if (st.moved) setDragX(clampX(st.baseX + dx));
    },
    onPointerUp: (e) => {
      const st = dragRef.current;
      dragRef.current = null;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      if (st?.moved) {
        suppressClick.current = true; // swallow the click that follows a drag
        setDragX((x) => {
          const c = clampX(x);
          try { window.localStorage.setItem(PI_DRAG_STORE_KEY, String(c)); } catch { /* ignore */ }
          return c;
        });
      }
    },
  };

  return { dragX, pillHandlers, suppressClick };
}

/**
 * Collapsed pill — labeled, draggable, with a ⌘K hint. Identical on every surface.
 * `suppressClick` (from usePiDrag) prevents the click that ends a drag from opening Pi.
 */
export function PiPill({
  onOpen,
  pillHandlers,
  suppressClick,
}: {
  onOpen: () => void;
  pillHandlers: PiPillHandlers;
  suppressClick: RefObject<boolean>;
}) {
  return (
    <button
      {...pillHandlers}
      onClick={() => {
        if (suppressClick.current) { suppressClick.current = false; return; }
        onOpen();
      }}
      className="pointer-events-auto group flex h-9 cursor-grab touch-none items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[12.5px] text-muted-foreground shadow-[0_4px_16px_-6px_rgba(0,0,0,0.15)] transition-[background-color,color] hover:bg-accent hover:text-foreground active:cursor-grabbing animate-slide-up"
      aria-label="Open Ask Pi — drag to reposition"
      title="Drag to reposition · click to open"
    >
      <Sparkle className="h-3.5 w-3.5 fill-ai text-ai" />
      Ask Pi
      <kbd className="ml-0.5 rounded border border-border bg-background px-1 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
    </button>
  );
}

/**
 * Proactive nudge bubble — floats above the collapsed pill (I4). Pulses gently to
 * draw the eye, stops on hover. The label opens Pi; the ✕ dismisses. Shared so the
 * dock and the canvas composer surface nudges with one identical look.
 */
export function PiNudge({
  label,
  onOpen,
  onDismiss,
}: {
  label: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="askpi-nudge-bubble pointer-events-auto relative mb-3 flex max-w-[320px] items-center gap-2 rounded-2xl border border-ai/30 bg-card px-3 py-2 text-[12.5px] font-medium text-foreground shadow-[0_10px_30px_-10px_color-mix(in_oklch,var(--ai)_45%,transparent)] animate-slide-up">
      <button onClick={onOpen} className="flex min-w-0 items-center gap-2 pr-1 text-left" aria-label="Open Ask Pi">
        <Sparkle className="h-3.5 w-3.5 shrink-0 fill-ai text-ai" />
        <span className="truncate">{label}</span>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Dismiss nudge"
      >
        <X className="h-3 w-3" />
      </button>
      {/* tail anchoring the bubble to the pill */}
      <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-ai/30 bg-card" />
      <style>{`
        @keyframes askPiNudgePulse {
          0%, 100% { box-shadow: 0 10px 30px -12px color-mix(in oklch, var(--ai) 30%, transparent); }
          50% { box-shadow: 0 14px 34px -10px color-mix(in oklch, var(--ai) 65%, transparent); }
        }
        .askpi-nudge-bubble { animation: askPiNudgePulse 2.4s ease-in-out infinite; }
        .askpi-nudge-bubble:hover { animation: none; }
      `}</style>
    </div>
  );
}

/** Expanded panel chrome — the rounded card both surfaces pour their body into. */
export function PiPanel({
  innerRef,
  className,
  children,
}: {
  innerRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={innerRef as RefObject<HTMLDivElement>}
      className={cn(
        "pointer-events-auto overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_12px_40px_-12px_rgba(0,0,0,0.22)] ring-4 ring-ai/5 transition-all duration-300 ease-out animate-slide-up",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** "Pi is working…" trace with staggered step reveal. */
export function PiThinking({ steps }: { steps: string[] }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" />
        Paytm Intelligence at work…
      </div>
      <ul className="space-y-1 pl-5">
        {steps.map((s, i) => (
          <li
            key={s}
            className="text-[12px] text-muted-foreground"
            style={{ animation: `fadeIn 0.4s ease-out ${i * 0.45}s both` }}
          >
            • {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Result card — Pi's proposed answer, optional diff, and approve/dismiss controls. */
export function PiResultCard({
  result,
  onAccept,
  onDismiss,
}: {
  result: PiResult;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2">
        <Sparkle className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-ai text-ai" />
        <p className="text-[13px] leading-relaxed text-foreground">{result.text}</p>
      </div>
      {result.diff && result.diff.length > 0 && (
        <div className="rounded-lg border border-ai/30 bg-ai/5 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground">
          {result.diff.map((line, i) => (
            <div key={i}>
              <span className={line.trimStart().startsWith("-") ? "text-destructive" : "text-success"}>
                {line.slice(0, 1)}
              </span>
              {line.slice(1)}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-end gap-1.5">
        <button onClick={onDismiss} className="rounded-md px-2.5 py-1 text-[11.5px] text-muted-foreground hover:text-foreground">
          Dismiss
        </button>
        <button
          onClick={onAccept}
          className="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background"
        >
          <Check className="h-3 w-3" /> {result.cta ?? "Review & apply"}
        </button>
      </div>
    </div>
  );
}

/** Suggestion chips — a "Try …" row below the input. */
export function PiChips({ chips, onPick }: { chips: string[]; onPick: (s: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-2">
      <span className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">Try</span>
      {chips.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className="rounded-full border border-border px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-ai/40 hover:text-foreground"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

/** Send / stop button — arrow to submit, square to halt a run. */
export function PiSendButton({
  thinking,
  disabled,
  onClick,
}: {
  thinking: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all",
        !disabled ? "bg-foreground text-background hover:scale-[1.04]" : "bg-muted text-muted-foreground/60",
      )}
      aria-label={thinking ? "Stop" : "Send"}
    >
      {thinking ? <Square className="h-3 w-3 fill-current" /> : <ArrowUp className="h-4 w-4" />}
    </button>
  );
}

/** Shared input icon — keeps the leading sparkle identical across surfaces. */
export function PiInputIcon() {
  return <Sparkle className="h-3.5 w-3.5 shrink-0 fill-ai text-ai" />;
}
