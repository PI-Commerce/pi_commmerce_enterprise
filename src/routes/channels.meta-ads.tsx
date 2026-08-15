import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Link2, Megaphone, Unplug } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Button } from "@/components/ui/button";
import { AdComposer } from "@/components/ads/AdComposer";
import { AdsClosedLoop } from "@/components/ads/AdsClosedLoop";
import { AdsConnectDialog } from "@/components/ads/AdsConnectDialog";
import { AdsList } from "@/components/ads/AdsList";
import { AdsOverview } from "@/components/ads/AdsOverview";
import { SimClock } from "@/components/ads/SimClock";
import { setAdConnection, useAdConnection } from "@/lib/ctwa-connection-store";
import { getCtwaAd, newAdDraft, setAdStatus, upsertCtwaAd } from "@/lib/ctwa-store";
import { reviewAd } from "@/lib/ctwa-sim";
import type { CtwaAd } from "@/lib/ctwa-types";

export const Route = createFileRoute("/channels/meta-ads")({
  component: MetaAdsManage,
  head: () => ({ meta: [{ title: "Meta Ads · Pi Commerce Enterprise" }] }),
});

type Tab = "overview" | "ads" | "loop";

/** How long the mock Meta review takes before a verdict lands. */
const REVIEW_MS = 3200;

/**
 * Channels → Meta Ads. The Click-to-WhatsApp Ads Manager.
 *
 * Same page skeleton as Channels → WhatsApp Business: header, lifecycle actions,
 * tabs, and a not-connected state gated on the shared connection store. The ad
 * composer is a full-screen overlay in the same way the template form is, so it
 * takes over the window rather than nesting inside a tab.
 *
 * Everything CTWA lives under this route — including its analytics — because the
 * numbers only make sense next to the ads that produced them.
 */
function MetaAdsManage() {
  const connection = useAdConnection();
  const [tab, setTab] = useState<Tab>("overview");
  const [connectOpen, setConnectOpen] = useState(false);
  const [editing, setEditing] = useState<CtwaAd | null>(null);

  // Submitting from the composer saves first, then runs the same review the list
  // does — a draft can't sit in review without also being persisted.
  const submitForReview = (ad: CtwaAd) => {
    upsertCtwaAd(ad);
    setAdStatus(ad.id, "in_review");
    setEditing(null);
    toast.success("Submitted to Meta for review");
    setTimeout(() => {
      const latest = getCtwaAd(ad.id);
      if (!latest || latest.status !== "in_review") return;
      const verdict = reviewAd(latest);
      if (verdict.approved) {
        setAdStatus(latest.id, "active");
        toast.success(`${latest.name} approved and live`);
      } else {
        setAdStatus(latest.id, "rejected", verdict.reason);
        toast.error(`${latest.name} was rejected`, { description: verdict.reason });
      }
    }, REVIEW_MS);
  };

  // An outcome audience is only worth building if something can be run against
  // it, so retargeting opens the composer on a fresh ad already targeting it
  // rather than telling the merchant where to find it.
  const retarget = (audienceId: string) => {
    const draft = newAdDraft();
    setEditing({
      ...draft,
      targeting: { ...draft.targeting, customAudienceIds: [audienceId] },
    });
  };

  return (
    <AppShell bare>
      <div className="flex h-full flex-col">
        <div className="shrink-0 px-8 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold tracking-tight">Meta Ads</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Run Click-to-WhatsApp ads and close the loop from conversation outcome back to Meta.
              </p>
            </div>
            {connection && (
              <div className="flex shrink-0 items-center gap-2">
                <SimClock />
                <Button variant="outline" size="sm" onClick={() => setConnectOpen(true)} className="h-8 gap-1.5 text-xs">
                  <Link2 className="h-3.5 w-3.5" /> Reconnect
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAdConnection(null)}
                  className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Unplug className="h-3.5 w-3.5" /> Disconnect
                </Button>
              </div>
            )}
          </div>

          {connection && (
            <div className="mt-6">
              <PageTabs<Tab>
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: "overview", label: "Overview" },
                  { id: "ads", label: "Ads" },
                  { id: "loop", label: "Closed loop" },
                ]}
              />
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1">
          {connection ? (
            tab === "overview" ? (
              <AdsOverview connection={connection} />
            ) : tab === "ads" ? (
              <AdsList onEdit={setEditing} onCreate={() => setEditing(newAdDraft())} />
            ) : (
              <AdsClosedLoop onRetarget={retarget} />
            )
          ) : (
            <div className="h-full overflow-y-auto">
              <div className="px-8 pb-8 pt-6">
                <NotConnected onConnect={() => setConnectOpen(true)} />
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <AdComposer
          key={editing.id}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(ad) => { upsertCtwaAd(ad); setEditing(null); }}
          onSubmitForReview={submitForReview}
        />
      )}

      <AdsConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onComplete={(result) => setAdConnection(result)}
      />
    </AppShell>
  );
}

function NotConnected({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#0866FF]/15 text-[#0866FF]">
          <Megaphone className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-semibold">Connect your Meta ad account</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted-foreground">
          Link your Business Portfolio, ad account and Page to run Click-to-WhatsApp ads. Pi Commerce
          registers the Conversions API endpoint so conversation outcomes flow back to Meta.
        </p>
        <Button className="mt-5 gap-1.5" onClick={onConnect}>
          <Link2 className="h-4 w-4" /> Connect with Meta
        </Button>
      </div>
    </div>
  );
}
