import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Analytics refresh control — a small header cluster that answers the recurring
 * question "am I looking at fresh numbers?". Events (a call completing, a message
 * getting delivered) land in our stores with some lag, so the page a client
 * opened a few minutes ago is quietly stale. We can't ask them to hard-reload the
 * browser, so this gives them a manual refresh plus a visible "last updated"
 * stamp — and, underneath, the view keeps itself current on a fixed internal
 * cadence so the numbers stay live without any knob for the client to fiddle with.
 *
 * It owns its own freshness state (last-refreshed time, spinner) and simply calls
 * {@link onRefresh} when a refresh is due. In this mock that re-runs the seeded
 * data builders; in production `onRefresh` maps to a react-query invalidation /
 * refetch. Keeping the timing here means every channel view gets identical
 * behaviour for free.
 */

/**
 * How often the view silently refreshes itself. This is an internal product
 * decision, not a client-facing setting: the numbers should just stay live. 30s
 * keeps them fresh without hammering the data layer.
 */
const AUTO_REFRESH_MS = 30_000;

/** "just now" / "45s ago" / "3m ago" / "1h ago" — short and glanceable. */
function agoLabel(from: Date, now: number): string {
  const secs = Math.max(0, Math.round((now - from.getTime()) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export function AnalyticsRefresh({
  onRefresh,
  className,
}: {
  /** Called whenever a refresh fires (manual click or auto-tick). */
  onRefresh?: () => void;
  className?: string;
}) {
  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  // A ticking clock so the "updated Xs ago" label stays honest without a refresh.
  const [now, setNow] = useState<number>(() => Date.now());

  const settleTimer = useRef<number | null>(null);

  const handleRefresh = useCallback(() => {
    // Guard against overlapping refreshes (fast double-click, or an auto-tick
    // landing mid-refresh).
    setIsRefreshing((busy) => {
      if (busy) return busy;
      onRefresh?.();
      // Give the spinner a beat so the action registers visually; in production
      // we'd await the refetch promise and stamp on resolve instead.
      settleTimer.current = window.setTimeout(() => {
        setLastRefreshed(new Date());
        setNow(Date.now());
        setIsRefreshing(false);
      }, 600);
      return true;
    });
  }, [onRefresh]);

  // Tick the relative label every 10s.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(id);
  }, []);

  // Internal auto-refresh loop — always on, fixed cadence, no client control.
  useEffect(() => {
    const id = window.setInterval(handleRefresh, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [handleRefresh]);

  // Clear a pending settle timer on unmount.
  useEffect(
    () => () => {
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
    },
    [],
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Updated {agoLabel(lastRefreshed, now)}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Last refreshed at {lastRefreshed.toLocaleString()}. Updates
            automatically every 30 seconds.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={handleRefresh}
        disabled={isRefreshing}
        aria-label="Refresh analytics"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
        Refresh
      </Button>
    </div>
  );
}
