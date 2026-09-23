import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createMerchant, blankProfile, type MerchantProfile } from "@/lib/merchants";
import { MerchantProfileForm, isProfileComplete } from "./MerchantProfileForm";

/**
 * Onboard a new ENTERPRISE merchant. The merchant id is generated automatically;
 * the form captures the full profile and the merchant inherits default caps.
 */
export function OnboardMerchantDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const [draft, setDraft] = useState<MerchantProfile>(blankProfile);

  useEffect(() => { if (open) setDraft(blankProfile()); }, [open]);

  const submit = () => {
    const id = createMerchant(draft);
    toast.success("Merchant onboarded", {
      description: `${draft.name} · default caps applied. Open to configure caps & campaigns.`,
    });
    onOpenChange(false);
    onCreated?.(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-secondary text-muted-foreground">
              <Store className="h-4 w-4" />
            </span>
            Onboard merchant
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Create an ENTERPRISE merchant. The merchant id is generated automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <MerchantProfileForm value={draft} onChange={setDraft} />
        </div>

        <DialogFooter className="border-t border-border px-6 py-3.5">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!isProfileComplete(draft)} onClick={submit}>Onboard</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
