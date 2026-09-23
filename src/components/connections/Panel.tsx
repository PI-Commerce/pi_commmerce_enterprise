/**
 * A titled card. The panel shape used across every Connections detail page.
 *
 * It lived in `clevertap/CopyRow.tsx` while CleverTap was its only caller, and that
 * cost exactly what you would expect: the CRM detail page wrote its own rather than
 * import a component filed under a vendor, and the two then drifted on padding and on
 * the name of the caption prop. Neutral home, one implementation.
 */
import { cn } from "@/lib/utils";

export function Panel({
  title,
  caption,
  action,
  children,
  className,
  flush = false,
}: {
  title: string;
  caption?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /**
   * Render children against the card edge. For bodies that already own their own
   * insets — a `divide-y` list of rows, or a table whose cells are `px-4` — where the
   * default `p-4` would read as a double margin.
   */
  flush?: boolean;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-tight">{title}</h2>
          {caption && (
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
              {caption}
            </p>
          )}
        </div>
        {action}
      </div>
      {flush ? children : <div className="p-4">{children}</div>}
    </section>
  );
}
