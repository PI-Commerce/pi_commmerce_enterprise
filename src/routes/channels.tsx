import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/channels")({
  component: ChannelsLayout,
});

function ChannelsLayout() {
  return <Outlet />;
}
