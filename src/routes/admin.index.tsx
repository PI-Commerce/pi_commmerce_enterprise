import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2, Cable, ShieldCheck, UsersRound, Eye, ScrollText, ArrowRight,
} from "lucide-react";
import { ProviderPage } from "@/components/admin/ProviderPage";
import { Card, Pill, RoleBadge, StatCard, statusTone } from "@/components/admin/AdminUI";
import { useTenants, useTrunks, useProviderUsers, useTenantUsers } from "@/lib/admin-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
  head: () => ({ meta: [{ title: "Provider Console · Pi Commerce" }] }),
});

const SHORTCUTS = [
  { to: "/admin/tenants", label: "Merchants", icon: Building2, blurb: "Onboard, suspend and inspect merchant accounts." },
  { to: "/admin/trunks", label: "Trunk Configuration", icon: Cable, blurb: "Provision SIP trunks and set concurrency." },
  { to: "/admin/provider-users", label: "Provider Users", icon: ShieldCheck, blurb: "Who inside Paytm holds the console." },
  { to: "/admin/tenant-users", label: "Merchant Users", icon: UsersRound, blurb: "Every merchant member, cross-merchant read." },
  { to: "/admin/impersonate", label: "Impersonate", icon: Eye, blurb: "Open a time-boxed session into one merchant." },
  { to: "/admin/audit", label: "Audit Log", icon: ScrollText, blurb: "Append-only record of every privileged action." },
] as const;

function AdminOverview() {
  const tenants = useTenants();
  const trunks = useTrunks();
  const providerUsers = useProviderUsers();
  const tenantUsers = useTenantUsers();

  const live = tenants.filter((t) => t.status === "Live").length;
  const onboarding = tenants.filter((t) => t.status === "Onboarding").length;
  const suspended = tenants.filter((t) => t.status === "Suspended").length;
  const activeProviders = providerUsers.filter((u) => u.status === "Active").length;
  const capacity = trunks.filter((t) => t.status === "Active").reduce((n, t) => n + t.concurrency, 0);

  return (
    <ProviderPage
      title="Provider Console"
      description="The Paytm-internal control plane. Cross-merchant by design, Google SSO only, every action audited."
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-2">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Merchants"
            value={tenants.length}
            sub={`${live} live · ${onboarding} onboarding · ${suspended} suspended`}
            icon={<Building2 className="h-4 w-4" />}
            accent
          />
          <StatCard
            label="Trunk capacity"
            value={capacity}
            sub={`${trunks.length} trunks provisioned`}
            icon={<Cable className="h-4 w-4" />}
          />
          <StatCard
            label="Provider principals"
            value={activeProviders}
            sub={`${providerUsers.length - activeProviders} revoked`}
            icon={<ShieldCheck className="h-4 w-4" />}
          />
          <StatCard
            label="Merchant members"
            value={tenantUsers.length}
            sub="Across every merchant"
            icon={<UsersRound className="h-4 w-4" />}
          />
        </div>

        <Card title="Where to go" description="The six surfaces of the control plane.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SHORTCUTS.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className="group flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:border-ai/30 hover:bg-ai/[0.05]"
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground transition-colors group-hover:bg-ai/15 group-hover:text-ai">
                  <s.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-[12.5px] font-medium">
                    {s.label}
                    <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{s.blurb}</span>
                </span>
              </Link>
            ))}
          </div>
        </Card>

        <Card title="Merchants at a glance" description="The eight accounts currently provisioned.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {tenants.map((t) => (
              <Link
                key={t.id}
                to="/admin/tenants"
                className="rounded-lg border border-border p-3 transition-colors hover:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-[12.5px] font-medium">{t.name}</p>
                  <Pill tone={statusTone(t.status)} className="shrink-0">{t.status}</Pill>
                </div>
                <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">merchant {t.id}</p>
                <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                  {t.members} members · {t.channels.join(", ")}
                </p>
              </Link>
            ))}
          </div>
        </Card>

        <Card title="Who holds the console" description="Provider principals and their standing grants.">
          <div className="flex flex-wrap gap-2">
            {providerUsers.map((u) => (
              <span
                key={u.id}
                className={cn(
                  "flex items-center gap-2 rounded-full border py-1 pl-1 pr-3",
                  u.status === "Active" ? "border-border bg-card" : "border-destructive/25 bg-destructive/5 opacity-70",
                )}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-secondary text-[9.5px] font-semibold">
                  {u.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
                </span>
                <span className="text-[11.5px]">{u.name}</span>
                <RoleBadge role={u.role} className="text-[10px]" />
              </span>
            ))}
          </div>
        </Card>
      </div>
    </ProviderPage>
  );
}
