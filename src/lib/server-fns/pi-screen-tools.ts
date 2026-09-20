/**
 * Pi screen-tool definitions + per-surface routing.
 *
 * "Screen tools" are Pi tools whose real work is client-side UI mutation
 * (set a list filter, open a modal with prefill, run a row action). They
 * pass through the server-side tool loop as no-ops that just echo the
 * call back on `toolCalls`; the client dock reads that log and dispatches
 * to the page-registered handler (see `pi-screen-actions.tsx`).
 *
 * One exception: {@link CSV_FIT_TOOL_NAME} is a real read tool — it
 * needs to compare a CSV's headers against a campaign's Audience schema
 * server-side and return a diff Pi can narrate. Its handler is exported
 * separately below and wired into the executor in `pi-llm.ts`.
 *
 * Surface routing: {@link SURFACE_SCREEN_TOOLS} maps a `surfaceId`
 * (published by the page via `usePublishSurface`) to the subset of
 * screen tools Pi is allowed to call while the user is on that surface.
 * If Pi ignores the filter and calls something anyway, the executor
 * returns a `{ error: "tool_not_available_on_surface" }` so it self-
 * corrects on the next round.
 */
import { CSV_LIBRARY, type CsvAsset } from "@/lib/data-library";
import * as campaigns from "@/lib/db/campaigns";
import { getEnv } from "@/lib/db/client";

/** OpenAI-flavoured tool spec — matches the shape used everywhere else in `pi-llm.ts`. */
type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
};

/* ------------------------------------------------------------------------ *
 *  Tool definitions
 * ------------------------------------------------------------------------ */

/** Filter the campaigns list by status. Client applies via `list_filter_status`. */
const listFilterStatus: ToolDef = {
  type: "function",
  function: {
    name: "list_filter_status",
    description:
      "Filter the campaigns list by status. Call when the user asks to narrow the list (e.g. 'show me only drafts'). Use `all` to clear the filter.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["all", "draft", "ready", "running", "paused", "locked"],
          description: "Campaign status to filter by. `all` clears the filter.",
        },
      },
      required: ["status"],
    },
  },
};

/** Set the campaigns list search query. */
const listSearch: ToolDef = {
  type: "function",
  function: {
    name: "list_search",
    description:
      "Set the campaigns list search box. Matches campaign name (case-insensitive substring). Pass an empty string to clear the search.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Substring to search for. Empty clears." },
      },
      required: ["query"],
    },
  },
};

/** Sort the campaigns list. */
const listSort: ToolDef = {
  type: "function",
  function: {
    name: "list_sort",
    description:
      "Sort the campaigns list. Pick the field the user asked for; default direction is `desc` for timestamps and `asc` for name/state.",
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          enum: ["name", "state", "lastEdited", "lastRun", "createdAt"],
          description: "Column to sort by.",
        },
        direction: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort direction. Optional — sensible default per field is used when omitted.",
        },
      },
      required: ["field"],
    },
  },
};

/** Filter the Runs tab by status and/or run type. Either arg is optional. */
const runsFilter: ToolDef = {
  type: "function",
  function: {
    name: "runs_filter",
    description:
      "Filter the Runs tab. Provide `status`, `run_type`, or both. Use `all` on either to clear that filter.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["all", "pending", "running", "paused", "completed", "failed", "terminated"],
        },
        run_type: {
          type: "string",
          enum: ["all", "one-time", "recurring"],
          description: "`one-time` = Time-Scoped; `recurring` = Always-on.",
        },
      },
    },
  },
};

/** Search the Runs tab. Matches run id + campaign name. */
const runsSearch: ToolDef = {
  type: "function",
  function: {
    name: "runs_search",
    description:
      "Set the Runs tab search box. Matches run id or campaign name (case-insensitive substring). Empty clears.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
};

/** Pause / resume / terminate a specific run from the row-menu. */
const runAction: ToolDef = {
  type: "function",
  function: {
    name: "run_action",
    description:
      "Take a row-menu action on a specific run. Only call when the user names a run (run id or campaign name) AND names an action. Never guess the target run.",
    parameters: {
      type: "object",
      properties: {
        run_id: {
          type: "string",
          description: "The `id` of the run row (e.g. `r_c_ex_soundbox`). Match exactly.",
        },
        action: {
          type: "string",
          enum: ["pause", "resume", "terminate"],
        },
      },
      required: ["run_id", "action"],
    },
  },
};

/** Open the "Create broadcast" modal with fields prefilled. */
const openNewBroadcast: ToolDef = {
  type: "function",
  function: {
    name: "open_new_broadcast",
    description:
      "Open the Create Broadcast modal on the Broadcasts surface. Prefill whatever channel / template the user named. The user completes name + CSV inside the modal and fires the send. Broadcasts execute immediately — there is no schedule window in v1.",
    parameters: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          enum: ["whatsapp", "sms", "rcs"],
          description: "Direct channel for the send.",
        },
        template_id: {
          type: "string",
          description: "Optional template id from `assets.waTemplates` / `assets.smsTemplates` / `assets.rcsTemplates`. Only pass a real id — don't invent one.",
        },
      },
    },
  },
};

/** CSV fit check — real read tool, not a UI mutation. */
export const CSV_FIT_TOOL_NAME = "check_csv_fit";
const checkCsvFit: ToolDef = {
  type: "function",
  function: {
    name: CSV_FIT_TOOL_NAME,
    description:
      "Check whether a CSV in the workspace library carries the columns a given campaign's Audience node needs. Returns `{ csv, campaign, requiredFields, missingFields, extraHeaders, phoneField, phoneOk }`. Call this on the Data tab whenever the user asks 'can this file run <campaign>?' or 'what's missing from this CSV for <campaign>?'.",
    parameters: {
      type: "object",
      properties: {
        csv_name: {
          type: "string",
          description: "Match against `CSV_LIBRARY[].name` (case-insensitive substring). Omit to get a list of available CSVs.",
        },
        campaign_name: {
          type: "string",
          description: "Match against a campaign's `name` (case-insensitive substring). Omit to get a list of campaigns with Audience schemas defined.",
        },
      },
    },
  },
};

/* ------------------------------------------------------------------------ *
 *  Channels — templates + freeform screen tools
 *
 *  These drive the templates registry tables on Channels > WhatsApp / SMS /
 *  RCS and the WhatsApp Freeform Workflows list. The tool defs are shared
 *  (one search, one status filter, etc.) — {@link SURFACE_SCREEN_TOOLS}
 *  gates which surface may call which. On surfaces where the UI doesn't
 *  expose a given filter (e.g. WhatsApp templates have no status dropdown
 *  today), the tool simply isn't listed so Pi can't silently narrow the
 *  list without a visible reason.
 * ------------------------------------------------------------------------ */

/** Set the templates list search box. Matches name / id / channel-specific fields. */
const templateListSearch: ToolDef = {
  type: "function",
  function: {
    name: "template_list_search",
    description:
      "Set the templates list search box on the current Channels > Templates surface. Matches template name / id (WhatsApp) or name / id / sender (SMS) or name / id / agent (RCS), case-insensitive substring. Pass an empty string to clear.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
};

/** Filter templates by provider approval status. RCS only in v1 (WA table has no status dropdown; SMS has no status at all). */
const templateListFilterStatus: ToolDef = {
  type: "function",
  function: {
    name: "template_list_filter_status",
    description:
      "Filter the templates list by provider approval status. Use `all` to clear. Only meaningful on channels whose provider approves templates (RCS in v1).",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["all", "Approved", "Pending", "Rejected"],
        },
      },
      required: ["status"],
    },
  },
};

/** Filter templates by category (channel-specific: SMS DLT categories today). */
const templateListFilterCategory: ToolDef = {
  type: "function",
  function: {
    name: "template_list_filter_category",
    description:
      "Filter the templates list by category. SMS DLT categories = Transactional / Promotional / Service_Explicit / Service_Implicit. Use `all` to clear.",
    parameters: {
      type: "object",
      properties: { category: { type: "string" } },
      required: ["category"],
    },
  },
};

/** Filter RCS templates by agent type (MAAP vs Jio). */
const templateListFilterAgentType: ToolDef = {
  type: "function",
  function: {
    name: "template_list_filter_agent_type",
    description:
      "Filter the RCS templates list by agent type. `all` clears. Enum values match the RCS agent registry (typically MAAP / Jio).",
    parameters: {
      type: "object",
      properties: { agent_type: { type: "string" } },
      required: ["agent_type"],
    },
  },
};

/** Open the new-template form on WhatsApp / RCS, optionally with prefilled fields. */
const openNewTemplate: ToolDef = {
  type: "function",
  function: {
    name: "open_new_template",
    description:
      "Open the new-template form on the WhatsApp or RCS Templates tab. Optionally prefill the name / category / format so the user lands in a form that's already partly filled. Do NOT call on SMS — SMS templates must be approved on the DLT portal first and imported. Pi steps aside inside the form itself.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Suggested template name — human-readable, snake_case is fine.",
        },
        category: {
          type: "string",
          description:
            "Provider category (channel-specific). WhatsApp: Utility / Marketing / Authentication. RCS: skip.",
        },
        format: {
          type: "string",
          description: "WhatsApp only: TEXT / IMAGE / VIDEO / DOCUMENT.",
        },
      },
    },
  },
};

/** Set the WhatsApp Freeform Workflows list search box. */
const freeformListSearch: ToolDef = {
  type: "function",
  function: {
    name: "freeform_list_search",
    description:
      "Set the WhatsApp Freeform Workflows list search box. Matches workflow name / description, case-insensitive substring. Empty clears.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
};

/** Open the Create Freeform Workflow dialog, optionally with prefill. */
const openNewFreeform: ToolDef = {
  type: "function",
  function: {
    name: "open_new_freeform",
    description:
      "Open the Create Freeform Workflow dialog on the WhatsApp Freeform Workflows list. Optionally prefill the workflow name and description so the user lands in a partly-filled dialog. The user finishes and clicks Create — the canvas is where Pi wires the flow itself.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
      },
    },
  },
};

/** All screen tools. `pi-llm.ts` imports this and merges with the analytics
 *  set based on the surface. */
export const ALL_SCREEN_TOOLS: ToolDef[] = [
  listFilterStatus,
  listSearch,
  listSort,
  runsFilter,
  runsSearch,
  runAction,
  openNewBroadcast,
  checkCsvFit,
  templateListSearch,
  templateListFilterStatus,
  templateListFilterCategory,
  templateListFilterAgentType,
  openNewTemplate,
  freeformListSearch,
  openNewFreeform,
];

/* ------------------------------------------------------------------------ *
 *  Per-surface routing
 * ------------------------------------------------------------------------ */

/**
 * `surfaceId` → the tool names Pi may call while the user is on that
 * surface. Keep in sync with the handlers each page registers via
 * `usePublishSurface` — a tool listed here but not registered on the
 * page will simply not fire client-side (safe).
 */
export const SURFACE_SCREEN_TOOLS: Record<string, string[]> = {
  "campaigns.workflows": ["list_filter_status", "list_search", "list_sort"],
  "campaigns.runs": ["runs_filter", "runs_search", "run_action"],
  "campaigns.data": [CSV_FIT_TOOL_NAME],
  "broadcasts.list": ["open_new_broadcast"],
  // Channels > WhatsApp > Templates — search + "open a new template with
  // prefill". No status/category filters today (the UI has neither), so
  // those tools aren't exposed and Pi can't silently narrow the list.
  "waba.templates.list": ["template_list_search", "open_new_template"],
  // Channels > SMS > Templates — search + category filter (both are
  // real UI controls on the table). No open_new — SMS templates must be
  // approved on the DLT portal and imported, not authored here.
  "sms.templates.list": ["template_list_search", "template_list_filter_category"],
  // Channels > RCS > Templates — search + status + agent-type filters
  // (both are real UI controls) + open a new template with prefill.
  "rcs.templates.list": [
    "template_list_search",
    "template_list_filter_status",
    "template_list_filter_agent_type",
    "open_new_template",
  ],
  // Channels > WhatsApp > Freeform Workflows — search + "open a new
  // workflow with prefill". Wiring the flow itself is the canvas Pi's
  // job, not a screen tool.
  "waba.freeform.list": ["freeform_list_search", "open_new_freeform"],
};

/** Return the screen tools Pi is allowed to call for `surfaceId`. */
export function screenToolsForSurface(surfaceId: string | undefined): ToolDef[] {
  if (!surfaceId) return [];
  const allowed = SURFACE_SCREEN_TOOLS[surfaceId];
  if (!allowed) return [];
  return ALL_SCREEN_TOOLS.filter((t) => allowed.includes(t.function.name));
}

/** Surfaces that expose ANY screen tools — used to gate the system-prompt
 *  addendum and skip prompt bloat on read-only surfaces. */
export function surfaceHasScreenTools(surfaceId: string | undefined): boolean {
  return !!surfaceId && !!SURFACE_SCREEN_TOOLS[surfaceId]?.length;
}

/* ------------------------------------------------------------------------ *
 *  Executor
 * ------------------------------------------------------------------------ */

/**
 * Server-side execution of screen tools. UI-mutation tools return
 * `{ ok: true, ui: true }` — the real work happens client-side via the
 * action bus. `check_csv_fit` runs a real read against `CSV_LIBRARY` +
 * D1's `campaigns.readCampaign` to produce a header diff.
 */
export async function executeScreenTool(
  name: string,
  args: Record<string, unknown>,
  surfaceId: string | undefined,
): Promise<Record<string, unknown>> {
  const allowed = surfaceId ? SURFACE_SCREEN_TOOLS[surfaceId] ?? [] : [];
  if (!allowed.includes(name)) {
    return {
      error: `tool_not_available_on_surface: ${name} is not exposed on ${surfaceId ?? "(no surface)"}`,
    };
  }

  if (name === CSV_FIT_TOOL_NAME) {
    return runCsvFitCheck(args);
  }

  // Every other screen tool is a pure UI intent — the client picks the
  // call up from `toolCalls` and dispatches to the page's handler.
  return { ok: true, ui: true, action: name };
}

/**
 * Real CSV fit check. Fuzzy-matches the CSV by name (substring), fuzzy-
 * matches the campaign by name (substring), then reads the campaign's
 * Audience node config to find the declared field names + phone field.
 * Returns a compact diff Pi can narrate as a sentence or two.
 */
async function runCsvFitCheck(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const csvQuery = typeof args.csv_name === "string" ? args.csv_name.trim().toLowerCase() : "";
  const campaignQuery = typeof args.campaign_name === "string" ? args.campaign_name.trim().toLowerCase() : "";

  // No CSV named → return the catalog so Pi can ask which one.
  if (!csvQuery) {
    return {
      hint: "csv_name not provided — pick one from the CSV library and re-call.",
      available_csvs: CSV_LIBRARY.map((c) => ({ name: c.name, headers: c.columns })),
    };
  }

  const csv = CSV_LIBRARY.find((c) => c.name.toLowerCase().includes(csvQuery));
  if (!csv) {
    return {
      error: `csv_not_found: no CSV in the library matches "${csvQuery}"`,
      available_csvs: CSV_LIBRARY.map((c) => c.name),
    };
  }

  // No campaign named → return the list of candidate campaigns so Pi can
  // ask which one, still along with the CSV's headers for context.
  if (!campaignQuery) {
    let list: Array<{ id: string; name: string; status: string }> = [];
    try {
      if (getEnv().DB) list = await campaigns.listCampaigns();
    } catch {
      /* fall through with empty list — the response still carries the CSV headers */
    }
    return {
      hint: "campaign_name not provided — pick one to fitness-check against and re-call.",
      csv: { name: csv.name, headers: csv.columns },
      available_campaigns: list.map((c) => ({ id: c.id, name: c.name, status: c.status })),
    };
  }

  // Find the campaign (fuzzy substring on name).
  let list: Array<{ id: string; name: string; status: string }> = [];
  try {
    if (getEnv().DB) list = await campaigns.listCampaigns();
  } catch (e) {
    return { error: `d1_unavailable: ${(e as Error).message}` };
  }
  const match = list.find((c) => c.name.toLowerCase().includes(campaignQuery));
  if (!match) {
    return {
      error: `campaign_not_found: no campaign matches "${campaignQuery}"`,
      csv: { name: csv.name, headers: csv.columns },
      available_campaigns: list.map((c) => c.name),
    };
  }

  const full = await campaigns.readCampaign(match.id);
  const audience = full?.nodes.find((n) => n.kind === "audience");
  const cfg = (audience?.config ?? {}) as Record<string, unknown>;
  const fields = Array.isArray(cfg.fields) ? (cfg.fields as Array<{ name?: string; type?: string }>) : [];
  const requiredFieldNames = fields.map((f) => f?.name).filter((n): n is string => !!n);
  const phoneField = typeof cfg.phoneField === "string" ? cfg.phoneField : typeof cfg.phoneCol === "string" ? cfg.phoneCol : "";

  const headersLower = csv.columns.map((h) => h.toLowerCase());
  const missingFields = requiredFieldNames.filter((f) => !headersLower.includes(f.toLowerCase()));
  const extraHeaders = csv.columns.filter((h) => !requiredFieldNames.some((f) => f.toLowerCase() === h.toLowerCase()));
  const phoneOk = phoneField ? headersLower.includes(phoneField.toLowerCase()) : true;

  const fits = missingFields.length === 0 && phoneOk;

  return {
    csv: { name: csv.name, headers: csv.columns },
    campaign: { id: match.id, name: match.name, status: match.status },
    requiredFields: requiredFieldNames,
    phoneField: phoneField || null,
    fits,
    missingFields,
    extraHeaders,
    phoneOk,
    note: fits
      ? "The CSV has every required column and includes the phone field."
      : missingFields.length && !phoneOk
        ? `Missing required columns and the phone field '${phoneField}' is not present.`
        : missingFields.length
          ? `Missing required columns: ${missingFields.join(", ")}.`
          : `Phone field '${phoneField}' is not in the CSV headers.`,
  };
}

// Keep CsvAsset importable via a re-export so the tools module owns the surface.
export type { CsvAsset };
