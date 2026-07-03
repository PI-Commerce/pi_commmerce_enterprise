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

/**
 * Audience attributes that can supply the phone number WhatsApp + voice dial.
 * Captured in the Resolve flow right after the segment: both channels need a
 * mobile number, and a segment may carry more than one (primary mobile, a
 * dedicated WhatsApp number, an alternate, a voice-only landline). `id`s follow
 * the `contact.<field>` convention the audience node config already uses.
 */
export type PhoneAttribute = { id: string; label: string; hint: string };
export const PHONE_ATTRIBUTES: PhoneAttribute[] = [
  { id: "contact.phone", label: "Mobile number", hint: "Primary mobile — used for WhatsApp & voice" },
  { id: "contact.whatsapp", label: "WhatsApp number", hint: "Dedicated WhatsApp number, if different" },
  { id: "contact.alt_phone", label: "Alternate phone", hint: "Secondary contact number" },
  { id: "contact.landline", label: "Landline", hint: "Voice only — not WhatsApp-capable" },
];
/** The default contact-number attribute the audience node carries until the user picks one. */
export const DEFAULT_PHONE_FIELD = "contact.phone";

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

/** Fields shared by every TemplateVar. `group` names the Resolve-card step a var
 * belongs to (e.g. "Audience", "Match arm", "Sending rules"); the card renders
 * one step per distinct group, in first-appearance order. */
type TemplateVarBase = { key: string; label: string; required?: boolean; group?: string };
export type TemplateVar =
  | (TemplateVarBase & { kind: "segment" })
  | (TemplateVarBase & { kind: "waTemplate" })
  | (TemplateVarBase & { kind: "voiceAgent" })
  | (TemplateVarBase & { kind: "phoneField"; default: string })
  | (TemplateVarBase & { kind: "smsSender" })
  | (TemplateVarBase & { kind: "duration"; default: string })
  | (TemplateVarBase & { kind: "splitAttribute" })
  | (TemplateVarBase & { kind: "threshold"; default: string })
  | (TemplateVarBase & { kind: "splitValue"; options: string[] })
  | (TemplateVarBase & { kind: "percent"; default: string })
  | (TemplateVarBase & { kind: "text"; default: string; placeholder?: string })
  | (TemplateVarBase & { kind: "window"; default: string })
  | (TemplateVarBase & { kind: "choice"; default: string; options: string[] });

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
  { id: "fcc_tier", label: "FCC tier", unit: "", example: "Gold", type: "categorical", options: ["Silver", "Gold", "Platinum", "Black"] },
  // A post-action VOICE-call outcome used as a PRIMARY N-way router: a voice-led
  // journey places a call, then branches on how it resolved (the Example-2 shape).
  // Registered here (not in STATE_ATTRIBUTES) because it drives the top-level
  // branch — one arm per disposition — rather than an in-arm continue/welcome gate.
  { id: "call_disposition", label: "Call outcome", unit: "", example: "Interested", type: "categorical", options: ["Interested", "Callback", "Not interested", "No connect", "Wrong number"] },
];
export const findSplitAttribute = (id?: string) => SPLIT_ATTRIBUTES.find((a) => a.id === id);

/**
 * Post-action audience-state attributes a conditional arm can gate on — the state
 * of a member AFTER an action ran ("did they enrol?", "did they upgrade?").
 * Distinct from a channel's delivery disposition (Sent/Delivered/Failed, handled
 * by `whatsappDispositionPorts`): a gate keys on an audience outcome, not a
 * message receipt. Each attribute enumerates its mutually exclusive outcomes; the
 * first outcome is the "positive"/goal outcome (rendered first on the gate node).
 */
export type StateAttribute = { id: string; label: string; stateVar: string; outcomes: string[] };
export const STATE_ATTRIBUTES: StateAttribute[] = [
  { id: "enrollment", label: "Enrolled?", stateVar: "audience.enrollment_state", outcomes: ["Enrolled", "Not enrolled"] },
  { id: "upgrade_gold", label: "Upgraded to Gold?", stateVar: "audience.tier_upgrade_state", outcomes: ["Upgraded", "Not upgraded"] },
];
export const findStateAttribute = (id?: string) => STATE_ATTRIBUTES.find((a) => a.id === id);

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

/**
 * The open variables a conditional branch adds, shaped by the chosen attribute:
 * always the attribute picker, plus a numeric `conditionThreshold` OR a
 * categorical `conditionValue` that defines the Match branch (the rest take the
 * Else branch). Distinct keys (conditionAttribute / conditionValue /
 * conditionThreshold) so they never collide with an A/B split's vars, but reuse
 * the split *kinds* so the Resolve card + resolveFromText handle them unchanged.
 */
export function conditionFieldsFor(attrId?: string, isNway?: boolean): TemplateVar[] {
  const attr = findSplitAttribute(attrId);
  const picker: TemplateVar = { key: "conditionAttribute", kind: "splitAttribute", label: "Branch audience by", required: true };
  if (!attr) return [picker];
  // N-way categorical: per-arm routes are set on the branch card (one route per
  // attribute value, stored as `branchRoute@<arm>`), not as a single Match value —
  // so the picker is the only Resolve-card placement gap.
  if (isNway) return [picker];
  if (attr.type === "categorical") {
    return [
      picker,
      { key: "conditionValue", kind: "splitValue", label: `${attr.label} that takes Branch 1`, options: attr.options ?? [], required: true },
    ];
  }
  return [
    picker,
    { key: "conditionThreshold", kind: "threshold", label: "Threshold (≥ takes Branch 1)", default: "", required: true },
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
    { key: "sendWindow", kind: "window", label: "Sending window", default: DEFAULT_SEND_WINDOW, required: false, group: "Sending rules" },
    { key: "frequencyCap", kind: "choice", label: "Frequency cap", default: TENANT_DEFAULTS.freqCap, options: FREQUENCY_OPTIONS, required: false, group: "Sending rules" },
    { key: "startTiming", kind: "choice", label: "Start", default: START_OPTIONS[0], options: START_OPTIONS, required: false, group: "Sending rules" },
  ];
}

/* ---------------------------------------------------------------- */
/* Lookup helpers                                                   */
/* ---------------------------------------------------------------- */

export const findSegment = (id?: string) => SEGMENTS.find((s) => s.id === id);
export const findWaTemplate = (id?: string) => WA_TEMPLATES.find((t) => t.id === id);
export const findSmsSender = (id?: string) => SMS_SENDERS.find((s) => s.id === id);
export const findVoiceAgent = (id?: string) => VOICE_AGENTS.find((a) => a.id === id);
export const findPhoneAttribute = (id?: string) => PHONE_ATTRIBUTES.find((p) => p.id === id);
/** The human label for a contact-number attribute id, falling back to the default field's label. */
export const phoneAttributeLabel = (id?: string) =>
  (findPhoneAttribute(id) ?? findPhoneAttribute(DEFAULT_PHONE_FIELD))!.label;

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

export const durationLabel = (raw: string) => {
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

export function matchPhoneAttribute(text: string): string | undefined {
  const t = (text || "").toLowerCase();
  const exact = PHONE_ATTRIBUTES.find((p) => t.includes(p.id) || t.includes(p.label.toLowerCase()));
  if (exact) return exact.id;
  if (/whatsapp\s*(number|no\.?)|wa\s*number/.test(t)) return "contact.whatsapp";
  if (/landline|land\s*line|home\s*phone/.test(t)) return "contact.landline";
  if (/alt(ernate|\.)?\s*(phone|number|mobile)|secondary\s*(phone|number)/.test(t)) return "contact.alt_phone";
  if (/mobile|phone|cell|msisdn|contact\s*number|primary\s*(phone|number|mobile)/.test(t)) return "contact.phone";
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
      case "phoneField": {
        const id = matchPhoneAttribute(t);
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
 * doesn't support; `contentAb` marks an A/B-test framing (split to compare).
 */
export type BriefConfig = {
  channels: Channel[];
  primary: Channel;
  fallback: Channel | null;
  fallbackWait: string;
  unavailable?: string[];
  /**
   * An A/B test on the LINEAR path — draws start → audience → A/B Split →
   * per-variant node → End, each variant capturing its own resource + traffic %
   * on the split's Resolve card. Two shapes share this one config: a CONTENT A/B
   * (one channel, N template/creative variants — e.g. "WhatsApp message with an
   * A/B test of templates") and a CHANNEL A/B (one variant per channel — e.g.
   * "A/B test WhatsApp vs voice"), distinguished purely by each variant's `ch`.
   * `ch` is the primary channel; `variants` carry the per-variant channel.
   * Mutually exclusive with `conditional`.
   */
  contentAb?: { ch: Channel; variants: AbVariant[] };
  /** Marks a conditional-branch framing — the audience is routed down a Match / Else branch on an attribute. */
  conditional?: boolean;
  /** Default channel sequence the Match (high-tier) branch runs, in order — e.g. [whatsapp] or [whatsapp, voice]. Inferred from the brief; the card can override. */
  branchMatchSeq?: Channel[];
  /** Default channel sequence the Else (low-tier) branch runs, in order — e.g. [whatsapp, voice] for "WhatsApp followed by voice". */
  branchElseSeq?: Channel[];
  /**
   * Rich body for the Match (high-tier) arm of the BINARY numeric branch — e.g. an
   * A/B split of two openers before a voice follow-up (the Example-1 shape). When
   * set it supersedes branchMatchSeq for the match arm only, letting the arm draw a
   * nested A/B / gate / welcome while the branch itself stays a Match / Else split
   * keyed on its numeric threshold (unlike branchArms, which flips the branch to the
   * categorical N-way "Route on <attr>" form). The Else arm keeps its plain seq
   * unless branchElseBody is set.
   */
  branchMatchBody?: ArmNodeSpec[];
  /**
   * Rich body for the Else (low-tier) arm of the BINARY numeric branch — the exact
   * mirror of branchMatchBody, for briefs that place the A/B (or gate/welcome) on
   * the LOW arm instead ("in the low-LTV branch, A/B test the voice agents before
   * the call"). When set it supersedes branchElseSeq for the else arm only. The
   * branch itself stays a Match / Else split on its numeric threshold.
   */
  branchElseBody?: ArmNodeSpec[];
  /**
   * N-way categorical branch: one arm per attribute value (e.g. an FCC-tier split
   * into Silver / Gold / Platinum / Black), each running its own channel sequence.
   * When set this supersedes branchMatchSeq/branchElseSeq (the binary form); when
   * absent the conditional path falls back to the binary Match / Else arms.
   */
  branchArms?: BranchArm[];
  /**
   * A leading channel action run BEFORE the branch — the voice-led shape where a
   * call (or message) is placed first and the branch then routes on its outcome
   * (the Example-2 win-back: Voice call → route on call disposition). Inserted
   * between the audience and the branch node; each lead node is node-scoped under
   * `pre_<n>` so its template/agent round-trips on the Resolve card. Empty/absent
   * keeps the classic audience → branch topology.
   */
  preBranchSeq?: Channel[];
  /**
   * The audience attribute the branch routes on, when `analyzeBrief` could pin it
   * (a categorical attribute whose values the brief named — e.g. `call_disposition`
   * for a voice win-back, `fcc_tier` for an enrolment split). Persisted so the
   * Conditional-branch card opens pre-selected on that attribute with its arms
   * pre-filled, instead of a blank picker that would let a different attribute be
   * chosen and silently rebuild the branch on the wrong values. The builder also
   * falls back to it when `resolved.conditionAttribute` is not yet set, so the very
   * first draft already draws "Route on <attr>". Unset for the binary numeric path
   * (no specific attribute is inferred there — the card still asks for it).
   */
  conditionAttribute?: string;
  /** False when the brief named no channel (we defaulted to WhatsApp) — Pi then captures channels via a card. */
  channelsNamed?: boolean;
};

/**
 * One arm of a conditional branch: the attribute `value` that routes to it
 * (e.g. "Gold"; absent for the binary Else / default arm), the canvas-id prefix
 * `id` its nodes are scoped under (`m`/`e` for the binary form, a value slug like
 * `gold` for N-way — kept stable so node-scoped resolved keys round-trip), the
 * human `label` shown on the branch output + Resolve groups, and the ordered
 * channel `seq` it runs.
 */
export type BranchArm = { id: string; label: string; value?: string; seq: Channel[]; body?: ArmNodeSpec[] };

/**
 * An ordered step inside a conditional arm. Phase 1 arms are channel-only (their
 * `seq` maps 1:1 to `channel` specs), but a richer arm interleaves other node
 * kinds — a nested A/B split (Phase 2), a post-action audience state gate
 * (Phase 3) and a per-tier welcome terminal (Phase 4). The builder walks this
 * body to draw nodes/edges; `conditionalArmSteps` walks the same body to emit the
 * matching Resolve vars, so the canvas and the card can never drift.
 */
/**
 * One arm of a nested A/B split. `pct` is this variant's share of the arm's
 * traffic (all variants sum to 100; an equal split is assumed when omitted).
 * `flow` is a plain-English description of what happens on this variant after
 * the split — captured on the Resolve card so the post-split topology is never
 * ambiguous (esp. for 3+ way splits where each emanating flow must be stated).
 */
export type AbVariant = { id: string; label: string; ch: Channel; pct?: number; flow?: string };

export type ArmNodeSpec =
  | { type: "channel"; ch: Channel }
  | { type: "abSplit"; variants: AbVariant[] }
  | { type: "gate"; stateId: string; routes: { outcome: string; next: "continue" | "welcome" | "end"; tier?: string }[] }
  | { type: "welcome"; tier: string };

/**
 * Resolve each A/B variant's traffic %: prefer a node-scoped `splitPct@<node>_<id>`
 * from the card, then the spec's own `pct`, else an equal N-way split with any
 * rounding remainder folded into the last variant so the shares always total 100.
 */
export function abVariantPcts(variants: AbVariant[], resolved: Record<string, string>, nodeId: string): number[] {
  const n = variants.length || 1;
  const base = Math.floor(100 / n);
  const raw = variants.map((v, k) => {
    const scoped = resolved[`splitPct@${nodeId}_${v.id}`];
    const p = Number(scoped ?? v.pct);
    return Number.isFinite(p) && p > 0 ? Math.round(p) : k === n - 1 ? 100 - base * (n - 1) : base;
  });
  return raw;
}

/**
 * Coarse N-way A/B variant detection from a clause. Picks up named variants
 * (Perks / Savings / Loyalty / Control / Discount) and an explicit count
 * ("three variants", "3-way split"), falling back to a 2-cell split. Each
 * variant gets an equal traffic share and a default plain-English flow; the
 * user renames/repcts/rewrites the flow on the Resolve card.
 */
export function detectAbVariants(clause: string, ch: Channel): AbVariant[] {
  const known: [RegExp, string][] = [
    [/\bperks?\b/, "Perks"],
    [/\bsavings?\b/, "Savings"],
    [/\bloyalty\b/, "Loyalty"],
    [/\bcontrol\b/, "Control"],
    [/\bdiscount\b/, "Discount"],
    [/reactivat/, "Reactivate"],
    [/winback|win back/, "Winback"],
  ];
  const labels: string[] = [];
  for (const [re, name] of known) if (re.test(clause) && !labels.includes(name)) labels.push(name);
  const countM = /\b(two|three|four|2|3|4)[\s-]?(?:way|variants?|arms?|cells?|groups?)/.exec(clause);
  const words: Record<string, number> = { two: 2, three: 3, four: 4 };
  const count = countM ? words[countM[1]] ?? Number(countM[1]) : 0;
  const target = Math.min(4, Math.max(labels.length, count, 2));
  while (labels.length < target) labels.push(`Variant ${String.fromCharCode(65 + labels.length)}`);
  const base = Math.floor(100 / labels.length);
  return labels.map((l, k) => ({
    id: String.fromCharCode(97 + k),
    label: l,
    ch,
    pct: k === labels.length - 1 ? 100 - base * (labels.length - 1) : base,
    flow: `Send ${CHANNEL_META[ch].label}, then continue to the shared next step`,
  }));
}

/**
 * Channel A/B variants: one variant PER named channel (WhatsApp vs Voice, …),
 * each carrying its own channel so `emitAbSplit` draws a same-shape A/B Split →
 * per-channel node → End, and `channelOpenVars` captures that channel's resource
 * (WhatsApp template / voice agent) per variant on the Resolve card. `splitPct`
 * seeds the first arm's share on a 2-way split (the rest goes to the other arm);
 * N-way (3+) channels fall back to an equal split. The user tunes the shares and
 * picks each resource on the card — the model never invents them.
 */
export function channelAbVariants(channels: Channel[], splitPct?: string): AbVariant[] {
  const chs = channels.length ? channels : (["whatsapp"] as Channel[]);
  const n = chs.length;
  const p = Number(splitPct);
  const twoWaySplit = n === 2 && Number.isFinite(p) && p > 0 && p < 100;
  const base = Math.floor(100 / n);
  return chs.map((ch, k) => ({
    id: String.fromCharCode(97 + k),
    label: CHANNEL_META[ch].label,
    ch,
    pct: twoWaySplit
      ? (k === 0 ? Math.round(p) : 100 - Math.round(p))
      : k === n - 1 ? 100 - base * (n - 1) : base,
    flow: `Send ${CHANNEL_META[ch].label}, then continue to the shared next step`,
  }));
}

/**
 * The ordered node specs an arm draws. Prefers an explicit `arm.body` (the rich
 * Phase 2-4 form); otherwise derives a channel-only body from `arm.seq` so every
 * Phase-1 arm — and every node id / resolved key the builder already emits —
 * stays byte-identical.
 */
export function armBody(arm: BranchArm): ArmNodeSpec[] {
  if (arm.body && arm.body.length) return arm.body;
  return arm.seq.map((ch) => ({ type: "channel", ch }) as ArmNodeSpec);
}

/** Canvas-id-safe slug for a welcome tier label ("Gold" → "gold", "VIP Black" → "vip_black"). */
export function slugTier(tier: string): string {
  return (tier || "tier").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "tier";
}

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

/**
 * The delivery outcomes a channel node can resolve to — used as labeled exit
 * ports on a conditional-arm node so a follow-up channel can be wired to fire on
 * a *chosen* outcome (e.g. only call when WhatsApp Failed). WhatsApp carries the
 * finer set the delivery webhook reports; voice the call dispositions.
 */
export const CHANNEL_DISPOSITIONS: Record<Channel, string[]> = {
  whatsapp: ["Sent", "Delivered", "Read", "Replied", "Failed"],
  voice: ["Answered", "No answer", "Busy", "Failed"],
};

const channelGap = (ch: Channel): TemplateVar => {
  const m = CHANNEL_META[ch];
  return { key: m.resourceKey, kind: m.resourceKind, label: m.resourceLabel, required: true } as TemplateVar;
};

/**
 * One journey node for a channel, configured from resolved values + tenant
 * defaults. When an `id` is given (the conditional builder passes arm-prefixed
 * ids like `e_wa`/`e_voice`) the node's resource is read node-scoped-first —
 * `waTemplate@<id>` / `voiceAgent@<id>` — falling back to the global key, so each
 * arm node can carry its own template/agent. Linear / parallel builders pass no
 * id and so keep reading the single global resource.
 */
function channelNode(ch: Channel, y: number, resolved: Record<string, string>, id?: string): Node<WorkflowNodeData> {
  if (ch === "whatsapp") {
    const scoped = id ? resolved[`waTemplate@${id}`] : undefined;
    const wa = findWaTemplate(scoped ?? resolved.waTemplate);
    return { id: id ?? "wa", type: "workflow", position: { x: 0, y },
      data: { kind: "whatsapp", title: "WhatsApp message",
        subtitle: wa ? `Template: ${wa.label}` : "Pick template",
        valid: !!wa, error: wa ? undefined : "Pick template",
        config: { waNumber: TENANT_DEFAULTS.waNumber, waMode: "template",
          waTemplate: wa ? `${wa.label} · ${wa.category}` : undefined,
          waVarMap: [{ v: "{{1}}", def: "contact.first_name" }, { v: "{{2}}", def: "payload.order_id" }] } } };
  }
  const scoped = id ? resolved[`voiceAgent@${id}`] : undefined;
  const agent = findVoiceAgent(scoped ?? resolved.voiceAgent);
  return { id: id ?? "voice", type: "workflow", position: { x: 0, y },
    data: { kind: "voiceCall", title: "Voice call",
      subtitle: agent ? `Agent: ${agent.name}` : "Select voice agent",
      valid: !!agent, error: agent ? undefined : "Select agent",
      config: { agent: agent?.name, callStart: TENANT_DEFAULTS.windowStart,
        callEnd: TENANT_DEFAULTS.windowEnd, timezone: TENANT_DEFAULTS.timezone,
        maxAttempts: 3, retryInterval: "1 hour",
        voiceVarMap: [{ v: "{{name}}", def: "contact.first_name" }] } } };
}

/** The disposition exit ports + matching config paths a WhatsApp node carries when a follow-up channel is wired off one of its outcomes. */
function whatsappDispositionPorts(): Pick<WorkflowNodeData, "outputs"> & { paths: { id: string; label: string; variable: string; op: string; value: string }[] } {
  return {
    outputs: CHANNEL_DISPOSITIONS.whatsapp.map((d) => ({ id: d, label: d, kind: "exit" as const })),
    paths: CHANNEL_DISPOSITIONS.whatsapp.map((d) => ({ id: d, label: d, variable: "wa.delivery_state", op: "is", value: d })),
  };
}

/**
 * The audience node's subtitle: the chosen segment + its size, plus the contact
 * attribute WhatsApp & voice dial (defaulted to the primary mobile until the
 * user picks one on the Resolve card). "Select segment" until a segment is set.
 * Shared by every builder + applyResolved so the canvas reads the same.
 */
export function audienceSubtitle(resolved: Record<string, string>): string {
  const seg = findSegment(resolved.segment);
  if (!seg) return "Select segment";
  return `${seg.label} · ${seg.size} · Phone: ${phoneAttributeLabel(resolved.phoneField)}`;
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
        subtitle: audienceSubtitle(resolved),
        valid: !!seg, error: seg ? undefined : "Select segment",
        config: { audienceMode: "api", phoneField: resolved.phoneField ?? DEFAULT_PHONE_FIELD } } },
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
 * A conditional branch can run a *sequence* of channels (e.g. "WhatsApp then
 * Voice"). A branch route value is encoded as `>`-joined channel node ids
 * ("wa", "wa>voice", "voice>wa") or "end" for "no message". These helpers
 * convert between the encoded string and an ordered `Channel[]`.
 */
const CH_BY_NODE_ID = (id: string): Channel | undefined =>
  (Object.keys(CHANNEL_NODE_ID) as Channel[]).find((c) => CHANNEL_NODE_ID[c] === id);

/** Encode an ordered channel sequence as a route value, falling back when empty/undefined. */
export function branchSeqToId(seq: Channel[] | undefined, fallback: string): string {
  if (!seq || seq.length === 0) return fallback;
  return seq.map((c) => CHANNEL_NODE_ID[c]).join(">");
}

/**
 * Decode a route value into an ordered, de-duplicated channel sequence.
 * Returns `undefined` for an absent/blank value (caller falls back to a default),
 * and `[]` for an explicit "end" (drop the branch — no message).
 */
export function parseBranchSeq(val: string | undefined): Channel[] | undefined {
  if (val == null || val.trim() === "") return undefined;
  if (val === "end") return [];
  const out: Channel[] = [];
  for (const part of val.split(">")) {
    const ch = CH_BY_NODE_ID(part.trim());
    if (ch && !out.includes(ch)) out.push(ch);
  }
  return out;
}

/** Human label for a branch route value — "WhatsApp", "WhatsApp → Voice", or "End". */
export function routeSeqLabel(val: string | undefined, fallback: string): string {
  if (val === "end") return "End";
  const seq = parseBranchSeq(val);
  if (seq === undefined) return fallback;
  if (seq.length === 0) return "End";
  return seq.map((c) => CHANNEL_META[c].label).join(" → ");
}

/**
 * A canvas-id-safe slug for a categorical arm value ("Gold" → "gold",
 * "Abu Dhabi" → "abu_dhabi"). De-collides duplicates (after slugging) with a
 * numeric suffix so arm node-id prefixes stay unique. `taken` carries the slugs
 * already assigned in this branch.
 */
export function slugifyArm(value: string, taken: Set<string>): string {
  const base = (value || "arm").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "arm";
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}_${n++}`;
  taken.add(slug);
  return slug;
}

/**
 * Normalize a conditional brief's arms to a single `BranchArm[]` — the one shape
 * the builder, `conditionalArmSteps`, the validator and the assumptions all read.
 * When `cfg.branchArms` is set (the N-way categorical case) it is returned as-is.
 * Otherwise the binary Branch 1 / Branch 2 form is derived from
 * `branchMatchSeq`/`branchElseSeq` (ids "m"/"e", labels "Branch 1"/"Branch 2") so every
 * existing flow — and every `…@m_wa`/`…@e_voice` node-scoped resolved key — stays
 * byte-identical.
 */
export function getBranchArms(cfg: BriefConfig): BranchArm[] {
  if (cfg.branchArms && cfg.branchArms.length) return cfg.branchArms;
  const elseDefaultCh = cfg.channels.find((c) => c !== cfg.primary);
  const matchSeq = cfg.branchMatchSeq ?? [cfg.primary];
  const elseSeq = cfg.branchElseSeq ?? (elseDefaultCh ? [elseDefaultCh] : []);
  // Either binary arm may carry a rich body (a nested A/B / gate / welcome — the
  // Example-1 numeric-branch shape) while the branch itself stays Match / Else.
  const matchBody = cfg.branchMatchBody && cfg.branchMatchBody.length ? cfg.branchMatchBody : undefined;
  const elseBody = cfg.branchElseBody && cfg.branchElseBody.length ? cfg.branchElseBody : undefined;
  return [
    { id: "m", label: "Branch 1", seq: matchSeq, body: matchBody },
    { id: "e", label: "Branch 2", seq: elseSeq, body: elseBody },
  ];
}

/**
 * Per-channel display names for the conditional path's arm nodes. A channel that
 * appears more than once across the arms is numbered in canvas order (first arm
 * first), e.g. two WhatsApp nodes become "WhatsApp 1" / "WhatsApp 2"; a channel
 * that appears only once keeps its plain label ("Voice (AI)"). Keyed by the
 * arm-prefixed node id (`m_wa`, `e_wa`, `gold_voice`) so the builder (node
 * titles), `conditionalArmSteps` (Resolve-field labels) and `assumptionsFor` all
 * read the exact same name. Derived from the arms' routed sequences directly, so
 * it stays correct even mid-edit when cfg and resolved routing momentarily differ.
 */
export function armNodeSerials(arms: BranchArm[]): Map<string, string> {
  // Only the plain channel chain is serial-numbered; A/B variant nodes and
  // welcome terminals carry their own titles, so they are excluded here. For a
  // channel-only arm (Phase 1) this is identical to numbering `arm.seq` directly.
  const chainChannels = (arm: BranchArm): Channel[] =>
    armBody(arm).flatMap((s) => (s.type === "channel" ? [s.ch] : []));
  const total: Partial<Record<Channel, number>> = {};
  for (const arm of arms) for (const ch of chainChannels(arm)) total[ch] = (total[ch] ?? 0) + 1;
  const running: Partial<Record<Channel, number>> = {};
  const labels = new Map<string, string>();
  for (const arm of arms) {
    for (const ch of chainChannels(arm)) {
      running[ch] = (running[ch] ?? 0) + 1;
      const base = CHANNEL_META[ch].label;
      labels.set(`${arm.id}_${CHANNEL_NODE_ID[ch]}`, (total[ch] ?? 0) > 1 ? `${base} ${running[ch]}` : base);
    }
  }
  return labels;
}

/**
 * One channel node on a conditional arm, with its arm-prefixed canvas id and the
 * next channel it chains into (if any). This is the single source of truth for
 * the conditional path's node ids, shared by `buildConditionalChannels` (which
 * draws the nodes/edges), `channelOpenVars` (which emits the per-node Resolve
 * vars), `runChecks` (which validates them) and `assumptionsFor` (which reports
 * them) so they can never drift on node ids or ordering.
 *
 * `nodeId` follows the builder's `${prefix}_${CHANNEL_NODE_ID[ch]}` convention
 * (`m_wa`, `e_wa`, `e_voice`). The gap key between this step and the next is
 * `${nodeId}>${nextNodeId}` (used for the inter-channel delay var). `serialLabel`
 * is the user-facing node name ("WhatsApp 1" / "Voice (AI)") from
 * `armNodeSerials`; `nextSerialLabel` is the same for the follow-up channel.
 */
export type ArmStep = {
  /** The arm's canvas-id prefix — "m"/"e" for the binary form, a value slug ("gold") for N-way. */
  arm: string;
  armLabel: string;
  idx: number;
  ch: Channel;
  nodeId: string;
  serialLabel: string;
  nextCh?: Channel;
  nextNodeId?: string;
  nextSerialLabel?: string;
};

/**
 * Flatten a conditional brief's arms into an ordered list of channel steps.
 * Reads the arms through `getBranchArms` (the binary Match / Else form, or an
 * N-way categorical `cfg.branchArms`) so it stays in lock-step with the canvas
 * the builder draws from the same normalizer. Empty arms contribute no steps.
 */
export function conditionalArmSteps(cfg: BriefConfig): ArmStep[] {
  const arms = getBranchArms(cfg);
  const serials = armNodeSerials(arms);
  const steps: ArmStep[] = [];
  for (const arm of arms) {
    const body = armBody(arm);
    // Walk the body; emit an ArmStep for each channel spec. `nextCh`/`nextNodeId`
    // are populated ONLY when the immediately-following spec is also a channel —
    // this is what preserves the inter-channel delay + WhatsApp follow-up var
    // semantics, and keeps a channel-only body byte-identical with the old `seq`
    // enumeration. A channel followed by an A/B split / gate / welcome has no
    // "next channel" (those specs carry their own vars).
    let idx = 0;
    for (let i = 0; i < body.length; i++) {
      const spec = body[i];
      if (spec.type !== "channel") continue;
      const ch = spec.ch;
      const nextSpec = body[i + 1];
      const nextCh = nextSpec && nextSpec.type === "channel" ? nextSpec.ch : undefined;
      const nodeId = `${arm.id}_${CHANNEL_NODE_ID[ch]}`;
      const nextNodeId = nextCh ? `${arm.id}_${CHANNEL_NODE_ID[nextCh]}` : undefined;
      steps.push({
        arm: arm.id,
        armLabel: arm.label,
        idx: idx++,
        ch,
        nodeId,
        serialLabel: serials.get(nodeId) ?? CHANNEL_META[ch].label,
        nextCh,
        nextNodeId,
        nextSerialLabel: nextNodeId ? serials.get(nextNodeId) : undefined,
      });
    }
  }
  return steps;
}

/**
 * The non-channel steps on the conditional arms — A/B splits, state gates and
 * welcome terminals — with their arm-prefixed canvas ids. This is the sibling of
 * {@link conditionalArmSteps} (which enumerates the plain channel chain): together
 * they cover every node the rich-body walker draws, so `channelOpenVars`,
 * `runChecks` and `assumptionsFor` can surface a Resolve var / check / assumption
 * for each without re-deriving node ids. Node-id conventions match the walker:
 * `${arm}_ab${i}` (+ `_${variantId}` for each variant channel), `${arm}_gate${i}`,
 * `${arm}_welcome_${slugTier(tier)}`.
 */
export type ArmRichStep =
  | { kind: "abSplit"; arm: string; armLabel: string; nodeId: string; variants: AbVariant[] }
  | { kind: "gate"; arm: string; armLabel: string; nodeId: string; stateId: string; routes: { outcome: string; next: "continue" | "welcome" | "end"; tier?: string }[] }
  | { kind: "welcome"; arm: string; armLabel: string; nodeId: string; tier: string };

export function conditionalArmRichSteps(cfg: BriefConfig): ArmRichStep[] {
  const out: ArmRichStep[] = [];
  for (const arm of getBranchArms(cfg)) {
    const body = armBody(arm);
    // Welcome nodes are deduped per arm by node id: the builder's `ensureWelcome`
    // creates ONE node per (arm, tier), whether it comes from a body `welcome`
    // spec or from a gate route whose `next` is "welcome". Track seen ids so each
    // welcome surfaces exactly one template var (never doubled by two routes to
    // the same tier).
    const seenWelcome = new Set<string>();
    const pushWelcome = (tier: string) => {
      const nodeId = `${arm.id}_welcome_${slugTier(tier)}`;
      if (seenWelcome.has(nodeId)) return;
      seenWelcome.add(nodeId);
      out.push({ kind: "welcome", arm: arm.id, armLabel: arm.label, nodeId, tier });
    };
    for (let i = 0; i < body.length; i++) {
      const s = body[i];
      if (s.type === "abSplit")
        out.push({ kind: "abSplit", arm: arm.id, armLabel: arm.label, nodeId: `${arm.id}_ab${i}`, variants: s.variants });
      else if (s.type === "gate") {
        out.push({ kind: "gate", arm: arm.id, armLabel: arm.label, nodeId: `${arm.id}_gate${i}`, stateId: s.stateId, routes: s.routes });
        // A gate route that ends in a per-tier welcome needs that welcome's
        // template on the Resolve card too — enumerate it here so it validates.
        for (const r of s.routes) if (r.next === "welcome" && r.tier) pushWelcome(r.tier);
      } else if (s.type === "welcome") pushWelcome(s.tier);
    }
  }
  return out;
}

/**
 * Draw an A/B Split node plus one per-variant channel node, wiring each variant to
 * `onward`. Shared by the conditional arm-body walker (`buildArm`) and the linear
 * content-A/B builder so both render an identical split. Per-variant traffic shares
 * come from resolved > spec > equal split; the split subtitle states every share
 * ("50/30/20") and each variant node is prefixed with its share ("50% · …"). The
 * caller supplies the incoming edge into `nodeId`. Returns the advanced y.
 */
function emitAbSplit(
  nodeId: string,
  x: number,
  y: number,
  variants: AbVariant[],
  resolved: Record<string, string>,
  onward: string,
  nodeList: Node<WorkflowNodeData>[],
  edgeList: Edge[],
): number {
  const pcts = abVariantPcts(variants, resolved, nodeId);
  nodeList.push({ id: nodeId, type: "workflow", position: { x, y },
    data: { kind: "abSplit", title: "A/B Split", subtitle: pcts.join("/"), valid: true,
      outputs: variants.map((v) => ({ id: v.id, label: v.label, kind: "variant" as const })),
      config: { splitVariants: variants.map((v, k) => ({ id: v.id, label: v.label, pct: pcts[k] })) } } });
  y += 120;
  let vx = x - ((variants.length - 1) * 200) / 2;
  variants.forEach((v, k) => {
    const vId = `${nodeId}_${v.id}`;
    const vNode = channelNode(v.ch, y, resolved, vId);
    vNode.position = { x: vx, y };
    vNode.data.title = v.label;
    // Prefix the variant node with its traffic share so the split reads at a
    // glance ("50% · Template: reactivate_v3"); the plain-English "what happens
    // next" flow is captured on the Resolve card + validation, not the node.
    const base = vNode.data.subtitle ?? "";
    vNode.data.subtitle = base ? `${pcts[k]}% · ${base}` : `${pcts[k]}%`;
    nodeList.push(vNode);
    edgeList.push({ id: `e_${nodeId}_${v.id}_${vId}`, source: nodeId, sourceHandle: v.id, target: vId });
    edgeList.push({ id: `e_${vId}_${onward}`, source: vId, target: onward });
    vx += 200;
  });
  y += 120;
  return y;
}

/**
 * Linear same-channel CONTENT A/B: start → audience → an A/B Split whose N variant
 * nodes are all the same channel (each capturing its own template), converging to a
 * single End. Distinct from `buildParallelChannels` (two different channels) and
 * from the conditional arm A/B (which sits inside a branch). The split node id is
 * `lin_ab0`, so every per-variant Resolve key (`waTemplate@lin_ab0_a`,
 * `splitPct@lin_ab0_a`, `abFlow@lin_ab0_a`) is validated by the existing var-driven
 * `runChecks` A/B logic with no extra checks.
 */
export function buildContentAbChannels(name: string, cfg: BriefConfig, resolved: Record<string, string>): AskPiPlan {
  const seg = findSegment(resolved.segment);
  const nodes: Node<WorkflowNodeData>[] = [
    { id: "start", type: "workflow", position: { x: 0, y: 0 },
      data: { kind: "start", title: "Start", locked: true, valid: true } },
    { id: "audience", type: "workflow", position: { x: 0, y: 120 },
      data: { kind: "audience", title: "Audience",
        subtitle: audienceSubtitle(resolved),
        valid: !!seg, error: seg ? undefined : "Select segment",
        config: { audienceMode: "api", phoneField: resolved.phoneField ?? DEFAULT_PHONE_FIELD } } },
  ];
  const edges: Edge[] = [
    { id: "e_start_audience", source: "start", target: "audience" },
    { id: "e_audience_lin_ab0", source: "audience", target: "lin_ab0" },
  ];
  const variants = cfg.contentAb?.variants ?? [];
  // When the brief pairs same-channel content A/B with a fallback on the other channel
  // (e.g. "A/B different WA templates, voice as fallback"), inject a shared fallback
  // node between the A/B variants and End: Start → Audience → A/B (WA_A | WA_B) → Wait
  // → Voice fallback → End. The A/B variants all converge on the fallback wait first
  // so a single voice touch covers both arms — matching how a marketer expresses this.
  const onward = cfg.fallback ? "lin_ab_wait" : "end";
  const bottomY = emitAbSplit("lin_ab0", 0, 260, variants, resolved, onward, nodes, edges);
  let tailY = bottomY;
  if (cfg.fallback) {
    const { value, unit } = parseDuration(resolved.fallbackWindow ?? cfg.fallbackWait);
    nodes.push({
      id: "lin_ab_wait", type: "workflow", position: { x: 0, y: tailY + 40 },
      data: {
        kind: "delay",
        title: `Wait ${value} ${unit === "Hours" ? (value === 1 ? "hour" : "hours") : unit === "Days" ? (value === 1 ? "day" : "days") : unit.toLowerCase()}`,
        subtitle: "Fallback window",
        valid: true,
        config: { delayValue: value, delayUnit: unit },
      },
    });
    tailY += 120;
    const fbNode = channelNode(cfg.fallback, tailY, resolved);
    nodes.push(fbNode);
    edges.push({ id: "e_lin_ab_wait_fb", source: "lin_ab_wait", target: fbNode.id });
    edges.push({ id: `e_${fbNode.id}_end`, source: fbNode.id, target: "end" });
    tailY += 120;
  }
  nodes.push({ id: "end", type: "workflow", position: { x: 0, y: tailY + 20 },
    data: { kind: "end", title: "End", locked: true, valid: true } });
  return { nodes, edges, name };
}

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
        subtitle: audienceSubtitle(resolved),
        valid: !!seg, error: seg ? undefined : "Select segment",
        config: { audienceMode: "api", phoneField: resolved.phoneField ?? DEFAULT_PHONE_FIELD } } },
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
 * labeled outputs (Match / Else) each route — via a `sourceHandle` edge — to an
 * ordered *sequence* of channel nodes (or straight to End). A branch can chain
 * channels: e.g. "WhatsApp followed by Voice" runs wa → voice on that arm. Match
 * defaults to the primary channel, Else to the other channel (or End when only
 * one channel is in play); the resolve card can override both arms with any
 * sequence. The branch node's subtitle states the rule (attribute ≥ value /
 * = value); routing is read from `resolved.branchMatch` / `resolved.branchElse`
 * (a `>`-joined channel-id sequence, or "end"), falling back to
 * `cfg.branchMatchSeq` / `cfg.branchElseSeq` inferred from the brief. Each arm
 * gets its own collision-free node ids (Match arm prefixed `m_`, Else arm `e_`)
 * so the same channel can appear on both arms. Stable ids (audience / branch /
 * m_* / e_* / end).
 */
export function buildConditionalChannels(
  name: string,
  cfg: BriefConfig,
  resolved: Record<string, string>,
): AskPiPlan {
  const seg = findSegment(resolved.segment);
  const attr = findSplitAttribute(resolved.conditionAttribute ?? cfg.conditionAttribute);
  const categorical = attr?.type === "categorical";
  const branchValue = categorical ? resolved.conditionValue : resolved.conditionThreshold;
  const matchCut = attr
    ? categorical
      ? `${attr.label} = ${resolved.conditionValue ?? "…"}`
      : `${attr.label} ≥ ${attr.unit}${resolved.conditionThreshold ?? "…"}`
    : "Set the branch rule";

  // Normalize to N arms (the binary Match / Else form, or an N-way categorical
  // `cfg.branchArms`), then apply Resolve-card routing overrides per arm: binary
  // arms read the legacy `branchMatch`/`branchElse` keys, N-way arms read
  // `branchRoute@<armId>`. Each arm's own inferred sequence is the fallback.
  const isNway = !!(cfg.branchArms && cfg.branchArms.length);
  const arms = getBranchArms(cfg).map((arm) => {
    const routeKey = isNway ? `branchRoute@${arm.id}` : arm.id === "m" ? "branchMatch" : "branchElse";
    return { ...arm, seq: parseBranchSeq(resolved[routeKey]) ?? arm.seq };
  });
  // The N-way branch routes on the attribute itself (one arm per value), so it is
  // "set" once the attribute is chosen; the binary branch also needs its single
  // match value/threshold. Per-arm route completeness is enforced on the card.
  const branchReady = isNway ? !!attr : !!attr && !!branchValue;
  // Per-channel node names ("WhatsApp 1" / "WhatsApp 2" / "Voice (AI)") so a
  // duplicated channel is distinguishable on the canvas and matches its Resolve
  // field. Derived from the very sequences drawn below, so it never drifts.
  const serials = armNodeSerials(arms);

  // Optional leading channel action(s) placed BEFORE the branch (the voice-led
  // shape: place a call first, then route on its outcome). Each lead node sits on
  // the trunk between the audience and the branch, node-scoped `pre_<i>_<ch>` so
  // its Resolve template/agent round-trips. The branch — and every arm below it —
  // shifts down one row per lead node so nothing overlaps. Empty seq → the classic
  // audience → branch topology, byte-identical.
  const leadSeq = cfg.preBranchSeq ?? [];
  const leadIds = leadSeq.map((ch, i) => `pre_${i}_${CHANNEL_NODE_ID[ch]}`);
  const LEAD_OFFSET = leadSeq.length * 120;
  const leadNodes: Node<WorkflowNodeData>[] = leadSeq.map((ch, i) => {
    const node = channelNode(ch, 240 + i * 120, resolved, leadIds[i]);
    node.position = { x: 0, y: 240 + i * 120 };
    return node;
  });

  const nodes: Node<WorkflowNodeData>[] = [
    { id: "start", type: "workflow", position: { x: 0, y: 0 },
      data: { kind: "start", title: "Start", locked: true, valid: true } },
    { id: "audience", type: "workflow", position: { x: 0, y: 120 },
      data: { kind: "audience", title: "Audience",
        subtitle: audienceSubtitle(resolved),
        valid: !!seg, error: seg ? undefined : "Select segment",
        config: { audienceMode: "api", phoneField: resolved.phoneField ?? DEFAULT_PHONE_FIELD } } },
    ...leadNodes,
    { id: CONDITION_NODE_ID, type: "workflow", position: { x: 0, y: 240 + LEAD_OFFSET },
      data: { kind: "conditional", title: "Conditional branch",
        subtitle: isNway && attr ? `Route on ${attr.label}` : matchCut,
        valid: branchReady,
        error: branchReady ? undefined : "Set the branch rule",
        outputs: arms.map((a) => ({ id: a.id, label: a.label, kind: "branch" as const })) } },
  ];

  // Build each arm as a chain of channel nodes with arm-prefixed ids so the same
  // channel (e.g. WhatsApp) can appear on both Match and Else without colliding.
  // Consecutive channels are separated by a Delay node (its wait read node-scoped
  // from `armDelay@<gapId>`), and a WhatsApp node that has a follow-up channel
  // gets disposition exit ports: only the chosen outcome (`followUpOn@<nodeId>`,
  // default "Failed") continues to the wait/next channel; every other outcome
  // ends. Nodes + edges are produced together so the disposition wiring and the
  // delay nodes stay in lock-step.
  // A Delay node between two arm nodes (its wait read node-scoped from
  // `armDelay@<gapId>`), shared by the channel-only path and the rich walker.
  const delayNode = (id: string, gapId: string, x: number, y: number): Node<WorkflowNodeData> => {
    const { value, unit } = parseDuration(resolved[`armDelay@${gapId}`] ?? cfg.fallbackWait ?? "1 hour");
    return { id, type: "workflow", position: { x, y },
      data: { kind: "delay", title: "Wait", subtitle: `${value} ${unit}`, valid: true,
        config: { delayValue: value, delayUnit: unit } } };
  };

  const buildArm = (
    arm: BranchArm,
    x: number,
  ): { nodes: Node<WorkflowNodeData>[]; edges: Edge[]; bottomY: number } => {
    const armId = arm.id;
    const body = armBody(arm);
    const armNodeList: Node<WorkflowNodeData>[] = [];
    const armEdgeList: Edge[] = [];
    // Arms start below the branch, which itself sits LEAD_OFFSET lower when a
    // leading pre-branch action is present, so the whole arm column shifts down.
    let y = 380 + LEAD_OFFSET;

    // A channel-only arm (Phase 1) takes the original path verbatim so its nodes,
    // edges, ids and positions stay byte-identical. Only arms that carry a rich
    // spec (A/B split, state gate, welcome) go through the walker below.
    const hasRich = body.some((s) => s.type !== "channel");
    if (!hasRich) {
      const seq = body.map((s) => (s as { type: "channel"; ch: Channel }).ch);
      const ids = seq.map((ch) => `${armId}_${CHANNEL_NODE_ID[ch]}`);
      const first = ids[0] ?? "end";
      armEdgeList.push({ id: `e_branch_${armId}_${first}`, source: CONDITION_NODE_ID, sourceHandle: armId, target: first });

      for (let i = 0; i < seq.length; i++) {
        const ch = seq[i];
        const nodeId = ids[i];
        const node = channelNode(ch, y, resolved, nodeId);
        node.position = { x, y };
        node.data.title = serials.get(nodeId) ?? node.data.title;
        const hasNext = i + 1 < seq.length;
        const delayId = hasNext ? `${armId}_delay_${i}` : undefined;
        // Where this channel's "continue" edge points: the inter-channel wait if a
        // follow-up exists, otherwise End.
        const onward = hasNext ? delayId! : "end";

        if (ch === "whatsapp" && hasNext) {
          const ports = whatsappDispositionPorts();
          node.data.outputs = ports.outputs;
          node.data.config = { ...node.data.config, paths: ports.paths };
          const followUp = resolved[`followUpOn@${nodeId}`] ?? "Failed";
          for (const d of CHANNEL_DISPOSITIONS.whatsapp) {
            const target = d === followUp ? onward : "end";
            armEdgeList.push({ id: `e_${nodeId}_${d}_${target}`, source: nodeId, sourceHandle: d, target });
          }
        } else {
          armEdgeList.push({ id: `e_${nodeId}_${onward}`, source: nodeId, target: onward });
        }
        armNodeList.push(node);
        y += 120;

        if (hasNext) {
          const nextId = ids[i + 1];
          const gapId = `${nodeId}>${nextId}`;
          armNodeList.push(delayNode(delayId!, gapId, x, y));
          armEdgeList.push({ id: `e_${delayId}_${nextId}`, source: delayId!, target: nextId });
          y += 120;
        }
      }
      return { nodes: armNodeList, edges: armEdgeList, bottomY: y };
    }

    // ----- Rich-body walker (Phases 2-4) -----------------------------------
    // Each spec draws its node(s) and wires forward to the *entry* node of the
    // next spec (or End when it is the last). Welcome terminals are created on
    // demand (deduped per tier within the arm) and always converge to the single
    // shared End node, preserving the one-start / one-end invariant.
    const entryId = (i: number): string => {
      const s = body[i];
      if (!s) return "end";
      if (s.type === "channel") return `${armId}_${CHANNEL_NODE_ID[s.ch]}`;
      if (s.type === "abSplit") return `${armId}_ab${i}`;
      if (s.type === "gate") return `${armId}_gate${i}`;
      return `${armId}_welcome_${slugTier(s.tier)}`;
    };

    const welcomeIds = new Map<string, string>();
    let welcomeX = x + 260;
    const ensureWelcome = (tier: string, atY: number): string => {
      const id = `${armId}_welcome_${slugTier(tier)}`;
      if (!welcomeIds.has(id)) {
        welcomeIds.set(id, id);
        const node = channelNode("whatsapp", atY, resolved, id);
        node.position = { x: welcomeX, y: atY };
        node.data.title = `Welcome to ${tier}`;
        node.data.subtitle = "WhatsApp";
        armNodeList.push(node);
        armEdgeList.push({ id: `e_${id}_end`, source: id, target: "end" });
        welcomeX += 240;
      }
      return id;
    };

    const first = body.length ? entryId(0) : "end";
    armEdgeList.push({ id: `e_branch_${armId}_${first}`, source: CONDITION_NODE_ID, sourceHandle: armId, target: first });

    for (let i = 0; i < body.length; i++) {
      const spec = body[i];
      const onward = entryId(i + 1);
      const nodeId = entryId(i);

      if (spec.type === "channel") {
        const ch = spec.ch;
        const node = channelNode(ch, y, resolved, nodeId);
        node.position = { x, y };
        node.data.title = serials.get(nodeId) ?? node.data.title;
        const nextSpec = body[i + 1];
        const nextIsChannel = nextSpec?.type === "channel";
        const nextIsGate = nextSpec?.type === "gate";
        // A wait separates this channel from a following channel or state gate
        // (audience state needs time to settle); A/B / welcome follow immediately.
        const gated = i + 1 < body.length && (nextIsChannel || nextIsGate);
        const delayId = gated ? `${armId}_delay_${i}` : undefined;
        const cont = gated ? delayId! : onward;

        if (ch === "whatsapp" && nextIsChannel) {
          const ports = whatsappDispositionPorts();
          node.data.outputs = ports.outputs;
          node.data.config = { ...node.data.config, paths: ports.paths };
          const followUp = resolved[`followUpOn@${nodeId}`] ?? "Failed";
          for (const d of CHANNEL_DISPOSITIONS.whatsapp) {
            const target = d === followUp ? cont : "end";
            armEdgeList.push({ id: `e_${nodeId}_${d}_${target}`, source: nodeId, sourceHandle: d, target });
          }
        } else {
          armEdgeList.push({ id: `e_${nodeId}_${cont}`, source: nodeId, target: cont });
        }
        armNodeList.push(node);
        y += 120;
        if (gated) {
          armNodeList.push(delayNode(delayId!, `${nodeId}>${onward}`, x, y));
          armEdgeList.push({ id: `e_${delayId}_${onward}`, source: delayId!, target: onward });
          y += 120;
        }
      } else if (spec.type === "abSplit") {
        // Shared with the linear content-A/B builder — draws the A/B Split node plus
        // one per-variant channel node, wiring each to `onward`, and returns the
        // advanced y.
        y = emitAbSplit(nodeId, x, y, spec.variants, resolved, onward, armNodeList, armEdgeList);
      } else if (spec.type === "gate") {
        const stLabel = resolved[`gateState@${nodeId}`];
        const st = STATE_ATTRIBUTES.find((a) => a.label === stLabel) ?? findStateAttribute(spec.stateId);
        armNodeList.push({ id: nodeId, type: "workflow", position: { x, y },
          data: { kind: "conditional", title: st?.label ?? "State gate",
            subtitle: st ? `On ${st.stateVar}` : "Set the state check", valid: true,
            outputs: spec.routes.map((r) => ({ id: slugTier(r.outcome), label: r.outcome, kind: "branch" as const })),
            config: { paths: spec.routes.map((r) => ({ id: slugTier(r.outcome), label: r.outcome,
              variable: st?.stateVar ?? "", op: "=", value: r.outcome })) } } });
        y += 120;
        for (const r of spec.routes) {
          const oid = slugTier(r.outcome);
          const next = (resolved[`gateRoute@${nodeId}:${oid}`] as "continue" | "welcome" | "end") ?? r.next;
          const target = next === "continue" ? onward
            : next === "welcome" ? ensureWelcome(r.tier ?? arm.label, y)
            : "end";
          armEdgeList.push({ id: `e_${nodeId}_${oid}_${target}`, source: nodeId, sourceHandle: oid, target });
        }
        y += 120;
      } else if (spec.type === "welcome") {
        ensureWelcome(spec.tier, y);
        y += 120;
      }
    }
    return { nodes: armNodeList, edges: armEdgeList, bottomY: y };
  };

  // Spread arms horizontally so N arms don't overlap, centered on x:0. A gutter of
  // 400 keeps the binary form at its historical ±200 (byte-identical positions).
  const ARM_GUTTER = 400;
  const n = arms.length;
  const built = arms.map((arm, i) => buildArm(arm, (i - (n - 1) / 2) * ARM_GUTTER));
  for (const b of built) nodes.push(...b.nodes);

  const endY = Math.max(...built.map((b) => b.bottomY), 500) + 20;
  nodes.push({ id: "end", type: "workflow", position: { x: 0, y: endY },
    data: { kind: "end", title: "End", locked: true, valid: true } });

  // Trunk: start → audience → (each lead node in turn) → branch. With no lead
  // nodes this collapses to the single byte-identical `e_audience_branch` edge.
  const leadChain: Edge[] = [];
  let prevTrunk = "audience";
  for (const id of leadIds) {
    leadChain.push({ id: `e_${prevTrunk}_${id}`, source: prevTrunk, target: id });
    prevTrunk = id;
  }
  leadChain.push({ id: `e_${prevTrunk}_branch`, source: prevTrunk, target: CONDITION_NODE_ID });

  const edges: Edge[] = [
    { id: "e_start_audience", source: "start", target: "audience" },
    ...leadChain,
    ...built.flatMap((b) => b.edges),
  ];
  return { nodes, edges, name };
}

/** Open variables implied by a channel config: segment + contact-number field + each channel's resource + fallback window. */
function channelOpenVars(cfg: BriefConfig): TemplateVar[] {
  const vars: TemplateVar[] = [
    { key: "segment", kind: "segment", label: "Audience segment", required: true, group: "Audience" },
  ];
  // Right after the audience: which attribute supplies the phone number both
  // WhatsApp and voice dial. Defaulted to the primary mobile (surfaced as an
  // assumption), editable on the Resolve card.
  if (cfg.channels.some((c) => c === "whatsapp" || c === "voice")) {
    vars.push({ key: "phoneField", kind: "phoneField", label: "Contact number field", default: DEFAULT_PHONE_FIELD, required: false, group: "Audience" });
  }
  if (cfg.conditional) {
    // Conditional path: each arm node is independently configurable from the one
    // Resolve card. Resolve in priority order — Tier 2 (content) before Tier 3
    // (logic). Two passes over the same `conditionalArmSteps` the builder/validator
    // use, so keys never drift:
    //  • Pass 1 — per channel node, its own template/agent (node-scoped key so it
    //    round-trips to the exact node the builder draws), grouped by its arm
    //    (`step.armLabel`) and labelled by the node's serial name ("WhatsApp 1" /
    //    "Voice (AI)") so it matches the canvas.
    //  • Pass 2 — the timing/follow-up logic: per inter-channel gap an optional
    //    wait, per WhatsApp node with a follow-up the disposition that gates it.
    //    These are deferred to a single trailing "Timing & follow-up" step so the
    //    card asks for content first and branch/delay logic last.
    //
    // Pass 0 — any leading pre-branch action(s) (the voice-led shape). Each lead
    // node is node-scoped `pre_<i>_<ch>` exactly as the builder draws it, grouped
    // "Before branch" so the card resolves the opening call/message first.
    const leadSeq = cfg.preBranchSeq ?? [];
    leadSeq.forEach((ch, i) => {
      const meta = CHANNEL_META[ch];
      const noun = ch === "whatsapp" ? "Template" : "Agent";
      vars.push({ key: `${meta.resourceKey}@pre_${i}_${CHANNEL_NODE_ID[ch]}`, kind: meta.resourceKind, label: `${meta.label} · ${noun}`, required: true, group: "Before branch" } as TemplateVar);
    });
    const steps = conditionalArmSteps(cfg);
    for (const step of steps) {
      const meta = CHANNEL_META[step.ch];
      const noun = step.ch === "whatsapp" ? "Template" : "Agent";
      vars.push({ key: `${meta.resourceKey}@${step.nodeId}`, kind: meta.resourceKind, label: `${step.serialLabel} · ${noun}`, required: true, group: step.armLabel } as TemplateVar);
    }
    for (const step of steps) {
      if (step.nextCh && step.nextNodeId) {
        const nextName = step.nextSerialLabel ?? CHANNEL_META[step.nextCh].label;
        vars.push({ key: `armDelay@${step.nodeId}>${step.nextNodeId}`, kind: "duration", label: `${step.armLabel} · Wait before ${nextName}`, default: cfg.fallbackWait || "1 hour", required: false, group: "Timing & follow-up" });
        if (step.ch === "whatsapp") {
          vars.push({ key: `followUpOn@${step.nodeId}`, kind: "choice", label: `${step.armLabel} · ${step.serialLabel} follow-up disposition`, options: CHANNEL_DISPOSITIONS.whatsapp, default: "Failed", required: false, group: "Timing & follow-up" });
        }
      }
    }
    // Pass 3 — the rich arm steps (A/B splits, state gates, welcome terminals).
    // Each is node-scoped exactly as the walker draws it, so a card edit round-trips
    // to the right node: A/B → a split-percent + one template/agent per variant;
    // gate → a state-attribute picker + per-outcome route; welcome → its template.
    for (const rs of conditionalArmRichSteps(cfg)) {
      if (rs.kind === "abSplit") {
        // N-way A/B: per variant, a traffic-% field (shares sum to 100, validated),
        // its template/agent, and a REQUIRED plain-English "what happens next" flow
        // so every emanating branch of the split is explicitly stated by the user.
        const defaults = abVariantPcts(rs.variants, {}, rs.nodeId);
        rs.variants.forEach((v, k) => {
          const meta = CHANNEL_META[v.ch];
          const noun = v.ch === "whatsapp" ? "Template" : "Agent";
          vars.push({ key: `splitPct@${rs.nodeId}_${v.id}`, kind: "percent", label: `${rs.armLabel} · ${v.label} · Traffic %`, default: String(v.pct ?? defaults[k]), required: false, group: rs.armLabel });
          vars.push({ key: `${meta.resourceKey}@${rs.nodeId}_${v.id}`, kind: meta.resourceKind, label: `${rs.armLabel} · ${v.label} · ${noun}`, required: true, group: rs.armLabel } as TemplateVar);
          vars.push({ key: `abFlow@${rs.nodeId}_${v.id}`, kind: "text", label: `${rs.armLabel} · ${v.label} · What happens next`, default: v.flow ?? `Send ${meta.label}, then continue to the shared next step`, placeholder: "Describe this variant's flow in plain English", required: true, group: rs.armLabel } as TemplateVar);
        });
      } else if (rs.kind === "gate") {
        const st = findStateAttribute(rs.stateId);
        vars.push({ key: `gateState@${rs.nodeId}`, kind: "choice", label: `${rs.armLabel} · State check`, options: STATE_ATTRIBUTES.map((a) => a.label), default: st?.label ?? STATE_ATTRIBUTES[0].label, required: false, group: rs.armLabel });
        for (const r of rs.routes) {
          vars.push({ key: `gateRoute@${rs.nodeId}:${slugTier(r.outcome)}`, kind: "choice", label: `${rs.armLabel} · ${r.outcome} →`, options: ["continue", "welcome", "end"], default: r.next, required: false, group: rs.armLabel });
        }
      } else {
        vars.push({ key: `${CHANNEL_META.whatsapp.resourceKey}@${rs.nodeId}`, kind: CHANNEL_META.whatsapp.resourceKind, label: `${rs.armLabel} · Welcome to ${rs.tier} · Template`, required: true, group: rs.armLabel } as TemplateVar);
      }
    }
    return vars;
  }
  // Linear content A/B (single channel, N template variants). Mirror the conditional
  // arm A/B rich-step fields, node-scoped to the fixed split id `lin_ab0` so the
  // Resolve card captures a template + traffic % + "what happens next" per variant,
  // and the var-driven `runChecks` A/B logic validates each one automatically.
  if (cfg.contentAb) {
    const vs = cfg.contentAb.variants;
    const defaults = abVariantPcts(vs, {}, "lin_ab0");
    vs.forEach((v, k) => {
      const meta = CHANNEL_META[v.ch];
      const noun = v.ch === "whatsapp" ? "Template" : "Agent";
      vars.push({ key: `splitPct@lin_ab0_${v.id}`, kind: "percent", label: `A/B · ${v.label} · Traffic %`, default: String(v.pct ?? defaults[k]), required: false, group: "A/B test" });
      vars.push({ key: `${meta.resourceKey}@lin_ab0_${v.id}`, kind: meta.resourceKind, label: `A/B · ${v.label} · ${noun}`, required: true, group: "A/B test" } as TemplateVar);
      vars.push({ key: `abFlow@lin_ab0_${v.id}`, kind: "text", label: `A/B · ${v.label} · What happens next`, default: v.flow ?? `Send ${meta.label}, then continue to the shared next step`, placeholder: "Describe this variant's flow in plain English", required: true, group: "A/B test" } as TemplateVar);
    });
    // Hybrid: content A/B on the primary channel + a fallback on the other channel
    // ("A/B different WA templates, voice as fallback"). Capture the fallback channel's
    // resource + the fallback window so both surface on the Resolve card alongside the
    // per-variant fields.
    if (cfg.fallback) {
      const fbMeta = CHANNEL_META[cfg.fallback];
      const fbNoun = cfg.fallback === "whatsapp" ? "Template" : "Agent";
      vars.push({ key: fbMeta.resourceKey, kind: fbMeta.resourceKind, label: `Fallback ${fbMeta.label} · ${fbNoun}`, required: true, group: "Fallback" } as TemplateVar);
      vars.push({ key: "fallbackWindow", kind: "duration", label: "Fallback window", default: cfg.fallbackWait, required: false, group: "Fallback" });
    }
    return vars;
  }
  const seen = new Set<string>();
  for (const ch of cfg.channels) {
    const gap = channelGap(ch);
    if (seen.has(gap.key)) continue;
    seen.add(gap.key);
    vars.push({ ...gap, group: "Messaging" });
  }
  if (cfg.fallback) {
    vars.push({ key: "fallbackWindow", kind: "duration", label: "Fallback window", default: cfg.fallbackWait, required: false, group: "Timing & follow-up" });
  }
  return vars;
}

/** Human-readable "Primary X → fallback Y (on non-delivery)" line. */
export function channelsSummary(cfg: BriefConfig): string {
  const p = CHANNEL_META[cfg.primary].label;
  if (cfg.conditional) {
    // N-way categorical: list each arm's route (e.g. "Silver → WhatsApp; Gold → …").
    if (cfg.branchArms && cfg.branchArms.length) {
      const arms = cfg.branchArms
        .map((arm) => `${arm.label} → ${arm.seq.length ? arm.seq.map((c) => CHANNEL_META[c].label).join(" → ") : "End"}`)
        .join("; ");
      return `Conditional branch — ${arms} (routed on an audience attribute)`;
    }
    const other = cfg.channels.find((c) => c !== cfg.primary);
    const matchLabel = cfg.branchMatchSeq?.length
      ? cfg.branchMatchSeq.map((c) => CHANNEL_META[c].label).join(" → ")
      : p;
    const elseLabel = cfg.branchElseSeq?.length
      ? cfg.branchElseSeq.map((c) => CHANNEL_META[c].label).join(" → ")
      : other ? CHANNEL_META[other].label : "End";
    return `Conditional branch — Branch 1 → ${matchLabel}; Branch 2 → ${elseLabel} (routed on an audience attribute)`;
  }
  if (cfg.contentAb) {
    const vs = cfg.contentAb.variants;
    const chs = Array.from(new Set(vs.map((v) => v.ch)));
    const abPhrase = chs.length > 1
      ? `A/B test — ${chs.map((c) => CHANNEL_META[c].label).join(" vs ")} on a split audience`
      : `A/B test — ${vs.length} ${CHANNEL_META[chs[0] ?? cfg.contentAb.ch].label} template variants on a split audience`;
    // Hybrid: same-channel content A/B PLUS a fallback on the other channel — reflect
    // the fallback in the summary so the user sees both parts of the shape.
    if (cfg.fallback) return `${abPhrase}, then fallback ${CHANNEL_META[cfg.fallback].label} (on non-delivery)`;
    return abPhrase;
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
        subtitle: audienceSubtitle(resolved),
        valid: !!seg, error: seg ? undefined : "Select segment",
        config: { audienceMode: "api", phoneField: resolved.phoneField ?? DEFAULT_PHONE_FIELD },
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

  // A categorical tier branch (≥2 known option words) paired with an explicit
  // branch / tier cue means any "A/B" mention is a NESTED arm split (Phase 2),
  // not a top-level channel experiment — so it must not trip the experiment
  // detector, which would otherwise disable the whole conditional path.
  const categoricalBranch =
    /\bbranch\b|\btier\b|\bsegment\b|\bbased on\b|\bdepending on\b/.test(t) &&
    SPLIT_ATTRIBUTES.some(
      (a) =>
        a.type === "categorical" &&
        (a.options ?? []).filter((o) => new RegExp(`\\b${o.toLowerCase()}\\b`).test(t)).length >= 2,
    );

  // Conditional-branch framing: route the audience down a Match / Else branch on an
  // attribute ("if VIP send …", "based on tier", "high-value customers get …"). Distinct
  // from a fallback (which keys on NON-DELIVERY): a conditional keys on an audience
  // attribute. Mutually exclusive with an A/B experiment.
  //
  // Also conditional when the brief splits the audience by an attribute and gives each
  // tier a DIFFERENT treatment — e.g. "split by LTV, high-value get WhatsApp, low-value
  // get WhatsApp then voice". This is distinct from a generic parallel split (one
  // treatment per slice): the differential routing per attribute tier is what makes it a
  // Match / Else branch. Detected conservatively via either (a) a high-tier AND a
  // low-tier descriptor both present, or (b) a "split <audience> by/basis <attribute>"
  // phrase paired with a per-segment "for <tier>" — neither fires on a plain
  // "send both channels to everyone" parallel brief. ("mid" reads as a low/other tier,
  // so a High-LTV / Mid-LTV value split is recognised.)
  const tier = "(ltv|value|potential|spend(?:er|ing)?|tier|worth|priority|engag\\w*|loyal\\w*|customers?|merchants?|members?|users?|accounts?|shoppers?)";
  const highLowDifferential =
    new RegExp(`\\b(high|top|premium|vip|elite|gold|platinum|big|large)[\\s-]?${tier}\\b`).test(t) &&
    new RegExp(`\\b(low|mid|bottom|basic|standard|regular|small|budget)[\\s-]?${tier}\\b`).test(t);
  const splitByAttribute =
    /\bsplit[^.]{0,40}\b(audience|customers?|merchants?|members?|users?|base|list|segment)\b[^.]{0,24}\b(by|basis|based on|on the basis|depending on|per)\b/.test(t) &&
    /\bfor\s+(high|low|mid|top|bottom|premium|vip|elite|gold|platinum|loyal|new|existing|big|small)\b/.test(t);

  // A/B-test framing: split the WHOLE audience to compare two channels head-to-head.
  // Suppressed whenever the brief is clearly a branch (a categorical tier branch OR a
  // numeric high/low value split OR a split-by-attribute) — there the "A/B" is a
  // NESTED arm split (an opener test inside one branch), not a top-level channel
  // experiment, and must not disable the conditional path.
  const branchFraming = categoricalBranch || highLowDifferential || splitByAttribute;
  // Any A/B framing (single- or multi-channel) draws a visible A/B Split via the
  // `contentAb` config — a SINGLE-channel A/B tests CONTENT (same-channel template
  // variants), a MULTI-channel A/B tests CHANNELS (one variant per channel). It is
  // suppressed under branchFraming, where the "A/B" is a NESTED arm split inside a
  // branch, not a top-level split. The user names variants/resources on the card.
  const abKeyword =
    /a\/b|a-b|ab test|split test|experiment|test two|two variants|head\s?to\s?head/.test(t);
  const contentNoun =
    /templates?|messages?|creatives?|copy|copies|openers?|subject lines?|content|variations?|variants?/.test(t);
  // An A/B keyword ALWAYS draws a visible A/B Split. With >=2 named channels it's
  // a CHANNEL A/B (one variant per channel, each with its own resource); with a
  // single channel (or a content noun and no channel) it's a CONTENT A/B on that
  // channel (same-channel template variants). Either way the variants + resources
  // are completed on the split's Resolve card — never a bare parallel fan-out.
  const contentAb = !branchFraming && abKeyword && (detected.length >= 1 || contentNoun);

  const conditional =
    !contentAb &&
    (/\bbased on\b|\bdepending on\b|\bconditional\b|\bbranch\b|\botherwise\b|\belse\s+(?:send|use|route|get|reach|go)|\bif\b[^.]*\b(vip|high.?value|high.?spend|big.?spend|top.?tier|premium|elite|gold|platinum|loyal|tier|spent|spend|over|above|more than|greater|under|below|less than|cart|order|points|engag)\b/.test(t) ||
      highLowDifferential ||
      splitByAttribute);

  // Per-branch channel sequences for a *differential* conditional — e.g. "WhatsApp
  // for high LTV, WhatsApp then Voice for low LTV". Split the brief into clauses
  // and, for the clause naming a high-tier / low-tier audience, read the channels
  // in the order they appear (honouring "followed by" / "then"). Match arm = high
  // tier (≥ threshold); Else arm = low tier. Conservative: a sequence is only set
  // when a clause names BOTH a tier and at least one channel.
  let branchMatchSeq: Channel[] | undefined;
  let branchElseSeq: Channel[] | undefined;
  let branchMatchBody: ArmNodeSpec[] | undefined;
  let branchElseBody: ArmNodeSpec[] | undefined;
  let branchArms: BranchArm[] | undefined;
  let preBranchSeq: Channel[] | undefined;
  let conditionAttribute: string | undefined;
  if (conditional) {
    const seqFromClause = (clause: string): Channel[] => {
      const items: { ch: Channel; idx: number }[] = [];
      const wi = clause.search(/whats\s?app|\bwa\b/);
      const vi = clause.search(/voice|\bcall\b|calling|phone\b|ivr/);
      if (wi >= 0) items.push({ ch: "whatsapp", idx: wi });
      if (vi >= 0) items.push({ ch: "voice", idx: vi });
      items.sort((a, b) => a.idx - b.idx);
      const seq: Channel[] = [];
      for (const it of items) if (!seq.includes(it.ch)) seq.push(it.ch);
      return seq;
    };
    const HIGH = /\b(high|top|premium|vip|elite|gold|platinum|big|large)\b/;
    const LOW = /\b(low|mid|bottom|basic|standard|regular|small|budget)\b/;
    const clauses = t.split(/\band\b|[,;.]/).map((s) => s.trim()).filter(Boolean);
    const hi = clauses.find((c) => HIGH.test(c) && /whats|voice|call|phone|ivr/.test(c));
    const lo = clauses.find((c) => LOW.test(c) && /whats|voice|call|phone|ivr/.test(c));
    const hiSeq = hi ? seqFromClause(hi) : [];
    const loSeq = lo ? seqFromClause(lo) : [];
    // Any channel named only inside a branch clause still needs to be "in play".
    for (const ch of [...hiSeq, ...loSeq]) if (!detected.includes(ch)) detected.push(ch);
    // When only one arm is spelled out ("VIP get a voice call" with no explicit
    // else channel), the other arm takes the complement — the detected channels
    // not already on the named arm — so routing stays symmetric and sensible.
    if (hiSeq.length || loSeq.length) {
      const complement = (seq: Channel[]): Channel[] => detected.filter((c) => !seq.includes(c));
      branchMatchSeq = hiSeq.length ? hiSeq : complement(loSeq);
      branchElseSeq = loSeq.length ? loSeq : complement(hiSeq);
    }

    // Coarse N-way categorical detection: when the brief names ≥2 values of a
    // known categorical attribute (e.g. FCC tiers Silver/Gold/Platinum/Black),
    // build one arm per named value. Each arm's channels come from the clause
    // naming that value; a value with no channel clause defaults to the primary
    // channel. The user confirms the attribute + per-arm routes on the branch
    // card — the model never invents the structure. Supersedes the binary arms.
    let best: { id: string; hits: string[] } | undefined;
    for (const a of SPLIT_ATTRIBUTES) {
      if (a.type !== "categorical") continue;
      const hits = (a.options ?? []).filter((o) => new RegExp(`\\b${o.toLowerCase()}\\b`).test(t));
      if (hits.length >= 2 && (!best || hits.length > best.hits.length)) best = { id: a.id, hits };
    }
    if (best) {
      // Persist the detected branch attribute so the ConditionalCard opens
      // pre-selected on it (not a blank picker) and the first-draft builder can
      // fall back to it. Without this the card defaults to an empty attribute,
      // and picking a different one silently rebuilds the branch on the wrong
      // option set — reverting the analyzed N-way split.
      conditionAttribute = best.id;
      const defCh = detected[0] ?? "whatsapp";
      const taken = new Set<string>();
      // Sentence-level clauses (split on sentence/list separators only, NOT "and").
      // A single treatment often lists several tiers — "Platinum and Black get
      // WhatsApp then a voice call". The narrow clauses above split that on "and",
      // orphaning "platinum" from the channel words. So when an option's narrow
      // clause names no channel, fall back to the sentence it sits in: the shared
      // sequence then reaches EVERY named option, not just the last. The narrow
      // pass still wins first, so a differential sentence ("Silver gets WhatsApp,
      // Gold gets voice") keeps its per-tier routing.
      const sentences = t.split(/[;.\n]/).map((s) => s.trim()).filter(Boolean);
      branchArms = best.hits.map((opt) => {
        const o = opt.toLowerCase();
        const narrow = clauses.find((c) => c.includes(o));
        let seq = narrow ? seqFromClause(narrow) : [];
        if (!seq.length) {
          const sentence = sentences.find((s) => s.includes(o));
          if (sentence) seq = seqFromClause(sentence);
        }
        for (const ch of seq) if (!detected.includes(ch)) detected.push(ch);
        return { id: slugifyArm(opt, taken), label: opt, value: opt, seq: seq.length ? seq : [defCh] };
      });

      // Coarse rich-shape enrichment (Phases 2-4): scan each arm's sentence for an
      // A/B split, a post-action state gate, or a per-tier welcome cue and attach an
      // `ArmNodeSpec[]` body. Conservative: a spec is added only when its keyword
      // appears in the SAME sentence as the tier, and an arm with no rich cue keeps
      // its plain channel `seq` (byte-identical Phase 1). The user completes the
      // detail (variant names, gate outcomes, welcome templates) on the Resolve card.
      const AB_RE = /a\/b|a-b|ab test|split test|two variants|\bperks\b|\bsavings\b/;
      const anyAB = AB_RE.test(t);
      const anyEnroll = /enroll/.test(t);
      const anyUpgrade = /upgrad/.test(t);
      const anyWelcome = /welcome to\b/.test(t);
      if (anyAB || anyEnroll || anyUpgrade || anyWelcome) {
        branchArms = branchArms.map((arm) => {
          const s = sentences.find((x) => x.includes((arm.value ?? "").toLowerCase())) ?? "";
          const body: ArmNodeSpec[] = [];
          if (anyAB && AB_RE.test(s)) {
            const abCh = arm.seq[0] ?? defCh;
            body.push({ type: "abSplit", variants: detectAbVariants(s, abCh) });
            for (const ch of arm.seq.slice(1)) body.push({ type: "channel", ch });
          } else {
            for (const ch of arm.seq) body.push({ type: "channel", ch });
          }
          if (anyEnroll && /enroll/.test(s))
            body.push({ type: "gate", stateId: "enrollment", routes: [{ outcome: "Enrolled", next: "welcome", tier: arm.label }, { outcome: "Not enrolled", next: "continue" }] });
          if (anyUpgrade && /upgrad/.test(s))
            body.push({ type: "gate", stateId: "upgrade_gold", routes: [{ outcome: "Upgraded", next: "welcome", tier: "Gold" }, { outcome: "Not upgraded", next: "welcome", tier: arm.label }] });
          const hasGate = body.some((b) => b.type === "gate");
          if (!hasGate && anyWelcome && new RegExp(`welcome to\\s+${(arm.value ?? "").toLowerCase()}`).test(t))
            body.push({ type: "welcome", tier: arm.label });
          const rich = body.some((b) => b.type !== "channel");
          return rich ? { ...arm, body } : arm;
        });
      }
    }

    // ---- Leading pre-branch action (voice-led win-back shape) ------------------
    // Some journeys ACT first and branch on the result: place a voice call, then
    // route on how it resolved (Example-2's call-disposition split). Detected two
    // conservative ways: (a) an explicit opener phrase naming a channel ("start /
    // begin with a call", "place a voice call, then branch on the outcome"), or
    // (b) the branch is on `call_disposition` — a post-call outcome that by
    // definition implies an opening call. The opener channel goes on the trunk
    // (`preBranchSeq`) before the branch; the arms then route on the outcome only.
    // The user confirms/edits the opening action's template/agent on the card.
    const openerMatch =
      t.match(/\b(?:start|begin|open|kick\s?off|lead)\b[^.]{0,32}\b(?:with|by|using)\b[^.]{0,22}\b(voice|call|phone|ivr|whats\s?app|wa)\b/) ??
      t.match(/\b(?:place|make)\b[^.]{0,18}\b(voice|phone|ivr|call)\b/);
    if (openerMatch) {
      preBranchSeq = [/whats|\bwa\b/.test(openerMatch[1]) ? "whatsapp" : "voice"];
    } else if (best?.id === "call_disposition") {
      preBranchSeq = ["voice"];
    }
    if (preBranchSeq) for (const ch of preBranchSeq) if (!detected.includes(ch)) detected.push(ch);

    // ---- Numeric branch with a nested A/B on an arm (Match high / Else low) ----
    // Example-1 shape: a value/LTV branch whose HIGH arm runs an A/B split of two
    // openers before a follow-up (e.g. "reactivate vs winback", then a voice call).
    // The A/B can equally sit on the LOW arm ("in the low-LTV branch, A/B test the
    // voice agents before the call"). The "A/B" keyword was suppressed from the
    // top-level experiment detector above (branchFraming), so the split belongs to
    // the arm. Attach it as branchMatchBody / branchElseBody — the binary
    // equivalent of a categorical arm's `body` — keeping the branch a Match / Else
    // split on its numeric threshold (branchArms stays unset). Only fires when the
    // arm's own sentence names the A/B; otherwise that arm stays a plain channel
    // sequence. The user names the variants, per-variant % and each flow on the card.
    if (!branchArms && (branchMatchSeq?.length || branchElseSeq?.length)) {
      const AB_ARM_RE = /a\/b|a-b|ab test|split test|two variants|two openers|different\s+(?:agents?|openers?|templates?|messages?|creatives?|scripts?)|\bperks\b|\bsavings\b|reactivate[^.]*winback|winback[^.]*reactivate/;
      const sents = t.split(/[.\n]/).map((s) => s.trim()).filter(Boolean);
      // Build one arm's A/B body from the sentence naming that arm's tier: read the
      // arm's channels (the tier sentence plus an immediate follow-up sentence that
      // adds a channel and opens no new tier — "…openers; if they don't respond,
      // then a voice call"), then anchor the split. An A/B that tests "different
      // agents" splits the arm's VOICE step (each variant a voice agent); otherwise
      // it splits the opener channel. Remaining channels stay sequential follow-up.
      const abBodyForArm = (
        tierRe: RegExp,
        armSeqFallback: Channel[],
      ): { seq: Channel[]; body: ArmNodeSpec[] } | undefined => {
        const sent = sents.find((s) => tierRe.test(s) && AB_ARM_RE.test(s));
        if (!sent) return undefined;
        const seq = seqFromClause(sent);
        const idx = sents.indexOf(sent);
        for (let j = idx + 1; j < sents.length; j++) {
          const s = sents[j];
          if (HIGH.test(s) || LOW.test(s)) break;
          const more = seqFromClause(s);
          if (more.length) {
            for (const ch of more) if (!seq.includes(ch)) seq.push(ch);
            break;
          }
        }
        // The arm's full channel flow: its routing seq (e.g. "whatsapp followed by
        // voice") is authoritative for order, so start from it and merge in any
        // channel the A/B sentence names that the routing clause missed (the
        // Example-1 case, where the A/B sentence itself carries the channels and the
        // routing clause set no arm seq). Without this a separate A/B sentence that
        // only names "voice" would drop the arm's leading WhatsApp.
        const finalSeq: Channel[] = [...armSeqFallback];
        for (const ch of seq) if (!finalSeq.includes(ch)) finalSeq.push(ch);
        if (!finalSeq.length) return undefined;
        // "different agents" → a voice-agent A/B, so anchor on the arm's voice step;
        // otherwise split the opener channel (whatsapp openers like reactivate/winback).
        const testsVoiceAgents = /\bagents?\b/.test(sent) && finalSeq.includes("voice");
        const abCh: Channel = testsVoiceAgents ? "voice" : finalSeq[0];
        const body: ArmNodeSpec[] = finalSeq.map((ch) =>
          ch === abCh
            ? ({ type: "abSplit", variants: detectAbVariants(sent, abCh) } as ArmNodeSpec)
            : ({ type: "channel", ch } as ArmNodeSpec),
        );
        return { seq: finalSeq, body };
      };
      const hiAb = abBodyForArm(HIGH, branchMatchSeq ?? []);
      if (hiAb) {
        branchMatchSeq = hiAb.seq;
        branchMatchBody = hiAb.body;
        for (const ch of hiAb.seq) if (!detected.includes(ch)) detected.push(ch);
      }
      const loAb = abBodyForArm(LOW, branchElseSeq ?? []);
      if (loAb) {
        branchElseSeq = loAb.seq;
        branchElseBody = loAb.body;
        for (const ch of loAb.seq) if (!detected.includes(ch)) detected.push(ch);
      }
    }
  }

  if (detected.length === 0) detected.push("whatsapp");

  let primary = detected[0];
  let fallback: Channel | null = null;

  // A fallback is only assumed when the brief actually calls one out (and not in
  // an A/B test). Multiple channels with no fallback → parallel/split, not a chain.
  // Two cues count: (a) the literal "fallback" / an "if <non-delivery>" clause, and
  // (b) a natural non-response follow-up — "if they haven't responded", "on no reply",
  // "for non-responders", "if they don't pick up" — the way a lapsed-customer
  // reactivation brief actually reads. Without (b) that phrasing drops to a parallel
  // split, losing the wait + second-touch the campaign intends. Still gated by
  // !conditional (an in-arm "if they don't respond" stays a branch, not a fallback).
  const nonResponse = /non-?responders?|\b(?:no|without)\s+(?:reply|response|answer)\b|(?:haven'?t|hasn'?t|didn'?t|don'?t|doesn'?t|never|not)\s+(?:respond(?:ed|s)?|repl(?:y|ied|ies)|answer(?:ed|s)?|pick(?:ed)?\s?up|engag\w*)/;
  const mentionsFallback = /fall\s?back|if .*(?:fail|not delivered|undelivered|no reply|doesn'?t)/.test(t) || nonResponse.test(t);
  // Common shape: an A/B test on ONE channel (usually WhatsApp — "different templates
  // to each branch") plus a fallback on the OTHER channel. Detect this hybrid so the
  // fallback isn't silently dropped by the `!contentAb` gate below and so the A/B
  // variants stay same-channel (not one-per-channel).
  //
  // Explicit signal: brief mentions BOTH an A/B keyword and a fallback keyword AND
  // pins the two channels by role (either "<primary>...fallback...<secondary>" or the
  // reverse). When this fires we return a config with `contentAb.ch = primary`,
  // `contentAb.variants = 2 same-channel variants`, AND `fallback = secondary` set.
  let isContentAbWithFallback = false;
  if (contentAb && mentionsFallback && detected.length >= 2) {
    const toChannel = (s: string): Channel => (/whats/.test(s) ? "whatsapp" : "voice");
    const fbMatch =
      t.match(/(whats\s?app|voice|call)\s+fall\s?back/) ??
      t.match(/fall\s?back\s+(?:to|on|via|with|using)?\s*(whats\s?app|voice|call)/) ??
      t.match(/fall\s?back[^.]{0,30}\bdo\s+(?:a\s+)?(voice|call|whats\s?app)/) ??
      t.match(/(voice|call|whats\s?app)[^.]{0,30}\s+fall\s?back/);
    if (fbMatch) {
      fallback = toChannel(fbMatch[1]);
      primary = detected.find((c) => c !== fallback) ?? primary;
      isContentAbWithFallback = true;
    }
  }

  if (!contentAb && !conditional && mentionsFallback && detected.length >= 2) {
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
  // A/B test config: with >=2 channels seed one variant PER channel (channel A/B);
  // with a single channel seed N same-channel template variants (content A/B). The
  // user confirms names/resources/percents on the Resolve card (never invented).
  //
  // Exception: when we detected the "content A/B on primary + fallback on secondary"
  // hybrid, force SAME-channel content variants on the primary — otherwise the second
  // channel would silently become an A/B peer (channel variant) instead of a fallback.
  //
  // Also try to lift an explicit split percentage from the brief ("60:40", "70/30",
  // "70% and 30%", "80-20 split") so the A/B variants come up with the requested
  // weights instead of defaulting to 50/50.
  const splitPctMatch = t.match(/\b(\d{1,2})\s*[:/\-]\s*(\d{1,2})\b|\b(\d{1,2})\s*%\s*(?:and|vs|to|,)\s*(\d{1,2})\s*%/);
  const splitPctRaw = splitPctMatch ? Number(splitPctMatch[1] ?? splitPctMatch[3]) : NaN;
  const splitPct = Number.isFinite(splitPctRaw) && splitPctRaw > 0 && splitPctRaw < 100 ? String(splitPctRaw) : undefined;
  // For same-channel content A/B (either explicit hybrid with fallback OR a single
  // channel detected), seed variants via detectAbVariants and then apply the split %
  // if the brief supplied one — channelAbVariants only honours splitPct on a 2-way
  // multi-channel split, so we need to bolt the pcts onto detected variants ourselves.
  const applySplitPct = (vs: AbVariant[]): AbVariant[] => {
    if (!splitPct || vs.length !== 2) return vs;
    const first = Number(splitPct);
    return [
      { ...vs[0], pct: first },
      { ...vs[1], pct: 100 - first },
    ];
  };
  const contentAbCfg = contentAb
    ? {
        ch: primary,
        variants: isContentAbWithFallback
          ? applySplitPct(detectAbVariants(t, primary))
          : ordered.length >= 2
            ? channelAbVariants(ordered, splitPct)
            : applySplitPct(detectAbVariants(t, primary)),
      }
    : undefined;
  return {
    channels: ordered,
    primary,
    fallback,
    fallbackWait: "1 day",
    channelsNamed,
    ...(unavailable.length ? { unavailable } : {}),
    ...(contentAbCfg ? { contentAb: contentAbCfg } : {}),
    ...(conditional ? { conditional: true } : {}),
    ...(branchArms ? { branchArms } : {}),
    ...(branchMatchSeq && !branchArms ? { branchMatchSeq } : {}),
    ...(branchElseSeq && !branchArms ? { branchElseSeq } : {}),
    ...(branchMatchBody && !branchArms ? { branchMatchBody } : {}),
    ...(branchElseBody && !branchArms ? { branchElseBody } : {}),
    ...(preBranchSeq ? { preBranchSeq } : {}),
    ...(conditionAttribute ? { conditionAttribute } : {}),
  };
}

/** Build a brief plan from confirmed channel config. Gaps surface in the Resolve card. */
export function planFromBrief(text: string, cfg: BriefConfig): BriefPlan {
  const name = briefName(text);
  const isParallel = !cfg.conditional && !cfg.fallback && !cfg.contentAb && cfg.channels.length > 1;
  const plan = cfg.conditional
    ? buildConditionalChannels(name, cfg, {})
    : cfg.contentAb
      ? buildContentAbChannels(name, cfg, {})
      : isParallel
        ? buildParallelChannels(name, cfg, {})
        : buildFromChannels(name, cfg, {});
  const line = channelsSummary(cfg);
  const condElse = cfg.channels.find((c) => c !== cfg.primary);
  const assumptions = [
    ...(cfg.fallback ? [`Fallback wait defaulted to ${durationLabel(cfg.fallbackWait)}`] : []),
    ...(cfg.conditional
      ? [`Branch 1 defaults to ${cfg.branchMatchSeq?.length ? cfg.branchMatchSeq.map((c) => CHANNEL_META[c].label).join(" → ") : CHANNEL_META[cfg.primary].label}; Branch 2 to ${cfg.branchElseSeq?.length ? cfg.branchElseSeq.map((c) => CHANNEL_META[c].label).join(" → ") : condElse ? CHANNEL_META[condElse].label : "End"} until you set the branch rule`]
      : cfg.contentAb
        ? (() => {
            const vs = cfg.contentAb.variants;
            const chs = Array.from(new Set(vs.map((v) => v.ch)));
            return chs.length > 1
              ? [`A/B test defaulted to an even split between ${chs.map((c) => CHANNEL_META[c].label).join(" & ")} until you set each variant's resource`]
              : [`A/B test defaulted to an even split across ${vs.length} ${CHANNEL_META[chs[0] ?? cfg.contentAb.ch].label} template variants until you set the templates`];
          })()
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
      const phoneId = resolved.phoneField ?? (d.config?.phoneField as string | undefined) ?? DEFAULT_PHONE_FIELD;
      return { ...n, data: { ...d,
        subtitle: audienceSubtitle({ ...resolved, segment: seg.id, phoneField: phoneId }),
        valid: true, error: undefined,
        config: { ...d.config, phoneField: phoneId } } };
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

  // 1b. Contact number field — which audience attribute supplies the phone number
  // WhatsApp + voice dial. Always present for these channels; defaults to the
  // primary mobile, so this reports the mapping rather than blocking.
  if (channels.some((c) => c === "whatsapp" || c === "voice")) {
    const phone = findPhoneAttribute(resolved.phoneField ?? DEFAULT_PHONE_FIELD);
    checks.push(
      phone?.id === "contact.landline" && channels.includes("whatsapp")
        ? { id: "phone_field", label: "Contact number field", status: "warn", detail: `${phone.label} is voice-only — WhatsApp can't reach a landline.` }
        : { id: "phone_field", label: "Contact number field", status: "pass", detail: `${phone?.label ?? "Mobile number"} — used to reach contacts on WhatsApp & voice.` },
    );
  }

  // 2. Per-resource binding + channel compliance. Driven off the resource vars
  // (not `channels`) so each node is validated independently: the linear /
  // parallel path declares one global `waTemplate` / `voiceAgent`, the conditional
  // path one node-scoped key per arm node (`waTemplate@e_wa`, `voiceAgent@e_voice`).
  // The global keys keep their original check labels; node-scoped keys carry the
  // arm-qualified var label.
  for (const v of vars) {
    if (v.kind === "waTemplate") {
      const label = v.key === "waTemplate" ? "WhatsApp template" : v.label;
      const wa = findWaTemplate(resolved[v.key]);
      checks.push(
        !wa
          ? { id: `wa_template_${v.key}`, label, status: "block", detail: "Pick an approved WhatsApp template." }
          : wa.status === "pending_reapproval"
            ? { id: `wa_template_${v.key}`, label, status: "warn", detail: `"${wa.label}" is pending re-approval — saved as draft, won't send until approved.` }
            : { id: `wa_template_${v.key}`, label, status: "pass", detail: `"${wa.label}" approved · ${wa.category}.` },
      );
      if (wa) {
        const optinLabel = v.key === "waTemplate" ? "WhatsApp opt-in" : `${v.label} · opt-in`;
        checks.push(
          wa.category === "Marketing"
            ? { id: `wa_optin_${v.key}`, label: optinLabel, status: "warn", detail: "Marketing template — recipients must have a marketing opt-in." }
            : { id: `wa_optin_${v.key}`, label: optinLabel, status: "pass", detail: "Utility template — no marketing opt-in required." },
        );
      }
    }
    if (v.kind === "voiceAgent") {
      const label = v.key === "voiceAgent" ? "Voice agent" : v.label;
      const agent = findVoiceAgent(resolved[v.key]);
      checks.push(
        !agent
          ? { id: `voice_agent_${v.key}`, label, status: "block", detail: "Select a live voice agent." }
          : agent.status !== "live"
            ? { id: `voice_agent_${v.key}`, label, status: "warn", detail: `Agent "${agent.name}" is ${agent.status}, not live.` }
            : { id: `voice_agent_${v.key}`, label, status: "pass", detail: `"${agent.name}" is live.` },
      );
    }
  }

  // 3. Wait timing — one check per declared wait. The linear path declares a
  // single fallback wait; the conditional path declares one `armDelay@*` per
  // inter-channel gap, each labelled by its var.
  for (const durationVar of vars.filter((v) => v.kind === "duration")) {
    const raw = resolved[durationVar.key] ?? (durationVar.kind === "duration" ? durationVar.default : "");
    const { value, unit } = parseDuration(raw);
    const isFallback = durationVar.key === "fallbackWindow";
    const label = isFallback ? "Fallback wait" : durationVar.label;
    const id = `wait_${durationVar.key}`;
    checks.push(
      !raw
        ? { id, label, status: durationVar.required ? "block" : "warn", detail: isFallback ? "Set how long to wait before the fallback fires." : "Set how long to wait before the next channel." }
        : value <= 0
          ? { id, label, status: "warn", detail: isFallback ? "Fallback fires immediately — consider a longer wait." : "Next channel fires immediately — consider a longer wait." }
          : { id, label, status: "pass", detail: isFallback ? `Waits ${value} ${unit} after non-delivery before the fallback.` : `Waits ${value} ${unit} before the next channel.` },
    );
  }

  // 3b. Disposition follow-up — report the WhatsApp outcome each arm's follow-up
  // channel fires on (conditional path). Reads the resolved choice, else default.
  for (const v of vars) {
    if (v.kind !== "choice" || !v.key.startsWith("followUpOn@")) continue;
    const chosen = resolved[v.key]?.trim() || v.default;
    checks.push({ id: `followup_${v.key}`, label: v.label, status: "pass", detail: `Follows up only when WhatsApp = ${chosen}; other outcomes end the journey.` });
  }

  // 3c. Rich arm steps (conditional path) — a nested A/B split's traffic shares
  // (grouped per split node: each variant 1–99% and summing to 100), each
  // variant's plain-English post-split flow, and each state gate's per-outcome
  // routing, so the checklist mirrors the canvas.
  const abGroups = new Map<string, { armLabel: string; shares: { label: string; pct: number }[] }>();
  const abKeyRe = /^splitPct@(.+_ab\d+)_(.+)$/;
  for (const v of vars) {
    if (v.kind !== "percent") continue;
    const m = abKeyRe.exec(v.key);
    if (!m) continue;
    const raw = resolved[v.key]?.trim() || v.default;
    const p = Number(raw);
    const armLabel = v.label.split(" · ")[0];
    const variantLabel = v.label.split(" · ")[1] ?? "Variant";
    const g = abGroups.get(m[1]) ?? { armLabel, shares: [] };
    g.shares.push({ label: variantLabel, pct: Number.isFinite(p) ? p : NaN });
    abGroups.set(m[1], g);
  }
  for (const [node, g] of abGroups) {
    const sum = g.shares.reduce((s, x) => s + (Number.isNaN(x.pct) ? 0 : x.pct), 0);
    const bad = g.shares.some((x) => Number.isNaN(x.pct) || x.pct < 1 || x.pct > 99) || sum !== 100;
    const shareLabel = g.shares.map((x) => `${x.label} ${Number.isNaN(x.pct) ? "?" : x.pct}%`).join(" · ");
    checks.push(
      bad
        ? { id: `abpct_${node}`, label: `${g.armLabel} · A/B traffic split`, status: "warn", detail: `${shareLabel} (total ${sum}%). Give each variant 1–99% and make the shares total 100%.` }
        : { id: `abpct_${node}`, label: `${g.armLabel} · A/B traffic split`, status: "pass", detail: `${shareLabel} — ${g.shares.length} variants totalling 100%.` },
    );
  }
  for (const v of vars) {
    if (v.kind === "text" && v.key.startsWith("abFlow@")) {
      const txt = resolved[v.key]?.trim() || v.default;
      checks.push(
        txt
          ? { id: `abflow_${v.key}`, label: v.label, status: "pass", detail: `Post-split flow: ${txt}` }
          : { id: `abflow_${v.key}`, label: v.label, status: "block", detail: "State in plain English what happens on this variant after the split." },
      );
    }
    if (v.kind === "choice" && v.key.startsWith("gateRoute@")) {
      const chosen = resolved[v.key]?.trim() || v.default;
      const dest = chosen === "welcome" ? "a welcome message" : chosen === "end" ? "the End" : "the next step";
      checks.push({ id: `gate_${v.key}`, label: v.label, status: "pass", detail: `Routes to ${dest}.` });
    }
  }

  // 4. Channel sequence — distinct channels in priority order.
  const seqLabel = channels.map((c) => CHANNEL_META[c].label).join(" → ");
  checks.push({
    id: "sequence",
    label: "Channel sequence",
    status: "pass",
    detail: channels.length >= 2 ? `${seqLabel} — distinct channels.` : `${seqLabel || "WhatsApp"} only — no fallback.`,
  });

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
  // attribute (audience routed on an attribute). Three shapes:
  //  - N-way categorical: one route per attribute value, stored as
  //    `branchRoute@<armSlug>` (slug deterministic over `attr.options`); each arm
  //    gets its own pass/block check.
  //  - binary categorical: a single Match value (the rest take Else).
  //  - numeric: a threshold (≥ Match, below Else).
  // The routing (a channel sequence or End) is reported for confirmation.
  if (vars.some((v) => v.key === "conditionAttribute")) {
    const attr = findSplitAttribute(resolved.conditionAttribute);
    const isNway = Object.keys(resolved).some((k) => k.startsWith("branchRoute@"));
    const otherCh = channels.find((c) => c !== channels[0]);
    const matchTo = routeSeqLabel(resolved.branchMatch, channels[0] ? CHANNEL_META[channels[0]].label : "Branch 1");
    const elseTo = routeSeqLabel(resolved.branchElse, otherCh ? CHANNEL_META[otherCh].label : "End");
    if (!attr) {
      checks.push({ id: "condition", label: "Conditional branch", status: "block", detail: "Pick an attribute to branch the audience on." });
    } else if (attr.type === "categorical" && isNway) {
      // Reconstruct arm slugs from the attribute's options (same order +
      // de-collision the card / builder used) and report each arm's route.
      const taken = new Set<string>();
      for (const opt of attr.options ?? []) {
        const slug = slugifyArm(opt, taken);
        const route = resolved[`branchRoute@${slug}`];
        checks.push(
          !route
            ? { id: `condition_${slug}`, label: `Branch · ${opt}`, status: "block", detail: `Set where ${attr.label} = ${opt} routes.` }
            : { id: `condition_${slug}`, label: `Branch · ${opt}`, status: "pass", detail: `${attr.label} = ${opt} → ${routeSeqLabel(route, "End")}.` },
        );
      }
    } else if (attr.type === "categorical") {
      const val = resolved.conditionValue;
      checks.push(
        !val
          ? { id: "condition", label: "Conditional branch", status: "block", detail: `Pick which ${attr.label.toLowerCase()} takes Branch 1.` }
          : { id: "condition", label: "Conditional branch", status: "pass", detail: `${attr.label} = ${val} → ${matchTo}; everyone else → ${elseTo}.` },
      );
    } else {
      const thr = resolved.conditionThreshold;
      checks.push(
        !thr || Number.isNaN(Number(thr))
          ? { id: "condition", label: "Conditional branch", status: "block", detail: "Set a numeric threshold for Branch 1." }
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
