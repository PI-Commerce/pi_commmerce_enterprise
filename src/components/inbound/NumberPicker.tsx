/**
 * Which WhatsApp numbers this entry point listens on.
 *
 * A picker rather than a text field, because the set of numbers a workspace can
 * receive on is not open: Meta provisions them to a WABA, and a number typed by
 * hand is an entry point that can never fire. Same argument as the generated
 * webhook URL — an address the author invents is one nothing routes to.
 *
 * All three levels are shown — Business Manager, then WABA, then number —
 * because the hierarchy is what makes a choice safe. A WABA name alone does not
 * say whose it is, and on a workspace running more than one Business Manager
 * that is the difference between two journeys and one mistake. Quality rating
 * rides on the number itself, since that is where it lives.
 */
import { Check, ChevronDown, Phone, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useWabaNumbers, numbersByBm, wabaNumber } from "@/lib/waba-numbers";

export function NumberPicker({
  value, onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  useWabaNumbers(); // subscribe, so an onboarding elsewhere shows up here
  const bms = numbersByBm();

  const toggle = (display: string) =>
    onChange(value.includes(display) ? value.filter((v) => v !== display) : [...value, display]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex h-8 max-w-[320px] items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors hover:bg-accent",
            value.length === 0
              ? "border-warning/40 bg-warning/5 text-warning"
              : "border-border bg-background",
          )}
        >
          <Phone className="h-3.5 w-3.5 shrink-0 opacity-70" />
          {value.length === 0 ? (
            "No number bound"
          ) : (
            <>
              <span className="font-mono">{value[0]}</span>
              <span className="truncate text-muted-foreground">
                {wabaNumber(value[0])?.wabaName}
              </span>
              {value.length > 1 && (
                <span className="shrink-0 text-muted-foreground">+{value.length - 1}</span>
              )}
            </>
          )}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[320px] p-1">
        <p className="px-2 pb-1 pt-1.5 text-[11px] leading-snug text-muted-foreground">
          One journey can answer several numbers. Routing is still resolved per
          number, so each one is claimed independently.
        </p>

        {bms.map((bm) => (
          <div key={bm.bmId} className="mt-1.5 border-t border-border pt-1.5 first:mt-0 first:border-0 first:pt-0">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              {bm.bmName}
            </p>
            {bm.wabas.map((g) => (
            <div key={g.wabaId}>
            <div className="flex items-center justify-between gap-2 px-2 py-0.5">
              <p className="truncate text-[11px] font-medium text-foreground/70">{g.wabaName}</p>
              {/* Whole-WABA selection, because "every number on this account"
                  is the common intent and ticking six boxes to say it is not. */}
              <button
                onClick={() => {
                  const all = g.numbers.map((x) => x.display);
                  const every = all.every((d) => value.includes(d));
                  onChange(every
                    ? value.filter((d) => !all.includes(d))
                    : [...value, ...all.filter((d) => !value.includes(d))]);
                }}
                className="shrink-0 text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {g.numbers.every((x) => value.includes(x.display)) ? "Clear" : "All"}
              </button>
            </div>
            {g.numbers.map((n) => {
              const on = value.includes(n.display);
              return (
                <button
                  key={n.id}
                  onClick={() => toggle(n.display)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent",
                    on && "bg-accent",
                  )}
                >
                  <Check className={cn("mt-0.5 h-3 w-3 shrink-0", on ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[12px]">{n.display}</span>
                    <span className="block text-[10.5px] text-muted-foreground">
                      {n.label} · quality {n.qualityRating.toLowerCase()}
                    </span>
                  </span>
                  {/* An unverified number can be bound but will not receive until
                      Meta finishes verifying it, which is worth knowing before the
                      entry point is set live rather than after it stays silent. */}
                  {!n.verified && (
                    <span
                      className="mt-0.5 flex shrink-0 items-center gap-0.5 text-[10px] text-warning"
                      title="Not yet verified by Meta — it will not receive messages until it is."
                    >
                      <AlertTriangle className="h-3 w-3" /> unverified
                    </span>
                  )}
                </button>
              );
            })}
            </div>
            ))}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
