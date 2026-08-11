import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "@/components/analytics/EChart";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  MessagesSquare,
  CheckCircle2,
  Clock,
  Repeat,
  Target,
  TimerOff,
  Search,
  Sparkles,
  X,
  Download,
  ChevronRight,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import {
  generateLeads,
  downloadCsv,
  type LeadStatus,
} from "@/lib/analytics-leads";
import type { RunRow, SankeyNode } from "@/lib/analytics-data";
import { resolveAgent } from "@/lib/agent-data";

/**
 * Chat-session disposition taxonomy. In production these labels come from the
 * selected Chat Agent's closing-analysis schema (the AI Chat Node writes a
 * `disposition` per engagement window); here they are illustrative but stable.
 */
const DISPOSITIONS = [
  "Interested",
  "Resolved",
  "Needs follow-up",
  "Not interested",
  "Escalated",
  "No response",
] as const;
type Disposition = (typeof DISPOSITIONS)[number];

/** Dispositions that count toward the resolution rate KPI. */
const RESOLVED_SET = new Set<Disposition>(["Interested", "Resolved"]);

/**
 * Why an engagement window closed. Mirrors the AI Chat Node V2 closureReason:
 * the agent explicitly closed the thread, the customer went idle past the
 * timeout, or a relay/delivery error tore the session down.
 */
type ClosureReason = "agent_closed" | "idle_timeout" | "relay_error";
const CLOSURE_LABEL: Record<ClosureReason, string> = {
  agent_closed: "Agent closed",
  idle_timeout: "Idle timeout",
  relay_error: "Relay error",
};

/**
 * Engagement-window lifecycle. `active` is a live thread; `success` and `failed`
 * are the two terminal (closed) states the closing signal resolves to.
 */
type ChatStatus = "Active" | "Success" | "Failed";
const STATUS_TONE: Record<ChatStatus, string> = {
  Active: "border-sky-500/30 bg-sky-500/10 text-sky-600",
  Success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  Failed: "border-destructive/30 bg-destructive/10 text-destructive",
};

const DISPOSITION_TONE: Record<Disposition, string> = {
  Interested: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  Resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  "Needs follow-up": "border-amber-500/30 bg-amber-500/10 text-amber-600",
  "Not interested": "border-border bg-secondary text-muted-foreground",
  Escalated: "border-violet-500/30 bg-violet-500/10 text-violet-600",
  "No response": "border-border bg-secondary text-muted-foreground",
};

function seed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967295;
  };
}

type Chat = {
  id: string;
  phone: string;
  customer: string;
  startedAt: string;
  updatedAt: string;
  turns: number;
  duration: number | null; // seconds; null while active
  status: ChatStatus;
  disposition: Disposition | null;
  closureReason: ClosureReason | null;
  agentId?: string;
};

type ChatRef = { run: RunRow; node: SankeyNode };

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m || 1) - 1]} ${y}`;
}
function clock(r: () => number, fromHour = 9, span = 11): string {
  const h = fromHour + Math.floor(r() * span);
  const mm = String(Math.floor(r() * 59)).padStart(2, "0");
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h > 12 ? h - 12 : h || 12;
  return `${h12}:${mm} ${ap}`;
}

function toChatStatus(s: LeadStatus | undefined): ChatStatus {
  switch (s) {
    case "pending":
    case "running":
      return "Active";
    case "failed":
      return "Failed";
    case "completed":
      return "Success";
    default:
      return "Success";
  }
}

function pickDisposition(success: boolean, r: () => number): Disposition {
  if (success) {
    const x = r();
    if (x < 0.36) return "Interested";
    if (x < 0.64) return "Resolved";
    if (x < 0.84) return "Needs follow-up";
    return "Not interested";
  }
  const x = r();
  if (x < 0.5) return "No response";
  if (x < 0.76) return "Escalated";
  return "Not interested";
}

function buildChats({ run, node }: ChatRef): Chat[] {
  const agent = resolveAgent(node.config?.chatAgent);
  const leads = generateLeads(run).filter((l) => l.stageNodeId === node.id);
  const r = seed("chat" + node.id + run.id);
  return leads.slice(0, 80).map((l) => {
    const status = toChatStatus(l.status);
    const closed = status !== "Active";
    const success = status === "Success";
    const turns = 2 + Math.floor(r() * 11); // 2–12 turns
    const disposition = closed ? pickDisposition(success, r) : null;
    let closureReason: ClosureReason | null = null;
    if (success) closureReason = "agent_closed";
    else if (status === "Failed")
      closureReason = r() < 0.72 ? "idle_timeout" : "relay_error";
    return {
      id: l.id,
      phone: l.phone,
      customer: l.name,
      startedAt: `${fmtDate(l.updatedDate)}, ${clock(r)}`,
      updatedAt: `${fmtDate(l.updatedDate)}, ${clock(r)}`,
      turns,
      duration: closed ? (l.duration ?? 45 + Math.floor(r() * 420)) : null,
      status,
      disposition,
      closureReason,
      agentId: agent?.id,
    };
  });
}

// Restrained, theme-aligned chart palette (resolved from CSS tokens at runtime)
const CHART = {
  primary: "oklch(0.22 0.02 260)",
  accent: "oklch(0.55 0.03 260)",
  positive: "oklch(0.62 0.12 160)",
  negative: "oklch(0.62 0.22 27)",
};

export function WhatsAppChatAgentView({
  refs,
  agentName,
}: {
  refs: ChatRef[];
  agentName: string;
}) {
  // KPIs and charts aggregate across ALL selected refs; the chats table shows
  // the latest selected run only (with a banner when more runs are aggregated).
  const allChats = useMemo(() => refs.flatMap(buildChats), [refs]);

  // Sessions started = every engagement window opened into the node's base.
  const started = refs.reduce((s, { node }) => s + node.entered, 0);
  const sample = allChats.length || 1;
  const closedChats = allChats.filter((c) => c.status !== "Active");
  const closedSample = closedChats.length;
  // Scale the big "closed" number off the sample's closed-fraction so the KPI
  // and the per-day chart agree with the disposition mix below.
  const closed = Math.round(started * (closedSample / sample));

  const avgTurns = allChats.length
    ? allChats.reduce((s, c) => s + c.turns, 0) / allChats.length
    : 0;
  const durChats = closedChats.filter((c) => c.duration != null);
  const avgDuration = durChats.length
    ? Math.round(
        durChats.reduce((s, c) => s + (c.duration ?? 0), 0) / durChats.length,
      )
    : 0;

  const resolvedSample = closedChats.filter(
    (c) => c.disposition && RESOLVED_SET.has(c.disposition),
  ).length;
  const resolutionRate = closedSample ? resolvedSample / closedSample : 0;
  const timeoutSample = allChats.filter(
    (c) => c.closureReason === "idle_timeout",
  ).length;
  const timeoutRate = timeoutSample / sample;

  // Disposition distribution across closed sessions, scaled to the closed total
  // so the bars read as absolute session counts rather than sample counts.
  const dispositionCounts = useMemo(() => {
    const counts = DISPOSITIONS.map((name) => ({
      name,
      count: closedChats.filter((c) => c.disposition === name).length,
    }));
    const total = counts.reduce((s, c) => s + c.count, 0) || 1;
    const scale = closed / total;
    return counts
      .map((c) => ({ name: c.name, count: Math.round(c.count * scale) }))
      .sort((a, b) => b.count - a.count);
  }, [closedChats, closed]);

  return (
    <div className="space-y-6">
      {/* KPI overview — the dashboard header */}
      <Section
        title="Chat agent overview"
        sub={`${agentName} · sessions, outcomes and shape across the selected range.`}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi
            icon={MessageSquare}
            label="Sessions started"
            value={started.toLocaleString()}
            sub="engagement windows opened"
            tone="slate"
          />
          <Kpi
            icon={CheckCircle2}
            label="Sessions closed"
            value={closed.toLocaleString()}
            sub={`${pct(closed, started)} of started`}
            tone="emerald"
          />
          <Kpi
            icon={Clock}
            label="Avg session duration"
            value={fmtDurLong(avgDuration)}
            sub="across closed sessions"
            tone="indigo"
          />
          <Kpi
            icon={Repeat}
            label="Avg turns / session"
            value={avgTurns ? avgTurns.toFixed(1) : "—"}
            sub="messages exchanged per thread"
            tone="sky"
          />
          <Kpi
            icon={Target}
            label="Resolution rate"
            value={`${(resolutionRate * 100).toFixed(0)}%`}
            sub="interested + resolved"
            tone="violet"
          />
          <Kpi
            icon={TimerOff}
            label="Timeout rate"
            value={`${(timeoutRate * 100).toFixed(0)}%`}
            sub="closed on idle timeout"
            tone="rose"
          />
        </div>
      </Section>

      {/* Trend + disposition */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card
          title="Sessions started vs closed"
          sub="Per day across the selected range."
        >
          <div className="h-[300px]">
            <EChart
              option={sessionsTrendOption(
                refs.map((r) => r.node.id).join("|"),
                started,
                closed,
              )}
            />
          </div>
        </Card>
        <Card
          title="Disposition breakdown"
          sub="Outcomes across closed sessions."
        >
          <div className="h-[300px]">
            <EChart option={dispositionBarOption(dispositionCounts)} />
          </div>
        </Card>
      </div>

      {/* Chats table */}
      <ChatsTable refs={refs} />
    </div>
  );
}

function pct(n: number, base: number): string {
  return base > 0 ? `${((n / base) * 100).toFixed(0)}%` : "—";
}

/* ───────── building blocks ───────── */

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-primary" />
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

const TONES: Record<string, string> = {
  slate: "bg-secondary text-muted-foreground",
  indigo: "bg-secondary text-foreground",
  sky: "bg-secondary text-foreground",
  emerald: "bg-secondary text-foreground",
  rose: "bg-destructive/10 text-destructive",
  violet: "bg-secondary text-foreground",
};

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            TONES[tone],
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Card({
  title,
  sub,
  children,
  action,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between border-b border-border px-4 py-3">
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

/* ───────── charts ───────── */

function sessionsTrendOption(
  seedId: string,
  started: number,
  closed: number,
): EChartsOption {
  const r = seed("trend" + seedId);
  const dates = Array.from({ length: 14 }, (_, i) => `${11 + i} Jul`);
  // Started climbs steadily; closed tracks a touch below (a live tail stays open).
  const startedSeries = dates.map((_, i) => {
    const t = i / (dates.length - 1);
    const base = (started / dates.length) * (0.7 + t * 0.7);
    return Math.round(base + r() * (started / dates.length) * 0.14);
  });
  const closeRatio = started > 0 ? closed / started : 0.95;
  const closedSeries = startedSeries.map((v) =>
    Math.round(v * closeRatio * (0.94 + r() * 0.05)),
  );
  return {
    backgroundColor: "transparent",
    legend: {
      right: 8,
      top: 6,
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { fontSize: 11, color: "oklch(0.52 0.015 260)" },
    },
    grid: { left: 44, right: 16, top: 36, bottom: 28 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: dates,
      axisLabel: { fontSize: 10, color: "oklch(0.52 0.015 260)" },
      boundaryGap: false,
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "oklch(0.92 0.006 260)" } },
      axisLabel: { fontSize: 10, color: "oklch(0.52 0.015 260)" },
    },
    series: [
      {
        name: "Sessions started",
        type: "line",
        smooth: true,
        symbol: "none",
        color: CHART.primary,
        data: startedSeries,
        lineStyle: { color: CHART.primary, width: 2 },
      },
      {
        name: "Sessions closed",
        type: "line",
        smooth: true,
        symbol: "none",
        color: CHART.positive,
        data: closedSeries,
        lineStyle: { color: CHART.positive, width: 2 },
      },
    ],
  };
}

function dispositionBarOption(
  items: { name: string; count: number }[],
): EChartsOption {
  // Horizontal bars, largest at the top (ECharts yAxis category renders bottom-up,
  // so reverse the ascending order into the axis).
  const ordered = [...items].sort((a, b) => a.count - b.count);
  const max = ordered.length - 1;
  return {
    backgroundColor: "transparent",
    grid: { left: 110, right: 24, top: 12, bottom: 24 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: {
      type: "value",
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "oklch(0.92 0.006 260)" } },
      axisLabel: { fontSize: 10, color: "oklch(0.52 0.015 260)" },
    },
    yAxis: {
      type: "category",
      data: ordered.map((i) => i.name),
      axisTick: { show: false },
      axisLabel: { fontSize: 11, color: "oklch(0.42 0.015 260)" },
    },
    series: [
      {
        type: "bar",
        barWidth: 16,
        label: {
          show: true,
          position: "right",
          fontSize: 10,
          color: "oklch(0.52 0.015 260)",
          formatter: "{c}",
        },
        data: ordered.map((i, idx) => ({
          value: i.count,
          itemStyle: {
            color: CHART.primary,
            opacity: 0.45 + (idx / Math.max(max, 1)) * 0.55,
            borderRadius: [0, 3, 3, 0],
          },
        })),
      },
    ],
  };
}

/* ───────── chats table ───────── */

const TURN_FILTERS: {
  value: string;
  label: string;
  lo: number;
  hi: number;
}[] = [
  { value: "1-2", label: "1–2 turns", lo: 1, hi: 3 },
  { value: "3-5", label: "3–5 turns", lo: 3, hi: 6 },
  { value: "6-10", label: "6–10 turns", lo: 6, hi: 11 },
  { value: "10+", label: "10+ turns", lo: 11, hi: Infinity },
];

function chatsToCsv(chats: Chat[]): string {
  const head = [
    "started_at",
    "phone",
    "customer",
    "turns",
    "duration_sec",
    "status",
    "disposition",
    "closure_reason",
    "updated_at",
  ];
  const rows = chats.map((c) => [
    c.startedAt,
    c.phone,
    c.customer,
    c.turns,
    c.duration ?? "",
    c.status,
    c.disposition ?? "",
    c.closureReason ? CLOSURE_LABEL[c.closureReason] : "",
    c.updatedAt,
  ]);
  return [head, ...rows]
    .map((r) =>
      r
        .map((v) => {
          const s = String(v ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

/** The attribute the second dropdown draws its options from. */
const ATTR_FILTERS = [
  { value: "disposition", label: "Disposition", options: DISPOSITIONS as readonly string[] },
  { value: "status", label: "Status", options: ["Active", "Success", "Failed"] as readonly string[] },
  { value: "closure", label: "Closure Reason", options: ["Agent closed", "Idle timeout", "Relay error"] as readonly string[] },
] as const;
type AttrKey = (typeof ATTR_FILTERS)[number]["value"];

function ChatsTable({ refs }: { refs: ChatRef[] }) {
  const [q, setQ] = useState("");
  const [turnF, setTurnF] = useState("any");
  const [open, setOpen] = useState<Chat | null>(null);

  const [attr, setAttr] = useState<AttrKey | "none">("none");
  const [attrVal, setAttrVal] = useState("any");
  const attrMeta = ATTR_FILTERS.find((f) => f.value === attr) ?? null;

  // Chats table shows the latest selected run only; a banner notes the rest.
  const tableRunId = refs[0]?.run.id;
  const tableRefs = useMemo(
    () => refs.filter((r) => r.run.id === tableRunId),
    [refs, tableRunId],
  );
  const tableRun = refs[0]?.run;
  const runCount = useMemo(
    () => new Set(refs.map((r) => r.run.id)).size,
    [refs],
  );
  const chats = useMemo(
    () => tableRefs.flatMap((ref) => buildChats(ref)),
    [tableRefs],
  );

  const filtered = useMemo(
    () =>
      chats.filter((c) => {
        if (q && !c.phone.includes(q)) return false;
        if (turnF !== "any") {
          const f = TURN_FILTERS.find((x) => x.value === turnF)!;
          if (!(c.turns >= f.lo && c.turns < f.hi)) return false;
        }
        if (attr !== "none" && attrVal !== "any") {
          const actual =
            attr === "disposition"
              ? c.disposition
              : attr === "status"
                ? c.status
                : c.closureReason
                  ? CLOSURE_LABEL[c.closureReason]
                  : null;
          if (actual !== attrVal) return false;
        }
        return true;
      }),
    [chats, q, turnF, attr, attrVal],
  );

  const exportCsv = (scope: "all" | "success" | "failed") => {
    const rows =
      scope === "all"
        ? chats
        : chats.filter((c) => c.status.toLowerCase() === scope);
    downloadCsv(`chat-sessions-${scope}.csv`, chatsToCsv(rows));
  };

  return (
    <Section
      title="Chats"
      sub="Every chat session in scope. Open a closed session for its transcript and outcome."
    >
      {runCount > 1 && tableRun && (
        <p className="text-[11px] text-muted-foreground">
          Showing chats from {tableRun.startedAt}. {runCount - 1} other run
          {runCount - 1 === 1 ? "" : "s"} are aggregated in the KPIs and charts
          above.
        </p>
      )}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by phone number…"
              className="h-8 w-[260px] pl-7 text-xs"
            />
          </div>
          <Select value={turnF} onValueChange={setTurnF}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Any turns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any turns</SelectItem>
              {TURN_FILTERS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Attribute filter — picking a new attribute clears the stale value. */}
          <Select
            value={attr}
            onValueChange={(v) => {
              setAttr(v as AttrKey | "none");
              setAttrVal("any");
            }}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Select Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select Filter</SelectItem>
              {ATTR_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={attrVal} onValueChange={setAttrVal} disabled={!attrMeta}>
            <SelectTrigger
              className="h-8 w-[190px] text-xs disabled:opacity-50"
              title={attrMeta ? undefined : "Pick a filter first"}
            >
              <SelectValue placeholder="Select Values" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">
                {attrMeta ? `All ${attrMeta.label}` : "Select Values"}
              </SelectItem>
              {attrMeta?.options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-8 gap-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportCsv("all")}>
                All chats
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCsv("success")}>
                Success only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCsv("failed")}>
                Failed only
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
          Showing 1–{Math.min(filtered.length, 50)} of{" "}
          {chats.length.toLocaleString()} chats
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium">Started At</th>
                <th className="px-4 py-2 text-left font-medium">Phone</th>
                <th className="px-4 py-2 text-right font-medium">Turns</th>
                <th className="px-4 py-2 text-right font-medium">Duration</th>
                <th className="px-4 py-2 text-left font-medium">Disposition</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.slice(0, 50).map((c) => {
                const clickable = c.status !== "Active";
                return (
                  <tr
                    key={c.id}
                    className={cn(
                      clickable
                        ? "cursor-pointer hover:bg-secondary/40"
                        : "cursor-default",
                    )}
                    onClick={clickable ? () => setOpen(c) : undefined}
                  >
                    <td className="px-4 py-2.5 text-[12.5px] tabular-nums">
                      {c.startedAt}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px]">
                      {c.phone}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px]">
                      {c.turns}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px]">
                      {c.duration != null ? fmtDurLong(c.duration) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {c.disposition ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10.5px]",
                            DISPOSITION_TONE[c.disposition],
                          )}
                        >
                          {c.disposition}
                        </Badge>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn("text-[10.5px]", STATUS_TONE[c.status])}
                      >
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {clickable ? (
                        <ChevronRight className="ml-auto h-4 w-4" />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ChatDrawer chat={open} onClose={() => setOpen(null)} />
    </Section>
  );
}

/* ───────── chat detail drawer (closed sessions) ───────── */

function ChatDrawer({
  chat,
  onClose,
}: {
  chat: Chat | null;
  onClose: () => void;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const agent = chat?.agentId ? resolveAgent(chat.agentId) : undefined;

  const turns = useMemo(() => {
    if (!chat) return [];
    const first = chat.customer.split(" ")[0];
    const lines: [string, string][] = [
      [
        "agent",
        `Hi ${first}! It's been a while since your last order with us. Can I help you reorder your usual, or is there something else you're looking for today?`,
      ],
      ["customer", "Maybe. What offers do you have right now?"],
      [
        "agent",
        "Great timing — there's 20% off your favourite category this week, plus free delivery over ₹499.",
      ],
      ["customer", "Okay, I had trouble at checkout last time though."],
      [
        "agent",
        "Sorry about that! I can share a one-tap checkout link so it goes through cleanly. Want me to send it?",
      ],
      ["customer", "Yes please, send it across."],
      [
        "agent",
        "Done ✅ — link is on its way. Anything else I can help with before I close this out?",
      ],
      ["customer", "No that's all, thanks!"],
    ];
    const r = seed(chat.id);
    let t = 0;
    return lines.map(([role, text]) => {
      const at = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      t += 8 + Math.floor(r() * 20);
      return { role, text, at };
    });
  }, [chat]);

  const insights = useMemo(() => {
    if (!chat) return [] as { label: string; value: string }[];
    return [
      { label: "Disposition", value: chat.disposition ?? "—" },
      {
        label: "Closure reason",
        value: chat.closureReason ? CLOSURE_LABEL[chat.closureReason] : "—",
      },
      { label: "Turns", value: String(chat.turns) },
      {
        label: "Duration",
        value: chat.duration != null ? fmtDurLong(chat.duration) : "—",
      },
    ];
  }, [chat]);

  return (
    <Sheet
      open={!!chat}
      onOpenChange={(v) => {
        if (!v) {
          setShowTranscript(false);
          onClose();
        }
      }}
    >
      <SheetContent className="w-[560px] overflow-y-auto sm:max-w-[560px]">
        {chat && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground">
                  <MessagesSquare className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold tabular-nums">
                      {chat.phone}
                    </h3>
                    <span className="text-[12px] text-muted-foreground">
                      · {chat.customer}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn("text-[10.5px]", STATUS_TONE[chat.status])}
                    >
                      {chat.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {chat.startedAt}
                    {chat.duration != null
                      ? ` · ${fmtDurLong(chat.duration)}`
                      : ""}
                    {` · ${chat.turns} turns`}
                    {agent ? ` · ${agent.name}` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* AI Summary */}
            <div className="mt-5 rounded-xl border border-border bg-secondary/50 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-foreground">
                <Sparkles className="h-3 w-3" /> AI Summary
              </div>
              <p className="text-[12.5px] leading-relaxed text-foreground">
                {chat.customer.split(" ")[0]} re-engaged over WhatsApp, asked
                about current offers and flagged a past checkout issue. The agent
                surfaced the category discount and shared a one-tap checkout
                link, then closed the thread.{" "}
                {chat.disposition
                  ? `Resolved as “${chat.disposition}”.`
                  : ""}
              </p>
            </div>

            {/* Outcome insights */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Outcome
                </h4>
                {agent && (
                  <span className="text-[11px] text-muted-foreground">
                    {agent.name}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {insights.map((it) => (
                  <div
                    key={it.label}
                    className="rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {it.label}
                    </p>
                    <p className="mt-0.5 text-[13px] font-medium">{it.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Transcript — collapsible chat bubbles */}
            <div className="mt-4">
              <button
                onClick={() => setShowTranscript((v) => !v)}
                className="mb-2 flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left hover:bg-secondary/40"
              >
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Transcript
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {showTranscript ? "Click to collapse" : "Expand to load"}
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      showTranscript && "rotate-180",
                    )}
                  />
                </span>
              </button>
              {showTranscript && (
                <div className="space-y-2">
                  {turns.map((t, i) => {
                    const agentSide = t.role === "agent";
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex",
                          agentSide ? "justify-end" : "justify-start",
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[80%] rounded-2xl px-3 py-2",
                            agentSide
                              ? "rounded-br-sm bg-primary/10"
                              : "rounded-bl-sm bg-secondary",
                          )}
                        >
                          <div className="mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                            <span>{agentSide ? "Agent" : "Customer"}</span>
                            <span className="font-mono">{t.at}</span>
                          </div>
                          <p className="text-[13px] leading-relaxed">
                            {t.text}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function fmtDurLong(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${String(sec).padStart(2, "0")}s` : `${sec}s`;
}
