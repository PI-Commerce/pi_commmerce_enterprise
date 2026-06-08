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
  | "archived"
  | "locked";

export type RetryPolicy = { maxRetries: number; backoffSeconds: number };

/** A labeled output port on a node — rendered as its own source handle on the canvas. */
export type NodeOutputKind = "branch" | "variant" | "exit" | "default";
export type NodeOutput = { id: string; label: string; kind: NodeOutputKind };

export type WorkflowNodeData = {
  kind: NodeKind;
  title: string;
  subtitle?: string;
  /** Per-node configuration (loosely typed; shape depends on kind) */
  config?: Record<string, unknown>;
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
  metrics?: { entered: number; exited: number; conversionPct: number };
  /** Render as a pulsating empty wireframe placeholder (used by Ask Pi build phase) */
  building?: boolean;
  /** Labeled output ports — each becomes its own source handle on the canvas (branches, A/B variants, exit paths). */
  outputs?: NodeOutput[];
  /** Set when an action node runs as an A/B experiment — drives the canvas A/B badge. */
  abTest?: { variants: { label: string; pct: number }[] };
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
  archived: "border-border bg-muted text-muted-foreground",
  locked: "border-destructive/30 bg-destructive/10 text-destructive",
};

/** Variables produced by upstream nodes — exposed in mapping dropdowns. */
export const SAMPLE_WORKFLOW_VARIABLES: { key: string; source: string }[] = [
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
