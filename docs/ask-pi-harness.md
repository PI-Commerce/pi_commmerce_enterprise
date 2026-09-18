# Ask Pi Harness

The harness is what makes Pi feel like an expert on this platform instead of a generic chatbot. It's assembled fresh on every turn and injected into the LLM's context, so Pi never has to guess about state or grammar.

The harness has **four layers**. Each lives in a specific file. Editing that file is how you evolve Pi's behaviour.

| Layer | Where | What it carries |
|---|---|---|
| 1. System prompt | `src/lib/server-fns/pi-llm.ts` → `SYSTEM_BUILDER` | Pi's role, turn behaviour, tone, format rules |
| 2. Canonical construct rules | `src/lib/pi-construct-rules.ts` → `CANONICAL_CONSTRUCT_RULES` | Platform grammar: blank canvas, single End, LTR, bezier, WA Freeform placement, etc. |
| 3. Injected context | `src/lib/server-fns/builder-context.ts` → `assembleBuilderContext()` | Live state per turn: current DSL, node registry, real asset catalog |
| 4. Tool definitions | `src/lib/server-fns/pi-llm.ts` → `TOOL_DEFS.builder` | The exact tool surface Pi can call |

Everything else (chat UI, validator, canvas skeleton) is downstream of these four.

---

## Layer 1 — System prompt (`SYSTEM_BUILDER`)

Where: `src/lib/server-fns/pi-llm.ts`, the exported const `SYSTEM_BUILDER`.

Owns:
- Pi's identity (Paytm Intelligence).
- Tone rules — first person in chat replies, third person reserved for the UI's loading-state chrome.
- Turn behaviour — three modes (clarify, propose_draft, build).
- One-question-per-turn rule.
- Off-topic decline pattern.
- Asset-picking rules — always cite catalog by name, never say "if you don't have these assets".
- Node id conventions.
- `pi-choice` schema (the rich options block).
- Allowed Markdown surface (bold, italic, inline code, lists, links; no headers / fences / tables).

Edit this file when you want Pi to change how it **talks**, when it **pauses to confirm**, when it **declines**, or what formatting it emits.

---

## Layer 2 — Canonical construct rules (`CANONICAL_CONSTRUCT_RULES`)

Where: `src/lib/pi-construct-rules.ts`, exported as a single markdown-formatted string.

Owns:
- Blank canvas invariants (Start, Audience, End pre-exist, undeletable; Start-Audience wired).
- Single End convergence.
- Left-to-right layout direction.
- Bezier edges only (`routed` type in ReactFlow).
- Node kinds Pi is allowed to use (see Layer 3 registry).
- Kinds Pi is NOT allowed to use (`aiTransform`, `abSplit`).
- Branching semantics — Conditional branches, WhatsApp engagement branches, Voice dispositions.
- Fallback pattern — no magic edge type; it's just an edge off a WA Template's timeout/failure branch.
- **WhatsApp Freeform hard placement rule** — only after an engaged branch of a WA Template.
- Audience-schema-drives-downstream-variables convention.
- What Pi CAN change on this surface (node configs) vs. CANNOT (asset internals).
- Third-person tone reference (kept in sync with Layer 1).

Edit this file when you want to change the **platform's grammar** — a new node kind, a new placement rule, a different convergence pattern. Anytime a real product decision changes the shape of a campaign, this file is the source of truth Pi reads.

---

## Layer 3 — Injected context (`assembleBuilderContext`)

Where: `src/lib/server-fns/builder-context.ts`.

Assembled fresh on every builder-scope `askPi` call. Injected into the system prompt as a `## Current context` block so Pi re-reads it every turn.

Contains:
- `surface`: `"campaigns.builder"` (always).
- `campaign`: `{ id, name, status, description }` for the campaign being edited.
- `dsl`: current graph (`nodes[]`, `edges[]`) as they exist in D1 right now — Pi cites what's there when asking.
- `rules`: the full `CANONICAL_CONSTRUCT_RULES` string, so Layer 2 rides in as part of every turn.
- `nodeKinds`: compact one-line-per-kind summary of the registry (`purpose`, `requires`, `emits`, `placement`), filtered to kinds Pi is allowed to insert.
- `assets`: real workspace catalogs — `voiceAgents[]`, `waTemplates[]`, `smsTemplates[]`, `rcsTemplates[]`, `tools[]`. Each pared to `{ id, name, hint }` so the prompt stays cheap (~1 KB even with 30 assets).
- `_diag`: internal diagnostic (has D1 binding, per-list error strings) so we can debug empty-catalog reports from Cloudflare logs.

Node registry source of truth: `src/lib/node-registry.ts`. Each entry carries `kind`, `label`, `purpose`, `requires` (config keys that must be set for validity), `emits` (branch labels), `placementRules`, `undeletable`, `layoutRole`, `allowedForBuilder`. Editing this file is how you add/deprecate a node kind or change what a node needs.

Asset catalogs are fetched from D1 via the same `list*` functions the store-hydration path uses — no divergent code paths. If a fetch throws, `_diag` records the error and the slice ships as `[]` (Pi sees an empty catalog and knows to route to the creation surface).

Edit this file when you want to give Pi **more/less to see** on each turn — e.g. add per-node validity to the injected context (Phase E), or add a "recent runs" slice for cross-referencing.

---

## Layer 4 — Tool definitions (`TOOL_DEFS.builder`)

Where: `src/lib/server-fns/pi-llm.ts`, the `TOOL_DEFS` object.

Builder-scope tools:
- `list_campaigns` — read workspace campaigns.
- `read_campaign` — read full DSL for one campaign (rarely needed since `dsl` is already injected).
- `propose_draft` — mandatory before `insert_node`. Emits a structured plan; client renders it as a Confirm-Draft card in chat.
- `insert_node` — add a node. Kind must be from the allowed list. Position hints LTR.
- `connect_nodes` — wire two nodes with a bezier edge. `sourceHandle` names the output port.
- `update_node` — patch title / subtitle / config on any existing node (including undeletable ones like Audience). This is how Pi edits the Audience schema.

Plus the analytics read tools (`count_leads`, `status_breakdown`, `worst_dropoffs`, `latest_runs`) which are inherited so Pi can cross-reference performance if needed.

Client-side safety layer: `src/lib/pi-construct-validator.ts` runs every tool-call batch through construct checks before touching the canvas. Rejects things like inserting reserved ids, unknown kinds, self-loops. Auto-heals things like top-down positions.

Edit this file when you want to give Pi a **new capability** on this surface (e.g. `delete_node`, `disconnect_nodes`, `set_wa_template`) or restrict an existing one.

---

## How a turn flows

1. User types a message.
2. `askPi()` server-fn runs. `assembleBuilderContext(campaignId)` fetches fresh state.
3. System prompt = `SYSTEM_BUILDER` + `\n\n## Current context\n` + JSON of the assembled context.
4. Anthropic call to `claude-sonnet-4-5` with the system prompt, tool defs, history, and the user turn.
5. Pi decides: emit a clarifying question, emit a `propose_draft`, or emit real mutation tool calls.
6. Server executes tool calls (mutations hit D1; reads hit D1; `propose_draft` is a no-op signal to the client).
7. Response goes back with `answer` + `toolCalls` + `_diag`.
8. Client renders the answer. If `propose_draft` was in the batch, renders the Confirm-Draft card. If mutation calls were in the batch, applies them to the canvas via `applyPiToolCallsToGraph` (validator + skeleton strip + ELK relayout).

---

## Testing / iterating

- **Change a prompt rule.** Edit Layer 1 or Layer 2, restart `bun run dev`, retry.
- **Add a node kind.** Add an entry to `src/lib/node-registry.ts`, update `NodeKind` in `src/lib/campaign-types.ts`, restart.
- **Watch what Pi actually sees.** Every response includes `_diag` in the client console (`[AskPi] builder context diag: {...}`). Server-side, `console.log("[builder-context]", ...)` shows counts + errors from Cloudflare logs (`wrangler tail --name picom-enterprise-vision`).
- **Test with real D1.** `bun run db:reset:local` seeds a full workspace so Pi has agents / templates to pick from.

---

## Ownership map — quick reference

Want to change... | Edit...
---|---
How Pi introduces itself / tone | Layer 1 (SYSTEM_BUILDER)
Number of clarifying questions per turn | Layer 1
Third-person vs first-person | Layer 1
"One pi-choice per turn" rule | Layer 1
Off-topic decline copy | Layer 1
`pi-choice` schema shape | Layer 1 (prompt) + `AiComposer.tsx` (parser)
Blank canvas invariants | Layer 2 (CANONICAL_CONSTRUCT_RULES)
Single End / LTR / bezier rules | Layer 2
WhatsApp Freeform placement rule | Layer 2 + `pi-construct-validator.ts`
Add / change / deprecate a node kind | `src/lib/node-registry.ts` + `src/lib/campaign-types.ts`
What Pi sees each turn (catalogs, validity, DSL) | Layer 3 (`builder-context.ts`)
Give Pi a new tool | Layer 4 (`TOOL_DEFS.builder`) + `runToolInner` dispatcher
Reject / heal a specific violation | `src/lib/pi-construct-validator.ts`
