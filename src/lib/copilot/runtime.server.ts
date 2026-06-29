/**
 * Server-only CopilotKit runtime — the bridge between the Ask Pi chat panel and
 * Claude.
 *
 * This module is intentionally imported *lazily* (only when a request hits
 * {@link COPILOT_ENDPOINT}) so the heavy CopilotKit + Anthropic graph never loads
 * on the normal SSR page-render path.
 *
 * Backend selection (CopilotKit 1.61 is AG-UI–agent based, so the runtime must
 * expose a `default` agent for the React client's `useAgent({agentId:"default"})`):
 *  - If an Anthropic API key is present (Cloudflare `env.ANTHROPIC_API_KEY` in
 *    production, `process.env.ANTHROPIC_API_KEY` in node dev) we hand the runtime
 *    an {@link AnthropicAdapter}; the runtime auto-builds a `default` BuiltInAgent
 *    from the adapter's language model.
 *  - Otherwise we register a deterministic {@link OfflinePiAgent} as the `default`
 *    agent (paired with {@link EmptyAdapter}) so the chat round-trip is fully
 *    exercisable without any secret.
 */
import "reflect-metadata";

import Anthropic from "@anthropic-ai/sdk";
import {
  AnthropicAdapter,
  CopilotRuntime,
  EmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
  type CopilotServiceAdapter,
} from "@copilotkit/runtime";
import { AbstractAgent } from "@ag-ui/client";
import { EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/core";
import { Observable } from "rxjs";

import { COPILOT_ENDPOINT, PI_PROMPT_MARKER, PI_PROMPT_END } from "./endpoint";

/** Default model when no override is supplied. Overridable via `PI_AGENT_MODEL`. */
const DEFAULT_MODEL = "claude-sonnet-4-5";

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
  "ALWAYS START WITH THE TEMPLATE CARD: on the user's first brief, immediately call listCampaignTemplates with their brief verbatim as `query` so the matching approved templates render as tiles — do this for BOTH a named template and a plain-language brief. NEVER call planCampaignFromBrief before the template card has been shown.",
  "SHOW THE TEMPLATE CARD EXACTLY ONCE PER SESSION — only on that first brief. After it has been shown, NEVER call listCampaignTemplates again: treat any later message that describes a campaign as a brief and go to PATH B (planCampaignFromBrief with that message as `brief`), even if no draft exists yet and even if the message names a template. The user already saw the tiles once; a typed description means build-from-brief, not re-pick.",
  "PATH A — USER PICKS A TEMPLATE (clicks a tile, or names a template id/name directly): create it FROM THAT TEMPLATE by calling these actions strictly IN ORDER: 1) instantiateCampaignTemplate with the chosen id — renders the draft, returns open variables + assumptions. 2) resolveCampaign — Resolve card. 3) validateCampaign — the compliance gate; on 'block' call resolveCampaign again, on 'warn' keep the warning text. 4) confirmCampaign (pass the warning, if any). Do NOT launch.",
  "PATH B — USER DESCRIBES INSTEAD OF PICKING (they type a plain-language brief, or say none of the tiles fit): plan it DIRECTLY from the brief. Call these actions strictly IN ORDER: 1) planCampaignFromBrief — pass the user's brief verbatim as `brief`; it renders the draft and returns `needsChannels` / `needsConditional` / `needsPlacement`. 1b) If `needsChannels` is true (the brief named no channel), call setCampaignChannels so the user picks the channel(s), priority and any fallback, THEN continue. 1c) If `needsConditional` is true (the brief frames a Match / Else branch on an audience attribute), call setConditionalBranch so the user sets the rule and which channel each branch routes to, THEN skip to step 3. 2) If `needsPlacement` is true (two or more channels with no fallback), call setChannelPlacement so the user chooses how the channels are placed (fallback / parallel split / A-B test) BEFORE resolving. If it is false, skip to step 3. 3) resolveBriefCampaign — Resolve card for the remaining open variables. 4) validateBriefCampaign — the compliance gate; on 'block' call resolveBriefCampaign again, on 'warn' keep the warning text. 5) confirmBriefCampaign (pass the warning, if any). Do NOT launch.",
  "TYPED RESOLVE LOOP (both paths) — THIS TAKES PRECEDENCE OVER ROUTING: once a draft already exists this session (you have already called planCampaignFromBrief or instantiateCampaignTemplate), do NOT route to a path again and do NOT call listCampaignTemplates or planCampaignFromBrief — even if the user's message mentions a template name or id. Treat any later message that names a segment, WhatsApp template, voice agent, fallback wait, split rule, sending window, frequency cap, or start timing as ANSWERS to the open variables. Whenever they type such values, call applyAnswers with their message verbatim as `text`, then read its result: if `unmatched` is non-empty, ask them to pick those from the Resolve card (resolveBriefCampaign / resolveCampaign); if `ready` is false, re-show the Resolve card for what's left; if `ready` is true, go to the validate step. Surface each default it reports as an assumption. Never invent ids — applyAnswers does the mapping.",
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
 * Build a fresh runtime + serviceAdapter pair for a request. When a key is present
 * the AnthropicAdapter supplies model info and the runtime auto-builds a `default`
 * BuiltInAgent; otherwise we register the offline echo agent explicitly.
 */
function buildRuntime(env: RuntimeEnv): {
  runtime: CopilotRuntime;
  serviceAdapter: CopilotServiceAdapter;
} {
  const apiKey = readEnvString(env, "ANTHROPIC_API_KEY");
  if (!apiKey) {
    return {
      runtime: new CopilotRuntime({ agents: { default: new OfflinePiAgent() } }),
      serviceAdapter: new EmptyAdapter(),
    };
  }
  const model = readEnvString(env, "PI_AGENT_MODEL") ?? DEFAULT_MODEL;
  // CopilotKit 1.61's AnthropicAdapter runs on the Vercel AI SDK (@ai-sdk/anthropic)
  // and copies this client's `baseURL` verbatim into createAnthropic(). The
  // @anthropic-ai/sdk default baseURL is "https://api.anthropic.com" (it appends
  // "/v1" per request), but @ai-sdk/anthropic appends "/messages" directly — so the
  // default drops "/v1" and every call 404s. Pin the version segment explicitly.
  const anthropic = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com/v1" });
  return {
    runtime: new CopilotRuntime(),
    serviceAdapter: new AnthropicAdapter({ anthropic, model }),
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
 *  1. {@link repairOrphanToolCalls} — pair any abandoned HITL tool call with a
 *     synthetic result so Anthropic never sees a dangling tool_use.
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
  // 1. Repair any abandoned HITL tool call so the history is well-formed for Anthropic.
  const repaired = repairOrphanToolCalls(messages);
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
 * Graceful 503 used when the live agent runtime isn't usable on this deploy.
 *
 * Why this can happen: to fit the Cloudflare 3 MiB free-plan worker-size limit, the
 * SSR build stubs `@copilotkit/runtime` + `@anthropic-ai/sdk` + friends to empty Noop
 * classes (see `stubHeavyDepsInSsr` in vite.config.ts). That keeps the wizard path
 * (offline, default) shipping on a free worker, but the live chat path can't run there.
 * Local dev and the production build do NOT apply the stub, so chat works normally
 * there — only the deployed-on-free-tier worker degrades.
 */
function liveChatUnavailable(): Response {
  return new Response(
    JSON.stringify({
      error:
        "Live chat is not available on this deploy. Use wizard mode (the default), or run locally with ANTHROPIC_API_KEY set.",
    }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Handle a request to {@link COPILOT_ENDPOINT}. Constructs a fresh runtime per
 * request (cheap; keeps the Worker stateless) and delegates to CopilotKit's
 * Web-standard App Router handler. Wrapped in a try/catch so the SSR-stubbed
 * "offline-only deploy" returns a clean 503 instead of an opaque 500.
 */
export async function handleCopilotRequest(request: Request, env?: RuntimeEnv): Promise<Response> {
  try {
    const { runtime, serviceAdapter } = buildRuntime(env);

    const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
      runtime,
      serviceAdapter,
      endpoint: COPILOT_ENDPOINT,
    });

    const response = await handleRequest(await withSystemPrompt(request));
    // When the worker is built with the SSR runtime stubs, `handleRequest` is a no-op
    // returning null. Treat anything that isn't a real Response as "live chat off".
    return response instanceof Response ? response : liveChatUnavailable();
  } catch {
    return liveChatUnavailable();
  }
}
