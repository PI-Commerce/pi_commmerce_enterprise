/**
 * Release Notes list, Stripe-inspired layout.
 *
 * Two columns per entry: a left gutter with date + category badge, a vertical
 * rule, then the right column with title, summary, highlights and a link.
 * Entries group under version headings ("v2", "v1"). No standalone page shell,
 * so this can be embedded as a tab inside the Developer surface.
 */

import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  RELEASE_ENTRIES,
  formatReleaseDate,
  getEntriesByVersion,
  type ReleaseCategory,
  type ReleaseEntry,
} from "@/lib/release-notes";

/** Category tint. Uses semantic tokens so it inherits from dark/light theme. */
const CATEGORY_TINT: Record<ReleaseCategory, string> = {
  Channels:    "border-ai/30 bg-ai/10 text-ai",
  Workflow:    "border-warning/30 bg-warning/10 text-warning",
  Developer:   "border-border bg-secondary text-foreground",
  Campaigns:   "border-primary/30 bg-primary/10 text-primary",
};

/**
 * Props:
 *   - hideAppLinks: when true, entries do NOT render their in-app "Open" link.
 *     Used by the public-docs deployment, where the internal app routes are
 *     not part of the shell.
 */
export function ReleaseNotesList({ hideAppLinks = false }: { hideAppLinks?: boolean } = {}) {
  const v21 = getEntriesByVersion("v2.1");
  const v2 = getEntriesByVersion("v2");

  return (
    <div className="max-w-4xl">
      <VersionBlock label="v2.1" entries={v21} hideAppLinks={hideAppLinks} />
      <VersionBlock label="v2" entries={v2} className="mt-14" hideAppLinks={hideAppLinks} />
      <p className="mt-16 text-[11px] text-muted-foreground">
        {RELEASE_ENTRIES.length} entries. Newest first.
      </p>
    </div>
  );
}

function VersionBlock({
  label,
  entries,
  className,
  hideAppLinks,
}: {
  label: string;
  entries: ReleaseEntry[];
  className?: string;
  hideAppLinks?: boolean;
}) {
  return (
    <section className={cn(className)}>
      <VersionHeader label={label} count={entries.length} />
      <ol className="mt-6 divide-y divide-border">
        {entries.map((e) => (
          <li key={e.id}>
            <EntryRow entry={e} hideAppLinks={hideAppLinks} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function VersionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border pb-2">
      <h2 className="text-[15px] font-semibold uppercase tracking-wider">
        {label}
      </h2>
      <span className="text-[11px] text-muted-foreground">
        {count} {count === 1 ? "release" : "releases"}
      </span>
    </div>
  );
}

/**
 * A single entry row.
 *
 * Grid layout mirrors Stripe: date + tag column on the left (fixed width), a
 * vertical rule, and the description on the right. On narrow screens the
 * columns stack.
 */
function EntryRow({ entry, hideAppLinks }: { entry: ReleaseEntry; hideAppLinks?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 py-8 md:grid-cols-[180px_1fr] md:gap-10">
      <div className="flex flex-col gap-2 md:border-r md:border-border md:pr-6">
        <p className="text-[12px] font-medium text-muted-foreground">
          {formatReleaseDate(entry.date)}
        </p>
        <div>
          <Badge
            variant="outline"
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              CATEGORY_TINT[entry.category],
            )}
          >
            {entry.category}
          </Badge>
        </div>
      </div>
      <div className="min-w-0">
        <h3 className="text-[17px] font-semibold tracking-tight">
          {entry.title}
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          {entry.summary}
        </p>
        <ul className="mt-4 space-y-1.5">
          {entry.highlights.map((h, i) => (
            <li
              key={i}
              className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/90"
            >
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-foreground/60" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
        {entry.linkTo && !hideAppLinks && (
          <div className="mt-4">
            <Link
              to={entry.linkTo}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-foreground hover:underline"
            >
              {entry.linkLabel ?? "Open in app"}{" "}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
