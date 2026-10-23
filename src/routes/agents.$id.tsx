import { createFileRoute } from "@tanstack/react-router";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import { getAgentRecord, AGENT_RECORDS, getVersions, getEditableVersion } from "@/lib/agent-data";

export const Route = createFileRoute("/agents/$id")({
  component: EditAgent,
  validateSearch: (s: Record<string, unknown>): { v?: number } => {
    const n = Number(s.v);
    return { v: Number.isFinite(n) && n > 0 ? n : undefined };
  },
  head: ({ params }) => ({
    meta: [{ title: `Agent ${params.id} · Pi Commerce Enterprise` }],
  }),
});

function EditAgent() {
  const { id } = Route.useParams();
  const { v } = Route.useSearch();
  // Default: edit the editable version (draft if one exists, else active).
  // When ?v=N is set: hydrate from that specific version's record.
  const versions = getVersions(id);
  const picked = v != null ? versions.find((ver) => ver.version === v) : undefined;
  const record = picked?.record ?? getEditableVersion(id)?.record ?? getAgentRecord(id) ?? AGENT_RECORDS.a_concierge;
  return <AgentBuilder mode="edit" record={record} selectedVersion={picked?.version} />;
}
