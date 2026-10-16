import { createFileRoute } from "@tanstack/react-router";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import { AgentView } from "@/components/agents/AgentView";
import { getAgentRecord, getEditableVersion, AGENT_RECORDS } from "@/lib/agent-data";

export const Route = createFileRoute("/agents/$id")({
  component: AgentDetail,
  validateSearch: (s: Record<string, unknown>): { edit?: boolean; v?: number; test?: boolean } => {
    const vNum = Number(s.v);
    return {
      edit: s.edit === true || s.edit === "true" ? true : undefined,
      v: Number.isFinite(vNum) && vNum > 0 ? vNum : undefined,
      test: s.test === true || s.test === "true" ? true : undefined,
    };
  },
  head: ({ params }) => ({
    meta: [{ title: `Agent ${params.id} · Pi Commerce Enterprise` }],
  }),
});

function AgentDetail() {
  const { id } = Route.useParams();
  const { edit, v, test } = Route.useSearch();

  if (!edit) return <AgentView id={id} initialVersion={v} openTest={test} />;

  // Edit resumes the draft if one exists, otherwise the active version.
  const editable = getEditableVersion(id);
  const record = editable?.record ?? getAgentRecord(id) ?? AGENT_RECORDS.a_concierge;
  return <AgentBuilder mode="edit" type={record.type} record={record} />;
}
