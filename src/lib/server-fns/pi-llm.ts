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
import { BUILDER_ALLOWED_KINDS } from "@/lib/node-registry";

export type AskPiScope = "analytics" | "builder" | "agents";

export type AskPiRequest = {
  scope: AskPiScope;
  question: string;
  /** Analytics scope: current filter context (campaignId, runId, from/to). */
  context?: Record<string, unknown>;
  /** Optional conversation state (multi-turn). */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

export type AskPiResponse =
  | { ok: true; answer: string; toolCalls: ToolCallLog[] }
  | { ok: false; error: string };

type ToolCallLog = { name: string; args: string; result: string };

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
    {
      type: "function",
      function: {
        name: "update_node",
        description: "Patch one node's title/subtitle/config on an existing campaign. Never use to change kind — insert a new node of the correct kind and reconnect instead.",
        parameters: {
          type: "object",
          properties: {
            campaignId: { type: "string" },
            nodeId: { type: "string" },
            patch: { type: "object" },
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

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
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
        // Client-only tool. Never needs D1.
        return { ok: true, awaiting_user: true };
      case "insert_node":
      case "connect_nodes":
      case "update_node":
      case "save_agent":
        // Mutation tools: return ok so Pi's textual confirmation still fires
        // and the client applies the change to the live canvas. Include a
        // warning field so Pi can mention the "not saved to DB" caveat.
        return { ok: true, warning: "d1_unavailable — change applied to canvas but not persisted" };
      case "list_agents":
      case "read_agent":
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
    default:
      return { error: `unknown tool: ${name}` };
  }
}

const SYSTEM_ANALYTICS = `You are Pi, the analytics copilot for a marketing automation platform. Answer the user's question using the analytics tools available to you. Never make up numbers — always call a tool. Reply in plain, direct language. Include the exact numbers you observed. If the tools can't answer the question, say so briefly.`;

const SYSTEM_BUILDER = `You are Pi (Paytm Intelligence), the campaign workflow builder for a marketing automation platform. Speak in the third person about Pi ("Pi will wire the Voice Call after the WhatsApp timeout branch"), never first person. English only.

## Non-negotiables

- Read the injected \`Current context\` block on every turn. It carries the current campaign, the live DSL, the canonical construct rules, the allowed node kinds, and the real workspace assets. Never invent an id or a kind that isn't in that block.
- Follow the canonical construct rules verbatim. They cover: blank-canvas invariants (Start, Audience, End pre-exist and are locked), single-End convergence, LEFT-to-RIGHT layout, bezier edges, allowed kinds, WhatsApp Freeform placement, real-asset wiring, and the confirm-before-build flow.
- Before ANY \`insert_node\` call, call \`propose_draft\` first. The client renders that plan as a Confirm-Draft card; the user hits Draft this to accept. Skipping \`propose_draft\` is a violation.

## Turn behavior

Each turn Pi is in exactly one of three modes:

1. **Clarify.** Emit ONE short question, no tool calls. Do this when Pi doesn't yet have enough to propose a draft. Cap: 2-3 total clarifiers before proposing. Bundle when possible.
2. **Propose draft.** Emit a single \`propose_draft\` tool call summarizing the plan (title, one-line summary, branches with channel + asset picks). Do this once Pi has enough context. Do NOT also emit \`insert_node\` in the same turn.
3. **Build.** After the user has confirmed the draft (their next user message will say "Draft this" or similar), emit the \`insert_node\` / \`connect_nodes\` / \`update_node\` calls that realize the plan, followed by a one-line textual confirmation of what changed.

## What Pi asks about

Pi asks minimum viable questions. Don't ask what the context already tells you. Skip anything the user has already said. The typical dimensions:

- **Audience segmentation** — does the flow branch by lead attributes (renewal window, cart value, tier)? Reference Audience fields already present in the DSL when possible.
- **Channels per branch** — which of the allowed kinds (WhatsApp Template, Voice Call, SMS, RCS) to use on each branch.
- **Real asset ids** — which specific voice agent / WA template / SMS template to wire.
- **Follow-up branches** — for each channel, does the user want a downstream action on its non-default output? (e.g. Voice Call after a WhatsApp Template's \`timeout\` branch.)

## Asset-picking rules (hard)

Pi already sees the full workspace asset catalog in the injected context (\`assets.voiceAgents\`, \`assets.waTemplates\`, \`assets.smsTemplates\`, \`assets.rcsTemplates\`, \`assets.tools\`). When Pi needs an asset pick, follow these rules exactly:

1. **Cite specific assets by name.** When asking "which voice agent", surface the actual available agents by name as options (using the fenced options block). Never ask an open-ended "which agent" question when a catalog exists — that's lazy.
2. **Never ask "do you have these assets".** Pi already knows. Don't hedge, don't preface with "if you don't have these yet, you can create them at...". Just present the picks.
3. **If the catalog is EMPTY for the kind Pi needs (voiceAgents is [], waTemplates is [], etc.), and only then**, tell the user and offer the deep link — one line, no drama. Example: "No voice agents exist in the workspace yet. Create one at [Agents](/agents) and Pi will pick it up on the next turn."
4. **Never ask about asset content or authoring.** "How should the voice sound?", "What should the WhatsApp template say?", "Which agent should Pi build?" are all wrong — those decisions live inside the asset itself, in different surfaces.

Deep links to other surfaces (only when a catalog is empty): use inline Markdown link form \`[label](/path)\`. Valid targets: \`/agents\` (voice agents + API tools), \`/channels\` (WA / SMS / RCS templates).

## Off-topic / cross-surface

If the user's ask on this surface is not about wiring a workflow:
- Platform-adjacent (create an agent, author a template, view analytics) — decline politely and give the deep link to the right surface (\`/agents\`, \`/channels\`, \`/analytics\`, etc.).
- Unrelated — decline politely, one line, no link.

## Quick-pick options format

When a question has 2-5 discrete answers, offer them in a fenced options block on its own line so the client renders them as clickable chips. Format:

\`\`\`options
Option one
Option two
Option three
\`\`\`

Each option under 40 chars, sentence case, no leading dashes. Only use this when the choice is truly narrow — free-form asks (a duration, a count, a template body) stay as plain text.

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

    const systemContent =
      data.scope === "builder" ? SYSTEM_BUILDER
      : data.scope === "agents" ? SYSTEM_AGENTS
      : SYSTEM_ANALYTICS;
    const scopeTools =
      data.scope === "builder" ? [...TOOL_DEFS.analytics, ...TOOL_DEFS.builder]
      : data.scope === "agents"  ? [...TOOL_DEFS.analytics, ...TOOL_DEFS.agents]
      : [...TOOL_DEFS.analytics];

    // Builder scope: enrich context with the current DSL, canonical construct
    // rules, node registry, and asset catalogs so Pi reads real state on EVERY
    // turn. Falls back to the client-supplied context if the assembler fails.
    let enrichedContext: Record<string, unknown> | undefined = data.context;
    if (data.scope === "builder") {
      try {
        const campaignId = typeof data.context?.campaignId === "string"
          ? (data.context.campaignId as string)
          : undefined;
        const builderCtx = await assembleBuilderContext(campaignId);
        enrichedContext = { ...(data.context ?? {}), ...builderCtx };
      } catch {
        /* keep client-supplied context — better than nothing */
      }
    }

    // Prefer Anthropic direct. If missing, fall back to the OpenAI-compat
    // TrueFoundry gateway. If neither, ok:false with a clear message.
    if (env.ANTHROPIC_API_KEY) {
      return await runAnthropicLoop({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        workspaceId: env.ANTHROPIC_WORKSPACE_ID,
        systemContent,
        tools: scopeTools,
        question: data.question,
        history: data.history,
        context: enrichedContext,
      });
    }

    const tfyKey = env.PI_AGENT_API_KEY || env.TFY_API_KEY;
    const tfyBase = env.PI_AGENT_BASE_URL || env.TFY_BASE_URL;
    if (!tfyKey || !tfyBase) {
      return { ok: false, error: "LLM gateway not configured — set ANTHROPIC_API_KEY (preferred) or PI_AGENT_API_KEY + PI_AGENT_BASE_URL in .env / wrangler secrets" };
    }
    return await runTfyLoop({
      apiKey: tfyKey,
      baseUrl: tfyBase,
      model: env.PI_AGENT_MODEL || env.TFY_MODEL || "pi-agentic/global.anthropic.claude-sonnet-4-6",
      systemContent,
      tools: scopeTools,
      question: data.question,
      history: data.history,
      context: enrichedContext,
    });
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
    | { type: "tool_result"; tool_use_id: string; content: string };

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

  const toolCalls: ToolCallLog[] = [];
  for (let round = 0; round < 8; round++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.model,
        max_tokens: 4096,
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
      const result = await runTool(tu.name, tu.input ?? {});
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
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { ok: true, answer: msg.content ?? "", toolCalls };
    }
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments) as Record<string, unknown>; }
      catch { /* keep as {} */ }
      const result = await runTool(tc.function.name, args);
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
