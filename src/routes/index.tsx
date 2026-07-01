import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowUpRight, Megaphone, Bot, Activity, Plus, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard · Pi Commerce Enterprise" },
      { name: "description", content: "Operational overview of AI-driven campaigns and agents." },
    ],
  }),
});

function Dashboard() {
  const runs = [...LIVE_RUNS].sort((a, b) => b.startedAtTs - a.startedAtTs).slice(0, 5);
  return (
    <AppShell>
      <PageHeader
        title="Good morning, Aman"
        description="Here's what's live across your workspace right now."
        actions={
          <Button size="sm" className="h-8 gap-1.5 text-xs" asChild>
            <Link to="/campaigns"><Plus className="h-3.5 w-3.5" /> New campaign</Link>
          </Button>
        }
      />

      <TooltipProvider delayDuration={150}>
      <div className="grid grid-cols-4 gap-3">
        <Kpi
          label="Active campaigns"
          value="8"
          unit="live"
          timeframe="Currently running"
          info="Campaigns with at least one run in progress right now."
        />
        <Kpi
          label="Leads processed"
          value="24,180"
          unit="leads"
          timeframe="Last 7 days"
          info="New leads that traversed a campaign from Start to End node in the last 7 days."
        />
        <Kpi
          label="WhatsApp messages sent"
          value="61,420"
          unit="messages"
          timeframe="Last 7 days"
          info="Total WhatsApp messages dispatched by any campaign in the last 7 days."
        />
        <Kpi
          label="Voice AI conversation"
          value="4,830"
          unit="minutes"
          timeframe="Last 7 days"
          info="Total minutes spoken across all voice agents and campaigns in the last 7 days."
        />
      </div>
      </TooltipProvider>

      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Live runs</h2>
            <p className="text-[11px] text-muted-foreground">5 most recently started runs · updated just now</p>
          </div>
          <Link to="/campaigns" className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground">
            View all runs <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Run ID</th>
              <th className="px-4 py-2.5 text-left font-medium">Campaign</th>
              <th className="px-4 py-2.5 text-left font-medium">Started at</th>
              <th className="px-4 py-2.5 text-left font-medium w-[220px]">Progress</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map((r) => {
              const pct = r.total ? Math.round((r.processed / r.total) * 100) : 100;
              return (
                <tr key={r.id} className="transition-colors hover:bg-accent/30">
                  <td className="px-4 py-3 font-mono text-[12px]">{r.id}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                      <span className="font-medium">{r.campaign}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">{r.startedAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <Progress value={pct} className="h-1.5 w-44" />
                      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                        {r.total
                          ? `${r.processed.toLocaleString()}/${r.total.toLocaleString()} leads processed`
                          : `${r.processed.toLocaleString()} leads processed`}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <ShortcutCard icon={Megaphone} title="Campaigns" desc="Design DAG workflows across channels." to="/campaigns" />
        <ShortcutCard icon={Bot} title="Agents" desc="Build voice & chat agents with tools." to="/agents" />
        <ShortcutCard icon={Activity} title="Analytics" desc="Funnels, drop-offs, agent quality." to="/analytics" />
      </div>
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  unit,
  timeframe,
  info,
}: {
  label: string;
  value: string;
  unit: string;
  timeframe: string;
  info: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`About ${label}`}
              className="-mr-1 -mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
            >
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px] text-[11px] leading-snug">
            {info}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="text-[12px] text-muted-foreground">{unit}</p>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{timeframe}</p>
    </div>
  );
}

function ShortcutCard({ icon: Icon, title, desc, to }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string; to: string }) {
  return (
    <Link to={to} className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-accent/30">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent"><Icon className="h-3.5 w-3.5" /></div>
        <p className="text-sm font-medium">{title}</p>
        <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">{desc}</p>
    </Link>
  );
}

// Live runs, sorted by startedAtTs descending at render time.
const LIVE_RUNS = [
  { id: "r_8423", campaign: "Dormant Trader Reactivation", startedAt: "Today, 12:04 PM", startedAtTs: 1719813840000, processed: 630,  total: 1500 as number | undefined },
  { id: "r_8422", campaign: "Retail · Activation",         startedAt: "Today, 11:50 AM", startedAtTs: 1719813000000, processed: 1200, total: undefined },
  { id: "r_8421", campaign: "New Trader Onboarding",       startedAt: "Today, 11:32 AM", startedAtTs: 1719811920000, processed: 410,  total: 900 },
  { id: "r_8420", campaign: "KYC Drop-off Recovery",       startedAt: "Today, 10:58 AM", startedAtTs: 1719809880000, processed: 220,  total: 540 },
  { id: "r_8419", campaign: "High-Value Win-Back",         startedAt: "Today, 10:20 AM", startedAtTs: 1719807600000, processed: 75,   total: 300 },
] as const;
