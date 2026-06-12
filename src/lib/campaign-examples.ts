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
import type { CampaignStatus, WorkflowNodeData } from "./campaign-types";

export type ExampleCampaign = {
  name: string;
  status: CampaignStatus;
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
};

const EDGE = "smoothstep" as const;

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
      kind: "whatsapp", title: "Chat AI · loyalty", subtitle: "WhatsApp · loyalty opener", valid: true, preset: true,
      outputs: [
        { id: "converted", label: "Converted", kind: "exit" },
        { id: "dropped", label: "Responded, dropped off", kind: "exit" },
        { id: "default", label: "No response", kind: "default" },
      ],
      config: {
        waNumber: "+91 98100 12345 · PiCommerce",
        waMode: "template",
        waTemplate: "reactivate_v3 · Marketing",
        waVarMap: [
          { v: "{{1}}", def: "contact.first_name" },
          { v: "{{2}}", def: "favorite_category" },
        ],
        paths: [
          { id: "converted", label: "Converted", variable: "button_clicked", op: "equals", value: "true" },
          { id: "dropped", label: "Responded, dropped off", variable: "session_expired", op: "equals", value: "true" },
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
        agent: "Aria · Conversational",
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
  { id: "ex1-e5", source: "chat", sourceHandle: "converted", target: "end", type: EDGE },
  { id: "ex1-e6", source: "chat", sourceHandle: "dropped", target: "voice", type: EDGE },
  { id: "ex1-e7", source: "chat", sourceHandle: "default", target: "delay5", type: EDGE },
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
        agent: "Maya · Friendly",
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
      kind: "whatsapp", title: "Chat AI · order assist", subtitle: "WhatsApp · interested path", valid: true, preset: true,
      outputs: [
        { id: "ordered", label: "Ordered", kind: "exit" },
        { id: "needs_help", label: "Needs help / no response", kind: "exit" },
        { id: "default", label: "Fallthrough", kind: "default" },
      ],
      config: {
        waNumber: "+91 98100 12345 · PiCommerce",
        waMode: "template",
        waTemplate: "reactivate_v3 · Marketing",
        waVarMap: [
          { v: "{{1}}", def: "contact.first_name" },
          { v: "{{2}}", def: "last_item" },
        ],
        paths: [
          { id: "ordered", label: "Ordered", variable: "button_clicked", op: "equals", value: "true" },
          { id: "needs_help", label: "Needs help / no response", variable: "session_expired", op: "equals", value: "true" },
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
        agent: "Maya · Friendly",
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
  { id: "ex2-e9", source: "chat", sourceHandle: "ordered", target: "end", type: EDGE },
  { id: "ex2-e10", source: "chat", sourceHandle: "needs_help", target: "delay2", type: EDGE },
  { id: "ex2-e11", source: "chat", sourceHandle: "default", target: "end", type: EDGE },
  { id: "ex2-e12", source: "delay2", target: "chatReminder", type: EDGE },
  { id: "ex2-e13", source: "chatReminder", target: "end", type: EDGE },
  { id: "ex2-e14", source: "callbackDelay", target: "voice2", type: EDGE },
  { id: "ex2-e15", source: "voice2", target: "end", type: EDGE },
  { id: "ex2-e16", source: "chatNI", target: "end", type: EDGE },
  { id: "ex2-e17", source: "chatNC", target: "end", type: EDGE },
];

export const EXAMPLE_CAMPAIGNS: Record<string, ExampleCampaign> = {
  c_ex1: {
    name: "Example 1 (Omni-channel React)",
    status: "ready",
    nodes: EX1_NODES,
    edges: EX1_EDGES,
  },
  c_ex2: {
    name: "Example 2 (Voice-led win-back)",
    status: "ready",
    nodes: EX2_NODES,
    edges: EX2_EDGES,
  },
};
