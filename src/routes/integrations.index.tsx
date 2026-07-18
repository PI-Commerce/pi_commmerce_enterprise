import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Button } from "@/components/ui/button";
import { Building2, Contact, ShieldCheck, Webhook, Key, Code2 } from "lucide-react";

export const Route = createFileRoute("/integrations/")({
  component: Integrations,
  head: () => ({ meta: [{ title: "Integrations · Pi Agents FinServ" }] }),
});

type Tab = "connectors" | "developer";

/**
 * Integrations — re-enabled for the FinServ branch. Two tabs: `Connectors` shows
 * BFSI vendor cards (LMS / CRM / KYC / Payment gateway) with mock connected state,
 * and `Developer` shows API keys, webhooks and a curl quickstart. The content is
 * the resurrected pre-`cd39d0a` UI adapted to the BFSI vendor list from the
 * Collections v1 brief; connection flows are still mocked.
 */
function Integrations() {
  const [tab, setTab] = useState<Tab>("connectors");
  return (
    <AppShell>
      <PageHeader
        title="Integrations"
        description="Connect BFSI data sources, KYC providers, payment gateways, and developer tooling. Messaging channels live under Channels."
      />
      <PageTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "connectors", label: "Connectors" },
          { id: "developer", label: "Developer" },
        ]}
      />
      {tab === "connectors" && <Connectors />}
      {tab === "developer" && <Developer />}
    </AppShell>
  );
}

/** BFSI vendor cards grouped by category (LMS · CRM · KYC · Payments) so the
 *  vertical shape reads at a glance. Each card also carries a category chip
 *  so the classification is visible even when a card is seen in isolation. */
type VendorCategory = "LMS" | "CRM" | "KYC" | "Payments";
type Vendor = {
  name: string;
  /** Either a Lucide icon component OR a hosted logo image URL — one is required. */
  icon?: React.ComponentType<{ className?: string }>;
  logoUrl?: string;
  connected: boolean;
  meta: string;
  category: VendorCategory;
};

// v1: All FinServ integrations are in TBD stage — cards render but none show a
// live connection. LMS + CRM scope depends on client-by-client negotiation;
// KYC is out-of-scope for v1 but stays in the catalog for the roadmap story;
// Paytm PG is the target payment gateway but not yet activated.
const VENDORS: Vendor[] = [
  // Loan Management Systems
  { category: "LMS", name: "CloudBankin", icon: Building2, connected: false, meta: "Loan portfolio · disbursals · repayments · DPD" },
  { category: "LMS", name: "Finezza",     icon: Building2, connected: false, meta: "Loan lifecycle · underwriting · collections" },
  { category: "LMS", name: "FinFlux",     icon: Building2, connected: false, meta: "Retail loans · SME loans · co-lending" },
  // CRMs
  { category: "CRM", name: "Salesforce",  icon: Contact,   connected: false, meta: "Contacts · leads · opportunities · cases" },
  { category: "CRM", name: "Leadsquared", icon: Contact,   connected: false, meta: "Lead capture · scoring · nurturing" },
  { category: "CRM", name: "Zoho CRM",    icon: Contact,   connected: false, meta: "Contacts · deals · workflows" },
  // KYC (out-of-scope for v1, kept in the catalog for the roadmap story)
  { category: "KYC", name: "Digio",       icon: ShieldCheck, connected: false, meta: "Aadhaar eSign · Video KYC · document verification" },
  // Payment gateway
  {
    category: "Payments",
    name: "Paytm Payment Gateway",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Paytm_Logo_%28standalone%29.svg/250px-Paytm_Logo_%28standalone%29.svg.png",
    connected: false,
    meta: "UPI · cards · netbanking · wallet · EMI · payment links",
  },
];

const CATEGORY_META: Record<VendorCategory, { label: string; tint: string }> = {
  LMS:      { label: "Loan Management Systems", tint: "text-chart-1 bg-chart-1/10 border-chart-1/25" },
  CRM:      { label: "CRMs",                    tint: "text-chart-2 bg-chart-2/10 border-chart-2/25" },
  KYC:      { label: "KYC & Verification",      tint: "text-chart-3 bg-chart-3/10 border-chart-3/25" },
  Payments: { label: "Payment Gateways",        tint: "text-chart-4 bg-chart-4/10 border-chart-4/25" },
};

const CATEGORY_ORDER: VendorCategory[] = ["LMS", "CRM", "KYC", "Payments"];

function Connectors() {
  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.map((cat) => {
        const items = VENDORS.filter((v) => v.category === cat);
        if (items.length === 0) return null;
        return (
          <section key={cat}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_META[cat].label}
              </h3>
              <span className="text-[11px] text-muted-foreground/70">· {items.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {items.map((v) => (
                <Card key={v.name} icon={v.icon} logoUrl={v.logoUrl} title={v.name} meta={v.meta} connected={v.connected} category={v.category} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Developer() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">API keys</h3>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">Programmatic access to campaigns, agents, runs.</p>
        <div className="mt-3 space-y-2">
          {[
            { name: "Production · backend", key: "pi_live_••••a92f", scope: "read · write" },
            { name: "Staging · backend", key: "pi_test_••••71be", scope: "read · write" },
          ].map((k) => (
            <div key={k.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-[12.5px]">
              <div>
                <p className="font-medium">{k.name}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{k.key} · {k.scope}</p>
              </div>
              <button className="text-[11.5px] text-muted-foreground hover:text-foreground">Rotate</button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="mt-3 h-8 text-xs">Create key</Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Webhooks</h3>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">Receive run, agent, and approval events.</p>
        <div className="mt-3 space-y-2">
          {[
            { url: "https://api.acmebank.in/hooks/pi/runs", events: "run.completed · run.failed", health: "ok" },
            { url: "https://ops.acmebank.in/agents", events: "agent.escalated · ptp.captured", health: "ok" },
          ].map((w) => (
            <div key={w.url} className="rounded-lg border border-border px-3 py-2.5 text-[12.5px]">
              <p className="truncate font-mono">{w.url}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{w.events}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="col-span-2 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Quickstart</h3>
        </div>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-secondary/40 p-3 font-mono text-[11.5px] leading-relaxed">
{`curl -X POST https://api.piagents.com/v1/campaigns/pl_dpd_early/trigger \\
  -H "Authorization: Bearer pi_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "loan_id": "L_74821", "context": { "dpd_days": 4, "outstanding": 12800 } }'`}
        </pre>
      </div>
    </div>
  );
}

function Card({
  icon: Icon, logoUrl, title, meta, connected, category,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  logoUrl?: string;
  title: string;
  meta: string;
  connected: boolean;
  category: VendorCategory;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-accent text-foreground">
            {logoUrl ? (
              <img src={logoUrl} alt={title} className="h-6 w-auto object-contain" />
            ) : Icon ? (
              <Icon className="h-4 w-4" />
            ) : null}
          </div>
          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${CATEGORY_META[category].tint}`}>
            {category}
          </span>
        </div>
        {connected ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10.5px] font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] text-muted-foreground">
            Not connected
          </span>
        )}
      </div>
      <h3 className="mt-3 text-[14px] font-semibold">{title}</h3>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">{meta}</p>
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant={connected ? "outline" : "default"} className="h-7 text-[11.5px]">
          {connected ? "Manage" : "Connect"}
        </Button>
      </div>
    </div>
  );
}
