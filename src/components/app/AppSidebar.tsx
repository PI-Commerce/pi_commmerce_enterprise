import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Megaphone, Bot, BarChart3, Plug, Settings, Command,
  PanelLeftClose, PanelLeftOpen, Radio, ChevronRight, MessageCircle, MessageSquare, MessageSquareText,
  Users, Zap, Building2, Cable, ShieldCheck, UsersRound, Eye, ScrollText, KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRegion } from "@/lib/region";
import { PlaneSwitcher } from "./PlaneSwitcher";
import { useSession } from "@/lib/admin-store";
import { tenantById } from "@/lib/admin-data";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  disabled?: boolean;
};

/* ------------------------------ Tenant plane ------------------------------ */
/* Customer-facing. No Merchants, no Trunk Configuration — those are provider
   surfaces and their presence here is the isolation break the PRD closes. */

const tenantPrimary: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/quick-run", label: "Quick Run", icon: Zap, disabled: true },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

const tenantSecondary: NavItem[] = [
  { to: "/users", label: "Users", icon: UsersRound },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/settings", label: "Settings", icon: Settings, disabled: true },
];

/* ----------------------------- Provider plane ----------------------------- */
/* Paytm-internal control plane. Google SSO only, cross-tenant by design. */

const providerPrimary: NavItem[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/tenants", label: "Merchants", icon: Building2 },
  { to: "/admin/trunks", label: "Trunk Configuration", icon: Cable },
];

const providerPeople: NavItem[] = [
  { to: "/admin/provider-users", label: "Provider Users", icon: ShieldCheck },
  { to: "/admin/tenant-users", label: "Merchant Users", icon: UsersRound },
  { to: "/admin/roles", label: "Roles & Access", icon: KeyRound },
];

const providerOps: NavItem[] = [
  { to: "/admin/impersonate", label: "Impersonate", icon: Eye },
  { to: "/admin/audit", label: "Audit Log", icon: ScrollText },
];

type ChannelChild = { label: string; icon: React.ComponentType<{ className?: string }>; to?: string };
const channelChildren: ChannelChild[] = [
  { to: "/channels/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { label: "Meta Ads", icon: Megaphone },
  { to: "/channels/sms", label: "SMS", icon: MessageSquare },
  { to: "/channels/rcs", label: "RCS", icon: MessageSquareText },
];

const STORAGE_KEY = "pc_sidebar_collapsed";

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { label: regionLabel, code: regionCode } = useRegion();
  const session = useSession();
  const provider = session.plane === "provider";
  const tenant = tenantById(session.tenantId);

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
        "flex h-full shrink-0 flex-col border-r transition-[width] duration-200",
        collapsed ? "w-[60px]" : "w-[220px]",
        provider ? "border-ai/20 bg-ai/[0.035]" : "border-border bg-background",
      )}
    >
      {/* Brand + plane identity */}
      <div className={cn("flex h-12 items-center", collapsed ? "justify-center px-0" : "gap-2 px-4")}>
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            provider ? "bg-ai text-white" : "bg-foreground text-background",
          )}
        >
          {provider ? <ShieldCheck className="h-3.5 w-3.5" /> : <Command className="h-3.5 w-3.5" />}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight">
              {provider ? "Provider Console" : "Pi Commerce"}
            </p>
            <p className="truncate text-[10.5px] text-muted-foreground">
              {provider
                ? "Paytm internal · control plane"
                : `${tenant?.name ?? "ACME Corp"} · ${regionLabel} (${regionCode})`}
            </p>
          </div>
        )}
      </div>

      {provider && !collapsed && (
        <div className="mx-3 mb-1 rounded-md border border-ai/25 bg-ai/10 px-2 py-1 text-[9.5px] font-medium uppercase tracking-wide text-ai">
          Cross-merchant access
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {provider ? (
          <>
            <NavSection items={providerPrimary} isActive={isActive} collapsed={collapsed} accent={provider} />
            <SectionLabel collapsed={collapsed}>People</SectionLabel>
            <NavSection items={providerPeople} isActive={isActive} collapsed={collapsed} accent={provider} />
            <SectionLabel collapsed={collapsed}>Operations</SectionLabel>
            <NavSection items={providerOps} isActive={isActive} collapsed={collapsed} accent={provider} />
          </>
        ) : (
          <>
            <NavSection items={tenantPrimary} isActive={isActive} collapsed={collapsed} accent={provider} />
            <ChannelsNav path={path} isActive={isActive} collapsed={collapsed} />
            <div className="my-3 h-px bg-border" />
            <NavSection items={tenantSecondary} isActive={isActive} collapsed={collapsed} accent={provider} />
          </>
        )}
      </nav>

      <div className={cn("border-t p-2", provider ? "border-ai/20" : "border-border", collapsed && "flex flex-col items-center gap-1")}>
        <PlaneSwitcher collapsed={collapsed} />
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex h-8 items-center gap-2.5 rounded-md text-[13px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
            collapsed ? "w-8 justify-center" : "mt-1 w-full px-2.5",
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 h-px bg-border" />;
  return (
    <p className="mb-1 mt-4 px-2.5 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {children}
    </p>
  );
}

/** Channels: an expandable sidebar group. WhatsApp is live; the rest are roadmap. */
function ChannelsNav({
  path, isActive, collapsed,
}: {
  path: string;
  isActive: (to: string, exact?: boolean) => boolean;
  collapsed: boolean;
}) {
  const onChannels = path.startsWith("/channels");
  const [open, setOpen] = useState(onChannels);

  if (collapsed) {
    return (
      <ul className="mt-0.5 space-y-0.5">
        <li>
          <Link
            to="/channels/whatsapp"
            title="Channels"
            className={cn(
              "group flex h-9 w-9 items-center justify-center rounded-md",
              onChannels ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Radio className="h-4 w-4" />
          </Link>
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
            onChannels ? "font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          <Radio className={cn("h-4 w-4 shrink-0", onChannels ? "text-foreground" : "text-muted-foreground")} />
          <span>Channels</span>
          <ChevronRight className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        </button>
        {open && (
          <ul className="mt-0.5 space-y-0.5 border-l border-border pl-3 ml-[18px]">
            {channelChildren.map((child) =>
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

function NavSection({
  items,
  isActive,
  collapsed,
  accent = false,
}: {
  items: ReadonlyArray<NavItem>;
  isActive: (to: string, exact?: boolean) => boolean;
  collapsed: boolean;
  accent?: boolean;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        if (item.disabled) {
          return (
            <li key={item.to}>
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
                  ? accent
                    ? "bg-ai/15 font-medium text-ai"
                    : "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  active ? (accent ? "text-ai" : "text-foreground") : "text-muted-foreground",
                )}
              />
              {!collapsed && item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
