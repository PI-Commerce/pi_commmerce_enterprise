/**
 * Pre-built showcase campaigns for sales demos.
 *
 * Each entry is a fully hand-authored graph: nodes carry everything the canvas
 * renderer needs (title/subtitle/outputs/abTest/valid) PLUS `preset: true` and a
 * `config` object. When a preset node is opened, the config panel renders the *real*
 * editor for that node kind — exactly as a user would see it — but read-only and
 * hydrated from `config`, so it looks fully configured. Because the panel forces
 * read-only and swallows field-level changes for preset nodes, the authored
 * `outputs`/`abTest` (and the edges that reference them) survive being clicked into.
 *
 * Keyed by campaign id (`c_ex1`, `c_ex2`) — these match the rows in
 * `campaigns.index.tsx` and the `$id` route param.
 */
import type { Edge, Node } from "reactflow";
import type {
  CampaignStatus, WorkflowNodeData, NodeKind, NodeOutput, NodeOutputKind,
  PresetConfig, PresetVarMap,
} from "./campaign-types";
import { whatsappOutputs, resolveWaTemplate } from "./wa-outputs";

export type ExampleCampaign = {
  name: string;
  status: CampaignStatus;
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
};

const EDGE = "routed" as const;

/* ============================================================== */
/* Example 1 — Omni-channel React (value-tiered reactivation)     */
/* Chat AI (WhatsApp) + Voice AI                                  */
/* ============================================================== */

const EX1_CSV_KEYS = [
  "customer_id", "phone", "first_name", "favorite_category",
  "lifetime_order_value", "discount_value", "preferred_lang",
];
const EX1_CSV_PREVIEW = [
  ["C-100482", "+91 98xxx 11023", "Aarav", "Electronics", "48,200", "500", "en"],
  ["C-100517", "+91 98xxx 55218", "Diya", "Fashion", "27,900", "350", "hi"],
  ["C-100643", "+91 98xxx 90087", "Vihaan", "Groceries", "18,400", "200", "en"],
  ["C-100719", "+91 98xxx 41552", "Ananya", "Beauty", "62,750", "750", "hi"],
  ["C-100884", "+91 98xxx 77390", "Kabir", "Electronics", "9,300", "150", "mr"],
];

const EX1_NODES: Node<WorkflowNodeData>[] = [
  {
    id: "start", type: "workflow", position: { x: 400, y: 0 },
    data: { kind: "start", title: "Start", locked: true, valid: true, preset: true },
  },
  {
    id: "audience", type: "workflow", position: { x: 384, y: 120 },
    data: {
      kind: "audience", title: "Audience", subtitle: "CSV · primary key customer_id", valid: true, preset: true,
      config: {
        audienceMode: "csv",
        fileName: "high_value_traders.csv",
        primaryKey: "customer_id",
        phoneCol: "phone",
        csvKeys: EX1_CSV_KEYS,
        csvPreview: EX1_CSV_PREVIEW,
        rowCount: "12,402",
      },
    },
  },
  {
    id: "tier", type: "workflow", position: { x: 384, y: 260 },
    data: {
      kind: "conditional", title: "Value tier", subtitle: "Route on lifetime_order_value", valid: true, preset: true,
      outputs: [
        { id: "high_ltv", label: "High LTV", kind: "branch" },
        { id: "mid_ltv", label: "Mid LTV", kind: "branch" },
      ],
      config: {
        branches: [
          { id: "high_ltv", label: "High LTV", variable: "lifetime_order_value", op: "greater than or equal to", value: "25000" },
          { id: "mid_ltv", label: "Mid LTV", variable: "lifetime_order_value", op: "less than", value: "25000" },
        ],
      },
    },
  },
  // ---- High-LTV track: Chat AI → (drop-off) Voice AI ----
  {
    id: "chat", type: "workflow", position: { x: 384, y: 440 },
    data: {
      kind: "whatsapp", title: "Chat AI · loyalty", subtitle: "WhatsApp · loyalty opener", valid: true, preset: true, piHint: "wa_personalize",
      outputs: [
        { id: "btn_0", label: "Complete purchase", kind: "outcome" },
        { id: "btn_1", label: "Not interested", kind: "outcome" },
        { id: "reply_received", label: "Replied (no button)", kind: "outcome" },
        { id: "session_expired", label: "Session expired (24h)", kind: "outcome" },
      ],
      config: {
        waNumber: "+91 98100 12345 · PiCommerce",
        waMode: "template",
        waTemplate: "10248300981244",
        waVarMap: [
          { v: "{{1}}", def: "contact.first_name" },
          { v: "{{2}}", def: "favorite_category" },
        ],
      },
    },
  },
  {
    id: "delay5", type: "workflow", position: { x: 640, y: 600 },
    data: {
      kind: "delay", title: "Delay · 5 days", subtitle: "Wait 5 days", valid: true, preset: true,
      config: { delayValue: 5, delayUnit: "Days" },
    },
  },
  {
    id: "voice", type: "workflow", position: { x: 400, y: 760 },
    data: {
      kind: "voiceCall", title: "Voice AI call", subtitle: "Conversational reactivation", valid: true, preset: true,
      config: {
        agent: "reactivation_voice",
        voiceVarMap: [
          { v: "{{name}}", def: "contact.first_name" },
          { v: "{{phone}}", def: "contact.phone" },
        ],
        callStart: "09:00",
        callEnd: "20:00",
        timezone: "Asia/Kolkata (IST)",
        maxAttempts: 3,
        retryInterval: "1 hour",
      },
    },
  },
  // ---- Mid-LTV track: Chat AI category offer ----
  {
    id: "chatMid", type: "workflow", position: { x: 40, y: 440 },
    data: {
      kind: "whatsapp", title: "Chat AI · offer", subtitle: "WhatsApp · category offer", valid: true, preset: true,
      config: {
        waNumber: "+91 98100 12345 · PiCommerce",
        waMode: "template",
        waTemplate: "winback_v2 · Marketing",
        waVarMap: [
          { v: "{{1}}", def: "contact.first_name" },
          { v: "{{2}}", def: "favorite_category" },
          { v: "{{3}}", def: "discount_value" },
        ],
      },
    },
  },
  {
    id: "end", type: "workflow", position: { x: 400, y: 940 },
    data: { kind: "end", title: "End", locked: true, valid: true, preset: true },
  },
];

const EX1_EDGES: Edge[] = [
  { id: "ex1-e1", source: "start", target: "audience", type: EDGE },
  { id: "ex1-e2", source: "audience", target: "tier", type: EDGE },
  { id: "ex1-e3", source: "tier", sourceHandle: "high_ltv", target: "chat", type: EDGE },
  { id: "ex1-e4", source: "tier", sourceHandle: "mid_ltv", target: "chatMid", type: EDGE },
  { id: "ex1-e5", source: "chat", sourceHandle: "btn_0", target: "end", type: EDGE },
  { id: "ex1-e6", source: "chat", sourceHandle: "session_expired", target: "voice", type: EDGE },
  { id: "ex1-e7", source: "chat", sourceHandle: "reply_received", target: "delay5", type: EDGE },
  { id: "ex1-e5b", source: "chat", sourceHandle: "btn_1", target: "delay5", type: EDGE },
  { id: "ex1-e8", source: "delay5", target: "voice", type: EDGE },
  { id: "ex1-e9", source: "voice", target: "end", type: EDGE },
  { id: "ex1-e10", source: "chatMid", target: "end", type: EDGE },
];

/* ============================================================== */
/* Example 2 — Voice-led win-back (high-value win-back)           */
/* Voice AI → Chat AI (WhatsApp)                                  */
/* ============================================================== */

const EX2_FIELDS = [
  { id: "f1", name: "customer_id", type: "String" as const },
  { id: "f2", name: "phone", type: "String" as const },
  { id: "f3", name: "first_name", type: "String" as const },
  { id: "f4", name: "avg_basket_value", type: "Number" as const },
  { id: "f5", name: "weeks_inactive", type: "Number" as const },
  { id: "f6", name: "last_item", type: "String" as const },
  { id: "f7", name: "reorder_url", type: "String" as const },
  { id: "f8", name: "preferred_lang", type: "String" as const },
];

const EX2_NODES: Node<WorkflowNodeData>[] = [
  {
    id: "start", type: "workflow", position: { x: 500, y: 0 },
    data: { kind: "start", title: "Start", locked: true, valid: true, preset: true },
  },
  {
    id: "audience", type: "workflow", position: { x: 484, y: 120 },
    data: {
      kind: "audience", title: "Audience", subtitle: "Runtime API · JSON payload", valid: true, preset: true,
      config: {
        audienceMode: "api",
        payloadType: "list",
        fields: EX2_FIELDS,
        phoneField: "phone",
      },
    },
  },
  {
    id: "voice1", type: "workflow", position: { x: 484, y: 300 },
    data: {
      kind: "voiceCall", title: "Voice AI win-back call", subtitle: "Call window 10:00–19:00 IST", valid: true, preset: true,
      config: {
        agent: "winback_voice",
        voiceVarMap: [
          { v: "{{name}}", def: "contact.first_name" },
          { v: "{{phone}}", def: "contact.phone" },
        ],
        callStart: "10:00",
        callEnd: "19:00",
        timezone: "Asia/Kolkata (IST)",
        maxAttempts: 2,
        retryInterval: "1 hour",
      },
    },
  },
  {
    id: "outcome", type: "workflow", position: { x: 484, y: 500 },
    data: {
      kind: "conditional", title: "Outcome routing", subtitle: "Route on call_disposition", valid: true, preset: true,
      outputs: [
        { id: "interested", label: "Interested", kind: "branch" },
        { id: "callback", label: "Callback", kind: "branch" },
        { id: "not_interested", label: "Not interested", kind: "branch" },
        { id: "no_connect", label: "No connect", kind: "branch" },
        { id: "wrong_number", label: "Wrong number", kind: "branch" },
      ],
      config: {
        branches: [
          { id: "interested", label: "Interested", variable: "call_disposition", op: "equals", value: "interested" },
          { id: "callback", label: "Callback", variable: "call_disposition", op: "equals", value: "callback" },
          { id: "not_interested", label: "Not interested", variable: "call_disposition", op: "equals", value: "not_interested" },
          { id: "no_connect", label: "No connect", variable: "call_disposition", op: "equals", value: "no_connect" },
          { id: "wrong_number", label: "Wrong number", variable: "call_disposition", op: "equals", value: "wrong_number" },
        ],
      },
    },
  },
  // ---- Interested path ----
  {
    id: "chat", type: "workflow", position: { x: 120, y: 760 },
    data: {
      kind: "whatsapp", title: "Chat AI · order assist", subtitle: "WhatsApp · interested path", valid: true, preset: true, piHint: "wa_personalize",
      outputs: [
        { id: "btn_0", label: "Pay now", kind: "outcome" },
        { id: "btn_1", label: "Remind me later", kind: "outcome" },
        { id: "reply_received", label: "Replied (no button)", kind: "outcome" },
        { id: "session_expired", label: "Session expired (24h)", kind: "outcome" },
      ],
      config: {
        waNumber: "+91 98100 12345 · PiCommerce",
        waMode: "template",
        waTemplate: "10248301338871",
        waVarMap: [
          { v: "{{1}}", def: "contact.first_name" },
          { v: "{{2}}", def: "last_item" },
        ],
      },
    },
  },
  {
    id: "delay2", type: "workflow", position: { x: 60, y: 980 },
    data: {
      kind: "delay", title: "Delay · 2 days", subtitle: "Wait 2 days", valid: true, preset: true,
      config: { delayValue: 2, delayUnit: "Days" },
    },
  },
  {
    id: "chatReminder", type: "workflow", position: { x: 60, y: 1120 },
    data: {
      kind: "whatsapp", title: "Chat AI · reminder", subtitle: "WhatsApp · reorder reminder", valid: true, preset: true,
      config: {
        waNumber: "+91 98100 12345 · PiCommerce",
        waMode: "template",
        waTemplate: "reorder_v1 · Marketing",
        waVarMap: [
          { v: "{{1}}", def: "contact.first_name" },
          { v: "{{2}}", def: "last_item" },
          { v: "{{3}}", def: "reorder_url" },
        ],
      },
    },
  },
  // ---- Callback path ----
  {
    id: "callbackDelay", type: "workflow", position: { x: 420, y: 760 },
    data: {
      kind: "delay", title: "Delay · to callback", subtitle: "Wait until callback_at", valid: true, preset: true,
      config: { delayValue: 1, delayUnit: "Hours" },
    },
  },
  {
    id: "voice2", type: "workflow", position: { x: 420, y: 920 },
    data: {
      kind: "voiceCall", title: "Voice AI callback", subtitle: "Retry 1× · scheduled callback", valid: true, preset: true,
      config: {
        agent: "reactivation_voice",
        voiceVarMap: [
          { v: "{{name}}", def: "contact.first_name" },
          { v: "{{phone}}", def: "contact.phone" },
        ],
        callStart: "10:00",
        callEnd: "19:00",
        timezone: "Asia/Kolkata (IST)",
        maxAttempts: 1,
        retryInterval: "1 hour",
      },
    },
  },
  // ---- Not-interested path ----
  {
    id: "chatNI", type: "workflow", position: { x: 720, y: 760 },
    data: {
      kind: "whatsapp", title: "Chat AI · soft offer", subtitle: "WhatsApp · not-interested path", valid: true, preset: true,
      config: {
        waNumber: "+91 98100 12345 · PiCommerce",
        waMode: "template",
        waTemplate: "winback_v2 · Marketing",
        waVarMap: [
          { v: "{{1}}", def: "contact.first_name" },
        ],
      },
    },
  },
  // ---- No-connect path ----
  {
    id: "chatNC", type: "workflow", position: { x: 960, y: 760 },
    data: {
      kind: "whatsapp", title: "Chat AI · async", subtitle: "WhatsApp · no-connect path", valid: true, preset: true,
      config: {
        waNumber: "+91 98100 12345 · PiCommerce",
        waMode: "template",
        waTemplate: "onboarding_v1 · Utility",
        waVarMap: [
          { v: "{{1}}", def: "contact.first_name" },
          { v: "{{2}}", def: "last_item" },
        ],
      },
    },
  },
  {
    id: "end", type: "workflow", position: { x: 500, y: 1320 },
    data: { kind: "end", title: "End", locked: true, valid: true, preset: true },
  },
];

const EX2_EDGES: Edge[] = [
  { id: "ex2-e1", source: "start", target: "audience", type: EDGE },
  { id: "ex2-e2", source: "audience", target: "voice1", type: EDGE },
  { id: "ex2-e3", source: "voice1", target: "outcome", type: EDGE },
  { id: "ex2-e4", source: "outcome", sourceHandle: "interested", target: "chat", type: EDGE },
  { id: "ex2-e5", source: "outcome", sourceHandle: "callback", target: "callbackDelay", type: EDGE },
  { id: "ex2-e6", source: "outcome", sourceHandle: "not_interested", target: "chatNI", type: EDGE },
  { id: "ex2-e7", source: "outcome", sourceHandle: "no_connect", target: "chatNC", type: EDGE },
  { id: "ex2-e8", source: "outcome", sourceHandle: "wrong_number", target: "end", type: EDGE },
  { id: "ex2-e9", source: "chat", sourceHandle: "btn_0", target: "end", type: EDGE },
  { id: "ex2-e10", source: "chat", sourceHandle: "session_expired", target: "delay2", type: EDGE },
  { id: "ex2-e11", source: "chat", sourceHandle: "reply_received", target: "end", type: EDGE },
  { id: "ex2-e9b", source: "chat", sourceHandle: "btn_1", target: "delay2", type: EDGE },
  { id: "ex2-e12", source: "delay2", target: "chatReminder", type: EDGE },
  { id: "ex2-e13", source: "chatReminder", target: "end", type: EDGE },
  { id: "ex2-e14", source: "callbackDelay", target: "voice2", type: EDGE },
  { id: "ex2-e15", source: "voice2", target: "end", type: EDGE },
  { id: "ex2-e16", source: "chatNI", target: "end", type: EDGE },
  { id: "ex2-e17", source: "chatNC", target: "end", type: EDGE },
];

/* ============================================================== */
/* Sales-team example library — 14 journeys.                      */
/*                                                                */
/* Authored from compact specs + node factories; positions are    */
/* auto-laid-out (longest-path depth → y, siblings spread on x).   */
/* Every node carries preset:true so the builder opens it in the   */
/* real (now interactive) editor, hydrated from config. Currency   */
/* and timezone strings in labels/subtitles are localized to the   */
/* active country at render time (see WorkflowCanvas).             */
/* ============================================================== */

type Spec = {
  id: string;
  kind: NodeKind;
  title: string;
  subtitle?: string;
  locked?: boolean;
  outputs?: NodeOutput[];
  abTest?: { variants: { label: string; pct: number }[] };
  config?: PresetConfig;
};
type SpecEdge = { from: string; to: string; port?: string };

const NAME_VAR: PresetVarMap[] = [{ v: "{{1}}", def: "contact.first_name" }];

/* ---- node factories ---------------------------------------------------- */

const sStart = (): Spec => ({ id: "start", kind: "start", title: "Start", locked: true });
const sEnd = (id = "end"): Spec => ({ id, kind: "end", title: "End", locked: true });

const sAud = (subtitle: string, keys: string[]): Spec => ({
  id: "aud", kind: "audience", title: "Audience", subtitle,
  config: {
    audienceMode: "csv", fileName: "audience.csv", primaryKey: "customer_id", phoneCol: "phone",
    csvKeys: ["customer_id", "phone", "first_name", ...keys], rowCount: "—",
  },
});

const sCond = (
  id: string, title: string, variable: string,
  branches: { id: string; label: string; op?: string; value?: string; value2?: string }[],
): Spec => ({
  id, kind: "conditional", title, subtitle: `Route on ${variable}`,
  outputs: branches.map((b) => ({ id: b.id, label: b.label, kind: "branch" as NodeOutputKind })),
  config: { branches: branches.map((b) => ({
    id: b.id, label: b.label, variable,
    op: b.op ?? "equals",
    value: b.value ?? b.id,
    ...(b.value2 !== undefined ? { value2: b.value2 } : {}),
  })) },
});

// A true A/B *split* node: splits traffic into separate variant outputs, each
// wired to its own downstream node. Use this (not sAb) when the variants are
// genuinely different messages/paths rather than one message tested two ways.
const sAbSplit = (
  id: string, title: string, subtitle: string,
  variants: { id: string; label: string; pct?: number }[],
): Spec => ({
  id, kind: "abSplit", title, subtitle,
  outputs: variants.map((v) => ({ id: v.id, label: `${v.label} · ${v.pct ?? 50}%`, kind: "variant" as NodeOutputKind })),
  config: { splitVariants: variants.map((v) => ({ id: v.id, label: v.label, pct: v.pct ?? 50 })) },
});

const sVoice = (id: string, title: string, subtitle?: string, cfg?: Partial<PresetConfig>): Spec => ({
  id, kind: "voiceCall", title, subtitle,
  config: {
    agent: "reactivation_voice",
    voiceVarMap: [{ v: "{{name}}", def: "contact.first_name" }, { v: "{{phone}}", def: "contact.phone" }],
    callStart: "10:00", callEnd: "19:00", timezone: "Asia/Kolkata (IST)", maxAttempts: 2, retryInterval: "1 hour",
    ...cfg,
  },
});

// Library WhatsApp sends are linear "advance onward" steps: a single output
// (a lead leaves once a reply arrives or the session window expires). Branching
// is shown in the two showcase campaigns (EX1/EX2) and in the live builder.
const sWa = (
  id: string, title: string, subtitle: string, template: string,
  opts?: { vars?: PresetVarMap[]; number?: string },
): Spec => ({
  id, kind: "whatsapp", title, subtitle,
  // Outputs derive from the template's buttons: button templates expand to
  // per-button + reply + session handles; text-only templates stay collapsed
  // (single advance handle) since the Type-1 split toggle defaults off.
  outputs: whatsappOutputs(resolveWaTemplate(template), false),
  config: {
    waNumber: opts?.number ?? "+91 98100 12345 · PiCommerce", waMode: "template", waTemplate: template, waVarMap: opts?.vars ?? NAME_VAR,
  },
});

const sDelay = (id: string, value: number, unit: "Minutes" | "Hours" | "Days"): Spec => ({
  id, kind: "delay", title: `Delay · ${value} ${unit.toLowerCase()}`, subtitle: `Wait ${value} ${unit.toLowerCase()}`,
  config: { delayValue: value, delayUnit: unit },
});

const ed = (from: string, to: string, port?: string): SpecEdge => ({ from, to, port });

/* ---- assembly: tag edges as routed; layout runs at render-time (ELK) ----- */

/** Examples ship positionless — ELK is async and runs when a graph is actually
 *  rendered (see `elkLayout` + WorkflowCanvas/CampaignFlowView). Here we only
 *  mark edges as the `routed` type. Single End per campaign (terminals are NOT
 *  fanned out — that violates the PRD). */
function assemble(rawNodes: Node<WorkflowNodeData>[], rawEdges: Edge[]): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  return {
    nodes: rawNodes,
    edges: rawEdges.map((e) => ({ ...e, type: EDGE })),
  };
}

function buildCampaign(name: string, specs: Spec[], edges: SpecEdge[]): ExampleCampaign {
  const rawNodes: Node<WorkflowNodeData>[] = specs.map((s) => ({
    id: s.id, type: "workflow", position: { x: 0, y: 0 },
    data: {
      kind: s.kind, title: s.title, subtitle: s.subtitle, valid: true, preset: true,
      locked: s.locked, outputs: s.outputs, abTest: s.abTest, config: s.config,
    },
  }));
  // Expand outcome handles: a node with >=2 outputs (e.g. a button WhatsApp node)
  // whose journey defines a single port-less onward edge gets that edge fanned to
  // every outcome handle → same target, so each handle is wired (valid) and the
  // analytics funnel can split traffic across all branches. Collapsed single-handle
  // nodes and already-ported edges (conditional/abSplit) are untouched.
  const outputsById = new Map(rawNodes.map((n) => [n.id, n.data.outputs ?? []]));
  const rawEdges: Edge[] = [];
  let ei = 0;
  edges.forEach((e) => {
    const outs = outputsById.get(e.from) ?? [];
    if (!e.port && outs.length >= 2) {
      outs.forEach((o) => rawEdges.push({ id: `e${ei++}`, source: e.from, target: e.to, sourceHandle: o.id, type: EDGE }));
    } else {
      rawEdges.push({ id: `e${ei++}`, source: e.from, target: e.to, sourceHandle: e.port, type: EDGE });
    }
  });
  const { nodes, edges: laidEdges } = assemble(rawNodes, rawEdges);
  return { name, status: "ready", nodes, edges: laidEdges };
}

/* ---- 1. BFSI · Lead Qualification -------------------------------------- */
const C_LEADQUAL = buildCampaign("BFSI · Lead Qualification", [
  sStart(),
  sAud("CSV · new leads", ["lead_score", "product", "preferred_lang"]),
  sCond("score", "Lead score branch", "lead_score", [
    { id: "hot", label: "Hot lead (>80)", op: "greater than", value: "80" },
    { id: "warm", label: "Warm lead (50–80)", op: "between", value: "50", value2: "80" },
    { id: "cold", label: "Cold lead (<50)", op: "less than", value: "50" },
  ]),
  // hot
  sVoice("vqual", "Voice AI qualification", "Conversational qualification"),
  sCond("hotInt", "Interested?", "call_disposition", [
    { id: "yes", label: "Yes", value: "interested" },
    { id: "no", label: "No", value: "not_interested" },
  ]),
  sWa("waApp", "WhatsApp application link", "WhatsApp · apply now", "application_link_v1"),
  sCond("hotConv", "Conversion check", "application_status", [
    { id: "conv", label: "Converted", value: "approved" },
    { id: "no", label: "Not converted", value: "pending" },
  ]),
  sVoice("vfuHot", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  // warm
  sAbSplit("ab", "A/B split", "Qualification · Urgency vs Offer", [
    { id: "vA", label: "Urgency" },
    { id: "vB", label: "Offer" },
  ]),
  sWa("abA", "WhatsApp qualification · Urgency", "Variant · Urgency angle", "lead_urgency_v1"),
  sWa("abB", "WhatsApp qualification · Offer", "Variant · Offer angle", "lead_offer_v1"),
  sWa("appWarm", "Application link", "WhatsApp · apply now", "application_link_v1"),
  sDelay("d1", 23, "Hours"),
  sWa("wfu", "WhatsApp follow-up", "WhatsApp · nudge", "lead_followup_v1"),
  sCond("warmConv", "Conversion check", "application_status", [
    { id: "conv", label: "Converted", value: "approved" },
    { id: "no", label: "Not converted", value: "pending" },
  ]),
  sVoice("vfuWarm", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  // cold
  sWa("aware", "WhatsApp awareness content", "WhatsApp · awareness", "awareness_v1"),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "score"),
  ed("score", "vqual", "hot"), ed("vqual", "hotInt"),
  ed("hotInt", "waApp", "yes"), ed("hotInt", "end", "no"),
  ed("waApp", "hotConv"), ed("hotConv", "end", "conv"), ed("hotConv", "vfuHot", "no"), ed("vfuHot", "end"),
  ed("score", "ab", "warm"),
  ed("ab", "abA", "vA"), ed("ab", "abB", "vB"),
  ed("abA", "appWarm"), ed("abB", "appWarm"),
  ed("appWarm", "d1"), ed("d1", "wfu"), ed("wfu", "warmConv"),
  ed("warmConv", "end", "conv"), ed("warmConv", "vfuWarm", "no"), ed("vfuWarm", "end"),
  ed("score", "aware", "cold"), ed("aware", "end"),
]);

/* ---- 2. BFSI · Insurance Renewal --------------------------------------- */
const C_RENEWAL = buildCampaign("BFSI · Insurance Renewal", [
  sStart(),
  sAud("CSV · policies expiring in 30 days", ["premium", "policy_no", "expiry_date"]),
  sCond("prem", "Premium branch", "premium", [
    { id: "high", label: "> ₹25,000", op: "greater than", value: "25000" },
    { id: "low", label: "≤ ₹25,000", op: "less than or equal to", value: "25000" },
  ]),
  // high
  sVoice("vCons", "Voice AI renewal consultation", "Renewal advisory call"),
  sWa("rlHigh", "Renewal link", "WhatsApp · renew now", "renewal_link_v1"),
  sCond("rcHigh", "Renewal check", "renewal_status", [
    { id: "yes", label: "Renewed", value: "renewed" },
    { id: "no", label: "Not renewed", value: "pending" },
  ]),
  sVoice("vfuHigh", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  // low — the renewal reminder IS the A/B test (one message, two copy variants)
  sAbSplit("abLow", "A/B split", "Renewal reminder · Benefits vs Savings", [
    { id: "vA", label: "Benefits", pct: 50 },
    { id: "vB", label: "Savings", pct: 50 },
  ]),
  sWa("waBenefits", "WhatsApp renewal reminder · Benefits", "Variant · Benefits angle", "renewal_benefits_v1"),
  sWa("waSavings", "WhatsApp renewal reminder · Savings", "Variant · Savings angle", "renewal_savings_v1"),
  sDelay("d1", 23, "Hours"),
  sWa("wfu", "WhatsApp follow-up", "WhatsApp · nudge", "renewal_followup_v1"),
  sCond("rcLow", "Renewed?", "renewal_status", [
    { id: "yes", label: "Yes", value: "renewed" },
    { id: "no", label: "No", value: "pending" },
  ]),
  sVoice("vFinal", "Voice AI final renewal call", "Final attempt"),
  sWa("rlFinal", "Renewal link", "WhatsApp · renew now", "renewal_link_v1"),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "prem"),
  // high — Voice consult → renewal link → renewed?
  ed("prem", "vCons", "high"), ed("vCons", "rlHigh"), ed("rlHigh", "rcHigh"),
  ed("rcHigh", "end", "yes"), ed("rcHigh", "vfuHigh", "no"), ed("vfuHigh", "end"),
  // low — A/B split → two messages → converge on reminder → delay → follow-up → renewed?
  ed("prem", "abLow", "low"),
  ed("abLow", "waBenefits", "vA"), ed("abLow", "waSavings", "vB"),
  ed("waBenefits", "d1"), ed("waSavings", "d1"),
  ed("d1", "wfu"), ed("wfu", "rcLow"),
  ed("rcLow", "end", "yes"),
  ed("rcLow", "vFinal", "no"), ed("vFinal", "rlFinal"), ed("rlFinal", "end"),
]);

/* ---- 3. BFSI · Upsell / Cross-Sell ------------------------------------- */
const C_UPSELL = buildCampaign("BFSI · Upsell / Cross-Sell", [
  sStart(),
  sAud("CSV · existing customers", ["customer_type", "balance", "product_held"]),
  sCond("type", "Customer type branch", "customer_type", [
    { id: "high_bal", label: "High balance", value: "high_balance" },
    { id: "borrower", label: "Borrower / card user", value: "borrower" },
  ]),
  // high balance
  sVoice("vOffer", "Voice AI offer discussion", "Personalized offer call"),
  sWa("appHigh", "WhatsApp application link", "WhatsApp · apply now", "offer_apply_v1"),
  sCond("convHigh", "Conversion check", "application_status", [
    { id: "conv", label: "Converted", value: "approved" },
    { id: "no", label: "Not converted", value: "pending" },
  ]),
  sVoice("vfuHigh", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  // borrower
  sAbSplit("ab", "A/B split", "Personalized offer · Offer vs Urgency", [
    { id: "vA", label: "Offer" },
    { id: "vB", label: "Urgency" },
  ]),
  sWa("abA", "WhatsApp personalized offer · Offer", "Variant · Offer angle", "upsell_offer_v1",
    { vars: [{ v: "{{1}}", def: "contact.first_name" }, { v: "{{2}}", def: "product_held" }] }),
  sWa("abB", "WhatsApp personalized offer · Urgency", "Variant · Urgency angle", "upsell_urgency_v1",
    { vars: [{ v: "{{1}}", def: "contact.first_name" }, { v: "{{2}}", def: "product_held" }] }),
  sDelay("d1", 23, "Hours"),
  sWa("waRem", "WhatsApp reminder + application link", "WhatsApp · apply now", "offer_apply_v1"),
  sCond("convLow", "Conversion check", "application_status", [
    { id: "conv", label: "Converted", value: "approved" },
    { id: "no", label: "Not converted", value: "pending" },
  ]),
  sVoice("vfuLow", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sWa("appLow", "Application link", "WhatsApp · apply now", "offer_apply_v1"),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "type"),
  ed("type", "vOffer", "high_bal"), ed("vOffer", "appHigh"), ed("appHigh", "convHigh"),
  ed("convHigh", "end", "conv"), ed("convHigh", "vfuHigh", "no"), ed("vfuHigh", "end"),
  ed("type", "ab", "borrower"),
  ed("ab", "abA", "vA"), ed("ab", "abB", "vB"),
  ed("abA", "d1"), ed("abB", "d1"),
  ed("d1", "waRem"), ed("waRem", "convLow"),
  ed("convLow", "end", "conv"), ed("convLow", "vfuLow", "no"), ed("vfuLow", "appLow"), ed("appLow", "end"),
]);

/* ---- 4. BFSI · Collections --------------------------------------------- */
const C_COLLECT = buildCampaign("BFSI · Collections", [
  sStart(),
  sAud("CSV · delinquent borrowers", ["dpd", "amount_due", "loan_id"]),
  sCond("dpd", "DPD branch", "days_past_due", [
    { id: "early", label: "1–30 DPD", op: "between", value: "1", value2: "30" },
    { id: "mid",   label: "31–90 DPD", op: "between", value: "31", value2: "90" },
    { id: "late",  label: "90+ DPD",  op: "greater than", value: "90" },
  ]),
  sWa("waRem", "WhatsApp reminder", "WhatsApp · payment reminder", "collections_reminder_v1"),
  sWa("plEarly", "Payment link", "WhatsApp · pay now", "payment_link_v1"),
  sVoice("vColl", "Voice AI collections call", "Collections call"),
  sWa("plMid", "Payment link", "WhatsApp · pay now", "payment_link_v1"),
  sVoice("vEsc", "Voice AI escalated call", "Escalated collections"),
  sWa("plLate", "Payment link", "WhatsApp · pay now", "payment_link_v1"),
  sDelay("d1", 23, "Hours"),
  sCond("paid", "Paid?", "payment_status", [
    { id: "yes", label: "Yes", value: "paid" },
    { id: "no", label: "No", value: "unpaid" },
  ]),
  sVoice("vfu", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sWa("plFu", "WhatsApp payment link", "WhatsApp · pay now", "payment_link_v1"),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "dpd"),
  ed("dpd", "waRem", "early"), ed("waRem", "plEarly"), ed("plEarly", "d1"),
  ed("dpd", "vColl", "mid"), ed("vColl", "plMid"), ed("plMid", "d1"),
  ed("dpd", "vEsc", "late"), ed("vEsc", "plLate"), ed("plLate", "d1"),
  ed("d1", "paid"), ed("paid", "end", "yes"),
  ed("paid", "vfu", "no"), ed("vfu", "plFu"), ed("plFu", "end"),
]);

/* ---- 5. Retail · Activation -------------------------------------------- */
const C_ACTIVATION = buildCampaign("Retail · Activation", [
  sStart(),
  sAud("CSV · newly registered users", ["intent", "fav_category"]),
  sCond("intent", "Intent branch", "intent", [
    { id: "high", label: "High intent", value: "high" },
    { id: "low", label: "Low intent", value: "low" },
  ]),
  sVoice("vBuy", "Voice AI assisted purchase", "Guided first purchase"),
  sWa("cartHigh", "Cart link", "WhatsApp · complete order", "cart_link_v1"),
  sCond("orderHigh", "Order check", "order_status", [
    { id: "conv", label: "Converted", value: "placed" },
    { id: "no", label: "Not converted", value: "pending" },
  ]),
  sVoice("vfuHigh", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sAbSplit("ab", "A/B split", "Welcome offer · Discount vs Free delivery", [
    { id: "vA", label: "Discount" },
    { id: "vB", label: "Free delivery" },
  ]),
  sWa("abA", "WhatsApp welcome offer · Discount", "Variant · Discount angle", "activation_discount_v1"),
  sWa("abB", "WhatsApp welcome offer · Free delivery", "Variant · Free delivery angle", "activation_free_delivery_v1"),
  sWa("cartLow", "Cart link", "WhatsApp · complete order", "cart_link_v1"),
  sDelay("d1", 23, "Hours"),
  sWa("waRem", "WhatsApp reminder + cart link", "WhatsApp · complete order", "cart_link_v1"),
  sCond("orderLow", "Conversion check", "order_status", [
    { id: "conv", label: "Converted", value: "placed" },
    { id: "no", label: "Not converted", value: "pending" },
  ]),
  sVoice("vfuLow", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sWa("appLow", "Cart link", "WhatsApp · complete order", "cart_link_v1"),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "intent"),
  ed("intent", "vBuy", "high"), ed("vBuy", "cartHigh"), ed("cartHigh", "orderHigh"),
  ed("orderHigh", "end", "conv"), ed("orderHigh", "vfuHigh", "no"), ed("vfuHigh", "end"),
  ed("intent", "ab", "low"),
  ed("ab", "abA", "vA"), ed("ab", "abB", "vB"),
  ed("abA", "cartLow"), ed("abB", "cartLow"),
  ed("cartLow", "d1"), ed("d1", "waRem"), ed("waRem", "orderLow"),
  ed("orderLow", "end", "conv"), ed("orderLow", "vfuLow", "no"), ed("vfuLow", "appLow"), ed("appLow", "end"),
]);

/* ---- 6. Retail · Reward Expiry ----------------------------------------- */
const C_REWARD = buildCampaign("Retail · Reward Expiry", [
  sStart(),
  sAud("CSV · reward members", ["points", "tier"]),
  sCond("points", "Points branch", "reward_points", [
    { id: "high", label: "> 1000 points", op: "greater than", value: "1000" },
    { id: "low", label: "≤ 1000 points", op: "less than or equal to", value: "1000" },
  ]),
  sVoice("vRem", "Voice AI reminder", "Reward reminder call"),
  sWa("redHigh", "Redemption link", "WhatsApp · redeem now", "redemption_link_v1"),
  sCond("redCheck", "Redemption check", "redemption_status", [
    { id: "yes", label: "Redeemed", value: "redeemed" },
    { id: "no", label: "Not redeemed", value: "pending" },
  ]),
  sWa("finalHigh", "WhatsApp final reminder", "WhatsApp · last chance", "reward_final_v1"),
  sAbSplit("ab", "A/B split", "Expiry alert · Urgency vs Offer", [
    { id: "vA", label: "Urgency" },
    { id: "vB", label: "Offer" },
  ]),
  sWa("abA", "WhatsApp expiry alert · Urgency", "Variant · Urgency angle", "reward_urgency_v1"),
  sWa("abB", "WhatsApp expiry alert · Offer", "Variant · Offer angle", "reward_offer_v1"),
  sWa("redLow", "Redemption link", "WhatsApp · redeem now", "redemption_link_v1"),
  sDelay("d1", 23, "Hours"),
  sWa("waRem2", "WhatsApp reminder", "WhatsApp · redeem now", "redemption_link_v1"),
  sCond("redCheck2", "Redemption check", "redemption_status", [
    { id: "yes", label: "Redeemed", value: "redeemed" },
    { id: "no", label: "Not redeemed", value: "pending" },
  ]),
  sWa("finalLow", "WhatsApp final reminder", "WhatsApp · last chance", "reward_final_v1"),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "points"),
  ed("points", "vRem", "high"), ed("vRem", "redHigh"), ed("redHigh", "redCheck"),
  ed("redCheck", "end", "yes"), ed("redCheck", "finalHigh", "no"), ed("finalHigh", "end"),
  ed("points", "ab", "low"),
  ed("ab", "abA", "vA"), ed("ab", "abB", "vB"),
  ed("abA", "redLow"), ed("abB", "redLow"),
  ed("redLow", "d1"), ed("d1", "waRem2"), ed("waRem2", "redCheck2"),
  ed("redCheck2", "end", "yes"), ed("redCheck2", "finalLow", "no"), ed("finalLow", "end"),
]);

/* ---- 7. Retail · Winback ----------------------------------------------- */
const C_WINBACK = buildCampaign("Retail · Winback", [
  sStart(),
  sAud("CSV · lapsed customers", ["cltv", "last_order_days"]),
  sCond("cltv", "CLTV branch", "cltv", [
    { id: "high", label: "High CLTV", value: "high" },
    { id: "mid", label: "Medium / low", value: "medium_low" },
  ]),
  sVoice("vCall", "Voice AI winback call", "Winback call"),
  sWa("purHigh", "Purchase link", "WhatsApp · shop now", "purchase_link_v1"),
  sCond("purCheck", "Purchase check", "order_status", [
    { id: "yes", label: "Purchased", value: "placed" },
    { id: "no", label: "Not purchased", value: "pending" },
  ]),
  sVoice("vfuHigh", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sAbSplit("ab", "A/B split", "Winback offer · Cashback vs Discount", [
    { id: "vA", label: "Cashback" },
    { id: "vB", label: "Discount" },
  ]),
  sWa("abA", "WhatsApp winback offer · Cashback", "Variant · Cashback angle", "winback_cashback_v1"),
  sWa("abB", "WhatsApp winback offer · Discount", "Variant · Discount angle", "winback_discount_v1"),
  sWa("purLow", "Purchase link", "WhatsApp · shop now", "purchase_link_v1"),
  sDelay("d1", 23, "Hours"),
  sCond("purchased", "Purchased?", "order_status", [
    { id: "yes", label: "Yes", value: "placed" },
    { id: "no", label: "No", value: "pending" },
  ]),
  sVoice("vfuLow", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "cltv"),
  ed("cltv", "vCall", "high"), ed("vCall", "purHigh"), ed("purHigh", "purCheck"),
  ed("purCheck", "end", "yes"), ed("purCheck", "vfuHigh", "no"), ed("vfuHigh", "end"),
  ed("cltv", "ab", "mid"),
  ed("ab", "abA", "vA"), ed("ab", "abB", "vB"),
  ed("abA", "purLow"), ed("abB", "purLow"),
  ed("purLow", "d1"), ed("d1", "purchased"),
  ed("purchased", "end", "yes"), ed("purchased", "vfuLow", "no"), ed("vfuLow", "end"),
]);

/* ---- 8. Retail · Subscription Conversion ------------------------------- */
const C_SUBSCRIPTION = buildCampaign("Retail · Subscription Conversion", [
  sStart(),
  sAud("CSV · repeat buyers", ["order_count", "fav_category"]),
  sCond("orders", "Order count branch", "order_count", [
    { id: "high", label: "> 3 orders", op: "greater than", value: "3" },
    { id: "low", label: "≤ 3 orders", op: "less than or equal to", value: "3" },
  ]),
  sVoice("vPitch", "Voice AI subscription pitch", "Subscription pitch call"),
  sWa("subHigh", "Subscription link", "WhatsApp · subscribe", "subscription_link_v1"),
  sCond("subCheckHigh", "Subscription check", "subscription_status", [
    { id: "yes", label: "Subscribed", value: "active" },
    { id: "no", label: "Not subscribed", value: "pending" },
  ]),
  sVoice("vRemHigh", "Voice AI reminder", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sAbSplit("ab", "A/B split", "Subscription benefits · Extra vs Urgency", [
    { id: "vA", label: "Extra benefits" },
    { id: "vB", label: "Urgency" },
  ]),
  sWa("abA", "WhatsApp subscription benefits · Extra", "Variant · Extra benefits angle", "subscription_extra_v1"),
  sWa("abB", "WhatsApp subscription benefits · Urgency", "Variant · Urgency angle", "subscription_urgency_v1"),
  sWa("subLow", "Subscription link", "WhatsApp · subscribe", "subscription_link_v1"),
  sDelay("d1", 23, "Hours"),
  sCond("subCheckLow", "Subscribed?", "subscription_status", [
    { id: "yes", label: "Yes", value: "active" },
    { id: "no", label: "No", value: "pending" },
  ]),
  sVoice("vRemLow", "Voice AI reminder", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "orders"),
  ed("orders", "vPitch", "high"), ed("vPitch", "subHigh"), ed("subHigh", "subCheckHigh"),
  ed("subCheckHigh", "end", "yes"), ed("subCheckHigh", "vRemHigh", "no"), ed("vRemHigh", "end"),
  ed("orders", "ab", "low"),
  ed("ab", "abA", "vA"), ed("ab", "abB", "vB"),
  ed("abA", "subLow"), ed("abB", "subLow"),
  ed("subLow", "d1"), ed("d1", "subCheckLow"),
  ed("subCheckLow", "end", "yes"), ed("subCheckLow", "vRemLow", "no"), ed("vRemLow", "end"),
]);

/* ---- 9. Retail · Seasonal Sale ----------------------------------------- */
const C_SEASONAL = buildCampaign("Retail · Seasonal Sale", [
  sStart(),
  sAud("CSV · eligible customers", ["is_vip", "fav_category"]),
  sCond("vip", "VIP branch", "is_vip", [
    { id: "vip", label: "VIP", value: "true" },
    { id: "regular", label: "Regular", value: "false" },
  ]),
  sVoice("vEarly", "Voice AI early access", "Early access call"),
  sWa("saleVip", "Sale link", "WhatsApp · shop the sale", "sale_link_v1"),
  sCond("purVip", "Purchase check", "order_status", [
    { id: "yes", label: "Purchased", value: "placed" },
    { id: "no", label: "Not purchased", value: "pending" },
  ]),
  sVoice("vfuVip", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sAbSplit("ab", "A/B split", "Sale announcement · Trends vs Limited period", [
    { id: "vA", label: "Trends" },
    { id: "vB", label: "Limited period" },
  ]),
  sWa("abA", "WhatsApp sale announcement · Trends", "Variant · Trends angle", "seasonal_trends_v1"),
  sWa("abB", "WhatsApp sale announcement · Limited period", "Variant · Limited period angle", "seasonal_limited_v1"),
  sDelay("d1", 23, "Hours"),
  sCond("clicked", "Clicked?", "link_clicked", [
    { id: "yes", label: "Yes", value: "true" },
    { id: "no", label: "No", value: "false" },
  ]),
  sWa("saleReg", "Sale link", "WhatsApp · shop the sale", "sale_link_v1"),
  sCond("purReg", "Purchase check", "order_status", [
    { id: "yes", label: "Purchased", value: "placed" },
    { id: "no", label: "Not purchased", value: "pending" },
  ]),
  sVoice("vfuReg", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sWa("waRem", "WhatsApp reminder message", "WhatsApp · last chance", "sale_reminder_v1"),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "vip"),
  ed("vip", "vEarly", "vip"), ed("vEarly", "saleVip"), ed("saleVip", "purVip"),
  ed("purVip", "end", "yes"), ed("purVip", "vfuVip", "no"), ed("vfuVip", "end"),
  ed("vip", "ab", "regular"),
  ed("ab", "abA", "vA"), ed("ab", "abB", "vB"),
  ed("abA", "d1"), ed("abB", "d1"),
  ed("d1", "clicked"),
  ed("clicked", "saleReg", "yes"), ed("saleReg", "purReg"),
  ed("purReg", "end", "yes"), ed("purReg", "vfuReg", "no"), ed("vfuReg", "end"),
  ed("clicked", "waRem", "no"), ed("waRem", "end"),
]);

/* ---- 10. D2C · Order Confirmation -------------------------------------- */
const C_ORDERCONF = buildCampaign("D2C · Order Confirmation", [
  sStart(),
  sAud("CSV · new orders", ["payment_type", "order_id"]),
  sCond("pay", "Payment type branch", "payment_type", [
    { id: "cod", label: "COD", value: "cod" },
    { id: "prepaid", label: "Prepaid", value: "prepaid" },
  ]),
  sVoice("vConf", "Voice AI confirmation", "Order confirmation call"),
  sWa("availCod", "WhatsApp availability check link", "WhatsApp · confirm availability", "availability_link_v1"),
  sCond("confCod", "Confirmed?", "order_confirmed", [
    { id: "yes", label: "Yes", value: "true" },
    { id: "no", label: "No", value: "false" },
  ]),
  sVoice("vfuCod", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sWa("waConf", "WhatsApp confirmation", "WhatsApp · order confirmed", "order_confirm_v1"),
  sDelay("d1", 23, "Hours"),
  sCond("confPre", "Confirmed?", "order_confirmed", [
    { id: "yes", label: "Yes", value: "true" },
    { id: "no", label: "No", value: "false" },
  ]),
  sWa("availPre", "WhatsApp availability check link", "WhatsApp · confirm availability", "availability_link_v1"),
  sVoice("vfuPre", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "pay"),
  ed("pay", "vConf", "cod"), ed("vConf", "availCod"), ed("availCod", "confCod"),
  ed("confCod", "end", "yes"), ed("confCod", "vfuCod", "no"), ed("vfuCod", "end"),
  ed("pay", "waConf", "prepaid"), ed("waConf", "d1"), ed("d1", "confPre"),
  ed("confPre", "end", "yes"), ed("confPre", "availPre", "no"), ed("availPre", "vfuPre"), ed("vfuPre", "end"),
]);

/* ---- 11. D2C · Outbound Sales ------------------------------------------ */
const C_OUTBOUND = buildCampaign("D2C · Outbound Sales", [
  sStart(),
  sAud("CSV · lead audience", ["intent", "product"]),
  sCond("intent", "Intent branch", "intent", [
    { id: "high", label: "High intent", value: "high" },
    { id: "medium", label: "Medium intent", value: "medium" },
  ]),
  sVoice("vDisc", "Voice AI discovery call", "Discovery call"),
  sCond("intHigh", "Interested?", "call_disposition", [
    { id: "yes", label: "Yes", value: "interested" },
    { id: "no", label: "No", value: "not_interested" },
  ]),
  sWa("purHigh", "WhatsApp purchase link", "WhatsApp · buy now", "purchase_link_v1"),
  sCond("convHigh", "Conversion check", "order_status", [
    { id: "conv", label: "Converted", value: "placed" },
    { id: "no", label: "Not converted", value: "pending" },
  ]),
  sVoice("vfuHigh", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sAbSplit("ab", "A/B split", "Product intro · Variety vs Offers", [
    { id: "vA", label: "Variety" },
    { id: "vB", label: "Offers" },
  ]),
  sWa("abA", "WhatsApp product intro · Variety", "Variant · Variety angle", "outbound_variety_v1"),
  sWa("abB", "WhatsApp product intro · Offers", "Variant · Offers angle", "outbound_offers_v1"),
  sCond("intMed", "Interested?", "reply_intent", [
    { id: "yes", label: "Yes", value: "interested" },
    { id: "no", label: "No", value: "not_interested" },
  ]),
  sWa("purMed", "Purchase link", "WhatsApp · buy now", "purchase_link_v1"),
  sDelay("d1", 23, "Hours"),
  sCond("purchased", "Purchased?", "order_status", [
    { id: "yes", label: "Yes", value: "placed" },
    { id: "no", label: "No", value: "pending" },
  ]),
  sVoice("vfuMed", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sWa("purMed2", "Purchase link", "WhatsApp · buy now", "purchase_link_v1"),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "intent"),
  ed("intent", "vDisc", "high"), ed("vDisc", "intHigh"),
  ed("intHigh", "purHigh", "yes"), ed("intHigh", "end", "no"),
  ed("purHigh", "convHigh"), ed("convHigh", "end", "conv"), ed("convHigh", "vfuHigh", "no"), ed("vfuHigh", "end"),
  ed("intent", "ab", "medium"),
  ed("ab", "abA", "vA"), ed("ab", "abB", "vB"),
  ed("abA", "intMed"), ed("abB", "intMed"),
  ed("intMed", "purMed", "yes"), ed("intMed", "end", "no"),
  ed("purMed", "d1"), ed("d1", "purchased"),
  ed("purchased", "end", "yes"), ed("purchased", "vfuMed", "no"), ed("vfuMed", "purMed2"), ed("purMed2", "end"),
]);

/* ---- 12. D2C · Cart Abandonment ---------------------------------------- */
const C_CART = buildCampaign("D2C · Cart Abandonment", [
  sStart(),
  sAud("CSV · cart abandoners", ["cart_value", "cart_items"]),
  sCond("cart", "Cart value branch", "cart_value", [
    { id: "high", label: "> ₹5,000", op: "greater than", value: "5000" },
    { id: "low", label: "≤ ₹5,000", op: "less than or equal to", value: "5000" },
  ]),
  sVoice("vRec", "Voice AI recovery call", "Cart recovery call"),
  sWa("cartHigh", "Cart link", "WhatsApp · complete purchase", "cart_link_v1"),
  sCond("purHigh", "Purchase check", "order_status", [
    { id: "yes", label: "Purchased", value: "placed" },
    { id: "no", label: "Not purchased", value: "pending" },
  ]),
  sVoice("vRemHigh", "Voice AI reminder", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sAbSplit("ab", "A/B split", "Cart reminder · Discount vs Free shipping", [
    { id: "vA", label: "Discount" },
    { id: "vB", label: "Free shipping" },
  ]),
  sWa("abA", "WhatsApp cart reminder · Discount", "Variant · Discount angle", "cart_discount_v1"),
  sWa("abB", "WhatsApp cart reminder · Free shipping", "Variant · Free shipping angle", "cart_free_shipping_v1"),
  sWa("cartLow", "Purchase link", "WhatsApp · complete purchase", "cart_link_v1"),
  sDelay("d1", 23, "Hours"),
  sCond("purLow", "Purchased?", "order_status", [
    { id: "yes", label: "Yes", value: "placed" },
    { id: "no", label: "No", value: "pending" },
  ]),
  sVoice("vRemLow", "Voice AI reminder", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "cart"),
  ed("cart", "vRec", "high"), ed("vRec", "cartHigh"), ed("cartHigh", "purHigh"),
  ed("purHigh", "end", "yes"), ed("purHigh", "vRemHigh", "no"), ed("vRemHigh", "end"),
  ed("cart", "ab", "low"),
  ed("ab", "abA", "vA"), ed("ab", "abB", "vB"),
  ed("abA", "cartLow"), ed("abB", "cartLow"),
  ed("cartLow", "d1"), ed("d1", "purLow"),
  ed("purLow", "end", "yes"), ed("purLow", "vRemLow", "no"), ed("vRemLow", "end"),
]);

/* ---- 13. E-commerce · Price Drop --------------------------------------- */
const C_PRICEDROP = buildCampaign("E-commerce · Price Drop", [
  sStart(),
  sAud("CSV · users who wishlisted", ["product_value", "product_id"]),
  sCond("value", "Product value branch", "product_value", [
    { id: "high", label: "> ₹10,000", op: "greater than", value: "10000" },
    { id: "low", label: "≤ ₹10,000", op: "less than or equal to", value: "10000" },
  ]),
  sVoice("vAlert", "Voice AI price drop alert", "Price drop call"),
  sWa("purHigh", "Purchase link", "WhatsApp · buy now", "purchase_link_v1"),
  sCond("purCheck", "Purchase check", "order_status", [
    { id: "yes", label: "Purchased", value: "placed" },
    { id: "no", label: "Not purchased", value: "pending" },
  ]),
  sVoice("vfuHigh", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sAbSplit("ab", "A/B split", "Price-drop alert · % off vs Save ₹xx", [
    { id: "vA", label: "% off" },
    { id: "vB", label: "Save ₹xx" },
  ]),
  sWa("abA", "WhatsApp price-drop alert · % off", "Variant · % off angle", "pricedrop_pct_v1"),
  sWa("abB", "WhatsApp price-drop alert · Save ₹xx", "Variant · Save ₹xx angle", "pricedrop_amount_v1"),
  sWa("purLow", "Purchase link", "WhatsApp · buy now", "purchase_link_v1"),
  sDelay("d1", 23, "Hours"),
  sCond("purchased", "Purchased?", "order_status", [
    { id: "yes", label: "Yes", value: "placed" },
    { id: "no", label: "No", value: "pending" },
  ]),
  sVoice("vfuLow", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "value"),
  ed("value", "vAlert", "high"), ed("vAlert", "purHigh"), ed("purHigh", "purCheck"),
  ed("purCheck", "end", "yes"), ed("purCheck", "vfuHigh", "no"), ed("vfuHigh", "end"),
  ed("value", "ab", "low"),
  ed("ab", "abA", "vA"), ed("ab", "abB", "vB"),
  ed("abA", "purLow"), ed("abB", "purLow"),
  ed("purLow", "d1"), ed("d1", "purchased"),
  ed("purchased", "end", "yes"), ed("purchased", "vfuLow", "no"), ed("vfuLow", "end"),
]);

/* ---- 14. E-commerce · Back In Stock ------------------------------------ */
const C_BACKINSTOCK = buildCampaign("E-commerce · Back In Stock", [
  sStart(),
  sAud("CSV · notify-me audience", ["loyalty_member", "product_id"]),
  sCond("loyalty", "Loyalty branch", "loyalty_member", [
    { id: "member", label: "Loyalty subscriber", value: "true" },
    { id: "non", label: "Not subscribed", value: "false" },
  ]),
  sVoice("vAlert", "Voice AI alert", "Back-in-stock call"),
  sWa("cartMem", "Cart link", "WhatsApp · add to cart", "cart_link_v1"),
  sCond("purMem", "Purchase check", "order_status", [
    { id: "yes", label: "Purchased", value: "placed" },
    { id: "no", label: "Not purchased", value: "pending" },
  ]),
  sVoice("vfuMem", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sAbSplit("ab", "A/B split", "Back-in-stock · Scarcity vs Popularity", [
    { id: "vA", label: "Scarcity" },
    { id: "vB", label: "Popularity" },
  ]),
  sWa("abA", "WhatsApp back-in-stock · Scarcity", "Variant · Scarcity angle", "backinstock_scarcity_v1"),
  sWa("abB", "WhatsApp back-in-stock · Popularity", "Variant · Popularity angle", "backinstock_popularity_v1"),
  sWa("cartNon", "Cart link", "WhatsApp · add to cart", "cart_link_v1"),
  sDelay("d1", 23, "Hours"),
  sCond("purNon", "Purchased?", "order_status", [
    { id: "yes", label: "Yes", value: "placed" },
    { id: "no", label: "No", value: "pending" },
  ]),
  sVoice("vfuNon", "Voice AI follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "loyalty"),
  ed("loyalty", "vAlert", "member"), ed("vAlert", "cartMem"), ed("cartMem", "purMem"),
  ed("purMem", "end", "yes"), ed("purMem", "vfuMem", "no"), ed("vfuMem", "end"),
  ed("loyalty", "ab", "non"),
  ed("ab", "abA", "vA"), ed("ab", "abB", "vB"),
  ed("abA", "cartNon"), ed("abB", "cartNon"),
  ed("cartNon", "d1"), ed("d1", "purNon"),
  ed("purNon", "end", "yes"), ed("purNon", "vfuNon", "no"), ed("vfuNon", "end"),
]);

/* ---- 17. Retail · Al Tayer FCC Loyalty (UAE) --------------------------- */
// A four-tier loyalty journey for Al Tayer's First Citizen Club (FCC):
// Silver → Gold → Platinum → Black, segmented from a CSV the retailer has already
// tiered (`fcc_tier`, derived from 6-month ACV/AOV/LTV). Enrollment is checked on the
// derived `enrollment_tier` variable (read-only here, same trick EX2/C_LEADQUAL use
// with `call_disposition`). Silver alone A/B-tests its invite and upsells free→paid
// Gold; Gold/Platinum/Black send a single invite, then run an enrollment check with a
// voice follow-up loop for non-enrollers, sharing one welcome per tier. UAE settings
// throughout: Asia/Dubai timezone, Al Tayer WhatsApp sender.

const AE_WA = "+971 4 201 1111 · Al Tayer"; // UAE WhatsApp business sender

// One "confirm enrollment" tier block for Gold/Platinum/Black (no A/B split):
// single WhatsApp invite → Enrolled? → (enrolled) welcome / (not) voice follow-up →
// 24h delay → Enrolled now? → same shared welcome / End.
const fccTierBlock = (p: string, tier: string, label: string): { specs: Spec[]; edges: SpecEdge[] } => ({
  specs: [
    sWa(`${p}Wa`, "WhatsApp invite", `${label} · join FCC`, `fcc_${tier}_invite`, { number: AE_WA }),
    sCond(`${p}Enr`, "Enrolled?", "enrollment_tier", [
      { id: tier, label: "Enrolled" },
      { id: "none", label: "Not enrolled" },
    ]),
    sWa(`${p}Wel`, `Welcome to ${label}`, `WhatsApp · ${label} welcome`, `fcc_welcome_${tier}`, { number: AE_WA }),
    sVoice(`${p}Fu`, "Voice AI follow-up", `Re-invite to ${label} FCC`, { maxAttempts: 1, timezone: "Asia/Dubai (GST)" }),
    sDelay(`${p}Dly`, 24, "Hours"),
    sCond(`${p}Enr2`, "Enrolled now?", "enrollment_tier", [
      { id: tier, label: "Enrolled" },
      { id: "none", label: "Not enrolled" },
    ]),
  ],
  edges: [
    ed(`${p}Wa`, `${p}Enr`),
    ed(`${p}Enr`, `${p}Wel`, tier), ed(`${p}Wel`, "end"),
    ed(`${p}Enr`, `${p}Fu`, "none"),
    ed(`${p}Fu`, `${p}Dly`), ed(`${p}Dly`, `${p}Enr2`),
    ed(`${p}Enr2`, `${p}Wel`, tier), // post-follow-up enrolled → shared welcome
    ed(`${p}Enr2`, "end", "none"),
  ],
});

const FCC_GOLD = fccTierBlock("g", "gold", "Gold");
const FCC_PLATINUM = fccTierBlock("p", "platinum", "Platinum");
const FCC_BLACK = fccTierBlock("b", "black", "Black");

const C_ALTAYER = buildCampaign("Retail · Al Tayer FCC Loyalty", [
  sStart(),
  sAud("CSV · First Citizen Club members · key customer_id", [
    "fcc_tier", "acv_6m", "aov_6m", "orders_6m", "lifetime_value", "last_purchase_days", "preferred_lang",
  ]),
  sCond("tierSplit", "FCC tier", "fcc_tier", [
    { id: "silver", label: "Silver" },
    { id: "gold", label: "Gold" },
    { id: "platinum", label: "Platinum" },
    { id: "black", label: "Black" },
  ]),
  // ---- Silver: A/B-tested invite → free entry → enrolled members upsold to paid Gold ----
  sAbSplit("sAb", "A/B split", "Silver invite · Perks vs Savings", [
    { id: "vA", label: "Perks" },
    { id: "vB", label: "Savings" },
  ]),
  sWa("sWaA", "WhatsApp invite · Perks", "Silver · join FCC", "fcc_silver_perks", { number: AE_WA }),
  sWa("sWaB", "WhatsApp invite · Savings", "Silver · join FCC", "fcc_silver_savings", { number: AE_WA }),
  sCond("sEnr", "Enrolled?", "enrollment_tier", [
    { id: "silver", label: "Enrolled" },
    { id: "none", label: "Not enrolled" },
  ]),
  sVoice("sUp", "Voice AI · upgrade to Gold", "Limited-time paid Gold upgrade offer", { timezone: "Asia/Dubai (GST)" }),
  sDelay("sDly", 24, "Hours"),
  sCond("sUpg", "Upgraded to Gold?", "enrollment_tier", [
    { id: "gold", label: "Upgraded to Gold" },
    { id: "silver", label: "Still Silver" },
  ]),
  sWa("sWelGold", "Welcome to Gold", "WhatsApp · Gold welcome", "fcc_welcome_gold", { number: AE_WA }),
  sWa("sWelSilver", "Welcome to Silver", "WhatsApp · Silver welcome", "fcc_welcome_silver", { number: AE_WA }),
  // ---- Gold / Platinum / Black: single invite → enrollment check (+ voice follow-up loop) ----
  ...FCC_GOLD.specs, ...FCC_PLATINUM.specs, ...FCC_BLACK.specs,
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "tierSplit"),
  // 4-way tier fan-out
  ed("tierSplit", "sAb", "silver"),
  ed("tierSplit", "gWa", "gold"),
  ed("tierSplit", "pWa", "platinum"),
  ed("tierSplit", "bWa", "black"),
  // Silver: A/B variants converge into one enrolled-check
  ed("sAb", "sWaA", "vA"), ed("sAb", "sWaB", "vB"),
  ed("sWaA", "sEnr"), ed("sWaB", "sEnr"),
  ed("sEnr", "end", "none"), // not enrolled → discard
  ed("sEnr", "sUp", "silver"), // enrolled (free) → upsell to paid Gold
  ed("sUp", "sDly"), ed("sDly", "sUpg"),
  ed("sUpg", "sWelGold", "gold"), ed("sWelGold", "end"),
  ed("sUpg", "sWelSilver", "silver"), ed("sWelSilver", "end"),
  // Gold / Platinum / Black tiers
  ...FCC_GOLD.edges, ...FCC_PLATINUM.edges, ...FCC_BLACK.edges,
]);

const EX1_LAID = assemble(EX1_NODES, EX1_EDGES);
const EX2_LAID = assemble(EX2_NODES, EX2_EDGES);

export const EXAMPLE_CAMPAIGNS: Record<string, ExampleCampaign> = {
  // Order here drives the Campaigns-list order (the list staggers `lastEdited` by
  // index). The Al Tayer FCC loyalty campaign leads, followed by the rest of the
  // retail examples so the whole retail set sits on the front page. The two retained
  // originals (kept in draft) and the other verticals follow.
  c_ex17: C_ALTAYER,
  c_ex7: C_ACTIVATION,
  c_ex8: C_REWARD,
  c_ex9: C_WINBACK,
  c_ex10: C_SUBSCRIPTION,
  c_ex11: C_SEASONAL,
  c_ex1: { name: "Omni-channel React", status: "draft", nodes: EX1_LAID.nodes, edges: EX1_LAID.edges },
  c_ex2: { name: "Voice-led win-back", status: "draft", nodes: EX2_LAID.nodes, edges: EX2_LAID.edges },
  c_ex3: C_LEADQUAL,
  c_ex4: C_RENEWAL,
  c_ex5: C_UPSELL,
  c_ex6: C_COLLECT,
  c_ex12: C_ORDERCONF,
  c_ex13: C_OUTBOUND,
  c_ex14: C_CART,
  c_ex15: C_PRICEDROP,
  c_ex16: C_BACKINSTOCK,
};

/** Names + status for the campaigns list (kept in sync with the registry above). */
export const EXAMPLE_CAMPAIGN_NAMES: { id: string; name: string; status: CampaignStatus }[] =
  Object.entries(EXAMPLE_CAMPAIGNS).map(([id, c]) => ({ id, name: c.name, status: c.status }));
