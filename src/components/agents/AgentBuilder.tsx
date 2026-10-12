import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Save, Plus, X, Trash2, Eye, Pencil, Phone, MessageCircle, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOLS, getTool } from "@/lib/tool-registry";
import { renderMarkdown } from "@/lib/markdown";
import type { AgentType, AgentRecord, PostCallVar } from "@/lib/agent-data";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "_");
let seq = 0;
const uid = () => `pcv_${++seq}_${Date.now().toString(36)}`;

export function AgentBuilder({ mode, type, record }: { mode: "create" | "edit"; type: AgentType; record?: AgentRecord }) {
  const navigate = useNavigate();
  const [name, setName] = useState(record?.name ?? "");
  const [tools, setTools] = useState<string[]>(record?.tools ?? []);
  const [masterPrompt, setMasterPrompt] = useState(record?.masterPrompt ?? "");
  const [knowledgeBase, setKnowledgeBase] = useState(record?.knowledgeBase ?? "");
  const [postCall, setPostCall] = useState<PostCallVar[]>(record?.postCall ?? []);

  const close = () => navigate({ to: "/agents" });
  const save = () => {
    toast.success(`${name.trim() || "Agent"} ${mode === "edit" ? "saved" : "created"}`, {
      description: `${type === "voice" ? "Voice" : "Chat"} agent with ${tools.length} tool${tools.length === 1 ? "" : "s"}.`,
    });
    close();
  };

  const available = TOOLS.filter((t) => !tools.includes(t.handle));
  const status = mode === "edit" ? record?.status ?? "draft" : "draft";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/agents" className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Agents</span>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="truncate font-mono text-[13.5px] font-medium">{name.trim() || (mode === "edit" ? record?.name : "New agent")}</span>
          <span className={cn(
            "ml-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
            status === "live" ? "border-success/30 bg-success/10 text-success"
              : status === "paused" ? "border-muted-foreground/30 bg-muted text-muted-foreground"
              : "border-warning/30 bg-warning/10 text-warning",
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full", status === "live" ? "bg-success" : status === "paused" ? "bg-muted-foreground" : "bg-warning")} />
            {status}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={close}>Cancel</Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={save}>
            <Save className="h-3.5 w-3.5" /> Save as draft
          </Button>
        </div>
      </header>

      {/* Body */}
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-8">
        <div className="mx-auto w-full max-w-3xl space-y-5">

          {/* Agent details */}
          <Card title="Agent details" desc="Identify the agent. The name is how it's referenced across campaigns.">
            <Field label="Agent name" required>
              <Input value={name} onChange={(e) => setName(slug(e.target.value))} placeholder="e.g. pi_concierge" className="h-9 font-mono text-sm" />
              <p className="text-[11px] text-muted-foreground">Lowercase, no spaces.</p>
            </Field>
            <Field label="Type">
              <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[13px]">
                {type === "voice" ? <Phone className="h-3.5 w-3.5 text-ai" /> : <MessageCircle className="h-3.5 w-3.5 text-success" />}
                {type === "voice" ? "Voice agent" : "Chat agent"}
              </span>
            </Field>
          </Card>

          {/* Tools */}
          <Card title="Tools" desc="The tools this agent can call. Reference them in the master prompt with {{ }}.">
            <div className="flex flex-wrap items-center gap-1.5">
              {tools.map((h) => {
                const t = getTool(h);
                return (
                  <span key={h} className="inline-flex items-center gap-1 rounded-md border border-ai/30 bg-ai/10 px-1.5 py-0.5 font-mono text-[11.5px] text-ai" title={t?.description}>
                    <Wrench className="h-3 w-3" /> {h}
                    <button onClick={() => setTools((ts) => ts.filter((x) => x !== h))} className="text-ai/70 hover:text-ai" aria-label={`Remove ${h}`}><X className="h-3 w-3" /></button>
                  </span>
                );
              })}
              {tools.length === 0 && <span className="text-[12px] text-muted-foreground">No tools added yet.</span>}
            </div>
            {available.length > 0 && (
              <div className="w-64">
                <Select key={tools.join(",")} value="" onValueChange={(h) => setTools((ts) => [...ts, h])}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="+ Add tool…" /></SelectTrigger>
                  <SelectContent>
                    {available.map((t) => (
                      <SelectItem key={t.handle} value={t.handle} className="text-sm">
                        <span className="font-mono">{t.handle}</span> <span className="text-muted-foreground">· {t.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </Card>

          {/* Master Prompt + Knowledge Base — connected by a vertical line */}
          <div>
            <MarkdownBox
              label="Master prompt"
              desc="The agent's core instructions. Type {{ to insert a tool."
              value={masterPrompt}
              onChange={setMasterPrompt}
              tools={tools}
              mentions
              placeholder="# Role&#10;You are…"
            />
            <div className="flex justify-center" aria-hidden>
              <span className="h-6 w-0.5 bg-border" />
            </div>
            <MarkdownBox
              label="Knowledge base"
              desc="Reference material the agent can draw on."
              value={knowledgeBase}
              onChange={setKnowledgeBase}
              tools={tools}
              placeholder="## Policies&#10;…"
            />
          </div>

          {/* Post-call analysis variables */}
          <Card title="Post-call analysis variables" desc="Values extracted from the call/chat transcript after it ends.">
            {postCall.length > 0 && (
              <div className="space-y-2">
                {postCall.map((v) => (
                  <div key={v.id} className="rounded-lg border border-border bg-background/60 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={v.name}
                        onChange={(e) => setPostCall((xs) => xs.map((x) => x.id === v.id ? { ...x, name: slug(e.target.value) } : x))}
                        placeholder="variable_name"
                        className="h-8 flex-1 font-mono text-xs"
                      />
                      <button onClick={() => setPostCall((xs) => xs.filter((x) => x.id !== v.id))} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <Textarea
                      value={v.prompt}
                      onChange={(e) => setPostCall((xs) => xs.map((x) => x.id === v.id ? { ...x, prompt: e.target.value } : x))}
                      placeholder="Prompt the LLM uses to capture this from the transcript…"
                      className="min-h-[52px] text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setPostCall((xs) => [...xs, { id: uid(), name: "", prompt: "" }])}>
              <Plus className="h-3.5 w-3.5" /> Add variable
            </Button>
          </Card>
        </div>
      </section>

      {/* Footer — centered */}
      <footer className="flex h-14 shrink-0 items-center justify-center gap-3 border-t border-border px-4">
        <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={close}>Cancel</Button>
        <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" disabled={name.trim().length < 2} onClick={save}>
          <Plus className="h-3.5 w-3.5" /> {mode === "edit" ? "Save agent" : "Create agent"}
        </Button>
      </footer>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Markdown box (preview / edit) + mention editor            */
/* --------------------------------------------------------- */

function MarkdownBox({
  label, desc, value, onChange, tools, mentions, placeholder,
}: {
  label: string; desc?: string; value: string; onChange: (v: string) => void;
  tools: string[]; mentions?: boolean; placeholder?: string;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold">{label}</h3>
          {desc && <p className="truncate text-[11px] text-muted-foreground">{desc}</p>}
        </div>
        <Button
          variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 text-[11px]"
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? <><Pencil className="h-3 w-3" /> Edit</> : <><Eye className="h-3 w-3" /> Preview</>}
        </Button>
      </div>
      {preview ? (
        <div className="px-4 py-3 text-[13px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />
      ) : mentions ? (
        <MentionEditor value={value} tools={tools} onChange={onChange} placeholder={placeholder} />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-[140px] rounded-none border-0 font-mono text-[12.5px] focus-visible:ring-0"
        />
      )}
    </div>
  );
}

const CHIP_CLASS = "agent-tool-chip mx-0.5 inline-flex items-center rounded-md border border-ai/30 bg-ai/10 px-1.5 py-0.5 align-baseline font-mono text-[0.85em] text-ai";

function valueToHtml(value: string): string {
  const escaped = value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const withChips = escaped.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi,
    (_m, h) => `<span class="${CHIP_CLASS}" contenteditable="false" data-tool="${h}">@${h}</span>`);
  return withChips.replace(/\n/g, "<br>");
}

function htmlToValue(root: HTMLElement): string {
  let out = "";
  const walk = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) { out += node.textContent ?? ""; return; }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tool = el.getAttribute("data-tool");
      if (tool) { out += `{{${tool}}}`; return; }
      if (el.tagName === "BR") { out += "\n"; return; }
      if (el.tagName === "DIV" && out && !out.endsWith("\n")) out += "\n";
      el.childNodes.forEach(walk);
    }
  };
  root.childNodes.forEach(walk);
  return out.replace(/ /g, " ");
}

function MentionEditor({
  value, tools, onChange, placeholder,
}: { value: string; tools: string[]; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ left: number; top: number; query: string } | null>(null);

  // Initialize content once on mount (uncontrolled thereafter to preserve caret).
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = valueToHtml(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => { if (ref.current) onChange(htmlToValue(ref.current)); };

  const checkMention = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) { setMenu(null); return; }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { setMenu(null); return; }
    const before = (node.textContent ?? "").slice(0, range.startOffset);
    const m = before.match(/\{\{([a-z0-9_]*)$/i);
    if (!m) { setMenu(null); return; }
    const rect = range.getClientRects()[0] ?? ref.current?.getBoundingClientRect();
    if (!rect) { setMenu(null); return; }
    setMenu({ left: rect.left, top: rect.bottom + 4, query: m[1].toLowerCase() });
  };

  const insertTool = (handle: string) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent ?? "";
    const idx = text.slice(0, range.startOffset).lastIndexOf("{{");
    if (idx < 0) return;
    const del = document.createRange();
    del.setStart(node, idx);
    del.setEnd(node, range.startOffset);
    del.deleteContents();

    const chip = document.createElement("span");
    chip.className = CHIP_CLASS;
    chip.setAttribute("contenteditable", "false");
    chip.setAttribute("data-tool", handle);
    chip.textContent = `@${handle}`;
    const space = document.createTextNode(" ");
    del.insertNode(space);
    del.insertNode(chip);

    const after = document.createRange();
    after.setStartAfter(space);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);

    setMenu(null);
    emit();
  };

  const matches = tools.filter((h) => h.includes(menu?.query ?? ""));

  return (
    <div className="relative">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={placeholder}
        onInput={() => { emit(); checkMention(); }}
        onKeyUp={checkMention}
        onMouseUp={checkMention}
        onKeyDown={(e) => { if (e.key === "Escape") setMenu(null); }}
        onBlur={() => setTimeout(() => setMenu(null), 120)}
        data-placeholder={placeholder}
        className="agent-mention-input min-h-[160px] w-full px-4 py-3 font-mono text-[12.5px] leading-relaxed outline-none [&[data-empty=true]]:text-muted-foreground empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
      />
      {menu && (
        <div
          className="fixed z-50 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-md"
          style={{ left: menu.left, top: menu.top }}
        >
          <p className="border-b border-border px-2.5 py-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">Insert tool</p>
          {matches.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] text-muted-foreground">{tools.length === 0 ? "Add tools above first." : "No match."}</p>
          ) : (
            matches.map((h) => (
              <button
                key={h}
                onMouseDown={(e) => { e.preventDefault(); insertTool(h); }}
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-mono text-[12px] hover:bg-accent"
              >
                <Wrench className="h-3 w-3 text-ai" /> {h}
              </button>
            ))
          )}
        </div>
      )}
    </div>
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
