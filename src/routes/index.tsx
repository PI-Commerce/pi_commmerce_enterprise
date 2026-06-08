import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Megaphone, Bot, Activity, Sparkles, Plus, CheckCircle2, AlertTriangle } from "lucide-react";

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
  return (
    <AppShell>
      <PageHeader
        title="Good morning, Aman"
        description="Here's what's Live across your workspace right now."
        actions={
          <>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5 text-ai" /> Ask Pi
            </Button>
            <Button size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <Link to="/campaigns"><Plus className="h-3.5 w-3.5" /> New campaign</Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Active campaigns" value="12" delta="+2 this week" />
        <Kpi label="Conversations / 24h" value="48.2K" delta="+18%" positive />
        <Kpi label="Conversion rate" value="6.4%" delta="+0.8 pp" positive />
        <Kpi label="AI credits used" value="62%" delta="of monthly quota" />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="col-span-2 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Live campaigns</h2>
              <p className="text-[11px] text-muted-foreground">Updated just now</p>
            </div>
            <Link to="/campaigns" className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {LIVE.map((c) => (
              <li key={c.name} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className={`h-1.5 w-1.5 rounded-full ${c.status === "running" ? "bg-success animate-pulse" : c.status === "paused" ? "bg-warning" : "bg-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">{c.channels.join(" · ")} · owned by {c.owner}</p>
                </div>
                <div className="hidden text-right md:block">
                  <p className="font-mono text-[12px]">{c.runs}</p>
                  <p className="text-[10.5px] text-muted-foreground">runs / 24h</p>
                </div>
                <div className="w-20 text-right">
                  <p className="font-mono text-[12px]">{c.conv}</p>
                  <p className="text-[10.5px] text-muted-foreground">conv.</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Needs your attention</h2>
            <p className="text-[11px] text-muted-foreground">Human-in-the-loop queue</p>
          </div>
          <ul className="divide-y divide-border">
            {APPROVALS.map((a) => (
              <li key={a.title} className="px-4 py-3">
                <div className="flex items-start gap-2.5">
                  {a.type === "approval" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-warning" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-destructive" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-tight">{a.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{a.detail}</p>
                  </div>
                </div>
                <div className="mt-2 flex justify-end gap-1.5">
                  <Button variant="ghost" size="sm" className="h-7 text-[11.5px]">Dismiss</Button>
                  <Button size="sm" className="h-7 text-[11.5px]">Review</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <ShortcutCard icon={Megaphone} title="Campaigns" desc="Design DAG workflows across channels." to="/campaigns" />
        <ShortcutCard icon={Bot} title="Agents" desc="Build voice & chat agents with tools." to="/agents" />
        <ShortcutCard icon={Activity} title="Analytics" desc="Funnels, drop-offs, agent quality." to="/analytics" />
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, delta, positive }: { label: string; value: string; delta: string; positive?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
      <p className={`mt-0.5 text-[11px] ${positive ? "text-success" : "text-muted-foreground"}`}>{delta}</p>
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

const LIVE = [
  { name: "Dormant Trader Reactivation", channels: ["WhatsApp", "Voice AI"], owner: "Aman", runs: "12,402", conv: "7.1%", status: "running" },
  { name: "New Trader Onboarding", channels: ["Email", "Push", "AI"], owner: "Priya", runs: "8,201", conv: "11.4%", status: "running" },
  { name: "High-Value Win-Back", channels: ["Voice AI", "WhatsApp"], owner: "Aman", runs: "1,028", conv: "4.2%", status: "paused" },
  { name: "KYC Drop-off Recovery", channels: ["WhatsApp", "SMS"], owner: "Ria", runs: "3,920", conv: "9.8%", status: "running" },
  { name: "Meta Audience Sync", channels: ["Meta Ads"], owner: "Ops bot", runs: "—", conv: "—", status: "idle" },
] as const;

const APPROVALS = [
  { type: "approval", title: "Approve Meta Ads push", detail: "Custom audience of 42,318 users ready for sync." },
  { type: "alert", title: "Voice AI sentiment dip", detail: "Reactivation flow → avg sentiment dropped to -0.21." },
  { type: "approval", title: "New agent · ‘Pi Concierge’", detail: "Awaiting review before going live in production." },
] as const;
