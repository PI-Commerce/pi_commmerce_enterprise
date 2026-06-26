import { useState, useEffect, useRef, createContext, useContext } from "react";
import {
  X, Copy, Trash2, AlertCircle, CheckCircle2, Plus, GripVertical, ChevronDown, Variable,
  Sparkles, GitBranch, FlaskConical, ArrowUp, ArrowDown, ArrowRight, ArrowLeftRight,
  FileSpreadsheet, Loader2, Clock, Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRegion, localizeCurrency } from "@/lib/region";
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
import type { WorkflowNodeData, NodeKind, PresetConfig, PresetBranch, PresetCondition, PresetVarMap, PresetValueRemap, NodeOutput } from "@/lib/campaign-types";
import { NODE_LABELS, SAMPLE_WORKFLOW_VARIABLES, branchConditions } from "@/lib/campaign-types";
import { SEED_TEMPLATES } from "@/lib/waba-templates";
import { whatsappOutputs, resolveWaTemplate, completedOutput, isBranchableButton } from "@/lib/wa-outputs";
import { getTool, TOOLS } from "@/lib/tool-registry";
import { resolveAgent, voiceAgents } from "@/lib/agent-data";

const VOICE_AGENTS = voiceAgents();

/** Per-node outcome variables (e.g. `whatsapp_1.session_expired`) contributed by the
 *  action nodes present in the flow — merged into the Conditional variable picker. */
const ExtraVariablesContext = createContext<{ key: string; source: string }[]>([]);

/** Merge flow-derived variables (from the live nodes) with the static sample set.
 *  Dedupes by key (derived wins). When the Audience node has contributed real
 *  `contact.*` fields from its edited schema, the static `contact.*` samples are
 *  dropped so the picker reflects the actual schema, not the demo defaults. */
function mergeVariables(extra: { key: string; source: string }[]) {
  const hasDerivedContact = extra.some((v) => v.key.startsWith("contact."));
  const sample = hasDerivedContact
    ? SAMPLE_WORKFLOW_VARIABLES.filter((v) => !v.key.startsWith("contact."))
    : SAMPLE_WORKFLOW_VARIABLES;
  const seen = new Set<string>();
  const out: { key: string; source: string }[] = [];
  for (const v of [...extra, ...sample]) {
    if (seen.has(v.key)) continue;
    seen.add(v.key);
    out.push(v);
  }
  return out;
}

/** Two-level grouping for the variable pickers: level 1 = the producing node
 *  (its serial) / data source, level 2 = that node's variables. First-seen order. */
function groupVariablesBySource(vars: { key: string; source: string }[]) {
  const order: string[] = [];
  const bySource = new Map<string, { key: string; source: string }[]>();
  for (const s of vars) {
    if (!bySource.has(s.source)) { bySource.set(s.source, []); order.push(s.source); }
    bySource.get(s.source)!.push(s);
  }
  return order.map((source) => ({ source, items: bySource.get(source)! }));
}

/** Labeled `[Variable | Value]` segmented control — replaces the old icon toggle.
 *  `Variable` maps to an upstream key; `Value` hardcodes a constant literal. */
function VarValueToggle({
  mode, disabled, onPick, size = "h-9",
}: { mode: "variable" | "constant"; disabled?: boolean; onPick: (m: "variable" | "constant") => void; size?: string }) {
  return (
    <div className={cn("inline-flex shrink-0 overflow-hidden rounded-md border border-border", size)}>
      {([["variable", "Variable"], ["constant", "Value"]] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => { if (mode !== key) onPick(key); }}
          className={cn(
            "px-2 text-[11px] font-medium transition-colors",
            mode === key ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-accent",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

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
          {!isSystem && <DescriptionField data={data} readOnly={ro} onChange={safeChange} />}
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

/* --------------------------- Description (serial label) --------------------------- */

const DESCRIPTION_MAX = 12;

function DescriptionField({
  data, readOnly, onChange,
}: { data: WorkflowNodeData; readOnly?: boolean; onChange: (patch: Partial<WorkflowNodeData>) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>Description</span>
        {data.serial && <span className="font-mono normal-case tracking-normal text-muted-foreground/80">{data.serial}</span>}
      </Label>
      <Input
        value={data.description ?? ""}
        disabled={readOnly}
        maxLength={DESCRIPTION_MAX}
        placeholder="Short label (≤12 chars)"
        onChange={(e) => onChange({ description: e.target.value.slice(0, DESCRIPTION_MAX) })}
        className="h-9 text-sm"
      />
      <p className="text-[11px] text-muted-foreground">
        Appears under the node as <span className="font-mono">{data.serial ? `${data.serial} • ${data.description || "…"}` : "serial • description"}</span>.
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

    case "apiToolCall":
      return <ApiToolCallFields config={config} readOnly={readOnly} mark={mark} onChange={onChange} />;

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
  // Schema is *always* hand-editable as key → data-type rows. A CSV drop is purely a
  // convenience: it merges its column headers into those same rows (new names appended,
  // existing names left untouched), and the user can keep editing afterward.
  const seededFields: SchemaField[] = config?.fields
    ?? (config?.csvKeys ?? CSV_KEYS).map((k, i) => ({ id: `f${i + 1}`, name: k, type: "String" as const }));

  const [fields, setFields] = useState<SchemaField[]>(seededFields.length ? seededFields : [{ id: "f1", name: "", type: "String" }]);
  const [fileName, setFileName] = useState(config?.fileName ?? "");
  const [importing, setImporting] = useState(false);
  const namedFields = fields.filter((f) => f.name.trim());

  // Phone field selection (accepts legacy phoneCol/phoneField from preset configs).
  const [phoneField, setPhoneField] = useState(config?.phoneField ?? config?.phoneCol ?? "");

  const keys = namedFields.map((f) => f.name);
  const schemaOk = namedFields.length > 0;
  const phoneTypeOk = namedFields.some((f) => f.name === phoneField && f.type === "String");
  const phoneOk = !!phoneField && keys.includes(phoneField) && phoneTypeOk;

  useEffect(() => {
    const ok = schemaOk && phoneOk;
    const err = !schemaOk
      ? "Add at least one schema field"
      : !phoneField ? "Select the phone number field"
      : !keys.includes(phoneField) ? "Phone field is not in the current schema"
      : !phoneTypeOk ? "Phone field must be a String type"
      : undefined;
    mark(ok, err);
  }, [schemaOk, phoneOk, phoneField]);

  // CSV drop — simulates reading the header row only, then *merges* any new columns into
  // the existing editable rows (never clobbers what's already there).
  const onFile = (name?: string) => {
    if (!name) return;
    setFileName(name);
    setImporting(true);
    setTimeout(() => {
      setFields((prev) => {
        const existing = new Set(prev.filter((f) => f.name.trim()).map((f) => f.name));
        const additions = CSV_KEYS
          .filter((k) => !existing.has(k))
          .map((k) => ({ id: uid("f"), name: k, type: "String" as const }));
        // Drop any leading blank placeholder row if we're adding real columns.
        const base = prev.filter((f) => f.name.trim());
        const merged = [...base, ...additions];
        return merged.length ? merged : prev;
      });
      setImporting(false);
      toast.success("Columns merged", { description: `${CSV_KEYS.length} columns read · row data not stored` });
    }, 900);
  };

  return (
    <>
      {/* Section: Schema — optional CSV merge on top (the input), then the
          always-editable key → type rows it populates (the result). */}
      <Section title="Schema">
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">Define the runtime variables downstream nodes can use. Drop a CSV to populate them, or edit them by hand below.</p>

          {/* Optional CSV merge — sits above the rows it feeds into */}
          {fileName ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-[12px]">
              <div className="flex min-w-0 items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-chart-2" />
                <span className="truncate font-medium">{fileName}</span>
                <span className="shrink-0 rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {importing ? "Reading…" : "Merged"}
                </span>
              </div>
              {!readOnly && !importing && (
                <label className="shrink-0 cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                  Replace
                  <input type="file" accept=".csv" className="hidden" disabled={readOnly} onChange={(e) => onFile(e.target.files?.[0]?.name ?? "sample.csv")} />
                </label>
              )}
            </div>
          ) : (
            <label className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 px-3 text-center text-xs text-muted-foreground hover:bg-muted/60">
              <input type="file" accept=".csv" className="hidden" disabled={readOnly} onChange={(e) => onFile(e.target.files?.[0]?.name ?? "sample.csv")} />
              <FileSpreadsheet className="h-5 w-5 text-chart-2" />
              <span>Drop a CSV to populate columns (optional)</span>
            </label>
          )}

          <div className="border-t border-border/60" />

          <SchemaFieldsEditor fields={fields} setFields={setFields} readOnly={readOnly} />
          <p className="text-[11px] text-muted-foreground">Only column headers are read — row data is never parsed or stored.</p>
        </div>
      </Section>

      {/* Section: Phone Number Selection */}
      <Section title="Phone Number Selection">
        <Field label="Phone number field" required>
          <SelectLike disabled={readOnly} options={keys} placeholder={keys.length ? "Select phone field…" : "Add a schema field first"} defaultValue={phoneField} onPick={setPhoneField} />
        </Field>
        {phoneField && !phoneTypeOk && (
          <StatusBanner ok={false} title="Phone field must be a String type" detail="Change the mapped field’s data type to String." />
        )}
        <p className="text-[11px] text-muted-foreground">Required when the workflow contains Voice or WhatsApp nodes. Must be a String field.</p>
      </Section>
    </>
  );
}

/* Fallback column keys for the sample-CSV demo (only the header row is read). */
const CSV_KEYS = ["customer_id", "phone", "first_name", "last_name", "city", "tier", "loan_amount"];

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
  // Normalize every branch (new or legacy flat shape) to `{ conditions[], logic }`.
  const [branches, setBranches] = useState<PresetBranch[]>(() =>
    (config?.branches ?? [
      { id: "bA", label: "High value", conditions: [{ variable: "contact.tier", op: "equals", value: "gold" }] },
      { id: "bB", label: "Engaged", conditions: [{ variable: "wa.delivery_state", op: "equals", value: "read" }] },
    ]).map((b) => ({
      id: b.id,
      label: localizeCurrency(b.label, symbol),
      logic: b.logic ?? "AND",
      conditions: branchConditions(b),
    })),
  );
  const update = (i: number, patch: Partial<PresetBranch>) => {
    setBranches((b) => b.map((x, idx) => idx === i ? { ...x, ...patch } : x));
    mark(true);
  };
  // Update a single condition within branch `i`.
  const updateCond = (i: number, ci: number, patch: Partial<PresetCondition>) => {
    setBranches((b) => b.map((x, idx) => idx === i
      ? { ...x, conditions: (x.conditions ?? []).map((c, cidx) => cidx === ci ? { ...c, ...patch } : c) }
      : x));
    mark(true);
  };
  const addCond = (i: number) => update(i, { conditions: [...(branches[i].conditions ?? []), { variable: "", op: "equals", value: "" }] });
  const removeCond = (i: number, ci: number) => update(i, { conditions: (branches[i].conditions ?? []).filter((_, cidx) => cidx !== ci) });

  // Publish each branch (+ an always-on default/else) as a labeled output handle, and
  // persist the branch config so edits survive reopen.
  useEffect(() => {
    onChange({
      config: { ...config, branches },
      outputs: [
        ...branches.map((b, i) => ({ id: b.id, label: b.label || `Branch ${i + 1}`, kind: "branch" as const })),
        { id: "default", label: "Default / else", kind: "default" as const },
      ],
    });
  }, [branches]);

  return (
    <Section title="Branches (evaluated top → bottom)">
      <div className="space-y-2">
        {branches.map((b, i) => {
          const conds = b.conditions ?? [];
          return (
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
              {conds.map((c, ci) => (
                <div key={ci} className="space-y-1.5">
                  {ci > 0 && (
                    // AND/OR joiner — a single logic applies to the whole branch.
                    <div className="flex items-center gap-1.5 py-0.5">
                      <div className="h-px flex-1 bg-border" />
                      <div className="inline-flex overflow-hidden rounded-md border border-border">
                        {(["AND", "OR"] as const).map((op) => (
                          <button
                            key={op}
                            type="button"
                            disabled={readOnly}
                            onClick={() => update(i, { logic: op })}
                            className={cn(
                              "px-2 py-0.5 text-[10.5px] font-semibold transition-colors",
                              (b.logic ?? "AND") === op ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent",
                            )}
                          >
                            {op}
                          </button>
                        ))}
                      </div>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <div className="flex items-start gap-1.5">
                    <div className="flex-1 space-y-1.5">
                      <VariablePicker value={c.variable} disabled={readOnly} onChange={(v) => updateCond(i, ci, { variable: v })} />
                      <div className="grid grid-cols-2 gap-1.5">
                        <SelectLike disabled={readOnly} options={COMPARISON_OPERATORS} defaultValue={c.op} onPick={(v) => updateCond(i, ci, { op: v })} />
                        {RANGE_OPERATORS.has(c.op) ? (
                          // Range operators take two inclusive bounds — "[min] and [max]".
                          <div className="flex items-center gap-1">
                            <Input value={c.value} disabled={readOnly} onChange={(e) => updateCond(i, ci, { value: e.target.value })} className="h-9 text-sm" placeholder="Min" />
                            <span className="px-0.5 text-[11px] text-muted-foreground">and</span>
                            <Input value={c.value2 ?? ""} disabled={readOnly} onChange={(e) => updateCond(i, ci, { value2: e.target.value })} className="h-9 text-sm" placeholder="Max" />
                          </div>
                        ) : (
                          <Input value={c.value} disabled={readOnly || VALUELESS_OPERATORS.has(c.op)} onChange={(e) => updateCond(i, ci, { value: e.target.value })} className="h-9 text-sm" placeholder={VALUELESS_OPERATORS.has(c.op) ? "—" : "Value"} />
                        )}
                      </div>
                    </div>
                    {conds.length > 1 && (
                      <button disabled={readOnly} onClick={() => removeCond(i, ci)} title="Remove condition" className="mt-1.5 text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button disabled={readOnly} onClick={() => addCond(i)} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50">
                <Plus className="h-3 w-3" /> Add condition
              </button>
            </div>
          </div>
          );
        })}
        <Button size="sm" variant="outline" disabled={readOnly} onClick={() => setBranches((b) => [...b, { id: uid("b"), label: `Branch ${b.length + 1}`, logic: "AND", conditions: [{ variable: "", op: "equals", value: "" }] }])} className="h-8 w-full text-xs">
          <Plus className="mr-1 h-3 w-3" /> Add branch
        </Button>
        <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
          <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Each branch is a separate output on the canvas. Combine conditions with <span className="font-medium text-foreground">AND/OR</span>. Leads matching no branch leave through the always-present <span className="font-medium text-foreground">Default / else</span> output.</span>
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

/* --------------------------- API Tool Call --------------------------- */

// Direct API call inside a workflow — distinct from a Voice Agent calling a tool.
// Pick a registered tool, map its non-constant request params to upstream variables,
// and its response fields are exposed downstream as `<node>.<field>`. Validation
// rules (e.g. requiring every input mapped) are intentionally deferred to a later pass.
function ApiToolCallFields({
  config, readOnly, mark, onChange,
}: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void; onChange: (patch: Partial<WorkflowNodeData>) => void }) {
  const [handle, setHandle] = useState<string>(config?.apiTool ?? "");
  const tool = getTool(handle);
  const selected = !!tool;
  const inputMap = config?.apiInputMap ?? [];
  const mappable = (tool?.inputs ?? []).filter((i) => i.source !== "constant");
  const constants = (tool?.inputs ?? []).filter((i) => i.source === "constant");

  // Persist the chosen tool + input map to node config so the node restores on
  // reopen AND downstream nodes can resolve its outputs (see deriveNodeOutcomeVariables).
  const pickTool = (h: string) => {
    setHandle(h);
    const t = getTool(h);
    onChange({ config: { ...config, apiTool: h, apiInputMap: [] } });
    // Valid once a tool is picked; if it has mappable inputs the user still maps them,
    // but for this UI-first demo selecting the tool is enough to flip the node valid.
    mark(!!t, t ? undefined : "Select an API tool");
  };
  const setMapping = (key: string, def: string, mode?: "variable" | "constant") => {
    const existing = inputMap.find((m) => m.v === key);
    const next = inputMap.filter((m) => m.v !== key);
    // Preserve any value-remap when the source variable changes; constants don't remap.
    if (def) next.push({ v: key, def, mode, remap: mode === "constant" ? undefined : existing?.remap });
    onChange({ config: { ...config, apiTool: handle, apiInputMap: next } });
  };
  const setRemap = (key: string, remap: PresetValueRemap[]) => {
    const existing = inputMap.find((m) => m.v === key);
    const next = inputMap.filter((m) => m.v !== key);
    next.push({ v: key, def: existing?.def ?? "", mode: existing?.mode, remap: remap.length ? remap : undefined });
    onChange({ config: { ...config, apiTool: handle, apiInputMap: next } });
  };
  return (
    <>
      <Section title="API tool">
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-4">
          {/* Step 1: pick the API tool */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StepChip n={1} done={selected} />
              <Label className="flex items-center gap-1 text-[12px] font-medium text-foreground">
                API tool <span className="text-destructive">*</span>
              </Label>
            </div>
            <SelectLike
              disabled={readOnly}
              options={TOOLS.map((t) => t.handle)}
              defaultValue={config?.apiTool}
              onPick={pickTool}
              placeholder="Select an API tool…"
            />
            {tool && (
              <p className="text-[11px] text-muted-foreground">
                <span className="font-mono text-foreground">{tool.method ?? tool.type.toUpperCase()}</span>{" "}
                <span className="font-mono">{tool.url}</span> — {tool.description}
              </p>
            )}
          </div>

          <div className="border-t border-border/60" />

          {/* Step 2: map request params to upstream variables */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StepChip n={2} muted={!selected} />
              <Label className="text-[12px] font-medium text-foreground">Input mapping</Label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Map each request parameter to an upstream workflow variable (e.g. a CSV column).
            </p>
            {selected ? (
              mappable.length > 0 ? (
                <div className="space-y-2 pt-1">
                  {mappable.map((inp) => {
                    const row = inputMap.find((m) => m.v === inp.key);
                    const def = row?.def
                      ?? (inp.source === "campaign" ? `contact.${inp.value ?? inp.key}` : "");
                    // A value-remap only makes sense for a variable source (you remap the
                    // resolved value); a hardcoded constant is already the final value.
                    const isVarMapped = (row?.mode ?? "variable") === "variable" && !!def;
                    return (
                      <div key={inp.key} className="space-y-1.5">
                        <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                          <span className="truncate font-mono text-[11.5px] text-muted-foreground" title={inp.description}>
                            {inp.key}
                          </span>
                          <VariablePicker
                            defaultValue={def}
                            disabled={readOnly}
                            allowConstant
                            mode={row?.mode}
                            onChange={(v, mode) => setMapping(inp.key, v, mode)}
                          />
                        </div>
                        {isVarMapped && (
                          <div className="pl-[138px]">
                            <ValueRemapEditor
                              value={row?.remap ?? []}
                              disabled={readOnly}
                              onChange={(rm) => setRemap(inp.key, rm)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-[11.5px] text-muted-foreground">
                  All parameters are fixed at the tool — no mapping needed.
                </div>
              )
            ) : (
              <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-[11.5px] text-muted-foreground">
                Select an API tool above to map its inputs.
              </div>
            )}
          </div>
        </div>
      </Section>

      {selected && constants.length > 0 && (
        <Section title="Fixed parameters">
          <div className="rounded-xl border border-border bg-card/50 p-3 space-y-1.5">
            {constants.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-3 text-[11.5px]">
                <span className="font-mono text-muted-foreground">{c.key}</span>
                <span className="truncate font-mono text-foreground" title={c.value}>{c.value}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {selected && tool.outputs.length > 0 && (
        <Section title="Outputs → downstream variables">
          <div className="rounded-xl border border-border bg-card/50 p-3 space-y-1.5">
            <p className="text-[11px] text-muted-foreground">
              These response fields are available to later nodes as{" "}
              <span className="font-mono text-foreground">{"{node}.{field}"}</span>.
            </p>
            {tool.outputs.map((o) => (
              <div key={o.varName} className="flex items-center justify-between gap-3 text-[11.5px]">
                <span className="font-mono text-ai">{o.varName}</span>
                <span className="truncate text-muted-foreground" title={o.description}>{o.description}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

/**
 * Optional per-input value-remap (Model B): rewrites the resolved variable value
 * before the request is sent — e.g. a WhatsApp button label `Delhi` → API code
 * `ind_delhi`. Human labels still flow untouched through conditionals; the
 * transform is confined to the consuming API node. Unlisted values pass through.
 */
function ValueRemapEditor({
  value, disabled, onChange,
}: { value: PresetValueRemap[]; disabled?: boolean; onChange: (v: PresetValueRemap[]) => void }) {
  const [open, setOpen] = useState(value.length > 0);
  const rows = value;
  const update = (i: number, patch: Partial<PresetValueRemap>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => { onChange([...rows, { from: "", to: "" }]); setOpen(true); };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  if (!open && rows.length === 0) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={add}
        className="inline-flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        <ArrowLeftRight className="h-3 w-3" /> Remap values
      </button>
    );
  }
  return (
    <div className="space-y-1.5 rounded-md border border-dashed border-border bg-muted/20 p-2">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ArrowLeftRight className="h-3 w-3" /> Remap values
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input value={r.from} disabled={disabled} onChange={(e) => update(i, { from: e.target.value })} placeholder="Incoming label" className="h-7 text-[11px]" />
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <Input value={r.to} disabled={disabled} onChange={(e) => update(i, { to: e.target.value })} placeholder="Sent value" className="h-7 font-mono text-[11px]" />
          {!disabled && (
            <button type="button" onClick={() => remove(i)} title="Remove" className="shrink-0 text-muted-foreground hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" onClick={add} className="inline-flex items-center gap-1 text-[10.5px] font-medium text-primary hover:underline">
          <Plus className="h-3 w-3" /> Add row
        </button>
      )}
      <p className="text-[10px] text-muted-foreground">Values not listed pass through unchanged.</p>
    </div>
  );
}

/* --------------------------- Voice Call --------------------------- */

function VoiceCallFields({ config, readOnly, mark, onChange }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void; onChange: (patch: Partial<WorkflowNodeData>) => void }) {
  return (
    <ActionNodeShell kind="voiceCall" config={config} readOnly={readOnly} mark={mark} onChange={onChange}
      renderCore={(coreMark) => <VoiceCallCore config={config} readOnly={readOnly} mark={coreMark} onChange={onChange} />} />
  );
}

function VoiceCallCore({ config, readOnly, mark, onChange }: { config?: PresetConfig; readOnly?: boolean; mark: (v: boolean, e?: string) => void; onChange: (patch: Partial<WorkflowNodeData>) => void }) {
  const { tzLabel } = useRegion();
  const [agent, setAgent] = useState<string>(config?.agent ?? "");
  const agentSelected = !!agent;
  const varMap = config?.voiceVarMap ?? [
    { v: "{{name}}", def: "contact.first_name" },
    { v: "{{phone}}", def: "contact.phone" },
  ];
  // Tools come from the selected agent (configured in the agent builder). At the
  // node we only map each tool's inputs to a variable for this campaign.
  const agentRecord = resolveAgent(agent);
  const agentTools = (agentRecord?.tools ?? []).map(getTool).filter((t): t is NonNullable<typeof t> => !!t);
  const toolMap = config?.toolInputMap ?? [];

  // Persist the agent var-map / tool input-map so mappings (and their constant/variable
  // mode) survive reopen and downstream nodes resolve them. Both write into node config.
  const setVoiceMapping = (key: string, def: string, mode?: "variable" | "constant") => {
    const base = config?.voiceVarMap ?? varMap;
    const next = base.filter((m) => m.v !== key);
    next.push({ v: key, def, mode });
    onChange({ config: { ...config, voiceVarMap: next } });
  };
  const setToolMapping = (key: string, def: string, mode?: "variable" | "constant") => {
    const next = toolMap.filter((m) => m.v !== key);
    next.push({ v: key, def, mode });
    onChange({ config: { ...config, toolInputMap: next } });
  };
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
              options={VOICE_AGENTS.map((a) => a.name)}
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
                {varMap.map((row) => {
                  const saved = config?.voiceVarMap?.find((m) => m.v === row.v) ?? row;
                  return (
                    <div key={row.v} className="grid grid-cols-[110px_1fr] items-center gap-2">
                      <span className="font-mono text-[11.5px] text-muted-foreground">{row.v}</span>
                      <VariablePicker
                        defaultValue={saved.def}
                        disabled={readOnly}
                        allowConstant
                        mode={saved.mode}
                        onChange={(v, mode) => setVoiceMapping(row.v, v, mode)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-[11.5px] text-muted-foreground">
                Select a voice agent above to map its variables.
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Tool configuration — the selected agent's tools; map each input to a variable */}
      {agentSelected && agentTools.length > 0 && (
        <Section title="Tool configuration">
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-mono text-foreground">{agent}</span> brings {agentTools.length} tool{agentTools.length === 1 ? "" : "s"}. Map each input to a CSV or upstream variable, or let the agent decide.
            </p>
            {agentTools.map((tool) => {
              const mappable = tool.inputs.filter((i) => i.source !== "constant");
              return (
                <div key={tool.handle} className="rounded-lg border border-border bg-background/60 p-3 space-y-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[12px] font-medium text-ai">@{tool.handle}</span>
                    <span className="truncate text-[10.5px] text-muted-foreground">{tool.description}</span>
                  </div>
                  {mappable.length > 0 ? mappable.map((inp) => {
                    const v = `${tool.handle}.${inp.key}`;
                    const saved = toolMap.find((m) => m.v === v);
                    const fallback = inp.source === "campaign" ? `contact.${inp.value ?? inp.key}` : "__llm__";
                    const def = saved?.def ?? fallback;
                    return (
                      <div key={v} className="grid grid-cols-[130px_1fr] items-center gap-2">
                        <span className="truncate font-mono text-[11.5px] text-muted-foreground" title={inp.description}>{inp.key}</span>
                        <ToolInputMapPicker
                          defaultValue={def}
                          disabled={readOnly}
                          mode={saved?.mode}
                          onChange={(val, mode) => setToolMapping(v, val, mode)}
                        />
                      </div>
                    );
                  }) : (
                    <p className="text-[11px] text-muted-foreground">All inputs are fixed at the tool.</p>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

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

/** Maps a single tool input to "Let LLM decide", a CSV/upstream variable, or a constant. */
function ToolInputMapPicker({
  defaultValue, disabled, mode = "variable", onChange,
}: {
  defaultValue?: string; disabled?: boolean;
  mode?: "variable" | "constant";
  onChange?: (v: string, mode?: "variable" | "constant") => void;
}) {
  const [v, setV] = useState(defaultValue ?? "__llm__");
  const [m, setM] = useState<"variable" | "constant">(mode);
  useEffect(() => { setM(mode); }, [mode]);
  const extraVariables = useContext(ExtraVariablesContext);
  const allVariables = mergeVariables(extraVariables);
  const isCustom = v !== "__llm__" && !!v && !allVariables.some((s) => s.key === v);
  const grouped = groupVariablesBySource(allVariables);

  const pickMode = (next: "variable" | "constant") => {
    setM(next);
    const reset = next === "variable" ? "__llm__" : "";
    setV(reset);
    onChange?.(reset, next);
  };
  const toggleBtn = (
    <VarValueToggle mode={m} disabled={disabled} onPick={pickMode} size="h-8" />
  );

  if (m === "constant") {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <div className="relative min-w-0 flex-1">
          <Hash className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={v}
            disabled={disabled}
            onChange={(e) => { setV(e.target.value); onChange?.(e.target.value, "constant"); }}
            placeholder="Constant value…"
            className="h-8 min-w-0 pl-7 font-mono text-[12px]"
          />
        </div>
        {toggleBtn}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Select value={v || "__llm__"} disabled={disabled} onValueChange={(val) => { setV(val); onChange?.(val, "variable"); }}>
        <SelectTrigger className="h-8 min-w-0 font-mono text-[12px] [&>span]:truncate"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__llm__" className="text-[12px]">
            <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-ai" /> Let LLM decide</span>
          </SelectItem>
          {isCustom && (
            <SelectItem value={v} className="font-mono text-[12px]">{v} <span className="text-muted-foreground">· upstream</span></SelectItem>
          )}
          {grouped.map((g) => (
            <SelectGroup key={g.source}>
              <SelectLabel className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{g.source}</SelectLabel>
              {g.items.map((s) => (
                <SelectItem key={s.key} value={s.key} className="pl-7 font-mono text-[12px]">{s.key}</SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {toggleBtn}
    </div>
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
  const template = resolveWaTemplate(templateId);
  const templateSelected = !!template;
  // "Branchable" buttons produce a trackable handle (Quick Reply / tracked URL).
  // Phone numbers and untracked URLs are NOT branchable — those taps route through
  // the always-on "No response / continue" path.
  const hasButtons = mode !== "freeform" && !!template
    && (template.buttons ?? []).some(isBranchableButton);
  const isType1 = !hasButtons;

  // Mirror the WA template-creation page: Header and Body each carry their OWN variable
  // numbering — a template can reference {{1}} in the header AND {{1}} in the body, and
  // they're independent placeholders mapped separately. Derive each set from the selected
  // template's text, then hydrate from any saved mapping so edits persist.
  const placeholders = (text?: string) =>
    Array.from(new Set((text?.match(/\{\{\s*\d+\s*\}\}/g) ?? []).map((s) => s.replace(/\s+/g, ""))));
  const bodyVars = placeholders(template?.body);
  const headerVars = placeholders(template?.header);
  const hydrate = (vars: string[], saved?: PresetVarMap[]): PresetVarMap[] =>
    vars.map((v) => saved?.find((m) => m.v === v) ?? { v, def: "" });
  const waVarMap: PresetVarMap[] = hydrate(bodyVars, config?.waVarMap);
  const waHeaderVarMap: PresetVarMap[] = hydrate(headerVars, config?.waHeaderVarMap);

  // Persist body / header variable maps (with constant-vs-variable mode) into config.
  const setWaMapping = (scope: "body" | "header", key: string, def: string, mode?: "variable" | "constant") => {
    const field = scope === "header" ? "waHeaderVarMap" : "waVarMap";
    const base = scope === "header" ? waHeaderVarMap : waVarMap;
    const next = base.filter((m) => m.v !== key);
    next.push({ v: key, def, mode });
    onChange({ config: { ...config, [field]: next } });
  };

  useEffect(() => {
    mark(numberSelected && contentReady, numberSelected ? undefined : "Select a connected WhatsApp number");
  }, [numberSelected, contentReady]);

  // Publish the canvas handles (derived from template buttons + the Type-1 split
  // toggle) AND persist the config so the node restores correctly when reopened.
  useEffect(() => {
    const outs = mode === "freeform" ? whatsappOutputs(undefined) : whatsappOutputs(template);
    onChange({
      outputs: outs,
      config: { ...config, waMode: mode, waTemplate: templateId },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, templateId]);

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
                  {template.header && <p className="mb-1 font-semibold text-foreground">{template.header}</p>}
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
                (waHeaderVarMap.length > 0 || waVarMap.length > 0) ? (
                  <div className="space-y-4 pt-1">
                    <p className="text-[11px] text-muted-foreground">
                      Header and Body number their variables independently — map what goes into each
                      <span className="font-mono"> {"{{1}}"}</span> separately.
                    </p>
                    {/* Header variable samples */}
                    {waHeaderVarMap.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">Header sample{waHeaderVarMap.length > 1 ? "s" : ""}</p>
                        {waHeaderVarMap.map((row) => (
                          <div key={row.v} className="space-y-1">
                            <span className="font-mono text-[11px] text-muted-foreground">Header {row.v}</span>
                            <VariablePicker
                              defaultValue={row.def}
                              disabled={readOnly}
                              allowConstant
                              mode={row.mode}
                              onChange={(v, mode) => setWaMapping("header", row.v, v, mode)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Body variable samples */}
                    {waVarMap.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">Body sample{waVarMap.length > 1 ? "s" : ""}</p>
                        {waVarMap.map((row) => (
                          <div key={row.v} className="space-y-1">
                            <span className="font-mono text-[11px] text-muted-foreground">Body {row.v}</span>
                            <VariablePicker
                              defaultValue={row.def}
                              disabled={readOnly}
                              allowConstant
                              mode={row.mode}
                              onChange={(v, mode) => setWaMapping("body", row.v, v, mode)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-[11.5px] text-muted-foreground">
                    This template has no variables to map.
                  </div>
                )
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

      {/* A WhatsApp node always exposes "Replied (no button)" + "No response /
          continue" (and one handle per trackable button). Untrackable taps —
          phone numbers, untracked URLs — route through "No response / continue",
          so call it out when the template carries any. */}
      <ActionAdvanceBanner kind="whatsapp" type1={isType1} />
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
  value, defaultValue, disabled, onChange, allowConstant, mode = "variable",
}: {
  value?: string; defaultValue?: string; disabled?: boolean;
  /** Emits the value and (when `allowConstant`) whether it's a variable key or a literal. */
  onChange: (v: string, mode?: "variable" | "constant") => void;
  /** When true, a toggle lets the user enter a hardcoded constant instead of a variable. */
  allowConstant?: boolean;
  mode?: "variable" | "constant";
}) {
  const [v, setV] = useState(value ?? defaultValue ?? "");
  const [m, setM] = useState<"variable" | "constant">(mode);
  useEffect(() => { if (value !== undefined) setV(value); }, [value]);
  useEffect(() => { setM(mode); }, [mode]);
  // Outcome variables from other action nodes in the flow (e.g. `whatsapp_1.button`).
  const extraVariables = useContext(ExtraVariablesContext);
  const allVariables = mergeVariables(extraVariables);
  // Preset/upstream variables (e.g. lifetime_order_value, call_disposition) aren't in
  // the sample list — surface the current value as its own option so it still renders.
  const isCustom = !!v && !allVariables.some((s) => s.key === v);
  const grouped = groupVariablesBySource(allVariables);

  // Switch between mapping to a variable and hardcoding a constant. Clearing the value
  // on switch avoids a variable key lingering as a "constant" (and vice versa).
  const pickMode = (next: "variable" | "constant") => {
    setM(next);
    setV("");
    onChange("", next);
  };
  const toggleBtn = allowConstant ? (
    <VarValueToggle mode={m} disabled={disabled} onPick={pickMode} size="h-9" />
  ) : null;

  if (allowConstant && m === "constant") {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <div className="relative min-w-0 flex-1">
          <Hash className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={v}
            disabled={disabled}
            onChange={(e) => { setV(e.target.value); onChange(e.target.value, "constant"); }}
            placeholder="Constant value…"
            className="h-9 min-w-0 pl-7 font-mono text-[12px]"
          />
        </div>
        {toggleBtn}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="relative min-w-0 flex-1">
        <Variable className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 text-ai" />
        <Select value={v || undefined} disabled={disabled} onValueChange={(val) => { setV(val); onChange(val, "variable"); }}>
          <SelectTrigger className="h-9 min-w-0 pl-7 font-mono text-[12px] [&>span]:truncate">
            <SelectValue placeholder="Select variable…" />
          </SelectTrigger>
          <SelectContent>
            {isCustom && (
              <SelectItem value={v} className="font-mono text-[12px]">
                {v} <span className="text-muted-foreground">· upstream</span>
              </SelectItem>
            )}
            {grouped.map((g) => (
              <SelectGroup key={g.source}>
                <SelectLabel className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.source}
                </SelectLabel>
                {g.items.map((s) => (
                  // Full key kept as the item text so the trigger echoes `whatsapp_1.button`
                  // (v1 consistency); the serial header above provides the level-1 grouping.
                  <SelectItem key={s.key} value={s.key} className="pl-7 font-mono text-[12px]">
                    {s.key}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
      {toggleBtn}
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
function ActionAdvanceBanner({ kind, type1 }: { kind: ActionKind; type1?: boolean }) {
  const text =
    kind === "voiceCall"
      ? "Leads advance when the call concludes or retries are exhausted. Branch on the outcome with a Conditional node downstream."
      : kind === "sms"
        ? "Leads advance once the message is sent. Branch on the outcome with a Conditional node downstream."
        : type1
          ? "Always two outputs: “Replied (no button)” and “No response / continue” (24h session expiry + any untrackable tap). Wire both."
          : "Each trackable button is its own output, plus “Replied (no button)” and “No response / continue”. Phone numbers and untracked URLs aren’t trackable — those taps route through “No response / continue”. Wire every output.";
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
