// Ask Pi — the landing chat experience (home route).
//
// A ChatGPT/Claude-style conversation that is the workspace's front door. It keeps
// a Chats rail (saved threads, like Vapi's Threads) so sessions persist and can be
// revisited. Empty state: a centered hero with a composer and a few starters. Once
// you send, the thread fills with your messages, Pi's "drafting" trace, then a reply
// that can carry a campaign or agent artifact card you open in the builder.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUp, Sparkle, Sparkles, Megaphone, Bot, BarChart3, Plus, Loader2, Trash2, MessageSquare,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ArtifactCard } from "./ArtifactCard";
import {
  respondToPi,
  buildSeedChats,
  titleFromPrompt,
  relativeTime,
  PI_STARTERS,
  PI_INVITES,
  type Chat,
  type ChatTurn,
  type StarterKind,
  type Starter,
} from "@/lib/ask-pi-chat";
import { cn } from "@/lib/utils";

const STARTER_ICON: Record<StarterKind, React.ComponentType<{ className?: string }>> = {
  campaign: Megaphone,
  agent: Bot,
  analytics: BarChart3,
};

const CHATS_STORE_KEY = "pi_chats";

let idSeq = 0;
const newId = () => `c_${Date.now()}_${idSeq++}`;

function loadChats(): Chat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHATS_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed as Chat[];
    }
  } catch { /* ignore */ }
  return buildSeedChats();
}

export function AskPiLanding() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string>(() => newId());
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted threads on the client (avoids SSR/localStorage hydration issues).
  useEffect(() => {
    setChats(loadChats());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) {
      try { window.localStorage.setItem(CHATS_STORE_KEY, JSON.stringify(chats)); } catch { /* ignore */ }
    }
  }, [chats, loaded]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const active = chats.find((c) => c.id === activeId);
  const turns = active?.turns ?? [];
  const started = turns.length > 0 || thinking;

  // Keep the thread pinned to the latest message as it grows / when switching.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeId, turns.length, thinking]);

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || thinking) return;
    const reply = respondToPi(text);
    const userTurn: ChatTurn = { id: newId(), role: "user", text };

    setChats((prev) => {
      const exists = prev.some((c) => c.id === activeId);
      const base = exists
        ? prev
        : [{ id: activeId, title: titleFromPrompt(text), turns: [], updatedAt: Date.now() }, ...prev];
      return base.map((c) =>
        c.id === activeId
          ? {
              ...c,
              title: c.turns.length === 0 ? titleFromPrompt(text) : c.title,
              turns: [...c.turns, userTurn],
              updatedAt: Date.now(),
            }
          : c,
      );
    });
    setInput("");
    setThinking(true);

    const delay = 900 + reply.thinking.length * 320;
    timer.current = setTimeout(() => {
      setChats((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? { ...c, turns: [...c.turns, { id: newId(), role: "assistant", ...reply }], updatedAt: Date.now() }
            : c,
        ),
      );
      setThinking(false);
    }, delay);
  };

  const newChat = () => {
    if (timer.current) clearTimeout(timer.current);
    setThinking(false);
    setInput("");
    // Reuse the current draft if it's already empty.
    if (!active || active.turns.length === 0) {
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    setActiveId(newId());
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const switchChat = (id: string) => {
    if (id === activeId) return;
    if (timer.current) clearTimeout(timer.current);
    setThinking(false);
    setInput("");
    setActiveId(id);
  };

  const deleteChat = (id: string) => {
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) {
      if (timer.current) clearTimeout(timer.current);
      setThinking(false);
      setActiveId(newId());
      setInput("");
    }
  };

  const refine = () => inputRef.current?.focus();

  return (
    <AppShell bare>
      <div className="flex h-full">
        <ChatRail
          chats={chats}
          activeId={activeId}
          onNew={newChat}
          onSwitch={switchChat}
          onDelete={deleteChat}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {!started ? (
            <HeroState input={input} setInput={setInput} onSend={send} inputRef={inputRef} />
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border px-6 py-3">
                <Sparkle className="h-4 w-4 shrink-0 fill-ai text-ai" />
                <span className="truncate text-sm font-semibold">{active?.title ?? "Ask Pi"}</span>
              </div>

              <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
                  {turns.map((t) =>
                    t.role === "user" ? (
                      <UserBubble key={t.id} text={t.text} />
                    ) : (
                      <AssistantBubble key={t.id} turn={t} onPick={send} onRefine={refine} />
                    ),
                  )}
                  {thinking && <ThinkingBubble />}
                </div>
              </div>

              <div className="border-t border-border px-4 py-3">
                <div className="mx-auto max-w-3xl">
                  <Composer input={input} setInput={setInput} onSend={send} inputRef={inputRef} disabled={thinking} />
                  <p className="mt-1.5 text-center text-[10.5px] text-muted-foreground/70">
                    Pi drafts journeys and agents for you to review — nothing launches until you say so.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ---- Chats rail (session management) ------------------------------------

function ChatRail({
  chats,
  activeId,
  onNew,
  onSwitch,
  onDelete,
}: {
  chats: Chat[];
  activeId: string;
  onNew: () => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const now = Date.now();
  const threads = [...chats].filter((c) => c.turns.length > 0).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-border bg-background/60">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold">Chats</span>
          <span className="rounded-full bg-secondary px-1.5 text-[10.5px] font-medium text-muted-foreground tabular-nums">
            {threads.length}
          </span>
        </div>
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] font-medium text-foreground transition-colors hover:border-ai/40 hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" /> New chat
        </button>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {threads.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
            <MessageSquare className="h-5 w-5 text-muted-foreground/40" />
            <p className="text-[11.5px] text-muted-foreground/70">No chats yet. Start one above.</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {threads.map((c) => {
              const isActive = c.id === activeId;
              return (
                <li key={c.id}>
                  <div
                    className={cn(
                      "group relative flex cursor-pointer flex-col rounded-lg px-2.5 py-2 transition-colors",
                      isActive ? "bg-accent" : "hover:bg-accent/50",
                    )}
                    onClick={() => onSwitch(c.id)}
                  >
                    <span className="truncate pr-6 text-[12.5px] font-medium leading-tight text-foreground">
                      {c.title}
                    </span>
                    <span className="mt-0.5 text-[10.5px] text-muted-foreground">{relativeTime(c.updatedAt, now)}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                      aria-label="Delete chat"
                      title="Delete chat"
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-opacity hover:bg-background hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

// ---- Hero (empty state) -------------------------------------------------

function HeroState({
  input,
  setInput,
  onSend,
  inputRef,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: (raw?: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-2xl pb-10">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-ai to-ai-glow text-ai-foreground shadow-[0_8px_30px_-8px_color-mix(in_oklch,var(--ai)_70%,transparent)]">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight">What should Pi build today?</h1>
          <p className="mt-2 text-[13.5px] text-muted-foreground">
            Describe a journey or an agent in plain words. Pi builds it for you, ready to launch!
          </p>
        </div>

        <Composer input={input} setInput={setInput} onSend={onSend} inputRef={inputRef} autoFocus big />

        {/* Quick proactive invites */}
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {PI_INVITES.map((inv) => (
            <button
              key={inv}
              onClick={() => onSend(inv)}
              className="rounded-full border border-border px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-ai/40 hover:text-foreground"
            >
              {inv}
            </button>
          ))}
        </div>

        {/* Starter cards */}
        <div className="mt-7 grid grid-cols-2 gap-2.5">
          {PI_STARTERS.map((s) => (
            <StarterCard key={s.title} starter={s} onPick={() => onSend(s.prompt)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StarterCard({ starter, onPick }: { starter: Starter; onPick: () => void }) {
  const Icon = STARTER_ICON[starter.kind];
  return (
    <button
      onClick={onPick}
      className="group flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-ai/30 hover:bg-accent/30"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ai/10 text-ai">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{starter.title}</p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{starter.example}</p>
      </div>
    </button>
  );
}

// ---- Message bubbles ----------------------------------------------------

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-[13.5px] leading-relaxed">
        {text}
      </div>
    </div>
  );
}

function PiAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ai/10 text-ai">
      <Sparkle className="h-3.5 w-3.5 fill-ai text-ai" />
    </div>
  );
}

function AssistantBubble({
  turn,
  onPick,
  onRefine,
}: {
  turn: Extract<ChatTurn, { role: "assistant" }>;
  onPick: (raw?: string) => void;
  onRefine: () => void;
}) {
  return (
    <div className="flex gap-3">
      <PiAvatar />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">{turn.text}</p>
        {turn.artifact && <ArtifactCard artifact={turn.artifact} onRefine={onRefine} />}
        {turn.followups && turn.followups.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {turn.followups.map((f) => (
              <button
                key={f}
                onClick={() => onPick(f)}
                className="rounded-full border border-border px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-ai/40 hover:text-foreground"
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex gap-3">
      <PiAvatar />
      <div className="flex items-center gap-2 pt-1.5 text-[12.5px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" />
        <span className="animate-pulse">Pi is drafting…</span>
      </div>
    </div>
  );
}

// ---- Composer -----------------------------------------------------------

function Composer({
  input,
  setInput,
  onSend,
  inputRef,
  disabled,
  autoFocus,
  big,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: (raw?: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  autoFocus?: boolean;
  big?: boolean;
}) {
  // Auto-grow the textarea up to a cap.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input, inputRef]);

  return (
    <div
      className={cn(
        "flex items-end gap-2 rounded-2xl border border-border bg-card px-3 shadow-[0_6px_24px_-14px_rgba(0,0,0,0.25)] transition-colors focus-within:border-ai/40",
        big ? "py-2.5" : "py-2",
      )}
    >
      <Sparkle className="mb-1.5 h-4 w-4 shrink-0 fill-ai text-ai" />
      <textarea
        ref={inputRef}
        rows={1}
        autoFocus={autoFocus}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="Ask Pi to build a journey or an agent…"
        className="scrollbar-thin max-h-40 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onSend()}
        disabled={!input.trim() || disabled}
        aria-label="Send"
        className={cn(
          "mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all",
          input.trim() && !disabled ? "bg-foreground text-background hover:scale-[1.04]" : "bg-muted text-muted-foreground/60",
        )}
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </div>
  );
}
