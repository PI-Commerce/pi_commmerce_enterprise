/**
 * Right-side inspector for the agent builder. Which panel shows depends on the
 * selected node kind:
 *   - agent      → Prompt Editor (master prompt) + agent details + Eval
 *   - model      → shared model config picker (Claude model + masked key)
 *   - knowledge  → Knowledge Base editor with a live Markdown preview
 *   - tool       → read-only tool summary + remove
 * Reuses the shared Section/Field primitives so it reads like the campaign
 * ConfigPanel.
 */
import { X, Trash2, Wrench, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Section, Field } from "@/components/workflow/config-primitives";
import { renderMarkdown } from "@/lib/markdown";
import { getTool } from "@/lib/tool-registry";
import { useModelConfigs, CLAUDE_MODELS, maskKey, saveModelConfig } from "@/lib/model-config";
import type { AgentNodeData } from "./nodes";

export function AgentConfigPanel({
  node, onChange, onClose, onDelete,
}: {
  node: { id: string; data: AgentNodeData } | null;
  onChange: (patch: Partial<AgentNodeData>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  if (!node) return null;
  const { data } = node;

  return (
    <div className="absolute right-0 top-0 z-20 flex h-full w-[360px] flex-col border-l border-border bg-background/95 shadow-[-8px_0_24px_-16px_rgba(0,0,0,0.3)] backdrop-blur-xl">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="text-[13px] font-semibold">{panelTitle(data.kind)}</h2>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {data.kind === "agent" && <AgentPanel data={data} onChange={onChange} />}
        {data.kind === "model" && <ModelPanel data={data} onChange={onChange} />}
        {data.kind === "knowledge" && <KnowledgePanel data={data} onChange={onChange} />}
        {data.kind === "tool" && <ToolPanel data={data} onDelete={onDelete} />}
      </div>
    </div>
  );
}

function panelTitle(kind: AgentNodeData["kind"]): string {
  switch (kind) {
    case "agent": return "Prompt Editor";
    case "model": return "Model";
    case "knowledge": return "Knowledge Base";
    case "tool": return "Tool";
  }
}

/* ------------------------------- Agent hub ------------------------------- */

function AgentPanel({ data, onChange }: { data: AgentNodeData; onChange: (p: Partial<AgentNodeData>) => void }) {
  const postCall = data.postCall ?? [];
  return (
    <>
      <Section title="Agent">
        <Field label="Name" required>
          <Input
            value={data.name ?? ""}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="agent_name"
            className="h-9 font-mono text-sm"
          />
        </Field>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={data.agentType} onValueChange={(v) => onChange({ agentType: v as AgentNodeData["agentType"] })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="voice">Voice</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={data.status} onValueChange={(v) => onChange({ status: v as AgentNodeData["status"] })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Master prompt">
        <p className="mb-2 text-[11px] text-muted-foreground">
          The agent's core instructions. Reference tools with <code className="font-mono">{"{{tool}}"}</code>.
        </p>
        <Textarea
          value={data.masterPrompt ?? ""}
          onChange={(e) => onChange({ masterPrompt: e.target.value })}
          placeholder="# Role&#10;You are…"
          className="min-h-[220px] font-mono text-[12px] leading-relaxed"
        />
      </Section>

      <Section title="Eval">
        <Field label="Eval prompt">
          <Textarea
            value={data.evalPrompt ?? ""}
            onChange={(e) => onChange({ evalPrompt: e.target.value })}
            placeholder="Review the transcript and extract…"
            className="min-h-[80px] text-[12px]"
          />
        </Field>
        {postCall.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Eval variables</p>
            {postCall.map((v) => (
              <div key={v.id} className="rounded-md border border-border bg-secondary/30 px-2.5 py-1.5">
                <span className="font-mono text-[11.5px] text-foreground">{v.name}</span>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{v.prompt}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

/* --------------------------------- Model --------------------------------- */

function ModelPanel({ data, onChange }: { data: AgentNodeData; onChange: (p: Partial<AgentNodeData>) => void }) {
  const configs = useModelConfigs();
  const selected = configs.find((c) => c.id === data.modelConfigId);
  return (
    <>
      <Section title="Model configuration">
        <p className="mb-2 text-[11px] text-muted-foreground">
          A shared Claude config (model + key) this agent runs on. Configs are reusable across agents.
        </p>
        <Field label="Config" required>
          <Select value={data.modelConfigId} onValueChange={(v) => onChange({ modelConfigId: v })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select config…" /></SelectTrigger>
            <SelectContent>
              {configs.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      {selected && (
        <Section title="Details">
          <div className="space-y-3 rounded-xl border border-border bg-card/50 p-3">
            <Field label="Claude model">
              <Select value={selected.model} onValueChange={(v) => saveModelConfig({ ...selected, model: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLAUDE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="API key">
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-mono text-[12px] text-muted-foreground">{maskKey(selected.apiKey)}</span>
              </div>
              <p className="mt-1 text-[10.5px] text-muted-foreground">
                Keys are managed in the model config and never shown in full.
              </p>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Temperature">
                <Input
                  type="number" step="0.1" min="0" max="1"
                  value={selected.temperature ?? ""}
                  onChange={(e) => saveModelConfig({ ...selected, temperature: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="h-9 text-sm"
                />
              </Field>
              <Field label="Max tokens">
                <Input
                  type="number" step="128" min="1"
                  value={selected.maxTokens ?? ""}
                  onChange={(e) => saveModelConfig({ ...selected, maxTokens: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="h-9 text-sm"
                />
              </Field>
            </div>
          </div>
        </Section>
      )}
    </>
  );
}

/* ------------------------------- Knowledge ------------------------------- */

function KnowledgePanel({ data, onChange }: { data: AgentNodeData; onChange: (p: Partial<AgentNodeData>) => void }) {
  const value = data.knowledgeBase ?? "";
  return (
    <>
      <Section title="Knowledge base">
        <p className="mb-2 text-[11px] text-muted-foreground">
          Reference material (Markdown) the agent can draw on — policies, SLAs, offers.
        </p>
        <Textarea
          value={value}
          onChange={(e) => onChange({ knowledgeBase: e.target.value })}
          placeholder="## Refund policy&#10;Refunds are processed within…"
          className="min-h-[220px] font-mono text-[12px] leading-relaxed"
        />
      </Section>
      {value.trim() && (
        <Section title="Preview">
          <div
            className="rounded-xl border border-border bg-card px-4 py-3 text-[13px]"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
          />
        </Section>
      )}
    </>
  );
}

/* --------------------------------- Tool ---------------------------------- */

function ToolPanel({ data, onDelete }: { data: AgentNodeData; onDelete: () => void }) {
  const tool = data.toolHandle ? getTool(data.toolHandle) : undefined;
  return (
    <>
      <Section title="Tool">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-ai/30 bg-ai/10 px-1.5 py-0.5 font-mono text-[12px] text-ai">
            <Wrench className="h-3 w-3" /> {data.toolHandle}
          </span>
        </div>
        {tool && <p className="mt-2 text-[12px] text-muted-foreground">{tool.description}</p>}
      </Section>

      {tool && (
        <>
          {tool.inputs.length > 0 && (
            <Section title="Inputs">
              <div className="space-y-1.5">
                {tool.inputs.map((i) => (
                  <div key={i.key} className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-2.5 py-1.5">
                    <span className="font-mono text-[11.5px]">{i.key}</span>
                    <span className="text-[10.5px] text-muted-foreground">{i.dataType} · {i.source}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {tool.outputs.length > 0 && (
            <Section title="Outputs">
              <div className="space-y-1.5">
                {tool.outputs.map((o) => (
                  <div key={o.varName} className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-2.5 py-1.5">
                    <span className="font-mono text-[11.5px]">{o.varName}</span>
                    <span className="text-[10.5px] text-muted-foreground">{o.dataType ?? "String"}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      <Button variant="outline" size="sm" onClick={onDelete} className="mt-2 h-8 w-full gap-1.5 text-xs text-destructive hover:text-destructive">
        <Trash2 className="h-3.5 w-3.5" /> Remove tool
      </Button>
    </>
  );
}
