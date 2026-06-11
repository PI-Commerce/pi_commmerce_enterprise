import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Phone, MessageCircle, Wrench, Search, MoreHorizontal, Workflow, Archive, Copy, Check, KeyRound, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
        actions={
          <Button size="sm" className="h-8 gap-1.5 text-xs" asChild>
            <Link to="/agents/new"><Plus className="h-3.5 w-3.5" /> New agent</Link>
          </Button>
        }
      />

      <PageTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "builder", label: "Builder", count: INITIAL_AGENTS.length },
          { id: "tools", label: "Tools", count: INITIAL_TOOLS.length },
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
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [query, setQuery] = useState("");
  const [fType, setFType] = useState<"all" | AgentType>("all");
  const [fStatus, setFStatus] = useState<"all" | AgentStatus>("all");

  const handleArchive = (a: Agent) => {
    setAgents((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: "archived" } : x)));
    toast.success("Agent archived", { description: a.name });
  };

  const filtered = agents.filter((a) => {
    if (fType !== "all" && a.type !== fType) return false;
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
          label="Type"
          value={fType}
          onChange={(v) => setFType(v as typeof fType)}
          options={[
            { value: "all", label: "All types" },
            { value: "chat", label: "Chat" },
            { value: "voice", label: "Voice" },
          ]}
        />
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
        <TooltipProvider delayDuration={150}>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Agent name</th>
                <th className="px-4 py-2.5 text-left font-medium">Type</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Campaigns</th>
                <th className="px-4 py-2.5 text-right font-medium">Conversations</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((a) => {
                const Icon = a.type === "voice" ? Phone : MessageCircle;
                return (
                  <tr key={a.id} className="transition-colors hover:bg-accent/30">
                    <td className="px-4 py-3">
                      <Link to="/agents/$id" params={{ id: a.id }} className="font-medium hover:underline">
                        {a.name}
                      </Link>
                      <p className="font-mono text-[11px] text-muted-foreground">{a.id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <span className={cn("flex h-5 w-5 items-center justify-center rounded-md", a.type === "voice" ? "bg-ai/10 text-ai" : "bg-success/10 text-success")}>
                          <Icon className="h-3 w-3" />
                        </span>
                        {a.type === "voice" ? "Voice" : "Chat"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusTag status={a.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {a.campaignNames.length > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-default items-center gap-1.5 font-mono text-[12px] underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
                              <Workflow className="h-3 w-3 text-muted-foreground" />
                              {a.campaignNames.length}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent align="end" className="max-w-xs p-0">
                            <div className="border-b border-primary-foreground/15 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider opacity-70">
                              In {a.campaignNames.length} campaign{a.campaignNames.length === 1 ? "" : "s"}
                            </div>
                            <ul className="px-3 py-1.5 text-left">
                              {a.campaignNames.map((name) => (
                                <li key={name} className="flex items-center gap-1.5 py-0.5 text-[12px]">
                                  <Workflow className="h-3 w-3 shrink-0 opacity-60" />
                                  {name}
                                </li>
                              ))}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="font-mono text-[12px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[12px]">{a.convs}</td>
                    <td className="px-2 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => navigate({ to: "/agents/$id", params: { id: a.id } })}
                            className="gap-2 text-xs"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleArchive(a)}
                            disabled={a.status === "archived"}
                            className="gap-2 text-xs"
                          >
                            <Archive className="h-3.5 w-3.5" /> Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </TooltipProvider>
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

type ToolHealth = "ok" | "warn";
type ToolStatus = "configured" | "setup";
type ToolAuth = "apiKey" | "bearer" | "oauth2" | "none";

type Tool = {
  handle: string;
  name: string;
  scope: string;
  health: ToolHealth;
  usage: string;
  status: ToolStatus;
  auth: ToolAuth;
  baseUrl: string;
};

const INITIAL_TOOLS: Tool[] = [
  { handle: "send_whatsapp", name: "Send WhatsApp", scope: "messaging:send", health: "ok", usage: "12.4K / day", status: "configured", auth: "apiKey", baseUrl: "https://graph.facebook.com/v19.0" },
  { handle: "send_sms", name: "Send SMS", scope: "messaging:send", health: "ok", usage: "3.1K / day", status: "configured", auth: "apiKey", baseUrl: "https://api.twilio.com/2010-04-01" },
  { handle: "place_call", name: "Telephony · Place call", scope: "voice:dial", health: "ok", usage: "820 / day", status: "configured", auth: "bearer", baseUrl: "https://api.telephony.pi/v1" },
  { handle: "crm_query", name: "CRM Query", scope: "crm:read", health: "ok", usage: "48K / day", status: "configured", auth: "oauth2", baseUrl: "https://api.crm.pi/v2" },
  { handle: "push_audience", name: "Meta Ads · Push audience", scope: "ads:write", health: "warn", usage: "120 / day", status: "configured", auth: "oauth2", baseUrl: "https://graph.facebook.com/v19.0" },
  { handle: "customer_context", name: "Fetch Customer Context", scope: "internal:read", health: "ok", usage: "210K / day", status: "configured", auth: "none", baseUrl: "https://internal.pi/context" },
  { handle: "order_lookup", name: "Order lookup", scope: "orders:read", health: "ok", usage: "9.4K / day", status: "configured", auth: "apiKey", baseUrl: "https://api.orders.pi/v1" },
  { handle: "refund_initiate", name: "Refund · initiate", scope: "payments:write", health: "ok", usage: "82 / day", status: "configured", auth: "bearer", baseUrl: "https://api.payments.pi/v1" },
  { handle: "knowledge_lookup", name: "Knowledge lookup", scope: "kb:read", health: "ok", usage: "180K / day", status: "configured", auth: "none", baseUrl: "https://kb.pi/search" },
];

const AUTH_LABEL: Record<ToolAuth, string> = {
  apiKey: "API key",
  bearer: "Bearer token",
  oauth2: "OAuth 2.0",
  none: "No auth",
};

function Tools() {
  const [tools] = useState<Tool[]>(INITIAL_TOOLS);
  const [query, setQuery] = useState("");
  const [fHealth, setFHealth] = useState<"all" | ToolHealth>("all");

  const filtered = tools.filter((t) => {
    if (fHealth !== "all" && t.health !== fHealth) return false;
    if (query && !t.name.toLowerCase().includes(query.toLowerCase()) && !t.scope.toLowerCase().includes(query.toLowerCase()) && !t.handle.toLowerCase().includes(query.toLowerCase())) return false;
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
            placeholder="Search by name, handle or scope…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <FilterSelect
          label="Health"
          value={fHealth}
          onChange={(v) => setFHealth(v as typeof fHealth)}
          options={[
            { value: "all", label: "All" },
            { value: "ok", label: "Healthy" },
            { value: "warn", label: "Degraded" },
          ]}
        />
        <Button size="sm" className="ml-auto h-8 gap-1.5 text-xs" asChild>
          <Link to="/agents/tools/new"><Plus className="h-3.5 w-3.5" /> Add tool</Link>
        </Button>
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
                <th className="px-4 py-2.5 text-left font-medium">Prompt handle</th>
                <th className="px-4 py-2.5 text-left font-medium">Auth</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Usage</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((t) => (
                <tr key={t.handle} className="transition-colors hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-foreground">
                        <Wrench className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <span>{t.name}</span>
                        <p className="font-mono text-[11px] text-muted-foreground">{t.scope}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <HandleChip handle={t.handle} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <KeyRound className="h-3 w-3" />
                      {AUTH_LABEL[t.auth]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.status === "configured" ? (
                      <span className={cn("inline-flex items-center gap-1.5 text-[12px]", t.health === "ok" ? "text-success" : "text-warning")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", t.health === "ok" ? "bg-success" : "bg-warning")} />
                        {t.health === "ok" ? "Configured" : "Degraded"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-warning">
                        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                        Needs setup
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[12px] text-muted-foreground">{t.usage}</td>
                  <td className="px-2 py-3 text-right">
                    <Link to="/agents/tools/new" className="inline-flex items-center gap-1 text-[12px] text-foreground hover:underline">
                      <Pencil className="h-3 w-3" /> Edit
                    </Link>
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

function HandleChip({ handle }: { handle: string }) {
  const [copied, setCopied] = useState(false);
  const ref = `@${handle}`;
  const copy = () => {
    navigator.clipboard?.writeText(ref).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button
      onClick={copy}
      title="Copy handle — paste into an agent prompt to enable this tool"
      className="group inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 font-mono text-[11px] text-foreground transition-colors hover:border-foreground/20 hover:bg-accent"
    >
      {ref}
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />}
    </button>
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
