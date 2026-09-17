/**
 * AI Transformation node — v1 launch.
 *
 * Simplified to a single transformation type: **Custom AI Action**. Earlier
 * spec iterations enumerated 9 pre-built transformation types (Translate,
 * Transliterate, Numerical Parsing, etc.); those are deferred until the
 * runtime side is built. For now, every AI Transformation runs a user-authored
 * prompt over conversation context from an upstream Voice / WhatsApp node
 * and emits ONE typed variable downstream.
 *
 * Contract per transform:
 *   - `prompt`  — required. The user's instruction. Can reference upstream
 *                 nodes via `{{voice_1}}` / `{{whatsapp_2}}` chips inserted
 *                 through the {@link PromptEditor}. A chip is a NODE handle:
 *                 the runtime substitutes the full conversation context
 *                 (transcript for Voice, chat history for WhatsApp) plus that
 *                 node's post-call / delivery eval variables.
 *   - `output`  — required. Downstream variable name. Sanitized to
 *                 `[a-z0-9_]` on input (see {@link sanitizeOutputName}).
 *   - `label`   — optional per-instance display name for the collapsed row.
 *
 * Everything else on {@link PresetTransform} (input, inputLang, outputLang,
 * outputCurrency, phoneFormat, dateFormat, outputType, multiSelectOptions) is
 * legacy — kept on the type union for backward compatibility with preset data
 * authored under the previous 9-type spec, but the v1 editor never reads or
 * writes them.
 */

import type { PresetTransform } from "./campaign-types";

/** The one transformation type v1 supports. Kept as a named constant so
 *  every new-transform seed uses the same value. */
export const CUSTOM_AI_ACTION = "Custom AI Action" as const;

/* -------------------------------------------------------------------------- *
 *  Validation
 * -------------------------------------------------------------------------- */

/** Returns a human-readable error string if the transform is misconfigured,
 *  else `undefined`. v1: only `prompt` + `output` are required. */
export function transformError(t: PresetTransform): string | undefined {
  if (!t.output?.trim()) return "Output variable name required";
  if (!t.prompt?.trim()) return "Prompt required";
  return undefined;
}

/** Aggregate — returns the first error encountered across the whole list, or
 *  `undefined` if every transform is valid. Zero transforms is valid. */
export function transformsError(list: PresetTransform[]): string | undefined {
  for (let i = 0; i < list.length; i++) {
    const err = transformError(list[i]);
    if (err) return `#${i + 1}: ${err}`;
  }
  return undefined;
}

/**
 * Sanitize a user-typed output variable name to `[a-z0-9_]`.
 *  - Uppercase → lowercase
 *  - Spaces / dashes → underscore
 *  - Any other character dropped
 *  - Leading digits stripped (variable names can't start with a digit)
 *
 * Applied on every keystroke in the field so the user never sees an invalid
 * name they'd have to correct later.
 */
export function sanitizeOutputName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^\d+/, "");
}

/* -------------------------------------------------------------------------- *
 *  Prompt serialization helpers
 *
 *  Stored form is a plain string with `{{node_serial}}` chips (e.g. `{{voice_1}}`,
 *  `{{whatsapp_2}}`). The PromptEditor component parses/serializes between
 *  this and its own token stream (text runs + variable chips).
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

/**
 * From the flat variables list contributed by upstream nodes (namespaced keys
 * like `voice_1.call_status`, `whatsapp_2.reply_received`, `contact.phone`),
 * return the unique **Voice/WhatsApp node serials** — one per upstream node —
 * so the prompt editor picker shows only those chips. Everything else is
 * hidden: contact fields, tool outputs, delay variables, etc. are all
 * uninteresting to an AI Transformation's prompt.
 *
 * Example: given `[{key:"voice_1.call_status"}, {key:"voice_1.callback_time"},
 * {key:"whatsapp_2.button"}, {key:"contact.phone"}]`, returns
 * `[{key:"voice_1", source:"Voice · voice_1"}, {key:"whatsapp_2", source:"WhatsApp · whatsapp_2"}]`.
 */
export function conversationContextVariables(
  vars: { key: string; source: string }[],
): { key: string; source: string }[] {
  const seen = new Map<string, string>();
  for (const v of vars) {
    const m = v.key.match(/^(voice_\d+|whatsapp_\d+)\./);
    if (!m) continue;
    const ns = m[1];
    if (seen.has(ns)) continue;
    const kindLabel = ns.startsWith("voice_") ? "Voice" : "WhatsApp";
    seen.set(ns, `${kindLabel} · ${ns}`);
  }
  return [...seen.entries()].map(([key, source]) => ({ key, source }));
}
