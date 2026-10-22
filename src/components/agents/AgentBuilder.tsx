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
import {
  ChevronLeft, ChevronDown, Save, Plus, X, Trash2, Eye, Pencil, Phone, MessageCircle, Wrench, Braces,
  FileText, SlidersHorizontal, Play, Globe, PhoneCall, Check, Sparkles, Send, Bot, RotateCcw,
  Mic, MicOff, PhoneOff, Loader2, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOLS, getTool } from "@/lib/tool-registry";
import { renderMarkdown } from "@/lib/markdown";
import type { AgentType, AgentRecord, PostCallVar, InputVar, AgentSettings, SpeechRate, Interruption, ReplyLength } from "@/lib/agent-data";
import { saveDraftVersion, publishVersion, getVersions, getEditableVersion, revertToVersion } from "@/lib/agent-data";
import { VersionSwitcher, VersionStatePill } from "@/components/agents/version-chip";
import {
  LANGUAGES, TTS_PROVIDERS, PROVIDER_LABELS, PHONE_NUMBERS,
  voicesForLang, getPhoneNumber, type TtsProvider,
} from "@/lib/voice-data";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "_");
let seq = 0;
const uid = () => `pcv_${++seq}_${Date.now().toString(36)}`;

export function AgentBuilder({ mode, type, record, selectedVersion }: { mode: "create" | "edit"; type: AgentType; record?: AgentRecord; selectedVersion?: number }) {
  const navigate = useNavigate();

  // Versions (edit mode only). `selected` drives which version is being viewed
  // and determines whether Save/Publish or Revert is offered.
  const versions = mode === "edit" && record?.id ? getVersions(record.id) : [];
  const editable = mode === "edit" && record?.id ? getEditableVersion(record.id) : undefined;
  const selected = versions.find((v) => v.version === selectedVersion) ?? editable;
  const viewingArchived = selected?.state === "archived";

  const [name, setName] = useState(record?.name ?? "");
  const [tools, setTools] = useState<string[]>(record?.tools ?? []);
  const [inputVars, setInputVars] = useState<InputVar[]>(record?.inputVars ?? []);
  const [masterPrompt, setMasterPrompt] = useState(record?.masterPrompt ?? "");
  const [knowledgeBase, setKnowledgeBase] = useState(record?.knowledgeBase ?? "");
  const [postCall, setPostCall] = useState<PostCallVar[]>(record?.postCall ?? []);

  // Settings (voice agents): speech + telephony config.
  const [settings, setSettings] = useState<AgentSettings>(record?.settings ?? { primaryLang: "en-IN" });
  const patchSettings = (p: Partial<AgentSettings>) => setSettings((s) => ({ ...s, ...p }));

  // Which left-nav section is showing.
  const [section, setSection] = useState<"details" | "settings">("details");
  // Test-agent modal.
  const [testOpen, setTestOpen] = useState(false);

  // Names available as {{ }} mentions in the prompt (voice-only input variables).
  const varNames = inputVars.map((v) => v.name).filter(Boolean);

  const close = () => navigate({ to: "/agents" });
  const goView = () => close();
  const pickVersion = (v: number) => {
    if (!record?.id) return;
    navigate({ to: "/agents/$id", params: { id: record.id }, search: { v } });
  };
  const revert = () => {
    if (!record?.id || !selected) return;
    revertToVersion(record.id, selected.version);
    toast.success(`Reverted to v${selected.version}`, { description: "This version is now live." });
    goView();
  };

  const available = TOOLS.filter((t) => !tools.includes(t.handle));
  const status = mode === "edit" ? record?.status ?? "draft" : "draft";

  // Assemble the current working state into an AgentRecord snapshot.
  const buildRecord = (): AgentRecord => ({
    // In edit mode keep the existing id; when creating (even from a template)
    // derive a fresh id from the name so a template's id is never reused.
    id: (mode === "edit" ? record?.id : undefined) ?? (slug(name) || "agent"),
    name: name.trim(),
    type,
    status,
    tools,
    inputVars,
    masterPrompt,
    knowledgeBase,
    postCall,
    settings,
    dispositions: record?.dispositions,
  });

  const createAgent = () => {
    toast.success(`${name.trim() || "Agent"} created`, {
      description: `${type === "voice" ? "Voice" : "Chat"} agent with ${tools.length} tool${tools.length === 1 ? "" : "s"}.`,
    });
    // After a successful create, surface the test-call flow (voice only) instead of leaving.
    if (type === "voice") setTestOpen(true);
    else close();
  };

  const saveDraft = () => {
    if (mode === "create" || !record?.id) { createAgent(); return; }
    saveDraftVersion(record.id, buildRecord());
    toast.success("Saved as draft", { description: "Publish it when you're ready to go live." });
    goView();
  };

  const publish = () => {
    if (mode === "create" || !record?.id) { createAgent(); return; }
    publishVersion(record.id, buildRecord());
    toast.success("Published", { description: "This agent is now live." });
    goView();
  };

  // Closing the test modal after a create returns the user to the agents list.
  const closeTest = () => { setTestOpen(false); if (mode === "create") close(); };

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
          {mode === "edit" && selected ? (
            <>
              <VersionSwitcher versions={versions} selected={selected} onPick={pickVersion} />
              <VersionStatePill state={selected.state} />
            </>
          ) : (
            <span className={cn(
              "ml-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
              status === "live" ? "border-success/30 bg-success/10 text-success"
                : status === "paused" ? "border-muted-foreground/30 bg-muted text-muted-foreground"
                : "border-warning/30 bg-warning/10 text-warning",
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", status === "live" ? "bg-success" : status === "paused" ? "bg-muted-foreground" : "bg-warning")} />
              {status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={close}>Cancel</Button>
          {mode === "edit" && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setTestOpen(true)}>
              <Play className="h-3.5 w-3.5" /> Test agent
            </Button>
          )}
          {viewingArchived ? (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={revert}>
              <RotateCcw className="h-3.5 w-3.5" /> Revert to v{selected?.version}
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={saveDraft}>
              <Save className="h-3.5 w-3.5" /> Save as draft
            </Button>
          )}
        </div>
      </header>

      {/* Body: left nav + content */}
      <div className="flex min-h-0 flex-1">
        <nav className="w-52 shrink-0 border-r border-border px-2 py-3 space-y-0.5">
          <BuilderNavItem icon={FileText} label="Agent Details" active={section === "details"} onClick={() => setSection("details")} />
          <BuilderNavItem icon={SlidersHorizontal} label="Settings" active={section === "settings"} onClick={() => setSection("settings")} />
        </nav>

        <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-8">
          <div className="mx-auto w-full max-w-3xl space-y-5">
            {section === "settings" ? (
              <SettingsPane type={type} settings={settings} onChange={patchSettings} />
            ) : (
             <>

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

          {/* Input variables — bound per run and referenced in the prompt with {{ }} */}
          <Card title="Input variables" desc="The input variables this agent can call. Reference them in the master prompt with {{ }}.">
            <div className="flex flex-wrap items-center gap-1.5">
              {inputVars.map((v) => (
                <span key={v.id} className="inline-flex items-center gap-1 rounded-md border border-ai/30 bg-ai/10 px-1.5 py-0.5 font-mono text-[11.5px] text-ai">
                  <Braces className="h-3 w-3" />
                  <input
                    value={v.name}
                    onChange={(e) => setInputVars((vs) => vs.map((x) => x.id === v.id ? { ...x, name: slug(e.target.value) } : x))}
                    placeholder="variable_name"
                    size={Math.max(v.name.length || 13, 4)}
                    className="bg-transparent font-mono text-[11.5px] text-ai outline-none placeholder:text-ai/50"
                  />
                  <button onClick={() => setInputVars((vs) => vs.filter((x) => x.id !== v.id))} className="text-ai/70 hover:text-ai" aria-label={`Remove ${v.name || "variable"}`}><X className="h-3 w-3" /></button>
                </span>
              ))}
              {inputVars.length === 0 && <span className="text-[12px] text-muted-foreground">No input variables added yet.</span>}
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setInputVars((vs) => [...vs, { id: uid(), name: "" }])}>
              <Plus className="h-3.5 w-3.5" /> Add variable
            </Button>
          </Card>

          {/* Tools */}
          <Card title="Tools" desc="The tools this agent can call. Reference them in the master prompt with @.">
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
              desc="The agent's core instructions. Type @ for a tool, {{ for an input variable."
              value={masterPrompt}
              onChange={setMasterPrompt}
              tools={tools}
              vars={varNames}
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
              vars={varNames}
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
                    <PostCallValues
                      values={v.values ?? []}
                      onChange={(vals) => setPostCall((xs) => xs.map((x) => x.id === v.id ? { ...x, values: vals } : x))}
                    />
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setPostCall((xs) => [...xs, { id: uid(), name: "", prompt: "" }])}>
              <Plus className="h-3.5 w-3.5" /> Add variable
            </Button>
          </Card>
             </>
            )}
          </div>
        </section>

        {testOpen && (
          <TestAgentPanel
            agentName={name.trim() || record?.name || "agent"}
            type={type}
            inputVars={inputVars}
            settings={settings}
            onClose={closeTest}
          />
        )}
      </div>

      {/* Footer — Ask Pi centered, actions right */}
      <footer className="relative flex h-14 shrink-0 items-center justify-end gap-3 border-t border-border px-4">
        <Button
          variant="outline"
          size="sm"
          className="absolute left-1/2 h-8 -translate-x-1/2 gap-1.5 px-4 text-xs"
          onClick={() => toast.info("Ask Pi", { description: "Describe what you want and Pi will help draft this agent." })}
        >
          <Sparkles className="h-3.5 w-3.5 text-ai" /> Ask Pi
        </Button>
        <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={close}>Cancel</Button>
        {mode === "edit" ? (
          viewingArchived ? (
            <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={revert}>
              <RotateCcw className="h-3.5 w-3.5" /> Revert to v{selected?.version}
            </Button>
          ) : (
            <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" disabled={name.trim().length < 2} onClick={publish}>
              <Check className="h-3.5 w-3.5" /> Publish
            </Button>
          )
        ) : (
          <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" disabled={name.trim().length < 2} onClick={createAgent}>
            <Plus className="h-3.5 w-3.5" /> Create agent
          </Button>
        )}
      </footer>

    </div>
  );
}

/* --------------------------------------------------------- */
/* Left-nav item                                             */
/* --------------------------------------------------------- */

function BuilderNavItem({
  icon: Icon, label, active, onClick,
}: { icon: React.ComponentType<{ className?: string }>; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
        active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
      {label}
    </button>
  );
}

/* --------------------------------------------------------- */
/* Worded radio-option list (speech rate, interruption, …)   */
/* --------------------------------------------------------- */

function OptionList<T extends string>({
  options, value, onChange,
}: {
  options: { id: T; title: string; desc: string }[];
  value?: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2.5 rounded-xl bg-secondary/40 p-3">
      {options.map((o) => {
        const selected = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              "flex w-full items-start justify-between gap-3 rounded-lg border bg-background px-3.5 py-3 text-left transition-colors",
              selected ? "border-foreground" : "border-transparent hover:border-border",
            )}
          >
            <div>
              <div className="text-[14px] font-semibold">{o.title}</div>
              <div className="mt-0.5 text-[12.5px] text-muted-foreground">{o.desc}</div>
            </div>
            <span className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
              selected ? "border-foreground bg-foreground text-background" : "border-muted-foreground/40",
            )}>
              {selected && <Check className="h-3.5 w-3.5" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------- */
/* Settings pane: language + voice + telephony               */
/* --------------------------------------------------------- */

function SettingsPane({ type, settings, onChange }: { type: AgentType; settings: AgentSettings; onChange: (p: Partial<AgentSettings>) => void }) {
  const [provider, setProvider] = useState<TtsProvider | "all">("all");
  const [showAll, setShowAll] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const isVoice = type === "voice";

  const langPool = voicesForLang(settings.primaryLang);
  const filtered = provider === "all" ? langPool : langPool.filter((v) => v.provider === provider);
  const shown = showAll ? filtered : filtered.slice(0, 6);

  return (
    <>
      {/* Language */}
      <Card title="Language" desc={isVoice ? "Set the primary language the assistant speaks." : "Set the primary language the assistant replies in."}>
        <Field label="Primary language" required>
          <Select value={settings.primaryLang ?? "en-IN"} onValueChange={(v) => onChange({ primaryLang: v })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code} className="text-sm">{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </Card>

      {isVoice && (
      <>
      {/* Voice */}
      <Card title="Set up voice" desc="Pick the assistant's voice. The list is filtered to your primary language.">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", ...TTS_PROVIDERS] as const).map((p) => {
            const active = provider === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => { setProvider(p); setShowAll(false); }}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] transition-colors",
                  active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {p === "all" ? "All voices" : PROVIDER_LABELS[p]}
              </button>
            );
          })}
        </div>

        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {shown.map((v) => {
            const selected = settings.voiceId === v.id;
            return (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={() => onChange({ voiceId: v.id })}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange({ voiceId: v.id }); } }}
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-3 py-2.5 outline-none transition-colors",
                  selected ? "bg-ai/5" : "hover:bg-accent/40",
                )}
              >
                <span className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
                  selected ? "bg-ai text-white" : "bg-secondary text-muted-foreground",
                )}>
                  {v.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium text-foreground">{v.name}</span>
                    {v.badge && (
                      <span className="shrink-0 rounded-full border border-ai/30 bg-ai/10 px-1.5 py-0.5 text-[10px] font-medium text-ai">{v.badge}</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{PROVIDER_LABELS[v.provider]} · {v.tone}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toast.info(`Previewing ${v.name}`, { description: PROVIDER_LABELS[v.provider] }); }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground hover:bg-accent"
                  aria-label={`Preview ${v.name}`}
                >
                  <Play className="h-3 w-3" />
                </button>
                <span className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  selected ? "border-ai bg-ai text-white" : "border-muted-foreground/40",
                )}>
                  {selected && <Check className="h-3 w-3" />}
                </span>
              </div>
            );
          })}
        </div>
        {filtered.length > 6 && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="text-[12.5px] font-medium text-ai hover:underline">
            {showAll ? "Show fewer voices" : `Show all ${filtered.length} voices`}
          </button>
        )}
      </Card>

      {/* Telephony */}
      <Card title="Phone number" desc="The number this agent places and receives calls from.">
        <Field label="Outbound number">
          <Select value={settings.phoneNumberId ?? ""} onValueChange={(v) => onChange({ phoneNumberId: v })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a number…" /></SelectTrigger>
            <SelectContent>
              {PHONE_NUMBERS.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-sm">
                  <span className="font-mono">{p.e164}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Card>
      </>
      )}

      {/* Advanced configuration (collapsed by default) */}
      <div className="rounded-xl border border-border">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
          aria-expanded={advancedOpen}
        >
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <div className="text-[14px] font-semibold">Advanced configuration</div>
            <div className="text-[12px] text-muted-foreground">
              {isVoice ? "Fine-tune speaking pace, interruptions, call limits, and inactivity handling." : "Fine-tune how long the assistant's replies run."}
            </div>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", advancedOpen && "rotate-180")} />
        </button>

        {advancedOpen && (
          <div className="space-y-5 border-t border-border p-4">
            {isVoice ? (
              <>
                {/* Speech rate */}
                <div>
                  <div className="text-[14px] font-semibold">Speech rate</div>
                  <div className="mb-2.5 text-[12.5px] text-muted-foreground">How fast the assistant speaks. Pick a pace rather than a number.</div>
                  <OptionList<SpeechRate>
                    value={settings.speechRate}
                    onChange={(v) => onChange({ speechRate: v })}
                    options={[
                      { id: "slow",    title: "Measured", desc: "Slower and deliberate. Easier to follow for detailed or sensitive calls." },
                      { id: "natural", title: "Natural",  desc: "Conversational, everyday pace. A good default for most agents." },
                      { id: "fast",    title: "Brisk",    desc: "Quicker delivery. Keeps high-intent calls short and snappy." },
                    ]}
                  />
                </div>

                {/* Interruption sensitivity */}
                <div>
                  <div className="text-[14px] font-semibold">Interruption sensitivity</div>
                  <div className="mb-2.5 text-[12.5px] text-muted-foreground">How readily the assistant stops talking when the caller jumps in.</div>
                  <OptionList<Interruption>
                    value={settings.interruption}
                    onChange={(v) => onChange({ interruption: v })}
                    options={[
                      { id: "sensitive", title: "Eager",    desc: "Yields the moment the caller speaks. Best for fast back-and-forth." },
                      { id: "balanced",  title: "Balanced", desc: "Ignores short fillers like “okay” or “hmm” but stops for real speech." },
                      { id: "strict",    title: "Firm",     desc: "Holds the floor. The caller must keep talking before it pauses." },
                    ]}
                  />
                </div>

                {/* Max call duration */}
                <div className="border-t border-border pt-5">
                  <div className="text-[14px] font-semibold">Max call duration</div>
                  <div className="mb-2.5 text-[12.5px] text-muted-foreground">Hard cap on a single call. The agent wraps up and hangs up when it's reached.</div>
                  <Select
                    value={String(settings.maxCallDuration ?? 5)}
                    onValueChange={(v) => onChange({ maxCallDuration: Number(v) })}
                  >
                    <SelectTrigger className="h-9 w-full text-sm sm:w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 5, 10, 15, 20, 30].map((m) => (
                        <SelectItem key={m} value={String(m)} className="text-sm">{m} minute{m === 1 ? "" : "s"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Inactivity timer + nudge message */}
                <div className="border-t border-border pt-5">
                  <div className="text-[14px] font-semibold">Inactivity timer</div>
                  <div className="mb-2.5 text-[12.5px] text-muted-foreground">If the caller goes silent for this long, the agent speaks the nudge message to re-engage them.</div>
                  <Select
                    value={String(settings.inactivityTimeout ?? 10)}
                    onValueChange={(v) => onChange({ inactivityTimeout: Number(v) })}
                  >
                    <SelectTrigger className="h-9 w-full text-sm sm:w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[5, 8, 10, 15, 20, 30].map((s) => (
                        <SelectItem key={s} value={String(s)} className="text-sm">{s} seconds</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="mt-3">
                    <Label className="text-[12.5px] font-medium">Nudge message</Label>
                    <Textarea
                      value={settings.nudgeMessage ?? ""}
                      onChange={(e) => onChange({ nudgeMessage: e.target.value })}
                      placeholder="Are you still there? I can wait a moment if you need one."
                      rows={2}
                      className="mt-1.5 text-sm"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">Spoken when the inactivity timer fires. Leave empty to stay silent and keep waiting.</p>
                  </div>
                </div>
              </>
            ) : (
              /* Reply length (chat) */
              <div>
                <div className="text-[14px] font-semibold">Reply length</div>
                <div className="mb-2.5 text-[12.5px] text-muted-foreground">How long the assistant's written replies run.</div>
                <OptionList<ReplyLength>
                  value={settings.replyLength}
                  onChange={(v) => onChange({ replyLength: v })}
                  options={[
                    { id: "concise",  title: "Concise",  desc: "Short, to-the-point replies. Best for quick WhatsApp back-and-forth." },
                    { id: "balanced", title: "Balanced", desc: "A sentence or two with just enough detail. A good default." },
                    { id: "detailed", title: "Detailed", desc: "Fuller replies that explain steps and context. Best for how-to help." },
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* --------------------------------------------------------- */
/* Post-call variable: predefined values (enum) editor       */
/* --------------------------------------------------------- */

function PostCallValues({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    // Split on commas/newlines so a whole list can be added at once.
    const parts = draft.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    setDraft("");
    if (parts.length === 0) return;
    const next = [...values];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">Values <span className="font-normal text-muted-foreground/70">(optional)</span></span>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((val) => (
            <span key={val} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-xs">
              {val}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== val))}
                className="text-muted-foreground hover:text-destructive"
                title="Remove value"
              ><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder="Add values, comma-separated, then press Enter…"
        className="h-8 text-xs"
      />
      <p className="text-[11px] text-muted-foreground">Leave empty for free-form extraction, or add a list of allowed values to constrain the output.</p>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Test-agent modal                                          */
/* --------------------------------------------------------- */

type TestTab = "phone" | "web";

export function TestAgentModal({
  agentName, type, inputVars, settings, onClose,
}: { agentName: string; type: AgentType; inputVars: InputVar[]; settings: AgentSettings; onClose: () => void }) {
  if (type === "chat") return <ChatTestModal agentName={agentName} inputVars={inputVars} onClose={onClose} />;
  return <VoiceTestModal agentName={agentName} inputVars={inputVars} settings={settings} onClose={onClose} />;
}

function VoiceTestModal({
  agentName, inputVars, settings, onClose,
}: { agentName: string; inputVars: InputVar[]; settings: AgentSettings; onClose: () => void }) {
  const [tab, setTab] = useState<TestTab>("phone");
  const [fromId, setFromId] = useState(settings.phoneNumberId ?? PHONE_NUMBERS[0].id);
  const [callee, setCallee] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});

  const named = inputVars.filter((v) => v.name);

  const start = () => {
    if (tab === "phone" && !callee.trim()) { toast.error("Enter a callee number to test."); return; }
    toast.success(`Test ${tab === "phone" ? "call" : "web call"} started`, {
      description: tab === "phone" ? `Calling ${callee} as ${agentName}.` : `Launching ${agentName}.`,
    });
    onClose();
  };

  const tabs: { id: TestTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "phone", label: "Phone call", icon: Phone },
    { id: "web", label: "Web call", icon: Globe },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="text-[16px] font-semibold">Test {agentName}</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">Run a live test before you go to production.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-accent" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex items-center gap-1 rounded-full bg-secondary/60 p-1">
            {tabs.map((t) => {
              const TIcon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
                    tab === t.id ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <TIcon className="h-3.5 w-3.5" /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-h-[52vh] space-y-4 overflow-y-auto px-5 py-4">
          {tab === "phone" && (
            <>
              <Field label="Choose a number">
                <Select value={fromId} onValueChange={setFromId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PHONE_NUMBERS.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-sm">
                        <span className="font-mono">{p.e164}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">The number the assistant will call from.</p>
              </Field>
              <Field label="Callee number">
                <Input value={callee} onChange={(e) => setCallee(e.target.value)} placeholder="+91 98765 43210" className="h-9 font-mono text-sm" />
                <p className="text-[11px] text-muted-foreground">Use a number you control for testing. Do not use customer numbers.</p>
              </Field>
            </>
          )}

          {tab === "web" && (
            <p className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-[12.5px] text-muted-foreground">
              Launch a browser-based voice session in a new tab.
            </p>
          )}

          {named.length > 0 && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Input variables</p>
              {named.map((v) => (
                <Field key={v.id} label={v.name}>
                  <Input
                    value={vars[v.name] ?? ""}
                    onChange={(e) => setVars((s) => ({ ...s, [v.name]: e.target.value }))}
                    placeholder={`Value for ${v.name}`}
                    className="h-9 text-sm"
                  />
                </Field>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={start}>
            <PhoneCall className="h-3.5 w-3.5" /> Start
          </Button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Chat test — simulated conversation window                 */
/* --------------------------------------------------------- */

type ChatMsg = { id: string; role: "agent" | "user"; text: string };

const CHAT_STARTERS = ["Where is my order?", "How do refunds work?", "Help me finish KYC"];

/** Canned, clearly-illustrative responses keyed off the user's message. */
function simulateReply(input: string): string {
  const q = input.toLowerCase();
  if (/refund|money back|cancel|charge/.test(q))
    return "Refunds go back to your original payment method in 5 to 7 business days. Share your order ID and I can check where yours is.";
  if (/order|deliver|track|parcel|shipment|where is/.test(q))
    return "Let me take a look. Metro cities usually deliver in 2 to 3 days and other regions in 4 to 6 days. What is your order ID?";
  if (/kyc|pan|aadhaar|aadhar|verif/.test(q))
    return "Happy to help with KYC. Which step are you on right now: PAN, Aadhaar e-KYC, or video KYC?";
  if (/price|plan|cost|pricing|charge|fee/.test(q))
    return "I can walk you through pricing. Are you looking at the Basic, Pro, or Enterprise plan?";
  if (/^(hi|hello|hey|namaste)\b/.test(q))
    return "Hi there! I can help with orders, refunds, KYC, and account questions. What can I do for you?";
  return "Got it. I can help with orders, refunds, KYC, and account questions. Could you tell me a little more about what you need?";
}

function ChatTestModal({ agentName, inputVars, onClose }: { agentName: string; inputVars: InputVar[]; onClose: () => void }) {
  const greeting: ChatMsg = { id: "m0", role: "agent", text: `Hi! I'm ${agentName}. How can I help you today?` };
  const [msgs, setMsgs] = useState<ChatMsg[]>([greeting]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [varsOpen, setVarsOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const named = inputVars.filter((v) => v.name);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  // Clear any pending reply timers on unmount.
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const send = (text: string) => {
    const body = text.trim();
    if (!body || typing) return;
    setDraft("");
    setMsgs((m) => [...m, { id: uid(), role: "user", text: body }]);
    setTyping(true);
    const t = setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { id: uid(), role: "agent", text: simulateReply(body) }]);
    }, 650);
    timers.current.push(t);
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setTyping(false);
    setMsgs([greeting]);
    setDraft("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" onClick={onClose}>
      <div
        className="flex h-[70vh] max-h-[640px] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success">
              <MessageCircle className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold leading-tight">Test {agentName}</h2>
              <p className="text-[11.5px] text-muted-foreground">Simulated chat. Replies are illustrative, not from the live model.</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={reset} className="rounded-full p-1.5 text-muted-foreground hover:bg-accent" title="Reset conversation" aria-label="Reset conversation"><RotateCcw className="h-4 w-4" /></button>
            <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-accent" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Input variables — set the per-run context before chatting */}
        {named.length > 0 && (
          <div className="border-b border-border bg-background">
            <button
              type="button"
              onClick={() => setVarsOpen((o) => !o)}
              className="flex w-full items-center gap-2 px-4 py-2 text-left"
              aria-expanded={varsOpen}
            >
              <Braces className="h-3.5 w-3.5 text-ai" />
              <span className="text-[12px] font-medium">Input variables</span>
              <span className="text-[11px] text-muted-foreground">{named.length} bound per run</span>
              <ChevronDown className={cn("ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform", varsOpen && "rotate-180")} />
            </button>
            {varsOpen && (
              <div className="grid grid-cols-2 gap-2 px-4 pb-3">
                {named.map((v) => (
                  <div key={v.id} className="space-y-1">
                    <label className="block font-mono text-[10.5px] text-muted-foreground">{v.name}</label>
                    <Input
                      value={vars[v.name] ?? ""}
                      onChange={(e) => setVars((s) => ({ ...s, [v.name]: e.target.value }))}
                      placeholder={`{{${v.name}}}`}
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Transcript */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-secondary/20 px-4 py-4">
          {msgs.map((m) => (
            <div key={m.id} className={cn("flex items-end gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "agent" && (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                  <Bot className="h-3.5 w-3.5" />
                </span>
              )}
              <div className={cn(
                "max-w-[78%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
                m.role === "user"
                  ? "rounded-br-sm bg-foreground text-background"
                  : "rounded-bl-sm border border-border bg-background text-foreground",
              )}>
                {m.text}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex items-end gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                <Bot className="h-3.5 w-3.5" />
              </span>
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-border bg-background px-3.5 py-2.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
              </div>
            </div>
          )}
        </div>

        {/* Starters (only before the first user turn) */}
        {msgs.length === 1 && (
          <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-2.5">
            {CHAT_STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Composer */}
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(draft); } }}
            placeholder={`Message ${agentName}…`}
            className="h-9 flex-1 text-sm"
          />
          <Button size="sm" className="h-9 gap-1.5 px-3.5 text-xs" disabled={!draft.trim() || typing} onClick={() => send(draft)}>
            <Send className="h-3.5 w-3.5" /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Test-agent panel — docked right-side transcript (web call) */
/* --------------------------------------------------------- */

/** A scripted web-call exchange, streamed line-by-line to mimic a live call.
 *  Replies are illustrative, not from the live model. */
const VOICE_SCRIPT: { role: "agent" | "user"; text: string }[] = [
  { role: "agent", text: "Hi, this is {name} calling from Pi Commerce. Am I speaking with the account holder?" },
  { role: "user", text: "Yes, speaking." },
  { role: "agent", text: "Thanks for confirming. I'm reaching out about your account. Is now a good time to talk?" },
  { role: "user", text: "Sure, go ahead." },
  { role: "agent", text: "I can see a couple of options available to you today. Would you like me to walk you through them?" },
  { role: "user", text: "Yes, please." },
  { role: "agent", text: "Done. I've also sent the details to your WhatsApp so you have them handy. Anything else I can help with?" },
  { role: "user", text: "No, that's everything. Thank you." },
  { role: "agent", text: "You're welcome. Have a great day!" },
];

type CallPhase = "idle" | "connecting" | "active" | "ended";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function TestAgentPanel({
  agentName, type, inputVars, settings, onClose,
}: { agentName: string; type: AgentType; inputVars: InputVar[]; settings: AgentSettings; onClose: () => void }) {
  if (type === "chat") return <ChatTestPanel agentName={agentName} inputVars={inputVars} onClose={onClose} />;
  return <VoiceCallPanel agentName={agentName} inputVars={inputVars} settings={settings} onClose={onClose} />;
}

type PhonePhase = "form" | "ringing" | "ongoing";

function VoiceCallPanel({
  agentName, inputVars, settings, onClose,
}: { agentName: string; inputVars: InputVar[]; settings: AgentSettings; onClose: () => void }) {
  const [mode, setMode] = useState<"web" | "phone">("web");

  // Web-call state.
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [lines, setLines] = useState<{ id: string; role: "agent" | "user"; text: string }[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);

  // Phone-call state.
  const [phonePhase, setPhonePhase] = useState<PhonePhase>("form");
  const [fromId, setFromId] = useState(settings.phoneNumberId ?? PHONE_NUMBERS[0].id);
  const [callee, setCallee] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Shared across both modes.
  const [vars, setVars] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const named = inputVars.filter((v) => v.name);
  const fromNumber = getPhoneNumber(fromId)?.e164 ?? "";
  const boundVars = named.filter((v) => vars[v.name]?.trim());

  // The current mode is in its pre-call state (so tabs + input vars are editable).
  const preCall = mode === "web" ? phase === "idle" : phonePhase === "form";

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
  };
  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, phase]);

  const startCall = () => {
    clearTimers();
    setLines([]);
    setElapsed(0);
    setMuted(false);
    setPhase("connecting");
    const connectAt = setTimeout(() => {
      setPhase("active");
      tick.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      // Stream the scripted transcript, staggered to feel like a live call.
      let delay = 400;
      VOICE_SCRIPT.forEach((l, i) => {
        delay += l.role === "agent" ? 1700 : 1100;
        const t = setTimeout(() => {
          setLines((prev) => [...prev, { id: `${i}`, role: l.role, text: l.text.replace("{name}", agentName) }]);
          if (i === VOICE_SCRIPT.length - 1) {
            const endAt = setTimeout(() => endCall(), 1400);
            timers.current.push(endAt);
          }
        }, delay);
        timers.current.push(t);
      });
    }, 1100);
    timers.current.push(connectAt);
  };

  const endCall = () => {
    clearTimers();
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    setPhase("ended");
  };

  const startPhoneCall = () => {
    if (!callee.trim()) { toast.error("Enter a callee number to test."); return; }
    clearTimers();
    setPhonePhase("ringing");
    const t = setTimeout(() => setPhonePhase("ongoing"), 1800);
    timers.current.push(t);
  };

  return (
    <aside className="flex h-full w-[384px] shrink-0 flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ai/10 text-ai">
            {mode === "web" ? <Globe className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
          </span>
          <div>
            <h2 className="text-[13.5px] font-semibold leading-tight">Test agent</h2>
            <p className="text-[11px] text-muted-foreground">{agentName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mode === "web" && <CallStatusPill phase={phase} elapsed={elapsed} />}
          <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-accent" aria-label="Close test panel"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Mode switch — only while neither mode has a call in progress */}
      {preCall && (
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-1 rounded-full bg-secondary/60 p-1">
            {([["web", "Web call", Globe], ["phone", "Phone call", Phone]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
                  mode === id ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Phone-call form fields */}
      {mode === "phone" && phonePhase === "form" && (
        <div className="space-y-3 border-b border-border px-4 py-3">
          <div className="space-y-1">
            <label className="block text-[12px] font-medium">Choose a number</label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PHONE_NUMBERS.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-sm"><span className="font-mono">{p.e164}</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">The number the assistant will call from.</p>
          </div>
          <div className="space-y-1">
            <label className="block text-[12px] font-medium">Callee number</label>
            <Input value={callee} onChange={(e) => setCallee(e.target.value)} placeholder="+91 98765 43210" className="h-9 font-mono text-sm" />
            <p className="text-[11px] text-muted-foreground">Use a number you control for testing. Do not use customer numbers.</p>
          </div>
        </div>
      )}

      {/* Input variables — editable before the call starts (both modes) */}
      {named.length > 0 && preCall && (
        <div className="space-y-2 border-b border-border px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Braces className="h-3 w-3 text-ai" /> Input variables
          </p>
          {named.map((v) => (
            <div key={v.id} className="space-y-1">
              <label className="block font-mono text-[10.5px] text-muted-foreground">{v.name}</label>
              <Input
                value={vars[v.name] ?? ""}
                onChange={(e) => setVars((s) => ({ ...s, [v.name]: e.target.value }))}
                placeholder={`{{${v.name}}}`}
                className="h-8 text-xs"
              />
            </div>
          ))}
        </div>
      )}

      {/* Stage — web transcript, or phone call screen */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-secondary/20 px-4 py-4">
        {mode === "web" ? (
          phase === "idle" ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ai/10 text-ai">
                <PhoneCall className="h-7 w-7" />
              </span>
              <p className="mt-4 text-[13px] font-medium">Start a browser voice session</p>
            </div>
          ) : phase === "connecting" ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-ai" />
              <p className="mt-3 text-[12.5px]">Connecting to {agentName}…</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((m) => (
                <div key={m.id} className={cn("flex items-end gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
                  {m.role === "agent" && (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ai/10 text-ai">
                      <Bot className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <div className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
                    m.role === "user"
                      ? "rounded-br-sm bg-foreground text-background"
                      : "rounded-bl-sm border border-border bg-background text-foreground",
                  )}>
                    {m.text}
                  </div>
                  {m.role === "user" && (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              ))}
              {phase === "ended" && (
                <div className="pt-1 text-center text-[11.5px] text-muted-foreground">Call ended · {mmss(elapsed)}</div>
              )}
            </div>
          )
        ) : phonePhase === "form" ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ai/10 text-ai">
              <Phone className="h-7 w-7" />
            </span>
            <p className="mt-4 text-[13px] font-medium">Place a test phone call</p>
          </div>
        ) : (
          /* Ringing / Ongoing call screen */
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <User className="h-8 w-8" />
            </span>
            <span className={cn(
              "mt-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium",
              phonePhase === "ringing"
                ? "border border-ai/30 bg-ai/10 text-ai"
                : "border border-warning/30 bg-warning/10 text-warning",
            )}>
              {phonePhase === "ringing" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ai" />}
              {phonePhase === "ringing" ? "Ringing" : "Ongoing"}
            </span>
            <p className="mt-3 font-mono text-[20px] font-semibold tracking-tight">{callee}</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">{agentName} from {fromNumber}</p>

            <button
              type="button"
              onClick={() => setDetailsOpen((o) => !o)}
              className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground"
              aria-expanded={detailsOpen}
            >
              Call details <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", detailsOpen && "rotate-180")} />
            </button>
            {detailsOpen && (
              <dl className="mt-3 w-full max-w-[18rem] space-y-1.5 rounded-lg border border-border bg-background/70 p-3 text-left text-[12px]">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">From</dt><dd className="font-mono">{fromNumber}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">To</dt><dd className="font-mono">{callee}</dd></div>
                {boundVars.map((v) => (
                  <div key={v.id} className="flex justify-between gap-3">
                    <dt className="font-mono text-muted-foreground">{v.name}</dt>
                    <dd className="truncate">{vars[v.name]}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="border-t border-border px-4 py-3">
        {mode === "web" ? (
          <>
            {phase === "idle" && (
              <Button size="sm" className="h-9 w-full gap-1.5 text-xs" onClick={startCall}>
                <PhoneCall className="h-3.5 w-3.5" /> Start web call
              </Button>
            )}
            {phase === "connecting" && (
              <Button size="sm" variant="outline" className="h-9 w-full gap-1.5 text-xs" onClick={endCall}>
                <PhoneOff className="h-3.5 w-3.5" /> Cancel
              </Button>
            )}
            {phase === "active" && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm" variant="outline"
                  className={cn("h-9 flex-1 gap-1.5 text-xs", muted && "border-warning/40 bg-warning/10 text-warning")}
                  onClick={() => setMuted((m) => !m)}
                >
                  {muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  {muted ? "Unmute" : "Mute"}
                </Button>
                <Button size="sm" className="h-9 flex-1 gap-1.5 bg-destructive text-xs text-destructive-foreground hover:bg-destructive/90" onClick={endCall}>
                  <PhoneOff className="h-3.5 w-3.5" /> End call
                </Button>
              </div>
            )}
            {phase === "ended" && (
              <Button size="sm" variant="outline" className="h-9 w-full gap-1.5 text-xs" onClick={startCall}>
                <RotateCcw className="h-3.5 w-3.5" /> Call again
              </Button>
            )}
          </>
        ) : phonePhase === "form" ? (
          <Button size="sm" className="h-9 w-full gap-1.5 text-xs" onClick={startPhoneCall}>
            <PhoneCall className="h-3.5 w-3.5" /> Start call
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-9 flex-1 gap-1.5 text-xs" onClick={startPhoneCall}>
              <RotateCcw className="h-3.5 w-3.5" /> Redial
            </Button>
            <Button size="sm" className="h-9 flex-1 gap-1.5 bg-destructive text-xs text-destructive-foreground hover:bg-destructive/90" onClick={() => { clearTimers(); setPhonePhase("form"); }}>
              <PhoneOff className="h-3.5 w-3.5" /> End call
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}

function CallStatusPill({ phase, elapsed }: { phase: CallPhase; elapsed: number }) {
  if (phase === "active")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> {mmss(elapsed)}
      </span>
    );
  if (phase === "connecting")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai/10 px-2 py-0.5 text-[11px] font-medium text-ai">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ai" /> Connecting
      </span>
    );
  if (phase === "ended")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-muted-foreground/30 bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Ended
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Idle
    </span>
  );
}

/* --------------------------------------------------------- */
/* Chat test panel — docked right-side conversation          */
/* --------------------------------------------------------- */

function ChatTestPanel({ agentName, inputVars, onClose }: { agentName: string; inputVars: InputVar[]; onClose: () => void }) {
  const greeting: ChatMsg = { id: "m0", role: "agent", text: `Hi! I'm ${agentName}. How can I help you today?` };
  const [msgs, setMsgs] = useState<ChatMsg[]>([greeting]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const send = (text: string) => {
    const body = text.trim();
    if (!body || typing) return;
    setDraft("");
    setMsgs((m) => [...m, { id: uid(), role: "user", text: body }]);
    setTyping(true);
    const t = setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { id: uid(), role: "agent", text: simulateReply(body) }]);
    }, 650);
    timers.current.push(t);
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setTyping(false);
    setMsgs([greeting]);
    setDraft("");
  };

  return (
    <aside className="flex h-full w-[384px] shrink-0 flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success/10 text-success">
            <MessageCircle className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-[13.5px] font-semibold leading-tight">Test chat</h2>
            <p className="text-[11px] text-muted-foreground">Simulated · {agentName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={reset} className="rounded-full p-1.5 text-muted-foreground hover:bg-accent" title="Reset conversation" aria-label="Reset conversation"><RotateCcw className="h-4 w-4" /></button>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-accent" aria-label="Close test panel"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-secondary/20 px-4 py-4">
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex items-end gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "agent" && (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                <Bot className="h-3.5 w-3.5" />
              </span>
            )}
            <div className={cn(
              "max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
              m.role === "user"
                ? "rounded-br-sm bg-foreground text-background"
                : "rounded-bl-sm border border-border bg-background text-foreground",
            )}>
              {m.text}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex items-end gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
              <Bot className="h-3.5 w-3.5" />
            </span>
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-border bg-background px-3.5 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
            </div>
          </div>
        )}
      </div>

      {/* Starters */}
      {msgs.length === 1 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-2.5">
          {CHAT_STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(draft); } }}
          placeholder={`Message ${agentName}…`}
          className="h-9 flex-1 text-sm"
        />
        <Button size="sm" className="h-9 gap-1.5 px-3.5 text-xs" disabled={!draft.trim() || typing} onClick={() => send(draft)}>
          <Send className="h-3.5 w-3.5" /> Send
        </Button>
      </div>
    </aside>
  );
}

/* --------------------------------------------------------- */
/* Markdown box (preview / edit) + mention editor            */
/* --------------------------------------------------------- */

function MarkdownBox({
  label, desc, value, onChange, tools, vars, mentions, placeholder,
}: {
  label: string; desc?: string; value: string; onChange: (v: string) => void;
  tools: string[]; vars?: string[]; mentions?: boolean; placeholder?: string;
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
        <MentionEditor value={value} tools={tools} vars={vars ?? []} onChange={onChange} placeholder={placeholder} />
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
const VAR_CHIP_CLASS = "agent-var-chip mx-0.5 inline-flex items-center rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 align-baseline font-mono text-[0.85em] text-success";

const toolChipHtml = (h: string) => `<span class="${CHIP_CLASS}" contenteditable="false" data-tool="${h}">@${h}</span>`;
const varChipHtml = (n: string) => `<span class="${VAR_CHIP_CLASS}" contenteditable="false" data-var="${n}">{{${n}}}</span>`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Tools serialize to @handle (blue chip); input variables serialize to {{name}}
// (green chip). Backward compat: a legacy {{handle}} naming a known tool still
// renders as a tool chip.
function valueToHtml(value: string, tools: string[]): string {
  const toolSet = new Set(tools);
  let out = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (tools.length) {
    const re = new RegExp(`@(${tools.map(escapeRe).join("|")})\\b`, "g");
    out = out.replace(re, (_m, h) => toolChipHtml(h));
  }
  out = out.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi,
    (_m, n) => (toolSet.has(n) ? toolChipHtml(n) : varChipHtml(n)));
  return out.replace(/\n/g, "<br>");
}

function htmlToValue(root: HTMLElement): string {
  let out = "";
  const walk = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) { out += node.textContent ?? ""; return; }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tool = el.getAttribute("data-tool");
      if (tool) { out += `@${tool}`; return; }
      const varName = el.getAttribute("data-var");
      if (varName) { out += `{{${varName}}}`; return; }
      if (el.tagName === "BR") { out += "\n"; return; }
      if (el.tagName === "DIV" && out && !out.endsWith("\n")) out += "\n";
      el.childNodes.forEach(walk);
    }
  };
  root.childNodes.forEach(walk);
  return out.replace(/ /g, " ");
}

type MentionKind = "tool" | "var";

function MentionEditor({
  value, tools, vars, onChange, placeholder,
}: { value: string; tools: string[]; vars: string[]; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ left: number; top: number; query: string; kind: MentionKind } | null>(null);

  // Initialize content once on mount (uncontrolled thereafter to preserve caret).
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = valueToHtml(value, tools);
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
    // {{ opens the input-variable picker; a bare @ opens the tool picker.
    const vm = before.match(/\{\{([a-z0-9_]*)$/i);
    const tm = before.match(/(?:^|[^a-z0-9_@])@([a-z0-9_]*)$/i);
    const kind: MentionKind | null = vm ? "var" : tm ? "tool" : null;
    const m = vm ?? tm;
    if (!m || !kind) { setMenu(null); return; }
    const rect = range.getClientRects()[0] ?? ref.current?.getBoundingClientRect();
    if (!rect) { setMenu(null); return; }
    setMenu({ left: rect.left, top: rect.bottom + 4, query: m[1].toLowerCase(), kind });
  };

  const insertMention = (kind: MentionKind, nameRaw: string) => {
    const name = nameRaw.trim();
    if (!name) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent ?? "";
    const trigger = kind === "var" ? "{{" : "@";
    const idx = text.slice(0, range.startOffset).lastIndexOf(trigger);
    if (idx < 0) return;
    const del = document.createRange();
    del.setStart(node, idx);
    del.setEnd(node, range.startOffset);
    del.deleteContents();

    const chip = document.createElement("span");
    if (kind === "var") {
      chip.className = VAR_CHIP_CLASS;
      chip.setAttribute("data-var", name);
      chip.textContent = `{{${name}}}`;
    } else {
      chip.className = CHIP_CLASS;
      chip.setAttribute("data-tool", name);
      chip.textContent = `@${name}`;
    }
    chip.setAttribute("contenteditable", "false");
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

  const pool = menu?.kind === "var" ? vars : tools;
  const matches = pool.filter((h) => h.includes(menu?.query ?? ""));
  const isVar = menu?.kind === "var";

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
          <p className="border-b border-border px-2.5 py-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">{isVar ? "Insert input variable" : "Insert tool"}</p>
          {matches.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] text-muted-foreground">
              {pool.length === 0 ? (isVar ? "Add input variables above first." : "Add tools above first.") : "No match."}
            </p>
          ) : (
            matches.map((h) => (
              <button
                key={h}
                onMouseDown={(e) => { e.preventDefault(); insertMention(menu.kind, h); }}
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-mono text-[12px] hover:bg-accent"
              >
                {isVar ? <Braces className="h-3 w-3 text-success" /> : <Wrench className="h-3 w-3 text-ai" />} {h}
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
