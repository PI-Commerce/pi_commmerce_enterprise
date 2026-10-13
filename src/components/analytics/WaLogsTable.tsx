/**
 * WhatsApp Logs table on the Channel Analytics view (PICOM-6131).
 *
 * Columns, left to right:
 *   Recipient | Lead ID | Run ID | template_name | waba_id | Source | Status
 *   | sent_at | delivered_at | read_at | replied_at | failed_at | Last Updated
 *   | Error code | Failure reason
 *
 * CSV export uses the dedicated waMessagesToCsv so the download carries the
 * 17-column DLR spec (adds phone_number_id + provider_message_id on top of
 * what this view surfaces).
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Download, Search } from "lucide-react";
import { downloadCsv } from "@/lib/analytics-leads";
import {
  buildWaMessages, waMessagesToCsv,
  type WaMessage, type WaStatus, type WaRef,
} from "@/lib/analytics-wa";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<WaStatus, string> = {
  Sent:      "bg-slate-100 text-slate-700",
  Delivered: "bg-sky-100 text-sky-700",
  Read:      "bg-emerald-100 text-emerald-700",
  Replied:   "bg-indigo-100 text-indigo-700",
  Failed:    "bg-rose-100 text-rose-700",
};
const STATUS_FILTERS: WaStatus[] = ["Sent", "Delivered", "Read", "Replied", "Failed"];

export function WaLogsTable({ refs }: { refs: WaRef[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<WaStatus | "any">("any");

  const messages = useMemo<WaMessage[]>(
    () => refs.flatMap((ref) => buildWaMessages(ref)),
    [refs],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return messages.filter((m) => {
      if (status !== "any" && m.status !== status) return false;
      if (!needle) return true;
      return (
        m.phone.toLowerCase().includes(needle) ||
        m.templateName.toLowerCase().includes(needle) ||
        m.wabaId.toLowerCase().includes(needle) ||
        m.providerMessageId.toLowerCase().includes(needle) ||
        m.leadId.toLowerCase().includes(needle)
      );
    });
  }, [messages, q, status]);

  return (
    <div className="mt-4 rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold">Message log</h2>
          <p className="text-[11px] text-muted-foreground">
            Per-recipient delivery detail for every message in the latest run in scope.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search number, template, WABA or wamid..."
              className="h-8 w-[260px] pl-8 text-xs"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as WaStatus | "any")}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any status</SelectItem>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline" size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => downloadCsv(`whatsapp-logs-${Date.now()}.csv`, waMessagesToCsv(filtered))}
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-card text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-medium">Recipient</th>
              <th className="px-3 py-2 font-medium">Lead ID</th>
              <th className="px-3 py-2 font-medium">Run ID</th>
              <th className="px-3 py-2 font-medium">Template</th>
              <th className="px-3 py-2 font-medium">WABA ID</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Sent at</th>
              <th className="px-3 py-2 font-medium">Delivered at</th>
              <th className="px-3 py-2 font-medium">Read at</th>
              <th className="px-3 py-2 font-medium">Replied at</th>
              <th className="px-3 py-2 font-medium">Failed at</th>
              <th className="px-3 py-2 font-medium">Last Updated</th>
              <th className="px-3 py-2 font-medium">Error code</th>
              <th className="px-3 py-2 font-medium">Failure reason</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-4 py-12 text-center text-muted-foreground">
                  No messages match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                  <td className="whitespace-nowrap px-3 py-2.5"><span className="block font-mono text-[12px]">{m.phone}</span></td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-muted-foreground">{m.leadId}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-muted-foreground">{m.runId || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{m.templateName || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-muted-foreground">{m.wabaId || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-muted-foreground">{m.source}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className={cn("rounded-md px-2 py-0.5 text-[10.5px] font-medium", STATUS_TONE[m.status])}>
                      {m.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-muted-foreground">{m.sentAt ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-muted-foreground">{m.deliveredAt ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-muted-foreground">{m.readAt ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-muted-foreground">{m.repliedAt ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-muted-foreground">{m.failedAt ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-muted-foreground">{m.lastUpdated}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-muted-foreground">{m.errorCode ?? "—"}</td>
                  <td className="px-3 py-2.5 text-[11.5px] text-muted-foreground">{m.failureReason ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border px-4 py-2.5 text-[11.5px] text-muted-foreground">
        Showing {filtered.length.toLocaleString()} of {messages.length.toLocaleString()} messages
      </div>
    </div>
  );
}
