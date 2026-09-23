import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AgentBuilderCanvas } from "@/components/agents/builder/AgentBuilderCanvas";
import {
  getAgentRecord, newAgentId, type AgentRecord, type AgentType,
} from "@/lib/agent-data";

export const Route = createFileRoute("/agents/builder/$id")({
  component: AgentBuilderRoute,
  validateSearch: (s: Record<string, unknown>): { type?: AgentType; name?: string } => ({
    type: s.type === "voice" ? "voice" : s.type === "chat" ? "chat" : undefined,
    name: typeof s.name === "string" ? s.name : undefined,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `${params.id === "new" ? "New agent" : `Agent ${params.id}`} · Pi Commerce Enterprise` },
      { name: "description", content: "Visual builder for voice & chat AI agents with RAG and tools." },
    ],
  }),
});

function AgentBuilderRoute() {
  const { id } = Route.useParams();
  const { type, name } = Route.useSearch();
  const isNew = id === "new";

  // Resolve the record once at mount. A new agent mints a fresh id and opens
  // blank on the default model config; an existing one loads from the store.
  const [record] = useState<AgentRecord>(() => {
    if (!isNew) {
      const found = getAgentRecord(id);
      if (found) return found;
    }
    return {
      id: isNew ? newAgentId() : id,
      name: name?.trim() ?? "",
      type: type ?? "chat",
      status: "draft",
      tools: [],
      masterPrompt: "",
      knowledgeBase: "",
      postCall: [],
      modelConfigId: "mc_default",
    };
  });

  return <AgentBuilderCanvas record={record} isNew={isNew} />;
}
