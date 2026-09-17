import { createFileRoute } from "@tanstack/react-router";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import { useAgents } from "@/lib/agent-store";

export const Route = createFileRoute("/agents/$id")({
  component: EditAgent,
  head: ({ params }) => ({
    meta: [{ title: `Agent ${params.id} · Pi Commerce Enterprise` }],
  }),
});

function EditAgent() {
  const { id } = Route.useParams();
  const agents = useAgents();
  const record = agents[id];
  if (!record) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Agent not found.
      </div>
    );
  }
  return <AgentBuilder mode="edit" type="voice" record={record} />;
}
