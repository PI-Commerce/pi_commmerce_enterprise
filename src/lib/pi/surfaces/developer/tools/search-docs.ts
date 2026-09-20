/**
 * Ask Pi — /developer surface tool: search_docs.
 *
 * Retrieves the most relevant Developer-docs chunks for a user question.
 * Powers the docs-RAG experience: Pi calls this first, then answers from
 * the returned chunks and cites the source + section.
 *
 * Mirrors `src/lib/pi/surfaces/integrations/tools/search-docs.ts` — same
 * tokeniser, same scorer, same shape — with two differences:
 *   - filters by `source` (api-docs | release-notes) instead of `vendor`.
 *   - `inferSource` biases from words in the query rather than named
 *     vendors (release notes, changelog, endpoint, webhook, error code…).
 *
 * Corpus lives in ../docs.ts. Retrieval is deliberately dumb — tokenised
 * keyword overlap with boosts for section-title hits and exact phrases.
 * No embeddings. Swap for a real ranker (or Cloudflare Vectorize) when
 * the corpus grows past the point where keyword matching feels crude.
 *
 * Tool contract:
 *   input:  { query: string, source?: "api-docs" | "release-notes" }
 *   output: { hits: Array<{ source, sourceName, section, snippet, sourceUrl? }>,
 *             searchedSource, catalog }
 */
import type { SurfaceTool } from "@/lib/pi/kernel";
import {
  DEVELOPER_DOCS,
  DEVELOPER_DOC_SOURCES,
  type DeveloperDocChunk,
  type DocSource,
} from "../docs";

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "for", "to", "in", "on",
  "of", "with", "how", "do", "does", "i", "my", "me", "is", "are", "can", "you",
  "will", "would", "should", "what", "why", "when", "where", "which", "this",
  "that", "there", "here",
]);

function tokenise(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** Score one chunk against a query. Higher is better. */
function scoreChunk(chunk: DeveloperDocChunk, queryTokens: string[], rawQuery: string): number {
  if (queryTokens.length === 0) return 0;
  const haystack = `${chunk.section} ${chunk.body}`.toLowerCase();
  const sectionLower = chunk.section.toLowerCase();

  let score = 0;
  for (const token of queryTokens) {
    // Body hit
    const bodyHits = haystack.split(token).length - 1;
    score += bodyHits;
    // Section hit worth more (titles are dense)
    if (sectionLower.includes(token)) score += 3;
  }
  // Exact multi-word phrase from query boosts (naive but effective for
  // "webhooks auth", "idempotency key", "rate limits", "release notes").
  if (rawQuery.length > 6 && haystack.includes(rawQuery.toLowerCase())) score += 5;
  return score;
}

/** Infer a source from the raw query text if the caller didn't pass one.
 *  We only need this for prompts like "what shipped in v2" (release-notes)
 *  or "how do I authenticate" (api-docs) where Pi may not pass a source
 *  on the first call. Ambiguous → undefined (search all). */
function inferSource(query: string): DocSource | undefined {
  const q = query.toLowerCase();
  if (
    q.includes("release note") ||
    q.includes("release-note") ||
    q.includes("changelog") ||
    q.includes("what shipped") ||
    q.includes("what changed") ||
    q.includes("what's new") ||
    q.includes("whats new") ||
    q.includes("what is new")
  ) {
    return "release-notes";
  }
  if (
    q.includes("endpoint") ||
    q.includes("webhook") ||
    q.includes("error code") ||
    q.includes("rate limit") ||
    q.includes("idempoten") ||
    q.includes("api key") ||
    q.includes("authenticate") ||
    q.includes("authentication") ||
    q.includes("curl") ||
    q.includes("post /") ||
    q.includes("get /") ||
    q.includes("http")
  ) {
    return "api-docs";
  }
  return undefined;
}

export const searchDocs: SurfaceTool = {
  name: "search_docs",
  description:
    "Search the Developer documentation (API Docs + Release Notes) and return the most relevant chunks. Use this to answer any 'how do I …', 'what does … return', 'what shipped in …', or 'what error code …' question on the Developer surface. Always call before answering. Pass `source` when the user's intent is unambiguously one side (api-docs for endpoint / webhook / error / auth / rate-limit questions; release-notes for changelog / what-shipped questions) — leave undefined for cross-source questions. Returns up to 5 hits with source, section, body snippet and (when known) an in-app link.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The user's information need, verbatim or lightly reworded. Example: 'Idempotency-Key TTL' or 'what shipped in v2 August 25'.",
      },
      source: {
        type: "string",
        enum: ["api-docs", "release-notes"],
        description: "Optional. Narrow the search to one source before scoring.",
      },
    },
    required: ["query"],
  },
  handler: async (args) => {
    const query = String(args.query ?? "").trim();
    if (!query) return { hits: [], error: "empty_query" };

    const explicitSource = args.source as DocSource | undefined;
    const impliedSource = explicitSource ?? inferSource(query);
    const corpus = impliedSource
      ? DEVELOPER_DOCS.filter((c) => c.source === impliedSource)
      : DEVELOPER_DOCS;

    const tokens = tokenise(query);
    const scored = corpus
      .map((chunk) => ({ chunk, score: scoreChunk(chunk, tokens, query) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // If a source was implied but produced zero hits, fall back to a
    // corpus-wide search so Pi still has something to work with.
    let hits = scored;
    if (hits.length === 0 && impliedSource) {
      const wide = DEVELOPER_DOCS
        .map((chunk) => ({ chunk, score: scoreChunk(chunk, tokens, query) }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      hits = wide;
    }

    return {
      hits: hits.map(({ chunk }) => ({
        source: chunk.source,
        sourceName: chunk.sourceName,
        section: chunk.section,
        snippet: chunk.body,
        sourceUrl: chunk.sourceUrl,
      })),
      // Echo what we searched over so Pi can be honest in the answer
      // (e.g. "I only checked Release Notes — say the word if you meant the API Docs").
      searchedSource: impliedSource ?? "all",
      catalog: DEVELOPER_DOC_SOURCES,
    };
  },
};
