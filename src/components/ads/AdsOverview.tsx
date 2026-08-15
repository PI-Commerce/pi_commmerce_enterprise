/**
 * Ads Manager → Overview. What is connected, what is running, and what it cost.
 *
 * Deliberately the same three-band layout as the WhatsApp Overview (connected
 * assets, a status band, a stat strip) so Channels reads as one surface rather
 * than two products stapled together. All numbers roll up from the same tap log
 * the analytics tab reads, so nothing here can disagree with anything there.
 */
import { useMemo } from "react";
import {
  Activity, BadgeCheck, Building2, CreditCard, Gauge, Megaphone, MessageCircle,
  Radio, Timer,
} from "lucide-react";
import { useRegion } from "@/lib/region";
import { Kpi, Section, Stat, StatusPill, compact, latency, money } from "@/components/ads/ui";
import { rollUpPerformance } from "@/lib/ctwa-sim";
import { useCapiEvents, useCtwaAds, useCtwaConversations } from "@/lib/ctwa-store";
import { FAST_RESPONSE_THRESHOLD_MS, type AdAccountConnection } from "@/lib/ctwa-types";

export function AdsOverview({ connection }: { connection: AdAccountConnection }) {
  const { symbol } = useRegion();
  const ads = useCtwaAds();
  const conversations = useCtwaConversations();
  const capiEvents = useCapiEvents();

  const totals = useMemo(() => {
    const rows = rollUpPerformance("ad", ads, conversations);
    const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + pick(r), 0);
    const spend = sum((r) => r.spend);
    const revenue = sum((r) => r.revenue);
    const started = sum((r) => r.conversationsStarted);
    const latencySum = rows.reduce((n, r) => n + r.avgFirstResponseLatencyMs * r.conversationsStarted, 0);
    return {
      spend,
      revenue,
      started,
      clicks: sum((r) => r.clicks),
      purchases: sum((r) => r.purchases),
      roas: spend > 0 ? revenue / spend : 0,
      costPerConversation: started > 0 ? spend / started : 0,
      avgLatency: started > 0 ? latencySum / started : 0,
    };
  }, [ads, conversations]);

  const live = ads.filter((a) => a.status === "active");
  const inReview = ads.filter((a) => a.status === "in_review");
  const pendingCapi = capiEvents.filter((e) => e.status === "pending").length;
  const expiredCapi = capiEvents.filter((e) => e.status === "expired").length;
  const slowReplies = totals.avgLatency > FAST_RESPONSE_THRESHOLD_MS;

  return (
    <div className="h-full overflow-y-auto px-8 pb-6">
      <div className="space-y-8 pb-10">
        <Section title="Performance" desc="Across every ad in this account, attributed by ctwa_clid.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Spend" value={money(totals.spend, symbol)} sub={`${compact(totals.clicks)} ad clicks`} />
            <Kpi
              label="Conversations started"
              value={compact(totals.started)}
              sub={`${money(totals.costPerConversation, symbol)} each`}
            />
            <Kpi
              label="Attributed revenue"
              value={money(totals.revenue, symbol)}
              sub={`${totals.purchases} conversions`}
            />
            <Kpi
              label="ROAS"
              value={`${totals.roas.toFixed(2)}x`}
              tone={totals.roas >= 1 ? "positive" : "negative"}
              sub={totals.roas >= 1 ? "Above break-even" : "Below break-even"}
            />
          </div>
        </Section>

        <Section title="Delivery" desc="Live state of the account and the conversion feedback loop.">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Stat icon={Radio} label="Ads running" value={`${live.length} active`} />
              <Stat
                icon={Activity}
                label="Awaiting Meta review"
                value={inReview.length ? `${inReview.length} in review` : "None"}
              />
              <Stat
                icon={Gauge}
                label="Conversions queued to Meta"
                value={pendingCapi ? `${pendingCapi} pending` : "All dispatched"}
                valueClass={pendingCapi ? "text-warning" : "text-foreground"}
              />
              <Stat
                icon={Timer}
                label="Avg first response"
                value={latency(totals.avgLatency)}
                valueClass={slowReplies ? "text-warning" : "text-success"}
              />
            </div>
            {(expiredCapi > 0 || slowReplies) && (
              <div className="mt-5 space-y-2 border-t border-border pt-4">
                {expiredCapi > 0 && (
                  <p className="text-[12px] text-muted-foreground">
                    <span className="font-medium text-destructive">{expiredCapi} conversions expired</span> — they landed
                    outside Meta's 7-day attribution window, so the delivery model never learned from them.
                  </p>
                )}
                {slowReplies && (
                  <p className="text-[12px] text-muted-foreground">
                    <span className="font-medium text-warning">Replies are slower than {FAST_RESPONSE_THRESHOLD_MS / 1000}s</span> —
                    Meta's guidance is that faster first responses materially lift CTWA conversion.
                  </p>
                )}
              </div>
            )}
          </div>
        </Section>

        <Section title="Connected assets" desc="The Meta and WhatsApp assets Click-to-WhatsApp ads run through.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AssetCard
              icon={Building2}
              label="Business Portfolio"
              name={connection.fbBusinessName}
              meta={connection.fbBusinessId}
            />
            <AssetCard
              icon={CreditCard}
              label="Ad account"
              name="Pi Commerce · India"
              meta={connection.adAccountId}
            />
            <AssetCard icon={Megaphone} label="Page" name={connection.fbPageName} meta={connection.fbPageId} />
            <AssetCard
              icon={MessageCircle}
              label="WhatsApp destination"
              name={connection.wabaPhoneNumber}
              meta={`WABA ${connection.wabaId}`}
            />
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-success/25 bg-success/5 px-3 py-2 text-[12px] text-success">
            <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
            Conversions API registered for business messaging · connected {connection.connectedAt}
          </div>
        </Section>

        <Section title="Ads" desc="Every ad in the account and what it has returned.">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Ad</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Spend</th>
                  <th className="px-4 py-2.5 text-right font-medium">Conversations</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cost / conversation</th>
                  <th className="px-4 py-2.5 text-right font-medium">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ads.map((ad) => {
                  const perf = rollUpPerformance("ad", [ad], conversations)[0];
                  return (
                    <tr key={ad.id} className="transition-colors hover:bg-accent/30">
                      <td className="px-4 py-2.5">
                        <p className="truncate text-[12.5px] font-medium">{ad.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{ad.metaCampaignName}</p>
                      </td>
                      <td className="px-4 py-2.5"><StatusPill status={ad.status} /></td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12.5px] tabular-nums">
                        {perf ? money(perf.spend, symbol) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12.5px] tabular-nums">
                        {perf ? perf.conversationsStarted : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12.5px] tabular-nums">
                        {perf?.conversationsStarted ? money(perf.costPerConversationStarted, symbol) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12.5px] tabular-nums">
                        {perf?.revenue ? `${perf.roas.toFixed(2)}x` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}

function AssetCard({
  icon: Icon, label, name, meta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  name: string;
  meta: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10.5px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 truncate text-[13.5px] font-medium">{name}</p>
      <p className="truncate font-mono text-[11px] text-muted-foreground">{meta}</p>
    </div>
  );
}
