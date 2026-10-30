/**
 * Disable and delete for one connection, on its own page.
 *
 * Shown as two plain buttons rather than folded into an overflow menu. There are
 * exactly two actions and they never grow — an overflow menu is for a list of
 * unbounded length, and using one here hides the only two things this page can do
 * behind a control that gives no hint of what is inside it. The Connections row keeps
 * its menu because a row has no space for buttons and repeats the pair across every
 * row; a detail page has the space and one subject.
 *
 * Delete stays visible while it is blocked rather than being hidden. Hiding it makes
 * someone hunt for a control that is right there; showing it disabled, with the reason
 * on hover and the step that unblocks it immediately beside it, teaches the order in
 * one glance.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Power, Trash2 } from "lucide-react";

export function ConnectionActions({
  enabled,
  name,
  vendor,
  noun = "connection",
  onToggle,
  onDelete,
}: {
  enabled: boolean;
  /** What this one is recognised by — the number, the headers, the workspace. */
  name: string;
  /** Display name of the platform, for copy that names where the leftover entry lives. */
  vendor: string;
  /** "connector" on the WhatsApp lane, "connection" on the SMS lanes. */
  noun?: "connector" | "connection";
  onToggle: (next: boolean) => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => onToggle(!enabled)}
        >
          <Power className="h-3.5 w-3.5" />
          {enabled ? "Disable" : "Enable"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={enabled}
          title={
            enabled
              ? `Disable it first — deleting one that is still taking traffic fails sends mid-campaign with no warning on ${vendor}'s side.`
              : undefined
          }
          className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Delete this {noun}?</AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px]">
              {name} stops existing. {vendor}&rsquo;s provider entry keeps posting to an
              endpoint that is no longer there, so remove it on their side too. The
              credentials cannot be reissued — a new one gets new ones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="h-8 bg-destructive text-xs text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirming(false);
                onDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
