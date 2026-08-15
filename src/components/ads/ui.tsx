/**
 * Shared presentation primitives for the Ads Manager.
 *
 * Pulled out because the same section chrome, status pills, creative tiles and
 * number formatting appear across the overview, the ad list, the composer, the
 * CAPI log and the analytics tab. Everything here is presentational — no store
 * reads — so each surface stays responsible for its own data.
 */
import { BadgeCheck, Clock, FileEdit, Image, PauseCircle, Play, Video, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AD_STATUS_LABELS, type AdFormat, type AdStatus } from "@/lib/ctwa-types";

/* ─────────────────────────── Layout ─────────────────────────── */

export function Section({
  title,
  desc,
  action,
  children,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
          {desc && <p className="mt-0.5 text-[12px] text-muted-foreground/80">{desc}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function Stat({
  icon: Icon,
  label,
  value,
  valueClass = "text-foreground",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className={cn("mt-0.5 text-[14px] font-semibold leading-snug", valueClass)}>{value}</p>
      </div>
    </div>
  );
}

/** Big-number tile used by the overview and analytics headers. */
export function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-3xl font-semibold tracking-tight tabular-nums",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[11.5px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}

/* ─────────────────────────── Status ─────────────────────────── */

const STATUS_TONE: Record<AdStatus, string> = {
  draft: "border-border bg-secondary text-muted-foreground",
  in_review: "border-warning/30 bg-warning/10 text-warning",
  active: "border-success/30 bg-success/10 text-success",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
  paused: "border-border bg-secondary text-muted-foreground",
  completed: "border-border bg-secondary text-muted-foreground",
};

const STATUS_ICON: Record<AdStatus, React.ComponentType<{ className?: string }>> = {
  draft: FileEdit,
  in_review: Clock,
  active: Play,
  rejected: XCircle,
  paused: PauseCircle,
  completed: BadgeCheck,
};

export function StatusPill({ status }: { status: AdStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
        STATUS_TONE[status],
      )}
    >
      <Icon className="h-3 w-3" /> {AD_STATUS_LABELS[status]}
    </span>
  );
}

/* ─────────────────────────── Creative ─────────────────────────── */

/**
 * Creatives are `picom://creative/<slug>` tokens, never real files. Rendering a
 * deterministic gradient from the slug keeps the demo self-contained — no asset
 * pipeline, no broken images, and the same ad always looks the same.
 *
 * BACKEND: swap for an `<img src={mediaUrl}>` once creatives are real uploads.
 */
export function CreativeTile({
  mediaUrl,
  format,
  className,
}: {
  mediaUrl: string;
  format: AdFormat;
  className?: string;
}) {
  const slug = mediaUrl.replace("picom://creative/", "") || "untitled";
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const initials = slug
    .split("-")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-lg", className)}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 62% 46%), hsl(${(hue + 42) % 360} 58% 36%))`,
      }}
      aria-hidden="true"
    >
      <span className="text-[13px] font-semibold tracking-tight text-white/90">{initials}</span>
      <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded bg-black/35 text-white">
        {format === "video" ? <Video className="h-2.5 w-2.5" /> : <Image className="h-2.5 w-2.5" />}
      </span>
    </div>
  );
}

/* ─────────────────────────── Formatting ─────────────────────────── */

export function money(n: number, symbol: string, decimals = 0): string {
  return `${symbol}${n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function compact(n: number): string {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

export function latency(ms: number): string {
  if (!ms) return "—";
  return ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/** Coarse "how long ago", relative to the sim clock rather than wall time. */
export function since(ms: number, nowMs: number): string {
  const d = Math.max(0, nowMs - ms);
  const mins = Math.floor(d / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
