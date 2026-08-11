import { createFileRoute } from "@tanstack/react-router";
import { Check, Minus } from "lucide-react";
import { ProviderPage } from "@/components/admin/ProviderPage";
import { Card, Callout } from "@/components/admin/AdminUI";
import {
  CAPABILITIES, PROVIDER_ROLES, TENANT_ROLES, ROLE_LABEL,
  can, type AnyRole,
} from "@/lib/admin-rbac";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/roles")({
  component: RolesPage,
  head: () => ({ meta: [{ title: "Roles & Access · Provider Console" }] }),
});

const ALL_ROLES: AnyRole[] = [...PROVIDER_ROLES, ...TENANT_ROLES];
const GRID = "grid-cols-[minmax(220px,1.6fr)_repeat(6,minmax(72px,1fr))]";

function RolesPage() {
  return (
    <ProviderPage
      title="Roles & Access"
      description="Capabilities as rows, roles as columns. A new role is a new column; a new capability is a new row."
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-2">
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
              <strong>Build content</strong>, they write to merchant data only inside an impersonation
              session, which is a transient session capability rather than a standing grant.
            </Callout>
            <Callout>
              Ranks are not comparable across planes. A merchant Admin and a Global Admin both rank 3 in
              their own plane, and neither can mint a role in the other.
            </Callout>
          </div>
        </Card>
      </div>
    </ProviderPage>
  );
}
