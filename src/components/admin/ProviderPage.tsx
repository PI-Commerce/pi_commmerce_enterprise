/**
 * Shell for every Provider Console page.
 *
 * Does two jobs the individual pages shouldn't repeat:
 *  1. **Plane check.** A tenant-plane session that lands on `/admin/*` sees a
 *     dead end, not the console. In production this URL wouldn't resolve at all
 *     — it lives on a different deploy behind a different auth boundary — so
 *     the mock renders the closest honest equivalent.
 *  2. **Capability check.** Within the provider plane, roles still differ:
 *     SUPPORT can read every tenant but cannot provision a trunk, and only
 *     GLOBAL_ADMIN can mint provider accounts.
 */

import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { NoAccess } from "./AdminUI";
import { useSession } from "@/lib/admin-store";
import { can, ROLE_LABEL, type Capability } from "@/lib/admin-rbac";

export function ProviderPage({
  title,
  description,
  actions,
  capability,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Extra capability required on top of `provider_console`. */
  capability?: Capability;
  children: React.ReactNode;
}) {
  const session = useSession();
  const role = session.providerRole;

  if (session.plane !== "provider") {
    return (
      <AppShell>
        <div className="grid h-full place-items-center px-6">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground">
              <Building2 className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold">The Provider Console isn't part of your workspace</h2>
            <p className="mx-auto mt-1.5 text-[13px] text-muted-foreground">
              Tenant sessions never reach the control plane. In production this address
              resolves on a separate internal deploy that only a Paytm Google account
              can authenticate against.
            </p>
            <p className="mx-auto mt-4 max-w-sm rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              Demo tip: flip the plane toggle at the bottom of the sidebar to sign in as
              a provider principal.
            </p>
            <Button variant="outline" className="mt-5" asChild>
              <Link to="/">Back to the workspace</Link>
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (capability && !can(role, capability)) {
    return (
      <AppShell>
        <div className="flex h-full flex-col">
          <PageHeader title={title} description={description} />
          <NoAccess
            reason={`${ROLE_LABEL[role]} does not hold this capability. Ask a Global Admin if you need it, or check the Roles & Access matrix for who does.`}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell bare>
      <div className="flex h-full flex-col px-8 pb-6 pt-6">
        <PageHeader title={title} description={description} actions={actions} />
        {children}
      </div>
    </AppShell>
  );
}
