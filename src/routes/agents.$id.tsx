import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PageTabs } from "@/components/app/Tabs";
import { ChevronRight, Sparkles, Play, Phone, Send, Bot, User, Workflow, MessageCircle, Plus, Copy, Check, Pencil, RotateCcw, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRegion } from "@/lib/region";

export const Route = createFileRoute("/agents/$id")({
  component: AgentBuilder,
  head: ({ params }) => ({
    meta: [{ title: `Agent ${params.id} · Pi Commerce Enterprise` }],
  }),
});

type Section = "personality" | "instructions" | "systemprompt" | "knowledge" | "tools" | "escalation" | "memory" | "campaigns";

const LANGUAGES = ["English", "Hindi", "Tamil", "Telugu", "Marathi"] as const;

type CampaignState = "running" | "paused" | "ready" | "draft" | "archived";
type CampaignUsage = {
  id: string;
  name: string;
  state: CampaignState;
  channel: string;
  convs: string;
};

/* Which campaigns each agent is wired into. Keyed by agent id;
   falls back to the concierge set so the prototype always renders. */
const AGENT_CAMPAIGNS: Record<string, CampaignUsage[]> = {
  a_concierge: [
    { id: "c_002", name: "New Trader Onboarding", state: "running", channel: "WhatsApp", convs: "4.2K" },
    { id: "c_001", name: "Dormant Trader Reactivation", state: "running", channel: "WhatsApp + Voice", convs: "3.1K" },
    { id: "c_004", name: "KYC Drop-off Recovery", state: "ready", channel: "WhatsApp", convs: "2.0K" },
    { id: "c_003", name: "High-Value Win-Back", state: "paused", channel: "Voice", convs: "1.4K" },
    { id: "c_005", name: "Festive Cashback Push", state: "draft", channel: "SMS", convs: "—" },
  ],
};

function AgentBuilder() {
  const { id } = Route.useParams();
  const { aumThreshold } = useRegion();
  const [section, setSection] = useState<Section>("personality");
  const campaigns = AGENT_CAMPAIGNS[id] ?? AGENT_CAMPAIGNS.a_concierge;

  // Live config that feeds the compiled system prompt
  const [languages, setLanguages] = useState<string[]>(["English", "Hindi"]);
  const [escalateToHuman, setEscalateToHuman] = useState(true);
  const [promptMode, setPromptMode] = useState<"auto" | "custom">("auto");
  const [customPrompt, setCustomPrompt] = useState("");

  const toggleLanguage = (l: string) =>
    setLanguages((langs) => (langs.includes(l) ? langs.filter((x) => x !== l) : [...langs, l]));

  return (
    <AppShell bare showAskPi={false}>
      <div className="flex h-full flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2 text-sm">
            <Link to="/agents" className="text-muted-foreground hover:text-foreground">Agents</Link>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="font-medium">Pi Concierge</span>
            <span className="ml-1 text-[11px] text-muted-foreground/70">{id}</span>
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Live
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 text-xs">Versions</Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"><Sparkles className="h-3.5 w-3.5 text-ai" /> Improve with Pi</Button>
            <Button size="sm" className="h-8 gap-1.5 text-xs"><Play className="h-3 w-3 fill-current" /> Publish</Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Config sidebar */}
          <aside className="w-[200px] shrink-0 border-r border-border px-2 py-3">
            <p className="px-2 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Configure</p>
            <ul className="space-y-0.5">
              {([
                ["personality", "Personality"],
                ["instructions", "Instructions"],
                ["systemprompt", "System prompt"],
                ["knowledge", "Knowledge"],
                ["tools", "Tools"],
                ["escalation", "Escalation"],
                ["memory", "Memory"],
              ] as const).map(([sid, label]) => (
                <li key={sid}>
                  <button
                    onClick={() => setSection(sid)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px]",
                      section === sid ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>

            <p className="px-2 pb-1.5 pt-4 text-[10px] uppercase tracking-wider text-muted-foreground">Usage</p>
            <button
              onClick={() => setSection("campaigns")}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px]",
                section === "campaigns" ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Workflow className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">Campaigns</span>
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-medium tabular-nums",
                  section === "campaigns" ? "bg-foreground text-background" : "bg-accent text-muted-foreground",
                )}
              >
                {campaigns.length}
              </span>
            </button>
          </aside>

          {/* Form */}
          <section className="flex-1 overflow-y-auto px-8 py-6">
            <div className="mx-auto max-w-2xl space-y-5">
              {section === "personality" && (
                <>
                  <SectionTitle title="Personality" desc="How the agent sounds and feels to customers." />
                  <Field label="Display name"><Input defaultValue="Pi Concierge" className="h-9" /></Field>
                  <Field label="Persona description">
                    <Textarea
                      className="min-h-24 resize-none text-sm"
                      defaultValue="A calm, knowledgeable concierge for Indian retail traders. Confident but never pushy."
                    />
                  </Field>
                  <Field label="Tone of voice">
                    <div className="grid grid-cols-4 gap-2">
                      {["Warm", "Concise", "Formal", "Playful"].map((t, i) => (
                        <button
                          key={t}
                          className={cn(
                            "rounded-md border px-3 py-2 text-[12.5px]",
                            i < 2 ? "border-foreground bg-accent font-medium" : "border-border text-muted-foreground hover:bg-accent/50",
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Languages">
                    <div className="flex flex-wrap gap-1.5">
                      {LANGUAGES.map((l) => {
                        const on = languages.includes(l);
                        return (
                          <button
                            key={l}
                            onClick={() => toggleLanguage(l)}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                              on ? "border-foreground bg-accent font-medium" : "border-border text-muted-foreground hover:bg-accent/50",
                            )}
                          >
                            {l}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {languages.length > 0
                        ? `Replies in ${languages.join(", ")}. The agent auto-detects and matches the customer's language.`
                        : "Select at least one language the agent can converse in."}
                    </p>
                  </Field>
                </>
              )}

              {section === "instructions" && (
                <>
                  <SectionTitle title="Instructions" desc="Structured guidance — not a giant prompt blob." />
                  <Field label="Mission">
                    <Textarea className="min-h-20 resize-none text-sm" defaultValue="Help traders complete onboarding, answer KYC questions, and route high-value queries to a human." />
                  </Field>
                  <Field label="Do">
                    <Textarea className="min-h-20 resize-none text-sm" defaultValue="• Acknowledge user emotion first\n• Cite product handbook when explaining fees\n• Offer a callback if user is dormant 30+ days" />
                  </Field>
                  <Field label="Don't">
                    <Textarea className="min-h-20 resize-none text-sm" defaultValue="• Never make investment recommendations\n• Never mention competitor brands\n• Never promise specific returns" />
                  </Field>
                </>
              )}

              {section === "systemprompt" && (
                <SystemPromptSection
                  languages={languages}
                  escalateToHuman={escalateToHuman}
                  mode={promptMode}
                  setMode={setPromptMode}
                  customPrompt={customPrompt}
                  setCustomPrompt={setCustomPrompt}
                />
              )}

              {section === "knowledge" && (
                <>
                  <SectionTitle title="Knowledge bases" desc="Attach sources this agent can retrieve from." />
                  {[
                    { name: "Product handbook", chunks: 1240, on: true },
                    { name: "Pricing FAQ", chunks: 84, on: true },
                    { name: "Compliance & SEBI", chunks: 412, on: true },
                    { name: "Help center", chunks: 980, on: false },
                  ].map((k) => (
                    <div key={k.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                      <div>
                        <p className="text-[13px] font-medium">{k.name}</p>
                        <p className="text-[11px] text-muted-foreground">{k.chunks.toLocaleString()} chunks indexed</p>
                      </div>
                      <Switch defaultChecked={k.on} />
                    </div>
                  ))}
                </>
              )}

              {section === "tools" && (
                <>
                  <SectionTitle title="Tools access" desc="Capabilities this agent is allowed to invoke." />
                  {[
                    { name: "Send WhatsApp", scope: "messaging:send", on: true },
                    { name: "CRM Query", scope: "crm:read", on: true },
                    { name: "Order lookup", scope: "orders:read", on: true },
                    { name: "Refund · initiate", scope: "payments:write", on: false, approval: true },
                  ].map((t) => (
                    <div key={t.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                      <div>
                        <p className="text-[13px] font-medium">{t.name}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{t.scope}{t.approval ? " · requires human approval" : ""}</p>
                      </div>
                      <Switch defaultChecked={t.on} />
                    </div>
                  ))}
                </>
              )}

              {section === "escalation" && (
                <>
                  <SectionTitle title="Escalation" desc="When and whether to hand off to a human operator." />
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
                    <div>
                      <p className="text-[13px] font-medium">Escalate to a human</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Master switch. When on, the rules below route conversations to a live operator. When off, the agent always handles the conversation itself.
                      </p>
                    </div>
                    <Switch checked={escalateToHuman} onCheckedChange={setEscalateToHuman} />
                  </div>
                  <div
                    className={cn(
                      "space-y-2.5 transition-opacity",
                      escalateToHuman ? "opacity-100" : "pointer-events-none opacity-40",
                    )}
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Hand-off rules</p>
                    <Rule title="Negative sentiment" desc="Hand off when sentiment < -0.4 over 2 turns" on />
                    <Rule title="High-value account" desc={`Always escalate for users with AUM > ${aumThreshold}`} on />
                    <Rule title="Compliance trigger" desc="Escalate any mention of disputes / regulator" on />
                    <Rule title="Fallback after retries" desc="Escalate after 3 failed clarifications" />
                  </div>
                </>
              )}

              {section === "memory" && (
                <>
                  <SectionTitle title="Memory" desc="What the agent remembers across sessions." />
                  <Field label="Short-term context">
                    <Input defaultValue="Last 20 turns" className="h-9" />
                  </Field>
                  <Field label="Long-term store">
                    <div className="rounded-lg border border-dashed border-border p-3 text-[12px] text-muted-foreground">
                      Persist user preferences, last 5 resolved issues, and product affinity.
                    </div>
                  </Field>
                </>
              )}

              {section === "campaigns" && <CampaignsSection campaigns={campaigns} />}
            </div>
          </section>

          {/* Test playground */}
          <aside className="w-[360px] shrink-0 border-l border-border bg-secondary/30">
            <Playground />
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

/* --------------------------------------------------------- */
/* System prompt — compiled from config, editable, templated */
/* --------------------------------------------------------- */

const PROMPT_PERSONA = "A calm, knowledgeable concierge for Indian retail traders. Confident but never pushy.";
const PROMPT_TONES = ["Warm", "Concise"];
const PROMPT_MISSION = "Help traders complete onboarding, answer KYC questions, and route high-value queries to a human.";
const PROMPT_DO = "- Acknowledge user emotion first\n- Cite the product handbook when explaining fees\n- Offer a callback if the user is dormant 30+ days";
const PROMPT_DONT = "- Never make investment recommendations\n- Never mention competitor brands\n- Never promise specific returns";

function buildSystemPrompt(languages: string[], escalate: boolean): string {
  const parts: string[] = [];
  parts.push("You are Pi Concierge, a chat agent for Pi Commerce.");
  parts.push(`Persona: ${PROMPT_PERSONA}`);
  parts.push(`Tone: ${PROMPT_TONES.join(", ")}. Languages: ${languages.join(", ") || "English"}.`);
  parts.push("", "OBJECTIVE", PROMPT_MISSION);
  parts.push("", "ALWAYS", PROMPT_DO);
  parts.push("", "NEVER", PROMPT_DONT);
  if (escalate) {
    parts.push(
      "",
      "ESCALATION",
      "Hand off to a human when an intent involves negative sentiment, a high-value account, or a compliance matter.",
    );
  }
  return parts.join("\n");
}

const PROMPT_TEMPLATES: { id: string; name: string; desc: string; body: string }[] = [
  {
    id: "support",
    name: "Support resolver",
    desc: "First-contact resolution for inbound help",
    body:
      "You are a support agent for Pi Commerce.\n\nOBJECTIVE\nResolve the customer's issue accurately on first contact and confirm the resolution back to them.\n\nALWAYS\n- Acknowledge the problem before troubleshooting\n- Give one clear next step at a time\n- Confirm the issue is resolved before closing\n\nNEVER\n- Never speculate about account balances\n- Never share another customer's data\n\nESCALATION\nHand off to a human for billing disputes or anything compliance-related.",
  },
  {
    id: "winback",
    name: "Win-back / reactivation",
    desc: "Re-engage dormant traders",
    body:
      "You are a reactivation agent for Pi Commerce.\n\nOBJECTIVE\nUnderstand why the trader went dormant and offer a relevant, time-bound reason to return.\n\nALWAYS\n- Lead with empathy, not a pitch\n- Reference one concrete benefit tied to their history\n- Offer a callback if they hesitate\n\nNEVER\n- Never pressure or use urgency tactics\n- Never promise specific returns\n\nESCALATION\nRoute high-value accounts to a relationship manager.",
  },
  {
    id: "kyc",
    name: "KYC assistant",
    desc: "Guide users through verification",
    body:
      "You are a KYC assistant for Pi Commerce.\n\nOBJECTIVE\nHelp the user complete identity verification with the fewest possible steps.\n\nALWAYS\n- Explain why each document is needed\n- Catch common PAN / Aadhaar name-mismatch errors\n- Reassure the user their data is encrypted\n\nNEVER\n- Never ask the user to share an OTP or password\n- Never store document numbers in plain text\n\nESCALATION\nEscalate any suspected fraud to compliance immediately.",
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function SystemPromptSection({
  languages,
  escalateToHuman,
  mode,
  setMode,
  customPrompt,
  setCustomPrompt,
}: {
  languages: string[];
  escalateToHuman: boolean;
  mode: "auto" | "custom";
  setMode: (m: "auto" | "custom") => void;
  customPrompt: string;
  setCustomPrompt: (v: string) => void;
}) {
  const generated = buildSystemPrompt(languages, escalateToHuman);
  const text = mode === "auto" ? generated : customPrompt;

  const startEditing = () => {
    setCustomPrompt(generated);
    setMode("custom");
  };
  const resetToAuto = () => {
    setCustomPrompt("");
    setMode("auto");
  };
  const applyTemplate = (body: string) => {
    setCustomPrompt(body);
    setMode("custom");
  };

  return (
    <>
      <SectionTitle
        title="System prompt"
        desc="The compiled instructions sent to the model. Auto-generated from your settings — edit directly or start from a template."
      />

      {/* Templates */}
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Start from a template</p>
        <div className="grid grid-cols-3 gap-2">
          {PROMPT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTemplate(t.body)}
              className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-foreground/20 hover:bg-accent/40"
            >
              <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
                <FileText className="h-3.5 w-3.5 text-ai" /> {t.name}
              </span>
              <span className="text-[11px] leading-snug text-muted-foreground">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Compiled / editable prompt */}
      <div className="overflow-hidden rounded-xl border border-border bg-secondary/30">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Sparkles className="h-3.5 w-3.5 text-ai" />
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Compiled system prompt</p>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              mode === "auto" ? "bg-accent text-muted-foreground" : "bg-ai/10 text-ai",
            )}
          >
            {mode === "auto" ? "Auto-generated" : "Custom"}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <CopyButton text={text} />
            {mode === "auto" ? (
              <button
                onClick={startEditing}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            ) : (
              <button
                onClick={resetToAuto}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Reset to auto
              </button>
            )}
          </div>
        </div>

        {mode === "auto" ? (
          <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap px-3 py-3 font-mono text-[12px] leading-relaxed text-foreground/90">
            {text}
          </pre>
        ) : (
          <Textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="min-h-80 resize-none rounded-none border-0 bg-transparent font-mono text-[12px] leading-relaxed focus-visible:ring-0"
          />
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {mode === "auto"
          ? "Reflects your Personality, Instructions, Languages and Escalation settings. Switch to Edit to override it by hand."
          : "You're editing the prompt directly. Reset to auto to regenerate it from your settings."}
      </p>
    </>
  );
}

function SectionTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="border-b border-border pb-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">{desc}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Rule({ title, desc, on }: { title: string; desc: string; on?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
      <div>
        <p className="text-[13px] font-medium">{title}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <Switch defaultChecked={on} />
    </div>
  );
}

function CampaignsSection({ campaigns }: { campaigns: CampaignUsage[] }) {
  const live = campaigns.filter((c) => c.state === "running").length;
  return (
    <>
      <SectionTitle title="Campaigns" desc="Where this agent is deployed. Conversations roll up from every campaign it powers." />

      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
          <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-muted-foreground">
            <Workflow className="h-4 w-4" />
          </div>
          <p className="text-sm font-medium">Not used in any campaign yet</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Wire this agent into a campaign to start handling conversations.</p>
          <Button size="sm" variant="outline" className="mt-3 h-8 gap-1.5 text-xs" asChild>
            <Link to="/campaigns"><Plus className="h-3.5 w-3.5" /> Add to a campaign</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
            <span><span className="font-medium text-foreground">{campaigns.length}</span> campaigns</span>
            <span className="h-3 w-px bg-border" />
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <span className="font-medium text-foreground">{live}</span> running
            </span>
          </div>

          <div className="space-y-2">
            {campaigns.map((c) => (
              <Link
                key={c.id}
                to="/campaigns/$id"
                params={{ id: c.id }}
                className="group flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-foreground/20 hover:bg-accent/40"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground">
                    {c.channel.includes("Voice") ? <Phone className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{c.name}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{c.id} · {c.channel}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="hidden text-right sm:block">
                    <span className="block font-mono text-[12px] leading-tight">{c.convs}</span>
                    <span className="block text-[9.5px] uppercase tracking-wider text-muted-foreground">convs</span>
                  </span>
                  <CampaignStateTag state={c.state} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function CampaignStateTag({ state }: { state: CampaignState }) {
  const tone =
    state === "running" ? "border-success/30 bg-success/10 text-success"
    : state === "ready" ? "border-ai/30 bg-ai/10 text-ai"
    : state === "paused" ? "border-warning/30 bg-warning/10 text-warning"
    : state === "draft" ? "border-warning/30 bg-warning/10 text-warning"
    : "border-muted-foreground/30 bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", state === "running" ? "bg-success animate-pulse" : "bg-current opacity-60")} />
      {state}
    </span>
  );
}

function Playground() {
  const [mode, setMode] = useState<"chat" | "voice">("chat");
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Test playground</p>
          <h3 className="text-sm font-semibold">Live preview</h3>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 text-[11px]">
          {(["chat", "voice"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn("rounded px-2 py-1 capitalize", mode === m ? "bg-accent font-medium" : "text-muted-foreground")}>
              {m === "voice" ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> Voice</span> : "Chat"}
            </button>
          ))}
        </div>
      </div>

      {mode === "chat" ? (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-[13px]">
            <Msg who="user" text="hey i can't seem to finish my kyc. it keeps failing on PAN" />
            <Msg who="bot" text="Sorry about that — I can see the PAN field is rejecting due to a name mismatch with your Aadhaar. Want me to walk you through fixing it in 30 seconds?" />
            <Msg who="user" text="yes pls" />
            <Msg who="bot" text="Great. First, tap Profile → KYC → Re-upload PAN. Make sure the name matches your Aadhaar exactly, including middle name." />
          </div>
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <input className="flex-1 bg-transparent text-[13px] focus:outline-none" placeholder="Reply as a test user…" />
              <button className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background"><Send className="h-3.5 w-3.5" /></button>
            </div>
            <p className="mt-2 text-[10.5px] text-muted-foreground">Sandbox · won't affect production users</p>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ai/10 text-ai">
            <Phone className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">Call simulator</p>
          <p className="text-[12px] text-muted-foreground">Dial a sandbox number to talk to the agent live.</p>
          <Button size="sm" className="mt-1 h-8 gap-1.5 text-xs"><Phone className="h-3 w-3" /> Start test call</Button>
        </div>
      )}
    </div>
  );
}

function Msg({ who, text }: { who: "user" | "bot"; text: string }) {
  const isUser = who === "user";
  return (
    <div className={cn("flex items-start gap-2", isUser && "flex-row-reverse")}>
      <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", isUser ? "bg-foreground text-background" : "bg-ai/10 text-ai")}>
        {isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
      </div>
      <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed", isUser ? "bg-foreground text-background" : "bg-background border border-border")}>
        {text}
      </div>
    </div>
  );
}
