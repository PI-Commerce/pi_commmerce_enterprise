/**
 * Routing, grouped by the thing it is actually a property of: the number.
 *
 * The entry points list answers "what have I built". It cannot answer "what happens
 * to a message arriving on +91 80 4718 2200", because that depends on every entry
 * point bound to that number and the order they are tested in — and nothing in the
 * product showed a number at all.
 *
 * Which is how somebody creates a Click-to-WhatsApp entry point on a number that
 * already takes any inbound message, and never finds out it will not fire.
 *
 * Claims first in author order, then the one fallback, pinned last and visibly
 * unmovable. The conflicts are the reason this screen earns its place: a number
 * with two catch-alls has no defined answer, and one with none drops whatever it
 * does not claim.
 */
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, AlertTriangle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChannelIcon } from "@/components/inbound/SessionBits";
import {
  useEntryPoints, saveEntryPoint, routingByAddress, kindsOf, isFallback, primaryAddress,
  defaultRouteOrder, TRIGGER_KIND_LABEL, ROUTING_CONFLICT_COPY,
  type EntryPoint, type NumberRouting,
} from "@/lib/inbound";

export function RoutingByNumber() {
  const eps = useEntryPoints();
  const routing = useMemo(() => routingByAddress(eps), [eps]);

  if (routing.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">No entry points are bound to a number yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-snug text-muted-foreground">
        What happens to an arrival on each number, in the order it is tested. Entry points
        that claim specific arrivals are tried first; the one that takes any inbound
        message answers whatever is left.
      </p>
      {routing.map((r) => (
        <NumberCard key={r.address} routing={r} />
      ))}
    </div>
  );
}

function NumberCard({ routing }: { routing: NumberRouting }) {
  const navigate = useNavigate();
  const { address, claims, fallback, conflicts } = routing;

  /* Reordering writes an explicit position on every claim, not just the two that
     swapped. A list where some rows carry an order and others fall back to a
     default re-sorts unpredictably the next time one is added. */
  const move = (index: number, delta: number) => {
    const next = [...claims];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    next.forEach((ep, i) => saveEntryPoint({ ...ep, routeOrder: i }));
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/30 px-4 py-2.5">
        <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
          <ChannelIcon channel={routing.channel} />
        </span>
        <span className="font-mono text-[12.5px] font-medium">{address}</span>
        <span className="text-[11px] text-muted-foreground">
          {claims.length} {claims.length === 1 ? "claim" : "claims"}
          {fallback ? " · 1 fallback" : " · no fallback"}
        </span>
      </header>

      {conflicts.length > 0 && (
        <div className="space-y-1.5 border-b border-border px-4 py-2.5">
          {conflicts.map((c) => (
            <div key={`${c.code}:${"entryPointIds" in c ? c.entryPointIds.join() : ""}`} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-warning">
                  {ROUTING_CONFLICT_COPY[c.code].title}
                </p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {/* The overlap conflict names the entry points and the thing they
                      collide on; the generic line follows as the remedy. */}
                  {"detail" in c ? `${c.detail} ` : ""}
                  {ROUTING_CONFLICT_COPY[c.code].detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <ol className="divide-y divide-border">
        {claims.map((ep, i) => (
          <Row
            key={ep.id}
            ep={ep}
            position={i + 1}
            onOpen={() => navigate({ to: "/inbound/$id", params: { id: ep.id } })}
            onUp={i > 0 ? () => move(i, -1) : undefined}
            onDown={i < claims.length - 1 ? () => move(i, 1) : undefined}
          />
        ))}
        {fallback && (
          <Row
            ep={fallback}
            position={claims.length + 1}
            fallback
            onOpen={() => navigate({ to: "/inbound/$id", params: { id: fallback.id } })}
          />
        )}
      </ol>
    </section>
  );
}

function Row({
  ep, position, fallback, onOpen, onUp, onDown,
}: {
  ep: EntryPoint;
  position: number;
  fallback?: boolean;
  onOpen: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const kinds = kindsOf(ep);
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/30">
      <span className="w-4 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
        {position}
      </span>

      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium">{ep.name}</span>
          {ep.status !== "live" && (
            <span className="rounded border border-border bg-secondary px-1 py-px text-[9.5px] capitalize text-muted-foreground">
              {ep.status}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {kinds.map((k) => (
            <span
              key={k}
              className={cn(
                "rounded px-1 py-px text-[10px]",
                fallback
                  ? "border border-border bg-background text-muted-foreground"
                  : "bg-secondary text-foreground/80",
              )}
            >
              {TRIGGER_KIND_LABEL[k]}
            </span>
          ))}
        </div>
      </button>

      {fallback ? (
        /* No arrows. Its position is not a preference — every claim has to be
           tried before the thing that catches what they missed. */
        <span className="flex shrink-0 items-center gap-1 text-[10.5px] text-muted-foreground">
          <Inbox className="h-3 w-3" /> always last
        </span>
      ) : (
        <span className="flex shrink-0 items-center">
          <Button
            variant="ghost" size="sm" disabled={!onUp}
            className="h-7 w-7 p-0 text-muted-foreground disabled:opacity-25"
            onClick={onUp} aria-label="Move up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="sm" disabled={!onDown}
            className="h-7 w-7 p-0 text-muted-foreground disabled:opacity-25"
            onClick={onDown} aria-label="Move down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        </span>
      )}
    </li>
  );
}

/**
 * Said at authoring time, where it can still change what somebody builds.
 *
 * The canvas used to carry an unreachable-path detector; removing the canvas
 * removed it, and this is the part worth having back. A claim created under a
 * fallback that already takes everything is the exact shape of the bug.
 */
export function ShadowWarning({ ep }: { ep: EntryPoint }) {
  const eps = useEntryPoints();
  const warning = useMemo(() => {
    /* Checked against the first bound number. An entry point on several numbers
       can be shadowed on one and clear on another, and naming the first is enough
       to send somebody to the Routing view where every number is laid out. */
    const address = primaryAddress(ep).trim();
    if (!address) return undefined;
    const siblings = eps.filter(
      (e) => e.id !== ep.id && e.addresses.some((a) => a.trim() === address),
    );
    if (siblings.length === 0) return undefined;

    if (isFallback(ep)) {
      const other = siblings.find(isFallback);
      return other
        ? `${other.name} already takes any inbound message on this number. Only one entry point can, so narrow one of them or pause it.`
        : undefined;
    }

    const myOrder = ep.routeOrder ?? defaultRouteOrder(kindsOf(ep));
    const above = siblings.find(
      (e) => isFallback(e) && (e.routeOrder ?? 99) <= myOrder,
    );
    return above
      ? `${above.name} takes any inbound message on this number and is tested first, so these arrivals reach it instead. Reorder them under Routing.`
      : undefined;
  }, [eps, ep]);

  if (!warning) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      <p className="text-[11.5px] leading-snug text-warning">{warning}</p>
    </div>
  );
}
