/**
 * Ask Pi kernel — Anthropic `/v1/messages` transport + tool loop.
 *
 * This is the extended-thinking, tool-use loop we ship in prod. Extracted
 * verbatim from the original pi-llm.ts so behavior is bit-identical:
 *   - `system` moves out of `messages` to a top-level string
 *   - tools go across as { name, description, input_schema }
 *   - response `content` is an array of typed blocks; we preserve
 *     assistant blocks (including `thinking` blocks with their signature)
 *     verbatim, because Anthropic verifies the signature on the next
 *     round when tool_use blocks are involved
 *   - tool results go back as a single user message with N tool_result
 *     blocks, one per tool_use the model emitted
 *
 * The loop is generic w.r.t. the surface — it dispatches tool calls via
 * the caller-supplied `executor` closure. Zero product knowledge here.
 */
import type { LoopRequest, LoopResult, ToolCallLog } from "../types";
import { KERNEL_DEFAULTS } from "../types";

/** Anthropic message-content block shapes we know about. */
type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string }
  // Extended thinking blocks. Returned by the API when `thinking` is
  // enabled. The `signature` is load-bearing: it MUST be echoed back
  // inside the assistant message on any follow-up tool round, or the
  // API rejects the request. The `redacted_thinking` variant shows up
  // when the reasoning was filtered upstream and can't be replayed.
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "redacted_thinking"; data: string };

type AnthropicMessage = { role: "user" | "assistant"; content: AnthropicBlock[] | string };

export type AnthropicLoopInput = LoopRequest & {
  apiKey: string;
  model: string;
  /** Workspace-scoped API keys require this header; unscoped keys reject
   *  it. Only send when configured. */
  workspaceId?: string;
};

export async function runAnthropicLoop(input: AnthropicLoopInput): Promise<LoopResult> {
  // Convert normalized tool defs to Anthropic's wire shape.
  const anthropicTools = input.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  // Fold structured context into the system prompt so it survives every
  // turn without polluting the message history.
  const systemFull = input.context && Object.keys(input.context).length > 0
    ? `${input.systemContent}\n\n## Current context\n${JSON.stringify(input.context, null, 2)}`
    : input.systemContent;

  // Seed history from prior turns. Anthropic expects user/assistant only —
  // there is no `system` role in messages. History content stays strings;
  // the kernel doesn't try to reconstitute prior thinking blocks (that
  // information isn't in the history payload anyway).
  const messages: AnthropicMessage[] = [];
  for (const m of input.history ?? []) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: input.question });

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": input.apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (input.workspaceId) {
    headers["anthropic-workspace-id"] = input.workspaceId;
  }

  const maxRounds = input.config?.maxRounds ?? KERNEL_DEFAULTS.maxRounds;
  const thinkingBudget = input.config?.thinkingBudget ?? KERNEL_DEFAULTS.thinkingBudget;
  const maxTokens = input.config?.maxTokens
    ?? Math.max(thinkingBudget + 4096, KERNEL_DEFAULTS.minMaxTokens);

  const toolCalls: ToolCallLog[] = [];
  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.model,
        max_tokens: maxTokens,
        // Temperature MUST be 1 when extended thinking is enabled.
        temperature: 1,
        thinking: { type: "enabled", budget_tokens: thinkingBudget },
        system: systemFull,
        messages,
        tools: anthropicTools,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `anthropic_${res.status}: ${body.slice(0, 300)}` };
    }
    const json = await res.json() as {
      content?: AnthropicBlock[];
      stop_reason?: string;
      role?: string;
    };
    const blocks = json.content ?? [];
    // Push the assistant turn verbatim so tool_result blocks on the next
    // round reference the matching tool_use ids AND so any thinking-block
    // signatures survive intact.
    messages.push({ role: "assistant", content: blocks });

    const toolUses = blocks.filter(
      (b): b is Extract<AnthropicBlock, { type: "tool_use" }> => b.type === "tool_use",
    );

    // Structured-response mode: a specific tool name terminates the loop
    // and its raw `input` becomes the structured answer. The tool handler
    // is NOT invoked — the tool is purely a signalling channel.
    if (input.config?.terminateOnToolCall) {
      const terminator = toolUses.find((t) => t.name === input.config!.terminateOnToolCall);
      if (terminator) {
        const structured = terminator.input ?? {};
        // Record it in the audit log so the client can render "here's
        // what Pi did" uniformly.
        toolCalls.push({
          name: terminator.name,
          args: JSON.stringify(structured),
          result: JSON.stringify({ ok: true, terminated: true }),
        });
        return {
          ok: true,
          answer: JSON.stringify(structured),
          structured,
          toolCalls,
        };
      }
    }

    if (toolUses.length === 0) {
      // Terminal turn — concatenate every text block as the final answer.
      const answer = blocks
        .filter((b): b is Extract<AnthropicBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { ok: true, answer, toolCalls };
    }

    // Execute every tool call, then post the results back as ONE user
    // message with N tool_result blocks.
    const resultBlocks: AnthropicBlock[] = [];
    for (const tu of toolUses) {
      const result = await input.executor(tu.name, tu.input ?? {});
      const resultStr = JSON.stringify(result);
      toolCalls.push({
        name: tu.name,
        args: JSON.stringify(tu.input ?? {}),
        result: resultStr,
      });
      resultBlocks.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: resultStr,
      });
    }
    messages.push({ role: "user", content: resultBlocks });
  }
  return { ok: false, error: "exceeded_tool_rounds" };
}
