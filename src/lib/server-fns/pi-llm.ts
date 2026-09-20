/**
 * Ask Pi LLM entry point — TrueFoundry (OpenAI-compatible) tool loop.
 *
 * Scopes:
 *   1. Analytics → read-only tools over D1's leads / runs / campaigns
 *      (count_leads, status_breakdown, worst_dropoffs, latest_runs,
 *      read_campaign). Answers real questions with real numbers; never
 *      writes.
 *   2. Builder  → analytics tools plus the campaign DAG mutations
 *      (insert_node, connect_nodes, update_node). Called from the in-canvas
 *      AiComposer on `/campaigns/$id`.
 *   3. Agents   → analytics tools plus agent mutations (list_agents,
 *      read_agent, save_agent, list_tools). Called from the global dock
 *      when the user is on `/agents`. Pi drafts / edits voice agents by
 *      natural language and the change survives refresh via D1.
 *
 * Server-only. Accessed via `askPi()` from the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { getEnv } from "@/lib/db/client";
import * as campaigns from "@/lib/db/campaigns";
import * as analytics from "@/lib/db/analytics";
import * as agentsDb from "@/lib/db/agents";
import type { AgentRecord } from "@/lib/agent-data";
import { assembleBuilderContext } from "@/lib/server-fns/builder-context";
import {
  ALL_SCREEN_TOOLS,
  executeScreenTool,
  screenToolsForSurface,
} from "@/lib/server-fns/pi-screen-tools";
import { BUILDER_ALLOWED_KINDS } from "@/lib/node-registry";
import {
  classifyBrief,
  findRelevantAssets,
  readAsset,
  suggestSkeleton,
  insertSkeleton,
  suggestNextStep,
  emitChoice,
  type AssetKind,
} from "@/lib/pi-skills";
import { INDUSTRIES, USECASES, type Industry, type Usecase } from "@/lib/pi-skills-catalog";

export type AskPiScope = "analytics" | "builder" | "agents";

export type AskPiRequest = {
  scope: AskPiScope;
  question: string;
  /** Analytics scope: current filter context (campaignId, runId, from/to). */
  context?: Record<string, unknown>;
  /** Optional conversation state (multi-turn). */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

/** Diagnostic returned on builder-scope replies. Surfaces catalog counts +
 *  per-list errors so devtools can see WHY a catalog was empty. Not read by
 *  the model. Will be removed once the empty-catalog root cause is closed. */
export type BuilderDiag = {
  hasDb: boolean;
  voiceAgents: number;
  waTemplates: number;
  freeformWorkflows: number;
  smsTemplates: number;
  rcsTemplates: number;
  tools: number;
  errors: {
    voiceAgentsErr?: string;
    waTemplatesErr?: string;
    freeformWorkflowsErr?: string;
    smsTemplatesErr?: string;
    rcsTemplatesErr?: string;
    toolsErr?: string;
  };
  assembleErr?: string;
};

export type AskPiResponse =
  | { ok: true; answer: string; toolCalls: ToolCallLog[]; diag?: BuilderDiag }
  | { ok: false; error: string };

type ToolCallLog = { name: string; args: string; result: string };

/**
 * Escape-hatch tool available in EVERY scope (builder, analytics, agents).
 * Pi calls it when the user is stuck at a dead-end that needs work on
 * another surface (no WhatsApp numbers connected → /channels/whatsapp,
 * no voice agents → /agents, etc.). The client renders it as a
 * prominent chat button that opens the href in a new tab so Pi's
 * context survives while the user unblocks.
 */
const SHARED_ESCAPE_TOOL = {
  type: "function",
  function: {
    name: "emit_action_link",
    description:
      "Render a prominent action button in the chat that opens a workspace route in a new tab. Use ONLY for dead-end situations where the user needs to leave the current surface to unblock (no WhatsApp numbers connected → /channels/whatsapp; no voice agents → /agents; no CSV in library → /campaigns; no API tool → /agents/tools; no template → /channels/whatsapp). Prefer this over a prose link — it stands out, opens in a new tab so the chat stays alive, and reads as a clear next step. NEVER use for optional navigation or informational deep links; use plain markdown links for those.",
    parameters: {
      type: "object",
      properties: {
        label: { type: "string", description: "Button label, under 40 chars, verb-first ('Connect a WhatsApp number', 'Create a voice agent')." },
        href: { type: "string", description: "In-app route starting with `/`. Never http(s). Examples: `/channels/whatsapp`, `/agents/new`, `/agents/tools/new`." },
        hint: { type: "string", description: "Optional one-line subtitle explaining what happens after. e.g. 'Opens in a new tab. Say resume when you're back.'" },
      },
      required: ["label", "href"],
    },
  },
} as const;

const TOOL_DEFS = {
  analytics: [
    {
      type: "function",
      function: {
        name: "count_leads",
        description: "Count leads matching a filter. Filter fields: runId, campaignId, status, channel, stageNodeId.",
        parameters: {
          type: "object",
          properties: {
            runId: { type: "string" },
            campaignId: { type: "string" },
            status: { type: "string" },
            channel: { type: "string", enum: ["whatsapp", "voice", "sms", "rcs"] },
            stageNodeId: { type: "string" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "status_breakdown",
        description: "Return leads grouped by status for a run, campaign, and/or channel. Returns [{status, count}].",
        parameters: {
          type: "object",
          properties: {
            runId: { type: "string" },
            campaignId: { type: "string" },
            channel: { type: "string", enum: ["whatsapp", "voice", "sms", "rcs"] },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "worst_dropoffs",
        description: "Return the nodes with the largest drop-off (entered → exited) for a run. Returns [{nodeId, entered, exited, dropPct}].",
        parameters: {
          type: "object",
          properties: {
            runId: { type: "string" },
            limit: { type: "number" },
          },
          required: ["runId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "latest_runs",
        description: "Return the most recent runs across all campaigns.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read_campaign",
        description: "Read a campaign's full DSL graph.",
        parameters: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
  ],
  builder: [
    // Builder scope inherits the analytics reads plus the mutation tools.
    {
      type: "function",
      function: {
        name: "list_campaigns",
        description: "Return every campaign in the workspace with id, name, vertical, status.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
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
      },
    },
    {
      type: "function",
      function: {
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
      },
    },
    {
      type: "function",
      function: {
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
      },
    },
    /* ------------------------------------------------------------------ */
    /* Skills (Pi's higher-level reasoning tools)                           */
    /* ------------------------------------------------------------------ */
    {
      type: "function",
      function: {
        name: "classify_brief",
        description:
          "Extract the structured shape of a user's natural-language marketing brief: industry (bfsi/retail/travel/edtech/healthtech/utilities/other), usecase (renewal/collection/cart_abandonment/order_confirmation/onboarding/cross_sell/broadcast_offer/feedback_nps/reactivation/activation/delivery_update/other), plus a `missing` array listing what the brief didn't say (audience, tone, timing). Call this on the FIRST turn of any new campaign brief. Deterministic keyword classifier — cheap, always call before proposing anything.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "The user's natural-language brief. Usually their first message." },
          },
          required: ["text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "suggest_skeleton",
        description:
          "Return the canonical skeleton DAG (node kinds + wiring, NO asset ids) for a given industry+usecase. Draws from the curated catalog. Use this the moment you know the industry+usecase — don't hand-roll a shape when a canonical one exists. Returns { ok, entry: { skeleton: { nodes, edges }, followUps } } or { ok:false, alternates }.",
        parameters: {
          type: "object",
          properties: {
            industry: { type: "string", enum: INDUSTRIES as unknown as string[] },
            usecase: { type: "string", enum: USECASES as unknown as string[] },
          },
          required: ["industry", "usecase"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "insert_skeleton",
        description:
          "Atomically install a skeleton onto the current campaign — batches all insert_node + connect_nodes calls into one server-side transaction and returns { nodeIds, edgeIds, openConfig }. Nodes are inserted WITHOUT asset config (skeleton-first). Use this AFTER the user has accepted the skeleton (`Draft this` on the plan card). Do NOT call insert_node individually when you're installing a full skeleton — this is the one-shot version. `openConfig` tells you which nodes still need a pick, feed that into your next chip question.",
        parameters: {
          type: "object",
          properties: {
            campaignId: { type: "string" },
            skeleton: {
              type: "object",
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      kind: { type: "string", enum: BUILDER_ALLOWED_KINDS },
                      title: { type: "string" },
                      subtitle: { type: "string" },
                      needs: { type: "array", items: { type: "string" } },
                    },
                    required: ["id", "kind", "title"],
                  },
                },
                edges: {
                  type: "array",
                  items: {
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
              },
              required: ["title", "summary", "nodes", "edges"],
            },
          },
          required: ["campaignId", "skeleton"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "find_relevant_assets",
        description:
          "Rank the workspace's existing assets (voiceAgent / waTemplate / smsTemplate / rcsTemplate / freeformWorkflow / tool) against an industry+usecase (and optional free-text query). Returns top 5 with a `reasons` array explaining why each row scored. Use this BEFORE presenting asset chips — instead of dumping the whole catalog, cite only the relevant few. Cheap, deterministic — always call it before `emit_choice` for an asset pick.",
        parameters: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["voiceAgent", "waTemplate", "smsTemplate", "rcsTemplate", "freeformWorkflow", "tool"] },
            industry: { type: "string", enum: INDUSTRIES as unknown as string[] },
            usecase: { type: "string", enum: USECASES as unknown as string[] },
            query: { type: "string", description: "Optional free-text hint from the user (e.g. 'renewal reminder for HNI segment')." },
            limit: { type: "number", description: "Default 5." },
          },
          required: ["kind"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read_asset",
        description:
          "Fetch the FULL internals of a single asset (voiceAgent → masterPrompt + KB + tools + postCall; waTemplate → body + buttons + variables; smsTemplate → body; rcsTemplate → cards; freeformWorkflow → steps; tool → spec). Use this when you need to compare candidate templates by content, not just by name — for example to explain to the user WHY one WA template fits the brief better than another. Do NOT dump the returned content back verbatim to the user; summarize.",
        parameters: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["voiceAgent", "waTemplate", "smsTemplate", "rcsTemplate", "freeformWorkflow", "tool"] },
            id: { type: "string" },
          },
          required: ["kind", "id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "suggest_next_step",
        description:
          "Return 2-4 next-best actions given the current DSL + classified brief. Prioritizes invalid nodes ('pick agent for voiceCall_1'), then skeleton follow-ups, then a review-and-save chip. Use this after `insert_skeleton` and after any batch of `update_node` calls — so the user always has clickable next actions instead of an open-ended 'what next?' prompt.",
        parameters: {
          type: "object",
          properties: {
            campaignId: { type: "string", description: "Campaign whose DSL + validity should drive the suggestions." },
            classifiedIndustry: { type: "string", enum: INDUSTRIES as unknown as string[] },
            classifiedUsecase: { type: "string", enum: USECASES as unknown as string[] },
          },
          required: ["campaignId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "emit_choice",
        description:
          "Present a chips card to the user. USE THIS INSTEAD of writing a ```pi-choice fenced JSON block in prose — the tool call is more reliable and the client always renders it as clickable chips. Emit whenever you'd ask a narrow-answer question (2-6 options). The server returns `{ ok, awaiting_user: true }` — Pi MUST stop calling tools after emit_choice and wait for the user's next turn.",
        parameters: {
          type: "object",
          properties: {
            key: { type: "string", description: "Stable snake_case id for this decision (voice_agent / wa_5d / delay_window)." },
            prompt: { type: "string", description: "One-sentence question that goes above the chips. Under 100 chars." },
            options: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Real asset id when picking an asset; short slug otherwise." },
                  label: { type: "string", description: "Human label under 60 chars." },
                  hint: { type: "string", description: "Optional subtitle under 60 chars." },
                },
                required: ["id", "label"],
              },
              minItems: 1,
            },
          },
          required: ["key", "prompt", "options"],
        },
      },
    },
    {
      type: "function",
      function: {
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
      },
    },
    {
      type: "function",
      function: {
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
      },
    },
  ],
  agents: [
    {
      type: "function",
      function: {
        name: "list_agents",
        description: "Return every voice agent in the workspace with id, name, status, tools[].",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "read_agent",
        description: "Fetch the full record for one agent by id — including masterPrompt, knowledgeBase, tools, postCall vars, evalPrompt.",
        parameters: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "save_agent",
        description:
          "Upsert an agent. Pass a full AgentRecord: { id, name, type: 'voice', status: 'live' | 'draft' | 'paused', tools: string[], masterPrompt: string, knowledgeBase: string, postCall: { id, name, prompt }[], evalPrompt?: string }. Merge on top of the existing record if you're editing — always call read_agent first, then send the merged object back.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            type: { type: "string", enum: ["voice"] },
            status: { type: "string", enum: ["live", "draft", "paused"] },
            tools: { type: "array", items: { type: "string" } },
            masterPrompt: { type: "string" },
            knowledgeBase: { type: "string" },
            postCall: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  prompt: { type: "string" },
                },
                required: ["id", "name", "prompt"],
              },
            },
            evalPrompt: { type: "string" },
          },
          required: ["id", "name", "type", "status", "tools", "masterPrompt", "knowledgeBase", "postCall"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_tools",
        description: "Return every tool handle the agents can use (policy_lookup, order_lookup, crm_query, place_call, …) with a one-line description. Use this before you propose a `tools` array on save_agent so you never invent a handle.",
        parameters: { type: "object", properties: {} },
      },
    },
  ],
} as const;

async function runTool(name: string, args: Record<string, unknown>, surfaceId?: string): Promise<unknown> {
  // Screen tools take priority — they're routed by surfaceId and most are
  // UI-only intents whose real work happens client-side (see
  // `pi-screen-tools.ts`). The one exception is `check_csv_fit`, which
  // reads CSV_LIBRARY + a campaign's Audience schema server-side.
  if (ALL_SCREEN_TOOLS.some((t) => t.function.name === name)) {
    return await executeScreenTool(name, args, surfaceId);
  }
  // D1 availability check — mutation tools no-op successfully when D1 isn't
  // bound (the client-side applyPiToolCallsToGraph still updates the canvas
  // from the tool_call args, so the user sees the graph change; only the
  // durability layer is skipped). Read tools return a clear error string so
  // Pi can adapt its next turn.
  const hasDb = (() => {
    try {
      return !!getEnv().DB;
    } catch {
      return false;
    }
  })();
  if (!hasDb) {
    switch (name) {
      case "propose_draft":
      case "emit_choice":
        // Client-only tools. Never need D1.
        return { ok: true, awaiting_user: true };
      case "focus_node":
        return { ok: true, ui: true, focused: args.nodeId as string };
      case "emit_action_link":
        return {
          ok: true,
          ui: true,
          action_link: {
            label: (args.label as string) ?? "",
            href: (args.href as string) ?? "",
            hint: (args.hint as string) ?? undefined,
          },
        };
      case "classify_brief":
      case "suggest_skeleton":
      case "suggest_next_step":
        // Pure fns — degrade gracefully without D1. Let them run in the
        // regular path below (they don't touch D1).
        break;
      case "insert_node":
      case "connect_nodes":
      case "update_node":
      case "insert_skeleton":
      case "save_agent":
        // Mutation tools: return ok so Pi's textual confirmation still fires
        // and the client applies the change to the live canvas. Include a
        // warning field so Pi can mention the "not saved to DB" caveat.
        return { ok: true, warning: "d1_unavailable — change applied to canvas but not persisted" };
      case "list_agents":
      case "read_agent":
      case "read_asset":
      case "find_relevant_assets":
      case "list_campaigns":
      case "read_campaign":
      case "list_tools":
      case "count_leads":
      case "status_breakdown":
      case "worst_dropoffs":
      case "latest_runs":
        return { error: "d1_unavailable — no database bound on this worker" };
    }
  }
  try {
    return await runToolInner(name, args);
  } catch (e) {
    return { error: `tool_failed: ${(e as Error).message}` };
  }
}

async function runToolInner(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "propose_draft":
      // Server-side no-op. The client picks up this tool call from `toolCalls`
      // and renders the Confirm-Draft card. Returning `{ ok: true, awaiting_user: true }`
      // is Pi's cue to STOP calling tools this turn and wait for the user's
      // Draft/Edit response on the next turn.
      return { ok: true, awaiting_user: true };
    case "count_leads":
      return { count: await analytics.countLeads(args as Parameters<typeof analytics.countLeads>[0]) };
    case "status_breakdown":
      return await analytics.statusBreakdown(args as Parameters<typeof analytics.statusBreakdown>[0]);
    case "worst_dropoffs":
      return await analytics.worstDropoffs(args.runId as string, (args.limit as number) ?? 5);
    case "latest_runs":
      return await analytics.latestRuns((args.limit as number) ?? 10);
    case "read_campaign":
      return await campaigns.readCampaign(args.id as string);
    case "list_campaigns":
      return await campaigns.listCampaigns();
    case "insert_node":
      await campaigns.insertNode(args.campaignId as string, args.node as campaigns.DslNode);
      return { ok: true };
    case "connect_nodes":
      await campaigns.connectNodes(args.campaignId as string, args.edge as campaigns.DslEdge);
      return { ok: true };
    case "update_node":
      await campaigns.updateNode(args.campaignId as string, args.nodeId as string, args.patch as never);
      return { ok: true };
    case "list_agents": {
      const map = await agentsDb.listAgents();
      // Trim payload — Pi doesn't need the full masterPrompt on a list call.
      return Object.values(map).map((a) => ({
        id: a.id, name: a.name, status: a.status, tools: a.tools,
      }));
    }
    case "read_agent":
      return (await agentsDb.readAgent(args.id as string)) ?? { error: "agent_not_found" };
    case "save_agent": {
      const rec = args as unknown as AgentRecord;
      if (!rec?.id || !rec?.name) return { error: "save_agent: id and name are required" };
      // Backfill safe defaults for any field the LLM omitted.
      const full: AgentRecord = {
        id: rec.id,
        name: rec.name,
        type: rec.type ?? "voice",
        status: rec.status ?? "draft",
        tools: rec.tools ?? [],
        masterPrompt: rec.masterPrompt ?? "",
        knowledgeBase: rec.knowledgeBase ?? "",
        postCall: rec.postCall ?? [],
        ...(rec.evalPrompt ? { evalPrompt: rec.evalPrompt } : {}),
      };
      await agentsDb.upsertAgent(full);
      return { ok: true, id: full.id };
    }
    case "list_tools": {
      // Read the tools registry from D1 so Pi sees the same list the workspace has.
      const rows = await getEnv().DB
        .prepare("SELECT handle, description FROM tools ORDER BY handle")
        .all<{ handle: string; description: string }>();
      return rows.results ?? [];
    }
    /* --- Skills ------------------------------------------------------- */
    case "classify_brief":
      return classifyBrief(String(args.text ?? ""));
    case "suggest_skeleton":
      return suggestSkeleton(
        args.industry as Parameters<typeof suggestSkeleton>[0],
        args.usecase as Parameters<typeof suggestSkeleton>[1],
      );
    case "insert_skeleton":
      return await insertSkeleton(
        args.campaignId as string,
        args.skeleton as Parameters<typeof insertSkeleton>[1],
      );
    case "find_relevant_assets":
      return await findRelevantAssets(
        args.kind as AssetKind,
        args.industry as Parameters<typeof findRelevantAssets>[1],
        args.usecase as Parameters<typeof findRelevantAssets>[2],
        args.query as string | undefined,
        (args.limit as number) ?? 5,
      );
    case "read_asset":
      return await readAsset(args.kind as AssetKind, args.id as string);
    case "suggest_next_step": {
      // Pull the freshest DSL + validity for the current campaign so the
      // suggestions reflect the real state, not stale client context.
      const ctx = await assembleBuilderContext(args.campaignId as string | undefined);
      const classified = args.classifiedIndustry && args.classifiedUsecase
        ? { industry: args.classifiedIndustry as Industry, usecase: args.classifiedUsecase as Usecase }
        : undefined;
      return suggestNextStep(ctx.dsl, ctx.validity, classified);
    }
    case "emit_choice":
      return emitChoice(args as Parameters<typeof emitChoice>[0]);
    case "focus_node":
      // Pure UI intent — the client picks it up from `toolCalls` and
      // selects the node + centers the viewport. Server no-op.
      return { ok: true, ui: true, focused: args.nodeId as string };
    case "emit_action_link":
      // Pure UI intent — the client renders an action button in the chat
      // that opens `href` in a new tab. Server no-op; validate shape.
      return {
        ok: true,
        ui: true,
        action_link: {
          label: (args.label as string) ?? "",
          href: (args.href as string) ?? "",
          hint: (args.hint as string) ?? undefined,
        },
      };
    default:
      return { error: `unknown tool: ${name}` };
  }
}

const SYSTEM_ANALYTICS = `You are Pi, the analytics copilot for a marketing automation platform. Answer the user's question using the analytics tools available to you. Never make up numbers — always call a tool. Reply in plain, direct language. Include the exact numbers you observed. If the tools can't answer the question, say so briefly.`;

/**
 * Per-surface addendum appended to SYSTEM_ANALYTICS when the client has
 * published a surfaceId that exposes screen tools (list filters, run
 * actions, "open the create-broadcast modal", CSV fitness check).
 *
 * The goal is Pi calls the tool INSTEAD of writing a paragraph. e.g. on
 * the Runs tab, "pause the soundbox run" should dispatch `run_action`
 * with the resolved run id — not just say "You can pause it from the row
 * menu."
 */
function buildScreenToolsSystemAddendum(surfaceId: string): string {
  const surfaceRules: Record<string, string> = {
    "campaigns.workflows": `

## You are on the Campaigns list (Workflows tab)

You can directly manipulate the list. When the user asks to narrow, sort, or search:
- 'show me only drafts' / 'hide the drafts' → call \`list_filter_status\` with the matching status. Use \`all\` to clear.
- 'find <keyword>' / 'search for insurance' / 'campaigns about renewals' → call \`list_search\` with the substring.
- 'sort by name' / 'oldest first' / 'newest edits on top' → call \`list_sort\` with the field.
Call the tool; do NOT describe what the user could do manually. Explicit ask beats implicit ask — if the request is ambiguous, ask one clarifier, then act.`,

    "campaigns.runs": `

## You are on the Runs tab

You can directly manipulate the runs list AND take row actions:
- Filter by status / run type → \`runs_filter\`. Only one of \`status\` / \`run_type\` is required per call.
- Search by run id or campaign name → \`runs_search\`.
- Pause / resume / terminate a specific run → \`run_action\`. NEVER guess the run id. If the user names a campaign but not the run id, first read \`latest_runs\` or ask which run row (there can be several per campaign) before acting.
Destructive actions (\`terminate\`) — say the run id + action back in one sentence so the user has a clear undo target.`,

    "campaigns.data": `

## You are on the Data tab (CSV library)

Your job here is fitness checks between a CSV in the library and a campaign's Audience schema. When the user asks 'can this file run <campaign>?' or 'what's missing from the <name> file for <campaign>?':
- Call \`check_csv_fit\` with what the user named (csv_name substring + campaign_name substring).
- Read the returned diff. Reply with: fits (yes/no), missing required fields (list them), phone-field status. Do NOT dump the whole raw payload. Two sentences max.
- If csv_name or campaign_name is missing from the user's ask, call the tool with just the one they named — the response carries the list of candidates for the missing side; pick or ask.`,

    "broadcasts.list": `

## You are on the Broadcasts surface

Your one job here is opening the "Create broadcast" modal with the channel (and template, if they named one) prefilled. When the user says 'I want to send a WhatsApp broadcast' or 'send an SMS to gold tier':
- Call \`open_new_broadcast\` with the channel they named. If they named a specific template you can see in \`assets.waTemplates\` / \`assets.smsTemplates\` / \`assets.rcsTemplates\`, include \`template_id\`; otherwise leave it off.
- Broadcasts execute immediately (no schedule window in v1). If the user mentioned a date, acknowledge you noted it but the modal fires the send when they submit.
- Once the modal is open, YOU DO NOT continue. Say one short line ("Opened the create modal, WhatsApp preselected") and stop. The user completes the send from the modal.`,
  };
  return surfaceRules[surfaceId] ?? "";
}

const SYSTEM_BUILDER = `You are Pi (Paytm Intelligence), the campaign workflow builder for a marketing automation platform. In chat replies speak in the first person naturally ("I'll wire the Voice Call after the WhatsApp timeout branch", "let me know which agent", "I found these agents"). Do NOT refer to yourself as "Pi" in the third person inside chat replies — that reads stilted. The word "Pi" only appears in the standalone loading / thinking states, which are handled by the UI, not by you. English only.

## Non-negotiables

- Read the injected \`Current context\` block on every turn. It carries the current campaign, the live DSL, the canonical construct rules, the allowed node kinds, and the real workspace assets. Never invent an id or a kind that isn't in that block.
- Follow the canonical construct rules verbatim. They cover: blank-canvas invariants (Start, Audience, End pre-exist and are locked), single-End convergence, LEFT-to-RIGHT layout, bezier edges, allowed kinds, WhatsApp Freeform placement, real-asset wiring, and the confirm-before-build flow.
- Before ANY \`insert_node\` call, call \`propose_draft\` first. The client renders that plan as a Confirm-Draft card; the user hits Draft this to accept. Skipping \`propose_draft\` is a violation.

## Three-phase flow (hard structure)

Pi works in THREE clean phases. Do NOT mix phases. Do NOT jump ahead. Each user brief starts at Phase 1.

### Phase 1 — Skeleton (mandatory, always)

Build the DAG shape only. Zero asset picks. Zero variable mappings. Zero conditions. Just: what nodes, in what order, wired how.

Steps:
0. \`classify_brief\` on the user's opening text → { industry, usecase, missing[] }.
1. If \`missing\` includes industry or usecase, ask ONE clarifier via \`emit_choice\`. Cap: 2 clarifiers before proposing.
2. \`suggest_skeleton(industry, usecase)\` — get the canonical DAG.
3. \`propose_draft\` with EMPTY assetIds per channel (skeleton only). openQuestions empty.
4. User hits Draft this → \`insert_skeleton(campaignId, skeleton)\` — one atomic call.
5. Reply with a ONE-line confirmation ("Done. The 2-branch renewal skeleton is on the canvas.") and ask ONE thing: "Want me to help fill in the config, or take it from here?" via \`emit_choice\` with two chips: "Help me configure" / "I'll do it myself".

Phase 1 ends here. If the user picks "I'll do it myself", stop. Do NOT auto-start Phase 2.

### Phase 2 — Config assist (optional, only if user opts in)

If the user picked "Help me configure" or explicitly asks for help with a specific node, Pi walks nodes ONE AT A TIME. Feel like a checklist, not a monologue.

For each config walk-through:
1. \`suggest_next_step\` — get the ordered list of nodes needing config.
2. **First**, call \`focus_node(nodeId)\` for the node you're about to work on. This selects it on the canvas and opens its config panel for the user. Do this BEFORE saying anything about the node.
3. Announce it in ONE crisp line, including a progress ticker: "**2 of 5 · \`voiceCall_1\`** (Voice Call) needs a voice agent."
4. **Auto-apply obvious defaults, then report.** Don't ask about no-brainers:
   - A/B Split with no variants set → \`update_node\` with 50/50 (\`{ splitVariants: [{ id: "vA", label: "A", pct: 50 }, { id: "vB", label: "B", pct: 50 }] }\`), then say "Set A/B to 50/50. Continue?" via emit_choice.
   - Delay in fixed mode with no duration → \`update_node\` with 24 hours, then say "Set delay to 24h. Continue?".
   - Conditional with default seed branches (\`bA\`/\`bB\` still empty) → propose defaults matching the campaign brief, then ask "keep as-is or change?" via emit_choice.
5. For real decisions (asset picks): \`find_relevant_assets(kind, industry, usecase)\` first, then \`emit_choice\` with the 3-5 shortlisted options — ALWAYS include a "Skip this one" chip so the user can defer.
6. User picks → \`update_node\` with the full valid config for THAT kind (see Config shape spec below).
7. After a node lands valid, immediately \`focus_node\` the next needed one and repeat. Include the ticker.
8. When there's nothing left needing config, stop. Say "All nodes configured. Ready to publish." One line.

Phase 2 rules:
- ONE node per turn. ONE ask per turn.
- Skip node = the user's choice. When they say "skip", "leave it", "I'll do this later" — move to the next needed node without editing this one.
- Dead-ends (no asset available) — say ONE crisp line naming the gap ("No WhatsApp numbers connected."), then call \`emit_action_link\` with a verb-first label and the deep-link href (label: "Connect a WhatsApp number", href: "/channels/whatsapp", hint: "Opens in a new tab. Say 'resume' when you're back."), then STOP. Do not repeat the same dead-end on later turns; assume the user is working on it.

Phase 2 is opt-in per node. Never auto-run through all nodes.

### Phase 3 — Ongoing edits

After Phases 1+2, the user drives. They can ask to add a branch, delete a node, change an asset, re-wire an edge. Handle each request as it comes, one thing at a time. No auto-continuation.

### Rules that override the above

- Skeleton is NEVER a config gate. If the user says "just build the flow", install and stop.
- Chips first, always. Any bounded-answer question goes through \`emit_choice\`. Never a fenced \`pi-choice\` block in prose when the tool is available.
- Before ANY asset-pick chip, call \`find_relevant_assets\` — don't list the entire catalog, show the top 3-5.
- \`read_asset\` when the user asks "what does this template say?" — summarize, don't dump.
- \`suggest_next_step\` before every Phase 2 sub-turn.

## What Pi asks about

Pi asks minimum viable questions. Don't ask what the context already tells you. Skip anything the user has already said. The typical dimensions:

- **Audience segmentation** — does the flow branch by lead attributes (renewal window, cart value, tier)? Reference Audience fields already present in the DSL when possible.
- **Channels per branch** — which of the allowed kinds (WhatsApp Template, Voice Call, SMS, RCS) to use on each branch.
- **Real asset ids** — which specific voice agent / WA template / SMS template to wire.
- **Follow-up branches** — for each channel, does the user want a downstream action on its non-default output? (e.g. Voice Call after a WhatsApp Template's \`timeout\` branch.)

## Node validity (READ this every turn before making claims)

The injected \`validity\` array carries one entry per node in the current DSL. It is the SAME truth the user sees on the canvas — it covers config fields (voice agent picked, WA template picked), kind-specific checks (A/B traffic totals 100%, phone field is String, delay dynamic-mode has a fallback, freeform variables mapped), AND wiring (every WhatsApp branchable button has an outgoing edge). If \`valid: false\`, the \`error\` string is the concrete one-liner shown on the node ("Traffic must total 100% (currently 0%)", "Button 'See benefits' isn't connected", "Phone field must be a String type", "Map variable {{name}}", etc.).

**Hard rule: never claim the flow is "ready", "configured", "complete", or "valid" unless EVERY entry in \`validity\` has \`valid: true\`.**

When the user asks "is this ready?" / "can I save?" / "what's left?" / "what's the configuration left?":
- Count the entries where \`valid: false\`. If 0 → say "All nodes are configured and valid."
- If > 0 → list each one by nodeId + kind + error. Format: "\`voiceCall_1\` (Voice Call): Missing a voice agent." One per line. No hedging. No summary that contradicts the list.

Never say "fully configured" while any entry in validity has valid:false. That is a lying-to-the-user violation. Read the array before you speak.

## Never invent platform state

Never say things like "temporary database issue", "system will recover shortly", "connection issue", or any variant of that — you have no way to know that and it makes the user distrust the assistant. If the injected context has an empty catalog, treat it as authoritative: the catalog is empty. Say so directly, offer the deep link. Do not apologize on behalf of the platform.

## Asset-picking rules (hard)

Pi already sees the full workspace asset catalog in the injected context (\`assets.voiceAgents\`, \`assets.waTemplates\`, \`assets.smsTemplates\`, \`assets.rcsTemplates\`, \`assets.tools\`). When I need an asset pick, follow these rules exactly:

1. **Cite specific assets by name.** When asking "which voice agent", surface the actual available agents by name as options (using the fenced options block). Never ask an open-ended "which agent" question when a catalog exists — that's lazy.
2. **Never ask "do you have these assets".** Pi already knows. Don't hedge, don't preface with "if you don't have these yet, you can create them at...". Just present the picks.
3. **If the catalog is EMPTY for the kind I need (voiceAgents is [], waTemplates is [], etc.), and only then**, tell the user and offer the deep link — one line, no drama. Example reply text: "No voice agents in the workspace yet. Create one at [Agents](/agents) and I'll pick it up on the next turn."
4. **Never ask about asset content or authoring.** "How should the voice sound?", "What should the WhatsApp template say?", "Which agent should Pi build?" are all wrong — those decisions live inside the asset itself, in different surfaces.

Deep links to other surfaces (only when a catalog is empty): use inline Markdown link form \`[label](/path)\`. Valid targets: \`/agents\` (voice agents + API tools), \`/channels\` (WA / SMS / RCS templates).

## What Pi CAN change on this surface (all via \`update_node\`)

Everything that lives as **node config on the current campaign** is Pi's job here. But the config must match the exact expected shape per kind — invalid shapes leave the node red on canvas even when Pi thinks it "picked something".

### Audience (\`audience\`)

\`\`\`
{
  fields: [{ id: "f1", name: "phone", type: "String" }, { id: "f2", name: "renewal_date", type: "String" }, ...],
  phoneField: "phone",     // must reference a field with type: "String"
  primaryKey: "customer_id" // optional
}
\`\`\`

**Field \`type\` is exactly one of: \`"String"\` | \`"Number"\` | \`"Boolean"\`. Nothing else.** Not "phone", not "date", not "email". Phones and dates are STORED as String. Booleans for yes/no flags. Numbers for cart value, tier score.

The field marked as \`phoneField\` MUST have \`type: "String"\` or the node stays invalid.

### Conditional (\`conditional\`)

Every branch needs at least one CONDITION, not just a label.

\`\`\`
{
  branches: [
    {
      id: "branch_5day",
      label: "Renewal in 5 days",
      logic: "AND",
      conditions: [{ variable: "contact.renewal_date", op: "days_from_now_eq", value: "5" }]
    },
    {
      id: "branch_30day",
      label: "Renewal in 30 days",
      logic: "AND",
      conditions: [{ variable: "contact.renewal_date", op: "days_from_now_eq", value: "30" }]
    }
  ]
}
\`\`\`

The \`variable\` MUST be a real key: an Audience field prefixed \`contact.<field>\` OR an upstream node's output variable (\`voiceCall_1.call_status\`, \`whatsapp_1.button\`, etc.). A default \`else\` branch is always present, you don't create it.

Never leave \`conditions: []\`. If you don't have enough info to write a real condition, ASK the user which variable to route on before calling update_node.

### A/B Split (\`abSplit\`)

Every variant needs BOTH a label AND a numeric \`pct\`. Percentages MUST sum to 100.

\`\`\`
{
  splitVariants: [
    { id: "variant_a", label: "Renewal link v1", pct: 80 },
    { id: "variant_b", label: "Renewal savings v1", pct: 20 }
  ]
}
\`\`\`

If the user says "80/20", set pct: 80 and pct: 20. Never leave pct empty. Never leave the sum at 0.

### WhatsApp Template (\`whatsapp\`)

Needs BOTH a template pick AND a connected WhatsApp number.

\`\`\`
{
  waMode: "template",
  waTemplate: "<template_id from assets.waTemplates>",
  waNumber: "<connected wa number id — pick from what's configured on the workspace>",
  waTimeoutHours: 24,
  waVarMap: [{ v: "1", def: "contact.first_name" }, ...]  // one per {{n}} in the template body
}
\`\`\`

If the workspace has no connected numbers, tell the user and deep-link to \`/channels/whatsapp\` (Numbers tab). Do NOT set waTemplate alone — the node stays invalid without waNumber.

### WhatsApp Freeform (\`whatsappFreeform\`)

\`\`\`
{
  ffWorkflowId: "<id from assets.freeformWorkflows>",
  ffTimerMode: "absolute" | "inactivity",
  ffTimerMinutes: 60  // capped at 1440 (Meta's 24h freeform window)
}
\`\`\`

### Voice Call (\`voiceCall\`)

\`\`\`
{
  agent: "<agent id from assets.voiceAgents>",
  callStart: "09:00",
  callEnd: "20:00",
  timezone: "Asia/Kolkata",
  maxAttempts: 3,
  retryInterval: "2h",
  voiceVarMap: [{ v: "name", def: "contact.first_name" }, ...]
}
\`\`\`

### SMS (\`sms\`)

\`\`\`
{
  smsTemplateId: "<id from assets.smsTemplates>",
  smsDlrWindow: "24h",
  smsVarMap: [{ v: "name", def: "contact.first_name" }, ...]
}
\`\`\`

### RCS (\`rcs\`)

\`\`\`
{
  rcsTemplateId: "<id from assets.rcsTemplates>",
  rcsDlrWindow: "24h",
  rcsVarMap: [{ v: "name", def: "contact.first_name" }, ...]
}
\`\`\`

### Delay (\`delay\`)

\`\`\`
// Static delay:
{ delayMode: "fixed", delayValue: 24, delayUnit: "Hours" }

// Dynamic delay (waits until a datetime from an upstream var):
{ delayMode: "variable", delayVariable: "voiceCall_1.callback_time", delayVariableFormat: "ISO 8601", delayFallbackValue: 2, delayFallbackUnit: "Hours" }
\`\`\`

### API Tool Call (\`apiToolCall\`)

\`\`\`
{
  apiTool: "<handle from assets.tools>",
  apiInputMap: [{ v: "customer_id", def: "contact.customer_id" }, ...]  // one per required tool input
}
\`\`\`

Pi never says "that's on another surface" for any of the above. They are all node config on THIS canvas.

## What Pi CANNOT do on this surface (deep-link only)

Pi CANNOT author or edit the underlying **assets** themselves. That means the internals of an asset — the voice agent's master prompt / tools / KB / eval; the WA template's body / buttons; the SMS template body; the RCS card content; the API tool's URL / auth. Those decisions live in dedicated surfaces:

- Voice agent internals: \`/agents\`
- WA / SMS / RCS template internals: \`/channels\`
- API tool internals: \`/agents/tools\`

If the user asks Pi to do one of those on this surface, give a one-line deep link and stop. But asking Pi to WIRE an existing agent / template into a node is normal builder work, not a handoff.

## Off-topic (nothing to do with campaigns)

If the user's ask is completely unrelated (dashboard summary, help with billing, etc.), decline politely in one line, no link.

## One question per turn (hard rule)

Every reply asks EXACTLY ONE thing. Not two. Not "and also". Not "let me know both". If multiple pieces of info are still missing, pick the most important one and ask ONLY that; the next turn asks the next.

WRONG (these are violations you have committed in past sessions):
- "I need two quick details before drafting: 1. How long should the delay wait? 2. Which template should be sent?"
- "Great! Now which voice agent should I use? Also which WA template for the 30-day branch?"
- "Which agent do you want to use? And should the delay be 24h or 1h?"

RIGHT:
- "Which voice agent should I use for the 5-day branch?" (single question, pi-choice below)

Rules:
- Do NOT list "here's what I need" followed by multiple bullets ending in question marks.
- Do NOT ask a question and then tack on "also" / "one more thing" / "quick side question".
- Numbered lists in the prose are ONLY allowed for context/summary lines (never for stacked questions).
- If the question has narrow answers, emit ONE \`pi-choice\` block for THAT question. Do not emit a second \`pi-choice\` (the client drops all but the first, and it looks broken).

## Build exactly what the user asked for (no over-engineering)

Every node you insert must be tied to something the user explicitly asked for. Do NOT add:
- A Delay node the user didn't mention.
- An API Tool Call unless the user said "check X status" or similar.
- A fallback branch unless the user said "if X fails, do Y".
- A "confirmation" or "already renewed" branch unless the user asked for it.
- An A/B split unless the user said "test", "compare", or "split by percentage".

If the user's brief was "voice call for 5-day, WhatsApp for 30-day", build exactly two branches with those two nodes. Do NOT add a delay + API check + WhatsApp-if-renewed + Voice-if-not sub-branch. That's over-engineering. Ask if they want extras, don't invent them.

When in doubt, build the minimum, then offer follow-up additions in the NEXT turn ("Want me to add a WhatsApp follow-up if the voice call fails?").

## No AI fluff (hard rule)

- NEVER use em-dashes (—) or en-dashes (–). Use plain hyphens (-), commas, or new sentences.
- No "let me know", "just to confirm", "quick question" preambles.
- Don't apologize on behalf of the platform.
- Don't preface with "great!" / "perfect!" / "got it!" every turn. One brief confirmation is fine when useful, not a habit.

## Quick-pick options format (\`pi-choice\`)

When a question has 2-5 discrete answers, offer them in a fenced \`pi-choice\` JSON block so the client renders them as a clean numbered card with an optional hint per option. Format:

\`\`\`pi-choice
{
  "type": "single",
  "key": "voice_agent",
  "options": [
    { "id": "obd_volt_money_poc", "label": "Volt Money POC (Agent 1)", "hint": "BFSI · warm tone · English" },
    { "id": "obd_renewal_v2", "label": "Renewal v2 (Agent 4)", "hint": "BFSI · firm tone · English" }
  ]
}
\`\`\`

Rules:
- \`type\` is \`single\` for now (multi / select / duration / date land later — do not use them yet).
- \`key\` is a stable snake_case identifier for the decision. Optional but recommended.
- Every option has an \`id\` (a real asset id from the injected \`assets\` catalog when the question is asset-picking; else a short stable slug) and a \`label\` (human, under 60 chars). \`hint\` is optional short subtitle (under 60 chars).
- Only use \`pi-choice\` when the choice is truly narrow (2-5 concrete answers). Free-form questions (a duration, a count, a prompt body) stay as plain text - user types.

**ASSET PICKS MUST ALWAYS USE pi-choice.** If you're asking the user to pick a voice agent, WhatsApp template, SMS template, RCS template, freeform workflow, or API tool, and the catalog has options, you MUST emit a \`pi-choice\` block with those options as clickable rows. NEVER list the catalog as a numbered plain-text list in prose ("1. renewal_link_v1 (Utility)  2. renewal_savings_v1 (Marketing)  …"). That renders as unclickable text and looks broken.

Legacy fallback (only if the assistant cannot form valid JSON): a plain \`\`\`options fence with one label per line. Every new turn should use \`pi-choice\`.

## Markdown Pi CAN emit in prose

Bold (\`**text**\`), italic (\`*text*\`), inline code (\`\`code\`\`), bulleted lists (\`- item\`), numbered lists (\`1. item\`), and inline links (\`[label](/path)\`). Do NOT use headers, code fences, tables, images, or blockquotes — the chat bubble is not a document.

## Node ids and titles

- Node ids follow \`<kind>_<n>\` (matches the workspace SERIAL_PREFIX convention): \`whatsapp_1\`, \`voiceCall_1\`, \`conditional_1\`, \`delay_1\`, \`sms_1\`, \`rcs_1\`, \`apiToolCall_1\`.
- The three blank-canvas nodes are already named \`start\`, \`audience\`, \`end\` — reference those exact ids when wiring.
- Titles are human ("Renew in 5 days? branch", "WhatsApp: renewal reminder", "Voice fallback if no reply"). Kept short.
- \`subtitle\` is optional and short — a concrete detail ("Renewal in 5 days" / "Meera agent" / "Retry after 24h").
- \`config\` follows the registry's \`requires\` list. For asset-picking kinds (\`whatsapp\`, \`voiceCall\`, \`sms\`, \`rcs\`, \`apiToolCall\`, \`whatsappFreeform\`), the required id/handle field must be a real id from the injected \`assets\` catalog.`;

const SYSTEM_AGENTS = `You are Pi, the voice-agent copilot for a marketing automation platform. When the user asks you to draft, edit, tune, or wire up a voice agent, use the agent tools:
  - Always call list_agents first if the user's request is ambiguous about which agent, and confirm the target.
  - Before proposing an edit, call read_agent to load the current record.
  - Before proposing which tools an agent should carry, call list_tools so you use real handles (never invent).
  - Apply changes with save_agent, passing the FULL merged record (id, name, type='voice', status, tools[], masterPrompt, knowledgeBase, postCall[], evalPrompt?). Merge your patch on top of what read_agent returned — do NOT drop existing fields.
Confirm each change in one line ("Updated <name>: <what changed>"). Keep master prompts natural (English AND Devanagari variants for every quoted line — never Latin-transliterated Hindi like 'namaste, kaise ho'). Only reference tool handles the list_tools call returned.`;

/**
 * Live Ask Pi call. Multi-turn tool loop.
 *
 * Two transport paths, picked at runtime:
 *   - Anthropic native (`api.anthropic.com/v1/messages`) — public network,
 *     reachable from Cloudflare Workers, current prod path. Used whenever
 *     `env.ANTHROPIC_API_KEY` is set.
 *   - TrueFoundry OpenAI-compat (`llm.tfy.pi.mypaytm.com/openai/v1`) —
 *     Paytm-internal, only reachable when the origin is on the corporate
 *     network. Used as fallback for local dev on Paytm VPN when the
 *     Anthropic key isn't configured.
 *
 * Caps at 8 tool-call rounds — enough for a full campaign build (7-14
 * tool calls in the insurance-renewal example), but small enough that a
 * runaway loop can't burn budget.
 */
export const askPi = createServerFn({ method: "POST" })
  .inputValidator((r: AskPiRequest) => r)
  .handler(async ({ data }): Promise<AskPiResponse> => {
    let env;
    try {
      env = getEnv();
    } catch (e) {
      return { ok: false, error: `runtime_env_missing: ${(e as Error).message}` };
    }

    // Analytics-scope surfaces (`/campaigns`, `/broadcasts`, `/campaigns/$id`
    // list-context, etc.) can each expose a handful of UI-mutation tools that
    // manipulate the page the user is currently on (set a filter, open a
    // modal). The client passes `surfaceId` on `context`; the server merges
    // only the tools that map to that surface into the analytics tool set,
    // and adds a system-prompt addendum so Pi knows they're callable and
    // when to use each. Builder / Agents scopes intentionally get no screen
    // tools — those surfaces have their own tool grammars.
    const surfaceId = typeof data.context?.surfaceId === "string"
      ? (data.context.surfaceId as string)
      : undefined;

    const screenTools = data.scope === "analytics" ? screenToolsForSurface(surfaceId) : [];
    const screenAddendum = screenTools.length ? buildScreenToolsSystemAddendum(surfaceId!) : "";

    const systemContent =
      data.scope === "builder" ? SYSTEM_BUILDER
      : data.scope === "agents" ? SYSTEM_AGENTS
      : SYSTEM_ANALYTICS + screenAddendum;
    const scopeTools =
      data.scope === "builder" ? [...TOOL_DEFS.analytics, ...TOOL_DEFS.builder, SHARED_ESCAPE_TOOL]
      : data.scope === "agents"  ? [...TOOL_DEFS.analytics, ...TOOL_DEFS.agents, SHARED_ESCAPE_TOOL]
      : [...TOOL_DEFS.analytics, ...screenTools, SHARED_ESCAPE_TOOL];

    // Builder scope: enrich context with the current DSL, canonical construct
    // rules, node registry, and asset catalogs so Pi reads real state on EVERY
    // turn. Falls back to the client-supplied context if the assembler fails.
    let enrichedContext: Record<string, unknown> | undefined = data.context;
    let builderDiag: BuilderDiag | undefined;
    if (data.scope === "builder") {
      try {
        const campaignId = typeof data.context?.campaignId === "string"
          ? (data.context.campaignId as string)
          : undefined;
        const builderCtx = await assembleBuilderContext(campaignId);
        enrichedContext = { ...(data.context ?? {}), ...builderCtx };
        // Temporary diagnostic — surfaced back on the response so the client
        // console shows why a catalog might be empty. Not read by Pi.
        builderDiag = {
          hasDb: builderCtx._diag.hasDb,
          voiceAgents: builderCtx.assets.voiceAgents.length,
          waTemplates: builderCtx.assets.waTemplates.length,
          freeformWorkflows: builderCtx.assets.freeformWorkflows.length,
          smsTemplates: builderCtx.assets.smsTemplates.length,
          rcsTemplates: builderCtx.assets.rcsTemplates.length,
          tools: builderCtx.assets.tools.length,
          errors: {
            voiceAgentsErr: builderCtx._diag.voiceAgentsErr,
            waTemplatesErr: builderCtx._diag.waTemplatesErr,
            freeformWorkflowsErr: builderCtx._diag.freeformWorkflowsErr,
            smsTemplatesErr: builderCtx._diag.smsTemplatesErr,
            rcsTemplatesErr: builderCtx._diag.rcsTemplatesErr,
            toolsErr: builderCtx._diag.toolsErr,
          },
        };
      } catch (e) {
        /* keep client-supplied context — better than nothing */
        builderDiag = {
          hasDb: false,
          voiceAgents: 0,
          waTemplates: 0,
          freeformWorkflows: 0,
          smsTemplates: 0,
          rcsTemplates: 0,
          tools: 0,
          errors: {},
          assembleErr: (e as Error).message,
        };
      }
    }

    // Prefer Anthropic direct. If missing, fall back to the OpenAI-compat
    // TrueFoundry gateway. If neither, ok:false with a clear message.
    if (env.ANTHROPIC_API_KEY) {
      const r = await runAnthropicLoop({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        workspaceId: env.ANTHROPIC_WORKSPACE_ID,
        systemContent,
        tools: scopeTools,
        question: data.question,
        history: data.history,
        context: enrichedContext,
        thinkingBudget: env.ANTHROPIC_THINKING_BUDGET ? Number(env.ANTHROPIC_THINKING_BUDGET) : undefined,
        surfaceId,
      });
      // Attach the builder diagnostic to a successful response so the client
      // console can show which catalogs were empty and why. Non-invasive.
      if (r.ok && builderDiag) return { ...r, diag: builderDiag };
      return r;
    }

    const tfyKey = env.PI_AGENT_API_KEY || env.TFY_API_KEY;
    const tfyBase = env.PI_AGENT_BASE_URL || env.TFY_BASE_URL;
    if (!tfyKey || !tfyBase) {
      return { ok: false, error: "LLM gateway not configured — set ANTHROPIC_API_KEY (preferred) or PI_AGENT_API_KEY + PI_AGENT_BASE_URL in .env / wrangler secrets" };
    }
    const r = await runTfyLoop({
      apiKey: tfyKey,
      baseUrl: tfyBase,
      model: env.PI_AGENT_MODEL || env.TFY_MODEL || "pi-agentic/global.anthropic.claude-sonnet-4-6",
      systemContent,
      tools: scopeTools,
      question: data.question,
      history: data.history,
      context: enrichedContext,
      surfaceId,
    });
    if (r.ok && builderDiag) return { ...r, diag: builderDiag };
    return r;
  });

/* -------------------------------------------------------------------------- */
/* Anthropic native tool loop                                                  */
/* -------------------------------------------------------------------------- */

type LoopInput = {
  apiKey: string;
  model: string;
  systemContent: string;
  tools: ReadonlyArray<{ type: "function"; function: { name: string; description: string; parameters: unknown } }>;
  question: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  context?: Record<string, unknown>;
  /** Extended thinking budget in tokens (Anthropic path only). */
  thinkingBudget?: number;
  /** Current UI surface (e.g. `campaigns.runs`) — routes screen-tool exec. */
  surfaceId?: string;
};

/**
 * Anthropic /v1/messages tool loop. Their shape:
 *   - `system` is a top-level string (not a message role)
 *   - tools flatten to { name, description, input_schema }
 *   - response content is an array of blocks: { type:"text",text } and
 *     { type:"tool_use", id, name, input }
 *   - tool results go back as user-message content: { type:"tool_result",
 *     tool_use_id, content: string }
 */
async function runAnthropicLoop(
  input: LoopInput & { workspaceId?: string },
): Promise<AskPiResponse> {
  // Convert our OpenAI-shape tool defs to Anthropic's shape.
  const anthropicTools = input.tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  // Anthropic messages: user/assistant only. `system` moves out. We fold the
  // context hint into the system string so it survives every turn.
  const systemFull = input.context && Object.keys(input.context).length > 0
    ? `${input.systemContent}\n\n## Current context\n${JSON.stringify(input.context, null, 2)}`
    : input.systemContent;

  type AnthropicBlock =
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "tool_result"; tool_use_id: string; content: string }
    // Extended thinking blocks. The API returns them at the top of `content`
    // when `thinking: { type: "enabled" }` is passed. We MUST echo them
    // verbatim (including `signature`) back inside the assistant message on
    // any follow-up tool round, or the API rejects the request. Redacted
    // variants show up when the reasoning was filtered upstream.
    | { type: "thinking"; thinking: string; signature: string }
    | { type: "redacted_thinking"; data: string };

  // Seed history from prior turns (all user/assistant text blocks).
  const messages: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] | string }> = [];
  for (const m of input.history ?? []) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: input.question });

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": input.apiKey,
    "anthropic-version": "2023-06-01",
  };
  // Workspace-scoped API keys require this header; unscoped keys reject it.
  // Only send when the workspace id is configured.
  if (input.workspaceId) {
    headers["anthropic-workspace-id"] = input.workspaceId;
  }

  // Extended thinking config. Budget covers ONE turn's reasoning; the loop
  // may run 8 rounds, so total tokens across a full build can be ~8x this.
  // Overridable via env for tuning without a redeploy.
  const thinkingBudget = Number(input.thinkingBudget ?? 5000);
  const maxTokens = Math.max(thinkingBudget + 4096, 12000);

  const toolCalls: ToolCallLog[] = [];
  for (let round = 0; round < 8; round++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.model,
        max_tokens: maxTokens,
        // temperature MUST be 1 when extended thinking is enabled.
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
    // Record the assistant turn verbatim so tool results reference the
    // matching tool_use ids on the next round.
    messages.push({ role: "assistant", content: blocks });

    const toolUses = blocks.filter((b): b is Extract<AnthropicBlock, { type: "tool_use" }> => b.type === "tool_use");
    if (toolUses.length === 0) {
      // Terminal turn — collect all text blocks as the answer.
      const answer = blocks
        .filter((b): b is Extract<AnthropicBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { ok: true, answer, toolCalls };
    }

    // Execute every tool call in this turn, then post the results back as a
    // single user message with N tool_result blocks.
    const resultBlocks: AnthropicBlock[] = [];
    for (const tu of toolUses) {
      const result = await runTool(tu.name, tu.input ?? {}, input.surfaceId);
      const resultStr = JSON.stringify(result);
      toolCalls.push({
        name: tu.name,
        args: JSON.stringify(tu.input ?? {}),
        result: resultStr,
      });
      resultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: resultStr });
    }
    messages.push({ role: "user", content: resultBlocks });
  }
  return { ok: false, error: "exceeded_tool_rounds" };
}

/* -------------------------------------------------------------------------- */
/* TFY OpenAI-compat fallback (kept for local dev on Paytm net)                */
/* -------------------------------------------------------------------------- */

async function runTfyLoop(
  input: LoopInput & { baseUrl: string },
): Promise<AskPiResponse> {
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: input.systemContent },
    ...(input.history ?? []).map((m) => ({ role: m.role, content: m.content })),
  ];
  if (input.context && Object.keys(input.context).length > 0) {
    messages.push({ role: "system", content: `Current context: ${JSON.stringify(input.context)}` });
  }
  messages.push({ role: "user", content: input.question });

  const toolCalls: ToolCallLog[] = [];
  for (let round = 0; round < 8; round++) {
    const res = await fetch(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({ model: input.model, messages, tools: input.tools, tool_choice: "auto" }),
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
    // OpenAI convention: assistant messages MAY carry `content: null` when
    // only tool_calls are present. Bedrock (routed via TFY) is strict — it
    // rejects `content: ""` on the same turn as tool_calls with an
    // "aws-bedrock error: The content field in the Message object ... is
    // empty" 400. Prefer null over "" and omit tool_calls when absent.
    const hasToolCalls = !!(msg.tool_calls && msg.tool_calls.length > 0);
    const assistantMsg: Record<string, unknown> = {
      role: "assistant",
      content: msg.content && msg.content.trim().length > 0 ? msg.content : null,
    };
    if (hasToolCalls) assistantMsg.tool_calls = msg.tool_calls;
    messages.push(assistantMsg);
    if (!hasToolCalls) {
      return { ok: true, answer: msg.content ?? "", toolCalls };
    }
    for (const tc of msg.tool_calls!) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments) as Record<string, unknown>; }
      catch { /* keep as {} */ }
      const result = await runTool(tc.function.name, args, input.surfaceId);
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
