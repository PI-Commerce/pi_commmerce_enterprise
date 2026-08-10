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
  PhoneIncoming,
  PhoneOff,
  Users,
  Activity,
  CheckCircle2,
  Clock,
  TrendingUp,
  Search,
  Sparkles,
  X,
  Play,
  Volume2,
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
import { resolveAgent, type AgentRecord } from "@/lib/agent-data";

/**
 * App-engagement intent taxonomy. Illustrative only — the real intent labels are
 * defined by the selected Voice Agent's post-call analysis schema and therefore
 * vary per agent (which is why intent widgets gate to a single agent in scope).
 */
const INTENTS = [
  "Not Interested",
  "Interested & Ready",
  "Faced Technical Issue",
  "Using a Different App",
  "Don't Know How to Use",
  "No Credit Card Added",
  "Charges are High",
  "Forgot About App",
];

/**
 * Post-call sentiment, as scored by the agent's post-call analysis. Unlike the
 * intent taxonomy this is a fixed three-point scale across every agent, so it is
 * safe to filter on regardless of how many agents are in scope.
 */
const SENTIMENTS = ["Positive", "Neutral", "Negative"] as const;
type Sentiment = (typeof SENTIMENTS)[number];

/**
 * Sentiment correlates with intent rather than being drawn independently — a
 * caller who is "Interested & Ready" reading as Negative would undermine the
 * demo. Intents not listed here fall back to a seeded pick.
 */
const INTENT_SENTIMENT: Record<string, Sentiment> = {
  "Interested & Ready": "Positive",
  "Not Interested": "Negative",
  "Charges are High": "Negative",
  "Faced Technical Issue": "Negative",
  "Using a Different App": "Neutral",
  "Don't Know How to Use": "Neutral",
  "No Credit Card Added": "Neutral",
  "Forgot About App": "Neutral",
};

/** Voice call lifecycle — tech keeps four states; only Completed is terminal-success. */
type VoiceStatus = "Pending" | "Running" | "Completed" | "Failed";
const STATUS_TONE: Record<VoiceStatus, string> = {
  Pending: "border-border bg-secondary text-muted-foreground",
  Running: "border-sky-500/30 bg-sky-500/10 text-sky-600",
  Completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  Failed: "border-destructive/30 bg-destructive/10 text-destructive",
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

type Call = {
  id: string;
  phone: string;
  customer: string;
  scheduledAt: string;
  updatedAt: string;
  duration: number | null;
  status: VoiceStatus;
  intent: string | null;
  sentiment: Sentiment | null;
  agentId?: string;
};

type VoiceRef = { run: RunRow; node: SankeyNode };

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m || 1) - 1]} ${y}`;
}
function clock(r: () => number, fromHour = 9, span = 9): string {
  const h = fromHour + Math.floor(r() * span);
  const mm = String(Math.floor(r() * 59)).padStart(2, "0");
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h > 12 ? h - 12 : h || 12;
  return `${h12}:${mm} ${ap}`;
}

const VOICE_STATES: VoiceStatus[] = [
  "Pending",
  "Running",
  "Completed",
  "Failed",
];
function toVoiceStatus(s: LeadStatus | undefined): VoiceStatus {
  switch (s) {
    case "pending":
      return "Pending";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "completed":
      return "Completed";
    default:
      return "Completed";
  }
}

function buildCalls({ run, node }: VoiceRef): Call[] {
  const agent = resolveAgent(node.config?.agent);
  const leads = generateLeads(run).filter((l) => l.stageNodeId === node.id);
  const r = seed(node.id + run.id);
  return leads.slice(0, 80).map((l) => {
    const status = VOICE_STATES.includes(toVoiceStatus(l.status))
      ? toVoiceStatus(l.status)
      : "Completed";
    const completed = status === "Completed";
    const sched = clock(r);
    const intent = completed ? INTENTS[Math.floor(r() * INTENTS.length)] : null;
    return {
      id: l.id,
      phone: l.phone,
      customer: l.name,
      scheduledAt: `${fmtDate(l.updatedDate)}, ${sched}`,
      updatedAt: `${fmtDate(l.updatedDate)}, ${clock(r)}`,
      duration: completed ? (l.duration ?? 30 + Math.floor(r() * 200)) : null,
      status,
      intent,
      sentiment: intent
        ? (INTENT_SENTIMENT[intent] ??
          SENTIMENTS[Math.floor(r() * SENTIMENTS.length)])
        : null,
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

export function VoiceChannelView({
  refs,
  agentExplicitlyOne,
}: {
  refs: VoiceRef[];
  /** True only when the user has explicitly narrowed the Voice Agent filter to
   *  exactly one agent. Default scope ("All Voice Agents") and multi-select both
   *  evaluate to false — intent widgets stay in the guidance empty state because
   *  the intent taxonomy is agent-defined and unioning across agents is
   *  meaningless. */
  agentExplicitlyOne: boolean;
}) {
  // KPIs and charts aggregate across ALL selected refs; the calls table shows the
  // latest selected run only (with a banner when more runs are aggregated above).
  const allCalls = useMemo(
    () => refs.flatMap((ref) => buildCalls(ref)),
    [refs],
  );

  // Total Base keeps accruing incoming leads into the node's base; it is the
  // identity Pending + Running + Completed + Failed.
  const totalBase = refs.reduce((s, { node }) => s + node.entered, 0);
  const pending = Math.round(totalBase * 0.06);
  const running = Math.round(totalBase * 0.08);
  const failed = Math.round(totalBase * 0.14);
  const completed = Math.max(0, totalBase - pending - running - failed);

  const completedCalls = allCalls.filter((c) => c.status === "Completed");
  const avgDuration = completedCalls.length
    ? Math.round(
        completedCalls.reduce((s, c) => s + (c.duration ?? 0), 0) /
          completedCalls.length,
      )
    : 0;

  // Intent taxonomy is agent-defined, so intent widgets populate ONLY when the
  // user has explicitly picked exactly one Voice Agent (agentExplicitlyOne).
  // Default scope ("All Voice Agents") and multi-select agent → guidance empty
  // state, even if the resolved scope happens to contain a single agent, since
  // the user has not committed to which agent's intent taxonomy to read.
  const agents = useMemo(() => {
    const m = new Map<string, AgentRecord>();
    for (const { node } of refs) {
      const a = resolveAgent(node.config?.agent);
      if (a) m.set(a.id, a);
    }
    return [...m.values()];
  }, [refs]);
  const singleAgent = agentExplicitlyOne && agents.length === 1 ? agents[0] : null;

  const intentCounts = useMemo(() => {
    const counts = INTENTS.map((name) => ({
      name,
      count: completedCalls.filter((c) => c.intent === name).length,
    }));
    // Keep the bars non-empty for the demo even on small samples.
    const total = counts.reduce((s, c) => s + c.count, 0);
    if (total === 0) {
      const r = seed("intent" + refs.map((x) => x.node.id).join());
      counts.forEach((c) => (c.count = 40 + Math.floor(r() * 180)));
    }
    return counts.sort((a, b) => b.count - a.count);
  }, [completedCalls, refs]);
  const topIntent = intentCounts[0];
  const topIntentTotal = intentCounts.reduce((s, c) => s + c.count, 0) || 1;

  return (
    <div className="space-y-6">
      {/* Performance overview */}
      <Section
        title="Performance overview"
        sub="Live status of every call in the base — pending, running, completed and failed."
      >
        <div className="grid grid-cols-4 gap-3">
          <PerfKpi
            icon={Users}
            label="Total Base"
            value={totalBase.toLocaleString()}
            sub="leads in the call base"
            tone="slate"
          />
          <PerfKpi
            icon={Activity}
            label="Running"
            value={running.toLocaleString()}
            sub={`${pct(running, totalBase)} in flight now`}
            tone="sky"
          />
          <PerfKpi
            icon={CheckCircle2}
            label="Completed"
            value={completed.toLocaleString()}
            sub={`${pct(completed, totalBase)} of base`}
            tone="emerald"
          />
          <PerfKpi
            icon={PhoneOff}
            label="Failed"
            value={failed.toLocaleString()}
            sub={`${pct(failed, totalBase)} of base`}
            tone="rose"
          />
        </div>
        <DailyBreakdown
          seedId={refs.map((r) => r.node.id).join("|")}
          completed={completed}
          failed={failed}
        />
      </Section>

      {/* Conversation insights */}
      <Section
        title="Conversation insights"
        sub="What customers said on completed calls — intents and call shape."
      >
        <div className="grid grid-cols-2 gap-3">
          <InsightKpi
            icon={Clock}
            label="Avg Call Duration"
            value={fmtDur(avgDuration)}
            sub="across completed calls"
            tone="indigo"
          />
          {singleAgent ? (
            <InsightKpi
              icon={TrendingUp}
              label="Top Intent"
              value={topIntent.name}
              sub={`${topIntent.count.toLocaleString()} · ${((topIntent.count / topIntentTotal) * 100).toFixed(1)}%`}
              tone="violet"
              big
            />
          ) : (
            <InsightGuard
              label="Top Intent"
              hint="Select a single Voice Agent to see intent"
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Card
            title="Intent distribution"
            sub="Top intents across completed calls."
          >
            {singleAgent ? (
              <div className="h-[260px]">
                <EChart option={intentBarOption(intentCounts)} />
              </div>
            ) : (
              <ChartGuard hint="Intent labels are defined per Voice Agent. Pick a single Voice Agent from the filter to see the breakdown." />
            )}
          </Card>
          <Card
            title="Call duration distribution"
            sub="Across completed calls."
          >
            <div className="h-[260px]">
              <EChart option={durationBarOption(completedCalls)} />
            </div>
          </Card>
        </div>
      </Section>

      {/* Calls table */}
      <CallsTable refs={refs} />
    </div>
  );
}

function pct(n: number, base: number): string {
  return base > 0 ? `${((n / base) * 100).toFixed(1)}%` : "—";
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

function PerfKpi({
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

function InsightKpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  big,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tone: string;
  big?: boolean;
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
      <p
        className={cn(
          "mt-2 font-semibold tracking-tight tabular-nums",
          big ? "text-xl" : "text-3xl",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function InsightGuard({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-4">
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-[12px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function ChartGuard({ hint }: { hint: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center px-8 text-center text-[12px] text-muted-foreground">
      {hint}
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

function DailyBreakdown({
  seedId,
  completed,
  failed,
}: {
  seedId: string;
  completed: number;
  failed: number;
}) {
  const opt = useMemo<EChartsOption>(() => {
    const r = seed(seedId);
    const dates = Array.from({ length: 30 }, (_, i) => `${i + 1} Apr`);
    const ramp = (peak: number) =>
      dates.map((_, i) => {
        const t = i / 29;
        const base =
          t < 0.7
            ? r() * peak * 0.08
            : peak * (0.15 + Math.pow((t - 0.7) / 0.3, 2.4));
        return Math.round(base + r() * peak * 0.05);
      });
    return {
      backgroundColor: "transparent",
      legend: {
        right: 8,
        top: 6,
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { fontSize: 11, color: "oklch(0.52 0.015 260)" },
      },
      grid: { left: 40, right: 16, top: 36, bottom: 28 },
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
          name: "Completed",
          type: "line",
          smooth: true,
          symbol: "none",
          color: CHART.positive,
          data: ramp(Math.max(completed / 24, 40)),
          lineStyle: { color: CHART.positive, width: 2 },
        },
        {
          name: "Failed",
          type: "line",
          smooth: true,
          symbol: "none",
          color: CHART.negative,
          data: ramp(Math.max(failed / 24, 8)),
          lineStyle: { color: CHART.negative, width: 2 },
        },
      ],
    };
  }, [seedId, completed, failed]);
  return (
    <Card
      title="Daily breakdown"
      sub="Completed and failed calls per day across the selected range."
    >
      <div className="h-[280px]">
        <EChart option={opt} />
      </div>
    </Card>
  );
}

function intentBarOption(
  items: { name: string; count: number }[],
): EChartsOption {
  const max = items.length - 1;
  return {
    backgroundColor: "transparent",
    grid: { left: 36, right: 8, top: 16, bottom: 110 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: {
      type: "category",
      data: items.map((i) => i.name),
      axisLabel: {
        rotate: 40,
        fontSize: 10,
        interval: 0,
        color: "oklch(0.52 0.015 260)",
      },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "oklch(0.92 0.006 260)" } },
      axisLabel: { fontSize: 10, color: "oklch(0.52 0.015 260)" },
    },
    series: [
      {
        type: "bar",
        barWidth: 18,
        data: items.map((i, idx) => ({
          value: i.count,
          itemStyle: {
            color: CHART.primary,
            opacity: 1 - (idx / Math.max(max, 1)) * 0.7,
            borderRadius: [3, 3, 0, 0],
          },
        })),
      },
    ],
  };
}

function durationBarOption(completed: Call[]): EChartsOption {
  const buckets = [
    { label: "0–30s", test: (d: number) => d < 30 },
    { label: "30s–1m", test: (d: number) => d >= 30 && d < 60 },
    { label: "1–2m", test: (d: number) => d >= 60 && d < 120 },
    { label: "2–5m", test: (d: number) => d >= 120 && d < 300 },
  ];
  const data = buckets.map(
    (b) => completed.filter((c) => b.test(c.duration ?? 0)).length,
  );
  return {
    backgroundColor: "transparent",
    grid: { left: 36, right: 8, top: 16, bottom: 36 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: {
      type: "category",
      data: buckets.map((b) => b.label),
      axisLabel: { fontSize: 11, color: "oklch(0.52 0.015 260)" },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "oklch(0.92 0.006 260)" } },
      axisLabel: { fontSize: 10, color: "oklch(0.52 0.015 260)" },
    },
    series: [
      {
        type: "bar",
        barWidth: 44,
        data,
        itemStyle: {
          color: CHART.primary,
          opacity: 0.85,
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
  };
}

/* ───────── calls table ───────── */

const DURATION_FILTERS: {
  value: string;
  label: string;
  lo: number;
  hi: number;
}[] = [
  { value: "lt30", label: "< 30s", lo: 0, hi: 30 },
  { value: "30-60", label: "30s – 1m", lo: 30, hi: 60 },
  { value: "60-180", label: "1m – 3m", lo: 60, hi: 180 },
  { value: "180-300", label: "3m – 5m", lo: 180, hi: 300 },
  { value: "300-600", label: "5m – 10m", lo: 300, hi: 600 },
  { value: "600+", label: "10m+", lo: 600, hi: Infinity },
];

function callsToCsv(calls: Call[]): string {
  const head = [
    "scheduled_at",
    "phone",
    "customer",
    "duration_sec",
    "status",
    "updated_at",
    "intent",
    "sentiment",
  ];
  const rows = calls.map((c) => [
    c.scheduledAt,
    c.phone,
    c.customer,
    c.duration ?? "",
    c.status,
    c.updatedAt,
    c.intent ?? "",
    c.sentiment ?? "",
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
  { value: "intent", label: "Call Intent", options: INTENTS as readonly string[] },
  { value: "sentiment", label: "Call Sentiment", options: SENTIMENTS as readonly string[] },
] as const;
type AttrKey = (typeof ATTR_FILTERS)[number]["value"];

function CallsTable({ refs }: { refs: VoiceRef[] }) {
  const [q, setQ] = useState("");
  const [durF, setDurF] = useState("any");
  const [open, setOpen] = useState<Call | null>(null);

  // Two paired dropdowns: pick an attribute, then a value within it. "none" /
  // "any" are sentinels because Radix Select forbids an empty-string item value.
  const [attr, setAttr] = useState<AttrKey | "none">("none");
  const [attrVal, setAttrVal] = useState("any");
  const attrMeta = ATTR_FILTERS.find((f) => f.value === attr) ?? null;

  // Calls table shows the latest selected run only; a banner notes the rest.
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
  const calls = useMemo(
    () => tableRefs.flatMap((ref) => buildCalls(ref)),
    [tableRefs],
  );

  const filtered = useMemo(
    () =>
      calls.filter((c) => {
        if (q && !c.phone.includes(q)) return false;
        if (durF !== "any") {
          const f = DURATION_FILTERS.find((x) => x.value === durF)!;
          const d = c.duration ?? -1;
          if (!(d >= f.lo && d < f.hi)) return false;
        }
        if (attr !== "none" && attrVal !== "any") {
          const actual = attr === "intent" ? c.intent : c.sentiment;
          if (actual !== attrVal) return false;
        }
        return true;
      }),
    [calls, q, durF, attr, attrVal],
  );

  const exportCsv = (scope: "all" | "completed" | "failed") => {
    const rows =
      scope === "all"
        ? calls
        : calls.filter((c) => c.status.toLowerCase() === scope);
    downloadCsv(`voice-calls-${scope}.csv`, callsToCsv(rows));
  };

  return (
    <Section
      title="Calls"
      sub="Every call in scope. Open a completed call for its insights, recording and transcript."
    >
      {runCount > 1 && tableRun && (
        <p className="text-[11px] text-muted-foreground">
          Showing calls from {tableRun.startedAt}. {runCount - 1} other run
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
          <Select value={durF} onValueChange={setDurF}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Any duration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any duration</SelectItem>
              {DURATION_FILTERS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Attribute filter — picking a new attribute clears the stale value,
              otherwise "Positive" could linger while Call Intent is selected. */}
          <Select
            value={attr}
            onValueChange={(v) => {
              setAttr(v as AttrKey | "none");
              setAttrVal("any");
            }}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
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

          <Select
            value={attrVal}
            onValueChange={setAttrVal}
            disabled={!attrMeta}
          >
            <SelectTrigger
              className="h-8 w-[190px] text-xs disabled:opacity-50"
              title={attrMeta ? undefined : "Pick a filter first"}
            >
              <SelectValue placeholder="Select Values" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">
                {attrMeta ? `All ${attrMeta.label.replace("Call ", "")}` : "Select Values"}
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
                All calls
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCsv("completed")}>
                Completed only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCsv("failed")}>
                Failed only
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
          Showing 1–{Math.min(filtered.length, 50)} of{" "}
          {calls.length.toLocaleString()} calls
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium">
                  Scheduled At
                </th>
                <th className="px-4 py-2 text-left font-medium">Phone</th>
                <th className="px-4 py-2 text-right font-medium">Duration</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Updated At</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.slice(0, 50).map((c) => {
                const clickable = c.status === "Completed";
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
                      {c.scheduledAt}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px]">
                      {c.phone}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px]">
                      {c.duration != null ? fmtDur(c.duration) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn("text-[10.5px]", STATUS_TONE[c.status])}
                      >
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] tabular-nums text-muted-foreground">
                      {c.updatedAt}
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

      <CallDrawer call={open} onClose={() => setOpen(null)} />
    </Section>
  );
}

/* ───────── call detail drawer (Completed only) ───────── */

function humanizeVar(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Synthesize an illustrative value for an agent post-call variable. Real values
 *  come from the post-call analysis run; here they are deterministic per call. */
function insightValue(name: string, r: () => number, call: Call): string {
  const n = name.toLowerCase();
  const pick = (arr: string[]) => arr[Math.floor(r() * arr.length)];
  // Read the call's own sentiment rather than re-rolling, so a row filtered as
  // "Positive" cannot open a drawer that claims Negative.
  if (n.includes("sentiment")) return call.sentiment ?? pick([...SENTIMENTS]);
  if (n.includes("intent") || n.includes("engagement"))
    return call.intent ?? pick(INTENTS);
  if (n.includes("availab"))
    return pick(["Available", "Busy", "Requested callback"]);
  if (n.includes("competitor") || n.includes("app"))
    return pick(["PhonePe", "Google Pay", "CRED", "None"]);
  if (n.includes("card")) return pick(["Added", "Not added"]);
  if (n.includes("charge") || n.includes("price") || n.includes("fee"))
    return pick(["Too high", "Acceptable", "No comment"]);
  if (n.includes("callback"))
    return pick(["Yes · 6:30 pm", "Yes · tomorrow 11 am", "No"]);
  if (n.includes("status") || n.includes("disposition"))
    return pick(["Interested", "Follow-up", "Not interested"]);
  if (n.includes("date")) return pick(["12 Jun 2026", "14 Jun 2026", "—"]);
  if (n.includes("time")) return pick(["3:30 pm", "11:00 am", "—"]);
  return pick(["Yes", "No", "Captured", "—"]);
}

function CallDrawer({
  call,
  onClose,
}: {
  call: Call | null;
  onClose: () => void;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const agent = call?.agentId ? resolveAgent(call.agentId) : undefined;

  const insights = useMemo(() => {
    if (!call || !agent) return [];
    const r = seed("insight" + call.id);
    return agent.postCall.map((pc) => ({
      label: humanizeVar(pc.name),
      value: insightValue(pc.name, r, call),
    }));
  }, [call, agent]);

  const turns = useMemo(() => {
    if (!call) return [];
    const first = call.customer.split(" ")[0];
    const lines: [string, string][] = [
      [
        "agent",
        `Hi ${first}, this is Maya from Paytm. I noticed you haven't used your trading account in a while — is now a good time to talk?`,
      ],
      ["customer", "Okay, but just for a minute."],
      [
        "agent",
        "Of course. May I know what's been keeping you away from the app?",
      ],
      [
        "customer",
        "Honestly the charges felt a bit high, and I started using another app.",
      ],
      [
        "agent",
        "I understand. We've reduced charges and added zero brokerage for 30 days for returning traders.",
      ],
      [
        "customer",
        "Hmm, interesting. I also had trouble adding my credit card last time.",
      ],
      [
        "agent",
        "I can help with that — I'll send a step-by-step link on WhatsApp right after this call.",
      ],
      ["customer", "Sure, please do. I'll give it another try."],
      ["agent", "Wonderful. Thanks for your time, and welcome back!"],
    ];
    const r = seed(call.id);
    let t = 0;
    return lines.map(([role, text]) => {
      const at = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      t += 6 + Math.floor(r() * 12);
      return { role, text, at };
    });
  }, [call]);

  return (
    <Sheet
      open={!!call}
      onOpenChange={(v) => {
        if (!v) {
          setShowTranscript(false);
          onClose();
        }
      }}
    >
      <SheetContent className="w-[560px] overflow-y-auto sm:max-w-[560px]">
        {call && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground">
                  <PhoneIncoming className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold tabular-nums">
                      {call.phone}
                    </h3>
                    <span className="text-[12px] text-muted-foreground">
                      · {call.customer}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn("text-[10.5px]", STATUS_TONE.Completed)}
                    >
                      Completed
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {call.scheduledAt}
                    {call.duration != null ? ` · ${fmtDur(call.duration)}` : ""}
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
                {call.customer.split(" ")[0]} had drifted away over perceived
                high charges and a competing app, and previously struggled to
                add a credit card. Responded positively to the zero-brokerage
                win-back offer; a setup link was promised on WhatsApp. Likely to
                re-engage.
              </p>
            </div>

            {/* INSIGHTS — dynamic agent post-call analysis variables */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Insights
                </h4>
                {agent && (
                  <span className="text-[11px] text-muted-foreground">
                    {agent.name}
                  </span>
                )}
              </div>
              {insights.length ? (
                <div className="grid grid-cols-2 gap-2">
                  {insights.map((it) => (
                    <div
                      key={it.label}
                      className="rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {it.label}
                      </p>
                      <p className="mt-0.5 text-[13px] font-medium">
                        {it.value}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  No post-call analysis variables defined for this agent.
                </p>
              )}
            </div>

            {/* RECORDING */}
            <div className="mt-4">
              <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Recording
              </h4>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex h-12 items-center gap-[2px] overflow-hidden">
                  {Array.from({ length: 90 }, (_, i) => {
                    const r = seed(call.id + i)();
                    const h = 6 + r * 36;
                    return (
                      <div
                        key={i}
                        style={{ height: `${h}px` }}
                        className="w-[3px] rounded-sm bg-primary/40"
                      />
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <span className="font-mono text-[12px] tabular-nums">
                    0:00{" "}
                    <span className="text-muted-foreground">
                      / {call.duration != null ? fmtDur(call.duration) : "0:00"}
                    </span>
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Select defaultValue="1">
                      <SelectTrigger className="h-7 w-[60px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.5">0.5×</SelectItem>
                        <SelectItem value="1">1×</SelectItem>
                        <SelectItem value="1.5">1.5×</SelectItem>
                        <SelectItem value="2">2×</SelectItem>
                      </SelectContent>
                    </Select>
                    <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <div className="h-1.5 w-16 rounded-full bg-secondary">
                      <div className="h-full w-3/5 rounded-full bg-primary" />
                    </div>
                    <Download className="h-3.5 w-3.5 cursor-pointer text-muted-foreground hover:text-foreground" />
                  </div>
                </div>
              </div>
            </div>

            {/* TRANSCRIPT — collapsible chat bubbles */}
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

function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
