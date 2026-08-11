import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, Search, Clock, ScrollText, Ban, Ticket, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { ProviderPage } from "@/components/admin/ProviderPage";
import { Card, Callout, Field, Pill, statusTone } from "@/components/admin/AdminUI";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSession, useTenants, useTenantUsers, startImpersonation, IMPERSONATION_MINUTES } from "@/lib/admin-store";
import { ROLE_LABEL } from "@/lib/admin-rbac";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/impersonate")({
  component: ImpersonatePage,
  head: () => ({ meta: [{ title: "Impersonate · Provider Console" }] }),
});

const RULES = [
  { icon: Clock, title: "Hard expiry", body: `Every session dies after ${IMPERSONATION_MINUTES} minutes. There is no renew button, a longer investigation needs a new session and a new ticket.` },
  { icon: ScrollText, title: "Attributed to you", body: "Writes made inside the session are recorded against your Paytm identity, not the merchant user's, and flagged as impersonated." },
  { icon: Eye, title: "Visible, not silent", body: "A banner sits above every page for the whole session and the merchant's own audit view shows the entry." },
  { icon: Ban, title: "Scoped to one merchant", body: "The session is bound to the merchant you pick here. Cross-merchant reach does not survive the switch." },
];

function ImpersonatePage() {
  const session = useSession();
  const tenants = useTenants();
  const tenantUsers = useTenantUsers();
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [ticket, setTicket] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return tenants;
    return tenants.filter((t) => t.name.toLowerCase().includes(needle) || t.id.includes(needle));
  }, [tenants, q]);

  const tenant = tenants.find((t) => t.id === picked) ?? null;
  const admins = tenant ? tenantUsers.filter((u) => u.tenantId === tenant.id && u.role === "ORG_OWNER") : [];
  const valid = !!tenant && /^[A-Z]{3,8}-\d{2,6}$/i.test(ticket.trim()) && tenant.status !== "Suspended";

  function begin() {
    if (!tenant) return;
    startImpersonation({ tenantId: tenant.id, ticket: ticket.trim().toUpperCase() });
    toast.success(`Impersonating ${tenant.name}`, {
      description: `Session ends in ${IMPERSONATION_MINUTES}:00 and cannot be extended.`,
    });
    navigate({ to: "/" });
  }

  return (
    <ProviderPage
      title="Impersonate a merchant"
      description="The supported way to see what a customer sees. Time-boxed, attributed, and impossible to do quietly."
      capability="impersonation"
    >
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.25fr_1fr]">
        {/* Merchant picker */}
        <div className="flex min-h-0 flex-col">
          <Field label="Find a merchant">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name or merchant id"
                className="h-9 pl-9"
              />
            </div>
          </Field>

          <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {rows.map((t) => {
              const active = picked === t.id;
              const blocked = t.status === "Suspended";
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => !blocked && setPicked(t.id)}
                  disabled={blocked}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    active ? "border-ai bg-ai/[0.07]" : "border-border bg-card hover:bg-accent/40",
                    blocked && "cursor-not-allowed opacity-50 hover:bg-card",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[11px] font-semibold",
                      active ? "bg-ai text-white" : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {t.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium">{t.name}</span>
                      <Pill tone={statusTone(t.status)}>{t.status}</Pill>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted-foreground">
                      merchant {t.id} · {t.members} members · {t.channels.join(", ")}
                    </span>
                  </span>
                  {active && <ArrowRight className="h-4 w-4 shrink-0 text-ai" />}
                </button>
              );
            })}
            {rows.length === 0 && (
              <p className="py-10 text-center text-[13px] text-muted-foreground">No merchant matches that search.</p>
            )}
          </div>
        </div>

        {/* Session setup */}
        <div className="min-h-0 space-y-4 overflow-y-auto">
          <Card title="Open a session" description="Both fields are required before the session can start.">
            <div className="space-y-3">
              <Field label="Merchant">
                <div
                  className={cn(
                    "flex h-9 items-center rounded-md border px-3 text-[12.5px]",
                    tenant ? "border-ai/30 bg-ai/[0.06]" : "border-dashed border-border text-muted-foreground",
                  )}
                >
                  {tenant ? `${tenant.name} · merchant ${tenant.id}` : "Pick a merchant from the list"}
                </div>
              </Field>

              <Field label="Support ticket">
                <div className="relative">
                  <Ticket className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={ticket}
                    onChange={(e) => setTicket(e.target.value.toUpperCase())}
                    placeholder="PICOM-5120"
                    className="h-9 pl-9 font-mono text-[12.5px]"
                  />
                </div>
                <span className="text-[10.5px] text-muted-foreground">
                  A session without a reason is a session nobody can review later.
                </span>
              </Field>

              <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2">
                <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Session length
                </span>
                <span className="font-mono text-[12px] font-medium tabular-nums">{IMPERSONATION_MINUTES}:00</span>
              </div>

              <Button className="w-full gap-1.5" disabled={!valid} onClick={begin}>
                <Eye className="h-4 w-4" />
                Start impersonation
              </Button>

              {tenant?.status === "Suspended" && (
                <p className="text-[11px] text-destructive">
                  {tenant.name} is suspended. Reactivate it before opening a session.
                </p>
              )}

              <p className="text-[11px] text-muted-foreground">
                You will enter as{" "}
                <span className="font-medium text-foreground">{ROLE_LABEL[session.providerRole]}</span>, viewing
                the workspace with tenant Org Owner visibility.
              </p>
            </div>
          </Card>

          {tenant && admins.length > 0 && (
            <Card title="Who to contact instead" description="Often faster than entering the workspace yourself.">
              <ul className="space-y-1.5">
                {admins.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="min-w-0 truncate">{a.name}</span>
                    <span className="truncate text-[10.5px] text-muted-foreground">{a.email}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="What impersonation guarantees">
            <ul className="space-y-3">
              {RULES.map((r) => (
                <li key={r.title} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ai/10 text-ai">
                    <r.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium">{r.title}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{r.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Callout className="mt-3">
              The countdown in the banner is a courtesy. The ticket itself expires server-side, a
              stolen tab cannot outlive it.
            </Callout>
          </Card>
        </div>
      </div>
    </ProviderPage>
  );
}
