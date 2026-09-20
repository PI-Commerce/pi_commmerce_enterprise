/**
 * Ask Pi — /developer surface tool: list_releases.
 *
 * Structural query over Release Notes. Complements search_docs for the
 * class of questions keyword retrieval genuinely can't answer:
 *   - "latest features?"
 *   - "what shipped this month?"
 *   - "what changed in v2?"
 *   - "what Developer-category items shipped in August?"
 *
 * Why a dedicated tool instead of a smarter search_docs:
 *   - Release entries are structured (date, version, category, highlights),
 *     so filtering + sorting by fields is the natural query, not
 *     keyword-matching a prose paragraph. "Latest" is a sort order, not a
 *     word to grep for.
 *   - The corpus doesn't use the words users use ("latest", "recent",
 *     "newest") — it uses "released", "shipped", "highlights". Keyword
 *     retrieval had zero hits on "latest features". A dedicated tool
 *     side-steps that mismatch entirely.
 *
 * Tool contract:
 *   input:  { version?, since?, category?, limit? }
 *   output: { releases: Array<{ id, title, date, formattedDate, version,
 *             category, summary, highlights, linkTo }>, total, filtersApplied }
 *
 * Reads directly from src/lib/release-notes.ts (source of truth). Zero
 * D1, zero fetch, always fresh at build time.
 */
import type { SurfaceTool } from "@/lib/pi/kernel";
import {
  RELEASE_ENTRIES,
  formatReleaseDate,
  type ReleaseCategory,
  type ReleaseVersion,
} from "@/lib/release-notes";

const CATEGORY_VALUES: ReleaseCategory[] = [
  "Connections",
  "Channels",
  "Workflow",
  "Developer",
  "Campaigns",
];

export const listReleases: SurfaceTool = {
  name: "list_releases",
  description:
    "List Release Notes entries filtered structurally (version / category / since-date) and sorted newest first. Use this — NOT search_docs — for any 'what shipped', 'what's new', 'latest features', 'recent releases', 'what changed in v2', 'what shipped in [month/date]' question. Returns compact entries with title, date, category, summary, and highlights, plus a link back to Release Notes in-app. Pass `limit` to cap the response (default 5, max 20). Omit all filters to get the newest 5 across the whole product.",
  parameters: {
    type: "object",
    properties: {
      version: {
        type: "string",
        enum: ["v1", "v2"],
        description: "Optional. Narrow to one product version.",
      },
      since: {
        type: "string",
        description: "Optional. ISO date (YYYY-MM-DD). Only include entries on or after this date. Example: '2026-08-01'.",
      },
      category: {
        type: "string",
        enum: CATEGORY_VALUES,
        description: "Optional. Narrow to one release category.",
      },
      limit: {
        type: "integer",
        description: "Optional. Max entries to return. Default 5, max 20.",
      },
    },
    required: [],
  },
  handler: async (args) => {
    const version = args.version as ReleaseVersion | undefined;
    const since = typeof args.since === "string" ? args.since : undefined;
    const category = args.category as ReleaseCategory | undefined;
    const limitRaw = typeof args.limit === "number" ? args.limit : 5;
    const limit = Math.max(1, Math.min(20, Math.floor(limitRaw)));

    let entries = RELEASE_ENTRIES.slice();
    if (version) entries = entries.filter((e) => e.version === version);
    if (category) entries = entries.filter((e) => e.category === category);
    if (since) entries = entries.filter((e) => e.date >= since);

    // Newest first (dates are ISO YYYY-MM-DD so string compare is safe).
    entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const total = entries.length;
    const trimmed = entries.slice(0, limit);

    return {
      releases: trimmed.map((e) => ({
        id: e.id,
        title: e.title,
        date: e.date,
        formattedDate: formatReleaseDate(e.date),
        version: e.version,
        category: e.category,
        summary: e.summary,
        highlights: e.highlights,
        linkTo: e.linkTo ?? "/developer",
      })),
      total,
      returned: trimmed.length,
      filtersApplied: {
        version: version ?? null,
        since: since ?? null,
        category: category ?? null,
        limit,
      },
    };
  },
};
