import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/agents")({
  component: AgentsLayout,
});

function AgentsLayout() {
  return <Outlet />;
}
