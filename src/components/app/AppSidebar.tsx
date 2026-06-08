import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Megaphone, Bot, BarChart3, Plug, Settings, Command, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const primary = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

const secondary = [
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/") || path === to;

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-background">
      <div className="flex h-12 items-center gap-2 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
          <Command className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-tight">Pi Commerce</p>
          <p className="truncate text-[10.5px] text-muted-foreground">ABC Enterprises</p>
        </div>
      </div>

      <nav className="flex-1 px-2 py-2">
        <NavSection items={primary} isActive={isActive} />
        <div className="my-3 h-px bg-border" />
        <NavSection items={secondary} isActive={isActive} />
      </nav>

      <div className="m-2 rounded-xl border border-border bg-secondary/40 p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-ai">
          <Sparkles className="h-3 w-3" /> Ask Pi
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          Press <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">⌘ K</kbd> anywhere to summon Pi!
        </p>
      </div>
    </aside>
  );
}

function NavSection({
  items,
  isActive,
}: {
  items: ReadonlyArray<{ to: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean }>;
  isActive: (to: string, exact?: boolean) => boolean;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(item.to, item.exact);
        return (
          <li key={item.to}>
            <Link
              to={item.to}
              className={cn(
                "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                active
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <item.icon className={cn("h-4 w-4", active ? "text-foreground" : "text-muted-foreground")} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
