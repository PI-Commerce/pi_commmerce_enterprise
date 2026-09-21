/**
 * Ask Pi Analytics chat — the multi-turn analytics experience on /analytics.
 *
 * - Multi-turn conversation, session-scoped (no D1 persistence).
 * - Every answer is structured: insight → optional recommendation → optional
 *   infographic (ECharts) → follow-up chips.
 * - Screen context (current filter/tab/selected node) is passed in as a prop
 *   and forwarded to the server fn on every turn, so Pi always grounds in
 *   what the user is actually looking at.
 * - Idle-state starter chips come from generateStarterChips (max 3), cached
 *   per context hash so re-opening the panel doesn't refetch.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkle, Loader2, Download, ArrowUp, Square, X, Lightbulb, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  askPiAnalytics,
  generateStarterChips,
  type AnalyticsAnswer,
  type AnalyticsScreenContext,
} from "@/lib/server-fns/pi-analytics";
import { InfographicRenderer } from "./InfographicRenderer";
import { renderChatMarkdown } from "@/lib/chat-markdown";

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;              // user text OR insight text
  answer?: AnalyticsAnswer;  // assistant only
};

/** Stable key for a screen context so identical shapes hit the same chips cache. */
function contextKey(c: AnalyticsScreenContext): string {
  return JSON.stringify({
    p: c.pathname,
    f: c.filter,
    t: c.tab,
    n: c.selectedNodeId,
  });
}

// In-memory chip cache — survives collapse/expand within a session, dropped on reload.
const CHIP_CACHE = new Map<string, string[]>();

export function AnalyticsChat({
  context,
  onClose,
}: {
  context: AnalyticsScreenContext;
  onClose: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [starterChips, setStarterChips] = useState<string[]>([]);
  const [chipsLoading, setChipsLoading] = useState(false);
  // "Screen changed" nudge — appears when the user changes filters / tab mid-conversation.
  // Carries the freshest chip for the new context so they can pivot in one click.
  const [pendingNudge, setPendingNudge] = useState<string | null>(null);
  const [dismissedNudgeKey, setDismissedNudgeKey] = useState<string | null>(null);
  // Vertical resize on the header — same interaction as the canvas AiComposer.
  // Dragging up grows the transcript, dragging down shrinks it. Clamped so it
  // can't collapse or eat the viewport.
  const [transcriptHeight, setTranscriptHeight] = useState(420);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const onResizeMouseDown = (e: React.MouseEvent) => {
    resizeRef.current = { startY: e.clientY, startH: transcriptHeight };
    e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startY - e.clientY;
      const next = Math.max(220, Math.min(window.innerHeight - 220, resizeRef.current.startH + delta));
      setTranscriptHeight(next);
    };
    const onUp = () => { resizeRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevCtxKeyRef = useRef<string | null>(null);

  const ctxKey = useMemo(() => contextKey(context), [context]);

  // Fetch starter chips whenever the screen context changes (cached). Also
  // surface a "screen changed" nudge if the user is already in a conversation.
  useEffect(() => {
    const prev = prevCtxKeyRef.current;
    prevCtxKeyRef.current = ctxKey;

    const cached = CHIP_CACHE.get(ctxKey);
    const promoteNudge = (chips: string[]) => {
      // Only nudge on ACTUAL context changes AND when the user has already
      // asked at least one question — the empty state already shows chips.
      if (prev && prev !== ctxKey && turns.length > 0 && chips[0]) {
        setPendingNudge(chips[0]);
        setDismissedNudgeKey(null);
      }
    };

    if (cached) {
      setStarterChips(cached);
      promoteNudge(cached);
      return;
    }
    let cancelled = false;
    setChipsLoading(true);
    generateStarterChips({ data: context })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          CHIP_CACHE.set(ctxKey, r.chips);
          setStarterChips(r.chips);
          promoteNudge(r.chips);
        } else {
          setStarterChips([]);
        }
      })
      .catch(() => { if (!cancelled) setStarterChips([]); })
      .finally(() => { if (!cancelled) setChipsLoading(false); });
    return () => { cancelled = true; };
    // turns.length intentionally left out — we snapshot at effect time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxKey, context]);

  // Auto-scroll to bottom on new turn.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, thinking]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (q: string) => {
    const query = q.trim();
    if (!query || thinking) return;
    setInput("");
    setPendingNudge(null);
    const userTurn: Turn = { id: `u-${Date.now()}`, role: "user", text: query };
    setTurns((prev) => [...prev, userTurn]);
    setThinking(true);
    try {
      // History = only prior user/assistant text pairs (skip infographics, chips).
      const history = turns.map((t) => ({
        role: t.role,
        content: t.role === "assistant" ? (t.answer?.insight ?? t.text) : t.text,
      }));
      const r = await askPiAnalytics({
        data: { question: query, context, history },
      });
      if (r.ok) {
        setTurns((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", text: r.answer.insight, answer: r.answer },
        ]);
      } else {
        setTurns((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: "Something went wrong. Try again?",
            answer: { insight: `Error: ${r.error}`, followUps: [] },
          },
        ]);
      }
    } catch (e) {
      setTurns((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: "Something went wrong. Try again?",
          answer: { insight: `Error: ${(e as Error).message}`, followUps: [] },
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const ribbon = friendlyContextLine(context);

  return (
    <div className="flex min-h-0 flex-col">
      {/* header — doubles as the vertical resize handle (drag to grow / shrink
          the transcript, same interaction as the canvas AiComposer). */}
      <div
        onMouseDown={onResizeMouseDown}
        title="Drag to resize"
        className="flex cursor-ns-resize items-center justify-between border-b border-border px-4 py-2.5 select-none"
      >
        <div className="flex items-center gap-1.5">
          <Sparkle className="h-3.5 w-3.5 fill-ai text-ai" />
          <span className="text-[12px] font-medium text-foreground">Ask Pi</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Close"
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* persistent context ribbon — always visible, human names, non-technical.
          Tells the user "what I'm answering about" so they never wonder. */}
      <div className="border-b border-border/60 bg-muted/30 px-4 py-1.5">
        <div className="flex items-baseline gap-1.5 text-[11.5px] leading-snug">
          <span className="shrink-0 text-muted-foreground">Answering about</span>
          <span className="min-w-0 truncate font-medium text-foreground" title={ribbon.full}>
            {ribbon.compact}
          </span>
        </div>
      </div>

      {/* transcript — height driven by the header drag-resize state */}
      <div
        ref={scrollRef}
        style={{ height: transcriptHeight }}
        className="scrollbar-thin min-h-0 overflow-y-auto px-4 py-3 space-y-3"
      >
        {turns.length === 0 && !thinking && (
          <EmptyState chips={starterChips} loading={chipsLoading} onPick={submit} />
        )}

        {turns.map((t) =>
          t.role === "user" ? <UserBubble key={t.id} text={t.text} /> : <AssistantBubble key={t.id} answer={t.answer!} onPick={submit} />,
        )}

        {thinking && <ThinkingBubble />}
      </div>

      {/* screen-changed nudge — surfaces mid-conversation when the user
          switches filters/tab. Carries the freshest chip for the new context. */}
      {pendingNudge && dismissedNudgeKey !== ctxKey && turns.length > 0 && (
        <div className="border-t border-ai/20 bg-ai/[0.04] px-3 py-1.5 animate-fade-in">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-3 w-3 shrink-0 text-ai" />
            <span className="shrink-0 text-[10.5px] uppercase tracking-wider text-ai">Screen changed</span>
            <button
              onClick={() => { const q = pendingNudge; setPendingNudge(null); submit(q); }}
              className="min-w-0 flex-1 truncate rounded-md border border-ai/30 bg-card px-2 py-1 text-left text-[11.5px] text-foreground transition-colors hover:border-ai/60 hover:bg-ai/[0.06]"
            >
              {pendingNudge}
            </button>
            <button
              onClick={() => { setDismissedNudgeKey(ctxKey); setPendingNudge(null); }}
              aria-label="Dismiss"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      )}

      {/* composer */}
      <div className="border-t border-border px-3 py-2">
        <div className="flex items-end gap-2">
          <Sparkle className="mb-1.5 h-3.5 w-3.5 shrink-0 fill-ai text-ai" />
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); }
            }}
            placeholder="Ask about this run, channel, funnel, or trend…"
            className="scrollbar-thin max-h-32 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          />
          <button
            onClick={() => (thinking ? undefined : submit(input))}
            disabled={!input.trim() && !thinking}
            aria-label={thinking ? "Working…" : "Send"}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all",
              (!input.trim() && !thinking) ? "bg-muted text-muted-foreground/60"
              : thinking ? "bg-muted text-muted-foreground"
              : "bg-foreground text-background hover:scale-[1.04]",
            )}
          >
            {thinking ? <Square className="h-3 w-3 fill-current" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- sub-components ------------------------------------------------ */

function EmptyState({
  chips,
  loading,
  onPick,
}: {
  chips: string[];
  loading: boolean;
  onPick: (s: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          {loading ? "Reading your screen…" : "Suggested"}
        </div>
        {loading && <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Generating suggestions…</div>}
        {!loading && chips.length === 0 && (
          <div className="text-[12px] text-muted-foreground">Ask anything about the data on this screen.</div>
        )}
        {!loading && chips.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {chips.map((c) => (
              <button
                key={c}
                onClick={() => onPick(c)}
                className="group flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-[12.5px] text-foreground transition-colors hover:border-ai/40 hover:bg-ai/[0.03]"
              >
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-ai" />
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-foreground px-3 py-1.5 text-[12.5px] leading-relaxed text-background">
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({
  answer,
  onPick,
}: {
  answer: AnalyticsAnswer;
  onPick: (s: string) => void;
}) {
  const captureRef = useRef<HTMLDivElement>(null);
  const download = async () => {
    if (!captureRef.current) return;
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(captureRef.current, { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `pi-analytics-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast.error("Could not export PNG", { description: (err as Error).message });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <Sparkle className="mt-1 h-3.5 w-3.5 shrink-0 fill-ai text-ai" />
        <div className="text-[13px] leading-relaxed text-foreground">{renderChatMarkdown(answer.insight)}</div>
      </div>

      {answer.recommendation && (
        <div className="ml-5 rounded-lg border border-ai/25 bg-gradient-to-br from-ai/[0.06] to-ai/[0.02] px-3 py-2 text-[12.5px] leading-relaxed text-foreground shadow-[0_1px_0_0_color-mix(in_oklch,var(--ai)_10%,transparent)]">
          <div className="mb-1 flex items-center gap-1.5">
            <Sparkle className="h-3 w-3 fill-ai text-ai" />
            <span className="text-[10.5px] font-semibold tracking-wide text-ai">Pi recommends</span>
          </div>
          <div>{renderChatMarkdown(answer.recommendation)}</div>
        </div>
      )}

      {answer.infographic && (
        <div className="ml-5 space-y-1">
          <div ref={captureRef}>
            <InfographicRenderer spec={answer.infographic} />
          </div>
          <div className="flex justify-end">
            <button
              onClick={download}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground"
            >
              <Download className="h-2.5 w-2.5" /> PNG
            </button>
          </div>
        </div>
      )}

      {answer.followUps.length > 0 && (
        <div className="ml-5 flex flex-wrap gap-1.5 pt-0.5">
          {answer.followUps.map((f) => (
            <button
              key={f}
              onClick={() => onPick(f)}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-ai/40 hover:text-foreground"
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" />
      Paytm Intelligence at work…
    </div>
  );
}

/* ---------- helpers ------------------------------------------------------- */

/**
 * Non-technical one-liner for the persistent ribbon. Prefers HUMAN labels
 * (campaign / run / channel names, formatted dates) over raw ids. Falls back
 * to something generic if the page hasn't published labels yet.
 *
 * Returned as { compact, full } so the ribbon can show a truncated line and
 * expose the full text as a tooltip.
 */
function friendlyContextLine(c: AnalyticsScreenContext): { compact: string; full: string } {
  const L = c.labels ?? {};
  const parts: string[] = [];
  if (L.channelLabel) parts.push(L.channelLabel);
  // Asset-mode (View by Template / Agent) and Broadcast-mode span multiple
  // runs — surface the asset/broadcast name instead of a campaign/run pair
  // so the user sees exactly what scope Pi is answering against.
  if (L.modeLabel && L.assetLabel) {
    parts.push(`${L.modeLabel} ${L.assetLabel}`);
  } else {
    if (L.campaignName) parts.push(L.campaignName);
    else if (c.filter?.campaignId) parts.push("this campaign");
    if (L.runLabel) parts.push(L.runLabel);
  }
  const head = parts.join(" · ");
  const range = L.rangeLabel ? ` — ${L.rangeLabel}` : "";
  const line = head ? `${head}${range}` : "your whole workspace";
  return { compact: line, full: line };
}
