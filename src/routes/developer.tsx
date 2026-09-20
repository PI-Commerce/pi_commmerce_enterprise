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
 *
 * Ask Pi posture per tab:
 *   - APIs & Webhooks / API Docs / Release Notes → DeveloperChat (docs-RAG)
 *     is active. The current tab label is published via `usePiSurfaceHint`
 *     so the chat shell can (a) display it in the "Answering about" ribbon
 *     and (b) prefix each question with "[User is on the <tab> tab]" so
 *     Pi biases tool routing correctly (Release Notes → list_releases,
 *     API Docs → search_docs, etc.).
 *   - Logs → dead-zone. No live log stream exists yet; the tab publishes
 *     a `usePiDisabled` copy so the dock renders the muted pill + persistent
 *     nudge instead of the chat. First tab-level dead-zone consumer.
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { usePiDisabled, usePiSurfaceHint } from "@/lib/pi-screen-actions";
import { ApisAndWebhooks } from "@/components/developer/ApisAndWebhooks";
import { DeveloperLogs } from "@/components/developer/Logs";
import { ApiDocs } from "@/components/developer/ApiDocs";
import { ReleaseNotesList } from "@/components/developer/ReleaseNotesList";

export const Route = createFileRoute("/developer")({
  component: Developer,
  head: () => ({ meta: [{ title: "Developer · Pi Commerce Enterprise" }] }),
});

type Tab = "apis-webhooks" | "logs" | "api-docs" | "release-notes";

// Human labels for the tabs, used for the surface-hint published to Pi
// (both for display in the chat ribbon and for prefixing each question).
const TAB_LABEL: Record<Tab, string> = {
  "apis-webhooks": "APIs & Webhooks",
  "logs":          "Logs",
  "api-docs":      "API Docs",
  "release-notes": "Release Notes",
};

function Developer() {
  const [tab, setTab] = useState<Tab>("apis-webhooks");

  // Publish current tab so DeveloperChat can (a) show it in its "Answering
  // about" ribbon and (b) prefix the label onto each user question so Pi
  // knows which sub-surface the user is on without any client → server
  // wiring changes to askPi.
  usePiSurfaceHint(TAB_LABEL[tab]);

  // Logs is a Pi dead-zone: no live log stream to tail yet. Publishing a
  // dead-zone copy makes AskPiDock's early return render the muted pill +
  // persistent playful nudge instead of mounting DeveloperChat. Revisit
  // when Logs ships real data (NL log filtering / anomaly Q&A becomes the
  // obvious next Pi job on this tab).
  usePiDisabled(tab === "logs" ? "Pi's not tailing logs yet. Grep away." : null);

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
