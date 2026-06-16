import { useState } from "react";
import {
  MessageCircle, BadgeCheck, Building2, Phone as PhoneIcon, RefreshCw,
  Link2, ShieldCheck, Activity, Gauge, Loader2, Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConnectedWaba } from "@/lib/waba-onboarding";
import { useRegion, localizeTzAbbrev, localizeDialCode } from "@/lib/region";

/**
 * WhatsApp → Overview tab. The connected-state dashboard for the channel: the
 * linked Meta assets (Business Portfolio, WABA, phone), the provisioning /
 * connection metadata Pi Commerce tracks from Meta webhooks, and sender quality
 * & limits.
 *
 * Laid out as a full-width web dashboard (not a modal): assets are a responsive
 * card grid and the status / quality metrics spread across full-width stat rows.
 * Lifecycle actions (Reconnect · Disconnect) live in the page header; the only
 * in-body action is the section-level Refresh. Mock only — Refresh just nudges
 * "Last sync".
 */
export function WhatsAppOverview({ data }: { data: ConnectedWaba }) {
  const { tzAbbrev, dialCode } = useRegion();
  const [lastSync, setLastSync] = useState(data.connection.lastSync);
  const [refreshing, setRefreshing] = useState(false);

  // Connected-asset metadata is region-sensitive: show the phone with the active
  // country's dial code and the connection timestamp in its timezone.
  const phoneDisplay = localizeDialCode(data.phone.display, dialCode);
  const connectedAt = localizeTzAbbrev(data.connection.connectedAt, tzAbbrev);

  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => { setRefreshing(false); setLastSync("Just now"); }, 900);
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Connected assets */}
      <Section title="Connected assets" desc="The Meta business assets linked through Embedded Signup.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AssetCard
            icon={Building2}
            label="Business portfolio"
            title={data.businessPortfolio.name}
            id={data.businessPortfolio.id}
          />
          <AssetCard
            icon={MessageCircle}
            label="WhatsApp Business Account"
            title={data.waba.name}
            id={data.waba.id}
            sub={data.waba.category}
          />
          <AssetCard
            icon={PhoneIcon}
            label="Phone number"
            title={phoneDisplay}
            id={data.phone.id}
            badge={data.phone.verified ? "Verified" : undefined}
          />
        </div>
      </Section>

      {/* Connection status */}
      <Section
        title="Connection status"
        desc="Live provisioning state synced from Meta."
        action={
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} className="h-8 gap-1.5 text-xs">
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh status
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 rounded-xl border border-border bg-card px-6 py-5 sm:grid-cols-4">
          <Stat icon={Activity} label="Status" value={data.connection.status} valueClass="text-success" />
          <Stat icon={ShieldCheck} label="Provisioning" value={data.connection.provisioningStatus} />
          <Stat icon={Link2} label="Connected at" value={connectedAt} />
          <Stat icon={RefreshCw} label="Last sync" value={lastSync} />
        </div>
      </Section>

      {/* Sender quality */}
      <Section title="Sender quality & limits" desc="Quality, limit tier and verification reported by WhatsApp.">
        <div className="grid grid-cols-1 gap-x-6 gap-y-6 rounded-xl border border-border bg-card px-6 py-5 sm:grid-cols-3">
          <Stat icon={Gauge} label="Quality rating" value={data.sender.qualityRating} />
          <Stat icon={Activity} label="Messaging limit" value={data.sender.messagingLimitTier} />
          <Stat icon={BadgeCheck} label="Business verification" value={data.sender.businessVerification} />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <RefreshCw className="h-3 w-3" /> Quality, limit tier and template status sync automatically from Meta webhooks.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, desc, action, children }: {
  title: string; desc?: string; action?: React.ReactNode; children: React.ReactNode;
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

function AssetCard({ icon: Icon, label, title, id, sub, badge }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; title: string; id: string; sub?: string; badge?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-foreground">
          <Icon className="h-5 w-5" />
        </span>
        {badge && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10.5px] font-medium text-success">
            <BadgeCheck className="h-3 w-3" /> {badge}
          </span>
        )}
      </div>
      <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[14px] font-semibold text-foreground">{title}</p>
      <p className="mt-1.5 flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
        <Hash className="h-3 w-3 shrink-0" /> {id}
      </p>
      {sub && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Stat({ icon: Icon, label, value, valueClass = "text-foreground" }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className={`mt-0.5 text-[14px] font-semibold leading-snug ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}
