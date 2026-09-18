import { useEffect, useRef, useState } from "react";
import { Sparkles, X, PenLine } from "lucide-react";
import { CANVAS_CONTEXT } from "@/lib/ask-pi-context";
import { renderChatMarkdown } from "@/lib/chat-markdown";
import { getSuggestion } from "@/lib/pi-node-suggestions";
import { askPi } from "@/lib/server-fns/pi-llm";
import { summarizePiEdits, type PiToolCallLog } from "@/lib/pi-canvas-apply";
import { cn } from "@/lib/utils";
import {
  PiPill,
  PiPanel,
  PiThinking,
  PiSendButton,
  PiInputIcon,
  usePiDrag,
} from "@/components/app/ask-pi-ui";

type State = "collapsed" | "open" | "thinking";

/**
 * A rich quick-pick block parsed out of a ```pi-choice fenced JSON. Beats
 * the flat `options: string[]` form when Pi wants to attach hint text or
 * pass a stable key back on selection.
 */
export type ChatChoice = {
  /** Only `single` today. `multi` / `select` / `duration` / `date` land in
   *  Phase C.2 — the schema below is already forwards compatible. */
  type: "single" | "multi" | "select" | "duration" | "date";
  /** Stable key Pi assigned to this decision. Optional; if present, the
   *  client echoes it back so multi-turn chains stay clean. */
  key?: string;
  /** Optional question override; usually the surrounding message text
   *  already asks the question, so this stays empty. */
  question?: string;
  options: Array<{ id: string; label: string; hint?: string }>;
};

/**
 * One turn of the Ask Pi conversation. Rendered as a bubble in the chat log.
 */
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** Legacy quick-pick options — a ```options fenced block, one label per
   *  line. Kept for backwards compatibility with existing prompts. */
  options?: string[];
  /** Rich quick-pick — a ```pi-choice fenced JSON block. Preferred going
   *  forward. When both are present, `choice` wins. */
  choice?: ChatChoice;
  /** One-line diff summary of nodes/edges Pi added on this turn. */
  edits?: string[];
};

export type AiComposerProps = {
  /** "wizard" mode pre-seeds a welcome from Pi so the blank canvas has a way in. */
  mode?: "chat" | "wizard";
  /** Collapsed pill shows nudge styling + label instead of the default sparkle. */
  nudge?: { label: string; active: boolean };
  /** Auto-open the composer on mount (used for brand-new campaigns). */
  autoOpenWizard?: boolean;
  onBuildingChange?: (building: boolean) => void;
  /** I3 — confirm a node-level Pi suggestion; the canvas runs its real graph transform. */
  onApplySuggestion?: (s: { nodeId: string; suggestionId: string }) => void;
  /** Current campaign id — passed to askPi so the LLM's mutation tools write to the right D1 rows. */
  campaignId?: string;
  /** Fired for every LLM turn whose toolCalls include DAG mutations. Canvas applies them. */
  onPiToolCalls?: (toolCalls: PiToolCallLog[]) => void;
};

/**
 * In-canvas Ask Pi composer — a real multi-turn chat that builds the DAG live.
 *
 * On each user turn, we call `askPi` with `scope: "builder"` and pass the full
 * transcript as `history` so Pi has memory across turns. Pi either:
 *   - Asks a single clarifying question (no tool calls). We render its message
 *     as a bubble; if it emitted a ```options fenced block we render those as
 *     clickable chips so the user can pick without typing.
 *   - Builds a chunk of the DAG (insert_node / connect_nodes / update_node
 *     tool calls). The canvas applies the mutations immediately via
 *     `onPiToolCalls`; we still render Pi's textual confirmation in the log.
 *
 * "Wizard" mode is just chat with a pre-seeded welcome message — used on a
 * brand-new blank canvas so the flow has a natural entry point.
 */
export function AiComposer({
  mode = "chat",
  nudge,
  autoOpenWizard = false,
  onBuildingChange,
  onApplySuggestion,
  campaignId,
  onPiToolCalls,
}: AiComposerProps = {}) {
  const [state, setState] = useState<State>(autoOpenWizard ? "open" : "collapsed");
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    mode === "wizard"
      ? [{
          role: "assistant",
          // Third-person, crisp. Pi = Paytm Intelligence. `**Pi**` renders
          // as bold via `renderInlineMarkdown`. See pi-construct-rules.ts for
          // the full canonical grammar Pi obeys.
          content:
            "Describe your campaign flow, and let **Pi** do the magic-wiring!",
        }]
      : [],
  );
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [hasEngaged, setHasEngaged] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { dragX, pillHandlers, suppressClick } = usePiDrag(wrapRef);

  const isOpen = state !== "collapsed";
  const showNudge = !!(nudge?.active && !isOpen && !nudgeDismissed && !hasEngaged);

  useEffect(() => {
    onBuildingChange?.(state === "thinking");
  }, [state, onBuildingChange]);

  useEffect(() => {
    if (state === "open") inputRef.current?.focus();
  }, [state]);

  // Auto-scroll to bottom whenever the transcript grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, state]);

  // I3 — node-level "Ask Pi to apply" hint opens this composer pre-filled + submits.
  useEffect(() => {
    const onSuggest = (e: Event) => {
      const detail = (e as CustomEvent<{ nodeId: string; suggestionId: string }>).detail;
      const sug = getSuggestion(detail?.suggestionId);
      if (!sug) return;
      setHasEngaged(true);
      setState("open");
      // Register the confirmation as the first user turn.
      setMessages((prev) => [...prev, { role: "user", content: sug.prompt }]);
      // Fire the underlying transform + a confirming assistant bubble.
      onApplySuggestion?.({ nodeId: detail.nodeId, suggestionId: detail.suggestionId });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: sug.result.text, edits: sug.result.diff },
      ]);
    };
    window.addEventListener("askpi:suggest", onSuggest);
    return () => window.removeEventListener("askpi:suggest", onSuggest);
  }, [onApplySuggestion]);

  // I3 — "Ask Pi anything…" prompt hook. Same as before but routes into the chat.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      const prompt = (e as CustomEvent<string>).detail;
      if (!prompt) return;
      setHasEngaged(true);
      setState("open");
      setValue(prompt);
      inputRef.current?.focus();
    };
    window.addEventListener("askpi:prompt", onPrompt);
    return () => window.removeEventListener("askpi:prompt", onPrompt);
  }, []);

  // Click-outside collapses only when idle (no busy call, no partial input).
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      if (state === "thinking") return;
      if (value.trim().length > 0) return;
      setState("collapsed");
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [isOpen, state, value]);

  const openPrimary = () => {
    setHasEngaged(true);
    setState("open");
  };

  const collapse = () => {
    if (state === "thinking") return;
    setState("collapsed");
  };

  const submit = async (text?: string) => {
    const q = (text ?? value).trim();
    if (!q || state === "thinking") return;
    setValue("");
    const historyForServer = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setState("thinking");
    try {
      const r = await askPi({
        data: {
          scope: "builder",
          question: q,
          context: {
            campaignId,
            surface: "Campaign canvas",
            isNew: mode === "wizard",
            hint:
              mode === "wizard"
                ? "The canvas is blank except for a Start node with id 'start'. Anchor the first new node to it."
                : "The canvas already has nodes. Read the campaign first before editing.",
          },
          history: historyForServer,
        },
      });
      if (r.ok) {
        // Diagnostic — logs the builder-context asset counts so we can see
        // from browser devtools whether Pi got a real catalog or an empty
        // one, and why (D1 unbound / read threw / really empty).
        if (r.diag) {
          // eslint-disable-next-line no-console
          console.log("[AskPi] builder context diag:", r.diag);
        }
        const toolCalls = (r.toolCalls ?? []) as PiToolCallLog[];
        if (toolCalls.length > 0) onPiToolCalls?.(toolCalls);
        const { text: bodyText, options, choice } = parsePiFencedBlocks(r.answer);
        const edits = summarizePiEdits(toolCalls);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: bodyText || (edits.length > 0 ? "Done." : "Not sure what to do with that — could you rephrase?"),
            options,
            choice,
            edits: edits.length > 0 ? edits : undefined,
          },
        ]);
      } else {
        // Surface the actual server error so we can diagnose. Different
        // error prefixes get slightly friendlier framing but always end
        // with the raw error tail — until this is fully stable, showing
        // the real string is worth more than a polished fallback.
        const err = r.error ?? "unknown_error";
        // Also log to console so devtools shows the raw error even if the
        // user closes the chat panel before reading.
        // eslint-disable-next-line no-console
        console.error("[AskPi] askPi returned ok:false —", err);
        const friendly = err.startsWith("d1_not_bound")
          ? "Database isn't bound on this worker. Ask ops to provision D1."
          : err.startsWith("runtime_env_missing")
            ? "Worker runtime env is missing. Redeploy needed."
            : err.startsWith("LLM gateway not configured")
              ? "LLM gateway isn't configured on this worker. Set PI_AGENT_API_KEY as a wrangler secret."
              : err.startsWith("tfy_401") || err.includes("Unauthorized")
                ? "LLM auth failed — the API key is invalid or expired."
                : err.startsWith("tfy_")
                  ? "LLM gateway rejected the request."
                  : err === "empty_response"
                    ? "LLM returned an empty response — try again."
                    : err === "exceeded_tool_rounds"
                      ? "I got stuck in a loop. Try rephrasing more concretely."
                      : "Something went wrong.";
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `${friendly}\n\n\`${err}\``,
          },
        ]);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[AskPi] fetch/RPC threw —", e);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Network hiccup — try again.\n\n\`${(e as Error).message}\`` },
      ]);
    } finally {
      setState("open");
    }
  };

  const resetChat = () => {
    setMessages(
      mode === "wizard"
        ? [{
            role: "assistant",
            content:
              "Fresh start. Describe your campaign flow, and let **Pi** do the magic-wiring!",
          }]
        : [],
    );
    setValue("");
    inputRef.current?.focus();
  };

  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") return i;
    return -1;
  })();

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4">
      {/* Collapsed pill (with optional nudge bubble) */}
      {!isOpen && (
        <div
          className="pointer-events-none relative flex flex-col items-center"
          style={{ transform: `translateX(${dragX}px)` }}
        >
          {showNudge && (
            <div className="askpi-nudge-bubble pointer-events-auto relative mb-3 flex items-center gap-2 rounded-2xl border border-ai/30 bg-card px-3 py-2 text-[12.5px] font-medium text-foreground shadow-[0_10px_30px_-10px_color-mix(in_oklch,var(--ai)_45%,transparent)] animate-slide-up">
              <button
                onClick={openPrimary}
                className="flex items-center gap-2 pr-1 text-left"
                aria-label="Open Ask Pi to build campaign"
              >
                <Sparkles className="h-3.5 w-3.5 text-ai" />
                {nudge!.label}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setNudgeDismissed(true); }}
                className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Dismiss nudge"
              >
                <X className="h-3 w-3" />
              </button>
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
          )}
          <PiPill onOpen={openPrimary} pillHandlers={pillHandlers} suppressClick={suppressClick} />
        </div>
      )}

      {/* Expanded chat panel */}
      {isOpen && (
        <div className="pointer-events-none" style={{ transform: `translateX(${dragX}px)` }}>
          <PiPanel innerRef={containerRef} className="w-[700px] max-w-[92vw]">
            {/* Header — third-person is fine here because it's a UI chrome
                surface tag, not Pi speaking. Shows the current activity
                clearly: "Drafting…" while a request is in flight, "Ready"
                otherwise. */}
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Sparkles
                  className={cn(
                    "h-3.5 w-3.5 text-ai",
                    state === "thinking" && "animate-pulse",
                  )}
                />
                <span className="text-[12.5px] font-medium text-foreground">
                  {state === "thinking" ? "Paytm Intelligence at work" : "Ask Pi"}
                </span>
                {messages.length > 0 && state !== "thinking" && (
                  <span className="text-[10.5px] text-muted-foreground">
                    · {messages.length} {messages.length === 1 ? "turn" : "turns"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 1 && (
                  <button
                    onClick={resetChat}
                    className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Start over"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={collapse}
                  aria-label="Close"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Chat transcript */}
            {(messages.length > 0 || state === "thinking") && (
              <div
                ref={scrollRef}
                className="scrollbar-thin max-h-[420px] min-h-[80px] overflow-y-auto px-4 py-3"
              >
                <div className="space-y-3">
                  {messages.map((m, i) => (
                    <ChatBubble
                      key={i}
                      message={m}
                      showOptions={i === lastAssistantIdx && state !== "thinking"}
                      onPick={(opt) => submit(opt)}
                    />
                  ))}
                  {state === "thinking" && (
                    <div className="pl-1">
                      <PiThinking steps={CANVAS_CONTEXT.thinking} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-2 border-t border-border px-4 py-2.5">
              <PiInputIcon />
              <textarea
                ref={inputRef}
                rows={1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                  if (e.key === "Escape" && !value) collapse();
                }}
                placeholder={
                  messages.length === 0
                    ? CANVAS_CONTEXT.placeholder
                    : "Reply or ask a follow-up…"
                }
                className="scrollbar-thin max-h-32 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14px] text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
              />
              <PiSendButton
                thinking={state === "thinking"}
                disabled={!value.trim() && state !== "thinking"}
                onClick={state === "thinking" ? () => setState("open") : () => submit()}
              />
            </div>
          </PiPanel>
        </div>
      )}
    </div>
  );
}

/**
 * One turn's bubble. User bubbles right-aligned, Pi bubbles left-aligned.
 * Assistant bubbles may render a diff summary of node/edge edits and a row
 * of quick-pick chips (parsed from ```options blocks) — but only for the
 * MOST RECENT assistant turn, so old options don't stay tappable.
 */
function ChatBubble({
  message,
  showOptions,
  onPick,
}: {
  message: ChatMessage;
  showOptions: boolean;
  onPick: (opt: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-foreground px-3 py-2 text-[13px] leading-relaxed text-background">
          {message.content}
        </div>
      </div>
    );
  }

  // Prefer the rich `choice` block when present. Falls back to the flat
  // `options` list from a legacy ```options fence.
  const richOptions = message.choice?.options.map((o) => ({ id: o.id, label: o.label, hint: o.hint }));
  const flatOptions = message.options?.map((o) => ({ id: o, label: o, hint: undefined as string | undefined }));
  const picker = richOptions ?? flatOptions;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-1 h-3.5 w-3.5 shrink-0 text-ai" />
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-card px-3 py-2 text-[13px] leading-relaxed text-foreground">
          {renderChatMarkdown(message.content)}
          {message.edits && message.edits.length > 0 && (
            <div className="mt-2 space-y-0.5 border-t border-border pt-2 font-mono text-[11px] text-muted-foreground">
              {message.edits.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
      </div>
      {showOptions && picker && picker.length > 0 && (
        // Numbered-row picker. Each row shows the label + an optional hint
        // subtitle (from `pi-choice`), and the whole card sits under the
        // assistant bubble. Escape hatch at the bottom points the user at
        // the free-form input for anything the chips don't cover.
        <div className="ml-6 flex flex-col overflow-hidden rounded-2xl border border-border bg-card/60">
          {picker.map((opt, i) => (
            <button
              key={opt.id}
              onClick={() => onPick(opt.label)}
              className={cn(
                "group flex items-start gap-3 border-b border-border/60 px-3 py-2.5 text-left last:border-b-0",
                "transition-colors hover:bg-ai/5",
              )}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-background text-[10.5px] font-medium text-muted-foreground group-hover:border-ai/60 group-hover:text-ai">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] leading-snug text-foreground">{opt.label}</span>
                {opt.hint && (
                  <span className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{opt.hint}</span>
                )}
              </span>
            </button>
          ))}
          <div className="flex items-center gap-3 border-t border-border/60 bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
            <PenLine className="h-3.5 w-3.5" />
            <span>Or type something else…</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Extract any Pi-fenced control blocks (`pi-choice` JSON, legacy `options`
 * plain-list) out of an assistant message. Returns the remaining prose plus
 * whichever control block Pi emitted.
 *
 * Precedence: if BOTH `pi-choice` and `options` appear (Pi shouldn't do
 * this but LLMs sometimes emit both for safety), the rich `choice` wins
 * and the flat `options` is dropped.
 *
 * `pi-choice` schema (Pi is instructed to emit this in SYSTEM_BUILDER):
 *   ```pi-choice
 *   {
 *     "type": "single",
 *     "key": "voice_agent",
 *     "options": [
 *       { "id": "agent_1", "label": "Amber", "hint": "BFSI · warm tone" },
 *       { "id": "agent_2", "label": "Meera", "hint": "BFSI · firm tone" }
 *     ]
 *   }
 *   ```
 *
 * Malformed JSON degrades to `undefined choice` — the surrounding prose
 * still renders, so the user isn't stuck.
 */
function parsePiFencedBlocks(md: string): { text: string; options?: string[]; choice?: ChatChoice } {
  let working = md;
  let choice: ChatChoice | undefined;
  let options: string[] | undefined;

  // pi-choice (rich)
  const choiceRe = /```pi-choice\s*\n([\s\S]*?)```/i;
  const cm = working.match(choiceRe);
  if (cm && cm.index !== undefined) {
    try {
      const parsed = JSON.parse(cm[1]) as ChatChoice;
      if (parsed && Array.isArray(parsed.options) && parsed.options.length > 0) {
        // Coerce optional fields to safe defaults.
        choice = {
          type: parsed.type ?? "single",
          key: parsed.key,
          question: parsed.question,
          options: parsed.options
            .filter((o) => o && typeof o.label === "string")
            .map((o) => ({ id: o.id ?? o.label, label: o.label, hint: o.hint })),
        };
      }
    } catch {
      // Malformed JSON — leave `choice` undefined; the prose still renders.
    }
    working = (working.slice(0, cm.index).trim() + "\n\n" + working.slice(cm.index + cm[0].length).trim()).trim();
  }

  // Legacy options (flat)
  const optRe = /```options\s*\n([\s\S]*?)```/i;
  const om = working.match(optRe);
  if (om && om.index !== undefined) {
    const raw = om[1];
    const list = raw
      .split("\n")
      .map((s) => s.replace(/^\s*[-*]\s+/, "").trim())
      .filter((s) => s.length > 0 && s.length < 80);
    if (list.length > 0) options = list;
    working = (working.slice(0, om.index).trim() + "\n\n" + working.slice(om.index + om[0].length).trim()).trim();
  }

  return {
    text: working.trim(),
    // Rich choice wins if both are present.
    ...(choice ? { choice } : options ? { options } : {}),
  };
}
