import { Fragment } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { AppShell } from "./AppShell";
import { cn } from "@/lib/utils";

export type WizardStep = { id: string; label: string; hint?: string };

/**
 * Shared chrome for full-screen creation wizards (Create agent, Register action).
 * Provides the header, a horizontal stepper bar, scrolling canvas and footer nav so
 * every wizard shares the same UX. The global app sidebar stays visible (via AppShell);
 * progress lives in a top stepper rather than a competing left rail. Step content is
 * passed as children; the route owns the draft state, step order and action buttons.
 */
export function WizardShell({
  eyebrow,
  breadcrumb,
  badge = "Draft",
  headerActions,
  steps,
  currentIndex,
  onStepSelect,
  onBack,
  footerActions,
  children,
}: {
  /** Small uppercase label shown at the start of the stepper, e.g. "Create agent". */
  eyebrow: string;
  /** Breadcrumb cluster rendered in the header (links + current title). */
  breadcrumb: React.ReactNode;
  /** Status pill shown after the breadcrumb. Pass null to hide. */
  badge?: React.ReactNode;
  /** Right-aligned header buttons (e.g. Cancel + Save as draft). */
  headerActions?: React.ReactNode;
  steps: WizardStep[];
  currentIndex: number;
  /** Called when a visited step in the rail is clicked. */
  onStepSelect: (index: number) => void;
  /** Called by the footer Back button. */
  onBack: () => void;
  /** Right-aligned footer button (Continue / terminal action). */
  footerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const current = steps[Math.min(currentIndex, steps.length - 1)];

  return (
    <AppShell bare>
      <div className="flex h-full flex-col">
        {/* Top bar */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2 text-sm">
            {breadcrumb}
            {badge && (
              <span className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" /> {badge}
              </span>
            )}
          </div>
          {headerActions && <div className="flex items-center gap-1.5">{headerActions}</div>}
        </header>

        {/* Horizontal stepper */}
        <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-4 py-2.5">
          <span className="mr-2 hidden shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
            {eyebrow}
          </span>
          {steps.map((s, i) => {
            const active = i === currentIndex;
            const done = i < currentIndex;
            const clickable = i <= currentIndex;
            return (
              <Fragment key={s.id}>
                {i > 0 && (
                  <span
                    className={cn(
                      "h-px w-6 shrink-0 sm:w-8",
                      i <= currentIndex ? "bg-success/40" : "bg-border",
                    )}
                  />
                )}
                <button
                  onClick={() => clickable && onStepSelect(i)}
                  disabled={!clickable}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors",
                    active
                      ? "bg-accent"
                      : clickable
                        ? "hover:bg-accent/50"
                        : "cursor-default",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : done
                          ? "border-success bg-success/10 text-success"
                          : "border-border text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-[13px] leading-tight",
                        active
                          ? "font-medium text-foreground"
                          : done
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {s.label}
                    </span>
                    {s.hint && (
                      <span className="block truncate text-[10.5px] font-normal text-muted-foreground">
                        {s.hint}
                      </span>
                    )}
                  </span>
                </button>
              </Fragment>
            );
          })}
        </nav>

        {/* Canvas */}
        <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-10">
          <div className="mx-auto w-full max-w-3xl space-y-6">{children}</div>
        </section>

        {/* Footer nav */}
        <footer className="flex h-14 shrink-0 items-center justify-between border-t border-border px-4">
          <button
            onClick={onBack}
            disabled={currentIndex === 0}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12.5px]",
              currentIndex === 0
                ? "cursor-default text-muted-foreground/40"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
          <p className="text-[11px] text-muted-foreground">
            Step {currentIndex + 1} of {steps.length} · {current?.label}
          </p>
          {footerActions}
        </footer>
      </div>
    </AppShell>
  );
}
