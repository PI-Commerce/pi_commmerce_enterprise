/**
 * Common tool: `emit_choice`.
 *
 * Chips-first prompting. When Pi has a bounded-answer question (asset
 * pick, yes/no, bucket picker), it calls this instead of writing a
 * `pi-choice` fenced JSON block in prose. The tool call is more reliable
 * and the client renders chips uniformly.
 *
 * Contract: after emit_choice the loop should wait for the user's next
 * turn — Pi must NOT keep calling tools. The `awaiting_user` flag in
 * the result signals that intent to Pi's next reasoning step.
 */
import { emitChoice, type EmitChoiceInput } from "@/lib/pi-skills";
import type { SurfaceTool } from "@/lib/pi/kernel";

export const emitChoiceTool: SurfaceTool = {
  name: "emit_choice",
  description:
    "Present a chips card to the user. USE THIS INSTEAD of writing a ```pi-choice fenced JSON block in prose — the tool call is more reliable and the client always renders it as clickable chips. Emit whenever you'd ask a narrow-answer question (2-6 options). The server returns `{ ok, awaiting_user: true }` — Pi MUST stop calling tools after emit_choice and wait for the user's next turn.",
  parameters: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description: "Stable snake_case id for this decision (voice_agent / wa_5d / delay_window).",
      },
      prompt: {
        type: "string",
        description: "One-sentence question that goes above the chips. Under 100 chars.",
      },
      options: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Real asset id when picking an asset; short slug otherwise.",
            },
            label: {
              type: "string",
              description: "Human label under 60 chars.",
            },
            hint: {
              type: "string",
              description: "Optional subtitle under 60 chars.",
            },
          },
          required: ["id", "label"],
        },
        minItems: 1,
      },
    },
    required: ["key", "prompt", "options"],
  },
  handler: (args) => emitChoice(args as EmitChoiceInput),
};
