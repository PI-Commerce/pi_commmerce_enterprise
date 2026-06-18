import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Button } from "@/components/ui/button";
import { Database, Webhook, Key, Code2 } from "lucide-react";

export const Route = createFileRoute("/integrations/")({
  component: Integrations,
  head: () => ({ meta: [{ title: "Integrations · Pi Commerce Enterprise" }] }),
});

type Tab = "crm" | "developer";

function Integrations() {
  const [tab, setTab] = useState<Tab>("crm");
  return (
    <AppShell>
      <PageHeader
        title="Integrations"
        description="Connect data sources and developer tooling. Messaging channels live under Channels."
      />
      <PageTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "crm", label: "CRMs" },
          { id: "developer", label: "Developer" },
        ]}
      />
      {tab === "crm" && <CRMs />}
      {tab === "developer" && <Developer />}
    </AppShell>
  );
}

const CRMS = [
  { name: "Postgres warehouse", icon: Database, connected: true, meta: "pii_users · trades · kyc · 4 tables" },
  { name: "HubSpot CRM", icon: Database, connected: true, meta: "Contacts · deals · timeline events" },
  { name: "Segment", icon: Database, connected: false, meta: "Stream user events into Pi" },
  { name: "Snowflake", icon: Database, connected: false, meta: "Sync curated cohorts hourly" },
];

function CRMs() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {CRMS.map((c) => <Card key={c.name} icon={c.icon} title={c.name} meta={c.meta} connected={c.connected} />)}
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
            { url: "https://api.piwealth.in/hooks/pi/runs", events: "run.completed · run.failed", health: "ok" },
            { url: "https://ops.piwealth.in/agents", events: "agent.escalated", health: "ok" },
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
{`curl -X POST https://api.picommerce.io/v1/campaigns/c_001/trigger \\
  -H "Authorization: Bearer pi_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "user_id": "u_42", "context": { "last_trade": "RELIANCE" } }'`}
        </pre>
      </div>
    </div>
  );
}

function Card({ icon: Icon, title, meta, connected }: { icon: React.ComponentType<{ className?: string }>; title: string; meta: string; connected: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-foreground"><Icon className="h-4 w-4" /></div>
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

