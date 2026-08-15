/**
 * Conversions API log — step two of the closed loop, and the thing worth
 * looking at on this whole surface.
 *
 * Every row is a conversation outcome travelling *back* to Meta. Two rules
 * decide whether Meta will accept it, and both are made visible rather than
 * enforced silently:
 *
 *  - one conversion per click. `ctwa_clid` is the join key, and a click that has
 *    already been credited cannot be credited again.
 *  - seven days from the click. A conversion that lands later is still true, and
 *    Meta will still refuse it — those rows are the honest cost of a slow
 *    pipeline, so they stay in the log as `expired` instead of being hidden.
 *
 * The payload drawer prints the request body in Meta's own field spelling, so
 * what the demo claims to send and what a backend would actually send are the
 * same object.
 *
 * BACKEND: `dispatch` becomes a POST to /{dataset_id}/events. Nothing else here
 * changes — status already carries the three outcomes that endpoint produces.
 */
import { Fragment, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Clock3, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRegion } from "@/lib/region";
import { Empty, money } from "@/components/ads/ui";
import { dispatchAllPendingCapiEvents, dispatchCapiEvent, useCapiEvents, useCtwaAds, useSimNow } from "@/lib/ctwa-store";
import {
  CAPI_WINDOW_DAYS, CONVERSION_EVENT_LABELS, MAX_CAPI_EVENTS_PER_CLICK,
  type CapiEvent, type CapiEventStatus,
} from "@/lib/ctwa-types";

const HOUR_MS = 60 * 60 * 1000;

type Filter = "all" | CapiEventStatus;

const STATUS_META: Record<CapiEventStatus, { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: "Queued", tone: "border-warning/30 bg-warning/10 text-warning", icon: Clock3 },
  sent: { label: "Accepted", tone: "border-success/30 bg-success/10 text-success", icon: CheckCircle2 },
  expired: { label: "Expired", tone: "border-destructive/30 bg-destructive/10 text-destructive", icon: XCircle },
};

/** Click → event gap, in the units a 7-day window is actually argued in. */
function gap(ms: number): string {
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  const hrs = ms / HOUR_MS;
  return hrs < 48 ? `${hrs.toFixed(1)}h` : `${(hrs / 24).toFixed(1)}d`;
}

/** The request body a real dispatcher would POST. Kept in Meta's spelling. */
function payloadOf(e: CapiEvent) {
  return {
    data: [
      {
        event_name: e.eventName,
        event_time: Math.round(e.eventTimeMs / 1000),
        action_source: e.actionSource,
        messaging_channel: e.messagingChannel,
        user_data: { ctwa_clid: e.ctwaClid },
        ...(e.value !== undefined
          ? { custom_data: { value: e.value, currency: e.currency } }
          : {}),
      },
    ],
  };
}

export function CapiLog() {
  const { symbol } = useRegion();
  const events = useCapiEvents();
  const ads = useCtwaAds();
  const nowMs = useSimNow();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  const adName = useMemo(() => new Map(ads.map((a) => [a.id, a.name])), [ads]);

  const counts = useMemo(() => {
    const c = { all: events.length, pending: 0, sent: 0, expired: 0 };
    for (const e of events) c[e.status] += 1;
    return c;
  }, [events]);

  const rows = filter === "all" ? events : events.filter((e) => e.status === filter);

  const dispatchAll = () => {
    if (counts.pending === 0) return;
    dispatchAllPendingCapiEvents();
    toast.success(`Sent ${counts.pending} conversion${counts.pending === 1 ? "" : "s"} to Meta`);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Rule
          title={`${MAX_CAPI_EVENTS_PER_CLICK} conversion per click`}
          body="A ctwa_clid can be credited once. The furthest outcome the thread reached is the one Meta hears about."
        />
        <Rule
          title={`${CAPI_WINDOW_DAYS}-day attribution window`}
          body="Meta refuses a conversion attributed to an older click. Late revenue is real revenue that delivery never learns from."
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {(["all", "pending", "sent", "expired"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                filter === f
                  ? "border-foreground/20 bg-secondary text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent/50",
              )}
            >
              {f === "all" ? "All" : STATUS_META[f].label}
              <span className="font-mono text-[10.5px] text-muted-foreground">{counts[f]}</span>
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8 gap-1.5 text-xs"
          onClick={dispatchAll}
          disabled={counts.pending === 0}
        >
          <Send className="h-3.5 w-3.5" />
          {counts.pending === 0 ? "Nothing queued" : `Send ${counts.pending} queued`}
        </Button>
      </div>

      {rows.length === 0 ? (
        <Empty>
          {events.length === 0
            ? "No conversions yet. Define a conversion point above, then advance the clock to let threads reach it."
            : "No events with this status."}
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="w-8 px-2 py-2.5" />
                <th className="px-3 py-2.5 text-left font-medium">Event</th>
                <th className="px-3 py-2.5 text-left font-medium">Ad</th>
                <th className="px-3 py-2.5 text-left font-medium">ctwa_clid</th>
                <th className="px-3 py-2.5 text-right font-medium">Value</th>
                <th className="px-3 py-2.5 text-right font-medium">Click → event</th>
                <th className="px-3 py-2.5 text-left font-medium">Status</th>
                <th className="px-3 py-2.5 text-right font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((e) => {
                const expanded = open === e.id;
                const age = e.eventTimeMs - e.clickTimeMs;
                const status = STATUS_META[e.status];
                const StatusIcon = status.icon;
                return (
                  <Fragment key={e.id}>
                    <tr
                      onClick={() => setOpen(expanded ? null : e.id)}
                      className="cursor-pointer transition-colors hover:bg-accent/30"
                    >
                      <td className="px-2 py-2.5 text-muted-foreground">
                        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="truncate font-mono text-[12px]">{e.eventName}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {CONVERSION_EVENT_LABELS[e.eventName]}
                        </p>
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2.5 text-[12.5px]">
                        {adName.get(e.adId) ?? e.adId}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {e.ctwaClid.slice(0, 12)}…
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums">
                        {e.value ? money(e.value, symbol) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums",
                          e.status === "expired" && "text-destructive",
                        )}
                      >
                        {gap(age)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                            status.tone,
                          )}
                        >
                          <StatusIcon className="h-3 w-3" /> {status.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {e.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              dispatchCapiEvent(e.id);
                              toast.success("Conversion sent to Meta");
                            }}
                          >
                            Send now
                          </Button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-secondary/20">
                        <td />
                        <td colSpan={7} className="px-3 pb-3.5 pt-1">
                          <p className="mb-1.5 text-[11px] text-muted-foreground">
                            POST /v21.0/{`{dataset_id}`}/events
                          </p>
                          <pre className="overflow-x-auto rounded-lg border border-border bg-card p-3 font-mono text-[11px] leading-relaxed">
{JSON.stringify(payloadOf(e), null, 2)}
                          </pre>
                          {e.status === "expired" && (
                            <p className="mt-2 text-[11.5px] text-destructive">
                              Rejected — the click is {gap(age)} old, past the {CAPI_WINDOW_DAYS}-day window. The
                              revenue still happened; Meta's delivery model just never gets to learn from it.
                            </p>
                          )}
                          {e.status === "pending" && (
                            <p className="mt-2 text-[11.5px] text-muted-foreground">
                              Queued for the next batch. It has {gap(Math.max(0, e.clickTimeMs + CAPI_WINDOW_DAYS * 24 * HOUR_MS - nowMs))} of
                              window left.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Rule({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/25 px-3 py-2.5">
      <p className="text-[12px] font-medium">{title}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{body}</p>
    </div>
  );
}
