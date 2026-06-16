import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageTabs } from "@/components/app/Tabs";
import { Button } from "@/components/ui/button";
import { ChevronLeft, MessageCircle, Link2, Unplug } from "lucide-react";
import { WhatsAppOverview } from "@/components/integrations/WhatsAppOverview";
import { WhatsAppTemplates } from "@/components/integrations/WhatsAppTemplates";
import { WhatsAppEmbeddedSignup } from "@/components/integrations/WhatsAppEmbeddedSignup";
import { useWabaConnection, setWabaConnection } from "@/lib/waba-store";

export const Route = createFileRoute("/integrations/whatsapp")({
  component: WhatsAppManage,
  head: () => ({ meta: [{ title: "WhatsApp Business · Pi Commerce Enterprise" }] }),
});

type Tab = "overview" | "templates";

/**
 * WhatsApp Business → full Manage page.
 *
 * A full-screen takeover (sidebar hidden) mirroring the campaign builder: a thin
 * h-12 top bar with breadcrumb + connection state + lifecycle actions, then a
 * scrollable, centered content column. Two tabs — Overview (connected assets,
 * status, sender quality) and Templates (the Template Manager). Connection state
 * comes from the shared {@link useWabaConnection} store so it survives navigation
 * from Integrations → Channels. When nothing is connected the body shows a dashed
 * empty state that launches Embedded Signup.
 */
function WhatsAppManage() {
  const connection = useWabaConnection();
  const [tab, setTab] = useState<Tab>("overview");
  const [signupOpen, setSignupOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/integrations"
            className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Back to integrations"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Integrations</span>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#25D366]/15 text-[#1FA855]">
            <MessageCircle className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-[13.5px] font-medium">WhatsApp Business</span>
          {connection ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Connected
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
              Not connected
            </span>
          )}
        </div>

        {connection && (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setSignupOpen(true)} className="h-8 gap-1.5 text-xs">
              <Link2 className="h-3.5 w-3.5" /> Reconnect
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWabaConnection(null)}
              className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Unplug className="h-3.5 w-3.5" /> Disconnect
            </Button>
          </div>
        )}
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1">
        {connection ? (
          <div className="flex h-full flex-col">
            {/* Frozen tabs — stay put while the tab content scrolls underneath */}
            <div className="shrink-0 px-8 pt-6">
              <div className="mx-auto max-w-6xl">
                <PageTabs<Tab>
                  value={tab}
                  onChange={setTab}
                  tabs={[
                    { id: "overview", label: "Overview" },
                    { id: "templates", label: "Templates" },
                  ]}
                />
              </div>
            </div>
            {/* Tab content fills the rest and manages its own scroll */}
            <div className="min-h-0 flex-1">
              {tab === "overview" && <WhatsAppOverview data={connection} />}
              {tab === "templates" && <WhatsAppTemplates waba={connection} />}
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-6xl px-8 py-8">
              <NotConnected onConnect={() => setSignupOpen(true)} />
            </div>
          </div>
        )}
      </div>

      <WhatsAppEmbeddedSignup
        open={signupOpen}
        onOpenChange={setSignupOpen}
        onComplete={(result) => setWabaConnection(result)}
      />
    </div>
  );
}

function NotConnected({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#25D366]/15 text-[#1FA855]">
          <MessageCircle className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-semibold">Connect WhatsApp Business</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted-foreground">
          Pi Commerce is your BSP. Link your Meta Business Portfolio and WhatsApp Business Account
          through Embedded Signup to start sending templates and going live in minutes.
        </p>
        <Button className="mt-5 gap-1.5" onClick={onConnect}>
          <Link2 className="h-4 w-4" /> Connect with Meta
        </Button>
      </div>
    </div>
  );
}
