/**
 * AI Transformation type registry.
 *
 * Each entry describes one transformation type — the human label, the one-line
 * explanation shown on the info-button popover, a mono example, and the list
 * of *type-specific* fields the config sub-form should render. Input variable
 * and Output variable name are always required and rendered separately by the
 * host component, so they don't appear in `fields` here.
 *
 * To add a new transformation type, add an entry to `TRANSFORMATIONS` (order
 * drives the picker order) and — if it uses a new field kind — add a matching
 * renderer branch in the ConfigPanel's per-type sub-form.
 */

import type { PresetTransform } from "./campaign-types";

export type TransformFieldKind =
  | "inputLang"
  | "outputLang"
  | "outputCurrency"
  | "phoneFormat"
  | "dateFormat"
  | "prompt"
  | "outputType";

export type TransformationMeta = {
  type: string;
  description: string;
  example: string;
  /** Type-specific fields, in render order. Input/Output variable are host-level. */
  fields: TransformFieldKind[];
};

export const TRANSFORMATIONS: TransformationMeta[] = [
  {
    type: "Custom AI Action",
    description: "Run any custom AI instruction over an input variable. Use for classification, extraction, or freeform reasoning.",
    example: "prompt → typed variable",
    fields: ["prompt", "outputType"],
  },
  {
    type: "Translate",
    description: "Translate a text variable from one language to another, preserving meaning.",
    example: "Hello → नमस्ते",
    fields: ["inputLang", "outputLang"],
  },
  {
    type: "Transliterate",
    description: "Rewrite a text variable in another script without translating the meaning.",
    example: "Hello → हेलो",
    fields: ["inputLang", "outputLang"],
  },
  {
    type: "Numerical Transcription",
    description: "Spell out a number in words in the chosen language.",
    example: "420 → Four Hundred Twenty",
    fields: ["outputLang"],
  },
  {
    type: "Numerical Parsing",
    description: "Extract a numeric value from words written in the chosen language.",
    example: "Four Hundred Twenty → 420",
    fields: ["inputLang"],
  },
  {
    type: "Currency Transcription",
    description: "Spell out a monetary value in words, in the chosen currency and language.",
    example: "420 → Rupees Four Hundred Twenty",
    fields: ["outputCurrency", "outputLang"],
  },
  {
    type: "Currency Formatting",
    description: "Format a numeric value as a currency string with the correct symbol and separators.",
    example: "420 → ₹420",
    fields: ["outputCurrency"],
  },
  {
    type: "Phone Number Normalization",
    description: "Normalize a phone number to either the E.164 international format or a 10-digit domestic format.",
    example: "9897635254 → +919897635254",
    fields: ["phoneFormat"],
  },
  {
    type: "Date Formatting",
    description: "Reformat a date variable using a chosen output pattern and language.",
    example: "10/01/2025 → 10 January 2025",
    fields: ["outputLang", "dateFormat"],
  },
];

export const TRANSFORMATION_TYPES: string[] = TRANSFORMATIONS.map((t) => t.type);

export function metaFor(type: string): TransformationMeta | undefined {
  return TRANSFORMATIONS.find((t) => t.type === type);
}

/* -------------------------------------------------------------------------- *
 *  Enum options for the pickers
 * -------------------------------------------------------------------------- */

export const LANGUAGES: string[] = [
  "English", "Hindi", "Marathi", "Tamil", "Telugu", "Bengali", "Kannada", "Gujarati", "Punjabi", "Urdu",
];

export const CURRENCIES: string[] = [
  "INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "JPY",
];

export const PHONE_FORMATS: Array<{ value: "E164" | "domestic"; label: string }> = [
  { value: "E164",     label: "International (E.164) — +91XXXXXXXXXX" },
  { value: "domestic", label: "Domestic — 10-digit" },
];

/** Preset date formats — pick one from the list or type a custom pattern. */
export const DATE_FORMATS: string[] = [
  "10 January 2025",
  "10 Jan 2025",
  "Jan 10, 2025",
  "10/01/2025",
  "2025-01-10",
  "Friday, 10 January 2025",
  "Custom…",
];

export const OUTPUT_TYPES: Array<"Boolean" | "String" | "Multi-select" | "Date & Time"> = [
  "String", "Boolean", "Multi-select", "Date & Time",
];

/* -------------------------------------------------------------------------- *
 *  Validation
 * -------------------------------------------------------------------------- */

/** Returns a human-readable error string if the transform is misconfigured,
 *  else `undefined`. Custom AI Action needs BOTH input + prompt; every other
 *  type needs at least an input + output name. */
export function transformError(t: PresetTransform): string | undefined {
  if (!t.output?.trim()) return "Output variable name required";
  if (!t.input?.trim())  return "Input variable required";
  if (t.type === "Custom AI Action" && !t.prompt?.trim()) return "Prompt required";
  return undefined;
}

/** Aggregate — returns the first error encountered across the whole list, or
 *  `undefined` if every transform is valid. Zero transforms is valid. */
export function transformsError(list: PresetTransform[]): string | undefined {
  for (let i = 0; i < list.length; i++) {
    const err = transformError(list[i]);
    if (err) return `#${i + 1} ${list[i].type}: ${err}`;
  }
  return undefined;
}

/* -------------------------------------------------------------------------- *
 *  Prompt serialization helpers (Custom AI Action)
 *
 *  Stored form is a plain string with `{{variable.key}}` placeholders. The
 *  PromptEditor component parses/serializes between this and its own token
 *  stream (text runs + variable chips).
 * -------------------------------------------------------------------------- */

export type PromptToken =
  | { kind: "text"; value: string }
  | { kind: "var"; name: string };

const VAR_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function parsePrompt(source: string): PromptToken[] {
  const out: PromptToken[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(source))) {
    if (m.index > last) out.push({ kind: "text", value: source.slice(last, m.index) });
    out.push({ kind: "var", name: m[1] });
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push({ kind: "text", value: source.slice(last) });
  return out;
}

export function serializePrompt(tokens: PromptToken[]): string {
  return tokens.map((t) => (t.kind === "text" ? t.value : `{{${t.name}}}`)).join("");
}

/** True if `variableKey` appears as a `{{variableKey}}` reference in `source`. */
export function promptReferences(source: string, variableKey: string): boolean {
  if (!source || !variableKey) return false;
  const tokens = parsePrompt(source);
  return tokens.some((t) => t.kind === "var" && t.name === variableKey);
}
