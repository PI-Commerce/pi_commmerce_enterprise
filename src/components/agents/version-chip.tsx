import { Check, ChevronDown, History } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type AgentVersion } from "@/lib/agent-data";

/**
 * The version chip shown in the agent header. When an agent has a single
 * version it renders a static `v1` badge; with a history it becomes a dropdown
 * that lists every version (newest first) with its state, and calls `onPick`
 * with the chosen version number.
 */
export function VersionSwitcher({
  versions, selected, onPick,
}: { versions: AgentVersion[]; selected: AgentVersion; onPick: (v: number) => void }) {
  if (versions.length <= 1) {
    return <span className="ml-2 rounded-md border border-border bg-secondary/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">v{selected.version}</span>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="ml-2 inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-1.5 py-0.5 font-mono text-[11px] text-foreground hover:bg-accent">
          <History className="h-3 w-3 text-muted-foreground" /> v{selected.version}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {[...versions].reverse().map((v) => (
          <DropdownMenuItem key={v.version} onClick={() => onPick(v.version)} className="gap-2 text-xs">
            <span className="font-mono">v{v.version}</span>
            <VersionStatePill state={v.state} compact />
            {v.version === selected.version && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function VersionStatePill({ state, compact }: { state: AgentVersion["state"]; compact?: boolean }) {
  const tone =
    state === "active" ? "border-success/30 bg-success/10 text-success"
    : state === "draft" ? "border-warning/30 bg-warning/10 text-warning"
    : "border-muted-foreground/30 bg-muted text-muted-foreground";
  const label = state === "active" ? "Active" : state === "draft" ? "Draft" : "Archived";
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
      compact && "px-1.5 py-0",
      tone,
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full", state === "active" ? "bg-success" : state === "draft" ? "bg-warning" : "bg-muted-foreground")} />
      {label}
    </span>
  );
}
