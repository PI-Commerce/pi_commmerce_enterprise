import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  ChevronLeft, ChevronRight, ChevronDown, Trash2, Plus, Play, Import,
  AlertTriangle, CheckCircle2, Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getTool, type ToolDef, type ToolSource, type ToolDataType,
  type BodyRoot, type BodyNode, type TestResponse,
} from "@/lib/tool-registry";
import {
  emptyBody, makeLeaf, makeObject, makeArray, serializeBody, parseBody, flattenBody,
} from "@/lib/tool-body";
import { parseCurl } from "@/lib/curl-parse";

export const Route = createFileRoute("/agents/tools/new")({
  component: ToolEditor,
  validateSearch: (s: Record<string, unknown>): { tool?: string } => ({
    tool: typeof s.tool === "string" ? s.tool : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Tool · Pi Agents FinServ" },
      { name: "description", content: "Register an HTTP API tool in the registry." },
    ],
  }),
});

/* --------------------------------------------------------- */
/* Types & seed                                              */
/* --------------------------------------------------------- */

const DATA_TYPES: ToolDataType[] = ["String", "Number", "Boolean", "Object", "Array"];
const LEAF_TYPES: ToolDataType[] = ["String", "Number", "Boolean"];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Source options shown to users when they map a param. The legacy `agent`
 * value is intentionally absent — new tools only bind to campaign columns or
 * hard-coded constants. Rows migrated from seed data with `source: "agent"`
 * fall back to "constant" with an empty value + an inline warning pill (see
 * {@link SourceSelect}), so the user is nudged to re-map explicitly.
 */
const SOURCE_OPTIONS: { value: Exclude<ToolSource, "agent">; label: string }[] = [
  { value: "campaign", label: "Campaign variable" },
  { value: "constant", label: "Constant" },
];

type EditorInput = {
  id: string;
  key: string;
  dataType: ToolDataType;
  source: ToolSource;
  value: string;
  description: string;
};
type EditorOutput = { id: string; path: string; varName: string; description: string; dataType?: ToolDataType };
type PathMeta = { source: ToolSource; dataType: ToolDataType; value: string; description: string };

type JwtAlg = "HS256" | "HS512" | "RS256" | "RS512";
type JwtFieldType = "Variable" | "JWT" | "Bearer" | "Constant" | "Random Generator" | "Secret Manager" | "SSO";
type JwtClaim = { id: string; key: string; dataType: ToolDataType; type: JwtFieldType; value: string; description: string };
type JwtConfig = {
  alg: JwtAlg;
  addTo: "header" | "query";
  keyName: string;
  secret: string;
  claims: JwtClaim[];
  headerFields: JwtClaim[];
};

type ToolDraft = {
  handle: string;
  description: string;
  method: string;
  url: string;
  connectTimeout: string;
  responseTimeout: string;
  auth: "none" | "jwt";
  jwt: JwtConfig;
  headers: EditorInput[];
  query: EditorInput[];
  body: BodyRoot;
  pathMeta: Record<string, PathMeta>;
  outputs: EditorOutput[];
  testResponse?: TestResponse;
};

let seq = 0;
const uid = (p: string) => `${p}_${++seq}_${Date.now().toString(36)}`;
const newInput = (over: Partial<EditorInput> = {}): EditorInput =>
  ({ id: uid("in"), key: "", dataType: "String", source: "constant", value: "", description: "", ...over });

const DEFAULT_JWT: JwtConfig = { alg: "HS256", addTo: "header", keyName: "Authorization", secret: "", claims: [], headerFields: [] };

function blankDraft(): ToolDraft {
  return {
    handle: "", description: "", method: "POST", url: "",
    connectTimeout: "1000", responseTimeout: "1000",
    auth: "none", jwt: { ...DEFAULT_JWT },
    headers: [], query: [], body: emptyBody("object"), pathMeta: {}, outputs: [],
  };
}

/**
 * Seed the editor from a registry tool when editing an existing one.
 *
 * Legacy tools store body fields flat inside `inputs` (with `in: "body"`).
 * We migrate those into the new tree via {@link parseBody} — same call path
 * the cURL import uses, so behaviour is consistent.
 */
function draftFromTool(t: ToolDef): ToolDraft {
  const d = blankDraft();
  d.handle = t.handle;
  d.description = t.description;
  d.method = t.method ?? "POST";
  d.url = t.url ?? "";
  d.auth = t.auth === "jwt" ? "jwt" : "none";
  d.testResponse = t.mockResponse;
  for (const inp of t.inputs) {
    if (inp.in === "path") {
      d.pathMeta[inp.key] = { source: inp.source, dataType: inp.dataType, value: inp.value ?? "", description: inp.description };
    } else if (inp.in === "header") {
      d.headers.push(newInput({ key: inp.key, dataType: inp.dataType, source: inp.source, value: inp.value ?? "", description: inp.description }));
    } else if (inp.in === "query") {
      d.query.push(newInput({ key: inp.key, dataType: inp.dataType, source: inp.source, value: inp.value ?? "", description: inp.description }));
    }
    // body fields handled below via t.body OR legacy inputs
  }
  if (t.body) {
    d.body = t.body;
  } else {
    // Migrate flat body inputs → tree.
    const bodyLeaves = t.inputs.filter((i) => i.in === "body");
    if (bodyLeaves.length) {
      d.body = {
        rootType: "object",
        nodes: bodyLeaves.map((i) =>
          makeLeaf({
            key: i.key,
            dataType: (LEAF_TYPES as ToolDataType[]).includes(i.dataType) ? i.dataType : "String",
            source: i.source,
            value: i.value ?? "",
            description: i.description,
          }),
        ),
      };
    }
  }
  d.outputs = t.outputs.map((o) => ({ id: uid("out"), path: o.path, varName: o.varName, dataType: o.dataType, description: o.description }));
  return d;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "_");

/* --------------------------------------------------------- */
/* Page                                                      */
/* --------------------------------------------------------- */

function ToolEditor() {
  const navigate = useNavigate();
  const { tool: editHandle } = Route.useSearch();
  const existing = editHandle ? getTool(editHandle) : undefined;
  // Editable draft: initialised from the registry when editing an existing
  // tool, else from `blankDraft()` for a brand-new tool. Field changes flow
  // through `set(key, value)`; the Save button toasts + navigates back. There
  // is no runtime persistence in v1 — the TOOLS constant stays untouched — so
  // edits/creates survive only until the page reloads.
  const [draft, setDraftState] = useState<ToolDraft>(() => (existing ? draftFromTool(existing) : blankDraft()));

  const set = <K extends keyof ToolDraft>(key: K, value: ToolDraft[K]) => {
    setDraftState((d) => ({ ...d, [key]: value }));
  };
  const patch = (p: Partial<ToolDraft>) => setDraftState((d) => ({ ...d, ...p }));

  const pathKeys = useMemo(
    () => Array.from(draft.url.matchAll(/\{([^}]+)\}/g)).map((m) => m[1]),
    [draft.url],
  );

  const isNew = !existing;

  const handleSave = () => {
    if (!draft.handle.trim()) {
      toast.error("Tool name is required");
      return;
    }
    toast.success(isNew ? "Tool created" : "Tool saved", {
      description: draft.handle,
    });
    navigate({ to: "/agents", search: { tab: "tools" } });
  };

  const applyCurl = (parsed: ReturnType<typeof parseCurl>) => {
    const nextHeaders: EditorInput[] = parsed.headers.map((h) =>
      newInput({ key: h.key, dataType: "String", source: "constant", value: h.value, description: "" }),
    );
    const nextQuery: EditorInput[] = parsed.query.map((q) =>
      newInput({ key: q.key, dataType: "String", source: "constant", value: q.value, description: "" }),
    );
    patch({
      method: parsed.method,
      url: parsed.url,
      headers: nextHeaders,
      query: nextQuery,
      body: parsed.body !== undefined ? parseBody(parsed.body) : draft.body,
    });
    toast.success("cURL imported", {
      description: `${parsed.method} · ${nextHeaders.length}h · ${nextQuery.length}q · ${parsed.body ? "body" : "no body"}`,
    });
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/agents" search={{ tab: "tools" }}
            className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Tools</span>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="truncate font-mono text-[13.5px] font-medium">
            {draft.handle.trim() || (isNew ? "New tool" : "Tool")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => navigate({ to: "/agents", search: { tab: "tools" } })}
          >
            Cancel
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleSave}>
            {isNew ? "Create tool" : "Save changes"}
          </Button>
        </div>
      </header>

      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-8">
        <fieldset className="mx-auto block w-full max-w-3xl min-w-0 space-y-5 border-0 p-0">
        <style>{`
          .tool-view-fieldset,
          .tool-view-fieldset button:disabled,
          .tool-view-fieldset input:disabled,
          .tool-view-fieldset select:disabled,
          .tool-view-fieldset textarea:disabled,
          .tool-view-fieldset [data-radix-select-trigger] { cursor: not-allowed !important; }
          .tool-view-fieldset .row-remove:hover { background: transparent !important; color: inherit !important; }
          .tool-view-fieldset .subtabs [role="tab"] { cursor: pointer !important; }
        `}</style>

          {/* 1 · Tool Details */}
          <Card title="Tool Details" desc="Identify the tool. The name is how agents reference it in a prompt.">
            <FormField label="Tool name" required>
              <Input
                value={draft.handle}
                onChange={(e) => set("handle", slug(e.target.value))}
                placeholder="e.g. order_lookup"
                className="h-9 font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">Lowercase, no spaces — referenced as <span className="font-mono">@{draft.handle || "tool_name"}</span>.</p>
            </FormField>
            <FormField label="Description">
              <Textarea
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Look up a customer's latest order and delivery status"
                className="min-h-[60px] text-sm"
              />
            </FormField>
          </Card>

          {/* 2 · Definition */}
          <Card
            title="Definition"
            desc="Endpoint and timeouts."
            action={<CurlImportButton onApply={applyCurl} />}
          >
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Endpoint</Label>
                <div className="flex gap-2">
                  <Select value={draft.method} onValueChange={(v) => set("method", v)}>
                    <SelectTrigger className="h-9 w-28 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => <SelectItem key={m} value={m} className="text-sm">{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    value={draft.url}
                    onChange={(e) => set("url", e.target.value)}
                    placeholder="https://api.example.com/v1/orders/{order_id}"
                    className="h-9 flex-1 font-mono text-xs"
                  />
                </div>
                {pathKeys.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Path parameters: {pathKeys.map((k) => <span key={k} className="mr-1 font-mono">{`{${k}}`}</span>)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Connect timeout (ms)"><Input value={draft.connectTimeout} onChange={(e) => set("connectTimeout", e.target.value)} className="h-9 font-mono text-xs" /></FormField>
                <FormField label="Response timeout (ms)"><Input value={draft.responseTimeout} onChange={(e) => set("responseTimeout", e.target.value)} className="h-9 font-mono text-xs" /></FormField>
              </div>
          </Card>

          {/* 3 · Input Schema */}
          <Card title="Input Schema" desc="Parameters the tool sends. Each is mapped from the campaign or fixed as a constant.">
            <InputSchema
              draft={draft}
              setFlatRows={(where, rows) => set(where, rows)}
              setBody={(body) => set("body", body)}
            />
          </Card>

          {/* 4 · Test — pick which response fields become downstream variables */}
          <TestSection
            draft={draft}
            onTestComplete={(r) => set("testResponse", r)}
            onOutputsChange={(o) => set("outputs", o)}
          />

          {/* 5 · Output Schema */}
          <OutputSchema
            outputs={draft.outputs}
            onChange={(o) => set("outputs", o)}
          />
        </fieldset>
      </section>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Input schema (Headers / Body / Query tabs)                */
/* --------------------------------------------------------- */

type FlatTab = "headers" | "query";
const IN_TABS: { id: FlatTab | "body"; label: string }[] = [
  { id: "headers", label: "Headers" },
  { id: "body", label: "Body" },
  { id: "query", label: "Query" },
];

function InputSchema({
  draft, setFlatRows, setBody,
}: {
  draft: ToolDraft;
  setFlatRows: (where: FlatTab, rows: EditorInput[]) => void;
  setBody: (body: BodyRoot) => void;
}) {
  const [tab, setTab] = useState<"headers" | "body" | "query">("body");

  const countFor = (id: string) =>
    id === "body" ? draft.body.nodes.length :
    id === "headers" ? draft.headers.length :
    draft.query.length;

  return (
    <div className="space-y-4">
      <SubTabs
        tabs={IN_TABS.map((t) => ({ id: t.id, label: t.label, count: countFor(t.id) }))}
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
      />
      {tab === "body" ? (
        <BodyEditor value={draft.body} onChange={setBody} />
      ) : (
        <FlatParamTable
          tab={tab}
          rows={tab === "headers" ? draft.headers : draft.query}
          onChange={(rows) => setFlatRows(tab, rows)}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------- */
/* Flat param tables (Headers, Query)                         */
/* --------------------------------------------------------- */

function FlatParamTable({
  tab, rows, onChange,
}: { tab: FlatTab; rows: EditorInput[]; onChange: (rows: EditorInput[]) => void }) {
  const update = (id: string, p: Partial<EditorInput>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const add = () => onChange([...rows, newInput()]);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-2 text-left font-medium">Key</th>
              <th className="px-2 py-2 text-left font-medium">Type</th>
              <th className="px-2 py-2 text-left font-medium">Source</th>
              <th className="px-2 py-2 text-left font-medium">Value / column</th>
              <th className="px-2 py-2 text-left font-medium">Description</th>
              <th className="w-9 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-7 text-center text-[12px] text-muted-foreground">No {tab} params.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="align-middle">
                <td className="px-2 py-1.5"><Input value={r.key} onChange={(e) => update(r.id, { key: e.target.value })} placeholder="key" className="h-8 min-w-[110px] font-mono text-xs" /></td>
                <td className="px-2 py-1.5">
                  <Select value={r.dataType} onValueChange={(v) => update(r.id, { dataType: v as ToolDataType })}>
                    <SelectTrigger className="h-8 w-[96px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{LEAF_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-1.5"><SourceSelect value={r.source} onChange={(source) => update(r.id, { source })} /></td>
                <td className="px-2 py-1.5">
                  <Input
                    value={r.value}
                    onChange={(e) => update(r.id, { value: e.target.value })}
                    placeholder={r.source === "constant" ? "fixed value" : "audience column"}
                    className="h-8 min-w-[120px] font-mono text-xs"
                  />
                </td>
                <td className="px-2 py-1.5"><Input value={r.description} onChange={(e) => update(r.id, { description: e.target.value })} placeholder="Description" className="h-8 min-w-[120px] text-xs" /></td>
                <td className="px-2 py-1.5 text-center">
                  <button onClick={() => remove(r.id)} className="row-remove rounded-md p-1.5 text-muted-foreground" title="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="h-7 gap-1 text-[11.5px]" onClick={add}>
        <Plus className="h-3 w-3" /> Add row
      </Button>
    </div>
  );
}

function SourceSelect({ value, onChange }: { value: ToolSource; onChange: (v: Exclude<ToolSource, "agent">) => void }) {
  const isLegacy = value === "agent";
  return (
    <div className="flex items-center gap-1.5">
      <Select value={isLegacy ? "constant" : value} onValueChange={(v) => onChange(v as Exclude<ToolSource, "agent">)}>
        <SelectTrigger className={cn("h-8 w-[150px] text-xs", isLegacy && "border-warning/40 bg-warning/5")}><SelectValue /></SelectTrigger>
        <SelectContent>{SOURCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
      </Select>
      {isLegacy && (
        <span title="Legacy agent-fill source. Re-map to a campaign column or constant." className="text-warning">
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
}

/* --------------------------------------------------------- */
/* Body tree editor (Form + Raw JSON tabs)                    */
/* --------------------------------------------------------- */

function BodyEditor({
  value, onChange,
}: { value: BodyRoot; onChange: (v: BodyRoot) => void }) {
  const [view, setView] = useState<"form" | "raw">("form");
  const [rawText, setRawText] = useState<string>(() => JSON.stringify(serializeBody(value), null, 2));
  const [rawErr, setRawErr] = useState<string | null>(null);

  const switchTo = (next: "form" | "raw") => {
    if (view === next) return;
    if (next === "raw") {
      setRawText(JSON.stringify(serializeBody(value), null, 2));
      setRawErr(null);
    } else {
      // form → parse current raw text and apply
      try {
        const parsed = JSON.parse(rawText || "{}");
        onChange(parseBody(parsed));
        setRawErr(null);
      } catch (e) {
        setRawErr((e as Error).message);
        return; // stay on raw
      }
    }
    setView(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SubTabs
          tabs={[{ id: "form", label: "Form" }, { id: "raw", label: "Raw JSON" }]}
          value={view}
          onChange={(v) => switchTo(v as "form" | "raw")}
        />
        <div className="flex items-center gap-1.5">
          <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Root</Label>
          <Select value={value.rootType} onValueChange={(v) => onChange({ ...value, rootType: v as "object" | "array" })}>
            <SelectTrigger className="h-7 w-[92px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="object" className="text-xs">Object</SelectItem>
              <SelectItem value="array" className="text-xs">Array</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {view === "form" ? (
        <BodyTree value={value} onChange={onChange} />
      ) : (
        <div className="space-y-2">
          <Textarea
            value={rawText}
            onChange={(e) => { setRawText(e.target.value); setRawErr(null); }}
            className="min-h-[240px] font-mono text-xs"
            spellCheck={false}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Reference variables as <span className="font-mono">{'"{{campaign.<column>}}"'}</span> — they'll survive the round-trip.
            </p>
            <div className="flex items-center gap-2">
              {rawErr && <span className="text-[11px] text-destructive">{rawErr}</span>}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11.5px]"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(rawText || "{}");
                    onChange(parseBody(parsed));
                    setRawErr(null);
                    toast.success("JSON applied to Form view");
                  } catch (e) {
                    setRawErr((e as Error).message);
                  }
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-border bg-card/40 p-3">
        <p className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">Payload preview</p>
        <pre className="max-h-56 overflow-auto text-[11.5px] font-mono text-foreground/90">
{JSON.stringify(serializeBody(value), null, 2)}
        </pre>
      </div>
    </div>
  );
}

function BodyTree({ value, onChange }: { value: BodyRoot; onChange: (v: BodyRoot) => void }) {
  const addRoot = (kind: "leaf" | "object" | "array") => {
    const make = kind === "object" ? makeObject : kind === "array" ? makeArray : makeLeaf;
    onChange({ ...value, nodes: [...value.nodes, make({ key: value.rootType === "array" ? "" : "" })] });
  };

  const updateNode = (id: string, patch: Partial<BodyNode>) => {
    onChange({ ...value, nodes: patchNodes(value.nodes, id, patch) });
  };
  const removeNode = (id: string) => {
    onChange({ ...value, nodes: removeFromNodes(value.nodes, id) });
  };
  const addChild = (parentId: string, kind: "leaf" | "object" | "array") => {
    const make = kind === "object" ? makeObject : kind === "array" ? makeArray : makeLeaf;
    onChange({ ...value, nodes: addChildToNodes(value.nodes, parentId, make()) });
  };

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border bg-background/40 p-2">
        {value.nodes.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">
            No body fields. Add a field, object, or array to get started.
          </p>
        ) : (
          <ul className="space-y-1">
            {value.nodes.map((n) => (
              <BodyRow
                key={n.id}
                node={n}
                isArrayItem={value.rootType === "array"}
                depth={0}
                onPatch={updateNode}
                onRemove={removeNode}
                onAddChild={addChild}
              />
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-7 gap-1 text-[11.5px]" onClick={() => addRoot("leaf")}>
          <Plus className="h-3 w-3" /> Field
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-[11.5px]" onClick={() => addRoot("object")}>
          <Plus className="h-3 w-3" /> Object
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-[11.5px]" onClick={() => addRoot("array")}>
          <Plus className="h-3 w-3" /> Array
        </Button>
      </div>
    </div>
  );
}

/* Recursive tree helpers — small, immutable, easy to reason about. */
function patchNodes(nodes: BodyNode[], id: string, patch: Partial<BodyNode>): BodyNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch };
    if (n.children) return { ...n, children: patchNodes(n.children, id, patch) };
    return n;
  });
}
function removeFromNodes(nodes: BodyNode[], id: string): BodyNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => (n.children ? { ...n, children: removeFromNodes(n.children, id) } : n));
}
function addChildToNodes(nodes: BodyNode[], parentId: string, child: BodyNode): BodyNode[] {
  return nodes.map((n) => {
    if (n.id === parentId) return { ...n, children: [...(n.children ?? []), child] };
    if (n.children) return { ...n, children: addChildToNodes(n.children, parentId, child) };
    return n;
  });
}

function BodyRow({
  node, isArrayItem, depth, onPatch, onRemove, onAddChild,
}: {
  node: BodyNode;
  isArrayItem: boolean;
  depth: number;
  onPatch: (id: string, p: Partial<BodyNode>) => void;
  onRemove: (id: string) => void;
  onAddChild: (parentId: string, kind: "leaf" | "object" | "array") => void;
}) {
  const [open, setOpen] = useState(true);
  const isContainer = node.dataType === "Object" || node.dataType === "Array";

  return (
    <li>
      <div
        className={cn(
          "group flex flex-wrap items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 hover:border-border/60",
        )}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        {isContainer ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="inline-block w-5" />
        )}

        {isArrayItem ? (
          <span className="w-[110px] font-mono text-[11px] text-muted-foreground">— item</span>
        ) : (
          <Input
            value={node.key}
            onChange={(e) => onPatch(node.id, { key: e.target.value })}
            placeholder="key"
            className="h-7 w-[130px] font-mono text-[11.5px]"
          />
        )}

        <Select value={node.dataType} onValueChange={(v) => onPatch(node.id, { dataType: v as ToolDataType })}>
          <SelectTrigger className="h-7 w-[90px] text-[11.5px]"><SelectValue /></SelectTrigger>
          <SelectContent>{DATA_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
        </Select>

        {isContainer ? (
          <span className="text-[11px] text-muted-foreground">
            {(node.children?.length ?? 0)} {node.dataType === "Array" ? "items" : "fields"}
          </span>
        ) : (
          <>
            <SourceSelect
              value={node.source ?? "constant"}
              onChange={(source) => onPatch(node.id, { source })}
            />
            <Input
              value={node.value ?? ""}
              onChange={(e) => onPatch(node.id, { value: e.target.value })}
              placeholder={node.source === "campaign" ? "audience column" : "fixed value"}
              className="h-7 min-w-[130px] flex-1 font-mono text-[11.5px]"
            />
          </>
        )}

        <button
          onClick={() => onRemove(node.id)}
          className="row-remove ml-auto rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          title="Remove"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {isContainer && open && (
        <>
          <ul className="space-y-1">
            {(node.children ?? []).map((c) => (
              <BodyRow
                key={c.id}
                node={c}
                isArrayItem={node.dataType === "Array"}
                depth={depth + 1}
                onPatch={onPatch}
                onRemove={onRemove}
                onAddChild={onAddChild}
              />
            ))}
          </ul>
          <div className="flex items-center gap-1" style={{ paddingLeft: `${(depth + 1) * 14 + 6}px` }}>
            <button
              type="button"
              onClick={() => onAddChild(node.id, "leaf")}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              + Field
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button
              type="button"
              onClick={() => onAddChild(node.id, "object")}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              + Object
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button
              type="button"
              onClick={() => onAddChild(node.id, "array")}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              + Array
            </button>
          </div>
        </>
      )}
    </li>
  );
}

/* --------------------------------------------------------- */
/* cURL import                                                */
/* --------------------------------------------------------- */

function CurlImportButton({ onApply }: { onApply: (parsed: ReturnType<typeof parseCurl>) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!text.trim()) return null;
    try { return { ok: true as const, parsed: parseCurl(text) }; }
    catch (e) { return { ok: false as const, error: (e as Error).message }; }
  }, [text]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" className="h-7 gap-1 text-[11.5px]" onClick={() => setOpen(true)}>
        <Import className="h-3 w-3" /> Import from cURL
      </Button>
      <SheetContent side="right" className="w-full max-w-lg overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Import from cURL</SheetTitle>
          <SheetDescription>
            Paste a cURL command. Method, URL, headers, query and body will replace the current definition.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3 px-4">
          <Textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setErr(null); }}
            placeholder={`curl -X POST 'https://api.example.com/v1/orders' \\\n  -H 'Authorization: Bearer abc' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"customer_id":"c_123","items":[{"sku":"A"}]}'`}
            className="min-h-[200px] font-mono text-xs"
            spellCheck={false}
          />
          {err && <p className="text-[12px] text-destructive">{err}</p>}
          {preview && (
            <div className="rounded-lg border border-border bg-card/60 p-3 text-[12px]">
              {preview.ok ? (
                <>
                  <div className="mb-2 flex items-center gap-1.5 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Ready to import
                  </div>
                  <ul className="space-y-0.5 text-muted-foreground">
                    <li><span className="text-foreground/80">Method:</span> {preview.parsed.method}</li>
                    <li className="truncate"><span className="text-foreground/80">URL:</span> {preview.parsed.url}</li>
                    <li><span className="text-foreground/80">Headers:</span> {preview.parsed.headers.length}</li>
                    <li><span className="text-foreground/80">Query:</span> {preview.parsed.query.length}</li>
                    <li><span className="text-foreground/80">Body:</span> {preview.parsed.body ? "JSON detected" : preview.parsed.bodyRaw ? "raw text" : "none"}</li>
                  </ul>
                </>
              ) : (
                <div className="flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> {preview.error}
                </div>
              )}
            </div>
          )}
        </div>
        <SheetFooter className="mt-4 px-4">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={!preview?.ok}
            onClick={() => {
              if (!preview?.ok) return;
              onApply(preview.parsed);
              setOpen(false);
              setText("");
            }}
          >
            Replace definition
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* --------------------------------------------------------- */
/* Test panel + response viewer                              */
/* --------------------------------------------------------- */

/**
 * Test section — the demo doesn't fire real HTTP (CORS + no live endpoints).
 * We replay a saved `mockResponse` when present, else synthesize a plausible
 * 200 from the body shape. What matters is the affordance: the user sees a
 * response tree and *ticks* which fields should become downstream variables.
 *
 * The checkbox model is bidirectional with `draft.outputs`:
 *   - Tick a leaf  → append an output row with the auto-suggested var name
 *   - Untick       → remove any output rows whose `path` matches
 *   - Container inside an array → offer a "Map all items as Array" checkbox
 *     that uses `[*]` in place of the numeric index
 * So the response tree is a live picker over the outputs table below, not a
 * one-shot importer. The user still gets full control in the outputs table
 * (rename, edit path, delete, add manual rows).
 */
function TestSection({
  draft, onTestComplete, onOutputsChange,
}: {
  draft: ToolDraft;
  onTestComplete: (r: TestResponse) => void;
  onOutputsChange: (o: EditorOutput[]) => void;
}) {
  const [running, setRunning] = useState(false);

  const fire = () => {
    setRunning(true);
    setTimeout(() => {
      const now = new Date();
      const stamp = now.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const existing = draft.testResponse;
      const body = existing?.body ?? synthResponse(draft.body);
      onTestComplete({ status: existing?.status ?? 200, body, at: stamp, durationMs: 320 + Math.floor(Math.random() * 200) });
      setRunning(false);
      toast.success("Test complete", { description: `HTTP ${existing?.status ?? 200}` });
    }, 400);
  };

  const addOutputAtPath = (path: string, dataType: ToolDataType) => {
    const existingNames = new Set(draft.outputs.map((o) => o.varName));
    let name = suggestVarName(path);
    if (existingNames.has(name)) {
      // De-dupe by suffixing; keeps the user's manual rows intact.
      let i = 2;
      while (existingNames.has(`${name}_${i}`)) i += 1;
      name = `${name}_${i}`;
    }
    onOutputsChange([...draft.outputs, { id: uid("out"), path, varName: name, dataType, description: "" }]);
  };
  const removeOutputsByPath = (path: string) => {
    onOutputsChange(draft.outputs.filter((o) => o.path !== path));
  };
  const mappedPaths = useMemo(() => new Set(draft.outputs.map((o) => o.path)), [draft.outputs]);

  return (
    <Card
      title="Test Tool"
      desc="Run the tool to see a sample response, then tick the fields you want available as downstream variables."
      action={
        <div className="flex items-center gap-2">
          {draft.testResponse && (
            <span className="text-[11px] text-muted-foreground">Last run · {draft.testResponse.at}</span>
          )}
          <Button size="sm" className="h-7 gap-1 text-[11.5px]" onClick={fire} disabled={running}>
            <Play className="h-3 w-3" /> {running ? "Running…" : draft.testResponse ? "Re-run test" : "Run test"}
          </Button>
        </div>
      }
    >
      <p className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
        <Info className="h-3 w-3" /> For the demo, sample values aren't wired to a live request — the response below is either the saved response for this tool or a synthesized shape.
      </p>

      {draft.testResponse ? (
        <ResponseViewer
          response={draft.testResponse}
          mappedPaths={mappedPaths}
          onAddPath={addOutputAtPath}
          onRemovePath={removeOutputsByPath}
        />
      ) : (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-5 text-center text-[12px] text-muted-foreground">
          No test response yet. Run the test to see the response tree.
        </div>
      )}
    </Card>
  );
}

function synthResponse(body: BodyRoot): unknown {
  return {
    ok: true,
    request_id: "req_" + Math.random().toString(36).slice(2, 10),
    echo: serializeBody(body),
  };
}

function ResponseViewer({
  response, mappedPaths, onAddPath, onRemovePath,
}: {
  response: TestResponse;
  mappedPaths: Set<string>;
  onAddPath: (path: string, dataType: ToolDataType) => void;
  onRemovePath: (path: string) => void;
}) {
  const selectedCount = mappedPaths.size;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
        <div className="flex items-center gap-3">
          <span className={cn(
            "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px]",
            response.status < 300 ? "border-success/40 bg-success/10 text-success"
              : response.status < 400 ? "border-warning/40 bg-warning/10 text-warning"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}>{response.status}</span>
          {response.durationMs != null && (
            <span className="text-muted-foreground">{response.durationMs} ms</span>
          )}
        </div>
        <span className="text-muted-foreground">
          {selectedCount === 0
            ? "Tick a field to add it as an output"
            : `${selectedCount} field${selectedCount === 1 ? "" : "s"} promoted to Output Schema`}
        </span>
      </div>
      <div className="rounded-lg border border-border bg-background/60 p-2">
        <ul className="space-y-0.5 font-mono text-[11.5px]">
          <ResponseTreeNode
            keyLabel="$"
            value={response.body}
            path="$"
            depth={0}
            inArray={false}
            mappedPaths={mappedPaths}
            onAddPath={onAddPath}
            onRemovePath={onRemovePath}
          />
        </ul>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Ticks add rows below with an auto-generated variable name — rename or edit them in the Output Schema table.
      </p>
    </div>
  );
}

function ResponseTreeNode({
  keyLabel, value, path, depth, inArray, mappedPaths, onAddPath, onRemovePath,
}: {
  keyLabel: string;
  value: unknown;
  path: string;
  depth: number;
  inArray: boolean;
  mappedPaths: Set<string>;
  onAddPath: (path: string, dataType: ToolDataType) => void;
  onRemovePath: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const isArr = Array.isArray(value);
  const isObj = !isArr && value !== null && typeof value === "object";
  const isLeaf = !isArr && !isObj;
  const leafType: ToolDataType =
    typeof value === "number" ? "Number" :
    typeof value === "boolean" ? "Boolean" :
    "String";

  // When we're inside an array, offer a sibling "map every item's <field>" toggle
  // that swaps the numeric index in the path for [*]. Only surface it on the
  // FIRST array item (index 0), otherwise it appears N times which is noise.
  const arrayItemIndexMatch = path.match(/\[(\d+)\](?!.*\[\d+\])/); // last [idx]
  const isFirstArrayItem = inArray && arrayItemIndexMatch?.[1] === "0";
  const wildcardPath = isFirstArrayItem ? path.replace(/\[0\](?!.*\[\d+\])/, "[*]") : null;

  const leafMapped = isLeaf && mappedPaths.has(path);
  const toggleLeaf = () => {
    if (leafMapped) onRemovePath(path);
    else onAddPath(path, leafType);
  };

  return (
    <li style={{ paddingLeft: `${depth * 14}px` }}>
      <div className="group flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-accent/30">
        {(isArr || isObj) ? (
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-muted-foreground">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="inline-block w-3" />
        )}

        {isLeaf ? (
          <label className="flex flex-1 items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={leafMapped}
              onChange={toggleLeaf}
              className="h-3 w-3 cursor-pointer accent-foreground"
            />
            <span className="text-foreground/80">{keyLabel}</span>
            <span className="text-muted-foreground">:</span>
            <span className="truncate text-ai">{JSON.stringify(value)}</span>
            <span className="ml-1 rounded border border-border/60 bg-muted/40 px-1 py-[1px] text-[9.5px] uppercase tracking-wider text-muted-foreground">
              {leafType}
            </span>
          </label>
        ) : (
          <>
            <span className="text-foreground/80">{keyLabel}</span>
            {isArr && <span className="text-muted-foreground">[{(value as unknown[]).length}]</span>}
            {isObj && <span className="text-muted-foreground">{`{${Object.keys(value as object).length}}`}</span>}
          </>
        )}

        {wildcardPath && (
          <MapArrayToggle
            path={wildcardPath}
            mapped={mappedPaths.has(wildcardPath)}
            onAdd={() => onAddPath(wildcardPath, "Array")}
            onRemove={() => onRemovePath(wildcardPath)}
          />
        )}
      </div>
      {(isArr || isObj) && open && (
        <ul className="space-y-0.5">
          {isArr
            ? (value as unknown[]).map((v, i) => (
                <ResponseTreeNode
                  key={i}
                  keyLabel={`[${i}]`}
                  value={v}
                  path={`${path}[${i}]`}
                  depth={depth + 1}
                  inArray={true}
                  mappedPaths={mappedPaths}
                  onAddPath={onAddPath}
                  onRemovePath={onRemovePath}
                />
              ))
            : Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                <ResponseTreeNode
                  key={k}
                  keyLabel={k}
                  value={v}
                  path={`${path}.${k}`}
                  depth={depth + 1}
                  inArray={false}
                  mappedPaths={mappedPaths}
                  onAddPath={onAddPath}
                  onRemovePath={onRemovePath}
                />
              ))}
        </ul>
      )}
    </li>
  );
}

/** Small checkbox chip surfaced beside array items: "map every item's <field>". */
function MapArrayToggle({
  path, mapped, onAdd, onRemove,
}: { path: string; mapped: boolean; onAdd: () => void; onRemove: () => void }) {
  return (
    <label
      className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded border border-border/60 bg-muted/30 px-1.5 py-[1px] text-[10px] text-muted-foreground hover:text-foreground"
      title={`Map all items as an Array output — ${path}`}
    >
      <input
        type="checkbox"
        checked={mapped}
        onChange={() => (mapped ? onRemove() : onAdd())}
        className="h-3 w-3 cursor-pointer accent-foreground"
      />
      Map all items as Array
    </label>
  );
}

function suggestVarName(path: string): string {
  const parts = path
    .replace(/^\$\.?/, "")
    .split(/[.[\]]+/)
    .filter(Boolean)
    .filter((p) => !/^\d+$/.test(p) && p !== "*");
  return parts.slice(-2).join("_") || "value";
}

/* --------------------------------------------------------- */
/* Output schema                                              */
/* --------------------------------------------------------- */

function OutputSchema({
  outputs, onChange,
}: {
  outputs: EditorOutput[];
  onChange: (o: EditorOutput[]) => void;
}) {
  const update = (id: string, p: Partial<EditorOutput>) =>
    onChange(outputs.map((o) => (o.id === id ? { ...o, ...p } : o)));
  const remove = (id: string) => onChange(outputs.filter((o) => o.id !== id));
  const add = () => onChange([...outputs, { id: uid("out"), path: "$.", varName: "", dataType: "String", description: "" }]);

  return (
    <Card title="Output Schema" desc="Fields exposed as variables the agent can use. Map from the test response above, or add manually.">
      {outputs.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">No outputs mapped.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-2 text-left font-medium">Name</th>
                <th className="px-2 py-2 text-left font-medium">Path</th>
                <th className="px-2 py-2 text-left font-medium">Type</th>
                <th className="px-2 py-2 text-left font-medium">Description</th>
                <th className="w-9 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {outputs.map((o) => (
                <tr key={o.id} className="align-middle">
                  <td className="px-2 py-1.5">
                    <Input value={o.varName} onChange={(e) => update(o.id, { varName: e.target.value })} placeholder="variable_name" className="h-8 min-w-[130px] font-mono text-xs" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input value={o.path} onChange={(e) => update(o.id, { path: e.target.value })} placeholder="$.field.path" className="h-8 min-w-[160px] font-mono text-xs" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select value={o.dataType ?? "String"} onValueChange={(v) => update(o.id, { dataType: v as ToolDataType })}>
                      <SelectTrigger className="h-8 w-[96px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{DATA_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input value={o.description} onChange={(e) => update(o.id, { description: e.target.value })} placeholder="Description" className="h-8 min-w-[140px] text-xs" />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button onClick={() => remove(o.id)} className="row-remove rounded-md p-1.5 text-muted-foreground" title="Remove">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button variant="outline" size="sm" className="h-7 gap-1 text-[11.5px]" onClick={add}>
        <Plus className="h-3 w-3" /> Add output
      </Button>
    </Card>
  );
}

/* --------------------------------------------------------- */
/* Small shared pieces                                       */
/* --------------------------------------------------------- */

function Card({ title, desc, action, children }: { title: string; desc?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {desc && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{desc}</p>}
        </div>
        {action}
      </div>
      {children}
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

function SubTabs({ tabs, value, onChange }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="subtabs inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-secondary/30 p-1">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <div
            key={t.id}
            role="tab"
            tabIndex={0}
            aria-selected={active}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(t.id); } }}
            className={cn(
              "inline-flex select-none items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors",
              active ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-accent text-foreground" : "bg-muted text-muted-foreground")}>{t.count}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Re-export type used by flattenBody consumers (ConfigPanel) — kept here so
// the campaign-side node config can compute mappable leaves from a tool's
// body tree without pulling in the entire editor.
export { flattenBody };
