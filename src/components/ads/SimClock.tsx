/**
 * Demo clock control.
 *
 * CTWA is a loop that only becomes legible over days: a conversation stalls, an
 * audience fills, a queued conversion ships, an old click falls out of the 7-day
 * window. Rather than wait, the whole feed is a pure function of (ads, now) — so
 * moving this clock replays history at any point.
 *
 * BACKEND: delete this control. Real time advances on its own.
 */
import { Clock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { advanceSim, advanceSimDays, resetSim, useSimNow } from "@/lib/ctwa-store";

const HOUR_MS = 60 * 60 * 1000;

export function SimClock() {
  const nowMs = useSimNow();
  const label = new Date(nowMs).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 font-mono text-[11px]">
          <Clock className="h-3.5 w-3.5" /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          Advance the demo clock
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => advanceSim(6 * HOUR_MS)}>+ 6 hours</DropdownMenuItem>
        <DropdownMenuItem onClick={() => advanceSimDays(1)}>+ 1 day</DropdownMenuItem>
        <DropdownMenuItem onClick={() => advanceSimDays(3)}>+ 3 days</DropdownMenuItem>
        <DropdownMenuItem onClick={() => advanceSimDays(7)}>+ 7 days</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={resetSim}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset to start
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
