import { useEffect, useRef, useState } from "react";
import { Sparkles, X, PenLine, ArrowUpRight } from "lucide-react";
import { CANVAS_CONTEXT } from "@/lib/ask-pi-context";
import { renderChatMarkdown } from "@/lib/chat-markdown";
import { extractProposedDraft, type ProposedDraft } from "@/lib/pi-propose-draft";
import { ConfirmDraftCard } from "./ConfirmDraftCard";
import { getSuggestion } from "@/lib/pi-node-suggestions";
import { askPi } from "@/lib/server-fns/pi-llm";
import { summarizePiEdits, expandSkeletonCalls, extractChipsFromToolCalls, extractActionLinksFromToolCalls, type PiToolCallLog, type ActionLinkFromTool } from "@/lib/pi-canvas-apply";
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
  /** Structured plan Pi emitted via `propose_draft`. When present, the
   *  bubble renders a ConfirmDraftCard below the prose with Draft this /
   *  Edit buttons. */
  draft?: ProposedDraft;
  /** True after the user has hit Draft this on this bubble — disables
   *  the buttons so a double-click can't re-fire the draft. */
  draftAccepted?: boolean;
  /** One-line diff summary of nodes/edges Pi added on this turn. */
  edits?: string[];
  /** P3 escape-hatch buttons Pi emitted via `emit_action_link` on this
   *  turn. Rendered as prominent chips that open the workspace route
   *  in a new tab so the chat context stays alive while the user
   *  unblocks (e.g. connects a WhatsApp number, creates a voice agent). */
  actionLinks?: ActionLinkFromTool[];
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
  /** Fired when the user hits "Draft this" on a Confirm-Draft card. The
   *  canvas uses the draft to insert shape-aware pulsating skeleton nodes
   *  ahead of Pi's real insert_node calls arriving. */
  onDraftAccepted?: (draft: ProposedDraft) => void;
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
  onDraftAccepted,
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

  // Vertical resize on the panel's top edge. The header is the drag
  // handle; dragging up grows the transcript area, dragging down shrinks.
  // Clamped so the transcript can't collapse to zero or eat the whole
  // viewport.
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
      const next = Math.max(160, Math.min(window.innerHeight - 200, resizeRef.current.startH + delta));
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

  // Auto-grow textarea — resize based on content up to 8 lines-ish.
  // Runs on every value change; the max-height CSS ceiling stops it from
  // eating the whole screen when the user pastes a wall of text.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

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
        const rawToolCalls = (r.toolCalls ?? []) as PiToolCallLog[];
        // Expand `insert_skeleton` into synthetic insert_node/connect_nodes
        // so the canvas apply flow sees each node/edge individually. Other
        // tool calls pass through untouched.
        const toolCalls = expandSkeletonCalls(rawToolCalls);
        // Split the batch into (a) the plan-announcement call
        // (`propose_draft` — the client renders the Confirm-Draft card
        // and does NOT touch the canvas yet), and (b) real mutation
        // calls (`insert_node` / `connect_nodes` / `update_node` — those
        // go straight through to the canvas). Read-only tools (analytics
        // reads) are already ignored by applyPiToolCallsToGraph.
        const draft = extractProposedDraft(toolCalls);
        const mutationCalls = toolCalls.filter((t) => t.name !== "propose_draft");
        if (mutationCalls.length > 0) onPiToolCalls?.(mutationCalls);
        const { text: bodyText, options, choice: proseChoice } = parsePiFencedBlocks(r.answer);
        // Tool-based chips (from `emit_choice` / `suggest_next_step`) beat
        // any prose-fenced pi-choice block — the tool call is the reliable
        // path and always wins when both appear in the same turn.
        const toolChoice = extractChipsFromToolCalls(rawToolCalls);
        const choice = toolChoice ?? proseChoice;
        const edits = summarizePiEdits(mutationCalls);
        const actionLinks = extractActionLinksFromToolCalls(rawToolCalls);
        // If Pi went straight to emit_choice without a prose lead-in, the
        // picker card was rendering with no question above it — bad UX,
        // just a stack of unlabeled chips. Fall back to the tool's own
        // `prompt` (surfaced as `choice.question`) so the user always sees
        // what the choice is for.
        const fallbackChoiceText =
          choice && !bodyText && choice.question ? choice.question : "";
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              bodyText
              || fallbackChoiceText
              || (edits.length > 0 ? "Done." : draft ? "Here's the plan." : choice ? "" : actionLinks.length > 0 ? "" : "Not sure what to do with that — could you rephrase?"),
            options,
            choice,
            draft: draft ?? undefined,
            edits: edits.length > 0 ? edits : undefined,
            actionLinks: actionLinks.length > 0 ? actionLinks : undefined,
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

  /** Accept a Confirm-Draft card. Marks the assistant bubble as accepted,
   *  fires the canvas hook to insert pulsating skeletons, then submits
   *  "Draft this" as the next user message so Pi wires the real nodes. */
  const acceptDraft = (msgIdx: number, draft: ProposedDraft) => {
    setMessages((prev) => prev.map((m, i) => (i === msgIdx ? { ...m, draftAccepted: true } : m)));
    onDraftAccepted?.(draft);
    // Send "Draft this" as if the user typed it. Pi's next turn will be
    // the real insert_node / connect_nodes batch.
    submit("Draft this");
  };

  /** Reject / edit a Confirm-Draft card. Just marks it accepted (so the
   *  buttons disable) and focuses the input — the user types what to
   *  change. Pi's next turn re-proposes with adjustments. */
  const editDraft = (msgIdx: number) => {
    setMessages((prev) => prev.map((m, i) => (i === msgIdx ? { ...m, draftAccepted: true } : m)));
    inputRef.current?.focus();
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
          <PiPanel innerRef={containerRef} className="w-[840px] max-w-[94vw]">
            {/* Header doubles as the vertical resize handle — drag its top
                edge up/down to grow/shrink the transcript. Third-person is
                fine here because it's UI chrome, not Pi speaking. */}
            <div
              onMouseDown={onResizeMouseDown}
              className="flex cursor-ns-resize items-center justify-between border-b border-border px-4 py-2.5 select-none"
              title="Drag to resize"
            >
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
              <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
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

            {/* Chat transcript — height driven by the drag-resize state so
                the user can grow/shrink it. */}
            {(messages.length > 0 || state === "thinking") && (
              <div
                ref={scrollRef}
                className="scrollbar-thin min-h-[80px] overflow-y-auto px-4 py-3"
                style={{ maxHeight: transcriptHeight, height: transcriptHeight }}
              >
                <div className="space-y-3">
                  {messages.map((m, i) => (
                    <ChatBubble
                      key={i}
                      message={m}
                      showOptions={i === lastAssistantIdx && state !== "thinking"}
                      onPick={(opt) => submit(opt)}
                      onDraft={m.draft ? () => acceptDraft(i, m.draft as ProposedDraft) : undefined}
                      onEdit={m.draft ? () => editDraft(i) : undefined}
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
  onDraft,
  onEdit,
}: {
  message: ChatMessage;
  showOptions: boolean;
  onPick: (opt: string) => void;
  onDraft?: () => void;
  onEdit?: () => void;
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
          {/* The `edits` diff list ("+ whatsapp_1.engaged -> whatsappFreeform_1")
              is intentionally NOT rendered. Users don't need to see the internal
              plumbing of every insert / connect Pi made; the canvas already
              shows the result visually. The field stays on ChatMessage for
              future in-devtools logging. */}
        </div>
      </div>
      {/* Confirm-Draft card — rendered when Pi emitted a propose_draft
          tool call on this turn. Draft this / Edit route through the
          parent so it can trigger canvas skeletons + submit the follow-up
          user message. */}
      {message.draft && onDraft && onEdit && (
        <ConfirmDraftCard
          draft={message.draft}
          onDraft={onDraft}
          onEdit={onEdit}
          disabled={message.draftAccepted}
        />
      )}
      {/* P3 escape-hatch buttons — dead-end recovery. Each opens in a
          new tab so Pi's chat context stays alive; the arrow icon signals
          the external navigation. Sits under the message + above chips. */}
      {message.actionLinks && message.actionLinks.length > 0 && (
        <div className="ml-6 flex flex-col gap-1.5">
          {message.actionLinks.map((a, i) => (
            <a
              key={`${a.href}-${i}`}
              href={a.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start justify-between gap-3 rounded-xl border border-ai/30 bg-ai/5 px-3 py-2.5 text-left transition-colors hover:border-ai/60 hover:bg-ai/10"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-medium leading-snug text-foreground">{a.label}</span>
                {a.hint && (
                  <span className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{a.hint}</span>
                )}
              </span>
              <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-ai/70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          ))}
        </div>
      )}
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

  // Strip EVERY ```pi-choice fenced block from the prose (Pi occasionally
  // emits multiple in one turn). We keep only the FIRST valid one as the
  // picker card — one question per bubble stays clean. Every subsequent
  // block still gets stripped from the text so it doesn't leak as raw
  // code below the assistant bubble.
  const choiceRe = /```pi-choice\s*\n([\s\S]*?)```/gi;
  working = working.replace(choiceRe, (_full, body: string) => {
    if (!choice) {
      try {
        const parsed = JSON.parse(body) as ChatChoice;
        if (parsed && Array.isArray(parsed.options) && parsed.options.length > 0) {
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
        /* malformed — fall through and just strip the block */
      }
    }
    return "";
  });

  // Same treatment for legacy ```options fences. First valid one wins.
  const optRe = /```options\s*\n([\s\S]*?)```/gi;
  working = working.replace(optRe, (_full, body: string) => {
    if (!options && !choice) {
      const list = body
        .split("\n")
        .map((s) => s.replace(/^\s*[-*]\s+/, "").trim())
        .filter((s) => s.length > 0 && s.length < 80);
      if (list.length > 0) options = list;
    }
    return "";
  });

  // Also strip any generic ```<lang> fenced blocks that leak through (Pi
  // is prompted away from these but LLMs sometimes wrap JSON in ```json).
  // Guarded to only nuke blocks that clearly aren't language-prose.
  const strayFenceRe = /```(?:json|yaml|yml|javascript|ts|typescript)\s*\n[\s\S]*?```/gi;
  working = working.replace(strayFenceRe, "");

  // Collapse any run of 3+ blank lines that the stripping left behind.
  working = working.replace(/\n{3,}/g, "\n\n").trim();

  return {
    text: working,
    ...(choice ? { choice } : options ? { options } : {}),
  };
}
