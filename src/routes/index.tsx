import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpRight, Megaphone, Bot, Activity, Sparkles, Plus, CheckCircle2, AlertTriangle, Globe } from "lucide-react";
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
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5 text-ai" /> Ask Pi
            </Button>
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
                <p className="font-mono text-[12px] capitalize">{c.status}</p>
                <p className="text-[10.5px] text-muted-foreground">status</p>
              </div>
            </li>
          ))}
        </ul>
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

// In-scope campaigns only — WhatsApp (Chat AI) and Voice AI channels.
const LIVE = [
  { name: "Dormant Trader Reactivation", channels: ["Chat AI", "Voice AI"], owner: "Aman", runs: "3", status: "running" },
  { name: "New Trader Onboarding", channels: ["Chat AI", "Voice AI"], owner: "Priya", runs: "1", status: "running" },
  { name: "High-Value Win-Back", channels: ["Voice AI", "Chat AI"], owner: "Aman", runs: "1", status: "paused" },
  { name: "KYC Drop-off Recovery", channels: ["Chat AI", "Voice AI"], owner: "Ria", runs: "1", status: "completed" },
] as const;
