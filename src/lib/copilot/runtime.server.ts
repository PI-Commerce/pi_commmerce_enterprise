/**
 * Server-only CopilotKit runtime — the bridge between the Ask Pi chat panel and
 * Claude, routed through TrueFoundry's OpenAI-compatible LLM gateway.
 *
 * This module is intentionally imported *lazily* (only when a request hits
 * {@link COPILOT_ENDPOINT}) so the CopilotKit runtime + openai SDK graph never
 * loads on the normal SSR page-render path.
 *
 * Backend selection (CopilotKit 1.61 is AG-UI–agent based, so the runtime must
 * expose a `default` agent for the React client's `useAgent({agentId:"default"})`):
 *  - If a live-agent key is present (Cloudflare `env.PI_AGENT_API_KEY` on the
 *    deployed worker, `process.env.PI_AGENT_API_KEY` in node dev) we hand the
 *    runtime a {@link TfyOpenAIAdapter}; the runtime auto-builds a `default`
 *    BuiltInAgent from the adapter's language model.
 *  - Otherwise we register a deterministic {@link OfflinePiAgent} as the `default`
 *    agent (paired with {@link EmptyAdapter}) so the chat round-trip is fully
 *    exercisable without any secret.
 */
import "reflect-metadata";

import OpenAI from "openai";
import { createOpenAI } from "@ai-sdk/openai";
import {
  OpenAIAdapter,
  CopilotRuntime,
  EmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
  type CopilotServiceAdapter,
} from "@copilotkit/runtime";
import { AbstractAgent } from "@ag-ui/client";
import { EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/core";
import { Observable } from "rxjs";

import { COPILOT_ENDPOINT, PI_PROMPT_MARKER, PI_PROMPT_END } from "./endpoint";

/**
 * Default TrueFoundry-mediated model endpoint for the live agent. Overridable
 * via env vars (see {@link buildRuntime}). TFY exposes an OpenAI-compatible
 * surface at /openai/v1/* that transparently routes to Bedrock — so from our
 * side it's a plain OpenAI client with a custom baseURL, and the model string
 * is a TFY routing key (owner-prefixed provider path).
 */
const DEFAULT_BASE_URL = "https://llm.tfy.pi.mypaytm.com/openai/v1";
const DEFAULT_MODEL = "pi-agentic/global.anthropic.claude-haiku-4-5-20251001-v1-0";

/**
 * OpenAIAdapter subclass that pins the LanguageModel to OpenAI's classic
 * `/chat/completions` endpoint.
 *
 * Why: CopilotKit 1.61's AG-UI runtime builds a BuiltInAgent from
 * `serviceAdapter.getLanguageModel()`. The stock {@link OpenAIAdapter}
 * implementation returns `createOpenAI({...})(model)`, which resolves to the
 * newer OpenAI **Responses API** (`/responses`) — a surface TFY's gateway
 * doesn't proxy, so every run 404s ("Not Found"). Overriding to
 * `.chat(model)` swaps that for the classic Chat Completions surface
 * (`/chat/completions`), which TFY DOES expose and which we've probed as
 * fully working (streaming SSE + tool use both round-trip cleanly).
 *
 * The classic API is also what @copilotkit/runtime's own `process()` path
 * uses (`openai.chat.completions.create()` via the openai SDK), so agent runs
 * and non-agent completions now hit the same endpoint via the same protocol.
 */
class TfyOpenAIAdapter extends OpenAIAdapter {
  private readonly _client: OpenAI;
  private readonly _model: string;
  constructor(params: { openai: OpenAI; model: string; keepSystemRole?: boolean }) {
    super(params);
    this._client = params.openai;
    this._model = params.model;
  }
  override getLanguageModel() {
    return createOpenAI({
      baseURL: this._client.baseURL,
      // openai's `apiKey` is `string | null`; @ai-sdk/openai expects `string | undefined`.
      apiKey: this._client.apiKey ?? undefined,
    }).chat(this._model);
  }
}

/**
 * The agent's system prompt. CopilotKit 1.61's AG-UI transport does NOT forward
 * the React `<CopilotChat instructions>` prop to the model (the `agent/run`
 * payload carries only the user/assistant turns), so the only reliable place to
 * steer the model is here — injected server-side as the leading `system` message
 * on each run (see {@link withSystemPrompt}).
 */
const PI_SYSTEM_PROMPT = [
  "You are Pi, the campaign-creation copilot for a marketing platform.",
  "STYLE — be concise AND conversational: reply in at most ONE short sentence (≤14 words). Talk WITH the user; don't go silent, but don't restate detail the cards already show.",
  "Banned openers: 'I'll help you…', 'Let me…', 'Sure,…', 'Great,…'. Skip filler — lead with substance.",
  "FIRST, always reply with ONE short line restating the goal you understood in your own words (e.g. 'Winning back lapsed members over WhatsApp and voice.'). You MAY echo channels the user explicitly named; never invent channels they did not state.",
  "START WITH THE TEMPLATE CARD — UNLESS THE USER WANTS TO BUILD THEIR OWN: on the user's first brief, immediately call listCampaignTemplates with their brief verbatim as `query` so the matching approved templates render as tiles — do this for BOTH a named template and a plain-language brief. EXCEPTION: when the user signals a custom build (phrases like 'draft my own', 'build my own', 'from scratch', 'create my own', 'don't use a template', or 'none of these fit'), SKIP listCampaignTemplates entirely and go straight to PATH B — and if they ALREADY described a campaign earlier this session (e.g. the plain-language brief that triggered the template card), carry THAT brief forward verbatim as `brief` for planCampaignFromBrief; never make them re-describe a campaign they have already described, and never reset to a blank 'describe your campaign from scratch' prompt when a prior brief exists. Otherwise, NEVER call planCampaignFromBrief before the template card has been shown.",
  "SHOW THE TEMPLATE CARD EXACTLY ONCE PER SESSION — only on that first brief. After it has been shown, NEVER call listCampaignTemplates again: treat any later message that describes a campaign as a brief and go to PATH B (planCampaignFromBrief with that message as `brief`), even if no draft exists yet and even if the message names a template. The user already saw the tiles once; a typed description means build-from-brief, not re-pick.",
  "PATH A — USER PICKS A TEMPLATE (clicks a tile, or names a template id/name directly): create it FROM THAT TEMPLATE by calling these actions strictly IN ORDER: 1) instantiateCampaignTemplate with the chosen id — renders the draft, returns open variables + assumptions. 2) resolveCampaign — Resolve card. 3) validateCampaign — the compliance gate; on 'block' call resolveCampaign again, on 'warn' keep the warning text. 4) confirmCampaign (pass the warning, if any). Do NOT launch.",
  "PATH B — USER DESCRIBES INSTEAD OF PICKING (they type a plain-language brief, or say none of the tiles fit): plan it DIRECTLY from the brief. Call these actions strictly IN ORDER: 1) planCampaignFromBrief — pass the user's brief verbatim as `brief`; it renders the draft and returns `needsChannels` / `needsConditional` / `needsPlacement`. 1b) If `needsChannels` is true (the brief named no channel), call setCampaignChannels so the user picks the channel(s), priority and any fallback, THEN continue. 1c) ASK THE DESIGN QUESTION FIRST — ONLY IF NEEDED: SKIP this entire step whenever the planCampaignFromBrief response has `designFramed: true` (the tool sets this whenever the brief already declared A/B, a conditional branch, a fallback, or otherwise fixed the shape — do NOT re-ask). Otherwise (designFramed is false, i.e. the brief listed channels but never said how to run them together), ask the user in ONE short line how the campaign should be designed — reach everyone on the chosen channels, split the audience by an attribute (e.g. LTV), A/B test, or branch Branch 1 / Branch 2 — and WAIT for their answer. Treat their answer as the design: 'reach everyone' / 'keep it simple' → go to step 3; a split or Branch 1 / Branch 2 branch on an attribute → proceed as a conditional (resolve the audience at step 3 FIRST, then setConditionalBranch at 3b); a parallel split or A-B across two channels → proceed as placement (resolve at step 3, then setChannelPlacement). 2) If `needsPlacement` is true (two or more channels with no fallback), call setChannelPlacement so the user chooses how the channels are placed (fallback / parallel split / A-B test) BEFORE resolving. If it is false, skip to step 3. 3) resolveBriefCampaign — Resolve card for the open variables (segment, then the contact-number field that WhatsApp + voice dial, each channel's resource + timing); the user picks the audience here FIRST. 3b) If `needsConditional` is true (the brief frames a Branch 1 / Branch 2 branch on an audience attribute), call setConditionalBranch AFTER this resolve — now that the audience is chosen — so the user sets the split rule and which channel each branch routes to. 4) validateBriefCampaign — the compliance gate; on 'block' call resolveBriefCampaign again, on 'warn' keep the warning text. 5) confirmBriefCampaign (pass the warning, if any). Do NOT launch.",
  "RESOLVE IN PRIORITY ORDER (statefully across the whole conversation): gather campaign details in three tiers, never asking a later tier before the earlier one is settled. TIER 1 — SHAPE: the channels and how they are placed (single, fallback, parallel split, A/B test, or Branch 1 / Branch 2 branch); this is the design question, answered first. TIER 2 — CONTENT: the audience segment, the contact-number field WhatsApp + voice dial, and each channel's resource (template / voice agent). TIER 3 — LOGIC: the branch split rule, any inter-channel delay, the WhatsApp follow-up disposition, and any A/B split %. The Resolve card already orders its steps this way (Audience → arms / channels → Timing & follow-up → Sending rules); keep already-resolved values across turns and never request Tier-3 logic before Tier-2 content is in hand.",
  "CONDITIONAL BRANCH — PER-ARM DETAILS: when the brief routes to a Branch 1 / Branch 2 branch, each arm's channel node carries its OWN resource (a separate WhatsApp template or voice agent per node), plus an OPTIONAL wait between two consecutive channels and a WhatsApp follow-up disposition (Sent / Delivered / Read / Replied / Failed) that gates whether the next channel fires. Repeated channels are numbered on the canvas (e.g. 'WhatsApp 1' / 'WhatsApp 2'); a channel that appears once keeps its plain name. All of these surface as node-scoped fields on the Resolve card, which walks one step per branch arm (Audience → Branch 1 arm → Branch 2 arm → Timing & follow-up → Sending rules) and labels each field by its node name (e.g. 'WhatsApp 2 · Template'). They can also be set by typing into applyAnswers. A CATEGORICAL attribute (e.g. tier) routes to N NAMED arms — one per value (e.g. Silver / Gold / Platinum / Black), not just Branch 1 / Branch 2 — each arm an independent channel sequence the user sets on the branch card, and the Resolve card walks one step per named arm. A named arm can ALSO carry richer steps, all completed on the Resolve card: a nested A/B split inside the arm (TWO OR MORE variants, each with its own template, its own traffic % that must total 100 across the split, and a plain-English 'what happens next' flow describing where that variant goes after the split — all completed on the Resolve card), a post-action state gate that routes on audience state after a send (e.g. 'Enrolled?' / 'Upgraded?', each outcome continuing to the next step, ending, or sending a per-tier welcome), and 'Welcome to <tier>' messages that all converge on the single End. Never invent them — let the user choose each on the card or in chat.",
  "SINGLE-CHANNEL A/B IS A CONTENT TEST: when the brief asks to A/B test on ONE channel (e.g. 'WhatsApp message with A/B test of templates'), it draws an A/B Split whose variants are SAME-channel nodes, each carrying its OWN template, its own traffic % (must total 100 across the split), and a plain-English 'what happens next' flow — all completed on the split's Resolve card. A two-CHANNEL A/B (e.g. 'A/B test WhatsApp vs voice') draws the SAME A/B Split but with ONE variant per channel — each variant its own channel node and resource, split by traffic %. Never invent a second channel for a single-channel A/B, and never invent extra channels for a two-channel A/B.",
  "TYPED RESOLVE LOOP (both paths) — THIS TAKES PRECEDENCE OVER ROUTING: once a draft already exists this session (you have already called planCampaignFromBrief or instantiateCampaignTemplate), do NOT route to a path again and do NOT call listCampaignTemplates or planCampaignFromBrief — even if the user's message mentions a template name or id. FIRST decide whether the message NAMES RESOLVE VALUES or CHANGES THE DESIGN. (a) RESOLVE VALUES — a segment, contact / phone-number field, WhatsApp template, voice agent, fallback wait, split-rule value, sending window, frequency cap, or start timing: call applyAnswers with their message verbatim as `text`, then read its result — if `unmatched` is non-empty, ask them to pick those from the Resolve card (resolveBriefCampaign / resolveCampaign); if `ready` is false, re-show the Resolve card for what's left; if `ready` is true, go to the validate step; surface each default it reports as an assumption. (b) DESIGN CHANGE — the message INTRODUCES OR EDITS the campaign shape: a Branch 1 / Branch 2 branch or an audience split by an attribute (e.g. 'split by LTV, aggressive for high-LTV, lighter for low'), an A/B test, or adding / removing a channel. For a design change, even though a draft already exists, do NOT use applyAnswers — instead call the matching design card: setConditionalBranch for a branch or attribute split (it MAY reframe a draft that is not yet conditional), setChannelPlacement for a parallel split / A-B across channels, or setCampaignChannels to change the channel set; then continue resolving. Never invent ids — applyAnswers does the mapping.",
  "When the user names a template directly, a one-clause acknowledgement is enough. After any pick, reply 'Done.' or one short clause.",
  "NEVER call a resolve/validate/confirm action before its draft exists in this session — Path A needs a template instantiated, Path B needs a brief planned. If a tool says no draft exists yet, go back to that path's first step.",
  "The level returned by validateCampaign / validateBriefCampaign is computed deterministically — act only on the result; never decide pass/warn/block yourself.",
  "Never invent ids — use only ids returned by the list actions.",
].join(" ");

type RuntimeEnv = Record<string, unknown> | undefined;

function readEnvString(env: RuntimeEnv, key: string): string | undefined {
  const fromCloudflare = env?.[key];
  if (typeof fromCloudflare === "string" && fromCloudflare.length > 0) {
    return fromCloudflare;
  }
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const fromNode = proc?.env?.[key];
  if (typeof fromNode === "string" && fromNode.length > 0) {
    return fromNode;
  }
  return undefined;
}

/** Last human turn from an AG-UI run input, if any. */
function lastUserText(input: RunAgentInput): string | undefined {
  for (let i = input.messages.length - 1; i >= 0; i--) {
    const m = input.messages[i] as { role?: string; content?: unknown };
    if (m.role === "user" && typeof m.content === "string" && m.content.length > 0) {
      return m.content;
    }
  }
  return undefined;
}

/**
 * Deterministic, key-free AG-UI agent. Emits a single canned assistant reply that
 * echoes the user's last message so the panel ⇄ runtime ⇄ agent loop is provably
 * working before any live model is wired up.
 *
 * CopilotKit 1.61's React client resolves chat through `useAgent({agentId:"default"})`,
 * so this is registered as the runtime's `default` agent (not a serviceAdapter —
 * custom `process()` is no longer invoked for chat in 1.61).
 */
class OfflinePiAgent extends AbstractAgent {
  run(input: RunAgentInput): Observable<BaseEvent> {
    const lastText = lastUserText(input);
    const reply = lastText
      ? `Pi (offline mode) heard: “${lastText}”. Set ANTHROPIC_API_KEY to switch on the live assistant.`
      : "Pi is online in offline mode. Set ANTHROPIC_API_KEY to enable the live assistant.";
    const messageId = crypto.randomUUID();

    return new Observable<BaseEvent>((subscriber) => {
      subscriber.next({
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      } as BaseEvent);
      subscriber.next({
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: "assistant",
      } as BaseEvent);
      subscriber.next({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: reply,
      } as BaseEvent);
      subscriber.next({
        type: EventType.TEXT_MESSAGE_END,
        messageId,
      } as BaseEvent);
      subscriber.next({
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
      } as BaseEvent);
      subscriber.complete();
    });
  }
}

/**
 * Build a fresh runtime + serviceAdapter pair for a request. When a live-agent
 * key is present we hand the runtime an {@link OpenAIAdapter} pointed at the
 * configured gateway (TrueFoundry by default) and the runtime auto-builds a
 * `default` BuiltInAgent; otherwise we register the offline echo agent so the
 * chat round-trip is still exercisable without any secret.
 *
 * Env vars (accepts a Cloudflare `env` binding OR `process.env`, whichever has
 * the string first):
 *   PI_AGENT_API_KEY    — bearer token for the gateway. Also accepts the legacy
 *                         ANTHROPIC_API_KEY name for backwards compatibility.
 *   PI_AGENT_BASE_URL   — OpenAI-compat endpoint. Defaults to TFY's `/openai/v1`.
 *   PI_AGENT_MODEL      — model routing string. Defaults to Haiku 4.5 via TFY.
 */
function buildRuntime(env: RuntimeEnv): {
  runtime: CopilotRuntime;
  serviceAdapter: CopilotServiceAdapter;
} {
  const apiKey =
    readEnvString(env, "PI_AGENT_API_KEY") ?? readEnvString(env, "ANTHROPIC_API_KEY");
  if (!apiKey) {
    return {
      runtime: new CopilotRuntime({ agents: { default: new OfflinePiAgent() } }),
      serviceAdapter: new EmptyAdapter(),
    };
  }
  const baseURL = readEnvString(env, "PI_AGENT_BASE_URL") ?? DEFAULT_BASE_URL;
  const model = readEnvString(env, "PI_AGENT_MODEL") ?? DEFAULT_MODEL;
  // CopilotKit's OpenAIAdapter accepts a preconstructed openai client, which lets
  // us point it at any OpenAI-compatible surface (here: TFY's LLM gateway, which
  // proxies to Anthropic-on-Bedrock). `keepSystemRole` preserves "system" turns
  // as-is — the newer OpenAI models switched to "developer", but the TFY-Bedrock
  // pipeline follows classic OpenAI schema and Bedrock's Claude route expects
  // "system", so we keep the classic label.
  const openai = new OpenAI({ apiKey, baseURL });
  return {
    runtime: new CopilotRuntime(),
    serviceAdapter: new TfyOpenAIAdapter({ openai, model, keepSystemRole: true }),
  };
}

/** Synthetic tool result spliced in for an abandoned HITL card (see {@link repairOrphanToolCalls}). */
const ORPHAN_TOOL_RESULT =
  "This interactive card was dismissed because the user sent a new message instead of using it. Disregard this tool call and act on the user's latest message.";

/** A loosely-typed AG-UI wire message (only the fields this rewrite touches). */
type WireMessage = {
  id?: string;
  role?: string;
  content?: unknown;
  toolCallId?: string;
  toolCalls?: Array<{ id?: string }>;
};

/**
 * Drop duplicate `tool_use` ids from the run history.
 *
 * A HITL `renderAndWaitForResponse` card can be re-emitted when the user types past
 * it, and CopilotKit's AG-UI store sometimes mirrors the same assistant tool call
 * twice (identical `id`) into one message's `toolCalls`. The upstream LLM sees every
 * `toolCalls` entry as a `tool_use` content block, so a repeated id makes the model
 * reject the run with "`tool_use` ids must be unique" (e.g. `messages.1.content.2`).
 * Keep the first occurrence of each id — across the whole history, which is the
 * scope the model enforces — and drop the rest. The single surviving call still
 * pairs cleanly with its (deduped) result in {@link repairOrphanToolCalls}.
 */
function dedupeToolCalls(messages: WireMessage[]): WireMessage[] {
  const seen = new Set<string>();
  return messages.map((m) => {
    if (m?.role !== "assistant" || !Array.isArray(m.toolCalls)) return m;
    const toolCalls = m.toolCalls.filter((tc) => {
      const id = tc?.id;
      if (typeof id !== "string") return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return toolCalls.length === m.toolCalls.length ? m : { ...m, toolCalls };
  });
}

/**
 * Repair a run whose history pairs tool calls with their results incorrectly.
 *
 * A HITL `renderAndWaitForResponse` card (template / resolve / validate / confirm)
 * blocks on a never-resolving promise until the user clicks it. If the user instead
 * TYPES a new message, CopilotKit advances the conversation and two malformations can
 * reach the wire — both of which Anthropic rejects with
 * "Tool result is missing for tool call toolu_…":
 *
 *  1. ORPHAN — the abandoned assistant tool call is re-sent with no `tool` result
 *     anywhere in the history.
 *  2. MISORDERED — the abandoned card later resolves and CopilotKit appends its `tool`
 *     result, but positioned AFTER the user's typed message rather than immediately
 *     after the assistant tool call (assistant tool_use → user text → tool result).
 *     Anthropic needs every tool_result in the user turn that directly follows its
 *     tool_use, so the interleaved user text breaks the pairing.
 *
 * Normalize both: walk the messages, drop every `tool` result from its original slot,
 * and re-emit it immediately after the assistant turn that owns its `toolCallId`. Any
 * tool call with no result gets a synthetic neutral result spliced in the same spot, so
 * each tool_use is always paired with exactly one tool_result, in order, before the
 * {@link AnthropicAdapter} converts the history.
 */
function repairOrphanToolCalls(messages: WireMessage[]): WireMessage[] {
  const toolResults = new Map<string, WireMessage>();
  for (const m of messages) {
    if (m?.role === "tool" && typeof m.toolCallId === "string" && !toolResults.has(m.toolCallId)) {
      toolResults.set(m.toolCallId, m);
    }
  }
  const emitted = new Set<string>();
  const out: WireMessage[] = [];
  for (const m of messages) {
    // Tool results are re-emitted right after their tool_use, never in their original slot.
    if (m?.role === "tool" && typeof m.toolCallId === "string") continue;
    out.push(m);
    if (m?.role === "assistant" && Array.isArray(m.toolCalls)) {
      for (const tc of m.toolCalls) {
        const id = tc?.id;
        if (typeof id !== "string" || emitted.has(id)) continue;
        emitted.add(id);
        const result = toolResults.get(id);
        out.push(
          result ?? { id: crypto.randomUUID(), role: "tool", toolCallId: id, content: ORPHAN_TOOL_RESULT },
        );
      }
    }
  }
  return out;
}

/**
 * Rewrite an `agent/run` request body before it reaches the runtime:
 *
 *  1. {@link dedupeToolCalls} + {@link repairOrphanToolCalls} — drop duplicate tool_use
 *     ids, then pair any abandoned HITL tool call with a synthetic result, so the
 *     upstream model never sees a repeated or dangling tool_use.
 *  2. Steer the live model by folding {@link PI_SYSTEM_PROMPT} into the latest *user*
 *     turn's content (prefixed, once, between {@link PI_PROMPT_MARKER} and
 *     {@link PI_PROMPT_END}).
 *
 * Why the user turn and not a `system` message: CopilotKit 1.61's AG-UI BuiltInAgent
 * path only weakly honors an injected leading system message (the model follows the
 * functional tool-order but ignores the style/persona rules), whereas content folded
 * into the user turn is followed reliably. The trade-off is that the client mirrors the
 * run-input back into its store, so this text would render inside the user's own bubble
 * — that is suppressed on the client by stripping the delimited prefix before display.
 *
 * Returns the original request untouched for non-run requests or unparseable bodies.
 */
async function withSystemPrompt(request: Request): Promise<Request> {
  if (request.method !== "POST") return request;
  let payload: {
    method?: string;
    body?: { messages?: WireMessage[] };
  };
  try {
    payload = JSON.parse(await request.clone().text());
  } catch {
    return request;
  }
  const messages = payload?.body?.messages;
  if (payload?.method !== "agent/run" || !Array.isArray(messages)) return request;
  // 1. Drop any duplicate tool_use id, then pair every abandoned HITL tool call with a
  //    synthetic result, so the history is well-formed for the upstream model.
  const repaired = repairOrphanToolCalls(dedupeToolCalls(messages));
  payload.body!.messages = repaired;
  // 2. Fold the directive into the most recent user turn with string content.
  for (let i = repaired.length - 1; i >= 0; i--) {
    const m = repaired[i];
    if (m?.role !== "user" || typeof m.content !== "string") continue;
    if (m.content.startsWith(PI_PROMPT_MARKER)) break; // already folded
    m.content = `${PI_PROMPT_MARKER} ${PI_SYSTEM_PROMPT} ${PI_PROMPT_END}\n\n${m.content}`;
    break;
  }
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(request.url, { method: request.method, headers, body: JSON.stringify(payload) });
}

/**
 * Handle a request to {@link COPILOT_ENDPOINT}. Constructs a fresh runtime per
 * request (cheap; keeps the Worker stateless) and delegates to CopilotKit's
 * Web-standard App Router handler.
 */
export async function handleCopilotRequest(request: Request, env?: RuntimeEnv): Promise<Response> {
  const { runtime, serviceAdapter } = buildRuntime(env);

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: COPILOT_ENDPOINT,
  });

  return handleRequest(await withSystemPrompt(request));
}
