import { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Save, Play, Pause, Lock, Check, AlertCircle, History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CampaignStatus } from "@/lib/campaign-types";
import { STATUS_TONE } from "@/lib/campaign-types";
import { CreateRunDialog, type CreateRunPayload } from "@/components/workflow/CreateRunDialog";
import type { CampaignVersion } from "@/lib/campaign-versions";


const OBJECTIVE_LABELS: Record<string, string> = {
  reactivation: "Reactivation",
  onboarding: "Onboarding",
  retention: "Retention",
  conversion: "Conversion",
  winback: "Win-back",
  awareness: "Awareness",
};

export function BuilderTopBar({
  campaignId,
  name, onNameChange,
  status, onStatusChange,
  dirty, validNodes, totalNodes,
  onSave, onExit,
  objective, description,
  versions = [], onRunStarted, onResume,
}: {
  campaignId: string;
  name: string;
  onNameChange: (n: string) => void;
  status: CampaignStatus;
  onStatusChange: (s: CampaignStatus) => void;
  dirty: boolean;
  validNodes: number;
  totalNodes: number;
  onSave: () => void;
  onExit: () => void;
  objective?: string;
  description?: string;
  versions?: CampaignVersion[];
  onRunStarted?: () => void;
  onResume?: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState(name);
  const [runOpen, setRunOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentVersion = versions.length ? Math.max(...versions.map((v) => v.version)) : 0;

  useEffect(() => { setDraft(name); }, [name]);
  useEffect(() => { if (editingName) inputRef.current?.select(); }, [editingName]);


  const commit = () => {
    setEditingName(false);
    if (draft.trim() && draft !== name) onNameChange(draft.trim());
  };

  const allValid = validNodes === totalNodes && totalNodes > 0;
  const runnable = allValid && status === "ready";
  const editLocked = status === "running" || status === "locked";

  // Navigate out and let the route's useBlocker surface the unsaved-changes
  // toast (PRD §6.5). No native confirm() — that bypassed the toast blocker.
  const handleExit = () => { onExit(); };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={handleExit}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Back to campaigns"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Campaigns</span>
        </button>
        <span className="text-muted-foreground/40">/</span>

        {editingName ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setDraft(name); setEditingName(false); }
            }}
            className="min-w-0 max-w-[420px] truncate rounded-md border border-input bg-background px-2 py-1 text-[13.5px] font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <button
            onClick={() => !editLocked && setEditingName(true)}
            className={cn(
              "truncate rounded-md px-2 py-1 text-[13.5px] font-medium",
              editLocked ? "cursor-not-allowed text-foreground" : "hover:bg-accent",
            )}
            title={editLocked ? "Locked while campaign is Running" : description || "Rename campaign"}
          >
            {name}
          </button>
        )}

        {objective && OBJECTIVE_LABELS[objective] && (
          <span
            className="hidden items-center rounded-md border border-border bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground md:inline-flex"
            title="Campaign objective"
          >
            {OBJECTIVE_LABELS[objective]}
          </span>
        )}

        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
            STATUS_TONE[status],
          )}
        >
          {status === "running" && <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />}
          {status === "locked" && <Lock className="h-3 w-3" />}
          {status}
        </span>

        {dirty && !editLocked && (
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground md:inline-flex">
            <span className="h-1 w-1 rounded-full bg-warning" /> Unsaved changes
          </span>
        )}

        <span className="hidden items-center gap-1 text-[11px] text-muted-foreground lg:inline-flex">
          {runnable ? (
            <><Check className="h-3 w-3 text-success" /> {totalNodes} nodes validated</>
          ) : (
            <><AlertCircle className="h-3 w-3 text-warning" /> {validNodes}/{totalNodes} nodes configured</>
          )}
        </span>

        <Link
          to="/campaigns/versions/$id"
          params={{ id: campaignId }}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="View version history"
        >
          <History className="h-3 w-3" />
          {currentVersion ? `v${currentVersion}` : "History"}
        </Link>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onSave}
          disabled={editLocked || (!dirty && status !== "paused")}
          title={status === "paused" ? "Save — creates a new version" : "Save changes"}
          className="h-8 gap-1.5 text-xs"
        >
          <Save className="h-3.5 w-3.5" /> Save
        </Button>

        {status === "running" ? (
          <Button size="sm" variant="outline" onClick={() => { onStatusChange("paused"); toast.success("Campaign paused", { description: name }); }} className="h-8 gap-1.5 text-xs">
            <Pause className="h-3 w-3" /> Pause
          </Button>
        ) : status === "paused" ? (
          <Button size="sm" onClick={() => { if (onResume) { onResume(); } else { onStatusChange("running"); toast.success("Campaign resumed", { description: name }); } }} className="h-8 gap-1.5 text-xs">
            <Play className="h-3 w-3 fill-current" /> Resume
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => setRunOpen(true)}
            disabled={!runnable}
            className="h-8 gap-1.5 text-xs"
            title={
              !allValid
                ? "Resolve validation errors first"
                : status !== "ready"
                  ? "Only Ready campaigns can run. Save changes to mark as Ready."
                  : "Run campaign"
            }
          >
            <Play className="h-3 w-3 fill-current" />
            Run
          </Button>
        )}
      </div>

      <CreateRunDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        campaignName={name}
        onStart={(payload: CreateRunPayload) => {
          setRunOpen(false);
          onStatusChange("running");
          onRunStarted?.();
          toast.success("Run started", { description: `${payload.runName} · ${payload.triggerMode === "api" ? "API trigger activated" : "running now"}` });
        }}
      />
    </header>
  );
}

