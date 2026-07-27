import { useState } from "react";
import { Building2, Info } from "lucide-react";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import type { SmsChannelConfig } from "@/lib/sms-config";
import { sendersForEntity } from "@/lib/sms-config";

/**
 * SMS → Overview tab. A **read-only** view of the DLT setup the Pi Commerce ops
 * team provisions from the backend (PICOM-4726 §2). The client picks one of
 * their onboarded Principal Entities (by ID) and sees the Sender IDs registered
 * under it.
 *
 * Deliberately has no actions. Unlike WhatsApp — where the merchant drives
 * Embedded Signup themselves — SMS onboarding runs through the client's DLT
 * portal and Paytm's approval, so there is nothing here for the client to
 * connect, edit or disconnect. Vendor routing (SMPP accounts, hosts, ports,
 * failover tiers) is internal and intentionally not surfaced.
 */
export function SmsOverview({ config }: { config: SmsChannelConfig }) {
  const [peId, setPeId] = useState(config.principalEntities[0]?.id ?? "");
  const senders = sendersForEntity(config, peId);

  return (
    <div className="h-full overflow-y-auto px-8 pb-6">
      <div className="space-y-8 pb-10">
        {/* Principal Entity picker */}
        <Section
          title="Principal Entity"
          desc="Select an onboarded Principal Entity to see the Sender IDs registered under it."
        >
          <div className="max-w-md">
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" /> PE ID
            </label>
            <Select value={peId} onValueChange={setPeId}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="Select a Principal Entity" />
              </SelectTrigger>
              <SelectContent>
                {config.principalEntities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className="font-mono">{e.id}</span>
                    <span className="ml-2 text-muted-foreground">· {e.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Section>

        {/* Sender IDs for the selected PE */}
        <Section
          title="Registered Sender IDs"
          desc="The headers approved on DLT for this entity, and the categories each one may be used for."
        >
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[1fr_2fr_1fr] items-center gap-3 border-b border-border bg-secondary/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Sender ID</span>
              <span>Approved categories</span>
              <span className="text-right">Registered on</span>
            </div>
            {senders.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                No Sender IDs registered under this entity.
              </div>
            ) : (
              senders.map((s) => (
                <div
                  key={s.id}
                  className="grid grid-cols-[1fr_2fr_1fr] items-center gap-3 border-b border-border px-4 py-3 text-[13px] last:border-0"
                >
                  <span className="font-mono text-[12.5px] font-medium text-foreground">{s.id}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {s.categories.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                      >
                        {c}
                      </span>
                    ))}
                  </span>
                  <span className="text-right text-[12px] text-muted-foreground">{s.registeredOn}</span>
                </div>
              ))
            )}
          </div>
        </Section>

        {/* How onboarding works — explains why nothing here is editable. */}
        <Section title="How SMS onboarding works" desc="Registration happens on the DLT portal, not in this dashboard.">
          <ol className="space-y-2.5 rounded-xl border border-border bg-card px-6 py-5">
            <Step n={1}>Whitelist Paytm's Telemarketer ID on your DLT portal.</Step>
            <Step n={2}>Paytm approves the request, establishing the PE-TM binding.</Step>
            <Step n={3}>Share your Principal Entity, Sender IDs and intended categories with your account team.</Step>
            <Step n={4}>Pi Commerce operations records them here — after which your DLT-approved templates can be mirrored into the registry.</Step>
          </ol>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-px h-3 w-3 shrink-0" />
            To add or change a Principal Entity or Sender ID, register it on your DLT portal first, then contact your account team — this configuration is managed by Pi Commerce operations and is read-only here.
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
