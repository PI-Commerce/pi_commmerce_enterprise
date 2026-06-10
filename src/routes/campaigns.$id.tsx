import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
import { toast } from "sonner";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { BuilderTopBar } from "@/components/workflow/BuilderTopBar";
import type { CampaignStatus } from "@/lib/campaign-types";
import { EXAMPLE_CAMPAIGNS } from "@/lib/campaign-examples";
import { VERSION_HISTORY, makeVersion, type CampaignVersion } from "@/lib/campaign-versions";

export const Route = createFileRoute("/campaigns/$id")({
  component: CampaignBuilder,
  validateSearch: (search: Record<string, unknown>): { name?: string; description?: string; objective?: string } => ({
    name: typeof search.name === "string" ? search.name : undefined,
    description: typeof search.description === "string" ? search.description : undefined,
    objective: typeof search.objective === "string" ? search.objective : undefined,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `Campaign ${params.id} · Pi Commerce Enterprise` },
      { name: "description", content: "Full-screen orchestration canvas for AI-native campaigns." },
    ],
  }),
});

function CampaignBuilder() {
  const { id } = Route.useParams();
  const { name: seedName, description: seedDescription, objective: seedObjective } = Route.useSearch();
  const navigate = useNavigate();
  const isNew = id === "new";
  const example = EXAMPLE_CAMPAIGNS[id];

  const [name, setName] = useState(
    isNew
      ? (seedName?.trim() || "Untitled campaign")
      : example?.name ?? "Dormant Trader Reactivation",
  );
  const [status, setStatus] = useState<CampaignStatus>(
    isNew ? "draft" : example?.status ?? "draft",
  );
  const [dirty, setDirty] = useState(false);
  const [validCount, setValidCount] = useState(0);
  const [total, setTotal] = useState(0);
  // Version Management (WS7 / PRD §D3). Example campaigns ship with a seeded
  // history; everything else starts empty until the first Save + Run creates v1.
  const [versions, setVersions] = useState<CampaignVersion[]>(() =>
    isNew ? [] : VERSION_HISTORY[id] ? [...VERSION_HISTORY[id]] : [],
  );

  // Move to "ready" automatically when everything validates
  useEffect(() => {
    if (status === "draft" && total > 0 && validCount === total) setStatus("ready");
    if (status === "ready" && validCount < total) setStatus("draft");
  }, [validCount, total, status]);

  // Unsaved changes guard — surface as a bottom-right toast with Leave / Stay
  // actions instead of the native confirm dialog. (PRD §6.5 exit warning.)
  const { status: blockStatus, proceed, reset } = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: false,
    withResolver: true,
  });

  useEffect(() => {
    if (blockStatus !== "blocked") return;
    toast.warning("Unsaved changes", {
      id: "unsaved-blocker",
      description: "Leave the builder? Your changes will be lost.",
      duration: Infinity,
      action: { label: "Leave", onClick: () => proceed?.() },
      cancel: { label: "Stay", onClick: () => reset?.() },
      // Dismissing via the close button (or swipe) must unblock navigation —
      // default to "Stay" so the router doesn't stay silently blocked.
      onDismiss: () => reset?.(),
    });
  }, [blockStatus, proceed, reset]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const handleSave = useCallback(() => {
    setDirty(false);
    // v1 is only minted on the first run; a plain save before that doesn't
    // create a version. Once a history exists, every saved edit is a new version.
    if (versions.length === 0) {
      toast.success("Changes saved", { description: name });
      return;
    }
    const nextNum = Math.max(...versions.map((v) => v.version)) + 1;
    const resumedEdit = status === "paused";
    setVersions((prev) => [
      ...prev,
      makeVersion({
        version: nextNum,
        trigger: resumedEdit ? "resumed-edit" : "edit",
        summary: resumedEdit
          ? "Paused and edited — saved as a new version."
          : "Edited the campaign — saved as a new version.",
      }),
    ]);
    toast.success(`Saved as version ${nextNum}`, { description: name });
  }, [name, status, versions]);
  // First Save + Run mints v1.
  const handleRunStarted = useCallback(() => {
    setVersions((prev) =>
      prev.length > 0
        ? prev
        : [makeVersion({ version: 1, trigger: "created", summary: "Initial version — saved and launched the first run." })],
    );
  }, []);
  const handleExit = useCallback(() => { navigate({ to: "/campaigns" }); }, [navigate]);
  const handleValidity = useCallback((v: number, t: number) => { setValidCount(v); setTotal(t); }, []);
  const handleDirty = useCallback(() => setDirty(true), []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <BuilderTopBar
        name={name}
        onNameChange={(n) => { setName(n); setDirty(true); }}
        status={status}
        onStatusChange={setStatus}
        dirty={dirty}
        validNodes={validCount}
        totalNodes={total}
        onSave={handleSave}
        onExit={handleExit}
        objective={isNew ? seedObjective : undefined}
        description={isNew ? seedDescription : undefined}
        versions={versions}
        onRunStarted={handleRunStarted}
      />
      <div className="relative flex-1">
        <WorkflowCanvas
          status={status}
          campaignId={id}
          onValidityChange={handleValidity}
          onDirty={handleDirty}
          autoStartAskPi={isNew}
          isNew={isNew}
          onAiBuiltName={(n) => { setName(n); setDirty(true); }}
        />
      </div>
    </div>
  );
}
