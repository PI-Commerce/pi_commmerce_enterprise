import { createFileRoute } from "@tanstack/react-router";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import type { AgentType } from "@/lib/agent-data";

export const Route = createFileRoute("/agents/new")({
  component: CreateAgent,
  validateSearch: (s: Record<string, unknown>): { type: AgentType } => ({
    type: s.type === "voice" ? "voice" : "chat",
  }),
  head: () => ({
    meta: [
      { title: "New agent · Pi Commerce Enterprise" },
      { name: "description", content: "Create a new voice or chat AI agent." },
    ],
  }),
});

function CreateAgent() {
  const { type } = Route.useSearch();
  return <AgentBuilder mode="create" type={type} />;
}
