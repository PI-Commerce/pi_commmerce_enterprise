import { AppSidebar } from "./AppSidebar";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  bare = false,
}: {
  children: React.ReactNode;
  /** When true, removes the page padding (use for full-bleed canvas pages) */
  bare?: boolean;
}) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <main className={cn("relative flex-1 overflow-y-auto", !bare && "px-8 py-6")}>{children}</main>
      </div>
    </div>
  );
}

/**
 * The one size a page title is. Exported because detail pages build their own
 * headers — they carry a back link, a mark and a meta row that {@link PageHeader}
 * has no props for — and were each re-typing this string, which is how three
 * headers ended up at two different sizes.
 */
export const PAGE_TITLE_CLASS = "text-[22px] font-semibold tracking-tight";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className={PAGE_TITLE_CLASS}>{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
