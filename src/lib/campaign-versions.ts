/**
 * Campaign Version Management (v1) — Google-Docs-history style.
 *
 * Scope (PRD §D3 / WS7): a campaign accrues an append-only list of versions.
 *  - v1 is created on the **first Save + Run**.
 *  - Every subsequent edit that is saved creates a **new version** ("save as new version").
 *  - Pausing a running campaign and editing it also yields a new version on save.
 *  - The history view is **read-only** — there is **no rollback in v1**.
 *
 * This module is the single source of truth for the version model: the type, a
 * factory, time formatting, and the seeded histories for the two showcase
 * example campaigns so the demo opens with a rich timeline.
 */

export type VersionTrigger = "created" | "edit" | "resumed-edit";

export type CampaignVersion = {
  id: string;
  /** Monotonic version number — 1, 2, 3 … */
  version: number;
  createdTs: number;
  /** Pre-formatted timestamp for display. */
  createdAt: string;
  author: string;
  trigger: VersionTrigger;
  /** Human-readable change note shown in the timeline. */
  summary: string;
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "Jun 10, 2026 · 2:14 PM" */
export function fmtVersionTime(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

export const VERSION_AUTHOR = "Mayank Ansal";

export function makeVersion(init: {
  version: number;
  trigger: VersionTrigger;
  summary: string;
  author?: string;
  createdTs?: number;
}): CampaignVersion {
  const ts = init.createdTs ?? Date.now();
  return {
    id: `ver_${init.version}_${ts}`,
    version: init.version,
    trigger: init.trigger,
    summary: init.summary,
    author: init.author ?? VERSION_AUTHOR,
    createdTs: ts,
    createdAt: fmtVersionTime(ts),
  };
}

const NOW = Date.now();

/**
 * Seeded histories for the showcase example campaigns. Newest version is the
 * highest `version` number; the UI sorts descending and badges the top as
 * "Current". Other campaigns start with no history until their first run.
 */
export const VERSION_HISTORY: Record<string, CampaignVersion[]> = {
  c_ex1: [
    makeVersion({ version: 1, trigger: "created", createdTs: NOW - 6 * DAY, summary: "Initial version — saved and launched the first run." }),
    makeVersion({ version: 2, trigger: "edit", createdTs: NOW - 3 * DAY - 2 * HOUR, summary: "Added the Mid-LTV → SMS fallback track for tiers that skip the AI conversation." }),
    makeVersion({ version: 3, trigger: "edit", createdTs: NOW - 18 * HOUR, summary: "Re-balanced the Chat-AI A/B split to 50/50 and widened the Voice retry window." }),
  ],
  c_ex2: [
    makeVersion({ version: 1, trigger: "created", createdTs: NOW - 9 * DAY, summary: "Initial version — saved and launched the first run." }),
    makeVersion({ version: 2, trigger: "edit", createdTs: NOW - 4 * DAY - 5 * HOUR, summary: "Added a Voice callback retry (1×) for the 'callback' disposition path." }),
    makeVersion({ version: 3, trigger: "resumed-edit", createdTs: NOW - 26 * HOUR, summary: "Paused and edited — refined the WhatsApp 'needs help' → 2-day delay → SMS nudge branch." }),
  ],
};

export const VERSION_TRIGGER_LABEL: Record<VersionTrigger, string> = {
  created: "Created",
  edit: "Edited",
  "resumed-edit": "Edited after pause",
};
