import { useState, useRef, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Phone, MessageCircle, Wrench, Search, MoreHorizontal, Copy, Check, KeyRound, Pencil, PhoneCall, Power, ChevronLeft, Sparkles, FlaskConical, Play, Loader2, AlertTriangle, Clock, TrendingUp, CheckCircle2, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TOOLS, AUTH_LABEL, TYPE_LABEL, STATUS_LABEL, getTool, type ToolType } from "@/lib/tool-registry";
import { AGENT_TEMPLATES, getAgentRecord } from "@/lib/agent-data";

export const Route = createFileRoute("/agents/")({
  component: Agents,
  validateSearch: (s: Record<string, unknown>): { tab?: "tools" | "eval" } => ({
    tab: s.tab === "tools" ? "tools" : s.tab === "eval" ? "eval" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Agents · Pi Commerce Enterprise" },
      { name: "description", content: "Voice & chat AI agents with tools and capabilities." },
    ],
  }),
});

type Tab = "builder" | "tools" | "eval";

function Agents() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab === "tools" ? "tools" : search.tab === "eval" ? "eval" : "builder");

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
          { id: "eval", label: "Eval" },
        ]}
      />

      {tab === "builder" && <Builder />}
      {tab === "tools" && <Tools />}
      {tab === "eval" && <Eval />}
    </AppShell>
  );
}

/**
 * New-agent CTA → two-step modal: (1) pick voice vs chat, (2) start from
 * scratch or from a template → full-page builder.
 */
function NewAgentButton() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [chosenType, setChosenType] = useState<AgentType | null>(null);

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) setChosenType(null);
  };
  const go = (type: AgentType, template?: string) => {
    setOpen(false);
    setChosenType(null);
    navigate({ to: "/agents/new", search: { type, template } });
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> New agent</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {chosenType === null ? (
          <>
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
                  onClick={() => setChosenType(type)}
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
          </>
        ) : (
          <>
            <DialogHeader>
              <button
                onClick={() => setChosenType(null)}
                className="mb-1 inline-flex w-fit items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
              <DialogTitle>Start a {chosenType === "voice" ? "voice" : "chat"} agent</DialogTitle>
              <DialogDescription>Build from scratch, or start from a template.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 pt-1">
              <button
                onClick={() => go(chosenType)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-foreground/30 hover:bg-accent"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-foreground">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Build from scratch</span>
                  <span className="block text-[12px] text-muted-foreground">Start with an empty agent and configure everything yourself.</span>
                </span>
              </button>

              <div className="px-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Templates</div>
              {AGENT_TEMPLATES[chosenType].map((t) => (
                <button
                  key={t.id}
                  onClick={() => go(chosenType, t.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-foreground/30 hover:bg-accent"
                >
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent", chosenType === "voice" ? "text-ai" : "text-success")}>
                    {chosenType === "voice" ? <Phone className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{t.label}</span>
                    <span className="block text-[12px] text-muted-foreground">{t.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

type AgentType = "chat" | "voice";
type AgentStatus = "live" | "draft" | "paused" | "archived";

type Agent = { id: string; name: string; type: AgentType; status: AgentStatus; updatedAt: string };

const INITIAL_AGENTS: Agent[] = [
  { id: "a_concierge", name: "Pi Concierge", type: "chat", status: "live", updatedAt: "2 days ago" },
  { id: "a_voice_react", name: "Reactivation Voice", type: "voice", status: "live", updatedAt: "5 hours ago" },
  { id: "a_kyc", name: "KYC Helper", type: "chat", status: "live", updatedAt: "1 week ago" },
  { id: "a_pricing", name: "Pricing Q&A", type: "chat", status: "draft", updatedAt: "3 weeks ago" },
  { id: "a_winback", name: "Win-back Voice", type: "voice", status: "paused", updatedAt: "1 month ago" },
  { id: "a_support", name: "L1 Support", type: "chat", status: "live", updatedAt: "4 days ago" },
  { id: "a_offers", name: "Festive Offers", type: "chat", status: "live", updatedAt: "Just now" },
];

/** An agent is "active" when its live version is serving; everything else (paused, draft, archived) reads as inactive. */
const isAgentActive = (status: AgentStatus) => status === "live";

function Builder() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [query, setQuery] = useState("");
  const [fType, setFType] = useState<"all" | AgentType>("all");
  const [fStatus, setFStatus] = useState<"all" | "active" | "inactive">("all");

  const handleClone = (a: Agent) => {
    setAgents((prev) => {
      let id = `${a.id}_copy`;
      let n = 2;
      while (prev.some((x) => x.id === id)) id = `${a.id}_copy_${n++}`;
      const clone: Agent = { ...a, id, name: `${a.name} copy`, status: "draft", updatedAt: "Just now" };
      const i = prev.findIndex((x) => x.id === a.id);
      const next = [...prev];
      next.splice(i + 1, 0, clone);
      toast.success("Agent cloned", { description: clone.name });
      return next;
    });
  };

  const handleToggleActive = (a: Agent) => {
    const next: AgentStatus = a.status === "paused" ? "live" : "paused";
    setAgents((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: next, updatedAt: "Just now" } : x)));
    toast.success(next === "paused" ? "Agent deactivated" : "Agent activated", { description: a.name });
  };

  const filtered = agents.filter((a) => {
    if (fType !== "all" && a.type !== fType) return false;
    if (fStatus !== "all" && (fStatus === "active") !== isAgentActive(a.status)) return false;
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
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
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
                <th className="px-4 py-2.5 text-left font-medium">Type</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Last updated</th>
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
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{a.updatedAt}</td>
                    <td className="px-2 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={() => navigate({ to: "/agents/$id", params: { id: a.id }, search: { test: true } })}
                            className="gap-2 text-xs"
                          >
                            <PhoneCall className="h-3.5 w-3.5" /> Test agent
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => navigate({ to: "/agents/$id", params: { id: a.id }, search: { edit: true } })}
                            className="gap-2 text-xs"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleClone(a)}
                            className="gap-2 text-xs"
                          >
                            <Copy className="h-3.5 w-3.5" /> Clone
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(a)}
                            disabled={a.status === "archived"}
                            className="gap-2 text-xs"
                          >
                            <Power className="h-3.5 w-3.5" /> {a.status === "paused" ? "Activate" : "Deactivate"}
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
      )}

    </>
  );
}

function StatusTag({ status }: { status: AgentStatus }) {
  const active = isAgentActive(status);
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
      active ? "border-success/30 bg-success/10 text-success" : "border-muted-foreground/30 bg-muted text-muted-foreground",
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-success animate-pulse" : "bg-current opacity-60")} />
      {active ? "Active" : "Inactive"}
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

/* --------------------------------------------------------- */
/* Eval — evaluate an agent's recent conversations            */
/* --------------------------------------------------------- */

type EvalPhase = "idle" | "running" | "done";
type EvalSeverity = "high" | "medium" | "low";
type PromptSuggestion = { id: string; severity: EvalSeverity; title: string; detail: string };
type ToolFailure = { handle: string; calls: number; failures: number; error: string };
type EvalResult = {
  conversations: number;
  resolutionRate: number;
  avgDurationSec: number;
  escalationRate: number;
  suggestions: PromptSuggestion[];
  toolFailures: ToolFailure[];
};

const EVAL_RANGES = [
  { value: "24h", label: "Last 24 hours", mul: 0.3 },
  { value: "7d", label: "Last 7 days", mul: 1 },
  { value: "30d", label: "Last 30 days", mul: 4 },
  { value: "90d", label: "Last 90 days", mul: 11 },
] as const;

const EVAL_STEPS = ["Sampling conversations", "Scoring outcomes", "Detecting tool failures", "Drafting prompt changes"];

const hashStr = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const fmtDuration = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

/** Build an illustrative (mock) evaluation for the chosen agent + range. */
function buildEvalResult(agentId: string, range: string): EvalResult {
  const rec = getAgentRecord(agentId);
  const isVoice = rec?.type === "voice";
  const seed = hashStr(agentId + range);
  const mul = EVAL_RANGES.find((r) => r.value === range)?.mul ?? 1;
  const conversations = Math.max(12, Math.round((180 + (seed % 120)) * mul));
  const resolutionRate = 70 + (seed % 18);
  const avgDurationSec = isVoice ? 110 + (seed % 90) : 70 + (seed % 60);
  const escalationRate = 4 + (seed % 9);
  const refundPct = 22 + (seed % 14);

  const suggestions: PromptSuggestion[] = [
    {
      id: "refund-window", severity: "high",
      title: "State the refund window up front",
      detail: `In ${refundPct}% of refund conversations the agent did not mention the 5 to 7 day return window before the customer asked. Add an explicit line: "Refunds reach your original payment method in 5 to 7 business days."`,
    },
    isVoice
      ? { id: "interruption", severity: "high", title: "Lower interruption sensitivity", detail: "The agent spoke over callers right after IVR tones in several calls. Set interruption sensitivity to Balanced, or add a half-second pause before responding." }
      : { id: "shorter", severity: "medium", title: "Shorten replies on mobile", detail: "Replies often ran past four lines. Instruct the agent to keep answers to two or three sentences and ask a follow-up instead of over-explaining." },
    {
      id: "ask-order-id", severity: "medium",
      title: "Ask for the order ID earlier",
      detail: "Delivery and tracking questions averaged two extra turns because the agent requested the order ID late. Prompt it to ask for the order ID in its first reply when the intent is tracking.",
    },
    seed % 2 === 0
      ? { id: "closing", severity: "low", title: "Tighten the closing", detail: "Closings ran long. Add: \"If there is nothing else, thank the customer and end politely.\"" }
      : { id: "greet-once", severity: "low", title: "Greet only once", detail: "The agent re-introduced itself after tool calls in a few conversations. Add guidance to greet once and skip the opener mid-conversation." },
  ];

  const toolFailures: ToolFailure[] = [];
  (rec?.tools ?? []).forEach((h, i) => {
    const t = getTool(h);
    if (!t) return;
    const calls = Math.max(1, Math.round(conversations * (0.3 + ((seed >>> i) % 5) / 10)));
    if (t.health === "warn") {
      toolFailures.push({ handle: h, calls, failures: Math.max(1, Math.round(calls * (0.08 + ((seed >>> i) % 12) / 100))), error: "HTTP 429 - rate limited by upstream" });
    } else if ((seed >>> (i + 3)) % 7 === 0) {
      toolFailures.push({ handle: h, calls, failures: Math.max(1, Math.round(calls * 0.02)), error: "HTTP 504 - upstream timeout" });
    }
  });

  return { conversations, resolutionRate, avgDurationSec, escalationRate, suggestions, toolFailures };
}

function Eval() {
  const [agentId, setAgentId] = useState(INITIAL_AGENTS[0].id);
  const [range, setRange] = useState<string>("7d");
  const [phase, setPhase] = useState<EvalPhase>("idle");
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<EvalResult | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const agent = INITIAL_AGENTS.find((a) => a.id === agentId);
  const rangeLabel = EVAL_RANGES.find((r) => r.value === range)?.label ?? range;

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (stepTimer.current) { clearInterval(stepTimer.current); stepTimer.current = null; }
  };
  useEffect(() => () => clear(), []);

  const run = () => {
    clear();
    setResult(null);
    setStep(0);
    setPhase("running");
    stepTimer.current = setInterval(() => setStep((s) => Math.min(s + 1, EVAL_STEPS.length - 1)), 650);
    const done = setTimeout(() => {
      if (stepTimer.current) { clearInterval(stepTimer.current); stepTimer.current = null; }
      setResult(buildEvalResult(agentId, range));
      setPhase("done");
    }, 2800);
    timers.current.push(done);
  };

  return (
    <div className="space-y-4">
      {/* Config */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1 space-y-1">
            <label className="block text-[12px] font-medium">Agent</label>
            <Select value={agentId} onValueChange={(v) => { setAgentId(v); setPhase("idle"); setResult(null); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INITIAL_AGENTS.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-sm">
                    <span className="inline-flex items-center gap-1.5">
                      {a.type === "voice" ? <Phone className="h-3.5 w-3.5 text-ai" /> : <MessageCircle className="h-3.5 w-3.5 text-success" />}
                      {a.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px] space-y-1">
            <label className="block text-[12px] font-medium">Time range</label>
            <Select value={range} onValueChange={(v) => { setRange(v); setPhase("idle"); setResult(null); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVAL_RANGES.map((r) => <SelectItem key={r.value} value={r.value} className="text-sm">{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={run} disabled={phase === "running"}>
            {phase === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {phase === "running" ? "Evaluating…" : phase === "done" ? "Re-run evaluation" : "Run evaluation"}
          </Button>
        </div>
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Samples recent conversations and scores outcomes to recommend prompt changes and surface tool failures. Results are illustrative.
        </p>
      </div>

      {/* Idle */}
      {phase === "idle" && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ai/10 text-ai"><FlaskConical className="h-6 w-6" /></span>
          <p className="mt-3 text-sm font-medium">Evaluate {agent?.name}</p>
          <p className="mt-1 max-w-sm text-[12.5px] text-muted-foreground">
            Run an evaluation over {rangeLabel.toLowerCase()} to get suggested prompt changes and a tool-failure report.
          </p>
        </div>
      )}

      {/* Running */}
      {phase === "running" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <Loader2 className="h-4 w-4 animate-spin text-ai" /> Evaluating {agent?.name} over {rangeLabel.toLowerCase()}…
          </div>
          <div className="mt-4 space-y-2.5">
            {EVAL_STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2.5 text-[12.5px]">
                {i < step ? <CheckCircle2 className="h-4 w-4 text-success" />
                  : i === step ? <Loader2 className="h-4 w-4 animate-spin text-ai" />
                  : <span className="h-4 w-4 rounded-full border border-border" />}
                <span className={cn(i <= step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      {phase === "done" && result && (
        <div className="space-y-4">
          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon={MessagesSquare} label="Conversations" value={result.conversations.toLocaleString()} />
            <StatTile icon={TrendingUp} label="Resolution rate" value={`${result.resolutionRate}%`} tone="success" />
            <StatTile icon={Clock} label="Avg handle time" value={fmtDuration(result.avgDurationSec)} />
            <StatTile icon={AlertTriangle} label="Escalation rate" value={`${result.escalationRate}%`} tone="warn" />
          </div>

          {/* Suggested prompt changes */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Sparkles className="h-4 w-4 text-ai" />
              <h3 className="text-[14px] font-semibold">Suggested prompt changes</h3>
              <span className="rounded-full bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{result.suggestions.length}</span>
            </div>
            <div className="divide-y divide-border">
              {result.suggestions.map((s) => (
                <div key={s.id} className="flex items-start gap-3 px-4 py-3">
                  <SeverityChip severity={s.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{s.title}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{s.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-border px-4 py-2.5">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => toast.success("Suggestions sent to the builder", { description: `Draft prompt update prepared for ${agent?.name}.` })}>
                <Pencil className="h-3.5 w-3.5" /> Apply to draft
              </Button>
            </div>
          </div>

          {/* Tool failures */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-[14px] font-semibold">Tool failures</h3>
              {result.toolFailures.length > 0 && (
                <span className="rounded-full border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] text-destructive">{result.toolFailures.length}</span>
              )}
            </div>
            {result.toolFailures.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-6 text-[12.5px] text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" /> No tool failures detected over {rangeLabel.toLowerCase()}.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Tool</th>
                    <th className="px-4 py-2.5 text-left font-medium">Calls</th>
                    <th className="px-4 py-2.5 text-left font-medium">Failures</th>
                    <th className="px-4 py-2.5 text-left font-medium">Rate</th>
                    <th className="px-4 py-2.5 text-left font-medium">Last error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.toolFailures.map((f) => {
                    const rate = Math.round((f.failures / f.calls) * 100);
                    return (
                      <tr key={f.handle}>
                        <td className="px-4 py-3"><span className="font-mono text-[12px]">@{f.handle}</span></td>
                        <td className="px-4 py-3 text-[12.5px] text-muted-foreground">{f.calls.toLocaleString()}</td>
                        <td className="px-4 py-3 text-[12.5px] text-destructive">{f.failures.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={cn("rounded-md px-1.5 py-0.5 text-[11.5px] font-medium", rate >= 8 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning")}>{rate}%</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11.5px] text-muted-foreground">{f.error}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: "success" | "warn" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5", tone === "success" ? "text-success" : tone === "warn" ? "text-warning" : "text-muted-foreground")} /> {label}
      </div>
      <p className="mt-1 text-[20px] font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function SeverityChip({ severity }: { severity: EvalSeverity }) {
  const map = {
    high: "border-destructive/30 bg-destructive/10 text-destructive",
    medium: "border-warning/30 bg-warning/10 text-warning",
    low: "border-border bg-secondary text-muted-foreground",
  } as const;
  return (
    <span className={cn("mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide", map[severity])}>
      {severity}
    </span>
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
