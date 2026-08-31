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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, MoreHorizontal, Send, Upload, Play, Pause, Square, Copy, Check,
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const copyId = (id: string) => {
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
  };

  const filtered = rows.filter((r) => {
    if (fChannel !== "all" && r.channel !== fChannel) return false;
    if (fStatus !== "all" && r.status !== fStatus) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.id.toLowerCase().includes(q) && !r.assetName.toLowerCase().includes(q)) return false;
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
    const at = `Today, ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const row: BroadcastRow = {
      id,
      name: payload.name,
      channel: payload.channel,
      assetName: payload.assetName,
      csvName: payload.csvName,
      status: "running",
      startedAt: at,
      completedAt: "ongoing",
      sent: 0,
      total: payload.audienceSize,
    };
    setRows((prev) => [row, ...prev]);
    setCreateOpen(false);
    toast.success("Broadcast started", { description: `${payload.name} · ${CHANNEL_LABEL[payload.channel]} · ${payload.audienceSize.toLocaleString()} recipients` });
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
                <th className="px-4 py-2.5 text-left font-medium">Started</th>
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
                      <button
                        type="button"
                        onClick={() => copyId(r.id)}
                        title="Copy broadcast ID"
                        className="group/id flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {r.id}
                        {copiedId === r.id ? (
                          <Check className="h-3 w-3 text-success" />
                        ) : (
                          <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover/id:opacity-100" />
                        )}
                      </button>
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
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{r.startedAt}</td>
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
                        id={r.id}
                        onPause={() => setRowStatus(r.id, "paused", "Broadcast paused")}
                        onResume={() => setRowStatus(r.id, "running", "Broadcast resumed")}
                        onTerminate={() => setRowStatus(r.id, "terminated", "Broadcast terminated", true)}
                        onCopyId={() => copyId(r.id)}
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
  status, onPause, onResume, onTerminate, onCopyId,
}: {
  status: BroadcastStatus;
  id: string;
  onPause: () => void;
  onResume: () => void;
  onTerminate: () => void;
  onCopyId: () => void;
}) {
  // Lifecycle:
  //   running → Pause, Terminate
  //   paused  → Resume, Terminate
  //   completed / failed / terminated → no lifecycle actions
  const canPause = status === "running";
  const canResume = status === "paused";
  const canTerminate = status === "running" || status === "paused";
  const hasLifecycle = canPause || canResume || canTerminate;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {canPause && (
          <DropdownMenuItem className="gap-2 text-xs" onClick={onPause}>
            <Pause className="h-3.5 w-3.5" /> Pause
          </DropdownMenuItem>
        )}
        {canResume && (
          <DropdownMenuItem className="gap-2 text-xs" onClick={onResume}>
            <Play className="h-3.5 w-3.5" /> Resume
          </DropdownMenuItem>
        )}
        {canTerminate && (
          <DropdownMenuItem
            className="gap-2 text-xs text-destructive focus:text-destructive"
            onClick={onTerminate}
          >
            <Square className="h-3.5 w-3.5" /> Terminate
          </DropdownMenuItem>
        )}
        {hasLifecycle && <DropdownMenuSeparator />}
        <DropdownMenuItem className="gap-2 text-xs" onClick={onCopyId}>
          <Copy className="h-3.5 w-3.5" /> Copy run ID
        </DropdownMenuItem>
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
};

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

  const reset = () => {
    setName(defaultBroadcastName());
    setChannel(prefillChannel ?? "");
    setAssetId(prefillTemplateId ?? "");
    setCsvId("");
    setLocalCsvs([]);
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

  const canSend = !!channel && !!asset && !!csv && name.trim().length > 0;

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
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Create broadcast</DialogTitle>
          <DialogDescription className="text-xs">
            Pick a channel, choose a template, upload a CSV audience. That's it.
          </DialogDescription>
        </DialogHeader>

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
            <Send className="h-3 w-3" /> Send broadcast
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
