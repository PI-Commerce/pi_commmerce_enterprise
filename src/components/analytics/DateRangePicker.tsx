import * as React from "react";
import { format, subDays } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PRESETS: { id: string; label: string; days: number }[] = [
  { id: "7d",  label: "Last 7 days",  days: 7 },
  { id: "14d", label: "Last 14 days", days: 14 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
];

export function defaultDateRange(days = 14): DateRange {
  const to = new Date();
  const from = subDays(to, days - 1);
  return { from, to };
}

export function rangeDays(range: DateRange | undefined): number {
  if (!range?.from || !range?.to) return 14;
  return Math.max(1, Math.round((+range.to - +range.from) / 86400000) + 1);
}

export function DateRangePicker({
  value,
  onChange,
  className,
  align = "end",
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const label = value?.from
    ? value.to
      ? `${format(value.from, "MMM d, yyyy")} – ${format(value.to, "MMM d, yyyy")}`
      : format(value.from, "MMM d, yyyy")
    : "Pick a date range";

  function applyPreset(days: number) {
    onChange(defaultDateRange(days));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-9 justify-start gap-2 text-xs font-normal", !value && "text-muted-foreground", className)}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <div className="flex">
          <div className="flex w-[140px] flex-col gap-0.5 border-r border-border p-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.days)}
                className="rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
              >
                {p.label}
              </button>
            ))}
          </div>
          <Calendar
            mode="range"
            selected={value}
            onSelect={onChange}
            numberOfMonths={2}
            defaultMonth={value?.from ?? subDays(new Date(), 30)}
            className={cn("p-3 pointer-events-auto")}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
