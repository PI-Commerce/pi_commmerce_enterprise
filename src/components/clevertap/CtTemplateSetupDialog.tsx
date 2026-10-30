/**
 * FR-5 — what to type into CleverTap to use this template.
 *
 * There is no registration step. A template created by hand in CleverTap is matched
 * to ours on name and language alone, at send time, with nothing checked beforehand.
 * That makes this the only place a mismatch can be caught before a campaign goes out,
 * because the first symptom otherwise is a failed CleverTap campaign whose only
 * explanation is a generic provider error.
 *
 * So the dialog is a transcription aid and nothing more: the exact strings, in the
 * order CleverTap's own form asks for them, each with a copy control. Name, language
 * and parameter count carry a left rule because they are the three that fail
 * silently — everything else either has to match a Meta rule or is cosmetic in CT.
 *
 * The test send is here rather than on the connector page on purpose. The question
 * "will this template work" is asked about a template, and answering it next to the
 * fields you just copied is the difference between checking and not bothering.
 */
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CopyRow } from "@/components/clevertap/CopyRow";
import { Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { WaTemplate } from "@/lib/waba-templates";
import {
  ctTemplateSetup,
  formatWaba,
  normaliseE164,
  useCtConnectors,
} from "@/lib/clevertap";

export function CtTemplateSetupDialog({
  template,
  onOpenChange,
}: {
  template: WaTemplate | null;
  onOpenChange: (v: boolean) => void;
}) {
  const connectors = useCtConnectors();
  const usable = useMemo(() => connectors.filter((c) => c.enabled), [connectors]);
  const [connectorId, setConnectorId] = useState("");
  const [testNumber, setTestNumber] = useState("");

  const fields = useMemo(() => (template ? ctTemplateSetup(template) : []), [template]);
  const chosen = usable.find((c) => c.id === connectorId) ?? usable[0];
  const testE164 = normaliseE164(testNumber);

  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {template && (
          <>
            <DialogHeader>
              <DialogTitle className="text-[15px]">
                CleverTap setup — {template.name}
              </DialogTitle>
              <DialogDescription className="text-[12.5px]">
                Recreate this template by hand in CleverTap using exactly these values.
                Nothing is registered between the two systems: a send is matched on the
                name and language alone.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                <span className="font-medium text-foreground">
                  The name must match character for character
                </span>{" "}
                — capitalisation and underscores included.{" "}
                <span className="font-mono">Order_Update</span> will not find{" "}
                <span className="font-mono">order_update</span>, and the send fails with
                2001 rather than falling back to anything.
              </p>
            </div>

            <div className="max-h-[46vh] overflow-y-auto pr-1">
              <div className="divide-y divide-border">
                {fields.map((f) => (
                  <CopyRow
                    key={f.label}
                    label={f.label}
                    value={f.value}
                    note={f.note}
                    copyable={f.copyable ?? false}
                    critical={f.critical ?? false}
                  />
                ))}
              </div>
            </div>

            {/* ─────────────────────────── FR-5 test send ─────────────────────── */}
            <div className="space-y-2.5 rounded-lg border border-border bg-secondary/25 px-3 py-3">
              <div>
                <Label className="text-[12px]">Send yourself a test</Label>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  Goes through the same path a CleverTap message takes — same resolution,
                  same template, same number. If this arrives, the template is not the
                  problem.
                </p>
              </div>

              {usable.length === 0 ? (
                <p className="text-[11.5px] leading-snug text-muted-foreground">
                  No enabled CleverTap connector to send through. Add one under Connections
                  first.
                </p>
              ) : (
                <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Send from</Label>
                    <Select
                      value={chosen?.id ?? ""}
                      onValueChange={setConnectorId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {usable.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            {formatWaba(c.wabaNumber)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Test number</Label>
                    <Input
                      value={testNumber}
                      onChange={(e) => setTestNumber(e.target.value)}
                      placeholder="+91 98100 12345"
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    disabled={!testE164 || !chosen}
                    onClick={() => {
                      toast.success(`Test sent to ${formatWaba(testE164!)}`, {
                        description: `${template.name} · ${template.language} from ${formatWaba(chosen!.wabaNumber)}. Placeholders are filled with sample values.`,
                      });
                      setTestNumber("");
                    }}
                  >
                    <Send className="h-3.5 w-3.5" /> Send
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => onOpenChange(false)}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
