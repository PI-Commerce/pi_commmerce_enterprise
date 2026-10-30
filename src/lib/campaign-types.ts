/**
 * Campaign DSL — frontend representation of execution primitives.
 * Designed to translate cleanly into a future Temporal-style runtime.
 */

export type NodeGroup = "system" | "data" | "logic" | "action" | "ai" | "ads";

/**
 * Every primitive either surface can place. Campaigns and inbound entry points
 * share one union rather than two, so `ConditionalFields`, the node renderer and
 * the variable plumbing work unchanged on both. Which kinds a given canvas
 * *offers* is a palette concern — see `NodePalette`'s `sections` prop.
 */
export type NodeKind =
  // system
  | "start"
  | "end"
  /** Inbound only: the arrival. Exactly one per entry-point graph, non-deletable. */
  | "inboundTrigger"
  // data
  | "audience"
  | "apiToolCall"
  /**
   * An outbound HTTP call the journey *waits on*.
   *
   * Distinct from `apiToolCall`, which invokes a tool registered under Integrations
   * with its schema, auth and outputs already defined. This one is authored inline —
   * a URL, a method, optional headers — for the one-off call a journey needs and
   * nobody wants to register first.
   *
   * The waiting is the point. A lead sits at this node until the response arrives or
   * the timeout fires, and the status code then decides which branch it leaves by, so
   * a slow endpoint stalls the journey rather than letting it run on with no answer.
   */
  | "webhook"
  // logic
  | "conditional"
  | "abSplit"
  | "delay"
  // action
  | "voiceCall"
  | "whatsapp"
  | "whatsappFreeform"
  | "sms"
  | "rcs"
  /** Inbound only: hands the arrival to an agent. Terminal — see `inbound-graph.ts`. */
  | "agentSession"
  /**
   * Inbound only: hands the live session to a human operator. Terminal.
   *
   * Distinct from `needsReview`, which flags a *lead* for later attention on a
   * campaign. This hands over a conversation that is happening now, to a queue, with
   * the session staying Pending until a person closes it.
   */
  | "assignHuman"
  // ai
  | "aiTransform"
  // ads
  | "adsCampaign"
  // human handoff — terminal node; every lead reaching it is flagged
  // "Human Escalation" and exits the flow to End (auto-wired on drop).
  | "needsReview";

export type NodeRunState = "idle" | "running" | "success" | "failed";

/**
 * A campaign's own status is config-only — `draft` (configuration incomplete) or
 * `ready` (run-ready). Liveness lives on Runs, not the campaign: a campaign can have
 * any number of associated runs in flight, but its status never becomes "running".
 * The campaign table surfaces the associated-run count so editing risk is visible.
 */
export type CampaignStatus =
  | "draft"
  | "ready";

export type RetryPolicy = { maxRetries: number; backoffSeconds: number };

/** A labeled output port on a node — rendered as its own source handle on the canvas. */
export type NodeOutputKind = "branch" | "variant" | "outcome" | "default";
export type NodeOutput = { id: string; label: string; kind: NodeOutputKind };

/**
 * Pre-filled configuration for preset/example campaign nodes.
 *
 * When a node is marked `preset`, the config panel renders the *real* interactive
 * editor for that node kind — exactly as a user would see it — but in read-only
 * mode, hydrated from these values. Every field is optional; each sub-component
 * falls back to its own built-in demo default when a key is absent. This is how an
 * example node "looks fully configured" without a bespoke summary card.
 */
export type PresetSchemaField = { id: string; name: string; type: "String" | "Number" | "Boolean" };
/** A single comparison inside a Conditional branch. */
export type PresetCondition = { variable: string; op: string; value: string; value2?: string };
/**
 * A Conditional branch. New shape carries a list of {@link PresetCondition}s joined by
 * `logic` (AND/OR). Legacy authored data used the flat single-condition fields
 * (`variable`/`op`/`value`); both are accepted and normalized via {@link branchConditions}.
 */
export type PresetBranch = {
  id: string;
  label: string;
  logic?: "AND" | "OR";
  conditions?: PresetCondition[];
  // ---- legacy single-condition shape (pre-AND/OR) ----
  variable?: string;
  op?: string;
  value?: string;
  value2?: string;
};
/** Normalize a branch (new or legacy) to its list of conditions. */
export function branchConditions(b: PresetBranch): PresetCondition[] {
  if (b.conditions && b.conditions.length) return b.conditions;
  if (b.variable != null || b.op != null || b.value != null) {
    return [{ variable: b.variable ?? "", op: b.op ?? "", value: b.value ?? "", value2: b.value2 }];
  }
  return [];
}
export type PresetSplitVariant = { id: string; label: string; pct: number };
/**
 * A single AI Transformation on an AI Transformation node.
 *
 * The type field decides which subset of the optional keys is meaningful:
 *  - `Custom AI Action`          → `prompt` + `outputType` (input + prompt required)
 *  - `Translate` / `Transliterate` → `inputLang` + `outputLang`
 *  - `Numerical Parsing`         → `inputLang`
 *  - `Numerical Transcription`   → `outputLang`
 *  - `Currency Formatting`       → `outputCurrency`
 *  - `Currency Transcription`    → `outputCurrency` + `outputLang`
 *  - `Phone Number Normalization` → `phoneFormat`
 *  - `Date Formatting`           → `dateFormat` + `outputLang`
 *
 * `label` is a per-instance display name (rename in the collapsed header).
 * `input` + `output` are always meaningful; every type reads one variable and
 * writes one downstream variable.
 */
export type PresetTransform = {
  id: string;
  type: string;
  input: string;
  output: string;
  /** Per-instance rename shown in the collapsed row header. Optional. */
  label?: string;

  // Language-aware types
  inputLang?: string;
  outputLang?: string;

  // Currency
  outputCurrency?: string;

  // Format enums
  phoneFormat?: "E164" | "domestic";
  /** Preset date-format token or user-entered custom pattern. */
  dateFormat?: string;

  // Custom AI Action
  prompt?: string;
  outputType?: "Boolean" | "String" | "Multi-select" | "Date & Time";
  /** For `Multi-select` outputType — comma-separated candidate values. */
  multiSelectOptions?: string;
};
/** A value-remap row: rewrite an incoming label (`from`) to an outgoing code (`to`)
 *  at the consuming node — e.g. a WhatsApp button label `Delhi` → API code `ind_delhi`. */
export type PresetValueRemap = { from: string; to: string };
/**
 * A mapping row. `def` holds either an upstream variable key (`mode: "variable"`, default)
 * or a hardcoded literal (`mode: "constant"`). Absent `mode` = `"variable"` (back-compat).
 * `remap` (optional) is a label→code lookup applied to the resolved variable value before
 * it is sent — human labels flow untouched through conditionals; the transform lives here.
 */
export type PresetVarMap = { v: string; def: string; mode?: "variable" | "constant"; remap?: PresetValueRemap[] };

export type PresetConfig = {
  // ---- Audience ----
  audienceMode?: "csv" | "api";
  // CSV
  fileName?: string;
  primaryKey?: string;
  phoneCol?: string;
  csvKeys?: string[];
  csvPreview?: string[][];
  rowCount?: string;
  // Runtime API
  payloadType?: "single" | "list" | "csv";
  fields?: PresetSchemaField[];
  phoneField?: string;
  // ---- Conditional ----
  branches?: PresetBranch[];
  // ---- A/B Split (logic node) ----
  splitVariants?: PresetSplitVariant[];
  // ---- Action shell (voice / whatsapp / sms) ----
  transforms?: PresetTransform[];
  abEnabled?: boolean;
  abVariants?: PresetSplitVariant[];
  // ---- Voice Call core ----
  agent?: string;
  voiceVarMap?: PresetVarMap[];
  /** Maps each tool campaign-input slot (`v` = "tool.param") to a CSV/audience column (`def`). */
  toolInputMap?: PresetVarMap[];
  callStart?: string;
  callEnd?: string;
  timezone?: string;
  maxAttempts?: number;
  retryInterval?: string;
  // ---- WhatsApp core ----
  waNumber?: string;
  waMode?: "template" | "freeform";
  /** A {@link WaTemplate} id or name from the template registry. Unresolved values fall back to a no-button (Type 1) node. */
  waTemplate?: string;
  waVarMap?: PresetVarMap[];
  /** Header variables, separate from body `waVarMap`. May share variable names with the body. */
  waHeaderVarMap?: PresetVarMap[];
  /**
   * URL to the media file for templates whose header is IMAGE / VIDEO / DOCUMENT.
   * `def` holds either an upstream key (per-lead URL column) or a hardcoded literal.
   * The upload-and-mediaID path (Meta's other option) isn't wired yet — only URL.
   */
  waMediaUrl?: PresetVarMap;
  waBody?: string;
  /** Whole hours (1–24) the node waits for a reply before taking the "Timeout" path. */
  waTimeoutHours?: number;
  // ---- WhatsApp Freeform Workflow core ----
  /** Selected Freeform Workflow id (only "ready"-state workflows are pickable). */
  ffWorkflowId?: string;
  /** Maps each `{{var}}` in the selected workflow to an upstream variable or literal. */
  ffVarMap?: PresetVarMap[];
  /** Session-close mode: `absolute` runs the timer from freeform-entry; `inactivity`
   *  runs it from the lead's last interaction. Whichever fires (or reaching End)
   *  first, the lead exits back to the campaign. Only one mode can be active. */
  ffTimerMode?: "absolute" | "inactivity";
  /** Timer duration in minutes. Capped at 1440 (Meta's 24-hour freeform window). */
  ffTimerMinutes?: number;
  // ---- SMS core ----
  /** DLT Template ID from the SMS registry — the node's primary selection. */
  smsTemplateId?: string;
  /** Maps each named `{{var}}` in the template body to a variable or constant. */
  smsVarMap?: PresetVarMap[];
  /** How long the node waits for a DLR before taking the "Timeout" path. */
  smsDlrWindow?: string;
  /** Template category + sender, derived from the selected template. Persisted so
   *  the canvas/analytics can label the node without re-resolving the registry. */
  smsCategory?: string;
  senderId?: string;
  peId?: string;
  /** Legacy free-text config, kept so pre-registry preset data still renders. */
  smsType?: string;
  smsFormat?: string;
  smsBody?: string;
  // ---- RCS core ----
  /** RCS Template id from the registry — the node's primary selection. */
  rcsTemplateId?: string;
  /** Maps each named `{{var}}` in the template to a variable or constant. */
  rcsVarMap?: PresetVarMap[];
  /** How long the node waits for a DLR before taking the "Timeout" path. */
  rcsDlrWindow?: string;
  /** Agent id + type, derived from the selected template. Persisted so the
   *  canvas/analytics can label the node without re-resolving the registry. */
  rcsAgentId?: string;
  rcsAgentType?: string;
  // ---- Delay ----
  /** Delay v2. Two modes, surfaced as "Static delay" / "Dynamic delay" in the UI:
   *  - `fixed`    → wait a fixed value+unit (Static delay).
   *  - `variable` → wait UNTIL the datetime in `delayVariable` (Dynamic delay). */
  delayMode?: "fixed" | "variable";
  delayValue?: number;
  delayUnit?: "Minutes" | "Hours" | "Days";
  /** For `delayMode: "variable"` — the upstream variable holding the target datetime. */
  delayVariable?: string;
  /** For `delayMode: "variable"` — how to parse the incoming datetime string.
   *  A preset label from `DELAY_VAR_FORMATS` (defined in ConfigPanel) or a
   *  user-entered custom pattern. Defaults to ISO 8601 when unset. */
  delayVariableFormat?: string;
  /** For `delayMode: "variable"` — fallback wait duration used when the
   *  datetime variable is missing, empty, or unparseable at runtime. Required
   *  in Dynamic mode; the pair {@link delayFallbackValue} + {@link delayFallbackUnit}
   *  mirrors the shape of the Static-mode duration so the fallback behaves
   *  exactly like a Static delay when it fires. */
  delayFallbackValue?: number;
  delayFallbackUnit?: "Minutes" | "Hours" | "Days";
  // ---- Tool (API Tool Call) ----
  /** Handle of the registry tool this node calls (see {@link file://./tool-registry.ts}). */
  apiTool?: string;
  /** Maps each non-constant tool input (`v` = input key) to an upstream variable (`def`). */
  apiInputMap?: PresetVarMap[];
  // ---- Webhook (journey waits on the response) ----
  whMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  whUrl?: string;
  /** Optional, off by default — the toggle is what the author actually decides. */
  whHeaders?: { key: string; value: string }[];
  /** Seconds the journey will wait before taking the timeout branch. */
  whTimeoutSecs?: number;
  /**
   * Response fields lifted into journey variables, exposed downstream as
   * `<serial>.<name>` exactly as an AI Transform's outputs are.
   *
   * `path` is a JSON pointer into the response; empty means the entire body. The
   * author is expected to have tested the request first — there is nothing to pick a
   * path out of until a real response has come back once.
   */
  whSaveResponse?: boolean;
  whOutputs?: { id: string; name: string; path: string }[];
  /**
   * Split the journey on the response status code.
   *
   * The author lists the codes they expect, and each becomes its own output. Anything
   * unlisted — and the timeout — leaves by the fallback output, so a journey can never
   * strand a lead on a response nobody anticipated.
   */
  whResponseRouting?: boolean;
  whExpectedStatuses?: number[];

  // ---- Assign to Human (inbound) ----
  /** Direct to one team member, or round-robin across the team. */
  assignType?: "direct" | "round_robin";
  /** Team id from the tenant's team → user mapping. See `inbound.ts` TEAMS. */
  assignTeamId?: string;
  /** At most one — the three answer the same question and cannot both apply. */
  assignRule?: "load_based" | "auto_reassign" | "contact_owner";
  /** `load_based` only: refuse an operator already holding this many open chats. */
  maxOpenChats?: number;
  /** `auto_reassign` only: minutes of operator silence before it moves on. */
  reassignAfterMins?: number;
  /** Operator eligibility — independent of each other, so a set rather than a choice. */
  assignToAdmin?: boolean;
  assignOutsideHours?: boolean;
  skipOfflineUsers?: boolean;

  
  // ---- Inbound Trigger ----
  /**
   * What starts the session — see `TriggerKind` in `inbound.ts`.
   *
   * @deprecated Superseded by {@link triggerKinds}. Still read when that is absent,
   * so entry points stored before multiselect keep routing as they did.
   */
  triggerKind?: "any_message" | "keyword" | "ctwa_ad" | "qr_link" | "webhook";
  /**
   * Every kind this entry point accepts.
   *
   * Multiselect because several kinds often share one destination — support takes
   * any message, an ad click and a QR scan alike, and that is one entry point
   * rather than three. Which kind actually fired is published as
   * `trigger.entry_kind`, so the agent still knows how the person arrived.
   *
   * `any_message` is exclusive: an entry point is either a set of claims or its
   * number's fallback, never both. See `isFallbackKind` in `inbound.ts`.
   */
  triggerKinds?: ("any_message" | "keyword" | "ctwa_ad" | "qr_link" | "webhook")[];
  /** `keyword` only. Matched exactly, case-insensitively. */
  triggerKeywords?: string[];
  /**
   * `ctwa_ad` only. Empty means any ad; naming ads narrows it to those — and
   * gives each one its own output, so a Diwali ad and a winback ad can open
   * differently without a conditional in between.
   */
  triggerAds?: { id: string; label: string }[];
  /**
   * `ctwa_ad` only — which `referral.source_type` values this accepts.
   *
   * Paid ads and organic posts both arrive through Meta's one `referral` object, so a
   * trigger that does not distinguish them counts organic traffic against ad spend.
   */
  triggerAdSource?: "ad" | "post" | "any";
  /**
   * `qr_link` only — every printable code this entry point publishes.
   *
   * A list because a business prints more than one and telling them apart is the
   * reason for printing them. Each carries its own generated marker and its own
   * prefilled message; markers are generated, never typed.
   */
  triggerLinks?: { id: string; label: string; token: string; prefill: string }[];
  /**
   * The entry point's bound number, stamped onto the trigger by the builder.
   *
   * Only the tracked-link section needs it, and only to build the `wa.me` URL it
   * tells the author to publish.
   */
  address?: string;
      /**
   * `webhook` only — where the event name lives in the posted body, as a dotted path
   * (`type`, `data.event`). Without it we would have to guess, and every sender names
   * that field differently.
   */
  triggerEventPath?: string;
  /** `webhook` only. Values of {@link triggerEventPath} that start a session here. */
  triggerEvents?: string[];
  /** `webhook` only — the opaque path segment that makes the endpoint unguessable. */
  triggerToken?: string;
  /** `webhook` only — the signing secret, generated by us and shown once. */
  triggerSecret?: string;
  /**
   * `webhook` only — the last event actually received, as raw JSON.
   *
   * The whole point of capturing one: paths are picked from a real payload rather
   * than typed from memory, which is how every receiver worth using does it. A
   * mistyped path fails silently at runtime and looks like the sender's fault.
   */
  triggerSample?: string;
  /**
   * `webhook` only — payload fields lifted into trigger variables, published downstream
   * as `trigger.<name>`. The inbound mirror of the webhook node's response mapping:
   * without it a graph can tell *that* an order event arrived but nothing about it.
   */
  triggerOutputs?: { id: string; name: string; path: string }[];

  // ---- Agent Session (inbound) ----
  /**
   * Agent variable mapping, the same shape the Voice Call node uses for
   * {@link voiceVarMap}. Kept as its own field rather than shared: a voice node maps
   * against an Audience schema, a session node against what the trigger published,
   * and one key colliding across the two would silently carry a campaign mapping into
   * an inbound graph.
   */
  /**
   * Hand the agent what happened last time, at session start.
   *
   * The last session only, as a short summary with its outcome and tags —
   * not transcripts. Full history grows with the customer's tenure, so it is a
   * token cost and a disclosure surface that both get worse the more loyal the
   * customer is, which is the wrong way round.
   *
   * Defaults on: an agent that does not know the customer asked the same thing
   * yesterday is the complaint this exists to prevent.
   */
  priorSessionContext?: boolean;

  /**
   * Which of the agent's dispositions mark the session for a human.
   *
   * Named per entry point rather than on the agent, because the same agent can
   * be worth escalating from on one line and not on another: "Out of scope" on
   * the KYC number is somebody else's problem, on the main line it is the whole
   * job. The agent owns the vocabulary; the entry point owns what it means here.
   */
  /**
   * `assignHuman` only — the reason recorded on the session, from the closed
   * {@link HANDOFF_REASONS} list. Set on the node rather than read from the
   * disposition that arrived, because several branches often share one reason.
   */
  escalateReason?: string;

  sessionVarMap?: { v: string; def: string; mode?: "variable" | "constant" }[];
  /**
   * Id of the agent that handles the session. Distinct from {@link agent}, which
   * holds a display name on campaign Voice nodes. Must be channel-compatible with
   * the entry point (AC-E4) — the picker enforces it via `agentsForChannel`.
   */
  agentId?: string;
  /**
   * Channel of the entry point this node belongs to, stamped on at add time.
   * The node carries the constraint it has to honour so the agent picker can gate
   * itself without the config panel knowing which entry point it is editing.
   */
  channel?: "voice" | "whatsapp" | "webhook";
  // ---- AI Transform ----
  aiPrompt?: string;
  /** Variables the model emits, exposed downstream as `<serial>.<name>`. */
  aiOutputs?: PresetSchemaField[];
  // ---- Human Escalation (needsReview) ----
  /**
   * IDs of `human_escalation`-typed webhooks registered under Integrations →
   * Developer that this node should fire on every escalation. Zero, one, or
   * many. See {@link file://./webhooks-data.ts}.
   */
  notifyWebhookIds?: string[];
  /**
   * Extra workflow variables to add to the payload for events emitted by
   * *this* node — on top of the auto-included fields that the router always
   * sends (lead_id, phone, campaign_id, run_id, timestamp, etc.). Per-node,
   * not per-webhook: every selected webhook receives the same extras when
   * this node fires.
   */
  notifyPayloadExtras?: string[];

  // Legacy fields — kept in the type so pre-registry example configs still
  // parse. Never read by the new UI; the router ignores them.
  notifyEnabled?: boolean;
  notifyEndpointUrl?: string;
  customPayloadFields?: string[];
};

export type WorkflowNodeData = {
  kind: NodeKind;
  title: string;
  subtitle?: string;
  /** Stable per-kind, add-order id (e.g. `whatsapp_2`, `voice_1`, `api_1`). Assigned on add. */
  serial?: string;
  /** Short user label (≤12 chars). Drives the node sub-heading `serial • description`. */
  description?: string;
  /** Per-node configuration. For preset/example nodes this is a {@link PresetConfig}; otherwise loosely typed. */
  config?: PresetConfig & Record<string, unknown>;
  /** Whether all required config fields are satisfied */
  valid?: boolean;
  /** Inline error message when invalid */
  error?: string;
  /** Live execution state during a run */
  runState?: NodeRunState;
  retry?: RetryPolicy;
  /** True for Start / End — UI prevents deletion */
  locked?: boolean;
  /** Analytics overlay: shown inline on the node in Campaign Analytics view */
  metrics?: { entered: number; exited: number; dropoffPct: number };
  /** Labeled output ports — each becomes its own source handle on the canvas (branches, A/B variants, exit paths). */
  outputs?: NodeOutput[];
  /** Set when an action node runs as an A/B experiment — drives the canvas A/B badge. */
  abTest?: { variants: { label: string; pct: number }[] };
  /**
   * Marks a preset/example node. The config panel then renders the real editor for
   * this node's kind in read-only mode (hydrated from {@link config}) and swallows
   * any field-level changes, so the authored `outputs`/`abTest` and the edges that
   * reference them survive being clicked into.
   */
  preset?: boolean;
};


export const NODE_GROUPS: Record<NodeKind, NodeGroup> = {
  start: "system",
  end: "system",
  inboundTrigger: "system",
  audience: "data",
  apiToolCall: "data",
  webhook: "data",
  conditional: "logic",
  abSplit: "logic",
  delay: "logic",
  voiceCall: "action",
  whatsapp: "action",
  whatsappFreeform: "action",
  sms: "action",
  rcs: "action",
  agentSession: "action",
  assignHuman: "action",
  aiTransform: "ai",
  adsCampaign: "ads",
  needsReview: "action",
};

export const NODE_LABELS: Record<NodeKind, string> = {
  start: "Start",
  end: "End",
  inboundTrigger: "Inbound Trigger",
  audience: "Audience",
  apiToolCall: "Tool",
  webhook: "Webhook",
  conditional: "Conditional Branch",
  abSplit: "A/B Split",
  delay: "Delay",
  voiceCall: "Voice Call",
  whatsapp: "WhatsApp Template",
  whatsappFreeform: "WhatsApp Freeform Workflow",
  sms: "SMS",
  rcs: "RCS",
  agentSession: "Agent Session",
  assignHuman: "Escalate to a person",
  aiTransform: "AI Transformation",
  adsCampaign: "Ads Campaign Setup",
  needsReview: "Human Escalation",
};

export const STATUS_TONE: Record<CampaignStatus, string> = {
  draft: "border-border bg-secondary text-muted-foreground",
  ready: "border-ai/30 bg-ai/10 text-ai",
};

/** Prefix used to build a node's per-kind serial (`<prefix>_<n>`), assigned by add-order. */
export const SERIAL_PREFIX: Record<NodeKind, string> = {
  start: "start",
  end: "end",
  inboundTrigger: "trigger",
  audience: "audience",
  apiToolCall: "api",
  webhook: "wh",
  conditional: "cond",
  abSplit: "split",
  delay: "delay",
  voiceCall: "voice",
  whatsapp: "whatsapp",
  whatsappFreeform: "ffw",
  sms: "sms",
  rcs: "rcs",
  agentSession: "agent",
  assignHuman: "assign",
  aiTransform: "ait",
  adsCampaign: "ads",
  needsReview: "review",
};

/**
 * Fallback `contact.*` variables shown in mapping dropdowns BEFORE the Audience
 * node's schema has been edited. Once the Audience node has real schema rows,
 * {@link file://./wa-outputs.ts} derives `contact.<key>` from them and these are
 * dropped (see `mergeVariables`).
 *
 * There are intentionally NO generic `voice.*` / `wa.*` / `payload.*` entries:
 * those signals never exist in the abstract — they are always produced by a
 * specific upstream Voice / WhatsApp / API node and are therefore namespaced by
 * that node's serial (e.g. `voice_4.call_status`, `whatsapp_2.delivery_state`)
 * via `deriveNodeOutcomeVariables`.
 */
export const SAMPLE_WORKFLOW_VARIABLES: { key: string; source: string }[] = [
  { key: "contact.customer_id", source: "Audience" },
  { key: "contact.phone", source: "Audience" },
  { key: "contact.first_name", source: "Audience" },
  { key: "contact.last_name", source: "Audience" },
  { key: "contact.email", source: "Audience" },
  { key: "contact.tier", source: "Audience" },
];
