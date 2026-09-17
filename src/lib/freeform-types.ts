/**
 * WhatsApp Freeform Workflows  -  types + in-memory store.
 *
 * A freeform workflow is a reusable, campaign-agnostic conversation flow used
 * inside WhatsApp's 24-hour customer-service window. Authored on a Campaign-
 * Builder-style canvas but with a limited palette:
 *
 *  - Message nodes (WhatsApp primitives)  -  Text, Image, Video, Document, List.
 *  Each optionally carries a Buttons block (Meta interactive buttons: either
 *  up to 3 Quick Replies OR one CTA URL button  -  Meta doesn't allow mixing).
 *  - Logic nodes  -  API Call and Conditional. Rendered by the campaign
 *  WorkflowNode + configured by the campaign ConfigPanel so the two surfaces
 *  stay 1:1 with the main builder.
 *  - Structural  -  Start and End (locked, always present).
 *
 * There's no standalone "Buttons" or "CTA URL" node kind: per Meta's API those
 * are properties of the container message, not messages themselves.
 */

export type FreeformStatus = "draft" | "ready";

/** Kinds owned by the freeform builder (rendered by FreeformNode). Logic nodes
 *  (API, Conditional) come from the main campaign construct and use `type:
 *  "workflow"` in ReactFlow, so they don't appear here. */
export type FreeformNodeKind =
  | "start"
  | "end"
  | "text"
  | "image"
  | "video"
  | "document"
  | "list";

export const FREEFORM_NODE_LABELS: Record<FreeformNodeKind, string> = {
  start: "Start",
  end: "End",
  text: "Text",
  image: "Image",
  video: "Video",
  document: "Document",
  list: "List",
};

/** Serial prefix  -  matches the campaign-builder convention (text_1, list_2). */
export const FREEFORM_SERIAL_PREFIX: Record<FreeformNodeKind, string> = {
  start: "start",
  end: "end",
  text: "text",
  image: "image",
  video: "video",
  document: "document",
  list: "list",
};

/* --------------------------------- Buttons --------------------------------- */

/** Meta interactive buttons come in two mutually-exclusive flavours:
 *  - "quick_reply"  -  up to 3 tap-to-reply buttons (label ≤20 chars).
 *  - "cta_url"  -  exactly one URL button (label ≤20 chars, valid URL).
 *  We model both as a single Buttons block with a `mode` toggle. */
export type ButtonsMode = "quick_reply" | "cta_url";

export type QuickReplyButton = { id: string; label: string };
export type UrlButton = { id: string; label: string; url: string };

export type ButtonsBlock =
  | { mode: "quick_reply"; buttons: QuickReplyButton[] }
  | { mode: "cta_url"; button: UrlButton };

/** Meta limits  -  single source of truth referenced by config panel + validation. */
export const META_LIMITS = {
  textBody: 1024, // interactive text body (with buttons)
  captionBody: 1024, // image / video / document body/caption
  listHeader: 60, // list header text (optional)
  listBody: 4096, // list body text (required)
  listFooter: 60, // list footer text (optional)
  listButtonLabel: 20, // Meta interactive list button label
  listMaxRows: 10,
  listRowTitle: 24,
  listRowDescription: 72,
  buttonLabel: 20, // Meta button label limit (both quick reply & CTA)
  maxQuickReplyButtons: 3,
} as const;

/* -------------------------------- Node config ------------------------------- */

/** Per-kind config. All fields optional in Draft; validation promotes to Ready. */
export type FreeformNodeConfig = {
  // Text
  text?: string;

  // Media (image / video / document)
  mediaSource?: "url" | "upload";
  mediaUrl?: string;
  mediaFileName?: string; // display name for upload / document
  mediaBlobUrl?: string; // transient URL.createObjectURL for uploaded file preview
  caption?: string;

  // List
  header?: string;
  body?: string;
  footer?: string;
  buttonLabel?: string;
  rows?: Array<{ id: string; title: string; description?: string }>;

  // Optional Buttons block  -  Text and all media nodes may attach one.
  buttonsBlock?: ButtonsBlock;
};

/** Serialised graph  -  plain JSON so the store round-trips without ReactFlow types. */
export type FreeformNodeRecord = {
  id: string;
  type: "freeform" | "workflow";
  position: { x: number; y: number };
  data: {
    kind: FreeformNodeKind | "apiToolCall" | "conditional";
    title: string;
    description?: string;
    serial?: string;
    locked?: boolean;
    valid?: boolean;
    error?: string;
    config?: FreeformNodeConfig | Record<string, unknown>;
  };
};
export type FreeformEdgeRecord = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type FreeformWorkflowRow = {
  id: string;
  name: string;
  description?: string;
  status: FreeformStatus;
  lastModified: string;
  createdAt: string;
  usedInCampaigns: number;
  /** Persisted graph the builder round-trips via Save and the campaign-side
   *  WhatsApp Freeform Workflow node reads to extract `{{}}` placeholders and
   *  render the read-only preview modal. */
  nodes: FreeformNodeRecord[];
  edges: FreeformEdgeRecord[];
  /** True once at least one campaign Run has been created referencing this
   *  workflow. Locked workflows are read-only in the builder and can only be
   *  cloned to iterate. Analytics is only available on locked workflows. */
  locked?: boolean;
  /** ISO timestamp when the workflow was locked (first run created). Displayed
   *  on the top bar's locked banner. */
  lockedAt?: string;
};

/* --------------------------------- Seed data --------------------------------- */

/** Soundbox troubleshooting flow  -  the freeform workflow referenced by the
 *  Reactivate Paytm Soundbox Merchants hero campaign (c_ex_soundbox). Merchants
 *  who reply "Chat with support" on the reactivation nudge get dropped into
 *  this flow inside the 24-hour window. */
const SOUNDBOX_HELP_NODES: FreeformNodeRecord[] = [
  {
    id: "start",
    type: "freeform",
    position: { x: 0, y: 200 },
    data: { kind: "start", title: "Start", locked: true, valid: true },
  },
  {
    id: "text_intro",
    type: "freeform",
    position: { x: 240, y: 200 },
    data: {
      kind: "text",
      title: "Intro",
      serial: "text_1",
      valid: true,
      config: {
        text: "Namaste {{name}}, sorry your Soundbox {{device_id}} isn't working as expected. Tell me what's happening and I'll get it sorted.",
      },
    },
  },
  {
    id: "list_options",
    type: "freeform",
    position: { x: 520, y: 200 },
    data: {
      kind: "list",
      title: "What's wrong",
      serial: "list_1",
      valid: true,
      config: {
        header: "Soundbox Support",
        body: "Which of these best describes the issue with device {{device_id}}?",
        footer: "We'll fix it fast.",
        buttonLabel: "Choose",
        rows: [
          { id: "no_power", title: "Not turning on", description: "Screen is blank / no lights" },
          { id: "no_sound", title: "Not playing sound", description: "Payment received but no beep" },
          { id: "no_network", title: "No network / offline", description: "Says 'offline' or won't connect" },
          { id: "talk_to_support", title: "Speak to a human", description: "Route me to Paytm support" },
        ],
      },
    },
  },
  {
    id: "text_no_power",
    type: "freeform",
    position: { x: 820, y: 40 },
    data: {
      kind: "text",
      title: "No power",
      serial: "text_2",
      valid: true,
      config: {
        text: "Hold the power button for 10 seconds to force-restart the Soundbox. If nothing happens, plug in the charger for 15 minutes and try again. If it still won't turn on, the battery may be dead and we'll swap the device for free.",
        buttonsBlock: {
          mode: "quick_reply",
          buttons: [
            { id: "fixed", label: "It's working now" },
            { id: "still_broken", label: "Still not working" },
          ],
        },
      },
    },
  },
  {
    id: "text_no_sound",
    type: "freeform",
    position: { x: 820, y: 200 },
    data: {
      kind: "text",
      title: "No sound",
      serial: "text_3",
      valid: true,
      config: {
        text: "Please increase the volume using the buttons on the side, then ask a friend to send you ₹1 on your Paytm QR to test. If it still doesn't announce the amount, the speaker may need service — we'll send a replacement.",
        buttonsBlock: {
          mode: "quick_reply",
          buttons: [
            { id: "fixed", label: "Working now" },
            { id: "need_replacement", label: "Send replacement" },
          ],
        },
      },
    },
  },
  {
    id: "document_manual",
    type: "freeform",
    position: { x: 820, y: 360 },
    data: {
      kind: "document",
      title: "User manual",
      serial: "document_1",
      valid: true,
      config: {
        mediaSource: "url",
        mediaUrl: "https://cdn.paytm.com/soundbox/troubleshooting-en.pdf",
        mediaFileName: "soundbox-troubleshooting-en.pdf",
        caption: "Here's the network reset guide for your Soundbox {{device_id}}. Follow steps 1-4 to reconnect it to Wi-Fi. If it still shows offline after that, reply here and we'll help.",
      },
    },
  },
  {
    id: "text_talk_to_support",
    type: "freeform",
    position: { x: 820, y: 520 },
    data: {
      kind: "text",
      title: "Escalate",
      serial: "text_4",
      valid: true,
      config: {
        text: "No problem, {{name}}. A Paytm merchant-support agent will call you back within 30 minutes on this number. Your device ID {{device_id}} is already shared with them.",
      },
    },
  },
  {
    id: "end",
    type: "freeform",
    position: { x: 1140, y: 200 },
    data: { kind: "end", title: "End", locked: true, valid: true },
  },
];

const SOUNDBOX_HELP_EDGES: FreeformEdgeRecord[] = [
  { id: "e1", source: "start", target: "text_intro" },
  { id: "e2", source: "text_intro", target: "list_options" },
  { id: "e3", source: "list_options", target: "text_no_power", sourceHandle: "row_no_power" },
  { id: "e4", source: "list_options", target: "text_no_sound", sourceHandle: "row_no_sound" },
  { id: "e5", source: "list_options", target: "document_manual", sourceHandle: "row_no_network" },
  { id: "e6", source: "list_options", target: "text_talk_to_support", sourceHandle: "row_talk_to_support" },
  { id: "e7", source: "text_no_power", target: "end", sourceHandle: "btn_fixed" },
  { id: "e8", source: "text_no_power", target: "text_talk_to_support", sourceHandle: "btn_still_broken" },
  { id: "e9", source: "text_no_sound", target: "end", sourceHandle: "btn_fixed" },
  { id: "e10", source: "text_no_sound", target: "text_talk_to_support", sourceHandle: "btn_need_replacement" },
  { id: "e11", source: "document_manual", target: "end" },
  { id: "e12", source: "text_talk_to_support", target: "end" },
];

export const SEED_FREEFORM_WORKFLOWS: FreeformWorkflowRow[] = [
  {
    id: "ff_soundbox_help",
    name: "Soundbox Help",
    description:
      "In-conversation troubleshooting for dormant Soundbox merchants — power, sound, network, or route to support.",
    status: "ready",
    lastModified: "2026-08-30T10:15:00Z",
    createdAt: "2026-08-22T14:00:00Z",
    usedInCampaigns: 1,
    nodes: SOUNDBOX_HELP_NODES,
    edges: SOUNDBOX_HELP_EDGES,
    locked: true,
    lockedAt: "2026-08-25T09:00:00Z",
  },
  {
    id: "ff_callback_slot_picker",
    name: "Callback Slot Picker",
    description: "Present available time slots, capture selection.",
    status: "ready",
    lastModified: "2026-08-01T11:05:00Z",
    createdAt: "2026-07-22T15:30:00Z",
    usedInCampaigns: 0,
    nodes: [
      {
        id: "start",
        type: "freeform",
        position: { x: 0, y: 60 },
        data: { kind: "start", title: "Start", locked: true, valid: true },
      },
      {
        id: "n_list_1",
        type: "freeform",
        position: { x: 240, y: 60 },
        data: {
          kind: "list",
          title: "Slot picker",
          serial: "list_1",
          valid: true,
          config: {
            body: "Hi {{name}}, when should our team call you back?",
            buttonLabel: "Choose",
            rows: [
              {
                id: "r_morning",
                title: "Tomorrow morning",
                description: "9 AM - 12 PM",
              },
              {
                id: "r_afternoon",
                title: "Tomorrow afternoon",
                description: "1 PM - 4 PM",
              },
              {
                id: "r_evening",
                title: "Tomorrow evening",
                description: "5 PM - 8 PM",
              },
            ],
          },
        },
      },
      {
        id: "end",
        type: "freeform",
        position: { x: 560, y: 60 },
        data: { kind: "end", title: "End", locked: true, valid: true },
      },
    ],
    edges: [
      { id: "e1", source: "start", target: "n_list_1" },
      {
        id: "e2",
        source: "n_list_1",
        target: "end",
        sourceHandle: "row_r_morning",
      },
      {
        id: "e3",
        source: "n_list_1",
        target: "end",
        sourceHandle: "row_r_afternoon",
      },
      {
        id: "e4",
        source: "n_list_1",
        target: "end",
        sourceHandle: "row_r_evening",
      },
    ],
  },
];

/* --------------------------------- Store --------------------------------- */

let workflows: FreeformWorkflowRow[] = [...SEED_FREEFORM_WORKFLOWS];
type Listener = () => void;
const listeners = new Set<Listener>();

// Background persist — fire the D1 save without blocking the caller. Dynamic
// import keeps the server-fn (which imports the D1 module) out of any
// pure-data importer of freeform-types.
function persistFreeform(row: FreeformWorkflowRow): void {
  if (typeof window === "undefined") return;
  void import("@/lib/server-fns/freeform-workflows")
    .then((m) => m.saveFreeformWorkflowFn({ data: m.freeformToWire(row) }))
    .catch(() => { /* silent — in-memory state already updated */ });
}

function persistDelete(id: string): void {
  if (typeof window === "undefined") return;
  void import("@/lib/server-fns/freeform-workflows")
    .then((m) => m.deleteFreeformWorkflowFn({ data: id }))
    .catch(() => { /* silent */ });
}

// D1 hydration state — first mount kicks off a fetch and merges D1 rows over
// the seed. Idempotent; subsequent callers await the memoized promise. Silent
// no-op when D1 isn't bound so the seed still renders.
let hydratePromise: Promise<void> | null = null;

export function hydrateFreeformWorkflowsFromDb(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const mod = await import("@/lib/server-fns/freeform-workflows");
      const r = await mod.listFreeformWorkflowsFn();
      if (!r.ok) return;
      const merged = mod.hydrateWireFreeformWorkflows(r.workflows);
      const byId = new Map<string, FreeformWorkflowRow>();
      for (const w of workflows) byId.set(w.id, w);
      for (const w of merged) byId.set(w.id, w);
      workflows = Array.from(byId.values());
      listeners.forEach((l) => l());
    } catch {
      /* silent — the seed still renders */
    }
  })();
  return hydratePromise;
}

export function getFreeformWorkflows(): FreeformWorkflowRow[] {
  return workflows;
}

export function getFreeformWorkflow(
  id: string,
): FreeformWorkflowRow | undefined {
  return workflows.find((w) => w.id === id);
}

export function createFreeformWorkflow(input: {
  name: string;
  description?: string;
}): FreeformWorkflowRow {
  const now = new Date().toISOString();
  const row: FreeformWorkflowRow = {
    id: `ff_${Math.random().toString(36).slice(2, 10)}`,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    status: "draft",
    lastModified: now,
    createdAt: now,
    usedInCampaigns: 0,
    nodes: [],
    edges: [],
  };
  workflows = [row, ...workflows];
  listeners.forEach((l) => l());
  persistFreeform(row);
  return row;
}

/** Persist an in-progress graph + updated status. Called by the builder's Save
 *  handler. Preserves createdAt but bumps lastModified. */
export function saveFreeformWorkflow(
  id: string,
  patch: {
    name?: string;
    description?: string;
    status?: FreeformStatus;
    nodes?: FreeformNodeRecord[];
    edges?: FreeformEdgeRecord[];
  },
): void {
  let updated: FreeformWorkflowRow | undefined;
  workflows = workflows.map((w) => {
    if (w.id !== id) return w;
    // Locked workflows are immutable — a caller reaching here is a bug (the
    // builder gates Save behind the same lock check), but we still short-circuit
    // to keep the store honest.
    if (w.locked) return w;
    const next: FreeformWorkflowRow = {
      ...w,
      ...patch,
      lastModified: new Date().toISOString(),
    };
    updated = next;
    return next;
  });
  listeners.forEach((l) => l());
  if (updated) persistFreeform(updated);
}

/**
 * Delete a workflow. v1 rule: only Draft workflows can be deleted. Ready and
 * Locked rows show no delete affordance in the table, but we still guard here
 * so a rogue caller can't wipe protected data.
 */
export function deleteFreeformWorkflow(id: string): void {
  const target = workflows.find((w) => w.id === id);
  if (!target || target.status !== "draft" || target.locked) return;
  workflows = workflows.filter((w) => w.id !== id);
  listeners.forEach((l) => l());
  persistDelete(id);
}

/**
 * Freeze a workflow. Called by campaign Run creation when the campaign version
 * references this workflow. Idempotent: locking an already-locked workflow is
 * a no-op (preserves the original `lockedAt` timestamp).
 */
export function lockFreeformWorkflow(id: string): void {
  let updated: FreeformWorkflowRow | undefined;
  workflows = workflows.map((w) => {
    if (w.id !== id || w.locked) return w;
    const next = { ...w, locked: true, lockedAt: new Date().toISOString() };
    updated = next;
    return next;
  });
  listeners.forEach((l) => l());
  if (updated) persistFreeform(updated);
}

export function subscribeFreeformWorkflows(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/* --------------------------------- Helpers --------------------------------- */

/** All source-handle ids a freeform message node exposes. Used by the canvas to
 *  enforce "every branch must be wired"  -  an unwired button/row is treated as
 *  an incomplete configuration and blocks the workflow from going Ready. */
export function getBranchOutputs(
  kind: FreeformNodeKind,
  cfg: FreeformNodeConfig | undefined,
): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  if (!cfg) return out;
  if (kind === "list" && cfg.rows?.length) {
    for (const r of cfg.rows)
      out.push({ id: `row_${r.id}`, label: r.title || "Untitled" });
  }
  if (cfg.buttonsBlock) {
    if (cfg.buttonsBlock.mode === "quick_reply") {
      for (const b of cfg.buttonsBlock.buttons)
        out.push({ id: `btn_${b.id}`, label: b.label || "Untitled" });
    } else {
      const b = cfg.buttonsBlock.button;
      out.push({ id: `btn_${b.id}`, label: b.label || "URL" });
    }
  }
  return out;
}

/** Compute validity + error for a given kind + config. Used by the config panel
 *  every edit and by the canvas to derive the ready/draft workflow status. */
export function validateFreeformNode(
  kind: FreeformNodeKind,
  cfg: FreeformNodeConfig | undefined,
): { valid: boolean; error?: string } {
  const c = cfg ?? {};
  const buttonsErr = validateButtons(c.buttonsBlock);
  if (buttonsErr) return { valid: false, error: buttonsErr };

  switch (kind) {
    case "start":
    case "end":
      return { valid: true };
    case "text":
      if (!c.text?.trim()) return { valid: false, error: "Add message text" };
      if (c.text.length > META_LIMITS.textBody)
        return {
          valid: false,
          error: `Text exceeds ${META_LIMITS.textBody} chars`,
        };
      return { valid: true };
    case "image":
    case "video":
    case "document":
      if (!c.mediaSource) return { valid: false, error: "Choose media source" };
      if (c.mediaSource === "url" && !c.mediaUrl?.trim())
        return { valid: false, error: "Add media URL" };
      if (c.mediaSource === "upload" && !c.mediaFileName?.trim())
        return { valid: false, error: "Upload a file" };
      if (!c.caption?.trim())
        return { valid: false, error: "Caption is required" };
      if (c.caption.length > META_LIMITS.captionBody)
        return {
          valid: false,
          error: `Caption exceeds ${META_LIMITS.captionBody} chars`,
        };
      return { valid: true };
    case "list":
      if (!c.body?.trim()) return { valid: false, error: "Body is required" };
      if (c.body.length > META_LIMITS.listBody)
        return {
          valid: false,
          error: `Body exceeds ${META_LIMITS.listBody} chars`,
        };
      if ((c.header?.length ?? 0) > META_LIMITS.listHeader)
        return {
          valid: false,
          error: `Header exceeds ${META_LIMITS.listHeader} chars`,
        };
      if ((c.footer?.length ?? 0) > META_LIMITS.listFooter)
        return {
          valid: false,
          error: `Footer exceeds ${META_LIMITS.listFooter} chars`,
        };
      if (!c.buttonLabel?.trim())
        return { valid: false, error: "List button label is required" };
      if (c.buttonLabel.length > META_LIMITS.listButtonLabel)
        return {
          valid: false,
          error: `Button label exceeds ${META_LIMITS.listButtonLabel} chars`,
        };
      if (!c.rows?.length)
        return { valid: false, error: "Add at least one row" };
      if (c.rows.length > META_LIMITS.listMaxRows)
        return { valid: false, error: `Max ${META_LIMITS.listMaxRows} rows` };
      for (const r of c.rows) {
        if (!r.title.trim())
          return { valid: false, error: "Every row needs a title" };
        if (r.title.length > META_LIMITS.listRowTitle)
          return {
            valid: false,
            error: `Row title exceeds ${META_LIMITS.listRowTitle} chars`,
          };
        if ((r.description?.length ?? 0) > META_LIMITS.listRowDescription)
          return {
            valid: false,
            error: `Row description exceeds ${META_LIMITS.listRowDescription} chars`,
          };
      }
      return { valid: true };
  }
}

/**
 * Freeform disposition variables  -  the only variables a Conditional node inside
 * a freeform workflow can branch on. Deliberately narrow: this workflow runs in
 * isolation from the campaign audience/schema, and its only observable outputs
 * are the interactions the lead had with the message nodes above it.
 *
 *  - Text / Media with quick replies > `<serial>.button`  (value = clicked label)
 *  - Text / Media with CTA URL  > `<serial>.opened`  (bool)
 *  - List  > `<serial>.selected` (value = row title)
 *  - Any message node  > `<serial>.replied`  (bool, timeout gates)
 *
 * API node outputs come from the tool schema and are handled by the campaign's
 * own `deriveNodeOutcomeVariables` (which our canvas composes with these).
 */
export function deriveFreeformOutcomes(
  nodes: Array<{
    id: string;
    data: {
      kind: string;
      title?: string;
      serial?: string;
      config?: FreeformNodeConfig;
    };
  }>,
): { key: string; source: string }[] {
  const vars: { key: string; source: string }[] = [];
  const push = (key: string, source: string) => vars.push({ key, source });
  for (const n of nodes) {
    const { kind, title, serial, config } = n.data;
    if (!serial) continue;
    if (
      kind !== "text" &&
      kind !== "image" &&
      kind !== "video" &&
      kind !== "document" &&
      kind !== "list"
    )
      continue;
    const source = serial || title || kind;
    push(`${serial}.replied`, source);
    if (kind === "list") {
      if (config?.rows?.length) push(`${serial}.selected`, source);
    } else if (
      config?.buttonsBlock?.mode === "quick_reply" &&
      config.buttonsBlock.buttons.length
    ) {
      push(`${serial}.button`, source);
    } else if (config?.buttonsBlock?.mode === "cta_url") {
      push(`${serial}.opened`, source);
    }
  }
  const seen = new Set<string>();
  return vars.filter((v) =>
    seen.has(v.key) ? false : (seen.add(v.key), true),
  );
}

/* --------------------------- Placeholder scan --------------------------- */

/** A single `{{var}}` occurrence inside a freeform workflow  -  location tracked
 *  so the campaign-side mapping UI can tell the author *where* the variable
 *  came from (e.g. "text_1 · body" or "list_1 · row 'Morning' description"). */
export type FreeformPlaceholderLocation = {
  nodeId: string;
  nodeSerial: string;
  nodeTitle: string;
  part: string; // human label for the field
};
export type FreeformPlaceholder = {
  key: string; // the raw variable name inside {{ }}
  locations: FreeformPlaceholderLocation[];
};

// v1: variables inside `{{}}` are letters + underscore only. Tighter than the
// broader `[a-zA-Z0-9_.]+` we started with; dot-notation and digits inside
// placeholders are deferred. Digits still land in internal disposition names
// (e.g. `text_1.button`) but those don't sit inside `{{}}` placeholders.
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

function scanText(
  text: string | undefined,
  loc: Omit<FreeformPlaceholderLocation, "part"> & { part: string },
  sink: Map<string, FreeformPlaceholder>,
) {
  if (!text) return;
  PLACEHOLDER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLACEHOLDER_RE.exec(text))) {
    const key = m[1];
    if (!key) continue;
    const existing = sink.get(key);
    if (existing) {
      // Avoid duplicate locations if the same var appears twice in the same field.
      const seen = existing.locations.some(
        (l) => l.nodeId === loc.nodeId && l.part === loc.part,
      );
      if (!seen) existing.locations.push({ ...loc });
    } else {
      sink.set(key, { key, locations: [{ ...loc }] });
    }
  }
}

/**
 * Scan every text-bearing field in a workflow's freeform message nodes for
 * `{{var}}` placeholders. Button labels are deliberately skipped  -  Meta's
 * interactive-button spec doesn't allow variables in labels, so authors
 * shouldn't be lured into mapping them.
 *
 * Locations are grouped per unique key; the campaign-side mapping UI can show
 * a single input per variable and list all its occurrences underneath.
 */
export function getFreeformPlaceholders(
  nodes: FreeformNodeRecord[],
): FreeformPlaceholder[] {
  const sink = new Map<string, FreeformPlaceholder>();
  for (const n of nodes) {
    if (n.type !== "freeform") continue;
    const cfg = n.data.config as FreeformNodeConfig | undefined;
    const loc = {
      nodeId: n.id,
      nodeSerial: n.data.serial ?? n.id,
      nodeTitle:
        n.data.title ||
        FREEFORM_NODE_LABELS[n.data.kind as FreeformNodeKind] ||
        "",
    };
    switch (n.data.kind) {
      case "text":
        scanText(cfg?.text, { ...loc, part: "body" }, sink);
        break;
      case "image":
      case "video":
      case "document":
        scanText(cfg?.mediaUrl, { ...loc, part: "media URL" }, sink);
        scanText(cfg?.caption, { ...loc, part: "caption" }, sink);
        break;
      case "list":
        scanText(cfg?.header, { ...loc, part: "header" }, sink);
        scanText(cfg?.body, { ...loc, part: "body" }, sink);
        scanText(cfg?.footer, { ...loc, part: "footer" }, sink);
        for (const r of cfg?.rows ?? []) {
          scanText(
            r.title,
            { ...loc, part: `row "${r.title || "…"}" title` },
            sink,
          );
          scanText(
            r.description,
            { ...loc, part: `row "${r.title || "…"}" description` },
            sink,
          );
        }
        break;
    }
  }
  // Insertion order feels natural (top-to-bottom in the workflow).
  return Array.from(sink.values());
}

/* --------------------------- Campaign outputs --------------------------- */

/** Outputs a WhatsApp Freeform Workflow node exposes downstream in the parent
 *  *campaign*. Namespaced by the campaign node's serial, e.g. `ffw_1.status`,
 *  `ffw_1.text_1.button`, so a Conditional can branch on the freeform's result
 *  without breaking the campaign's variable-namespacing convention.
 *
 *  `status` is always present; per-node interaction variables come from the
 *  freeform's own dispositions, prefixed with the campaign serial.
 */
export function getFreeformCampaignOutputs(
  campaignSerial: string,
  nodes: FreeformNodeRecord[],
): { key: string; source: string }[] {
  const source = campaignSerial;
  const out: { key: string; source: string }[] = [
    { key: `${campaignSerial}.status`, source }, // completed | timed_out | failed
  ];
  const inner = deriveFreeformOutcomes(
    nodes
      .filter((n) => n.type === "freeform")
      .map((n) => ({
        id: n.id,
        data: n.data as {
          kind: string;
          title?: string;
          serial?: string;
          config?: FreeformNodeConfig;
        },
      })),
  );
  for (const v of inner)
    out.push({ key: `${campaignSerial}.${v.key}`, source });
  return out;
}

function validateButtons(b?: ButtonsBlock): string | undefined {
  if (!b) return undefined;
  if (b.mode === "quick_reply") {
    if (b.buttons.length === 0) return "Add at least one quick reply";
    if (b.buttons.length > META_LIMITS.maxQuickReplyButtons)
      return `Max ${META_LIMITS.maxQuickReplyButtons} quick replies`;
    for (const q of b.buttons) {
      if (!q.label.trim()) return "Every quick reply needs a label";
      if (q.label.length > META_LIMITS.buttonLabel)
        return `Button label exceeds ${META_LIMITS.buttonLabel} chars`;
    }
  } else {
    if (!b.button.label.trim()) return "CTA button label is required";
    if (b.button.label.length > META_LIMITS.buttonLabel)
      return `Button label exceeds ${META_LIMITS.buttonLabel} chars`;
    if (!b.button.url.trim()) return "CTA URL is required";
    if (!/^https?:\/\//i.test(b.button.url))
      return "CTA URL must start with http(s)://";
  }
  return undefined;
}
