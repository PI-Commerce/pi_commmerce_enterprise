import { createFileRoute } from "@tanstack/react-router";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import { getAgentTemplate } from "@/lib/agent-data";

export const Route = createFileRoute("/agents/new")({
  component: CreateAgent,
  validateSearch: (s: Record<string, unknown>): { template?: string } => ({
    template: typeof s.template === "string" ? s.template : undefined,
  }),
  head: () => ({
    meta: [
      { title: "New agent · Pi Commerce Enterprise" },
      { name: "description", content: "Create a new AI agent." },
    ],
  }),
});

function CreateAgent() {
  const { template } = Route.useSearch();
  const record = template ? getAgentTemplate(template)?.record : undefined;
  return <AgentBuilder mode="create" record={record} />;
}
