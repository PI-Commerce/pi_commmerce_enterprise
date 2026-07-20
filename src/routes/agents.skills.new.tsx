/**
 * Skills editor — the dedicated detail page for a Skill.
 *
 * Skills split into two shapes; the editor picks the right form:
 *   - Function skill  — deterministic compute. Fields: name, description,
 *                       definition body (code), inputs, outputs.
 *   - LLM skill       — prompt template invoked with variables. Fields: name,
 *                       description, model, prompt template, inputs, outputs.
 *
 * This is deliberately NOT the Tools editor — Skills are internal capabilities,
 * they don't have HTTP methods, URLs, headers, auth, or timeouts. Trimming the
 * form to just what a Skill is makes it obvious what you're looking at.
 *
 * v1 is read-only (mirrors the Tools editor pattern). All fields render from
 * the seeded ToolDef in `lib/tool-registry.ts`; edits are captured but not
 * persisted. Back-nav goes to /agents?tab=skills.
 */

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Code2, FileText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTool, SKILL_TYPE_LABEL, type ToolDef, type ToolInput, type ToolOutput } from "@/lib/tool-registry";

export const Route = createFileRoute("/agents/skills/new")({
  component: SkillEditor,
  validateSearch: (s: Record<string, unknown>): { skill?: string } => ({
    skill: typeof s.skill === "string" ? s.skill : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Skill · Pi Agents FinServ" },
      { name: "description", content: "View and edit an internal Skill (Function or LLM)." },
    ],
  }),
});

function SkillEditor() {
  const { skill: handle } = Route.useSearch();
  const existing = handle ? getTool(handle) : undefined;
  const kind: "function" | "llm" = existing?.skillType === "llm" ? "llm" : "function";
  const Icon = kind === "llm" ? FileText : Code2;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Header — back to Skills tab, breadcrumb, type chip */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/agents" search={{ tab: "skills" }}
            className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Skills</span>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="truncate font-mono text-[13.5px] font-medium">{existing?.handle ?? "New skill"}</span>
          <span className={cn(
            "ml-2 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide",
            kind === "llm" ? "border-ai/30 bg-ai/10 text-ai" : "border-border bg-secondary/40 text-muted-foreground",
          )}>
            <Icon className="h-3 w-3" />
            {SKILL_TYPE_LABEL[kind]}
          </span>
        </div>
      </header>

      {/* Body — read-only view for v1 */}
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-8">
        <fieldset disabled className="skill-view-fieldset mx-auto block w-full max-w-3xl min-w-0 space-y-5 border-0 p-0">
          <style>{`
            .skill-view-fieldset,
            .skill-view-fieldset input:disabled,
            .skill-view-fieldset textarea:disabled { cursor: not-allowed !important; }
          `}</style>

          {!existing ? (
            <EmptyState />
          ) : kind === "llm" ? (
            <LlmSkillView skill={existing} />
          ) : (
            <FunctionSkillView skill={existing} />
          )}
        </fieldset>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Function-Skill view                                                */
/* ------------------------------------------------------------------ */

function FunctionSkillView({ skill }: { skill: ToolDef }) {
  return (
    <>
      <Card
        title="Skill details"
        subtitle="A Function skill is deterministic compute — no external API, no auth, no side-effects."
      >
        <FormRow label="Skill name">
          <ReadInput value={skill.handle} className="font-mono" />
          <Hint>Lowercase, no spaces — how agents and campaign nodes reference this skill.</Hint>
        </FormRow>
        <FormRow label="Description">
          <ReadTextarea value={skill.description.replace(/\s*\(Skill.*\)\s*$/i, "")} rows={2} />
        </FormRow>
      </Card>

      <Card title="Definition" subtitle="The executable logic. Read-only preview — v1 runtime is out of scope.">
        <CodeBlock>{skill.skillFunctionBody ?? "// No definition seeded for this skill."}</CodeBlock>
      </Card>

      <Card title="Inputs" subtitle="The arguments this skill needs. Wire each one to lead memory or CSV data when you drop the skill into a campaign.">
        <InputsTable rows={skill.inputs} />
      </Card>

      <Card title="Outputs" subtitle="Values this skill returns. They become downstream variables agents and conditionals can read.">
        <OutputsTable rows={skill.outputs} enumValues={skill.outputEnumValues} />
      </Card>

      <UsageCallout>
        Drop this skill upstream of a Voice / WhatsApp node via an{" "}
        <span className="font-mono text-foreground">API Tool Call</span> node — or reference{" "}
        <span className="font-mono text-foreground">@{skill.handle}</span> in an Agent's tool list.
        The campaign builder maps each input to a lead field; the skill's outputs then appear
        in the downstream variable picker.
      </UsageCallout>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* LLM-Skill view                                                     */
/* ------------------------------------------------------------------ */

function LlmSkillView({ skill }: { skill: ToolDef }) {
  return (
    <>
      <Card
        title="Skill details"
        subtitle="An LLM skill is a prompt template invoked with variables. The output is free-form model text."
      >
        <FormRow label="Skill name">
          <ReadInput value={skill.handle} className="font-mono" />
          <Hint>Lowercase, no spaces — referenced from agents and campaign nodes.</Hint>
        </FormRow>
        <FormRow label="Description">
          <ReadTextarea value={skill.description.replace(/\s*\(LLM Skill.*\)\s*$/i, "")} rows={2} />
        </FormRow>
        <FormRow label="Model">
          <ReadInput value={skill.skillPromptModel ?? "claude-sonnet-4.5"} className="font-mono" />
        </FormRow>
      </Card>

      <Card title="Prompt template" subtitle="Markdown-authored instruction. Variables in {{double braces}} are filled from the mapped inputs at run-time.">
        <PromptBlock>{skill.skillPromptTemplate ?? "// No prompt template seeded."}</PromptBlock>
      </Card>

      <Card title="Inputs" subtitle="Variables referenced from the prompt template. Wire each one to lead memory or CSV data in the campaign builder.">
        <InputsTable rows={skill.inputs} />
      </Card>

      <Card title="Output" subtitle="A single free-form value returned by the model.">
        <OutputsTable rows={skill.outputs} enumValues={skill.outputEnumValues} />
      </Card>

      <UsageCallout>
        Reference <span className="font-mono text-foreground">@{skill.handle}</span> from an Agent's
        tool list, or drop it upstream of a WhatsApp / CRM-write node via an{" "}
        <span className="font-mono text-foreground">API Tool Call</span> node. The model returns a
        text value that downstream nodes read via <span className="font-mono text-foreground">{`{{skill.${skill.outputs[0]?.varName ?? "output"}}}`}</span>.
      </UsageCallout>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Shared building blocks                                             */
/* ------------------------------------------------------------------ */

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function ReadInput({ value, className }: { value: string; className?: string }) {
  const [v] = useState(value);
  return (
    <input
      disabled
      value={v}
      className={cn(
        "block w-full rounded-md border border-border bg-background/60 px-3 py-2 text-[13px] text-foreground shadow-none",
        className,
      )}
      readOnly
    />
  );
}

function ReadTextarea({ value, rows = 3 }: { value: string; rows?: number }) {
  const [v] = useState(value);
  return (
    <textarea
      disabled
      value={v}
      rows={rows}
      className="block w-full resize-none rounded-md border border-border bg-background/60 px-3 py-2 text-[13px] text-foreground shadow-none"
      readOnly
    />
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-muted-foreground">{children}</p>;
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="max-h-[420px] overflow-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-[12.5px] leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  );
}

function PromptBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-4 text-[12.5px] leading-relaxed text-foreground">
      {children}
    </pre>
  );
}

function InputsTable({ rows }: { rows: ToolInput[] }) {
  if (!rows.length) {
    return <p className="text-[12px] text-muted-foreground">No inputs.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Name</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Default binding</th>
            <th className="px-3 py-2 text-left font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="px-3 py-2 font-mono">{r.key}</td>
              <td className="px-3 py-2">
                <span className="rounded-md border border-border bg-secondary/40 px-1.5 py-0.5 text-[11px]">{r.dataType}</span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {r.source === "campaign" && r.value ? (
                  <span className="font-mono">contact.{r.value}</span>
                ) : r.source === "constant" && r.value ? (
                  <span className="font-mono">{r.value}</span>
                ) : (
                  <span className="italic">— set in campaign builder —</span>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutputsTable({ rows, enumValues }: { rows: ToolOutput[]; enumValues?: Partial<Record<string, string[]>> }) {
  if (!rows.length) return <p className="text-[12px] text-muted-foreground">No outputs.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Name</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Values / description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const ev = enumValues?.[r.varName];
            return (
              <tr key={r.varName}>
                <td className="px-3 py-2 font-mono">{r.varName}</td>
                <td className="px-3 py-2">
                  <span className="rounded-md border border-border bg-secondary/40 px-1.5 py-0.5 text-[11px]">
                    {ev ? "enum" : (r.dataType ?? "String")}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {ev ? (
                    <div className="flex flex-wrap gap-1">
                      {ev.map((v) => (
                        <span key={v} className="inline-flex items-center rounded-full border border-ai/25 bg-ai/5 px-1.5 py-0.5 text-[10.5px] font-medium text-ai">{v}</span>
                      ))}
                    </div>
                  ) : (
                    r.description
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UsageCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai" />
      <p className="leading-snug">{children}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-8 py-16 text-center">
      <p className="text-sm text-muted-foreground">No skill selected. Return to the Skills tab and pick one.</p>
    </div>
  );
}
