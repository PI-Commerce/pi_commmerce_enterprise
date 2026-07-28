/**
 * Campaign DSL — frontend representation of execution primitives.
 * Designed to translate cleanly into a future Temporal-style runtime.
 */

export type NodeGroup = "system" | "data" | "logic" | "action" | "ai" | "ads";

/**
 * A campaign's BFSI **Use Case** — the vertical pack it belongs to.
 *
 * The use case drives (a) which business KPIs surface above Campaign Analytics
 * for this campaign's runs, (b) which `lead.memory.<product>.*` keys appear in
 * the variable picker, (c) suggested templates + agents at creation time, and
 * (d) compliance defaults (RBI window for Collections, disclosure text, etc.).
 *
 * Extend this list to add a new BFSI pack — Onboarding, Claims, Cross-sell, etc.
 */
/**
 * Product = the domain object the campaign operates on. Independent of
 * useCase (lifecycle stage) so that e.g. `retention` can apply to both
 * loans and insurance. Product drives:
 *   - which Business Rules render on the Start node (DPD + PTP for loan; none for insurance in v1)
 *   - the Business Analytics badge label
 *   - the template chip surfaced in the campaign creation dialog
 */
export type Product = "loan" | "insurance";

export const PRODUCT_LABEL: Record<Product, string> = {
  loan:      "Loan",
  insurance: "Insurance",
};

/**
 * useCase = the campaign's *lifecycle-stage pack* — decoupled from any
 * specific product. `collections` covers Loan-collections in v1 (and can
 * be reused for CC or utility dues later). `retention` covers Insurance
 * renewal + premium reminders (and can also apply to Loan retention).
 * The product axis is captured separately (see `Product` above).
 */
export type UseCase =
  | "collections"
  | "retention"
  | "onboarding"
  | "cross_sell"
  | "generic";

export const USE_CASE_LABEL: Record<UseCase, string> = {
  collections: "Loan",
  retention:   "Insurance",
  onboarding:  "Onboarding",
  cross_sell:  "Cross-sell",
  generic:     "Generic BFSI",
};

/**
 * Tailwind v4 in this repo only exposes these tokens: background, foreground,
 * card, popover, primary, secondary, muted, accent, destructive, border,
 * input, ring, ai, success, warning. No `chart-N` tokens — so we deliberately
 * do NOT use them here.
 *
 * v1 has 2 useCases in scope (collections, retention). Both use the `ai`
 * token — it's the brand's "smart" color and it renders reliably. When more
 * useCases go live, differentiate them by icon or label; do not introduce
 * chart-N tokens without defining them in styles.css.
 */
export const USE_CASE_TINT: Record<UseCase, string> = {
  collections: "text-ai bg-ai/10 border-ai/30",
  retention:   "text-ai bg-ai/10 border-ai/30",
  onboarding:  "text-ai bg-ai/10 border-ai/30",
  cross_sell:  "text-ai bg-ai/10 border-ai/30",
  generic:     "text-muted-foreground bg-secondary border-border",
};

/** Solid variant — for higher-emphasis badges (e.g. Business Analytics header). */
export const USE_CASE_TINT_SOLID: Record<UseCase, string> = {
  collections: "bg-ai text-ai-foreground border-transparent",
  retention:   "bg-ai text-ai-foreground border-transparent",
  onboarding:  "bg-ai text-ai-foreground border-transparent",
  cross_sell:  "bg-ai text-ai-foreground border-transparent",
  generic:     "bg-foreground text-background border-transparent",
};

export type NodeKind =
  // system
  | "start"
  | "end"
  // data
  | "audience"
  | "apiToolCall"
  // logic
  | "conditional"
  | "abSplit"
  | "delay"
  // action
  | "voiceCall"
  | "whatsapp"
  | "sms"
  // ai
  | "aiTransform"
  // ads
  | "adsCampaign"
  // human handoff (verticalized label: "Human Escalation" for BFSI)
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
  waBody?: string;
  // ---- SMS core ----
  smsType?: string;
  smsFormat?: string;
  peId?: string;
  senderId?: string;
  smsBody?: string;
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
  // ---- API Tool Call ----
  /** Handle of the registry tool this node calls (see {@link file://./tool-registry.ts}). */
  apiTool?: string;
  /** Maps each non-constant tool input (`v` = input key) to an upstream variable (`def`). */
  apiInputMap?: PresetVarMap[];
  /**
   * Tool output varNames that persist to per-lead memory when this node runs.
   * Outputs listed here become `lead.memory.<varName>` variables downstream
   * (in addition to the standard `api_N.<varName>` node output). Used to model
   * out-of-box "context tools" (calculate_dpd, lookup_ptp_history, etc.).
   */
  saveToLeadMemory?: string[];

  // ---- Start node: Business Rules ----
  /**
   * Loan-only. Configuration of the per-campaign engine computations that
   * populate `lead.memory.*` fields. When present, edits made on the Start
   * node's Business Rules section persist here. Version-scoped: each campaign
   * version pins its own rule set (per the "rules travel with the version"
   * decision).
   */
  businessRules?: LoanBusinessRules;

  // ---- Start node: Signals ----
  /**
   * Global webhook listeners at campaign level. When a matching signal fires,
   * the engine takes bulk action across all in-flight leads of this campaign
   * (e.g. "payment_received" → mark those leads as paid and exit their runs).
   */
  signals?: Signal[];

  // ---- Human Escalation (needsReview) ----
  /**
   * Optional client-notify config. When enabled, the engine POSTs a payload
   * to `endpointUrl` every time a lead reaches this node. Auto-included
   * fields (lead_id, phone, campaign_id, run_id, timestamp) are always in the
   * payload; `customPayloadFields` lists additional workflow vars the user
   * wants to include.
   */
  notifyEnabled?: boolean;
  notifyEndpointUrl?: string;
  /** Names of upstream variables to include in the notify payload (in
   *  addition to the auto-included fields). */
  customPayloadFields?: string[];
};

/* ---------------- Business Rules (Loan) ---------------- */

export type DpdBucket = { name: string; from: number; to?: number };

export type LoanBusinessRules = {
  /** DPD Status grace period in hours. Pre-due if paid within this window
   *  of the due date. Default 24. */
  dpdStatusGraceHours: number;
  /** DPD Bucket definitions. Applied only when DPD Status = post_due.
   *  Buckets are inclusive ranges in days-past-due. */
  dpdBuckets: DpdBucket[];
  /** PTP Rate — lookback window in days for historical PTPs. */
  ptpLookbackDays: number;
  /** PTP Rate — minimum sample size before ratePct is meaningful. */
  ptpMinSample: number;
  /** PTP Status — grace period in days for "kept" vs "broken" classification. */
  ptpStatusGraceDays: number;
};

export const DEFAULT_LOAN_RULES: LoanBusinessRules = {
  dpdStatusGraceHours: 24,
  dpdBuckets: [
    { name: "Early", from: 1,  to: 7  },
    { name: "Mid",   from: 8,  to: 30 },
    { name: "Late",  from: 31            }, // no upper bound
  ],
  ptpLookbackDays: 90,
  ptpMinSample:    2,
  ptpStatusGraceDays: 3,
};

/* ---------------- Signals (all products) --------------- */

export type SignalKind = "payment_received";

export type Signal = {
  id: string;
  kind: SignalKind;
  enabled: boolean;
  /** Endpoint URL clients POST to when the event occurs. Auto-generated in
   *  production; shown as a copy-able URL here in the mock. */
  endpointUrl?: string;
};

export const SIGNAL_LABEL: Record<SignalKind, { title: string; description: string }> = {
  payment_received: {
    title: "Payment received",
    description: "When the client posts a payment event to the endpoint, matching leads exit any in-flight run of this campaign cleanly.",
  },
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
  audience: "data",
  apiToolCall: "data",
  conditional: "logic",
  abSplit: "logic",
  delay: "logic",
  voiceCall: "action",
  whatsapp: "action",
  sms: "action",
  aiTransform: "ai",
  adsCampaign: "ads",
  needsReview: "action",
};

export const NODE_LABELS: Record<NodeKind, string> = {
  start: "Start",
  end: "End",
  audience: "Audience",
  apiToolCall: "Tool",
  conditional: "Conditional Branch",
  abSplit: "A/B Split",
  delay: "Delay",
  voiceCall: "Voice Call",
  whatsapp: "WhatsApp",
  sms: "SMS",
  aiTransform: "AI Transformation",
  adsCampaign: "Ads Campaign Setup",
  // FinServ vertical relabel. Generic platform name is "Needs Review".
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
  audience: "audience",
  apiToolCall: "api",
  conditional: "cond",
  abSplit: "split",
  delay: "delay",
  voiceCall: "voice",
  whatsapp: "whatsapp",
  sms: "sms",
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
