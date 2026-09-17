import { useState } from "react";
import { Building2, Info, Bot as BotIcon } from "lucide-react";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { RcsChannelConfig, RcsAgent, RcsBrand } from "@/lib/rcs-config";
import { brandById, RCS_AGENT_TYPES, providerLabel } from "@/lib/rcs-config";

/**
 * RCS → Overview tab. A **read-only** view of the brand/agent setup the Pi
 * Commerce ops team provisions from the backend (PICOM-4728 §2). Each brand is
 * registered under one **provider** (JIO or Netcore-VI) and owns **agents**,
 * grouped here by their **type** (Transactional / Promotional).
 *
 * Deliberately has no actions — brand/agent onboarding runs through the provider
 * and agent verification, off-dashboard. An agent's ID and Key are backend
 * credentials and are never shown here.
 */
export function RcsOverview({ config }: { config: RcsChannelConfig }) {
  const [brandId, setBrandId] = useState(config.brands[0]?.id ?? "");
  const brand = brandById(config, brandId);
  const agents = brand?.agents ?? [];

  return (
    <div className="h-full overflow-y-auto px-8 pb-6">
      <div className="space-y-8 pb-10">
        {/* Brand picker */}
        <Section
          title="Brand"
          desc="Select an onboarded brand to see the agents registered under it. A brand is registered under a single provider."
        >
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[18rem] max-w-md flex-1">
              <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" /> Brand
              </label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Select a brand" />
                </SelectTrigger>
                <SelectContent>
                  {config.brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name} · {providerLabel(b.provider)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {brand && (
              <div className="mb-0.5">
                <p className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Provider</p>
                <ProviderPill brand={brand} />
              </div>
            )}
          </div>
        </Section>

        {/* Agents for the selected brand, grouped by type */}
        <Section
          title="Registered agents"
          desc="The agents approved for this brand, grouped by type."
        >
          <div className="space-y-5">
            {RCS_AGENT_TYPES.map((type) => {
              const typeAgents = agents.filter((a) => a.type === type);
              if (typeAgents.length === 0) return null;
              return (
                <div key={type}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {type} · {typeAgents.length}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {typeAgents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
                  </div>
                </div>
              );
            })}
            {agents.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center text-[13px] text-muted-foreground">
                No agents registered under this brand.
              </div>
            )}
          </div>
        </Section>

        {/* How onboarding works — explains why nothing here is editable. */}
        <Section title="How RCS onboarding works" desc="Agent registration happens with the provider, not in this dashboard.">
          <ol className="space-y-2.5 rounded-xl border border-border bg-card px-6 py-5">
            <Step n={1}>Register your brand under a provider (JIO or Netcore-VI) and create one or more agents under it.</Step>
            <Step n={2}>Set each agent's type (Transactional or Promotional); the provider verifies the agent before it can send live traffic.</Step>
            <Step n={3}>Share your brand, agents and their Agent IDs / Keys with your account team — these credentials stay in the backend.</Step>
            <Step n={4}>Pi Commerce operations records them here — after which your approved templates can be used in campaigns.</Step>
          </ol>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-px h-3 w-3 shrink-0" />
            To add or change a brand or agent, register it with your provider first, then contact your account team — this configuration is managed by Pi Commerce operations and is read-only here.
          </p>
        </Section>
      </div>
    </div>
  );
}

function ProviderPill({ brand }: { brand: RcsBrand }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
        brand.provider === "JIO"
          ? "border-ai/30 bg-ai/10 text-ai"
          : "border-border bg-secondary text-muted-foreground",
      )}
    >
      {providerLabel(brand.provider)}
    </span>
  );
}

function AgentCard({ agent }: { agent: RcsAgent }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-foreground">
        <BotIcon className="h-5 w-5" />
      </span>
      <p className="mt-3 truncate text-[14px] font-semibold text-foreground">{agent.name}</p>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
          {agent.type}
        </span>
        <span className="text-[10.5px] text-muted-foreground">Registered {agent.registeredOn}</span>
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
