import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTool } from "@/lib/tool-registry";
import { renderMarkdown } from "@/lib/markdown";
import type { AgentType, AgentRecord } from "@/lib/agent-data";

const DEFAULT_EVAL_PROMPT =
  "Review the full transcript and extract the following variables. Answer concisely, staying strictly within the definition of each variable. If a value can't be determined, respond with `unknown`.";

/**
 * Read-only view of a saved agent. The Agents section on main ships a
 * read-only surface — clicking an agent opens this view; Save/Cancel and
 * every input are disabled. The `mode` and `type` props are accepted so the
 * existing routes (new/edit) still typecheck, but neither influences rendering.
 */
export function AgentBuilder({ record }: { mode?: "create" | "edit"; type: AgentType; record?: AgentRecord }) {
  const name = record?.name ?? "";
  const tools = record?.tools ?? [];
  const masterPrompt = record?.masterPrompt ?? "";
  const knowledgeBase = record?.knowledgeBase ?? "";
  const evalPrompt = record?.evalPrompt ?? DEFAULT_EVAL_PROMPT;
  const evalVariables = record?.postCall ?? [];

  const status = record?.status ?? "draft";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Header — read-only view */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/agents" className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Agents</span>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="truncate font-mono text-[13.5px] font-medium">{name.trim() || "Agent"}</span>
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
      </header>

      {/* Body */}
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-8">
        <div className="mx-auto w-full max-w-3xl space-y-5">

          {/* Agent details — read-only, name only */}
          <Card title="Agent details">
            <Field label="Agent name">
              <Input value={name} readOnly className="h-9 font-mono text-sm" />
            </Field>
          </Card>

          {/* Tools — read-only chips only */}
          <Card title="Tools" desc="The tools this agent can call.">
            <div className="flex flex-wrap items-center gap-1.5">
              {tools.map((h) => {
                const t = getTool(h);
                return (
                  <span key={h} className="inline-flex items-center gap-1 rounded-md border border-ai/30 bg-ai/10 px-1.5 py-0.5 font-mono text-[11.5px] text-ai" title={t?.description}>
                    <Wrench className="h-3 w-3" /> {h}
                  </span>
                );
              })}
              {tools.length === 0 && <span className="text-[12px] text-muted-foreground">No tools added.</span>}
            </div>
          </Card>

          {/* Master Prompt + Knowledge Base — Markdown preview */}
          <div>
            <MarkdownBox label="Master prompt" desc="The agent's core instructions." value={masterPrompt} />
            <div className="flex justify-center" aria-hidden>
              <span className="h-6 w-0.5 bg-border" />
            </div>
            <MarkdownBox label="Knowledge base" desc="Reference material the agent can draw on." value={knowledgeBase} />
          </div>

          {/* Eval — read-only */}
          <Card title="Eval" desc="How the transcript is evaluated after each conversation.">
            <Field label="Eval Prompt">
              <Textarea value={evalPrompt} readOnly className="min-h-[80px] text-xs" />
            </Field>
            <Field label="Eval Variables">
              {evalVariables.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">No variables configured.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                        <th className="w-1/3 px-3 py-2 text-left font-medium">Key</th>
                        <th className="px-3 py-2 text-left font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {evalVariables.map((v) => (
                        <tr key={v.id} className="align-top">
                          <td className="px-3 py-2 font-mono text-[12px] text-foreground">{v.name}</td>
                          <td className="px-3 py-2 text-[12px] text-muted-foreground">{v.prompt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Field>
          </Card>
        </div>
      </section>

      {/* Footer — Save + Cancel present but disabled (read-only) */}
      <footer className="flex h-14 shrink-0 items-center justify-center gap-3 border-t border-border px-4">
        <Button variant="outline" size="sm" className="h-8 px-4 text-xs" disabled>Cancel</Button>
        <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" disabled>
          Save agent
        </Button>
      </footer>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Markdown box (preview-only)                               */
/* --------------------------------------------------------- */

/**
 * Read-only Markdown viewer used for Master Prompt and Knowledge Base.
 * `renderMarkdown` already turns `{{tool}}` mentions into inline chips, so we
 * pass the source value through unchanged.
 */
function MarkdownBox({ label, desc, value }: { label: string; desc?: string; value: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold">{label}</h3>
          {desc && <p className="truncate text-[11px] text-muted-foreground">{desc}</p>}
        </div>
      </div>
      <div
        className="px-4 py-3 text-[13px]"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
      />
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
