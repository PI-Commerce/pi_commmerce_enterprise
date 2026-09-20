/**
 * Ask Pi kernel — shared types.
 *
 * This module is intentionally product-ignorant. Nothing in here says
 * "campaign", "agent", "template" or "analytics". A surface plugs its
 * product-specific knowledge (system prompt, tool schemas, tool handlers,
 * context assembler) into the kernel, and the kernel runs the loop.
 *
 * Design goal: swap the kernel out (say, Anthropic → OpenAI) and no
 * surface has to change; add a new surface, and no kernel file has to
 * change.
 */

/** One line in the audit log the kernel emits back to the caller.
 *  Args + result are JSON-encoded so the client can render them without
 *  the kernel guessing what shape they are. */
export type ToolCallLog = {
  name: string;
  args: string;
  result: string;
};

/** Anthropic and OpenAI both accept "OpenAI-style" tool defs
 *  (name + description + JSONSchema parameters). The kernel converts
 *  to each provider's exact wire shape internally.
 *
 *  This is the ONLY tool-def shape the kernel understands. Surfaces
 *  produce these; the kernel doesn't care where they came from.
 */
export type NormalizedToolDef = {
  name: string;
  description: string;
  /** JSONSchema for the tool's `input` object. `unknown` because the
   *  kernel never inspects it — it just forwards to the provider. */
  parameters: unknown;
};

/** Closure the caller provides. The kernel calls this every time the
 *  model emits a tool_use block. The kernel doesn't dispatch by name
 *  itself — that's the surface's job. Return anything JSON-serializable;
 *  the kernel stringifies before posting back to the model. */
export type ToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown> | unknown;

/** Per-loop tuning knobs. All optional — kernel supplies sane defaults.
 *  Meant to be exposed to surfaces so /analytics can pick a tight cap
 *  and /builder can pick a roomy one. */
export type LoopConfig = {
  /** How many round trips before we bail with `exceeded_tool_rounds`.
   *  Default: 8. */
  maxRounds?: number;
  /** Extended thinking token budget per round (Anthropic only). Default: 5000.
   *  Set to 0 to skip the `thinking` block entirely (still keeps thinking
   *  enabled with a floor budget; Anthropic disallows zero). */
  thinkingBudget?: number;
  /** Cap on total response tokens per round. Default:
   *  max(thinkingBudget + 4096, 12000). */
  maxTokens?: number;
  /** If set, the loop terminates the moment the model emits a tool_use
   *  block whose name matches this. The tool's raw `input` becomes the
   *  structured answer (attached to `LoopResult.structured`); the tool
   *  handler is NOT invoked. Used by structured-response surfaces like
   *  analytics-dashboard which terminate on `emit_answer`. When unset
   *  (the default), the loop terminates when the model emits no tool
   *  calls (free-text mode). */
  terminateOnToolCall?: string;
};

/** What every loop takes. This is the kernel's public API. */
export type LoopRequest = {
  /** The full system prompt the model sees. Surfaces are free to
   *  concatenate context into this; the kernel does NOT try to merge
   *  or inject anything. */
  systemContent: string;
  /** Tools the model can call this turn. Provided by the surface. */
  tools: NormalizedToolDef[];
  /** The current user message. */
  question: string;
  /** Prior turns to seed the conversation. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Optional structured context. If non-empty, the Anthropic loop folds
   *  it into the system prompt as a `## Current context` block; the TFY
   *  loop pushes it as a system message. Surfaces that already merged
   *  their context into `systemContent` should leave this undefined. */
  context?: Record<string, unknown>;
  /** How to actually run a tool. Called with (name, args); returns
   *  anything JSON-serializable. */
  executor: ToolExecutor;
  /** Optional tuning knobs. */
  config?: LoopConfig;
};

/** Uniform loop return. `answer` is the concatenated text from the
 *  terminal turn (free-text mode) or a stringified form of the terminator
 *  tool's args (structured mode). `structured` is populated only when
 *  the loop terminated via `terminateOnToolCall` — surfaces that expect
 *  a typed payload should read this and cast/parse it. `toolCalls` is
 *  every executor call across every round, in order, so the client can
 *  render "here's what Pi did". */
export type LoopResult =
  | { ok: true; answer: string; toolCalls: ToolCallLog[]; structured?: unknown }
  | { ok: false; error: string };

/* -------------------------------------------------------------------------- */
/* Surface module contract (Phase 2)                                           */
/* -------------------------------------------------------------------------- */

/** Context every tool handler + prompt fn receives. Product-agnostic on
 *  purpose — the kernel doesn't know what fields `request.context` holds.
 *  Surfaces cast when they need typed access. */
export type SurfaceContext<Ctx = Record<string, unknown>> = {
  /** Which surface is handling this request. Same as SurfaceModule.id. */
  surfaceId: string;
  /** Whatever the client passed in the request body's `context` field.
   *  Free-form because different surfaces publish different shapes. */
  request: {
    question: string;
    context?: Ctx;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };
  /** Injected runtime env — for handlers that need D1/KV bindings. Typed
   *  as unknown here so the kernel stays product-agnostic; each surface
   *  casts to its own Env type at the top of its handler files. */
  env: unknown;
};

/** A tool the surface owns. Schema + handler live in the same object so
 *  they can't drift. When the kernel dispatches, it calls `handler(args,
 *  ctx)` and JSON-stringifies whatever comes back before posting it to
 *  the model. */
export type SurfaceTool<Ctx = Record<string, unknown>> = NormalizedToolDef & {
  handler: (
    args: Record<string, unknown>,
    ctx: SurfaceContext<Ctx>,
  ) => Promise<unknown> | unknown;
};

/** The unit the kernel loads per user-visible Pi surface. One folder =
 *  one SurfaceModule = one first-class sidebar item. */
export type SurfaceModule<Ctx = Record<string, unknown>> = {
  /** Stable id — must match the client's route/surface. */
  id: string;
  /** Base system prompt. Can be a fn that reads the assembled context
   *  if the prompt needs to vary by surface subtype (e.g. adding a
   *  screen-tools addendum when a specific surfaceId is active). */
  systemPrompt: string | ((ctx: SurfaceContext<Ctx>) => string);
  /** Tools this surface owns unconditionally (schema + handler colocated).
   *  Merged with `contextualTools(ctx)` at dispatch time. Shared-pool
   *  tools come from `uses:` in Phase 3. */
  tools: SurfaceTool<Ctx>[];
  /** Tools whose availability depends on the request (typically the
   *  client-published `surfaceId` inside `ctx.request.context`). Used by
   *  the `lists` surface to expose only the screen tools relevant to
   *  the current page. Merged with `tools` — dedup is caller's
   *  responsibility (name collisions win to `tools`). */
  contextualTools?: (ctx: SurfaceContext<Ctx>) => SurfaceTool<Ctx>[];
  /** Shared pools this surface borrows tools from. Phase 3 placeholder;
   *  kernel currently ignores. Values: `"analytics-reads"`, `"asset-reads"`,
   *  `"graph-reads"`, `"classification"`, etc. */
  uses?: string[];
  /** Called once per turn before the loop starts. Return value is folded
   *  into the system prompt as `## Current context`. Leave undefined if
   *  the client-supplied context is enough. */
  assembleContext?: (ctx: SurfaceContext<Ctx>) => Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined;
  /** Optional per-turn diagnostic attached to the response. Fed the same
   *  `assembled` object that `assembleContext` returned. */
  attachDiagnostic?: (assembled: Record<string, unknown> | undefined) => unknown;
  /** Loop tuning knobs per surface. Kernel default: { maxRounds: 8,
   *  thinkingBudget: 5000 }. */
  loop?: LoopConfig;
  /** Surfaces this one can hand off to (Phase 4 primitive). */
  handoffTargets?: string[];
};

/** Kernel-level defaults. Exported so surface manifests can reference
 *  them when overriding. */
export const KERNEL_DEFAULTS = {
  maxRounds: 8,
  thinkingBudget: 5000,
  minMaxTokens: 12000,
} as const;
