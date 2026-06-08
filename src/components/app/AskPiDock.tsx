import { useEffect, useRef, useState } from "react";
import { Sparkles, ArrowUp, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type State = "collapsed" | "idle" | "thinking" | "result";

const SUGGESTIONS = [
  "Summarize my workflows this week",
  "Create an onboarding campaign for new traders",
  "Why did the reactivation flow drop 8%?",
];

/**
 * Global Ask Pi assistant — present on every page.
 * Idle: small floating pill. Expands while typing/responding.
 * NEVER auto-publishes. Always proposes changes for approval.
 */
export function AskPiDock() {
  const [state, setState] = useState<State>("collapsed");
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setState((s) => (s === "collapsed" ? "idle" : "collapsed"));
      }
      if (e.key === "Escape" && state !== "collapsed") setState("collapsed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  useEffect(() => {
    if (state === "idle") inputRef.current?.focus();
  }, [state]);

  const submit = () => {
    if (!value.trim()) return;
    setState("thinking");
    setTimeout(() => setState("result"), 1800);
  };

  if (state === "collapsed") {
    return (
      <button
        onClick={() => setState("idle")}
        className="group absolute bottom-5 left-1/2 z-30 flex h-9 -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[12.5px] text-muted-foreground shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] transition-all hover:bg-accent hover:text-foreground animate-slide-up"
      >
        <Sparkles className="h-3.5 w-3.5 text-ai" />
        Ask Pi
        <kbd className="ml-1 rounded border border-border bg-background px-1 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
      </button>
    );
  }

  const expanded = state === "thinking" || state === "result";

  return (
    <div className="absolute inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div
        className={cn(
          "w-[620px] max-w-full overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)] animate-slide-up",
          expanded && "w-[680px]",
        )}
      >
        {expanded && (
          <div className="border-b border-border px-4 py-3 animate-fade-in">
            {state === "thinking" ? <Thinking /> : <Result onAccept={() => { setValue(""); setState("idle"); }} onDismiss={() => { setValue(""); setState("idle"); }} />}
          </div>
        )}

        <div className="flex items-end gap-2 px-3 py-2.5">
          <Sparkles className="mt-1.5 h-4 w-4 shrink-0 text-ai" />
          <textarea
            ref={inputRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder="Ask Pi to plan, build, or explain anything…"
            className="max-h-32 flex-1 resize-none bg-transparent py-1 text-[13.5px] placeholder:text-muted-foreground/80 focus:outline-none"
          />
          <button
            onClick={() => setState("collapsed")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              value.trim() ? "bg-foreground text-background" : "bg-muted text-muted-foreground/60",
            )}
            aria-label="Send"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>

        {state === "idle" && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
            <span className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">Try</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => { setValue(s); setTimeout(submit, 30); }}
                className="rounded-full border border-border px-2.5 py-1 text-[11.5px] text-muted-foreground hover:border-ai/40 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Thinking() {
  const steps = ["Reading current context…", "Reviewing 12 recent runs…", "Drafting proposed changes…"];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[12.5px] font-medium">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" /> Pi is working…
      </div>
      <ul className="space-y-1 pl-5">
        {steps.map((s, i) => (
          <li key={s} className="text-[12px] text-muted-foreground" style={{ animation: `fadeIn 0.4s ease-out ${i * 0.4}s both` }}>
            • {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Result({ onAccept, onDismiss }: { onAccept: () => void; onDismiss: () => void }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-ai text-ai" />
        <p className="text-[13px] leading-relaxed">
          I drafted a 4-step onboarding journey targeting new traders with no first deposit in 48 hours.
          Review the proposed graph before publishing.
        </p>
      </div>
      <div className="rounded-lg border border-ai/30 bg-ai/5 px-2.5 py-2 font-mono text-[11px]">
        <span className="text-success">+ create</span> campaign “New Trader Onboarding”
        <br />
        <span className="text-success">+ add</span> nodes: Trigger → AI Copy → WhatsApp → Wait 24h → Voice AI
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <button onClick={onDismiss} className="rounded-md px-2.5 py-1 text-[11.5px] text-muted-foreground hover:text-foreground">
          Dismiss
        </button>
        <button onClick={onAccept} className="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background">
          <Check className="h-3 w-3" /> Review &amp; apply
        </button>
      </div>
    </div>
  );
}
