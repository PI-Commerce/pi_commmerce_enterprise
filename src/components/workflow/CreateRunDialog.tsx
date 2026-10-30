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
import {
  Play, Webhook, Lock, Zap, Upload, Clock, Infinity as InfinityIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CSV_LIBRARY, makeCsvAsset, type CsvAsset } from "@/lib/data-library";
import {
  ConnectionAudienceStep, type ConnectionAudienceValue,
} from "@/components/connections/ConnectionAudienceStep";
import {
  getConnections, rememberBindings, campaignFields,
} from "@/lib/connections";

// v1 run model (PRD change-log E1–E7):
//   Run Type → Audience Source. Trigger Mode is no longer a separate field.
//   • Time-Scoped = mandatory Start + End window.
//   • Always-on   = no window.
//
// The three sources are the three directions a person can arrive from, and they
// are not variants of each other:
//   CSV        — you hand us the file.
//   Connection — we go and read it out of your CRM.
//   API payload— your engagement tool posts people to us as they qualify.
//
// Scope decides which are on offer, because the first two are us *going and
// looking*, and looking happens at a time: a file is read once, a CRM is read on a
// cadence, and either way something has to bound when. Only the third has no such
// need — the deciding is on their side, and their journey posts each person the
// moment it qualifies them. So an always-on run is API payload and nothing else.
//
// Which engagement tool posts (CleverTap / WebEngage / MoEngage / …) is *not* asked
// here. Every one of them posts to the same endpoint in the same shape; the tool
// changes only the personalisation-token syntax of the sample body we hand back.
// Since the endpoint carries the run id and can't exist until the run does, the
// body — and therefore the tool choice — belongs to the endpoint-discovery screen
// shown after the run is created, not to this pre-creation form. See campaigns.index.
//
// Only Connection asks anything about field names. In the other two the payload
// is already authored by the client, so there is nothing for us to reconcile; for
// API payload we generate the body from the campaign's own fields, which makes the
// keys match by construction. See the header of `@/lib/connections`.
export type RunType = "time-scoped" | "always-on";
export type AudienceSource = "csv" | "connection" | "api";
/** Retained for back-compat with run rows / toasts — derived from audienceSource. */
export type TriggerMode = "manual" | "api";

export type CampaignOption = {
  id: string;
  name: string;
  audienceSource: AudienceSource;
};

export type CreateRunPayload = {
  runName: string;
  runType: RunType;
  audienceSource: AudienceSource;
  /** Derived: api → "api", csv → "manual". Kept for existing run-row plumbing. */
  triggerMode: TriggerMode;
  campaignId: string;
  /** Present for Time-Scoped runs (datetime-local strings). */
  startAt?: string;
  endAt?: string;
  /** Present when audienceSource === "csv": the chosen file name. */
  csvName?: string;
  /** Present when audienceSource === "connection": which system feeds this run. */
  connectionId?: string;
  connectionLabel?: string;
};

const CAMPAIGNS: CampaignOption[] = [
  { id: "cmp_react_q3",   name: "Reactivation · Q3 dormant traders", audienceSource: "csv" },
  { id: "cmp_onboard_v2", name: "Onboarding · KYC drop-offs",        audienceSource: "api" },
  { id: "cmp_winback",    name: "Win-back · Lapsed premium",         audienceSource: "csv" },
];

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
  const [runType, setRunType] = useState<RunType>("time-scoped");
  const [audienceSource, setAudienceSource] = useState<AudienceSource>("csv");
  const [csvId, setCsvId] = useState<string>("");
  const [connectionValue, setConnectionValue] = useState<ConnectionAudienceValue | null>(null);
  const [localCsvs, setLocalCsvs] = useState<CsvAsset[]>([]);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  // Catalog includes the locked campaign if it isn't already in CAMPAIGNS.
  const catalog = useMemo(() => {
    if (lockedCampaign && !CAMPAIGNS.find((c) => c.id === lockedCampaign.id)) {
      return [lockedCampaign, ...CAMPAIGNS];
    }
    return CAMPAIGNS;
  }, [lockedCampaign]);

  const reset = () => {
    setSelectedId(lockedCampaign?.id ?? "");
    setRunName(defaultRunName());
    setRunType("time-scoped");
    setAudienceSource("csv");
    setCsvId("");
    setConnectionValue(null);
    setLocalCsvs([]);
    setStartAt("");
    setEndAt("");
  };

  // The dialog stays mounted, so the useState initializer can't pick up a campaign
  // chosen after mount (e.g. clicking Run on a table row). Sync on open.
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockedCampaign]);

  const selected = useMemo(
    () => catalog.find((c) => c.id === selectedId),
    [catalog, selectedId],
  );

  // Always-on has no window, and both pull sources need one. Push is the only
  // direction left, so on this scope the source is settled rather than asked.
  useEffect(() => {
    if (runType === "always-on") setAudienceSource("api");
  }, [runType]);

  // Library options = files uploaded this session (newest first) + the shared library.
  const csvOptions = useMemo<CsvAsset[]>(() => [...localCsvs, ...CSV_LIBRARY], [localCsvs]);
  const csvName =
    audienceSource !== "csv"
      ? undefined
      : csvOptions.find((a) => a.id === csvId)?.name;

  const onUploadCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    // v1: metadata only — never parse/store rows.
    const asset = makeCsvAsset({
      id: `csv_${Date.now()}`,
      name: f.name,
      uploadedTs: Date.now(),
      columns: [],
      rowCount: 0,
      sizeKb: Math.max(1, Math.round(f.size / 1024)),
      source: "uploaded",
    });
    setLocalCsvs((prev) => [asset, ...prev]);
    setCsvId(asset.id);
  };

  const windowOk =
    runType !== "time-scoped" ||
    (!!startAt && !!endAt && new Date(endAt) > new Date(startAt));

  const audienceOk =
    audienceSource === "api" ||
    (audienceSource === "csv" && !!csvName) ||
    (audienceSource === "connection" && !!connectionValue?.ready);

  const canStart =
    !!selected && runName.trim().length > 0 && windowOk && audienceOk;

  /** The campaign's own fields — not anything we learned about their system. */
  const apiFields = useMemo(
    () => (selected ? campaignFields(selected.id) : []),
    [selected],
  );

  const submit = () => {
    if (!canStart) return;
    const conn =
      audienceSource === "connection"
        ? getConnections().find((c) => c.id === connectionValue!.connectionId)
        : undefined;

    // Anything the client resolved by hand this time is remembered on the
    // connection, so the next campaign that declares the same field arrives
    // pre-bound. Effort decays to zero without adding a mapping object.
    if (conn && Object.keys(connectionValue!.overrides).length) {
      rememberBindings(conn.id, connectionValue!.overrides);
    }

    onStart({
      runName: runName.trim(),
      runType,
      audienceSource,
      triggerMode: audienceSource === "csv" ? "manual" : "api",
      campaignId: selected!.id,
      startAt: runType === "time-scoped" ? startAt : undefined,
      endAt: runType === "time-scoped" ? endAt : undefined,
      csvName,
      connectionId: conn?.id,
      connectionLabel: conn?.label,
    });
    reset();
  };

  const CtaIcon = audienceSource === "api" ? Zap : Play;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Run Campaign</DialogTitle>
          <DialogDescription className="text-xs">
            {isLocked
              ? <>Configure a new run for <span className="font-medium text-foreground">{lockedCampaign!.name}</span>.</>
              : "Select a campaign, then choose how this run is scoped and sourced."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto py-1 pr-1">
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
              {isLocked && (
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Lock className="h-3 w-3" /> Auto-selected from Campaign Builder.
                </p>
              )}
            </div>
          </Section>

          {selected && (
            <>
              {/* ──────────── 2. Run details ──────────── */}
              <Section title="Run Details">
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

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Run type <span className="text-destructive">*</span>
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <TypeCard
                      icon={Clock}
                      title="Time-Scoped"
                      desc="Runs between a start and end time. Everyone in the audience is reached inside the window."
                      active={runType === "time-scoped"}
                      onClick={() => setRunType("time-scoped")}
                    />
                    <TypeCard
                      icon={InfinityIcon}
                      title="Always-on"
                      desc="No end date. Your engagement tool posts each person as they qualify, and we reach them then."
                      active={runType === "always-on"}
                      onClick={() => setRunType("always-on")}
                    />
                  </div>
                </div>
              </Section>

              {/* ──────────── 3. Schedule (Time-Scoped only) ──────────── */}
              {runType === "time-scoped" && (
                <Section title="Schedule">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Start <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="datetime-local"
                        value={startAt}
                        onChange={(e) => setStartAt(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        End <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="datetime-local"
                        value={endAt}
                        onChange={(e) => setEndAt(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                  {startAt && endAt && new Date(endAt) <= new Date(startAt) && (
                    <p className="text-[11px] text-destructive">End time must be after the start time.</p>
                  )}
                </Section>
              )}

              {/* ──────────── 4. Audience source ──────────── */}
              <Section title="Audience Source">
                {/* Always-on: API payload *is* the source — it's the only direction that
                    survives the absence of a window, so there is nothing to pick. */}
                {runType === "always-on" ? (
                  <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2.5">
                    <Webhook className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="text-[12px] font-medium text-foreground">API payload</p>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Your engagement tool posts each person the moment it qualifies them.
                        A CSV or a CRM read is us going and looking, and that needs a window —
                        use Time-Scoped for those.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 rounded-md border border-input bg-background p-0.5">
                    {(["csv", "connection", "api"] as AudienceSource[]).map((src) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => setAudienceSource(src)}
                        className={cn(
                          "h-8 rounded text-[12px] font-medium transition-colors",
                          audienceSource === src
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {src === "csv" ? "CSV file" : src === "connection" ? "Connection" : "API payload"}
                      </button>
                    ))}
                  </div>
                )}

                {/* CSV: pick from the Data library, or Upload inline (C3, E5) */}
                {audienceSource === "csv" && (
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
                )}

                {/* Connection: the audience is read from a system they already use.
                    Roles and remembered bindings live on the connection, so most of
                    this step resolves itself — see ConnectionAudienceStep. */}
                {audienceSource === "connection" && (
                  <ConnectionAudienceStep
                    campaignId={selected.id}
                    value={connectionValue}
                    onChange={setConnectionValue}
                  />
                )}

                {/* API: their tool posts to us. We don't ask what their attributes are
                    called — we generate the body from this campaign's own field names in
                    their token syntax, so a payload built from it binds on arrival. The
                    endpoint carries the run id and so can only be shown once the run
                    exists; it appears in a follow-up dialog and on the run's row (E7). */}
                {audienceSource === "api" && (
                  <div className="space-y-2.5">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Every engagement tool — CleverTap, WebEngage, MoEngage — posts to the
                      same endpoint in the same shape. You'll pick your tool when you copy the
                      body at the next step; it only sets the personalisation-token syntax.
                    </p>

                    {/* What the body will contain, before committing to it. The names come
                        from the campaign's Audience node, so this is also the only place to
                        notice a field is missing while it is still cheap to go fix it. */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Field names</Label>
                      <div className="flex flex-wrap gap-1 rounded-md border border-input bg-muted/40 px-2.5 py-2">
                        {apiFields.map((f) => (
                          <span
                            key={f.name}
                            className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]"
                          >
                            {f.name}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Defined in this campaign's Audience node. Post one flat JSON object per
                        person using exactly these keys — because they are the campaign's own
                        fields, nothing has to be mapped afterwards.
                      </p>
                    </div>

                    <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                      The endpoint carries this run's ID, so it cannot exist until the run does.
                      You'll get it with a sample request and the body to paste the moment you
                      create the run, and again from the run's row.
                    </p>
                  </div>
                )}
              </Section>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!canStart} onClick={submit}>
            <CtaIcon className="h-3 w-3 fill-current" /> Run Campaign Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TypeCard({
  icon: Icon, title, desc, active, onClick,
}: {
  icon: typeof Clock;
  title: string;
  desc: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1 rounded-md border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-primary/40 bg-primary/5 text-foreground"
          : "border-input bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
        <Icon className="h-3.5 w-3.5" /> {title}
      </span>
      <span className="text-[11px] leading-snug text-muted-foreground">{desc}</span>
    </button>
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
