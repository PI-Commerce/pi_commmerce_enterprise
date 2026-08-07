import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2, Cable, ShieldCheck, UsersRound, Eye, ScrollText, ArrowRight, KeyRound, Activity,
} from "lucide-react";
import { ProviderPage } from "@/components/admin/ProviderPage";
import { Card, Callout, Pill, RoleBadge, StatCard, statusTone } from "@/components/admin/AdminUI";
import { useSession, useTenants, useTrunks, useProviderUsers, useTenantUsers, useAudit } from "@/lib/admin-store";
import { ROLE_BLURB, ROLE_LABEL, capabilitiesOf } from "@/lib/admin-rbac";
import { PROVIDER_SSO_GROUP } from "@/lib/admin-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
  head: () => ({ meta: [{ title: "Provider Console · Pi Commerce" }] }),
});

const SHORTCUTS = [
  { to: "/admin/tenants", label: "Tenants", icon: Building2, blurb: "Onboard, suspend and inspect merchant accounts." },
  { to: "/admin/trunks", label: "Trunk Configuration", icon: Cable, blurb: "Provision SIP trunks and set concurrency." },
  { to: "/admin/provider-users", label: "Provider Users", icon: ShieldCheck, blurb: "Who inside Paytm holds the console." },
  { to: "/admin/tenant-users", label: "Tenant Users", icon: UsersRound, blurb: "Every tenant member, cross-tenant read." },
  { to: "/admin/impersonate", label: "Impersonate", icon: Eye, blurb: "Open a time-boxed session into one tenant." },
  { to: "/admin/audit", label: "Audit Log", icon: ScrollText, blurb: "Append-only record of every privileged action." },
] as const;

function AdminOverview() {
  const session = useSession();
  const tenants = useTenants();
  const trunks = useTrunks();
  const providerUsers = useProviderUsers();
  const tenantUsers = useTenantUsers();
  const audit = useAudit();

  const role = session.providerRole;
  const live = tenants.filter((t) => t.status === "Live").length;
  const onboarding = tenants.filter((t) => t.status === "Onboarding").length;
  const suspended = tenants.filter((t) => t.status === "Suspended").length;
  const activeProviders = providerUsers.filter((u) => u.status === "Active").length;
  const capacity = trunks.filter((t) => t.status === "Active").reduce((n, t) => n + t.concurrency, 0);
  const held = capabilitiesOf(role);

  return (
    <ProviderPage
      title="Provider Console"
      description="The Paytm-internal control plane. Cross-tenant by design, Google SSO only, every action audited."
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-2">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Tenants"
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
            label="Tenant members"
            value={tenantUsers.length}
            sub="Across every tenant"
            icon={<UsersRound className="h-4 w-4" />}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <Card title="Where to go" description="The six surfaces of the control plane.">
            <div className="grid gap-2 sm:grid-cols-2">
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

          <div className="space-y-4">
            <Card title="Your session" description="What this principal can do right now.">
              <div className="flex items-center gap-2.5 rounded-lg border border-ai/25 bg-ai/[0.06] p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-ai/15 text-ai">
                  <KeyRound className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium">{ROLE_LABEL[role]}</p>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{ROLE_BLURB[role]}</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5">
                {held.map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-[11.5px]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ai" />
                    <span>
                      <span className="font-medium">{c.label}</span>
                      <span className="block text-[10.5px] text-muted-foreground">{c.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Callout className="mt-3">
                Access is derived from the <code className="font-mono">{PROVIDER_SSO_GROUP}</code> Workspace
                group. Remove the account from the group and the console closes on the next token refresh —
                provider tokens live at most 8 hours.
              </Callout>
            </Card>

            <Card
              title="Recent activity"
              description="Newest first."
              actions={
                <Link
                  to="/admin/audit"
                  className="flex items-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Full log <ArrowRight className="h-3 w-3" />
                </Link>
              }
            >
              <ul className="space-y-2.5">
                {audit.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md",
                        e.viaImpersonation ? "bg-ai/15 text-ai" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      <Activity className="h-3 w-3" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px]">{e.summary}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="truncate">{e.actor}</span>
                        <span>·</span>
                        <span>{e.at}</span>
                        {e.viaImpersonation && <Pill tone="ai" className="px-1.5 py-0 text-[9px]">impersonated</Pill>}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        <Card title="Tenants at a glance" description="The eight accounts currently provisioned.">
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
