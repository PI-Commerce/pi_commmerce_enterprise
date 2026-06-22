import { useCallback, useEffect, useRef, useState } from "react";
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
  // Whether the current pause already produced a version (via Save), so a following
  // Resume doesn't double-mint. One version per pause cycle. Reset on each Resume.
  const savedDuringPauseRef = useRef(false);
  const currentVersion = versions.length ? Math.max(...versions.map((v) => v.version)) : 0;

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
    const resumedEdit = status === "paused";
    if (resumedEdit) savedDuringPauseRef.current = true;
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

  // Save entry point: once v1 exists, warn that this creates a new version
  // (even an empty save after a pause). A pre-v1 draft save goes straight through.
  const handleSave = useCallback(() => {
    if (versions.length === 0) { performSave(); return; }
    setConfirmSaveOpen(true);
  }, [versions.length, performSave]);

  // Resume always starts a fresh version + new run. If a Save during the pause
  // already minted one, don't double-mint; otherwise roll an (empty) version so
  // the pause is a hard analytics cut.
  const handleResume = useCallback(() => {
    setStatus("running");
    if (!savedDuringPauseRef.current && versions.length > 0) {
      const nextNum = Math.max(...versions.map((v) => v.version)) + 1;
      setVersions((prev) => [
        ...prev,
        makeVersion({
          version: nextNum,
          trigger: "resumed-edit",
          summary: "Resumed the run — new version so analytics never blend across the pause.",
        }),
      ]);
      toast.success(`Resumed as version ${nextNum}`, { description: name });
    } else {
      toast.success("Campaign resumed", { description: name });
    }
    savedDuringPauseRef.current = false;
  }, [name, versions]);

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
        campaignId={id}
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
        onResume={handleResume}
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
    </div>
  );
}
