import { createFileRoute, redirect } from "@tanstack/react-router";

// /channels lands on the only live channel.
export const Route = createFileRoute("/channels/")({
  beforeLoad: () => {
    throw redirect({ to: "/channels/whatsapp" });
  },
});
