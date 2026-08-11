/**
 * Shared primitives for the Admin Panel surfaces.
 *
 * Everything here is presentational and matches the design language already
 * used by the campaign/template tables, frozen header row, 13px body rows,
 * pill-shaped status chips, dashed info callouts. Pulled out so the six console
 * pages don't drift from each other.
 */

import { Info, ShieldAlert, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, type AnyRole, planeOf } from "@/lib/admin-rbac";

/* ================================== Pills ================================== */

export type Tone = "success" | "warning" | "danger" | "ai" | "muted";

const TONE: Record<Tone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  ai: "border-ai/30 bg-ai/10 text-ai",
  muted: "border-border bg-secondary text-muted-foreground",
};

export function Pill({
  tone = "muted", children, className, title,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  /** Native tooltip, used to explain *why* a capability pill is showing. */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  switch (status) {
    case "Live":
    case "Active":
      return "success";
    case "Onboarding":
    case "Invited":
      return "warning";
    case "Suspended":
    case "Revoked":
      return "danger";
    case "Disabled":
    case "Inactive":
      return "muted";
    default:
      return "muted";
  }
}

/** Role chip, tinted violet on the provider plane so planes read apart at a glance. */
export function RoleBadge({ role, className }: { role: AnyRole; className?: string }) {
  return (
    <Pill tone={planeOf(role) === "provider" ? "ai" : "muted"} className={className}>
      {ROLE_LABEL[role]}
    </Pill>
  );
}

/* ================================== Table ================================== */

export function TableShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function HeadRow({ grid, children }: { grid: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "grid shrink-0 items-center gap-3 border-b border-border bg-secondary/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
        grid,
      )}
    >
      {children}
    </div>
  );
}

export function BodyRow({
  grid, children, className,
}: {
  grid: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-[13px] transition-colors last:border-0 hover:bg-accent/40",
        grid,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center px-4 py-16 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}

/* ================================ Pagination =============================== */

export const PAGE_SIZE = 8;

export function Pagination({
  page, total, onPage,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const end = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div className="flex shrink-0 items-center justify-between border-t border-border bg-secondary/20 px-4 py-2">
      <p className="text-[11.5px] text-muted-foreground">
        Showing {start}–{end} of {total}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <button
          type="button"
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
          className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Slice a list for the current page, clamping the page if the list shrank. */
export function paginate<T>(rows: T[], page: number): T[] {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const p = Math.min(page, pages - 1);
  return rows.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
}

/* ================================= Filters ================================= */

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex shrink-0 flex-wrap items-end gap-3">{children}</div>;
}

/* ================================ Callouts ================================= */

export function Callout({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground",
        className,
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

export function Card({
  title, description, children, className, actions,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[14px] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label, value, sub, icon, accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        accent ? "border-ai/25 bg-ai/[0.06]" : "border-border bg-card",
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <span className={cn("shrink-0", accent ? "text-ai" : "text-muted-foreground")}>{icon}</span>}
      </div>
      <p className={cn("mt-2 text-[26px] font-semibold leading-none tracking-tight", accent && "text-ai")}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ============================== Capability gate ============================= */

/**
 * What a user hits when the UI gate says no.
 *
 * Worth being explicit about in a mock that developers will read: this screen is
 * a courtesy, not a control. The real rejection happens at the API and in the
 * RLS policy, if this component is the only thing standing between a role and
 * the data, the feature is not secure.
 */
export function NoAccess({
  title = "You don't have access to this",
  reason,
}: {
  title?: string;
  reason: string;
}) {
  return (
    <div className="grid flex-1 place-items-center px-6 py-20">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mx-auto mt-1.5 text-[13px] text-muted-foreground">{reason}</p>
        <p className="mx-auto mt-4 max-w-sm rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          This screen is the last layer of defence, never the enforcement boundary. The
          same call is rejected by the API and by the row-level security policy.
        </p>
      </div>
    </div>
  );
}
