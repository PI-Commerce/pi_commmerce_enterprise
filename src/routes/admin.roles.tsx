import { createFileRoute } from "@tanstack/react-router";
import { Check, Minus, ShieldCheck, Building2, ArrowRight, Clock, Lock, Layers } from "lucide-react";
import { ProviderPage } from "@/components/admin/ProviderPage";
import { Card, Callout, Pill } from "@/components/admin/AdminUI";
import {
  CAPABILITIES, PROVIDER_ROLES, TENANT_ROLES, ROLE_BLURB, ROLE_LABEL, ROLE_MIGRATION,
  can, ROLE_RANK, type AnyRole,
} from "@/lib/admin-rbac";
import { IMPERSONATION_MINUTES } from "@/lib/admin-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/roles")({
  component: RolesPage,
  head: () => ({ meta: [{ title: "Roles & Access · Provider Console" }] }),
});

const ALL_ROLES: AnyRole[] = [...PROVIDER_ROLES, ...TENANT_ROLES];
const GRID = "grid-cols-[minmax(220px,1.6fr)_repeat(6,minmax(72px,1fr))]";

const GUARANTEES = [
  { icon: Clock, title: "Provider tokens expire in 8 hours", body: "A laptop left open overnight is signed out by morning. Tenant sessions follow the customer's own policy." },
  { icon: Clock, title: `Impersonation caps at ${IMPERSONATION_MINUTES} minutes`, body: "Non-renewable. A longer investigation needs a new session against a new ticket." },
  { icon: Lock, title: "The audit log is append-only", body: "No role, including Global Admin, holds UPDATE or DELETE on it." },
  { icon: Layers, title: "RLS is the boundary, not this table", body: "Every screen here is the last layer of defence. If the UI gate is the only gate, the feature is not shipped." },
];

function RolesPage() {
  return (
    <ProviderPage
      title="Roles & Access"
      description="Capabilities as rows, roles as columns. A new role is a new column; a new capability is a new row."
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-2">
        {/* Plane legend */}
        <div className="grid gap-3 lg:grid-cols-2">
          <PlaneCard
            plane="provider"
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Provider plane — the control plane"
            body="Paytm-internal. Google SSO only, cross-tenant by design, no standing write access into tenant data."
            roles={PROVIDER_ROLES}
          />
          <PlaneCard
            plane="tenant"
            icon={<Building2 className="h-4 w-4" />}
            title="Tenant plane — the data plane"
            body="One customer, hard-scoped. Every query is filtered by tenant id at the database, not in the query builder."
            roles={TENANT_ROLES}
          />
        </div>

        {/* The matrix */}
        <Card
          title="Capability matrix"
          description="The single source of truth. The server contract and the RLS policy mirror this table exactly."
        >
          <div className="overflow-x-auto rounded-lg border border-border">
            <div className={cn("grid items-stretch border-b border-border bg-secondary/40", GRID)}>
              <div className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Capability
              </div>
              {ALL_ROLES.map((r, i) => (
                <div
                  key={r}
                  className={cn(
                    "px-2 py-2.5 text-center text-[10.5px] font-semibold leading-tight",
                    i < 3 ? "bg-ai/[0.07] text-ai" : "text-muted-foreground",
                    i === 3 && "border-l-2 border-border",
                  )}
                >
                  {ROLE_LABEL[r]}
                </div>
              ))}
            </div>

            {CAPABILITIES.map((cap) => (
              <div
                key={cap.key}
                className={cn("grid items-center border-b border-border last:border-0 hover:bg-accent/30", GRID)}
              >
                <div className="px-3 py-2.5">
                  <p className="text-[12.5px] font-medium">{cap.label}</p>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{cap.note}</p>
                </div>
                {ALL_ROLES.map((r, i) => {
                  const yes = can(r, cap.key);
                  return (
                    <div
                      key={r}
                      className={cn(
                        "grid h-full place-items-center py-2.5",
                        i < 3 && "bg-ai/[0.035]",
                        i === 3 && "border-l-2 border-border",
                      )}
                    >
                      {yes ? (
                        <span
                          className={cn(
                            "grid h-5 w-5 place-items-center rounded-full",
                            i < 3 ? "bg-ai/15 text-ai" : "bg-success/15 text-success",
                          )}
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      ) : (
                        <Minus className="h-3.5 w-3.5 text-muted-foreground/25" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Callout>
              Two holes are deliberate. Provider roles never hold <strong>Own workspace</strong> or{" "}
              <strong>Build content</strong> — they write to tenant data only inside an impersonation
              session, which is a transient session capability rather than a standing grant.
            </Callout>
            <Callout>
              Ranks are not comparable across planes. A tenant Admin and a Global Admin both rank 3 in
              their own plane, and neither can mint a role in the other.
            </Callout>
          </div>
        </Card>

        {/* Grant rules */}
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Card title="Grant rules" description="Checked on every write, in this order.">
            <ol className="space-y-2.5">
              {[
                "The target role must sit in the same plane as the granter.",
                "The granter must hold the relevant management capability.",
                "The target's rank must not exceed the granter's own rank.",
              ].map((rule, i) => (
                <li key={rule} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold">
                    {i + 1}
                  </span>
                  <span className="text-[12px] leading-snug">{rule}</span>
                </li>
              ))}
            </ol>
            <div className="mt-3 space-y-1.5">
              {ALL_ROLES.map((r) => (
                <div key={r} className="flex items-center gap-2 text-[11px]">
                  <span className="w-[120px] shrink-0 truncate text-muted-foreground">{ROLE_LABEL[r]}</span>
                  <span className="flex gap-0.5">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-1.5 w-6 rounded-full",
                          i < ROLE_RANK[r]
                            ? PROVIDER_ROLES.includes(r as never) ? "bg-ai" : "bg-foreground/70"
                            : "bg-border",
                        )}
                      />
                    ))}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground">rank {ROLE_RANK[r]}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Migration from today's model" description="What happens to the three roles that exist now.">
            <ul className="space-y-2.5">
              {ROLE_MIGRATION.map((m) => (
                <li key={m.from} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="muted">{m.from}</Pill>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <Pill tone="ai">{m.to}</Pill>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{m.note}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card title="Non-functional guarantees" description="The commitments the security review is actually checking.">
          <div className="grid gap-3 sm:grid-cols-2">
            {GUARANTEES.map((g) => (
              <div key={g.title} className="flex items-start gap-2.5 rounded-lg border border-border p-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                  <g.icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium">{g.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{g.body}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </ProviderPage>
  );
}

function PlaneCard({
  plane, icon, title, body, roles,
}: {
  plane: "provider" | "tenant";
  icon: React.ReactNode;
  title: string;
  body: string;
  roles: readonly AnyRole[];
}) {
  const accent = plane === "provider";
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        accent ? "border-ai/25 bg-ai/[0.05]" : "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid h-7 w-7 place-items-center rounded-md",
            accent ? "bg-ai text-white" : "bg-foreground text-background",
          )}
        >
          {icon}
        </span>
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{body}</p>
      <ul className="mt-3 space-y-2">
        {roles.map((r) => (
          <li key={r} className="flex items-start gap-2">
            <Pill tone={accent ? "ai" : "muted"} className="mt-0.5 shrink-0">{ROLE_LABEL[r]}</Pill>
            <span className="text-[11px] leading-snug text-muted-foreground">{ROLE_BLURB[r]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
