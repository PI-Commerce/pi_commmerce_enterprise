/**
 * The operator's reply box — the piece that turns the Inbox from a record into a
 * place work gets done.
 *
 * It is here because the first cut hands conversations to people and expects them
 * to answer. A tagged conversation nobody can reply to is not a handoff; it is a
 * notification.
 *
 * The whole design problem is the 24-hour window, and it is not ours. WhatsApp
 * closes a service window 24 hours after the customer's last message, and after
 * that a free-form reply is rejected at the provider, not by us. So the composer
 * has two modes and says which one it is in *before* the operator types, rather
 * than taking a paragraph and then failing the send. An operator who writes a
 * careful reply into a closed window and loses it learns to distrust the whole
 * surface.
 *
 * Ownership moves on send, not on open. Opening a conversation to read it is not
 * a claim; replying is. That is what keeps the single-owner rule honest without
 * making an operator press a button to say what their typing already said.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Send, FileText, Lock, UserRound } from "lucide-react";
import { SESSION_WINDOW_HOURS } from "@/lib/inbound";

export type ComposerState = {
  /** Hours since the customer's last inbound message, or undefined if never. */
  hoursSinceInbound?: number;
  /** Who holds the conversation right now. */
  ownedByHuman: boolean;
  assigneeName?: string;
};

export function Composer({
  state,
  onSend,
}: {
  state: ComposerState;
  onSend: (text: string, mode: "freeform" | "template") => void;
}) {
  const [text, setText] = useState("");

  const windowOpen =
    state.hoursSinceInbound !== undefined &&
    state.hoursSinceInbound < SESSION_WINDOW_HOURS;
  const mode: "freeform" | "template" = windowOpen ? "freeform" : "template";

  const send = () => {
    const v = text.trim();
    if (!v) return;
    onSend(v, mode);
    setText("");
  };

  return (
    <div className="shrink-0 border-t border-border bg-background px-6 py-3">
      <WindowNotice state={state} windowOpen={windowOpen} />

      {windowOpen ? (
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a reply…"
            rows={2}
            className="min-h-[52px] resize-none text-[12.5px]"
            onKeyDown={(e) => {
              /* Enter sends, Shift+Enter breaks the line — the convention every
                 messaging tool an operator already uses shares. */
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button
            size="sm"
            disabled={!text.trim()}
            className="h-9 shrink-0 gap-1.5 text-xs"
            onClick={send}
          >
            <Send className="h-3.5 w-3.5" /> Send
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled>
            <FileText className="h-3.5 w-3.5" /> Choose a template
          </Button>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Free-form replies are rejected by WhatsApp outside the window. A template
            is the only thing that reaches them.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Said before the operator types, never after they press send.
 *
 * Three states worth distinguishing, because the operator's next action differs
 * in each: the window is open and this is theirs, the window is open but someone
 * else holds it, or the window has closed.
 */
function WindowNotice({
  state, windowOpen,
}: { state: ComposerState; windowOpen: boolean }) {
  if (!windowOpen) {
    return (
      <Row icon={<Lock className="h-3 w-3" />} tone="warn">
        <span>
          The {SESSION_WINDOW_HOURS}-hour window has closed
          {state.hoursSinceInbound !== undefined && (
            <> — last message from them was {Math.floor(state.hoursSinceInbound)}h ago</>
          )}
          .
        </span>
      </Row>
    );
  }

  if (state.ownedByHuman && state.assigneeName) {
    return (
      <Row icon={<UserRound className="h-3 w-3" />} tone="default">
        <span>
          {state.assigneeName} is on this one. Replying takes it over.
        </span>
      </Row>
    );
  }

  return (
    <Row icon={<UserRound className="h-3 w-3" />} tone="default">
      <span>Replying assigns this conversation to you and stops the agent.</span>
    </Row>
  );
}

function Row({
  icon, tone, children,
}: { icon: React.ReactNode; tone: "warn" | "default"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mb-2 flex items-center gap-1.5 text-[11px]",
        tone === "warn" ? "text-warning" : "text-muted-foreground",
      )}
    >
      <span className="shrink-0">{icon}</span>
      {children}
    </div>
  );
}
