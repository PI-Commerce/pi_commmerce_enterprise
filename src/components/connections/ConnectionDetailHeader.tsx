/**
 * The header every Connections detail page wears.
 *
 * There are three such pages — an engagement tool's docs, a CRM connection, a
 * delivery connector — and each had rolled its own. They had drifted on five
 * properties at once: the back link was a ghost Button on one and bare text on two,
 * the title was `text-lg` on one and `text-[22px]` on two, the mark was `h-10
 * rounded-lg` on one, `h-11 rounded-xl` on another and absent on the third, the
 * status pill sat inline with the title on two and on its own row on one, and only
 * two carried a description at all. None of that was a decision.
 *
 * Not a mode of `PageHeader`: that one has nine call sites, none of which want a back
 * link, a mark or a meta row, and its description style (`mt-1 text-sm`) is wrong for
 * a page whose description is a paragraph. Only the title class is genuinely shared,
 * and that is imported.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PAGE_TITLE_CLASS } from "@/components/app/AppShell";
import { platformMark } from "@/lib/connections";
import { cn } from "@/lib/utils";

export function ConnectionDetailHeader({
  mark,
  title,
  meta,
  description,
  aside,
}: {
  /**
   * Structurally satisfied by both `Platform` and `PushTarget`, so callers pass the
   * registry entry straight through and cannot re-type an accent. The size lives
   * here rather than at the call site for the same reason.
   */
  mark?: { name: string; accent: string };
  title: string;
  /**
   * `ReactNode`, not a list of pills. The CRM page puts three different kinds of
   * thing on this row — a tone-mapped pill, bare text, and a mono host badge — and a
   * prop named `pills` would invite narrowing it to an array and then bypassing it.
   */
  meta?: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <>
      {/* Hardcoded, and it should stay that way: this is the Connections detail
          header, not a generic one, and every page that uses it came from here. */}
      <Link
        to="/integrations"
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All connections
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        {/* `flex-1` so the title block shrinks to share the row rather than claiming its
            intrinsic width and pushing the aside onto a line of its own. It used to wrap,
            which was invisible only while the description was capped at a narrow measure
            — once the description ran full width, the actions fell below it. */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {mark && (
            <span
              className={cn(
                "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[13px] font-semibold",
                mark.accent,
              )}
            >
              {platformMark(mark.name)}
            </span>
          )}
          <div className="min-w-0">
            <h1 className={cn(PAGE_TITLE_CLASS, "truncate")}>{title}</h1>
            {/* Only rendered when there is something to render. A page with no meta
                — the docs page, once its false "Live" pill was deleted — would
                otherwise gain a strip of dead vertical space. */}
            {meta !== undefined && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">{meta}</div>
            )}
            {description && (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
    </>
  );
}
