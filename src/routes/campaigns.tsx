import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/campaigns")({
  component: CampaignsLayout,
});

function CampaignsLayout() {
  return <Outlet />;
}
