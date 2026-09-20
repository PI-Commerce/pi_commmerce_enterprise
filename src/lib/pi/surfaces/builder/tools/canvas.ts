/**
 * Builder surface — canvas + campaign tools.
 *
 * The tools that mutate the on-screen DAG or read campaign metadata.
 * Grouped here because they share the same D1 module (`campaigns`) and
 * the same client-side apply pipeline (`applyPiToolCallsToGraph`).
 *
 * Split from the sibling `skills.ts` which houses the higher-level
 * reasoning tools (classify, suggest, find, read_asset).
 */
import * as campaigns from "@/lib/db/campaigns";
import { BUILDER_ALLOWED_KINDS } from "@/lib/node-registry";
import type { SurfaceTool } from "@/lib/pi/kernel";

/** Read every campaign in the workspace with its top-level metadata. */
export const listCampaigns: SurfaceTool = {
  name: "list_campaigns",
  description: "Return every campaign in the workspace with id, name, vertical, status.",
  parameters: { type: "object", properties: {} },
  handler: async () => await campaigns.listCampaigns(),
};

/** Announce the plan to the user for confirmation. Client-only tool:
 *  server always returns `{ ok, awaiting_user: true }` and the client
 *  reads the args to render the Confirm-Draft card. */
export const proposeDraft: SurfaceTool = {
  name: "propose_draft",
  description:
    "Propose the workflow plan to the user for confirmation BEFORE any insert_node calls. Emit this once Pi has gathered enough context. The client renders the plan as a Confirm-Draft card in chat; the user hits 'Draft this' to accept or 'Edit' to revise. Never call insert_node without a prior propose_draft. Pi's proposal must respect the canonical construct rules (single End, LTR, bezier, WA Freeform placement rule, only allowed kinds, only real asset ids).",
  parameters: {
    type: "object",
    properties: {
      campaignId: { type: "string" },
      title: { type: "string", description: "Short human title for the proposed workflow." },
      summary: {
        type: "string",
        description: "One-line human summary of the flow (e.g. 'Audience > Conditional on renewal_date > WA branch, Voice branch > End').",
      },
      branches: {
        type: "array",
        description: "Ordered list of the branches Pi will wire. Each branch is one path from Audience to End.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Human label for this branch (e.g. 'Renewal in 5 days')." },
            channels: {
              type: "array",
              description: "Ordered list of channel + asset picks along this branch.",
              items: {
                type: "object",
                properties: {
                  kind: {
                    type: "string",
                    enum: BUILDER_ALLOWED_KINDS,
                    description: "Node kind (only allowed builder kinds).",
                  },
                  assetId: {
                    type: "string",
                    description: "Real id from the injected assets catalog — voice agent id, WA template id, SMS template id, RCS template id, or API tool handle. Never invent.",
                  },
                  note: { type: "string", description: "Optional one-line note (e.g. 'timeout > voice fallback')." },
                },
                required: ["kind"],
              },
            },
          },
          required: ["label", "channels"],
        },
      },
      openQuestions: {
        type: "array",
        description: "Things Pi still isn't sure about. Empty means Pi is ready to build. Non-empty means Pi is asking the user to resolve these before Draft.",
        items: { type: "string" },
      },
    },
    required: ["campaignId", "title", "summary", "branches"],
  },
  // Server-side no-op. Client picks up the tool_use from `toolCalls` and
  // renders the Confirm-Draft card; the awaiting_user flag is Pi's cue
  // to stop calling tools this turn.
  handler: () => ({ ok: true, awaiting_user: true }),
};

/** Insert a new node into the DAG. Called AFTER propose_draft is accepted. */
export const insertNode: SurfaceTool = {
  name: "insert_node",
  description:
    "Insert a new node into a campaign's DAG. Only callable AFTER the user has accepted a propose_draft. Must use an allowed kind (see the injected nodeKinds registry). Position hints should be right of the rightmost existing node (ELK relays anyway).",
  parameters: {
    type: "object",
    properties: {
      campaignId: { type: "string" },
      node: {
        type: "object",
        properties: {
          id: { type: "string", description: "Stable per-kind id (e.g. 'voiceCall_1', 'whatsapp_2')." },
          kind: {
            type: "string",
            enum: BUILDER_ALLOWED_KINDS,
            description: "Node kind — must be one of the allowed builder kinds.",
          },
          title: { type: "string" },
          subtitle: { type: "string" },
          config: {
            type: "object",
            description: "Config keys per the registry's `requires` field. For kinds that pick an asset (WA template, voice agent, SMS template, API tool), use a real id/handle from the injected assets catalog.",
          },
          position: {
            type: "object",
            properties: { x: { type: "number" }, y: { type: "number" } },
          },
        },
        required: ["id", "kind", "title"],
      },
    },
    required: ["campaignId", "node"],
  },
  handler: async (args) => {
    await campaigns.insertNode(args.campaignId as string, args.node as campaigns.DslNode);
    return { ok: true };
  },
};

/** Wire two nodes together. Every terminal branch must eventually reach `end`. */
export const connectNodes: SurfaceTool = {
  name: "connect_nodes",
  description:
    "Wire two nodes together. Every terminal branch of the flow must eventually connect into the single `end` node. `sourceHandle` names the source node's output port (e.g. 'timeout', 'failure', 'btn_yes', or a Conditional branch id). Omit `sourceHandle` for a node's default output.",
  parameters: {
    type: "object",
    properties: {
      campaignId: { type: "string" },
      edge: {
        type: "object",
        properties: {
          id: { type: "string" },
          source: { type: "string" },
          target: { type: "string" },
          sourceHandle: { type: "string" },
        },
        required: ["id", "source", "target"],
      },
    },
    required: ["campaignId", "edge"],
  },
  handler: async (args) => {
    await campaigns.connectNodes(args.campaignId as string, args.edge as campaigns.DslEdge);
    return { ok: true };
  },
};

/** Patch one existing node's title / subtitle / config. Shallow-merges config. */
export const updateNode: SurfaceTool = {
  name: "update_node",
  description:
    "Patch one existing node's title / subtitle / config. Works on every node in the current campaign, including the pre-existing undeletable ones (`start`, `audience`, `end`). Use this to add fields to the Audience schema, pick a template on a WhatsApp node, pick an agent on a Voice Call node, set a Delay's duration, configure Conditional branches, etc. Never use it to change a node's `kind` — insert a new node of the correct kind and reconnect edges instead. `patch.config` is shallow-merged onto the existing config, so pass only the keys that change.",
  parameters: {
    type: "object",
    properties: {
      campaignId: { type: "string" },
      nodeId: { type: "string" },
      patch: {
        type: "object",
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          config: { type: "object", description: "Partial config object. Merged into the node's existing config. Follow the node kind's `requires` list in the registry." },
        },
      },
    },
    required: ["campaignId", "nodeId", "patch"],
  },
  handler: async (args) => {
    await campaigns.updateNode(
      args.campaignId as string,
      args.nodeId as string,
      args.patch as never,
    );
    return { ok: true };
  },
};

/** Pure UI intent — client selects the node + centers viewport + opens
 *  the config panel. Server never mutates anything. */
export const focusNode: SurfaceTool = {
  name: "focus_node",
  description:
    "Spotlight a node on the canvas without mutating it. Use whenever you say 'now on node X' / 'let's fix X next' / 'looking at conditional_1' so the user's canvas selects that node and opens its config panel. Fire this BEFORE talking about a node so the user sees what you're referring to. Pure UI intent — no state change.",
  parameters: {
    type: "object",
    properties: {
      nodeId: { type: "string", description: "The node id from the current DSL (e.g. `whatsapp_1`)." },
    },
    required: ["nodeId"],
  },
  handler: (args) => ({ ok: true, ui: true, focused: args.nodeId as string }),
};

export const canvasTools: SurfaceTool[] = [
  listCampaigns,
  proposeDraft,
  insertNode,
  connectNodes,
  updateNode,
  focusNode,
];
