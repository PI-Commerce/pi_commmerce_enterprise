import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { WizardShell } from "@/components/app/WizardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronRight, Plus, Trash2, Upload, Save, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agents/tools/new")({
  component: RegisterAction,
  head: () => ({
    meta: [
      { title: "Register action · Pi Commerce Enterprise" },
      { name: "description", content: "Register an HTTP API action in the tool registry." },
    ],
  }),
});

/* --------------------------------------------------------- */
/* Types & data                                              */
/* --------------------------------------------------------- */

type DataType = "String" | "Number" | "Boolean" | "Object" | "Array";
type FieldType = "Variable" | "Constant";
type SchemaField = {
  id: string;
  key: string;
  dataType: DataType;
  type: FieldType;
  value: string;
  description: string;
  transformation: string;
};
type AuthMode = "none" | "jwt" | "rsa";
type TransformType = "Constant" | "Expression" | "Template";
type CustomOutputField = {
  id: string;
  key: string;
  description: string;
  transformType: TransformType;
  logic: string;
};
type SchemaListKey = "headers" | "requestBody" | "queryParams" | "pathParams" | "output";

type ActionDraft = {
  name: string;
  description: string;
  actionType: string;
  httpUri: string;
  connectTimeout: string;
  responseTimeout: string;
  auth: AuthMode;
  jwtToken: string;
  rsaKey: string;
  headers: SchemaField[];
  requestBody: SchemaField[];
  queryParams: SchemaField[];
  pathParams: SchemaField[];
  output: SchemaField[];
  customOutput: CustomOutputField[];
};

const DATA_TYPES: DataType[] = ["String", "Number", "Boolean", "Object", "Array"];
const FIELD_TYPES: FieldType[] = ["Variable", "Constant"];
const TRANSFORM_TYPES: TransformType[] = ["Constant", "Expression", "Template"];
const ACTION_TYPES = ["HTTP API", "gRPC", "Internal function"] as const;

const STEPS = [
  { id: "details", label: "Details", hint: "Name & type" },
  { id: "definition", label: "Definition", hint: "Endpoint & auth" },
  { id: "inputschema", label: "Input Schema", hint: "Request fields" },
  { id: "outputschema", label: "Output Schema", hint: "Response mapping" },
] as const;
type TabId = (typeof STEPS)[number]["id"];

let fieldSeq = 0;
const newField = (): SchemaField => ({
  id: `f_${++fieldSeq}_${Date.now().toString(36)}`,
  key: "",
  dataType: "String",
  type: "Constant",
  value: "",
  description: "",
  transformation: "",
});
const newCustomField = (): CustomOutputField => ({
  id: `c_${++fieldSeq}_${Date.now().toString(36)}`,
  key: "",
  description: "",
  transformType: "Constant",
  logic: "",
});

const INITIAL: ActionDraft = {
  name: "",
  description: "",
  actionType: "HTTP API",
  httpUri: "",
  connectTimeout: "20000",
  responseTimeout: "20000",
  auth: "none",
  jwtToken: "",
  rsaKey: "",
  headers: [],
  requestBody: [],
  queryParams: [],
  pathParams: [],
  output: [],
  customOutput: [],
};

/* --------------------------------------------------------- */
/* Wizard shell                                              */
/* --------------------------------------------------------- */

function RegisterAction() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ActionDraft>(INITIAL);
  const [tab, setTab] = useState<TabId>("details");

  const idx = STEPS.findIndex((t) => t.id === tab);
  const isLast = idx === STEPS.length - 1;

  const set = <K extends keyof ActionDraft>(key: K, value: ActionDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const addField = (listKey: SchemaListKey) =>
    setDraft((d) => ({ ...d, [listKey]: [...d[listKey], newField()] }));
  const updateField = (listKey: SchemaListKey, id: string, patch: Partial<SchemaField>) =>
    setDraft((d) => ({
      ...d,
      [listKey]: d[listKey].map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  const removeField = (listKey: SchemaListKey, id: string) =>
    setDraft((d) => ({ ...d, [listKey]: d[listKey].filter((f) => f.id !== id) }));

  const addCustomField = () =>
    setDraft((d) => ({ ...d, customOutput: [...d.customOutput, newCustomField()] }));
  const updateCustomField = (id: string, patch: Partial<CustomOutputField>) =>
    setDraft((d) => ({
      ...d,
      customOutput: d.customOutput.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  const removeCustomField = (id: string) =>
    setDraft((d) => ({ ...d, customOutput: d.customOutput.filter((f) => f.id !== id) }));

  const canAdvance = (): boolean => {
    if (tab === "details") return draft.name.trim().length > 1;
    return true;
  };

  const goTo = (i: number) => setTab(STEPS[Math.max(0, Math.min(STEPS.length - 1, i))].id);
  const back = () => goTo(idx - 1);
  const next = () => {
    if (canAdvance()) goTo(idx + 1);
  };

  const saveDraft = () => {
    toast.success(`${draft.name.trim() || "Untitled action"} saved as draft`, {
      description: "You can finish registering it later.",
    });
    navigate({ to: "/agents", search: { tab: "tools" } });
  };

  const register = () => {
    toast.success(`${draft.name.trim() || "New action"} registered`, {
      description: `${draft.actionType} action is available in the tool registry.`,
    });
    navigate({ to: "/agents", search: { tab: "tools" } });
  };

  return (
    <WizardShell
      eyebrow="Register action"
      breadcrumb={
        <>
          <Link to="/agents" search={{ tab: "tools" }} className="text-muted-foreground hover:text-foreground">Agents</Link>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
          <Link to="/agents" search={{ tab: "tools" }} className="text-muted-foreground hover:text-foreground">Tools</Link>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span className="font-medium">{draft.name.trim() || "Register action"}</span>
        </>
      }
      headerActions={
        <>
          <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
            <Link to="/agents" search={{ tab: "tools" }}>Cancel</Link>
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={saveDraft}>
            <Save className="h-3.5 w-3.5" /> Save as draft
          </Button>
        </>
      }
      steps={STEPS.map((s) => ({ id: s.id, label: s.label, hint: s.hint }))}
      currentIndex={idx}
      onStepSelect={goTo}
      onBack={back}
      footerActions={
        isLast ? (
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={draft.name.trim().length < 2} onClick={register}>
            <Plus className="h-3.5 w-3.5" /> Register action
          </Button>
        ) : (
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!canAdvance()} onClick={next}>
            Continue <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )
      }
    >
      {tab === "details" && <DetailsTab draft={draft} set={set} />}
      {tab === "definition" && <DefinitionTab draft={draft} set={set} />}
      {tab === "inputschema" && (
        <InputSchemaTab draft={draft} addField={addField} updateField={updateField} removeField={removeField} />
      )}
      {tab === "outputschema" && (
        <OutputSchemaTab
          draft={draft}
          addField={addField}
          updateField={updateField}
          removeField={removeField}
          addCustomField={addCustomField}
          updateCustomField={updateCustomField}
          removeCustomField={removeCustomField}
        />
      )}
    </WizardShell>
  );
}

/* --------------------------------------------------------- */
/* Tab 1 — Details                                           */
/* --------------------------------------------------------- */

function DetailsTab({
  draft, set,
}: {
  draft: ActionDraft;
  set: <K extends keyof ActionDraft>(key: K, value: ActionDraft[K]) => void;
}) {
  return (
    <>
      <TabHeading title="Action Details" desc="Identify the action." />

      <FormField label="Action name" required>
        <Input
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. hotel_update"
          className="h-9 font-mono text-sm"
        />
      </FormField>

      <FormField label="Description">
        <Textarea
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Update details of a hotel booking"
          className="min-h-[72px] text-sm"
        />
      </FormField>

      <FormField label="Action type">
        <Select value={draft.actionType} onValueChange={(v) => set("actionType", v)}>
          <SelectTrigger className="h-9 w-full max-w-xs text-sm"><SelectValue placeholder="Select action type" /></SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-sm">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    </>
  );
}

/* --------------------------------------------------------- */
/* Tab 2 — Definition                                        */
/* --------------------------------------------------------- */

function DefinitionTab({
  draft, set,
}: {
  draft: ActionDraft;
  set: <K extends keyof ActionDraft>(key: K, value: ActionDraft[K]) => void;
}) {
  const [sub, setSub] = useState<"common" | "producer">("common");

  return (
    <>
      <div className="flex items-center justify-between">
        <TabHeading title="Action Definition" desc="Endpoint, timeouts and authorization." />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => toast.info("Import", { description: "Paste an OpenAPI / cURL definition to auto-fill mapping." })}
        >
          <Upload className="h-3.5 w-3.5" /> Import
        </Button>
      </div>

      {/* Input mapping · Common / Producer */}
      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Input Mapping</p>
        <SubTabs
          tabs={[{ id: "common", label: "Common" }, { id: "producer", label: "Producer" }]}
          value={sub}
          onChange={(v) => setSub(v as typeof sub)}
        />

        {sub === "common" ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-1/3 px-3 py-2 text-left font-medium">Keys</th>
                  <th className="px-3 py-2 text-left font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <KeyValueRow label="httpUri" value={draft.httpUri} placeholder="https://api.example.com/v1/hotel/update" mono onChange={(v) => set("httpUri", v)} />
                <KeyValueRow label="connectTimeout" value={draft.connectTimeout} onChange={(v) => set("connectTimeout", v)} />
                <KeyValueRow label="responseTimeout" value={draft.responseTimeout} onChange={(v) => set("responseTimeout", v)} />
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-card/40 px-4 py-8 text-center text-[12px] text-muted-foreground">
            No producer-specific configuration for this action.
          </div>
        )}
      </div>

      {/* Authorization */}
      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Authorization</p>
        <RadioGroup value={draft.auth} onValueChange={(v) => set("auth", v as AuthMode)} className="grid grid-cols-3 gap-2">
          {([
            ["none", "No Auth"],
            ["jwt", "JWT Bearer"],
            ["rsa", "RSA Digital Signature"],
          ] as [AuthMode, string][]).map(([val, label]) => (
            <label
              key={val}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] transition-colors",
                draft.auth === val ? "border-foreground bg-accent" : "border-border hover:bg-accent/40",
              )}
            >
              <RadioGroupItem value={val} />
              {label}
            </label>
          ))}
        </RadioGroup>

        {draft.auth === "none" && (
          <p className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-[12px] text-muted-foreground">
            No authentication required for this endpoint.
          </p>
        )}
        {draft.auth === "jwt" && (
          <FormField label="Bearer token">
            <Input
              value={draft.jwtToken}
              onChange={(e) => set("jwtToken", e.target.value)}
              type="password"
              placeholder="Paste JWT or reference a secret"
              className="h-9 font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">Stored encrypted in your workspace vault — never exposed to the model.</p>
          </FormField>
        )}
        {draft.auth === "rsa" && (
          <FormField label="Private key (PEM)">
            <Textarea
              value={draft.rsaKey}
              onChange={(e) => set("rsaKey", e.target.value)}
              placeholder="-----BEGIN PRIVATE KEY-----"
              className="min-h-[96px] font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">Used to sign each request. Stored encrypted in your workspace vault.</p>
          </FormField>
        )}
      </div>
    </>
  );
}

/* --------------------------------------------------------- */
/* Tab 3 — Input Schema                                      */
/* --------------------------------------------------------- */

const INPUT_SUBTABS: { id: SchemaListKey; label: string }[] = [
  { id: "headers", label: "Headers" },
  { id: "requestBody", label: "Request Body" },
  { id: "queryParams", label: "Query Parameters" },
  { id: "pathParams", label: "Path Parameters" },
];

const SUBTAB_COPY: Record<string, string> = {
  headers: "Key-value headers sent with every request.",
  requestBody: "Fields serialized into the request body.",
  queryParams: "Parameters appended to the request URL.",
  pathParams: "Values interpolated into the path template.",
};

function InputSchemaTab({
  draft, addField, updateField, removeField,
}: {
  draft: ActionDraft;
  addField: (k: SchemaListKey) => void;
  updateField: (k: SchemaListKey, id: string, patch: Partial<SchemaField>) => void;
  removeField: (k: SchemaListKey, id: string) => void;
}) {
  const [sub, setSub] = useState<SchemaListKey>("headers");

  return (
    <>
      <TabHeading title="Input Schema" desc="Define the fields the agent supplies when calling this action." />
      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Input Mapping</p>
        <SubTabs
          tabs={INPUT_SUBTABS.map((t) => ({ id: t.id, label: t.label, count: draft[t.id].length }))}
          value={sub}
          onChange={(v) => setSub(v as SchemaListKey)}
        />
        <FieldTable
          rows={draft[sub]}
          description={SUBTAB_COPY[sub]}
          onAdd={() => addField(sub)}
          onChange={(id, patch) => updateField(sub, id, patch)}
          onRemove={(id) => removeField(sub, id)}
        />
      </div>
    </>
  );
}

/* --------------------------------------------------------- */
/* Interactive field table                                   */
/* --------------------------------------------------------- */

function FieldTable({
  title, description, rows, onAdd, onChange, onRemove,
  variant = "input", addLabel = "Add Field", headerAction,
}: {
  title?: string;
  description?: string;
  rows: SchemaField[];
  onAdd: () => void;
  onChange: (id: string, patch: Partial<SchemaField>) => void;
  onRemove: (id: string) => void;
  variant?: "input" | "output";
  addLabel?: string;
  headerAction?: React.ReactNode;
}) {
  const showType = variant === "input";
  const colCount = showType ? 8 : 7;
  return (
    <div className="space-y-2.5">
      {(title || headerAction) && (
        <div className="flex items-center justify-between gap-3">
          {title ? <TabHeading title={title} desc={description} /> : <span />}
          {headerAction}
        </div>
      )}
      {!title && description && <p className="text-[12px] text-muted-foreground">{description}</p>}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className={cn("w-full text-sm", showType ? "min-w-[760px]" : "min-w-[680px]")}>
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <th className="w-8 px-2 py-2" />
              <th className="px-2 py-2 text-left font-medium">Keys</th>
              <th className="px-2 py-2 text-left font-medium">Data type</th>
              {showType && <th className="px-2 py-2 text-left font-medium">Type</th>}
              <th className="px-2 py-2 text-left font-medium">Value</th>
              <th className="px-2 py-2 text-left font-medium">Description</th>
              <th className="px-2 py-2 text-left font-medium">Transformation</th>
              <th className="w-9 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-8 text-center text-[12px] text-muted-foreground">
                  No fields yet. Add one to define the schema.
                </td>
              </tr>
            ) : (
              rows.map((f) => (
                <tr key={f.id} className="align-middle">
                  <td className="px-2 py-1.5 text-center">
                    <Checkbox className="translate-y-0.5" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={f.key}
                      onChange={(e) => onChange(f.id, { key: e.target.value })}
                      placeholder="Key name"
                      className="h-8 min-w-[120px] font-mono text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select value={f.dataType} onValueChange={(v) => onChange(f.id, { dataType: v as DataType })}>
                      <SelectTrigger className="h-8 w-[104px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DATA_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  {showType && (
                    <td className="px-2 py-1.5">
                      <Select value={f.type} onValueChange={(v) => onChange(f.id, { type: v as FieldType })}>
                        <SelectTrigger className="h-8 w-[108px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    <Input
                      value={f.value}
                      onChange={(e) => onChange(f.id, { value: e.target.value })}
                      placeholder={variant === "output" ? "$.response.path" : f.type === "Variable" ? "variable_name" : "Enter value"}
                      className="h-8 min-w-[120px] font-mono text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={f.description}
                      onChange={(e) => onChange(f.id, { description: e.target.value })}
                      placeholder="Add"
                      className="h-8 min-w-[120px] text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={f.transformation}
                      onChange={(e) => onChange(f.id, { transformation: e.target.value })}
                      placeholder="Add"
                      className="h-8 min-w-[110px] font-mono text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => onRemove(f.id)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Remove field"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </Button>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Tab 4 — Output Schema                                      */
/* --------------------------------------------------------- */

function OutputSchemaTab({
  draft, addField, updateField, removeField,
  addCustomField, updateCustomField, removeCustomField,
}: {
  draft: ActionDraft;
  addField: (k: SchemaListKey) => void;
  updateField: (k: SchemaListKey, id: string, patch: Partial<SchemaField>) => void;
  removeField: (k: SchemaListKey, id: string) => void;
  addCustomField: () => void;
  updateCustomField: (id: string, patch: Partial<CustomOutputField>) => void;
  removeCustomField: (id: string) => void;
}) {
  return (
    <>
      <TabHeading title="Output Schema" desc="Map fields from the API response into variables the agent can use." />

      <FieldTable
        title="Output Mapping"
        description="Extract values from the response payload by path."
        rows={draft.output}
        variant="output"
        addLabel="Add Output Field"
        headerAction={
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 text-xs"
            onClick={() => toast.info("Fetch Live Response", { description: "Call the endpoint once to infer the response shape." })}
          >
            <Zap className="h-3.5 w-3.5" /> Fetch Live Response
          </Button>
        }
        onAdd={() => addField("output")}
        onChange={(id, patch) => updateField("output", id, patch)}
        onRemove={(id) => removeField("output", id)}
      />

      <CustomOutputTable
        rows={draft.customOutput}
        onAdd={addCustomField}
        onChange={updateCustomField}
        onRemove={removeCustomField}
      />
    </>
  );
}

function CustomOutputTable({
  rows, onAdd, onChange, onRemove,
}: {
  rows: CustomOutputField[];
  onAdd: () => void;
  onChange: (id: string, patch: Partial<CustomOutputField>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2.5 pt-2">
      <TabHeading title="Custom Output Mapping" desc="Derive new fields with transformation logic." />

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <th className="w-8 px-2 py-2" />
              <th className="px-2 py-2 text-left font-medium">Keys</th>
              <th className="px-2 py-2 text-left font-medium">Description</th>
              <th className="px-2 py-2 text-left font-medium">Transformation type</th>
              <th className="px-2 py-2 text-left font-medium">Transformation logic</th>
              <th className="w-9 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-muted-foreground">
                  No custom fields yet. Add one to compute a derived value.
                </td>
              </tr>
            ) : (
              rows.map((f) => (
                <tr key={f.id} className="align-middle">
                  <td className="px-2 py-1.5 text-center">
                    <Checkbox className="translate-y-0.5" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={f.key}
                      onChange={(e) => onChange(f.id, { key: e.target.value })}
                      placeholder="Key name"
                      className="h-8 min-w-[120px] font-mono text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={f.description}
                      onChange={(e) => onChange(f.id, { description: e.target.value })}
                      placeholder="Add"
                      className="h-8 min-w-[120px] text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select value={f.transformType} onValueChange={(v) => onChange(f.id, { transformType: v as TransformType })}>
                      <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRANSFORM_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={f.logic}
                      onChange={(e) => onChange(f.id, { logic: e.target.value })}
                      placeholder="Enter transformation logic"
                      className="h-8 min-w-[160px] font-mono text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => onRemove(f.id)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Remove field"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" /> Add Custom Output Field
      </Button>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Small shared pieces                                       */
/* --------------------------------------------------------- */

function TabHeading({ title, desc }: { title: string; desc?: string }) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {desc && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{desc}</p>}
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function SubTabs({
  tabs, value, onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-secondary/30 p-1">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors",
              active ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-accent text-foreground" : "bg-muted text-muted-foreground")}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function KeyValueRow({
  label, value, placeholder, mono, onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <tr>
      <td className="px-3 py-1.5 align-middle font-mono text-[12px] text-muted-foreground">{label}</td>
      <td className="px-3 py-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn("h-8 text-xs", mono && "font-mono")}
        />
      </td>
    </tr>
  );
}
