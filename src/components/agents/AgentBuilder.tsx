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
  FileText, SlidersHorizontal, Play, Globe, PhoneCall, Check, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOLS, getTool } from "@/lib/tool-registry";
import { renderMarkdown } from "@/lib/markdown";
import type { AgentType, AgentRecord, PostCallVar, InputVar, AgentSettings, SpeechRate, Interruption, ReplyLength } from "@/lib/agent-data";
import {
  LANGUAGES, TTS_PROVIDERS, PROVIDER_LABELS, PHONE_NUMBERS,
  voicesForLang, type TtsProvider,
} from "@/lib/voice-data";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "_");
let seq = 0;
const uid = () => `pcv_${++seq}_${Date.now().toString(36)}`;

export function AgentBuilder({ mode, type, record }: { mode: "create" | "edit"; type: AgentType; record?: AgentRecord }) {
  const navigate = useNavigate();
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
  const save = () => {
    toast.success(`${name.trim() || "Agent"} ${mode === "edit" ? "saved" : "created"}`, {
      description: `${type === "voice" ? "Voice" : "Chat"} agent with ${tools.length} tool${tools.length === 1 ? "" : "s"}.`,
    });
    // After a successful create, surface the test-call flow (voice only) instead of leaving.
    if (mode === "create" && type === "voice") setTestOpen(true);
    else close();
  };
  // Closing the test modal after a create returns the user to the agents list.
  const closeTest = () => { setTestOpen(false); if (mode === "create") close(); };

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
          {mode === "edit" && type === "voice" && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setTestOpen(true)}>
              <PhoneCall className="h-3.5 w-3.5" /> Test agent
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={close}>Cancel</Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={save}>
            <Save className="h-3.5 w-3.5" /> Save as draft
          </Button>
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

          {/* Input variables — voice agents only */}
          {type === "voice" && (
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
          )}

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
              desc={type === "voice" ? "The agent's core instructions. Type @ for a tool, {{ for an input variable." : "The agent's core instructions. Type @ to insert a tool."}
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
        <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" disabled={name.trim().length < 2} onClick={save}>
          <Plus className="h-3.5 w-3.5" /> {mode === "edit" ? "Save agent" : "Create agent"}
        </Button>
      </footer>

      {testOpen && (
        <TestAgentModal
          agentName={name.trim() || record?.name || "agent"}
          type={type}
          inputVars={inputVars}
          settings={settings}
          onClose={closeTest}
        />
      )}
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
              {isVoice ? "Fine-tune speaking pace and how the assistant handles interruptions." : "Fine-tune how long the assistant's replies run."}
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

function TestAgentModal({
  agentName, inputVars, settings, onClose,
}: { agentName: string; type: AgentType; inputVars: InputVar[]; settings: AgentSettings; onClose: () => void }) {
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
