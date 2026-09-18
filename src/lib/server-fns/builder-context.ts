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
import { CANONICAL_CONSTRUCT_RULES } from "@/lib/pi-construct-rules";
import { BUILDER_ALLOWED_KINDS, summarizeRegistryForContext } from "@/lib/node-registry";

export type BuilderContext = {
  surface: "campaigns.builder";
  campaign: { id: string; name: string; status: string; description?: string } | null;
  dsl: {
    nodes: Array<{ id: string; kind: string; title: string; subtitle?: string; config?: unknown }>;
    edges: Array<{ id: string; source: string; target: string; sourceHandle?: string }>;
  } | null;
  rules: string;
  nodeKinds: ReturnType<typeof summarizeRegistryForContext>;
  assets: {
    voiceAgents: Array<{ id: string; name: string; status: string }>;
    waTemplates: Array<{ id: string; name: string; category: string }>;
    smsTemplates: Array<{ id: string; name: string; category?: string }>;
    rcsTemplates: Array<{ id: string; name: string }>;
    tools: Array<{ handle: string; description: string }>;
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
  // fails, that slice is [] but the rest of the context still ships.
  const [voiceAgents, waTemplates, smsTemplates, rcsTemplates, tools] = await Promise.all([
    (async () => {
      if (!hasDb) return [];
      try {
        const map = await agentsDb.listAgents();
        return Object.values(map).map((a) => ({ id: a.id, name: a.name, status: a.status }));
      } catch { return []; }
    })(),
    (async () => {
      if (!hasDb) return [];
      try {
        const list = await waDb.listWaTemplates();
        return list.map((t) => ({ id: t.id, name: t.name, category: t.category }));
      } catch { return []; }
    })(),
    (async () => {
      if (!hasDb) return [];
      try {
        const list = await smsDb.listSmsTemplates();
        return list.map((t) => ({ id: t.id, name: t.name, category: t.category }));
      } catch { return []; }
    })(),
    (async () => {
      if (!hasDb) return [];
      try {
        const list = await rcsDb.listRcsTemplates();
        return list.map((t) => ({ id: t.id, name: t.name }));
      } catch { return []; }
    })(),
    (async () => {
      if (!hasDb) return [];
      try {
        const list = await toolsDb.listTools();
        return list.map((t) => ({ handle: t.handle, description: t.description }));
      } catch { return []; }
    })(),
  ]);

  return {
    surface: "campaigns.builder",
    campaign,
    dsl,
    rules: CANONICAL_CONSTRUCT_RULES,
    nodeKinds: summarizeRegistryForContext(BUILDER_ALLOWED_KINDS),
    assets: { voiceAgents, waTemplates, smsTemplates, rcsTemplates, tools },
  };
}
