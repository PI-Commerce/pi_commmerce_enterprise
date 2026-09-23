/**
 * ExportDialog
 *
 * Confirms an Analytics CSV export. Routes across three paths:
 *  - Small range: closes the caller does a direct download (this dialog is skipped).
 *  - Range within cap but "large": creates a queued report and jumps to /reports.
 *  - Range beyond the 90-day cap: shows a block message.
 *
 * The caller decides which mode to open by inspecting the current date range.
 */

import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, Clock, FileText } from "lucide-react";
import {
  channelLabel,
  MAX_RANGE_DAYS,
  nextReportId,
  pushReport,
  type ReportChannel,
} from "@/lib/reports";

export type ExportDialogMode = "large" | "blocked" | null;

export function ExportDialog({
  mode,
  channel,
  startDate,
  endDate,
  rangeDays,
  onClose,
}: {
  mode: ExportDialogMode;
  channel: ReportChannel;
  startDate: string;
  endDate: string;
  rangeDays: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const open = mode !== null;

  const handleCreate = () => {
    const now = new Date().toISOString();
    pushReport({
      id: nextReportId(),
      requestedAt: now,
      channel,
      title: `${channelLabel(channel)} · ${startDate} to ${endDate}`,
      startDate,
      endDate,
      status: "queued",
      createdBy: "you@acme.com",
    });
    onClose();
    navigate({ to: "/reports" });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-[440px]">
        {mode === "large" && (
          <>
            <DialogHeader>
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                <FileText className="h-4 w-4" />
              </div>
              <DialogTitle className="text-[15px]">Large export</DialogTitle>
              <DialogDescription className="text-[12.5px]">
                This export is expected to exceed 10 lac rows. It will be prepared in the background and appear on the Reports page. Files are kept for 7 days.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-[12px] text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Channel</span>
                <span className="font-medium text-foreground">{channelLabel(channel)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Date range</span>
                <span className="font-medium text-foreground">{startDate} to {endDate} ({rangeDays} days)</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={handleCreate}>
                <Clock className="mr-1.5 h-3.5 w-3.5" />
                Prepare export
              </Button>
            </DialogFooter>
          </>
        )}
        {mode === "blocked" && (
          <>
            <DialogHeader>
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-rose-50 text-rose-600">
                <AlertCircle className="h-4 w-4" />
              </div>
              <DialogTitle className="text-[15px]">Date range too long</DialogTitle>
              <DialogDescription className="text-[12.5px]">
                Custom exports are capped at {MAX_RANGE_DAYS} days. Please narrow your date range, or contact support for older data.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-[12px] text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Selected range</span>
                <span className="font-medium text-foreground">{rangeDays} days</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Allowed maximum</span>
                <span className="font-medium text-foreground">{MAX_RANGE_DAYS} days</span>
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" onClick={onClose}>OK</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
