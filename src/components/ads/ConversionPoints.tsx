/**
 * Conversion points — step one of the closed loop.
 *
 * A conversion point is the merchant's answer to "what, in a WhatsApp thread,
 * counts as the thing I paid for". Meta cannot see inside the conversation, so
 * until this is declared the only outcome it can optimise against is
 * "conversation started" — which is why cheap chatter wins by default.
 *
 * Edits write straight through to the store rather than into a local draft: the
 * CAPI log below reads the same ads, and the point of this tab is that the two
 * are visibly one system.
 */
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRegion } from "@/lib/region";
import { setConversionPoints } from "@/lib/ctwa-store";
import {
  CONVERSION_EVENT_LABELS, GOAL_LABELS, MAX_CONVERSION_POINTS, OBJECTIVE_LABELS,
  type ConversionEventName, type ConversionPoint, type CtwaAd,
} from "@/lib/ctwa-types";

const EVENTS = Object.keys(CONVERSION_EVENT_LABELS) as ConversionEventName[];

let pointSeq = 0;

export function ConversionPointsEditor({ ad }: { ad: CtwaAd }) {
  const { symbol } = useRegion();
  const points = ad.conversionPoints;
  const atCap = points.length >= MAX_CONVERSION_POINTS;

  const write = (next: ConversionPoint[]) => setConversionPoints(ad.id, next);

  const update = (id: string, patch: Partial<ConversionPoint>) =>
    write(points.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const add = () =>
    write([
      ...points,
      { id: `cp_${ad.id}_${++pointSeq}`, event: "qualified_lead", label: "" },
    ]);

  // Optimising for Conversions with nothing declared is the failure mode this
  // editor exists to prevent, so it gets said here as well as in the composer.
  const starved = ad.optimizationGoal === "OFFSITE_CONVERSIONS" && points.length === 0;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium">{ad.name}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {OBJECTIVE_LABELS[ad.objective]} → {GOAL_LABELS[ad.optimizationGoal]} · {ad.metaCampaignName}
          </p>
        </div>
        <p className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {points.length}/{MAX_CONVERSION_POINTS} defined
        </p>
      </div>

      <div className="space-y-2.5 p-4">
        {points.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">
            No conversion points. Meta only ever learns that a chat opened.
          </p>
        ) : (
          points.map((p) => (
            <div key={p.id} className="grid gap-2 sm:grid-cols-[170px_minmax(0,1fr)_120px_auto]">
              <Select
                value={p.event}
                onValueChange={(v) => update(p.id, { event: v as ConversionEventName })}
              >
                <SelectTrigger className="h-9 text-[12.5px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENTS.map((e) => (
                    <SelectItem key={e} value={e}>{CONVERSION_EVENT_LABELS[e]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={p.label}
                onChange={(e) => update(p.id, { label: e.target.value.slice(0, 48) })}
                placeholder="What happened in the thread"
                className="h-9 text-[12.5px]"
              />
              <Input
                type="number"
                min={0}
                value={p.value ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  update(p.id, { value: e.target.value === "" || !n ? undefined : n });
                }}
                placeholder={`${symbol}0`}
                className="h-9 tabular-nums text-[12.5px]"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => write(points.filter((x) => x.id !== p.id))}
                className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${p.label || "conversion point"}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}

        <div className="flex flex-wrap items-center gap-3 pt-0.5">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={add} disabled={atCap}>
            <Plus className="h-3.5 w-3.5" /> Add conversion point
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {atCap
              ? `Meta caps high-value events at ${MAX_CONVERSION_POINTS} per ad — past that the signal stops being high-value.`
              : "Leave the value empty for events that don't carry revenue. Values drive ROAS."}
          </p>
        </div>

        {starved && (
          <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-[11.5px] leading-snug text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This ad optimises for Conversions but declares none, so the Conversions API has nothing
              to report. Delivery falls back to whoever opens a chat.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
