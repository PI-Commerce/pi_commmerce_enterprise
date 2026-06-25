/**
 * The CopilotKit runtime endpoint path. Client-safe (no server deps) so it can be
 * shared by the front-end provider, the Worker entry, and the server runtime.
 */
export const COPILOT_ENDPOINT = "/api/copilotkit";

/**
 * Delimiters bounding the system directive that the server folds into the latest user
 * turn (see `withSystemPrompt` in `runtime.server.ts`). CopilotKit mirrors the run-input
 * back into its message store, so the directive would otherwise render inside the user's
 * own chat bubble; the client strips everything up to and including {@link PI_PROMPT_END}
 * before display (see the custom `UserMessage` renderer in `AiComposer`). Defined here —
 * a client-safe module — so server and client share one source of truth.
 */
export const PI_PROMPT_MARKER = "[[pi-style]]";
export const PI_PROMPT_END = "[[/pi-style]]";

/**
 * Strip the folded system directive from a user message's display text. Returns the
 * user's own text when the marker is present, or the original string unchanged otherwise.
 */
export function stripPiPrompt(content: string): string {
  if (!content.startsWith(PI_PROMPT_MARKER)) return content;
  const end = content.indexOf(PI_PROMPT_END);
  if (end === -1) return content;
  return content.slice(end + PI_PROMPT_END.length).replace(/^\s+/, "");
}
