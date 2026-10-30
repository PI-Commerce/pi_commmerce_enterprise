# PRD — Inbound Entry Points & Sessions (v2)

**Product:** Pi Commerce Enterprise
**Feature area:** Inbound, and how the construct differs from Campaigns
**Status:** **Built** — this documents what shipped. v1 was a proposal and the build diverged from
it in eight material ways; see §8.
**Supersedes:** `PRD-Inbound-and-Analytics-v1.md` §3.3, AC-E2, AC-E4, AC-S2, §8.2, §8.4
**Last updated:** 28 Aug 2026

---

## 1. Purpose and status

v1 proposed inbound. It was written before the feature existed and its status line still reads
*"Proposal — not built."* Inbound is now built, and the implementation departed from v1 on several
load-bearing points — the routing model, the number of terminal stages, the containment denominator,
and the primary analytics axis.

This matters more than a normal doc-lag, because **the code cites v1 by section**. There are
in-source references to `PRD AC-S2` (`inbound.ts:31`), `PRD §8.2` (`inbound.ts:748`), `AC-E2`
(`inbound-graph.ts:197`, `inbound.ts:163`), `AC-E4` (`inbound.ts:849`), `AC-S3` (`inbound.ts:133`)
and `PRD §8.4` (`InboundAnalytics.tsx:24`). Four of those six now point at text the build
contradicts. A reader who follows the citation gets the wrong answer.

So this document has two jobs:

1. **Specify inbound as built** (§5–§7), so the citations resolve to something true.
2. **State the difference from the campaign construct** (§3–§4), which is the question that actually
   comes up — because the two share a canvas, a node DSL and a config panel, and look far more alike
   on screen than they are underneath.

**Scope caveat.** This is an in-memory prototype. Entry points live in a module-level store
(`inbound.ts:805-806`); sessions are deterministically generated from the entry-point id
(`inbound.ts:16-18`) rather than recorded from real traffic. A hard reload replays the seed. Every
requirement below is therefore a requirement on the *product*, and the prototype satisfies some of
them only in the sense that its mock data is shaped correctly. §9 says which is which.

---

## 2. The construct

Inbound is **two objects**, and the whole model follows from the difference between them.

| Object | What it is | Lifecycle |
|---|---|---|
| **Entry point** | Always-on infrastructure. Binds `channel + address`, and carries the graph that routes an arrival to an agent. | `live` / `paused` / `draft`. No start date, no end date. |
| **Session** | One customer's continuous interaction through an entry point. One agent, one stage, one transcript, one cost. | Created on arrival, ends in exactly one terminal stage. |

From `inbound.ts:2-14`:

> *The inbound counterpart to Campaigns/Runs. The dividing line is who initiates and what the unit
> of work is: a campaign Run fans out over a known Audience and terminates; an inbound Session is
> one person, N turns, open-ended.*
>
> *All three v1 use cases (CTWA ads, WhatsApp service, inbound call) are the SAME construct — they
> differ only in graph and handler.*

That last sentence is a requirement, not an observation. The three use cases are not three features:

| Use case | Channel | What separates it | Handler |
|---|---|---|---|
| CTWA ad | WhatsApp | Meta referral payload **present** | sales / concierge agent |
| WhatsApp service | WhatsApp | referral **absent** | support agent |
| Inbound call | Voice | dialled a voice DID | voice agent |

Use cases 1 and 2 arrive **on the same number**. They are two branches of one entry point's graph,
not two entry points (`inbound.ts:260-264`). Nothing but the referral payload tells them apart, and
that fact propagates all the way into the analytics axis — see §7.

---

## 3. How inbound differs from the campaign construct

### 3.1 The dividing line is not channel

Both constructs send WhatsApp messages and place voice calls. Channel is not the axis. The axis is
**who initiates**, and the second-order consequence — **what one row represents** — is what forces
two objects instead of one.

### 3.2 The unit correspondence is Lead : Session, not Run : Session

This is the single most-misread point, and it is called out in the source
(`inbound-graph.ts:9-11`):

> *The graph describes what happens to ONE arrival, which is exactly what a campaign graph describes
> for one lead. (The unit correspondence is Lead : Session — NOT Run : Session; a Run is a whole
> population.)*

The tempting analogy is *campaign : entry point :: run : session*, because a run and a session are
both "the thing that happens at execution time". It is wrong, and it is wrong in a way that produces
bad metrics.

```
Campaign            Inbound
────────            ───────
Campaign            Entry point        the authored thing
   │                   │
   ▼                   │
  Run  ───┐            │               NO INBOUND EQUIVALENT
          │            │
       Lead  ◄─────► Session           the unit of work: one person
```

A **Run** is a container over a population: it has an audience, a size, a start, an end, and a
completion state. A **Session** has none of those — it is one person. The row that corresponds to a
session is a **Lead**, and inbound simply has no object at the Run level. Arrivals are not batched
into anything.

**Consequence:** every campaign rate has a population denominator that is known before the run
starts (audience size). No inbound rate does. Inbound rates are all conditional shares of a funnel
that is only known after the fact, which is why §6.4 is fussy about denominators in a way campaign
analytics never has to be.

### 3.3 There is no Audience, and therefore no denominator

A campaign graph begins with a locked `start` → `audience` pair. The audience node is where the
population and its schema are declared: CSV columns, or an API payload schema, and which field is
the phone number (`campaign-types.ts:105-177`). Everything downstream branches on `contact.*`
variables derived from that schema.

An inbound graph begins with a locked `inboundTrigger`, and the trigger publishes **traits of one
arrival**, not a schema over a population (`inbound-graph.ts:47-52`):

```ts
type ArrivalTraits = {
  hasReferral: boolean;
  withinHours: boolean;
  text?: string;
};
```

The variables are correspondingly narrow, and **channel-scoped on purpose**
(`inbound-graph.ts:54-59`):

> *Channel-aware on purpose: a phone call has no ad referral and no message text, so offering
> `trigger.referral_ad` on a voice entry point would let an author write a branch that can never be
> taken.*

| | Campaign | Inbound |
|---|---|---|
| First node | `audience` (locked) | `inboundTrigger` (locked) |
| Declares | a population + its schema | the traits of one arrival |
| Variables | `contact.*`, derived from CSV/API schema | `trigger.referral_ad`, `trigger.message_text`, `trigger.within_hours`, `trigger.phone` — WhatsApp; only the last two on voice |
| Size known | before the run starts | never |

### 3.4 Liveness lives in different places

This is subtle and it is the difference an operator feels.

**Campaign.** The campaign's own status is config-only — `draft` or `ready`
(`campaign-types.ts:40-44`):

> *Liveness lives on Runs, not the campaign: a campaign can have any number of associated runs in
> flight, but its status never becomes "running". The campaign table surfaces the associated-run
> count so editing risk is visible.*

So a campaign is never "live". Runs are. Editing a campaign is risky *because* runs may be in
flight against it, and the run count is displayed for exactly that reason.

**Inbound.** Liveness is on the entry point itself — `live` / `paused` / `draft`. There is no
container below it to carry state. A session is a **record of something that already happened**, not
a container you operate. You pause an entry point; you do not pause a session.

| | Campaign | Inbound |
|---|---|---|
| Authored object status | `draft` \| `ready` — config only | `live` \| `paused` \| `draft` — operational |
| Is the authored object ever "running"? | No | Yes — `live` is exactly that |
| Execution-time object | Run: `pending`/`running`/`paused`/`completed`/`failed`/`terminated` | Session: a terminal record; only `active` is in-flight |
| Can the operator act on the execution-time object? | Yes — pause, terminate | No — a session is history |

### 3.5 How each one starts

**A campaign has no native trigger.** The trigger is chosen at *run creation*, and it is derived
from where the audience comes from (`CreateRunDialog.tsx:23-38`):

> *The three sources are the three directions a person can arrive from, and they are not variants of
> each other: CSV — you hand us the file. Connection — we go and read it out of your CRM. API
> payload — your engagement tool posts people to us as they qualify.*
>
> *Scope decides which are on offer, because the first two are us going and looking, and looking
> happens at a time … Only the third has no such need … So an always-on run is API payload and
> nothing else.*

**An inbound entry point's trigger is the entry point.** The `channel + address` binding *is* the
trigger: a message to that number, or a call to that DID. There is nothing to choose, nothing to
schedule, and no dialog. Provisioning the address is the act of turning it on.

Note the near-miss: a campaign run with `audienceSource: "api"` and `runType: "always-on"` is also
open-ended and externally initiated, which makes it the closest campaign construct to an entry
point. It is still not one — the external system decides *who qualifies* and pushes them, so the
population is authored elsewhere but still authored. Inbound has no authored population at all.

### 3.6 The funnel: authored versus fixed

This is the property that forces separate analytics, and it is the most useful single distinction in
this document.

A **campaign funnel is authored**. It is the shape of the DAG the operator drew. Two campaigns have
different graphs, so their funnels are different objects and cannot be compared node-for-node. That
is why campaign analytics draws a Sankey over the authored graph.

An **inbound funnel is fixed**. Every session, on every channel, through every entry point, walks
the same lifecycle:

```
Received ──► Routed ──► Engaged ──┬──► Resolved     (contained)
                                  ├──► Handed off   (human)
                                  ├──► Abandoned    (dropped mid-conversation)
                                  └──► Expired      (timeout)
```

From `InboundAnalytics.tsx:4-8`:

> *The campaign tab draws a Sankey over an authored graph, so its shape differs per campaign and two
> campaigns are only loosely comparable. Inbound is the opposite: every session walks the same fixed
> lifecycle, so arrival types and agents sit on one directly-comparable axis. That is the whole
> reason this is a separate tab rather than a campaign filter.*

**Consequence:** inbound entry points, agents and arrival types are directly comparable on identical
axes. Campaigns are not. This is not a reporting preference — it is a structural property of the two
constructs, and it is why "add an inbound filter to the campaign tab" was rejected.

### 3.7 Terminal semantics differ

A campaign graph ends at `end`. Action nodes are pass-through: a WhatsApp send has outputs
(`btn_0`, `reply_received`, `no_response`) and the flow continues through whichever fired.

An inbound graph has a second terminal, and it is the important one — `agentSession`
(`inbound-graph.ts:16-19`):

> *`agentSession` is TERMINAL. A `Session` is a leaf — one `agentId`, one `stage`, one transcript,
> one cost — so two agent handoffs on one path would break the partition `computeSessionMetrics`
> depends on. Reaching an `agentSession` ends routing; everything downstream of it is unreachable by
> definition.*

So handing the arrival to an agent **ends the graph's involvement**. The graph is pre-routing only;
the conversation is not on the canvas. Two consequences worth stating plainly:

- A path cannot chain two agents. If it could, a session would have two `agentId`s and the
  containment partition in §6.3 would stop balancing.
- Anything an author places downstream of an `agentSession` is dead. The canvas must say so — see
  §5.3.

### 3.8 Side by side

| | Campaign | Inbound |
|---|---|---|
| Initiator | the business | the customer |
| Authored object | Campaign | Entry point |
| Execution container | **Run** (a population) | **none** |
| Unit of work | Lead | **Session** — corresponds to Lead |
| First node | `audience`, locked | `inboundTrigger`, locked |
| Trigger | chosen at run creation, from audience source | the `channel + address` binding itself |
| Population | declared in advance | unknowable |
| Denominator | audience size | none — conditional shares only |
| Liveness | on the Run | on the Entry point |
| Shape | finite authored DAG, terminates | fixed lifecycle, open-ended per session |
| Funnel | authored, per-campaign, Sankey | fixed, identical, directly comparable |
| Terminals | `end` | `end` **and** `agentSession` |
| Primary KPI | conversion rate | **containment rate** |
| Cost metric | cost per conversion | cost per resolution |
| Operator model | a project you **launch** | infrastructure you **keep on** |
| Reusable library | Campaign Templates | **none** (§9) |

---

## 4. What the two constructs share

The divergence above is about the *objects*. The **authoring layer is deliberately one thing**, and
that is a decision worth protecting because it is what makes inbound cheap to maintain.

From `campaign-types.ts:8-13`:

> *Every primitive either surface can place. Campaigns and inbound entry points share one union
> rather than two, so `ConditionalFields`, the node renderer and the variable plumbing work
> unchanged on both. Which kinds a given canvas offers is a palette concern.*

| Shared | Diverges |
|---|---|
| `WorkflowNodeData` — one node type for both surfaces | Which `NodeKind`s the palette offers |
| `PresetBranch` / `branchConditions` — one condition language | Which variables are in scope |
| The ReactFlow node renderer | — |
| `ConfigPanel` — the same editors, same variable pickers | Inbound passes `extraVariables` + `onlyExtraVariables` |
| ELK auto-layout | — |
| Validation idiom: per-node `valid` + inline `error` | — |

**Node kinds by surface:**

| Kind | Campaign | Inbound |
|---|---|---|
| `start`, `end` | ✔ | `end` only |
| `inboundTrigger` | — | ✔ (exactly one, locked) |
| `audience` | ✔ (locked, mandatory) | — |
| `apiToolCall`, `conditional`, `delay` | ✔ | ✔ |
| `aiTransform` | — | ✔ |
| `abSplit` | ✔ | — |
| `voiceCall`, `whatsapp`, `sms` | ✔ | — |
| `agentSession` | — | ✔ (terminal) |
| `adsCampaign` | ✔ | — |

`abSplit`'s absence is the tell (`NodePalette.tsx:37-41`):

> *Inbound entry-point graphs route ONE arrival, so the outbound-only primitives are absent: there
> is no Audience to fan out over, hence no A/B split, and the channel is already fixed by the number
> the contact dialled or messaged.*

An A/B split partitions a population. Inbound has no population, so the primitive has nothing to
mean. The same argument removes the three action nodes: the channel is not a choice on an inbound
path, it is a property of how the contact reached us.

`aiTransform` runs the other way — it is on the inbound palette and not the campaign one, despite
being a shared kind with a shared config editor. That is a palette decision, not a model one, and it
is the cleanest demonstration of AC-SH1: the primitive needed no inbound-specific implementation to
become available on one surface and not the other.

**AC-SH1 — One DSL, two palettes.**
Adding a primitive usable by both surfaces must not require a second node type, a second renderer,
or a second config panel. Surface-specific availability is expressed only through the palette's
`sections` prop.

---

## 5. Entry points, as built

### 5.1 Model

```ts
type EntryPoint = {
  id: string;
  name: string;
  description: string;
  channel: "whatsapp" | "voice";
  address: string;                     // WhatsApp number or voice DID
  status: "live" | "paused" | "draft";
  graph: InboundGraph;                 // what happens to an arrival
  hours?: BusinessHours;
  createdAt: string;
};

type InboundGraph = { nodes: InboundNode[]; edges: InboundEdge[] };
```

### 5.2 Why the rule table became a graph

**v1 specified an ordered rule table** (`rules: EntryRule[]`, first match wins, plus
`fallbackAgentId`). That shipped first and was replaced. The reason (`inbound-graph.ts:4-7`):

> *An entry point used to be an ordered rule table: `MatchCondition → agentId`, first match wins.
> That shape could not express sequence — "call the CRM, branch on what came back, then pick an
> agent" needs steps that happen in order and read each other's output. So the routing config is now
> a graph.*

Sequence is the requirement a flat table cannot express, and it is not hypothetical: the seeded
`ep_voice_sales` does a CRM lookup before it routes (`inbound.ts:199-214`).

Two properties of v1 survived the change rather than being dropped:

- **First-match-wins** (AC-E2) survives as **conditional branch order**. The resolver walks a
  conditional's branches top to bottom and takes the first that matches
  (`inbound-graph.ts:186-191`).
- **`fallbackAgentId`** survives as the conditional's `default` output port. Where a seed has no
  else-agent, the `default` port is wired to an `end` node named "Unrouted"
  (`inbound.ts:249-251`) — *deliberately*:

  > *Deliberately left with nowhere to go — the arrival lands `unrouted` and the gap shows up in the
  > funnel instead of being silently absorbed.*

  This is the answer to v1's open question 5. Unrouted **is** an acceptable terminal state, and
  forcing every entry point to declare a fallback was rejected, because a fallback that exists only
  to satisfy a validator hides the routing gap rather than fixing it.

### 5.3 The static analysis the graph made necessary

Moving from a table to a graph bought sequence and cost visibility. On a rule list, a shadowed rule
is visible — the rules are right there in order. On a canvas, the branch order that causes the
shadowing is buried inside a conditional's config panel.

The build therefore ships three analyses that a rule table never needed:

**`traitSpace(graph)`** — the finite set of arrivals worth testing (`inbound-graph.ts:243-250`):

> *The condition language only predicates on referral presence, hours membership and message text,
> so the space collapses to referral × hours × {no text, one representative text per authored
> `contains` value}. Enumerating it lets both coverage and dead-branch analysis be proved against
> the real resolver rather than inferred from the shape of the config.*

Proving against the real resolver, rather than reasoning about the config, is the part that matters:
the analysis cannot drift from routing behaviour because it *is* routing behaviour.

**`deadEdges(graph)`** — edges no arrival can ever traverse (`inbound-graph.ts:269-278`):

> *This is the generalisation of the old rule list's shadowing check, and it matters more here, not
> less: on a canvas the branch order that causes the shadowing is hidden inside a conditional's
> config panel, so an unreachable path is invisible unless the canvas says so.*
>
> *Edges leaving an unreachable node are excluded — reporting the whole dead tail would bury the one
> edge the author actually needs to fix.*

**Trace** — a channel-scoped scenario panel in the builder showing where each representative arrival
lands (ad / direct × in-hours / out-of-hours for WhatsApp; in / out of hours for voice).

**AC-E7 — Unreachable paths are surfaced at author time.**
Dead edges render distinctly on the canvas and are counted in the builder header. Reporting the
whole unreachable tail instead of the single causal edge is a defect.

**AC-E8 — Coverage is provable, not asserted.**
Dead-path and coverage analysis must execute the same resolver that runtime routing uses. A second
implementation that reasons over config shape is not acceptable.

### 5.4 Acceptance criteria

**AC-E1 — Binding.** An entry point binds exactly one `(channel, address)` pair. An address belongs
to exactly one entry point.

**AC-E2 — Resolution order.** *(Supersedes v1 AC-E2.)* An arrival is resolved by walking the graph
from `inboundTrigger`. Conditional branches evaluate top to bottom, first match wins; a conditional
with no matching branch leaves through `default`. Routing ends on reaching `agentSession` or `end`.
A dangling edge, or a cycle, terminates the walk with no agent — the session is `unrouted`, never
silently dropped.

**AC-E3 — CTWA discrimination.** A WhatsApp graph can branch on referral presence, which is what
separates use case 1 from use case 2 on the same number. When present, the source ad is persisted on
the session for attribution.

**AC-E4 — Handler compatibility.** *(Amends v1 AC-E4.)* Only agents whose type matches the channel
are offered — `voice` for voice, `chat` for WhatsApp. Paused and draft agents are **returned and
shown as ineligible rather than hidden** (`inbound.ts:848-851`), because an agent silently missing
from a picker reads as a bug in the picker.

**AC-E5 — Always-on lifecycle.** No start or end date, no audience. Pausing stops new sessions;
in-flight sessions run to completion.

**AC-E6 — Channel is fixed at creation.** An entry point's channel cannot be switched once a graph
exists, because the trigger's published variables are channel-scoped and switching would leave
authored branches predicating on variables that no longer exist.

**AC-E7 / AC-E8** — see §5.3.

**AC-E9 — Saving a graph invalidates derived session data.** From `inbound.ts:831-833`:

> *Sessions are derived from the graph, so a saved rewiring has to invalidate them — otherwise the
> funnel keeps showing the old routing and the edit looks like it did nothing.*

In production this is the weaker claim that routing-derived aggregates must be attributed to the
graph version that produced them; a rewiring must not silently restate history.

### 5.5 Seeded entry points

Four, covering the three use cases (`inbound.ts:266+`):

| id | Name | Channel | Address | Status | Graph |
|---|---|---|---|---|---|
| `ep_wa_main` | WhatsApp · Main line | WhatsApp | +91 80 4718 2200 | live | referral present → concierge; else → support |
| `ep_voice_support` | Voice · Support line | voice | +91 80 4718 2100 | live | within hours → voice support; **else unrouted** |
| `ep_voice_sales` | Voice · Sales call-back | voice | +91 80 4718 2150 | live | CRM lookup → reactivation agent |
| `ep_wa_kyc` | WhatsApp · KYC line | WhatsApp | +91 80 4718 2277 | paused | all traffic → KYC agent |

Two are deliberate demonstrations rather than filler. `ep_voice_support` has no else-agent so the
`unrouted` gap is visible in the funnel. `ep_voice_sales` routes to the same agent that *places*
outbound reactivation calls — one agent, two directions, which is the case §7 and the Agent tab
exist to show.

---

## 6. Sessions, as built

### 6.1 Model

```ts
type Session = {
  id: string;
  entryPointId: string;
  agentId?: string;              // unset when stage === "unrouted"
  channel: "whatsapp" | "voice";
  contact: { name: string; phone: string };

  stage: SessionStage;
  routePath?: string[];          // node ids traversed, for routing diagnostics

  startedAt: string;
  endedAt?: string;              // unset while active
  firstResponseMs?: number;
  durationMs?: number;
  turnCount: number;

  outcome: Record<string, string>;   // from the agent's postCall vars (AC-S3)
  handoffReason?: string;
  cost: number;

  referral?: { adId: string; adName: string };   // CTWA only
  transcript: SessionTurn[];
};
```

`routePath` is the field that makes routing debuggable: it records the node ids the arrival actually
traversed, and `describeRoute` renders it as a human-readable trace on the session detail sheet,
dropping the trigger because *"every arrival starts there, so naming it says nothing"*
(`inbound-graph.ts:228-229`).

### 6.2 Seven stages, not five

**v1 AC-S2 listed five terminal stages.** The build has six terminal stages plus `active`, because
`no_response` was split out (`inbound.ts:28-34`):

> *These are exhaustive and mutually exclusive (PRD AC-S2): every ended session lands in exactly
> one, so the funnel identity in `computeSessionMetrics` always balances. `no_response` is distinct
> from `abandoned` — the first never engaged at all (agent opened, customer never replied), the
> second dropped mid-conversation.*

v1 had "customer never replied to opener" as a *failure mode into* Engaged but gave it no terminal
stage, which left it nowhere to be counted. The split is not cosmetic: `no_response` and `abandoned`
have different causes and different fixes. A high `no_response` is an opener problem. A high
`abandoned` is a mid-conversation capability problem.

| Stage | Meaning |
|---|---|
| `active` | in flight right now |
| `unrouted` | ran off the end of the graph without reaching an agent — **a routing gap, not a customer outcome** |
| `no_response` | routed, agent opened, customer never replied |
| `resolved` | agent completed with no human involvement — **the containment numerator** |
| `handed_off` | escalated to a human |
| `abandoned` | customer engaged, then stopped replying mid-conversation |
| `expired` | timed out — WhatsApp 24h window closed, or call hit silence timeout |

The distinction that carries the most operational weight is `unrouted`. It is the only stage that is
**our** failure rather than an outcome, which is why it is toned as an error everywhere it appears
and is broken out as its own KPI rather than folded into a failure bucket.

### 6.3 The identity

Every rate derives from one partition (`inbound.ts:747-750`):

```
received = unrouted + no_response + active + resolved + handed_off + abandoned + expired
```

**AC-S2 — Terminal stages are exhaustive and mutually exclusive.** *(Supersedes v1 AC-S2.)* Every
session is in exactly one stage, and the identity above holds for any set of sessions. Every
published rate must be derivable from it. A metric that cannot be expressed as a ratio of terms in
this partition does not belong on the inbound surface.

### 6.4 The containment denominator

**v1 §8.2 defined containment as `resolved ÷ engaged`. That is wrong, and the build corrects it** to
`resolved ÷ engagedEnded`, where `engagedEnded = resolved + handed_off + abandoned + expired`
(`inbound.ts:766`, `:786-788`).

`engaged` includes `active`. An in-flight session has no outcome yet, so including it in the
denominator charges containment for conversations that have not finished — containment reads
artificially low, and it dips whenever traffic *rises*, which is precisely when someone looks at it.
The same correction applies to handoff rate and abandon rate.

The UI states this where the number is displayed rather than only in the metric definition:
*"Only sessions that engaged and finished. In-flight and unrouted arrivals have no outcome yet, so
counting them here would understate every share."*

| Metric | Definition as built |
|---|---|
| Sessions received | count |
| Routing rate | `routed ÷ received` — catches routing gaps and out-of-hours volume |
| Engagement rate | `engaged ÷ routed` — did the customer answer the opener |
| **Containment rate** | `resolved ÷ engagedEnded` — **primary KPI** |
| Handoff rate | `handed_off ÷ engagedEnded` |
| Abandon rate | `abandoned ÷ engagedEnded` |
| Time to first response | median `firstResponseMs` over ended sessions |
| Median handle time | median `durationMs` over ended sessions |
| Turns per session | median `turnCount` over ended sessions |
| Cost per session | `Σ cost ÷ received` |
| Cost per resolution | `Σ cost ÷ resolved` — the figure that compares against outbound cost-per-conversion |

Note the asymmetry, which is deliberate: cost-per-session divides by **received** (every arrival
costs something, including one we failed to route), while containment divides by **engagedEnded**
(only finished conversations have an outcome). Using one denominator for both would break one of the
two metrics.

### 6.5 Acceptance criteria

**AC-S1 — Every arrival produces a session.** Created on receipt, before routing is attempted, so
unrouted traffic is measurable rather than absent.

**AC-S3 — Outcome extraction.** On session end, the handling agent's `postCall` vars are evaluated
against the transcript into `Session.outcome`. This reuses the existing agent schema; no parallel
outcome model is introduced. The three empty states are distinct and must not be collapsed:

- no agent handled the session → *"No agent handled this session, so no outcomes were extracted."*
- the agent declares no schema → *"[Agent] has no outcome schema configured. Add post-call variables
  on the agent to make its sessions measurable."*
- the session ended before extraction → *"Session did not reach a state where outcomes are
  extracted."*

Collapsing these into one blank panel loses the only actionable one — the middle case is a
configuration gap the operator can fix.

**AC-S4 — Session detail.** Shows routing (entry point, path taken, handler), CTWA attribution when
present, timing and cost, handoff reason when handed off, extracted outcomes, and the full
transcript with per-turn offsets.

**AC-S5 — A session is single-channel** for its whole life. This is what makes Session × Channel a
degenerate pivot (§7).

---

## 7. Analytics: sliced by arrival type, not entry point

**v1 §8.4 named "Session × Entry point" the primary pivot. The build rejects it.**

From `inbound.ts:671-683`:

> *Entry points are configuration: which number is bound to which graph. Two of them differ because
> someone provisioned two DIDs, not because the demand differs, so comparing entry points compares
> arbitrary setup choices and the comparison stops meaning anything the moment a number is
> repointed. Channel × trigger is intrinsic to the arrival itself and survives any amount of
> rewiring — and it is exactly the three inbound use cases the product exists to serve.*
>
> *Ad and service arrive on the same WhatsApp number, so the split cannot come from the entry point:
> only the Meta referral payload tells them apart.*

The second paragraph is decisive on its own. The two most different kinds of inbound demand — paid ad
clicks and unpaid service requests — **share an entry point**. Any axis built on entry points cannot
separate them, so the axis fails at the first question anyone asks.

`ArrivalType` is therefore derived, never stored (`inbound.ts:701-706`):

| Arrival type | Meaning |
|---|---|
| `wa_ad` | WhatsApp · CTWA ad — *"Carried a Meta ad referral — demand you paid for."* |
| `wa_service` | WhatsApp · Service — *"Same number, no referral — unpaid service demand."* |
| `voice_call` | Voice · Inbound call |

**AC-AN4 — Arrival type is the primary inbound axis.** *(Supersedes v1 §8.4's primary pivot.)*
Per-entry-point numbers remain, but where they are actionable — on the `/inbound` list, next to the
graph that produces them. Analytics is the cross-object comparison surface; comparing provisioning
decisions is not a comparison.

**AC-AN5 — There is no "all arrivals" aggregate.** From `InboundAnalytics.tsx:17-21`:

> *A paid ad click, a service message and a phone call have different costs, different latencies and
> different success bars; averaged together the number describes no real population and moves
> whenever the mix moves, which reads as a change in performance when nothing changed.*

The cross-type view is a comparison table that keeps the types apart. This is a genuine product
constraint, not a missing feature: the aggregate would be the most-read and least-meaningful number
on the page.

**AC-AN6 — Session × Channel is not offered.** A session is single-channel for life (AC-S5), and
channel is already one half of the arrival type, so the pivot is degenerate. It becomes a real axis
only if cross-channel escalation ships (§9).

### 7.1 Where inbound sits in Analytics

The v1 §7.3 restructure shipped. Analytics now has four tabs (`analytics.tsx:327-344`):

| Tab | What it compares |
|---|---|
| Campaign | outbound orchestration — Sankey over the authored DAG |
| **Inbound** | session lifecycle, sliced by arrival type |
| **Agent** | behaviour, voice and chat — the generalised former voice-channel view |
| Channel | transport and delivery health |

The Agent tab is where the two directions meet, and it is the only surface that shows both halves of
a bidirectional agent together — the reason `ep_voice_sales` is seeded onto the same agent that
places outbound reactivation calls.

Voice is now deliberately absent from the Channel tab (`analytics.tsx:159-163`):

> *A "voice channel asset" was only ever an agent — `buildChannelAssets("voice")` keys it by
> `agent.id` — so this tab was showing agent behaviour under a transport label. That view now lives
> on the Agent tab, where it can sit next to the same agent's inbound half. Channel is transport
> health only: what was sent and whether it arrived.*

The conflation predates inbound. What inbound changed is that it became untenable rather than merely
untidy: inbound WhatsApp is agent-executed, so WhatsApp would have had to be an address view and a
behaviour view simultaneously.

**AC-AN1 — One analytics surface.** Inbound analytics live in the Analytics route, not nested under
the Inbound object, because the comparison operators actually make is cost-per-resolution against
cost-per-conversion. Split across two surfaces that decision cannot be made.

**AC-AN2 — In-context drill-in is preserved.** Entry-point and session detail stay reachable from
`/inbound`, mirroring run detail hanging off a campaign. Object pages carry in-context metrics;
Analytics is the cross-object surface.

---

## 8. Drift register against v1

The eight material divergences. Rows marked **supersede** mean v1's text is wrong and this document
replaces it; **unbuilt** means v1 still stands as a requirement that has not shipped.

| # | v1 | As built | Disposition |
|---|---|---|---|
| 1 | §3.3 `rules: EntryRule[]`, `fallbackAgentId` | `graph: InboundGraph`, reusing the campaign DSL | **supersede** — a table cannot express sequence (`inbound-graph.ts:4-7`) |
| 2 | AC-E2 rules evaluate in order, first match wins | survives as conditional branch order inside a graph walk | **supersede** (wording only; behaviour preserved) |
| 3 | AC-S2 five terminal stages | six terminal + `active`; `no_response` split from `abandoned` | **supersede** — the identity in v1 §8 does not balance |
| 4 | §8.2 containment = `resolved ÷ engaged` | `resolved ÷ engagedEnded` | **supersede** — `engaged` includes `active`, which has no outcome |
| 5 | §8.4 Session × Entry point is the primary pivot | sliced by arrival type; entry-point numbers move to `/inbound` | **supersede** — ad and service share a number |
| 6 | AC-E4 only `live` agents bindable to a `live` entry point | paused/draft agents returned and shown ineligible | **amend** — hiding them reads as a picker bug |
| 7 | §5 AC-AG1 `origin: "inbound" \| "campaign"` on every session and call | **not built** — `Session` has no `origin` field | **unbuilt** — blocks the agent-by-direction facet |
| 8 | §8.1 unified `Interaction` fact table | **not built** — sessions are generated per entry point | **unbuilt** — see §9 |

Also new in the build and absent from v1 entirely:

- **`ArrivalType`** (§7) — the analysis axis.
- **`traitSpace` / `deadEdges` / trace** (§5.3) — static analysis that only became necessary once
  routing was a graph.
- **Session-cache invalidation on graph save** (AC-E9).
- **v1 open question 5 answered** — `unrouted` is an acceptable terminal state, deliberately, and
  forcing a fallback at creation was rejected.

---

## 9. Not built

Carried forward from v1 unless noted.

| Item | Status |
|---|---|
| §8.1 unified `Interaction` fact table | not built. Sessions and campaign leads remain separate; the contact timeline that would make CTWA legible end-to-end is not possible without it. |
| AC-AG1 agent origin split (`inbound` \| `campaign`) | not built. The Agent tab shows a bidirectional agent, but sessions carry no `origin`, so the facet cannot be computed. |
| §6.2 session → outbound re-engagement | not built. Intended to reuse the existing run push-trigger endpoint rather than a second enrolment path. |
| §6.3 outbound → session handoff | not built. The WhatsApp node's `reply_received` output branches but cannot hand off to an agent. |
| §9.2 caps by direction | not built. Inbound must never be blocked by a send cap; in-window replies metered separately; out-of-window templated sends counted. Correctness issue, not reporting. |
| §10.1 cross-channel escalation | out of scope. A session is single-channel for life; this is what keeps Session × Channel degenerate. |
| §10.2 the conversation on the canvas | out of scope, permanently. Multi-turn dialogue is not a DAG. The canvas does pre-routing; the agent owns the turns. |
| §10.3 human agent desk | out of scope. Handoff records *that* and *why*, not to whom. No inbox, queue, or human SLA. |
| §10.4 inbound templates | not built. There is no reusable entry-point library analogous to Campaign Templates — see the open question below. |
| Business-hours enforcement | partial. `hours` is authored and drives `trigger.within_hours` branching, but is not enforced independently of the graph. |
| Persistence | in-memory. Entry points live in a module store; sessions are generated from the entry-point id and reseed on hard reload. |

---

## 10. Open questions

1. **Agent origin (drift 7).** Is `origin: inbound | campaign` worth building? The seeded
   `ep_voice_sales` sharing an agent with outbound reactivation is the argument for it. If agents in
   practice only ever serve one direction, the facet is dead weight — but the shared-agent case is
   exactly the one an operator cannot currently answer.
2. **Inbound templates (§9).** Campaigns have a template catalogue; inbound has none. Are entry-point
   graphs similar enough across tenants to be worth a library, or is `channel + address` binding so
   tenant-specific that a template would be scrubbed down to nothing?
3. **Unrouted target.** `unrouted` is an accepted terminal state and is surfaced as a KPI, but no
   target is set. Is a non-zero unrouted rate ever acceptable, or should a `live` entry point with
   any unrouted traffic in the last 24h raise an alert?
4. **CTWA attribution window.** How long after an ad click does a session still attribute to that
   ad, and what happens on a second session from the same contact? Unanswered since v1 and now
   load-bearing, because `wa_ad` versus `wa_service` is the primary analytics split (§7).
5. **Graph versioning (AC-E9).** Campaigns version on edit. Entry points do not, so a rewiring
   restates derived history. Do entry points need versions, or is "aggregates are attributed to the
   graph version that produced them" enough?
6. **`no_response` attribution (§6.2).** The stage is split out so opener problems are separable from
   mid-conversation ones. Should it be attributed to the agent's opener specifically, which would
   require the opener to be a versioned field on the agent?
