/**
 * Copy controls for the CleverTap panels.
 *
 * Every value on these screens exists to be pasted into a different product, so
 * copy is the primary action rather than a convenience — which is why it is a
 * component rather than an inline handler repeated twenty times. The 1.5s revert
 * matches the existing control on the engagement-tool page.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={copy}
      className={cn("h-6 shrink-0 gap-1 px-2 text-[10.5px]", className)}
    >
      {copied ? (
        <>
          <Check className="h-2.5 w-2.5 text-success" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-2.5 w-2.5" /> {label}
        </>
      )}
    </Button>
  );
}

/**
 * One provisioning value.
 *
 * `critical` exists for the handful of fields where a wrong character produces a
 * silent failure rather than an error — the template name and language above all.
 * A left rule is enough; a full alert per row would flatten the distinction it is
 * trying to draw.
 */
export function CopyRow({
  label,
  value,
  note,
  copyable = true,
  critical = false,
  mono = true,
}: {
  label: string;
  value: string;
  note?: string;
  copyable?: boolean;
  critical?: boolean;
  mono?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 py-2",
        critical && "border-l-2 border-warning/60 pl-2.5",
      )}
    >
      <div className="w-[168px] shrink-0 pt-0.5">
        <p className="text-[11.5px] font-medium leading-tight">{label}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "break-words text-[12px] leading-relaxed",
            mono && "font-mono text-[11.5px]",
            value ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {value || "—"}
        </p>
        {note && (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{note}</p>
        )}
      </div>
      {copyable && value ? (
        <CopyButton value={value} />
      ) : (
        <span className="w-[58px] shrink-0" />
      )}
    </div>
  );
}
