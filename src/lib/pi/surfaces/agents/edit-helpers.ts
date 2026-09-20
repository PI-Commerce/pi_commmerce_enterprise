/**
 * Section-scoped edit helpers for the /agents surface.
 *
 * The skeleton template produces well-formed masterPrompt (h1 sections,
 * "# 1. Persona" ... "# 10. Success + failure criteria") and KB (h2
 * sections). Phase 2 edit tools want to touch ONE section at a time
 * without regenerating the whole prompt. These helpers do string-level
 * splice/replace on the section boundaries.
 *
 * Safety: if the section can't be found (user manually edited the prompt
 * and broke the structure), the helper returns null and the caller
 * surfaces an error instead of clobbering the whole field.
 */

export type EditMode = "replace" | "append";

/**
 * Replace or append to one numbered h1 section of a masterPrompt.
 *
 * sectionNumber is 1-based (1 = Persona, 10 = Success + failure criteria).
 * `replace` swaps the entire body (header line preserved).
 * `append` adds `newBody` to the end of the existing body, separated by
 *   a blank line, so Pi can add bullets/steps without regenerating the
 *   whole section.
 *
 * Returns the updated masterPrompt or `null` if the section wasn't found.
 */
export function editMasterPromptSection(
  masterPrompt: string,
  sectionNumber: number,
  newBody: string,
  mode: EditMode = "replace",
): string | null {
  // Split on double-newline followed by a numbered h1 header. First part
  // starts with "# 1. ..." so the split preserves boundaries cleanly.
  const parts = masterPrompt.split(/\n\n(?=# \d+\. )/);
  let found = false;
  const trimmed = newBody.trim();
  const updated = parts.map((part) => {
    const headerMatch = part.match(/^(# (\d+)\. [^\n]*)\n([\s\S]*)$/);
    if (!headerMatch) return part;
    const num = Number.parseInt(headerMatch[2], 10);
    if (num !== sectionNumber) return part;
    found = true;
    const header = headerMatch[1];
    const existingBody = headerMatch[3].trim();
    if (mode === "append") {
      const joined = existingBody.length > 0 ? `${existingBody}\n\n${trimmed}` : trimmed;
      return `${header}\n${joined}`;
    }
    return `${header}\n${trimmed}`;
  });
  if (!found) return null;
  return updated.join("\n\n");
}

/**
 * Replace or append to one h2 section of a knowledgeBase, keyed by title.
 * Title match is case-insensitive and trimmed.
 *
 * Returns the updated knowledgeBase or `null` if no section matched.
 */
export function editKnowledgeSection(
  knowledgeBase: string,
  sectionTitle: string,
  newBody: string,
  mode: EditMode = "replace",
): string | null {
  const parts = knowledgeBase.split(/\n\n(?=## )/);
  const target = sectionTitle.trim().toLowerCase();
  let found = false;
  const trimmed = newBody.trim();
  const updated = parts.map((part) => {
    const headerMatch = part.match(/^(## ([^\n]+))\n([\s\S]*)$/);
    if (!headerMatch) return part;
    const partTitle = headerMatch[2].trim().toLowerCase();
    if (partTitle !== target) return part;
    found = true;
    const header = headerMatch[1];
    const existingBody = headerMatch[3].trim();
    if (mode === "append") {
      const joined = existingBody.length > 0 ? `${existingBody}\n${trimmed}` : trimmed;
      return `${header}\n${joined}`;
    }
    return `${header}\n${trimmed}`;
  });
  if (!found) return null;
  return updated.join("\n\n");
}

/**
 * Apply an add/remove diff to a string array (used for the `tools`
 * handles list on an agent). Adds are appended after any existing (dedup
 * preserves original order for existing entries). Removes prune matches.
 */
export function applyStringSetDiff(
  current: string[],
  add: string[] = [],
  remove: string[] = [],
): string[] {
  const removeSet = new Set(remove);
  const kept = current.filter((s) => !removeSet.has(s));
  const existing = new Set(kept);
  for (const a of add) {
    if (!existing.has(a)) {
      kept.push(a);
      existing.add(a);
    }
  }
  return kept;
}
