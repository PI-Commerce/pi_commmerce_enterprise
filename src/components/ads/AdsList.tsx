/**
 * Ads Manager → Ads tab. A read-only view of the Click-to-WhatsApp ads synced
 * from the connected Meta ad account.
 *
 * Ads are authored, funded and edited in Meta Ads Manager — Pi Commerce never
 * creates or mutates them; it fetches them via the Marketing API so a flow author
 * can see (and reference) the ads that feed their campaigns. The list still surfaces
 * the objective → optimisation-goal pairing on every row, because "Leads ·
 * Conversations" is the configuration that quietly buys chatter, and a warning dot
 * from `validateAd` flags it even though the fix now happens in Meta.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useRegion } from "@/lib/region";
import { CreativeTile, Empty, StatusPill, money } from "@/components/ads/ui";
import { useCtwaAds } from "@/lib/ctwa-store";
import {
  AD_STATUS_LABELS, GOAL_LABELS, OBJECTIVE_LABELS, validateAd,
  type AdStatus, type CtwaAd,
} from "@/lib/ctwa-types";

type StatusFilter = AdStatus | "all";

export function AdsList() {
  const ads = useCtwaAds();
  const { symbol } = useRegion();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [objective, setObjective] = useState<string>("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ads.filter(
      (a) =>
        (status === "all" || a.status === status) &&
        (objective === "all" || a.objective === objective) &&
        (!q ||
          a.name.toLowerCase().includes(q) ||
          a.headline.toLowerCase().includes(q) ||
          a.adSetName.toLowerCase().includes(q) ||
          a.metaCampaignName.toLowerCase().includes(q)),
    );
  }, [ads, query, status, objective]);

  return (
    <div className="h-full overflow-y-auto px-8 pb-10">
      <div className="mb-3 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <RefreshCw className="h-3 w-3" />
        Synced from Meta Ads Manager via the Marketing API. Ads are created and edited in Meta.
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ads, ad sets or campaigns"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(AD_STATUS_LABELS) as AdStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{AD_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={objective} onValueChange={setObjective}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All objectives</SelectItem>
            {Object.entries(OBJECTIVE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <Empty>No ads match these filters.</Empty>
      ) : (
        <TooltipProvider delayDuration={150}>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Ad</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Objective → goal</th>
                  <th className="px-4 py-2.5 text-left font-medium">Ad set</th>
                  <th className="px-4 py-2.5 text-right font-medium">Daily budget</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((ad) => (
                  <Row key={ad.id} ad={ad} symbol={symbol} />
                ))}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}

function Row({ ad, symbol }: { ad: CtwaAd; symbol: string }) {
  const check = validateAd(ad);

  return (
    <tr className="transition-colors hover:bg-accent/30">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <CreativeTile mediaUrl={ad.mediaUrl} format={ad.format} className="h-9 w-9" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{ad.name || "Untitled ad"}</p>
            <p className="truncate text-[11.5px] text-muted-foreground">{ad.headline || "No headline"}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <StatusPill status={ad.status} />
          {ad.status === "rejected" && ad.rejectionReason && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-destructive"><AlertTriangle className="h-3.5 w-3.5" /></span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] text-[11px] leading-snug">
                {ad.rejectionReason}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px]">
            {OBJECTIVE_LABELS[ad.objective]} <span className="text-muted-foreground">→</span>{" "}
            {GOAL_LABELS[ad.optimizationGoal]}
          </span>
          {check.warnings.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn("cursor-help", "text-warning")}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[300px] text-[11px] leading-snug">
                {check.warnings[0]}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="truncate text-[12.5px]">{ad.adSetName}</p>
        <p className="truncate text-[11px] text-muted-foreground">{ad.metaCampaignName}</p>
      </td>
      <td className="px-4 py-3 text-right font-mono text-[12.5px] tabular-nums">
        {money(ad.dailyBudget, symbol)}
      </td>
    </tr>
  );
}
