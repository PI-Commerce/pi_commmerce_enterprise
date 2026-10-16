import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ChevronLeft, Pencil, PhoneCall, MessageCircle, Phone, Wrench, Braces, Upload, RotateCcw, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getTool } from "@/lib/tool-registry";
import { renderMarkdown } from "@/lib/markdown";
import {
  getVersions, getActiveVersion, publishVersion, revertToVersion,
  type AgentVersion, type AgentRecord, type AgentSettings,
} from "@/lib/agent-data";
import { LANGUAGES, PROVIDER_LABELS, getVoice, getPhoneNumber } from "@/lib/voice-data";
import { TestAgentPanel } from "@/components/agents/AgentBuilder";
import { VersionSwitcher, VersionStatePill } from "@/components/agents/version-chip";

const SPEECH_RATE_LABEL: Record<string, string> = { slow: "Measured", natural: "Natural", fast: "Brisk" };
const INTERRUPTION_LABEL: Record<string, string> = { sensitive: "Eager", balanced: "Balanced", strict: "Firm" };
const REPLY_LENGTH_LABEL: Record<string, string> = { concise: "Concise", balanced: "Balanced", detailed: "Detailed" };

/** Lowercase the first letter so "Just now" reads as "Edited just now". */
const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export function AgentView({ id, initialVersion, openTest }: { id: string; initialVersion?: number; openTest?: boolean }) {
  const navigate = useNavigate();
  const [nonce, setNonce] = useState(0);
  const [testOpen, setTestOpen] = useState(openTest ?? false);

  // Re-read the (mutable) version store each render; `nonce` forces refresh
  // after a publish so the switcher and pills update in place.
  const versions = useMemo(() => getVersions(id), [id, nonce]);
  const active = useMemo(() => getActiveVersion(id), [id, nonce]);

  // Which version is being viewed. Defaults to the version named in the URL
  // (e.g. opened from the editor's switcher), otherwise the active one.
  const [selVer, setSelVer] = useState<number | null>(initialVersion ?? null);
  const selected: AgentVersion | undefined =
    versions.find((v) => v.version === selVer) ?? active ?? versions.at(-1);

  if (!selected) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-muted-foreground">
        Agent not found.
      </div>
    );
  }

  const rec = selected.record;
  const isDraft = selected.state === "draft";
  const isArchived = selected.state === "archived";

  const publish = () => {
    const v = publishVersion(id, rec);
    toast.success(`Published v${v.version}`, { description: "This version is now live." });
    setSelVer(v.version);
    setNonce((n) => n + 1);
  };

  const revert = () => {
    const v = revertToVersion(id, selected.version);
    if (!v) return;
    toast.success(`Reverted to v${v.version}`, { description: "This version is now live again." });
    setSelVer(v.version);
    setNonce((n) => n + 1);
  };

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
          <span className="truncate font-mono text-[13.5px] font-medium">{rec.name}</span>
          <VersionSwitcher versions={versions} selected={selected} onPick={(v) => setSelVer(v)} />
          <VersionStatePill state={selected.state} />
          <span className="hidden items-center gap-1 text-[11.5px] text-muted-foreground sm:inline-flex">
            <Clock className="h-3 w-3" /> Edited {lower(selected.updatedAt)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isDraft && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={publish}>
              <Upload className="h-3.5 w-3.5" /> Publish
            </Button>
          )}
          {isArchived && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={revert}>
              <RotateCcw className="h-3.5 w-3.5" /> Revert to v{selected.version}
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setTestOpen(true)}>
            {rec.type === "voice" ? <PhoneCall className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
            Test agent
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => navigate({ to: "/agents/$id", params: { id }, search: { edit: true } })}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        </div>
      </header>

      {/* Body + optional docked test panel */}
      <div className="flex min-h-0 flex-1">
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-8">
        <div className="mx-auto w-full max-w-3xl space-y-5">
          {/* Identity */}
          <ViewCard title="Agent details">
            <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2.5 text-[13px]">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-mono">{rec.name}</dd>
              <dt className="text-muted-foreground">Type</dt>
              <dd className="inline-flex items-center gap-1.5">
                {rec.type === "voice" ? <Phone className="h-3.5 w-3.5 text-ai" /> : <MessageCircle className="h-3.5 w-3.5 text-success" />}
                {rec.type === "voice" ? "Voice agent" : "Chat agent"}
              </dd>
              <dt className="text-muted-foreground">Version</dt>
              <dd>v{selected.version} <span className="text-muted-foreground">· {selected.updatedAt}</span></dd>
            </dl>
          </ViewCard>

          {/* Input variables */}
          {(rec.inputVars?.length ?? 0) > 0 && (
            <ViewCard title="Input variables" desc="Bound per run and referenced in the prompt with {{ }}.">
              <div className="flex flex-wrap gap-1.5">
                {rec.inputVars!.map((v) => (
                  <span key={v.id} className="inline-flex items-center gap-1 rounded-md border border-ai/30 bg-ai/10 px-1.5 py-0.5 font-mono text-[11.5px] text-ai">
                    <Braces className="h-3 w-3" /> {v.name}
                  </span>
                ))}
              </div>
            </ViewCard>
          )}

          {/* Tools */}
          <ViewCard title="Tools" desc="Tools this agent can call.">
            {rec.tools.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {rec.tools.map((h) => {
                  const t = getTool(h);
                  return (
                    <span key={h} className="inline-flex items-center gap-1 rounded-md border border-ai/30 bg-ai/10 px-1.5 py-0.5 font-mono text-[11.5px] text-ai" title={t?.description}>
                      <Wrench className="h-3 w-3" /> {h}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">No tools attached.</p>
            )}
          </ViewCard>

          {/* Master prompt */}
          <ViewCard title="Master prompt" desc="The agent's core instructions.">
            {rec.masterPrompt.trim() ? (
              <div className="prose-sm text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(rec.masterPrompt) }} />
            ) : (
              <p className="text-[12px] text-muted-foreground">No prompt set.</p>
            )}
          </ViewCard>

          {/* Knowledge base */}
          <ViewCard title="Knowledge base" desc="Reference material the agent can draw on.">
            {rec.knowledgeBase.trim() ? (
              <div className="prose-sm text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(rec.knowledgeBase) }} />
            ) : (
              <p className="text-[12px] text-muted-foreground">No knowledge base content.</p>
            )}
          </ViewCard>

          {/* Settings */}
          <ViewCard title="Settings">
            <SettingsSummary type={rec.type} settings={rec.settings ?? {}} />
          </ViewCard>

          {/* Post-call variables */}
          {rec.postCall.length > 0 && (
            <ViewCard title="Post-call analysis variables" desc="Extracted from the transcript after each conversation.">
              <div className="space-y-2.5">
                {rec.postCall.map((v) => (
                  <div key={v.id} className="rounded-lg border border-border bg-background/60 p-3">
                    <p className="font-mono text-[12.5px] font-medium">{v.name}</p>
                    <p className="mt-1 text-[12.5px] text-muted-foreground">{v.prompt}</p>
                    {(v.values?.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {v.values!.map((val) => (
                          <span key={val} className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[11px]">{val}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ViewCard>
          )}
        </div>
      </section>

        {testOpen && (
          <TestAgentPanel
            agentName={rec.name}
            type={rec.type}
            inputVars={rec.inputVars ?? []}
            settings={rec.settings ?? {}}
            onClose={() => setTestOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Version switcher                                          */
/* --------------------------------------------------------- */

/* --------------------------------------------------------- */
/* Read-only settings summary                                */
/* --------------------------------------------------------- */

function SettingsSummary({ type, settings }: { type: AgentRecord["type"]; settings: AgentSettings }) {
  const rows: { label: string; value: string }[] = [];
  const lang = LANGUAGES.find((l) => l.code === settings.primaryLang)?.label ?? settings.primaryLang ?? "Not set";
  rows.push({ label: "Primary language", value: lang });

  if (type === "voice") {
    const voice = getVoice(settings.voiceId);
    rows.push({ label: "Voice", value: voice ? `${voice.name} · ${PROVIDER_LABELS[voice.provider]}` : "Not set" });
    const phone = getPhoneNumber(settings.phoneNumberId);
    rows.push({ label: "Phone number", value: phone ? phone.e164 : "Not set" });
    rows.push({ label: "Speech rate", value: settings.speechRate ? SPEECH_RATE_LABEL[settings.speechRate] : "Default" });
    rows.push({ label: "Interruptions", value: settings.interruption ? INTERRUPTION_LABEL[settings.interruption] : "Default" });
    rows.push({ label: "Max call duration", value: `${settings.maxCallDuration ?? 5} min` });
    rows.push({ label: "Inactivity timer", value: `${settings.inactivityTimeout ?? 10}s silence` });
    rows.push({ label: "Nudge message", value: settings.nudgeMessage?.trim() || "Not set" });
  } else {
    rows.push({ label: "Reply length", value: settings.replyLength ? REPLY_LENGTH_LABEL[settings.replyLength] : "Default" });
  }

  return (
    <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2.5 text-[13px]">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* --------------------------------------------------------- */
/* Card                                                      */
/* --------------------------------------------------------- */

function ViewCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3.5 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {desc && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  );
}
