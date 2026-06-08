import { ChevronRight, Share2, Sparkles, Play, Users, History } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TopBar() {
  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Pi Commerce</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="text-muted-foreground">Workflows</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="font-medium text-foreground">Dormant Trader Reactivation</span>
        <span className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
          <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
          Draft
        </span>
        <span className="ml-2 text-[11px] text-muted-foreground/70">v0.7 · edited 4m ago by Aman</span>
      </div>

      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
          <History className="h-3.5 w-3.5" />
          History
        </Button>
        <div className="flex -space-x-1.5">
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-chart-1 to-chart-4 ring-2 ring-background" />
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-chart-2 to-chart-3 ring-2 ring-background" />
        </div>
        <div className="mx-1 h-5 w-px bg-border" />
        <div className="flex h-7 items-center gap-1.5 rounded-full border border-ai/30 bg-ai/5 px-2.5 text-[11px] font-medium text-ai">
          <Sparkles className="h-3 w-3" />
          Pi active
        </div>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
          <Share2 className="h-3.5 w-3.5" />
          Share
        </Button>
        <Button size="sm" className="h-8 gap-1.5 text-xs">
          <Play className="h-3 w-3 fill-current" />
          Publish
        </Button>
      </div>
    </header>
  );
}
