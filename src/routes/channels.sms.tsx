import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { SmsOverview } from "@/components/integrations/SmsOverview";
import { SmsTemplates } from "@/components/integrations/SmsTemplates";
import { useSmsConfig, useSmsTemplates } from "@/lib/sms-store";

export const Route = createFileRoute("/channels/sms")({
  component: SmsManage,
  head: () => ({ meta: [{ title: "SMS · Pi Commerce Enterprise" }] }),
});

type Tab = "overview" | "templates";

/**
 * Channels → SMS. Same page shape as Channels → WhatsApp — a thin header, then
 * Overview (the DLT setup) and Templates (the mirrored DLT template registry).
 *
 * The header carries no connection actions: SMS is provisioned by Pi Commerce
 * operations from the backend, so there is no connect / reconnect / disconnect
 * lifecycle for the client to drive, and therefore no not-connected empty state
 * either (see {@link SmsOverview}).
 */
function SmsManage() {
  const config = useSmsConfig();
  const templates = useSmsTemplates();
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <AppShell bare>
      <div className="flex h-full flex-col">
        {/* Page header */}
        <div className="shrink-0 px-8 pt-6">
          <div>
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold tracking-tight">SMS</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your DLT registration and the templates available to SMS campaign nodes.
              </p>
            </div>

            <div className="mt-6">
              <PageTabs<Tab>
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: "overview", label: "Overview" },
                  { id: "templates", label: "Templates", count: templates.length },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1">
          {tab === "overview" ? <SmsOverview config={config} /> : <SmsTemplates config={config} />}
        </div>
      </div>
    </AppShell>
  );
}
