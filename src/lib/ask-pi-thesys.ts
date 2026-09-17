import { createServerFn } from "@tanstack/react-start";
import { voiceDataBlock } from "./voice-analytics-data";

// Live Thesys C1 path for Analytics Ask Pi. Runs server-side only (createServerFn) so the
// API key never reaches the browser. Given a free-text question it asks C1 to generate a
// chart from the voice-call grounding data and returns the DSL string, which PiThesysResult
// renders with the same offline C1Component used for the static fixtures.

const ENDPOINT = "https://api.thesys.dev/v1/embed/chat/completions";

const SYSTEM = `You are Pi, the analytics copilot inside PiCom, a marketing-automation platform.
You answer questions about a Volt Money voice-AI calling campaign using ONLY the data block provided.
Respond with a single compact generative-UI card:
- one short, plain-language insight sentence at the top (sound like an analyst, not a robot),
- then ONE chart that visualizes the slice of the data that answers the question,
- give the chart a clear title and a short subtitle (scope/source).
Rules: never invent, round, or alter numbers — use the exact values in the data block. Pick the
most relevant breakdown for the question. If the data can't answer it, say so briefly in the
insight and chart the closest available breakdown. One card, one chart, no filler.`;

export type AskPiThesysResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

export const askPiThesys = createServerFn({ method: "POST" })
  .inputValidator((question: string) => question)
  .handler(async ({ data: question }): Promise<AskPiThesysResult> => {
    const key = process.env.THESYS_API_KEY;
    if (!key) return { ok: false, error: "missing_key" };
    const model = process.env.THESYS_MODEL || "c1/anthropic/claude-sonnet-4.6/v-20260331";

    const userContent =
      `Question: ${question}\n\n` +
      `Data (chart exactly these numbers):\n${voiceDataBlock()}`;

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userContent },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `c1_${res.status}: ${body.slice(0, 200)}` };
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") return { ok: false, error: "empty_response" };
      return { ok: true, content };
    } catch (err) {
      return { ok: false, error: `fetch_failed: ${(err as Error).message}` };
    }
  });
