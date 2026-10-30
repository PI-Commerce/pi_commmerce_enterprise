/**
 * An entry point *is* its editor — there is no separate detail view. What it does
 * is authored here; the numbers it produces live where every other aggregate does
 * (Analytics → Inbound, filtered to this entry point) alongside the session list
 * on `/inbound`.
 *
 * The editor is a canvas. An inbound entry point carries a journey — look
 * something up, branch on the answer, split traffic, hand to an agent — and the
 * shape of that is the thing being authored. See `InboundBuilderCanvas`.
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
  // and which agents can answer, so it is chosen before the editor opens rather
  // than being switchable underneath an already-configured entry point.
  validateSearch: (s: Record<string, unknown>): { channel?: InboundChannel } => ({
    channel:
      s.channel === "voice" ? "voice"
      : s.channel === "webhook" ? "webhook"
      : s.channel === "whatsapp" ? "whatsapp"
      : undefined,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `${params.id === "new" ? "New entry point" : "Edit entry point"} · Pi Commerce Enterprise` },
      { name: "description", content: "Author how an inbound arrival is routed to an agent." },
    ],
  }),
});

function InboundBuilderRoute() {
  const { id } = Route.useParams();
  const { channel } = Route.useSearch();
  const navigate = useNavigate();
  const isNew = id === "new";

  // Resolved once at mount; live edits then belong to the form's own state. `null`
  // means an id was given but no such entry point exists — say so rather than
  // opening a blank form, which would look like the routing had been wiped and
  // would write an empty graph over the id on the next save.
  const [ep] = useState<EntryPoint | null>(() => {
    if (!isNew) return getEntryPoints().find((e) => e.id === id) ?? null;
    const ch: InboundChannel = channel ?? "whatsapp";
    return {
      id: newEntryPointId(),
      name: "",
      description: "",
      channel: ch,
      addresses: [],
      status: "draft",
      // A blank entry point is just the arrival. Everything after it is authored.
      graph: {
        nodes: [{
          id: "trigger",
          position: { x: 0, y: 0 },
          data: {
            kind: "inboundTrigger",
            title: "Inbound Trigger",
            serial: "trigger_1",
            locked: true,
            valid: true,
            /* The channel travels onto the trigger so its config panel can offer only
               the kinds this channel produces — without it the panel falls back to
               WhatsApp and a voice entry point is offered keyword matching. */
            config: {
              channel: ch,
              triggerKind: ch === "webhook" ? "webhook" : "any_message",
            },
          },
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
