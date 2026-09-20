/**
 * Common tool: `emit_action_link`.
 *
 * Cross-surface escape hatch. Every surface should pull this into its
 * `tools` list so Pi can always break out to a workspace route when the
 * user is dead-ended on the current surface (no WA numbers connected,
 * no voice agents, no template in library, etc.).
 *
 * Client dock reads the tool call from `toolCalls` and renders a
 * prominent action button that opens `href` in a new tab so the chat
 * context stays alive while the user unblocks.
 */
import type { SurfaceTool } from "@/lib/pi/kernel";

export const emitActionLink: SurfaceTool = {
  name: "emit_action_link",
  description:
    "Render a prominent action button in the chat that opens a workspace route in a new tab. Use ONLY for dead-end situations where the user needs to leave the current surface to unblock (no WhatsApp numbers connected → /channels/whatsapp; no voice agents → /agents; no CSV in library → /campaigns; no API tool → /agents/tools; no template → /channels/whatsapp). Prefer this over a prose link — it stands out, opens in a new tab so the chat stays alive, and reads as a clear next step. NEVER use for optional navigation or informational deep links; use plain markdown links for those.",
  parameters: {
    type: "object",
    properties: {
      label: {
        type: "string",
        description: "Button label, under 40 chars, verb-first ('Connect a WhatsApp number', 'Create a voice agent').",
      },
      href: {
        type: "string",
        description: "In-app route starting with `/`. Never http(s). Examples: `/channels/whatsapp`, `/agents/new`, `/agents/tools/new`.",
      },
      hint: {
        type: "string",
        description: "Optional one-line subtitle explaining what happens after. e.g. 'Opens in a new tab. Say resume when you're back.'",
      },
    },
    required: ["label", "href"],
  },
  handler: (args) => ({
    ok: true,
    ui: true,
    action_link: {
      label: (args.label as string) ?? "",
      href: (args.href as string) ?? "",
      hint: (args.hint as string) ?? undefined,
    },
  }),
};
