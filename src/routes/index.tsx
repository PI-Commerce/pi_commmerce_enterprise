/**
 * Public docs entry point (public-docs branch only).
 *
 * This branch deploys to a standalone Cloudflare Worker that serves an
 * unauthenticated, sidebar-less shell exposing exactly two surfaces from
 * the platform: Release Notes and API Docs. Anyone can read it, no login.
 *
 * The rest of the app routes still exist in the bundle but are not linked
 * from this shell. The product team should treat this route as the single
 * source of truth for the public docs URL.
 */

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageTabs } from "@/components/app/Tabs";
import { ApiDocs } from "@/components/developer/ApiDocs";
import { ReleaseNotesList } from "@/components/developer/ReleaseNotesList";

export const Route = createFileRoute("/")({
  component: PublicDocs,
  head: () => ({
    meta: [
      { title: "PiCom · Developer Docs" },
      {
        name: "description",
        content:
          "Public API reference and release notes for PiCom Enterprise.",
      },
    ],
  }),
});

type Tab = "release-notes" | "api-docs";

const TAB_STORAGE_KEY = "picom.publicDocs.tab";

function PublicDocs() {
  const [tab, setTab] = useState<Tab>("release-notes");

  // Restore last-used tab so a shared link back to `/` lands where the reader left off.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(TAB_STORAGE_KEY) as Tab | null;
    if (saved === "release-notes" || saved === "api-docs") setTab(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TAB_STORAGE_KEY, tab);
  }, [tab]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-sm font-bold">Pi</span>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-none">PiCom Enterprise</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Developer Docs</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <div className="mb-6">
          <h1 className="text-[22px] font-semibold tracking-tight">Developer</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            API reference and release notes for PiCom Enterprise. Everything you need
            to integrate against the platform.
          </p>
        </div>

        <PageTabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "release-notes", label: "Release Notes" },
            { id: "api-docs", label: "API Docs" },
          ]}
        />

        {tab === "release-notes" && <ReleaseNotesList hideAppLinks />}
        {tab === "api-docs" && <ApiDocs />}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 text-[11px] text-muted-foreground">
          <span>PiCom Enterprise · Public Docs</span>
          <span>Last updated automatically on every release</span>
        </div>
      </footer>
    </div>
  );
}
