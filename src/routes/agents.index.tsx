import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Wrench, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TOOLS, STATUS_LABEL } from "@/lib/tool-registry";

export const Route = createFileRoute("/agents/")({
  component: Agents,
  validateSearch: (s: Record<string, unknown>): { tab?: "tools" } => ({
    tab: s.tab === "tools" ? "tools" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Agents · Pi Commerce Enterprise" },
      { name: "description", content: "Voice & chat AI agents with tools and capabilities." },
    ],
  }),
});

type Tab = "builder" | "tools";

function Agents() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab === "tools" ? "tools" : "builder");

  return (
    <AppShell>
      <PageHeader
        title="Agents"
        description="Reusable voice and chat agents you can wire into any campaign."
      />

      <PageTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "builder", label: "Builder", count: INITIAL_AGENTS.length },
          { id: "tools", label: "Tools", count: TOOLS.length },
        ]}
      />

      {tab === "builder" && <Builder />}
      {tab === "tools" && <Tools />}
    </AppShell>
  );
}

type AgentType = "chat" | "voice";
type AgentStatus = "live" | "draft" | "paused" | "archived";

type Agent = { id: string; name: string; type: AgentType; status: AgentStatus; campaignNames: string[]; convs: string };

const INITIAL_AGENTS: Agent[] = [
  { id: "a_concierge", name: "Pi Concierge", type: "chat", status: "live", convs: "12.4K", campaignNames: ["New Trader Onboarding", "Dormant Trader Reactivation", "KYC Drop-off Recovery", "High-Value Win-Back", "Festive Cashback Push"] },
  { id: "a_voice_react", name: "Reactivation Voice", type: "voice", status: "live", convs: "3.1K", campaignNames: ["Dormant Trader Reactivation", "High-Value Win-Back"] },
  { id: "a_kyc", name: "KYC Helper", type: "chat", status: "live", convs: "9.0K", campaignNames: ["KYC Drop-off Recovery", "New Trader Onboarding", "Dormant Trader Reactivation"] },
  { id: "a_pricing", name: "Pricing Q&A", type: "chat", status: "draft", convs: "—", campaignNames: [] },
  { id: "a_winback", name: "Win-back Voice", type: "voice", status: "paused", convs: "412", campaignNames: ["High-Value Win-Back"] },
  { id: "a_support", name: "L1 Support", type: "chat", status: "live", convs: "21.7K", campaignNames: ["New Trader Onboarding", "KYC Drop-off Recovery", "Festive Cashback Push", "Dormant Trader Reactivation"] },
];

const AGENT_STATUSES: AgentStatus[] = ["live", "draft", "paused", "archived"];

function Builder() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [fStatus, setFStatus] = useState<"all" | AgentStatus>("all");

  const filtered = INITIAL_AGENTS.filter((a) => {
    if (fStatus !== "all" && a.status !== fStatus) return false;
    if (query && !a.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <FilterSelect
          label="Status"
          value={fStatus}
          onChange={(v) => setFStatus(v as typeof fStatus)}
          options={[{ value: "all", label: "All statuses" }, ...AGENT_STATUSES.map((s) => ({ value: s, label: cap(s) }))]}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">No agents match these filters.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Agent name</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => navigate({ to: "/agents/$id", params: { id: a.id } })}
                  className="cursor-pointer transition-colors hover:bg-accent/30"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{a.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusTag status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function StatusTag({ status }: { status: AgentStatus }) {
  const tone =
    status === "live" ? "border-success/30 bg-success/10 text-success"
    : status === "draft" ? "border-warning/30 bg-warning/10 text-warning"
    : "border-muted-foreground/30 bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "live" ? "bg-success animate-pulse" : "bg-current opacity-60")} />
      {status}
    </span>
  );
}

function Tools() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const filtered = TOOLS.filter((t) => {
    if (query && !t.handle.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by tool name…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="ml-auto">
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => navigate({ to: "/agents/tools/new", search: {} })}
          >
            <Plus className="h-3.5 w-3.5" /> New tool
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">No tools match these filters.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Tool</th>
                <th className="px-4 py-2.5 text-left font-medium">Method</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Created</th>
                <th className="px-4 py-2.5 text-left font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((t) => (
                <tr
                  key={t.handle}
                  onClick={() => navigate({ to: "/agents/tools/new", search: { tool: t.handle } })}
                  className="cursor-pointer transition-colors hover:bg-accent/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-foreground">
                        <Wrench className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-mono text-[13px] text-foreground">{t.handle}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md border border-border bg-secondary/40 px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                      {t.method ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      t.status === "live" ? "border-success/30 bg-success/10 text-success" : "border-border bg-secondary text-muted-foreground",
                    )}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">{t.createdAt}</td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">{t.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function cap(s: string) { return s[0].toUpperCase() + s.slice(1); }

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto gap-1.5 px-2.5 text-xs">
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
