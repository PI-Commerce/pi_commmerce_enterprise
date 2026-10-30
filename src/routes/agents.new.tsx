import { createFileRoute, redirect } from "@tanstack/react-router";
import type { AgentType } from "@/lib/agent-data";

/**
 * Legacy entry point. The agent builder now lives at /agents/builder/new; keep
 * this route as a redirect so existing links (and the old ?type search) resolve.
 */
export const Route = createFileRoute("/agents/new")({
  validateSearch: (s: Record<string, unknown>): { type: AgentType } => ({
    type: s.type === "voice" ? "voice" : "chat",
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/agents/builder/$id",
      params: { id: "new" },
      search: { type: search.type },
    });
  },
});
