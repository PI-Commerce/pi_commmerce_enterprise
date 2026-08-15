/**
 * Ads Manager → Closed loop.
 *
 * Three surfaces on one page because they are one mechanism, and splitting them
 * into tabs would hide the only thing worth understanding here: a conversation
 * outcome is worthless unless it travels back to Meta, and what travels back is
 * whatever the merchant declared a conversion to be.
 *
 *   define what counts  →  report it inside the window  →  retarget what didn't
 *
 * Reading top to bottom is the loop. The conversion points chosen in the first
 * band are the event names in the second; the conversations that never reach
 * them are the members in the third.
 */
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Section } from "@/components/ads/ui";
import { CapiLog } from "@/components/ads/CapiLog";
import { ConversionPointsEditor } from "@/components/ads/ConversionPoints";
import { OutcomeAudiences } from "@/components/ads/OutcomeAudiences";
import { useCtwaAds } from "@/lib/ctwa-store";
import { CAPI_WINDOW_DAYS } from "@/lib/ctwa-types";

const STEPS = [
  { n: 1, title: "Define the outcome", body: "Name what counts as a conversion inside a thread." },
  { n: 2, title: "Report it to Meta", body: `Push it back on ctwa_clid, inside ${CAPI_WINDOW_DAYS} days.` },
  { n: 3, title: "Retarget the rest", body: "Turn the threads that stalled into an audience." },
];

export function AdsClosedLoop({ onRetarget }: { onRetarget: (audienceId: string) => void }) {
  const ads = useCtwaAds();
  const [adId, setAdId] = useState(() => ads.find((a) => a.status === "active")?.id ?? ads[0]?.id ?? "");
  const ad = ads.find((a) => a.id === adId) ?? ads[0];

  return (
    <div className="h-full overflow-y-auto px-8 pb-6">
      <div className="space-y-8 pb-10">
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-stretch">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex flex-1 items-start gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary font-mono text-[11px] font-semibold text-muted-foreground">
                {s.n}
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium">{s.title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{s.body}</p>
              </div>
              {i < STEPS.length - 1 && (
                <ArrowRight className="mt-1 hidden h-3.5 w-3.5 shrink-0 text-muted-foreground/50 sm:block" />
              )}
            </div>
          ))}
        </div>

        <Section
          title="Conversion points"
          desc="What counts as a conversion in a WhatsApp thread. Meta can't see inside one, so this is the only definition it gets."
          action={
            ads.length > 1 && (
              <Select value={adId} onValueChange={setAdId}>
                <SelectTrigger className="h-8 w-[220px] text-[12.5px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ads.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )
          }
        >
          {ad ? (
            <ConversionPointsEditor key={ad.id} ad={ad} />
          ) : (
            <p className="text-[13px] text-muted-foreground">Create an ad first.</p>
          )}
        </Section>

        <Section
          title="Conversions API"
          desc="Outcomes travelling back to Meta, joined on ctwa_clid. Expired rows are revenue the delivery model never learned from."
        >
          <CapiLog />
        </Section>

        <Section
          title="Outcome audiences"
          desc="The threads that stalled. High intent, already engaged, and invisible to Meta until you build them here."
        >
          <OutcomeAudiences onRetarget={onRetarget} />
        </Section>
      </div>
    </div>
  );
}
