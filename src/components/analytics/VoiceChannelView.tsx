import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "@/components/analytics/EChart";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneOff, Users,
  Clock, TrendingUp, Smile, Search, Sparkles, X, Play, Volume2, Download,
} from "lucide-react";
import { generateLeads } from "@/lib/analytics-leads";
import type { RunRow, SankeyNode } from "@/lib/analytics-data";

const INTENTS = [
  "DND requested","Transferred to human","Documents requested","Payment already done",
  "Not interested","Wants to visit branch","Wrong number","Customer unavailable",
  "Call me later","KYC completed on call",
];
const SENTIMENTS = ["Positive","Neutral","Negative"] as const;
type Sent = typeof SENTIMENTS[number];

function seed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967295; };
}

type Call = {
  id: string; phone: string; customer: string; time: string; date: string;
  duration: number | null; intent: string | null; sentiment: Sent | null;
  status: "Answered" | "Failed";
};

function buildCalls(run: RunRow, node: SankeyNode): Call[] {
  const leads = generateLeads(run).filter((l) => l.stageNodeId === node.id);
  const r = seed(node.id + run.id);
  return leads.slice(0, 80).map((l, i) => {
    const answered = l.status === "answered" || l.status === "interested" || (l.status !== "failed" && r() > 0.25);
    const hh = 7 + Math.floor(r() * 13);
    const mm = String(Math.floor(r() * 59)).padStart(2, "0");
    return {
      id: l.id,
      phone: l.phone,
      customer: l.name,
      time: `${hh > 12 ? hh - 12 : hh}:${mm} ${hh >= 12 ? "pm" : "am"}`,
      date: "30 Apr 2026",
      duration: answered ? l.duration ?? 30 + Math.floor(r() * 200) : null,
      intent: answered ? INTENTS[Math.floor(r() * INTENTS.length)] : null,
      sentiment: answered ? SENTIMENTS[Math.floor(r() * 3)] : null,
      status: answered ? "Answered" : "Failed",
    };
  });
}

const SENTIMENT_TONE: Record<Sent, string> = {
  Positive: "text-foreground bg-secondary",
  Neutral:  "text-muted-foreground bg-muted",
  Negative: "text-destructive bg-destructive/10",
};

// Restrained, theme-aligned chart palette (resolved from CSS tokens at runtime)
const CHART = {
  primary:   "oklch(0.22 0.02 260)",
  accent:    "oklch(0.55 0.03 260)",
  muted:     "oklch(0.78 0.01 260)",
  subtle:    "oklch(0.88 0.008 260)",
  positive:  "oklch(0.62 0.12 160)",
  negative:  "oklch(0.62 0.22 27)",
};

export function VoiceChannelView({ run, node }: { run: RunRow; node: SankeyNode }) {
  const calls = useMemo(() => buildCalls(run, node), [run, node]);
  const totalBase = node.entered;
  const initiated = Math.round(totalBase * 0.149);
  const connected = Math.round(initiated * 0.803);
  const answered  = Math.round(connected * 0.919);
  const failed    = initiated - connected;

  const answeredCalls = calls.filter((c) => c.status === "Answered");
  const avgDuration = answeredCalls.length
    ? Math.round(answeredCalls.reduce((s, c) => s + (c.duration ?? 0), 0) / answeredCalls.length)
    : 0;
  const intentCounts = INTENTS.map((name) => ({
    name, count: answeredCalls.filter((c) => c.intent === name).length || Math.floor(140 + Math.random() * 30),
  })).sort((a, b) => b.count - a.count);
  const topIntent = intentCounts[0];

  const sentCounts = {
    Positive: Math.round(answered * 0.454),
    Neutral:  Math.round(answered * 0.322),
    Negative: Math.round(answered * 0.224),
  };

  return (
    <div className="space-y-6">
      {/* Performance overview */}
      <Section title="Performance overview" sub="What happened to the calls — base, dial-out, and connect funnel.">
        <div className="grid grid-cols-5 gap-3">
          <PerfKpi icon={Users}        label="Total Base" value={totalBase.toLocaleString()} sub="contacts uploaded" tone="slate" />
          <PerfKpi icon={PhoneOutgoing} label="Initiated"  value={initiated.toLocaleString()} sub={`${((initiated/totalBase)*100).toFixed(1)}% of base`} tone="indigo" />
          <PerfKpi icon={Phone}         label="Connected"  value={connected.toLocaleString()} sub={`${((connected/initiated)*100).toFixed(1)}% connect rate`} tone="sky" />
          <PerfKpi icon={PhoneIncoming} label="Answered"   value={answered.toLocaleString()}  sub={`${((answered/connected)*100).toFixed(1)}% answer rate`}  tone="emerald" />
          <PerfKpi icon={PhoneOff}      label="Failed"     value={failed.toLocaleString()}    sub={`${((failed/initiated)*100).toFixed(1)}% fail rate`}     tone="rose" />
        </div>
        <DailyBreakdown seedId={node.id} />
      </Section>

      {/* Conversation insights */}
      <Section title="Conversation insights" sub="What customers said on answered calls — intents, sentiment, and call shape.">
        <div className="grid grid-cols-3 gap-3">
          <InsightKpi icon={PhoneIncoming} label="Calls Answered" value={answered.toLocaleString()} sub="answered in scope" tone="sky" />
          <InsightKpi icon={Clock}         label="Avg Call Duration" value={fmtDur(avgDuration)} sub="across answered" tone="indigo" />
          <InsightKpi icon={TrendingUp}    label="Top Intent" value={topIntent.name} sub={`${topIntent.count} · ${((topIntent.count/answered)*100).toFixed(1)}%`} tone="violet" big />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Card title="Intent distribution" sub="Top intents across answered calls.">
            <div className="h-[260px]"><EChart option={intentBarOption(intentCounts.slice(0, 10))} /></div>
          </Card>
          <Card title="Sentiment distribution" sub="Across answered calls.">
            <div className="h-[260px]"><EChart option={sentimentDonutOption(sentCounts, answered)} /></div>
          </Card>
          <Card title="Call duration distribution" sub="Across answered calls.">
            <div className="h-[260px]"><EChart option={durationBarOption(answeredCalls)} /></div>
          </Card>
        </div>
      </Section>

      {/* Calls table */}
      <CallsTable calls={calls} />
    </div>
  );
}

/* ───────── building blocks ───────── */

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
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
  slate:   "bg-secondary text-muted-foreground",
  indigo:  "bg-secondary text-foreground",
  sky:     "bg-secondary text-foreground",
  emerald: "bg-secondary text-foreground",
  rose:    "bg-destructive/10 text-destructive",
  violet:  "bg-secondary text-foreground",
};

function PerfKpi({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", TONES[tone])}><Icon className="h-3.5 w-3.5" /></span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function InsightKpi({ icon: Icon, label, value, sub, tone, big }: { icon: any; label: string; value: string; sub: string; tone: string; big?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", TONES[tone])}><Icon className="h-3.5 w-3.5" /></span>
      </div>
      <p className={cn("mt-2 font-semibold tracking-tight tabular-nums", big ? "text-xl" : "text-3xl")}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function SentimentMix({ s }: { s: Record<Sent, number> }) {
  const total = s.Positive + s.Neutral + s.Negative;
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Sentiment Mix</p>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", TONES.emerald)}><Smile className="h-3.5 w-3.5" /></span>
      </div>
      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        <div style={{ width: `${pct(s.Positive)}%`, background: CHART.positive }} />
        <div style={{ width: `${pct(s.Neutral)}%`,  background: CHART.muted }} />
        <div style={{ width: `${pct(s.Negative)}%`, background: CHART.negative }} />
      </div>
      <div className="mt-2 flex justify-between text-[11px]">
        <span><b className="text-foreground">{pct(s.Positive)}%</b> <span className="text-muted-foreground">pos</span></span>
        <span><b className="text-foreground">{pct(s.Neutral)}%</b> <span className="text-muted-foreground">neu</span></span>
        <span><b className="text-destructive">{pct(s.Negative)}%</b> <span className="text-muted-foreground">neg</span></span>
      </div>
    </div>
  );
}

function Card({ title, sub, children, action }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
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

function DailyBreakdown({ seedId }: { seedId: string }) {
  const opt = useMemo<EChartsOption>(() => {
    const r = seed(seedId);
    const dates = Array.from({ length: 30 }, (_, i) => `${i + 1} Apr`);
    const ramp = (peak: number) => dates.map((_, i) => {
      const t = i / 29;
      const base = t < 0.7 ? r() * peak * 0.08 : peak * (0.15 + Math.pow((t - 0.7) / 0.3, 2.4));
      return Math.round(base + r() * peak * 0.05);
    });
    return {
      backgroundColor: "transparent",
      legend: { right: 8, top: 6, itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 11, color: "oklch(0.52 0.015 260)" } },
      grid: { left: 40, right: 16, top: 36, bottom: 28 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: dates, axisLabel: { fontSize: 10, color: "oklch(0.52 0.015 260)" }, boundaryGap: false },
      yAxis: { type: "value", axisLine: { show: false }, splitLine: { lineStyle: { color: "oklch(0.92 0.006 260)" } }, axisLabel: { fontSize: 10, color: "oklch(0.52 0.015 260)" } },
      series: [
        { name: "Initiated", type: "line", smooth: true, symbol: "none", data: ramp(1600), lineStyle: { color: CHART.primary, width: 2 } },
        { name: "Connected", type: "line", smooth: true, symbol: "none", data: ramp(1280), lineStyle: { color: CHART.accent,  width: 2 } },
        { name: "Answered",  type: "line", smooth: true, symbol: "none", data: ramp(1170), lineStyle: { color: CHART.positive, width: 2 } },
        { name: "Failed",    type: "line", smooth: true, symbol: "none", data: ramp(320),  lineStyle: { color: CHART.negative, width: 2 } },
      ],
    };
  }, [seedId]);
  return (
    <Card title="Daily breakdown" sub="Calls per day across the selected range.">
      <div className="h-[280px]"><EChart option={opt} /></div>
    </Card>
  );
}

function intentBarOption(items: { name: string; count: number }[]): EChartsOption {
  // Monochrome ramp from primary → muted for an enterprise feel
  const max = items.length - 1;
  return {
    backgroundColor: "transparent",
    grid: { left: 36, right: 8, top: 16, bottom: 92 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "category", data: items.map((i) => i.name), axisLabel: { rotate: 40, fontSize: 10, interval: 0, color: "oklch(0.52 0.015 260)" } },
    yAxis: { type: "value", axisLine: { show: false }, splitLine: { lineStyle: { color: "oklch(0.92 0.006 260)" } }, axisLabel: { fontSize: 10, color: "oklch(0.52 0.015 260)" } },
    series: [{
      type: "bar", barWidth: 18,
      data: items.map((i, idx) => ({
        value: i.count,
        itemStyle: { color: CHART.primary, opacity: 1 - (idx / Math.max(max, 1)) * 0.7, borderRadius: [3, 3, 0, 0] },
      })),
    }],
  };
}

function sentimentDonutOption(s: Record<Sent, number>, total: number): EChartsOption {
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: { bottom: 0, left: "center", itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 11, color: "oklch(0.52 0.015 260)" } },
    series: [{
      type: "pie", radius: ["55%", "78%"], center: ["50%", "45%"],
      avoidLabelOverlap: true, label: { show: false }, labelLine: { show: false },
      data: [
        { name: "Positive", value: s.Positive, itemStyle: { color: CHART.positive } },
        { name: "Neutral",  value: s.Neutral,  itemStyle: { color: CHART.muted } },
        { name: "Negative", value: s.Negative, itemStyle: { color: CHART.negative } },
      ],
    }],
    graphic: [
      { type: "text", left: "center", top: "38%", style: { text: total.toLocaleString(), fontSize: 22, fontWeight: 600, fill: "oklch(0.18 0.015 260)" } },
      { type: "text", left: "center", top: "50%", style: { text: "ANSWERED", fontSize: 10, fill: "oklch(0.52 0.015 260)" } },
    ],
  };
}

function durationBarOption(answered: Call[]): EChartsOption {
  const buckets = [
    { label: "0-30s",  test: (d: number) => d < 30 },
    { label: "30s-1m", test: (d: number) => d >= 30 && d < 60 },
    { label: "1-2m",   test: (d: number) => d >= 60 && d < 120 },
    { label: "2-5m",   test: (d: number) => d >= 120 && d < 300 },
    { label: "5m+",    test: (d: number) => d >= 300 },
  ];
  const data = buckets.map((b) => answered.filter((c) => b.test(c.duration ?? 0)).length);
  // make 30s-1m dominant like screenshot
  data[1] = Math.max(data[1], Math.round(answered.length * 0.7));
  return {
    backgroundColor: "transparent",
    grid: { left: 36, right: 8, top: 16, bottom: 36 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "category", data: buckets.map((b) => b.label), axisLabel: { fontSize: 11, color: "oklch(0.52 0.015 260)" } },
    yAxis: { type: "value", axisLine: { show: false }, splitLine: { lineStyle: { color: "oklch(0.92 0.006 260)" } }, axisLabel: { fontSize: 10, color: "oklch(0.52 0.015 260)" } },
    series: [{ type: "bar", barWidth: 36, data, itemStyle: { color: CHART.primary, opacity: 0.85, borderRadius: [4, 4, 0, 0] } }],
  };
}

/* ───────── calls table ───────── */

function CallsTable({ calls }: { calls: Call[] }) {
  const [q, setQ] = useState("");
  const [intent, setIntent] = useState("all");
  const [sentiment, setSentiment] = useState("all");
  const [duration, setDuration] = useState("all");
  const [open, setOpen] = useState<Call | null>(null);

  const filtered = useMemo(() => calls.filter((c) => {
    if (q && !c.phone.includes(q) && !c.customer.toLowerCase().includes(q.toLowerCase())) return false;
    if (intent !== "all" && c.intent !== intent) return false;
    if (sentiment !== "all" && c.sentiment !== sentiment) return false;
    if (duration !== "all") {
      const d = c.duration ?? -1;
      if (duration === "lt30" && !(d >= 0 && d < 30)) return false;
      if (duration === "30-60" && !(d >= 30 && d < 60)) return false;
      if (duration === "1-2" && !(d >= 60 && d < 120)) return false;
      if (duration === "2-5" && !(d >= 120 && d < 300)) return false;
      if (duration === "5+" && !(d >= 300)) return false;
    }
    return true;
  }), [calls, q, intent, sentiment, duration]);

  return (
    <Section title="Calls" sub="Every call in scope. Click a row for the transcript and recording.">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by phone number…" className="h-8 w-[260px] pl-7 text-xs" />
          </div>
          <Select value={intent} onValueChange={setIntent}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="All intents" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All intents</SelectItem>
              {INTENTS.map((i) => (<SelectItem key={i} value={i}>{i}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={sentiment} onValueChange={setSentiment}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="All sentiments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sentiments</SelectItem>
              {SENTIMENTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Any duration" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any duration</SelectItem>
              <SelectItem value="lt30">0–30s</SelectItem>
              <SelectItem value="30-60">30s–1m</SelectItem>
              <SelectItem value="1-2">1–2m</SelectItem>
              <SelectItem value="2-5">2–5m</SelectItem>
              <SelectItem value="5+">5m+</SelectItem>
            </SelectContent>
          </Select>
          <span className="ml-auto text-[11px] text-muted-foreground">Showing 1–{Math.min(filtered.length, 50)} of {calls.length.toLocaleString()} calls</span>
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium">Time</th>
                <th className="px-4 py-2 text-left font-medium">Phone</th>
                <th className="px-4 py-2 text-left font-medium">Customer</th>
                <th className="px-4 py-2 text-right font-medium">Duration</th>
                <th className="px-4 py-2 text-left font-medium">Intent</th>
                <th className="px-4 py-2 text-left font-medium">Sentiment</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.slice(0, 50).map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-secondary/40" onClick={() => setOpen(c)}>
                  <td className="px-4 py-2.5">
                    <div className="text-[13px]">{c.time}</div>
                    <div className="text-[10.5px] text-muted-foreground">{c.date}</div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px]">{c.phone}</td>
                  <td className="px-4 py-2.5">{c.customer}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[12px]">{c.duration ? fmtDur(c.duration) : "—"}</td>
                  <td className="px-4 py-2.5">
                    {c.intent ? <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px]">{c.intent}</span> : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.sentiment ? <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", SENTIMENT_TONE[c.sentiment])}>{c.sentiment}</span> : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className={cn("text-[10.5px]", c.status === "Failed" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border bg-secondary text-foreground")}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CallDrawer call={open} onClose={() => setOpen(null)} />
    </Section>
  );
}

function CallDrawer({ call, onClose }: { call: Call | null; onClose: () => void }) {
  const turns = useMemo(() => {
    if (!call) return [];
    const r = seed(call.id);
    const lines = [
      ["agent", "Hello, am I speaking with " + call.customer.split(" ")[0] + "? This is Loan Recovery Agent calling from Volt Money."],
      ["customer", "Yes, speaking. Please go ahead."],
      ["agent", "Calling about the EMI of ₹3.7L due on 22 January. Will you be able to pay on time?"],
      ["customer", "Yes, the funds are arranged. I will pay by tomorrow."],
      ["agent", "Thank you. I'll note that down and send a confirmation SMS."],
      ["customer", "Sure, thanks."],
      ["agent", "Have a great day."],
      ["customer", "You too."],
    ];
    let t = 0;
    return lines.map(([role, text]) => {
      const at = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      t += 6 + Math.floor(r() * 10);
      return { role, text, at };
    });
  }, [call]);

  return (
    <Sheet open={!!call} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[560px] overflow-y-auto sm:max-w-[560px]">
        {call && (
          <>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground"><PhoneIncoming className="h-4 w-4" /></span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold tabular-nums">{call.phone}</h3>
                    <span className="text-[12px] text-muted-foreground">· {call.customer}</span>
                    <Badge variant="outline" className={cn("text-[10.5px]", call.status === "Failed" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border bg-secondary text-foreground")}>{call.status}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {call.date}, {call.time} {call.duration ? `· ${fmtDur(call.duration)}` : ""} · Loan Recovery — 30 DPD · Loan Recovery Agent
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            {/* Player */}
            <div className="mt-5 rounded-xl border border-border bg-card p-3">
              <div className="flex h-12 items-center gap-[2px] overflow-hidden">
                {Array.from({ length: 90 }, (_, i) => {
                  const r = seed(call.id + i)();
                  const h = 6 + r * 36;
                  return <div key={i} style={{ height: `${h}px` }} className="w-[3px] rounded-sm bg-primary/40" />;
                })}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><Play className="h-3.5 w-3.5" /></button>
                <span className="font-mono text-[12px] tabular-nums">0:00 <span className="text-muted-foreground">/ {call.duration ? fmtDur(call.duration) : "0:00"}</span></span>
                <div className="ml-auto flex items-center gap-2">
                  <Select defaultValue="1">
                    <SelectTrigger className="h-7 w-[60px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.5">0.5×</SelectItem>
                      <SelectItem value="1">1×</SelectItem>
                      <SelectItem value="1.5">1.5×</SelectItem>
                      <SelectItem value="2">2×</SelectItem>
                    </SelectContent>
                  </Select>
                  <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <div className="h-1.5 w-16 rounded-full bg-secondary"><div className="h-full w-3/5 rounded-full bg-primary" /></div>
                  <Download className="h-3.5 w-3.5 cursor-pointer text-muted-foreground hover:text-foreground" />
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="mt-4 rounded-xl border border-border bg-secondary/50 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-foreground">
                <Sparkles className="h-3 w-3" /> Summary
              </div>
              <p className="text-[12.5px] leading-relaxed text-foreground">
                {call.customer} promised to pay the EMI of ₹3.7L (due on 22 January) within 48 hours.
                Commitment recorded; SMS reminder scheduled a day before.
              </p>
            </div>

            {/* Transcript */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Transcript</h4>
                <span className="text-[11px] text-muted-foreground">{turns.length} turns</span>
              </div>
              <div className="space-y-2.5">
                {turns.map((t, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card px-3 py-2">
                    <div className="mb-1 flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                      <span className={t.role === "agent" ? "text-foreground" : "text-muted-foreground"}>{t.role}</span>
                      <span className="font-mono">{t.at}</span>
                    </div>
                    <p className="text-[13px] leading-relaxed">{t.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Export</Button>
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
