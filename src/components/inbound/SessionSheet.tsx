/**
 * Session detail (AC-S4): transcript, lifecycle, outcome vars, handoff reason,
 * cost, and — for CTWA sessions — the source ad.
 *
 * The outcome block reads the handling agent's `postCall` schema directly. When
 * the agent declares none we say so explicitly rather than rendering an empty
 * panel, because "no outcomes configured" and "outcomes all empty" are different
 * problems for the operator.
 */
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAgent } from "@/lib/agent-data";
import { useEntryPoint, fmtDuration, fmtMs, fmtTime, type Session } from "@/lib/inbound";
import { describeRoute } from "@/lib/inbound-graph";
import { StageTag } from "./SessionBits";
import { Phone, MessageCircle, Megaphone, User, Bot, Settings2 } from "lucide-react";

export function SessionSheet({
  session,
  onClose,
}: {
  session: Session | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!session} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[560px]">
        {session && <Body session={session} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ session }: { session: Session }) {
  const agent = useAgent(session.agentId);
  const ep = useEntryPoint(session.entryPointId);
  const route = ep ? describeRoute(ep.graph, session.routePath) : "—";
  const outcomeKeys = Object.keys(session.outcome);

  return (
    <div>
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          {session.channel === "voice" ? (
            <Phone className="h-4 w-4 text-muted-foreground" />
          ) : (
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          )}
          {/* SheetTitle, not a bare h2 — Radix needs it to label the dialog. */}
          <SheetTitle className="font-mono text-[13px] font-medium">{session.id}</SheetTitle>
          <StageTag stage={session.stage} className="ml-auto" />
        </div>
        <p className="mt-2 text-[15px] font-semibold">{session.contact.name}</p>
        <p className="font-mono text-[12px] text-muted-foreground">{session.contact.phone}</p>
      </div>

      {/* Routing — how this session got to this agent */}
      <Section title="Routing">
        <Row label="Entry point" value={ep?.name ?? "—"} />
        <Row label="Path taken" value={route} />
        <Row
          label="Handled by"
          value={agent?.name ?? "—"}
          mono={!!agent}
          tone={agent ? undefined : "muted"}
        />
      </Section>

      {session.referral && (
        <Section title="Attribution">
          <div className="flex items-start gap-2.5 rounded-lg border border-ai/25 bg-ai/5 px-3 py-2.5">
            <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai" />
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium">{session.referral.adName}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{session.referral.adId}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Click-to-WhatsApp — the message carried a Meta ad referral, which is
                what routed it to the sales rule rather than service.
              </p>
            </div>
          </div>
        </Section>
      )}

      <Section title="Timing &amp; cost">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Row label="Started" value={fmtTime(session.startedAt)} />
          <Row label="Duration" value={fmtDuration(session.durationMs)} />
          <Row label="First response" value={fmtMs(session.firstResponseMs)} />
          <Row label="Turns" value={String(session.turnCount)} />
          <Row label="Cost" value={`$${session.cost.toFixed(3)}`} />
        </div>
      </Section>

      {session.handoffReason && (
        <Section title="Handoff reason">
          <p className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-[12.5px] text-foreground">
            {session.handoffReason}
          </p>
        </Section>
      )}

      <Section title="Session outcomes">
        {!agent ? (
          <Empty>No agent handled this session, so no outcomes were extracted.</Empty>
        ) : agent.postCall.length === 0 ? (
          <Empty>
            <span className="font-mono">{agent.name}</span> has no outcome schema
            configured. Add post-call variables on the agent to make its sessions
            measurable.
          </Empty>
        ) : outcomeKeys.length === 0 ? (
          <Empty>Session did not reach a state where outcomes are extracted.</Empty>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {outcomeKeys.map((k) => (
              <div key={k} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span className="font-mono text-[11.5px] text-muted-foreground">{k}</span>
                <span className="text-right text-[12.5px] font-medium">{session.outcome[k]}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Transcript">
        <div className="space-y-2.5">
          {session.transcript.map((t, i) => (
            <Turn key={i} turn={t} />
          ))}
        </div>
      </Section>
    </div>
  );
}

function Turn({ turn }: { turn: Session["transcript"][number] }) {
  const Icon = turn.role === "customer" ? User : turn.role === "agent" ? Bot : Settings2;
  const isSystem = turn.role === "system";
  return (
    <div className="flex gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
          turn.role === "customer" ? "bg-secondary text-foreground"
          : turn.role === "agent" ? "bg-ai/10 text-ai"
          : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-3 w-3" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-medium capitalize text-muted-foreground">
            {turn.role}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/70">+{turn.at}s</span>
        </div>
        <p
          className={cn(
            "mt-0.5 text-[12.5px] leading-snug",
            isSystem ? "italic text-muted-foreground" : "text-foreground",
          )}
        >
          {turn.text}
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-5 py-4">
      <h3 className="mb-2.5 text-[11px] uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "muted";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right text-[12.5px]",
          mono && "font-mono text-[11.5px]",
          tone === "muted" ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-card/40 px-3 py-3 text-[12px] leading-snug text-muted-foreground">
      {children}
    </p>
  );
}
