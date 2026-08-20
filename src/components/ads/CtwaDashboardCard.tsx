/**
 * Click-to-WhatsApp on the dashboard.
 *
 * One band rather than four more tiles in the KPI row, for two reasons. The
 * numbers here are live — derived from the tap log the Ads Manager reads — and
 * sitting them individually among static workspace counters would imply they
 * are the same kind of thing. And the point of the band is not the spend; it is
 * the line at the bottom, which surfaces the most urgent finding the
 * recommendation engine has and links straight to it. A dashboard that shows
 * you a good ROAS while an ad is quietly buying the wrong people is worse than
 * no dashboard.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpRight, Lightbulb, Megaphone, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRegion } from "@/lib/region";
import { compact, money } from "@/components/ads/ui";
import { rollUpPerformance } from "@/lib/ctwa-sim";
import { getRecommendations, type RecommendationSeverity } from "@/lib/ctwa-recommendations";
import { useAdConnection } from "@/lib/ctwa-connection-store";
import {
  useCapiEvents, useCtwaAds, useCtwaConversations, useOutcomeAudiences, useSimNow,
} from "@/lib/ctwa-store";

const SEVERITY_TONE: Record<
  RecommendationSeverity,
  { tone: string; icon: React.ComponentType<{ className?: string }> }
> = {
  critical: { tone: "text-destructive", icon: AlertTriangle },
  warning: { tone: "text-warning", icon: Timer },
  opportunity: { tone: "text-success", icon: Lightbulb },
};

export function CtwaDashboardCard() {
  const connection = useAdConnection();
  const { symbol } = useRegion();
  const ads = useCtwaAds();
  const conversations = useCtwaConversations();
  const capiEvents = useCapiEvents();
  const audiences = useOutcomeAudiences();
  const nowMs = useSimNow();

  if (!connection) {
    return (
      <Link
        to="/channels/meta-ads"
        className="group mt-6 flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-4 py-3.5 transition-colors hover:border-foreground/20 hover:bg-accent/30"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#0866FF]/15 text-[#0866FF]">
          <Megaphone className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">Run Click-to-WhatsApp ads</p>
          <p className="text-[11.5px] text-muted-foreground">
            Connect a Meta ad account to buy conversations and feed their outcomes back to Meta.
          </p>
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </Link>
    );
  }

  const rows = rollUpPerformance("ad", ads, conversations);
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + pick(r), 0);
  const spend = sum((r) => r.spend);
  const revenue = sum((r) => r.revenue);
  const started = sum((r) => r.conversationsStarted);
  const live = ads.filter((a) => a.status === "active").length;

  const top = getRecommendations({
    ads,
    conversations,
    capiEvents,
    performance: rows,
    audiences,
    nowMs,
    currencySymbol: symbol,
  })[0];
  const sev = top ? SEVERITY_TONE[top.severity] : undefined;
  const SevIcon = sev?.icon;

  return (
    <div className="mt-6 rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Click-to-WhatsApp</h2>
          <p className="text-[11px] text-muted-foreground">
            {live} ad{live === 1 ? "" : "s"} live · attributed by ctwa_clid
          </p>
        </div>
        <Link
          to="/channels/meta-ads"
          className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
        >
          Open Ads Manager <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border md:grid-cols-4">
        <Cell label="Ad spend" value={money(spend, symbol)} />
        <Cell label="Conversations started" value={compact(started)} />
        <Cell
          label="Cost / conversation"
          value={started ? money(spend / started, symbol) : "—"}
        />
        <Cell
          label="ROAS"
          value={spend ? `${(revenue / spend).toFixed(2)}x` : "—"}
          valueClass={spend && revenue / spend >= 1 ? "text-success" : "text-destructive"}
        />
      </div>

      {top && SevIcon && (
        <Link
          to="/channels/meta-ads"
          className="flex items-center gap-2 border-t border-border px-4 py-2.5 transition-colors hover:bg-accent/30"
        >
          <SevIcon className={cn("h-3.5 w-3.5 shrink-0", sev!.tone)} />
          <p className="min-w-0 flex-1 truncate text-[12px]">
            {top.title}
            <span className="ml-2 font-mono text-[11px] text-muted-foreground">
              {top.evidence.label} {top.evidence.value}
            </span>
          </p>
          <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        </Link>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tracking-tight tabular-nums", valueClass)}>{value}</p>
    </div>
  );
}
