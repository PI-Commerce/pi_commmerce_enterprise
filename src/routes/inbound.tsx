import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/inbound")({
  component: InboundLayout,
});

function InboundLayout() {
  return <Outlet />;
}
