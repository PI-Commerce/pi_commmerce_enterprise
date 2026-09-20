/**
 * Builder-scope context assembler.
 *
 * `askPi` calls this once per turn (builder scope only) to produce the
 * compact JSON that gets injected into Pi's system context. The goal is
 * that Pi ALWAYS sees:
 *
 *   - Which campaign is being edited (id + name + status).
 *   - The current DSL (nodes + edges) so Pi can cite what's already there.
 *   - The canonical construct rules (`CANONICAL_CONSTRUCT_RULES`).
 *   - The node registry limited to kinds Pi is allowed to use.
 *   - The real workspace assets Pi is allowed to wire — voice agents, WA
 *     templates, SMS templates, RCS templates, API tools. Compact shape
 *     (id + label + one-line hint) so the prompt stays cheap.
 *
 * Never trust that the LLM will remember the state between turns. Cheap to
 * re-inject; expensive to fix an invalid graph after the fact.
 */
import { getEnv } from "@/lib/db/client";
import * as campaigns from "@/lib/db/campaigns";
import * as agentsDb from "@/lib/db/agents";
import * as waDb from "@/lib/db/wa-templates";
import * as smsDb from "@/lib/db/sms-templates";
import * as rcsDb from "@/lib/db/rcs-templates";
import * as toolsDb from "@/lib/db/tools";
import * as freeformDb from "@/lib/db/freeform-workflows";
import { CANONICAL_CONSTRUCT_RULES } from "@/lib/pi-construct-rules";
import { BUILDER_ALLOWED_KINDS, summarizeRegistryForContext } from "@/lib/node-registry";
import { computeAllValidity } from "@/lib/node-validity";
import { summarizeCatalogForContext } from "@/lib/pi-skills-catalog";

export type BuilderContext = {
  surface: "campaigns.builder";
  campaign: { id: string; name: string; status: string; description?: string } | null;
  dsl: {
    nodes: Array<{ id: string; kind: string; title: string; subtitle?: string; config?: unknown }>;
    edges: Array<{ id: string; source: string; target: string; sourceHandle?: string }>;
  } | null;
  /** Per-node validity, one entry per node in `dsl.nodes`. Pi cites this
   *  when asking about missing config ("your Voice node is missing an
   *  agent — pick one?") or when confirming a save is safe. */
  validity: Array<{ nodeId: string; kind: string; valid: boolean; error?: string }>;
  rules: string;
  nodeKinds: ReturnType<typeof summarizeRegistryForContext>;
  /** The catalog of canonical (industry × usecase) skeletons Pi can pull
   *  via `suggest_skeleton`. Compact — no full skeleton bodies here. */
  skillCatalog: ReturnType<typeof summarizeCatalogForContext>;
  assets: {
    voiceAgents: Array<{ id: string; name: string; status: string }>;
    waTemplates: Array<{ id: string; name: string; category: string }>;
    freeformWorkflows: Array<{ id: string; name: string; status: string }>;
    smsTemplates: Array<{ id: string; name: string; category?: string }>;
    rcsTemplates: Array<{ id: string; name: string }>;
    tools: Array<{ handle: string; description: string }>;
  };
  /** Diagnostic — surfaces WHY a catalog might be empty so we can tell
   *  "no D1 binding" from "table is empty" from "read threw an error" from
   *  Cloudflare logs. Not read by the LLM; the server logs it before
   *  dispatch. */
  _diag: {
    hasDb: boolean;
    voiceAgentsErr?: string;
    waTemplatesErr?: string;
    freeformWorkflowsErr?: string;
    smsTemplatesErr?: string;
    rcsTemplatesErr?: string;
    toolsErr?: string;
  };
};

/**
 * Assemble the builder context for a given campaign id. Any single asset
 * lookup that fails degrades to an empty list — we never let one broken
 * catalog dead-end the whole context.
 */
export async function assembleBuilderContext(campaignId: string | undefined): Promise<BuilderContext> {
  const hasDb = (() => {
    try { return !!getEnv().DB; } catch { return false; }
  })();

  let campaign: BuilderContext["campaign"] = null;
  let dsl: BuilderContext["dsl"] = null;

  if (hasDb && campaignId) {
    try {
      const full = await campaigns.readCampaign(campaignId);
      if (full) {
        campaign = { id: full.id, name: full.name, status: full.status, description: full.description };
        dsl = {
          nodes: full.nodes.map((n) => ({
            id: n.id,
            kind: n.kind,
            title: n.title,
            subtitle: n.subtitle,
            config: n.config,
          })),
          edges: full.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
          })),
        };
      }
    } catch { /* leave campaign + dsl null */ }
  }

  // Asset catalogs — every one is defensive. If D1 isn't bound or a list
  // fails, that slice is [] but the rest of the context still ships. Any
  // error is stashed in _diag so we can debug from Cloudflare logs.
  const diag: BuilderContext["_diag"] = { hasDb };

  const [voiceAgents, waTemplates, freeformWorkflows, smsTemplates, rcsTemplates, tools] = await Promise.all([
    (async () => {
      if (!hasDb) return [];
      try {
        const map = await agentsDb.listAgents();
        return Object.values(map).map((a) => ({ id: a.id, name: a.name, status: a.status }));
      } catch (e) {
        diag.voiceAgentsErr = (e as Error).message;
        return [];
      }
    })(),
    (async () => {
      if (!hasDb) return [];
      try {
        const list = await waDb.listWaTemplates();
        return list.map((t) => ({ id: t.id, name: t.name, category: t.category }));
      } catch (e) {
        diag.waTemplatesErr = (e as Error).message;
        return [];
      }
    })(),
    (async () => {
      if (!hasDb) return [];
      try {
        const list = await freeformDb.listFreeformWorkflows();
        // Only workflows in `ready` status are pickable (matches the config
        // panel's own picker gate). Draft / locked workflows are hidden.
        return list
          .filter((w) => w.status === "ready")
          .map((w) => ({ id: w.id, name: w.name, status: w.status }));
      } catch (e) {
        diag.freeformWorkflowsErr = (e as Error).message;
        return [];
      }
    })(),
    (async () => {
      if (!hasDb) return [];
      try {
        const list = await smsDb.listSmsTemplates();
        return list.map((t) => ({ id: t.id, name: t.name, category: t.category }));
      } catch (e) {
        diag.smsTemplatesErr = (e as Error).message;
        return [];
      }
    })(),
    (async () => {
      if (!hasDb) return [];
      try {
        const list = await rcsDb.listRcsTemplates();
        return list.map((t) => ({ id: t.id, name: t.name }));
      } catch (e) {
        diag.rcsTemplatesErr = (e as Error).message;
        return [];
      }
    })(),
    (async () => {
      if (!hasDb) return [];
      try {
        const list = await toolsDb.listTools();
        return list.map((t) => ({ handle: t.handle, description: t.description }));
      } catch (e) {
        diag.toolsErr = (e as Error).message;
        return [];
      }
    })(),
  ]);

  // Server log — visible in Cloudflare Workers logs / `wrangler tail`.
  // Shows the exact counts + any error messages, so when a Pi turn returns
  // "no voice agents" we can distinguish D1-unbound / read-threw / really-empty.
  // eslint-disable-next-line no-console
  console.log("[builder-context]", JSON.stringify({
    campaignId: campaignId ?? null,
    hasDb,
    voiceAgents: voiceAgents.length,
    waTemplates: waTemplates.length,
    freeformWorkflows: freeformWorkflows.length,
    smsTemplates: smsTemplates.length,
    rcsTemplates: rcsTemplates.length,
    tools: tools.length,
    diag,
  }));

  // Registry-driven per-node validity for the current DSL. Cheap to
  // compute (pure), and Pi uses it to proactively point out "your Voice
  // node is missing an agent" without needing a separate tool call.
  const validity = dsl ? computeAllValidity(dsl.nodes) : [];

  return {
    surface: "campaigns.builder",
    campaign,
    dsl,
    validity,
    rules: CANONICAL_CONSTRUCT_RULES,
    nodeKinds: summarizeRegistryForContext(BUILDER_ALLOWED_KINDS),
    skillCatalog: summarizeCatalogForContext(),
    assets: { voiceAgents, waTemplates, freeformWorkflows, smsTemplates, rcsTemplates, tools },
    _diag: diag,
  };
}
