/**
 * Ask Pi Developer chat — multi-turn Q&A over the API Docs and Release Notes
 * on /developer.
 *
 * Why a dedicated shell (mirroring IntegrationsChat / AnalyticsChat) instead
 * of the single-shot PiResultCard the rest of the dock uses:
 *
 * - This is a Q&A surface, not a propose-a-change surface. The user's
 *   question should stay on screen next to Pi's answer; the composer
 *   should never vanish; follow-ups are the whole point.
 * - RAG answers are markdown-heavy (bold section names, inline-code field /
 *   header / endpoint names, deep links). A chat transcript renders that
 *   natively via renderChatMarkdown; the result-card path treats every reply
 *   as one opaque paragraph.
 * - Persona / harness: Pi introduces itself with an intro turn on mount that
 *   spells out what it can and can't help with on this surface, so the user
 *   isn't left guessing at scope.
 *
 * Session-only history (no D1 persistence — matches IntegrationsChat and
 * AnalyticsChat).
 */
import { useEffect, useRef, useState } from "react";
import { Sparkle, ArrowUp, Square, X, Loader2, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { askPi } from "@/lib/server-fns/pi-llm";
import { renderChatMarkdown } from "@/lib/chat-markdown";
import { usePiSurfaceHintValue } from "@/lib/pi-screen-actions";

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

/**
 * Pi's opening turn. Non-negotiable capability statement so the user
 * never wastes a question on something Pi can't do here. Written in
 * first-person because the rest of the shell is a chat — a static
 * "About this Pi" ribbon would break the frame.
 */
const INTRO_TURN: Turn = {
  id: "intro",
  role: "assistant",
  text: "Hi, I'm Pi. On this page I can answer questions about the **API Docs** and **Release Notes** — endpoints, authentication, webhooks, error codes, rate limits, idempotency, and what shipped when. Ask me anything from those two and I'll cite the section I'm reading from.\n\nWhat I **can't** help with here: analytics, campaign edits, agent authoring, workspace settings, connecting third-party vendors. Head to the matching surface for those and I'll be more useful.",
};

const STARTER_CHIPS: string[] = [
  "How do I authenticate my API calls?",
  "What's the Idempotency-Key TTL?",
  "What shipped on 25 August 2026?",
];

export function DeveloperChat({ onClose }: { onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([INTRO_TURN]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [transcriptHeight, setTranscriptHeight] = useState(420);

  // Current Developer tab, published by src/routes/developer.tsx via
  // `usePiSurfaceHint`. Shown in the ribbon AND prefixed onto every
  // question so Pi knows which sub-surface the user is looking at.
  // Falls back to null when the route hasn't published (defensive; the
  // route publishes on mount so this should always be a string in
  // practice).
  const currentTab = usePiSurfaceHintValue();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);

  // Match IntegrationsChat / AnalyticsChat's drag-to-resize header — same
  // interaction pattern so users don't have to relearn it across surfaces.
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

  // Auto-scroll to the latest turn (or thinking indicator) whenever the
  // transcript grows. Smooth, not instant, so the transition reads as a chat.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns, thinking]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (q: string) => {
    const query = q.trim();
    if (!query || thinking) return;
    setInput("");
    // What the user sees in their own bubble = exactly what they typed.
    const userTurn: Turn = { id: `u-${Date.now()}`, role: "user", text: query };
    setTurns((prev) => [...prev, userTurn]);
    setThinking(true);
    try {
      // History = every prior real turn, minus the intro (Pi's opening turn
      // is scaffolding; sending it back would waste tokens and might
      // confuse the model into re-introducing itself). The server surface
      // has its own system prompt, so this is purely conversational memory.
      const history = turns
        .filter((t) => t.id !== "intro")
        .map((t) => ({ role: t.role, content: t.text }));
      // What we send to Pi = tab-prefixed question. The system prompt
      // teaches Pi to parse the leading "[User is on the <tab> tab]" hint
      // as routing context (Release Notes → list_releases, API Docs →
      // search_docs, APIs & Webhooks → docs Q&A about auth / keys /
      // webhook registration) without quoting it back. Prefixing keeps
      // the wire schema unchanged — no extra field, no server-side plumb.
      const prefixed = currentTab ? `[User is on the ${currentTab} tab] ${query}` : query;
      const r = await askPi({
        data: {
          scope: "developer",
          question: prefixed,
          history,
        },
      });
      if (r.ok && r.answer.trim().length > 0) {
        setTurns((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", text: r.answer },
        ]);
      } else {
        setTurns((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: !r.ok
              ? `Something went wrong reaching the docs (\`${r.error}\`). Try that again in a moment.`
              : "Pi came back with nothing — try rephrasing the question.",
          },
        ]);
      }
    } catch (e) {
      setTurns((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: `Pi ran into an error: \`${(e as Error).message}\`. Try again.`,
        },
      ]);
    } finally {
      setThinking(false);
      // Return focus to the composer so the next turn starts typing immediately.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden">
      {/* Header — draggable resize handle + close. Mirrors IntegrationsChat /
          AnalyticsChat so the three chat surfaces feel like siblings. */}
      <div
        onMouseDown={onResizeMouseDown}
        className="flex cursor-ns-resize select-none items-center justify-between border-b border-border bg-card/80 px-4 py-2 hover:bg-accent/40"
        title="Drag to resize"
      >
        <div className="flex items-center gap-1.5">
          <Sparkle className="h-3.5 w-3.5 fill-ai text-ai" />
          <span className="text-[12px] font-medium text-foreground">Ask Pi</span>
          <span className="ml-1 rounded border border-border/60 bg-background/60 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Docs
          </span>
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

      {/* Scope ribbon — non-technical, always visible. Same shape as the
          integrations and analytics "Answering about" ribbons so the three
          chats read as a consistent pattern. When the route publishes a
          tab hint (via usePiSurfaceHint), we tag it on the right side so
          the user sees which sub-surface Pi is anchored to right now. */}
      <div className="border-b border-border/60 bg-muted/30 px-4 py-1.5">
        <div className="flex items-baseline gap-1.5 text-[11.5px] leading-snug">
          <span className="shrink-0 text-muted-foreground">Answering about</span>
          <span className="min-w-0 truncate font-medium text-foreground">
            the API Docs and Release Notes
          </span>
          {currentTab && (
            <span className="ml-auto shrink-0 rounded border border-border/60 bg-background/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              on {currentTab}
            </span>
          )}
        </div>
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        style={{ height: transcriptHeight }}
        className="scrollbar-thin min-h-0 space-y-3 overflow-y-auto px-4 py-3"
      >
        {turns.map((t) =>
          t.role === "user" ? (
            <UserBubble key={t.id} text={t.text} />
          ) : (
            <AssistantBubble key={t.id} text={t.text} isIntro={t.id === "intro"} />
          ),
        )}

        {/* Starter chips render after the intro turn only, and only until
            the user has spoken. Once a real conversation is underway they
            get out of the way. */}
        {turns.length === 1 && !thinking && (
          <StarterChips chips={STARTER_CHIPS} onPick={submit} />
        )}

        {thinking && <ThinkingBubble />}
      </div>

      {/* Composer — always visible, always focused after a turn. */}
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
            placeholder="Ask about the API docs or release notes…"
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

/* ---------- sub-components -------------------------------------------------- */

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-foreground px-3 py-1.5 text-[12.5px] leading-relaxed text-background">
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({ text, isIntro }: { text: string; isIntro?: boolean }) {
  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "max-w-[92%] rounded-2xl rounded-bl-sm border px-3 py-2 text-[12.5px] leading-relaxed text-foreground",
          isIntro
            ? "border-ai/25 bg-ai/[0.04]"
            : "border-border bg-card",
        )}
      >
        <div className="mb-1 flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
          <Sparkle className="h-3 w-3 fill-ai text-ai" />
          {isIntro ? "Pi — intro" : "Pi"}
        </div>
        <div className="prose-none">{renderChatMarkdown(text)}</div>
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Searching the developer docs…
      </div>
    </div>
  );
}

function StarterChips({ chips, onPick }: { chips: string[]; onPick: (s: string) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Try</div>
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
    </div>
  );
}
