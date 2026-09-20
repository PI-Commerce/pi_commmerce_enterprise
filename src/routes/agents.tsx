import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { usePublishSurface } from "@/lib/pi-screen-actions";

export const Route = createFileRoute("/agents")({
  component: AgentsLayout,
});

/**
 * Layout for every /agents/* route. Publishes a Pi screen surface with the
 * `open_agent` handler so Ask Pi can land the user inside the builder for a
 * newly-drafted agent (see the agents surface's `open_agent` tool + the
 * agents system prompt's draft-flow step 5).
 *
 * The dead-zone override for the Tools tab is published from
 * `agents.index.tsx` because tab state lives there; the surface handler
 * stays live everywhere on /agents. Pi is disabled on Tools anyway and
 * won't call open_agent from there.
 */
function AgentsLayout() {
  const navigate = useNavigate();

  const registration = useMemo(
    () => ({
      surfaceId: "agents",
      handlers: {
        open_agent: (args: Record<string, unknown>) => {
          const id = typeof args.id === "string" ? args.id : null;
          if (!id) return;
          navigate({ to: "/agents/$id", params: { id } });
        },
      },
    }),
    [navigate],
  );
  usePublishSurface(registration);

  return <Outlet />;
}
