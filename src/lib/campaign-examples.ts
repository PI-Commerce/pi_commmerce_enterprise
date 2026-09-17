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
 * Keyed by campaign id — these match the rows in `campaigns.index.tsx` and the
 * `$id` route param.
 */
import type { Edge, Node } from "reactflow";
import type {
  CampaignStatus, WorkflowNodeData, NodeKind, NodeOutput, NodeOutputKind,
  PresetConfig, PresetVarMap,
} from "./campaign-types";
import { SERIAL_PREFIX } from "./campaign-types";
import { whatsappOutputs, resolveWaTemplate, smsOutputs, completedOutput, DEFAULT_SMS_DLR_WINDOW } from "./wa-outputs";
import { SEED_SMS_TEMPLATES } from "./sms-templates";

export type ExampleCampaign = {
  name: string;
  status: CampaignStatus;
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
};

const EDGE = "routed" as const;

/* ============================================================== */
/* Hero library — 5 campaigns.                                    */
/*                                                                */
/* Authored from compact specs + node factories; positions are    */
/* auto-laid-out (longest-path depth → y, siblings spread on x).   */
/* Every node carries preset:true so the builder opens it in the   */
/* real (now interactive) editor, hydrated from config.            */
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
// is shown inside individual campaigns and in the live builder.
const sWa = (
  id: string, title: string, subtitle: string, template: string,
  opts?: { vars?: PresetVarMap[]; number?: string },
): Spec => ({
  id, kind: "whatsapp", title, subtitle,
  // A WhatsApp node always exposes reply_received + no_response, plus one handle
  // per trackable button. buildCampaign fans a port-less onward edge to every
  // handle, so a "linear" library send still wires all of them to the next step.
  outputs: whatsappOutputs(resolveWaTemplate(template)),
  config: {
    waNumber: opts?.number ?? "+91 98100 12345 · PiCommerce", waMode: "template", waTemplate: template, waVarMap: opts?.vars ?? NAME_VAR,
  },
});

/**
 * A DLT-template SMS send. Unlike WhatsApp, an SMS node always exposes the same
 * three delivery outcomes (Delivered / Failed / Timeout) regardless of
 * template — `buildCampaign` fans a port-less onward edge to all three, so a
 * "linear" library send still wires every handle. Campaigns that want to react
 * differently to a failure wire the ports explicitly.
 *
 * Sender / campaign type / PE are denormalised off the registry template so the
 * canvas and analytics can label the node without re-resolving it. Reads from
 * SEED_SMS_TEMPLATES rather than the live store — this is build-time seed data
 * and must not depend on module init order.
 */
const sSms = (
  id: string, title: string, subtitle: string, templateId: string,
  opts?: { vars?: PresetVarMap[]; dlrWindow?: string },
): Spec => {
  const t = SEED_SMS_TEMPLATES.find((x) => x.id === templateId);
  return {
    id, kind: "sms", title, subtitle,
    outputs: smsOutputs(),
    config: {
      smsTemplateId: templateId,
      smsVarMap: opts?.vars ?? [],
      smsDlrWindow: opts?.dlrWindow ?? DEFAULT_SMS_DLR_WINDOW,
      smsCategory: t?.category,
      senderId: t?.senderId,
      peId: t?.peId,
    },
  };
};

/** Registry template ids used by the library journeys. */
const SMS_RENEWAL_PROMO = "1107168421118290043";
const SMS_PAYMENT_FAILED = "1107168421220847665";

const sDelay = (id: string, value: number, unit: "Minutes" | "Hours" | "Days"): Spec => ({
  id, kind: "delay", title: `Delay · ${value} ${unit.toLowerCase()}`, subtitle: `Wait ${value} ${unit.toLowerCase()}`,
  config: { delayValue: value, delayUnit: unit },
});

// AI Transformation node — chains 1+ transforms; each writes a downstream var.
// Kept minimal so it composes into existing campaigns like every other action node.
const sAiTransform = (
  id: string,
  title: string,
  subtitle: string,
  transforms: Array<import("./campaign-types").PresetTransform>,
): Spec => ({
  id, kind: "aiTransform", title, subtitle,
  config: { transforms },
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

/* ---- BFSI · Insurance Renewal ------------------------------------------ */
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
  sSms("smsRen", "SMS renewal reminder", "SMS · renew now", SMS_RENEWAL_PROMO, {
    vars: [
      { v: "name", def: "contact.first_name" },
      { v: "plan", def: "contact.policy_no" },
      { v: "expiry_date", def: "contact.expiry_date" },
      { v: "discount", def: "10", mode: "constant" },
      { v: "link", def: "picomm.in/renew", mode: "constant" },
    ],
  }),
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
  ed("d1", "wfu"), ed("wfu", "smsRen"), ed("smsRen", "rcLow"),
  ed("rcLow", "end", "yes"),
  ed("rcLow", "vFinal", "no"), ed("vFinal", "rlFinal"), ed("rlFinal", "end"),
]);

/* ---- BFSI · PL DPD Collections ----------------------------------------- */
const C_PL_COLLECT = buildCampaign("BFSI · PL DPD Collections", [
  sStart(),
  sAud("CSV · delinquent PL borrowers", ["dpd", "amount_due", "loan_id"]),
  sCond("dpd", "DPD branch", "days_past_due", [
    { id: "early", label: "1–30 DPD", op: "between", value: "1", value2: "30" },
    { id: "mid",   label: "31–90 DPD", op: "between", value: "31", value2: "90" },
    { id: "late",  label: "90+ DPD",  op: "greater than", value: "90" },
  ]),
  sSms("smsDue", "SMS PL payment reminder", "SMS · amount due", SMS_PAYMENT_FAILED, {
    vars: [
      { v: "amount", def: "contact.amount_due" },
      { v: "order_id", def: "contact.loan_id" },
      { v: "link", def: "picomm.in/pay", mode: "constant" },
      { v: "hours", def: "24", mode: "constant" },
    ],
  }),
  sWa("waRem", "WhatsApp PL reminder", "WhatsApp · payment reminder", "collections_reminder_v1"),
  sWa("plEarly", "Payment link", "WhatsApp · pay now", "payment_link_v1"),
  sVoice("vColl", "Voice AI PL collections call", "Personal Loan collections call"),
  sWa("plMid", "Payment link", "WhatsApp · pay now", "payment_link_v1"),
  sVoice("vEsc", "Voice AI PL escalated call", "Escalated Personal Loan collections"),
  sWa("plLate", "Payment link", "WhatsApp · pay now", "payment_link_v1"),
  sDelay("d1", 23, "Hours"),
  sCond("paid", "Paid?", "payment_status", [
    { id: "yes", label: "Yes", value: "paid" },
    { id: "no", label: "No", value: "unpaid" },
  ]),
  sVoice("vfu", "Voice AI PL follow-up", "Reattempt · 1 retry", { maxAttempts: 1 }),
  sWa("plFu", "WhatsApp payment link", "WhatsApp · pay now", "payment_link_v1"),
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "dpd"),
  ed("dpd", "smsDue", "early"), ed("smsDue", "waRem"), ed("waRem", "plEarly"), ed("plEarly", "d1"),
  ed("dpd", "vColl", "mid"), ed("vColl", "plMid"), ed("plMid", "d1"),
  ed("dpd", "vEsc", "late"), ed("vEsc", "plLate"), ed("plLate", "d1"),
  ed("d1", "paid"), ed("paid", "end", "yes"),
  ed("paid", "vfu", "no"), ed("vfu", "plFu"), ed("plFu", "end"),
]);

/* ---- D2C · Cart Abandonment -------------------------------------------- */
const C_CART = buildCampaign("D2C · Cart Abandonment", [
  sStart(),
  sAud("CSV · cart abandoners", ["cart_value", "cart_items"]),
  sAiTransform("aitEnrich", "Enrich cart context", "3 AI-derived variables", [
    {
      id: "t1", type: "Custom AI Action",
      label: "Normalize phone", input: "", output: "phone_e164",
      prompt: "Normalize contact.phone to E.164 international format (e.g. +91XXXXXXXXXX).",
    },
    {
      id: "t2", type: "Custom AI Action",
      label: "Format cart value", input: "", output: "cart_value_fmt",
      prompt: "Format contact.cart_value as an INR currency string with correct separators (e.g. ₹5,499).",
    },
    {
      id: "t3", type: "Custom AI Action",
      label: "Greeting", input: "", output: "first_name_hi",
      prompt: "Transliterate contact.first_name into the Devanagari script for use in a Hindi WhatsApp greeting.",
    },
  ]),
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
  ed("start", "aud"), ed("aud", "aitEnrich"), ed("aitEnrich", "cart"),
  ed("cart", "vRec", "high"), ed("vRec", "cartHigh"), ed("cartHigh", "purHigh"),
  ed("purHigh", "end", "yes"), ed("purHigh", "vRemHigh", "no"), ed("vRemHigh", "end"),
  ed("cart", "ab", "low"),
  ed("ab", "abA", "vA"), ed("ab", "abB", "vB"),
  ed("abA", "cartLow"), ed("abB", "cartLow"),
  ed("cartLow", "d1"), ed("d1", "purLow"),
  ed("purLow", "end", "yes"), ed("purLow", "vRemLow", "no"), ed("vRemLow", "end"),
]);

/* ---- Retail · Loyalty Card Upsell -------------------------------------- */
// A four-tier Loyalty Card journey: Silver → Gold → Platinum → Black, segmented
// from a CSV the retailer has already tiered (`loyalty_tier`, derived from
// 6-month ACV/AOV/LTV). Enrollment is checked on the derived `enrollment_tier`
// variable (read-only here). Silver alone A/B-tests its invite and upsells free
// → paid Gold; Gold/Platinum/Black send a single invite, then run an enrollment
// check with a voice follow-up loop for non-enrollers, sharing one welcome per
// tier.

// One "confirm enrollment" tier block for Gold/Platinum/Black (no A/B split):
// single WhatsApp invite → Enrolled? → (enrolled) welcome / (not) voice follow-up →
// 24h delay → Enrolled now? → same shared welcome / End.
const loyaltyTierBlock = (p: string, tier: string, label: string): { specs: Spec[]; edges: SpecEdge[] } => ({
  specs: [
    sWa(`${p}Wa`, "WhatsApp invite", `${label} · join Loyalty Card`, `fcc_${tier}_invite`),
    sCond(`${p}Enr`, "Enrolled?", "enrollment_tier", [
      { id: tier, label: "Enrolled" },
      { id: "none", label: "Not enrolled" },
    ]),
    sWa(`${p}Wel`, `Welcome to ${label}`, `WhatsApp · ${label} welcome`, `fcc_welcome_${tier}`),
    sVoice(`${p}Fu`, "Voice AI follow-up", `Re-invite to ${label} Loyalty Card`, { maxAttempts: 1, timezone: "Asia/Kolkata (IST)" }),
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

const LOYALTY_GOLD = loyaltyTierBlock("g", "gold", "Gold");
const LOYALTY_PLATINUM = loyaltyTierBlock("p", "platinum", "Platinum");
const LOYALTY_BLACK = loyaltyTierBlock("b", "black", "Black");

const C_LOYALTY_UPSELL = buildCampaign("Retail · Loyalty Card Upsell", [
  sStart(),
  sAud("CSV · Loyalty Card members · key customer_id", [
    "loyalty_tier", "acv_6m", "aov_6m", "orders_6m", "lifetime_value", "last_purchase_days", "preferred_lang",
  ]),
  sCond("tierSplit", "Loyalty tier", "loyalty_tier", [
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
  sWa("sWaA", "WhatsApp invite · Perks", "Silver · join Loyalty Card", "fcc_silver_perks"),
  sWa("sWaB", "WhatsApp invite · Savings", "Silver · join Loyalty Card", "fcc_silver_savings"),
  sCond("sEnr", "Enrolled?", "enrollment_tier", [
    { id: "silver", label: "Enrolled" },
    { id: "none", label: "Not enrolled" },
  ]),
  sVoice("sUp", "Voice AI · upgrade to Gold", "Limited-time paid Gold upgrade offer", { timezone: "Asia/Kolkata (IST)" }),
  sDelay("sDly", 24, "Hours"),
  sCond("sUpg", "Upgraded to Gold?", "enrollment_tier", [
    { id: "gold", label: "Upgraded to Gold" },
    { id: "silver", label: "Still Silver" },
  ]),
  sWa("sWelGold", "Welcome to Gold", "WhatsApp · Gold welcome", "fcc_welcome_gold"),
  sWa("sWelSilver", "Welcome to Silver", "WhatsApp · Silver welcome", "fcc_welcome_silver"),
  // ---- Gold / Platinum / Black: single invite → enrollment check (+ voice follow-up loop) ----
  ...LOYALTY_GOLD.specs, ...LOYALTY_PLATINUM.specs, ...LOYALTY_BLACK.specs,
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
  ...LOYALTY_GOLD.edges, ...LOYALTY_PLATINUM.edges, ...LOYALTY_BLACK.edges,
]);

/* ---- B2B · Reactivate Paytm Soundbox Merchants ------------------------- */
// Paytm Soundbox = physical device that plays payment confirmations aloud for
// merchants (chai wallahs, kirana stores). Some go dormant (30+ days without
// receiving payments). This journey reactivates them across three dormancy
// buckets: gentle WhatsApp nudge for recent lapsers, voice + comeback offer for
// medium-dormancy, and a device-replacement path for long-dormant merchants.

const ffHelpR: Spec = {
  id: "ffHelpR",
  kind: "whatsappFreeform",
  title: "Freeform · Soundbox help",
  subtitle: "Freeform workflow · troubleshooting",
  outputs: [
    { id: "completed", label: "Success", kind: "outcome" },
    { id: "timed_out", label: "Timeout", kind: "outcome" },
    { id: "failed", label: "Failed", kind: "outcome" },
  ],
  config: {
    ffWorkflowId: "ff_soundbox_help",
    ffTimerMode: "inactivity",
    ffTimerMinutes: 30,
    ffVarMap: [
      { v: "{{name}}", def: "contact.first_name" },
      { v: "{{device_id}}", def: "contact.device_id" },
    ],
  },
};

const ffHelpM: Spec = {
  id: "ffHelpM",
  kind: "whatsappFreeform",
  title: "Freeform · Soundbox help",
  subtitle: "Freeform workflow · troubleshooting",
  outputs: [
    { id: "completed", label: "Success", kind: "outcome" },
    { id: "timed_out", label: "Timeout", kind: "outcome" },
    { id: "failed", label: "Failed", kind: "outcome" },
  ],
  config: {
    ffWorkflowId: "ff_soundbox_help",
    ffTimerMode: "inactivity",
    ffTimerMinutes: 30,
    ffVarMap: [
      { v: "{{name}}", def: "contact.first_name" },
      { v: "{{device_id}}", def: "contact.device_id" },
    ],
  },
};

const apiLog: Spec = {
  id: "apiLog",
  kind: "apiToolCall",
  title: "Log outreach to CRM",
  subtitle: "POST /api/merchant-outreach",
  outputs: [
    { id: "success", label: "Success", kind: "outcome" },
    { id: "failed",  label: "Failed",  kind: "outcome" },
  ],
  config: {},
};

const C_SOUNDBOX = buildCampaign("B2B · Reactivate Paytm Soundbox Merchants", [
  sStart(),
  sAud("CSV · dormant Soundbox merchants", [
    "last_txn_days", "monthly_tpv", "device_id", "merchant_tier", "preferred_lang",
  ]),
  sAiTransform("aitEnrich", "Enrich merchant context", "3 AI-derived variables", [
    {
      id: "t1", type: "Custom AI Action",
      label: "Normalize phone", input: "", output: "phone_e164",
      prompt: "Normalize contact.phone to E.164 international format (e.g. +91XXXXXXXXXX).",
    },
    {
      id: "t2", type: "Custom AI Action",
      label: "Format last payment date", input: "", output: "last_txn_fmt",
      prompt: "Format contact.last_txn_days as a human-readable string like 'about 6 weeks ago'.",
    },
    {
      id: "t3", type: "Custom AI Action",
      label: "Greeting", input: "", output: "first_name_hi",
      prompt: "Transliterate contact.first_name into the Devanagari script for use in a Hindi WhatsApp greeting.",
    },
  ]),
  sCond("dormancy", "Dormancy bucket", "last_txn_days", [
    { id: "recent", label: "30–60 days",  op: "between", value: "30", value2: "60" },
    { id: "medium", label: "60–180 days", op: "between", value: "60", value2: "180" },
    { id: "high",   label: "180+ days",   op: "greater than", value: "180" },
  ]),
  // Recent (30–60d): gentle WhatsApp nudge → wait → active again?
  sWa("waRecent", "WhatsApp check-in", "WhatsApp · we noticed you're quiet", "soundbox_reactivate_gentle_v1"),
  sDelay("dR1", 48, "Hours"),
  sCond("checkR", "Active again?", "reactivation_status", [
    { id: "reactivated", label: "Yes" },
    { id: "still_dormant", label: "No" },
  ]),
  ffHelpR,
  // Medium (60–180d): voice reactivation → comeback offer → wait → active again?
  sVoice("vMed", "Voice AI reactivation call", "Reactivation outreach", { timezone: "Asia/Kolkata (IST)" }),
  sWa("waMed", "WhatsApp offer", "WhatsApp · comeback offer", "soundbox_comeback_offer_v1"),
  sDelay("dM1", 48, "Hours"),
  sCond("checkM", "Active again?", "reactivation_status", [
    { id: "reactivated", label: "Yes" },
    { id: "still_dormant", label: "No" },
  ]),
  ffHelpM,
  // High (180+d): final voice outreach → device replacement offer → CRM log
  sVoice("vHigh", "Voice AI final outreach", "Final chance call", { timezone: "Asia/Kolkata (IST)", maxAttempts: 2 }),
  sWa("waHigh", "WhatsApp replacement offer", "WhatsApp · device replacement", "soundbox_device_replacement_v1"),
  apiLog,
  sEnd(),
], [
  ed("start", "aud"), ed("aud", "aitEnrich"), ed("aitEnrich", "dormancy"),
  ed("dormancy", "waRecent", "recent"),
  ed("dormancy", "vMed", "medium"),
  ed("dormancy", "vHigh", "high"),
  // Recent branch
  ed("waRecent", "dR1"), ed("dR1", "checkR"),
  ed("checkR", "end", "reactivated"),
  ed("checkR", "ffHelpR", "still_dormant"), ed("ffHelpR", "end"),
  // Medium branch
  ed("vMed", "waMed"), ed("waMed", "dM1"), ed("dM1", "checkM"),
  ed("checkM", "end", "reactivated"),
  ed("checkM", "ffHelpM", "still_dormant"), ed("ffHelpM", "end"),
  // High branch
  ed("vHigh", "waHigh"), ed("waHigh", "apiLog"), ed("apiLog", "end"),
]);

const RAW_EXAMPLE_CAMPAIGNS: Record<string, ExampleCampaign> = {
  c_ex17: C_LOYALTY_UPSELL,
  c_ex4: C_RENEWAL,
  c_ex6: C_PL_COLLECT,
  c_ex14: C_CART,
  c_ex_soundbox: C_SOUNDBOX,
};

/* ---- normalization ------------------------------------------------------
 * Mirror the live builder's node-identity + branching rules onto every example:
 *  - assign a per-kind serial (`whatsapp_2`, `cond_1`, …) by node order,
 *  - derive a short (≤12 char) description from the title (drives the sub-heading),
 *  - ensure every Conditional carries an always-on `default` / else output handle.
 * Start/End stay structural (no serial — the sub-heading simply omits the line). */
const DESCRIPTION_MAX = 12;
function shortDesc(title: string): string {
  // Prefer the distinguishing suffix after a "·" (e.g. "Chat AI · loyalty" → "loyalty",
  // "Delay · 5 days" → "5 days"); otherwise use the whole title. Trim to ≤12 chars on a
  // word boundary where possible.
  const parts = title.split("·").map((s) => s.trim()).filter(Boolean);
  const base = (parts.length > 1 ? parts[parts.length - 1] : parts[0]) || title;
  if (base.length <= DESCRIPTION_MAX) return base;
  const cut = base.slice(0, DESCRIPTION_MAX);
  const sp = cut.lastIndexOf(" ");
  return (sp >= 5 ? cut.slice(0, sp) : cut).trim();
}

function normalizeCampaign(c: ExampleCampaign): ExampleCampaign {
  const counters: Partial<Record<NodeKind, number>> = {};
  // WhatsApp nodes authored without explicit outputs get the standard handle set
  // here (reply_received + no_response + any trackable button + failure); their
  // port-less onward edge fans to every non-failure handle so each engagement
  // path is wired. Failure stays a dangling handle by default — authors opt
  // into wiring it (fallback SMS, escalate, etc.).
  const waFanned = new Map<string, NodeOutput[]>();
  // Voice nodes carry two fixed handles (Success, Failure). Unhandled
  // port-less onward edges are rewritten to `success` so existing single-edge
  // Voice → next flows continue to work; Failure stays dangling by default.
  const voiceIds = new Set<string>();
  // Conditional nodes that have an always-on `default` handle — used below to
  // guarantee that handle is wired (no lead ever stuck on a dangling default).
  const conditionalIds = new Set<string>();
  const nodes = c.nodes.map((n) => {
    const { kind } = n.data;
    if (kind === "start" || kind === "end") return n;
    const idx = (counters[kind] = (counters[kind] ?? 0) + 1);
    const serial = n.data.serial ?? `${SERIAL_PREFIX[kind]}_${idx}`;
    const description = n.data.description ?? shortDesc(n.data.title);
    let outputs = n.data.outputs;
    if (kind === "conditional") {
      const outs = outputs ?? [];
      if (!outs.some((o) => o.id === "default")) {
        outputs = [...outs, { id: "default", label: "Default / else", kind: "default" as NodeOutputKind }];
      }
      conditionalIds.add(n.id);
    } else if (kind === "whatsapp" && (!outputs || outputs.length === 0)) {
      const tmpl = n.data.config?.waMode === "freeform" ? undefined : resolveWaTemplate(n.data.config?.waTemplate);
      outputs = whatsappOutputs(tmpl);
      waFanned.set(n.id, outputs);
    } else if (kind === "voiceCall" && (!outputs || outputs.length === 0)) {
      outputs = completedOutput();
      voiceIds.add(n.id);
    }
    return { ...n, data: { ...n.data, serial, description, outputs } };
  });
  let edges = c.edges;
  if (waFanned.size) {
    const fanned: Edge[] = [];
    let fi = 0;
    c.edges.forEach((e) => {
      const handles = waFanned.get(e.source);
      if (handles && !e.sourceHandle) {
        // Fan onto every handle EXCEPT `failure` — failure paths need an
        // explicit target so we don't silently wire the success flow into a
        // fallback branch.
        handles.filter((h) => h.id !== "failure").forEach((h) =>
          fanned.push({ ...e, id: `${e.id}_${h.id}_${fi++}`, sourceHandle: h.id }),
        );
      } else {
        fanned.push(e);
      }
    });
    edges = fanned;
  }
  if (voiceIds.size) {
    // Rewrite unhandled port-less edges from Voice nodes to `success`. This
    // preserves the historical semantics (Voice → next means "on completion")
    // while the Failure handle stays dangling for authors to wire.
    edges = edges.map((e) =>
      voiceIds.has(e.source) && !e.sourceHandle
        ? { ...e, sourceHandle: "success" }
        : e,
    );
  }
  // Wire every conditional's always-on `default` handle to the End node when no
  // edge already sources from it — otherwise the default branch dangles.
  const endNode = nodes.find((n) => n.data.kind === "end");
  if (endNode && conditionalIds.size) {
    const defaultEdges: Edge[] = [];
    conditionalIds.forEach((condId) => {
      const wired = edges.some((e) => e.source === condId && e.sourceHandle === "default");
      if (!wired) {
        defaultEdges.push({
          id: `${condId}_default_end`,
          source: condId,
          sourceHandle: "default",
          target: endNode.id,
          type: EDGE,
        });
      }
    });
    if (defaultEdges.length) edges = [...edges, ...defaultEdges];
  }
  return { ...c, nodes, edges };
}

export const EXAMPLE_CAMPAIGNS: Record<string, ExampleCampaign> = Object.fromEntries(
  Object.entries(RAW_EXAMPLE_CAMPAIGNS).map(([id, c]) => [id, normalizeCampaign(c)]),
);

/** Names + status for the campaigns list (kept in sync with the registry above). */
export const EXAMPLE_CAMPAIGN_NAMES: { id: string; name: string; status: CampaignStatus }[] =
  Object.entries(EXAMPLE_CAMPAIGNS).map(([id, c]) => ({ id, name: c.name, status: c.status }));
