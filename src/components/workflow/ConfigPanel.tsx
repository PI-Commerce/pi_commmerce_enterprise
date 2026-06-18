import { useState, useEffect, useRef, createContext, useContext } from "react";
import {
  X, Copy, Trash2, AlertCircle, CheckCircle2, Plus, GripVertical, ChevronDown, Variable,
  Sparkles, GitBranch, FlaskConical, ArrowUp, ArrowDown,
  FileSpreadsheet, Loader2, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRegion, localizeCurrency } from "@/lib/region";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { WorkflowNodeData, NodeKind, PresetConfig, PresetBranch, NodeOutput } from "@/lib/campaign-types";
import { NODE_LABELS, SAMPLE_WORKFLOW_VARIABLES } from "@/lib/campaign-types";
import { SEED_TEMPLATES } from "@/lib/waba-templates";
import { whatsappOutputs, resolveWaTemplate, completedOutput } from "@/lib/wa-outputs";

/** Per-node outcome variables (e.g. `<nodeId>.session_expired`) contributed by the
 *  action nodes present in the flow — merged into the Conditional variable picker. */
const ExtraVariablesContext = createContext<{ key: string; source: string }[]>([]);

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
  /** Outcome variables exposed by other action nodes in the flow (for the Conditional picker). */
  extraVariables?: { key: string; source: string }[];
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

export function ConfigPanel({ node, readOnly, onClose, onChange, onDelete, onDuplicate, extraVariables }: Props) {
  if (!node) return null;
  const { data } = node;
  const valid = data.valid !== false;
  const isSystem = data.kind === "start" || data.kind === "end";
  // Preset/example nodes render the *real* editor for this kind, hydrated from
  // data.config — so it looks fully configured AND its dropdowns/inputs are live
  // (the user can open and explore them). We only neuter onChange so the stateful
  // sub-components can't overwrite the authored outputs/abTest (and disconnect the
  // example graph's edges) — field edits stay local to the panel. Snapshot mode
  // (Version History) still passes readOnly to lock everything down.
  const preset = !!data.preset;
  const ro = readOnly;
  const safeChange = preset ? NOOP_CHANGE : onChange;

  return (
    <ExtraVariablesContext.Provider value={extraVariables ?? []}>
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
    </ExtraVariablesContext.Provider>
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

// Audience node (v1 redesign — scope B1–B6): exactly two configurable sections,
// Schema + Phone Number Selection (the node Name is the panel-top field). The schema
// is derived from a *sample* CSV (column headers + count only — rows are never parsed
// or stored) OR defined manually as typed fields. No source-type modes, primary key,
// duplicate validation, row-level phone validation, filtering, or runtime endpoint —
// runtime data delivery now lives in the Run modal + Data tab.
function AudienceFields({ config, readOnly, mark }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void }) {
  // Schema source: derive from a sample CSV, or define fields by hand.
  const initialMode: "csv" | "manual" = config?.csvKeys ? "csv" : config?.fields ? "manual" : "csv";
  const [mode, setMode] = useState<"csv" | "manual">(initialMode);

  // CSV-derived schema — metadata only (column headers); rows are never read.
  const [status, setStatus] = useState<DetectStatus>(config?.csvKeys ? "detected" : "idle");
  const [fileName, setFileName] = useState(config?.fileName ?? "");
  const csvKeys = config?.csvKeys ?? CSV_KEYS;
  const csvDetected = status === "detected";

  // Manually defined schema.
  const [fields, setFields] = useState<SchemaField[]>(config?.fields ?? [
    { id: "f1", name: "phone", type: "String" },
    { id: "f2", name: "first_name", type: "String" },
  ]);
  const namedFields = fields.filter((f) => f.name.trim());

  // Phone field selection (accepts legacy phoneCol/phoneField from preset configs).
  const [phoneField, setPhoneField] = useState(config?.phoneField ?? config?.phoneCol ?? "");

  const keys = mode === "csv" ? (csvDetected ? csvKeys : []) : namedFields.map((f) => f.name);
  const schemaOk = mode === "csv" ? csvDetected : namedFields.length > 0;
  // CSV columns are untyped, so the String requirement is only enforced in manual mode.
  const phoneTypeOk = mode === "csv" ? true : namedFields.some((f) => f.name === phoneField && f.type === "String");
  const phoneOk = !!phoneField && keys.includes(phoneField) && phoneTypeOk;

  useEffect(() => {
    const ok = schemaOk && phoneOk;
    const err = !schemaOk
      ? (mode === "csv" ? "Upload a sample CSV to read its columns" : "Define at least one schema field")
      : !phoneField ? "Select the phone number field"
      : !keys.includes(phoneField) ? "Phone field is not in the current schema"
      : !phoneTypeOk ? "Phone field must be a String type"
      : undefined;
    mark(ok, err);
  }, [mode, schemaOk, phoneOk, phoneField]);

  // Sample-CSV upload — simulates reading the header row only.
  const onFile = (name?: string) => {
    if (!name) return;
    setFileName(name);
    setStatus("uploading");
    setTimeout(() => setStatus("detecting"), 450);
    setTimeout(() => {
      setStatus("detected");
      toast.success("Columns read", { description: `${csvKeys.length} columns detected · row data not stored` });
    }, 1150);
  };
  const replace = () => { setStatus("idle"); setFileName(""); };

  return (
    <>
      {/* Section: Schema */}
      <Section title="Schema">
        <Field label="Define schema by" required>
          <div className="grid grid-cols-2 gap-2">
            <SegmentBtn active={mode === "csv"} onClick={() => setMode("csv")} disabled={readOnly}>Sample CSV</SegmentBtn>
            <SegmentBtn active={mode === "manual"} onClick={() => setMode("manual")} disabled={readOnly}>Manual</SegmentBtn>
          </div>
        </Field>

        {mode === "csv" ? (
          <div className="space-y-3">
            {status === "idle" ? (
              <label className="flex h-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-3 text-center text-xs text-muted-foreground hover:bg-muted/60">
                <input type="file" accept=".csv" className="hidden" disabled={readOnly} onChange={(e) => onFile(e.target.files?.[0]?.name ?? "sample.csv")} />
                Upload a sample CSV to read its column headers
              </label>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-[12px]">
                <div className="flex min-w-0 items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 shrink-0 text-chart-2" />
                  <span className="truncate font-medium">{fileName || "sample.csv"}</span>
                  <span className="shrink-0 rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {status === "uploading" ? "Reading…" : "Headers read"}
                  </span>
                </div>
                {!readOnly && status !== "uploading" && (
                  <button onClick={replace} className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground">Replace</button>
                )}
              </div>
            )}
            <DetectStatusRow status={status} />
            {csvDetected && (
              <>
                <DetectStat label="Columns" value={String(csvKeys.length)} />
                <div className="flex flex-wrap gap-1.5">
                  {csvKeys.map((k) => (
                    <span key={k} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px]"><Variable className="h-3 w-3 text-ai" />{k}</span>
                  ))}
                </div>
              </>
            )}
            <p className="text-[11px] text-muted-foreground">Only column headers and their count are read — row data is never parsed or stored.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <SchemaFieldsEditor fields={fields} setFields={setFields} readOnly={readOnly} />
            {namedFields.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {namedFields.map((f) => (
                  <span key={f.id} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px]">
                    <Variable className="h-3 w-3 text-ai" />{f.name} <span className="text-muted-foreground">({f.type})</span>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Fields become runtime variables available to downstream nodes.</p>
          </div>
        )}
      </Section>

      {/* Section: Phone Number Selection */}
      <Section title="Phone Number Selection">
        <Field label="Phone number field" required>
          <SelectLike disabled={readOnly} options={keys} placeholder={keys.length ? "Select phone field…" : "Define the schema first"} defaultValue={phoneField} onPick={setPhoneField} />
        </Field>
        {mode === "manual" && phoneField && !phoneTypeOk && (
          <StatusBanner ok={false} title="Phone field must be a String type" detail="Change the mapped field’s data type to String." />
        )}
        <p className="text-[11px] text-muted-foreground">Required when the workflow contains Voice or WhatsApp nodes. Must be a String field.</p>
      </Section>
    </>
  );
}

/* Fallback column keys for the sample-CSV demo (only the header row is read). */
const CSV_KEYS = ["customer_id", "phone", "first_name", "last_name", "city", "tier", "loan_amount"];

type DetectStatus = "idle" | "uploading" | "uploaded" | "detecting" | "detected" | "failed";

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

/* --------------------------- Manual schema fields --------------------------- */

type SchemaField = { id: string; name: string; type: "String" | "Number" | "Boolean" };

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

/* --------------------------- Conditional --------------------------- */

const COMPARISON_OPERATORS = [
  "equals", "not equals", "greater than", "less than",
  "greater than or equal to", "less than or equal to",
  "between", "not between",
  "contains", "does not contain", "exists", "does not exist",
];
const VALUELESS_OPERATORS = new Set(["exists", "does not exist"]);
const RANGE_OPERATORS = new Set(["between", "not between"]);

function ConditionalFields({ config, readOnly, mark, onChange }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void; onChange: (patch: Partial<WorkflowNodeData>) => void }) {
  const { symbol } = useRegion();
  const [branches, setBranches] = useState<PresetBranch[]>(() =>
    (config?.branches ?? [
      { id: "bA", label: "High value", variable: "contact.tier", op: "equals", value: "gold" },
      { id: "bB", label: "Engaged", variable: "wa.delivery_state", op: "equals", value: "read" },
    ]).map((b) => ({ ...b, label: localizeCurrency(b.label, symbol) })),
  );
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
                {RANGE_OPERATORS.has(b.op) ? (
                  // Range operators take two bounds — show "[min] and [max]"
                  // inline. Both values are inclusive (matches the "50–80" reading).
                  <div className="flex items-center gap-1">
                    <Input value={b.value} disabled={readOnly} onChange={(e) => update(i, { value: e.target.value })} className="h-9 text-sm" placeholder="Min" />
                    <span className="px-0.5 text-[11px] text-muted-foreground">and</span>
                    <Input value={b.value2 ?? ""} disabled={readOnly} onChange={(e) => update(i, { value2: e.target.value })} className="h-9 text-sm" placeholder="Max" />
                  </div>
                ) : (
                  <Input value={b.value} disabled={readOnly || VALUELESS_OPERATORS.has(b.op)} onChange={(e) => update(i, { value: e.target.value })} className="h-9 text-sm" placeholder={VALUELESS_OPERATORS.has(b.op) ? "—" : "Value"} />
                )}
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
  const { tzLabel } = useRegion();
  const [agent, setAgent] = useState<string>(config?.agent ?? "");
  const agentSelected = !!agent;
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
              onPick={(v) => { setAgent(v); mark(true); }}
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
          <SelectLike disabled={readOnly} options={["Asia/Kolkata (IST)", "Asia/Dubai (GST)", "America/New_York (EST)", "Europe/London (GMT)"]} onPick={() => undefined} defaultValue={tzLabel} />
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
      <ActionAdvanceBanner kind="voiceCall" />
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
      renderCore={(coreMark) => <WhatsAppCore config={config} readOnly={readOnly} mark={coreMark} onChange={onChange} />} />
  );
}

const APPROVED_TEMPLATES = SEED_TEMPLATES.filter((t) => t.status === "Approved");

function WhatsAppCore({
  config, readOnly, mark, onChange,
}: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void; onChange: (patch: Partial<WorkflowNodeData>) => void }) {
  const [mode, setMode] = useState<"template" | "freeform">(config?.waMode ?? "template");
  const [templateId, setTemplateId] = useState(config?.waTemplate ?? "");
  const [numberSelected, setNumberSelected] = useState(!!config?.waNumber);
  const [contentReady, setContentReady] = useState(!!config?.waTemplate || !!config?.waBody);
  const [splitOutcomes, setSplitOutcomes] = useState(config?.waSplitOutcomes ?? false);
  const template = resolveWaTemplate(templateId);
  const templateSelected = !!template;
  const hasButtons = mode !== "freeform" && !!template
    && (template.buttons ?? []).some((b) => b.type === "URL" || b.type === "Quick Reply" || b.type === "Link Flow");
  // Type 1 = no branchable buttons; its outcomes only split when the toggle is on.
  const isType1 = !hasButtons;

  const waVarMap = config?.waVarMap ?? [
    { v: "{{1}}", def: "contact.first_name" },
    { v: "{{2}}", def: "ai.intent" },
  ];

  useEffect(() => {
    mark(numberSelected && contentReady, numberSelected ? undefined : "Select a connected WhatsApp number");
  }, [numberSelected, contentReady]);

  // Publish the canvas handles (derived from template buttons + the Type-1 split
  // toggle) AND persist the config so the node restores correctly when reopened.
  useEffect(() => {
    const outs = mode === "freeform" ? whatsappOutputs(undefined, splitOutcomes) : whatsappOutputs(template, splitOutcomes);
    onChange({
      outputs: outs,
      config: { ...config, waMode: mode, waTemplate: templateId, waSplitOutcomes: splitOutcomes },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, templateId, splitOutcomes]);

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
              <Select
                value={templateId || undefined}
                disabled={readOnly}
                onValueChange={(id) => { setTemplateId(id); setContentReady(true); }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Choose template…" />
                </SelectTrigger>
                <SelectContent>
                  {/* Preset/legacy configs may reference a template name not in the
                      registry — surface it so the node still reads as configured. */}
                  {templateId && !template && (
                    <SelectItem value={templateId}>{templateId} · legacy</SelectItem>
                  )}
                  {APPROVED_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} · {t.category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {template && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-[12px]">
                  <p className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">Preview</p>
                  <p className="text-foreground">{template.body}</p>
                  {template.buttons && template.buttons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {template.buttons.map((b, i) => (
                        <span key={i} className="rounded border border-border bg-background px-2 py-1 text-[11px]">{b.text}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
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

      {/* Type-1 only: opt in to splitting reply vs. session into separate paths.
          Type-2 (button) nodes always expose their outcomes, so the toggle is hidden. */}
      {isType1 && (
        <Section title="Outcome paths">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[12px] font-medium">Split reply &amp; session into separate paths</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Off: one output advances every lead onward. On: route “replied” and “session expired” separately.
              </p>
            </div>
            <Switch checked={splitOutcomes} disabled={readOnly} onCheckedChange={setSplitOutcomes} />
          </div>
        </Section>
      )}

      <ActionAdvanceBanner kind="whatsapp" type1={isType1} split={splitOutcomes} />
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
      <ActionAdvanceBanner kind="sms" />
    </>
  );
}


/* --------------------------- Ads Campaign --------------------------- */

function AdsCampaignFields({ readOnly, mark }: { readOnly?: boolean; mark: (v: boolean, e?: string) => void }) {
  const [audienceMode, setAudienceMode] = useState<"meta" | "upload">("meta");
  const { symbol } = useRegion();
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
          <Field label={`Daily budget (${symbol.trim()})`} required><Input disabled={readOnly} type="number" placeholder="5000" className="h-9" onChange={() => mark(true)} /></Field>
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
  // Outcome variables from other action nodes in the flow (e.g. `<id>.session_expired`).
  const extraVariables = useContext(ExtraVariablesContext);
  const allVariables = [...extraVariables, ...SAMPLE_WORKFLOW_VARIABLES];
  // Preset/upstream variables (e.g. lifetime_order_value, call_disposition) aren't in
  // the sample list — surface the current value as its own option so it still renders.
  const isCustom = !!v && !allVariables.some((s) => s.key === v);
  return (
    <div className="relative min-w-0">
      <Variable className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 text-ai" />
      <Select value={v || undefined} disabled={disabled} onValueChange={(val) => { setV(val); onChange(val); }}>
        <SelectTrigger className="h-9 min-w-0 pl-7 font-mono text-[12px] [&>span]:truncate">
          <SelectValue placeholder="Select variable…" />
        </SelectTrigger>
        <SelectContent>
          {isCustom && (
            <SelectItem value={v} className="font-mono text-[12px]">
              {v} <span className="text-muted-foreground">· upstream</span>
            </SelectItem>
          )}
          {allVariables.map((s) => (
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

const AI_TRANSFORMATION_TYPES = [
  "Custom AI Action", "Translate", "Transliterate", "Numerical Parsing",
  "Numerical Transcription", "Currency Formatting", "Currency Transcription",
  "Phone Number Normalization", "Date Formatting",
];

type AiTransform = { id: string; type: string; input: string; output: string; open: boolean };
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

  // Voice / SMS advance through a single "Completed" output; WhatsApp outputs are
  // derived from the selected template's buttons (published by WhatsAppCore).
  useEffect(() => {
    if (kind === "voiceCall" || kind === "sms") onChange({ outputs: completedOutput() });
  }, [kind]);

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
      {/* A/B experiment summary — shown whenever a node has A/B enabled (example
          campaigns author it). Clean nodes (abEnabled false) never render a toggle. */}
      {abEnabled && (
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
      )}

      {!readOnly || !abEnabled ? (
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
            Maximum 2 variants (A/B only). Variant is assigned before execution; the node advances once the assigned variant completes.
          </p>
        </div>
      )}

      {/* AI Transformations are OOS for v1 (scope A5) — the editable builder no longer
          exposes them. Only shown read-only when an example campaign actually authored
          transforms (none do in v1), so clean preset nodes never render an empty section. */}
      {readOnly && transforms.length > 0 && (
        <AiTransformationsSection
          readOnly={readOnly}
          transforms={transforms}
          setTransforms={setTransforms}
        />
      )}
    </>
  );
}

/* --------------------------- Advance banner --------------------------- */

/** Static, non-editable explainer of when a lead advances off an action node.
 *  Replaces the old (editable) Exit Conditions section — branching is now done
 *  with a downstream Conditional node. */
function ActionAdvanceBanner({ kind, type1, split }: { kind: ActionKind; type1?: boolean; split?: boolean }) {
  const text =
    kind === "voiceCall"
      ? "Leads advance when the call concludes or retries are exhausted. Branch on the outcome with a Conditional node downstream."
      : kind === "sms"
        ? "Leads advance once the message is sent. Branch on the outcome with a Conditional node downstream."
        : type1
          ? split
            ? "Leads branch on whether a reply arrived or the 24-hour session window expired — wire each output."
            : "Leads advance to the next step once a reply is received or the 24-hour session window expires."
          : "Leads advance when a button is tapped, a reply is received, or the 24-hour session window expires. Each button is its own output on the canvas — connect an edge from every button.";
  return (
    <div className="mt-4 flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
      <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
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
