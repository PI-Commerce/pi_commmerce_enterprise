import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpRight, Megaphone, Bot, Activity, Plus, Globe } from "lucide-react";
import { useRegion, COUNTRY_OPTIONS, type CountryCode } from "@/lib/region";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard · Pi Commerce Enterprise" },
      { name: "description", content: "Operational overview of AI-driven campaigns and agents." },
    ],
  }),
});

/**
 * v1 dashboard — deliberately minimal and "safe": it only surfaces in-scope
 * information that already exists elsewhere in the product (Campaigns, Agents,
 * Analytics). No aspirational widgets (recommendations, approval queues, ad
 * syncs) and only in-scope channels (WhatsApp / Voice AI).
 */
function Dashboard() {
  const { country, setCountry } = useRegion();
  return (
    <AppShell>
      <PageHeader
        title="Good morning, Aman"
        description="Here's what's live across your workspace right now."
        actions={
          <div className="flex items-center gap-2">
            <Select value={country} onValueChange={(v) => setCountry(v as CountryCode)}>
              <SelectTrigger className="h-8 w-[150px] gap-1.5 text-xs" aria-label="Country">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_OPTIONS.map((c) => (
                  <SelectItem key={c.country} value={c.country} className="text-xs">
                    {c.label} · {c.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <Link to="/campaigns"><Plus className="h-3.5 w-3.5" /> New campaign</Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Active campaigns" value="8" sub="2 running now" />
        <Kpi label="Live agents" value="5" sub="Voice & chat" />
        <Kpi label="Runs · last 24h" value="3" sub="Across all campaigns" />
        <Kpi label="Leads processed · 24h" value="3,460" sub="Reached End node" />
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Live runs</h2>
            <p className="text-[11px] text-muted-foreground">5 most recent running runs · updated just now</p>
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
            {LIVE_RUNS.map((r) => {
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

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
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

// The 5 most recent running runs across in-scope campaigns (WhatsApp / Voice AI).
const LIVE_RUNS = [
  { id: "r_8423", campaign: "Dormant Trader Reactivation", startedAt: "Today, 12:04 PM", processed: 630,  total: 1500 as number | undefined },
  { id: "r_8422", campaign: "Retail · Activation",         startedAt: "Today, 11:50 AM", processed: 1200, total: undefined },
  { id: "r_8421", campaign: "New Trader Onboarding",       startedAt: "Today, 11:32 AM", processed: 410,  total: 900 },
  { id: "r_8420", campaign: "KYC Drop-off Recovery",       startedAt: "Today, 10:58 AM", processed: 220,  total: 540 },
  { id: "r_8419", campaign: "High-Value Win-Back",         startedAt: "Today, 10:20 AM", processed: 75,   total: 300 },
] as const;
