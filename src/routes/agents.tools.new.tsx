import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ChevronLeft, Plus, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getTool, type ToolDef, type ToolType, type ToolSource, type ToolDataType, type ToolParamIn,
} from "@/lib/tool-registry";

export const Route = createFileRoute("/agents/tools/new")({
  component: ToolEditor,
  validateSearch: (s: Record<string, unknown>): { tool?: string } => ({
    tool: typeof s.tool === "string" ? s.tool : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Tool · Pi Commerce Enterprise" },
      { name: "description", content: "Register an HTTP API or MCP tool in the registry." },
    ],
  }),
});

/* --------------------------------------------------------- */
/* Types & seed                                              */
/* --------------------------------------------------------- */

const DATA_TYPES: ToolDataType[] = ["String", "Number", "Boolean", "Object", "Array"];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const SOURCE_OPTIONS: { value: ToolSource; label: string }[] = [
  { value: "agent", label: "Agent-generated" },
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
type EditorOutput = { id: string; path: string; varName: string; description: string };
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
const JWT_ALGS: JwtAlg[] = ["HS256", "HS512", "RS256", "RS512"];
const JWT_FIELD_TYPES: JwtFieldType[] = ["Variable", "JWT", "Bearer", "Constant", "Random Generator", "Secret Manager", "SSO"];

type ToolDraft = {
  handle: string;
  description: string;
  type: ToolType;
  method: string;
  url: string;
  connectTimeout: string;
  responseTimeout: string;
  auth: "none" | "jwt";
  jwt: JwtConfig;
  headers: EditorInput[];
  query: EditorInput[];
  body: EditorInput[];
  pathMeta: Record<string, PathMeta>;
  outputs: EditorOutput[];
  mcpTransport: "http" | "sse";
  locked: boolean;
};

let seq = 0;
const uid = (p: string) => `${p}_${++seq}_${Date.now().toString(36)}`;
const newInput = (over: Partial<EditorInput> = {}): EditorInput =>
  ({ id: uid("in"), key: "", dataType: "String", source: "agent", value: "", description: "", ...over });
const newClaim = (): JwtClaim => ({ id: uid("claim"), key: "", dataType: "String", type: "Constant", value: "", description: "" });

const DEFAULT_JWT: JwtConfig = { alg: "HS256", addTo: "header", keyName: "Authorization", secret: "", claims: [], headerFields: [] };

function blankDraft(): ToolDraft {
  return {
    handle: "", description: "", type: "http", method: "POST", url: "",
    connectTimeout: "1000", responseTimeout: "1000",
    auth: "none", jwt: { ...DEFAULT_JWT },
    headers: [], query: [], body: [], pathMeta: {}, outputs: [],
    mcpTransport: "http", locked: false,
  };
}

/** Seed the editor from a registry tool when editing an existing one. */
function draftFromTool(t: ToolDef): ToolDraft {
  const d = blankDraft();
  d.handle = t.handle;
  d.description = t.description;
  d.type = t.type;
  d.method = t.method ?? "POST";
  d.url = t.url ?? "";
  d.auth = t.auth === "jwt" ? "jwt" : "none";
  d.mcpTransport = t.transport ?? "http";
  d.locked = true; // existing tools already have outputs mapped
  for (const inp of t.inputs) {
    if (inp.in === "path") {
      d.pathMeta[inp.key] = { source: inp.source, dataType: inp.dataType, value: inp.value ?? "", description: inp.description };
    } else {
      const where = inp.in === "header" ? "headers" : inp.in === "query" ? "query" : "body";
      const row = newInput({ key: inp.key, dataType: inp.dataType, source: inp.source, value: inp.value ?? "", description: inp.description });
      d[where].push(row);
    }
  }
  d.outputs = t.outputs.map((o) => ({ id: uid("out"), path: o.path, varName: o.varName, description: o.description }));
  return d;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "_");

/* --------------------------------------------------------- */
/* Page                                                      */
/* --------------------------------------------------------- */

function ToolEditor() {
  const { tool: editHandle } = Route.useSearch();
  const existing = editHandle ? getTool(editHandle) : undefined;
  // Read-only view of a saved tool. State is initialised once from the tool
  // registry and never mutated; every input/select is disabled via the
  // wrapping fieldset below.
  const [draft] = useState<ToolDraft>(() => (existing ? draftFromTool(existing) : blankDraft()));

  const noop = <K extends keyof ToolDraft>(_key: K, _value: ToolDraft[K]) => { void _key; void _value; };
  const set = noop;
  const setDraft = (_updater: (d: ToolDraft) => ToolDraft) => { void _updater; };

  const pathKeys = useMemo(
    () => Array.from(draft.url.matchAll(/\{([^}]+)\}/g)).map((m) => m[1]),
    [draft.url],
  );

  const isHttp = draft.type === "http";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Header — read-only view */}
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
          <span className="truncate font-mono text-[13.5px] font-medium">{draft.handle.trim() || (existing ? existing.handle : "Tool")}</span>
        </div>
      </header>

      {/* Body — everything wrapped in a disabled fieldset so inputs read as read-only */}
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-8">
        <fieldset disabled className="tool-view-fieldset mx-auto block w-full max-w-3xl min-w-0 space-y-5 border-0 p-0">
        <style>{`
          .tool-view-fieldset button[disabled],
          .tool-view-fieldset input[disabled],
          .tool-view-fieldset select[disabled],
          .tool-view-fieldset textarea[disabled] { cursor: default; }
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
            <FormField label="Tool type">
              <div className="grid grid-cols-2 gap-2">
                {(["http", "mcp"] as ToolType[]).map((tt) => (
                  <button
                    key={tt}
                    onClick={() => set("type", tt)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors",
                      draft.type === tt ? "border-foreground bg-accent" : "border-border hover:bg-accent/40",
                    )}
                  >
                    <span className="font-medium">{tt === "http" ? "HTTP API" : "MCP"}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {tt === "http" ? "Call a REST endpoint" : "Connect a Model Context Protocol server"}
                    </span>
                  </button>
                ))}
              </div>
            </FormField>
          </Card>

          {/* 2 · Definition */}
          {isHttp ? (
            <Card title="Definition" desc="Endpoint, timeouts and authorization.">
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
                <p className="text-[11px] text-muted-foreground">Wrap path variables in <span className="font-mono">{"{braces}"}</span> — they appear automatically under Input Schema.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Connect timeout (ms)"><Input value={draft.connectTimeout} onChange={(e) => set("connectTimeout", e.target.value)} className="h-9 font-mono text-xs" /></FormField>
                <FormField label="Response timeout (ms)"><Input value={draft.responseTimeout} onChange={(e) => set("responseTimeout", e.target.value)} className="h-9 font-mono text-xs" /></FormField>
              </div>

              <div className="space-y-3">
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Authorization</Label>
                <RadioGroup value={draft.auth} onValueChange={(v) => set("auth", v as "none" | "jwt")} className="grid grid-cols-2 gap-2">
                  {([["none", "No Auth"], ["jwt", "JWT Bearer"]] as ["none" | "jwt", string][]).map(([val, label]) => (
                    <label key={val} className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] transition-colors",
                      draft.auth === val ? "border-foreground bg-accent" : "border-border hover:bg-accent/40",
                    )}>
                      <RadioGroupItem value={val} /> {label}
                    </label>
                  ))}
                </RadioGroup>
                {draft.auth === "none" ? (
                  <p className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-[12px] text-muted-foreground">
                    No authentication sent with the request.
                  </p>
                ) : (
                  <JwtFields jwt={draft.jwt} onChange={(patch) => set("jwt", { ...draft.jwt, ...patch })} />
                )}
              </div>
            </Card>
          ) : (
            <Card title="MCP Server" desc="Connect a Model Context Protocol server.">
              <FormField label="Server URL" required>
                <Input value={draft.url} onChange={(e) => set("url", e.target.value)} placeholder="https://mcp.example.com/sse" className="h-9 font-mono text-xs" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Transport">
                  <Select value={draft.mcpTransport} onValueChange={(v) => set("mcpTransport", v as "http" | "sse")}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="http" className="text-sm">Streamable HTTP</SelectItem>
                      <SelectItem value="sse" className="text-sm">SSE</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Authorization">
                  <Select value={draft.auth} onValueChange={(v) => set("auth", v as "none" | "jwt")}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-sm">No Auth</SelectItem>
                      <SelectItem value="jwt" className="text-sm">JWT Bearer</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
              {draft.auth === "jwt" && <JwtFields jwt={draft.jwt} onChange={(patch) => set("jwt", { ...draft.jwt, ...patch })} />}
              <McpToolsBlock url={draft.url} />
            </Card>
          )}

          {/* 3 · Input Schema (HTTP only) */}
          {isHttp && (
            <Card title="Input Schema" desc="Parameters the tool sends. Each is filled by the agent, mapped from the campaign, or fixed.">
              <InputSchema
                draft={draft}
                pathKeys={pathKeys}
                setRows={(where, rows) => set(where, rows)}
                setPathMeta={(k, patch) => setDraft((d) => ({ ...d, pathMeta: { ...d.pathMeta, [k]: { ...defaultPathMeta(d.pathMeta[k]), ...patch } } }))}
              />
            </Card>
          )}

          {/* 4 · Output Schema (HTTP only) */}
          {isHttp && <OutputSchema draft={draft} />}
        </fieldset>
      </section>

      {/* Footer — Save + Cancel present but disabled (read-only) */}
      <footer className="flex h-14 shrink-0 items-center justify-center gap-3 border-t border-border px-4">
        <Button variant="outline" size="sm" className="h-8 px-4 text-xs" disabled>Cancel</Button>
        <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" disabled>
          Save tool
        </Button>
      </footer>
    </div>
  );
}

function defaultPathMeta(m?: PathMeta): PathMeta {
  return m ?? { source: "agent", dataType: "String", value: "", description: "" };
}

/* --------------------------------------------------------- */
/* Input schema (tabs + path block)                          */
/* --------------------------------------------------------- */

const IN_TABS: { id: Exclude<ToolParamIn, "path">; label: string }[] = [
  { id: "header", label: "Headers" },
  { id: "query", label: "Query" },
  { id: "body", label: "Body" },
];

function InputSchema({
  draft, pathKeys, setRows, setPathMeta,
}: {
  draft: ToolDraft;
  pathKeys: string[];
  setRows: (where: "headers" | "query" | "body", rows: EditorInput[]) => void;
  setPathMeta: (k: string, patch: Partial<PathMeta>) => void;
}) {
  const [tab, setTab] = useState<"header" | "query" | "body">("body");
  const listKey = tab === "header" ? "headers" : tab; // body|query|headers
  const rows = draft[listKey as "headers" | "query" | "body"];

  const add = () => setRows(listKey as "headers" | "query" | "body", [...rows, newInput()]);
  const update = (id: string, patch: Partial<EditorInput>) =>
    setRows(listKey as "headers" | "query" | "body", rows.map((r) => r.id === id ? { ...r, ...patch } : r));
  const remove = (id: string) =>
    setRows(listKey as "headers" | "query" | "body", rows.filter((r) => r.id !== id));

  return (
    <div className="space-y-4">
      {/* Path params — auto-detected from the URL */}
      {pathKeys.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Path · auto-detected from URL</p>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {pathKeys.map((k) => {
                  const m = defaultPathMeta(draft.pathMeta[k]);
                  return (
                    <tr key={k} className="align-middle">
                      <td className="w-40 px-3 py-2 font-mono text-[12px] text-foreground">{k}</td>
                      <td className="px-2 py-2">
                        <SourceSelect value={m.source} onChange={(source) => setPathMeta(k, { source })} />
                      </td>
                      <td className="px-2 py-2">
                        <Input value={valueFor(m)} onChange={(e) => setPathMeta(k, { value: e.target.value })} placeholder={placeholderFor(m.source)} className="h-8 font-mono text-xs" />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={m.description} onChange={(e) => setPathMeta(k, { description: e.target.value })} placeholder="Description" className="h-8 text-xs" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <SubTabs tabs={IN_TABS.map((t) => ({ id: t.id, label: t.label, count: draft[t.id === "header" ? "headers" : t.id].length }))} value={tab} onChange={(v) => setTab(v as typeof tab)} />
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-2 text-left font-medium">Key</th>
                <th className="px-2 py-2 text-left font-medium">Type</th>
                <th className="px-2 py-2 text-left font-medium">Source</th>
                <th className="px-2 py-2 text-left font-medium">Value / slot</th>
                <th className="px-2 py-2 text-left font-medium">Description</th>
                <th className="w-9 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-7 text-center text-[12px] text-muted-foreground">No {tab} params yet.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="align-middle">
                  <td className="px-2 py-1.5"><Input value={r.key} onChange={(e) => update(r.id, { key: e.target.value })} placeholder="key" className="h-8 min-w-[110px] font-mono text-xs" /></td>
                  <td className="px-2 py-1.5">
                    <Select value={r.dataType} onValueChange={(v) => update(r.id, { dataType: v as ToolDataType })}>
                      <SelectTrigger className="h-8 w-[96px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{DATA_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5"><SourceSelect value={r.source} onChange={(source) => update(r.id, { source })} /></td>
                  <td className="px-2 py-1.5"><Input value={valueFor(r)} onChange={(e) => update(r.id, { value: e.target.value })} placeholder={placeholderFor(r.source)} disabled={r.source === "agent"} className="h-8 min-w-[120px] font-mono text-xs disabled:opacity-50" /></td>
                  <td className="px-2 py-1.5"><Input value={r.description} onChange={(e) => update(r.id, { description: e.target.value })} placeholder="Description" className="h-8 min-w-[120px] text-xs" /></td>
                  <td className="px-2 py-1.5 text-center">
                    <button onClick={() => remove(r.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remove">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={add}><Plus className="h-3.5 w-3.5" /> Add {tab} param</Button>
      </div>
    </div>
  );
}

function valueFor(r: { source: ToolSource; value: string }): string {
  return r.source === "agent" ? "" : r.value;
}
function placeholderFor(source: ToolSource): string {
  return source === "constant" ? "fixed value" : source === "campaign" ? "audience column" : "filled by agent";
}

function SourceSelect({ value, onChange }: { value: ToolSource; onChange: (v: ToolSource) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ToolSource)}>
      <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>{SOURCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/* --------------------------------------------------------- */
/* Output schema (gated)                                     */
/* --------------------------------------------------------- */

/**
 * Read-only view of the tool's output schema — Path, Variable, Description.
 * The build-time gate ("lock the request", "fetch live response") is gone
 * because the surface is now read-only: outputs are shown as they were saved.
 */
function OutputSchema({ draft }: { draft: ToolDraft }) {
  return (
    <Card title="Output Schema" desc="Fields exposed as variables the agent can use.">
      {draft.outputs.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">No outputs mapped.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-2 text-left font-medium">Path</th>
                <th className="px-2 py-2 text-left font-medium">Variable</th>
                <th className="px-2 py-2 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {draft.outputs.map((o) => (
                <tr key={o.id} className="align-middle">
                  <td className="px-2 py-1.5 font-mono text-[11.5px] text-muted-foreground">{o.path}</td>
                  <td className="px-2 py-1.5 font-mono text-[12px] text-foreground">{o.varName}</td>
                  <td className="px-2 py-1.5 text-[12px] text-muted-foreground">{o.description || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* --------------------------------------------------------- */
/* Small shared pieces                                       */
/* --------------------------------------------------------- */

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {desc && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{desc}</p>}
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
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-secondary/30 p-1">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors",
            active ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}>
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-accent text-foreground" : "bg-muted text-muted-foreground")}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const SAMPLE_MCP_TOOLS = [
  { name: "search_kb", description: "Semantic search across the knowledge base", inputs: "query, top_k" },
  { name: "get_article", description: "Fetch a KB article by id", inputs: "article_id" },
  { name: "list_categories", description: "List available KB categories", inputs: "—" },
  { name: "summarize", description: "Summarize a passage for the agent", inputs: "text, max_tokens" },
];

/**
 * Read-only preview of tools exposed by the MCP server. In the previous editor
 * this had a "Fetch available tools" button; in the read-only view we always
 * show the sample tool list so the shape of the surface is still visible.
 */
function McpToolsBlock({ url }: { url: string }) {
  void url;
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border bg-card/40 p-3">
      <p className="text-[12px] text-muted-foreground">
        {SAMPLE_MCP_TOOLS.length} tools available on this server
      </p>
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Tool</th>
              <th className="px-3 py-2 text-left font-medium">Description</th>
              <th className="px-3 py-2 text-left font-medium">Inputs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {SAMPLE_MCP_TOOLS.map((t) => (
              <tr key={t.name}>
                <td className="px-3 py-2 font-mono text-[12px] text-foreground">{t.name}</td>
                <td className="px-3 py-2 text-[12px] text-muted-foreground">{t.description}</td>
                <td className="px-3 py-2 font-mono text-[11.5px] text-muted-foreground">{t.inputs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function JwtFields({ jwt, onChange }: { jwt: JwtConfig; onChange: (patch: Partial<JwtConfig>) => void }) {
  const editList = (list: "claims" | "headerFields") => ({
    add: () => onChange({ [list]: [...jwt[list], newClaim()] } as Partial<JwtConfig>),
    update: (id: string, patch: Partial<JwtClaim>) => onChange({ [list]: jwt[list].map((c) => c.id === id ? { ...c, ...patch } : c) } as Partial<JwtConfig>),
    remove: (id: string) => onChange({ [list]: jwt[list].filter((c) => c.id !== id) } as Partial<JwtConfig>),
  });
  const claims = editList("claims");
  const headerFields = editList("headerFields");
  return (
    <div className="space-y-4 rounded-lg border border-border bg-secondary/20 p-3">
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Algorithm">
          <Select value={jwt.alg} onValueChange={(v) => onChange({ alg: v as JwtAlg })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{JWT_ALGS.map((a) => <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label="Add to">
          <Select value={jwt.addTo} onValueChange={(v) => onChange({ addTo: v as "header" | "query" })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="header" className="text-sm">Header</SelectItem>
              <SelectItem value="query" className="text-sm">Query Param</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Key name"><Input value={jwt.keyName} onChange={(e) => onChange({ keyName: e.target.value })} placeholder="Authorization" className="h-9 font-mono text-xs" /></FormField>
      </div>
      <FormField label="Secret">
        <Input type="password" value={jwt.secret} onChange={(e) => onChange({ secret: e.target.value })} placeholder="Enter secret key…" className="h-9 font-mono text-xs" />
        <p className="text-[11px] text-muted-foreground">Stored encrypted in your workspace vault — never exposed to the model.</p>
      </FormField>
      <JwtClaimTable label="Claims / payload (JSON)" rows={jwt.claims} {...claims} />
      <JwtClaimTable label="JWT header (JSON)" rows={jwt.headerFields} {...headerFields} />
    </div>
  );
}

function JwtClaimTable({
  label, rows, add, update, remove,
}: {
  label: string;
  rows: JwtClaim[];
  add: () => void;
  update: (id: string, patch: Partial<JwtClaim>) => void;
  remove: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</Label>
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-2 text-left font-medium">Keys</th>
                <th className="px-2 py-2 text-left font-medium">Data type</th>
                <th className="px-2 py-2 text-left font-medium">Type</th>
                <th className="px-2 py-2 text-left font-medium">Value</th>
                <th className="px-2 py-2 text-left font-medium">Description</th>
                <th className="w-9 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="align-middle">
                  <td className="px-2 py-1.5"><Input value={c.key} onChange={(e) => update(c.id, { key: e.target.value })} placeholder="Key name" className="h-8 min-w-[110px] font-mono text-xs" /></td>
                  <td className="px-2 py-1.5">
                    <Select value={c.dataType} onValueChange={(v) => update(c.id, { dataType: v as ToolDataType })}>
                      <SelectTrigger className="h-8 w-[96px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{DATA_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Select value={c.type} onValueChange={(v) => update(c.id, { type: v as JwtFieldType })}>
                      <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{JWT_FIELD_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5"><Input value={c.value} onChange={(e) => update(c.id, { value: e.target.value })} placeholder="Enter value" className="h-8 min-w-[120px] font-mono text-xs" /></td>
                  <td className="px-2 py-1.5"><Input value={c.description} onChange={(e) => update(c.id, { description: e.target.value })} placeholder="Add" className="h-8 min-w-[120px] text-xs" /></td>
                  <td className="px-2 py-1.5 text-center">
                    <button onClick={() => remove(c.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={add}><Plus className="h-3.5 w-3.5" /> Add field</Button>
    </div>
  );
}
