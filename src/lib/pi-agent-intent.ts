/**
 * Client-side "draft a voice agent" intent parser.
 *
 * Runs on the AskPiDock's submit path when the user is on the /agents
 * surface. If the query looks like a draft request ("draft a voice agent
 * for X", "create a collections agent", "make a winback voice agent"),
 * we synthesize an id + human-readable name from the subject so the dock
 * can:
 *   1. Insert an empty shell into the agent-store (local-only).
 *   2. Navigate into `/agents/<id>` immediately, so the user is INSIDE the
 *      builder while Pi drafts (shimmer state) instead of staring at a
 *      chat panel for 20s.
 *   3. Pass `draftHint: {id, name}` to the askPi server fn so Pi uses the
 *      same id + name in its save_agent call. No collision, no dupe.
 *
 * Miss cases (no trigger word, no agent noun) return null and the dock
 * falls back to the plain flow. Edits ("update the collections one"),
 * questions ("which tools does Pi Concierge use?") don't match.
 */

export type DraftIntent = {
  id: string;
  name: string;
  /** Human-readable subject for UI copy ("loan against mutual funds"). */
  label: string;
};

// Any of these + an "agent"/"voice" noun triggers the intent.
const TRIGGER_RE = /\b(draft|create|make|build|new|add|generate|write)\b/i;
const AGENT_NOUN_RE = /\b(voice\s*agents?|agents?)\b/i;
// Pull the subject after "for" or "to" or "that". Non-greedy up to a
// sentence terminator or end of string.
const SUBJECT_RE = /\b(?:for|to|that)\s+(.+?)(?:[.?!]|$)/i;

const STOPWORDS = new Set([
  "a", "an", "the", "my", "our", "your", "some", "any", "of", "and", "or",
  "with", "using", "handles", "handle", "does", "will", "does", "voice",
  "agent", "agents", "sells", "sell", "selling", "help", "helps", "helping",
]);

/** Strip leading "a/an/the" and trailing "agent" chatter from a subject. */
function cleanSubject(raw: string): string {
  return raw
    .replace(/^\s*(?:a|an|the)\s+/i, "")
    .replace(/\s+(?:voice\s*)?agents?\b.*$/i, "")
    .trim();
}

/** Tokenize into snake_case core words, drop stopwords, cap length. */
function slugTokens(subject: string, max = 2): string[] {
  return subject
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOPWORDS.has(t))
    .slice(0, max);
}

/**
 * Try to parse the query as a draft-agent intent. Returns null if it
 * doesn't look like one.
 */
export function detectDraftAgentIntent(query: string): DraftIntent | null {
  const q = query.trim();
  if (!q) return null;
  if (!TRIGGER_RE.test(q)) return null;
  if (!AGENT_NOUN_RE.test(q)) return null;

  const subjectMatch = q.match(SUBJECT_RE);
  const rawSubject = subjectMatch ? cleanSubject(subjectMatch[1]) : "";
  const tokens = slugTokens(rawSubject, 2);

  // Uniqueness stamp keeps two drafts of the same topic from colliding.
  // 4-char base36 = ~1.6M values; plenty for a demo workspace.
  const stamp = Math.random().toString(36).slice(2, 6);

  const slugCore = tokens.length > 0 ? tokens.join("_") : "draft";
  const id = `a_${slugCore}_${stamp}`;
  const name = tokens.length > 0 ? `${slugCore}_voice` : `new_voice_agent`;
  const label = rawSubject || "new voice agent";

  return { id, name, label };
}
