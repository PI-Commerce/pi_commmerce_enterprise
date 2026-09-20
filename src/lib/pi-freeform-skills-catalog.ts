/**
 * Ask Pi — Freeform skills catalog.
 *
 * The curated "book of moves" the freeform-scope Pi draws on for
 * skeleton-first WhatsApp Freeform Workflow building. Analogue of
 * {@link ./pi-skills-catalog.ts} — same shape, freeform-adapted:
 *
 *  - Freeform workflows have ONE classification dimension: `intent`
 *    (support_faq, appointment_booking, feedback_capture, ...). No
 *    industry axis — freeform is WhatsApp-only, 24h-window-scoped,
 *    business-vertical-agnostic.
 *  - Skeletons draw from freeform node kinds only (text / image / list /
 *    apiToolCall + start / end). No audience, no per-branch conditionals
 *    against lead attributes — branching happens on quick-reply buttons
 *    and list rows.
 *  - `needs` on a skeleton node lists the config keys still required
 *    after the skeleton lands (e.g. `["text"]` on a text node, `["rows",
 *    "buttonLabel", "body"]` on a list). Feeds suggest_next_step so the
 *    user sees a targeted "fix X" chip per invalid node.
 *
 * Kept as a plain TS module (not D1) so the catalog is deterministic and
 * ships with the code. Extend by adding entries here.
 */
import type { FreeformNodeKind } from "@/lib/freeform-types";

/** One node in a canonical freeform skeleton. `id` follows the workspace
 *  `<kind>_<n>` convention so the canvas + Pi's follow-up update_node
 *  calls can reference the exact node the skeleton installed.
 *
 *  `kind` includes the two shared logic kinds (`apiToolCall`,
 *  `conditional`) alongside the freeform-owned kinds — Pi's brief can
 *  wire an API call or a conditional inside a freeform flow, and
 *  insertFreeformSkeleton has to handle those. Renderer split (freeform
 *  node vs campaign workflow node) happens on the client. */
export type FreeformSkeletonNode = {
  id: string;
  kind: FreeformNodeKind | "apiToolCall" | "conditional";
  title: string;
  description?: string;
  /** Config keys still needed after the skeleton lands. Drives
   *  suggest_next_step + the "open config" tally the client shows. */
  needs?: string[];
  /** Optional Phase-1 config Pi seeds when the brief NAMED concrete
   *  content (list row titles, quick-reply button labels, cta_url link
   *  URLs, apiTool handle). Merged over the auto-seeded structural
   *  scaffold in insertFreeformSkeleton — auto handles fill in for
   *  anything Pi omits. */
  config?: Record<string, unknown>;
};

export type FreeformSkeletonEdge = {
  id: string;
  source: string;
  target: string;
  /** Named handle when the source has multiple outputs. For freeform:
   *  `btn_<id>` for a quick-reply button, `row_<id>` for a list row. */
  sourceHandle?: string;
};

export type FreeformSkeleton = {
  /** Human title for the shape ("Support FAQ — 3-topic list"). */
  title: string;
  /** One-line summary. Shown in chips + confirm cards. */
  summary: string;
  nodes: FreeformSkeletonNode[];
  edges: FreeformSkeletonEdge[];
};

export type FreeformFollowUp = {
  id: string;
  label: string;
  hint?: string;
};

/** The seven canonical freeform conversation intents. Deliberately kept
 *  small — more intents = more classifier confusion. Extend cautiously. */
export const FREEFORM_INTENTS = [
  "support_faq",
  "appointment_booking",
  "feedback_capture",
  "cart_recovery",
  "product_info",
  "notify_confirm",
  "quick_answer",
  "other",
] as const;
export type FreeformIntent = typeof FREEFORM_INTENTS[number];

/** Keyword hints per intent. Used by classify_brief on the freeform side. */
export const FREEFORM_INTENT_KEYWORDS: Record<FreeformIntent, string[]> = {
  support_faq: ["faq", "help", "support", "issue", "problem", "trouble", "not working", "broken"],
  appointment_booking: ["book", "booking", "appointment", "slot", "schedule", "test drive", "consultation", "reserve"],
  feedback_capture: ["feedback", "rating", "rate", "csat", "nps", "survey", "review", "experience"],
  cart_recovery: ["cart", "abandon", "checkout", "left", "left behind", "recovery"],
  product_info: ["product", "info", "details", "features", "spec", "specifications", "catalog"],
  notify_confirm: ["confirm", "confirmation", "notify", "reminder", "acknowledge"],
  quick_answer: ["quick", "yes no", "yes/no", "menu", "pick", "options"],
  other: [],
};

export type FreeformCatalogEntry = {
  intent: FreeformIntent;
  /** Label shown in chips. */
  label: string;
  /** Chip hint (one-line). */
  hint: string;
  /** Words / phrases the classifier looks for. Case-insensitive. */
  keywords: string[];
  skeleton: FreeformSkeleton;
  /** Suggested next steps after the skeleton lands. */
  followUps: FreeformFollowUp[];
};

/* ------------------------------------------------------------------------ *
 *  Canonical freeform skeletons
 *
 *  Each skeleton is CONFIG-LESS on the content side (text bodies, media
 *  urls, list rows are blank) so the user + Pi can fill them in Phase 2
 *  without fighting stub copy. Structural fields (buttonsBlock modes,
 *  rows array with 3 empty rows for a list picker) ARE seeded so the
 *  branching shape is obvious the moment the skeleton lands.
 * ------------------------------------------------------------------------ */

/** Common empty text node — one node, one outgoing edge to end. */
const SKELETON_TEXT_ONLY: FreeformSkeleton = {
  title: "Simple text reply",
  summary: "One text message, then end.",
  nodes: [
    { id: "text_1", kind: "text", title: "Reply", needs: ["text"] },
  ],
  edges: [
    { id: "e_start_text_1", source: "start", target: "text_1" },
    { id: "e_text_1_end", source: "text_1", target: "end" },
  ],
};

const FREEFORM_CATALOG: FreeformCatalogEntry[] = [
  /* -------- support_faq -------- */
  {
    intent: "support_faq",
    label: "Support FAQ (list of topics)",
    hint: "Greeting + list picker + one answer per topic",
    keywords: FREEFORM_INTENT_KEYWORDS.support_faq,
    skeleton: {
      title: "Support FAQ — 3-topic list",
      summary: "Greeting → list of FAQ topics → answer per topic → end.",
      nodes: [
        { id: "text_1", kind: "text", title: "Greeting", needs: ["text"] },
        { id: "list_1", kind: "list", title: "Pick a topic", needs: ["body", "buttonLabel", "rows"] },
        { id: "text_2", kind: "text", title: "Answer: topic 1", needs: ["text"] },
        { id: "text_3", kind: "text", title: "Answer: topic 2", needs: ["text"] },
        { id: "text_4", kind: "text", title: "Answer: topic 3", needs: ["text"] },
      ],
      edges: [
        { id: "e_start_text_1", source: "start", target: "text_1" },
        { id: "e_text_1_list_1", source: "text_1", target: "list_1" },
        // List row branches — sourceHandle uses `row_<id>` per canvas
        // convention. Skeleton row ids are `r1`/`r2`/`r3`; Pi's later
        // update_node replaces them with real row objects but the same
        // ids so the edges keep landing.
        { id: "e_list_1_text_2", source: "list_1", target: "text_2", sourceHandle: "row_r1" },
        { id: "e_list_1_text_3", source: "list_1", target: "text_3", sourceHandle: "row_r2" },
        { id: "e_list_1_text_4", source: "list_1", target: "text_4", sourceHandle: "row_r3" },
        { id: "e_text_2_end", source: "text_2", target: "end" },
        { id: "e_text_3_end", source: "text_3", target: "end" },
        { id: "e_text_4_end", source: "text_4", target: "end" },
      ],
    },
    followUps: [
      { id: "fill_greeting", label: "Write the greeting" },
      { id: "fill_topics", label: "Name the 3 FAQ topics" },
      { id: "fill_answers", label: "Draft the 3 answers" },
    ],
  },

  /* -------- appointment_booking -------- */
  {
    intent: "appointment_booking",
    label: "Appointment booking (slot picker)",
    hint: "Greeting + slot list + confirmation → end",
    keywords: FREEFORM_INTENT_KEYWORDS.appointment_booking,
    skeleton: {
      title: "Appointment booking — 3 slot picker",
      summary: "Greeting → list of time slots → confirm booking → end.",
      nodes: [
        { id: "text_1", kind: "text", title: "Greeting", needs: ["text"] },
        { id: "list_1", kind: "list", title: "Pick a slot", needs: ["body", "buttonLabel", "rows"] },
        { id: "text_2", kind: "text", title: "Confirm booking", needs: ["text"] },
      ],
      edges: [
        { id: "e_start_text_1", source: "start", target: "text_1" },
        { id: "e_text_1_list_1", source: "text_1", target: "list_1" },
        { id: "e_list_1_text_2_a", source: "list_1", target: "text_2", sourceHandle: "row_r1" },
        { id: "e_list_1_text_2_b", source: "list_1", target: "text_2", sourceHandle: "row_r2" },
        { id: "e_list_1_text_2_c", source: "list_1", target: "text_2", sourceHandle: "row_r3" },
        { id: "e_text_2_end", source: "text_2", target: "end" },
      ],
    },
    followUps: [
      { id: "fill_slots", label: "Name the 3 time slots" },
      { id: "fill_greeting", label: "Write the greeting" },
      { id: "fill_confirm", label: "Draft the confirmation message" },
    ],
  },

  /* -------- feedback_capture -------- */
  {
    intent: "feedback_capture",
    label: "Feedback capture (Great/OK/Poor)",
    hint: "3-button rating + follow-up per rating",
    keywords: FREEFORM_INTENT_KEYWORDS.feedback_capture,
    skeleton: {
      title: "Feedback capture — 3-rating quick reply",
      summary: "Greeting with 3 quick-reply ratings → follow-up per rating → end.",
      nodes: [
        { id: "text_1", kind: "text", title: "Ask for rating", needs: ["text", "buttonsBlock"] },
        { id: "text_2", kind: "text", title: "Thank (Great)", needs: ["text"] },
        { id: "text_3", kind: "text", title: "Ask more (OK)", needs: ["text"] },
        { id: "text_4", kind: "text", title: "Apologize (Poor)", needs: ["text"] },
      ],
      edges: [
        { id: "e_start_text_1", source: "start", target: "text_1" },
        // Quick-reply branches — sourceHandle uses `btn_<id>` per canvas
        // convention. Skeleton ids are `b1`/`b2`/`b3`.
        { id: "e_text_1_text_2", source: "text_1", target: "text_2", sourceHandle: "btn_b1" },
        { id: "e_text_1_text_3", source: "text_1", target: "text_3", sourceHandle: "btn_b2" },
        { id: "e_text_1_text_4", source: "text_1", target: "text_4", sourceHandle: "btn_b3" },
        { id: "e_text_2_end", source: "text_2", target: "end" },
        { id: "e_text_3_end", source: "text_3", target: "end" },
        { id: "e_text_4_end", source: "text_4", target: "end" },
      ],
    },
    followUps: [
      { id: "fill_prompt", label: "Write the rating prompt" },
      { id: "fill_followups", label: "Draft the 3 follow-up messages" },
    ],
  },

  /* -------- cart_recovery -------- */
  {
    intent: "cart_recovery",
    label: "Cart recovery (Continue vs Help)",
    hint: "Reminder + 2 quick-reply buttons + response per choice",
    keywords: FREEFORM_INTENT_KEYWORDS.cart_recovery,
    skeleton: {
      title: "Cart recovery — 2-button reminder",
      summary: "Reminder with Continue / Need help → response per choice → end.",
      nodes: [
        { id: "text_1", kind: "text", title: "Reminder + choice", needs: ["text", "buttonsBlock"] },
        { id: "text_2", kind: "text", title: "Response: Continue", needs: ["text"] },
        { id: "text_3", kind: "text", title: "Response: Need help", needs: ["text"] },
      ],
      edges: [
        { id: "e_start_text_1", source: "start", target: "text_1" },
        { id: "e_text_1_text_2", source: "text_1", target: "text_2", sourceHandle: "btn_b1" },
        { id: "e_text_1_text_3", source: "text_1", target: "text_3", sourceHandle: "btn_b2" },
        { id: "e_text_2_end", source: "text_2", target: "end" },
        { id: "e_text_3_end", source: "text_3", target: "end" },
      ],
    },
    followUps: [
      { id: "fill_reminder", label: "Write the reminder message" },
      { id: "fill_responses", label: "Draft both response messages" },
    ],
  },

  /* -------- product_info -------- */
  {
    intent: "product_info",
    label: "Product info (list of products)",
    hint: "Picker list + info card per product",
    keywords: FREEFORM_INTENT_KEYWORDS.product_info,
    skeleton: {
      title: "Product info — 3-item list",
      summary: "Greeting → list of products → info image per product → end.",
      nodes: [
        { id: "text_1", kind: "text", title: "Greeting", needs: ["text"] },
        { id: "list_1", kind: "list", title: "Pick a product", needs: ["body", "buttonLabel", "rows"] },
        { id: "image_1", kind: "image", title: "Product 1 info", needs: ["mediaSource", "caption"] },
        { id: "image_2", kind: "image", title: "Product 2 info", needs: ["mediaSource", "caption"] },
        { id: "image_3", kind: "image", title: "Product 3 info", needs: ["mediaSource", "caption"] },
      ],
      edges: [
        { id: "e_start_text_1", source: "start", target: "text_1" },
        { id: "e_text_1_list_1", source: "text_1", target: "list_1" },
        { id: "e_list_1_image_1", source: "list_1", target: "image_1", sourceHandle: "row_r1" },
        { id: "e_list_1_image_2", source: "list_1", target: "image_2", sourceHandle: "row_r2" },
        { id: "e_list_1_image_3", source: "list_1", target: "image_3", sourceHandle: "row_r3" },
        { id: "e_image_1_end", source: "image_1", target: "end" },
        { id: "e_image_2_end", source: "image_2", target: "end" },
        { id: "e_image_3_end", source: "image_3", target: "end" },
      ],
    },
    followUps: [
      { id: "fill_products", label: "Name the 3 products" },
      { id: "fill_images", label: "Upload the 3 product images" },
    ],
  },

  /* -------- notify_confirm -------- */
  {
    intent: "notify_confirm",
    label: "Notify + confirm",
    hint: "Notification with 1 confirm button → acknowledgement → end",
    keywords: FREEFORM_INTENT_KEYWORDS.notify_confirm,
    skeleton: {
      title: "Notify + confirm — 1-button ack",
      summary: "Notification with Confirm button → acknowledgement → end.",
      nodes: [
        { id: "text_1", kind: "text", title: "Notification + confirm", needs: ["text", "buttonsBlock"] },
        { id: "text_2", kind: "text", title: "Acknowledgement", needs: ["text"] },
      ],
      edges: [
        { id: "e_start_text_1", source: "start", target: "text_1" },
        { id: "e_text_1_text_2", source: "text_1", target: "text_2", sourceHandle: "btn_b1" },
        { id: "e_text_2_end", source: "text_2", target: "end" },
      ],
    },
    followUps: [
      { id: "fill_notification", label: "Write the notification" },
      { id: "fill_ack", label: "Draft the acknowledgement" },
    ],
  },

  /* -------- quick_answer -------- */
  {
    intent: "quick_answer",
    label: "Quick answer (3-button menu)",
    hint: "Text with 3 quick-reply options + short answer per",
    keywords: FREEFORM_INTENT_KEYWORDS.quick_answer,
    skeleton: {
      title: "Quick answer — 3-button menu",
      summary: "Prompt with 3 quick-reply buttons → short answer per button → end.",
      nodes: [
        { id: "text_1", kind: "text", title: "Prompt + 3 options", needs: ["text", "buttonsBlock"] },
        { id: "text_2", kind: "text", title: "Answer: option 1", needs: ["text"] },
        { id: "text_3", kind: "text", title: "Answer: option 2", needs: ["text"] },
        { id: "text_4", kind: "text", title: "Answer: option 3", needs: ["text"] },
      ],
      edges: [
        { id: "e_start_text_1", source: "start", target: "text_1" },
        { id: "e_text_1_text_2", source: "text_1", target: "text_2", sourceHandle: "btn_b1" },
        { id: "e_text_1_text_3", source: "text_1", target: "text_3", sourceHandle: "btn_b2" },
        { id: "e_text_1_text_4", source: "text_1", target: "text_4", sourceHandle: "btn_b3" },
        { id: "e_text_2_end", source: "text_2", target: "end" },
        { id: "e_text_3_end", source: "text_3", target: "end" },
        { id: "e_text_4_end", source: "text_4", target: "end" },
      ],
    },
    followUps: [
      { id: "fill_prompt", label: "Write the prompt" },
      { id: "fill_answers", label: "Draft the 3 short answers" },
    ],
  },

  /* -------- other (fallback) -------- */
  {
    intent: "other",
    label: "Simple reply",
    hint: "One text message, then end",
    keywords: [],
    skeleton: SKELETON_TEXT_ONLY,
    followUps: [
      { id: "fill_message", label: "Write the message" },
    ],
  },
];

export { FREEFORM_CATALOG };
