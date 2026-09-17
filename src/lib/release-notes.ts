/**
 * Release Notes source of truth.
 *
 * Entries are grouped by product version (v2, v1) and ordered newest first.
 * Kept brief on purpose. Each entry documents one shipped capability and
 * mirrors what went out in the corresponding release notes PDF.
 *
 * Two release bundles ship under v2 so far:
 *   - 20 August 2026: SMS, Delay v2, API Tool Node, WhatsApp Template
 *     Timeout, API Keys.
 *   - 25 August 2026: RCS, Direct Channel APIs, Batch API for Campaigns,
 *     CLM Connectors, CSV upload limits.
 */

export type ReleaseCategory =
  | "Connections"
  | "Channels"
  | "Workflow"
  | "Developer"
  | "Campaigns";

export type ReleaseVersion = "v2" | "v1";

export type ReleaseEntry = {
  id: string;
  version: ReleaseVersion;
  /** ISO date, e.g. 2026-08-25. Used for sorting and display. */
  date: string;
  category: ReleaseCategory;
  title: string;
  /** One-line summary shown under the title. */
  summary: string;
  /** 2 to 4 short bullets. Each should fit on one line. */
  highlights: string[];
  /** Optional path inside the app users can jump to. */
  linkTo?: string;
  /** Optional link label, defaults to "Open in app". */
  linkLabel?: string;
};

export const RELEASE_ENTRIES: ReleaseEntry[] = [
  /* ---------------- 25 August 2026 bundle ---------------- */
  {
    id: "rcs-channel",
    version: "v2",
    date: "2026-08-25",
    category: "Channels",
    title: "RCS as a Channel",
    summary:
      "RCS is now a first-class channel with template management, campaign node and delivery analytics.",
    highlights: [
      "Text and Rich card templates with up to 4 buttons (Quick reply, Open URL, Dial number)",
      "Template creation and approval on the platform, just like WhatsApp",
      "Onboarding is off-platform, just like SMS",
      "RCS node in the Campaign builder with variable mapping and DLR wait window",
      "Delivery, engagement and per-recipient log under Channel Analytics > RCS, with CSV export",
    ],
    linkTo: "/channels/rcs",
    linkLabel: "Open RCS",
  },
  {
    id: "direct-channel-apis",
    version: "v2",
    date: "2026-08-25",
    category: "Developer",
    title: "Direct Channel APIs",
    summary:
      "Approved WhatsApp, SMS and RCS templates are now directly callable over HTTP without creating a campaign.",
    highlights: [
      "Send a template to a list of records in one call; each record validated on its own",
      "Records that pass are queued; records that fail come back with an error_code",
      "Every request returns a request_id, every queued record gets a record_id",
      "Authenticated with API keys, same as the Campaign APIs",
      "Sends are counted in the respective channel analytics",
    ],
    linkTo: "/developer",
    linkLabel: "Open API Docs",
  },
  {
    id: "batch-campaign-trigger",
    version: "v2",
    date: "2026-08-25",
    category: "Developer",
    title: "Batch API for Campaigns",
    summary:
      "The API-based campaign trigger accepts a JSON array of records in one call. Every request uses the same shape, even for a single record.",
    highlights: [
      "One endpoint, always a JSON array of records (an array with one object for a single record)",
      "Each record is validated on its own; a bad record never blocks the rest",
      "Every request returns a request_id, every queued record gets a record_id",
      "Optional Idempotency-Key header for safe retries within a 15 minute window",
      "Rate limits: 1,000 records per call, 4 MB body, 15 calls per second per client",
    ],
    linkTo: "/developer",
    linkLabel: "Open API Docs",
  },
  {
    id: "clm-connectors",
    version: "v2",
    date: "2026-08-25",
    category: "Developer",
    title: "CLM Connectors for Campaign Trigger",
    summary:
      "The Run modal now shows sample cURLs pre-formatted for CleverTap, WebEngage and MoEngage.",
    highlights: [
      "Sample request tabs on the Run modal: Default, CleverTap, WebEngage, MoEngage",
      "Variable syntax rendered per tool: $phone for CleverTap, {{phone}} for WebEngage, ${phone} for MoEngage",
      "Endpoint, run ID and campaign ID all copyable from the same modal",
      "Works for both single-record and array-of-records requests",
    ],
    linkTo: "/campaigns",
    linkLabel: "Open Campaigns",
  },
  {
    id: "csv-upload-limits",
    version: "v2",
    date: "2026-08-25",
    category: "Campaigns",
    title: "CSV upload limits and validation",
    summary:
      "CSV audience uploads now enforce size limits and schema validation up front, before the campaign starts.",
    highlights: [
      "Max 500,000 rows per file, max 100 MB file size",
      "Files with missing values in any row are rejected",
      "Column headers must exactly match the Audience node schema",
      "Errors surface in the upload dialog for easy fix and retry",
    ],
    linkTo: "/campaigns",
    linkLabel: "Open Campaigns",
  },

  /* ---------------- 20 August 2026 bundle ---------------- */
  {
    id: "sms-channel",
    version: "v2",
    date: "2026-08-20",
    category: "Channels",
    title: "SMS as a Channel",
    summary:
      "SMS is now a first-class channel with DLT template management, campaign node and delivery analytics.",
    highlights: [
      "DLT-registered templates can be added on the platform, singly or in bulk",
      "SMS appears as a Node in the Campaign builder and is usable across campaigns",
      "Delivery analytics available under Channel Analytics > SMS",
      "Onboarding is off-platform for now (not self-serve)",
    ],
    linkTo: "/channels/sms",
    linkLabel: "Open SMS",
  },
  {
    id: "delay-node-v2",
    version: "v2",
    date: "2026-08-20",
    category: "Workflow",
    title: "Delay Node v2: Static or Dynamic Wait",
    summary:
      "The Delay node can now wait a fixed duration or wait until a datetime carried on an incoming variable.",
    highlights: [
      "Static: wait a fixed duration (as before)",
      "Dynamic: map to an incoming disposition datetime variable",
      "Specify the incoming date-time format for correct parsing",
      "Fallback static duration used when the variable is null, empty or non-sensical",
    ],
    linkTo: "/campaigns",
    linkLabel: "Open Campaigns",
  },
  {
    id: "api-tool-node",
    version: "v2",
    date: "2026-08-20",
    category: "Workflow",
    title: "API Tool Node",
    summary:
      "A new node to hit external APIs from inside a campaign. The underlying APIs are configured as a Tool inside Agents > Tools and then reused across campaigns.",
    highlights: [
      "Paste a cURL command to auto-fill URL, headers and body",
      "Nested body editor with tree view for JSON payloads",
      "Pick response fields via checkbox to expose them downstream",
      "Success and Failure branches on the canvas",
    ],
    linkTo: "/campaigns",
    linkLabel: "Open Campaigns",
  },
  {
    id: "wa-template-timeout",
    version: "v2",
    date: "2026-08-20",
    category: "Channels",
    title: "WhatsApp Template Node: configurable response timeout",
    summary:
      "Users can now configure the response timeout on the node, deciding how long an inactive lead should wait before being forced forward in the workflow.",
    highlights: [
      "Timeout configurable in whole hours (multiples of 1)",
      "Minimum 1 hour, maximum 24 hours",
      "Default branches on the node remain unchanged",
      "Backwards compatible with existing published campaigns",
    ],
    linkTo: "/campaigns",
    linkLabel: "Open Campaigns",
  },
  {
    id: "api-keys",
    version: "v2",
    date: "2026-08-20",
    category: "Developer",
    title: "API Keys",
    summary:
      "Keys can now be generated and managed directly on the platform.",
    highlights: [
      "Create keys with a friendly name; full secret shown once",
      "Public prefix visible everywhere for safe identification",
      "Revoke active keys; delete keys once revoked",
    ],
    linkTo: "/developer",
    linkLabel: "Open Developer",
  },
];

/** Sort newest first. */
export function getEntriesByVersion(version: ReleaseVersion): ReleaseEntry[] {
  return RELEASE_ENTRIES.filter((e) => e.version === version).sort((a, b) =>
    a.date < b.date ? 1 : -1,
  );
}

export function formatReleaseDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export const CATEGORY_STYLE: Record<ReleaseCategory, string> = {
  Connections: "text-success bg-success/10 border-success/25",
  Channels: "text-ai bg-ai/10 border-ai/25",
  Workflow: "text-warning bg-warning/10 border-warning/25",
  Developer: "text-foreground bg-secondary border-border",
  Campaigns: "text-primary bg-primary/10 border-primary/25",
};
