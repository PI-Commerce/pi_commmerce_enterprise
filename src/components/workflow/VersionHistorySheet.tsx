import { History, Lock, RotateCcw } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  type CampaignVersion, VERSION_TRIGGER_LABEL,
} from "@/lib/campaign-versions";

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

/**
 * Read-only, Google-Docs-history style version timeline (PRD §D3 / WS7).
 * No rollback in v1 — the panel is informational only.
 */
export function VersionHistorySheet({
  open, onOpenChange, campaignName, versions,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaignName: string;
  versions: CampaignVersion[];
}) {
  const sorted = [...versions].sort((a, b) => b.version - a.version);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[400px] flex-col gap-0 p-0 sm:max-w-[400px]">
        <SheetHeader className="space-y-1 border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-[15px]">
            <History className="h-4 w-4 text-muted-foreground" /> Version history
          </SheetTitle>
          <SheetDescription className="truncate text-xs">{campaignName}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {sorted.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                <History className="h-4.5 w-4.5 text-muted-foreground" />
              </div>
              <p className="text-[13px] font-medium">No versions yet</p>
              <p className="max-w-[260px] text-xs text-muted-foreground">
                Version 1 is created automatically the first time you save and run this campaign.
                Each later edit you save becomes a new version.
              </p>
            </div>
          ) : (
            <ol className="relative">
              {sorted.map((v, i) => {
                const current = i === 0;
                return (
                  <li key={v.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {/* timeline rail */}
                    {i < sorted.length - 1 && (
                      <span className="absolute left-[7px] top-5 h-full w-px bg-border" aria-hidden />
                    )}
                    <span
                      className={cn(
                        "relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2",
                        current ? "border-ai bg-ai" : "border-border bg-background",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold">Version {v.version}</span>
                        {current && (
                          <span className="rounded-full border border-ai/30 bg-ai/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ai">
                            Current
                          </span>
                        )}
                        <span className="ml-auto rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {VERSION_TRIGGER_LABEL[v.trigger]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{v.createdAt}</p>
                      <p className="mt-1.5 text-[12.5px] leading-snug text-foreground/90">{v.summary}</p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground/90 text-[9px] font-semibold text-background">
                          {initials(v.author)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{v.author}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="flex items-start gap-2 border-t border-border bg-secondary/40 px-5 py-3">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[11px] leading-snug text-muted-foreground">
            History is read-only.{" "}
            <span className="inline-flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Restoring a previous version
            </span>{" "}
            isn’t available in v1.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
