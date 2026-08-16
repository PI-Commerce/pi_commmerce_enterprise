/**
 * Ads Manager → Analytics.
 *
 * Lives here rather than in the app's Analytics section on purpose: none of
 * these numbers mean anything away from the ads that produced them, and a
 * cost-per-conversation sitting next to site funnels invites the comparison
 * that CTWA specifically does not support.
 *
 * Three questions, in order: what did it cost, where did it leak, and what
 * should be done about it. The funnel and the table read the same tap log the
 * overview and the CAPI log read, so a number can be traced from a
 * recommendation down to an individual conversation without ever changing
 * source.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Info, Lightbulb, Timer,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRegion } from "@/lib/region";
import { Empty, Kpi, Section, compact, latency, money } from "@/components/ads/ui";
import { rollUpFunnel, rollUpPerformance } from "@/lib/ctwa-sim";
import { getRecommendations, type Recommendation, type RecommendationSeverity } from "@/lib/ctwa-recommendations";
import {
  useCapiEvents, useCtwaAds, useCtwaConversations, useOutcomeAudiences, useSimNow,
} from "@/lib/ctwa-store";
import { FAST_RESPONSE_THRESHOLD_MS, type PerformanceScope } from "@/lib/ctwa-types";

const SCOPES: { id: PerformanceScope; label: string }[] = [
  { id: "campaign", label: "Campaign" },
  { id: "adset", label: "Ad set" },
  { id: "ad", label: "Ad" },
];

export function AdsAnalytics({
  onEditAd,
  onOpenLoop,
}: {
  onEditAd: (adId: string) => void;
  onOpenLoop: () => void;
}) {
  const { symbol } = useRegion();
  const ads = useCtwaAds();
  const conversations = useCtwaConversations();
  const capiEvents = useCapiEvents();
  const audiences = useOutcomeAudiences();
  const nowMs = useSimNow();

  const [scope, setScope] = useState<PerformanceScope>("ad");
  const [funnelAdId, setFunnelAdId] = useState("");

  // Ad-scope rollup is the source for the tiles and the recommendations no
  // matter what the table is showing: changing granularity regroups the
  // breakdown, it must not change the totals.
  const byAd = useMemo(() => rollUpPerformance("ad", ads, conversations), [ads, conversations]);
  const rows = useMemo(
    () => (scope === "ad" ? byAd : rollUpPerformance(scope, ads, conversations)),
    [scope, byAd, ads, conversations],
  );
  const funnel = useMemo(
    () => rollUpFunnel(ads, conversations, funnelAdId || undefined),
    [ads, conversations, funnelAdId],
  );

  const totals = useMemo(() => {
    const sum = (pick: (r: (typeof byAd)[number]) => number) => byAd.reduce((n, r) => n + pick(r), 0);
    const spend = sum((r) => r.spend);
    const revenue = sum((r) => r.revenue);
    const started = sum((r) => r.conversationsStarted);
    const qualified = sum((r) => r.qualifiedLeads);
    const purchases = sum((r) => r.purchases);
    const latencySum = byAd.reduce((n, r) => n + r.avgFirstResponseLatencyMs * r.conversationsStarted, 0);
    return {
      spend,
      revenue,
      started,
      qualified,
      purchases,
      costPerConversation: started > 0 ? spend / started : 0,
      cpl: qualified > 0 ? spend / qualified : 0,
      cpp: purchases > 0 ? spend / purchases : 0,
      roas: spend > 0 ? revenue / spend : 0,
      avgLatency: started > 0 ? latencySum / started : 0,
    };
  }, [byAd]);

  const recommendations = useMemo(
    () =>
      getRecommendations({
        ads,
        conversations,
        capiEvents,
        performance: byAd,
        audiences,
        nowMs,
        currencySymbol: symbol,
      }),
    [ads, conversations, capiEvents, byAd, audiences, nowMs, symbol],
  );

  const act = (r: Recommendation) => {
    if (r.action?.target === "ad" && r.adId) onEditAd(r.adId);
    else onOpenLoop();
  };

  return (
    <div className="h-full overflow-y-auto px-8 pb-6">
      <div className="space-y-8 pb-10">
        <Section title="Cost of an outcome" desc="Everything attributed by ctwa_clid, across every ad in the account.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi
              label="Cost / conversation"
              value={money(totals.costPerConversation, symbol)}
              sub={`${compact(totals.started)} started`}
            />
            <Kpi
              label="Cost / qualified lead"
              value={money(totals.cpl, symbol)}
              sub={`${compact(totals.qualified)} qualified`}
            />
            <Kpi
              label="Cost / purchase"
              value={totals.purchases ? money(totals.cpp, symbol) : "—"}
              sub={`${totals.purchases} conversions`}
            />
            <Kpi
              label="ROAS"
              value={`${totals.roas.toFixed(2)}x`}
              tone={totals.roas >= 1 ? "positive" : "negative"}
              sub={`${money(totals.revenue, symbol)} on ${money(totals.spend, symbol)}`}
            />
            <Kpi
              label="Avg first response"
              value={latency(totals.avgLatency)}
              tone={totals.avgLatency > FAST_RESPONSE_THRESHOLD_MS ? "negative" : "positive"}
              sub={
                totals.avgLatency > FAST_RESPONSE_THRESHOLD_MS
                  ? `Past Meta's ${FAST_RESPONSE_THRESHOLD_MS / 1000}s mark`
                  : `Inside Meta's ${FAST_RESPONSE_THRESHOLD_MS / 1000}s mark`
              }
            />
          </div>
        </Section>

        <Section
          title="Funnel"
          desc="Impression to revenue. The step rate on the right is where the money actually leaks."
          action={
            ads.length > 1 && (
              <Select value={funnelAdId || "all"} onValueChange={(v) => setFunnelAdId(v === "all" ? "" : v)}>
                <SelectTrigger className="h-8 w-[220px] text-[12.5px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Every ad</SelectItem>
                  {ads.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )
          }
        >
          <Funnel steps={funnel} />
        </Section>

        <Section
          title="Attribution"
          desc="The same spend, regrouped. Meta optimises at ad-set level, so a healthy campaign can still be hiding one."
          action={
            <div className="flex rounded-lg border border-border p-0.5">
              {SCOPES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setScope(s.id)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                    scope === s.id
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          }
        >
          <PerformanceTable rows={rows} symbol={symbol} />
        </Section>

        <Section
          title="Recommendations"
          desc="Derived from the tap log above, not a checklist. Each one cites the number that produced it."
        >
          {recommendations.length === 0 ? (
            <Empty>
              Nothing to flag. No objective mismatches, no slow replies, no conversions falling outside the
              attribution window.
            </Empty>
          ) : (
            <div className="space-y-2.5">
              {recommendations.map((r) => (
                <RecommendationCard key={r.id} rec={r} onAct={() => act(r)} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ─────────────────────────── Funnel ─────────────────────────── */

/**
 * Bars for the five post-click steps are scaled to clicks, not impressions.
 * Clicks are ~2% of impressions on CTWA, so a true-to-impressions scale renders
 * every step after the first as a hairline. Impressions stay on top as the row
 * that explains what the taps cost to get, with the CTR shown as its step rate.
 */
function Funnel({ steps }: { steps: ReturnType<typeof rollUpFunnel> }) {
  const base = steps[1]?.count ?? 0;
  if (base === 0) {
    return <Empty>No clicks recorded yet. Advance the simulation clock or activate an ad.</Empty>;
  }

  return (
    <div className="space-y-1.5 rounded-xl border border-border bg-card p-4">
      {steps.map((s, i) => {
        const width = i === 0 ? 100 : Math.min(100, (s.count / base) * 100);
        const leak = i > 0 && s.stepRate < 0.5;
        return (
          <div key={s.key} className="flex items-center gap-3">
            <span className="w-[150px] shrink-0 text-[12.5px] text-muted-foreground">{s.label}</span>
            <div className="relative h-7 min-w-0 flex-1 overflow-hidden rounded-md bg-secondary/40">
              <div
                className={cn(
                  "h-full rounded-md transition-[width] duration-300",
                  i === 0 ? "bg-muted-foreground/25" : "bg-primary/70",
                )}
                style={{ width: `${Math.max(width, 1.5)}%` }}
              />
              <span className="absolute inset-y-0 left-2.5 flex items-center font-mono text-[12px] font-semibold tabular-nums">
                {compact(s.count)}
              </span>
            </div>
            <span
              className={cn(
                "w-[104px] shrink-0 text-right font-mono text-[11.5px] tabular-nums",
                leak ? "text-warning" : "text-muted-foreground",
              )}
            >
              {i === 0 ? "—" : `${(s.stepRate * 100).toFixed(s.stepRate < 0.1 ? 1 : 0)}% of above`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Table ─────────────────────────── */

function PerformanceTable({
  rows,
  symbol,
}: {
  rows: ReturnType<typeof rollUpPerformance>;
  symbol: string;
}) {
  if (rows.length === 0) {
    return <Empty>Nothing has spent yet at this level.</Empty>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Name</th>
            <th className="px-3 py-2.5 text-right font-medium">Spend</th>
            <th className="px-3 py-2.5 text-right font-medium">Convs</th>
            <th className="px-3 py-2.5 text-right font-medium">Cost / conv</th>
            <th className="px-3 py-2.5 text-right font-medium">Qualified</th>
            <th className="px-3 py-2.5 text-right font-medium">CPL</th>
            <th className="px-3 py-2.5 text-right font-medium">Conversions</th>
            <th className="px-3 py-2.5 text-right font-medium">CPP</th>
            <th className="px-3 py-2.5 text-right font-medium">ROAS</th>
            <th className="px-4 py-2.5 text-right font-medium">Avg reply</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const slow = r.avgFirstResponseLatencyMs > FAST_RESPONSE_THRESHOLD_MS;
            return (
              <tr key={r.id} className="transition-colors hover:bg-accent/30">
                <td className="px-4 py-2.5">
                  <p className="truncate text-[12.5px] font-medium">{r.name}</p>
                  <p className="truncate font-mono text-[10.5px] text-muted-foreground">{r.id}</p>
                </td>
                <Num>{money(r.spend, symbol)}</Num>
                <Num>{compact(r.conversationsStarted)}</Num>
                <Num>{r.conversationsStarted ? money(r.costPerConversationStarted, symbol) : "—"}</Num>
                <Num>{compact(r.qualifiedLeads)}</Num>
                <Num>{r.qualifiedLeads ? money(r.cpl, symbol) : "—"}</Num>
                <Num>{r.purchases}</Num>
                <Num>{r.purchases ? money(r.cpp, symbol) : "—"}</Num>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums",
                    r.revenue > 0 && (r.roas >= 1 ? "text-success" : "text-destructive"),
                  )}
                >
                  {r.revenue ? `${r.roas.toFixed(2)}x` : "—"}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right font-mono text-[12.5px] tabular-nums",
                    slow ? "text-warning" : "text-muted-foreground",
                  )}
                >
                  {latency(r.avgFirstResponseLatencyMs)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums">{children}</td>
  );
}

/* ─────────────────────────── Recommendations ─────────────────────────── */

const SEVERITY_META: Record<
  RecommendationSeverity,
  { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }
> = {
  critical: {
    label: "Costing money now",
    tone: "border-destructive/30 bg-destructive/10 text-destructive",
    icon: AlertTriangle,
  },
  warning: {
    label: "Worth fixing",
    tone: "border-warning/30 bg-warning/10 text-warning",
    icon: Timer,
  },
  opportunity: {
    label: "Upside available",
    tone: "border-success/30 bg-success/10 text-success",
    icon: Lightbulb,
  },
};

function RecommendationCard({ rec, onAct }: { rec: Recommendation; onAct: () => void }) {
  const meta = SEVERITY_META[rec.severity];
  const Icon = meta.icon;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border", meta.tone)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13.5px] font-medium">{rec.title}</p>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", meta.tone)}>
              {meta.label}
            </span>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{rec.body}</p>

          {/* The recommendation is only as good as this line. Without it the card
              is an opinion, so it renders on every card by construction. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px]">
              <Info className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">{rec.evidence.label}</span>
              <span className="font-mono font-semibold tabular-nums">{rec.evidence.value}</span>
              {rec.evidence.comparison && (
                <span className="text-muted-foreground">vs {rec.evidence.comparison}</span>
              )}
            </span>
            {rec.action && (
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onAct}>
                {rec.action.label} <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
