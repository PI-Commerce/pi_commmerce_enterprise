import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
import { toast } from "sonner";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { BuilderTopBar } from "@/components/workflow/BuilderTopBar";
import type { CampaignStatus } from "@/lib/campaign-types";
import { EXAMPLE_CAMPAIGNS } from "@/lib/campaign-examples";
import { VERSION_HISTORY, makeVersion, type CampaignVersion } from "@/lib/campaign-versions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  // Confirm-before-version dialog — every Save once v1 exists creates a new version.
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  // Confirm-before-publish dialog — only shown when a run is already live, to warn
  // that publishing mints a new version that only new leads follow.
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const currentVersion = versions.length ? Math.max(...versions.map((v) => v.version)) : 0;
  // Campaign status is config-only now (draft | ready). Liveness is a Run concept:
  // a campaign with a seeded version history is treated as having live/associated
  // runs, which is what gates the "publishing mints a new version" publish warning.
  const hasLiveRun = !isNew && (VERSION_HISTORY[id]?.length ?? 0) > 0;

  // Move to "ready" automatically when everything validates — but keep example
  // campaigns at their authored status (the two retained originals stay in draft).
  useEffect(() => {
    if (example) return;
    if (status === "draft" && total > 0 && validCount === total) setStatus("ready");
    if (status === "ready" && validCount < total) setStatus("draft");
  }, [validCount, total, status, example]);

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

  // The actual save. Before v1 exists (first run not done) a save is a plain draft
  // save — no version. Once a history exists, every save mints a new version, so a
  // run never spans configs and analytics stay pinned to one version.
  const performSave = useCallback(() => {
    setDirty(false);
    setConfirmSaveOpen(false);
    if (versions.length === 0) {
      toast.success("Changes saved", { description: name });
      return;
    }
    const nextNum = Math.max(...versions.map((v) => v.version)) + 1;
    setVersions((prev) => [
      ...prev,
      makeVersion({
        version: nextNum,
        trigger: "edit",
        summary: "Edited the campaign — saved as a new version.",
      }),
    ]);
    toast.success(`Saved as version ${nextNum}`, { description: name });
  }, [name, versions]);

  // Save entry point: once v1 exists, warn that this creates a new version
  // (even an empty save after a pause). A pre-v1 draft save goes straight through.
  const handleSave = useCallback(() => {
    if (versions.length === 0) { performSave(); return; }
    setConfirmSaveOpen(true);
  }, [versions.length, performSave]);

  // Publish the current config. Mints a version (v1 on first publish), clears the
  // dirty flag, and marks a draft campaign Ready. When a run is already live it
  // creates a new version that only new leads follow — existing leads stay on theirs.
  const performPublish = useCallback(() => {
    setConfirmPublishOpen(false);
    setDirty(false);
    const nextNum = (versions.length ? Math.max(...versions.map((v) => v.version)) : 0) + 1;
    const first = versions.length === 0;
    setVersions((prev) => [
      ...prev,
      makeVersion({
        version: nextNum,
        trigger: first ? "created" : "edit",
        summary: first
          ? "Initial version — published the campaign."
          : "Published a new version of the campaign.",
      }),
    ]);
    if (hasLiveRun) {
      toast.success(`Published version ${nextNum}`, {
        description: "New leads follow this version; existing leads stay on theirs.",
      });
    } else {
      setStatus("ready");
      toast.success(`Published version ${nextNum}`, { description: name });
    }
  }, [name, hasLiveRun, versions]);

  // Publish entry point: warn before publishing over a live run.
  const handlePublish = useCallback(() => {
    if (hasLiveRun) { setConfirmPublishOpen(true); return; }
    performPublish();
  }, [hasLiveRun, performPublish]);

  const handleExit = useCallback(() => { navigate({ to: "/campaigns" }); }, [navigate]);
  const handleValidity = useCallback((v: number, t: number) => { setValidCount(v); setTotal(t); }, []);
  const handleDirty = useCallback(() => setDirty(true), []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <BuilderTopBar
        campaignId={id}
        name={name}
        onNameChange={(n) => { setName(n); setDirty(true); }}
        status={status}
        dirty={dirty}
        validNodes={validCount}
        totalNodes={total}
        onSave={handleSave}
        onExit={handleExit}
        onPublish={handlePublish}
        objective={isNew ? seedObjective : undefined}
        description={isNew ? seedDescription : undefined}
        versions={versions}
        hasLiveRun={hasLiveRun}
      />
      <div className="relative flex-1">
        <WorkflowCanvas
          status={status}
          campaignId={id}
          onValidityChange={handleValidity}
          onDirty={handleDirty}
          isNew={isNew}
        />
      </div>

      <AlertDialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save as a new version?</AlertDialogTitle>
            <AlertDialogDescription>
              Saving creates <span className="font-medium text-foreground">version {currentVersion + 1}</span> of{" "}
              <span className="font-medium text-foreground">{name}</span>. Each run is pinned to one version, so this keeps
              your analytics clean across changes. There's no rollback in v1, so the current version stays in the history as-is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performSave}>Create version {currentVersion + 1}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmPublishOpen} onOpenChange={setConfirmPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish a new version?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{name}</span> has a live run. Publishing creates{" "}
              <span className="font-medium text-foreground">version {currentVersion + 1}</span> — only new leads follow it.
              Leads already in flight stay on their current version, so analytics never blend across the change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performPublish}>Publish version {currentVersion + 1}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
