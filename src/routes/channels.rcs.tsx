import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { RcsOverview } from "@/components/integrations/RcsOverview";
import { RcsTemplates } from "@/components/integrations/RcsTemplates";
import { useRcsConfig, useRcsTemplates } from "@/lib/rcs-store";

export const Route = createFileRoute("/channels/rcs")({
  component: RcsManage,
  head: () => ({ meta: [{ title: "RCS · Pi Commerce Enterprise" }] }),
});

type Tab = "overview" | "templates";

/**
 * Channels → RCS. Same page shape as Channels → SMS / WhatsApp — a thin header,
 * then Overview (the brand/bot setup) and Templates (the RCS template registry).
 *
 * RCS is provisioned by Pi Commerce operations from the backend (brands + bots
 * onboarded via the DLT/vendor flow), so the header carries no connection
 * actions and there is no not-connected empty state (see {@link RcsOverview}).
 */
function RcsManage() {
  const config = useRcsConfig();
  const templates = useRcsTemplates();
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <AppShell bare>
      <div className="flex h-full flex-col">
        {/* Page header */}
        <div className="shrink-0 px-8 pt-6">
          <div>
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold tracking-tight">RCS</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your registered brands and bots, and the templates available to RCS campaign nodes.
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
          {tab === "overview" ? <RcsOverview config={config} /> : <RcsTemplates config={config} />}
        </div>
      </div>
    </AppShell>
  );
}
