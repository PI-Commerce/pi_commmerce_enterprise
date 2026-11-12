import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Bot, BarChart3, Plug, Settings, Command,
  PanelLeftClose, PanelLeftOpen, Radio, ChevronRight, MessageCircle, MessageSquare, MessageSquareText,
  Inbox, Code2, Workflow, Send, FileText, Sparkles, ArrowUpRight, ArrowDownLeft, Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRegion } from "@/lib/region";

type Icon = React.ComponentType<{ className?: string }>;
type NavItem = { label: string; icon: Icon; to?: string; exact?: boolean };
type NavGroup = { label: string; icon: Icon; activePrefixes: string[]; children: NavItem[] };

const homeItems: NavItem[] = [
  { to: "/", label: "Home", icon: LayoutDashboard, exact: true },
  { label: "Ask Pi", icon: Sparkles },
];

const outboundGroup: NavGroup = {
  label: "Outbound",
  icon: ArrowUpRight,
  activePrefixes: ["/campaigns", "/broadcasts"],
  children: [
    { to: "/campaigns", label: "Journeys", icon: Workflow },
    { to: "/broadcasts", label: "Broadcasts", icon: Send },
  ],
};

const inboundGroup: NavGroup = {
  label: "Inbound",
  icon: ArrowDownLeft,
  activePrefixes: [],
  children: [
    { label: "Journeys", icon: Workflow },
  ],
};

const buildItems: NavItem[] = [
  { to: "/agents", label: "Agents", icon: Bot },
];

const observeItems: NavItem[] = [
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/reports", label: "Reports", icon: FileText },
];

const channelsGroup: NavGroup = {
  label: "Channels",
  icon: Radio,
  activePrefixes: ["/channels"],
  children: [
    { to: "/channels/whatsapp", label: "WhatsApp", icon: MessageCircle },
    { to: "/channels/sms", label: "SMS", icon: MessageSquare },
    { to: "/channels/rcs", label: "RCS", icon: MessageSquareText },
    { label: "Voice", icon: Phone },
  ],
};

const connectItems: NavItem[] = [
  { to: "/integrations", label: "Integrations", icon: Plug },
];

const adminItems: NavItem[] = [
  { to: "/developer", label: "Developer", icon: Code2 },
  { to: "/settings", label: "Settings", icon: Settings },
];

const STORAGE_KEY = "pc_sidebar_collapsed";

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { label: regionLabel, code: regionCode } = useRegion();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200",
        collapsed ? "w-[60px]" : "w-[220px]",
      )}
    >
      <div className={cn("flex h-12 items-center", collapsed ? "justify-center px-0" : "gap-2 px-4")}>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
          <Command className="h-3.5 w-3.5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight">Pi Commerce</p>
            <p className="truncate text-[10.5px] text-muted-foreground">ACME Corp · {regionLabel} ({regionCode})</p>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-2">
        <NavList items={homeItems} isActive={isActive} collapsed={collapsed} />

        <SectionLabel label="Build" collapsed={collapsed} />
        <GroupNav group={outboundGroup} path={path} isActive={isActive} collapsed={collapsed} />
        <GroupNav group={inboundGroup} path={path} isActive={isActive} collapsed={collapsed} />
        <NavList items={buildItems} isActive={isActive} collapsed={collapsed} />

        <SectionLabel label="Observe" collapsed={collapsed} />
        <NavList items={observeItems} isActive={isActive} collapsed={collapsed} />

        <SectionLabel label="Setup" collapsed={collapsed} />
        <GroupNav group={channelsGroup} path={path} isActive={isActive} collapsed={collapsed} />
        <NavList items={connectItems} isActive={isActive} collapsed={collapsed} />

        <div className="mt-auto">
          <SectionLabel label="Admin" collapsed={collapsed} divider />
          <NavList items={adminItems} isActive={isActive} collapsed={collapsed} />
        </div>
      </nav>

      <div className={cn("border-t border-border p-2", collapsed && "flex justify-center")}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex h-8 items-center gap-2.5 rounded-md text-[13px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
            collapsed ? "w-8 justify-center" : "w-full px-2.5",
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

function SectionLabel({ label, collapsed, divider }: { label: string; collapsed: boolean; divider?: boolean }) {
  if (collapsed) {
    return <div className="mx-auto my-2.5 h-px w-6 bg-border" />;
  }
  return (
    <>
      {divider && <div className="mb-1 mt-3 h-px bg-border" />}
      <p className={cn("px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70", divider ? "pt-2" : "pt-4")}>
        {label}
      </p>
    </>
  );
}

function GroupNav({
  group, path, isActive, collapsed,
}: {
  group: NavGroup;
  path: string;
  isActive: (to: string, exact?: boolean) => boolean;
  collapsed: boolean;
}) {
  const groupActive = group.activePrefixes.some((p) => path === p || path.startsWith(p + "/"));
  const [open, setOpen] = useState(groupActive);
  const firstLink = group.children.find((c) => c.to)?.to;

  if (collapsed) {
    const inner = (
      <>
        <group.icon className="h-4 w-4" />
      </>
    );
    return (
      <ul className="mt-0.5 space-y-0.5">
        <li>
          {firstLink ? (
            <Link
              to={firstLink}
              title={group.label}
              className={cn(
                "group flex h-9 w-9 items-center justify-center rounded-md",
                groupActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {inner}
            </Link>
          ) : (
            <div
              title={`${group.label} · Coming soon`}
              aria-disabled="true"
              className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground/40"
            >
              {inner}
            </div>
          )}
        </li>
      </ul>
    );
  }

  return (
    <ul className="mt-0.5 space-y-0.5">
      <li>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
            groupActive ? "font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          <group.icon className={cn("h-4 w-4 shrink-0", groupActive ? "text-foreground" : "text-muted-foreground")} />
          <span>{group.label}</span>
          <ChevronRight className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        </button>
        {open && (
          <ul className="mt-0.5 space-y-0.5 border-l border-border pl-3 ml-[18px]">
            {group.children.map((child) =>
              child.to ? (
                <li key={child.label}>
                  <Link
                    to={child.to}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors",
                      isActive(child.to) ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <child.icon className={cn("h-3.5 w-3.5 shrink-0", isActive(child.to) ? "text-foreground" : "text-muted-foreground")} />
                    {child.label}
                  </Link>
                </li>
              ) : (
                <li key={child.label}>
                  <div
                    title="Coming soon"
                    aria-disabled="true"
                    className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] text-muted-foreground/40"
                  >
                    <child.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                    <span>{child.label}</span>
                    <span className="ml-auto rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground/70">Soon</span>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </li>
    </ul>
  );
}

function NavList({
  items,
  isActive,
  collapsed,
}: {
  items: ReadonlyArray<NavItem>;
  isActive: (to: string, exact?: boolean) => boolean;
  collapsed: boolean;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        if (!item.to) {
          return (
            <li key={item.label}>
              <div
                title={collapsed ? `${item.label} · Coming soon` : "Coming soon"}
                aria-disabled="true"
                className={cn(
                  "flex cursor-not-allowed items-center rounded-md text-[13px] text-muted-foreground/40",
                  collapsed ? "h-9 w-9 justify-center" : "gap-2.5 px-2.5 py-1.5",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                {!collapsed && (
                  <>
                    <span>{item.label}</span>
                    <span className="ml-auto rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground/70">
                      Soon
                    </span>
                  </>
                )}
              </div>
            </li>
          );
        }
        const active = isActive(item.to, item.exact);
        return (
          <li key={item.to}>
            <Link
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group flex items-center rounded-md text-[13px] transition-colors",
                collapsed ? "h-9 w-9 justify-center" : "gap-2.5 px-2.5 py-1.5",
                active
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
              {!collapsed && item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
