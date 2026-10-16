import { createFileRoute } from "@tanstack/react-router";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import { getAgentTemplate, type AgentType } from "@/lib/agent-data";

export const Route = createFileRoute("/agents/new")({
  component: CreateAgent,
  validateSearch: (s: Record<string, unknown>): { type: AgentType; template?: string } => ({
    type: s.type === "voice" ? "voice" : "chat",
    template: typeof s.template === "string" ? s.template : undefined,
  }),
  head: () => ({
    meta: [
      { title: "New agent · Pi Commerce Enterprise" },
      { name: "description", content: "Create a new voice or chat AI agent." },
    ],
  }),
});

function CreateAgent() {
  const { type, template } = Route.useSearch();
  const record = template ? getAgentTemplate(type, template)?.record : undefined;
  return <AgentBuilder mode="create" type={type} record={record} />;
}
