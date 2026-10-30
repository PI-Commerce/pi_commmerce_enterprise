# PRD — Inbound Sessions & Analytics Re-cut (v1)

**Product:** Pi Commerce Enterprise
**Feature area:** Inbound (Entry Points + Sessions) and the Analytics restructure it forces
**Status:** Proposal — not built. Written against the current in-memory prototype.
**Last updated:** 13 Aug 2026

---

## 1. Overview

Pi Commerce is today a **pure outbound** platform. Every journey starts from a locked `start` node followed by an `audience` node (`campaign-types.ts:8-24`), executes as a finite DAG against a known population, and terminates. There is no concept of a customer initiating contact.

This PRD introduces **inbound** as a first-class construct covering three use cases:

1. **WhatsApp from CTWA ads** — a Click-to-WhatsApp ad drives a message carrying an ad referral payload
2. **WhatsApp inbound service** — a customer messages the business number for support
3. **Inbound call** — a customer dials the business number

It also specifies the **Analytics restructure** these force, which corrects an inconsistency that already exists today (§7).

### 1.1 Core model: inbound is a sibling of Campaigns, not a campaign type

The dividing line is not channel. It is **who initiates** and **what the unit of work is**.

| | Campaign | Inbound |
|---|---|---|
| Initiator | The business | The customer |
| Unit of work | **Run** over an Audience (a set, N people) | **Session** (one person, N turns) |
| Shape | Finite authored DAG, terminates | Open-ended, ends by resolution / handoff / timeout |
| Volume | Known in advance | Unpredictable |
| Denominator | Audience size | None |
| Operator mental model | A project you **launch** | Infrastructure you **keep on** |

The last row is decisive: a campaign is a project, an entry point is infrastructure. Different lifecycle → different object.

**Why not model inbound as a campaign type.** Doing so would require unlocking the mandatory `start`→`audience` skeleton, giving `RunRow` (`analytics-data.ts:56-76`) a null `audience`/`totalLeads`/`successRate`, and exempting inbound from the channel caps in `merchants.ts:52-69`. Every field of the campaign object would need a null branch. Nothing meaningful would remain shared.

**Why not a fully separate silo.** CTWA is a genuine full loop — ad spend (campaign-like) → inbound session → outbound nurture if the customer goes cold. The bridges in §6 keep the loop closed.

### 1.2 Key definitions

| Term | Meaning |
|---|---|
| **Entry point** | A binding of `channel + address + match condition → handler agent`. The inbound counterpart to a campaign. Always-on infrastructure. |
| **Session** | One customer's continuous interaction through an entry point. The inbound counterpart to a Run — but grain is **one person**, not a population. |
| **Turn** | A single message or utterance within a session, by either party. |
| **Containment** | A session resolved by the agent with no human handoff. The primary inbound KPI; the analogue of conversion rate. |
| **Handoff** | A session escalated from the agent to a human. |
| **Interaction** | The unified analytics fact row (§8.1) covering both campaign leads and inbound sessions. |
| **Referral payload** | Meta-supplied ad context on a CTWA-originated WhatsApp message; carries the source ad/ad-set id. |

---

## 2. Personas

- **Campaign operator (tenant user):** already builds outbound campaigns. Now also needs to see what inbound traffic is doing and whether agents are containing it.
- **Support / CX operations:** owns inbound. Cares about volume, containment, handoff rate, and time-to-first-response. Does not build campaigns.
- **Growth / performance marketer:** runs CTWA ads. Needs the ad → session → outcome funnel stitched end to end.
- **Super-admin:** as today, plus binds numbers to entry points.

---

## 3. Feature: Entry points

### 3.1 User story
> As a CX operator, I want to declare what happens when a customer contacts us on a given number, so inbound traffic is answered by the right agent without anyone launching anything.

### 3.2 The three use cases are one construct

All three differ only in **match condition** and **handler**. They must not be built as three features.

| Use case | Channel | Address | Match condition | Handler |
|---|---|---|---|---|
| CTWA ads | WhatsApp | WA number | referral payload **present** | sales/qualification agent |
| WhatsApp service | WhatsApp | WA number | referral **absent** | support agent |
| Inbound call | Voice | phone number | within business hours | voice agent |
| *(fallback)* | Voice | phone number | out of hours | voicemail / callback capture |

### 3.3 Data model

```ts
type EntryPoint = {
  id: string;
  name: string;
  channel: "whatsapp" | "voice";
  address: string;              // WA number or DID; the bound channel resource
  status: "live" | "paused" | "draft";
  rules: EntryRule[];           // ordered; first match wins
  fallbackAgentId?: string;     // when no rule matches
  hours?: BusinessHours;        // optional; voice especially
};

type EntryRule = {
  id: string;
  label: string;
  match: MatchCondition;        // referral present/absent, keyword, hours, caller segment
  agentId: string;              // resolves via resolveAgent() in agent-data.ts
};
```

### 3.4 Acceptance criteria

**AC-E1 — Binding**
- An entry point binds exactly one `(channel, address)` pair.
- An address may host multiple rules but belongs to exactly one entry point. Attempting to bind an already-bound address is rejected with the conflicting entry point named.

**AC-E2 — Rule resolution**
- Rules evaluate **in order; first match wins**.
- IF no rule matches AND `fallbackAgentId` is set, the fallback agent handles the session.
- IF no rule matches AND no fallback is set, the session is created with outcome `unrouted` and surfaced in analytics. It is never silently dropped.

**AC-E3 — CTWA discrimination**
- A WhatsApp entry point can match on **referral payload present/absent**, which is what separates use case 1 from use case 2 on the *same number*.
- WHEN the referral is present, the source ad identifier is persisted on the session for attribution (§6.1).

**AC-E4 — Handler must be compatible**
- Only agents whose `AgentRecord.type` matches the entry point's channel are selectable (`voice` for voice, `chat` for WhatsApp).
- Only agents with `status: "live"` can be bound to a `live` entry point.

**AC-E5 — Always-on lifecycle**
- Entry points have no start/end date and no audience. They are `live` or `paused`.
- Pausing an entry point stops new sessions; in-flight sessions run to completion.

**AC-E6 — Caps do not gate inbound**
- Channel caps in `merchants.ts` **must not** block an inbound session from being answered. See §9.2.

---

## 4. Feature: Sessions

### 4.1 User story
> As a CX operator, I want every inbound conversation recorded with a consistent lifecycle and outcome, so I can measure containment and find where we lose people.

### 4.2 The fixed lifecycle

This is the single most important design property of inbound analytics. **Unlike a campaign funnel, which is authored and therefore differs per campaign, the session funnel is fixed and identical for every session.**

```
Received ──► Routed ──► Engaged ──┬──► Resolved   (contained)
                                  ├──► Handed off (human)
                                  ├──► Abandoned  (customer dropped)
                                  └──► Expired    (timeout)
```

| Stage | Definition | Failure mode into it |
|---|---|---|
| **Received** | Event arrived at an entry point | — |
| **Routed** | A rule matched and an agent was assigned | `unrouted` (no rule, no fallback), out-of-hours |
| **Engaged** | Customer took ≥1 turn after the agent's opener | customer never replied to opener |
| **Resolved** | Agent completed without human involvement | — |
| **Handed off** | Escalated to a human | — |
| **Abandoned** | Customer stopped mid-conversation | — |
| **Expired** | Session timed out (WhatsApp 24h window, or voice silence) | — |

Because the funnel is fixed, **every entry point, agent, and channel is directly comparable on the same axes** — which is not true of campaigns, where two campaigns have different graphs and cannot be compared node-for-node.

### 4.3 Data model

```ts
type Session = {
  id: string;
  entryPointId: string;
  agentId?: string;             // unset if unrouted
  channel: "whatsapp" | "voice";
  contact: { name?: string; phone: string; email?: string };

  stage: SessionStage;          // received | routed | engaged | resolved
                                // | handed_off | abandoned | expired | unrouted
  startedAt: string;
  endedAt?: string;
  firstResponseMs?: number;     // time to agent's first substantive response
  durationMs?: number;
  turnCount: number;

  outcome: Record<string, string>;  // from the agent's postCall vars — see §4.4
  handoffReason?: string;
  cost: number;

  referral?: { adId: string; adSetId?: string; campaignRef?: string };  // CTWA
};
```

### 4.4 Session outcomes reuse `postCall` — no new concept

Agents already declare `PostCallVar[]` (`agent-data.ts:19-35`, examples at `:49-124`) — `resolution_status`, `csat_estimate`, `call_sentiment`, `final_lead_status`. These are LLM-evaluated after a conversation and are **exactly** what session outcome variables need to be.

**Requirement:** `postCall` is renamed to **session outcomes** in the UI and applies identically to inbound sessions and outbound campaign calls. No parallel schema is introduced.

### 4.5 Acceptance criteria

**AC-S1 — Every inbound event produces a session**
- A session row is created on `Received`, before routing is attempted, so unrouted traffic is measurable.

**AC-S2 — Terminal stages are exhaustive and exclusive**
- Every ended session lands in exactly one of: `resolved`, `handed_off`, `abandoned`, `expired`, `unrouted`.
- `resolved + handed_off + abandoned + expired + unrouted` = total ended sessions, always. This identity backs every rate in §8.

**AC-S3 — Outcome extraction**
- On session end, the handling agent's `postCall` vars are evaluated against the transcript and written to `Session.outcome`.
- IF the agent declares no `postCall` vars, `outcome` is empty and outcome-based widgets show an explicit "agent has no outcome schema" state rather than an empty chart.

**AC-S4 — Session detail**
- A session detail view shows: full transcript (or call recording + transcript), lifecycle stage timeline, resolved outcome vars, handoff reason, cost, and — if CTWA — the source ad.

**AC-S5 — Channel scope**
- v1: **a session is single-channel.** See §10.1 — cross-channel escalation is out of scope and is called out as the constraint it is.

---

## 5. Agents as the shared runtime

Agents already exist as independent objects (`agent-data.ts:19-35`) referenced by campaign `voiceCall` nodes. Inbound does **not** introduce a new handler type — it makes agents bidirectional.

Additions required on `AgentRecord` for inbound:

| Field | Why |
|---|---|
| `opener` | Inbound needs an explicit "who speaks first and what do they say" |
| `handoffPolicy` | When to escalate, and to which queue/destination |
| `hours` | Optional per-agent availability (may be inherited from entry point) |

Unchanged and reused as-is: `masterPrompt`, `tools`, `knowledgeBase`, `modelConfigId`, `postCall`.

**AC-AG1 — One agent, two origins**
- The same agent may serve inbound sessions *and* be invoked by an outbound campaign node.
- Every session/call records `origin: "inbound" | "campaign"` so agent performance can be split by direction (§8.4).

---

## 6. Bridges to Campaigns

Inbound must not be a silo. Three explicit joins:

### 6.1 Ads → inbound (attribution)
The `adsCampaign` node kind already exists (`campaign-types.ts:8-24`). A CTWA entry point matches on the referral payload and persists `Session.referral.adId`, which attributes the session back to the ad that produced it. This is what makes the CTWA funnel in §8.3 possible.

### 6.2 Session → outbound (re-engagement)
On session end, outcome vars may enrol the contact into an outbound campaign run — e.g. `final_lead_status = "follow-up"` → enrol into a nurture campaign.

The mechanism already exists: `POST /v1/runs/trigger/{runId}` (`connections.ts`) is the push-trigger endpoint used by CLM tools. **Reuse it internally** rather than building a second enrolment path.

### 6.3 Outbound → session (handoff)
The WhatsApp node's `reply_received` output (`wa-outputs.ts:48-62`) currently only branches. It should additionally be able to **hand off to an agent**, converting an outbound touch into a session.

**AC-BR1** — A session created this way records `origin: "campaign"` plus the originating `runId`/`nodeId`, so the campaign funnel and the session funnel stitch rather than double-count.

---

## 7. Why Analytics has to be re-cut

### 7.1 The existing problem (predates inbound)

The Analytics **Channel** tab lets you pick a channel, then an "asset". `analytics-data.ts:518-522` defines an asset as *"a reusable channel resource (Voice Agent, WhatsApp Number, Sender ID, Ad Campaign)."* Those are **four different kinds of object**:

| Channel | Asset picked | What it actually is |
|---|---|---|
| Voice | Voice Agent | a **behaviour** |
| WhatsApp | Number | an **address** |
| SMS | Sender ID | an **address** |
| Ads | Ad campaign | a **spend unit** |

"Channel" is therefore three analytical axes wearing one label. The code already concedes this — `VoiceChannelView.tsx:48-52`:

> *intent labels "are defined by the selected Voice Agent's post-call analysis schema and therefore vary per agent (which is why intent widgets gate to a single agent in scope)."*

The voice channel view is **forced to gate to a single agent** because its metrics are meaningless otherwise. It is already agent analytics under a channel label.

### 7.2 Why inbound makes it untenable

Today the split is stable by accident: voice is agent-executed, WhatsApp is template-executed. Inbound breaks that — **inbound WhatsApp is agent-executed**. WhatsApp would have to be simultaneously an address view and a behaviour view.

### 7.3 The correction

Split the three conflated objects:

- **Behaviour → Agent.** Voice *and* chat. Channel becomes an attribute (`AgentRecord.type` already carries it), not a parent. **This is not a new tab — it is `VoiceChannelView` renamed and generalised.**
- **Address → Entry point** (inbound) / sender identity (outbound). The existing "WhatsApp Number" asset is the inbound entry point object, half-built.
- **Spend → Ads**, which stitches CTWA to sessions.

---

## 8. Analytics specification

### 8.1 Unified fact table

Do **not** build a parallel inbound schema. `Lead` (`analytics-leads.ts:11-37`) and `Session` share more than they differ.

```
Interaction  (grain: one contact touch)
  common:    id, contact, channel, direction, origin, startedAt,
             durationMs, cost, outcome, agentId?, merchantId
  campaign:  runId, campaignId, nodeId, stageLabel, leadStatus
  inbound:   entryPointId, sessionId, turnCount, stage, handoffReason, referral
```

Why one table:
- **Cost and cap reporting** works across both without a union — required, because `merchants.ts` caps span directions
- **Channel totals are correct** — see §9.1
- **Contact timeline** becomes possible: ad click → session → later outbound nudge as one ordered list for one person. This is what makes CTWA legible, and it is impossible with two schemas.

### 8.2 Metric spine — channel-agnostic

All rates derive from the AC-S2 identity.

| Metric | Definition |
|---|---|
| **Sessions received** | Count of sessions created |
| **Routing rate** | `routed ÷ received` — catches rule gaps and out-of-hours volume |
| **Engagement rate** | `engaged ÷ routed` — did the customer respond to the opener |
| **Containment rate** | `resolved ÷ engaged` — **the primary inbound KPI** |
| **Handoff rate** | `handed_off ÷ engaged` |
| **Abandon rate** | `abandoned ÷ engaged` |
| **Time to first response** | median `firstResponseMs` |
| **Average handle time (AHT)** | median `durationMs` of ended sessions |
| **Turns per session** | median `turnCount` |
| **Cost per session** | `Σ cost ÷ sessions` |
| **Cost per resolution** | `Σ cost ÷ resolved` — the number that compares against outbound cost-per-conversion |

### 8.3 Channel-specific sub-metrics

These hang **off the same spine** — channel changes the sub-metrics, never the stages. This mirrors the existing `NODE_METRICS` pattern (`analytics-data.ts:336-363`), where per-channel metric sets attach to a shared node funnel.

| Channel / use case | Additional metrics |
|---|---|
| **WhatsApp service** | Time-to-first-response, 24h window expiry rate, template-vs-freeform message ratio |
| **WhatsApp CTWA** | Adds the stitched ad funnel: `impressions → clicks → sessions started → engaged → resolved → converted`, plus cost-per-session-started and cost-per-resolution against ad spend |
| **Voice** | Connect rate, ring time, queue wait, abandon-in-queue, talk time |

### 8.4 Pivots that carry information

| Pivot | Question it answers | Verdict |
|---|---|---|
| **Session × Entry point** | Is this number/route healthy? | **Primary** |
| **Session × Agent** | Is this behaviour working? | **Primary** |
| **Agent × origin** (inbound vs campaign-invoked) | Does this agent resolve better inbound or on handoff? | **Valuable** — impossible to ask today |
| **Session × Channel** | — | **Largely degenerate.** An entry point *is* a channel + address, and (per AC-S5) a session is single-channel. This collapses into Session × Entry point grouped by channel. It is a grouping, not a dimension. |

> **Note.** Session × Channel becomes a genuine axis only if cross-channel escalation ships (§10.1), because that is the point at which a session stops being single-channel. This is the main reason §10.1 is a v1 constraint worth revisiting.

### 8.5 Tab structure

```
Analytics
├─ Campaign   [exists]     outbound orchestration funnel (Sankey over the authored DAG)
├─ Inbound    [new]        session lifecycle funnel; pivot by entry point
└─ Agent      [rename]     = VoiceChannelView, generalised to chat agents;
                           faceted by origin (inbound | campaign)
```

**AC-AN1 — One analytics surface**
- Inbound analytics live in the existing Analytics route, **not** nested under the Inbound object.
- Rationale: operators compare **cost per resolution** (inbound) against **cost per conversion** (outbound). That is a budget decision. Split across two surfaces, it cannot be made.

**AC-AN2 — In-context drill-in is preserved**
- Entry-point and session detail remain reachable from the Inbound object pages, mirroring how run detail hangs off a campaign.
- Principle: **object pages carry in-context metrics; Analytics is the cross-object comparison surface.**

**AC-AN3 — Agent tab is a rename, not an addition**
- The voice channel view is moved to the Agent tab and generalised. It is **not** duplicated. After this change, selecting "Voice" under an asset picker no longer surfaces agent metrics.

### 8.6 Where "Delivery" goes — open decision

What remains of "Channel" after §7.3 is genuinely different: **delivery health** — per-number volume, delivery/connect rates, provider failures, cap consumption against `merchants.ts`. This is ops plumbing, not behaviour or content performance.

| Option | Case for |
|---|---|
| **A. Move to channel object pages** (`/channels/whatsapp`) — *recommended* | Number health is in-context there; consistent with AC-AN2; leaves Analytics as exactly three comparable objects |
| **B. Keep a thin Delivery tab** in Analytics | If operators watch cap burn daily, it wants to be where they already are |

Unresolved — see §11.

---

## 9. What breaks in the current build

### 9.1 `CHANNEL_CAMPAIGN_BREAKDOWN` becomes wrong
`analytics-data.ts:387-412` assumes **every message belongs to a campaign**. Inbound messages do not. The moment inbound ships, the Channel tab silently under-reports WhatsApp volume and shows a misleading channel health picture.

**Required:** re-base on the `Interaction` fact (§8.1), with campaign as *one* dimension rather than the only one.

### 9.2 Caps math in `merchants.ts`
`ChannelCap.used` (`merchants.ts:52-69`) is a cumulative counter fed by outbound sends.

**Required behaviour:**
- Inbound sessions **must never** be blocked by a cap — refusing to answer a customer because a send cap was hit is not acceptable.
- Replies sent **inside** the WhatsApp 24h window are session-continuation and should be metered separately from campaign sends.
- Business-initiated messages sent **outside** the window are templated sends and *should* count against the cap.

This requires splitting `used` by direction. It is a correctness issue, not a reporting nicety.

### 9.3 Agent metrics do not exist at all
`agents.index.tsx:106-138` lists name / type / status only. Every agent already computes `postCall` vars per call, used **only for branching** (`wa-outputs.ts:114-129`) and never aggregated.

**Consequence:** agent analytics is already justified by **outbound alone** — today you cannot answer "which voice agent resolves better." Building the Agent tab pays for itself before inbound ships, and inbound then inherits it. See §11.2.

### 9.4 Dashboard KPIs are outbound-shaped
`index.tsx:34-62` defines four cards, all outbound ("Leads processed", "WhatsApp messages sent", "Voice AI conversation minutes"). Inbound volume and containment need representation, or the Dashboard will imply inbound traffic does not exist.

---

## 10. Not in v1 (explicit call-outs)

### 10.1 Sessions are single-channel
No cross-channel escalation (WhatsApp chat → voice callback) in v1. A session has exactly one channel for its lifetime.

**Consequence to communicate:** this is what makes Session × Channel a degenerate pivot (§8.4). Supporting escalation later changes the session's primary key and reopens that axis.

### 10.2 The conversation is not on the canvas
Multi-turn agent dialogue is **not** a DAG and will not be authored on the workflow canvas. The canvas is used for pre-routing and post-session automation only; the agent owns the turns.

### 10.3 No human agent desk
Handoff records *that* a session was escalated and why. v1 does **not** ship an agent inbox, queue management, routing to named humans, or human-side SLAs.

### 10.4 No inbound templates
There is no library of reusable entry points analogous to Campaign Templates.

### 10.5 Persistence
As with the rest of the prototype, all state is in-memory and reseeds on hard reload.

---

## 11. Open questions

1. **Delivery placement** — §8.6 option A (channel object pages) or B (thin Analytics tab)?
2. **Sequencing** — ship the Agent tab first as an **outbound-only** feature (it is already earned per §9.3), then add inbound? This de-risks the analytics re-cut by landing it before the new object model.
3. **Agent origin split** — does `origin: inbound | campaign` (§5, §8.4) reflect real usage, or will agents in practice only ever serve one direction? If the latter, the facet is dead weight.
4. **Caps by direction** (§9.2) — confirm the three-way rule: inbound never blocked / in-window replies metered separately / out-of-window templated sends counted.
5. **Unrouted traffic** — is `unrouted` an acceptable terminal state for v1, or must every entry point be forced to declare a fallback agent at creation time?
6. **CTWA attribution window** — how long after an ad click does a session still attribute to that ad, and what happens on a second session from the same contact?
