/**
 * Analytics · Agent tab.
 *
 * This is not a new surface bolted next to Voice analytics — it *is* the voice
 * analytics view, re-hung on the right axis. The old Channel tab already keyed its
 * "voice asset" by `agent.id` (see `buildChannelAssets`, analytics-data.ts), so
 * picking a voice channel was always picking an agent wearing a channel label.
 * Two things follow:
 *
 *  1. The outbound half below reuses `VoiceChannelView` unchanged, scoped to one
 *     agent. Nothing was duplicated or reimplemented.
 *  2. The agent, not the channel, is the selector — which lets a chat agent appear
 *     here at all. Chat agents were previously invisible in Analytics despite
 *     computing post-call variables on every conversation.
 *
 * An agent has up to two halves of behaviour and they are NOT summed:
 *  - **Outbound** — calls it placed from campaign voice nodes. Denominator is the
 *    audience it was pointed at.
 *  - **Inbound** — sessions that arrived and were routed to it. No denominator.
 * Averaging containment over both would divide by incomparable bases, so each half
 * keeps its own spine and they sit side by side.
 */
import { useMemo } from "react";
import { VoiceChannelView } from "@/components/analytics/VoiceChannelView";
import { MetricCard, SessionFunnel } from "@/components/inbound/SessionBits";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CAMPAIGNS, buildChannelAssets } from "@/lib/analytics-data";
import { useAgents, type AgentRecord } from "@/lib/agent-data";
import {
  allSessions,
  computeSessionMetrics,
  fmtDuration,
  fmtMs,
  fmtPct,
  useEntryPoints,
} from "@/lib/inbound";
import { cn } from "@/lib/utils";
import { Bot, Phone, MessageCircle, ArrowUpRight, ArrowDownLeft } from "lucide-react";

/** Selection is lifted so a campaign voice node can deep-link straight to its
 *  agent. `agentId` may name an agent that did no work (or none at all) — the
 *  fallback to the first working agent covers both. */
export function AgentAnalytics({
  agentId,
  onAgentChange,
}: {
  agentId?: string;
  onAgentChange: (id: string) => void;
}) {
  const agents = useAgents();
  const eps = useEntryPoints();
  const sessions = useMemo(() => allSessions(eps), [eps]);

  // Outbound presence, keyed by agent id — this map is the literal evidence that a
  // "voice channel asset" and an agent are the same object.
  const outboundByAgent = useMemo(() => {
    const m = new Map<string, { campaignId: string; runId: string; nodeId: string }[]>();
    for (const asset of buildChannelAssets("voice")) {
      m.set(
        asset.id,
        asset.refs.map((r) => ({
          campaignId: r.campaignId,
          runId: r.runId,
          nodeId: r.nodeId,
        })),
      );
    }
    return m;
  }, []);

  const inboundByAgent = useMemo(() => {
    const m = new Map<string, typeof sessions>();
    for (const s of sessions) {
      if (!s.agentId) continue;
      const cur = m.get(s.agentId) ?? [];
      cur.push(s);
      m.set(s.agentId, cur);
    }
    return m;
  }, [sessions]);

  // Only agents that actually did work. An agent with neither half has nothing to
  // show, and listing it would imply a data problem rather than an idle agent.
  const working = useMemo(
    () =>
      agents.filter(
        (a) => (outboundByAgent.get(a.id)?.length ?? 0) > 0 || (inboundByAgent.get(a.id)?.length ?? 0) > 0,
      ),
    [agents, outboundByAgent, inboundByAgent],
  );

  const agent = working.find((a) => a.id === agentId) ?? working[0];

  if (!agent) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
        <Bot className="mx-auto h-6 w-6 text-muted-foreground/50" />
        <p className="mt-3 text-[13px] font-medium">No agent activity yet</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Agents appear here once they handle a campaign node or an inbound session.
        </p>
      </div>
    );
  }

  const outRefs = outboundByAgent.get(agent.id) ?? [];
  const inSessions = inboundByAgent.get(agent.id) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={agent.id} onValueChange={onAgentChange}>
          <SelectTrigger className="h-8 w-[260px] text-[12.5px]">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            {working.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} · {a.type === "voice" ? "Voice" : "Chat"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <AgentChip agent={agent} />
        <p className="ml-auto text-[11.5px] text-muted-foreground">
          {outRefs.length > 0 && inSessions.length > 0
            ? "Works both directions"
            : outRefs.length > 0
              ? "Outbound only"
              : "Inbound only"}
        </p>
      </div>

      <DirectionSplit outboundNodes={outRefs.length} inboundSessions={inSessions.length} />

      {/* ── Inbound half ── */}
      <Half
        icon={ArrowDownLeft}
        title="Inbound"
        subtitle="Sessions routed to this agent. No denominator — you do not choose who arrives."
        empty={
          inSessions.length === 0
            ? "This agent is not attached to any inbound entry point rule."
            : undefined
        }
      >
        <InboundHalf sessions={inSessions} />
      </Half>

      {/* ── Outbound half ── */}
      <Half
        icon={ArrowUpRight}
        title="Outbound"
        subtitle="Calls this agent placed from campaign voice nodes, against a chosen audience."
        empty={
          outRefs.length === 0
            ? agent.type === "chat"
              ? "Chat agents have no outbound surface — campaign WhatsApp nodes send templates, they do not run an agent."
              : "This agent is not bound to any campaign voice node."
            : undefined
        }
      >
        <OutboundHalf refs={outRefs} />
      </Half>
    </div>
  );
}

function AgentChip({ agent }: { agent: AgentRecord }) {
  const Icon = agent.type === "voice" ? Phone : MessageCircle;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[11.5px] text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {agent.type === "voice" ? "Voice" : "Chat"}
      <span className="text-muted-foreground/40">·</span>
      <span
        className={cn(
          "font-medium",
          agent.status === "live" ? "text-success"
          : agent.status === "paused" ? "text-warning"
          : "text-muted-foreground",
        )}
      >
        {agent.status}
      </span>
    </span>
  );
}

/** Where this agent's work actually came from — stated before either half so the
 *  reader knows which numbers below are load-bearing. */
function DirectionSplit({
  outboundNodes,
  inboundSessions,
}: {
  outboundNodes: number;
  inboundSessions: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-3.5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Where this agent works
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[12.5px]">
        <span className="inline-flex items-center gap-1.5">
          <ArrowDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium tabular-nums">{inboundSessions.toLocaleString()}</span>
          <span className="text-muted-foreground">inbound sessions</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium tabular-nums">{outboundNodes}</span>
          <span className="text-muted-foreground">
            campaign {outboundNodes === 1 ? "node" : "nodes"}
          </span>
        </span>
        <span className="text-[11.5px] text-muted-foreground/80">
          Kept apart deliberately — the two halves have incomparable denominators.
        </span>
      </div>
    </div>
  );
}

function Half({
  icon: Icon,
  title,
  subtitle,
  empty,
  children,
}: {
  icon: typeof ArrowUpRight;
  title: string;
  subtitle: string;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2">
        <Icon className="h-4 w-4 shrink-0 translate-y-0.5 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <p className="text-[11.5px] text-muted-foreground">{subtitle}</p>
      </div>
      {empty ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center text-[12px] text-muted-foreground">
          {empty}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function InboundHalf({ sessions }: { sessions: ReturnType<typeof allSessions> }) {
  const m = useMemo(() => computeSessionMetrics(sessions), [sessions]);
  if (sessions.length === 0) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Sessions" value={m.received.toLocaleString()} />
        <MetricCard
          label="Containment"
          value={fmtPct(m.containmentRate)}
          tone={m.containmentRate >= 0.6 ? "good" : "warn"}
          hint="Resolved ÷ engaged sessions that ended."
        />
        <MetricCard label="Handoff" value={fmtPct(m.handoffRate)} />
        <MetricCard label="Median TTFR" value={fmtMs(m.medianFirstResponseMs)} />
        <MetricCard label="Median handle" value={fmtDuration(m.medianHandleMs)} />
      </div>
      <SessionFunnel m={m} />
    </div>
  );
}

/**
 * The outbound half is `VoiceChannelView` verbatim, pinned to this one agent.
 * `agentExplicitlyOne` is true because selecting an agent is exactly the condition
 * that view's intent widgets were already gating on — the post-call intent taxonomy
 * is agent-defined, so it is only meaningful in single-agent scope.
 */
function OutboundHalf({ refs }: { refs: { campaignId: string; runId: string; nodeId: string }[] }) {
  const vrefs = useMemo(
    () =>
      refs.flatMap((ref) => {
        const campaign = CAMPAIGNS.find((c) => c.id === ref.campaignId);
        const run = campaign?.runs.find((r) => r.id === ref.runId);
        const node = run?.sankey.nodes.find((n) => n.id === ref.nodeId);
        return run && node ? [{ run, node }] : [];
      }),
    [refs],
  );
  if (vrefs.length === 0) return null;
  return <VoiceChannelView refs={vrefs} agentExplicitlyOne />;
}
