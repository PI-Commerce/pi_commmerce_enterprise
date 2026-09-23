/**
 * An entry point *is* its canvas — the same shape as `/campaigns/$id`, which is
 * also the builder rather than a summary page. There is no separate detail view:
 * routing is the thing you author here, and the numbers it produces live where
 * every other aggregate does (Analytics → Inbound, filtered to this entry point)
 * alongside the session list on `/inbound`.
 */
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { InboundBuilderCanvas } from "@/components/inbound/builder/InboundBuilderCanvas";
import { getEntryPoints, newEntryPointId, type EntryPoint, type InboundChannel } from "@/lib/inbound";

export const Route = createFileRoute("/inbound/$id")({
  component: InboundBuilderRoute,
  // Channel is fixed at creation: it decides which signals the trigger publishes
  // and which agents can answer, so it is chosen before the canvas opens rather
  // than being switchable underneath an already-authored graph.
  validateSearch: (s: Record<string, unknown>): { channel?: InboundChannel } => ({
    channel: s.channel === "voice" ? "voice" : s.channel === "whatsapp" ? "whatsapp" : undefined,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `${params.id === "new" ? "New entry point" : "Edit routing"} · Pi Commerce Enterprise` },
      { name: "description", content: "Author how an inbound arrival is routed to an agent." },
    ],
  }),
});

function InboundBuilderRoute() {
  const { id } = Route.useParams();
  const { channel } = Route.useSearch();
  const navigate = useNavigate();
  const isNew = id === "new";

  // Resolved once at mount; live edits then belong to ReactFlow state. `null` means
  // an id was given but no such entry point exists — say so rather than opening a
  // blank canvas, which would look like the routing had been wiped and would write
  // an empty graph over the id on the next save.
  const [ep] = useState<EntryPoint | null>(() => {
    if (!isNew) return getEntryPoints().find((e) => e.id === id) ?? null;
    const ch: InboundChannel = channel ?? "whatsapp";
    return {
      id: newEntryPointId(),
      name: "",
      description: "",
      channel: ch,
      address: "",
      status: "draft",
      // A blank entry point is just the arrival. Everything after it is authored.
      graph: {
        nodes: [{
          id: "trigger",
          position: { x: 0, y: 0 },
          data: { kind: "inboundTrigger", title: "Inbound Trigger", serial: "trigger_1", locked: true, valid: true },
        }],
        edges: [],
      },
      createdAt: new Date().toISOString(),
    };
  });

  if (!ep) {
    return (
      <AppShell>
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Entry point not found.</p>
          <Button variant="outline" size="sm" className="mt-3 h-8 text-xs" onClick={() => navigate({ to: "/inbound" })}>
            Back to Inbound
          </Button>
        </div>
      </AppShell>
    );
  }

  return <InboundBuilderCanvas ep={ep} isNew={isNew} />;
}
