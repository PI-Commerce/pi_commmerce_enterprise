import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Lock, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: Settings,
  head: () => ({ meta: [{ title: "Settings · Pi Commerce Enterprise" }] }),
});

/**
 * Settings is disabled for the v1 sales-demo build. Workspace, team and billing
 * administration is managed outside the product for now, so the route renders a
 * non-interactive placeholder (the sidebar entry is greyed with a "Soon" badge).
 */
function Settings() {
  return (
    <AppShell>
      <PageHeader title="Settings" description="Workspace, members, and billing." />
      <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Settings are coming soon</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted-foreground">
            Workspace, team, and billing administration is managed by your account team
            during onboarding. Self-serve settings will be available in a future release.
          </p>
          <Button variant="outline" className="mt-5 gap-1.5" asChild>
            <Link to="/"><ArrowLeft className="h-4 w-4" /> Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
