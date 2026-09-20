/**
 * Ask Pi — /developer surface tool: list_endpoints.
 *
 * Structural query over API Docs endpoints. Complements search_docs for
 * questions that want a table of contents, not a paragraph:
 *   - "what APIs are available?"
 *   - "what endpoints are in Campaign Trigger?"
 *   - "what SMS endpoints do you have?"
 *
 * Keyword retrieval could technically hit these via section-title boosts,
 * but a dedicated tool returns a clean structured list — perfect for the
 * shape the model needs to render as a bulleted answer.
 *
 * Tool contract:
 *   input:  { group? }
 *   output: { endpoints: Array<{ id, method, path, title, short, url }>,
 *             total, filtersApplied }
 *
 * Reads directly from src/lib/api-docs.ts (source of truth).
 */
import type { SurfaceTool } from "@/lib/pi/kernel";
import { ENDPOINTS, BASE_URL } from "@/lib/api-docs";

type EndpointGroup = "campaign-trigger" | "whatsapp" | "sms" | "rcs";

const GROUP_PREFIX: Record<EndpointGroup, string> = {
  "campaign-trigger": "campaign-trigger-",
  whatsapp: "channel-whatsapp",
  sms: "channel-sms",
  rcs: "channel-rcs",
};

export const listEndpoints: SurfaceTool = {
  name: "list_endpoints",
  description:
    "List public API endpoints filtered by group. Use this — NOT search_docs — for any 'what endpoints', 'what APIs', 'list of APIs', 'what can I call' question. Returns each endpoint's method, path, short description, and full URL. Pass `group` to narrow (campaign-trigger, whatsapp, sms, rcs); omit to get all endpoints across every group.",
  parameters: {
    type: "object",
    properties: {
      group: {
        type: "string",
        enum: ["campaign-trigger", "whatsapp", "sms", "rcs"],
        description: "Optional. Narrow to one endpoint group.",
      },
    },
    required: [],
  },
  handler: async (args) => {
    const group = args.group as EndpointGroup | undefined;

    let entries = ENDPOINTS.slice();
    if (group) {
      const prefix = GROUP_PREFIX[group];
      entries = entries.filter((e) => e.id.startsWith(prefix));
    }

    return {
      endpoints: entries.map((e) => ({
        id: e.id,
        method: e.method,
        path: e.path,
        title: e.title,
        short: e.short,
        url: `${BASE_URL}${e.path}`,
      })),
      total: entries.length,
      filtersApplied: {
        group: group ?? null,
      },
    };
  },
};
