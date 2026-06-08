import { useState, useEffect, useRef } from "react";
import {
  X, Copy, Trash2, AlertCircle, CheckCircle2, Plus, GripVertical, ChevronDown, Variable,
  Sparkles, GitBranch, FlaskConical, ArrowUp, ArrowDown,
  FileSpreadsheet, Search, Loader2, Clock, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel,
} from "@/components/ui/select";

import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { WorkflowNodeData, NodeKind, PresetConfig } from "@/lib/campaign-types";
import { NODE_LABELS, SAMPLE_WORKFLOW_VARIABLES } from "@/lib/campaign-types";

// Collision-free local id generator — Date.now() alone collides on rapid clicks,
// producing duplicate React keys and duplicate canvas handle ids.
let uidCounter = 0;
const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

type Props = {
  node: { id: string; data: WorkflowNodeData } | null;
  readOnly?: boolean;
  onClose: () => void;
  onChange: (patch: Partial<WorkflowNodeData>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
};

const MIN_PANEL_W = 360;
const MAX_PANEL_W = 760;
// Persist the chosen width across open/close within a session.
let persistedPanelWidth = 420;

/** Right-anchored config panel shell with a left-edge drag handle to resize width. */
function ResizablePanel({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(persistedPanelWidth);
  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      // Panel hugs the right edge, so width grows as the cursor moves left.
      const w = Math.min(MAX_PANEL_W, Math.max(MIN_PANEL_W, window.innerWidth - e.clientX));
      persistedPanelWidth = w;
      setWidth(w);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 z-30 flex">
      <aside
        style={{ width }}
        className="pointer-events-auto relative flex h-full flex-col border-l border-border bg-background shadow-2xl animate-slide-in-right"
      >
        <div
          onMouseDown={startDrag}
          onDoubleClick={() => { persistedPanelWidth = 420; setWidth(420); }}
          className="group absolute inset-y-0 left-0 z-40 w-1.5 cursor-col-resize"
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize · double-click to reset"
        >
          <span className="absolute inset-y-0 left-0 w-px bg-border transition-all group-hover:left-[-1px] group-hover:w-[3px] group-hover:bg-ai" />
        </div>
        {children}
      </aside>
    </div>
  );
}

// onChange swallowed for preset nodes so the real editor's mount-time effects can't
// republish default outputs/abTest over the hand-authored ports (which would
// silently disconnect the example graph's edges mid-demo).
const NOOP_CHANGE = (_patch: Partial<WorkflowNodeData>) => undefined;

export function ConfigPanel({ node, readOnly, onClose, onChange, onDelete, onDuplicate }: Props) {
  if (!node) return null;
  const { data } = node;
  const valid = data.valid !== false;
  const isSystem = data.kind === "start" || data.kind === "end";
  // Preset/example nodes render the *real* editor for this kind, but read-only and
  // hydrated from data.config — so it looks exactly like a configured node. We force
  // read-only and neuter onChange so the stateful sub-components can't overwrite the
  // authored outputs/abTest (and disconnect the example graph's edges) on mount.
  const preset = !!data.preset;
  const ro = readOnly || preset;
  const safeChange = preset ? NOOP_CHANGE : onChange;

  return (
    <ResizablePanel>
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {NODE_LABELS[data.kind]}
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold">{data.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={cn(
          "flex items-center gap-2 border-b px-5 py-2 text-[11.5px]",
          valid ? "border-success/20 bg-success/5 text-success" : "border-destructive/20 bg-destructive/5 text-destructive",
        )}>
          {valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {valid ? "Configuration valid" : (data.error ?? "Required fields missing")}
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <NameField data={data} readOnly={ro} onChange={safeChange} />
          {isSystem ? (
            <div className="flex items-start gap-2.5 rounded-lg bg-muted px-3.5 py-3 text-[13px] text-muted-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {data.kind === "start"
                  ? "Entry point of the workflow. The name above is how this node is referenced in Analytics."
                  : "Terminal node of the workflow. The name above is how this node is referenced in Analytics."}
              </p>
            </div>
          ) : (
            <NodeFields data={data} readOnly={ro} onChange={safeChange} />
          )}
        </div>

        {!isSystem && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <div className="flex items-center gap-1">
              {!data.locked && !ro && (
                <>
                  <Button variant="ghost" size="sm" onClick={onDuplicate} className="h-8 gap-1 px-2 text-xs">
                    <Copy className="h-3.5 w-3.5" /> Duplicate
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this node?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes <span className="font-medium text-foreground">{data.title}</span> and disconnects its edges. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={onDelete}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete node
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
            <Button size="sm" disabled={ro || !valid} className="h-8 text-xs">Save</Button>
          </div>
        )}
    </ResizablePanel>
  );
}

/* --------------------------- Name (all nodes) --------------------------- */

function NameField({
  data, readOnly, onChange,
}: { data: WorkflowNodeData; readOnly?: boolean; onChange: (patch: Partial<WorkflowNodeData>) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Name <span className="text-destructive">*</span>
      </Label>
      <Input
        value={data.title ?? ""}
        disabled={readOnly}
        placeholder={NODE_LABELS[data.kind]}
        onChange={(e) => {
          const v = e.target.value;
          const trimmed = v.trim();
          if (!trimmed) {
            onChange({ title: v, valid: false, error: "Name required" });
          } else {
            onChange({ title: v });
          }
        }}
        className="h-9 text-sm font-medium"
      />
      <p className="text-[11px] text-muted-foreground">
        Shown on the canvas and used as the reference label in Analytics.
      </p>
    </div>
  );
}

/* --------------------------- Per-kind fields --------------------------- */

function NodeFields({
  data, readOnly, onChange,
}: { data: WorkflowNodeData; readOnly?: boolean; onChange: (patch: Partial<WorkflowNodeData>) => void }) {
  return <KindFields kind={data.kind} config={data.config} readOnly={readOnly} onChange={onChange} />;
}

function KindFields({
  kind, config, readOnly, onChange,
}: { kind: NodeKind; config?: PresetConfig; readOnly?: boolean; onChange: (patch: Partial<WorkflowNodeData>) => void }) {
  const mark = (valid: boolean, error?: string) => onChange({ valid, error });

  switch (kind) {
    case "start":
    case "end":
      return null;

    case "audience":
      return <AudienceFields config={config} readOnly={readOnly} mark={mark} />;

    case "conditional":
      return <ConditionalFields config={config} readOnly={readOnly} mark={mark} onChange={onChange} />;

    case "abSplit":
      return <AbSplitFields config={config} readOnly={readOnly} mark={mark} onChange={onChange} />;

    case "delay":
      return (
        <Section title="Delay">
          <Field label="Duration" required>
            <div className="grid grid-cols-2 gap-2">
              <Input disabled={readOnly} type="number" defaultValue={config?.delayValue ?? 24} className="h-9" onChange={() => mark(true)} />
              <SelectLike disabled={readOnly} options={["Minutes", "Hours", "Days"]} onPick={() => mark(true)} defaultValue={config?.delayUnit ?? "Hours"} />
            </div>
          </Field>
        </Section>
      );

    case "voiceCall":
      return <VoiceCallFields config={config} readOnly={readOnly} mark={mark} onChange={onChange} />;

    case "whatsapp":
      return <WhatsAppFields config={config} readOnly={readOnly} mark={mark} onChange={onChange} />;

    case "sms":
      return <SmsFields config={config} readOnly={readOnly} mark={mark} onChange={onChange} />;

    case "adsCampaign":
      return <AdsCampaignFields readOnly={readOnly} mark={mark} />;
  }
}

/* --------------------------- Audience --------------------------- */

function AudienceFields({ config, readOnly, mark }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void }) {
  const [mode, setMode] = useState<"csv" | "api">(config?.audienceMode ?? "csv");
  return (
    <>
      <Section title="Source">
        <Field label="Source type" required>
          <div className="grid grid-cols-3 gap-2">
            <SegmentBtn active={mode === "csv"} onClick={() => setMode("csv")} disabled={readOnly}>CSV Upload</SegmentBtn>
            <SegmentBtn active={mode === "api"} onClick={() => setMode("api")} disabled={readOnly}>Runtime API</SegmentBtn>
            <SegmentBtn disabled title="Coming soon">CRM Sync</SegmentBtn>
          </div>
        </Field>
      </Section>
      {mode === "csv" ? <CsvAudience config={config} readOnly={readOnly} mark={mark} /> : <ApiAudience config={config} readOnly={readOnly} mark={mark} />}
    </>
  );
}

/* CSV mock data — column keys + a 5-row preview. */
const CSV_KEYS = ["customer_id", "phone", "first_name", "last_name", "city", "tier", "loan_amount"];
const CSV_PREVIEW_ROWS = [
  ["C-1042", "+91 98xxx 12340", "Aarav", "Sharma", "Delhi", "gold", "75,000"],
  ["C-1043", "+91 98xxx 22188", "Diya", "Mehta", "Mumbai", "silver", "32,000"],
  ["C-1044", "+91 98xxx 90021", "Vihaan", "Rao", "Bengaluru", "gold", "1,20,000"],
  ["C-1045", "+91 98xxx 41190", "Ananya", "Iyer", "Pune", "bronze", "18,500"],
  ["C-1046", "+91 98xxx 77342", "Kabir", "Nair", "Delhi", "gold", "64,000"],
];

type DetectStatus = "idle" | "uploading" | "uploaded" | "detecting" | "detected" | "failed";

function CsvAudience({ config, readOnly, mark }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void }) {
  // Seed in the completed state so an already-configured Audience node opens valid;
  // the "Replace" control re-runs the full upload → detect flow for demos.
  const [status, setStatus] = useState<DetectStatus>("detected");
  const [fileName, setFileName] = useState(config?.fileName ?? "audience.csv");
  const [primaryKey, setPrimaryKey] = useState(config?.primaryKey ?? "customer_id");
  const [phoneCol, setPhoneCol] = useState(config?.phoneCol ?? "phone");

  // Preset nodes can override the detected schema/preview so the card matches the campaign's data.
  const schemaKeys = config?.csvKeys ?? CSV_KEYS;
  const previewRows = config?.csvPreview ?? CSV_PREVIEW_ROWS;
  const rowCount = config?.rowCount ?? "12,402";

  const detected = status === "detected";
  const keys = detected ? schemaKeys : [];

  useEffect(() => {
    const ok = detected && !!primaryKey && !!phoneCol;
    mark(ok, ok ? undefined : detected ? "Select primary key and phone column" : "Upload a CSV and detect schema");
  }, [detected, primaryKey, phoneCol]);

  const onFile = (name?: string) => {
    if (!name) return;
    setFileName(name);
    setStatus("uploading");
    setTimeout(() => {
      setStatus("uploaded");
      toast.success("CSV uploaded", { description: `${name} · ready to detect schema` });
    }, 700);
  };
  const findKeys = () => {
    setStatus("detecting");
    toast.loading("Finding keys…", { id: "csv-detect", description: fileName });
    setTimeout(() => {
      setStatus("detected");
      toast.success("Schema detection successful", { id: "csv-detect", description: `${rowCount} rows · ${schemaKeys.length} keys detected` });
    }, 1100);
  };
  const replace = () => {
    setStatus("idle");
    setFileName("");
    setPrimaryKey("");
    setPhoneCol("");
  };

  return (
    <>
      {/* Section 1: Upload CSV */}
      <Section title="Upload CSV">
        {status === "idle" ? (
          <label className="flex h-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-xs text-muted-foreground hover:bg-muted/60">
            <input type="file" accept=".csv" className="hidden" disabled={readOnly} onChange={(e) => onFile(e.target.files?.[0]?.name ?? "audience.csv")} />
            Click to upload or drag &amp; drop CSV
          </label>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-[12px]">
            <div className="flex min-w-0 items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-chart-2" />
              <span className="truncate font-medium">{fileName || "audience.csv"}</span>
              <span className="shrink-0 rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {status === "uploading" ? "Uploading…" : "Uploaded"}
              </span>
            </div>
            {!readOnly && status !== "uploading" && (
              <button onClick={replace} className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground">Replace</button>
            )}
          </div>
        )}
      </Section>

      {/* Section 2: Schema Detection */}
      {status !== "idle" && (
        <Section title="Schema detection">
          {(status === "uploaded" || status === "failed") && (
            <Button size="sm" variant="outline" disabled={readOnly} onClick={findKeys} className="h-8 w-full gap-1 text-xs">
              <Search className="h-3.5 w-3.5" /> {status === "failed" ? "Retry — Find keys" : "Find keys"}
            </Button>
          )}
          <DetectStatusRow status={status} />
          {detected && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <DetectStat label="Rows" value={rowCount} />
                <DetectStat label="Columns" value={String(schemaKeys.length)} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {keys.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px]"><Variable className="h-3 w-3 text-ai" />{k}</span>
                ))}
              </div>
            </>
          )}
        </Section>
      )}

      {detected && (
        <>
          {/* Section 3: Primary Key Selection */}
          <Section title="Primary key">
            <Field label="Primary key column" required>
              <SelectLike disabled={readOnly} options={keys} placeholder="Select key column…" defaultValue={primaryKey} onPick={setPrimaryKey} />
            </Field>
            <p className="text-[11px] text-muted-foreground">Used for duplicate detection. May point to the same column as the phone number.</p>
          </Section>

          {/* Section 4: Phone Number Validation */}
          <Section title="Phone number">
            <Field label="Phone number column" required>
              <SelectLike disabled={readOnly} options={keys} placeholder="Select phone column…" defaultValue={phoneCol} onPick={setPhoneCol} />
            </Field>
            {phoneCol && <StatusBanner ok title="All phone numbers valid" detail="Every row is in E.164 or 10-digit domestic format." />}
            <p className="text-[11px] text-muted-foreground">If any row is invalid (e.g. “2 invalid phone numbers found against selected key”), the upload is blocked until a corrected CSV is uploaded.</p>
          </Section>

          {/* Section 5: Duplicate Detection */}
          <Section title="Duplicate detection">
            {primaryKey
              ? <StatusBanner ok title="No duplicate groups detected" detail={`Checked against primary key “${primaryKey}”.`} />
              : <p className="text-[11px] text-muted-foreground">Select a primary key to run duplicate detection.</p>}
            <p className="text-[11px] text-muted-foreground">If duplicate groups are found (e.g. “14 duplicate groups detected against selected primary key”), the upload is blocked until de-duplicated.</p>
          </Section>

          {/* Section 6: Segmentation (optional) */}
          <SegmentationBuilder columns={keys} readOnly={readOnly} />

          {/* Preview */}
          <Section title="Preview">
            <div className="mb-2 flex items-center justify-between text-[11.5px]">
              <span className="text-muted-foreground">Total audience count</span>
              <span className="font-mono font-semibold tabular-nums">{rowCount}</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-[11.5px]">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>{schemaKeys.map((h) => (<th key={h} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">{h}</th>))}</tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-t border-border">{r.map((c, j) => (<td key={j} className="whitespace-nowrap px-2 py-1.5">{c}</td>))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[10.5px] text-muted-foreground">First 5 rows · scroll horizontally for all columns.</p>
          </Section>
        </>
      )}
    </>
  );
}

const DETECT_LABEL: Record<DetectStatus, string> = {
  idle: "Pending detection",
  uploading: "Uploading…",
  uploaded: "Pending detection",
  detecting: "Detecting schema…",
  detected: "Schema detected",
  failed: "Detection failed",
};

function DetectStatusRow({ status }: { status: DetectStatus }) {
  const tone =
    status === "detected" ? "text-success" :
    status === "failed" ? "text-destructive" :
    status === "detecting" ? "text-ai" : "text-muted-foreground";
  return (
    <div className={cn("flex items-center gap-2 text-[11.5px]", tone)}>
      {status === "detecting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : status === "detected" ? <CheckCircle2 className="h-3.5 w-3.5" />
        : status === "failed" ? <AlertCircle className="h-3.5 w-3.5" />
        : <Clock className="h-3.5 w-3.5" />}
      {DETECT_LABEL[status]}
    </div>
  );
}

function DetectStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-mono text-[13px] font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatusBanner({ ok, title, detail }: { ok: boolean; title: string; detail?: string }) {
  return (
    <div className={cn(
      "flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11.5px]",
      ok ? "border-success/30 bg-success/5 text-success" : "border-destructive/30 bg-destructive/5 text-destructive",
    )}>
      {ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {detail && <p className={cn("text-[11px]", ok ? "text-success/80" : "text-destructive/80")}>{detail}</p>}
      </div>
    </div>
  );
}

/* --------------------------- Runtime API Payload --------------------------- */

type SchemaField = { id: string; name: string; type: "String" | "Number" | "Boolean" };

function genSample(fields: SchemaField[], fmt: "single" | "list" | "csv"): string {
  const ph = (t: SchemaField["type"]) => (t === "Number" ? "0" : t === "Boolean" ? "true" : "\"string\"");
  const named = fields.filter((f) => f.name.trim());
  if (named.length === 0) return "// define schema fields above";
  if (fmt === "csv") {
    return `${named.map((f) => f.name).join(",")}\n${named.map((f) => (f.type === "String" ? "string" : ph(f.type).replace(/"/g, ""))).join(",")}`;
  }
  const body = named.map((f) => `  "${f.name}": ${ph(f.type)}`).join(",\n");
  const obj = `{\n${body}\n}`;
  return fmt === "list" ? `[\n${obj.split("\n").map((l) => "  " + l).join("\n")}\n]` : obj;
}

function ApiAudience({ config, readOnly, mark }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void }) {
  const [payloadType, setPayloadType] = useState<"single" | "list" | "csv">(config?.payloadType ?? "single");
  const [fields, setFields] = useState<SchemaField[]>(config?.fields ?? [
    { id: "f1", name: "phone", type: "String" },
    { id: "f2", name: "customer_name", type: "String" },
    { id: "f3", name: "loan_amount", type: "Number" },
  ]);
  const [phoneField, setPhoneField] = useState(config?.phoneField ?? "phone");

  const namedFields = fields.filter((f) => f.name.trim());
  const phoneOk = !!phoneField && namedFields.some((f) => f.name === phoneField && f.type === "String");

  useEffect(() => {
    const ok = namedFields.length > 0 && phoneOk;
    mark(ok, ok ? undefined : namedFields.length === 0 ? "Define at least one schema field" : "Map a String phone-number field");
  }, [namedFields.length, phoneOk]);

  return (
    <>
      {/* Section 1: Payload Type */}
      <Section title="Payload type">
        <Field label="Payload type" required>
          <div className="grid grid-cols-3 gap-2">
            <SegmentBtn active={payloadType === "single"} onClick={() => setPayloadType("single")} disabled={readOnly}>Single JSON</SegmentBtn>
            <SegmentBtn active={payloadType === "list"} onClick={() => setPayloadType("list")} disabled={readOnly}>List of JSON</SegmentBtn>
            <SegmentBtn active={payloadType === "csv"} onClick={() => setPayloadType("csv")} disabled={readOnly}>CSV File</SegmentBtn>
          </div>
        </Field>
      </Section>

      {/* Section 2.1: Payload Schema (manually defined) */}
      <Section title="Payload schema">
        <SchemaFieldsEditor fields={fields} setFields={setFields} readOnly={readOnly} />
        <p className="text-[11px] text-muted-foreground">Fields become runtime variables across downstream nodes and are stored as node metadata.</p>
      </Section>

      {/* Section 2.2: Phone Number Field Mapping */}
      <Section title="Phone number field">
        <Field label="Phone number field" required>
          <SelectLike disabled={readOnly} options={namedFields.map((f) => f.name)} placeholder="Select phone field…" defaultValue={phoneField} onPick={setPhoneField} />
        </Field>
        {phoneField && !phoneOk && <StatusBanner ok={false} title="Phone field must be a String type" detail="Change the mapped field’s data type to String." />}
        <p className="text-[11px] text-muted-foreground">Mandatory when the workflow contains Voice, WhatsApp, or SMS nodes. Must be a String field.</p>
      </Section>

      {/* Section 3: Schema Preview (realtime) */}
      <Section title="Schema preview">
        {namedFields.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Define fields above to see available variables.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {namedFields.map((f) => (
              <span key={f.id} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px]">
                <Variable className="h-3 w-3 text-ai" />{f.name} <span className="text-muted-foreground">({f.type})</span>
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Section 4: Runtime Trigger Endpoint */}
      <Section title="Runtime trigger endpoint">
        <Field label="Endpoint URL">
          <div className="rounded-md border border-input bg-muted/40 px-2.5 py-1.5 font-mono text-[11.5px] text-muted-foreground">POST /api/runs/trigger/cmp_8f3c2</div>
        </Field>
        <Field label="Authentication">
          <div className="rounded-md border border-input bg-muted/40 px-2.5 py-1.5 font-mono text-[11.5px] text-muted-foreground">Authorization: Bearer &lt;campaign_api_key&gt;</div>
        </Field>
        <Field label="Sample request">
          <pre className="overflow-x-auto rounded-md border border-border bg-card px-2.5 py-2 font-mono text-[11px] leading-relaxed">{`POST /api/runs/trigger/cmp_8f3c2
Authorization: Bearer <campaign_api_key>
Content-Type: ${payloadType === "csv" ? "text/csv" : "application/json"}

${genSample(namedFields, payloadType)}`}</pre>
        </Field>
      </Section>

      {/* Section 5: Sample Payload (auto-generated, matches the selected Payload type) */}
      <Section title="Sample payload">
        <pre className="overflow-x-auto rounded-md border border-border bg-card px-2.5 py-2 font-mono text-[11px] leading-relaxed">{genSample(namedFields, payloadType)}</pre>
        <p className="text-[10.5px] text-muted-foreground">
          Auto-generated from the schema above, in the selected{" "}
          <span className="font-medium text-foreground">
            {payloadType === "single" ? "Single JSON" : payloadType === "list" ? "List of JSON" : "CSV File"}
          </span>{" "}
          format. Read-only.
        </p>
      </Section>

      {/* Section 6: Segmentation (optional) */}
      <SegmentationBuilder columns={namedFields.map((f) => f.name)} readOnly={readOnly} />
    </>
  );
}

function SchemaFieldsEditor({
  fields, setFields, readOnly,
}: { fields: SchemaField[]; setFields: React.Dispatch<React.SetStateAction<SchemaField[]>>; readOnly?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_120px_auto] gap-1.5 px-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Field name</span><span>Data type</span><span />
      </div>
      {fields.map((f) => (
        <div key={f.id} className="grid grid-cols-[1fr_120px_auto] items-center gap-1.5">
          <Input value={f.name} disabled={readOnly} placeholder="field_name" onChange={(e) => setFields((xs) => xs.map((x) => x.id === f.id ? { ...x, name: e.target.value } : x))} className="h-9 font-mono text-[12px]" />
          <SelectLike disabled={readOnly} options={["String", "Number", "Boolean"]} defaultValue={f.type} onPick={(v) => setFields((xs) => xs.map((x) => x.id === f.id ? { ...x, type: v as SchemaField["type"] } : x))} />
          <button disabled={readOnly || fields.length <= 1} onClick={() => setFields((xs) => xs.filter((x) => x.id !== f.id))} className="text-muted-foreground hover:text-destructive disabled:opacity-30" aria-label="Remove field">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button size="sm" variant="outline" disabled={readOnly} onClick={() => setFields((xs) => [...xs, { id: uid("f"), name: "", type: "String" }])} className="h-8 w-full text-xs">
        <Plus className="mr-1 h-3 w-3" /> Add field
      </Button>
    </div>
  );
}

/* --------------------------- Segmentation (optional, both modes) --------------------------- */

type SegmentCondition = { id: string; variable: string; op: string; value: string };

function SegmentationBuilder({ columns, readOnly }: { columns: string[]; readOnly?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [combinator, setCombinator] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<SegmentCondition[]>([
    { id: "s1", variable: columns[0] ?? "", op: "equals", value: "" },
  ]);

  // Mock filtered-count preview — shrinks as conditions with values are added.
  const matched = enabled
    ? Math.max(1, 100000 - conditions.filter((c) => c.value.trim() || VALUELESS_OPERATORS.has(c.op)).length * 8500)
    : 100000;

  return (
    <CollapsibleSection
      title="Segmentation (optional)"
      icon={Filter}
      defaultOpen={false}
      badge={enabled ? conditions.length : undefined}
      headerRight={
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{enabled ? "On" : "Off"}</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={readOnly} />
        </div>
      }
    >
      {!enabled ? (
        <p className="text-[11.5px] text-muted-foreground">
          Toggle on to filter the audience. Only qualified records proceed downstream; the rest are excluded before execution.
        </p>
      ) : (
        <div className="space-y-2">
          {conditions.map((c, i) => (
            <div key={c.id} className="space-y-1.5">
              {i > 0 && (
                <div className="flex items-center justify-center gap-1">
                  {(["AND", "OR"] as const).map((k) => (
                    <button
                      key={k}
                      disabled={readOnly}
                      onClick={() => setCombinator(k)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wider",
                        combinator === k ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              )}
              <div className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <SelectLike disabled={readOnly} options={columns} defaultValue={c.variable} placeholder="Column…" onPick={(v) => setConditions((xs) => xs.map((x) => x.id === c.id ? { ...x, variable: v } : x))} />
                  </div>
                  <button disabled={readOnly || conditions.length <= 1} onClick={() => setConditions((xs) => xs.filter((x) => x.id !== c.id))} className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-30" aria-label="Remove condition">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <SelectLike disabled={readOnly} options={SEGMENT_OPERATORS} defaultValue={c.op} onPick={(v) => setConditions((xs) => xs.map((x) => x.id === c.id ? { ...x, op: v } : x))} />
                  <Input value={c.value} disabled={readOnly || VALUELESS_OPERATORS.has(c.op)} placeholder={VALUELESS_OPERATORS.has(c.op) ? "—" : "Value"} onChange={(e) => setConditions((xs) => xs.map((x) => x.id === c.id ? { ...x, value: e.target.value } : x))} className="h-9 text-sm" />
                </div>
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" disabled={readOnly} onClick={() => setConditions((xs) => [...xs, { id: uid("s"), variable: columns[0] ?? "", op: "equals", value: "" }])} className="h-8 w-full text-xs">
            <Plus className="mr-1 h-3 w-3" /> Add condition
          </Button>
          <div className="flex items-center justify-between rounded-md border border-ai/30 bg-ai/5 px-2.5 py-1.5 text-[11.5px] text-ai">
            <span>Matched audience</span>
            <span className="font-mono font-medium tabular-nums">{matched.toLocaleString()} / 100,000</span>
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}

/* --------------------------- Conditional --------------------------- */

const COMPARISON_OPERATORS = [
  "equals", "not equals", "greater than", "less than",
  "greater than or equal to", "less than or equal to",
  "contains", "does not contain", "exists", "does not exist",
];
const VALUELESS_OPERATORS = new Set(["exists", "does not exist"]);

// PRD Audience Segmentation operator set (§ Section 6).
const SEGMENT_OPERATORS = [
  "equals", "not equals", "greater than", "less than", "contains", "exists",
];

function ConditionalFields({ config, readOnly, mark, onChange }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void; onChange: (patch: Partial<WorkflowNodeData>) => void }) {
  const [branches, setBranches] = useState(config?.branches ?? [
    { id: "bA", label: "High value", variable: "contact.tier", op: "equals", value: "gold" },
    { id: "bB", label: "Engaged", variable: "wa.delivery_state", op: "equals", value: "read" },
  ]);
  const update = (i: number, patch: Partial<typeof branches[number]>) => {
    setBranches((b) => b.map((x, idx) => idx === i ? { ...x, ...patch } : x));
    mark(true);
  };

  // Publish each branch (+ an implicit default/else) as a labeled output handle on the canvas node.
  useEffect(() => {
    onChange({
      outputs: [
        ...branches.map((b, i) => ({ id: b.id, label: b.label || `Branch ${i + 1}`, kind: "branch" as const })),
        { id: "default", label: "Default / else", kind: "default" as const },
      ],
    });
  }, [branches]);

  return (
    <Section title="Branches (evaluated top → bottom)">
      <div className="space-y-2">
        {branches.map((b, i) => (
          <div key={b.id} className="rounded-lg border border-border bg-card p-2.5 space-y-2">
            <div className="flex items-center gap-1.5">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] font-medium text-muted-foreground">#{i + 1}</span>
              <Input value={b.label} disabled={readOnly} onChange={(e) => update(i, { label: e.target.value })} className="h-7 text-xs" placeholder="Branch label" />
              <button disabled={readOnly} onClick={() => setBranches((bs) => bs.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1.5">
              <VariablePicker value={b.variable} disabled={readOnly} onChange={(v) => update(i, { variable: v })} />
              <div className="grid grid-cols-2 gap-1.5">
                <SelectLike disabled={readOnly} options={COMPARISON_OPERATORS} defaultValue={b.op} onPick={(v) => update(i, { op: v })} />
                <Input value={b.value} disabled={readOnly || VALUELESS_OPERATORS.has(b.op)} onChange={(e) => update(i, { value: e.target.value })} className="h-9 text-sm" placeholder={VALUELESS_OPERATORS.has(b.op) ? "—" : "Value"} />
              </div>
            </div>
          </div>
        ))}
        <Button size="sm" variant="outline" disabled={readOnly} onClick={() => setBranches((b) => [...b, { id: uid("b"), label: `Branch ${b.length + 1}`, variable: "", op: "equals", value: "" }])} className="h-8 w-full text-xs">
          <Plus className="mr-1 h-3 w-3" /> Add branch
        </Button>
        <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
          <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Each branch is a separate output on the canvas. Leads matching no branch leave through the <span className="font-medium text-foreground">Default / else</span> output.</span>
        </div>
      </div>
    </Section>
  );
}

/* --------------------------- A/B Split --------------------------- */

function AbSplitFields({ config, readOnly, mark, onChange }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void; onChange: (patch: Partial<WorkflowNodeData>) => void }) {
  const [variants, setVariants] = useState(config?.splitVariants ?? [
    { id: "vA", label: "A", pct: 50 },
    { id: "vB", label: "B", pct: 50 },
  ]);
  const total = variants.reduce((s, v) => s + (Number(v.pct) || 0), 0);
  const ok = total === 100;
  useEffect(() => { mark(ok, ok ? undefined : `Traffic must total 100% (currently ${total}%)`); }, [ok, total]);

  // Publish variants as labeled output handles on the canvas node.
  useEffect(() => {
    onChange({
      outputs: variants.map((v, i) => ({
        id: v.id,
        label: `${v.label || String.fromCharCode(65 + i)} · ${v.pct}%`,
        kind: "variant" as const,
      })),
    });
  }, [variants]);

  return (
    <Section title="Variants">
      <div className="space-y-2">
        {variants.map((v, i) => (
          <div key={v.id} className="grid grid-cols-[1fr_100px_auto] gap-1.5 items-center">
            <Input value={v.label} disabled={readOnly} onChange={(e) => setVariants((vs) => vs.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))} className="h-9 text-sm" placeholder="Variant label" />
            <div className="relative">
              <Input type="number" min={0} max={100} value={v.pct} disabled={readOnly} onChange={(e) => setVariants((vs) => vs.map((x, idx) => idx === i ? { ...x, pct: Number(e.target.value) } : x))} className="h-9 pr-6 text-sm" />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
            <button disabled={readOnly || variants.length <= 2} onClick={() => setVariants((vs) => vs.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive disabled:opacity-30">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <Button size="sm" variant="outline" disabled={readOnly || variants.length >= 4} onClick={() => setVariants((v) => [...v, { id: uid("v"), label: String.fromCharCode(65 + v.length), pct: 0 }])} className="h-8 w-full text-xs">
          <Plus className="mr-1 h-3 w-3" /> Add variant
        </Button>
        <div className={cn("flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[11.5px]", ok ? "border-success/30 bg-success/5 text-success" : "border-destructive/30 bg-destructive/5 text-destructive")}>
          <span>Total traffic</span><span className="font-mono font-medium">{total}%</span>
        </div>
        <p className="text-[11px] text-muted-foreground">Each variant is a separate output on the canvas — draw an edge from each to its own downstream path.</p>
      </div>
    </Section>
  );
}

/* --------------------------- Voice Call --------------------------- */

function VoiceCallFields({ config, readOnly, mark, onChange }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void; onChange: (patch: Partial<WorkflowNodeData>) => void }) {
  return (
    <ActionNodeShell kind="voiceCall" config={config} readOnly={readOnly} mark={mark} onChange={onChange}
      renderCore={(coreMark) => <VoiceCallCore config={config} readOnly={readOnly} mark={coreMark} />} />
  );
}

function VoiceCallCore({ config, readOnly, mark }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void }) {
  const [agentSelected, setAgentSelected] = useState(!!config?.agent);
  const varMap = config?.voiceVarMap ?? [
    { v: "{{name}}", def: "contact.first_name" },
    { v: "{{phone}}", def: "contact.phone" },
  ];
  return (
    <>
      <Section title="Agent">
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-4">
          {/* Step 1: pick voice agent */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StepChip n={1} done={agentSelected} />
              <Label className="flex items-center gap-1 text-[12px] font-medium text-foreground">
                Voice agent <span className="text-destructive">*</span>
              </Label>
            </div>
            <SelectLike
              disabled={readOnly}
              options={["Aria · Conversational", "Kai · Formal", "Maya · Friendly"]}
              defaultValue={config?.agent}
              onPick={() => { setAgentSelected(true); mark(true); }}
              placeholder="Select agent…"
            />
          </div>

          <div className="border-t border-border/60" />

          {/* Step 2: variable mapping — gated on agent selection */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StepChip n={2} muted={!agentSelected} />
              <Label className="text-[12px] font-medium text-foreground">Variable mapping</Label>
            </div>
            <p className="text-[11px] text-muted-foreground">Map agent variables to upstream workflow variables.</p>
            {agentSelected ? (
              <div className="space-y-2 pt-1">
                {varMap.map((row) => (
                  <div key={row.v} className="grid grid-cols-[110px_1fr] items-center gap-2">
                    <span className="font-mono text-[11.5px] text-muted-foreground">{row.v}</span>
                    <VariablePicker defaultValue={row.def} disabled={readOnly} onChange={() => undefined} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-[11.5px] text-muted-foreground">
                Select a voice agent above to map its variables.
              </div>
            )}
          </div>
        </div>
      </Section>
      <Section title="Call window">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start time"><Input disabled={readOnly} type="time" defaultValue={config?.callStart ?? "09:00"} className="h-9" /></Field>
          <Field label="End time"><Input disabled={readOnly} type="time" defaultValue={config?.callEnd ?? "20:00"} className="h-9" /></Field>
        </div>
        <Field label="Timezone">
          <SelectLike disabled={readOnly} options={["Asia/Kolkata (IST)", "Asia/Dubai (GST)", "America/New_York (EST)", "Europe/London (GMT)"]} onPick={() => undefined} defaultValue={config?.timezone ?? "Asia/Kolkata (IST)"} />
        </Field>
      </Section>
      <Section title="Retry">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Max attempts"><Input disabled={readOnly} type="number" defaultValue={config?.maxAttempts ?? 3} className="h-9" /></Field>
          <Field label="Retry interval">
            <SelectLike disabled={readOnly} options={["15 mins", "30 mins", "1 hour", "4 hours", "24 hours"]} defaultValue={config?.retryInterval ?? "15 mins"} onPick={() => undefined} />
          </Field>
        </div>
      </Section>
    </>
  );
}

function StepChip({ n, done, muted }: { n: number; done?: boolean; muted?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10.5px] font-semibold tabular-nums",
        done
          ? "border-success/40 bg-success/10 text-success"
          : muted
            ? "border-border bg-background text-muted-foreground/70"
            : "border-border bg-background text-foreground",
      )}
    >
      {n}
    </span>
  );
}

/* --------------------------- WhatsApp --------------------------- */

function WhatsAppFields({ config, readOnly, mark, onChange }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void; onChange: (patch: Partial<WorkflowNodeData>) => void }) {
  return (
    <ActionNodeShell kind="whatsapp" config={config} readOnly={readOnly} mark={mark} onChange={onChange}
      renderCore={(coreMark) => <WhatsAppCore config={config} readOnly={readOnly} mark={coreMark} />} />
  );
}

function WhatsAppCore({ config, readOnly, mark }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void }) {
  const [mode, setMode] = useState<"template" | "freeform">(config?.waMode ?? "template");
  const [templateSelected, setTemplateSelected] = useState(!!config?.waTemplate);
  const [numberSelected, setNumberSelected] = useState(!!config?.waNumber);
  const [contentReady, setContentReady] = useState(!!config?.waTemplate || !!config?.waBody);
  const waVarMap = config?.waVarMap ?? [
    { v: "{{1}}", def: "contact.first_name" },
    { v: "{{2}}", def: "ai.intent" },
  ];

  useEffect(() => {
    mark(numberSelected && contentReady, numberSelected ? undefined : "Select a connected WhatsApp number");
  }, [numberSelected, contentReady]);

  return (
    <>
      <Section title="WhatsApp number">
        <Field label="Connected number" required>
          <SelectLike
            disabled={readOnly}
            options={["+91 98100 12345 · PiCommerce", "+91 98200 67890 · PiCommerce Support", "+91 98300 11223 · Paytm Money"]}
            defaultValue={config?.waNumber}
            onPick={() => setNumberSelected(true)}
            placeholder="Select connected number…"
          />
        </Field>
      </Section>

      <Section title="Message type">
        <div className="grid grid-cols-2 gap-2">
          <SegmentBtn active={mode === "template"} onClick={() => setMode("template")} disabled={readOnly}>Template</SegmentBtn>
          <SegmentBtn active={mode === "freeform"} onClick={() => setMode("freeform")} disabled={readOnly}>Freeform</SegmentBtn>
        </div>
      </Section>

      {mode === "template" ? (
        <Section title="Message">
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-4">
            {/* Step 1: pick template */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <StepChip n={1} done={templateSelected} />
                <Label className="flex items-center gap-1 text-[12px] font-medium text-foreground">
                  Approved template <span className="text-destructive">*</span>
                </Label>
              </div>
              <SelectLike
                disabled={readOnly}
                options={["reactivate_v3 · Marketing", "onboarding_v1 · Utility", "winback_v2 · Marketing"]}
                defaultValue={config?.waTemplate}
                onPick={() => { setTemplateSelected(true); setContentReady(true); }}
                placeholder="Choose template…"
              />
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-[12px]">
                <p className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">Preview</p>
                <p className="text-foreground">Hi <span className="text-ai">{`{{1}}`}</span>, we noticed you haven't traded <span className="text-ai">{`{{2}}`}</span> in a while. Tap below to explore latest insights.</p>
                <div className="mt-2 flex gap-1.5">
                  <span className="rounded border border-border bg-background px-2 py-1 text-[11px]">Explore now</span>
                  <span className="rounded border border-border bg-background px-2 py-1 text-[11px]">Not interested</span>
                </div>
              </div>
            </div>

            <div className="border-t border-border/60" />

            {/* Step 2: variable mapping */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <StepChip n={2} muted={!templateSelected} />
                <Label className="text-[12px] font-medium text-foreground">Variable mapping</Label>
              </div>
              {templateSelected ? (
                <div className="space-y-2 pt-1">
                  {waVarMap.map((row) => (
                    <div key={row.v} className="grid grid-cols-[60px_1fr] items-center gap-2">
                      <span className="font-mono text-[11.5px] text-muted-foreground">{row.v}</span>
                      <VariablePicker defaultValue={row.def} disabled={readOnly} onChange={() => undefined} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-[11.5px] text-muted-foreground">
                  Choose a template above to map its variables.
                </div>
              )}
            </div>
          </div>
        </Section>
      ) : (
        <Section title="Freeform message">
          <Field label="Message body" required>
            <Textarea disabled={readOnly} defaultValue={config?.waBody} placeholder="Type your message. Use @ to insert a variable." className="min-h-28 resize-none text-sm" onChange={(e) => setContentReady(!!e.target.value.trim())} />
          </Field>
          <Field label="Attachment preview">
            <SelectLike disabled={readOnly} options={["None", "Image", "Video", "Document"]} onPick={() => undefined} defaultValue="None" />
          </Field>
        </Section>
      )}
    </>
  );
}

/* --------------------------- SMS --------------------------- */

function SmsFields({ config, readOnly, mark, onChange }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void; onChange: (patch: Partial<WorkflowNodeData>) => void }) {
  return (
    <ActionNodeShell kind="sms" config={config} readOnly={readOnly} mark={mark} onChange={onChange}
      renderCore={(coreMark) => <SmsCore config={config} readOnly={readOnly} mark={coreMark} />} />
  );
}

function SmsCore({ config, readOnly, mark }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void }) {
  return (
    <>
      <Section title="SMS Configuration">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Message type" required>
            <SelectLike disabled={readOnly} options={["Promotional", "Transactional", "OTP"]} defaultValue={config?.smsType} onPick={() => mark(true)} />
          </Field>
          <Field label="Format">
            <SelectLike disabled={readOnly} options={["Text", "Unicode", "Flash SMS"]} onPick={() => undefined} defaultValue={config?.smsFormat ?? "Text"} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="PE ID" required><Input disabled={readOnly} defaultValue={config?.peId} placeholder="1101xxxxxxxxxxxxxx" className="h-9 font-mono text-[12px]" onChange={(e) => mark(!!e.target.value)} /></Field>
          <Field label="Sender ID" required><Input disabled={readOnly} defaultValue={config?.senderId} placeholder="PICOMM" maxLength={6} className="h-9 font-mono text-[12px]" onChange={(e) => mark(!!e.target.value)} /></Field>
        </div>
      </Section>
      <Section title="Message">
        <Field label="Body" required>
          <Textarea disabled={readOnly} defaultValue={config?.smsBody} placeholder="Hi {{user.name}}, your OTP is {{otp}}. Valid for 5 minutes. — PICOMM" maxLength={320} className="min-h-24 resize-none text-sm" onChange={(e) => mark(!!e.target.value.trim())} />
          <p className="mt-1 text-[10.5px] text-muted-foreground">Use @ to insert a variable. Media not supported.</p>
        </Field>
      </Section>
    </>
  );
}


/* --------------------------- Ads Campaign --------------------------- */

function AdsCampaignFields({ readOnly, mark }: { readOnly?: boolean; mark: (v: boolean, e?: string) => void }) {
  const [audienceMode, setAudienceMode] = useState<"meta" | "upload">("meta");
  return (
    <>
      <Section title="Platform">
        <div className="grid grid-cols-4 gap-1.5">
          <PlatformChip active>WhatsApp CTWA</PlatformChip>
          <PlatformChip disabled>FB Ads</PlatformChip>
          <PlatformChip disabled>Instagram</PlatformChip>
          <PlatformChip disabled>Google</PlatformChip>
        </div>
        <p className="text-[11px] text-muted-foreground">Currently supports WhatsApp Click-to-WhatsApp Ads. More platforms coming soon.</p>
      </Section>

      <Section title="Account & Objective">
        <Field label="Meta ad account" required>
          <SelectLike disabled={readOnly} options={["act_12345 · Pi Commerce Main", "act_67890 · Pi Commerce Test"]} onPick={() => mark(true)} placeholder="Select account…" />
        </Field>
        <Field label="Campaign objective" required>
          <SelectLike disabled={readOnly} options={["Engagement", "Leads", "Messages", "Sales"]} onPick={() => mark(true)} defaultValue="Messages" />
        </Field>
      </Section>

      <Section title="Audience">
        <div className="grid grid-cols-2 gap-2">
          <SegmentBtn active={audienceMode === "meta"} onClick={() => setAudienceMode("meta")} disabled={readOnly}>Meta audience filters</SegmentBtn>
          <SegmentBtn active={audienceMode === "upload"} onClick={() => setAudienceMode("upload")} disabled={readOnly}>Customer upload</SegmentBtn>
        </div>
        {audienceMode === "meta" ? (
          <>
            <Field label="Locations"><Input disabled={readOnly} placeholder="India, UAE" className="h-9" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Age min"><Input disabled={readOnly} type="number" defaultValue={25} className="h-9" /></Field>
              <Field label="Age max"><Input disabled={readOnly} type="number" defaultValue={55} className="h-9" /></Field>
            </div>
            <Field label="Interests"><Input disabled={readOnly} placeholder="Investing, stocks, mutual funds" className="h-9" /></Field>
          </>
        ) : (
          <>
            <Field label="Upload customer CSV" required>
              <label className="flex h-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-xs text-muted-foreground hover:bg-muted/60">
                <input type="file" accept=".csv" className="hidden" disabled={readOnly} />
                Upload customer list (phone/email hashed)
              </label>
            </Field>
            <Field label="Audience type">
              <SelectLike disabled={readOnly} options={["Custom audience", "Lookalike audience"]} onPick={() => undefined} defaultValue="Custom audience" />
            </Field>
          </>
        )}
      </Section>

      <Section title="Budget & Schedule">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Daily budget (₹)" required><Input disabled={readOnly} type="number" placeholder="5000" className="h-9" onChange={() => mark(true)} /></Field>
          <Field label="Bid strategy"><SelectLike disabled={readOnly} options={["Lowest cost", "Cost cap", "Bid cap"]} onPick={() => undefined} defaultValue="Lowest cost" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start"><Input disabled={readOnly} type="date" className="h-9" /></Field>
          <Field label="End"><Input disabled={readOnly} type="date" className="h-9" /></Field>
        </div>
      </Section>

      <Section title="Creative">
        <Field label="Creative source" required>
          <SelectLike disabled={readOnly} options={["Upload new creative", "Select from Asset Library"]} onPick={() => mark(true)} />
        </Field>
        <div className="grid grid-cols-3 gap-1.5">
          {["Creative A", "Creative B", "Creative C"].map((c) => (
            <div key={c} className="aspect-square rounded-md border border-border bg-muted/40 p-1.5 text-[10px] text-muted-foreground">
              <div className="flex h-full w-full items-end rounded bg-gradient-to-br from-muted to-muted-foreground/20 p-1">{c}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Only approved creatives are selectable.</p>
      </Section>

      <Section title="WhatsApp behaviour">
        <Field label="Click-to-WhatsApp template">
          <SelectLike disabled={readOnly} options={["welcome_intro_v1", "lead_qualify_v2"]} onPick={() => undefined} />
        </Field>
        <Field label="Welcome message">
          <Textarea disabled={readOnly} placeholder="Hey! Thanks for reaching out. How can we help you today?" className="min-h-16 resize-none text-sm" />
        </Field>
      </Section>
    </>
  );
}

/* --------------------------- Primitives --------------------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 space-y-3 last:mb-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-[11.5px] font-medium text-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function SelectLike({
  options, placeholder, defaultValue, disabled, onPick,
}: { options: string[]; placeholder?: string; defaultValue?: string; disabled?: boolean; onPick: (v: string) => void }) {
  const [value, setValue] = useState(defaultValue ?? "");
  return (
    <Select value={value || undefined} disabled={disabled} onValueChange={(v) => { setValue(v); onPick(v); }}>
      <SelectTrigger className="h-9 text-sm">
        <SelectValue placeholder={placeholder ?? "Select…"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function VariablePicker({
  value, defaultValue, disabled, onChange,
}: { value?: string; defaultValue?: string; disabled?: boolean; onChange: (v: string) => void }) {
  const [v, setV] = useState(value ?? defaultValue ?? "");
  useEffect(() => { if (value !== undefined) setV(value); }, [value]);
  // Preset/upstream variables (e.g. lifetime_order_value, call_disposition) aren't in
  // the sample list — surface the current value as its own option so it still renders.
  const isCustom = !!v && !SAMPLE_WORKFLOW_VARIABLES.some((s) => s.key === v);
  return (
    <div className="relative">
      <Variable className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 text-ai" />
      <Select value={v || undefined} disabled={disabled} onValueChange={(val) => { setV(val); onChange(val); }}>
        <SelectTrigger className="h-9 pl-7 font-mono text-[12px]">
          <SelectValue placeholder="Select variable…" />
        </SelectTrigger>
        <SelectContent>
          {isCustom && (
            <SelectItem value={v} className="font-mono text-[12px]">
              {v} <span className="text-muted-foreground">· upstream</span>
            </SelectItem>
          )}
          {SAMPLE_WORKFLOW_VARIABLES.map((s) => (
            <SelectItem key={s.key} value={s.key} className="font-mono text-[12px]">
              {s.key} <span className="text-muted-foreground">· {s.source}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SegmentBtn({ active, onClick, disabled, title, children }: { active?: boolean; onClick?: () => void; disabled?: boolean; title?: string; children: React.ReactNode }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cn(
        "h-9 rounded-md border px-2 text-[12.5px] font-medium transition-colors",
        active ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:bg-accent",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {children}
    </button>
  );
}

function PlatformChip({ active, disabled, children }: { active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5 text-center text-[11px] font-medium",
        active && "border-foreground bg-foreground text-background",
        !active && !disabled && "border-border bg-background",
        disabled && "border-dashed border-border bg-muted/30 text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}

/* ====================================================================== */
/* Action-node shell: Core + A/B Experiments + AI Transformations + Exits */
/* ====================================================================== */

type ActionKind = "voiceCall" | "whatsapp" | "sms";

const EXIT_VARIABLES_BY_KIND: Record<ActionKind, string[]> = {
  voiceCall: ["disposition", "call_connected", "call_duration", "retry_exhausted"],
  whatsapp: ["reply_received", "button_clicked", "session_expired", "delivery_status"],
  sms: ["delivered", "clicked", "retry_exhausted"],
};

const EXIT_OPERATORS = COMPARISON_OPERATORS;

const AI_TRANSFORMATION_TYPES = [
  "Custom AI Action", "Translate", "Transliterate", "Numerical Parsing",
  "Numerical Transcription", "Currency Formatting", "Currency Transcription",
  "Phone Number Normalization", "Date Formatting",
];

type AiTransform = { id: string; type: string; input: string; output: string; open: boolean };
// One condition = one output path/edge. No AND/OR — each route is a single check
// (e.g. reply_received → Voice Call, button_clicked → Follow-up), matching how the
// flow branches visually on the canvas.
type ExitPath = { id: string; label: string; variable: string; op: string; value: string };
type Variant = { id: string; label: string; pct: number; open: boolean };

function ActionNodeShell({
  kind, config, readOnly, mark, onChange, renderCore,
}: {
  kind: ActionKind;
  config?: PresetConfig;
  readOnly?: boolean;
  mark: (v: boolean, e?: string) => void;
  onChange: (patch: Partial<WorkflowNodeData>) => void;
  renderCore: (mark: (v: boolean, e?: string) => void) => React.ReactNode;
}) {
  const [transforms, setTransforms] = useState<AiTransform[]>(
    () => (config?.transforms ?? []).map((t) => ({ ...t, open: false })),
  );
  const [paths, setPaths] = useState<ExitPath[]>(config?.paths ?? []);

  // A/B experiment is the top-level mode switch: off → one config; on → per-variant config only.
  const [abEnabled, setAbEnabled] = useState(config?.abEnabled ?? false);
  const [variants, setVariants] = useState<Variant[]>(
    () => (config?.abVariants ?? [
      { id: "vA", label: "A", pct: 50 },
      { id: "vB", label: "B", pct: 50 },
    ]).map((v, i) => ({ ...v, open: i === 0 })),
  );
  const total = variants.reduce((s, v) => s + (Number(v.pct) || 0), 0);
  const abOk = total === 100;

  // When running as an experiment, validity is governed by the traffic split.
  useEffect(() => {
    if (abEnabled) mark(abOk, abOk ? undefined : `Variant traffic must total 100% (currently ${total}%)`);
  }, [abEnabled, abOk, total]);

  // Publish exit paths as labeled output handles on the canvas node (+ an implicit default/fallthrough).
  useEffect(() => {
    onChange({
      outputs: paths.length === 0 ? [] : [
        ...paths.map((p, i) => ({ id: p.id, label: p.label || `Path ${i + 1}`, kind: "exit" as const })),
        { id: "default", label: "Default / fallthrough", kind: "default" as const },
      ],
    });
  }, [paths]);

  // Surface the A/B experiment on the canvas node as a badge.
  useEffect(() => {
    onChange({
      abTest: abEnabled
        ? { variants: variants.map((v) => ({ label: v.label, pct: Number(v.pct) || 0 })) }
        : undefined,
    });
  }, [abEnabled, variants]);

  return (
    <>
      {/* A/B toggle on top — decides whether config is single or per-variant. */}
      <div className="mb-5 rounded-xl border border-border bg-card/40 p-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-chart-1/10 text-chart-1">
            <FlaskConical className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium">A/B Split Experiment</p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">{abEnabled ? "On" : "Off"}</span>
                <Switch checked={abEnabled} onCheckedChange={setAbEnabled} disabled={readOnly} />
              </div>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {abEnabled
                ? "Each variant has its own configuration below. Traffic is split before execution."
                : "Off — this node runs one configuration. Toggle on to test up to 2 variants."}
            </p>
          </div>
        </div>
      </div>

      {!abEnabled ? (
        <Section title="Configuration">{renderCore(mark)}</Section>
      ) : (
        <div className="mb-6 space-y-3">
          <div className={cn(
            "flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[11.5px]",
            abOk ? "border-success/30 bg-success/5 text-success" : "border-destructive/30 bg-destructive/5 text-destructive",
          )}>
            <span>Total traffic allocation</span>
            <span className="font-mono font-medium">{total}%</span>
          </div>

          {variants.map((v) => (
            <Collapsible
              key={v.id}
              open={v.open}
              onOpenChange={(o) => setVariants((vs) => vs.map((x) => x.id === v.id ? { ...x, open: o } : x))}
            >
              <div className="rounded-lg border border-border bg-background">
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <CollapsibleTrigger asChild>
                    <button disabled={readOnly} className="flex flex-1 items-center gap-2 text-left">
                      <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", !v.open && "-rotate-90")} />
                      <span className="rounded-full bg-foreground/90 px-1.5 py-0.5 text-[10px] font-semibold text-background">Variant {v.label}</span>
                    </button>
                  </CollapsibleTrigger>
                  <div className="relative w-[88px]">
                    <Input
                      type="number" min={0} max={100} value={v.pct} disabled={readOnly}
                      onChange={(e) => setVariants((vs) => vs.map((x) => x.id === v.id ? { ...x, pct: Number(e.target.value) } : x))}
                      className="h-8 pr-6 text-[12px]"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">%</span>
                  </div>
                  <button
                    disabled={readOnly || variants.length <= 2}
                    onClick={() => setVariants((vs) => vs.filter((x) => x.id !== v.id))}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                    aria-label="Remove variant"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <CollapsibleContent className="border-t border-border p-3">
                  {renderCore(() => undefined)}
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}

          <Button
            size="sm" variant="outline"
            disabled={readOnly || variants.length >= 2}
            onClick={() => setVariants((vs) => [...vs, {
              id: uid("v"), label: String.fromCharCode(65 + vs.length), pct: 0, open: true,
            }])}
            className="h-8 w-full text-xs"
          >
            <Plus className="mr-1 h-3 w-3" /> Add variant
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Maximum 2 variants (A/B only). Variant is assigned before execution; Exit Conditions evaluate after the assigned variant completes.
          </p>
        </div>
      )}

      <AiTransformationsSection
        readOnly={readOnly}
        transforms={transforms}
        setTransforms={setTransforms}
      />

      <ExitConditionsSection
        kind={kind}
        readOnly={readOnly}
        paths={paths}
        setPaths={setPaths}
        transformOutputs={transforms.map((t) => t.output).filter(Boolean)}
      />
    </>
  );
}

/* --------------------------- CollapsibleSection helper --------------------------- */

function CollapsibleSection({
  title, icon: Icon, defaultOpen, badge, headerRight, children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  badge?: string | number;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="mb-6 rounded-xl border border-border bg-card/40 last:mb-0">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
          {badge !== undefined && badge !== "" && (
            <span className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {badge}
            </span>
          )}
        </button>
        {headerRight}
      </div>
      {open && <div className="border-t border-border/70 p-3">{children}</div>}
    </div>
  );
}

/* --------------------------- AI Transformations --------------------------- */

function AiTransformationsSection({
  readOnly, transforms, setTransforms,
}: {
  readOnly?: boolean;
  transforms: AiTransform[];
  setTransforms: React.Dispatch<React.SetStateAction<AiTransform[]>>;
}) {
  const move = (id: string, dir: -1 | 1) => {
    setTransforms((xs) => {
      const i = xs.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= xs.length) return xs;
      const copy = [...xs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };
  const add = () => setTransforms((xs) => [...xs, {
    id: uid("t"), type: "Translate", input: "", output: "", open: true,
  }]);

  return (
    <CollapsibleSection
      title="AI Transformations"
      icon={Sparkles}
      defaultOpen={transforms.length > 0}
      badge={transforms.length || undefined}
      headerRight={
        <Button size="sm" variant="ghost" disabled={readOnly} onClick={(e) => { e.stopPropagation(); add(); }} className="h-7 gap-1 px-2 text-[11px]">
          <Plus className="h-3 w-3" /> Add
        </Button>
      }
    >
      {transforms.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-[11.5px] text-muted-foreground">
          No transformations. Outputs you define here become variables on downstream nodes.
        </div>
      ) : (
        <div className="space-y-2">
          {transforms.map((a, i) => (
            <Collapsible key={a.id} open={a.open} onOpenChange={(o) => setTransforms((xs) => xs.map((x) => x.id === a.id ? { ...x, open: o } : x))}>
              <div className="rounded-lg border border-border bg-background">
                <div className="flex items-center gap-1.5 px-2.5 py-2">
                  <div className="flex flex-col">
                    <button disabled={readOnly || i === 0} onClick={() => move(a.id, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                    <button disabled={readOnly || i === transforms.length - 1} onClick={() => move(a.id, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                  </div>
                  <CollapsibleTrigger asChild>
                    <button disabled={readOnly} className="flex flex-1 items-center gap-2 text-left">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[11px] font-medium text-muted-foreground">#{i + 1}</span>
                      <span className="text-[12.5px] font-medium">{a.type}</span>
                      <span className="ml-auto flex items-center gap-1 font-mono text-[11px] text-ai">
                        <Variable className="h-3 w-3" />{a.output || "output"}
                      </span>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", a.open && "rotate-180")} />
                    </button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="space-y-2 border-t border-border p-2.5">
                  <Field label="Transformation type">
                    <SelectLike disabled={readOnly} options={AI_TRANSFORMATION_TYPES} defaultValue={a.type} onPick={(v) => setTransforms((xs) => xs.map((x) => x.id === a.id ? { ...x, type: v } : x))} />
                  </Field>
                  <Field label="Input variable">
                    <VariablePicker defaultValue={a.input} disabled={readOnly} onChange={(v) => setTransforms((xs) => xs.map((x) => x.id === a.id ? { ...x, input: v } : x))} />
                  </Field>
                  {a.type === "Custom AI Action" && (
                    <Field label="Prompt">
                      <Textarea disabled={readOnly} placeholder="Describe what this AI step should do…" className="min-h-20 resize-none text-sm" />
                    </Field>
                  )}
                  <Field label="Output variable name" required>
                    <Input disabled={readOnly} value={a.output} onChange={(e) => setTransforms((xs) => xs.map((x) => x.id === a.id ? { ...x, output: e.target.value } : x))} placeholder="e.g. intent_hi" className="h-9 font-mono text-[12px]" />
                  </Field>
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setTransforms((xs) => xs.filter((x) => x.id !== a.id))} className="h-7 gap-1 text-[11px] text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" /> Remove
                    </Button>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

/* --------------------------- Exit Conditions --------------------------- */

function ExitConditionsSection({
  kind, readOnly, paths, setPaths, transformOutputs,
}: {
  kind: ActionKind;
  readOnly?: boolean;
  paths: ExitPath[];
  setPaths: React.Dispatch<React.SetStateAction<ExitPath[]>>;
  transformOutputs: string[];
}) {
  const exitVars = EXIT_VARIABLES_BY_KIND[kind];

  const addPath = () => setPaths((ps) => [...ps, {
    id: uid("p"),
    label: `Path ${ps.length + 1}`,
    variable: exitVars[0],
    op: "equals",
    value: "",
  }]);

  return (
    <CollapsibleSection
      title="Exit Conditions"
      icon={GitBranch}
      defaultOpen
      badge={paths.length || undefined}
      headerRight={
        <Button size="sm" variant="ghost" disabled={readOnly} onClick={(e) => { e.stopPropagation(); addPath(); }} className="h-7 gap-1 px-2 text-[11px]">
          <Plus className="h-3 w-3" /> Add
        </Button>
      }
    >
      <p className="mb-2 text-[11px] text-muted-foreground">
        Each route below becomes its own output on the canvas — connect an edge from each to send matching leads onward. Anything matching none leaves through <span className="font-medium text-foreground">Default / fallthrough</span>.
      </p>

      {paths.length === 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
              <ArrowDown className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-foreground">Single default path</p>
              <p className="text-[11px] text-muted-foreground">
                {kind === "whatsapp"
                  ? "Everyone leaves through one output once the reply is received or the session expires."
                  : "Everyone leaves through one output once this node completes."}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={readOnly} onClick={addPath} className="h-8 w-full text-xs">
            <Plus className="mr-1 h-3 w-3" /> Add exit condition to branch the flow
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {paths.map((p, pi) => (
            <div key={p.id} className="rounded-lg border border-border bg-background p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">→</span>
                <Input
                  value={p.label}
                  disabled={readOnly}
                  onChange={(e) => setPaths((ps) => ps.map((x) => x.id === p.id ? { ...x, label: e.target.value } : x))}
                  className="h-7 flex-1 text-xs font-medium"
                  placeholder="Route name (labels the output)"
                />
                <button
                  disabled={readOnly}
                  onClick={() => setPaths((ps) => ps.filter((x) => x.id !== p.id))}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Remove route"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <ExitVariablePicker
                exitVars={exitVars}
                transformOutputs={transformOutputs}
                value={p.variable}
                disabled={readOnly}
                onChange={(v) => setPaths((ps) => ps.map((x) => x.id === p.id ? { ...x, variable: v } : x))}
              />
              <div className="grid grid-cols-2 gap-1.5">
                <SelectLike
                  disabled={readOnly}
                  options={EXIT_OPERATORS}
                  defaultValue={p.op}
                  onPick={(v) => setPaths((ps) => ps.map((x) => x.id === p.id ? { ...x, op: v } : x))}
                />
                <Input
                  value={p.value}
                  disabled={readOnly || VALUELESS_OPERATORS.has(p.op)}
                  onChange={(e) => setPaths((ps) => ps.map((x) => x.id === p.id ? { ...x, value: e.target.value } : x))}
                  placeholder={VALUELESS_OPERATORS.has(p.op) ? "—" : "Value"}
                  className="h-9 text-sm"
                />
              </div>
              <p className="text-[10.5px] text-muted-foreground">
                Output handle: <span className="font-mono">→ {p.label || `Path ${pi + 1}`}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

function ExitVariablePicker({
  exitVars, transformOutputs, value, disabled, onChange,
}: {
  exitVars: string[];
  transformOutputs: string[];
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Variable className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 text-ai" />
      <Select value={value || undefined} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger className="h-9 pl-7 font-mono text-[12px]">
          <SelectValue placeholder="Select variable…" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Node outputs</SelectLabel>
            {exitVars.map((v) => <SelectItem key={v} value={v} className="font-mono text-[12px]">{v}</SelectItem>)}
          </SelectGroup>
          {transformOutputs.length > 0 && (
            <SelectGroup>
              <SelectLabel>Transformation outputs</SelectLabel>
              {transformOutputs.map((v) => <SelectItem key={v} value={v} className="font-mono text-[12px]">{v}</SelectItem>)}
            </SelectGroup>
          )}
          <SelectGroup>
            <SelectLabel>Workflow variables</SelectLabel>
            {SAMPLE_WORKFLOW_VARIABLES.map((s) => <SelectItem key={s.key} value={s.key} className="font-mono text-[12px]">{s.key}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

