import { createFileRoute, redirect } from "@tanstack/react-router";

// The Ask Pi demo build leads with Campaigns — the only fully-live surface besides
// Analytics. The Dashboard route has been retired; hitting `/` always lands on the
// Campaigns list so users (and incoming links) never see the old dashboard shell.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/campaigns" });
  },
});
