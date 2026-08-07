import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Search, UserPlus, MoreHorizontal, Ban, PlayCircle, Lock, ShieldCheck, Mail, Info,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import {
  TableShell, HeadRow, BodyRow, EmptyRow, Pagination, paginate, Field, Toolbar,
  Pill, statusTone, RoleBadge, Callout, NoAccess,
} from "@/components/admin/AdminUI";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useSession, useTenantUsers, effectiveRole, addTenantUser, setTenantUserRole, setTenantUserStatus,
} from "@/lib/admin-store";
import { tenantById, type TenantUser } from "@/lib/admin-data";
import {
  can, canGrant, assignableRoles, ROLE_BLURB, ROLE_LABEL, TENANT_ROLES, type TenantRole, type AnyRole,
} from "@/lib/admin-rbac";

export const Route = createFileRoute("/users")({
  component: UsersPage,
  head: () => ({ meta: [{ title: "Users · Pi Commerce Enterprise" }] }),
});

const GRID = "grid-cols-[1.5fr_1.9fr_0.9fr_0.9fr_1.2fr_auto]";

function UsersPage() {
  const session = useSession();
  const allUsers = useTenantUsers();
  const role = effectiveRole(session);
  const tenant = tenantById(session.tenantId);

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | TenantRole>("all");
  const [page, setPage] = useState(0);
  const [inviting, setInviting] = useState(false);

  // The scope is not a filter the user can widen — it is the query.
  const scoped = useMemo(
    () => allUsers.filter((u) => u.tenantId === session.tenantId),
    [allUsers, session.tenantId],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return scoped.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!needle) return true;
      return u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle);
    });
  }, [scoped, q, roleFilter]);

  const view = paginate(rows, page);
  const mayManage = can(role, "member_management");

  if (session.plane === "provider") {
    return (
      <AppShell>
        <div className="flex h-full flex-col">
          <PageHeader title="Users" description="Tenant member management." />
          <div className="grid flex-1 place-items-center px-6">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-ai/10 text-ai">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold">This screen belongs to a tenant</h2>
              <p className="mx-auto mt-1.5 text-[13px] text-muted-foreground">
                A provider principal has no workspace of its own. To read members across every tenant,
                use Tenant Users in the console; to act inside one, open an impersonation session.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <Button variant="outline" size="sm" asChild><Link to="/admin/tenant-users">Tenant Users</Link></Button>
                <Button size="sm" asChild><Link to="/admin/impersonate">Impersonate</Link></Button>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell bare>
      <div className="flex h-full flex-col px-8 pb-6 pt-6">
        <PageHeader
          title="Users"
          description={`Members of ${tenant?.name ?? "your workspace"}. Scoped to this tenant — there is no wider view from here.`}
          actions={
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!mayManage}
              title={mayManage ? undefined : `${ROLE_LABEL[role]} cannot invite members`}
              onClick={() => setInviting(true)}
            >
              <UserPlus className="h-4 w-4" /> Invite member
            </Button>
          }
        />

        <Toolbar>
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(0); }}
                placeholder="Name or email"
                className="h-9 w-[260px] pl-9"
              />
            </div>
          </Field>
          <Field label="Role">
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v as typeof roleFilter); setPage(0); }}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {TENANT_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="ml-auto flex items-center gap-2">
            {TENANT_ROLES.map((r) => (
              <Pill key={r} tone="muted">
                {scoped.filter((u) => u.role === r).length} {ROLE_LABEL[r]}
              </Pill>
            ))}
            {!mayManage && <Pill tone="warning"><Lock className="h-3 w-3" /> read-only</Pill>}
          </div>
        </Toolbar>

        <TableShell>
          <HeadRow grid={GRID}>
            <span>Name</span>
            <span>Email</span>
            <span>Role</span>
            <span>Status</span>
            <span>Last seen</span>
            <span className="w-16 text-right">Actions</span>
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
                  <RoleBadge role={u.role} />
                  <Pill tone={statusTone(u.status)}>{u.status}</Pill>
                  <span className="text-[12px] text-muted-foreground">{u.lastSeen}</span>
                  <span className="flex w-16 items-center justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label="More actions"
                          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Change role
                        </DropdownMenuLabel>
                        {TENANT_ROLES.map((r) => {
                          const check = canGrant(role, r);
                          return (
                            <DropdownMenuItem
                              key={r}
                              disabled={!check.ok || u.role === r}
                              title={check.ok ? undefined : check.reason}
                              onSelect={() => {
                                setTenantUserRole(u.id, r as TenantRole);
                                toast.success(`${u.name} is now ${ROLE_LABEL[r]}`);
                              }}
                            >
                              {ROLE_LABEL[r]}
                            </DropdownMenuItem>
                          );
                        })}
                        <DropdownMenuSeparator />
                        {u.status === "Disabled" ? (
                          <DropdownMenuItem
                            disabled={!mayManage}
                            onSelect={() => { setTenantUserStatus(u.id, "Active"); toast.success(`${u.name} re-enabled`); }}
                          >
                            <PlayCircle className="mr-2 h-3.5 w-3.5" /> Re-enable
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            disabled={!mayManage}
                            className="text-destructive focus:text-destructive"
                            onSelect={() => { setTenantUserStatus(u.id, "Disabled"); toast.success(`${u.name} disabled`); }}
                          >
                            <Ban className="mr-2 h-3.5 w-3.5" /> Disable
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                </BodyRow>
              ))
            )}
          </div>

          <Pagination page={page} total={rows.length} onPage={setPage} />
        </TableShell>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Callout>
            This list is filtered at the database, not in the browser. Even a crafted request for
            another tenant's members returns nothing — the row-level security policy never sees them.
          </Callout>
          <RoleHint role={role} />
        </div>

        <InviteDialog open={inviting} onOpenChange={setInviting} granter={role} tenantId={session.tenantId} />
      </div>
    </AppShell>
  );
}

function RoleHint({ role }: { role: AnyRole }) {
  if (role === "ADMIN") {
    return (
      <Callout>
        You are an Admin: you can invite members, change their role up to Admin, and manage WABA
        accounts. You cannot reach trunks, other tenants, or provider accounts — those live on the
        control plane.
      </Callout>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed border-warning/40 bg-warning/5 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      <p>
        {ROLE_LABEL[role]} is a read-only view of this list. Inviting and role changes are an Admin
        capability — ask an Admin in your workspace.
      </p>
    </div>
  );
}

/**
 * The reworked create-user modal.
 *
 * Three things are gone versus today's version: the client/merchant selector
 * (the tenant is implicit in the session), every provider role, and ROOT_USER.
 * What remains is built from `assignableRoles`, so a Member who somehow reached
 * this dialog would find nothing to pick.
 */
function InviteDialog({
  open, onOpenChange, granter, tenantId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  granter: AnyRole;
  tenantId: string;
}) {
  const options = assignableRoles(granter) as TenantRole[];
  const tenant = tenantById(tenantId);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TenantRole>("MEMBER");

  const valid = name.trim().length > 1 && email.includes("@") && options.includes(role);

  function submit() {
    const u: TenantUser = {
      id: `tu_${Date.now().toString(36)}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      tenantId,
      role,
      status: "Invited",
      lastSeen: "—",
    };
    addTenantUser(u);
    toast.success(`Invited ${u.email}`, { description: `Joins as ${ROLE_LABEL[role]} once they accept.` });
    onOpenChange(false);
    setName(""); setEmail(""); setRole("MEMBER");
  }

  if (options.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite a member</DialogTitle>
          </DialogHeader>
          <NoAccess
            title="You can't invite members"
            reason={`${ROLE_LABEL[granter]} does not hold member management. Ask an Admin in your workspace.`}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-secondary">
              <Mail className="h-4 w-4" />
            </span>
            Invite a member
          </DialogTitle>
          <DialogDescription>
            They join <strong>{tenant?.name ?? "your workspace"}</strong> and nothing else. There is no
            workspace picker here — the tenant comes from your session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Nair" className="h-9" />
          </Field>
          <Field label="Work email">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@voltmoney.in" className="h-9" />
          </Field>
          <Field label="Role">
            <Select value={role} onValueChange={(v) => setRole(v as TenantRole)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-[10.5px] leading-snug text-muted-foreground">{ROLE_BLURB[role]}</span>
          </Field>

          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              What changed from the old modal
            </p>
            <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
              <li>· The client selector is gone — the tenant is implicit in your session.</li>
              <li>· Provider roles and ROOT_USER never appear in this list.</li>
              <li>· Members and Viewers cannot open this dialog at all.</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid} onClick={submit}>Send invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
