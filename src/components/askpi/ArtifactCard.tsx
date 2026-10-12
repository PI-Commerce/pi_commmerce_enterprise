// Ask Pi — artifact cards embedded in an assistant reply.
//
// When Pi drafts something actionable, the reply carries a rich card the user can
// act on: a campaign journey or an agent config. "Open in builder" deep-links into
// the real builder with the draft pre-filled; "Refine" keeps the conversation going.

import { useNavigate } from "@tanstack/react-router";
import {
  Megaphone, Bot, Users, Wand2, MessageCircle, MessageSquare, Clock, GitBranch,
  Phone, Flag, Wrench, ShieldCheck, ArrowRight, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Artifact, CampaignArtifact, AgentArtifact, CampaignNodeKind } from "@/lib/ask-pi-chat";

const NODE_ICON: Record<CampaignNodeKind, React.ComponentType<{ className?: string }>> = {
  audience: Users,
  aiTransform: Wand2,
  whatsapp: MessageCircle,
  sms: MessageSquare,
  delay: Clock,
  conditional: GitBranch,
  voiceCall: Phone,
  aiChat: MessageCircle,
  end: Flag,
};

export function ArtifactCard({ artifact, onRefine }: { artifact: Artifact; onRefine: () => void }) {
  return artifact.kind === "campaign" ? (
    <CampaignCard a={artifact} onRefine={onRefine} />
  ) : (
    <AgentCard a={artifact} onRefine={onRefine} />
  );
}

function CardShell({
  icon: Icon,
  tag,
  title,
  badge,
  children,
  footer,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tag: string;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-ai/25 bg-card shadow-[0_8px_30px_-16px_color-mix(in_oklch,var(--ai)_60%,transparent)]">
      <div className="flex items-center gap-2.5 border-b border-border bg-ai/[0.04] px-4 py-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ai/10 text-ai">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-ai">{tag}</p>
          <p className="truncate text-[13.5px] font-semibold leading-tight">{title}</p>
        </div>
        {badge && <div className="ml-auto shrink-0">{badge}</div>}
      </div>
      <div className="space-y-3 px-4 py-3.5">{children}</div>
      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">{footer}</div>
    </div>
  );
}

function CampaignCard({ a, onRefine }: { a: CampaignArtifact; onRefine: () => void }) {
  const navigate = useNavigate();
  const open = () =>
    navigate({ to: "/journeys/$id", params: { id: "new" }, search: a.nav as never });

  return (
    <CardShell
      icon={Megaphone}
      tag="Journey draft"
      title={a.name}
      badge={
        <div className="flex flex-wrap items-center justify-end gap-1">
          {a.channels.map((c) => (
            <span
              key={c}
              className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground"
            >
              {c}
            </span>
          ))}
        </div>
      }
      footer={
        <>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={onRefine}>
            <Pencil className="h-3.5 w-3.5" /> Refine
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={open}>
            Open in builder <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </>
      }
    >
      <p className="text-[12.5px] text-muted-foreground">{a.objective}</p>
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Users className="h-3.5 w-3.5 shrink-0" />
        <span>{a.audience}</span>
      </div>
      <div>
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Journey</p>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
          {a.steps.map((s, i) => {
            const Icon = NODE_ICON[s.node];
            return (
              <div key={`${s.label}-${i}`} className="flex items-center gap-1">
                <span
                  title={s.detail ? `${s.label} · ${s.detail}` : s.label}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11.5px]"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {s.label}
                </span>
                {i < a.steps.length - 1 && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
              </div>
            );
          })}
        </div>
      </div>
    </CardShell>
  );
}

function AgentCard({ a, onRefine }: { a: AgentArtifact; onRefine: () => void }) {
  const navigate = useNavigate();
  const open = () => navigate({ to: "/agents/new", search: a.nav });

  return (
    <CardShell
      icon={a.type === "voice" ? Phone : Bot}
      tag="Agent draft"
      title={a.name}
      badge={
        <span className="rounded-full border border-ai/30 bg-ai/10 px-2 py-0.5 text-[10.5px] font-medium capitalize text-ai">
          {a.type} · {a.channel}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={onRefine}>
            <Pencil className="h-3.5 w-3.5" /> Refine
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={open}>
            Open in agent builder <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Bot className="h-3.5 w-3.5 shrink-0" />
        <span>Model: {a.model}</span>
      </div>
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <Wrench className="h-3 w-3" /> Tools
        </p>
        <div className="flex flex-wrap gap-1">
          {a.tools.map((t) => (
            <span
              key={t}
              className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <ShieldCheck className="h-3 w-3" /> Guardrails
        </p>
        <ul className="space-y-0.5">
          {a.guardrails.map((g) => (
            <li key={g} className="flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
              {g}
            </li>
          ))}
        </ul>
      </div>
    </CardShell>
  );
}
