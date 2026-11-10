/**
 * Settings > Usage & Billing.
 *
 * Four independent channel sections (WhatsApp, SMS, RCS, Voice). Each section
 * carries its own date range + source filter and a single Prepare CSV action.
 * The content is a hero volume + a stacked status bar + a flat composition
 * line — no KPI-card grid, no preview table. Finance pulls the CSV for detail;
 * the surface itself just answers "how much did we consume?".
 *
 * Cost / Spend / Invoices are intentionally out of this cut — the tab name
 * "Usage & Billing" keeps the billing landing spot reserved.
 *
 * Large exports route through the existing Reports pipeline (reports.ts +
 * ExportDialog), so the Download / 7-day retention pattern is identical to
 * channel Analytics exports. Short ranges download inline.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { DateRange } from "react-day-picker";
import { Download, MessageCircle, MessageSquare, MessageSquareText, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import {
  DateRangePicker,
  defaultDateRange,
  rangeDays,
} from "@/components/analytics/DateRangePicker";
import { ExportDialog, type ExportDialogMode } from "@/components/analytics/ExportDialog";
import {
  LARGE_EXPORT_MIN_RANGE_DAYS,
  MAX_RANGE_DAYS,
  nextReportId,
  pushReport,
  type ReportChannel,
} from "@/lib/reports";
import { downloadCsv } from "@/lib/analytics-leads";
import {
  WA_SOURCES, SMS_SOURCES, RCS_SOURCES, VOICE_SOURCES,
  generateWaUsage, generateSmsUsage, generateRcsUsage, generateVoiceUsage,
  computeWaKpis, computeSmsKpis, computeRcsKpis, computeVoiceKpis,
  waUsageToCsv, smsUsageToCsv, rcsUsageToCsv, voiceUsageToCsv,
} from "@/lib/usage-billing";

export function UsageBillingTab() {
  return (
    <div className="space-y-4">
      <WhatsAppSection />
      <SmsSection />
      <RcsSection />
      <VoiceSection />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Shared section chrome: date range, sources, Prepare CSV
// -----------------------------------------------------------------------------

function toYmd(d: Date | undefined): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function SectionShell({
  icon,
  title,
  range,
  onRangeChange,
  sources,
  sourceOptions,
  onSourcesChange,
  onDownload,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  range: DateRange | undefined;
  onRangeChange: (next: DateRange | undefined) => void;
  sources: string[];
  sourceOptions: MultiSelectOption[];
  onSourcesChange: (next: string[]) => void;
  onDownload: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground">
            {icon}
          </div>
          <h3 className="text-[13.5px] font-semibold leading-tight">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={range} onChange={onRangeChange} />
          <div className="w-[180px]">
            <MultiSelect
              options={sourceOptions}
              value={sources}
              onChange={onSourcesChange}
              allLabel="All sources"
              placeholder="All sources"
              searchable={false}
            />
          </div>
          <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={onDownload}>
            <Download className="h-3.5 w-3.5" />
            Prepare CSV
          </Button>
        </div>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

// Shared Prepare-CSV handler: route through ExportDialog for long ranges so the
// user sees the async-job affordance we standardised on. Short ranges download
// inline so quick pulls stay quick.
function usePrepareCsv(channel: ReportChannel) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ExportDialogMode>(null);
  const [pending, setPending] = useState<{ start: string; end: string } | null>(null);

  function begin(range: DateRange | undefined, inlineCsv: () => string, filename: string) {
    if (!range?.from || !range?.to) return;
    const start = toYmd(range.from);
    const end = toYmd(range.to);
    const days = rangeDays(range);
    if (days > MAX_RANGE_DAYS) {
      setPending({ start, end });
      setMode("blocked");
      return;
    }
    if (days >= LARGE_EXPORT_MIN_RANGE_DAYS) {
      setPending({ start, end });
      setMode("large");
      return;
    }
    downloadCsv(filename, inlineCsv());
  }

  function close() { setMode(null); }

  function dialog() {
    return pending ? (
      <ExportDialog
        mode={mode}
        channel={channel}
        startDate={pending.start}
        endDate={pending.end}
        rangeDays={Math.round((+new Date(pending.end) - +new Date(pending.start)) / 86400000) + 1}
        onClose={close}
      />
    ) : null;
  }

  // Direct-queue path reserved for a future "force async" toggle. Not wired yet.
  function forceQueue(start: string, end: string) {
    pushReport({
      id: nextReportId(),
      requestedAt: new Date().toISOString(),
      channel,
      title: `${channel} · ${start} to ${end}`,
      startDate: start,
      endDate: end,
      status: "queued",
      createdBy: "you@acme.com",
    });
    navigate({ to: "/reports" });
  }

  return { begin, dialog, forceQueue };
}

// -----------------------------------------------------------------------------
// KPI cards. Thin tiles laid out as a 2 × N grid; items wrap into more rows
// when a channel has more than 4 counters (WhatsApp has 9 with URL clicks).
// -----------------------------------------------------------------------------

type KpiItem = { label: string; value: string; sub?: string };

function KpiGrid({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-lg border border-border bg-background px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{it.label}</p>
          <p className="mt-1 text-[16px] font-semibold tabular-nums">{it.value}</p>
          {it.sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{it.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// WhatsApp section
// -----------------------------------------------------------------------------

function WhatsAppSection() {
  const [range, setRange] = useState<DateRange | undefined>(defaultDateRange(7));
  const [sources, setSources] = useState<string[]>([]);
  const { begin, dialog } = usePrepareCsv("usage-whatsapp");

  const start = toYmd(range?.from);
  const end = toYmd(range?.to);
  const rowsAll = useMemo(
    () => (start && end ? generateWaUsage(start, end) : []),
    [start, end],
  );
  const rows = useMemo(
    () => (sources.length ? rowsAll.filter((r) => sources.includes(r.source)) : rowsAll),
    [rowsAll, sources],
  );
  const kpis = useMemo(() => computeWaKpis(rows), [rows]);

  return (
    <SectionShell
      icon={<MessageCircle className="h-3.5 w-3.5" />}
      title="WhatsApp"
      range={range}
      onRangeChange={setRange}
      sources={sources}
      sourceOptions={WA_SOURCES.map((s) => ({ value: s, label: s }))}
      onSourcesChange={setSources}
      onDownload={() =>
        begin(range, () => waUsageToCsv(rows), `wa-usage-${start}-to-${end}.csv`)
      }
    >
      <KpiGrid
        items={[
          { label: "Outbound messages", value: kpis.total.toLocaleString("en-IN") },
          { label: "Delivered",         value: kpis.delivered.toLocaleString("en-IN"), sub: `${pct(kpis.delivered, kpis.total)}%` },
          { label: "Read + Replied",    value: (kpis.read + kpis.replied).toLocaleString("en-IN"), sub: `${pct(kpis.read + kpis.replied, kpis.total)}%` },
          { label: "Failed",            value: kpis.failed.toLocaleString("en-IN"), sub: `${pct(kpis.failed, kpis.total)}%` },
          { label: "Marketing",         value: kpis.byType.marketing.toLocaleString("en-IN") },
          { label: "Utility",           value: kpis.byType.utility.toLocaleString("en-IN") },
          { label: "Authentication",    value: kpis.byType.authentication.toLocaleString("en-IN") },
          { label: "Service (freeform)", value: kpis.byType.service.toLocaleString("en-IN") },
          { label: "URL clicks",        value: kpis.urlClicks.toLocaleString("en-IN"), sub: `${pct(kpis.urlClicks, kpis.delivered + kpis.read + kpis.replied)}% of reached` },
        ]}
      />
      {dialog()}
    </SectionShell>
  );
}

// -----------------------------------------------------------------------------
// SMS section
// -----------------------------------------------------------------------------

function SmsSection() {
  const [range, setRange] = useState<DateRange | undefined>(defaultDateRange(7));
  const [sources, setSources] = useState<string[]>([]);
  const { begin, dialog } = usePrepareCsv("usage-sms");

  const start = toYmd(range?.from);
  const end = toYmd(range?.to);
  const rowsAll = useMemo(
    () => (start && end ? generateSmsUsage(start, end) : []),
    [start, end],
  );
  const rows = useMemo(
    () => (sources.length ? rowsAll.filter((r) => sources.includes(r.source)) : rowsAll),
    [rowsAll, sources],
  );
  const kpis = useMemo(() => computeSmsKpis(rows), [rows]);

  return (
    <SectionShell
      icon={<MessageSquare className="h-3.5 w-3.5" />}
      title="SMS"
      range={range}
      onRangeChange={setRange}
      sources={sources}
      sourceOptions={SMS_SOURCES.map((s) => ({ value: s, label: s }))}
      onSourcesChange={setSources}
      onDownload={() =>
        begin(range, () => smsUsageToCsv(rows), `sms-usage-${start}-to-${end}.csv`)
      }
    >
      <KpiGrid
        items={[
          { label: "Submitted",         value: kpis.total.toLocaleString("en-IN") },
          { label: "Delivered",         value: kpis.delivered.toLocaleString("en-IN"), sub: `${pct(kpis.delivered, kpis.total)}%` },
          { label: "Failed",            value: kpis.failed.toLocaleString("en-IN"), sub: `${pct(kpis.failed, kpis.total)}%` },
          { label: "Billable SMS units", value: kpis.smsCountTotal.toLocaleString("en-IN"), sub: "Σ sms_count" },
        ]}
      />
      {dialog()}
    </SectionShell>
  );
}

// -----------------------------------------------------------------------------
// RCS section
// -----------------------------------------------------------------------------

function RcsSection() {
  const [range, setRange] = useState<DateRange | undefined>(defaultDateRange(7));
  const [sources, setSources] = useState<string[]>([]);
  const { begin, dialog } = usePrepareCsv("usage-rcs");

  const start = toYmd(range?.from);
  const end = toYmd(range?.to);
  const rowsAll = useMemo(
    () => (start && end ? generateRcsUsage(start, end) : []),
    [start, end],
  );
  const rows = useMemo(
    () => (sources.length ? rowsAll.filter((r) => sources.includes(r.source)) : rowsAll),
    [rowsAll, sources],
  );
  const kpis = useMemo(() => computeRcsKpis(rows), [rows]);

  return (
    <SectionShell
      icon={<MessageSquareText className="h-3.5 w-3.5" />}
      title="RCS"
      range={range}
      onRangeChange={setRange}
      sources={sources}
      sourceOptions={RCS_SOURCES.map((s) => ({ value: s, label: s }))}
      onSourcesChange={setSources}
      onDownload={() =>
        begin(range, () => rcsUsageToCsv(rows), `rcs-usage-${start}-to-${end}.csv`)
      }
    >
      <KpiGrid
        items={[
          { label: "Sent",             value: kpis.total.toLocaleString("en-IN") },
          { label: "Delivered",        value: kpis.delivered.toLocaleString("en-IN"), sub: `${pct(kpis.delivered, kpis.total)}%` },
          { label: "Read + Clicked",   value: (kpis.read + kpis.clicked).toLocaleString("en-IN"), sub: `${pct(kpis.read + kpis.clicked, kpis.total)}%` },
          { label: "Failed",           value: kpis.failed.toLocaleString("en-IN"), sub: `${pct(kpis.failed, kpis.total)}%` },
          { label: "Via JIO",          value: kpis.byProvider.JIO.toLocaleString("en-IN") },
          { label: "Via NETCORE",      value: kpis.byProvider.NETCORE.toLocaleString("en-IN") },
        ]}
      />
      {dialog()}
    </SectionShell>
  );
}

// -----------------------------------------------------------------------------
// Voice section
// -----------------------------------------------------------------------------

function VoiceSection() {
  const [range, setRange] = useState<DateRange | undefined>(defaultDateRange(7));
  const [sources, setSources] = useState<string[]>([]);
  const { begin, dialog } = usePrepareCsv("usage-voice");

  const start = toYmd(range?.from);
  const end = toYmd(range?.to);
  const rowsAll = useMemo(
    () => (start && end ? generateVoiceUsage(start, end) : []),
    [start, end],
  );
  const rows = useMemo(
    () => (sources.length ? rowsAll.filter((r) => sources.includes(r.source)) : rowsAll),
    [rowsAll, sources],
  );
  const kpis = useMemo(() => computeVoiceKpis(rows), [rows]);

  const minutesTotal = Math.round(kpis.totalDurationSec / 60);
  const avgMmSs = (() => {
    const s = kpis.avgDurationSec;
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  })();

  return (
    <SectionShell
      icon={<Phone className="h-3.5 w-3.5" />}
      title="Voice AI"
      range={range}
      onRangeChange={setRange}
      sources={sources}
      sourceOptions={VOICE_SOURCES.map((s) => ({ value: s, label: s }))}
      onSourcesChange={setSources}
      onDownload={() =>
        begin(range, () => voiceUsageToCsv(rows), `voice-usage-${start}-to-${end}.csv`)
      }
    >
      <KpiGrid
        items={[
          { label: "Total calls",   value: kpis.total.toLocaleString("en-IN") },
          { label: "Completed",     value: kpis.completed.toLocaleString("en-IN"), sub: `${pct(kpis.completed, kpis.total)}%` },
          { label: "Failed",        value: kpis.failed.toLocaleString("en-IN"), sub: `${pct(kpis.failed, kpis.total)}%` },
          { label: "Total minutes", value: minutesTotal.toLocaleString("en-IN"), sub: `avg ${avgMmSs} per call` },
        ]}
      />
      {dialog()}
    </SectionShell>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function pct(n: number, d: number): string {
  if (!d) return "0";
  return ((n / d) * 100).toFixed(1);
}
