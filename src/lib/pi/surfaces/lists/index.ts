/**
 * Ask Pi — lists surface manifest.
 *
 * Serves every "table + dock" page in the sidebar: /campaigns list,
 * /campaigns Runs / Data tabs, /broadcasts. Each request carries a
 * `surfaceId` on the context so Pi only sees the screen tools that
 * apply to the current page (filter status, run action, open modal).
 *
 * Free-text response (no terminator). Structured-response variants
 * (like /analytics) get their own surface.
 *
 * Self-registers with the kernel registry on import.
 */
import { registerSurface, type SurfaceModule, type SurfaceContext } from "@/lib/pi/kernel";
import {
  emitActionLink,
  analyticsReadTools,
} from "@/lib/pi/common/tools";
import { SYSTEM_ANALYTICS, buildScreenToolsSystemAddendum } from "./system";
import { screenToolsForContext } from "./tools/screen";

export const listsSurface: SurfaceModule = {
  id: "lists",
  // Dynamic prompt: appends a per-surface addendum keyed on the
  // client-published `surfaceId` so Pi knows which screen tools are
  // live and how to call them on THIS page.
  systemPrompt: (ctx: SurfaceContext) => {
    const raw = ctx.request.context?.surfaceId;
    const surfaceId = typeof raw === "string" ? raw : undefined;
    const addendum = surfaceId ? buildScreenToolsSystemAddendum(surfaceId) : "";
    return SYSTEM_ANALYTICS + addendum;
  },
  tools: [
    // Base analytics reads — Pi answers "how many leads?" etc. without
    // ever needing a screen tool.
    ...analyticsReadTools,
    // Escape hatch — deep-link out when the user is dead-ended on the
    // current page (no WA number connected, no CSV in library, etc.).
    emitActionLink,
  ],
  // Screen tools are surface-scoped — the client publishes `surfaceId`
  // and we hand Pi ONLY the subset that map to that page. Matches the
  // pre-refactor `screenToolsForSurface(surfaceId)` filter exactly.
  contextualTools: screenToolsForContext,
  // No context assembler — the client passes the surface state
  // (filters, selected rows) via `data.context` and Pi reads it from
  // there. Adding a server-side assembler is a natural Phase 3 win
  // once the pattern is proven.
};

registerSurface(listsSurface);
