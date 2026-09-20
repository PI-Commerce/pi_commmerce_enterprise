/**
 * Ask Pi — pure-function skill implementations.
 *
 * Each skill is a plain sync/async function. They are wired into Pi's
 * agent loop as tools in `server-fns/pi-llm.ts`. Keeping the logic here
 * (not in pi-llm.ts) means:
 *   - deterministic behavior we can unit-test without an LLM
 *   - the same skill is reusable from client code (e.g. showing a
 *     suggested skeleton in the composer before the user hits enter)
 *   - pi-llm.ts stays a thin adapter between Anthropic messages and D1
 */
import * as agentsDb from "@/lib/db/agents";
import * as waDb from "@/lib/db/wa-templates";
import * as smsDb from "@/lib/db/sms-templates";
import * as rcsDb from "@/lib/db/rcs-templates";
import * as freeformDb from "@/lib/db/freeform-workflows";
import * as toolsDb from "@/lib/db/tools";
import * as campaignsDb from "@/lib/db/campaigns";
import type { BuilderContext } from "@/lib/server-fns/builder-context";
import { computeNodeValidity } from "@/lib/node-validity";
import type { NodeKind, PresetConfig } from "@/lib/campaign-types";
import {
  SKILL_CATALOG,
  INDUSTRY_KEYWORDS,
  USECASE_KEYWORDS,
  type Industry,
  type Usecase,
  type Skeleton,
  type FollowUp,
} from "@/lib/pi-skills-catalog";

/* -------------------------------------------------------------------------- */
/* Skill: classify_brief                                                       */
/* -------------------------------------------------------------------------- */

export type ClassifyResult = {
  industry: Industry;
  usecase: Usecase;
  /** 0-1 heuristic — how sure the classifier is. Low = ask a probing Q. */
  confidence: number;
  /** Human-readable trace of matched keywords. Pi can quote these. */
  matches: { industry: string[]; usecase: string[] };
  /** Fields the classifier could NOT infer. Feeds probing questions. */
  missing: Array<"industry" | "usecase" | "tone" | "audience" | "timing">;
};

/**
 * Cheap keyword classifier. Not statistical — deterministic, fast, and
 * predictable, which is what we want for a demo where the same brief
 * should always route the same way. If the model wants richer inference
 * it can still overrule the result in its own reasoning.
 */
export function classifyBrief(text: string): ClassifyResult {
  const norm = (text ?? "").toLowerCase();
  const industryMatches: string[] = [];
  const usecaseMatches: string[] = [];

  let industry: Industry = "other";
  let industryScore = 0;
  for (const [ind, kws] of Object.entries(INDUSTRY_KEYWORDS) as [Industry, string[]][]) {
    let score = 0;
    for (const kw of kws) {
      if (kw && norm.includes(kw)) {
        score++;
        industryMatches.push(kw);
      }
    }
    if (score > industryScore) {
      industryScore = score;
      industry = ind;
    }
  }

  let usecase: Usecase = "other";
  let usecaseScore = 0;
  for (const [uc, kws] of Object.entries(USECASE_KEYWORDS) as [Usecase, string[]][]) {
    let score = 0;
    for (const kw of kws) {
      if (kw && norm.includes(kw)) {
        score++;
        usecaseMatches.push(kw);
      }
    }
    if (score > usecaseScore) {
      usecaseScore = score;
      usecase = uc;
    }
  }

  // Confidence: 1 keyword hit each = 0.5, 2+ = 0.8, both dimensions strong = 1
  const dimScore = (n: number) => (n === 0 ? 0 : n === 1 ? 0.5 : 0.8);
  const confidence = Math.min(1, (dimScore(industryScore) + dimScore(usecaseScore)) / 2 + 0.1);

  const missing: ClassifyResult["missing"] = [];
  if (industry === "other") missing.push("industry");
  if (usecase === "other") missing.push("usecase");
  // Tone / audience / timing are almost never in a one-line brief.
  if (!/formal|casual|urgent|friendly|firm/i.test(norm)) missing.push("tone");
  if (!/segment|customers|users|leads|audience|hni|premium/i.test(norm)) missing.push("audience");
  if (!/today|tomorrow|next week|asap|by \w+|by \d/i.test(norm)) missing.push("timing");

  return {
    industry,
    usecase,
    confidence,
    matches: { industry: industryMatches, usecase: usecaseMatches },
    missing,
  };
}

/* -------------------------------------------------------------------------- */
/* Skill: suggest_skeleton                                                     */
/* -------------------------------------------------------------------------- */

export type SuggestSkeletonResult = {
  ok: true;
  entry: {
    industry: Industry;
    usecase: Usecase;
    label: string;
    hint: string;
    skeleton: Skeleton;
    followUps: FollowUp[];
  };
} | {
  ok: false;
  error: string;
  /** Suggested alternates when no exact match — top-3 near-misses. */
  alternates: Array<{ industry: Industry; usecase: Usecase; label: string; hint: string }>;
};

export function suggestSkeleton(industry: Industry, usecase: Usecase): SuggestSkeletonResult {
  // Exact match first.
  let entry = SKILL_CATALOG.find((e) => e.industry === industry && e.usecase === usecase);
  // Fall back on same-usecase, industry=other (channel-agnostic).
  if (!entry) entry = SKILL_CATALOG.find((e) => e.industry === "other" && e.usecase === usecase);
  // Fall back on same-industry, any usecase (least specific).
  if (!entry) entry = SKILL_CATALOG.find((e) => e.industry === industry);

  if (entry) {
    return {
      ok: true,
      entry: {
        industry: entry.industry,
        usecase: entry.usecase,
        label: entry.label,
        hint: entry.hint,
        skeleton: entry.skeleton,
        followUps: entry.followUps,
      },
    };
  }

  const alternates = SKILL_CATALOG.slice(0, 3).map((e) => ({
    industry: e.industry,
    usecase: e.usecase,
    label: e.label,
    hint: e.hint,
  }));
  return { ok: false, error: `No skeleton for ${industry}/${usecase}`, alternates };
}

/* -------------------------------------------------------------------------- */
/* Skill: find_relevant_assets                                                 */
/* -------------------------------------------------------------------------- */

export type AssetKind = "voiceAgent" | "waTemplate" | "smsTemplate" | "rcsTemplate" | "freeformWorkflow" | "tool";

export type RankedAsset = {
  id: string;
  label: string;
  hint?: string;
  score: number;
  /** Why this asset matched — 1-3 short reasons. */
  reasons: string[];
};

/**
 * Score existing workspace assets against an industry+usecase (and
 * optional free-text query). Uses name/category/description keyword
 * overlap — no ML. Good enough to sort a small demo catalog and cite
 * why each row scored.
 */
export async function findRelevantAssets(
  kind: AssetKind,
  industry?: Industry,
  usecase?: Usecase,
  query?: string,
  limit = 5,
): Promise<RankedAsset[]> {
  const industryKws = industry ? INDUSTRY_KEYWORDS[industry] ?? [] : [];
  const usecaseKws = usecase ? USECASE_KEYWORDS[usecase] ?? [] : [];
  const queryKws = (query ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const allKws = [...industryKws, ...usecaseKws, ...queryKws];

  type Row = { id: string; label: string; hint?: string; searchable: string };
  let rows: Row[] = [];
  switch (kind) {
    case "voiceAgent": {
      const map = await agentsDb.listAgents();
      rows = Object.values(map).map((a) => ({
        id: a.id,
        label: a.name,
        hint: `${a.status} · ${a.tools?.length ?? 0} tools`,
        searchable: `${a.name} ${a.masterPrompt ?? ""} ${a.knowledgeBase ?? ""}`.toLowerCase(),
      }));
      break;
    }
    case "waTemplate": {
      const list = await waDb.listWaTemplates();
      rows = list.map((t) => ({
        id: t.id,
        label: t.name,
        hint: t.category,
        searchable: `${t.name} ${t.category} ${(t as unknown as { body?: string }).body ?? ""}`.toLowerCase(),
      }));
      break;
    }
    case "smsTemplate": {
      const list = await smsDb.listSmsTemplates();
      rows = list.map((t) => ({
        id: t.id,
        label: t.name,
        hint: t.category,
        searchable: `${t.name} ${t.category ?? ""} ${(t as unknown as { body?: string }).body ?? ""}`.toLowerCase(),
      }));
      break;
    }
    case "rcsTemplate": {
      const list = await rcsDb.listRcsTemplates();
      rows = list.map((t) => ({
        id: t.id,
        label: t.name,
        searchable: `${t.name} ${JSON.stringify(t)}`.toLowerCase(),
      }));
      break;
    }
    case "freeformWorkflow": {
      const list = await freeformDb.listFreeformWorkflows();
      rows = list
        .filter((w) => w.status === "ready")
        .map((w) => ({
          id: w.id,
          label: w.name,
          hint: w.status,
          searchable: `${w.name}`.toLowerCase(),
        }));
      break;
    }
    case "tool": {
      const list = await toolsDb.listTools();
      rows = list.map((t) => ({
        id: t.handle,
        label: t.handle,
        hint: t.description,
        searchable: `${t.handle} ${t.description}`.toLowerCase(),
      }));
      break;
    }
  }

  // Score each row by keyword hits. Score = matched kw count; ties broken by
  // whether the query itself is a substring of the row label.
  const scored: RankedAsset[] = rows.map((r) => {
    const matched: string[] = [];
    for (const kw of allKws) {
      if (kw && r.searchable.includes(kw)) matched.push(kw);
    }
    const labelHit = query && r.label.toLowerCase().includes(query.toLowerCase()) ? 0.5 : 0;
    const uniqueMatches = Array.from(new Set(matched));
    const score = uniqueMatches.length + labelHit;
    const reasons = uniqueMatches.slice(0, 3).map((kw) => `matched "${kw}"`);
    if (labelHit) reasons.unshift(`label contains "${query}"`);
    return { id: r.id, label: r.label, hint: r.hint, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return scored.slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Skill: read_asset                                                           */
/* -------------------------------------------------------------------------- */

export async function readAsset(kind: AssetKind, id: string): Promise<unknown> {
  switch (kind) {
    case "voiceAgent":
      return (await agentsDb.readAgent(id)) ?? { error: "not_found" };
    case "waTemplate":
      return (await waDb.readWaTemplate(id)) ?? { error: "not_found" };
    case "smsTemplate":
      return (await smsDb.readSmsTemplate(id)) ?? { error: "not_found" };
    case "rcsTemplate":
      return (await rcsDb.readRcsTemplate(id)) ?? { error: "not_found" };
    case "freeformWorkflow":
      return (await freeformDb.readFreeformWorkflow(id)) ?? { error: "not_found" };
    case "tool":
      return (await toolsDb.readTool(id)) ?? { error: "not_found" };
    default:
      return { error: `unknown_kind: ${String(kind)}` };
  }
}

/* -------------------------------------------------------------------------- */
/* Skill: insert_skeleton                                                      */
/* -------------------------------------------------------------------------- */

export type InsertSkeletonResult = {
  ok: true;
  inserted: { nodes: number; edges: number };
  /** Node ids and edge ids the skeleton wrote — so the client can highlight
   *  them, and applyPiToolCallsToGraph can turn them into synthetic
   *  insert_node / connect_nodes calls for the canvas. */
  nodeIds: string[];
  edgeIds: string[];
  /** Nodes still missing required config after the skeleton lands. */
  openConfig: Array<{ nodeId: string; kind: string; needs: string[] }>;
};

export async function insertSkeleton(
  campaignId: string,
  skeleton: Skeleton,
): Promise<InsertSkeletonResult> {
  const nodeIds: string[] = [];
  const edgeIds: string[] = [];
  const openConfig: InsertSkeletonResult["openConfig"] = [];

  // Insert nodes first so subsequent connect_nodes references land.
  for (const n of skeleton.nodes) {
    await campaignsDb.insertNode(campaignId, {
      id: n.id,
      kind: n.kind,
      title: n.title,
      subtitle: n.subtitle,
      // Skeleton is CONFIG-LESS by design. Config is filled in a later
      // turn via update_node or the config panel.
      config: {},
    } as unknown as campaignsDb.DslNode);
    nodeIds.push(n.id);
    if (n.needs && n.needs.length) {
      openConfig.push({ nodeId: n.id, kind: n.kind, needs: n.needs });
    }
  }
  for (const e of skeleton.edges) {
    await campaignsDb.connectNodes(campaignId, {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
    } as unknown as campaignsDb.DslEdge);
    edgeIds.push(e.id);
  }
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

export type NextStepSuggestion = {
  id: string;
  label: string;
  hint?: string;
  /** Optional target — a nodeId or an asset picker id — the client can
   *  route the chip click to the right panel. */
  target?: { kind: "node_config" | "picker" | "prompt"; ref: string };
};

/**
 * Given the current DSL and (optionally) a classified brief, propose 2-4
 * useful next actions. Priorities:
 *   1. Invalid nodes with concrete "missing X" errors — highest signal
 *   2. Follow-ups from the matched skeleton, if any
 *   3. A "review & save" chip as a terminal option
 */
export function suggestNextStep(
  dsl: BuilderContext["dsl"],
  validity: BuilderContext["validity"],
  classified?: { industry: Industry; usecase: Usecase },
): NextStepSuggestion[] {
  const out: NextStepSuggestion[] = [];

  const invalids = (validity ?? []).filter((v) => !v.valid && v.error);
  for (const v of invalids.slice(0, 3)) {
    out.push({
      id: `fix_${v.nodeId}`,
      label: `Fix ${v.nodeId}`,
      hint: v.error,
      target: { kind: "node_config", ref: v.nodeId },
    });
  }

  if (classified) {
    const skel = suggestSkeleton(classified.industry, classified.usecase);
    if (skel.ok) {
      for (const fu of skel.entry.followUps.slice(0, 3 - out.length)) {
        if (out.length >= 4) break;
        out.push({
          id: fu.id,
          label: fu.label,
          hint: fu.hint,
        });
      }
    }
  }

  if (dsl && out.length < 4) {
    out.push({
      id: "review_save",
      label: "Review and save",
      hint: `${dsl.nodes.length} nodes / ${dsl.edges.length} edges`,
      target: { kind: "prompt", ref: "save" },
    });
  }
  return out.slice(0, 4);
}

/* -------------------------------------------------------------------------- */
/* Skill: emit_choice (no-op server side — client renders the chips card)     */
/* -------------------------------------------------------------------------- */

export type EmitChoiceInput = {
  key: string;
  prompt: string;
  options: Array<{ id: string; label: string; hint?: string }>;
};

export function emitChoice(input: EmitChoiceInput): { ok: true; awaiting_user: true; key: string; count: number } {
  return { ok: true, awaiting_user: true, key: input.key, count: input.options?.length ?? 0 };
}

/* -------------------------------------------------------------------------- */
/* Node-validity helper used by suggest_next_step callers                      */
/* -------------------------------------------------------------------------- */

export function isNodeValid(kind: NodeKind, config: PresetConfig | undefined): boolean {
  return computeNodeValidity(kind, config).valid;
}
