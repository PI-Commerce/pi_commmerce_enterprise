import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Link2, Megaphone, Unplug } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { AdsConnectDialog } from "@/components/ads/AdsConnectDialog";
import { AdsList } from "@/components/ads/AdsList";
import { setAdConnection, useAdConnection } from "@/lib/ctwa-connection-store";

export const Route = createFileRoute("/channels/meta-ads")({
  component: MetaAdsManage,
  head: () => ({ meta: [{ title: "Ads · Pi Commerce Enterprise" }] }),
});

/**
 * Channels → Meta Ads. A bare-bones view of the Click-to-WhatsApp ads linked from
 * the connected Meta ad account.
 *
 * Pi Commerce does not author, budget, target or report on ads here — creative and
 * spend are owned in Meta Ads Manager and synced in via the Marketing API. This page
 * exists only so a merchant can confirm the connection and see which ads are available
 * to reference. A flow ingests these ads by selecting Click-to-WhatsApp as the source
 * on its Audience node, where attribution and analytics live.
 */
function MetaAdsManage() {
  const connection = useAdConnection();
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <AppShell bare>
      <div className="flex h-full flex-col">
        <div className="shrink-0 px-8 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold tracking-tight">Ads</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Click-to-WhatsApp ads linked from your Meta ad account. Reference them from a campaign's
                Audience node to route clicks into a flow.
              </p>
            </div>
            {connection && (
              <div className="flex shrink-0 items-center gap-2">
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
        </div>

        <div className="min-h-0 flex-1 pt-6">
          {connection ? (
            <AdsList />
          ) : (
            <div className="h-full overflow-y-auto">
              <div className="px-8 pb-8">
                <NotConnected onConnect={() => setConnectOpen(true)} />
              </div>
            </div>
          )}
        </div>
      </div>

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
