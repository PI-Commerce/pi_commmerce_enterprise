/**
 * Ask Pi kernel — TrueFoundry OpenAI-compat transport + tool loop.
 *
 * Fallback path used for local dev on the Paytm corporate network when
 * the Anthropic route isn't reachable / isn't configured. Speaks the
 * OpenAI chat-completions dialect. No extended thinking; the OpenAI-compat
 * shape doesn't carry a `thinking` block.
 *
 * Bedrock quirks to preserve verbatim:
 *   - Assistant messages MAY carry `content: null` when only tool_calls
 *     are present. Bedrock (routed via TFY) rejects `content: ""` on the
 *     same turn as tool_calls with a 400. Prefer null over ""; omit
 *     tool_calls when absent.
 */
import type { LoopRequest, LoopResult, ToolCallLog } from "../types";
import { KERNEL_DEFAULTS } from "../types";

export type TfyLoopInput = LoopRequest & {
  apiKey: string;
  model: string;
  baseUrl: string;
};

export async function runTfyLoop(input: TfyLoopInput): Promise<LoopResult> {
  // OpenAI-shape tool defs: { type: "function", function: { ... } }.
  const openaiTools = input.tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  // OpenAI expects `system` as a message role. Context, if any, rides
  // as a second system message so the surface's own system content
  // stays intact for readability in logs.
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: input.systemContent },
    ...(input.history ?? []).map((m) => ({ role: m.role, content: m.content })),
  ];
  if (input.context && Object.keys(input.context).length > 0) {
    messages.push({
      role: "system",
      content: `Current context: ${JSON.stringify(input.context)}`,
    });
  }
  messages.push({ role: "user", content: input.question });

  const maxRounds = input.config?.maxRounds ?? KERNEL_DEFAULTS.maxRounds;

  const toolCalls: ToolCallLog[] = [];
  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages,
        tools: openaiTools,
        tool_choice: "auto",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `tfy_${res.status}: ${body.slice(0, 200)}` };
    }
    const json = await res.json() as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
      }>;
    };
    const msg = json.choices?.[0]?.message;
    if (!msg) return { ok: false, error: "empty_response" };

    const hasToolCalls = !!(msg.tool_calls && msg.tool_calls.length > 0);
    const assistantMsg: Record<string, unknown> = {
      role: "assistant",
      // Prefer null over "" — Bedrock rejects empty-string content when
      // tool_calls are also present.
      content: msg.content && msg.content.trim().length > 0 ? msg.content : null,
    };
    if (hasToolCalls) assistantMsg.tool_calls = msg.tool_calls;
    messages.push(assistantMsg);

    // Structured-response mode: terminator tool call ends the loop with
    // its raw arguments as the structured answer.
    if (input.config?.terminateOnToolCall && hasToolCalls) {
      const terminator = msg.tool_calls!.find(
        (tc) => tc.function.name === input.config!.terminateOnToolCall,
      );
      if (terminator) {
        let structured: Record<string, unknown> = {};
        try {
          structured = JSON.parse(terminator.function.arguments) as Record<string, unknown>;
        } catch {
          /* keep as {} */
        }
        toolCalls.push({
          name: terminator.function.name,
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

    if (!hasToolCalls) {
      return { ok: true, answer: msg.content ?? "", toolCalls };
    }

    for (const tc of msg.tool_calls!) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        /* keep as {} */
      }
      const result = await input.executor(tc.function.name, args);
      toolCalls.push({
        name: tc.function.name,
        args: JSON.stringify(args),
        result: JSON.stringify(result),
      });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function.name,
        content: JSON.stringify(result),
      });
    }
  }
  return { ok: false, error: "exceeded_tool_rounds" };
}
