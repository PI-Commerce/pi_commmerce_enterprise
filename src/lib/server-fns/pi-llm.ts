/**
 * Ask Pi LLM entry point.
 *
 * Thin dispatcher on top of the kernel. Routes each incoming scope to
 * either a migrated surface module (agents, builder) or the legacy
 * analytics path (kept here until Phase 2c moves it into
 * `pi/surfaces/analytics/` and `pi/surfaces/lists/`).
 *
 * Every scope shares the same kernel loop + Anthropic/TFY transport;
 * this file's only remaining job is:
 *   1. Pick the surface (or fall through to analytics)
 *   2. Assemble the analytics-scope tool set (5 D1 reads + surface-
 *      filtered screen tools + emit_action_link)
 *   3. Run the kernel loop
 *
 * Server-only. Accessed via `askPi()` from the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { getEnv } from "@/lib/db/client";
import * as campaigns from "@/lib/db/campaigns";
import * as analytics from "@/lib/db/analytics";
import {
  ALL_SCREEN_TOOLS,
  executeScreenTool,
  screenToolsForSurface,
} from "@/lib/server-fns/pi-screen-tools";
// Kernel — generic loop, transports, surface dispatcher.
import {
  runAnthropicLoop,
  runTfyLoop,
  runSurface,
  type NormalizedToolDef,
} from "@/lib/pi/kernel";
// Side-effect imports — each surface self-registers with the kernel.
import "@/lib/pi/surfaces/agents";
import "@/lib/pi/surfaces/builder";

export type AskPiScope = "analytics" | "builder" | "agents";

export type AskPiRequest = {
  scope: AskPiScope;
  question: string;
  /** Analytics scope: current filter context (campaignId, runId, from/to)
   *  plus optional `surfaceId` naming the page (drives screen-tool set).
   *  Builder scope: `campaignId` is the current DAG being edited. */
  context?: Record<string, unknown>;
  /** Optional conversation state (multi-turn). */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

/** Legacy diagnostic shape emitted alongside builder-scope replies.
 *  Owned by the builder surface (see `pi/surfaces/builder/context.ts`);
 *  re-declared here as the response contract so external callers can
 *  type-narrow without importing surface internals. */
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

/* -------------------------------------------------------------------------- */
/* Analytics scope tools (legacy path — moves to a surface module in 2c)      */
/* -------------------------------------------------------------------------- */

/** Escape-hatch tool shared with every migrated surface. Kept in this
 *  file for the analytics-scope path only; the surface modules pull the
 *  proper module from `@/lib/pi/common/tools`. */
const SHARED_ESCAPE_TOOL = {
  type: "function" as const,
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
};

const TOOL_DEFS_ANALYTICS = [
  {
    type: "function" as const,
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
    type: "function" as const,
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
    type: "function" as const,
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
    type: "function" as const,
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
    type: "function" as const,
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
];

async function runTool(name: string, args: Record<string, unknown>, surfaceId?: string): Promise<unknown> {
  // Screen tools take priority — they're routed by surfaceId and most
  // are UI-only intents whose real work happens client-side (see
  // `pi-screen-tools.ts`). `check_csv_fit` is the only one with real
  // server logic.
  if (ALL_SCREEN_TOOLS.some((t) => t.function.name === name)) {
    return await executeScreenTool(name, args, surfaceId);
  }

  // emit_action_link is a pure UI intent — no D1 needed. The client
  // reads the tool call from `toolCalls` and renders the button.
  if (name === "emit_action_link") {
    return {
      ok: true,
      ui: true,
      action_link: {
        label: (args.label as string) ?? "",
        href: (args.href as string) ?? "",
        hint: (args.hint as string) ?? undefined,
      },
    };
  }

  // All remaining analytics tools require D1. If unbound, return a
  // clean error string so Pi can narrate the gap instead of blowing up.
  const hasDb = (() => {
    try { return !!getEnv().DB; } catch { return false; }
  })();
  if (!hasDb) return { error: "d1_unavailable — no database bound on this worker" };

  try {
    return await runToolInner(name, args);
  } catch (e) {
    return { error: `tool_failed: ${(e as Error).message}` };
  }
}

async function runToolInner(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
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
    default:
      return { error: `unknown tool: ${name}` };
  }
}

/* -------------------------------------------------------------------------- */
/* Analytics scope system prompt (+ surface-scoped addendum)                   */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Public server fn                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Live Ask Pi call. Two dispatch paths:
 *
 *   1. Migrated surfaces (`agents`, `builder`) → `runSurface(id, req, env)`
 *      which reads the surface module's tools, prompt, and context
 *      assembler from `pi/surfaces/*` and drives the kernel loop.
 *   2. Legacy analytics scope → this file's local `runTool` +
 *      SYSTEM_ANALYTICS wired directly into the kernel transports.
 *
 * Both paths return the same {ok,answer,toolCalls,diag?} shape so the
 * client doesn't care which path it hit. Analytics migrates to a
 * surface module in Phase 2c.
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

    // Migrated surfaces: the surface module owns its tools, prompt,
    // context assembler, and diagnostic. Phase 2c migrates analytics.
    if (data.scope === "agents" || data.scope === "builder") {
      const r = await runSurface(data.scope, {
        question: data.question,
        context: data.context,
        history: data.history,
      }, env);
      return r as AskPiResponse;
    }

    // Analytics scope: assemble tools + prompt inline, execute against
    // the kernel loop. The screenTools set is filtered by the client-
    // published surfaceId so Pi only sees the tools that make sense on
    // the current page.
    const surfaceId = typeof data.context?.surfaceId === "string"
      ? (data.context.surfaceId as string)
      : undefined;

    const screenTools = screenToolsForSurface(surfaceId);
    const screenAddendum = screenTools.length ? buildScreenToolsSystemAddendum(surfaceId!) : "";
    const systemContent = SYSTEM_ANALYTICS + screenAddendum;
    const scopeTools = [...TOOL_DEFS_ANALYTICS, ...screenTools, SHARED_ESCAPE_TOOL];

    const normalizedTools: NormalizedToolDef[] = scopeTools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));

    const executor = (name: string, args: Record<string, unknown>) =>
      runTool(name, args, surfaceId);

    if (env.ANTHROPIC_API_KEY) {
      return await runAnthropicLoop({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        workspaceId: env.ANTHROPIC_WORKSPACE_ID,
        systemContent,
        tools: normalizedTools,
        question: data.question,
        history: data.history,
        context: data.context,
        executor,
        config: {
          thinkingBudget: env.ANTHROPIC_THINKING_BUDGET
            ? Number(env.ANTHROPIC_THINKING_BUDGET)
            : undefined,
        },
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
      tools: normalizedTools,
      question: data.question,
      history: data.history,
      context: data.context,
      executor,
    });
  });
