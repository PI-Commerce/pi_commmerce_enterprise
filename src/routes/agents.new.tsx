import { createFileRoute } from "@tanstack/react-router";
import { AgentBuilder } from "@/components/agents/AgentBuilder";

export const Route = createFileRoute("/agents/new")({
  component: CreateAgent,
  validateSearch: (): Record<string, never> => ({}),
  head: () => ({
    meta: [
      { title: "New agent · Pi Commerce Enterprise" },
      { name: "description", content: "Create a new voice AI agent." },
    ],
  }),
});

function CreateAgent() {
  return <AgentBuilder mode="create" type="voice" />;
}
