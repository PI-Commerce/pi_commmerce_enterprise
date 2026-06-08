import { useState, useMemo, useEffect } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Play, Copy, Check, Webhook, Lock, Zap, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type RunType = "one-time" | "recurring";
export type TriggerMode = "manual" | "api";
export type ScheduleMode = "now" | "later";
export type AudienceSource = "csv" | "api";

export type CampaignOption = {
  id: string;
  name: string;
  audienceSource: AudienceSource;
};

export type CreateRunPayload = {
  runName: string;
  runType: RunType;
  triggerMode: TriggerMode;
  scheduleMode: ScheduleMode;
  campaignId: string;
};

const CAMPAIGNS: CampaignOption[] = [
  { id: "cmp_react_q3",   name: "Reactivation · Q3 dormant traders", audienceSource: "csv" },
  { id: "cmp_onboard_v2", name: "Onboarding · KYC drop-offs",        audienceSource: "api" },
  { id: "cmp_winback",    name: "Win-back · Lapsed premium",         audienceSource: "csv" },
];

/** Derive valid execution options from the selected campaign. */
function deriveOptions(c: CampaignOption | undefined): {
  runTypes: RunType[];
  triggerModes: TriggerMode[];
} {
  if (!c) return { runTypes: [], triggerModes: [] };
  if (c.audienceSource === "csv") {
    // Static audience → single batch, kicked off by an operator.
    return { runTypes: ["one-time"], triggerModes: ["manual"] };
  }
  // API payload → driven by upstream events; may recur.
  return { runTypes: ["one-time", "recurring"], triggerModes: ["api"] };
}

function defaultRunName() {
  const d = new Date();
  const mm = d.toLocaleString("en-US", { month: "short" });
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `Run · ${mm} ${dd}, ${hh}:${mi}`;
}

export function CreateRunDialog({
  open, onOpenChange, campaign, campaignName, campaignId, onStart,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When provided, modal is opened from Campaign Builder — campaign is pre-selected and locked. */
  campaign?: CampaignOption;
  /** Legacy: name-only lock (defaults audience to csv). */
  campaignName?: string;
  campaignId?: string;
  onStart: (payload: CreateRunPayload) => void;
}) {
  // Resolve the locked-from-builder campaign, if any.
  const lockedCampaign: CampaignOption | undefined = useMemo(() => {
    if (campaign) return campaign;
    if (campaignName) {
      return { id: campaignId ?? "cmp_current", name: campaignName, audienceSource: "csv" };
    }
    return undefined;
  }, [campaign, campaignName, campaignId]);

  const isLocked = !!lockedCampaign;

  const [selectedId, setSelectedId] = useState<string>(lockedCampaign?.id ?? "");
  const [runName, setRunName] = useState(defaultRunName());
  const [runType, setRunType] = useState<RunType | "">("");
  const [triggerMode, setTriggerMode] = useState<TriggerMode | "">("");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");
  const [copied, setCopied] = useState(false);

  // Catalog includes the locked campaign if it isn't already in CAMPAIGNS.
  const catalog = useMemo(() => {
    if (lockedCampaign && !CAMPAIGNS.find((c) => c.id === lockedCampaign.id)) {
      return [lockedCampaign, ...CAMPAIGNS];
    }
    return CAMPAIGNS;
  }, [lockedCampaign]);

  // The line-503 dialog stays mounted, so the useState initializer can't pick up a
  // campaign chosen after mount (e.g. clicking Run on a table row). Sync on open.
  useEffect(() => {
    if (open) {
      setSelectedId(lockedCampaign?.id ?? "");
      setRunName(defaultRunName());
    }
  }, [open, lockedCampaign]);

  const selected = useMemo(
    () => catalog.find((c) => c.id === selectedId),
    [catalog, selectedId],
  );

  const { runTypes, triggerModes } = useMemo(() => deriveOptions(selected), [selected]);

  // When campaign changes, snap run-type / trigger-mode to the first valid option.
  useEffect(() => {
    if (!selected) {
      setRunType("");
      setTriggerMode("");
      return;
    }
    setRunType((rt) => (rt && runTypes.includes(rt) ? rt : runTypes[0] ?? ""));
    setTriggerMode((tm) => (tm && triggerModes.includes(tm) ? tm : triggerModes[0] ?? ""));
    setScheduleMode("now");
  }, [selected, runTypes, triggerModes]);

  const reset = () => {
    setRunName(defaultRunName());
    setSelectedId(lockedCampaign?.id ?? "");
    setRunType("");
    setTriggerMode("");
    setScheduleMode("now");
    setCopied(false);
  };

  const endpoint = useMemo(
    () => `https://api.picommerce.io/v1/runs/trigger/${selectedId || "cmp_xxx"}`,
    [selectedId],
  );

  const canStart =
    !!selected && runName.trim().length > 0 && !!runType && !!triggerMode;

  const submit = () => {
    if (!canStart) return;
    onStart({
      runName: runName.trim(),
      runType: runType as RunType,
      triggerMode: triggerMode as TriggerMode,
      scheduleMode,
      campaignId: selected!.id,
    });
    reset();
  };

  const ctaLabel = "Run Campaign Now";
  const CtaIcon = triggerMode === "api" ? Zap : Play;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Run Campaign</DialogTitle>
          <DialogDescription className="text-xs">
            {isLocked
              ? <>Configure a new run for <span className="font-medium text-foreground">{lockedCampaign!.name}</span>.</>
              : "Select a campaign — execution options are derived from its configuration."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* ──────────── 1. Campaign ──────────── */}
          <Section title="Campaign">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Campaign <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedId} onValueChange={setSelectedId} disabled={isLocked}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isLocked ? (
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Lock className="h-3 w-3" /> Auto-selected from Campaign Builder.
                </p>
              ) : !selected ? (
                <p className="text-[11px] text-muted-foreground">
                  Run configuration appears after you pick a campaign.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Audience source:{" "}
                  <span className="font-medium text-foreground">
                    {selected.audienceSource === "csv" ? "CSV upload" : "API payload"}
                  </span>
                </p>
              )}
            </div>
          </Section>

          {/* ──────────── 2. Run Configuration ──────────── */}
          {selected && (
            <Section title="Run Configuration">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Run name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={runName}
                  onChange={(e) => setRunName(e.target.value)}
                  placeholder="e.g. Q3 reactivation · Oct 14"
                  className="h-9 text-sm"
                  maxLength={80}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Run type <span className="text-destructive">*</span>
                  </Label>
                  {runTypes.length > 1 ? (
                    <Select value={runType} onValueChange={(v) => setRunType(v as RunType)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {runTypes.includes("one-time") && (
                          <SelectItem value="one-time">One-time</SelectItem>
                        )}
                        {runTypes.includes("recurring") && (
                          <SelectItem value="recurring">Recurring</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <LockedField value={runType === "recurring" ? "Recurring" : "One-time"} />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Trigger mode <span className="text-destructive">*</span>
                  </Label>
                  {triggerModes.length > 1 ? (
                    <div className="grid grid-cols-2 rounded-md border border-input bg-background p-0.5">
                      {triggerModes.map((tm) => (
                        <button
                          key={tm}
                          type="button"
                          onClick={() => setTriggerMode(tm)}
                          className={cn(
                            "h-8 rounded text-[12px] font-medium transition-colors",
                            triggerMode === tm
                              ? "bg-accent text-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {tm === "api" ? "API Trigger" : "Manual"}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <LockedField value={triggerMode === "api" ? "API Trigger" : "Manual"} />
                  )}
                </div>
              </div>

              {triggerMode === "api" && (
                <div className="space-y-1.5 rounded-md border border-dashed border-border bg-muted/30 p-2.5">
                  <Label className="flex items-center gap-1.5 text-xs">
                    <Webhook className="h-3 w-3" /> Trigger API endpoint
                  </Label>
                  <div className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5">
                    <code className="flex-1 truncate font-mono text-[11px] text-muted-foreground">{endpoint}</code>
                    <Button
                      type="button" size="sm" variant="ghost"
                      className="h-6 w-6 shrink-0 p-0"
                      onClick={() => {
                        navigator.clipboard.writeText(endpoint);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    POST the flat-JSON payload defined in the Audience node to start a run.
                  </p>
                </div>
              )}

              {/* De-emphasized v1 placeholders */}
              <fieldset disabled className="grid grid-cols-2 gap-3 opacity-50">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Concurrency</Label>
                  <p className="text-[11px] text-muted-foreground/80">Coming soon</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Retries</Label>
                  <p className="text-[11px] text-muted-foreground/80">Coming soon</p>
                </div>
              </fieldset>
            </Section>
          )}

          {/* ──────────── 3. Scheduling ──────────── */}
          {selected && triggerMode === "manual" && (
            <Section title="Scheduling">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  When to start <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleMode("now")}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-[12px] transition-colors",
                      scheduleMode === "now"
                        ? "border-primary/40 bg-primary/5 text-foreground"
                        : "border-input bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <div className="font-medium">Start immediately</div>
                    <div className="text-[11px] text-muted-foreground">Begin as soon as the run is created.</div>
                  </button>
                  <button
                    type="button"
                    disabled
                    className="flex flex-col rounded-md border border-dashed border-input bg-muted/30 px-3 py-2 text-left text-[12px] text-muted-foreground/70 opacity-70"
                  >
                    <div className="flex items-center gap-1 font-medium">
                      <Lock className="h-3 w-3" /> Schedule later
                    </div>
                    <div className="text-[11px]">Coming soon</div>
                  </button>
                </div>
              </div>
            </Section>
          )}

          {selected && triggerMode === "api" && runType === "recurring" && (
            <Section title="Scheduling">
              <p className="text-[11px] text-muted-foreground">
                Recurring API runs execute whenever your upstream system POSTs to the trigger endpoint above. No fixed schedule needed.
              </p>
            </Section>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline" size="sm" disabled
            className="h-8 gap-1.5 text-xs"
            title="Scheduling — coming soon"
          >
            <Clock className="h-3 w-3" /> Schedule Campaign
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!canStart} onClick={submit}>
            <CtaIcon className="h-3 w-3 fill-current" /> {ctaLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LockedField({ value }: { value: string }) {
  return (
    <div className="flex h-9 items-center justify-between rounded-md border border-input bg-muted/40 px-3 text-sm">
      <span className="text-foreground">{value}</span>
      <Lock className="h-3 w-3 text-muted-foreground" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
