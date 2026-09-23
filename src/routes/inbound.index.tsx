/**
 * Inbound — Entry points and Sessions.
 *
 * Sibling of Campaigns, not a campaign type. A campaign is a project you launch
 * over a known audience; an entry point is infrastructure you keep on, and its
 * unit of work is a single person's session rather than a population.
 */
import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Plus, MessageCircle, Phone, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgents } from "@/lib/agent-data";
import {
  useEntryPoints,
  sessionsFor,
  computeSessionMetrics,
  fmtPct,
  fmtDuration,
  fmtTime,
  TERMINAL_STAGES,
  STAGE_LABEL,
  type EntryPoint,
  type Session,
  type SessionStage,
} from "@/lib/inbound";
import { StageTag, MetricCard } from "@/components/inbound/SessionBits";
import { SessionSheet } from "@/components/inbound/SessionSheet";

export const Route = createFileRoute("/inbound/")({
  component: Inbound,
  head: () => ({
    meta: [
      { title: "Inbound · Pi Commerce Enterprise" },
      {
        name: "description",
        content: "Entry points and sessions for inbound WhatsApp and voice.",
      },
    ],
  }),
});

type Tab = "entry" | "sessions";

function Inbound() {
  const [tab, setTab] = useState<Tab>("entry");
  const eps = useEntryPoints();
  const sessions = useMemo(() => eps.flatMap(sessionsFor), [eps]);

  return (
    <AppShell>
      <PageHeader
        title="Inbound"
        description="Always-on entry points that answer customers when they contact you, and the sessions they produce."
      />

      <PageTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "entry", label: "Entry points", count: eps.length },
          { id: "sessions", label: "Sessions", count: sessions.length },
        ]}
      />

      {tab === "entry" ? <EntryPointsTab /> : <SessionsTab />}
    </AppShell>
  );
}

// ── Entry points ────────────────────────────────────────────────────────────

function EntryPointsTab() {
  const navigate = useNavigate();
  const eps = useEntryPoints();
  const [query, setQuery] = useState("");
  const [fChannel, setFChannel] = useState<"all" | "whatsapp" | "voice">("all");

  const rows = eps.filter((e) => {
    if (fChannel !== "all" && e.channel !== fChannel) return false;
    if (query && !`${e.name} ${e.address}`.toLowerCase().includes(query.toLowerCase()))
      return false;
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
            placeholder="Search entry points…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <FilterSelect
          label="Channel"
          value={fChannel}
          onChange={(v) => setFChannel(v as typeof fChannel)}
          options={[
            { value: "all", label: "All channels" },
            { value: "whatsapp", label: "WhatsApp" },
            { value: "voice", label: "Voice" },
          ]}
        />
        {/* Channel is asked up front because it decides what the trigger publishes
            and which agents can answer — it can't be switched under a built graph. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="ml-auto h-8 gap-1.5 px-3 text-xs">
              <Plus className="h-3.5 w-3.5" /> New entry point
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[180px]">
            <DropdownMenuItem
              onSelect={() => navigate({ to: "/inbound/$id", params: { id: "new" }, search: { channel: "whatsapp" } })}
            >
              <MessageCircle className="mr-2 h-3.5 w-3.5" /> WhatsApp
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => navigate({ to: "/inbound/$id", params: { id: "new" }, search: { channel: "voice" } })}
            >
              <Phone className="mr-2 h-3.5 w-3.5" /> Voice
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No entry points match these filters.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Entry point</th>
                <th className="px-4 py-2.5 text-left font-medium">Address</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Steps</th>
                <th className="px-4 py-2.5 text-right font-medium">Sessions</th>
                <th className="px-4 py-2.5 text-right font-medium">Containment</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((ep) => (
                <EntryPointRow
                  key={ep.id}
                  ep={ep}
                  onOpen={() => navigate({ to: "/inbound/$id", params: { id: ep.id } })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function EntryPointRow({ ep, onOpen }: { ep: EntryPoint; onOpen: () => void }) {
  const m = useMemo(() => computeSessionMetrics(sessionsFor(ep)), [ep]);
  return (
    <tr onClick={onOpen} className="cursor-pointer transition-colors hover:bg-accent/30">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-foreground">
            {ep.channel === "voice" ? (
              <Phone className="h-3.5 w-3.5" />
            ) : (
              <MessageCircle className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{ep.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{ep.description}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">{ep.address}</td>
      <td className="px-4 py-3">
        <EpStatus status={ep.status} />
      </td>
      {/* Everything the arrival passes through after the trigger. */}
      <td className="px-4 py-3 text-right font-mono text-[12px]">
        {ep.graph.nodes.filter((n) => n.data.kind !== "inboundTrigger").length}
      </td>
      <td className="px-4 py-3 text-right font-mono text-[12px]">
        {m.received.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-right">
        <span
          className={cn(
            "font-mono text-[12px] font-medium",
            m.containmentRate >= 0.6 ? "text-success"
            : m.containmentRate >= 0.4 ? "text-warning"
            : "text-destructive",
          )}
        >
          {fmtPct(m.containmentRate)}
        </span>
      </td>
      <td className="pr-3">
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      </td>
    </tr>
  );
}

export function EpStatus({ status }: { status: EntryPoint["status"] }) {
  const tone =
    status === "live" ? "border-success/30 bg-success/10 text-success"
    : status === "draft" ? "border-warning/30 bg-warning/10 text-warning"
    : "border-muted-foreground/30 bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
        tone,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "live" ? "bg-success animate-pulse" : "bg-current opacity-60",
        )}
      />
      {status}
    </span>
  );
}

// ── Sessions ────────────────────────────────────────────────────────────────

function SessionsTab() {
  const eps = useEntryPoints();
  const agents = useAgents();
  const [query, setQuery] = useState("");
  const [fEp, setFEp] = useState<string>("all");
  const [fStage, setFStage] = useState<"all" | SessionStage>("all");
  const [open, setOpen] = useState<Session | null>(null);

  const all = useMemo(
    () =>
      eps
        .flatMap(sessionsFor)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [eps],
  );

  const rows = useMemo(
    () =>
      all.filter((s) => {
        if (fEp !== "all" && s.entryPointId !== fEp) return false;
        if (fStage !== "all" && s.stage !== fStage) return false;
        if (query) {
          const hay = `${s.id} ${s.contact.name} ${s.contact.phone}`.toLowerCase();
          if (!hay.includes(query.toLowerCase())) return false;
        }
        return true;
      }),
    [all, fEp, fStage, query],
  );

  const m = useMemo(() => computeSessionMetrics(rows), [rows]);
  const agentName = (id?: string) => agents.find((a) => a.id === id)?.name;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Sessions" value={m.received.toLocaleString()} />
        <MetricCard
          label="Containment"
          value={fmtPct(m.containmentRate)}
          tone={m.containmentRate >= 0.6 ? "good" : "warn"}
          hint="Resolved ÷ engaged sessions that ended. The primary inbound KPI."
        />
        <MetricCard label="Handoff" value={fmtPct(m.handoffRate)} />
        <MetricCard label="Median handle time" value={fmtDuration(m.medianHandleMs)} />
        <MetricCard
          label="Cost / resolution"
          value={`$${m.costPerResolution.toFixed(3)}`}
          hint="Compares against outbound cost per conversion."
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by session, name, or phone…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <FilterSelect
          label="Entry point"
          value={fEp}
          onChange={setFEp}
          options={[
            { value: "all", label: "All entry points" },
            ...eps.map((e) => ({ value: e.id, label: e.name })),
          ]}
        />
        <FilterSelect
          label="Stage"
          value={fStage}
          onChange={(v) => setFStage(v as typeof fStage)}
          options={[
            { value: "all", label: "All stages" },
            { value: "active", label: "Active" },
            ...TERMINAL_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] })),
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState>No sessions match these filters.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Session</th>
                <th className="px-4 py-2.5 text-left font-medium">Contact</th>
                <th className="px-4 py-2.5 text-left font-medium">Handled by</th>
                <th className="px-4 py-2.5 text-left font-medium">Stage</th>
                <th className="px-4 py-2.5 text-right font-medium">Turns</th>
                <th className="px-4 py-2.5 text-right font-medium">Duration</th>
                <th className="px-4 py-2.5 text-right font-medium">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.slice(0, 200).map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setOpen(s)}
                  className="cursor-pointer transition-colors hover:bg-accent/30"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {s.channel === "voice" ? (
                        <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="font-mono text-[11.5px]">{s.id}</span>
                      {s.referral && (
                        <span
                          title={`Click-to-WhatsApp · ${s.referral.adName}`}
                          className="rounded border border-ai/30 bg-ai/10 px-1 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-ai"
                        >
                          CTWA
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-[12.5px]">{s.contact.name}</p>
                    <p className="font-mono text-[10.5px] text-muted-foreground">
                      {s.contact.phone}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11.5px] text-muted-foreground">
                    {agentName(s.agentId) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StageTag stage={s.stage} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[12px]">
                    {s.turnCount || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[12px] text-muted-foreground">
                    {fmtDuration(s.durationMs)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[11.5px] text-muted-foreground">
                    {fmtTime(s.startedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 200 && (
            <div className="border-t border-border bg-secondary/20 px-4 py-2 text-center text-[11px] text-muted-foreground">
              Showing 200 of {rows.length.toLocaleString()} sessions
            </div>
          )}
        </div>
      )}

      <SessionSheet session={open} onClose={() => setOpen(null)} />
    </>
  );
}

// ── Shared ──────────────────────────────────────────────────────────────────

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export function FilterSelect({
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
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
