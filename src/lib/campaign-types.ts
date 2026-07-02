/**
 * Campaign DSL — frontend representation of execution primitives.
 * Designed to translate cleanly into a future Temporal-style runtime.
 */

export type NodeGroup = "system" | "data" | "logic" | "action" | "ai" | "ads";

export type NodeKind =
  // system
  | "start"
  | "end"
  // data
  | "audience"
  // logic
  | "conditional"
  | "abSplit"
  | "delay"
  // action
  | "voiceCall"
  | "whatsapp"
  | "sms"
  // ads
  | "adsCampaign";

export type NodeRunState = "idle" | "running" | "success" | "failed";

export type CampaignStatus =
  | "draft"
  | "ready"
  | "running"
  | "paused"
  | "locked";

export type RetryPolicy = { maxRetries: number; backoffSeconds: number };

/** A labeled output port on a node — rendered as its own source handle on the canvas.
 *  `exit` marks a terminal-facing port (e.g. an arm's "Welcome / send" node that flows
 *  straight to End); the port renderer treats it the same as `default` visually. */
export type NodeOutputKind = "branch" | "variant" | "outcome" | "default" | "exit";
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
export type PresetBranch = { id: string; label: string; variable: string; op: string; value: string; value2?: string };
export type PresetSplitVariant = { id: string; label: string; pct: number };
export type PresetTransform = { id: string; type: string; input: string; output: string };
export type PresetVarMap = { v: string; def: string };

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
  /** Type-1 (no-button) only: when true, splits into reply_received + session_expired handles; when false (default) the node has a single "advance" output. */
  waSplitOutcomes?: boolean;
  waVarMap?: PresetVarMap[];
  waBody?: string;
  // ---- SMS core ----
  smsType?: string;
  smsFormat?: string;
  peId?: string;
  senderId?: string;
  smsBody?: string;
  // ---- Delay ----
  delayValue?: number;
  delayUnit?: "Minutes" | "Hours" | "Days";
};

export type WorkflowNodeData = {
  kind: NodeKind;
  title: string;
  subtitle?: string;
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
  /** Render as a pulsating empty wireframe placeholder (used by Ask Pi build phase) */
  building?: boolean;
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
  /**
   * Legacy node-level Pi optimization hint id. The hover "Pi tip" UI that
   * consumed it was removed when the campaign builder switched to the dedicated
   * Ask Pi creation composer; some authored nodes still carry the field but it is
   * no longer rendered. Retained so existing node data stays valid.
   */
  piHint?: string;
};


export const NODE_GROUPS: Record<NodeKind, NodeGroup> = {
  start: "system",
  end: "system",
  audience: "data",
  conditional: "logic",
  abSplit: "logic",
  delay: "logic",
  voiceCall: "action",
  whatsapp: "action",
  sms: "action",
  adsCampaign: "ads",
};

export const NODE_LABELS: Record<NodeKind, string> = {
  start: "Start",
  end: "End",
  audience: "Audience",
  conditional: "Conditional Branch",
  abSplit: "A/B Split",
  delay: "Delay",
  voiceCall: "Voice Call",
  whatsapp: "WhatsApp",
  sms: "SMS",
  adsCampaign: "Ads Campaign Setup",
};

export const STATUS_TONE: Record<CampaignStatus, string> = {
  draft: "border-border bg-secondary text-muted-foreground",
  ready: "border-ai/30 bg-ai/10 text-ai",
  running: "border-success/30 bg-success/10 text-success",
  paused: "border-warning/30 bg-warning/10 text-warning",
  locked: "border-destructive/30 bg-destructive/10 text-destructive",
};

/** Variables produced by upstream nodes — exposed in mapping dropdowns. */
export const SAMPLE_WORKFLOW_VARIABLES: { key: string; source: string }[] = [
  { key: "contact.customer_id", source: "Audience" },
  { key: "contact.phone", source: "Audience" },
  { key: "contact.first_name", source: "Audience" },
  { key: "contact.last_name", source: "Audience" },
  { key: "contact.email", source: "Audience" },
  { key: "contact.tier", source: "Audience" },
  { key: "payload.order_id", source: "API payload" },
  { key: "payload.amount", source: "API payload" },
  { key: "voice.call_status", source: "Voice Call" },
  { key: "voice.duration_sec", source: "Voice Call" },
  { key: "wa.delivery_state", source: "WhatsApp" },
];
