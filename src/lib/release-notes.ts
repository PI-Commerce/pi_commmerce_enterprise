/**
 * Release Notes source of truth (public-docs branch).
 *
 * VERBATIM copy of what ships on prod today. Every string here was
 * transcribed from the live in-app Release Notes screenshots — no
 * invented bullets, no drift. If prod changes, update this file.
 *
 * Grouped exactly like prod:
 *   - V2.1: the four September 2026 releases
 *   - V2:   the ten August + June 2026 releases
 */

export type ReleaseCategory =
  | "Channels"
  | "Workflow"
  | "Developer"
  | "Campaigns";

export type ReleaseVersion = "v2.1" | "v2";

export type ReleaseEntry = {
  id: string;
  version: ReleaseVersion;
  /** ISO date, e.g. 2026-08-25. Used for sorting and display. */
  date: string;
  category: ReleaseCategory;
  title: string;
  /** One-line summary shown under the title. */
  summary: string;
  /** Bullet highlights, verbatim from prod. */
  highlights: string[];
  /** Optional path inside the app users can jump to. */
  linkTo?: string;
  /** Optional link label, defaults to "Open in app". */
  linkLabel?: string;
};

export const RELEASE_ENTRIES: ReleaseEntry[] = [
  /* ============================== V2.1 ============================== */

  /* ---------------- 23 September 2026 ---------------- */
  {
    id: "broadcast-schedule",
    version: "v2.1",
    date: "2026-09-23",
    category: "Campaigns",
    title: "Broadcast Schedule",
    summary:
      "Broadcasts can now be sent immediately or scheduled for a later start date and time.",
    highlights: [
      "Send Now or Schedule for later, picked at the moment you create the broadcast",
      "Scheduled start must be at least 15 minutes in the future",
      "Terminate a scheduled broadcast any time before it moves into Running state",
      "A terminated broadcast cannot be resumed; create a fresh one to resend",
    ],
  },

  /* ---------------- 15 September 2026 ---------------- */
  {
    id: "channel-webhooks",
    version: "v2.1",
    date: "2026-09-15",
    category: "Developer",
    title: "Channel Webhooks",
    summary:
      "Register an HTTPS endpoint and receive Delivery Status and Incoming Messages events in real time, scoped to one channel and one sender.",
    highlights: [
      "Events: Delivery Status on WhatsApp, SMS and RCS; Incoming Messages on WhatsApp",
      "Scope a webhook to a WABA and phone number, a DLT sender ID, or an RCS agent",
      "Auth: Bearer token generated at creation and shown once; Pi metadata rides in headers, never in the body",
      "Test Event: Send a test event from the row menu or the create dialog to verify your receiver before going live",
    ],
  },

  /* ---------------- 10 September 2026 ---------------- */
  {
    id: "broadcast-campaigns",
    version: "v2.1",
    date: "2026-09-10",
    category: "Campaigns",
    title: "Broadcast Campaigns",
    summary:
      "A one-shot send that sits alongside Workflow Campaigns. Pick a channel, pick an approved template, upload a CSV audience, and go.",
    highlights: [
      "Campaigns is now a group with Workflows and Broadcasts as separate surfaces",
      "WhatsApp, SMS and RCS supported; template variables fill from CSV columns of the same name",
      "Sender identity derives from the template: WABA phone, DLT sender ID with PE, or RCS agent",
      "Channel Analytics gains View by Broadcast with the same KPI cards, chart, funnel and logs as View by Template",
    ],
  },

  /* ---------------- 9 September 2026 ---------------- */
  {
    id: "freeform-workflows",
    version: "v2.1",
    date: "2026-09-09",
    category: "Channels",
    title: "WhatsApp Freeform Workflows",
    summary:
      "Build a reusable freeform conversation on its own canvas, then attach it to any campaign so a lead can be taken through a guided WhatsApp session.",
    highlights: [
      "New Freeform Workflows tab under Channels > WhatsApp, with a canvas builder carrying Text, Image, Video, Document and List nodes plus API Call and Conditional",
      "Meta limits enforced as you build: up to 3 quick reply buttons or 1 CTA URL, 10 list rows, and per-field character caps",
      "Attach a workflow to a campaign off a WhatsApp Template's Reply Received or button output, with variable mapping across the whole graph",
      "Session closure timer runs on Total Session Time or User Inactivity Time up to 24 hours, with Success, Timeout and Failed outputs",
      "A workflow locks once a campaign run uses it; Duplicate to edit clones it into a fresh draft",
      "Campaign analytics reports In, Out and Drop-off per workflow",
    ],
  },

  /* ---------------- 3 September 2026 ---------------- */
  {
    id: "api-docs",
    version: "v2.1",
    date: "2026-09-03",
    category: "Developer",
    title: "API Docs",
    summary:
      "Developer is now a top-level section with a full API reference: every endpoint, request shape, error code and rate limit in one place.",
    highlights: [
      "Get started pages cover Overview, Authentication, Rate limits, Idempotency, Response shape and Error codes",
      "Endpoints grouped by Campaign Trigger, WhatsApp, SMS and RCS, so each channel has its own home",
      "Every endpoint page carries a sample request, a success response, an error response and its own limits",
      "API Keys, Logs and Release Notes now sit alongside API Docs on the same surface",
    ],
  },

  /* =============================== V2 =============================== */

  /* ---------------- 25 August 2026 bundle ---------------- */
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
      "One endpoint, always JSON array of records (an array with one object for a single record)",
      "Each record is validated on its own; a bad record never blocks the rest",
      "Every request returns a request_id, every queued record gets a record_id",
      "Optional Idempotency-Key header for safe retries within a 15 minute window",
      "Rate limits: 1,000 records per call, 4 MB body, 15 calls per second per client",
    ],
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
  },
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
  },

  /* ---------------- 20 August 2026 bundle ---------------- */
  {
    id: "api-keys",
    version: "v2",
    date: "2026-08-20",
    category: "Developer",
    title: "API Keys",
    summary: "Keys can now be generated and managed directly on the platform.",
    highlights: [
      "Create keys with a friendly name; full secret shown once",
      "Public prefix visible everywhere for safe identification",
      "Revoke active keys; delete keys once revoked",
    ],
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
  },
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
  },

  /* ---------------- 20 June 2026 ---------------- */
  {
    id: "delay-node-v2",
    version: "v2",
    date: "2026-06-20",
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
  Channels: "text-ai bg-ai/10 border-ai/25",
  Workflow: "text-warning bg-warning/10 border-warning/25",
  Developer: "text-foreground bg-secondary border-border",
  Campaigns: "text-primary bg-primary/10 border-primary/25",
};
