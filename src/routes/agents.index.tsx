import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Wrench, Search, Sparkles, Code2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOLS, TYPE_LABEL, STATUS_LABEL, SKILL_TYPE_LABEL, type ToolType } from "@/lib/tool-registry";

type SkillType = "function" | "llm";

export const Route = createFileRoute("/agents/")({
  component: Agents,
  validateSearch: (s: Record<string, unknown>): { tab?: "tools" | "skills" } => ({
    tab: s.tab === "tools" ? "tools" : s.tab === "skills" ? "skills" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Agents · Pi Agents FinServ" },
      { name: "description", content: "Voice & chat AI agents with tools and skills." },
    ],
  }),
});

type Tab = "builder" | "tools" | "skills";

// Split tool-registry into skills vs tools by the isSkill flag.
const TOOL_ENTRIES = TOOLS.filter((t) => !t.isSkill);
const SKILL_ENTRIES = TOOLS.filter((t) => t.isSkill);

function Agents() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab === "tools" ? "tools" : search.tab === "skills" ? "skills" : "builder");

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
          { id: "tools",   label: "Tools",   count: TOOL_ENTRIES.length },
          { id: "skills",  label: "Skills",  count: SKILL_ENTRIES.length },
        ]}
      />

      {tab === "builder" && <Builder />}
      {tab === "tools" && <Tools />}
      {tab === "skills" && <Skills />}
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
  const [fType, setFType] = useState<"all" | ToolType>("all");

  const filtered = TOOL_ENTRIES.filter((t) => {
    if (fType !== "all" && t.type !== fType) return false;
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
                    <span className={cn(
                      "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                      t.type === "mcp" ? "border-ai/30 bg-ai/10 text-ai" : "border-border bg-secondary/40 text-muted-foreground",
                    )}>
                      {TYPE_LABEL[t.type]}
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

function Skills() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [fType, setFType] = useState<"all" | SkillType>("all");

  const filtered = SKILL_ENTRIES.filter((s) => {
    if (fType !== "all" && s.skillType !== fType) return false;
    if (query && !s.handle.toLowerCase().includes(query.toLowerCase())) return false;
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
            placeholder="Search by skill name…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <FilterSelect
          label="Type"
          value={fType}
          onChange={(v) => setFType(v as typeof fType)}
          options={[
            { value: "all", label: "All" },
            { value: "function", label: "Function" },
            { value: "llm", label: "LLM Skill" },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">No skills match these filters.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Skill</th>
                <th className="px-4 py-2.5 text-left font-medium">Type</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Created</th>
                <th className="px-4 py-2.5 text-left font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s) => (
                <tr
                  key={s.handle}
                  onClick={() => navigate({ to: "/agents/tools/new", search: { tool: s.handle } })}
                  className="cursor-pointer transition-colors hover:bg-accent/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-ai/25 bg-ai/10 text-ai">
                        <Sparkles className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-mono text-[13px] text-foreground">{s.handle}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <SkillTypeChip type={s.skillType ?? "function"} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      s.status === "live" ? "border-success/30 bg-success/10 text-success" : "border-border bg-secondary text-muted-foreground",
                    )}>
                      {STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">{s.createdAt}</td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">{s.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SkillTypeChip({ type }: { type: SkillType }) {
  const isLlm = type === "llm";
  const Icon = isLlm ? FileText : Code2;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
      isLlm ? "border-ai/30 bg-ai/10 text-ai" : "border-border bg-secondary/40 text-muted-foreground",
    )}>
      <Icon className="h-3 w-3" />
      {SKILL_TYPE_LABEL[type]}
    </span>
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
