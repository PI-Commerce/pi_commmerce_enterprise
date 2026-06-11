// I3 — node-level Pi suggestions (L2 "optimization" layer).
//
// These are NOT shown on every node. A node only surfaces a hint when its
// `data.piHint` explicitly references one of the suggestions below (see how the
// seed graph tags only a couple of nodes). That keeps the optimization layer
// sparse and intentional — Pi points at the one or two places that genuinely
// benefit, not at the whole graph.
//
// Each suggestion is *real*: `apply()` is a pure graph transform that returns the
// next nodes/edges, so clicking "Ask Pi to apply" actually edits the campaign
// (fixes an invalid node, rewrites a message, inserts a step…). `result` is what
// Pi shows on the composer's result card as the proposed change before the user
// confirms it.

import type { Node, Edge } from "reactflow";
import type { WorkflowNodeData } from "@/lib/campaign-types";
import type { PiResult } from "@/lib/ask-pi-context";

export type SuggestionGraph = { nodes: Node<WorkflowNodeData>[]; edges: Edge[] };

export type NodeSuggestion = {
  id: string;
  /** One-line benchmark stat that motivates the change (popover). */
  benchmark: string;
  /** The concrete optimization Pi proposes (popover). */
  tip: string;
  /** Narrative pre-filled into Ask Pi's input when the user asks Pi to apply. */
  prompt: string;
  /** Proposed-change card shown before the user confirms. */
  result: PiResult;
  /**
   * Pure transform run when the user confirms. Receives the live graph and the id
   * of the node the hint sits on; returns the next graph. Implementations always
   * clear their own node's `piHint` so the tip retires once applied.
   */
  apply: (nodes: Node<WorkflowNodeData>[], edges: Edge[], nodeId: string) => SuggestionGraph;
};

/** Patch one node's data (and always drop its piHint so the tip retires). */
function patchNode(
  nodes: Node<WorkflowNodeData>[],
  nodeId: string,
  patch: Partial<WorkflowNodeData>,
): Node<WorkflowNodeData>[] {
  return nodes.map((n) =>
    n.id === nodeId ? { ...n, data: { ...n.data, ...patch, piHint: undefined } } : n,
  );
}

const SUGGESTIONS: Record<string, NodeSuggestion> = {
  // FIX + optimize an invalid Voice Call: assign agent, set the high-converting
  // call window, add a retry. Flips the node from invalid → valid live on canvas.
  voice_window: {
    id: "voice_window",
    benchmark: "Voice AI calls convert ~2.3× better when they land 10am–1pm local time.",
    tip: "Assign the reactivation agent and set a 10am–1pm window with one retry.",
    prompt:
      "Finish this Voice Call: assign the reactivation agent, set a 10am–1pm IST call window, and add one retry.",
    result: {
      text: "I'll complete the Voice Call — assign the reactivation agent “Aria”, set a 10:00–13:00 IST call window, and enable a single retry. That clears the node's missing-agent error.",
      diff: [
        "+ agent    Aria (reactivation)",
        "+ window   10:00–13:00 IST",
        "+ retry    1× after 1h",
      ],
      cta: "Apply changes",
    },
    apply: (nodes, edges, id) => ({
      nodes: nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                piHint: undefined,
                valid: true,
                error: undefined,
                subtitle: "Aria · 10am–1pm IST · 1 retry",
                config: {
                  ...n.data.config,
                  agent: "Aria (Reactivation)",
                  callStart: "10:00",
                  callEnd: "13:00",
                  timezone: "Asia/Kolkata",
                  maxAttempts: 2,
                  retryInterval: "1h",
                },
              },
            }
          : n,
      ),
      edges,
    }),
  },

  // EDIT a generic WhatsApp template into a personalized one — name merge + a
  // dynamic offer code. Visibly rewrites the node's subtitle.
  wa_personalize: {
    id: "wa_personalize",
    benchmark: "Personalized offer codes lift WhatsApp click-through ~12% vs generic copy.",
    tip: "Personalize the template with the contact's name and a dynamic offer code.",
    prompt:
      "Personalize this WhatsApp message — merge the contact's first name and a dynamic discount_value offer code.",
    result: {
      text: "I'll personalize the WhatsApp template: greet with the contact's first name and drop in a dynamic offer code from discount_value.",
      diff: [
        "+ {{first_name}}     in the greeting",
        "+ {{discount_value}} dynamic offer code",
        "- generic “Hi there” opener",
      ],
      cta: "Apply changes",
    },
    apply: (nodes, edges, id) => ({
      nodes: nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                piHint: undefined,
                subtitle: "Personalized · reactivate_v3 + offer",
                config: {
                  ...n.data.config,
                  waVarMap: [
                    { v: "first_name", def: "there" },
                    { v: "discount_value", def: "10%" },
                  ],
                },
              },
            }
          : n,
      ),
      edges,
    }),
  },
};

/** Resolve a suggestion by the id a node carries in `data.piHint`. */
export function getSuggestion(id?: string): NodeSuggestion | undefined {
  return id ? SUGGESTIONS[id] : undefined;
}
