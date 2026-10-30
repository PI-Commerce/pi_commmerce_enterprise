/**
 * Developer surface.
 *
 * Top-level home for everything an integrator needs. Simplified from six tabs
 * to four:
 *
 *   - APIs & Webhooks : API keys (live) and Webhooks (Soon, being built next)
 *   - Logs            : Soon; will show a filterable log of inbound API calls
 *   - API Docs        : SaaS-standard reference for every public endpoint
 *   - Release Notes   : chronological product releases
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { ApisAndWebhooks } from "@/components/developer/ApisAndWebhooks";
import { DeveloperLogs } from "@/components/developer/Logs";
import { ApiDocs } from "@/components/developer/ApiDocs";
import { ReleaseNotesList } from "@/components/developer/ReleaseNotesList";

export const Route = createFileRoute("/developer")({
  component: Developer,
  head: () => ({ meta: [{ title: "Developer · Pi Commerce Enterprise" }] }),
});

type Tab = "apis-webhooks" | "logs" | "api-docs" | "release-notes";

function Developer() {
  const [tab, setTab] = useState<Tab>("apis-webhooks");
  return (
    <AppShell>
      <PageHeader
        title="Developer"
        description="APIs, webhooks, logs and reference docs. Everything you need to build against Pi Commerce."
      />
      <PageTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "apis-webhooks", label: "APIs & Webhooks" },
          { id: "logs",          label: "Logs" },
          { id: "api-docs",      label: "API Docs" },
          { id: "release-notes", label: "Release Notes" },
        ]}
      />
      {tab === "apis-webhooks" && <ApisAndWebhooks />}
      {tab === "logs" && <DeveloperLogs />}
      {tab === "api-docs" && <ApiDocs />}
      {tab === "release-notes" && <ReleaseNotesList />}
    </AppShell>
  );
}
