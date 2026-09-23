import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Button } from "@/components/ui/button";
import { MessageCircle, Link2, Unplug } from "lucide-react";
import { WhatsAppOverview } from "@/components/integrations/WhatsAppOverview";
import { WhatsAppTemplates } from "@/components/integrations/WhatsAppTemplates";
import { WhatsAppFreeformWorkflows } from "@/components/integrations/WhatsAppFreeformWorkflows";
import { WhatsAppEmbeddedSignup } from "@/components/integrations/WhatsAppEmbeddedSignup";
import { useWabaConnection, setWabaConnection } from "@/lib/waba-store";

export const Route = createFileRoute("/channels/whatsapp")({
  component: WhatsAppManage,
  head: () => ({ meta: [{ title: "WhatsApp Business · Pi Commerce Enterprise" }] }),
});

type Tab = "overview" | "templates" | "freeform";

/**
 * Channels → WhatsApp Business. A normal in-app page (keeps the sidebar): a thin
 * header with the channel name, connection state and lifecycle actions, then two
 * tabs — Overview (connected assets, status, sender quality) and Templates (the
 * Template Manager). Connection state comes from the shared {@link useWabaConnection}
 * store. The Template *create* flow is its own full-screen surface (TemplateForm is
 * a fixed inset-0 overlay), so only that step takes over the whole window.
 */
function WhatsAppManage() {
  const connection = useWabaConnection();
  const [tab, setTab] = useState<Tab>("overview");
  const [signupOpen, setSignupOpen] = useState(false);

  return (
    <AppShell bare>
      <div className="flex h-full flex-col">
        {/* Page header — standard title block, aligned with the page content below */}
        <div className="shrink-0 px-8 pt-6">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-[22px] font-semibold tracking-tight">WhatsApp Business</h1>
                <p className="mt-1 text-sm text-muted-foreground">Manage your WhatsApp Business connection and message templates.</p>
              </div>
              {connection && (
                <div className="flex shrink-0 items-center gap-2">
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
            </div>

            {connection && (
              <div className="mt-6">
                <PageTabs<Tab>
                  value={tab}
                  onChange={setTab}
                  tabs={[
                    { id: "overview", label: "Overview" },
                    { id: "templates", label: "Templates" },
                    { id: "freeform", label: "Freeform Workflows" },
                  ]}
                />
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1">
          {connection ? (
            tab === "overview" ? (
              <WhatsAppOverview data={connection} />
            ) : tab === "templates" ? (
              <WhatsAppTemplates waba={connection} />
            ) : (
              <WhatsAppFreeformWorkflows />
            )
          ) : (
            <div className="h-full overflow-y-auto">
              <div className="px-8 pb-8 pt-6">
                <NotConnected onConnect={() => setSignupOpen(true)} />
              </div>
            </div>
          )}
        </div>
      </div>

      <WhatsAppEmbeddedSignup
        open={signupOpen}
        onOpenChange={setSignupOpen}
        onComplete={(result) => setWabaConnection(result)}
      />
    </AppShell>
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
