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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Phone, MessageCircle, Wrench, Search, MoreHorizontal, Workflow, Archive, Copy, Check, KeyRound, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TOOLS, AUTH_LABEL, TYPE_LABEL, STATUS_LABEL, type ToolType } from "@/lib/tool-registry";

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
        actions={<NewAgentButton />}
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

/** New-agent CTA → modal to pick voice vs chat → full-page builder. */
function NewAgentButton() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const choose = (type: "voice" | "chat") => {
    setOpen(false);
    navigate({ to: "/agents/new", search: { type } });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> New agent</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create an agent</DialogTitle>
          <DialogDescription>What kind of agent do you want to build?</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-1">
          {([
            ["voice", "Voice agent", "Makes & takes phone calls", Phone, "text-ai"],
            ["chat", "Chat agent", "Replies on WhatsApp & chat", MessageCircle, "text-success"],
          ] as const).map(([type, title, desc, Icon, tone]) => (
            <button
              key={type}
              onClick={() => choose(type)}
              className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent"
            >
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg bg-accent", tone)}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold">{title}</span>
              <span className="text-[12px] text-muted-foreground">{desc}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
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

function Tools() {
  const [query, setQuery] = useState("");
  const [fHealth, setFHealth] = useState<"all" | "ok" | "warn">("all");
  const [fType, setFType] = useState<"all" | ToolType>("all");

  const filtered = TOOLS.filter((t) => {
    if (fHealth !== "all" && t.health !== fHealth) return false;
    if (fType !== "all" && t.type !== fType) return false;
    if (query && !t.handle.toLowerCase().includes(query.toLowerCase()) && !t.description.toLowerCase().includes(query.toLowerCase())) return false;
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
            placeholder="Search by tool name or description…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <FilterSelect
          label="Type"
          value={fType}
          onChange={(v) => setFType(v as typeof fType)}
          options={[
            { value: "all", label: "All" },
            { value: "http", label: "HTTP API" },
            { value: "mcp", label: "MCP" },
          ]}
        />
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
          <Link to="/agents/tools/new" search={{ tool: undefined }}><Plus className="h-3.5 w-3.5" /> Add tool</Link>
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
                <th className="px-4 py-2.5 text-left font-medium">Type</th>
                <th className="px-4 py-2.5 text-left font-medium">Auth</th>
                <th className="px-4 py-2.5 text-left font-medium">Health</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Created</th>
                <th className="px-4 py-2.5 text-left font-medium">Updated</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((t) => (
                <tr key={t.handle} className="group transition-colors hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-foreground">
                        <Wrench className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <HandleChip handle={t.handle} />
                        <p className="mt-1 truncate text-[11.5px] text-muted-foreground">{t.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                      t.type === "mcp" ? "border-ai/30 bg-ai/10 text-ai" : "border-border bg-secondary/40 text-muted-foreground",
                    )}>
                      {TYPE_LABEL[t.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <KeyRound className="h-3 w-3" />
                      {AUTH_LABEL[t.auth]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      title="Based on recent calls"
                      className={cn("inline-flex items-center gap-1.5 text-[12px]", t.health === "ok" ? "text-success" : "text-warning")}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", t.health === "ok" ? "bg-success" : "bg-warning")} />
                      {t.health === "ok" ? "Healthy" : "Degraded"}
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
                  <td className="px-2 py-3 text-right">
                    <Link to="/agents/tools/new" search={{ tool: t.handle }} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground opacity-0 transition-opacity hover:underline group-hover:opacity-100">
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
