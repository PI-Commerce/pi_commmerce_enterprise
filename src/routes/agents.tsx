import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Button } from "@/components/ui/button";
import { Plus, Phone, MessageCircle, FileText, Wrench, Database, Check, RefreshCw, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/agents")({
  component: Agents,
  head: () => ({
    meta: [
      { title: "Agents · Pi Commerce Enterprise" },
      { name: "description", content: "Voice & chat AI agents with tools and knowledge bases." },
    ],
  }),
});

type Tab = "builder" | "knowledge" | "tools";

function Agents() {
  const [tab, setTab] = useState<Tab>("builder");

  return (
    <AppShell>
      <PageHeader
        title="Agents"
        description="Reusable voice and chat agents you can wire into any campaign."
        actions={
          <Button size="sm" className="h-8 gap-1.5 text-xs" asChild>
            <Link to="/agents/$id" params={{ id: "a_concierge" }}><Plus className="h-3.5 w-3.5" /> New agent</Link>
          </Button>
        }
      />

      <PageTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "builder", label: "Builder", count: 6 },
          { id: "knowledge", label: "Knowledge base", count: 4 },
          { id: "tools", label: "Tools", count: 9 },
        ]}
      />

      {tab === "builder" && <Builder />}
      {tab === "knowledge" && <Knowledge />}
      {tab === "tools" && <Tools />}
    </AppShell>
  );
}

const AGENTS = [
  { id: "a_concierge", name: "Pi Concierge", type: "chat", status: "live", convs: "12.4K", success: "94%" },
  { id: "a_voice_react", name: "Reactivation Voice", type: "voice", status: "live", convs: "3.1K", success: "61%" },
  { id: "a_kyc", name: "KYC Helper", type: "chat", status: "live", convs: "9.0K", success: "88%" },
  { id: "a_pricing", name: "Pricing Q&A", type: "chat", status: "draft", convs: "—", success: "—" },
  { id: "a_winback", name: "Win-back Voice", type: "voice", status: "paused", convs: "412", success: "44%" },
  { id: "a_support", name: "L1 Support", type: "chat", status: "live", convs: "21.7K", success: "82%" },
] as const;

function Builder() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {AGENTS.map((a) => {
        const Icon = a.type === "voice" ? Phone : MessageCircle;
        return (
          <Link
            key={a.id}
            to="/agents/$id"
            params={{ id: a.id }}
            className="group rounded-xl border border-border bg-card p-4 transition-all hover:border-foreground/15 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)]"
          >
            <div className="flex items-start justify-between">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.type === "voice" ? "bg-ai/10 text-ai" : "bg-success/10 text-success"}`}>
                <Icon className="h-4 w-4" />
              </div>
              <StatusPill status={a.status} />
            </div>
            <h3 className="mt-3 text-[14px] font-semibold">{a.name}</h3>
            <p className="text-[11px] capitalize text-muted-foreground">{a.type} agent</p>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3 text-center">
              <div>
                <p className="font-mono text-[13px]">{a.convs}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">conversations</p>
              </div>
              <div>
                <p className="font-mono text-[13px]">{a.success}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">success</p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "live" ? "border-success/30 bg-success/10 text-success"
    : status === "draft" ? "border-warning/30 bg-warning/10 text-warning"
    : "border-muted-foreground/30 bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize ${tone}`}>
      <span className={`h-1 w-1 rounded-full ${status === "live" ? "bg-success animate-pulse" : "bg-current opacity-70"}`} />
      {status}
    </span>
  );
}

const KB = [
  { name: "Product handbook", source: "Notion", chunks: 1240, agents: 4, status: "synced", updated: "2h ago" },
  { name: "Compliance & SEBI", source: "Drive", chunks: 412, agents: 3, status: "syncing", updated: "Now" },
  { name: "Help center", source: "Zendesk", chunks: 980, agents: 2, status: "synced", updated: "Yesterday" },
  { name: "Pricing FAQ", source: "Manual", chunks: 84, agents: 5, status: "issues", updated: "3d ago" },
];

function Knowledge() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Sources</h2>
          <p className="text-[11px] text-muted-foreground">Connected stores feeding agent retrieval.</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> Add source</Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Source</th>
            <th className="px-4 py-2.5 text-left font-medium">Origin</th>
            <th className="px-4 py-2.5 text-right font-medium">Chunks</th>
            <th className="px-4 py-2.5 text-right font-medium">Agents</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-left font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {KB.map((k) => (
            <tr key={k.name} className="hover:bg-accent/30">
              <td className="px-4 py-3 font-medium">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" /> {k.name}
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{k.source}</td>
              <td className="px-4 py-3 text-right font-mono text-[12px]">{k.chunks.toLocaleString()}</td>
              <td className="px-4 py-3 text-right font-mono text-[12px]">{k.agents}</td>
              <td className="px-4 py-3">
                {k.status === "synced" && <span className="inline-flex items-center gap-1 text-[11.5px] text-success"><Check className="h-3 w-3" /> Synced</span>}
                {k.status === "syncing" && <span className="inline-flex items-center gap-1 text-[11.5px] text-ai"><RefreshCw className="h-3 w-3 animate-spin" /> Syncing</span>}
                {k.status === "issues" && <span className="inline-flex items-center gap-1 text-[11.5px] text-warning"><AlertTriangle className="h-3 w-3" /> 4 chunks failed</span>}
              </td>
              <td className="px-4 py-3 text-[12px] text-muted-foreground">{k.updated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TOOLS = [
  { name: "Send WhatsApp", scope: "messaging:send", health: "ok", usage: "12.4K / day" },
  { name: "Send SMS", scope: "messaging:send", health: "ok", usage: "3.1K / day" },
  { name: "Telephony · Place call", scope: "voice:dial", health: "ok", usage: "820 / day" },
  { name: "CRM Query", scope: "crm:read", health: "ok", usage: "48K / day" },
  { name: "Meta Ads · Push audience", scope: "ads:write", health: "warn", usage: "120 / day" },
  { name: "Fetch Customer Context", scope: "internal:read", health: "ok", usage: "210K / day" },
  { name: "Order lookup", scope: "orders:read", health: "ok", usage: "9.4K / day" },
  { name: "Refund · initiate", scope: "payments:write", health: "ok", usage: "82 / day" },
  { name: "Knowledge lookup", scope: "kb:read", health: "ok", usage: "180K / day" },
];

function Tools() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {TOOLS.map((t) => (
        <div key={t.name} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-foreground">
              <Wrench className="h-4 w-4" />
            </div>
            <span className={`flex items-center gap-1 text-[11px] ${t.health === "ok" ? "text-success" : "text-warning"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${t.health === "ok" ? "bg-success" : "bg-warning"}`} />
              {t.health === "ok" ? "Healthy" : "Degraded"}
            </span>
          </div>
          <h3 className="mt-3 text-[14px] font-semibold">{t.name}</h3>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{t.scope}</p>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[11.5px] text-muted-foreground">
            <span>{t.usage}</span>
            <button className="text-foreground hover:underline">Manage</button>
          </div>
        </div>
      ))}
    </div>
  );
}
