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
    <DetailRow label={label} critical={critical} action={copyable && value ? <CopyButton value={value} /> : undefined}>
      <p
        className={cn(
          "break-words text-[12px] leading-relaxed",
          mono && "font-mono text-[11.5px]",
          value ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {value || "—"}
      </p>
      {note && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{note}</p>}
    </DetailRow>
  );
}

/**
 * The row shell every provisioning row shares — label, body, action.
 *
 * Extracted because it was being hand-rolled four times: `CopyRow` here plus a bespoke
 * password/credential row on each of the three connector pages. They agreed on the
 * label width and then drifted on everything else, and the moment the body column
 * gained a max-width the copy buttons and the rotate buttons stopped lining up — three
 * copies cannot stay aligned by agreement.
 *
 * The cap is on the *text measure*, not on the column. Capping the column moved the
 * action inward with it, which left a dead band of empty card to the right of every
 * button on a wide screen and read as misplacement. So the body column still fills the
 * row — actions land in one clean column at the card's edge, the way a table's trailing
 * action column does — while the text inside it stops at a readable width rather than
 * running the full span.
 *
 * A row with no action still reserves the column, so a panel mixing copyable and
 * non-copyable rows keeps one clean right edge instead of a ragged one.
 *
 * The `critical` rule is drawn as an absolutely-positioned bar, and every row carries
 * the same left inset whether or not it has one. Drawn as a border it inset only the
 * rows that had it, which shifted their action twelve pixels right of every other
 * row's — invisible while the action was pinned to the card's edge, obvious once it
 * followed the content.
 */
export function DetailRow({
  label,
  critical = false,
  action,
  children,
}: {
  label: string;
  critical?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex items-start gap-3 py-2 pl-2.5">
      {critical && (
        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-warning/60" />
      )}
      <div className="w-[168px] shrink-0 pt-0.5">
        <p className="text-[11.5px] font-medium leading-tight">{label}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="max-w-3xl">{children}</div>
      </div>
      {action ?? <span className="w-[58px] shrink-0" />}
    </div>
  );
}
