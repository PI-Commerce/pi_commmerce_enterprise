/**
 * Node kind registry — the single source of truth Pi (and the construct
 * validator, Phase B) reads from.
 *
 * Every `NodeKind` from `campaign-types.ts` gets exactly one entry here.
 * The entry captures what a marketer needs to know to wire it correctly:
 *
 *   - `label` and `purpose` — human framing. `purpose` is what Pi cites when
 *     explaining what a node does. Kept one line, unambiguous, no jargon.
 *   - `group` — mirrors `NODE_GROUPS` in campaign-types.
 *   - `requires` — config keys that MUST be set for the node to be valid
 *     (validity computation, Phase E).
 *   - `emits` — the branch labels a node can produce. Static for kinds with
 *     fixed branches (WA Template = ["reply", "button:*", "timeout",
 *     "failure"]), dynamic for kinds where the user defines them
 *     (Conditional = configured branches + "default").
 *   - `placementRules` — hard rules that constrain WHERE this node can sit.
 *     Currently only `whatsappFreeform` uses this. See the field docstring.
 *   - `undeletable` — true for the three canonical blank-canvas nodes.
 *   - `layoutRole` — "start" / "end" / "standard". Drives which edge slots
 *     are exposed and whether the validator collapses duplicates.
 *   - `allowedForBuilder` — whether Ask Pi's builder scope is allowed to
 *     insert this kind. Some kinds (aiTransform, abSplit) are power-user
 *     surfaces that Pi should not reach for on its own; the user can still
 *     add them by hand from the node palette.
 *
 * Note on `voiceCall`: the kind is `voiceCall` in the DSL enum but the
 * user-facing label is "Voice Call". Old prompts have referred to this as
 * just "voice", causing Pi to invent a `voice` kind that doesn't exist and
 * fall back to `aiTransform` (which is what "AI Transformation" is). Pi's
 * system prompt now cites the enum values directly to close that loophole.
 */
import type { NodeKind, NodeGroup } from "@/lib/campaign-types";

/** A branch label a node emits. Static entries render as-is; dynamic ones
 *  are placeholders for user-configured labels. */
export type EmittedBranch =
  | { kind: "static"; id: string; label: string; hint?: string }
  | { kind: "dynamic"; source: "conditional.branches" | "voice.dispositions" | "wa.buttons" | "wa.replies"; hint: string };

/** A placement constraint. Enforced by the construct validator (Phase B). */
export type PlacementRule =
  | { kind: "onlyAfterEngagedWaTemplate"; note: string }
  | { kind: "onlyOneInstance"; note: string };

export type NodeRegistryEntry = {
  kind: NodeKind;
  label: string;
  group: NodeGroup;
  purpose: string;
  requires: string[];
  emits: EmittedBranch[];
  placementRules?: PlacementRule[];
  undeletable: boolean;
  layoutRole: "start" | "end" | "standard";
  allowedForBuilder: boolean;
};

export const NODE_REGISTRY: Record<NodeKind, NodeRegistryEntry> = {
  start: {
    kind: "start",
    label: "Start",
    group: "system",
    purpose: "Entry point of every campaign run. Wired to Audience by default. Pre-exists on every blank canvas and cannot be inserted or deleted.",
    requires: [],
    emits: [{ kind: "static", id: "default", label: "default" }],
    placementRules: [{ kind: "onlyOneInstance", note: "Exactly one Start per campaign." }],
    undeletable: true,
    layoutRole: "start",
    allowedForBuilder: false,
  },
  end: {
    kind: "end",
    label: "End",
    group: "system",
    purpose: "Terminal node. Every branch converges here. Pre-exists on every blank canvas and cannot be inserted or deleted.",
    requires: [],
    emits: [],
    placementRules: [{ kind: "onlyOneInstance", note: "Exactly one End per campaign — every branch must reach it." }],
    undeletable: true,
    layoutRole: "end",
    allowedForBuilder: false,
  },
  audience: {
    kind: "audience",
    label: "Audience",
    group: "data",
    purpose: "Defines the input schema for the campaign — the list of keys downstream nodes can reference. At run time, each CSV upload or API call must supply every key defined here. Pre-exists on every blank canvas.",
    requires: ["fields", "phoneField"],
    emits: [{ kind: "static", id: "default", label: "default" }],
    placementRules: [{ kind: "onlyOneInstance", note: "Exactly one Audience per campaign, immediately after Start." }],
    undeletable: true,
    layoutRole: "standard",
    allowedForBuilder: false,
  },
  conditional: {
    kind: "conditional",
    label: "Conditional Branch",
    group: "logic",
    purpose: "Splits the flow on lead attributes. Configure one or more branches (each with AND/OR conditions on Audience fields or upstream node outputs) plus a default branch that catches anything unmatched.",
    requires: ["branches"],
    emits: [
      { kind: "dynamic", source: "conditional.branches", hint: "One per user-configured branch." },
      { kind: "static", id: "default", label: "default", hint: "Catch-all for leads that match no configured branch." },
    ],
    undeletable: false,
    layoutRole: "standard",
    allowedForBuilder: true,
  },
  abSplit: {
    kind: "abSplit",
    label: "A/B Split",
    group: "logic",
    purpose: "Splits the flow by percentage into named variants for experimentation (e.g. 60/40 template split, 50/50 timing split). Use when the user wants to compare variants of the SAME channel or timing — not for logical routing (that's `conditional`).",
    requires: ["splitVariants"],
    emits: [
      { kind: "dynamic", source: "conditional.branches", hint: "One per configured A/B variant." },
    ],
    undeletable: false,
    layoutRole: "standard",
    allowedForBuilder: true,
  },
  delay: {
    kind: "delay",
    label: "Delay",
    group: "logic",
    purpose: "Waits before continuing. Two modes: Static (a fixed duration) or Dynamic (waits until a datetime pulled from an upstream variable — e.g. a Voice Call's `callBackTime` disposition). Can be placed anywhere in the flow.",
    requires: ["delayMode"],
    emits: [{ kind: "static", id: "default", label: "default" }],
    undeletable: false,
    layoutRole: "standard",
    allowedForBuilder: true,
  },
  voiceCall: {
    kind: "voiceCall",
    label: "Voice Call",
    group: "action",
    purpose: "Places an outbound voice call through a pre-configured voice agent. The agent's dispositions (whatever the agent's post-call variables define) become branches — one output per disposition. Pi picks the agent from the workspace's voice-agent catalog; it never authors agents.",
    requires: ["agent"],
    emits: [
      { kind: "dynamic", source: "voice.dispositions", hint: "One per agent-defined disposition (e.g. `interested`, `no_pickup`, `callback_requested`)." },
    ],
    undeletable: false,
    layoutRole: "standard",
    allowedForBuilder: true,
  },
  whatsapp: {
    kind: "whatsapp",
    label: "WhatsApp Template",
    group: "action",
    purpose: "Sends a WhatsApp Business template message. Pi picks the template from the workspace's approved WA template catalog. The template's trackable buttons (`btn_*`) and any text-reply patterns become 'engaged' branches; delivery timeout and hard failure are their own branches.",
    requires: ["waTemplate"],
    emits: [
      { kind: "dynamic", source: "wa.buttons", hint: "One per trackable button on the template." },
      { kind: "dynamic", source: "wa.replies", hint: "One per configured text-reply pattern (engaged)." },
      { kind: "static", id: "timeout", label: "timeout", hint: "No engagement within the configured wait window." },
      { kind: "static", id: "failure", label: "failure", hint: "Delivery failed at Meta / carrier." },
    ],
    undeletable: false,
    layoutRole: "standard",
    allowedForBuilder: true,
  },
  whatsappFreeform: {
    kind: "whatsappFreeform",
    label: "WhatsApp Freeform Workflow",
    group: "action",
    purpose: "Runs a freeform WhatsApp conversation flow (a pre-built micro-workflow) inside the 24-hour Meta freeform window. Session ends on completion, absolute-timer, or inactivity-timer — whichever fires first.",
    requires: ["ffWorkflowId"],
    emits: [{ kind: "static", id: "default", label: "default" }],
    placementRules: [
      {
        kind: "onlyAfterEngagedWaTemplate",
        note: "Freeform can only follow an ENGAGED branch of a WhatsApp Template node — meaning a trackable-button branch (`btn_*`) or a text-reply branch. Placing it after `timeout` / `failure` / anything else violates Meta's 24-hour rule.",
      },
    ],
    undeletable: false,
    layoutRole: "standard",
    allowedForBuilder: true,
  },
  sms: {
    kind: "sms",
    label: "SMS",
    group: "action",
    purpose: "Sends a DLT-registered SMS. Pi picks the template from the workspace's SMS template catalog. Delivery timeout and hard failure are their own branches.",
    requires: ["smsTemplateId"],
    emits: [
      { kind: "static", id: "default", label: "delivered", hint: "DLR came back before the timeout window." },
      { kind: "static", id: "timeout", label: "timeout", hint: "No DLR within the wait window." },
      { kind: "static", id: "failure", label: "failure", hint: "Delivery failed at DLT / carrier." },
    ],
    undeletable: false,
    layoutRole: "standard",
    allowedForBuilder: true,
  },
  rcs: {
    kind: "rcs",
    label: "RCS",
    group: "action",
    purpose: "Sends an RCS message via a registered agent. Pi picks the template from the workspace's RCS template catalog.",
    requires: ["rcsTemplateId"],
    emits: [
      { kind: "static", id: "default", label: "delivered" },
      { kind: "static", id: "timeout", label: "timeout" },
      { kind: "static", id: "failure", label: "failure" },
    ],
    undeletable: false,
    layoutRole: "standard",
    allowedForBuilder: true,
  },
  apiToolCall: {
    kind: "apiToolCall",
    label: "API Tool Call",
    group: "data",
    purpose: "Calls an external API tool from the workspace tool registry. Maps upstream variables into the tool's inputs; the tool's outputs become variables available downstream. Useful for checking payment status, fetching profile data, etc.",
    requires: ["apiTool"],
    emits: [{ kind: "static", id: "default", label: "default" }],
    undeletable: false,
    layoutRole: "standard",
    allowedForBuilder: true,
  },
  aiTransform: {
    kind: "aiTransform",
    label: "AI Transformation",
    group: "ai",
    purpose: "Runs a per-lead AI transformation on an existing variable (translate a name to Hindi, format a phone number, parse a number, run a custom prompt on a string). ONLY use when the user needs to derive a NEW variable from an existing one before a downstream node consumes it. NEVER use as a stand-in for voice calling (that's `voiceCall`), for messaging (that's `whatsapp` / `sms` / `rcs`), or for asset authoring.",
    requires: ["transforms"],
    emits: [{ kind: "static", id: "default", label: "default" }],
    undeletable: false,
    layoutRole: "standard",
    allowedForBuilder: true,
  },
};

/** The exact kinds Pi is allowed to `insert_node` with. Anything else must
 *  be added by the user via the palette. */
export const BUILDER_ALLOWED_KINDS: NodeKind[] = (Object.values(NODE_REGISTRY) as NodeRegistryEntry[])
  .filter((e) => e.allowedForBuilder)
  .map((e) => e.kind);

/** The three kinds that pre-exist on every blank canvas and cannot be
 *  inserted or deleted by Pi (or by the user). */
export const CANONICAL_UNDELETABLE_KINDS: NodeKind[] = (Object.values(NODE_REGISTRY) as NodeRegistryEntry[])
  .filter((e) => e.undeletable)
  .map((e) => e.kind);

/**
 * Compact summary of the registry — one line per kind — for injection into
 * Pi's context. Full registry is too verbose; this keeps the prompt cheap.
 */
export function summarizeRegistryForContext(kinds: NodeKind[] = BUILDER_ALLOWED_KINDS): Array<{
  kind: NodeKind;
  label: string;
  purpose: string;
  requires: string[];
  emits: string[];
  placement?: string;
}> {
  return kinds.map((k) => {
    const e = NODE_REGISTRY[k];
    return {
      kind: e.kind,
      label: e.label,
      purpose: e.purpose,
      requires: e.requires,
      emits: e.emits.map((b) => (b.kind === "static" ? b.label : `${b.source} (${b.hint})`)),
      ...(e.placementRules?.length ? { placement: e.placementRules.map((r) => r.note).join(" ") } : {}),
    };
  });
}
