import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type MultiSelectOption = { value: string; label: string };

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "All",
  className,
  triggerClassName,
  searchable = true,
  allLabel,
}: {
  options: MultiSelectOption[];
  /** Selected values. Empty array = "All". */
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  searchable?: boolean;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () => (q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options),
    [options, q],
  );

  const allSelected = value.length === 0 || value.length === options.length;
  // A single pinned value always shows its own label — even when it is the only
  // option (1-of-1). Otherwise a scoped default (e.g. one run) would misleadingly
  // read "All Runs". "All …" is reserved for the empty/unfiltered state and for
  // an explicit all-of-many selection.
  const single = value.length === 1;
  // When the scope offers exactly one option, "All X" and "that one option" denote
  // the same set — so show the concrete label rather than a misleading "All …".
  // This keeps gated widgets honest: e.g. a Voice Agent filter that resolves to a
  // single agent reads as that agent (which is why intent can populate), not
  // "All Voice Agents". Applies even when nothing is explicitly selected.
  const lone = options.length === 1;
  const display = single
    ? (options.find((o) => o.value === value[0])?.label ?? allLabel ?? placeholder)
    : lone
      ? options[0].label
      : allSelected
        ? (allLabel ?? placeholder)
        : `${value.length} selected`;

  function toggle(v: string) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  function toggleAll() {
    if (allSelected) onChange(options.map((o) => o.value));
    else onChange([]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring",
            triggerClassName,
          )}
        >
          <span className={cn("truncate", allSelected && !single && !lone && "text-muted-foreground")}>{display}</span>
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[260px] p-0", className)} align="start">
        {searchable && (
          <div className="border-b border-border p-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="h-7 text-xs"
            />
          </div>
        )}
        <div className="max-h-[260px] overflow-auto p-1">
          <button
            type="button"
            onClick={toggleAll}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
          >
            <span
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                allSelected && "bg-primary text-primary-foreground",
              )}
            >
              {allSelected && <Check className="h-3 w-3" />}
            </span>
            <span className="font-medium">{allLabel ?? "All"}</span>
          </button>
          <div className="my-1 h-px bg-border" />
          {filtered.map((o) => {
            const selected = !allSelected && value.includes(o.value);
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
              >
                <Checkbox checked={selected} onCheckedChange={() => toggle(o.value)} />
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
