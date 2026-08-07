import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, Plus, MoreHorizontal, Ban, PlayCircle, Eye, Cable, Building2 } from "lucide-react";
import { toast } from "sonner";
import { ProviderPage } from "@/components/admin/ProviderPage";
import {
  TableShell, HeadRow, BodyRow, EmptyRow, Pagination, paginate, Field, Toolbar,
  Pill, statusTone, Callout,
} from "@/components/admin/AdminUI";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession, useTenants, addTenant, setTenantStatus, startImpersonation } from "@/lib/admin-store";
import { todayLabel, type Tenant, type TenantStatus } from "@/lib/admin-data";
import { can } from "@/lib/admin-rbac";

export const Route = createFileRoute("/admin/tenants")({
  component: TenantsPage,
  head: () => ({ meta: [{ title: "Tenants · Provider Console" }] }),
});

const GRID = "grid-cols-[1.6fr_0.8fr_1.5fr_1.2fr_0.6fr_0.9fr_auto]";

function TenantsPage() {
  const session = useSession();
  const tenants = useTenants();
  const navigate = useNavigate();
  const role = session.providerRole;
  const mayProvision = can(role, "provisioning");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | TenantStatus>("all");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tenants.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (!needle) return true;
      return (
        t.name.toLowerCase().includes(needle) ||
        t.id.includes(needle) ||
        t.email.toLowerCase().includes(needle)
      );
    });
  }, [tenants, q, status]);

  const view = paginate(rows, page);

  return (
    <ProviderPage
      title="Tenants"
      description="Every merchant account on the platform. Onboarding a tenant mints its first Admin — nobody else can."
      actions={
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!mayProvision}
          title={mayProvision ? undefined : "Support cannot onboard tenants"}
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> Onboard tenant
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
              placeholder="Name, merchant id or contact"
              className="h-9 w-[280px] pl-9"
            />
          </div>
        </Field>
        <Field label="Status">
          <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(0); }}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Live">Live</SelectItem>
              <SelectItem value="Onboarding">Onboarding</SelectItem>
              <SelectItem value="Suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="ml-auto">
          <Pill tone="ai">{rows.length} of {tenants.length} tenants</Pill>
        </div>
      </Toolbar>

      <TableShell>
        <HeadRow grid={GRID}>
          <span>Tenant</span>
          <span>Status</span>
          <span>Primary contact</span>
          <span>Channels</span>
          <span>Members</span>
          <span>Updated</span>
          <span className="w-16 text-right">Actions</span>
        </HeadRow>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view.length === 0 ? (
            <EmptyRow>No tenants match this filter.</EmptyRow>
          ) : (
            view.map((t) => (
              <BodyRow key={t.id} grid={GRID}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.name}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">merchant {t.id}</span>
                </span>
                <Pill tone={statusTone(t.status)}>{t.status}</Pill>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px]">{t.email}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">{t.phone}</span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {t.channels.map((c) => (
                    <span key={c} className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {c}
                    </span>
                  ))}
                </span>
                <span className="tabular-nums">{t.members}</span>
                <span className="text-[12px] text-muted-foreground">{t.updatedAt}</span>
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
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem
                        disabled={!can(role, "impersonation")}
                        onSelect={() => {
                          startImpersonation({ tenantId: t.id, ticket: "PICOM-AD-HOC" });
                          toast.success(`Impersonating ${t.name}`, { description: "Session ends in 30:00." });
                          navigate({ to: "/" });
                        }}
                      >
                        <Eye className="mr-2 h-3.5 w-3.5" /> Impersonate
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => navigate({ to: "/admin/trunks" })}>
                        <Cable className="mr-2 h-3.5 w-3.5" /> View trunks
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {t.status === "Suspended" ? (
                        <DropdownMenuItem
                          disabled={!mayProvision}
                          onSelect={() => { setTenantStatus(t.id, "Live"); toast.success(`${t.name} reactivated`); }}
                        >
                          <PlayCircle className="mr-2 h-3.5 w-3.5" /> Reactivate
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          disabled={!mayProvision}
                          className="text-destructive focus:text-destructive"
                          onSelect={() => { setTenantStatus(t.id, "Suspended"); toast.success(`${t.name} suspended`); }}
                        >
                          <Ban className="mr-2 h-3.5 w-3.5" /> Suspend tenant
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

      <Callout className="mt-3">
        Suspending a tenant revokes every session it holds on the next token refresh. It does not
        delete data — retention is governed by the contract, not by this button.
      </Callout>

      <OnboardDialog open={creating} onOpenChange={setCreating} />
    </ProviderPage>
  );
}

/**
 * Onboarding is the one flow that crosses the plane boundary: a provider
 * principal creates a tenant *and* its first ADMIN in the same step. After that
 * the tenant owns its own member list and the provider never mints another.
 */
function OnboardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  const valid = name.trim().length > 1 && adminEmail.includes("@");

  function submit() {
    const t: Tenant = {
      id: String(2700 + Math.floor(Math.random() * 99)),
      name: name.trim(),
      slug: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""),
      status: "Onboarding",
      email: email.trim() || adminEmail.trim(),
      phone: phone.trim() || "—",
      channels: ["WhatsApp"],
      members: 1,
      createdAt: todayLabel(),
      updatedAt: todayLabel(),
    };
    addTenant(t);
    toast.success(`${t.name} onboarded`, { description: `${adminEmail} invited as the tenant's first Admin.` });
    onOpenChange(false);
    setName(""); setEmail(""); setPhone(""); setAdminEmail("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-ai/15 text-ai">
              <Building2 className="h-4 w-4" />
            </span>
            Onboard a tenant
          </DialogTitle>
          <DialogDescription>
            Creates the tenant and mints its first Admin. Every later member is invited by that
            Admin — the provider plane never manages a tenant's roster.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Tenant name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Volt Money" className="h-9" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Support email">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="support@tenant.in" className="h-9" />
            </Field>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" className="h-9" />
            </Field>
          </div>
          <Field label="First Admin (tenant plane)">
            <Input
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@tenant.in"
              className="h-9"
            />
          </Field>
          <Callout>
            This is the only account the provider ever creates inside a tenant. It lands on the
            tenant plane with the ADMIN role and no cross-tenant visibility whatsoever.
          </Callout>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid} onClick={submit}>Onboard tenant</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
