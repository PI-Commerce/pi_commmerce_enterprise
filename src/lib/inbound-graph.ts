/**
 * Inbound entry-point graphs.
 *
 * An entry point used to be an ordered rule table: `MatchCondition → agentId`,
 * first match wins. That shape could not express *sequence* — "call the CRM,
 * branch on what came back, then pick an agent" needs steps that happen in order
 * and read each other's output. So the routing config is now a graph.
 *
 * The graph describes what happens to ONE arrival, which is exactly what a
 * campaign graph describes for one lead. (The unit correspondence is Lead :
 * Session — NOT Run : Session; a Run is a whole population.) That is why this
 * reuses the campaign DSL wholesale — `WorkflowNodeData`, `PresetBranch` /
 * `branchConditions`, the node renderer, the config panel. Only three node kinds
 * are new.
 *
 * `agentSession` is TERMINAL. A `Session` is a leaf — one `agentId`, one `stage`,
 * one transcript, one cost — so two agent handoffs on one path would break the
 * partition `computeSessionMetrics` depends on. Reaching an `agentSession` ends
 * routing; everything downstream of it is unreachable by definition.
 */
import type { InboundChannel } from "./inbound";
import type {
  NodeKind,
  PresetBranch,
  PresetCondition,
  WorkflowNodeData,
} from "./campaign-types";
import { branchConditions } from "./campaign-types";

/** A node as stored on the entry point — the serializable half of a ReactFlow node. */
export type InboundNode = {
  id: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
};

export type InboundEdge = {
  id: string;
  source: string;
  target: string;
  /** Output port id on the source node. Absent for single-output nodes. */
  sourceHandle?: string | null;
};

export type InboundGraph = { nodes: InboundNode[]; edges: InboundEdge[] };

/** What an arriving contact carries. At runtime this comes off the webhook. */
export type ArrivalTraits = {
  hasReferral: boolean;
  withinHours: boolean;
  text?: string;
  /** Webhook arrivals only — the event name the payload carried. */
  event?: string;
  /**
   * Which named source the arrival came through, as the trigger's output id
   * (`ad:<source_id>` or `link:<marker>`).
   *
   * Simulated alongside the rest so the dead-edge check knows a per-ad or per-QR
   * branch is reachable. Without it every one of those outputs would be reported
   * unreachable the moment it was wired, which trains an author to ignore the
   * one warning that catches real mistakes.
   */
  source?: string;
};

/**
 * Variables an `inboundTrigger` publishes, by channel.
 *
 * Channel-aware on purpose: a phone call has no ad referral and no message text,
 * so offering `trigger.referral_ad` on a voice entry point would let an author
 * write a branch that can never be taken. {@link triggerVariables} narrows this
 * further by the configured trigger kind, for the same reason one level down.
 */
export const TRIGGER_VARIABLES: Record<
  InboundChannel,
  { key: string; source: string }[]
> = {
  whatsapp: [
    { key: "trigger.referral_ad", source: "Inbound Trigger" },
    { key: "trigger.message_text", source: "Inbound Trigger" },
    { key: "trigger.within_hours", source: "Inbound Trigger" },
    { key: "trigger.phone", source: "Inbound Trigger" },
  ],
  voice: [
    { key: "trigger.within_hours", source: "Inbound Trigger" },
    { key: "trigger.phone", source: "Inbound Trigger" },
  ],
  /* A webhook arrival has no message and no call, so the channel-shaped variables are
     absent. What it does have is the event that fired it and the payload it carried —
     `trigger.payload` standing in for the body a branch can read a field out of. */
  webhook: [
    { key: "trigger.event", source: "Inbound Trigger" },
    { key: "trigger.payload", source: "Inbound Trigger" },
    { key: "trigger.within_hours", source: "Inbound Trigger" },
    { key: "trigger.phone", source: "Inbound Trigger" },
  ],
};

/**
 * Published whenever an entry point accepts more than one kind.
 *
 * An entry point taking ads, QR scans and plain messages hands the agent a
 * conversation with no idea which of those happened — and that is exactly the
 * context it should open with. One variable fixes it.
 */
export const ENTRY_KIND_VARIABLE = { key: "trigger.entry_kind", source: "Inbound Trigger" };

/** Extra variables a trigger publishes because of *how* it fired. */
const KIND_VARIABLES: Record<string, { key: string; source: string }[]> = {
  keyword: [{ key: "trigger.matched_keyword", source: "Inbound Trigger" }],
  /* Every one of these is a field Meta actually sends on `referral`. `ctwa_clid` is
     the click id, and it is the only one that closes the loop back to ad spend —
     published deliberately, because it is the field that gets dropped at integration
     time and missed six months later when somebody asks why CTWA ROAS is unmeasurable. */
  ctwa_ad: [
    { key: "trigger.referral_ad", source: "Inbound Trigger" },
    { key: "trigger.ad_id", source: "Inbound Trigger" },
    { key: "trigger.ad_headline", source: "Inbound Trigger" },
    { key: "trigger.source_type", source: "Inbound Trigger" },
    { key: "trigger.ctwa_clid", source: "Inbound Trigger" },
  ],
  /* One variable, because one is all there is. Meta sends nothing about a QR
     scan, so the only thing we know is the marker we planted ourselves. */
  qr_link: [{ key: "trigger.link_token", source: "Inbound Trigger" }],
  webhook: [{ key: "trigger.event", source: "Inbound Trigger" }],
};

/**
 * What a trigger actually publishes, given its channel and its configured kind.
 *
 * The channel sets the floor — a phone number, business hours — and the kind adds
 * what only that arrival carries. An "any message" trigger does not publish a matched
 * keyword, so a branch testing one can never be taken, and the picker should not
 * offer it in the first place.
 */
export function triggerVariables(
  channel: InboundChannel,
  kind?: string | string[],
  outputs?: { name: string }[],
): { key: string; source: string }[] {
  const base = TRIGGER_VARIABLES[channel] ?? [];
  /* The union across every accepted kind, plus `entry_kind` once there is more than
     one — because a variable only some arrivals populate is worse than an absent one
     unless the graph can tell which arrival it got. */
  const kinds = Array.isArray(kind) ? kind : kind ? [kind] : [];
  const extra = [
    ...kinds.flatMap((k) => KIND_VARIABLES[k] ?? []),
    ...(kinds.length > 1 ? [ENTRY_KIND_VARIABLE] : []),
  ];
  /* The author's own payload mappings are published like any other trigger variable.
     They are last because they are the ones that change as the graph is edited. */
  const mapped = (outputs ?? [])
    .filter((o) => o.name.trim())
    .map((o) => ({ key: `trigger.${o.name.trim()}`, source: "Inbound Trigger" }));
  const out: { key: string; source: string }[] = [];
  const seen = new Set<string>();
  for (const v of [...base, ...extra, ...mapped]) {
    if (seen.has(v.key)) continue;
    seen.add(v.key);
    out.push(v);
  }
  return out;
}

/** Kinds that end routing when reached. */
/* `assignHuman` ends routing too: once a person holds the conversation the
   journey has nothing further to do. */
const TERMINAL_KINDS = new Set<NodeKind>(["agentSession", "assignHuman", "end"]);

export function isRoutingTerminal(kind: NodeKind): boolean {
  return TERMINAL_KINDS.has(kind);
}

// ── Condition evaluation ────────────────────────────────────────────────────

const VALUELESS = new Set(["exists", "does not exist"]);

function varBag(t: ArrivalTraits): Record<string, string | undefined> {
  return {
    // Presence is the signal, so the value is a token rather than a real ad id:
    // the resolver only ever asks whether it exists.
    "trigger.referral_ad": t.hasReferral ? "ad_referral" : undefined,
    "trigger.message_text": t.text,
    "trigger.within_hours": t.withinHours ? "true" : "false",
    "trigger.event": t.event,
    /* Not a published variable — the resolver's own channel for which named
       source fired. Branching on it is done by wiring the trigger's output, not
       by writing a condition against it. */
    "trigger.source": t.source,
    // Presence again: a branch tests that a payload arrived, never its contents.
    "trigger.payload": "{}",
  };
}

function evalCondition(
  c: PresetCondition,
  bag: Record<string, string | undefined>,
): boolean {
  if (!c.variable) return false;
  if (!VALUELESS.has(c.op) && !c.value) return false; // half-authored

  const raw = bag[c.variable];
  const has = raw != null && raw !== "";
  const v = (raw ?? "").toLowerCase();
  const target = (c.value ?? "").toLowerCase();
  const n = Number(raw);
  const t1 = Number(c.value);
  const t2 = Number(c.value2);

  switch (c.op) {
    case "exists": return has;
    case "does not exist": return !has;
    case "equals": return has && v === target;
    case "not equals": return !(has && v === target);
    case "contains": return has && v.includes(target);
    case "does not contain": return !(has && v.includes(target));
    case "greater than": return has && n > t1;
    case "less than": return has && n < t1;
    case "greater than or equal to": return has && n >= t1;
    case "less than or equal to": return has && n <= t1;
    case "between": return has && n >= t1 && n <= t2;
    case "not between": return !(has && n >= t1 && n <= t2);
    default: return false;
  }
}

/**
 * Whether a branch is taken. A branch with no usable conditions matches nothing
 * — an author mid-edit should not silently capture all traffic.
 */
function branchMatches(
  b: PresetBranch,
  bag: Record<string, string | undefined>,
): boolean {
  const cs = branchConditions(b).filter((c) => c.variable);
  if (!cs.length) return false;
  return (b.logic ?? "AND") === "OR"
    ? cs.some((c) => evalCondition(c, bag))
    : cs.every((c) => evalCondition(c, bag));
}

// ── Resolution ──────────────────────────────────────────────────────────────

export type GraphResolution = {
  /** Unset when the arrival fell out of the graph — i.e. `unrouted`. */
  agentId?: string;
  /** Node ids visited in order. Drives the "trace an arrival" panel. */
  path: string[];
  /** Edge ids traversed. Drives dead-branch detection. */
  edges: string[];
};

/** Cheap insurance against a user-authored cycle hanging the render. */
const MAX_STEPS = 64;

function outgoing(
  graph: InboundGraph,
  source: string,
  handle: string | null,
): InboundEdge | undefined {
  if (handle == null) return graph.edges.find((e) => e.source === source);
  return graph.edges.find(
    (e) => e.source === source && e.sourceHandle === handle,
  );
}

/**
 * Which output port an arrival leaves a node through.
 *
 * Conditionals evaluate their branches top → bottom and fall through to the
 * always-present `default` port — the same first-match-wins semantics the old
 * rule list had, which is what makes the two resolvers comparable.
 *
 * `apiToolCall` takes `success` deterministically: seeded sessions do not
 * simulate transport failure, and a resolver that randomly took `timeout` would
 * make the funnel non-reproducible.
 */
function exitHandle(
  node: InboundNode,
  bag: Record<string, string | undefined>,
): string | null {
  const { kind, config, outputs } = node.data;
  if (kind === "conditional") {
    for (const b of config?.branches ?? []) {
      if (branchMatches(b, bag)) return b.id;
    }
    return "default";
  }
  if (kind === "apiToolCall") return "success";
  /* The trigger leaves by the named source that fired, falling through to the
     always-present default — the same first-match-wins shape as a conditional,
     because that is what an author already understands from the canvas. */
  if (kind === "inboundTrigger" && outputs?.length) {
    const wanted = bag["trigger.source"];
    return outputs.find((o) => o.id === wanted)?.id ?? "default";
  }
  // Anything else with named ports leaves through its first one.
  return outputs?.length ? outputs[0].id : null;
}

/** Walk the graph for one arrival. Mirrors AC-E2 via conditional branch order. */
export function resolveViaGraph(
  graph: InboundGraph,
  traits: ArrivalTraits,
): GraphResolution {
  const bag = varBag(traits);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const path: string[] = [];
  const edges: string[] = [];
  const seen = new Set<string>();

  let cur = graph.nodes.find((n) => n.data.kind === "inboundTrigger");

  for (let step = 0; cur && step < MAX_STEPS; step++) {
    if (seen.has(cur.id)) break; // cycle — treat as unrouted
    seen.add(cur.id);
    path.push(cur.id);

    if (cur.data.kind === "agentSession")
      return { agentId: cur.data.config?.agentId, path, edges };
    if (cur.data.kind === "end") return { path, edges };

    const edge = outgoing(graph, cur.id, exitHandle(cur, bag));
    if (!edge) return { path, edges }; // dangling — nobody answers
    edges.push(edge.id);
    cur = byId.get(edge.target);
  }
  return { path, edges };
}

/**
 * Human-readable trace of a resolved path, for session diagnostics. The trigger
 * is dropped — every arrival starts there, so naming it says nothing.
 */
export function describeRoute(graph: InboundGraph, path?: string[]): string {
  if (!path?.length) return "—";
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const steps = path
    .map((id) => byId.get(id))
    .filter((n) => n && n.data.kind !== "inboundTrigger")
    .map((n) => n!.data.title);
  return steps.length ? steps.join(" → ") : "—";
}

// ── Static analysis over the whole trait space ──────────────────────────────

/**
 * The finite set of arrivals worth testing.
 *
 * The condition language only predicates on referral presence, hours membership
 * and message text, so the space collapses to referral × hours × {no text, one
 * representative text per authored `contains` value}. Enumerating it lets both
 * coverage and dead-branch analysis be *proved* against the real resolver rather
 * than inferred from the shape of the config.
 */
/**
 * Every arrival worth simulating, for the dead-edge check.
 *
 * Free-text traits are drawn from the graph itself rather than enumerated: the only
 * message bodies and event names worth testing are the ones some branch actually
 * tests for, plus the absent case. Miss that and a branch keying on a value the
 * simulation never produces is reported unreachable when it is simply specific —
 * which is exactly what happened to the first webhook graph, whose `trigger.event`
 * branch was flagged dead because nothing here had ever heard of events.
 */
export function traitSpace(graph: InboundGraph): ArrivalTraits[] {
  const texts = new Set<string | undefined>([undefined]);
  const events = new Set<string | undefined>([undefined]);
  for (const n of graph.nodes) {
    if (n.data.kind !== "conditional") continue;
    for (const b of n.data.config?.branches ?? []) {
      for (const c of branchConditions(b)) {
        if (c.variable === "trigger.message_text" && c.value) texts.add(c.value);
        if (c.variable === "trigger.event" && c.value) events.add(c.value);
      }
    }
  }
  /* Every named source the trigger declares, plus "none of them" — which is what
     makes both a per-source branch and the default reachable in the simulation. */
  const trigger = graph.nodes.find((n) => n.data.kind === "inboundTrigger");
  const sources: (string | undefined)[] = [
    undefined,
    ...(trigger?.data.outputs ?? []).filter((o) => o.id !== "default").map((o) => o.id),
  ];

  const out: ArrivalTraits[] = [];
  for (const hasReferral of [true, false])
    for (const withinHours of [true, false])
      for (const text of texts)
        for (const event of events)
          for (const source of sources)
            out.push({ hasReferral, withinHours, text, event, source });
  return out;
}

/**
 * Edges no arrival can ever traverse.
 *
 * Removed when inbound lost its conditionals and restored with them: on a canvas
 * the branch order that shadows a path is hidden inside a conditional's config
 * panel, so an unreachable path is invisible unless the canvas says so.
 *
 * Edges leaving an unreachable node are excluded — reporting the whole dead tail
 * would bury the one edge the author actually needs to fix.
 */
export function deadEdges(graph: InboundGraph): Set<string> {
  const live = new Set<string>();
  for (const t of traitSpace(graph))
    for (const id of resolveViaGraph(graph, t).edges) live.add(id);

  const reachable = new Set<string>();
  const trigger = graph.nodes.find((n) => n.data.kind === "inboundTrigger");
  if (trigger) reachable.add(trigger.id);
  for (const id of live) {
    const e = graph.edges.find((x) => x.id === id);
    if (e) reachable.add(e.target);
  }

  return new Set(
    graph.edges
      .filter((e) => !live.has(e.id) && reachable.has(e.source))
      .map((e) => e.id),
  );
}
