import { AppSidebar } from "./AppSidebar";
import { AskPiDock } from "./AskPiDock";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  bare = false,
}: {
  children: React.ReactNode;
  /** When true, removes the page padding (use for full-bleed canvas pages) */
  bare?: boolean;
  /** @deprecated Ask Pi is omnipresent across the shell; the canvas has its own composer. */
  showAskPi?: boolean;
}) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <main className={cn("relative flex-1 overflow-y-auto", !bare && "px-8 py-6")}>{children}</main>
        {/* I2 — omnipresent, route-aware Ask Pi. Anchored to the content area (not the
            sidebar); the full-screen builder mounts its own canvas composer instead. */}
        <AskPiDock />
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
