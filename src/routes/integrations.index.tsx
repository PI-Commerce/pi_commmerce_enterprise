import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Plug, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/integrations/")({
  component: Integrations,
  head: () => ({ meta: [{ title: "Integrations · Pi Commerce Enterprise" }] }),
});

/**
 * Integrations is disabled for the v1 build. CRM connectors and developer tooling
 * (API keys, webhooks) are out of the first cut, so the route renders a
 * non-interactive placeholder and the sidebar entry is greyed with a "Soon" badge.
 * Messaging channels live under Channels. The previous CRMs/Developer tab UI is
 * preserved in git history for when these surfaces are re-enabled.
 */
function Integrations() {
  return (
    <AppShell>
      <PageHeader
        title="Integrations"
        description="Connect data sources and developer tooling. Messaging channels live under Channels."
      />
      <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground">
            <Plug className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Integrations are coming soon</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted-foreground">
            CRM connectors and developer tooling (API keys, webhooks) are not part of
            the first cut. Your account team handles data-source setup during onboarding.
          </p>
          <Button variant="outline" className="mt-5 gap-1.5" asChild>
            <Link to="/campaigns"><ArrowLeft className="h-4 w-4" /> Back to campaigns</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
