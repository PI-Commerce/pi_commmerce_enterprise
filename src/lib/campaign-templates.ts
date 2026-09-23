/**
 * Campaign Template Library — store, publish pipeline, and tenant copies.
 *
 * A template is a campaign's flow graph (the DSL) with tenant-bound resource
 * references stripped, plus catalog metadata. A superadmin publishes any saved
 * campaign as a template; every tenant browses the catalog, copies one into their
 * workspace, binds the missing resources, and launches. Copying is a fork — there
 * is no ongoing sync (PRD §1).
 *
 * Everything here is in-memory (module-level store + `useSyncExternalStore`,
 * matching `waba-store` / `connections` / `template-store`). A hard refresh
 * replays the seed catalog. Two stores live here because they are two halves of
 * one loop: the catalog of published templates, and the copies a tenant has made
 * from it — a copy needs the same scrub the publish produced, so both read one
 * scrub pass.
 */
import { useSyncExternalStore } from "react";
import type { Edge, Node } from "reactflow";
import type { WorkflowNodeData, NodeKind, PresetSchemaField } from "./campaign-types";
import { EXAMPLE_CAMPAIGNS } from "./campaign-examples";

/* ============================================================== *
 *  Types
 * ============================================================== */

export type TemplateCategory =
  | "reactivation"
  | "onboarding"
  | "retention"
  | "conversion"
  | "winback"
  | "awareness";

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: "reactivation", label: "Reactivation" },
  { id: "onboarding", label: "Onboarding" },
  { id: "retention", label: "Retention" },
  { id: "conversion", label: "Conversion" },
  { id: "winback", label: "Win-back" },
  { id: "awareness", label: "Awareness" },
];

export const CATEGORY_LABEL: Record<TemplateCategory, string> = Object.fromEntries(
  TEMPLATE_CATEGORIES.map((c) => [c.id, c.label]),
) as Record<TemplateCategory, string>;

/** A declared audience attribute the flow depends on. Retained on publish (§7.6). */
export type AudienceAttr = { name: string; type: PresetSchemaField["type"] };

/** One field the scrub pass emptied — shown as a confirmation diff at publish (§7.1). */
export type ScrubItem = { nodeId: string; nodeLabel: string; field: string; had: string };

/** A non-blocking lint finding surfaced to the superadmin at publish (§7.3). */
export type LintWarning = { nodeId?: string; nodeLabel?: string; message: string };

/** One immutable published version (§9). Copies record `{template_id, version}` only. */
export type TemplateVersion = { version: number; date: string; note: string };

export type ChannelLabel = "WhatsApp" | "Voice" | "SMS" | "API";

export type CampaignTemplate = {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  channels: ChannelLabel[];
  /** Current advisory version shown in the catalog. */
  version: number;
  /** Per-version changelog, newest last. */
  versions: TemplateVersion[];
  /** Human setup steps derived from the emptied fields, editable at publish (§7.4). */
  setupSteps: string[];
  /** The one contract that can't be reconstructed after copy (§7.6). */
  audienceSchema: AudienceAttr[];
  /** Optional performance benchmark from the originating campaign. */
  performance?: string;
  /** Optional recommended audience size / eligibility notes. */
  audienceNotes?: string;
  /** Source campaign — used to render the (unscrubbed) preview via WorkflowCanvas. */
  sourceCampaignId: string;
  /** The scrubbed graph a copy is forked from. */
  scrubbed: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] };
  /** What the scrub pass emptied — retained for the detail view's transparency. */
  scrubItems: ScrubItem[];
  /** Client/tenant accounts this template is enabled for (chosen at publish). */
  enabledClientIds: string[];
  status: "published" | "archived";
  createdAt: string;
  analytics: { copies: number; launches: number; tenants: number };
};

/** Client/tenant accounts a template can be enabled for (in-memory prototype list). */
export const TEMPLATE_CLIENTS: { id: string; name: string }[] = [
  { id: "cl_fcc", name: "FCC — First Choice Credit" },
  { id: "cl_acme", name: "Acme Retail" },
  { id: "cl_nova", name: "Nova Telecom" },
  { id: "cl_orbit", name: "Orbit Financial" },
  { id: "cl_pulse", name: "Pulse Health" },
  { id: "cl_zenith", name: "Zenith Mobility" },
];

/** A tenant's forked campaign — a normal draft, plus provenance and a setup debt. */
export type CampaignCopy = {
  id: string;
  name: string;
  status: "draft";
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  templateId: string;
  templateName: string;
  version: number;
  setupSteps: string[];
  /** Count of nodes still missing a bound resource — the campaign-list error count (§8). */
  errorCount: number;
  createdAtTs: number;
};

/* ============================================================== *
 *  Scrub pass (§7.2) — strip tenant-bound resource references
 * ============================================================== *
 * The flow graph, node ordering, branch/split structure, message copy, variable
 * slot names, and the audience *schema* are all retained. Only the bindings that
 * point at a specific tenant's resources are emptied — and each emptied node is
 * marked invalid so the copy lands in the builder already showing what to fix.
 *
 * The map is centralized here so a new node kind is covered by declaring its
 * tenant-bound fields once, rather than in every surface that renders a node.
 */
type ScrubRule = { fields: { key: keyof WorkflowNodeData["config"] & string; label: string }[]; error: string };

const SCRUB_RULES: Partial<Record<NodeKind, ScrubRule>> = {
  whatsapp: {
    fields: [
      { key: "waTemplate", label: "WhatsApp template" },
      { key: "waNumber", label: "WhatsApp number / WABA" },
    ],
    error: "Pick template",
  },
  voiceCall: {
    fields: [{ key: "agent", label: "Voice agent" }],
    error: "Select agent",
  },
  sms: {
    fields: [
      { key: "senderId", label: "Sender ID" },
      { key: "peId", label: "Header / PE ID" },
    ],
    error: "Add sender ID",
  },
  apiToolCall: {
    fields: [{ key: "apiTool", label: "API tool / webhook" }],
    error: "Select API tool",
  },
  audience: {
    fields: [
      { key: "fileName", label: "Audience list (source)" },
      { key: "rowCount", label: "Audience size" },
      { key: "csvPreview", label: "Sample rows" },
    ],
    error: "Select source",
  },
};

function nodeLabel(n: Node<WorkflowNodeData>): string {
  return n.data.serial || n.data.title || n.id;
}

/** Run the scrub pass over a graph. Returns the scrubbed nodes and the removed diff. */
export function scrubGraph(nodes: Node<WorkflowNodeData>[]): {
  nodes: Node<WorkflowNodeData>[];
  removed: ScrubItem[];
} {
  const removed: ScrubItem[] = [];
  const scrubbed = nodes.map((n) => {
    const rule = SCRUB_RULES[n.data.kind];
    if (!rule) return n;
    const config = { ...(n.data.config ?? {}) } as Record<string, unknown>;
    let touched = false;
    for (const f of rule.fields) {
      const had = config[f.key];
      if (had != null && !(Array.isArray(had) && had.length === 0) && had !== "") {
        removed.push({
          nodeId: n.id,
          nodeLabel: nodeLabel(n),
          field: f.label,
          had: Array.isArray(had) ? `${had.length} rows` : String(had),
        });
      }
      if (had !== undefined) {
        config[f.key] = Array.isArray(had) ? [] : "";
        touched = true;
      }
    }
    if (!touched) return n;
    return {
      ...n,
      data: { ...n.data, preset: false, valid: false, error: rule.error, config: config as WorkflowNodeData["config"] },
    };
  });
  return { nodes: scrubbed, removed };
}

/* ============================================================== *
 *  Derivations — channels, audience schema, setup steps
 * ============================================================== */

const CHANNEL_OF: Partial<Record<NodeKind, ChannelLabel>> = {
  whatsapp: "WhatsApp",
  voiceCall: "Voice",
  sms: "SMS",
  apiToolCall: "API",
};

export function deriveChannels(nodes: Node<WorkflowNodeData>[]): ChannelLabel[] {
  const order: ChannelLabel[] = ["WhatsApp", "Voice", "SMS", "API"];
  const present = new Set<ChannelLabel>();
  for (const n of nodes) {
    const ch = CHANNEL_OF[n.data.kind];
    if (ch) present.add(ch);
  }
  return order.filter((c) => present.has(c));
}

/** The declared audience schema — retained on publish so branch logic stays meaningful. */
export function deriveAudienceSchema(nodes: Node<WorkflowNodeData>[]): AudienceAttr[] {
  const aud = nodes.find((n) => n.data.kind === "audience");
  const cfg = aud?.data.config;
  if (!cfg) return [];
  if (cfg.audienceMode === "api" && cfg.fields?.length) {
    return cfg.fields.map((f) => ({ name: f.name, type: f.type }));
  }
  const keys = cfg.csvKeys ?? [];
  return keys.map((k) => ({ name: k, type: "String" as const }));
}

/** A default, editable setup-steps list generated from the emptied fields (§7.4, Q4). */
export function deriveSetupSteps(removed: ScrubItem[], schema: AudienceAttr[]): string[] {
  const steps: string[] = [];
  const byField = new Map<string, number>();
  for (const r of removed) byField.set(r.field, (byField.get(r.field) ?? 0) + 1);

  const count = (label: string, plural?: string) => {
    const n = byField.get(label) ?? 0;
    if (!n) return;
    steps.push(n > 1 ? `${plural ?? label} (${n})` : label);
  };
  if ((byField.get("Audience list (source)") ?? 0) > 0) {
    steps.push("Select an audience source and confirm the phone column");
  }
  if (schema.length) {
    steps.push(`Map ${schema.length} audience attribute${schema.length > 1 ? "s" : ""} to your data model`);
  }
  count("WhatsApp template", "Bind WhatsApp templates");
  if ((byField.get("WhatsApp template") ?? 0) === 1) {
    // replace the singular label with a friendlier imperative
    const i = steps.indexOf("WhatsApp template");
    if (i >= 0) steps[i] = "Bind the WhatsApp template and number";
  }
  count("Voice agent", "Assign voice agents");
  if ((byField.get("Voice agent") ?? 0) === 1) {
    const i = steps.indexOf("Voice agent");
    if (i >= 0) steps[i] = "Assign the voice agent and caller ID";
  }
  count("Sender ID", "Set SMS sender IDs");
  count("API tool / webhook", "Connect API tools / webhooks");
  return steps;
}

/* ============================================================== *
 *  Lint pass (§7.3) — non-blocking warnings at publish time
 * ============================================================== */

const PHONE_RE = /\+?\d[\d ()-]{7,}\d/;
const URL_RE = /https?:\/\/|www\.[a-z]/i;
const OFFER_RE = /\b\d{1,3}\s?%\s?off\b|\bpromo\s?code\b|\bcoupon\b/i;

function scanCopy(text: string): string | null {
  if (PHONE_RE.test(text)) return "looks like a phone number";
  if (URL_RE.test(text)) return "contains a URL";
  if (OFFER_RE.test(text)) return "contains an offer code";
  return null;
}

/** Attributes produced at runtime by upstream nodes — legitimately absent from the
 *  audience schema, so a branch on them must not be flagged. */
const RUNTIME_ATTR_RE = /(status|_state|result|outcome|call_|reply|response)/i;

export function lintGraph(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
  schema: AudienceAttr[],
): LintWarning[] {
  const warnings: LintWarning[] = [];
  const schemaNames = new Set(schema.map((a) => a.name.replace(/^contact\./, "")));

  // Message copy that still carries a literal value.
  for (const n of nodes) {
    const cfg = n.data.config ?? {};
    const copy = [cfg.waBody, cfg.smsBody].filter(Boolean).join(" ");
    if (copy) {
      const hit = scanCopy(copy);
      if (hit) warnings.push({ nodeId: n.id, nodeLabel: nodeLabel(n), message: `Message copy ${hit}` });
    }
  }

  // Branch conditions referencing an attribute not in the declared schema.
  for (const n of nodes) {
    if (n.data.kind !== "conditional") continue;
    for (const b of n.data.config?.branches ?? []) {
      const raw = (b.variable ?? "").replace(/^contact\./, "");
      if (!raw || RUNTIME_ATTR_RE.test(raw) || schemaNames.has(raw)) continue;
      warnings.push({
        nodeId: n.id,
        nodeLabel: nodeLabel(n),
        message: `Branch on “${raw}” is not in the declared audience schema`,
      });
    }
  }

  // Nodes with no reachable inbound path from Start.
  const start = nodes.find((n) => n.data.kind === "start");
  if (start) {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      const list = adj.get(e.source) ?? [];
      list.push(e.target);
      adj.set(e.source, list);
    }
    const seen = new Set<string>([start.id]);
    const queue = [start.id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of adj.get(cur) ?? []) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    for (const n of nodes) {
      if (n.data.kind === "start") continue;
      if (!seen.has(n.id)) {
        warnings.push({ nodeId: n.id, nodeLabel: nodeLabel(n), message: "Node has no reachable inbound path" });
      }
    }
  }

  return warnings;
}

/* ============================================================== *
 *  Publish pipeline — assemble a template from a source campaign
 * ============================================================== */

function cloneGraph(nodes: Node<WorkflowNodeData>[], edges: Edge[]) {
  return {
    nodes: structuredClone(nodes) as Node<WorkflowNodeData>[],
    edges: structuredClone(edges) as Edge[],
  };
}

/** Everything the publish dialog computes up-front from a source campaign. */
export function analyzeSource(sourceCampaignId: string) {
  const src = EXAMPLE_CAMPAIGNS[sourceCampaignId];
  const graph = src ? cloneGraph(src.nodes, src.edges) : { nodes: [], edges: [] };
  const { nodes: scrubbedNodes, removed } = scrubGraph(graph.nodes);
  const schema = deriveAudienceSchema(graph.nodes);
  return {
    name: src?.name ?? "Untitled campaign",
    channels: deriveChannels(graph.nodes),
    audienceSchema: schema,
    scrubItems: removed,
    setupSteps: deriveSetupSteps(removed, schema),
    lint: lintGraph(graph.nodes, graph.edges, schema),
    scrubbed: { nodes: scrubbedNodes, edges: graph.edges },
  };
}

export type PublishInput = {
  sourceCampaignId: string;
  name: string;
  description: string;
  category: TemplateCategory;
  setupSteps: string[];
  performance?: string;
  audienceNotes?: string;
  /** Client/tenant accounts the published template is enabled for. */
  enabledClientIds: string[];
  /**
   * When set, publish as a new *version* of this existing template (chosen by the
   * superadmin) rather than minting a fresh catalog entry. Absent = new template.
   */
  targetTemplateId?: string;
};

/* ============================================================== *
 *  Template store
 * ============================================================== */

let templates: CampaignTemplate[] = [];
const tListeners = new Set<() => void>();
function tEmit() { for (const l of tListeners) l(); }
function tSubscribe(cb: () => void) { tListeners.add(cb); return () => tListeners.delete(cb); }

export function useTemplates(): CampaignTemplate[] {
  return useSyncExternalStore(tSubscribe, () => templates, () => templates);
}
export function getTemplates(): CampaignTemplate[] { return templates; }
export function getTemplate(id: string): CampaignTemplate | undefined {
  return templates.find((t) => t.id === id);
}

function today(): string {
  return new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Publish a source campaign as a template. Re-publishing an already-published
 * source mints a new version and prepends its changelog; a fresh source starts at
 * v1. Existing tenant copies are unaffected either way (§7.1, §9).
 */
export function publishTemplate(input: PublishInput): CampaignTemplate {
  const analysis = analyzeSource(input.sourceCampaignId);
  // Versioning target is explicit: the caller either names the template to bump
  // (`targetTemplateId`) or omits it to mint a brand-new catalog entry.
  const existing = input.targetTemplateId
    ? templates.find((t) => t.id === input.targetTemplateId)
    : undefined;

  if (existing) {
    const version = existing.version + 1;
    const updated: CampaignTemplate = {
      ...existing,
      name: input.name,
      description: input.description,
      category: input.category,
      channels: analysis.channels,
      setupSteps: input.setupSteps,
      audienceSchema: analysis.audienceSchema,
      performance: input.performance,
      audienceNotes: input.audienceNotes,
      enabledClientIds: input.enabledClientIds,
      // A new source campaign can back this version — keep the template pointed at it.
      sourceCampaignId: input.sourceCampaignId,
      scrubbed: analysis.scrubbed,
      scrubItems: analysis.scrubItems,
      status: "published",
      version,
      versions: [...existing.versions, { version, date: today(), note: "Re-published with edits." }],
    };
    templates = templates.map((t) => (t.id === existing.id ? updated : t));
    tEmit();
    return updated;
  }

  const tpl: CampaignTemplate = {
    id: `tpl_${Date.now().toString(36)}`,
    name: input.name,
    description: input.description,
    category: input.category,
    channels: analysis.channels,
    version: 1,
    versions: [{ version: 1, date: today(), note: "Initial version." }],
    setupSteps: input.setupSteps,
    audienceSchema: analysis.audienceSchema,
    performance: input.performance,
    audienceNotes: input.audienceNotes,
    sourceCampaignId: input.sourceCampaignId,
    scrubbed: analysis.scrubbed,
    scrubItems: analysis.scrubItems,
    enabledClientIds: input.enabledClientIds,
    status: "published",
    createdAt: today(),
    analytics: { copies: 0, launches: 0, tenants: 0 },
  };
  templates = [tpl, ...templates];
  tEmit();
  return tpl;
}

/** Delist from the catalog and archive. Existing copies keep running (§7.7). */
export function unpublishTemplate(id: string) {
  templates = templates.map((t) => (t.id === id ? { ...t, status: "archived" as const } : t));
  tEmit();
}

export function republishTemplate(id: string) {
  templates = templates.map((t) => (t.id === id ? { ...t, status: "published" as const } : t));
  tEmit();
}

/* ============================================================== *
 *  Copies store — a tenant's forks
 * ============================================================== */

let copies: CampaignCopy[] = [];
const cListeners = new Set<() => void>();
function cEmit() { for (const l of cListeners) l(); }
function cSubscribe(cb: () => void) { cListeners.add(cb); return () => cListeners.delete(cb); }

export function useCampaignCopies(): CampaignCopy[] {
  return useSyncExternalStore(cSubscribe, () => copies, () => copies);
}
export function getCampaignCopy(id: string): CampaignCopy | undefined {
  return copies.find((c) => c.id === id);
}

/**
 * Core fork — deep-clones a template's scrubbed graph into a fresh draft copy so
 * later edits never touch the catalog, and returns the new campaign id for the
 * builder to open. Deliberately does NOT mutate any template/catalog state.
 */
function forkTemplate(template: CampaignTemplate): string {
  const { nodes, edges } = cloneGraph(template.scrubbed.nodes, template.scrubbed.edges);
  const id = `c_copy_${Date.now().toString(36)}`;
  const errorCount = nodes.filter((n) => n.data.valid === false).length;
  const copy: CampaignCopy = {
    id,
    name: template.name,
    status: "draft",
    nodes,
    edges,
    templateId: template.id,
    templateName: template.name,
    version: template.version,
    setupSteps: template.setupSteps,
    errorCount,
    createdAtTs: Date.now(),
  };
  copies = [copy, ...copies];
  cEmit();
  return id;
}

/**
 * Admin fork from the (super-admin) Template section. Forks the draft AND bumps
 * the template's copy count so the catalog's adoption metrics stay accurate.
 */
export function copyTemplate(template: CampaignTemplate): string {
  const id = forkTemplate(template);
  templates = templates.map((t) =>
    t.id === template.id ? { ...t, analytics: { ...t.analytics, copies: t.analytics.copies + 1 } } : t,
  );
  tEmit();
  return id;
}

/**
 * Tenant self-service fork from the campaign create flow. Independent of the
 * Template section by design: it forks a working draft but never reads into the
 * section's routes nor mutates catalog analytics/state.
 */
export function forkTemplateToCampaign(template: CampaignTemplate): string {
  return forkTemplate(template);
}

/* ============================================================== *
 *  Seed catalog — a few example campaigns pre-published
 * ============================================================== */

type Seed = {
  sourceCampaignId: string;
  name: string;
  description: string;
  category: TemplateCategory;
  performance?: string;
  audienceNotes?: string;
  analytics: { copies: number; launches: number; tenants: number };
  versions?: TemplateVersion[];
  enabledClientIds?: string[];
};

const SEEDS: Seed[] = [
  {
    sourceCampaignId: "c_ex17",
    name: "FCC Loyalty — Redemption Nudge",
    description:
      "Multi-channel loyalty journey that segments members by points balance, then reminds and re-nudges them to redeem before expiry. WhatsApp-led with a voice fallback for high-value members.",
    category: "retention",
    performance: "34% redemption uplift vs. control on the originating campaign",
    audienceNotes: "Best for 5k–50k loyalty members with a points balance and tier attribute.",
    analytics: { copies: 12, launches: 9, tenants: 7 },
    versions: [
      { version: 1, date: "2 May 2026", note: "Initial version." },
      { version: 2, date: "18 Jun 2026", note: "Added the voice fallback branch for high-tier members." },
    ],
  },
  {
    sourceCampaignId: "c_ex7",
    name: "New Customer Activation",
    description:
      "Routes newly registered users by purchase intent, then drives a guided first purchase over voice and WhatsApp with an A/B tested welcome offer.",
    category: "onboarding",
    performance: "1.8× first-purchase rate on the originating campaign",
    analytics: { copies: 8, launches: 5, tenants: 4 },
  },
  {
    sourceCampaignId: "c_ex9",
    name: "Lapsed Customer Win-back",
    description:
      "Re-engages dormant customers with a staged WhatsApp + voice sequence and a conversion check that reattempts non-responders once.",
    category: "winback",
    analytics: { copies: 5, launches: 3, tenants: 3 },
  },
  {
    sourceCampaignId: "c_ex10",
    name: "Subscription Conversion",
    description:
      "Converts free or trial users to a paid subscription with a delay-paced nudge sequence and an outcome branch that escalates warm leads to a voice call.",
    category: "conversion",
    audienceNotes: "Works best on trial cohorts within 14 days of signup.",
    analytics: { copies: 3, launches: 1, tenants: 1 },
  },
];

function buildSeed(seed: Seed): CampaignTemplate {
  const analysis = analyzeSource(seed.sourceCampaignId);
  const versions = seed.versions ?? [{ version: 1, date: "2 May 2026", note: "Initial version." }];
  return {
    id: `tpl_seed_${seed.sourceCampaignId}`,
    name: seed.name,
    description: seed.description,
    category: seed.category,
    channels: analysis.channels,
    version: versions[versions.length - 1].version,
    versions,
    setupSteps: analysis.setupSteps,
    audienceSchema: analysis.audienceSchema,
    performance: seed.performance,
    audienceNotes: seed.audienceNotes,
    sourceCampaignId: seed.sourceCampaignId,
    scrubbed: analysis.scrubbed,
    scrubItems: analysis.scrubItems,
    enabledClientIds: seed.enabledClientIds ?? TEMPLATE_CLIENTS.map((c) => c.id),
    status: "published",
    createdAt: versions[0].date,
    analytics: seed.analytics,
  };
}

templates = SEEDS.map(buildSeed);
