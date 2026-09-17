import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Wrench, Search, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOLS } from "@/lib/tool-registry";
import { renderMarkdown } from "@/lib/markdown";
import { saveAgent } from "@/lib/agent-store";
import type { AgentType, AgentRecord, PostCallVar } from "@/lib/agent-data";

const DEFAULT_EVAL_PROMPT =
  "Review the full transcript and extract the following variables. Answer concisely, staying strictly within the definition of each variable. If a value can't be determined, respond with `unknown`.";

/**
 * Editable Agent Builder. State is local; Save flushes into `agent-store`
 * which every read surface (agents list, campaign resolveAgent, analytics
 * lookups) subscribes to.
 */
export function AgentBuilder({
  mode = "edit",
  record,
}: {
  mode?: "create" | "edit";
  type: AgentType;
  record?: AgentRecord;
}) {
  const navigate = useNavigate();

  const [name, setName] = useState(record?.name ?? "");
  const [status, setStatus] = useState<AgentRecord["status"]>(record?.status ?? "draft");
  const [tools, setTools] = useState<string[]>(record?.tools ?? []);
  const [masterPrompt, setMasterPrompt] = useState(record?.masterPrompt ?? "");
  const [knowledgeBase, setKnowledgeBase] = useState(record?.knowledgeBase ?? "");
  const [evalPrompt, setEvalPrompt] = useState(record?.evalPrompt ?? DEFAULT_EVAL_PROMPT);
  const [postCall, setPostCall] = useState<PostCallVar[]>(record?.postCall ?? []);
  const [dirty, setDirty] = useState(false);

  const [toolQuery, setToolQuery] = useState("");
  const [previewMaster, setPreviewMaster] = useState(false);
  const [previewKB, setPreviewKB] = useState(false);

  // Re-hydrate if the parent hands us a different record (route change on the
  // same component instance).
  useEffect(() => {
    if (!record) return;
    setName(record.name);
    setStatus(record.status);
    setTools(record.tools);
    setMasterPrompt(record.masterPrompt);
    setKnowledgeBase(record.knowledgeBase);
    setEvalPrompt(record.evalPrompt ?? DEFAULT_EVAL_PROMPT);
    setPostCall(record.postCall);
    setDirty(false);
  }, [record?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredTools = useMemo(() => {
    const q = toolQuery.trim().toLowerCase();
    if (!q) return TOOLS;
    return TOOLS.filter(
      (t) =>
        t.handle.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q),
    );
  }, [toolQuery]);

  function mark<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  function toggleTool(handle: string) {
    setTools((prev) =>
      prev.includes(handle) ? prev.filter((h) => h !== handle) : [...prev, handle],
    );
    setDirty(true);
  }

  function addPostCall() {
    setPostCall((prev) => [
      ...prev,
      { id: `p_${Math.random().toString(36).slice(2, 8)}`, name: "", prompt: "" },
    ]);
    setDirty(true);
  }

  function updatePostCall(id: string, patch: Partial<PostCallVar>) {
    setPostCall((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    setDirty(true);
  }

  function removePostCall(id: string) {
    setPostCall((prev) => prev.filter((v) => v.id !== id));
    setDirty(true);
  }

  function handleCancel() {
    if (!record) {
      setName("");
      setStatus("draft");
      setTools([]);
      setMasterPrompt("");
      setKnowledgeBase("");
      setEvalPrompt(DEFAULT_EVAL_PROMPT);
      setPostCall([]);
      setDirty(false);
      return;
    }
    setName(record.name);
    setStatus(record.status);
    setTools(record.tools);
    setMasterPrompt(record.masterPrompt);
    setKnowledgeBase(record.knowledgeBase);
    setEvalPrompt(record.evalPrompt ?? DEFAULT_EVAL_PROMPT);
    setPostCall(record.postCall);
    setDirty(false);
  }

  function handleSave() {
    if (!name.trim()) return;
    const patch: Partial<AgentRecord> = {
      name: name.trim(),
      type: "voice",
      status,
      tools,
      masterPrompt,
      knowledgeBase,
      evalPrompt,
      postCall,
    };

    if (mode === "create") {
      const rand =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().slice(0, 8)
          : Math.random().toString(36).slice(2, 10);
      const id = `a_${rand}`;
      saveAgent(id, { id, ...patch });
      setDirty(false);
      toast.success("Agent created");
      navigate({ to: "/agents/$id", params: { id } });
      return;
    }

    if (record) {
      saveAgent(record.id, patch);
      setDirty(false);
      toast.success("Agent saved");
    }
  }

  const displayName = name.trim() || (mode === "create" ? "New agent" : "Agent");
  const canSave = dirty && name.trim().length > 0;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/agents"
            className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Agents</span>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="truncate font-mono text-[13.5px] font-medium">{displayName}</span>
          <span
            className={cn(
              "ml-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
              status === "live"
                ? "border-success/30 bg-success/10 text-success"
                : status === "paused"
                  ? "border-muted-foreground/30 bg-muted text-muted-foreground"
                  : "border-warning/30 bg-warning/10 text-warning",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                status === "live"
                  ? "bg-success"
                  : status === "paused"
                    ? "bg-muted-foreground"
                    : "bg-warning",
              )}
            />
            {status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-4 text-xs"
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 px-4 text-xs"
            disabled={!canSave}
            onClick={handleSave}
          >
            Save agent
          </Button>
        </div>
      </header>

      {/* Body */}
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-8">
        <div className="mx-auto block w-full max-w-3xl min-w-0 space-y-5">
          {/* Agent details */}
          <Card title="Agent details">
            <Field label="Agent name">
              <Input
                value={name}
                onChange={(e) => mark(setName)(e.target.value)}
                placeholder="e.g. reactivation_voice"
                className="h-9 font-mono text-sm"
              />
            </Field>
            <Field label="Status">
              <div className="flex items-center gap-1.5">
                {(["draft", "live", "paused"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => mark(setStatus)(s)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-[11.5px] font-medium capitalize transition-colors",
                      status === s
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>
          </Card>

          {/* Tools */}
          <Card title="Tools" desc="Click a tool to attach or detach it from this agent.">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={toolQuery}
                onChange={(e) => setToolQuery(e.target.value)}
                placeholder="Search tools…"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {filteredTools.map((t) => {
                const selected = tools.includes(t.handle);
                return (
                  <button
                    key={t.handle}
                    type="button"
                    title={t.description}
                    onClick={() => toggleTool(t.handle)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11.5px] transition-colors",
                      selected
                        ? "border-ai/40 bg-ai/15 text-ai"
                        : "border-border bg-card text-muted-foreground hover:border-ai/30 hover:text-foreground",
                    )}
                  >
                    <Wrench className="h-3 w-3" /> {t.handle}
                  </button>
                );
              })}
              {filteredTools.length === 0 && (
                <span className="text-[12px] text-muted-foreground">No tools match.</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {tools.length} selected
            </p>
          </Card>

          {/* Master prompt */}
          <Card
            title="Master prompt"
            desc="The agent's core instructions. Markdown + {{tool}} mentions render as chips in preview."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={() => setPreviewMaster((v) => !v)}
              >
                {previewMaster ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {previewMaster ? "Edit" : "Preview markdown"}
              </Button>
            }
          >
            {previewMaster ? (
              <div
                className="min-h-[400px] rounded-lg border border-border bg-secondary/20 px-4 py-3 text-[13px]"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(masterPrompt) }}
              />
            ) : (
              <Textarea
                value={masterPrompt}
                onChange={(e) => mark(setMasterPrompt)(e.target.value)}
                className="min-h-[400px] font-mono text-xs"
                placeholder="# 1. Persona&#10;You are…"
              />
            )}
          </Card>

          {/* Knowledge base */}
          <Card
            title="Knowledge base"
            desc="Reference material the agent can draw on."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={() => setPreviewKB((v) => !v)}
              >
                {previewKB ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {previewKB ? "Edit" : "Preview markdown"}
              </Button>
            }
          >
            {previewKB ? (
              <div
                className="min-h-[200px] rounded-lg border border-border bg-secondary/20 px-4 py-3 text-[13px]"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(knowledgeBase) }}
              />
            ) : (
              <Textarea
                value={knowledgeBase}
                onChange={(e) => mark(setKnowledgeBase)(e.target.value)}
                className="min-h-[200px] font-mono text-xs"
                placeholder="## Product basics…"
              />
            )}
          </Card>

          {/* Post-call variables */}
          <Card
            title="Post-call variables"
            desc="Structured variables extracted from the transcript after each call."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={addPostCall}
              >
                <Plus className="h-3 w-3" /> Add variable
              </Button>
            }
          >
            {postCall.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No variables yet. Click Add variable to create one.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="w-[30%] px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Prompt</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {postCall.map((v) => (
                      <tr key={v.id}>
                        <td className="align-top px-3 py-2">
                          <Input
                            value={v.name}
                            onChange={(e) => updatePostCall(v.id, { name: e.target.value })}
                            placeholder="variable_name"
                            className="h-8 font-mono text-[12px]"
                          />
                        </td>
                        <td className="align-top px-3 py-2">
                          <Textarea
                            value={v.prompt}
                            onChange={(e) => updatePostCall(v.id, { prompt: e.target.value })}
                            rows={2}
                            className="min-h-[52px] text-[12px]"
                            placeholder="How to extract this variable from the transcript."
                          />
                        </td>
                        <td className="align-top px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removePostCall(v.id)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Delete variable"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Eval prompt */}
          <Card title="Eval prompt" desc="Instructions for the model that scores each transcript.">
            <Textarea
              value={evalPrompt}
              onChange={(e) => mark(setEvalPrompt)(e.target.value)}
              className="min-h-[100px] text-xs"
            />
          </Card>
        </div>
      </section>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Small shared pieces                                       */
/* --------------------------------------------------------- */

function Card({
  title,
  desc,
  action,
  children,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {desc && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{desc}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
