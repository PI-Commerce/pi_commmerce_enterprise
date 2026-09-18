/**
 * Phase 3 storage — public entry point.
 *
 * Every server function that reads or writes application state routes through
 * this module. Client bundles must NEVER import from here — server-only.
 *
 * Layout:
 *   client.ts        — env + D1 accessor plumbing
 *   campaigns.ts     — Campaign DSL CRUD (list, read, write, insert/update/delete node, connect/disconnect)
 *   analytics.ts     — read-only aggregate queries the Ask Pi LLM tools call
 *
 * More modules land as the LLM tool surface grows (runs, leads, templates,
 * agents, tools, freeform-workflows). Keep each module small and focused.
 */
export * from "./client";
export * as campaigns from "./campaigns";
export * as analytics from "./analytics";
export * as agents from "./agents";
export * as runs from "./runs";
export * as waTemplates from "./wa-templates";
export * as smsTemplates from "./sms-templates";
export * as rcsTemplates from "./rcs-templates";
export * as tools from "./tools";
export * as broadcasts from "./broadcasts";
export * as reports from "./reports";
export * as freeformWorkflows from "./freeform-workflows";
export * as inbox from "./inbox";
