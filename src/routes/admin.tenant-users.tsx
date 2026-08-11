import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, Eye, Lock, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ProviderPage } from "@/components/admin/ProviderPage";
import {
  TableShell, HeadRow, BodyRow, EmptyRow, Pagination, paginate, Field, Toolbar,
  Pill, statusTone, RoleBadge, Callout,
} from "@/components/admin/AdminUI";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useSession, useTenants, useTenantUsers, startImpersonation, addTenantUser, removeTenantUser,
} from "@/lib/admin-store";
import type { TenantUser } from "@/lib/admin-data";
import { TENANT_ROLES, ROLE_LABEL, can, type TenantRole } from "@/lib/admin-rbac";

export const Route = createFileRoute("/admin/tenant-users")({
  component: TenantUsersPage,
  head: () => ({ meta: [{ title: "Merchant Users · Provider Console" }] }),
});

const GRID = "grid-cols-[1.4fr_1.7fr_1.3fr_0.9fr_0.9fr_1.1fr_auto]";

function TenantUsersPage() {
  const session = useSession();
  const users = useTenantUsers();
  const tenants = useTenants();
  const navigate = useNavigate();
  const role = session.providerRole;
  const mayImpersonate = can(role, "impersonation");
  const mayManage = can(role, "provisioning");

  const [q, setQ] = useState("");
  const [tenantId, setTenantId] = useState("all");
  const [role_, setRole] = useState<"all" | TenantRole>("all");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<TenantUser | null>(null);

  const nameOf = (id: string) => tenants.find((t) => t.id === id)?.name ?? id;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (tenantId !== "all" && u.tenantId !== tenantId) return false;
      if (role_ !== "all" && u.role !== role_) return false;
      if (!needle) return true;
      return u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle);
    });
  }, [users, q, tenantId, role_]);

  const view = paginate(rows, page);

  return (
    <ProviderPage
      title="Merchant Users"
      description="Every member of every merchant. A merchant owns its own roster; the provider plane only mints or removes a member to bootstrap or repair one."
      capability="cross_tenant_read"
      actions={
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!mayManage}
          title={mayManage ? undefined : "Support is read-only. Ask a Workspace or Global Admin."}
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> Create Merchant User
        </Button>
      }
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
        <Field label="Merchant">
          <Select value={tenantId} onValueChange={(v) => { setTenantId(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All merchants</SelectItem>
              {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Role">
          <Select value={role_} onValueChange={(v) => { setRole(v as typeof role_); setPage(0); }}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {TENANT_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="ml-auto flex items-center gap-2">
          {!mayManage && <Pill tone="warning"><Lock className="h-3 w-3" /> read-only</Pill>}
          <Pill tone="ai">{rows.length} of {users.length}</Pill>
        </div>
      </Toolbar>

      <TableShell>
        <HeadRow grid={GRID}>
          <span>Name</span>
          <span>Email</span>
          <span>Merchant</span>
          <span>Role</span>
          <span>Status</span>
          <span>Last seen</span>
          <span className="w-28 text-right">Actions</span>
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
                <span className="flex w-28 items-center justify-end gap-1.5">
                  <button
                    type="button"
                    disabled={!mayImpersonate}
                    title={mayImpersonate ? "Open a 30-minute session in this merchant" : "Workspace Admin cannot impersonate"}
                    onClick={() => {
                      startImpersonation({ tenantId: u.tenantId, ticket: "PICOM-AD-HOC" });
                      toast.success(`Impersonating ${nameOf(u.tenantId)}`, { description: "Session ends in 30:00." });
                      navigate({ to: "/" });
                    }}
                    className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Eye className="h-3 w-3" /> Enter
                  </button>
                  <button
                    type="button"
                    disabled={!mayManage}
                    title={mayManage ? "Remove this member from the merchant" : "Support is read-only"}
                    onClick={() => setRemoving(u)}
                    className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </BodyRow>
            ))
          )}
        </div>

        <Pagination page={page} total={rows.length} onPage={setPage} />
      </TableShell>

      <Callout className="mt-3">
        There is no role editing here: a provider principal that could silently promote a customer's
        user would be indistinguishable from the isolation break this redesign removes. What the
        provider plane can do is bounded to two bootstrap moves, mint a merchant's first Org Owner and
        remove a mis-provisioned member. Everything in between belongs to the merchant's own Org Owner,
        or to a time-boxed impersonation session that is attributed to you and visible to the customer.
      </Callout>

      <CreateTenantUserDialog open={creating} onOpenChange={setCreating} />

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing && (
                <>
                  <span className="font-medium text-foreground">{removing.name}</span>{" "}
                  ({removing.email}) will be removed from{" "}
                  <span className="font-medium text-foreground">{nameOf(removing.tenantId)}</span>.
                  This is logged against you. It does not delete their identity, the merchant's Org
                  Owner can invite them again.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!removing) return;
                removeTenantUser(removing.id);
                toast.success(`Removed ${removing.name}`, { description: `No longer a member of ${nameOf(removing.tenantId)}.` });
                setRemoving(null);
              }}
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProviderPage>
  );
}

const TENANT_USER_STATUSES: TenantUser["status"][] = ["Active", "Invited", "Disabled"];

/**
 * The provider plane's one write into a merchant's roster: create a dashboard
 * user under a merchant. Used to mint a merchant's first Org Owner at
 * onboarding, or to repair a roster on request. It can only ever assign a
 * tenant-plane role, never a provider one, which is why the picker is built from
 * TENANT_ROLES directly rather than from the granter's own assignable set.
 */
function CreateTenantUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const tenants = useTenants();
  const [tenantId, setTenantId] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<TenantRole>("MEMBER");
  const [status, setStatus] = useState<TenantUser["status"]>("Active");

  const nameOf = (id: string) => tenants.find((t) => t.id === id)?.name ?? id;
  const valid =
    tenantId !== "" &&
    username.trim().length > 1 &&
    email.trim().includes("@") &&
    password.length > 0;

  function reset() {
    setTenantId(""); setUsername(""); setEmail(""); setPassword("");
    setRole("MEMBER"); setStatus("Active");
  }

  function submit() {
    const u: TenantUser = {
      id: `tu_${Date.now().toString(36)}`,
      name: username.trim(),
      email: email.trim().toLowerCase(),
      tenantId,
      role,
      status,
      lastSeen: "-",
    };
    addTenantUser(u);
    toast.success(`${u.name} added to ${nameOf(tenantId)}`, {
      description: `Created as ${ROLE_LABEL[role]}.`,
    });
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-ai/15 text-ai">
              <UserPlus className="h-4 w-4" />
            </span>
            Create merchant user
          </DialogTitle>
          <DialogDescription>
            Create a dashboard user under any merchant. The password is stored securely and never
            shown again.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-1">
          <Field label="Username *">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="rohit.menon" className="h-9" />
          </Field>
          <Field label="Email *">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rohit@merchant.in" className="h-9" />
          </Field>

          <Field label="Password *">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="h-9" />
          </Field>
          <Field label="Role *">
            <Select value={role} onValueChange={(v) => setRole(v as TenantRole)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TENANT_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Merchant *">
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select merchant" /></SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name} · {t.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status *">
            <Select value={status} onValueChange={(v) => setStatus(v as TenantUser["status"])}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TENANT_USER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid} onClick={submit}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
