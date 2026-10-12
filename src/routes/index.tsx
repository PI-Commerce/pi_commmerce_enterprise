import { createFileRoute } from "@tanstack/react-router";
import { AskPiLanding } from "@/components/askpi/AskPiLanding";

export const Route = createFileRoute("/")({
  component: AskPiLanding,
  head: () => ({
    meta: [
      { title: "Ask Pi · Pi Commerce Enterprise" },
      { name: "description", content: "Describe a journey or agent in plain words — Pi drafts it and opens it in the builder." },
    ],
  }),
});
