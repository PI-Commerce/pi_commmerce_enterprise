import { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Save, Rocket, Check, AlertCircle, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CampaignStatus } from "@/lib/campaign-types";
import { STATUS_TONE } from "@/lib/campaign-types";
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
  status,
  dirty, validNodes, totalNodes,
  onSave, onExit, onPublish,
  objective, description,
  versions = [],
  hasLiveRun = false,
}: {
  campaignId: string;
  name: string;
  onNameChange: (n: string) => void;
  status: CampaignStatus;
  dirty: boolean;
  validNodes: number;
  totalNodes: number;
  onSave: () => void;
  onExit: () => void;
  /** Publish the current config as a new version (enabled only when every node is valid). */
  onPublish: () => void;
  objective?: string;
  description?: string;
  versions?: CampaignVersion[];
  /** True when ≥1 associated run is live — publishing then warns it mints a new version. */
  hasLiveRun?: boolean;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentVersion = versions.length ? Math.max(...versions.map((v) => v.version)) : 0;

  useEffect(() => { setDraft(name); }, [name]);
  useEffect(() => { if (editingName) inputRef.current?.select(); }, [editingName]);


  const commit = () => {
    setEditingName(false);
    if (draft.trim() && draft !== name) onNameChange(draft.trim());
  };

  // Editing is always allowed — even with a live run. Publishing then mints a new
  // version that only new leads follow (existing leads stay on their version).
  const allValid = validNodes === totalNodes && totalNodes > 0;

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
            onClick={() => setEditingName(true)}
            className="truncate rounded-md px-2 py-1 text-[13.5px] font-medium hover:bg-accent"
            title={description || "Rename campaign"}
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
          {status}
        </span>

        {dirty && (
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground md:inline-flex">
            <span className="h-1 w-1 rounded-full bg-warning" /> Unsaved changes
          </span>
        )}

        <span className="hidden items-center gap-1 text-[11px] text-muted-foreground lg:inline-flex">
          {allValid ? (
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
          disabled={!dirty}
          title="Save changes"
          className="h-8 gap-1.5 text-xs"
        >
          <Save className="h-3.5 w-3.5" /> Save
        </Button>

        <Button
          size="sm"
          onClick={onPublish}
          disabled={!allValid}
          className="h-8 gap-1.5 text-xs"
          title={
            !allValid
              ? "Resolve validation errors first"
              : hasLiveRun
                ? "Publish a new version — new leads follow it"
                : "Publish campaign"
          }
        >
          <Rocket className="h-3.5 w-3.5" />
          Publish
        </Button>
      </div>
    </header>
  );
}

