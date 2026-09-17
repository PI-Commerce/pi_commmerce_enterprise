/**
 * Reports
 *
 * Async delivery and campaign exports. Files are prepared in the background
 * and kept for 7 days. Direct downloads under 10 lac rows happen from the
 * per-channel Analytics view. Larger exports land here.
 *
 * See src/lib/reports.ts for the data model.
 */

import { useEffect, useSyncExternalStore } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Download, AlertCircle } from "lucide-react";
import {
  SEED_REPORTS,
  channelLabel,
  formatBytes,
  formatExpiry,
  formatRows,
  getDynamicReports,
  hydrateReportsFromDb,
  subscribeReports,
  type ReportRow,
  type ReportStatus,
} from "@/lib/reports";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports")({
  component: Reports,
  head: () => ({ meta: [{ title: "Reports · Pi Commerce Enterprise" }] }),
});

const EMPTY: ReportRow[] = [];

function Reports() {
  const dynamic = useSyncExternalStore(
    subscribeReports,
    getDynamicReports,
    () => EMPTY,
  );
  // First-mount D1 hydrate so any earlier queued export survives a refresh.
  useEffect(() => { void hydrateReportsFromDb(); }, []);
  const rows = [...dynamic, ...SEED_REPORTS];

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell>
        <PageHeader
          title="Reports"
          description="Exports and delivery reports. Files are prepared in the background and kept for 7 days."
        />

        <div className="rounded-lg border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">Report ID</TableHead>
                <TableHead className="w-[150px]">Requested</TableHead>
                <TableHead>Report</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[110px] text-right">Rows</TableHead>
                <TableHead className="w-[110px] text-right">File size</TableHead>
                <TableHead className="w-[140px]">Expires</TableHead>
                <TableHead className="w-[110px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-[12px] text-muted-foreground">{r.id}</TableCell>
                  <TableCell className="text-[12.5px] text-muted-foreground">{formatRequested(r.requestedAt)}</TableCell>
                  <TableCell>
                    <div className="font-medium text-[13px]">{channelLabel(r.channel)}</div>
                    <div className="text-[11.5px] text-muted-foreground">{r.startDate} to {r.endDate}</div>
                  </TableCell>
                  <TableCell>
                    <StatusPill row={r} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-[12.5px]">{formatRows(r.rows)}</TableCell>
                  <TableCell className="text-right font-mono text-[12.5px]">{formatBytes(r.fileSizeBytes)}</TableCell>
                  <TableCell className="text-[12.5px] text-muted-foreground">{formatExpiry(r)}</TableCell>
                  <TableCell className="text-right">
                    <RowAction row={r} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="mt-3 text-[11.5px] text-muted-foreground">
          Report files are kept for 7 days after they are ready. Custom date ranges are capped at 90 days. For older data, contact support.
        </p>
      </AppShell>
    </TooltipProvider>
  );
}

function StatusPill({ row }: { row: ReportRow }) {
  if (row.status === "failed") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help items-center gap-1">
            <Badge variant="secondary" className="bg-rose-50 text-rose-700 hover:bg-rose-50">
              Failed
            </Badge>
            <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px] text-[12px]">
          {row.failureReason ?? "Reason not available. Contact support with the Report ID."}
        </TooltipContent>
      </Tooltip>
    );
  }
  const map: Record<Exclude<ReportStatus, "failed">, { label: string; cls: string }> = {
    queued: { label: "Queued", cls: "bg-slate-100 text-slate-700 hover:bg-slate-100" },
    processing: { label: "Processing", cls: "bg-amber-50 text-amber-700 hover:bg-amber-50" },
    ready: { label: "Ready", cls: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50" },
    expired: { label: "Expired", cls: "bg-slate-100 text-slate-500 hover:bg-slate-100" },
  };
  const s = map[row.status];
  return (
    <Badge variant="secondary" className={cn("font-medium", s.cls)}>
      {s.label}
    </Badge>
  );
}

function RowAction({ row }: { row: ReportRow }) {
  if (row.status === "ready") {
    return (
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[12.5px]">
        <Download className="h-3.5 w-3.5" />
        Download
      </Button>
    );
  }
  return null;
}

function formatRequested(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return `${date}, ${time}`;
}
