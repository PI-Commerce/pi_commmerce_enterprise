/**
 * Settings surface.
 *
 * v1 ships one active tab: Developer (API keys). The rest of the tabs
 * (Team, Billing, Notifications, Security) render as disabled placeholders
 * with a Soon chip, so the eventual admin surface has visible headroom
 * without shipping the actual functionality yet.
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { DeveloperApiKeys } from "@/components/settings/DeveloperApiKeys";

export const Route = createFileRoute("/settings")({
  component: Settings,
  head: () => ({ meta: [{ title: "Settings · Pi Commerce Enterprise" }] }),
});

type Tab = "developer" | "team" | "billing" | "notifications" | "security";

function Settings() {
  const [tab, setTab] = useState<Tab>("developer");
  return (
    <AppShell>
      <PageHeader
        title="Settings"
        description="Developer surfaces for your engineering team, plus workspace administration."
      />
      <PageTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "developer",     label: "Developer" },
          { id: "team",          label: "Team",          disabled: true },
          { id: "billing",       label: "Billing",       disabled: true },
          { id: "notifications", label: "Notifications", disabled: true },
          { id: "security",      label: "Security",      disabled: true },
        ]}
      />
      {tab === "developer" && <DeveloperApiKeys />}
    </AppShell>
  );
}
