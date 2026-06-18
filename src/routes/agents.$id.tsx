import { createFileRoute } from "@tanstack/react-router";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import { getAgentRecord, AGENT_RECORDS } from "@/lib/agent-data";

export const Route = createFileRoute("/agents/$id")({
  component: EditAgent,
  head: ({ params }) => ({
    meta: [{ title: `Agent ${params.id} · Pi Commerce Enterprise` }],
  }),
});

function EditAgent() {
  const { id } = Route.useParams();
  const record = getAgentRecord(id) ?? AGENT_RECORDS.a_concierge;
  return <AgentBuilder mode="edit" type={record.type} record={record} />;
}
