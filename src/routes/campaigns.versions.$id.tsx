import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Clock } from "lucide-react";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { VersionTimeline } from "@/components/workflow/VersionTimeline";
import { EXAMPLE_CAMPAIGNS } from "@/lib/campaign-examples";
import { VERSION_HISTORY, type CampaignVersion } from "@/lib/campaign-versions";

export const Route = createFileRoute("/campaigns/versions/$id")({
  component: VersionHistoryPage,
  head: ({ params }) => ({
    meta: [{ title: `Version history · Campaign ${params.id} · Pi Agents FinServ` }],
  }),
});

function VersionHistoryPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const campaignName = EXAMPLE_CAMPAIGNS[id]?.name ?? "Campaign";
  const versions: CampaignVersion[] = VERSION_HISTORY[id] ? [...VERSION_HISTORY[id]] : [];
  const current = versions.length
    ? versions.reduce((a, b) => (b.version > a.version ? b : a))
    : undefined;

  const [selected, setSelected] = useState<CampaignVersion | undefined>(current);
  const isCurrent = selected && current && selected.version === current.version;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar — mirrors the builder header so it reads as a full-page mode */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
        <button
          onClick={() => navigate({ to: "/campaigns/$id", params: { id } })}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Back to builder"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Builder</span>
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="truncate text-[13.5px] font-medium">{campaignName}</span>
        <span className="ml-1 inline-flex items-center rounded-md border border-border bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground">
          Version history
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Read-only canvas snapshot — click a node to inspect its config */}
        <div className="relative min-w-0 flex-1">
          {selected && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
              <div className="flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-3 py-1 text-[11px] font-medium shadow-sm backdrop-blur">
                <Clock className="h-3 w-3 text-muted-foreground" />
                Viewing Version {selected.version}
                {isCurrent && <span className="text-ai">· current</span>}
                <span className="text-muted-foreground">· {selected.createdAt}</span>
              </div>
            </div>
          )}
          <WorkflowCanvas status="ready" campaignId={id} previewOnly />
        </div>

        {/* Version timeline rail */}
        <aside className="w-[360px] shrink-0 border-l border-border bg-background">
          <VersionTimeline
            versions={versions}
            selectedId={selected?.id}
            onSelect={setSelected}
          />
        </aside>
      </div>
    </div>
  );
}
