import { useState } from "react";
import { Building2, Info, BadgeCheck, Bot as BotIcon } from "lucide-react";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { RcsChannelConfig, RcsBot } from "@/lib/rcs-config";
import { botsForBrand } from "@/lib/rcs-config";
import { RCS_CATEGORIES } from "@/lib/rcs-templates";

/**
 * RCS → Overview tab. A **read-only** view of the brand/bot setup the Pi Commerce
 * ops team provisions from the backend (PICOM-4728 §2). The client picks one of
 * their onboarded brands and sees its bots (agents), grouped by category, with
 * the vendor pipeline each routes through (JIO or Netcore-VI).
 *
 * Deliberately has no actions — brand/bot onboarding runs through the vendor
 * (JIO / Netcore) and Google agent verification, off-dashboard. Vendor internals
 * (bot keys, API endpoints) are not surfaced.
 */
export function RcsOverview({ config }: { config: RcsChannelConfig }) {
  const [brandId, setBrandId] = useState(config.brands[0]?.id ?? "");
  const bots = botsForBrand(config, brandId);

  return (
    <div className="h-full overflow-y-auto px-8 pb-6">
      <div className="space-y-8 pb-10">
        {/* Brand picker */}
        <Section
          title="Brand"
          desc="Select an onboarded brand to see the bots (agents) registered under it."
        >
          <div className="max-w-md">
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" /> Brand
            </label>
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="Select a brand" />
              </SelectTrigger>
              <SelectContent>
                {config.brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Section>

        {/* Bots for the selected brand, grouped by category */}
        <Section
          title="Registered bots"
          desc="The agents approved for this brand, grouped by category, and the vendor pipeline each routes through."
        >
          <div className="space-y-5">
            {RCS_CATEGORIES.map((cat) => {
              const catBots = bots.filter((b) => b.category === cat);
              if (catBots.length === 0) return null;
              return (
                <div key={cat}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {cat} · {catBots.length}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {catBots.map((bot) => <BotCard key={bot.id} bot={bot} />)}
                  </div>
                </div>
              );
            })}
            {bots.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center text-[13px] text-muted-foreground">
                No bots registered under this brand.
              </div>
            )}
          </div>
        </Section>

        {/* How onboarding works — explains why nothing here is editable. */}
        <Section title="How RCS onboarding works" desc="Bot registration happens with the vendor and Google, not in this dashboard.">
          <ol className="space-y-2.5 rounded-xl border border-border bg-card px-6 py-5">
            <Step n={1}>Register your brand and create a bot (agent) per message category with your RCS vendor (JIO or Netcore).</Step>
            <Step n={2}>Google verifies the agent — required before the bot can send live traffic.</Step>
            <Step n={3}>Share your brand, bots and their categories with your account team.</Step>
            <Step n={4}>Pi Commerce operations records them here — after which your approved templates can be used in campaigns.</Step>
          </ol>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-px h-3 w-3 shrink-0" />
            To add or change a brand or bot, register it with your vendor first, then contact your account team — this configuration is managed by Pi Commerce operations and is read-only here.
          </p>
        </Section>
      </div>
    </div>
  );
}

function BotCard({ bot }: { bot: RcsBot }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-foreground">
          <BotIcon className="h-5 w-5" />
        </span>
        {bot.verified ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10.5px] font-medium text-success">
            <BadgeCheck className="h-3 w-3" /> Verified
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10.5px] font-medium text-warning">
            Pending verification
          </span>
        )}
      </div>
      <p className="mt-3 truncate text-[14px] font-semibold text-foreground">{bot.name}</p>
      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{bot.id}</p>
      <div className="mt-2.5 flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
            bot.vendor === "JIO"
              ? "border-ai/30 bg-ai/10 text-ai"
              : "border-border bg-secondary text-muted-foreground",
          )}
        >
          {bot.vendor === "JIO" ? "JIO" : "Netcore · VI"}
        </span>
        <span className="text-[10.5px] text-muted-foreground">Registered {bot.registeredOn}</span>
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
