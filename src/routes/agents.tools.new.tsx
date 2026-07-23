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
  ChevronLeft, Trash2,
} from "lucide-react";
import { toast } from "sonner";
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
      { title: "Tool · Pi Agents FinServ" },
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
  const setDraft = (updater: (d: ToolDraft) => ToolDraft) => setDraftState(updater);

  const pathKeys = useMemo(
    () => Array.from(draft.url.matchAll(/\{([^}]+)\}/g)).map((m) => m[1]),
    [draft.url],
  );

  const isHttp = draft.type === "http";
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
            <Card title="Definition" desc="Endpoint and timeouts.">
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Connect timeout (ms)"><Input value={draft.connectTimeout} onChange={(e) => set("connectTimeout", e.target.value)} className="h-9 font-mono text-xs" /></FormField>
                <FormField label="Response timeout (ms)"><Input value={draft.responseTimeout} onChange={(e) => set("responseTimeout", e.target.value)} className="h-9 font-mono text-xs" /></FormField>
              </div>
            </Card>
          ) : (
            <Card title="MCP Server" desc="Connect a Model Context Protocol server.">
              <FormField label="Server URL">
                <Input value={draft.url} onChange={(e) => set("url", e.target.value)} placeholder="https://mcp.example.com/sse" className="h-9 font-mono text-xs" />
              </FormField>
              <FormField label="Transport">
                <Select value={draft.mcpTransport} onValueChange={(v) => set("mcpTransport", v as "http" | "sse")}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http" className="text-sm">Streamable HTTP</SelectItem>
                    <SelectItem value="sse" className="text-sm">SSE</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <McpToolsBlock url={draft.url} />
            </Card>
          )}

          {/* 3 · Input Schema (HTTP only) */}
          {isHttp && (
            <Card title="Input Schema" desc="Parameters the tool sends. Each is filled by the agent, mapped from the campaign, or fixed.">
              <InputSchema
                draft={draft}
                setRows={(where, rows) => set(where, rows)}
              />
            </Card>
          )}

          {/* 4 · Output Schema (HTTP only) */}
          {isHttp && <OutputSchema draft={draft} />}
        </fieldset>
      </section>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Input schema (Body / Query tabs)                          */
/* --------------------------------------------------------- */

const IN_TABS: { id: "query" | "body"; label: string }[] = [
  { id: "body", label: "Body" },
  { id: "query", label: "Query" },
];

function InputSchema({
  draft, setRows,
}: {
  draft: ToolDraft;
  setRows: (where: "query" | "body", rows: EditorInput[]) => void;
}) {
  const [tab, setTab] = useState<"query" | "body">("body");
  const rows = draft[tab];

  const update = (id: string, patch: Partial<EditorInput>) =>
    setRows(tab, rows.map((r) => r.id === id ? { ...r, ...patch } : r));
  const remove = (id: string) =>
    setRows(tab, rows.filter((r) => r.id !== id));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SubTabs
          tabs={IN_TABS.map((t) => ({ id: t.id, label: t.label, count: draft[t.id].length }))}
          value={tab}
          onChange={(v) => setTab(v as "query" | "body")}
        />
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
                <tr><td colSpan={6} className="px-3 py-7 text-center text-[12px] text-muted-foreground">No {tab} params.</td></tr>
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
                    <button onClick={() => remove(r.id)} className="row-remove rounded-md p-1.5 text-muted-foreground" title="Remove">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                <th className="px-2 py-2 text-left font-medium">Name</th>
                <th className="px-2 py-2 text-left font-medium">Type</th>
                <th className="px-2 py-2 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {draft.outputs.map((o) => (
                <tr key={o.id} className="align-middle">
                  <td className="px-2 py-1.5 font-mono text-[12px] text-foreground">{o.varName}</td>
                  <td className="px-2 py-1.5 text-[12px] text-muted-foreground">{o.dataType ?? "String"}</td>
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
  // Rendered as div[role="tab"] rather than <button> so the tabs stay
  // switchable even when wrapped in a <fieldset disabled> read-only surface.
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

