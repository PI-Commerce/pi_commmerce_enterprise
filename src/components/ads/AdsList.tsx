/**
 * Ads Manager → Ads tab. The list of Click-to-WhatsApp ads plus their lifecycle.
 *
 * The list is where the objective trap becomes visible at a glance: every row
 * shows objective → optimisation goal together, because "Leads · Conversations"
 * is the configuration that quietly buys chatter, and seeing it on the row is
 * what prompts someone to open the ad. Rows carry a warning dot when
 * `validateAd` has something to say.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle, Copy, MoreHorizontal, PauseCircle, Play, Plus, Search, Send, Trash2, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useRegion } from "@/lib/region";
import { CreativeTile, Empty, StatusPill, money } from "@/components/ads/ui";
import { reviewAd } from "@/lib/ctwa-sim";
import {
  getCtwaAd, removeCtwaAd, setAdStatus, upsertCtwaAd, useCtwaAds,
} from "@/lib/ctwa-store";
import {
  AD_STATUS_LABELS, GOAL_LABELS, OBJECTIVE_LABELS, validateAd,
  type AdStatus, type CtwaAd,
} from "@/lib/ctwa-types";

/** How long the mock review takes before Meta answers. */
const REVIEW_MS = 3200;

type StatusFilter = AdStatus | "all";

export function AdsList({ onEdit, onCreate }: { onEdit: (ad: CtwaAd) => void; onCreate: () => void }) {
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

  const submit = (ad: CtwaAd) => {
    const check = validateAd(ad);
    if (!check.valid) {
      toast.error("Ad is incomplete", { description: check.errors[0] });
      return;
    }
    setAdStatus(ad.id, "in_review");
    toast.success("Submitted to Meta for review");
    // The verdict lands asynchronously, exactly as the ad-review webhook would.
    setTimeout(() => {
      const latest = getCtwaAd(ad.id);
      if (!latest || latest.status !== "in_review") return;
      const verdict = reviewAd(latest);
      if (verdict.approved) {
        setAdStatus(ad.id, "active");
        toast.success(`${latest.name} approved and live`);
      } else {
        setAdStatus(ad.id, "rejected", verdict.reason);
        toast.error(`${latest.name} was rejected`, { description: verdict.reason });
      }
    }, REVIEW_MS);
  };

  const duplicate = (ad: CtwaAd) => {
    const copy: CtwaAd = {
      ...ad,
      id: `ad_copy_${Date.now()}`,
      name: `${ad.name} (copy)`,
      status: "draft",
      rejectionReason: undefined,
      submittedAt: undefined,
    };
    upsertCtwaAd(copy);
    toast.success(`Duplicated as ${copy.name}`);
  };

  return (
    <div className="h-full overflow-y-auto px-8 pb-10">
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
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5" /> Create ad
        </Button>
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
                  <th className="px-4 py-2.5 text-right font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((ad) => (
                  <Row
                    key={ad.id}
                    ad={ad}
                    symbol={symbol}
                    onEdit={() => onEdit(ad)}
                    onSubmit={() => submit(ad)}
                    onDuplicate={() => duplicate(ad)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}

function Row({
  ad, symbol, onEdit, onSubmit, onDuplicate,
}: {
  ad: CtwaAd;
  symbol: string;
  onEdit: () => void;
  onSubmit: () => void;
  onDuplicate: () => void;
}) {
  const check = validateAd(ad);
  const canSubmit = ad.status === "draft" || ad.status === "rejected";

  return (
    <tr className="transition-colors hover:bg-accent/30">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <CreativeTile mediaUrl={ad.mediaUrl} format={ad.format} className="h-9 w-9" />
          <div className="min-w-0">
            <button onClick={onEdit} className="block truncate text-left text-[13px] font-medium hover:underline">
              {ad.name || "Untitled ad"}
            </button>
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
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {canSubmit && (
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={onSubmit}>
              <Send className="h-3 w-3" /> Submit
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={`Actions for ${ad.name}`}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}><Copy className="mr-2 h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
              {ad.status === "active" && (
                <DropdownMenuItem onClick={() => setAdStatus(ad.id, "paused")}>
                  <PauseCircle className="mr-2 h-3.5 w-3.5" /> Pause
                </DropdownMenuItem>
              )}
              {ad.status === "paused" && (
                <DropdownMenuItem onClick={() => setAdStatus(ad.id, "active")}>
                  <Play className="mr-2 h-3.5 w-3.5" /> Resume
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => { removeCtwaAd(ad.id); toast.success(`Deleted ${ad.name}`); }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
