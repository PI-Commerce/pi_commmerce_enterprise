/**
 * Pure helpers for the request-body tree used by the API Tool editor.
 *
 * The editor operates on {@link BodyRoot} — a small ordered tree where every
 * node is either a leaf (typed value + source) or a container (object/array).
 * This file owns:
 *  - `serializeBody`  — walk the tree and produce the JSON blob that would be
 *                       sent on the wire. Leaves resolve to either their fixed
 *                       constant, a `{{campaign.<col>}}` placeholder string, or
 *                       (for numbers/booleans bound to campaign) a typed
 *                       placeholder that a future runtime can substitute.
 *  - `parseBody`      — hydrate a tree from an arbitrary JSON blob. Strings of
 *                       the exact form `{{campaign.<col>}}` are recognised and
 *                       become campaign-bound leaves; everything else becomes a
 *                       constant leaf typed by the source value.
 *  - `flattenBody`    — enumerate all leaves with dotted paths (e.g.
 *                       `order.items[0].sku`) so the campaign-side node config
 *                       can render one mapping row per body leaf that expects
 *                       an upstream variable.
 *
 * The tree is deliberately small — no discriminated union, no schema — so the
 * editor UI can stay flat and hand-rolled without pulling in a form library.
 */

import type { BodyNode, BodyRoot, ToolDataType } from "./tool-registry";

let seq = 0;
const uid = (p = "bn") => `${p}_${++seq}_${Date.now().toString(36)}`;

/* --------------------------- constructors --------------------------- */

export function makeLeaf(over: Partial<BodyNode> = {}): BodyNode {
  return {
    id: uid(),
    key: "",
    dataType: "String",
    source: "constant",
    value: "",
    ...over,
  };
}

export function makeObject(over: Partial<BodyNode> = {}): BodyNode {
  return { id: uid(), key: "", dataType: "Object", children: [], ...over };
}

export function makeArray(over: Partial<BodyNode> = {}): BodyNode {
  return { id: uid(), key: "", dataType: "Array", children: [], ...over };
}

export function emptyBody(rootType: "object" | "array" = "object"): BodyRoot {
  return { rootType, nodes: [] };
}

/* --------------------------- serialize --------------------------- */

/** Return the JSON value a leaf serialises to. */
function leafJson(n: BodyNode): unknown {
  const src = n.source ?? "constant";
  const raw = n.value ?? "";
  if (src === "campaign") {
    // Campaign-bound values are rendered as `{{campaign.<col>}}` placeholders
    // regardless of declared type — the substitution happens at runtime.
    return raw ? `{{campaign.${raw}}}` : `{{campaign.<unset>}}`;
  }
  if (src === "agent") return `{{agent.${n.key || "value"}}}`;
  // constant: coerce by declared type
  if (n.dataType === "Number") return raw === "" ? 0 : Number(raw);
  if (n.dataType === "Boolean") return raw === "true";
  return raw;
}

function nodeJson(n: BodyNode): unknown {
  if (n.dataType === "Object") {
    const out: Record<string, unknown> = {};
    for (const c of n.children ?? []) {
      if (!c.key.trim()) continue;
      out[c.key] = nodeJson(c);
    }
    return out;
  }
  if (n.dataType === "Array") {
    return (n.children ?? []).map((c) => nodeJson(c));
  }
  return leafJson(n);
}

export function serializeBody(root: BodyRoot): unknown {
  if (root.rootType === "array") {
    return root.nodes.map((n) => nodeJson(n));
  }
  const out: Record<string, unknown> = {};
  for (const n of root.nodes) {
    if (!n.key.trim()) continue;
    out[n.key] = nodeJson(n);
  }
  return out;
}

/* --------------------------- parse --------------------------- */

const CAMPAIGN_TOKEN = /^\{\{\s*campaign\.([^{}]+?)\s*\}\}$/;

function detectType(v: unknown): ToolDataType {
  if (Array.isArray(v)) return "Array";
  if (v !== null && typeof v === "object") return "Object";
  if (typeof v === "number") return "Number";
  if (typeof v === "boolean") return "Boolean";
  return "String";
}

function fromJson(key: string, v: unknown): BodyNode {
  if (Array.isArray(v)) {
    return { ...makeArray({ key }), children: v.map((item) => fromJson("", item)) };
  }
  if (v !== null && typeof v === "object") {
    const children = Object.entries(v as Record<string, unknown>).map(([k, val]) => fromJson(k, val));
    return { ...makeObject({ key }), children };
  }
  if (typeof v === "string") {
    const m = v.match(CAMPAIGN_TOKEN);
    if (m) return makeLeaf({ key, dataType: "String", source: "campaign", value: m[1] });
    return makeLeaf({ key, dataType: "String", source: "constant", value: v });
  }
  return makeLeaf({ key, dataType: detectType(v), source: "constant", value: String(v) });
}

export function parseBody(json: unknown): BodyRoot {
  if (Array.isArray(json)) {
    return { rootType: "array", nodes: json.map((v) => fromJson("", v)) };
  }
  if (json && typeof json === "object") {
    const nodes = Object.entries(json as Record<string, unknown>).map(([k, v]) => fromJson(k, v));
    return { rootType: "object", nodes };
  }
  return emptyBody();
}

/* --------------------------- enumerate --------------------------- */

export type BodyLeaf = { path: string; node: BodyNode };

/**
 * Depth-first walk that yields every leaf paired with its dotted access path.
 * Used by the campaign-builder side to enumerate mappable slots without
 * needing to know about the tree shape.
 */
export function flattenBody(root: BodyRoot): BodyLeaf[] {
  const out: BodyLeaf[] = [];
  const walk = (n: BodyNode, base: string) => {
    if (n.dataType === "Object") {
      for (const c of n.children ?? []) walk(c, joinKey(base, c.key));
      return;
    }
    if (n.dataType === "Array") {
      (n.children ?? []).forEach((c, i) => walk(c, `${base}[${i}]`));
      return;
    }
    out.push({ path: base, node: n });
  };
  if (root.rootType === "array") {
    root.nodes.forEach((n, i) => walk(n, `[${i}]`));
  } else {
    for (const n of root.nodes) walk(n, n.key);
  }
  return out;
}

function joinKey(base: string, key: string): string {
  if (!base) return key;
  if (!key) return base;
  return `${base}.${key}`;
}
