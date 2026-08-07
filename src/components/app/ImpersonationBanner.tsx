/**
 * Persistent impersonation banner.
 *
 * The PRD's rule: an operator inside a tenant workspace must *never* be able to
 * forget it. So the banner is not dismissible, sits above every page, counts
 * down in real time, and hard-exits at zero without a renew affordance. The
 * countdown is cosmetic — the server-side ticket expiry is the real boundary —
 * but it makes the guarantee legible.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, LogOut, Clock, Ticket } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSession, endImpersonation } from "@/lib/admin-store";
import { tenantById } from "@/lib/admin-data";
import { ROLE_LABEL } from "@/lib/admin-rbac";

function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ImpersonationBanner() {
  const session = useSession();
  const navigate = useNavigate();
  const imp = session.impersonation;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!imp) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [imp]);

  const remaining = imp ? imp.expiresAt - now : 0;

  // Hard auto-expiry. Non-renewable: the only path back in is a fresh session.
  useEffect(() => {
    if (!imp || remaining > 0) return;
    endImpersonation("expired");
    toast.info("Impersonation session expired", {
      description: "Sessions are capped at 30 minutes and cannot be renewed.",
    });
    navigate({ to: "/admin/audit" });
  }, [imp, remaining, navigate]);

  if (!imp) return null;

  const tenant = tenantById(imp.tenantId);
  const urgent = remaining <= 5 * 60_000;

  return (
    <div
      className={cn(
        "flex h-11 shrink-0 items-center gap-3 border-b px-4 text-[12px] text-white",
        urgent ? "border-destructive/40 bg-destructive" : "border-ai/40 bg-ai",
      )}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/20">
        <Eye className="h-3.5 w-3.5" />
      </span>

      <p className="min-w-0 truncate">
        Viewing <strong className="font-semibold">{tenant?.name ?? imp.tenantId}</strong> as{" "}
        <strong className="font-semibold">{ROLE_LABEL[imp.actorRole]}</strong>
        <span className="hidden text-white/75 sm:inline"> · {imp.actor}</span>
      </p>

      <span className="hidden items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[11px] md:inline-flex">
        <Ticket className="h-3 w-3" />
        {imp.ticket}
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 font-mono text-[11.5px] tabular-nums">
        <Clock className="h-3 w-3" />
        session ends in {mmss(remaining)}
      </span>

      <button
        type="button"
        onClick={() => {
          endImpersonation("manual");
          toast.success("Left the impersonation session");
          navigate({ to: "/admin/audit" });
        }}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[11.5px] font-semibold text-foreground transition-opacity hover:opacity-90"
      >
        <LogOut className="h-3.5 w-3.5" />
        Exit
      </button>
    </div>
  );
}
