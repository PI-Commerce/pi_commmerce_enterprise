/**
 * Ask Pi — /integrations surface tool: search_docs.
 *
 * Retrieves the most relevant vendor-doc chunks for a user question. Powers
 * the docs-RAG experience: Pi calls this first, then answers from the
 * returned chunks and cites the vendor + section.
 *
 * Retrieval is deliberately dumb — tokenised keyword overlap with a small
 * boost for exact-phrase and title-hit matches. No embeddings, no vector
 * store: the corpus is 3 vendors x ~6 chunks and lives in-memory next to
 * the tool. Swap for a real ranker (or Cloudflare Vectorize) when the
 * corpus grows past the point where keyword matching is embarrassing.
 *
 * Tool contract:
 *   input:  { query: string, vendor?: VendorId }
 *   output: { hits: Array<{ vendor, vendorName, section, snippet, sourceUrl? }> }
 *
 * `vendor` narrows retrieval to a single vendor's chunks before scoring
 * (used when the user names a vendor explicitly). Omit to search across
 * every vendor.
 */
import type { SurfaceTool } from "@/lib/pi/kernel";
import { VENDOR_DOCS, VENDOR_CATALOG, type DocChunk, type VendorId } from "../docs";

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
function scoreChunk(chunk: DocChunk, queryTokens: string[], rawQuery: string): number {
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
  // "getting api credentials", "cart abandonment", "test the integration").
  if (rawQuery.length > 6 && haystack.includes(rawQuery.toLowerCase())) score += 5;
  return score;
}

/** Infer a vendor from the raw query text if the caller didn't pass one.
 *  We only need this for the "help me connect Shopify" style prompt where
 *  Pi may not know to pass vendor="shopify" on the first call.
 *
 *  Note: picom_platform is intentionally NOT auto-inferred here. Platform
 *  chunks (Where PiCommerce's own API keys live, Where vendor credentials
 *  get pasted, Terminology, Lifecycle) should surface on cross-vendor
 *  searches via the corpus-wide scoring path so they augment vendor
 *  answers rather than replace them. Pi can still request them explicitly
 *  by passing vendor="picom_platform" when a question is purely about
 *  the platform (e.g. "where do I find my API keys" with no vendor). */
function inferVendor(query: string): VendorId | undefined {
  const q = query.toLowerCase();
  if (q.includes("shopify")) return "shopify";
  if (q.includes("clevertap") || q.includes("clever tap")) return "clevertap";
  if (
    q.includes("paytm") ||
    q.includes("payment gateway") ||
    q.includes("payment gw") ||
    q.includes(" pg ") || q.endsWith(" pg")
  ) {
    return "paytm_pg";
  }
  return undefined;
}

export const searchDocs: SurfaceTool = {
  name: "search_docs",
  description:
    "Search the integration docs and return the most relevant chunks. Use this to answer any 'how do I connect / integrate / set up X' question, and also anything about PiCommerce platform concepts (where API keys live, how vendor credentials work, the connection lifecycle). Always call before answering. Pass `vendor` if the user named one explicitly (paytm_pg, clevertap, shopify) or if the question is purely about PiCommerce platform basics (picom_platform); leave undefined to search across everything. Returns up to 4 hits with vendor, section, body snippet and (when known) a source URL for citation.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The user's information need, verbatim or lightly reworded. Example: 'connect Shopify Plus custom app', 'where do I find my API keys'.",
      },
      vendor: {
        type: "string",
        enum: ["picom_platform", "paytm_pg", "clevertap", "shopify"],
        description: "Optional. Narrow the search to one corpus before scoring. Use `picom_platform` for pure platform questions (PiCommerce's own API keys, how credentials work, the connection lifecycle).",
      },
    },
    required: ["query"],
  },
  handler: async (args) => {
    const query = String(args.query ?? "").trim();
    if (!query) return { hits: [], error: "empty_query" };

    const explicitVendor = args.vendor as VendorId | undefined;
    const impliedVendor = explicitVendor ?? inferVendor(query);
    const corpus = impliedVendor
      ? VENDOR_DOCS.filter((c) => c.vendor === impliedVendor)
      : VENDOR_DOCS;

    const tokens = tokenise(query);
    const scored = corpus
      .map((chunk) => ({ chunk, score: scoreChunk(chunk, tokens, query) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    // If a vendor was implied but produced zero hits, fall back to a
    // corpus-wide search so Pi still has something to work with.
    let hits = scored;
    if (hits.length === 0 && impliedVendor) {
      const wide = VENDOR_DOCS
        .map((chunk) => ({ chunk, score: scoreChunk(chunk, tokens, query) }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);
      hits = wide;
    }

    return {
      hits: hits.map(({ chunk }) => ({
        vendor: chunk.vendor,
        vendorName: chunk.vendorName,
        section: chunk.section,
        snippet: chunk.body,
        sourceUrl: chunk.sourceUrl,
      })),
      // Echo what we searched over so Pi can be honest in the answer
      // (e.g. "I only checked Shopify docs — say the word if you meant CleverTap").
      searchedVendor: impliedVendor ?? "all",
      catalog: VENDOR_CATALOG,
    };
  },
};
