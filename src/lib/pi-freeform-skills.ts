/**
 * Ask Pi — freeform pure-function skill implementations.
 *
 * Analogue of {@link ./pi-skills.ts} for the WhatsApp Freeform Workflow
 * builder. Same shape:
 *   - each skill is a plain sync/async function
 *   - wired into Pi's agent loop as tools in
 *     `pi/surfaces/freeform/tools/skills.ts`
 *   - deterministic and unit-testable without an LLM
 *
 * Kept separate from the campaign builder's `pi-skills.ts` because the
 * freeform domain is different (intents not industries, freeform node
 * kinds, single-row D1 blob storage). Sharing pieces would leak
 * campaign concepts (audience, conditional-by-attribute) into freeform
 * where they don't belong.
 */
import * as freeformDb from "@/lib/db/freeform-workflows";
import * as toolsDb from "@/lib/db/tools";
import type { FreeformContext } from "@/lib/server-fns/freeform-context";
import {
  FREEFORM_CATALOG,
  FREEFORM_INTENT_KEYWORDS,
  type FreeformCatalogEntry,
  type FreeformFollowUp,
  type FreeformIntent,
  type FreeformSkeleton,
} from "@/lib/pi-freeform-skills-catalog";
import type {
  FreeformEdgeRecord,
  FreeformNodeConfig,
  FreeformNodeKind,
  FreeformNodeRecord,
} from "@/lib/freeform-types";
import { FREEFORM_SERIAL_PREFIX, validateFreeformNode } from "@/lib/freeform-types";

/* -------------------------------------------------------------------------- */
/* Skill: classify_brief                                                       */
/* -------------------------------------------------------------------------- */

export type FreeformClassifyResult = {
  intent: FreeformIntent;
  /** 0-1 heuristic — how sure the classifier is. Low = ask a probing Q. */
  confidence: number;
  /** Human-readable trace of matched keywords. Pi can quote these. */
  matches: string[];
  /** Fields the classifier could NOT infer. Feeds probing questions. */
  missing: Array<"intent" | "tone" | "audience" | "branches">;
};

/**
 * Cheap deterministic classifier. Same design as the campaign builder's
 * classifyBrief — keyword scan, no LLM. Fast, predictable, unit-testable.
 * If Pi wants to overrule the intent it can still do so in reasoning.
 */
export function classifyFreeformBrief(text: string): FreeformClassifyResult {
  const norm = (text ?? "").toLowerCase();
  const allMatches: string[] = [];

  let intent: FreeformIntent = "other";
  let intentScore = 0;
  for (const [key, kws] of Object.entries(FREEFORM_INTENT_KEYWORDS) as [
    FreeformIntent,
    string[],
  ][]) {
    let score = 0;
    for (const kw of kws) {
      if (kw && norm.includes(kw)) {
        score++;
        allMatches.push(kw);
      }
    }
    if (score > intentScore) {
      intentScore = score;
      intent = key;
    }
  }

  // Confidence: 0 hits = 0.1 (fallback to "other"), 1 hit = 0.5, 2+ = 0.85.
  const confidence = intentScore === 0 ? 0.1 : intentScore === 1 ? 0.5 : 0.85;

  const missing: FreeformClassifyResult["missing"] = [];
  if (intent === "other") missing.push("intent");
  if (!/formal|casual|friendly|firm|warm|professional/i.test(norm)) missing.push("tone");
  if (!/customer|user|lead|contact|buyer|shopper|guest/i.test(norm)) missing.push("audience");
  if (!/branch|option|choice|yes|no|split/i.test(norm)) missing.push("branches");

  return {
    intent,
    confidence,
    matches: Array.from(new Set(allMatches)),
    missing,
  };
}

/* -------------------------------------------------------------------------- */
/* Skill: suggest_skeleton                                                     */
/* -------------------------------------------------------------------------- */

export type FreeformSuggestSkeletonResult =
  | {
      ok: true;
      entry: {
        intent: FreeformIntent;
        label: string;
        hint: string;
        skeleton: FreeformSkeleton;
        followUps: FreeformFollowUp[];
      };
    }
  | {
      ok: false;
      error: string;
      alternates: Array<{
        intent: FreeformIntent;
        label: string;
        hint: string;
      }>;
    };

export function suggestFreeformSkeleton(
  intent: FreeformIntent,
): FreeformSuggestSkeletonResult {
  const entry = FREEFORM_CATALOG.find((e) => e.intent === intent)
    // Fall back to the generic simple-reply shape if the intent isn't in
    // the catalog. `other` always ships a shape so this is defensive
    // rather than expected.
    ?? FREEFORM_CATALOG.find((e) => e.intent === "other");

  if (entry) {
    return {
      ok: true,
      entry: {
        intent: entry.intent,
        label: entry.label,
        hint: entry.hint,
        skeleton: entry.skeleton,
        followUps: entry.followUps,
      },
    };
  }

  // Shouldn't happen — "other" always exists — but defensive fallback so
  // Pi never sees an undefined skeleton.
  const alternates = FREEFORM_CATALOG.slice(0, 3).map(
    (e: FreeformCatalogEntry) => ({
      intent: e.intent,
      label: e.label,
      hint: e.hint,
    }),
  );
  return { ok: false, error: `No skeleton for intent=${intent}`, alternates };
}

/* -------------------------------------------------------------------------- */
/* Skill: find_relevant_tools                                                  */
/*                                                                             */
/* Freeform has ONE pickable asset kind (tools, for apiToolCall nodes).       */
/* Message content is inline (text bodies, media captions, list rows) so      */
/* there's no template / voice-agent catalog to rank. This skill only         */
/* exists because a freeform workflow CAN include an apiToolCall node.        */
/* -------------------------------------------------------------------------- */

export type RankedFreeformTool = {
  handle: string;
  label: string;
  hint?: string;
  score: number;
  reasons: string[];
};

export async function findRelevantFreeformTools(
  intent: FreeformIntent | undefined,
  query: string | undefined,
  limit = 5,
): Promise<RankedFreeformTool[]> {
  const intentKws = intent ? FREEFORM_INTENT_KEYWORDS[intent] ?? [] : [];
  const queryKws = (query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const allKws = [...intentKws, ...queryKws];

  let list: Array<{ handle: string; description: string }> = [];
  try {
    list = await toolsDb.listTools();
  } catch {
    return [];
  }

  const scored: RankedFreeformTool[] = list.map((t) => {
    const searchable = `${t.handle} ${t.description}`.toLowerCase();
    const matched: string[] = [];
    for (const kw of allKws) {
      if (kw && searchable.includes(kw)) matched.push(kw);
    }
    const uniqueMatches = Array.from(new Set(matched));
    const labelHit = query && t.handle.toLowerCase().includes(query.toLowerCase()) ? 0.5 : 0;
    const score = uniqueMatches.length + labelHit;
    const reasons = uniqueMatches.slice(0, 3).map((kw) => `matched "${kw}"`);
    if (labelHit) reasons.unshift(`handle contains "${query}"`);
    return {
      handle: t.handle,
      label: t.handle,
      hint: t.description,
      score,
      reasons,
    };
  });

  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return scored.slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Skill: insert_skeleton                                                      */
/*                                                                             */
/* THE key skill — installs a whole skeleton onto the workflow's D1 row in    */
/* ONE call. Without this, Pi loops individual insert_node calls for every    */
/* node in the shape (5-15 calls) and burns the max-rounds ceiling.           */
/* -------------------------------------------------------------------------- */

/** Kinds owned by the FreeformNode renderer (react-flow `type: "freeform"`)
 *  vs shared logic kinds owned by the campaign WorkflowNode (`type:
 *  "workflow"`). The set decides which validator + node type each
 *  skeleton node lands with. Getting this wrong = renderer treats the
 *  node as pending/pulsating forever (the bug that kept API pulsating). */
const FREEFORM_OWNED_KINDS = new Set<string>([
  "text",
  "image",
  "video",
  "document",
  "list",
]);

export type FreeformInsertSkeletonResult = {
  ok: true;
  inserted: { nodes: number; edges: number };
  nodeIds: string[];
  edgeIds: string[];
  openConfig: Array<{ nodeId: string; kind: string; needs: string[] }>;
};

/**
 * Atomically install a freeform skeleton onto the given workflow. Reads
 * the row once, appends every skeleton node + edge, writes back once —
 * so a partial half-installed graph can't exist even if the LLM turn
 * gets cut short by a timeout.
 *
 * Skeletons are CONFIG-LESS on the content side (text bodies, media
 * urls, list rows are blank). Structural fields that shape branching
 * (buttonsBlock mode + button ids for quick-reply nodes; rows[] with
 * seeded row ids for list nodes) ARE seeded so the sourceHandle edges
 * land on real handles and the canvas immediately shows the branching
 * shape.
 */
export async function insertFreeformSkeleton(
  workflowId: string,
  skeleton: FreeformSkeleton,
): Promise<FreeformInsertSkeletonResult | { ok: false; error: string }> {
  const rec = await freeformDb.readFreeformWorkflow(workflowId);
  if (!rec) return { ok: false, error: `workflow_not_found: ${workflowId}` };
  if (rec.locked) return { ok: false, error: "workflow_locked: cannot install skeleton into a locked workflow" };

  const nodeIds: string[] = [];
  const edgeIds: string[] = [];
  const openConfig: FreeformInsertSkeletonResult["openConfig"] = [];

  // Build the nodes to append. Position hints are LTR anchored right of
  // the existing rightmost node; ELK on the client re-lays anyway.
  const existingMaxX = rec.nodes.length
    ? Math.max(...rec.nodes.map((n) => n.position.x))
    : 0;
  const existingAvgY = rec.nodes.length
    ? Math.round(rec.nodes.reduce((s, n) => s + n.position.y, 0) / rec.nodes.length)
    : 60;

  // Pre-scan the edges to figure out which nodes need HOW MANY branching
  // handles seeded. If Pi wired edges from image_1 with sourceHandles
  // btn_b1 and btn_b2, we need to seed 2 quick-reply buttons on image_1
  // so those handles exist on the rendered node. Same for list rows.
  // Without this, the edges dangle and the node stays invalid.
  const buttonIdsPerNode = new Map<string, Set<string>>();
  const rowIdsPerNode = new Map<string, Set<string>>();
  for (const e of skeleton.edges) {
    const h = e.sourceHandle;
    if (!h) continue;
    if (h.startsWith("btn_")) {
      const set = buttonIdsPerNode.get(e.source) ?? new Set<string>();
      set.add(h.slice(4));
      buttonIdsPerNode.set(e.source, set);
    } else if (h.startsWith("row_")) {
      const set = rowIdsPerNode.get(e.source) ?? new Set<string>();
      set.add(h.slice(4));
      rowIdsPerNode.set(e.source, set);
    }
  }

  const newNodes: FreeformNodeRecord[] = skeleton.nodes.map((n, idx) => {
    // Seed structural config so branching handles are real from turn 1.
    // Content fields (text bodies, captions, media urls, list body) stay
    // empty — that's what Phase 2 fills in. Handles are derived from the
    // edges wired to this node (buttonIdsPerNode / rowIdsPerNode).
    const seededConfig = seedFreeformStructuralConfig(
      n.kind,
      n.needs,
      Array.from(buttonIdsPerNode.get(n.id) ?? []),
      Array.from(rowIdsPerNode.get(n.id) ?? []),
    );
    // Validity + ReactFlow node type split — freeform-owned kinds render
    // through the "freeform" node type + get validated by
    // validateFreeformNode. The two shared logic kinds (apiToolCall,
    // conditional) render through the campaign "workflow" node type and
    // have their own validators on the campaign side; here we mark them
    // as VALID so the canvas doesn't pulsate them as "pending" (default
    // undefined valid was the bug that kept API nodes spinning). The
    // campaign ConfigPanel's own onChange will re-validate when the user
    // opens the API/conditional config.
    const isFreeformOwned = FREEFORM_OWNED_KINDS.has(n.kind);
    const validity = isFreeformOwned
      ? validateFreeformNode(
          n.kind as FreeformNodeKind,
          seededConfig as FreeformNodeConfig,
        )
      : { valid: true as const };
    const nodeType: FreeformNodeRecord["type"] = isFreeformOwned
      ? "freeform"
      : "workflow";
    const serial = deriveFreeformSerial(n.id, n.kind, rec.nodes);
    return {
      id: n.id,
      type: nodeType,
      position: {
        x: existingMaxX + 260 + (idx % 4) * 40,
        y: existingAvgY + Math.floor(idx / 4) * 140,
      },
      data: {
        kind: n.kind,
        title: n.title,
        ...(n.description ? { description: n.description } : {}),
        ...(serial ? { serial } : {}),
        ...(seededConfig ? { config: seededConfig } : {}),
        valid: validity.valid,
        ...("error" in validity && validity.error ? { error: validity.error } : {}),
      },
    };
  });

  const newEdges: FreeformEdgeRecord[] = skeleton.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
  }));

  // Idempotent guards — if the LLM re-emits the same skeleton twice, we
  // silently skip duplicates rather than throwing.
  const existingNodeIds = new Set(rec.nodes.map((n) => n.id));
  const existingEdgeIds = new Set(rec.edges.map((e) => e.id));
  const dedupedNodes = newNodes.filter((n) => !existingNodeIds.has(n.id));
  const dedupedEdges = newEdges.filter((e) => !existingEdgeIds.has(e.id));

  for (const n of dedupedNodes) {
    nodeIds.push(n.id);
    // Look up the skeleton node's `needs` for the openConfig reporter —
    // skips nodes the caller didn't tag with needs (start / end).
    const src = skeleton.nodes.find((s) => s.id === n.id);
    if (src?.needs && src.needs.length) {
      openConfig.push({ nodeId: n.id, kind: n.data.kind as string, needs: src.needs });
    }
  }
  for (const e of dedupedEdges) edgeIds.push(e.id);

  await freeformDb.upsertFreeformWorkflow({
    ...rec,
    nodes: [...rec.nodes, ...dedupedNodes],
    edges: [...rec.edges, ...dedupedEdges],
    lastModified: new Date().toISOString(),
  });

  return {
    ok: true,
    inserted: { nodes: nodeIds.length, edges: edgeIds.length },
    nodeIds,
    edgeIds,
    openConfig,
  };
}

/* -------------------------------------------------------------------------- */
/* Skill: suggest_next_step                                                    */
/* -------------------------------------------------------------------------- */

export type FreeformNextStepSuggestion = {
  id: string;
  label: string;
  hint?: string;
  target?: { kind: "node_config" | "picker" | "prompt"; ref: string };
};

/**
 * 2-4 next-best actions given current graph + optional classified intent.
 * Same priorities as the campaign version: invalid nodes first, then
 * catalog follow-ups, then a "save the workflow" terminal chip.
 */
export function suggestFreeformNextStep(
  dsl: FreeformContext["dsl"],
  validity: FreeformContext["validity"],
  classified?: { intent: FreeformIntent },
): FreeformNextStepSuggestion[] {
  const out: FreeformNextStepSuggestion[] = [];

  const invalids = (validity ?? []).filter((v) => !v.valid && v.error);
  for (const v of invalids.slice(0, 3)) {
    out.push({
      id: `fix_${v.nodeId}`,
      label: `Fix ${v.nodeId}`,
      hint: v.error,
      target: { kind: "node_config", ref: v.nodeId },
    });
  }

  if (classified && out.length < 4) {
    const skel = suggestFreeformSkeleton(classified.intent);
    if (skel.ok) {
      for (const fu of skel.entry.followUps) {
        if (out.length >= 4) break;
        out.push({ id: fu.id, label: fu.label, hint: fu.hint });
      }
    }
  }

  if (dsl && out.length < 4) {
    out.push({
      id: "review_save",
      label: "Save the workflow",
      hint: `${dsl.nodes.length} nodes / ${dsl.edges.length} edges`,
      target: { kind: "prompt", ref: "save" },
    });
  }
  return out.slice(0, 4);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Seed the structural (branching) fields of a freeform node config so
 * the sourceHandle edges in the skeleton land on real handles the moment
 * the skeleton installs. Content fields (text, caption, mediaUrl,
 * buttonLabel copy) are left blank — those are Phase 2's job.
 *
 * Convention (matches the skeleton edges in the catalog):
 *  - quick-reply buttons: ids b1, b2, b3 (up to 3), labels "Option 1", etc.
 *  - list rows: ids r1, r2, r3 (up to 3), titles "Option 1", etc.
 *
 * The needs[] hint from the catalog entry decides which structural
 * shape to seed. `needs: ["text", "buttonsBlock"]` means a text node
 * with quick-reply buttons; `needs: ["body", "buttonLabel", "rows"]`
 * means a list node.
 */
function seedFreeformStructuralConfig(
  kind: string,
  needs: string[] | undefined,
  wiredButtonIds: string[],
  wiredRowIds: string[],
): FreeformNodeConfig | undefined {
  const wantsButtons =
    wiredButtonIds.length > 0
    || (Array.isArray(needs) && needs.includes("buttonsBlock"));
  const wantsRows =
    wiredRowIds.length > 0
    || kind === "list"
    || (Array.isArray(needs) && needs.includes("rows"));

  // Text / image / video / document may all carry a buttonsBlock. If
  // edges wired specific button ids (btn_b1, btn_b2, ...), seed those
  // exact ids so the handles exist and the edges land. Otherwise seed a
  // default trio. Placeholder labels ("Option 1", "Option 2", ...) so
  // the branches are visible on the node card until Phase 2 fills them.
  const canHaveButtons =
    kind === "text" || kind === "image" || kind === "video" || kind === "document";
  if (canHaveButtons && wantsButtons) {
    const buttonIds = wiredButtonIds.length > 0
      ? wiredButtonIds
      : ["b1", "b2", "b3"];
    return {
      buttonsBlock: {
        mode: "quick_reply",
        buttons: buttonIds.map((id, i) => ({ id, label: `Option ${i + 1}` })),
      },
    };
  }

  if (wantsRows) {
    // Same principle for list rows: if edges wired specific row ids,
    // seed those; else seed a default trio. Meta caps at 10 rows; if
    // Pi's plan wires more we truncate rather than send invalid state.
    // Placeholder titles so branches are visible immediately.
    const rowIds = wiredRowIds.length > 0 ? wiredRowIds.slice(0, 10) : ["r1", "r2", "r3"];
    return {
      rows: rowIds.map((id, i) => ({ id, title: `Option ${i + 1}` })),
    };
  }

  // Text without buttons, image / video / document skeleton without
  // buttons: no structural seeding needed — everything they need is
  // content (text / caption / media source).
  return undefined;
}

/** Compute a stable serial for a skeleton-installed node (matches the
 *  SERIAL_PREFIX convention). Same helper the canvas tool uses; kept
 *  local here so the skeleton insert doesn't have to import from the
 *  server tool module. */
function deriveFreeformSerial(
  id: string,
  kind: string,
  existingNodes: FreeformNodeRecord[],
): string | undefined {
  if (kind === "start" || kind === "end") return undefined;
  // Shared logic kinds (apiToolCall, conditional) don't have freeform
  // serial prefixes — they use the campaign SERIAL_PREFIX convention.
  // Skip serial derivation for them; the workflow node renderer uses
  // node.id directly when serial is absent.
  if (!(kind in FREEFORM_SERIAL_PREFIX)) return undefined;
  const prefix = FREEFORM_SERIAL_PREFIX[kind as FreeformNodeKind];
  if (!prefix) return undefined;
  const match = new RegExp(`^${prefix}_(\\d+)$`).exec(id);
  if (match) return `${prefix}_${match[1]}`;
  const used = new Set<number>();
  for (const n of existingNodes) {
    const m = new RegExp(`^${prefix}_(\\d+)$`).exec(n.data.serial ?? "");
    if (m) used.add(Number(m[1]));
  }
  let next = 1;
  while (used.has(next)) next++;
  return `${prefix}_${next}`;
}
