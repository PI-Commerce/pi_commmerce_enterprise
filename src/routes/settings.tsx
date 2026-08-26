/**
 * Settings surface.
 *
 * Workspace administration only. Developer surfaces (API keys, webhooks, etc.)
 * moved to /developer. Both tabs render as disabled placeholders until we
 * ship the underlying admin functionality.
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";

export const Route = createFileRoute("/settings")({
  component: Settings,
  head: () => ({ meta: [{ title: "Settings · Pi Commerce Enterprise" }] }),
});

type Tab = "usage-billing" | "team";

function Settings() {
  const [tab, setTab] = useState<Tab>("usage-billing");
  return (
    <AppShell>
      <PageHeader
        title="Settings"
        description="Workspace administration: usage, billing and team management."
      />
      <PageTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "usage-billing", label: "Usage & Billing", disabled: true },
          { id: "team",          label: "Team",            disabled: true },
        ]}
      />
      <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
        <p className="text-[13px] font-medium">Workspace settings coming soon</p>
        <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
          Usage &amp; Billing and Team management will land here. For API keys
          and webhooks, head to Developer.
        </p>
      </div>
    </AppShell>
  );
}
