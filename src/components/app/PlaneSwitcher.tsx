/**
 * The bottom-left plane switcher.
 *
 * **Demo device only.** In production the two planes ship as two deploys behind
 * two auth boundaries — the Provider Console on an internal subdomain gated by
 * Google SSO + Workspace-group allowlist, the Tenant Workspace on the customer
 * domain. A single bundle that can render both is exactly the tenant-isolation
 * break the PRD is fixing. This control exists so the mock can be walked
 * end-to-end in one session; it has no production analogue and says so.
 */

import { Building2, ChevronsUpDown, Check, ShieldCheck, RotateCcw, Lock } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  useSession, setPlane, setProviderRole, setTenantRole, resetAdminMock, defaultActor,
} from "@/lib/admin-store";
import { tenantById } from "@/lib/admin-data";
import {
  PROVIDER_ROLES, TENANT_ROLES, ROLE_LABEL, ROLE_BLURB,
  type ProviderRole, type TenantRole,
} from "@/lib/admin-rbac";

function initials(email: string): string {
  const local = email.split("@")[0];
  const parts = local.split(/[.\-_]/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || local.slice(0, 2).toUpperCase();
}

export function PlaneSwitcher({ collapsed }: { collapsed: boolean }) {
  const session = useSession();
  const provider = session.plane === "provider";
  const impersonating = !!session.impersonation;
  const tenant = tenantById(session.tenantId);
  const actor = defaultActor(session);
  const role = provider ? session.providerRole : session.tenantRole;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => !impersonating && setPlane(provider ? "tenant" : "provider")}
        disabled={impersonating}
        title={
          impersonating
            ? "Exit the impersonation session to switch planes"
            : `${provider ? "Provider Console" : "Tenant Workspace"} · click to switch`
        }
        className={cn(
          "grid h-8 w-8 place-items-center rounded-md border transition-colors",
          provider
            ? "border-ai/30 bg-ai/10 text-ai hover:bg-ai/20"
            : "border-border bg-secondary text-foreground hover:bg-accent",
          impersonating && "cursor-not-allowed opacity-60",
        )}
      >
        {provider ? <ShieldCheck className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {/* Segmented plane control — the headline switch. */}
      <div
        className={cn(
          "grid grid-cols-2 gap-1 rounded-lg border border-border bg-secondary/60 p-1",
          impersonating && "opacity-60",
        )}
      >
        <PlaneTab
          active={provider}
          disabled={impersonating}
          onClick={() => setPlane("provider")}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="Provider"
          accent="ai"
        />
        <PlaneTab
          active={!provider}
          disabled={impersonating}
          onClick={() => setPlane("tenant")}
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Tenant"
          accent="neutral"
        />
      </div>

      {/* Identity + role picker. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors",
              provider
                ? "border-ai/25 bg-ai/[0.06] hover:bg-ai/10"
                : "border-border bg-card hover:bg-accent/50",
            )}
          >
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-md text-[10.5px] font-semibold",
                provider ? "bg-ai/15 text-ai" : "bg-foreground text-background",
              )}
            >
              {initials(actor)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] font-medium leading-tight">
                {ROLE_LABEL[role]}
              </span>
              <span className="block truncate text-[10px] leading-tight text-muted-foreground">
                {provider ? "Paytm internal" : (tenant?.name ?? "Tenant")}
              </span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="top" align="start" className="w-[264px]">
          <DropdownMenuLabel className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            Signed in as
          </DropdownMenuLabel>
          <div className="px-2 pb-1.5 text-[11.5px]">
            <p className="truncate font-medium">{actor}</p>
            <p className="truncate text-[10.5px] text-muted-foreground">
              {provider
                ? "Google SSO · picommerce-ops@paytm.com"
                : `${tenant?.name ?? "Tenant"} · merchant ${session.tenantId}`}
            </p>
          </div>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            View as {provider ? "provider" : "tenant"} role
          </DropdownMenuLabel>

          {provider
            ? PROVIDER_ROLES.map((r) => (
                <RoleItem
                  key={r}
                  role={r}
                  active={session.providerRole === r}
                  onSelect={() => setProviderRole(r as ProviderRole)}
                />
              ))
            : TENANT_ROLES.map((r) => (
                <RoleItem
                  key={r}
                  role={r}
                  active={session.tenantRole === r}
                  onSelect={() => setTenantRole(r as TenantRole)}
                />
              ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => resetAdminMock()} className="text-[11.5px]">
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Reset demo data
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <p className="flex items-start gap-1.5 px-0.5 text-[9.5px] leading-relaxed text-muted-foreground/70">
        <Lock className="mt-[1px] h-2.5 w-2.5 shrink-0" />
        <span>Demo toggle. Production ships two deploys behind two auth boundaries.</span>
      </p>
    </div>
  );
}

function PlaneTab({
  active, disabled, onClick, icon, label, accent,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent: "ai" | "neutral";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Exit the impersonation session to switch planes" : undefined}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-medium transition-all",
        disabled && "cursor-not-allowed",
        active
          ? accent === "ai"
            ? "bg-ai text-white shadow-sm"
            : "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function RoleItem({
  role, active, onSelect,
}: {
  role: ProviderRole | TenantRole;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="items-start gap-2 py-1.5">
      <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", !active && "opacity-0")} />
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium">{ROLE_LABEL[role]}</span>
        <span className="block text-[10px] leading-snug text-muted-foreground">{ROLE_BLURB[role]}</span>
      </span>
    </DropdownMenuItem>
  );
}
