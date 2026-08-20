/**
 * Where a lead actually came from, on the lead's own page.
 *
 * This is the payoff for carrying `ctwa_clid` through the whole model. Without
 * it a WhatsApp lead is just a phone number that appeared — the merchant paid
 * for it and has no way to know which ad, which creative, or what it cost. With
 * it, the ad is named on the record.
 *
 * Deliberately renders nothing when a lead has no ad-sourced conversation:
 * organic leads are the common case and an "unattributed" placeholder on every
 * one of them is noise. The block appearing at all is the signal.
 *
 * Nothing was added to {@link LeadRecord} to make this work. Attribution is a
 * join on the conversation feed, exactly as it would be against a real
 * conversation store — so the lead model stays owned by the leads domain.
 */
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Megaphone, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRegion } from "@/lib/region";
import { CreativeTile, latency, money } from "@/components/ads/ui";
import { useConversationsForLead, useCtwaAds } from "@/lib/ctwa-store";
import {
  FAST_RESPONSE_THRESHOLD_MS,
  OUTCOME_STAGE_LABELS,
  type CtwaConversation,
  type OutcomeStage,
} from "@/lib/ctwa-types";

const STAGE_TONE: Record<OutcomeStage, string> = {
  clicked: "border-border bg-secondary text-muted-foreground",
  opened_whatsapp: "border-border bg-secondary text-muted-foreground",
  conversation_started: "border-ai/30 bg-ai/10 text-ai",
  qualified: "border-warning/30 bg-warning/10 text-warning",
  converted: "border-success/30 bg-success/10 text-success",
  dropped: "border-destructive/30 bg-destructive/10 text-destructive",
};

function formatClickedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LeadAdSource({ leadId }: { leadId: string }) {
  const conversations = useConversationsForLead(leadId);
  const ads = useCtwaAds();

  if (conversations.length === 0) return null;

  return (
    <div className="mb-5 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
            Acquired from a Click-to-WhatsApp ad
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Attributed on the ctwa_clid Meta stamped on the first inbound message.
          </p>
        </div>
        <Link
          to="/channels/meta-ads"
          className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
        >
          Meta Ads <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-4 space-y-3">
        {conversations.map((c) => (
          <SourceRow key={c.id} conversation={c} ad={ads.find((a) => a.id === c.sourceId)} />
        ))}
      </div>
    </div>
  );
}

function SourceRow({
  conversation: c,
  ad,
}: {
  conversation: CtwaConversation;
  ad?: ReturnType<typeof useCtwaAds>[number];
}) {
  const { symbol } = useRegion();
  const slow =
    c.firstResponseLatencyMs !== undefined && c.firstResponseLatencyMs > FAST_RESPONSE_THRESHOLD_MS;

  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex items-start gap-3">
        {ad && <CreativeTile mediaUrl={ad.mediaUrl} format={ad.format} className="h-10 w-10" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[13px] font-medium">{ad?.name ?? c.sourceId}</p>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                STAGE_TONE[c.outcomeStage],
              )}
            >
              {OUTCOME_STAGE_LABELS[c.outcomeStage]}
            </span>
          </div>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {ad ? `${ad.metaCampaignName} · ${ad.adSetName}` : "Ad no longer in this account"}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/70 pt-3 md:grid-cols-4">
        <Cell label="ctwa_clid" value={c.ctwaClid} mono title={c.ctwaClid} />
        <Cell label="Clicked" value={formatClickedAt(c.startedAt)} />
        <Cell
          label="First reply"
          value={c.firstResponseLatencyMs !== undefined ? latency(c.firstResponseLatencyMs) : "No reply yet"}
          valueClass={slow ? "text-warning" : undefined}
          icon={slow ? Timer : undefined}
          title={
            slow
              ? `Slower than Meta's ${FAST_RESPONSE_THRESHOLD_MS / 1000}s guidance for CTWA first responses`
              : undefined
          }
        />
        <Cell
          label="Reported to Meta"
          value={
            c.conversionEvent
              ? c.conversionValue !== undefined
                ? `${c.conversionEvent} · ${money(c.conversionValue, symbol)}`
                : c.conversionEvent
              : "Nothing yet"
          }
        />
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  mono,
  valueClass,
  icon: Icon,
  title,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 flex items-center gap-1 truncate text-[12.5px]",
          mono && "font-mono",
          valueClass,
        )}
        title={title}
      >
        {Icon && <Icon className="h-3 w-3 shrink-0" />}
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}
