/**
 * Session details.
 *
 * Presented as the same centred modal, with the same field-grid, that Campaigns
 * uses for Run details — a session and a run are the same kind of object to an
 * operator (one unit of work, its configuration, and how it ended), so they read
 * the same way. Fields sit in a two-column grid of bordered cards, absent values
 * render as an em dash rather than collapsing the row, and the terminal state is
 * a labelled pill at the foot.
 *
 * Deliberately NOT a full L2 view. A session row answers the same question a
 * campaign's Logs row answers — who was this, where did it land, how did it end.
 * The conversation itself, every message and every call, lives in the Inbox on
 * the lead, next to that same person's campaign traffic and demarcated from it.
 * Duplicating the transcript here would fork the place you read a conversation
 * into two, and only one of them has the campaign half for context. The footer
 * links straight to it.
 *
 * The outcome block reads the handling agent's `postCall` schema directly. When
 * the agent declares none we say so explicitly rather than rendering an empty
 * panel, because "no outcomes configured" and "outcomes all empty" are different
 * problems for the operator.
 */
import { Link } from "@tanstack/react-router";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAgent } from "@/lib/agent-data";
import { useEntryPoint, fmtDuration, fmtMs, fmtTime, CHANNEL_LABEL, type Session } from "@/lib/inbound";
import { describeRoute } from "@/lib/inbound-graph";
import { StatusTag } from "./SessionBits";
import { OUTCOME_REASON_LABEL } from "@/lib/inbound";
import { Megaphone, ArrowUpRight } from "lucide-react";

export function SessionSheet({
  session,
  onClose,
}: {
  session: Session | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-y-auto sm:max-w-2xl">
        {session && <Body session={session} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ session, onClose }: { session: Session; onClose: () => void }) {
  const agent = useAgent(session.agentId);
  const ep = useEntryPoint(session.entryPointId);
  const route = ep ? describeRoute(ep.graph, session.routePath) : undefined;
  const outcomeKeys = Object.keys(session.outcome);

  return (
    <>
      <DialogHeader className="mb-5">
        <DialogTitle className="text-xl font-semibold tracking-tight">
          Session details
        </DialogTitle>
        <DialogDescription className="text-[13px]">
          View routing and result for{" "}
          <span className="font-mono font-medium text-foreground">{session.id}</span>.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Contact" value={session.contact.name} />
        <Field label="Phone" value={session.contact.phone} mono />
        <Field label="Entry point" value={ep?.name} />
        <Field label="Channel" value={CHANNEL_LABEL[session.channel]} />
        <Field label="Handled by" value={agent?.name} mono={!!agent} />
        <Field label="Turns" value={String(session.turnCount)} />
        <Field label="Started" value={fmtTime(session.startedAt)} />
        <Field
          label="Duration"
          value={session.durationMs === undefined ? undefined : fmtDuration(session.durationMs)}
        />
        <Field
          label="First response"
          value={session.firstResponseMs === undefined ? undefined : fmtMs(session.firstResponseMs)}
        />
        <Field label="Session ID" value={session.id} mono />
        <Field label="Path taken" value={route} className="sm:col-span-2" />
        {session.handoffReason && (
          <Field label="Handoff reason" value={session.handoffReason} className="sm:col-span-2" />
        )}
      </div>

      {session.referral && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-ai/25 bg-ai/5 px-4 py-3">
          <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai" />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Attribution
            </p>
            <p className="mt-1 text-[14px] font-medium">{session.referral.adName}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {session.referral.adId}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              Click-to-WhatsApp — the message carried a Meta ad referral, which is what
              routed it to the sales rule rather than service.
            </p>
          </div>
        </div>
      )}

      {/* Was labelled "Status" and rendered the stage, which were two different
          things wearing one label. Status is the axis; the reason is why. */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-medium">Status</span>
        <StatusTag status={session.status} />
        {session.outcomeReason && (
          <span className="text-[12px] text-muted-foreground">
            {OUTCOME_REASON_LABEL[session.outcomeReason]}
          </span>
        )}
      </div>

      <div className="mt-5">
        {/* Not the outcome axis — these are the agent's own extraction fields,
            and sharing the word with a state axis was confusing when there was
            one. */}
        <p className="mb-2 text-[13px] font-medium">What the agent extracted</p>
        {!agent ? (
          <Empty>No agent handled this session, so no outcomes were extracted.</Empty>
        ) : agent.postCall.length === 0 ? (
          <Empty>
            <span className="font-mono">{agent.name}</span> has no outcome schema
            configured. Add post-call variables on the agent to make its sessions
            measurable.
          </Empty>
        ) : outcomeKeys.length === 0 ? (
          <Empty>Session did not reach a state where outcomes are extracted.</Empty>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {outcomeKeys.map((k) => (
              <div key={k} className="flex items-baseline justify-between gap-3 px-4 py-2">
                <span className="font-mono text-[11.5px] text-muted-foreground">{k}</span>
                <span className="text-right text-[12.5px] font-medium">
                  {session.outcome[k]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The conversation lives in the Inbox, with the lead's campaign traffic. */}
      <Link
        to="/inbox"
        search={{ lead: session.leadId }}
        className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/60"
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-foreground">
            Read the conversation in Inbox
          </span>
          <span className="block text-[11.5px] text-muted-foreground">
            {session.turnCount} {session.turnCount === 1 ? "turn" : "turns"} · alongside{" "}
            {session.contact.name}&rsquo;s campaign messages
          </span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>

      <DialogFooter className="mt-6">
        <Button onClick={onClose}>Close</Button>
      </DialogFooter>
    </>
  );
}

/** One label/value cell. An absent value renders an em dash so the grid keeps its
 *  shape — a missing field is information, a collapsed row is just a gap. */
function Field({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-muted/25 px-4 py-2.5", className)}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-[14px] leading-snug",
          mono && "font-mono text-[13px]",
          value ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {value || "—"}
      </p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-3 text-[12px] leading-snug text-muted-foreground">
      {children}
    </p>
  );
}
