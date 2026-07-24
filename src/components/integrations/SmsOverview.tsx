import { BadgeCheck, Building2, Hash, Radio, ShieldCheck, Signpost, Link2, Send, Info } from "lucide-react";
import type { SmsChannelConfig } from "@/lib/sms-config";

/**
 * SMS → Overview tab. A **read-only** view of the DLT setup the Pi Commerce ops
 * team provisions from the backend (PICOM-4726 §2): the PE-TM binding, the
 * client's Principal Entity, the registered Sender IDs and their approved use
 * cases, and which pipelines are live.
 *
 * Deliberately has no actions. Unlike WhatsApp — where the merchant drives
 * Embedded Signup themselves — SMS onboarding runs through the client's DLT
 * portal and Paytm's approval, so there is nothing here for the client to
 * connect, edit or disconnect. Vendor routing (SMPP accounts, hosts, ports,
 * failover tiers) is internal and intentionally not surfaced.
 */
export function SmsOverview({ config }: { config: SmsChannelConfig }) {
  const bindingTone =
    config.binding.status === "Active"
      ? "text-success"
      : config.binding.status === "Pending approval"
        ? "text-warning"
        : "text-muted-foreground";

  return (
    <div className="h-full overflow-y-auto px-8 pb-6">
      <div className="space-y-8 pb-10">
        {/* DLT registration */}
        <Section
          title="DLT registration"
          desc="Your Principal Entity and its binding with Paytm's Telemarketer ID, as registered on the DLT portal."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AssetCard
              icon={Building2}
              label="Principal Entity"
              title={config.principalEntity.name}
              id={config.principalEntity.id}
            />
            <AssetCard
              icon={Radio}
              label="Telemarketer ID (Paytm)"
              title="One97 Communications Ltd"
              id={config.telemarketerId}
            />
            <AssetCard
              icon={ShieldCheck}
              label="PE-TM binding"
              title={config.binding.status}
              id={config.binding.dltOperator}
              badge={config.binding.status === "Active" ? "Approved" : undefined}
              titleClass={bindingTone}
              mono={false}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-6 rounded-xl border border-border bg-card px-6 py-5 sm:grid-cols-3">
            <Stat icon={Link2} label="Binding approved on" value={config.binding.approvedOn} />
            <Stat icon={Signpost} label="DLT operator" value={config.binding.dltOperator} />
            <Stat
              icon={Send}
              label="Live pipelines"
              value={config.pipelines.join(" · ")}
            />
          </div>
        </Section>

        {/* Sender IDs */}
        <Section
          title="Registered Sender IDs"
          desc="The headers approved on DLT for this entity, and the message types each one may be used for."
        >
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[1fr_2fr_1fr] items-center gap-3 border-b border-border bg-secondary/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Sender ID</span>
              <span>Approved use cases</span>
              <span className="text-right">Registered on</span>
            </div>
            {config.senderIds.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[1fr_2fr_1fr] items-center gap-3 border-b border-border px-4 py-3 text-[13px] last:border-0"
              >
                <span className="font-mono text-[12.5px] font-medium text-foreground">{s.id}</span>
                <span className="flex flex-wrap gap-1.5">
                  {s.useCases.map((u) => (
                    <span
                      key={u}
                      className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    >
                      {u}
                    </span>
                  ))}
                </span>
                <span className="text-right text-[12px] text-muted-foreground">{s.registeredOn}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* How onboarding works — explains why nothing here is editable. */}
        <Section title="How SMS onboarding works" desc="Registration happens on the DLT portal, not in this dashboard.">
          <ol className="space-y-2.5 rounded-xl border border-border bg-card px-6 py-5">
            <Step n={1}>Whitelist Paytm's Telemarketer ID on your DLT portal.</Step>
            <Step n={2}>Paytm approves the request, establishing the PE-TM binding.</Step>
            <Step n={3}>Share your Principal Entity, Sender IDs and intended use cases with your account team.</Step>
            <Step n={4}>Pi Commerce operations records them here — after which your DLT-approved templates can be mirrored into the registry.</Step>
          </ol>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-px h-3 w-3 shrink-0" />
            To add or change a Sender ID, register it on your DLT portal first, then contact your account team — this configuration is managed by Pi Commerce operations and is read-only here.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 min-w-0">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {desc && <p className="mt-0.5 text-[12px] text-muted-foreground/80">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

function AssetCard({ icon: Icon, label, title, id, badge, titleClass = "text-foreground", mono = true }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; title: string; id: string; badge?: string; titleClass?: string; mono?: boolean;
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
      <p className={`mt-0.5 truncate text-[14px] font-semibold ${titleClass}`}>{title}</p>
      <p className={`mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground ${mono ? "font-mono" : ""}`}>
        {mono && <Hash className="h-3 w-3 shrink-0" />} {id}
      </p>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-[14px] font-semibold leading-snug text-foreground">{value}</p>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[12.5px] text-muted-foreground">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border bg-secondary text-[10.5px] font-semibold text-muted-foreground">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
