/**
 * Small inspector primitives shared by the campaign ConfigPanel and the agent
 * builder's AgentConfigPanel. Extracted so both right-side inspectors render the
 * same section headers, labelled fields, and select control. Kept intentionally
 * dependency-light (no campaign-variable coupling — VariablePicker stays in
 * ConfigPanel).
 */
import { useState } from "react";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

/** Uppercase section header + stacked children. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 space-y-3 last:mb-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

/** Labelled form row with an optional required marker. */
export function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-[11.5px] font-medium text-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

/** Uncontrolled-ish single select over a list of string options. */
export function SelectLike({
  options, placeholder, defaultValue, disabled, onPick,
}: { options: string[]; placeholder?: string; defaultValue?: string; disabled?: boolean; onPick: (v: string) => void }) {
  const [value, setValue] = useState(defaultValue ?? "");
  return (
    <Select value={value || undefined} disabled={disabled} onValueChange={(v) => { setValue(v); onPick(v); }}>
      <SelectTrigger className="h-9 text-sm">
        <SelectValue placeholder={placeholder ?? "Select…"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
