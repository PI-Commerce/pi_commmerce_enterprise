import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Search, Download, Lock, Building2, Cable, UserPlus, KeyRound, UserMinus,
  Eye, EyeOff, LogIn, ShieldOff, Ban, Activity,
} from "lucide-react";
import { toast } from "sonner";
import { ProviderPage } from "@/components/admin/ProviderPage";
import {
  TableShell, HeadRow, BodyRow, EmptyRow, Pagination, paginate, Field, Toolbar,
  Pill, RoleBadge, Callout,
} from "@/components/admin/AdminUI";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTenants, useAudit } from "@/lib/admin-store";
import type { AuditAction } from "@/lib/admin-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/audit")({
  component: AuditPage,
  head: () => ({ meta: [{ title: "Audit Log · Provider Console" }] }),
});

const GRID = "grid-cols-[1.1fr_1.5fr_1.2fr_2.4fr_1fr_0.9fr]";

const ACTION_META: Record<AuditAction, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  "tenant.create": { label: "Tenant created", icon: Building2, tone: "bg-success/10 text-success" },
  "tenant.update": { label: "Tenant updated", icon: Building2, tone: "bg-secondary text-muted-foreground" },
  "tenant.suspend": { label: "Tenant suspended", icon: Ban, tone: "bg-destructive/10 text-destructive" },
  "trunk.create": { label: "Trunk provisioned", icon: Cable, tone: "bg-success/10 text-success" },
  "trunk.update": { label: "Trunk updated", icon: Cable, tone: "bg-warning/10 text-warning" },
  "user.create": { label: "User created", icon: UserPlus, tone: "bg-success/10 text-success" },
  "user.role_change": { label: "Role changed", icon: KeyRound, tone: "bg-warning/10 text-warning" },
  "user.disable": { label: "User disabled", icon: UserMinus, tone: "bg-secondary text-muted-foreground" },
  "impersonation.start": { label: "Impersonation started", icon: Eye, tone: "bg-ai/10 text-ai" },
  "impersonation.end": { label: "Impersonation ended", icon: EyeOff, tone: "bg-ai/10 text-ai" },
  "auth.sso_login": { label: "SSO login", icon: LogIn, tone: "bg-secondary text-muted-foreground" },
  "auth.access_revoked": { label: "Access revoked", icon: ShieldOff, tone: "bg-destructive/10 text-destructive" },
};

const ACTIONS = Object.keys(ACTION_META) as AuditAction[];

function AuditPage() {
  const audit = useAudit();
  const tenants = useTenants();

  const [q, setQ] = useState("");
  const [action, setAction] = useState<"all" | AuditAction>("all");
  const [tenantId, setTenantId] = useState("all");
  const [onlyImpersonated, setOnlyImpersonated] = useState(false);
  const [page, setPage] = useState(0);

  const nameOf = (id?: string) => (id ? tenants.find((t) => t.id === id)?.name ?? id : "—");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return audit.filter((e) => {
      if (action !== "all" && e.action !== action) return false;
      if (tenantId !== "all" && e.tenantId !== tenantId) return false;
      if (onlyImpersonated && !e.viaImpersonation) return false;
      if (!needle) return true;
      return e.summary.toLowerCase().includes(needle) || e.actor.toLowerCase().includes(needle);
    });
  }, [audit, q, action, tenantId, onlyImpersonated]);

  const view = paginate(rows, page);

  return (
    <ProviderPage
      title="Audit Log"
      description="Append-only. Every privileged action on both planes lands here and nothing removes a row."
      actions={
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => toast.success(`Exported ${rows.length} events`, { description: "CSV queued — arrives by email." })}
        >
          <Download className="h-4 w-4" /> Export
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
              placeholder="Actor or summary"
              className="h-9 w-[240px] pl-9"
            />
          </div>
        </Field>
        <Field label="Action">
          <Select value={action} onValueChange={(v) => { setAction(v as typeof action); setPage(0); }}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {ACTIONS.map((a) => <SelectItem key={a} value={a}>{ACTION_META[a].label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Tenant">
          <Select value={tenantId} onValueChange={(v) => { setTenantId(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants</SelectItem>
              {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <button
          type="button"
          onClick={() => { setOnlyImpersonated((v) => !v); setPage(0); }}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12px] transition-colors",
            onlyImpersonated ? "border-ai bg-ai/10 text-ai" : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          <Eye className="h-3.5 w-3.5" /> Impersonated only
        </button>
        <div className="ml-auto">
          <Pill tone="muted"><Lock className="h-3 w-3" /> immutable</Pill>
        </div>
      </Toolbar>

      <TableShell>
        <HeadRow grid={GRID}>
          <span>When</span>
          <span>Actor</span>
          <span>Action</span>
          <span>Summary</span>
          <span>Tenant</span>
          <span>Source IP</span>
        </HeadRow>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view.length === 0 ? (
            <EmptyRow>No events match this filter.</EmptyRow>
          ) : (
            view.map((e) => {
              const meta = ACTION_META[e.action];
              return (
                <BodyRow key={e.id} grid={GRID} className={e.viaImpersonation ? "bg-ai/[0.035]" : undefined}>
                  <span className="font-mono text-[11.5px] text-muted-foreground">{e.at}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px]">{e.actor}</span>
                    <RoleBadge role={e.actorRole} className="mt-0.5 text-[10px]" />
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md", meta.tone)}>
                      <meta.icon className="h-3 w-3" />
                    </span>
                    <span className="truncate text-[12px]">{meta.label}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px]">{e.summary}</span>
                    {e.viaImpersonation && (
                      <Pill tone="ai" className="mt-0.5 text-[10px]">
                        <Eye className="h-2.5 w-2.5" /> via impersonation
                      </Pill>
                    )}
                  </span>
                  <span className="truncate text-[12px] text-muted-foreground">{nameOf(e.tenantId)}</span>
                  <span className="font-mono text-[11.5px] text-muted-foreground">{e.ip}</span>
                </BodyRow>
              );
            })
          )}
        </div>

        <Pagination page={page} total={rows.length} onPage={setPage} />
      </TableShell>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <Callout>
          Rows are written by the API, not by the client, and the table has no UPDATE or DELETE grant —
          not even for a Global Admin. Correcting a mistake means appending the correction.
        </Callout>
        <Callout>
          <span className="inline-flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Anything performed inside an impersonation session is tinted and tagged, so "who really did
            this" never depends on reading the summary carefully.
          </span>
        </Callout>
      </div>
    </ProviderPage>
  );
}
