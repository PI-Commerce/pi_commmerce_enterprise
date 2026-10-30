import { useEffect, useMemo, useState } from "react";
import { OctagonX, Play, AlertTriangle, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CHANNEL_META, effectiveCeiling, stopCampaign, resumeCampaign,
  type Merchant, type MerchantCampaign,
} from "@/lib/merchants";

/**
 * Story 3 — hard-stop a client's campaign. Reason is mandatory; the stop applies to
 * the whole campaign (all channels). Work already handed off finishes; nothing new
 * starts. The owner is notified with the reason.
 */
export function StopCampaignDialog({
  merchant, campaign, open, onOpenChange,
}: {
  merchant: Merchant;
  campaign: MerchantCampaign | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  if (!campaign) return null;

  const submit = () => {
    stopCampaign(merchant.id, campaign.id, reason.trim());
    toast.success("Campaign stopped", {
      description: `${campaign.name} · owner notified. No new sends or calls on any channel.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-destructive/10 text-destructive">
              <OctagonX className="h-4 w-4" />
            </span>
            Stop campaign
          </DialogTitle>
          <DialogDescription>
            Halts <span className="font-medium text-foreground">{campaign.name}</span> for {merchant.name}
            {" "}across all channels. Already-dispatched work finishes; nothing new starts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="stop-reason" className="text-xs">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="stop-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Client compliance hold / billing dispute / requested pause"
            className="min-h-[84px] text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Logged against you in the change history.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={reason.trim().length < 3}
            onClick={submit}
          >
            <OctagonX className="h-3.5 w-3.5" /> Stop campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Story 4 — manual resume. One flow for cap-stops and hard-stops. Resume continues
 * only to un-contacted people. If the campaign was cap-stopped, the admin must raise
 * that cap in the same action — you can't resume into a cap that's already met.
 */
export function ResumeCampaignDialog({
  merchant, campaign, open, onOpenChange,
}: {
  merchant: Merchant;
  campaign: MerchantCampaign | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const cappedChannel = campaign?.cappedChannel;
  const currentCap = useMemo(
    () => (cappedChannel ? merchant.stopConfig.caps.find((c) => c.channel === cappedChannel) : undefined),
    [merchant, cappedChannel],
  );
  const ceiling = currentCap ? effectiveCeiling(currentCap, merchant.stopConfig) : 0;

  const [reason, setReason] = useState("");
  const [newCap, setNewCap] = useState<string>("");

  useEffect(() => {
    if (open) {
      setReason("");
      // Pre-fill a sensible raise (usage rounded up) so the field is never below the met cap.
      setNewCap(currentCap ? String(Math.max(currentCap.cap, Math.ceil((currentCap.used + 1) / 100) * 100)) : "");
    }
  }, [open, currentCap]);

  if (!campaign) return null;

  const remaining = Math.max(0, campaign.total - campaign.contacted);
  const parsedCap = Number(newCap);
  const capValid = !cappedChannel || (Number.isFinite(parsedCap) && parsedCap > (currentCap?.used ?? 0));
  const canSubmit = reason.trim().length >= 3 && capValid;

  const submit = () => {
    resumeCampaign(merchant.id, campaign.id, reason.trim(), "You", cappedChannel ? parsedCap : undefined);
    toast.success("Campaign resumed", {
      description: `${campaign.name} · continues to ${remaining.toLocaleString()} un-contacted recipients only.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-success/10 text-success">
              <Play className="h-4 w-4" />
            </span>
            Resume campaign
          </DialogTitle>
          <DialogDescription>
            Resumes <span className="font-medium text-foreground">{campaign.name}</span>. Continues only to the
            {" "}<span className="font-medium text-foreground">{remaining.toLocaleString()}</span> recipients not yet
            contacted — no one is messaged or called twice.
          </DialogDescription>
        </DialogHeader>

        {cappedChannel && currentCap && (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              Stopped by the {CHANNEL_META[cappedChannel].label} cap
            </p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Usage {currentCap.used.toLocaleString()} {CHANNEL_META[cappedChannel].unit} has met the ceiling
              ({ceiling.toLocaleString()}). Raise the cap to resume.
            </p>
            <div className="mt-2.5 space-y-1.5">
              <Label htmlFor="raise-cap" className="text-xs">
                New {CHANNEL_META[cappedChannel].label} cap ({CHANNEL_META[cappedChannel].measuredOn}) <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="raise-cap"
                  type="number"
                  value={newCap}
                  onChange={(e) => setNewCap(e.target.value)}
                  className={cn("h-9 pr-16 text-sm tabular-nums", !capValid && "border-destructive")}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                  {CHANNEL_META[cappedChannel].unit}
                </span>
              </div>
              {!capValid && (
                <p className="text-[11px] text-destructive">
                  Must exceed current usage ({currentCap.used.toLocaleString()}).
                </p>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="resume-reason" className="text-xs">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="resume-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Cap raised after review / hold cleared"
            className="min-h-[72px] text-sm"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!canSubmit} onClick={submit}>
            {cappedChannel ? <ArrowUpRight className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {cappedChannel ? "Raise cap & resume" : "Resume campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
