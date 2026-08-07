import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, Eye, Lock } from "lucide-react";
import { toast } from "sonner";
import { ProviderPage } from "@/components/admin/ProviderPage";
import {
  TableShell, HeadRow, BodyRow, EmptyRow, Pagination, paginate, Field, Toolbar,
  Pill, statusTone, RoleBadge, Callout,
} from "@/components/admin/AdminUI";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession, useTenants, useTenantUsers, startImpersonation } from "@/lib/admin-store";
import { TENANT_ROLES, ROLE_LABEL, can, type TenantRole } from "@/lib/admin-rbac";

export const Route = createFileRoute("/admin/tenant-users")({
  component: TenantUsersPage,
  head: () => ({ meta: [{ title: "Tenant Users · Provider Console" }] }),
});

const GRID = "grid-cols-[1.4fr_1.7fr_1.3fr_0.9fr_0.9fr_1.1fr_auto]";

function TenantUsersPage() {
  const session = useSession();
  const users = useTenantUsers();
  const tenants = useTenants();
  const navigate = useNavigate();
  const mayImpersonate = can(session.providerRole, "impersonation");

  const [q, setQ] = useState("");
  const [tenantId, setTenantId] = useState("all");
  const [role, setRole] = useState<"all" | TenantRole>("all");
  const [page, setPage] = useState(0);

  const nameOf = (id: string) => tenants.find((t) => t.id === id)?.name ?? id;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (tenantId !== "all" && u.tenantId !== tenantId) return false;
      if (role !== "all" && u.role !== role) return false;
      if (!needle) return true;
      return u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle);
    });
  }, [users, q, tenantId, role]);

  const view = paginate(rows, page);

  return (
    <ProviderPage
      title="Tenant Users"
      description="Every member of every tenant. Read-only by design — rosters belong to the tenant's own Admin."
      capability="cross_tenant_read"
    >
      <Toolbar>
        <Field label="Search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="Name or email"
              className="h-9 w-[240px] pl-9"
            />
          </div>
        </Field>
        <Field label="Tenant">
          <Select value={tenantId} onValueChange={(v) => { setTenantId(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants</SelectItem>
              {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Role">
          <Select value={role} onValueChange={(v) => { setRole(v as typeof role); setPage(0); }}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {TENANT_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="ml-auto flex items-center gap-2">
          <Pill tone="warning"><Lock className="h-3 w-3" /> read-only</Pill>
          <Pill tone="ai">{rows.length} of {users.length}</Pill>
        </div>
      </Toolbar>

      <TableShell>
        <HeadRow grid={GRID}>
          <span>Name</span>
          <span>Email</span>
          <span>Tenant</span>
          <span>Role</span>
          <span>Status</span>
          <span>Last seen</span>
          <span className="w-24 text-right">Actions</span>
        </HeadRow>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view.length === 0 ? (
            <EmptyRow>No members match this filter.</EmptyRow>
          ) : (
            view.map((u) => (
              <BodyRow key={u.id} grid={GRID} className={u.status === "Disabled" ? "opacity-60" : undefined}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[9.5px] font-semibold">
                    {u.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
                  </span>
                  <span className="truncate font-medium">{u.name}</span>
                </span>
                <span className="truncate text-[12.5px] text-muted-foreground">{u.email}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px]">{nameOf(u.tenantId)}</span>
                  <span className="block font-mono text-[10.5px] text-muted-foreground">{u.tenantId}</span>
                </span>
                <RoleBadge role={u.role} />
                <Pill tone={statusTone(u.status)}>{u.status}</Pill>
                <span className="text-[12px] text-muted-foreground">{u.lastSeen}</span>
                <span className="flex w-24 items-center justify-end">
                  <button
                    type="button"
                    disabled={!mayImpersonate}
                    title={mayImpersonate ? "Open a 30-minute session in this tenant" : "Workspace Admin cannot impersonate"}
                    onClick={() => {
                      startImpersonation({ tenantId: u.tenantId, ticket: "PICOM-AD-HOC" });
                      toast.success(`Impersonating ${nameOf(u.tenantId)}`, { description: "Session ends in 30:00." });
                      navigate({ to: "/" });
                    }}
                    className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Eye className="h-3 w-3" /> Enter
                  </button>
                </span>
              </BodyRow>
            ))
          )}
        </div>

        <Pagination page={page} total={rows.length} onPage={setPage} />
      </TableShell>

      <Callout className="mt-3">
        There is deliberately no "edit" here. A provider principal that could silently promote a
        customer's user would be indistinguishable from the isolation break this redesign removes.
        To act inside a tenant, open an impersonation session — it is time-boxed, attributed to you,
        and visible to the customer.
      </Callout>
    </ProviderPage>
  );
}
