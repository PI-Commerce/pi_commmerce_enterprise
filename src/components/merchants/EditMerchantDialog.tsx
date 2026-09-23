import { useEffect, useState } from "react";
import {
  ShieldCheck, ShieldAlert, Gauge, History, OctagonX, Play, Megaphone, Store,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CHANNEL_META, CHANNEL_ORDER, CAP_PERIOD_LABEL, capRatio, capTone, effectiveCeiling,
  saveStopConfig, saveMerchantProfile, toProfile,
  type Merchant, type StopConfig, type ChannelCap, type CapPeriod, type Channel,
  type Enforcement, type MerchantCampaign, type MerchantProfile,
} from "@/lib/merchants";
import { MerchantProfileForm, isProfileComplete } from "./MerchantProfileForm";
import { StopCampaignDialog, ResumeCampaignDialog } from "./StopResumeDialogs";

/**
 * Edit a merchant — a single panel that merges the merchant profile (name, business,
 * contact, category, tax IDs, addresses) with its Stop-Campaign configuration
 * (enforcement, channel caps), the running campaigns admins can stop/resume, and the
 * change history. Profile and caps are edited as drafts and saved together; campaign
 * stop/resume act immediately. Merchant Id and type are fixed after onboarding.
 */
export function EditMerchantDialog({
  merchant, open, onOpenChange,
}: {
  merchant: Merchant | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [draft, setDraft] = useState<StopConfig | null>(null);
  const [stopTarget, setStopTarget] = useState<MerchantCampaign | null>(null);
  const [resumeTarget, setResumeTarget] = useState<MerchantCampaign | null>(null);

  // Re-seed the drafts whenever a different merchant opens, or the store mutates it
  // (a resume raises a cap → updatedAt bumps → drafts refresh with the new data).
  useEffect(() => {
    if (merchant) {
      setProfile(toProfile(merchant));
      setDraft(structuredClone(merchant.stopConfig));
    }
  }, [merchant?.id, merchant?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!merchant || !draft || !profile) return null;

  const patch = (p: Partial<StopConfig>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const patchCap = (channel: Channel, p: Partial<ChannelCap>) =>
    setDraft((d) => (d ? { ...d, caps: d.caps.map((c) => (c.channel === channel ? { ...c, ...p } : c)) } : d));

  const profileDirty = JSON.stringify(profile) !== JSON.stringify(toProfile(merchant));
  const configDirty = JSON.stringify(draft) !== JSON.stringify(merchant.stopConfig);
  const dirty = profileDirty || configDirty;
  const canSave = dirty && isProfileComplete(profile);

  const save = () => {
    if (profileDirty) saveMerchantProfile(merchant.id, profile);
    if (configDirty) saveStopConfig(merchant.id, draft);
    toast.success("Merchant saved", {
      description: `${profile.name} · ${[profileDirty && "profile", configDirty && "caps & enforcement"].filter(Boolean).join(" + ")} updated.`,
    });
  };

  const orderedCaps = CHANNEL_ORDER.map((ch) => draft.caps.find((c) => c.channel === ch)!).filter(Boolean);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          {/* Header */}
          <DialogHeader className="space-y-1 border-b border-border px-6 py-4 text-left">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-secondary text-muted-foreground">
                <Store className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-[15px]">Edit merchant</DialogTitle>
                <DialogDescription className="text-[12px]">
                  Update this merchant. Merchant Id and type are fixed and cannot be changed.
                </DialogDescription>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-md border border-border bg-secondary/50 px-2 py-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                  #{merchant.merchantId}
                </span>
                <span className="rounded-md border border-border bg-secondary/50 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {merchant.type}
                </span>
              </div>
            </div>
          </DialogHeader>

          <Tabs defaultValue="profile" className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border px-6">
              <TabsList className="h-10 justify-start gap-1 bg-transparent p-0">
                <PanelTab value="profile" icon={Store} label="Profile" />
                <PanelTab value="caps" icon={Gauge} label="Caps & enforcement" dot={configDirty} />
                <PanelTab value="campaigns" icon={Megaphone} label={`Runs · ${merchant.campaigns.length}`} />
                <PanelTab value="history" icon={History} label="History" />
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {/* Profile */}
              <TabsContent value="profile" className="mt-0">
                <MerchantProfileForm value={profile} onChange={setProfile} />
              </TabsContent>

              {/* Caps & enforcement */}
              <TabsContent value="caps" className="mt-0 space-y-7">
                <Section
                  icon={draft.enforcement === "hard" ? ShieldCheck : ShieldAlert}
                  title="Enforcement mode"
                  hint="How caps are enforced on the next run."
                >
                  <RadioGroup
                    value={draft.enforcement}
                    onValueChange={(v) => patch({ enforcement: v as Enforcement })}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                  >
                    <ModeCard
                      value="hard"
                      active={draft.enforcement === "hard"}
                      icon={ShieldCheck}
                      title="Hard cap"
                      badge="Default"
                      desc="Strict ceiling — stops before exceeding. Voice halts calls early so the count never goes over."
                    />
                    <ModeCard
                      value="soft"
                      active={draft.enforcement === "soft"}
                      icon={ShieldAlert}
                      title="Soft cap"
                      desc="Target with allowed overflow. Sending may pass the cap by the % below."
                    />
                  </RadioGroup>

                  {draft.enforcement === "soft" && (
                    <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[12px] font-medium">Allowed overflow above cap</label>
                        <span className="rounded-md bg-background px-2 py-0.5 font-mono text-[12px] tabular-nums">
                          +{draft.softOverflowPct}%
                        </span>
                      </div>
                      <Slider
                        value={[draft.softOverflowPct]}
                        min={0}
                        max={100}
                        step={5}
                        onValueChange={([v]) => patch({ softOverflowPct: v })}
                        className="mt-3"
                      />
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        Ceiling becomes <span className="font-mono">1.{String(draft.softOverflowPct).padStart(2, "0")}× cap</span>.
                        Voice is drained using avg connectivity {draft.avgConnectivityPct}% and avg call {draft.avgCallMinutes} min.
                      </p>
                    </div>
                  )}
                </Section>

                <Section
                  icon={Gauge}
                  title="Channel caps"
                  hint="When any channel reaches its cap, the whole campaign stops. Messaging counts sent; Voice counts connected minutes."
                >
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="border-b border-border bg-secondary/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2 text-left font-medium">Channel</th>
                          <th className="px-3 py-2 text-left font-medium">Cap</th>
                          <th className="px-3 py-2 text-left font-medium">Window</th>
                          <th className="px-3 py-2 text-left font-medium">Usage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {orderedCaps.map((cap) => (
                          <CapRow
                            key={cap.channel}
                            cap={cap}
                            cfg={draft}
                            onCap={(n) => patchCap(cap.channel, { cap: n })}
                            onPeriod={(p) => patchCap(cap.channel, { period: p })}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>

                <Section
                  icon={Gauge}
                  title="Voice reconciliation"
                  hint="Voice is measured on connected minutes. These assumptions size the Voice early-stop and drain."
                >
                  <div className="grid grid-cols-2 gap-3">
                    <NumField
                      label="Avg connectivity"
                      suffix="%"
                      value={draft.avgConnectivityPct}
                      onChange={(n) => patch({ avgConnectivityPct: clamp(n, 0, 100) })}
                    />
                    <NumField
                      label="Avg call duration"
                      suffix="min"
                      value={draft.avgCallMinutes}
                      step={0.5}
                      onChange={(n) => patch({ avgCallMinutes: Math.max(0, n) })}
                    />
                  </div>
                </Section>
              </TabsContent>

              {/* Campaigns */}
              <TabsContent value="campaigns" className="mt-0">
                <Section
                  icon={Megaphone}
                  title={`Runs · ${merchant.campaigns.length}`}
                  hint="Stop any active run (reason required). Resume continues to un-contacted recipients only."
                >
                  <div className="space-y-2">
                    {merchant.campaigns.length === 0 && (
                      <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-[12px] text-muted-foreground">
                        No runs for this merchant yet.
                      </p>
                    )}
                    {merchant.campaigns.map((c) => (
                      <CampaignRow
                        key={c.id}
                        campaign={c}
                        onStop={() => setStopTarget(c)}
                        onResume={() => setResumeTarget(c)}
                      />
                    ))}
                  </div>
                </Section>
              </TabsContent>

              {/* History */}
              <TabsContent value="history" className="mt-0">
                <Section icon={History} title="Change history" hint="Every change recorded with who and when.">
                  <ol className="space-y-2.5">
                    {merchant.audit.map((a) => (
                      <li key={a.id} className="flex gap-2.5">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-border" />
                        <div className="min-w-0">
                          <p className="text-[12.5px] leading-snug">{a.summary}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{a.actor} · {a.when}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Section>
              </TabsContent>
            </div>
          </Tabs>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-3.5">
            <p className="text-[11px] text-muted-foreground">
              {dirty ? "Unsaved changes" : `Updated by ${merchant.updatedBy} · ${merchant.updatedAt}`}
            </p>
            <div className="flex items-center gap-2">
              {dirty ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button size="sm" disabled={!canSave} onClick={save}>Save</Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <StopCampaignDialog
        merchant={merchant}
        campaign={stopTarget}
        open={!!stopTarget}
        onOpenChange={(v) => !v && setStopTarget(null)}
      />
      <ResumeCampaignDialog
        merchant={merchant}
        campaign={resumeTarget}
        open={!!resumeTarget}
        onOpenChange={(v) => !v && setResumeTarget(null)}
      />
    </>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────────

function PanelTab({
  value, icon: Icon, label, dot,
}: {
  value: string; icon: typeof Gauge; label: string; dot?: boolean;
}) {
  return (
    <TabsTrigger
      value={value}
      className="relative h-10 gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 text-[12.5px] text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
    >
      <Icon className="h-3.5 w-3.5" /> {label}
      {dot && <span className="absolute right-1 top-2 h-1.5 w-1.5 rounded-full bg-primary" />}
    </TabsTrigger>
  );
}

function Section({
  icon: Icon, title, hint, children,
}: {
  icon: typeof Gauge; title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {title}
        </h3>
        {hint && <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground/80">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ModeCard({
  value, active, icon: Icon, title, desc, badge,
}: {
  value: string; active: boolean; icon: typeof ShieldCheck; title: string; desc: string; badge?: string;
}) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col gap-1.5 rounded-lg border p-3 transition-colors",
        active ? "border-primary bg-primary/[0.04] ring-1 ring-primary/20" : "border-border hover:bg-accent/40",
      )}
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem value={value} className="shrink-0" />
        <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
        <span className="text-[13px] font-medium">{title}</span>
        {badge && (
          <span className="ml-auto rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <p className="pl-6 text-[11.5px] leading-relaxed text-muted-foreground">{desc}</p>
    </label>
  );
}

function NumField({
  label, value, onChange, suffix, step = 1,
}: {
  label: string; value: number; onChange: (n: number) => void; suffix?: string; step?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11.5px] text-muted-foreground">{label}</label>
      <div className="relative">
        <Input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-9 pr-12 text-sm tabular-nums"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function CapRow({
  cap, cfg, onCap, onPeriod,
}: {
  cap: ChannelCap; cfg: StopConfig; onCap: (n: number) => void; onPeriod: (p: CapPeriod) => void;
}) {
  const meta = CHANNEL_META[cap.channel];
  const Icon = meta.icon;
  const ratio = capRatio(cap, cfg);
  const tone = capTone(cap, cfg);
  const ceiling = effectiveCeiling(cap, cfg);
  const toneClass =
    tone === "reached" ? "bg-destructive" : tone === "near" ? "bg-warning" : "bg-success";

  return (
    <tr>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <div className="leading-tight">
            <div className="font-medium">{meta.label}</div>
            <div className="text-[10.5px] text-muted-foreground">{meta.measuredOn}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <Input
          type="number"
          value={cap.cap}
          onChange={(e) => onCap(Number(e.target.value))}
          className="h-8 w-28 text-[12.5px] tabular-nums"
        />
      </td>
      <td className="px-3 py-2.5">
        <Select value={cap.period} onValueChange={(v) => onPeriod(v as CapPeriod)}>
          <SelectTrigger className="h-8 w-[130px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CAP_PERIOD_LABEL) as CapPeriod[]).map((p) => (
              <SelectItem key={p} value={p} className="text-xs">{CAP_PERIOD_LABEL[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2.5">
        <div className="w-32">
          <div className="flex items-center justify-between text-[10.5px] tabular-nums">
            <span className={cn(tone === "reached" && "font-medium text-destructive", tone === "near" && "text-warning")}>
              {cap.used.toLocaleString()}
            </span>
            <span className="text-muted-foreground">/ {ceiling.toLocaleString()}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className={cn("h-full rounded-full", toneClass)} style={{ width: `${Math.max(3, ratio * 100)}%` }} />
          </div>
          {tone === "reached" && <p className="mt-0.5 text-[10px] font-medium text-destructive">Cap reached</p>}
        </div>
      </td>
    </tr>
  );
}

const RUN_STATUS_STYLE: Record<MerchantCampaign["status"], { label: string; cls: string }> = {
  running: { label: "Running", cls: "border-success/30 bg-success/10 text-success" },
  paused:  { label: "Paused",  cls: "border-warning/30 bg-warning/10 text-warning" },
  stopped: { label: "Stopped", cls: "border-destructive/30 bg-destructive/10 text-destructive" },
  blocked: { label: "Blocked", cls: "border-destructive/30 bg-destructive/10 text-destructive" },
};

function CampaignRow({
  campaign, onStop, onResume,
}: {
  campaign: MerchantCampaign; onStop: () => void; onResume: () => void;
}) {
  const s = RUN_STATUS_STYLE[campaign.status];
  const isStopped = campaign.status === "stopped" || campaign.status === "blocked";
  const pct = campaign.total > 0 ? Math.round((campaign.contacted / campaign.total) * 100) : 0;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium">{campaign.name}</span>
            <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", s.cls)}>{s.label}</span>
            {campaign.runType === "api" && (
              <span className="shrink-0 rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground">API</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {campaign.channels.map((ch) => {
              const Icon = CHANNEL_META[ch].icon;
              return (
                <span key={ch} className="inline-flex items-center gap-1 rounded border border-border bg-secondary/50 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                  <Icon className="h-3 w-3" /> {CHANNEL_META[ch].label}
                </span>
              );
            })}
          </div>
        </div>
        {isStopped ? (
          <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-[11.5px]" onClick={onResume}>
            <Play className="h-3 w-3" /> Resume
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-[11.5px] text-destructive hover:text-destructive" onClick={onStop}>
            <OctagonX className="h-3 w-3" /> Stop
          </Button>
        )}
      </div>

      <div className="mt-2.5">
        <div className="flex items-center justify-between text-[10.5px] text-muted-foreground tabular-nums">
          <span>{campaign.contacted.toLocaleString()} / {campaign.total.toLocaleString()} contacted</span>
          <span>{pct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className={cn("h-full rounded-full", isStopped ? "bg-muted-foreground/40" : "bg-success")} style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
      </div>

      {campaign.stoppedReason && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Reason:</span> {campaign.stoppedReason}
          {campaign.stoppedBy && <span className="text-muted-foreground"> · {campaign.stoppedBy}</span>}
        </p>
      )}
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
