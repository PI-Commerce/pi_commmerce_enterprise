import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, MoreHorizontal, Send, Upload, Square, Check,
  CalendarClock, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CSV_LIBRARY, makeCsvAsset, type CsvAsset } from "@/lib/data-library";
import { SEED_TEMPLATES } from "@/lib/waba-templates";
import { SEED_SMS_TEMPLATES } from "@/lib/sms-templates";
import { SEED_RCS_TEMPLATES } from "@/lib/rcs-templates";
import { useWabaConnection } from "@/lib/waba-store";
import { SEED_SMS_CONFIG, entityById } from "@/lib/sms-config";
import { SEED_RCS_CONFIG, providerLabel } from "@/lib/rcs-config";
import { SEED_BROADCASTS } from "@/lib/broadcasts-seed";
import type {
  BroadcastChannel as Channel,
  BroadcastRow,
  BroadcastStatus,
} from "@/lib/broadcasts-seed";
import { Phone as PhoneIcon, Building2, Radio } from "lucide-react";

export const Route = createFileRoute("/broadcasts")({
  component: BroadcastsPage,
  head: () => ({
    meta: [
      { title: "Broadcasts · Pi Commerce Enterprise" },
      { name: "description", content: "One-shot direct-channel sends. Pick a channel, a template, upload a CSV — hit send." },
    ],
  }),
});

const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  sms:      "SMS",
  rcs:      "RCS",
};

const STATUS_TONE: Record<BroadcastStatus, string> = {
  scheduled:  "border-ai/30 bg-ai/10 text-ai",
  running:    "border-success/30 bg-success/10 text-success",
  paused:     "border-warning/30 bg-warning/10 text-warning",
  completed:  "border-border bg-secondary text-muted-foreground",
  failed:     "border-destructive/30 bg-destructive/10 text-destructive",
  terminated: "border-destructive/30 bg-destructive/10 text-destructive",
};

function BroadcastsPage() {
  const [rows, setRows] = useState<BroadcastRow[]>(SEED_BROADCASTS);
  const [query, setQuery] = useState("");
  const [fChannel, setFChannel] = useState<"all" | Channel>("all");
  const [fStatus, setFStatus] = useState<"all" | BroadcastStatus>("all");
  const [createOpen, setCreateOpen] = useState(false);

  // Prefill state — the create-modal reads these on open. Populated from
  // ?channel + ?templateId (deep-link from a template row's "Send broadcast").
  const [prefill, setPrefill] = useState<{ channel?: Channel; templateId?: string }>({});

  // Read the deep-link params directly from window.location on mount. We bypass
  // TanStack Router's useSearch because untyped params get stripped before we
  // can consume them. After capturing, we clear them from the URL so browser
  // Back doesn't keep re-opening the modal.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ch = params.get("channel");
    const tid = params.get("templateId");
    if (ch && tid && (["whatsapp", "sms", "rcs"] as const).includes(ch as Channel)) {
      setPrefill({ channel: ch as Channel, templateId: tid });
      setCreateOpen(true);
      // Strip the query so back-nav / refresh doesn't re-trigger.
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const filtered = rows.filter((r) => {
    if (fChannel !== "all" && r.channel !== fChannel) return false;
    if (fStatus !== "all" && r.status !== fStatus) return false;
    if (query) {
      const q = query.toLowerCase();
      // Search over name + template (no run id surfaced to the user).
      if (!r.name.toLowerCase().includes(q) && !r.assetName.toLowerCase().includes(q)) return false;
    }
    return true;
  });


  const setRowStatus = (id: string, next: BroadcastStatus, toastLabel: string, destructive = false) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        // Terminate freezes completedAt so the row settles like it finished.
        const now = new Date();
        const at = `Today, ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        return {
          ...r,
          status: next,
          completedAt: next === "terminated" ? at : r.completedAt,
        };
      }),
    );
    if (destructive) toast.error(toastLabel, { description: id });
    else toast.success(toastLabel, { description: id });
  };

  const handleCreate = (payload: CreateBroadcastPayload) => {
    const id = `bc_${Math.floor(Math.random() * 9000 + 1000)}`;
    const now = new Date();
    const nowAt = `Today, ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    // Schedule tab → row lands as "scheduled" with its Started column showing
    // when the send is due to fire. Send-now tab → row lands "running" now.
    const isScheduled = !!payload.scheduledFor;
    const row: BroadcastRow = {
      id,
      name: payload.name,
      channel: payload.channel,
      assetName: payload.assetName,
      templateId: payload.assetId,
      csvName: payload.csvName,
      status: isScheduled ? "scheduled" : "running",
      startedAt: isScheduled ? payload.scheduledFor! : nowAt,
      completedAt: "ongoing",
      sent: 0,
      total: payload.audienceSize,
      ...(isScheduled ? { scheduledFor: payload.scheduledFor } : {}),
    };
    setRows((prev) => [row, ...prev]);
    setCreateOpen(false);
    if (isScheduled) {
      toast.success("Broadcast scheduled", { description: `${payload.name} · ${CHANNEL_LABEL[payload.channel]} · fires ${payload.scheduledFor}` });
    } else {
      toast.success("Broadcast started", { description: `${payload.name} · ${CHANNEL_LABEL[payload.channel]} · ${payload.audienceSize.toLocaleString()} recipients` });
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Broadcasts"
        description="One-shot direct-channel sends. Pick a channel, a template, upload a CSV, and go."
        actions={
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Create broadcast
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search broadcasts…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <FilterSelect
          label="Channel"
          value={fChannel}
          onChange={(v) => setFChannel(v as typeof fChannel)}
          options={[
            { value: "all", label: "All channels" },
            { value: "whatsapp", label: "WhatsApp" },
            { value: "sms", label: "SMS" },
            { value: "rcs", label: "RCS" },
          ]}
        />
        <FilterSelect
          label="Status"
          value={fStatus}
          onChange={(v) => setFStatus(v as typeof fStatus)}
          options={[
            { value: "all", label: "All statuses" },
            { value: "scheduled", label: "Scheduled" },
            { value: "running", label: "Running" },
            { value: "paused", label: "Paused" },
            { value: "completed", label: "Completed" },
            { value: "failed", label: "Failed" },
            { value: "terminated", label: "Terminated" },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Run</th>
                <th className="px-4 py-2.5 text-left font-medium">Channel</th>
                <th className="px-4 py-2.5 text-left font-medium">Template</th>
                <th className="px-4 py-2.5 text-left font-medium">Audience CSV</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Started / Scheduled</th>
                <th className="px-4 py-2.5 text-left font-medium w-[220px]">Progress</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => {
                const pct = r.total > 0 ? Math.round((r.sent / r.total) * 100) : 0;
                return (
                  <tr key={r.id} className="transition-colors hover:bg-accent/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {CHANNEL_LABEL[r.channel]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">{r.assetName}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{r.csvName}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", STATUS_TONE[r.status])}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", r.status === "running" ? "bg-success animate-pulse" : "bg-current opacity-60")} />
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">
                      {r.status === "scheduled" ? (
                        <span className="inline-flex items-center gap-1.5 text-ai">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {r.scheduledFor ?? r.startedAt}
                        </span>
                      ) : (
                        r.startedAt
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Progress value={pct} className="h-1.5 w-44" />
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {r.sent.toLocaleString()}/{r.total.toLocaleString()} sent
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right">
                      <RowMenu
                        status={r.status}
                        onTerminate={() => setRowStatus(r.id, "terminated", "Broadcast terminated", true)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateBroadcastDialog
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) setPrefill({});
        }}
        onCreate={handleCreate}
        prefillChannel={prefill.channel}
        prefillTemplateId={prefill.templateId}
      />
    </AppShell>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary">
        <Send className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">No broadcasts match</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Fire a one-shot send on any channel. Pick a template, upload a CSV audience, and go.
      </p>
      <Button size="sm" className="mt-5 h-8 gap-1.5 text-xs" onClick={onCreate}>
        <Plus className="h-3.5 w-3.5" /> Create broadcast
      </Button>
    </div>
  );
}

function RowMenu({
  status, onTerminate,
}: {
  status: BroadcastStatus;
  onTerminate: () => void;
}) {
  // Only scheduled broadcasts expose an action, and it's Terminate only.
  // Rationale:
  //   - Instant sends (status "running" via Send now) complete too fast to
  //     Pause or Terminate meaningfully from the UI.
  //   - Once a scheduled broadcast fires (moves to "running"), the same is
  //     true: you're already sending, you can't take it back.
  //   - Terminated / Completed / Failed are terminal; nothing to do.
  // So the menu shows Terminate only when the send is still queued.
  const canTerminate = status === "scheduled";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {canTerminate ? (
          <DropdownMenuItem
            className="gap-2 text-xs text-destructive focus:text-destructive"
            onClick={onTerminate}
          >
            <Square className="h-3.5 w-3.5" /> Terminate
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled className="gap-2 text-xs">
            No actions available
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto gap-1.5 px-2.5 text-xs">
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ============================================================ */
/*                    Create Broadcast Dialog                   */
/* ============================================================ */

type CreateBroadcastPayload = {
  name: string;
  channel: Channel;
  assetId: string;
  assetName: string;
  csvId: string;
  csvName: string;
  audienceSize: number;
  /** Populated only when the user picked the Schedule tab. Pre-formatted for
   *  display so the runs table can render it verbatim. */
  scheduledFor?: string;
};

type SendMode = "now" | "schedule";

/**
 * Format a datetime-local value ("2026-09-25T10:00") as the compact display
 * string the runs table uses: "Today, 10:00 AM", "Tomorrow, 10:00 AM", or
 * "Sep 30, 10:00 AM". Falls back to the raw value if the string is malformed.
 */
function formatScheduledFor(dtLocal: string): string {
  if (!dtLocal) return "";
  const d = new Date(dtLocal);
  if (Number.isNaN(d.getTime())) return dtLocal;
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(d, now)) return `Today, ${time}`;
  if (sameDay(d, tomorrow)) return `Tomorrow, ${time}`;
  const md = d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
  return `${md}, ${time}`;
}

/** Default value for the datetime-local input: an hour from now, on the hour. */
function defaultScheduledAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Minimum accepted value — 15 minutes from now, so the schedule always sits
 *  at least one tick in the future. */
function scheduleMin(): string {
  const d = new Date(Date.now() + 15 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultBroadcastName() {
  const d = new Date();
  const mm = d.toLocaleString("en-US", { month: "short" });
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `Broadcast · ${mm} ${dd}, ${hh}:${mi}`;
}

type AssetOption = { id: string; name: string; sub?: string };

function assetsFor(channel: Channel): AssetOption[] {
  switch (channel) {
    case "whatsapp":
      return SEED_TEMPLATES
        .filter((t) => t.status === "Approved")
        .map((t) => ({ id: t.id, name: t.name, sub: `${t.category} · ${t.language}` }));
    case "sms":
      return SEED_SMS_TEMPLATES.map((t) => ({ id: t.id, name: t.name, sub: `${t.category} · ${t.senderId}` }));
    case "rcs":
      return SEED_RCS_TEMPLATES
        .filter((t) => t.approvalStatus === "Approved")
        .map((t) => ({ id: t.id, name: t.name, sub: t.type === "RICH_CARD" ? "Rich card" : "Text" }));
  }
}

function CreateBroadcastDialog({
  open, onOpenChange, onCreate, prefillChannel, prefillTemplateId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (payload: CreateBroadcastPayload) => void;
  /** When set (via ?channel + ?templateId deep-link from a template row), the
   *  modal opens with channel + template already selected — user lands on CSV. */
  prefillChannel?: Channel;
  prefillTemplateId?: string;
}) {
  const [name, setName] = useState(defaultBroadcastName());
  const [channel, setChannel] = useState<Channel | "">("");
  const [assetId, setAssetId] = useState("");
  const [csvId, setCsvId] = useState("");
  const [localCsvs, setLocalCsvs] = useState<CsvAsset[]>([]);
  const [mode, setMode] = useState<SendMode>("now");
  const [scheduledAt, setScheduledAt] = useState<string>(defaultScheduledAt());

  const reset = () => {
    setName(defaultBroadcastName());
    setChannel(prefillChannel ?? "");
    setAssetId(prefillTemplateId ?? "");
    setCsvId("");
    setLocalCsvs([]);
    setMode("now");
    setScheduledAt(defaultScheduledAt());
  };

  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillChannel, prefillTemplateId]);

  const assets = useMemo(() => (channel ? assetsFor(channel) : []), [channel]);
  const asset = useMemo(() => assets.find((a) => a.id === assetId), [assets, assetId]);

  // Reset asset when channel switches to a set that no longer contains it.
  useEffect(() => {
    if (assetId && !assets.find((a) => a.id === assetId)) setAssetId("");
  }, [assets, assetId]);

  const csvOptions = useMemo<CsvAsset[]>(() => [...localCsvs, ...CSV_LIBRARY], [localCsvs]);
  const csv = useMemo(() => csvOptions.find((c) => c.id === csvId), [csvOptions, csvId]);

  const onUploadCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const asset = makeCsvAsset({
      id: `csv_${Date.now()}`,
      name: f.name,
      uploadedTs: Date.now(),
      columns: [],
      // Rough demo-only estimate so the runs table shows a plausible total.
      rowCount: Math.max(1, Math.round(f.size / 80)),
      sizeKb: Math.max(1, Math.round(f.size / 1024)),
      source: "uploaded",
    });
    setLocalCsvs((prev) => [asset, ...prev]);
    setCsvId(asset.id);
  };

  // Schedule tab requires a parsable datetime that sits in the future.
  // Send-now tab doesn't touch scheduledAt.
  const scheduleValid = mode === "now" || (
    !!scheduledAt &&
    !Number.isNaN(new Date(scheduledAt).getTime()) &&
    new Date(scheduledAt).getTime() > Date.now()
  );
  const canSend = !!channel && !!asset && !!csv && name.trim().length > 0 && scheduleValid;

  const submit = () => {
    if (!canSend || !channel || !asset || !csv) return;
    onCreate({
      name: name.trim(),
      channel,
      assetId: asset.id,
      assetName: asset.name,
      csvId: csv.id,
      csvName: csv.name,
      audienceSize: csv.rowCount > 0 ? csv.rowCount : 1000,
      ...(mode === "schedule" ? { scheduledFor: formatScheduledFor(scheduledAt) } : {}),
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Create broadcast</DialogTitle>
          <DialogDescription className="text-xs">
            Pick a channel, choose a template, upload a CSV audience. Send it now or schedule for later.
          </DialogDescription>
        </DialogHeader>

        {/* Send-mode toggle. Left tab fires right away, right tab holds the
            send until the chosen start time. Backend end-time stays 1 year
            from start in both cases; scheduling only shifts the start. */}
        <div className="grid grid-cols-2 gap-1 rounded-md border border-input bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setMode("now")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              mode === "now"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Send className="h-3.5 w-3.5" /> Send now
          </button>
          <button
            type="button"
            onClick={() => setMode("schedule")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              mode === "schedule"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CalendarClock className="h-3.5 w-3.5" /> Schedule
          </button>
        </div>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto py-1 pr-1">
          <Section title="Broadcast">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Diwali flash sale · TIER-1"
                className="h-9 text-sm"
                maxLength={80}
              />
            </div>
          </Section>

          <Section title="Channel">
            <div className="grid grid-cols-3 gap-2">
              {(["whatsapp", "sms", "rcs"] as Channel[]).map((c) => {
                const active = channel === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    className={cn(
                      "flex items-center justify-center rounded-md border px-2 py-2.5 text-[12px] font-medium transition-colors",
                      active
                        ? "border-primary/40 bg-primary/5 text-foreground"
                        : "border-input bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {CHANNEL_LABEL[c]}
                  </button>
                );
              })}
            </div>
          </Section>

          {channel && (
            <Section title="Template">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Template <span className="text-destructive">*</span>
                </Label>
                <Select value={assetId} onValueChange={setAssetId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {assets.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        <span className="font-mono">{a.name}</span>
                        {a.sub && <span className="ml-2 text-muted-foreground">· {a.sub}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Approved templates only. Variables in the template are filled from CSV columns of the same name.
                </p>
              </div>

              {/* Sender identity — derived from the channel + template.
                  WA: current WABA's phone. SMS/RCS: baked into template's DLT/agent registration. */}
              {assetId && <SenderIdentityCard channel={channel} assetId={assetId} />}
            </Section>
          )}

          {mode === "schedule" && (
            <Section title="Schedule">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Start time <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Clock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    min={scheduleMin()}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="h-9 pl-8 text-sm"
                  />
                </div>
                {scheduledAt && !scheduleValid && (
                  <p className="text-[11px] text-destructive">
                    Pick a time in the future.
                  </p>
                )}
              </div>
            </Section>
          )}

          {channel && (
            <Section title="Audience">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Audience CSV <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Select value={csvId} onValueChange={setCsvId}>
                    <SelectTrigger className="h-9 flex-1 text-sm">
                      <SelectValue placeholder="Select from your Data library" />
                    </SelectTrigger>
                    <SelectContent>
                      {csvOptions.map((a) => (
                        <SelectItem key={a.id} value={a.id} className="text-xs">
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-[11px] text-muted-foreground">or</span>
                  <Button asChild type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 text-xs">
                    <label className="cursor-pointer">
                      <Upload className="h-3.5 w-3.5" /> Upload
                      <input type="file" accept=".csv,text/csv" className="hidden" onChange={onUploadCsv} />
                    </label>
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Pick a CSV from the Data tab, or upload a new one — it's added to your library automatically.
                </p>
              </div>
            </Section>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!canSend} onClick={submit}>
            {mode === "schedule" ? (
              <><CalendarClock className="h-3 w-3" /> Schedule broadcast</>
            ) : (
              <><Send className="h-3 w-3" /> Send broadcast</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

/**
 * Read-only sender-identity summary shown once the user picks a template.
 *
 * How each channel resolves "who is the message from?":
 *   WhatsApp — WABA + phone number. In this demo we surface the org's single
 *              connected WABA via useWabaConnection(). Multi-number setups would
 *              turn this into a Select.
 *   SMS      — Sender ID + Principal Entity are DLT-registered against the
 *              template. So they're derived from the template itself, no picker.
 *   RCS      — RCS Agent + provider (JIO / Netcore-VI) are registered against
 *              the template. Also derived.
 */
function SenderIdentityCard({ channel, assetId }: { channel: Channel; assetId: string }) {
  const waba = useWabaConnection();

  if (channel === "whatsapp") {
    if (!waba) {
      return (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] text-warning">
          No WhatsApp Business Account connected. Onboard a WABA before broadcasting.
        </div>
      );
    }
    return (
      <IdentityCard
        title="Sending from"
        rows={[
          { icon: PhoneIcon, label: "Phone number", value: waba.phone.display, verified: waba.phone.verified },
          { icon: Building2, label: "WABA", value: waba.waba.displayName, sub: waba.waba.name },
        ]}
        hint="Uses this WABA's phone as the sender. Add more numbers under this WABA to pick from."
      />
    );
  }

  if (channel === "sms") {
    const tpl = SEED_SMS_TEMPLATES.find((t) => t.id === assetId);
    if (!tpl) return null;
    const entity = entityById(SEED_SMS_CONFIG, tpl.peId);
    return (
      <IdentityCard
        title="Sending as"
        rows={[
          { icon: Radio, label: "Sender ID (Header)", value: tpl.senderId, sub: `${tpl.category} · DLT-registered` },
          { icon: Building2, label: "Principal Entity", value: entity?.name ?? "—", sub: tpl.peId },
        ]}
        hint="Sender ID and PE are locked to this DLT-registered template. Pick a different template to change either."
      />
    );
  }

  // RCS
  const tpl = SEED_RCS_TEMPLATES.find((t) => t.id === assetId);
  if (!tpl) return null;
  const agent = SEED_RCS_CONFIG.brands.flatMap((b) => b.agents.map((a) => ({ ...a, brand: b }))).find((a) => a.id === tpl.agentId);
  return (
    <IdentityCard
      title="Sending via"
      rows={[
        { icon: Radio, label: "RCS Agent", value: agent?.name ?? tpl.agentId, sub: agent ? `${agent.type} · ${agent.agentId}` : undefined },
        { icon: Building2, label: "Provider", value: agent ? providerLabel(agent.brand.provider) : "—", sub: agent?.brand.name },
      ]}
      hint="Agent and provider are registered against this template. Pick a different template to change either."
    />
  );
}

type IdentityRow = { icon: typeof PhoneIcon; label: string; value: string; sub?: string; verified?: boolean };

function IdentityCard({ title, rows, hint }: { title: string; rows: IdentityRow[]; hint?: string }) {
  return (
    <div className="space-y-2 rounded-md border border-input bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="grid gap-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <r.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12.5px] font-medium">{r.value}</span>
                {r.verified && (
                  <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-success">
                    <Check className="h-3 w-3" /> verified
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-muted-foreground">
                {r.label}{r.sub ? ` · ${r.sub}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
      {hint && <p className="text-[10.5px] italic text-muted-foreground">{hint}</p>}
    </div>
  );
}
