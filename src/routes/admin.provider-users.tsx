import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Plus, MoreHorizontal, ShieldOff, Lock, KeyRound } from "lucide-react";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useSession, useProviderUsers, addProviderUser, setProviderUserRole, revokeProviderUser,
} from "@/lib/admin-store";
import { PROVIDER_SSO_GROUP, todayLabel, type ProviderUser } from "@/lib/admin-data";
import {
  can, canGrant, assignableRoles, ROLE_BLURB, ROLE_LABEL, PROVIDER_ROLES, type ProviderRole,
} from "@/lib/admin-rbac";

export const Route = createFileRoute("/admin/provider-users")({
  component: ProviderUsersPage,
  head: () => ({ meta: [{ title: "Provider Users · Provider Console" }] }),
});

const GRID = "grid-cols-[1.5fr_1.7fr_1fr_1.5fr_0.8fr_1fr_auto]";

function ProviderUsersPage() {
  const session = useSession();
  const users = useProviderUsers();
  const role = session.providerRole;
  const mayManage = can(role, "provider_user_management");

  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle),
    );
  }, [users, q]);

  const view = paginate(rows, page);

  return (
    <ProviderPage
      title="Provider Users"
      description="Paytm principals who hold the control plane. Identity comes from Google Workspace; this table only assigns the role."
      actions={
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!mayManage}
          title={mayManage ? undefined : "Only a Global Admin can create provider accounts"}
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> Add provider user
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
              placeholder="Name or Paytm email"
              className="h-9 w-[260px] pl-9"
            />
          </div>
        </Field>
        <div className="ml-auto flex items-center gap-2">
          {PROVIDER_ROLES.map((r) => (
            <Pill key={r} tone="ai">
              {users.filter((u) => u.role === r && u.status === "Active").length} {ROLE_LABEL[r]}
            </Pill>
          ))}
          {!mayManage && <Pill tone="warning"><Lock className="h-3 w-3" /> read-only</Pill>}
        </div>
      </Toolbar>

      <TableShell>
        <HeadRow grid={GRID}>
          <span>Name</span>
          <span>Google identity</span>
          <span>Role</span>
          <span>Workspace group</span>
          <span>Status</span>
          <span>Last seen</span>
          <span className="w-16 text-right">Actions</span>
        </HeadRow>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view.length === 0 ? (
            <EmptyRow>No provider users match this search.</EmptyRow>
          ) : (
            view.map((u) => (
              <BodyRow key={u.id} grid={GRID} className={u.status === "Revoked" ? "opacity-60" : undefined}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[9.5px] font-semibold">
                    {u.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
                  </span>
                  <span className="truncate font-medium">{u.name}</span>
                </span>
                <span className="truncate text-[12.5px] text-muted-foreground">{u.email}</span>
                <RoleBadge role={u.role} />
                <span className="truncate font-mono text-[11px] text-muted-foreground">{u.group}</span>
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
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Change role
                      </DropdownMenuLabel>
                      {PROVIDER_ROLES.map((r) => {
                        const check = canGrant(role, r);
                        return (
                          <DropdownMenuItem
                            key={r}
                            disabled={!check.ok || u.role === r || u.status === "Revoked"}
                            title={check.ok ? undefined : check.reason}
                            onSelect={() => {
                              setProviderUserRole(u.id, r as ProviderRole);
                              toast.success(`${u.name} is now ${ROLE_LABEL[r]}`);
                            }}
                          >
                            {ROLE_LABEL[r]}
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!mayManage || u.status === "Revoked"}
                        className="text-destructive focus:text-destructive"
                        onSelect={() => {
                          revokeProviderUser(u.id);
                          toast.success(`Revoked ${u.email}`, { description: "Removed from the Workspace group." });
                        }}
                      >
                        <ShieldOff className="mr-2 h-3.5 w-3.5" /> Revoke access
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </BodyRow>
            ))
          )}
        </div>

        <Pagination page={page} total={rows.length} onPage={setPage} />
      </TableShell>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.1fr]">
        <Callout>
          There is no password here. Console access is derived from membership of{" "}
          <code className="font-mono">{PROVIDER_SSO_GROUP}</code>. Offboarding through Workspace is the
          revocation — this table only ever narrows what a member can do, never who can log in.
        </Callout>
        <Callout>
          No principal may grant a role above its own rank, and no provider role can mint a tenant
          role. Both rules are enforced server-side; the greyed-out menu items above are the same
          rules rendered early.
        </Callout>
      </div>

      <CreateProviderUserDialog open={creating} onOpenChange={setCreating} />
    </ProviderPage>
  );
}

function CreateProviderUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const session = useSession();
  const options = assignableRoles(session.providerRole) as ProviderRole[];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProviderRole>(options[options.length - 1] ?? "SUPPORT");

  const valid = name.trim().length > 1 && email.trim().endsWith("@paytm.com");

  function submit() {
    const u: ProviderUser = {
      id: `pu_${Date.now().toString(36)}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      group: PROVIDER_SSO_GROUP,
      status: "Active",
      lastSeen: `${todayLabel()}, invited`,
    };
    addProviderUser(u);
    toast.success(`${u.name} added as ${ROLE_LABEL[role]}`);
    onOpenChange(false);
    setName(""); setEmail("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-ai/15 text-ai">
              <KeyRound className="h-4 w-4" />
            </span>
            Add a provider user
          </DialogTitle>
          <DialogDescription>
            The account must already exist in Google Workspace and sit inside{" "}
            <code className="font-mono text-[11.5px]">{PROVIDER_SSO_GROUP}</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Raghavan" className="h-9" />
          </Field>
          <Field label="Paytm email">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="priya.raghavan@paytm.com"
              className="h-9"
            />
            {email.trim() !== "" && !email.trim().endsWith("@paytm.com") && (
              <span className="text-[10.5px] text-destructive">Provider accounts must be @paytm.com identities.</span>
            )}
          </Field>
          <Field label="Role">
            <Select value={role} onValueChange={(v) => setRole(v as ProviderRole)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[10.5px] leading-snug text-muted-foreground">{ROLE_BLURB[role]}</span>
          </Field>
          <Callout>
            Only the roles you are permitted to grant appear in this list — the picker is built from
            the same rank comparison the API runs.
          </Callout>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid} onClick={submit}>Add user</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
