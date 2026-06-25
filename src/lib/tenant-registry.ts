/**
 * Tenant registry — the single source of real, selectable resources for the
 * Ask Pi conversational campaign builder (A1 templates, A2 briefs).
 *
 * Pickers in the Resolve card are bound to these arrays, so only real/approved
 * IDs can ever be chosen. In production these would be backend lookups; here
 * they are seeded with realistic values that mirror the rest of the app
 * (ConfigPanel options, agents.index voice agents, campaign-examples senders).
 */

import type { Edge, Node } from "reactflow";
import type { WorkflowNodeData } from "./campaign-types";
import type { AskPiPlan } from "@/components/workflow/AskPiWizard";

/* ---------------------------------------------------------------- */
/* Registry types + data                                            */
/* ---------------------------------------------------------------- */

export type ApprovalStatus = "approved" | "pending_reapproval";

export type Segment = { id: string; label: string; size: string };
export type WaTemplate = {
  id: string;
  label: string;
  category: "Marketing" | "Utility";
  status: ApprovalStatus;
  vars: string[];
};
export type SmsSender = { id: string; senderId: string; peId: string; label: string };
export type VoiceAgentRef = { id: string; name: string; type: "voice" | "chat"; status: string };
export type TenantDefaults = {
  windowStart: string;
  windowEnd: string;
  timezone: string;
  freqCap: string;
  waNumber: string;
};

export const SEGMENTS: Segment[] = [
  { id: "seg_points_expiry_30d", label: "Amber points expiring in 30 days", size: "8,210" },
  { id: "seg_points_expiry_60d", label: "Amber points expiring in 60 days", size: "14,905" },
  { id: "seg_cart_48h", label: "Abandoned cart · last 48h · Al Tayer", size: "3,477" },
  { id: "seg_cart_7d", label: "Abandoned cart · last 7d · Al Tayer", size: "11,260" },
  { id: "seg_lapsed_90d", label: "Lapsed members · 90d", size: "26,540" },
];

export const WA_TEMPLATES: WaTemplate[] = [
  { id: "wa_points_expiry_v3", label: "points_expiry_reminder_v3", category: "Utility", status: "approved", vars: ["{{1}}", "{{2}}"] },
  { id: "wa_cart_recovery_v2", label: "cart_recovery_v2", category: "Marketing", status: "approved", vars: ["{{1}}", "{{2}}"] },
  { id: "wa_cart_recovery_v3", label: "cart_recovery_v3", category: "Marketing", status: "pending_reapproval", vars: ["{{1}}", "{{2}}"] },
  { id: "wa_reactivate_v3", label: "reactivate_v3", category: "Marketing", status: "approved", vars: ["{{1}}"] },
];

export const SMS_SENDERS: SmsSender[] = [
  { id: "sms_amber", senderId: "AMBER", peId: "1101234567890123456", label: "AMBER · Promotional" },
  { id: "sms_altayer", senderId: "ALTAYR", peId: "1107654321098765432", label: "ALTAYR · Promotional" },
  { id: "sms_ambertx", senderId: "AMBRTX", peId: "1109988776655443322", label: "AMBRTX · Transactional" },
];

/** Voice agents mirror the live voice agents from agents.index.tsx (live only). */
export const VOICE_AGENTS: VoiceAgentRef[] = [
  { id: "a_voice_react", name: "Reactivation Voice", type: "voice", status: "live" },
  { id: "a_points_voice", name: "Points Expiry Voice", type: "voice", status: "live" },
  { id: "a_winback", name: "Win-back Voice", type: "voice", status: "live" },
];

export const TENANT_DEFAULTS: TenantDefaults = {
  windowStart: "10:00",
  windowEnd: "19:00",
  timezone: "Asia/Dubai (GST)",
  freqCap: "2 / week",
  waNumber: "+971 4 123 4567 · Amber",
};

/* ---------------------------------------------------------------- */
/* Declared open variables                                          */
/* ---------------------------------------------------------------- */

export type TemplateVar =
  | { key: string; kind: "segment"; label: string; required?: boolean }
  | { key: string; kind: "waTemplate"; label: string; required?: boolean }
  | { key: string; kind: "voiceAgent"; label: string; required?: boolean }
  | { key: string; kind: "smsSender"; label: string; required?: boolean }
  | { key: string; kind: "duration"; label: string; default: string; required?: boolean }
  | { key: string; kind: "splitAttribute"; label: string; required?: boolean }
  | { key: string; kind: "threshold"; label: string; default: string; required?: boolean }
  | { key: string; kind: "splitValue"; label: string; options: string[]; required?: boolean }
  | { key: string; kind: "percent"; label: string; default: string; required?: boolean }
  | { key: string; kind: "window"; label: string; default: string; required?: boolean }
  | { key: string; kind: "choice"; label: string; default: string; options: string[]; required?: boolean };

/**
 * Audience attributes a no-fallback multi-channel campaign can split on. A
 * `numeric` attribute splits on a threshold (≥ goes to the priority channel);
 * a `categorical` attribute splits on a chosen value from `options` (matching
 * rows go to the priority channel, the rest to the other).
 */
export type SplitAttribute = {
  id: string;
  label: string;
  unit: string;
  example: string;
  type: "numeric" | "categorical";
  options?: string[];
};
export const SPLIT_ATTRIBUTES: SplitAttribute[] = [
  { id: "cart_value", label: "Cart value", unit: "AED", example: "1500", type: "numeric" },
  { id: "order_value", label: "Lifetime order value", unit: "AED", example: "12000", type: "numeric" },
  { id: "engagement_score", label: "Engagement score", unit: "", example: "60", type: "numeric" },
  { id: "loyalty_points", label: "Amber points", unit: "", example: "1000", type: "numeric" },
  { id: "customer_type", label: "Member tier", unit: "", example: "Premium", type: "categorical", options: ["Classic", "Premium", "Elite"] },
  { id: "city_tier", label: "Emirate", unit: "", example: "Dubai", type: "categorical", options: ["Dubai", "Abu Dhabi", "Sharjah"] },
  { id: "language", label: "Preferred language", unit: "", example: "Arabic", type: "categorical", options: ["Arabic", "English", "French"] },
];
export const findSplitAttribute = (id?: string) => SPLIT_ATTRIBUTES.find((a) => a.id === id);

/**
 * The open variables a split journey adds, shaped by the chosen attribute:
 * always the attribute picker, plus a numeric `threshold` OR a categorical
 * `splitValue` (the value that routes to the priority channel). Before an
 * attribute is chosen only the picker shows.
 */
export function splitFieldsFor(attrId?: string): TemplateVar[] {
  const attr = findSplitAttribute(attrId);
  const picker: TemplateVar = { key: "splitAttribute", kind: "splitAttribute", label: "Split audience by", required: true };
  if (!attr) return [picker];
  if (attr.type === "categorical") {
    return [
      picker,
      { key: "splitValue", kind: "splitValue", label: `${attr.label} that goes to the priority channel`, options: attr.options ?? [], required: true },
    ];
  }
  return [
    picker,
    { key: "splitThreshold", kind: "threshold", label: "Threshold (≥ goes to priority channel)", default: "", required: true },
  ];
}

/** The single open variable a channel A/B experiment adds: the % to the priority channel. */
export function experimentVars(): TemplateVar[] {
  return [
    { key: "splitPct", kind: "percent", label: "% of audience to the priority channel (A/B)", default: "50", required: true },
  ];
}

/**
 * The open variables a conditional branch adds, shaped by the chosen attribute:
 * always the attribute picker, plus a numeric `conditionThreshold` OR a
 * categorical `conditionValue` that defines the Match branch (the rest take the
 * Else branch). Distinct keys (conditionAttribute / conditionValue /
 * conditionThreshold) so they never collide with an A/B split's vars, but reuse
 * the split *kinds* so the Resolve card + resolveFromText handle them unchanged.
 */
export function conditionFieldsFor(attrId?: string): TemplateVar[] {
  const attr = findSplitAttribute(attrId);
  const picker: TemplateVar = { key: "conditionAttribute", kind: "splitAttribute", label: "Branch audience by", required: true };
  if (!attr) return [picker];
  if (attr.type === "categorical") {
    return [
      picker,
      { key: "conditionValue", kind: "splitValue", label: `${attr.label} that takes the Match branch`, options: attr.options ?? [], required: true },
    ];
  }
  return [
    picker,
    { key: "conditionThreshold", kind: "threshold", label: "Threshold (≥ takes the Match branch)", default: "", required: true },
  ];
}

/* ---------------------------------------------------------------- */
/* Timing — the "when" open variables (folded into the Resolve card) */
/* ---------------------------------------------------------------- */

/** The tenant's default sending window, as one "HH:MM–HH:MM" string. */
export const DEFAULT_SEND_WINDOW = `${TENANT_DEFAULTS.windowStart}–${TENANT_DEFAULTS.windowEnd}`;
/** Frequency-cap presets offered on the Resolve card. */
export const FREQUENCY_OPTIONS = ["1 / week", "2 / week", "3 / week", "No cap"];
/** Concrete start presets (no real scheduler in the demo — relative labels only). */
export const START_OPTIONS = ["As soon as approved", "Tomorrow 10:00", "Next Monday 10:00"];

/**
 * The "when" open variables every brief carries: sending window, frequency cap,
 * and start timing. All optional — each ships with the tenant default, surfaced
 * as an assumption until the user edits it on the Resolve card. Added to the
 * brief-path gaps only (the A1 template path keeps its own declared vars).
 */
export function timingVars(): TemplateVar[] {
  return [
    { key: "sendWindow", kind: "window", label: "Sending window", default: DEFAULT_SEND_WINDOW, required: false },
    { key: "frequencyCap", kind: "choice", label: "Frequency cap", default: TENANT_DEFAULTS.freqCap, options: FREQUENCY_OPTIONS, required: false },
    { key: "startTiming", kind: "choice", label: "Start", default: START_OPTIONS[0], options: START_OPTIONS, required: false },
  ];
}

/* ---------------------------------------------------------------- */
/* Lookup helpers                                                   */
/* ---------------------------------------------------------------- */

export const findSegment = (id?: string) => SEGMENTS.find((s) => s.id === id);
export const findWaTemplate = (id?: string) => WA_TEMPLATES.find((t) => t.id === id);
export const findSmsSender = (id?: string) => SMS_SENDERS.find((s) => s.id === id);
export const findVoiceAgent = (id?: string) => VOICE_AGENTS.find((a) => a.id === id);

/** Parse "6 hours" / "3h" / "1 day" → { value, unit }. Falls back to 6 Hours. */
export function parseDuration(raw: string): { value: number; unit: "Minutes" | "Hours" | "Days" } {
  const m = raw.trim().match(/(\d+)\s*(m|min|minute|h|hr|hour|d|day)/i);
  if (!m) return { value: 6, unit: "Hours" };
  const n = parseInt(m[1], 10);
  const u = m[2].toLowerCase();
  if (u.startsWith("m")) return { value: n, unit: "Minutes" };
  if (u.startsWith("d")) return { value: n, unit: "Days" };
  return { value: n, unit: "Hours" };
}

const durationLabel = (raw: string) => {
  const { value, unit } = parseDuration(raw);
  return `${value} ${unit}`;
};

/* ---------------------------------------------------------------- */
/* Free-text → registry id matchers (for the typed resolve loop)    */
/* ---------------------------------------------------------------- */

/**
 * Map free-form user text to a real registry id, or `undefined` when nothing
 * matches confidently. The agent never invents ids — when the user *types* an
 * answer mid-resolve ("use the lapsed members segment") these matchers turn it
 * into the same id a picker would have produced. An exact id/label hit always
 * wins; otherwise a small keyword table resolves the demo registries. Matching
 * is conservative: ambiguous text returns undefined so the card stays the
 * fallback.
 */
export function matchSegment(text: string): string | undefined {
  const t = (text || "").toLowerCase();
  const exact = SEGMENTS.find((s) => t.includes(s.id) || t.includes(s.label.toLowerCase()));
  if (exact) return exact.id;
  if (/lapsed|inactive|haven'?t shopped|win.?back|dormant/.test(t)) return "seg_lapsed_90d";
  if (/cart|abandon/.test(t)) return /\b7\s*d|7\s*day|week/.test(t) ? "seg_cart_7d" : "seg_cart_48h";
  if (/points|expir/.test(t)) return /\b60\b/.test(t) ? "seg_points_expiry_60d" : "seg_points_expiry_30d";
  return undefined;
}

export function matchWaTemplate(text: string): string | undefined {
  const t = (text || "").toLowerCase();
  const exact = WA_TEMPLATES.find((w) => t.includes(w.id) || t.includes(w.label.toLowerCase()));
  if (exact) return exact.id;
  if (/reactivat/.test(t)) return "wa_reactivate_v3";
  if (/points|expir/.test(t)) return "wa_points_expiry_v3";
  if (/cart|recovery/.test(t)) return /v3/.test(t) ? "wa_cart_recovery_v3" : "wa_cart_recovery_v2";
  return undefined;
}

export function matchVoiceAgent(text: string): string | undefined {
  const t = (text || "").toLowerCase();
  const exact = VOICE_AGENTS.find((a) => t.includes(a.id) || t.includes(a.name.toLowerCase()));
  if (exact) return exact.id;
  if (/reactivat/.test(t)) return "a_voice_react";
  if (/points|expir/.test(t)) return "a_points_voice";
  if (/win.?back/.test(t)) return "a_winback";
  return undefined;
}

export function matchSplitAttribute(text: string): string | undefined {
  const t = (text || "").toLowerCase();
  const exact = SPLIT_ATTRIBUTES.find((a) => t.includes(a.id) || t.includes(a.label.toLowerCase()));
  if (exact) return exact.id;
  if (/cart\s*value/.test(t)) return "cart_value";
  if (/order|lifetime|ltv/.test(t)) return "order_value";
  if (/engage/.test(t)) return "engagement_score";
  if (/points|loyalty/.test(t)) return "loyalty_points";
  if (/tier|premium|elite|classic/.test(t)) return "customer_type";
  if (/emirate|city|dubai|abu dhabi|sharjah/.test(t)) return "city_tier";
  if (/language|arabic|english|french/.test(t)) return "language";
  return undefined;
}

/**
 * Parse a free-text time range ("10:00–19:00", "9am to 5pm", "between 11 and 18")
 * into normalised 24h "HH:MM" bounds, or `undefined` when two times aren't found.
 */
export function parseSendWindow(raw: string): { start: string; end: string } | undefined {
  const t = (raw || "").trim();
  if (!t) return undefined;
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
  const times: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null && times.length < 2) {
    let h = parseInt(m[1], 10);
    const min = m[2] ?? "00";
    const ap = m[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23 || Number(min) > 59) continue;
    times.push(`${String(h).padStart(2, "0")}:${min}`);
  }
  if (times.length < 2) return undefined;
  return { start: times[0], end: times[1] };
}

/** True when a sending window stays inside the 9am–9pm quiet-hours rule (start < end). */
export function windowWithinQuietHours(window: string): boolean {
  const w = parseSendWindow(window);
  if (!w) return true; // unparseable text never blocks
  const toMin = (s: string) => {
    const [h, mm] = s.split(":").map(Number);
    return h * 60 + (mm || 0);
  };
  const start = toMin(w.start);
  const end = toMin(w.end);
  return start >= 9 * 60 && end <= 21 * 60 && start < end;
}

/** Map free text to a frequency-cap preset ("twice a week" → "2 / week", "no limit" → "No cap"). */
export function matchFrequency(text: string): string | undefined {
  const t = (text || "").toLowerCase();
  if (/no cap|no limit|unlimited|no frequency|don'?t cap/.test(t)) return "No cap";
  const n = t.match(/(\d+)\s*(?:\/|per|x|a|times?(?:\s+a)?)?\s*(?:week|wk)/);
  if (n) return `${n[1]} / week`;
  if (/once a week|weekly/.test(t)) return "1 / week";
  if (/twice a week|two a week/.test(t)) return "2 / week";
  if (/thrice|three a week/.test(t)) return "3 / week";
  return undefined;
}

/** Map free text to a start preset ("immediately" → as soon as approved, "tomorrow", "next Monday"). */
export function matchStart(text: string): string | undefined {
  const t = (text || "").toLowerCase();
  if (/as soon|immediately|right away|asap|once approved|on approval|straight away/.test(t)) return "As soon as approved";
  if (/tomorrow/.test(t)) return "Tomorrow 10:00";
  if (/monday|next week/.test(t)) return "Next Monday 10:00";
  return undefined;
}

/**
 * Given the currently-open variables and a user's free-text message, extract
 * only the values that match confidently (keyed by `TemplateVar.key`), plus the
 * required keys that could NOT be filled. Used by the `applyAnswers` action so a
 * typed answer is interchangeable with the Resolve card. Optional vars left
 * unmentioned aren't "unmatched" — they keep their default.
 */
export function resolveFromText(
  vars: TemplateVar[],
  text: string,
): { values: Record<string, string>; unmatched: string[] } {
  const t = text || "";
  const values: Record<string, string> = {};
  const durationRe = /\d+\s*(?:m|min|minute|h|hr|hour|d|day)s?/i;
  const timeToken = t.match(durationRe);
  // A duration tied to the fallback wins over an incidental time mention elsewhere
  // (e.g. "points expiring in 30 days … fallback 6h" must bind the wait to 6h, not 30d).
  const scopedToken =
    t.match(new RegExp(`(?:fallback|wait|window|delay|after)\\D{0,16}(${durationRe.source})`, "i"))?.[1] ??
    timeToken?.[0];

  for (const v of vars) {
    switch (v.kind) {
      case "segment": {
        const id = matchSegment(t);
        if (id) values[v.key] = id;
        break;
      }
      case "waTemplate": {
        const id = matchWaTemplate(t);
        if (id) values[v.key] = id;
        break;
      }
      case "voiceAgent": {
        const id = matchVoiceAgent(t);
        if (id) values[v.key] = id;
        break;
      }
      case "smsSender": {
        const s = SMS_SENDERS.find((x) => t.toLowerCase().includes(x.id) || t.toLowerCase().includes(x.senderId.toLowerCase()));
        if (s) values[v.key] = s.id;
        break;
      }
      case "duration": {
        if (scopedToken) values[v.key] = durationLabel(scopedToken);
        break;
      }
      case "percent": {
        const pm = t.match(/(\d{1,3})\s*%/) ?? (/%|a\/b|split|test/i.test(t) ? t.match(/\b(\d{1,3})\b/) : null);
        if (pm) values[v.key] = pm[1];
        break;
      }
      case "splitAttribute": {
        const id = matchSplitAttribute(t);
        if (id) values[v.key] = id;
        break;
      }
      case "splitValue": {
        const opt = v.options.find((o) => t.toLowerCase().includes(o.toLowerCase()));
        if (opt) values[v.key] = opt;
        break;
      }
      case "threshold": {
        // A bare number that isn't a time/percent token (those are handled above).
        const nm = t.match(/\b(\d{2,})\b/);
        if (nm && !timeToken) values[v.key] = nm[1];
        break;
      }
      case "window": {
        // Only bind when the text clearly states a time RANGE, not an incidental time.
        const range = t.match(
          /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:–|—|-|to|until|till|through|and)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
        );
        if (range) {
          const w = parseSendWindow(range[0]);
          if (w) values[v.key] = `${w.start}–${w.end}`;
        }
        break;
      }
      case "choice": {
        const opt = v.options.find((o) => t.toLowerCase().includes(o.toLowerCase()));
        if (opt) { values[v.key] = opt; break; }
        if (v.key === "frequencyCap") {
          const f = matchFrequency(t);
          if (f) values[v.key] = f;
        } else if (v.key === "startTiming") {
          const s = matchStart(t);
          if (s) values[v.key] = s;
        }
        break;
      }
    }
  }

  const unmatched = vars.filter((v) => v.required && !values[v.key]).map((v) => v.key);
  return { values, unmatched };
}

/* ---------------------------------------------------------------- */
/* Channels — the building blocks for templates and briefs          */
/* ---------------------------------------------------------------- */

/**
 * This workspace supports two channels only: WhatsApp and an AI Voice agent.
 * Anything else a brief mentions (SMS, email, push, RCS) is surfaced as
 * "detected but unavailable" rather than silently dropped.
 */
export type Channel = "whatsapp" | "voice";

/**
 * The channels / priority / fallback details Pi confirms before drafting an
 * A2 brief (and that back a multi-channel A1 template). `primary` sends first;
 * `fallback` (if any) sends after `fallbackWait` when the primary isn't delivered.
 * `unavailable` lists channel names the brief asked for that this workspace
 * doesn't support; `experiment` marks an A/B-test framing (split to compare).
 */
export type BriefConfig = {
  channels: Channel[];
  primary: Channel;
  fallback: Channel | null;
  fallbackWait: string;
  unavailable?: string[];
  experiment?: boolean;
  /** Marks a conditional-branch framing — the audience is routed down a Match / Else branch on an attribute. */
  conditional?: boolean;
  /** False when the brief named no channel (we defaulted to WhatsApp) — Pi then captures channels via a card. */
  channelsNamed?: boolean;
};

export const CHANNEL_META: Record<
  Channel,
  { label: string; resourceKind: TemplateVar["kind"]; resourceKey: string; resourceLabel: string }
> = {
  whatsapp: { label: "WhatsApp", resourceKind: "waTemplate", resourceKey: "waTemplate", resourceLabel: "Approved WhatsApp template" },
  voice: { label: "Voice (AI)", resourceKind: "voiceAgent", resourceKey: "voiceAgent", resourceLabel: "Voice agent" },
};

export const CHANNEL_SAMPLE: Record<Channel, string> = {
  whatsapp: "Hi {{1}}, you left items in your cart — complete your order here: {{2}}",
  voice: "\"Hi, this is calling about the items still in your cart — can I help you complete the order now?\"",
};

const channelGap = (ch: Channel): TemplateVar => {
  const m = CHANNEL_META[ch];
  return { key: m.resourceKey, kind: m.resourceKind, label: m.resourceLabel, required: true } as TemplateVar;
};

/** One journey node for a channel, configured from resolved values + tenant defaults. */
function channelNode(ch: Channel, y: number, resolved: Record<string, string>): Node<WorkflowNodeData> {
  if (ch === "whatsapp") {
    const wa = findWaTemplate(resolved.waTemplate);
    return { id: "wa", type: "workflow", position: { x: 0, y },
      data: { kind: "whatsapp", title: "WhatsApp message",
        subtitle: wa ? `Template: ${wa.label}` : "Pick template",
        valid: !!wa, error: wa ? undefined : "Pick template",
        config: { waNumber: TENANT_DEFAULTS.waNumber, waMode: "template",
          waTemplate: wa ? `${wa.label} · ${wa.category}` : undefined,
          waVarMap: [{ v: "{{1}}", def: "contact.first_name" }, { v: "{{2}}", def: "payload.order_id" }] } } };
  }
  const agent = findVoiceAgent(resolved.voiceAgent);
  return { id: "voice", type: "workflow", position: { x: 0, y },
    data: { kind: "voiceCall", title: "Voice call",
      subtitle: agent ? `Agent: ${agent.name}` : "Select voice agent",
      valid: !!agent, error: agent ? undefined : "Select agent",
      config: { agent: agent?.name, callStart: TENANT_DEFAULTS.windowStart,
        callEnd: TENANT_DEFAULTS.windowEnd, timezone: TENANT_DEFAULTS.timezone,
        maxAttempts: 3, retryInterval: "1 hour",
        voiceVarMap: [{ v: "{{name}}", def: "contact.first_name" }] } } };
}

/**
 * Linear journey from a channel config: start → audience → primary →
 * (fallback ? wait → fallback) → end. Used by both A2 briefs and the
 * multi-channel A1 templates so node IDs/shape stay consistent for
 * applyResolved + applyRefinement (delay node patched in place).
 */
function buildFromChannels(name: string, cfg: BriefConfig, resolved: Record<string, string>): AskPiPlan {
  const seg = findSegment(resolved.segment);
  const nodes: Node<WorkflowNodeData>[] = [
    { id: "start", type: "workflow", position: { x: 0, y: 0 },
      data: { kind: "start", title: "Start", locked: true, valid: true } },
    { id: "audience", type: "workflow", position: { x: 0, y: 120 },
      data: { kind: "audience", title: "Audience",
        subtitle: seg ? `${seg.label} · ${seg.size}` : "Select segment",
        valid: !!seg, error: seg ? undefined : "Select segment",
        config: { audienceMode: "api", phoneField: "contact.phone" } } },
  ];
  let y = 240;
  nodes.push(channelNode(cfg.primary, y, resolved));
  y += 120;
  if (cfg.fallback) {
    const { value, unit } = parseDuration(resolved.fallbackWindow ?? cfg.fallbackWait);
    nodes.push({ id: "delay", type: "workflow", position: { x: 0, y },
      data: { kind: "delay", title: "Fallback wait", subtitle: `${value} ${unit}`, valid: true,
        config: { delayValue: value, delayUnit: unit } } });
    y += 120;
    nodes.push(channelNode(cfg.fallback, y, resolved));
    y += 120;
  }
  nodes.push({ id: "end", type: "workflow", position: { x: 0, y },
    data: { kind: "end", title: "End", locked: true, valid: true } });

  const ids = nodes.map((n) => n.id);
  const edges: Edge[] = ids.slice(1).map((id, i) => ({ id: `e_${ids[i]}_${id}`, source: ids[i], target: id }));
  return { nodes, edges, name };
}

/** Fixed canvas node id for each channel (kept stable for applyResolved patches). */
export const CHANNEL_NODE_ID: Record<Channel, string> = { whatsapp: "wa", voice: "voice" };

/**
 * Parallel journey for multiple channels with NO fallback: audience fans out
 * directly to each channel node (side by side), each channel ends. Used when a
 * brief names several channels but no fallback — the audience is split between
 * them rather than sequenced.
 */
function buildParallelChannels(name: string, cfg: BriefConfig, resolved: Record<string, string>): AskPiPlan {
  const seg = findSegment(resolved.segment);
  const nodes: Node<WorkflowNodeData>[] = [
    { id: "start", type: "workflow", position: { x: 0, y: 0 },
      data: { kind: "start", title: "Start", locked: true, valid: true } },
    { id: "audience", type: "workflow", position: { x: 0, y: 120 },
      data: { kind: "audience", title: "Audience",
        subtitle: seg ? `${seg.label} · ${seg.size}` : "Select segment",
        valid: !!seg, error: seg ? undefined : "Select segment",
        config: { audienceMode: "api", phoneField: "contact.phone" } } },
  ];
  let x = -180;
  const channelIds: string[] = [];
  for (const ch of cfg.channels) {
    const node = channelNode(ch, 260, resolved);
    node.position = { x, y: 260 };
    nodes.push(node);
    channelIds.push(node.id);
    x += 360;
  }
  nodes.push({ id: "end", type: "workflow", position: { x: 0, y: 400 },
    data: { kind: "end", title: "End", locked: true, valid: true } });

  const edges: Edge[] = [
    { id: "e_start_audience", source: "start", target: "audience" },
    ...channelIds.map((cid) => ({ id: `e_audience_${cid}`, source: "audience", target: cid })),
    ...channelIds.map((cid) => ({ id: `e_${cid}_end`, source: cid, target: "end" })),
  ];
  return { nodes, edges, name };
}

/** Fixed canvas node id for the conditional branch node (stable for patching). */
export const CONDITION_NODE_ID = "branch";

/**
 * Conditional journey: start → audience → a conditional branch node whose two
 * labeled outputs (Match / Else) route — via `sourceHandle` edges — to a channel
 * node or straight to End. Match defaults to the primary channel, Else to the
 * other channel (or End when only one channel is in play); the resolve card can
 * override both. The branch node's subtitle states the rule (attribute ≥ value /
 * = value); routing is read from `resolved.branchMatch` / `resolved.branchElse`
 * (a channel node id or "end"). A channel node is built only when the routing
 * actually targets it. Stable node ids (audience / branch / wa / voice / end).
 */
export function buildConditionalChannels(
  name: string,
  cfg: BriefConfig,
  resolved: Record<string, string>,
): AskPiPlan {
  const seg = findSegment(resolved.segment);
  const attr = findSplitAttribute(resolved.conditionAttribute);
  const categorical = attr?.type === "categorical";
  const branchValue = categorical ? resolved.conditionValue : resolved.conditionThreshold;
  const matchCut = attr
    ? categorical
      ? `${attr.label} = ${resolved.conditionValue ?? "…"}`
      : `${attr.label} ≥ ${attr.unit}${resolved.conditionThreshold ?? "…"}`
    : "Set the branch rule";

  // Routing targets — default Match→primary, Else→other channel (or End).
  const elseDefaultCh = cfg.channels.find((c) => c !== cfg.primary);
  const matchTarget = resolved.branchMatch || CHANNEL_NODE_ID[cfg.primary];
  const elseTarget = resolved.branchElse || (elseDefaultCh ? CHANNEL_NODE_ID[elseDefaultCh] : "end");

  const nodes: Node<WorkflowNodeData>[] = [
    { id: "start", type: "workflow", position: { x: 0, y: 0 },
      data: { kind: "start", title: "Start", locked: true, valid: true } },
    { id: "audience", type: "workflow", position: { x: 0, y: 120 },
      data: { kind: "audience", title: "Audience",
        subtitle: seg ? `${seg.label} · ${seg.size}` : "Select segment",
        valid: !!seg, error: seg ? undefined : "Select segment",
        config: { audienceMode: "api", phoneField: "contact.phone" } } },
    { id: CONDITION_NODE_ID, type: "workflow", position: { x: 0, y: 240 },
      data: { kind: "conditional", title: "Conditional branch",
        subtitle: matchCut,
        valid: !!attr && !!branchValue,
        error: attr && branchValue ? undefined : "Set the branch rule",
        outputs: [
          { id: "match", label: "Match", kind: "branch" },
          { id: "else", label: "Else", kind: "branch" },
        ] } },
  ];

  // A channel node is built only when routing actually targets it.
  const usedChannels = cfg.channels.filter(
    (ch) => matchTarget === CHANNEL_NODE_ID[ch] || elseTarget === CHANNEL_NODE_ID[ch],
  );
  let x = -180;
  for (const ch of usedChannels) {
    const node = channelNode(ch, 380, resolved);
    node.position = { x, y: 380 };
    nodes.push(node);
    x += 360;
  }
  nodes.push({ id: "end", type: "workflow", position: { x: 0, y: 520 },
    data: { kind: "end", title: "End", locked: true, valid: true } });

  const edges: Edge[] = [
    { id: "e_start_audience", source: "start", target: "audience" },
    { id: "e_audience_branch", source: "audience", target: CONDITION_NODE_ID },
    { id: `e_branch_match_${matchTarget}`, source: CONDITION_NODE_ID, sourceHandle: "match", target: matchTarget },
    { id: `e_branch_else_${elseTarget}`, source: CONDITION_NODE_ID, sourceHandle: "else", target: elseTarget },
    ...usedChannels.map((ch) => ({ id: `e_${CHANNEL_NODE_ID[ch]}_end`, source: CHANNEL_NODE_ID[ch], target: "end" })),
  ];
  return { nodes, edges, name };
}

/** Open variables implied by a channel config: segment + each channel's resource + fallback window. */
function channelOpenVars(cfg: BriefConfig): TemplateVar[] {
  const vars: TemplateVar[] = [
    { key: "segment", kind: "segment", label: "Audience segment", required: true },
  ];
  const seen = new Set<string>();
  for (const ch of cfg.channels) {
    const gap = channelGap(ch);
    if (seen.has(gap.key)) continue;
    seen.add(gap.key);
    vars.push(gap);
  }
  if (cfg.fallback) {
    vars.push({ key: "fallbackWindow", kind: "duration", label: "Fallback window", default: cfg.fallbackWait, required: false });
  }
  return vars;
}

/** Human-readable "Primary X → fallback Y (on non-delivery)" line. */
export function channelsSummary(cfg: BriefConfig): string {
  const p = CHANNEL_META[cfg.primary].label;
  if (cfg.conditional) {
    const other = cfg.channels.find((c) => c !== cfg.primary);
    return `Conditional branch — Match → ${p}; Else → ${other ? CHANNEL_META[other].label : "End"} (routed on an audience attribute)`;
  }
  if (cfg.experiment && cfg.channels.length > 1) {
    return `A/B test — ${cfg.channels.map((c) => CHANNEL_META[c].label).join(" vs ")} on a split audience`;
  }
  if (cfg.fallback) return `Primary ${p} → fallback ${CHANNEL_META[cfg.fallback].label} (on non-delivery)`;
  if (cfg.channels.length > 1) {
    return `${cfg.channels.map((c) => CHANNEL_META[c].label).join(" + ")} in parallel — audience split, no fallback`;
  }
  return `Primary ${p} only`;
}

/* ---------------------------------------------------------------- */
/* A1 — Campaign templates (declarative open vars + builder)        */
/* ---------------------------------------------------------------- */

export type CampaignTemplate = {
  id: string;
  name: string;
  tenant: string;
  objective: string;
  /** One-line pitch shown on the suggestion card. */
  summary: string;
  /** Channels this template uses (priority order) — drives confirm previews. */
  channels: Channel[];
  /** Keywords used to rank this template against the campaign goal/description. */
  keywords: string[];
  /** Tenant defaults pre-filled (shown as assumptions, never asked). */
  assumptions: string[];
  openVars: TemplateVar[];
  build: (resolved: Record<string, string>) => AskPiPlan;
  /** Optional channel-specific sample copy for the Confirm card. */
  samples?: Partial<Record<Channel, string>>;
};

function pointsExpiryTemplateBuild(resolved: Record<string, string>): AskPiPlan {
  const seg = findSegment(resolved.segment);
  const wa = findWaTemplate(resolved.waTemplate);
  const agent = findVoiceAgent(resolved.voiceAgent);
  const fw = durationLabel(resolved.fallbackWindow ?? "1 day");

  const nodes: Node<WorkflowNodeData>[] = [
    { id: "start", type: "workflow", position: { x: 0, y: 0 },
      data: { kind: "start", title: "Start", locked: true, valid: true } },
    { id: "audience", type: "workflow", position: { x: 0, y: 120 },
      data: {
        kind: "audience", title: "Audience",
        subtitle: seg ? `${seg.label} · ${seg.size}` : "Select segment",
        valid: !!seg, error: seg ? undefined : "Select segment",
        config: { audienceMode: "api", phoneField: "contact.phone" },
      } },
    { id: "wa", type: "workflow", position: { x: 0, y: 240 },
      data: {
        kind: "whatsapp", title: "WhatsApp reminder",
        subtitle: wa ? `Template: ${wa.label}` : "Pick template",
        valid: !!wa, error: wa ? undefined : "Pick template",
        config: {
          waNumber: TENANT_DEFAULTS.waNumber, waMode: "template",
          waTemplate: wa ? `${wa.label} · ${wa.category}` : undefined,
          waVarMap: [{ v: "{{1}}", def: "contact.first_name" }, { v: "{{2}}", def: "payload.points" }],
        },
      } },
    { id: "delay", type: "workflow", position: { x: 0, y: 360 },
      data: {
        kind: "delay", title: "Fallback wait", subtitle: fw, valid: true,
        config: { delayValue: parseDuration(resolved.fallbackWindow ?? "1 day").value,
                  delayUnit: parseDuration(resolved.fallbackWindow ?? "1 day").unit },
      } },
    { id: "voice", type: "workflow", position: { x: 0, y: 480 },
      data: {
        kind: "voiceCall", title: "Voice reminder",
        subtitle: agent ? `Agent: ${agent.name}` : "Select voice agent",
        valid: !!agent, error: agent ? undefined : "Select agent",
        config: {
          agent: agent?.name, callStart: TENANT_DEFAULTS.windowStart,
          callEnd: TENANT_DEFAULTS.windowEnd, timezone: TENANT_DEFAULTS.timezone,
          maxAttempts: 3, retryInterval: "1 hour",
          voiceVarMap: [{ v: "{{name}}", def: "contact.first_name" }],
        },
      } },
    { id: "end", type: "workflow", position: { x: 0, y: 600 },
      data: { kind: "end", title: "End", locked: true, valid: true } },
  ];
  const edges: Edge[] = [
    { id: "e_s_a", source: "start", target: "audience" },
    { id: "e_a_wa", source: "audience", target: "wa" },
    { id: "e_wa_d", source: "wa", target: "delay" },
    { id: "e_d_v", source: "delay", target: "voice" },
    { id: "e_v_e", source: "voice", target: "end" },
  ];
  return { nodes, edges, name: "Points Expiry Reminder" };
}

const tenantAssumptions = (): string[] => [
  `Sending window ${TENANT_DEFAULTS.windowStart}–${TENANT_DEFAULTS.windowEnd} ${TENANT_DEFAULTS.timezone}`,
  `Frequency cap ${TENANT_DEFAULTS.freqCap}`,
  `Sender header ${TENANT_DEFAULTS.waNumber}`,
];

const CART_CFG: BriefConfig = { channels: ["whatsapp", "voice"], primary: "whatsapp", fallback: "voice", fallbackWait: "6 hours" };
const DORMANT_CFG: BriefConfig = { channels: ["whatsapp", "voice"], primary: "whatsapp", fallback: "voice", fallbackWait: "1 day" };

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: "points_expiry_reminder_v3",
    name: "Points Expiry Reminder",
    tenant: "Al Tayer · Amber",
    objective: "Remind members ahead of Amber points expiring to drive a return visit.",
    summary: "WhatsApp reminder before points expire, with a voice fallback for non-responders.",
    channels: ["whatsapp", "voice"],
    keywords: ["points", "expiry", "expire", "reminder", "loyalty", "amber", "rewards", "redeem", "redemption"],
    assumptions: tenantAssumptions(),
    openVars: [
      { key: "segment", kind: "segment", label: "Audience segment", required: true },
      { key: "waTemplate", kind: "waTemplate", label: "Approved WhatsApp template", required: true },
      { key: "voiceAgent", kind: "voiceAgent", label: "Voice agent", required: true },
      { key: "fallbackWindow", kind: "duration", label: "Fallback window", default: "1 day", required: true },
    ],
    build: pointsExpiryTemplateBuild,
    samples: {
      whatsapp: "Hi {{1}}, you have {{2}} Amber points expiring soon. Tap to redeem before they're gone.",
      voice: "\"Hi, this is a quick reminder that your Amber points expire in a few days — would you like to redeem them now?\"",
    },
  },
  {
    id: "abandoned_cart_recovery_v2",
    name: "Abandoned Cart Recovery",
    tenant: "Al Tayer",
    objective: "Win back shoppers who left items in their cart with a WhatsApp nudge and a voice fallback.",
    summary: "WhatsApp recovery message, falling back to an AI voice call if WhatsApp isn't delivered.",
    channels: ["whatsapp", "voice"],
    keywords: ["cart", "abandon", "checkout", "recover", "shop", "ecommerce", "purchase", "basket", "order"],
    assumptions: tenantAssumptions(),
    openVars: channelOpenVars(CART_CFG),
    build: (resolved) => buildFromChannels("Abandoned Cart Recovery", CART_CFG, resolved),
    samples: { whatsapp: CHANNEL_SAMPLE.whatsapp, voice: CHANNEL_SAMPLE.voice },
  },
  {
    id: "lapsed_reactivation_v1",
    name: "Lapsed Member Reactivation",
    tenant: "Al Tayer · Amber",
    objective: "Re-engage members inactive for 90+ days with WhatsApp and a voice win-back.",
    summary: "WhatsApp re-engagement, with a voice win-back call for high-value lapsed members.",
    channels: ["whatsapp", "voice"],
    keywords: ["lapsed", "inactive", "reactivat", "reactivation", "win back", "winback", "dormant", "churn", "re-engage", "reengage"],
    assumptions: tenantAssumptions(),
    openVars: channelOpenVars(DORMANT_CFG),
    build: (resolved) => buildFromChannels("Lapsed Member Reactivation", DORMANT_CFG, resolved),
    samples: {
      whatsapp: "Hi {{1}}, we've missed you! Here's {{2}} to welcome you back to Amber.",
      voice: CHANNEL_SAMPLE.voice,
    },
  },
];

/** Rank templates against a campaign description/goal (keyword overlap). */
export function suggestTemplates(text: string): CampaignTemplate[] {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return CAMPAIGN_TEMPLATES.slice();
  const scored = CAMPAIGN_TEMPLATES.map((c) => {
    let score = 0;
    for (const k of c.keywords) if (t.includes(k)) score += 2;
    if (t.includes(c.name.toLowerCase())) score += 3;
    if (t.includes(c.tenant.toLowerCase())) score += 1;
    return { c, score };
  });
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return hits.length ? hits.map((s) => s.c) : CAMPAIGN_TEMPLATES.slice();
}

export function matchTemplate(text: string): CampaignTemplate | undefined {
  const t = text.toLowerCase();
  return CAMPAIGN_TEMPLATES.find(
    (c) => t.includes(c.id) || t.includes(c.id.replace(/_/g, " ")) || t.includes(c.name.toLowerCase()),
  );
}

/* ---------------------------------------------------------------- */
/* A2 — Brief → plan (keyword detection)                            */
/* ---------------------------------------------------------------- */

export type BriefPlan = {
  plan: AskPiPlan;
  objective: string;
  channelsLine: string;
  channels: Channel[];
  assumptions: string[];
  gaps: TemplateVar[];
};

/** Derive a short campaign name from the brief text. */
export function briefName(text: string): string {
  const t = (text || "").toLowerCase();
  if (t.includes("cart") || t.includes("checkout") || t.includes("basket")) return "Abandoned Cart Recovery";
  if (t.includes("dormant") || t.includes("inactive") || t.includes("reactivat") || t.includes("win back") || t.includes("winback") || t.includes("lapsed")) return "Lapsed Member Reactivation";
  if (t.includes("points") || t.includes("expiry") || t.includes("expire") || t.includes("redeem")) return "Points Expiry Reminder";
  if (t.includes("welcome") || t.includes("onboard")) return "Welcome Journey";
  return "New Campaign";
}

/**
 * Inspect a free-form brief and infer the channels / priority / fallback that
 * Pi will confirm with the user before drafting. Order of detection sets the
 * default priority; an explicit "fallback" mention overrides which is the fallback.
 */
export function analyzeBrief(text: string): BriefConfig {
  const t = (text || "").toLowerCase();
  const detected: Channel[] = [];
  if (/whats\s?app|\bwa\b/.test(t)) detected.push("whatsapp");
  if (/voice|\bcall\b|calling|ivr|phone\b|ai\s?agent/.test(t)) detected.push("voice");
  const channelsNamed = detected.length > 0;

  // Channels this workspace can't run, but the brief asked for — surfaced as a
  // "detected but unavailable" note rather than silently dropped.
  const unavailable: string[] = [];
  if (/\bsms\b|text message|text msg/.test(t)) unavailable.push("SMS");
  if (/e-?mail/.test(t)) unavailable.push("Email");
  if (/push notif|\bpush\b/.test(t)) unavailable.push("Push");
  if (/\brcs\b/.test(t)) unavailable.push("RCS");

  // A/B-test framing: split the audience to compare the two channels.
  const experiment = /a\/b|a-b|ab test|split test|experiment|test two|two variants|head\s?to\s?head/.test(t);

  // Conditional-branch framing: route the audience down a Match / Else branch on an
  // attribute ("if VIP send …", "based on tier", "high-value customers get …"). Distinct
  // from a fallback (which keys on NON-DELIVERY): a conditional keys on an audience
  // attribute. Mutually exclusive with an A/B experiment.
  const conditional =
    !experiment &&
    /\bbased on\b|\bdepending on\b|\bconditional\b|\bbranch\b|\botherwise\b|\belse\s+(?:send|use|route|get|reach|go)|\bif\b[^.]*\b(vip|high.?value|high.?spend|big.?spend|top.?tier|premium|elite|gold|platinum|loyal|tier|spent|spend|over|above|more than|greater|under|below|less than|cart|order|points|engag)\b/.test(t);

  if (detected.length === 0) detected.push("whatsapp");
  // An experiment needs two arms — add the other channel if only one was named.
  if (experiment && detected.length === 1) {
    detected.push(detected[0] === "whatsapp" ? "voice" : "whatsapp");
  }

  let primary = detected[0];
  let fallback: Channel | null = null;

  // A fallback is only assumed when the brief actually calls one out (and not in
  // an experiment). Multiple channels with no fallback → parallel/split, not a chain.
  const mentionsFallback = /fall\s?back|if .*(?:fail|not delivered|undelivered|no reply|doesn'?t)/.test(t);
  if (!experiment && !conditional && mentionsFallback && detected.length >= 2) {
    // Pin the fallback channel from explicit phrasing: prefer "<channel> fallback"
    // (channel right before the word), then "fallback to/on/via <channel>".
    const toChannel = (s: string): Channel => (/whats/.test(s) ? "whatsapp" : "voice");
    const fbMatch =
      t.match(/(whats\s?app|voice|call)\s+fall\s?back/) ??
      t.match(/fall\s?back\s+(?:to|on|via|with|using)?\s*(whats\s?app|voice|call)/);
    const fb = fbMatch ? toChannel(fbMatch[1]) : detected[1];
    fallback = fb;
    primary = detected.find((c) => c !== fb) ?? primary;
  }

  // Keep every detected channel in play (parallel split needs both); priority first.
  const ordered = fallback
    ? [primary, fallback]
    : [primary, ...detected.filter((c) => c !== primary)];
  return {
    channels: ordered,
    primary,
    fallback,
    fallbackWait: "1 day",
    channelsNamed,
    ...(unavailable.length ? { unavailable } : {}),
    ...(experiment ? { experiment: true } : {}),
    ...(conditional ? { conditional: true } : {}),
  };
}

/** Build a brief plan from confirmed channel config. Gaps surface in the Resolve card. */
export function planFromBrief(text: string, cfg: BriefConfig): BriefPlan {
  const name = briefName(text);
  const isParallel = !cfg.conditional && !cfg.fallback && cfg.channels.length > 1;
  const plan = cfg.conditional
    ? buildConditionalChannels(name, cfg, {})
    : isParallel
      ? buildParallelChannels(name, cfg, {})
      : buildFromChannels(name, cfg, {});
  const line = channelsSummary(cfg);
  const condElse = cfg.channels.find((c) => c !== cfg.primary);
  const assumptions = [
    ...(cfg.fallback ? [`Fallback wait defaulted to ${durationLabel(cfg.fallbackWait)}`] : []),
    ...(cfg.conditional
      ? [`Match branch defaults to ${CHANNEL_META[cfg.primary].label}; Else to ${condElse ? CHANNEL_META[condElse].label : "End"} until you set the branch rule`]
      : cfg.experiment
        ? [`A/B test defaulted to a 50/50 split between ${cfg.channels.map((c) => CHANNEL_META[c].label).join(" & ")}`]
        : isParallel
          ? [`${cfg.channels.map((c) => CHANNEL_META[c].label).join(" & ")} both target the full segment until you set a split rule`]
          : []),
    `Sending window ${TENANT_DEFAULTS.windowStart}–${TENANT_DEFAULTS.windowEnd} ${TENANT_DEFAULTS.timezone}`,
    `Frequency cap ${TENANT_DEFAULTS.freqCap}`,
  ];
  return {
    plan,
    objective: `${name} — ${line.toLowerCase()}.`,
    channelsLine: line,
    channels: cfg.channels,
    assumptions,
    gaps: [...channelOpenVars(cfg), ...timingVars()],
  };
}

/* ---------------------------------------------------------------- */
/* Apply resolved values + refinement patches to a plan             */
/* ---------------------------------------------------------------- */

/** Patch a plan's node configs/subtitles from resolved Resolve-card values. */
export function applyResolved(plan: AskPiPlan, resolved: Record<string, string>): AskPiPlan {
  const seg = findSegment(resolved.segment);
  const wa = findWaTemplate(resolved.waTemplate);
  const sender = findSmsSender(resolved.smsSender);
  const agent = findVoiceAgent(resolved.voiceAgent);
  const fw = resolved.fallbackWindow;
  const win = parseSendWindow(resolved.sendWindow ?? "");

  const nodes = plan.nodes.map((n) => {
    const d = n.data;
    if (seg && d.kind === "audience") {
      return { ...n, data: { ...d, subtitle: `${seg.label} · ${seg.size}`, valid: true, error: undefined } };
    }
    if (wa && d.kind === "whatsapp") {
      return { ...n, data: { ...d, subtitle: `Template: ${wa.label}`, valid: true, error: undefined,
        config: { ...d.config, waTemplate: `${wa.label} · ${wa.category}` } } };
    }
    if (sender && d.kind === "sms") {
      return { ...n, data: { ...d, subtitle: `Sender: ${sender.senderId}`, valid: true, error: undefined,
        config: { ...d.config, senderId: sender.senderId, peId: sender.peId } } };
    }
    if ((agent || win) && d.kind === "voiceCall") {
      return { ...n, data: { ...d,
        subtitle: agent ? `Agent: ${agent.name}` : d.subtitle,
        valid: agent ? true : d.valid,
        error: agent ? undefined : d.error,
        config: { ...d.config,
          ...(agent ? { agent: agent.name } : {}),
          ...(win ? { callStart: win.start, callEnd: win.end } : {}) } } };
    }
    if (fw && d.kind === "delay") {
      const { value, unit } = parseDuration(fw);
      return { ...n, data: { ...d, subtitle: `${value} ${unit}`,
        config: { ...d.config, delayValue: value, delayUnit: unit } } };
    }
    return n;
  });
  return { ...plan, nodes };
}

/**
 * Annotate a parallel (no-fallback) plan with the audience split rule. The
 * audience node carries the split summary; the priority channel (channels[0])
 * gets the matching branch, the other gets the complement. A `numeric` attribute
 * routes "≥ threshold" to the priority channel; a `categorical` attribute routes
 * "= value" there. `value` is the threshold (numeric) or the chosen option
 * (categorical). Same node IDs throughout.
 */
export function applySplit(
  plan: AskPiPlan,
  attrId: string,
  value: string,
  channels: Channel[],
): AskPiPlan {
  const attr = findSplitAttribute(attrId);
  if (!attr || !value) return plan;
  const priorityNode = channels[0] ? CHANNEL_NODE_ID[channels[0]] : null;
  const otherNode = channels[1] ? CHANNEL_NODE_ID[channels[1]] : null;
  const categorical = attr.type === "categorical";
  const priorityCut = categorical ? `= ${value}` : `≥ ${attr.unit}${value}`;
  const otherCut = categorical ? `≠ ${value}` : `< ${attr.unit}${value}`;
  const cut = `${attr.label} ${priorityCut}`;
  const stripBranch = / · (≥|<|=|≠).*$/;
  const nodes = plan.nodes.map((n) => {
    if (n.data.kind === "audience") {
      const base = (n.data.subtitle ?? "").replace(/ · Split:.*$/, "");
      return { ...n, data: { ...n.data, subtitle: `${base} · Split: ${cut}` } };
    }
    if (n.id === priorityNode) {
      const base = (n.data.subtitle ?? "").replace(stripBranch, "");
      return { ...n, data: { ...n.data, subtitle: `${base} · ${priorityCut}` } };
    }
    if (n.id === otherNode) {
      const base = (n.data.subtitle ?? "").replace(stripBranch, "");
      return { ...n, data: { ...n.data, subtitle: `${base} · ${otherCut}` } };
    }
    return n;
  });
  return { ...plan, nodes };
}

/**
 * Annotate a parallel plan as a channel A/B experiment: the audience node shows
 * the random split (P% to the priority channel, the rest to the other) and each
 * channel node carries its share. `pct` is the priority channel's percentage.
 * Same node IDs as the parallel build.
 */
export function applyExperiment(plan: AskPiPlan, pct: string, channels: Channel[]): AskPiPlan {
  const p = Math.max(0, Math.min(100, Number(pct)));
  if (Number.isNaN(p)) return plan;
  const other = 100 - p;
  const priorityNode = channels[0] ? CHANNEL_NODE_ID[channels[0]] : null;
  const otherNode = channels[1] ? CHANNEL_NODE_ID[channels[1]] : null;
  const pLabel = channels[0] ? CHANNEL_META[channels[0]].label : "A";
  const oLabel = channels[1] ? CHANNEL_META[channels[1]].label : "B";
  const stripBranch = / · \d+%.*$/;
  const nodes = plan.nodes.map((n) => {
    if (n.data.kind === "audience") {
      const base = (n.data.subtitle ?? "").replace(/ · A\/B:.*$/, "");
      return { ...n, data: { ...n.data, subtitle: `${base} · A/B: ${p}% ${pLabel} / ${other}% ${oLabel}` } };
    }
    if (n.id === priorityNode) {
      const base = (n.data.subtitle ?? "").replace(stripBranch, "");
      return { ...n, data: { ...n.data, subtitle: `${base} · ${p}% of audience` } };
    }
    if (n.id === otherNode) {
      const base = (n.data.subtitle ?? "").replace(stripBranch, "");
      return { ...n, data: { ...n.data, subtitle: `${base} · ${other}% of audience` } };
    }
    return n;
  });
  return { ...plan, nodes };
}

/**
 * A2 refinement: parse a chat instruction and patch a single node in place
 * (same node IDs — no rebuild). Returns the patched plan + a human echo, or
 * null when the instruction isn't understood.
 */
export function applyRefinement(text: string, plan: AskPiPlan): { plan: AskPiPlan; echo: string; duration: string } | null {
  const m = text.toLowerCase().match(/(wait|fallback|delay)[^\d]*(\d+)\s*(m|min|minute|h|hr|hour|d|day)/i);
  if (!m) return null;
  const { value, unit } = parseDuration(`${m[2]} ${m[3]}`);
  let changed = false;
  const nodes = plan.nodes.map((n) => {
    if (n.data.kind !== "delay") return n;
    changed = true;
    return { ...n, data: { ...n.data, subtitle: `${value} ${unit}`,
      config: { ...n.data.config, delayValue: value, delayUnit: unit } } };
  });
  if (!changed) return null;
  return { plan: { ...plan, nodes }, echo: `Updated the fallback wait to ${value} ${unit}.`, duration: `${value} ${unit}` };
}

/* ---------------------------------------------------------------- */
/* Validation                                                       */
/* ---------------------------------------------------------------- */

export type ValidationLevel = "pass" | "warn" | "block";
/** A single named pre-flight check shown on the campaign-creation screen. */
export type ValidationCheck = { id: string; label: string; status: ValidationLevel; detail: string };
export type ValidationResult = { level: ValidationLevel; messages: string[]; checks: ValidationCheck[] };

const STATUS_RANK: Record<ValidationLevel, number> = { pass: 0, warn: 1, block: 2 };

/** Worst status across a set of checks → the overall gate level. */
export function reportLevel(checks: ValidationCheck[]): ValidationLevel {
  return checks.reduce<ValidationLevel>(
    (acc, c) => (STATUS_RANK[c.status] > STATUS_RANK[acc] ? c.status : acc),
    "pass",
  );
}

/**
 * Run every pre-flight check a campaign draft needs before it can be saved /
 * launched, against the resolved Resolve-card values + the channels in play.
 * Returns a granular, displayable checklist (audience, per-channel resource +
 * compliance, fallback timing, channel sequence, sending window/DND, freq cap).
 * Block = must fix; warn = explicit acceptance needed; pass = green.
 */
export function runChecks(
  vars: TemplateVar[],
  resolved: Record<string, string>,
  channels: Channel[],
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  // 1. Audience segment — required for every campaign.
  const seg = findSegment(resolved.segment);
  checks.push(
    !resolved.segment
      ? { id: "segment", label: "Audience segment", status: "block", detail: "Select a target segment before saving." }
      : { id: "segment", label: "Audience segment", status: "pass", detail: seg ? `${seg.label} · ${seg.size} contacts` : "Segment selected." },
  );

  // 2. Per-channel resource binding + channel compliance.
  for (const ch of channels) {
    if (ch === "whatsapp") {
      const wa = findWaTemplate(resolved.waTemplate);
      checks.push(
        !wa
          ? { id: "wa_template", label: "WhatsApp template", status: "block", detail: "Pick an approved WhatsApp template." }
          : wa.status === "pending_reapproval"
            ? { id: "wa_template", label: "WhatsApp template", status: "warn", detail: `"${wa.label}" is pending re-approval — saved as draft, won't send until approved.` }
            : { id: "wa_template", label: "WhatsApp template", status: "pass", detail: `"${wa.label}" approved · ${wa.category}.` },
      );
      if (wa) {
        checks.push(
          wa.category === "Marketing"
            ? { id: "wa_optin", label: "WhatsApp opt-in", status: "warn", detail: "Marketing template — recipients must have a marketing opt-in." }
            : { id: "wa_optin", label: "WhatsApp opt-in", status: "pass", detail: "Utility template — no marketing opt-in required." },
        );
      }
    }
    if (ch === "voice") {
      const agent = findVoiceAgent(resolved.voiceAgent);
      checks.push(
        !agent
          ? { id: "voice_agent", label: "Voice agent", status: "block", detail: "Select a live voice agent." }
          : agent.status !== "live"
            ? { id: "voice_agent", label: "Voice agent", status: "warn", detail: `Agent "${agent.name}" is ${agent.status}, not live.` }
            : { id: "voice_agent", label: "Voice agent", status: "pass", detail: `"${agent.name}" is live.` },
      );
    }
  }

  // 3. Fallback timing — only when the journey declares a wait.
  const durationVar = vars.find((v) => v.kind === "duration");
  if (durationVar) {
    const raw = resolved[durationVar.key] ?? (durationVar.kind === "duration" ? durationVar.default : "");
    const { value, unit } = parseDuration(raw);
    checks.push(
      !raw
        ? { id: "fallback_wait", label: "Fallback wait", status: durationVar.required ? "block" : "warn", detail: "Set how long to wait before the fallback fires." }
        : value <= 0
          ? { id: "fallback_wait", label: "Fallback wait", status: "warn", detail: "Fallback fires immediately — consider a longer wait." }
          : { id: "fallback_wait", label: "Fallback wait", status: "pass", detail: `Waits ${value} ${unit} after non-delivery before the fallback.` },
    );
  }

  // 4. Channel sequence — distinct channels in priority order.
  const seqLabel = channels.map((c) => CHANNEL_META[c].label).join(" → ");
  checks.push({
    id: "sequence",
    label: "Channel sequence",
    status: "pass",
    detail: channels.length >= 2 ? `${seqLabel} — distinct channels.` : `${seqLabel || "WhatsApp"} only — no fallback.`,
  });

  // 4b. Channel A/B experiment — required when the journey declares a percentage
  // split between the two channels. Needs a percentage in 1–99.
  if (vars.some((v) => v.kind === "percent")) {
    const raw = resolved.splitPct;
    const p = Number(raw);
    const priorityLabel = channels[0] ? CHANNEL_META[channels[0]].label : "channel A";
    const otherLabel = channels[1] ? CHANNEL_META[channels[1]].label : "channel B";
    checks.push(
      !raw || Number.isNaN(p)
        ? { id: "experiment", label: "A/B split", status: "block", detail: "Set the % of the audience for the priority channel." }
        : p < 1 || p > 99
          ? { id: "experiment", label: "A/B split", status: "block", detail: "Split must be between 1% and 99% so both arms get traffic." }
          : { id: "experiment", label: "A/B split", status: "pass", detail: `${p}% → ${priorityLabel}; ${100 - p}% → ${otherLabel} (random).` },
    );
  }

  // 4c. Audience split — required when the journey declares an attribute split
  // (parallel channels, no fallback). Numeric attributes need a threshold;
  // categorical attributes need a chosen value.
  if (vars.some((v) => v.key === "splitAttribute")) {
    const attr = findSplitAttribute(resolved.splitAttribute);
    const priorityLabel = channels[0] ? CHANNEL_META[channels[0]].label : "priority channel";
    const otherLabel = channels[1] ? CHANNEL_META[channels[1]].label : "other channel";
    if (!attr) {
      checks.push({ id: "split", label: "Audience split", status: "block", detail: "Pick an attribute to split the audience on." });
    } else if (attr.type === "categorical") {
      const val = resolved.splitValue;
      checks.push(
        !val
          ? { id: "split", label: "Audience split", status: "block", detail: `Pick which ${attr.label.toLowerCase()} goes to the priority channel.` }
          : { id: "split", label: "Audience split", status: "pass", detail: `${attr.label} = ${val} → ${priorityLabel}; everyone else → ${otherLabel}.` },
      );
    } else {
      const thr = resolved.splitThreshold;
      checks.push(
        !thr || Number.isNaN(Number(thr))
          ? { id: "split", label: "Audience split", status: "block", detail: "Set a numeric threshold for the split." }
          : { id: "split", label: "Audience split", status: "pass", detail: `${attr.label} ≥ ${attr.unit}${thr} → ${priorityLabel}; below → ${otherLabel}.` },
      );
    }
  }

  // 4d. Conditional branch — required when the journey declares a condition
  // attribute (audience routed Match / Else on an attribute). Numeric attributes
  // need a threshold, categorical attributes a value; the Match / Else routing
  // (a channel or End) is reported for confirmation.
  if (vars.some((v) => v.key === "conditionAttribute")) {
    const attr = findSplitAttribute(resolved.conditionAttribute);
    const routeLabel = (id: string | undefined, fallback: string): string => {
      if (id === "end") return "End";
      const ch = (Object.keys(CHANNEL_NODE_ID) as Channel[]).find((c) => CHANNEL_NODE_ID[c] === id);
      return ch ? CHANNEL_META[ch].label : fallback;
    };
    const otherCh = channels.find((c) => c !== channels[0]);
    const matchTo = routeLabel(resolved.branchMatch, channels[0] ? CHANNEL_META[channels[0]].label : "Match branch");
    const elseTo = routeLabel(resolved.branchElse, otherCh ? CHANNEL_META[otherCh].label : "End");
    if (!attr) {
      checks.push({ id: "condition", label: "Conditional branch", status: "block", detail: "Pick an attribute to branch the audience on." });
    } else if (attr.type === "categorical") {
      const val = resolved.conditionValue;
      checks.push(
        !val
          ? { id: "condition", label: "Conditional branch", status: "block", detail: `Pick which ${attr.label.toLowerCase()} takes the Match branch.` }
          : { id: "condition", label: "Conditional branch", status: "pass", detail: `${attr.label} = ${val} → ${matchTo}; everyone else → ${elseTo}.` },
      );
    } else {
      const thr = resolved.conditionThreshold;
      checks.push(
        !thr || Number.isNaN(Number(thr))
          ? { id: "condition", label: "Conditional branch", status: "block", detail: "Set a numeric threshold for the Match branch." }
          : { id: "condition", label: "Conditional branch", status: "pass", detail: `${attr.label} ≥ ${attr.unit}${thr} → ${matchTo}; below → ${elseTo}.` },
      );
    }
  }

  // 5. Sending window respects quiet hours (9pm–9am). Uses the resolved window if
  // the user edited it on the Resolve card, else the tenant default.
  const sendWindow = resolved.sendWindow?.trim() || DEFAULT_SEND_WINDOW;
  const windowOk = windowWithinQuietHours(sendWindow);
  checks.push({
    id: "window",
    label: "Sending window & quiet hours",
    status: windowOk ? "pass" : "block",
    detail: windowOk
      ? `${sendWindow} ${TENANT_DEFAULTS.timezone} — within 9am–9pm quiet-hours rule.`
      : `${sendWindow} ${TENANT_DEFAULTS.timezone} breaches quiet hours — keep sends within 09:00–21:00.`,
  });

  // 6. Frequency cap. "No cap" warns (contacts could be over-messaged).
  const freqCap = resolved.frequencyCap?.trim() || TENANT_DEFAULTS.freqCap;
  checks.push(
    /no cap/i.test(freqCap)
      ? { id: "freqcap", label: "Frequency cap", status: "warn", detail: "No frequency cap set — contacts could be messaged repeatedly." }
      : { id: "freqcap", label: "Frequency cap", status: "pass", detail: `${freqCap} per contact.` },
  );

  return checks;
}

/** Validate resolved values + channels → granular checklist, gate level, and warn/block messages. */
export function validateResolved(
  vars: TemplateVar[],
  resolved: Record<string, string>,
  channels: Channel[] = [],
): ValidationResult {
  const checks = runChecks(vars, resolved, channels);
  const level = reportLevel(checks);
  const messages = checks.filter((c) => c.status !== "pass").map((c) => c.detail);
  return { level, messages, checks };
}
