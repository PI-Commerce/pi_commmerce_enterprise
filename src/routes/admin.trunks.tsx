import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Plus, Pencil, Cable, Lock } from "lucide-react";
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
import { useSession, useTenants, useTrunks, upsertTrunk } from "@/lib/admin-store";
import { todayLabel, type Trunk } from "@/lib/admin-data";
import { can } from "@/lib/admin-rbac";

export const Route = createFileRoute("/admin/trunks")({
  component: TrunksPage,
  head: () => ({ meta: [{ title: "Trunk Configuration · Provider Console" }] }),
});

const GRID = "grid-cols-[1.8fr_1.3fr_0.8fr_0.7fr_1.3fr_0.9fr_auto]";

function TrunksPage() {
  const session = useSession();
  const trunks = useTrunks();
  const tenants = useTenants();
  const mayEdit = can(session.providerRole, "provisioning");

  const [q, setQ] = useState("");
  const [tenantId, setTenantId] = useState("all");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Trunk | null>(null);
  const [creating, setCreating] = useState(false);

  const nameOf = (id: string) => tenants.find((t) => t.id === id)?.name ?? id;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return trunks.filter((t) => {
      if (tenantId !== "all" && t.tenantId !== tenantId) return false;
      if (!needle) return true;
      return t.name.toLowerCase().includes(needle) || nameOf(t.tenantId).toLowerCase().includes(needle);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trunks, tenants, q, tenantId]);

  const view = paginate(rows, page);
  const capacity = rows.filter((t) => t.status === "Active").reduce((n, t) => n + t.concurrency, 0);

  return (
    <ProviderPage
      title="Trunk Configuration"
      description="Voice capacity, provisioned per merchant. No merchant role can reach this screen, that is the point."
      actions={
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!mayEdit}
          title={mayEdit ? undefined : "Support holds read-only access to trunks"}
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> Provision trunk
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
              placeholder="Trunk or merchant name"
              className="h-9 w-[260px] pl-9"
            />
          </div>
        </Field>
        <Field label="Merchant">
          <Select value={tenantId} onValueChange={(v) => { setTenantId(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All merchants</SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="ml-auto flex items-center gap-2">
          <Pill tone="ai">{capacity} concurrent calls</Pill>
          {!mayEdit && (
            <Pill tone="warning"><Lock className="h-3 w-3" /> read-only</Pill>
          )}
        </div>
      </Toolbar>

      <TableShell>
        <HeadRow grid={GRID}>
          <span>Trunk</span>
          <span>Merchant</span>
          <span>Concurrency</span>
          <span>Status</span>
          <span>SIP host</span>
          <span>Updated</span>
          <span className="w-16 text-right">Actions</span>
        </HeadRow>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view.length === 0 ? (
            <EmptyRow>No trunks match this filter.</EmptyRow>
          ) : (
            view.map((t) => (
              <BodyRow key={t.id} grid={GRID}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                    <Cable className="h-3 w-3" />
                  </span>
                  <span className="truncate font-mono text-[12px]">{t.name}</span>
                </span>
                <span className="min-w-0 truncate">{nameOf(t.tenantId)}</span>
                <span className="tabular-nums">{t.concurrency}</span>
                <Pill tone={statusTone(t.status)}>{t.status}</Pill>
                <span className="truncate font-mono text-[11.5px] text-muted-foreground">{t.host}</span>
                <span className="text-[12px] text-muted-foreground">{t.updatedAt}</span>
                <span className="flex w-16 items-center justify-end">
                  <button
                    type="button"
                    disabled={!mayEdit}
                    onClick={() => setEditing(t)}
                    aria-label="Edit trunk"
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </span>
              </BodyRow>
            ))
          )}
        </div>

        <Pagination page={page} total={rows.length} onPage={setPage} />
      </TableShell>

      <Callout className="mt-3">
        Trunk edits are the sharpest privilege on the platform, raising concurrency changes what a
        merchant is billed and what the carrier will carry. Reserved to Workspace Admin and above, and
        never delegated into a merchant.
      </Callout>

      <TrunkDialog
        trunk={editing}
        open={!!editing || creating}
        onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }}
      />
    </ProviderPage>
  );
}

function TrunkDialog({
  trunk, open, onOpenChange,
}: {
  trunk: Trunk | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const tenants = useTenants();
  const [name, setName] = useState("");
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "411");
  const [concurrency, setConcurrency] = useState("10");
  const [status, setStatus] = useState<Trunk["status"]>("Active");

  // Re-seed the form whenever the dialog is opened against a different trunk.
  const [seeded, setSeeded] = useState<string | null>(null);
  const key = trunk?.id ?? "__new__";
  if (open && seeded !== key) {
    setSeeded(key);
    setName(trunk?.name ?? "");
    setTenantId(trunk?.tenantId ?? tenants[0]?.id ?? "411");
    setConcurrency(String(trunk?.concurrency ?? 10));
    setStatus(trunk?.status ?? "Active");
  }
  if (!open && seeded !== null) setSeeded(null);

  const n = Number(concurrency);
  const valid = name.trim().length > 2 && Number.isFinite(n) && n > 0 && n <= 500;

  function submit() {
    const next: Trunk = {
      id: trunk?.id ?? `tr_${Date.now().toString(36)}`,
      tenantId,
      name: name.trim(),
      concurrency: n,
      status,
      host: trunk?.host ?? "sip.picomm.in:5060",
      createdAt: trunk?.createdAt ?? todayLabel(),
      updatedAt: todayLabel(),
    };
    upsertTrunk(next);
    toast.success(`${trunk ? "Updated" : "Provisioned"} ${next.name}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{trunk ? "Edit trunk" : "Provision trunk"}</DialogTitle>
          <DialogDescription>
            {trunk
              ? "Changes take effect on the next call leg and are written to the audit log."
              : "A new SIP trunk for one merchant. Capacity is billed on concurrency, not on usage."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Trunk name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="volt-money-trunk-2" className="h-9 font-mono text-[12.5px]" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Merchant">
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Concurrency">
              <Input
                value={concurrency}
                onChange={(e) => setConcurrency(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                className="h-9 tabular-nums"
              />
            </Field>
          </div>
          <Field label="Status">
            <Select value={status} onValueChange={(v) => setStatus(v as Trunk["status"])}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Callout>Concurrency is capped at 500 per trunk. Beyond that, add a second trunk.</Callout>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid} onClick={submit}>{trunk ? "Save changes" : "Provision"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
