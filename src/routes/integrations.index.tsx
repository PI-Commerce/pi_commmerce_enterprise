import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { AddConnectionDialog } from "@/components/connections/AddConnectionDialog";
import { AddCtConnectorDialog } from "@/components/clevertap/AddCtConnectorDialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, ChevronRight, ArrowDownLeft, Webhook, Send, BookOpen,
  MoreHorizontal, Power, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useConnections, platform, platformMark, PLATFORMS, LISTED_PUSH_TARGETS,
  BROKERED_OVERFLOW, HEALTH_LABEL, HEALTH_TONE, pushTarget,
  type PushTarget,
} from "@/lib/connections";
import {
  useCtConnectors, formatWaba, ctStatePill, updateCtConnector, removeCtConnector,
  type CtConnector,
} from "@/lib/clevertap";
import {
  useSmsConnections, smsStatePill, updateSmsConnection, removeSmsConnection,
  type SmsConnection,
} from "@/lib/clevertap-sms";
import {
  useMoeConnections, moeStatePill, updateMoeConnection, removeMoeConnection,
  type MoeConnection,
} from "@/lib/moengage-sms";
import {
  DELIVERY_LANES, DELIVERY_CHANNEL_LABEL,
  type DeliveryLane, type DeliveryChannel,
} from "@/lib/delivery";

export const Route = createFileRoute("/integrations/")({
  component: Connections,
  head: () => ({ meta: [{ title: "Connections · Pi Commerce Enterprise" }] }),
});

/**
 * Connections — every system Pi Commerce exchanges an audience with.
 *
 * Split by *direction*, because direction is the only thing that changes what a
 * client has to do. Pulling from a CRM means authorising, then agreeing what their
 * fields mean; being pushed to from a CLM means pasting a body into a journey and
 * nothing else, ever. Those are not two grades of the same task, so they are not
 * two rows in the same table.
 *
 * The push group carries no status of its own. There is nothing to be unhealthy:
 * no credential we hold, no sync we run, no token to expire. It is live because the
 * endpoint is generated per run and always has been.
 *
 * There is now a third direction, and it is not a variation on either. In the first
 * two, an audience changes hands and Pi Commerce runs the campaign. In the third the
 * other platform runs the campaign and we are the carrier — it hands us one finished
 * message at a time, we deliver it, we post the receipt back, and we never see who
 * was targeted or why. That is a different relationship, so it gets a band of its own
 * rather than a row among the engagement tools.
 *
 * All three engagement tools therefore appear twice on this page, which reads like a
 * duplicate and is not: pushing an audience at a Pi campaign and using Pi as your
 * delivery provider are separate products, separately configured, and a client can
 * genuinely be doing both with the same vendor.
 *
 * The carry group is the one place that has to state what it *cannot* do. It is a
 * matrix — platform × channel — and two cells of six are built, so all six are rows and
 * the four unbuilt ones are marked Soon. Leaving that implicit is what made the group
 * read as "CleverTap is the product" when it was first shipped, and putting it in a
 * chip strip above the table left the answer somewhere the table never referred to. Why
 * a given cell is unbuilt is not on the row: the answer is the same roadmap sentence
 * four times, and it is not something a client can act on.
 *
 * The two built cells are not two instances of one thing. CleverTap · WhatsApp issues a
 * connector per number; CleverTap · SMS issues a connection per set of DLT sender
 * headers, because under Generic SMS the header is a fixed value inside a payload the
 * client authors. They therefore have separate stores and separate detail pages, and
 * meet only here — which is why the Sender column is named for what the two have in
 * common rather than for either one's identifier.
 *
 * Order is by how much there is to do, most first: a delivery connector is issued and
 * configured here, a CRM is authorised here, and an engagement tool is configured
 * entirely inside someone else's product. The middle group has no rows to own for the
 * same reason it has no status — nothing on our side exists to have one.
 *
 * Only two of the three can be *added*, so the header carries one menu with exactly
 * those two items rather than a primary button for one of them. The button used to be
 * the CRM dialog, which opens on a screen that says engagement tools "need no
 * connection" — so the biggest control on the page answered a question nobody pressing
 * it had asked, and denied the delivery flow that was live two inches below it.
 */
function Connections() {
  const connections = useConnections();
  const ctConnectors = useCtConnectors();
  const smsConnections = useSmsConnections();
  const moeConnections = useMoeConnections();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [addingCt, setAddingCt] = useState(false);
  const [deleting, setDeleting] = useState<Pending | null>(null);

  const soon = PLATFORMS.filter((p) => !p.live);

  return (
    <AppShell>
      <PageHeader
        title="Connections"
        description="Every system we exchange an audience with lives here."
        actions={
          /* A verb-only trigger. This page keeps a real distinction between a
             connection (a CRM, holding a credential we use) and a connector (one
             WhatsApp number we carry on), so the nouns belong on the items — naming
             either one on the trigger would mislabel the other. */
          /* `modal={false}` is load-bearing, and was arrived at by breaking the page.
             A modal menu and a dialog both disable outside pointer events by pushing
             onto one shared stack, and each layer restores whatever it found on <body>
             when it unmounts. Open the dialog while the menu is still mounted and the
             dialog reads `pointer-events: none` as the value to put back — so when the
             dialog closes, <body> keeps it. The page then looks completely normal and
             is entirely unclickable. Suppressing the menu's own close (the obvious
             `e.preventDefault()`) guarantees that overlap rather than avoiding it.
             Non-modal, the menu never touches <body> at all, so there is nothing to
             overlap and no timing to get right. */
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[210px]">
              <DropdownMenuItem className="text-xs" onSelect={() => setAddingCt(true)}>
                <Send className="mr-2 h-3.5 w-3.5" /> Delivery connector
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onSelect={() => setAdding(true)}>
                <ArrowDownLeft className="mr-2 h-3.5 w-3.5" /> CRM source
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="space-y-7">
        {/* ── Carry: their campaign, our channel. No audience changes hands. ── */}
        <Group
          icon={Send}
          title="Platforms we deliver for"
          caption="The campaign is built in their tool. We issue a connector, they trigger the sends, and we deliver each message and report back. Every platform and channel we support is listed."
        >
          <table className="w-full text-sm">
            {/* "Sender", not "Number". The two live lanes are identified by different
                kinds of thing — a WhatsApp number and a set of DLT sender headers — and
                both are the sender the recipient sees. */}
            <TableHead cols={["Platform", "Channel", "Sender", "State", "Last activity"]} />
            <tbody className="divide-y divide-border">
              {laneRows(ctConnectors, smsConnections, moeConnections).map((r) => {
                const t = pushTarget(r.lane.platform);
                return (
                  <tr
                    key={`${r.lane.platform}-${r.channel}-${r.item?.id ?? r.kind}`}
                    onClick={r.item
                      ? () => navigate({ to: r.item!.route, params: { id: r.item!.id } })
                      : undefined}
                    className={cn(
                      r.item && "cursor-pointer transition-colors hover:bg-accent/30",
                      r.kind === "soon" && "bg-muted/20",
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className={cn("flex items-center gap-2.5", r.kind === "soon" && "opacity-55")}>
                        <span className={cn(
                          "grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px] font-semibold",
                          t.accent,
                        )}>
                          {platformMark(t.name)}
                        </span>
                        <span className="truncate font-medium">{t.name}</span>
                      </div>
                    </td>
                    <td className={cn(
                      "px-4 py-3 text-[12px]",
                      r.kind === "soon" ? "text-muted-foreground" : "text-foreground",
                    )}>
                      {DELIVERY_CHANNEL_LABEL[r.channel]}
                    </td>
                    <td className="px-4 py-3">
                      {r.item
                        ? <span className="font-mono text-[12px]">{r.item.name}</span>
                        : <span className="text-[12px] text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.item ? (
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", r.item.pill.tone)}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {r.item.pill.label}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {r.kind === "soon" ? "Soon" : "Nothing set up"}
                        </span>
                      )}
                    </td>
                    {/* An em dash rather than "Never" on one that has carried nothing.
                        The State cell one column left already says Draft, and spelling
                        the same fact twice in adjacent cells reads as two findings. */}
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">
                      {r.item?.activity ?? "—"}
                    </td>
                    {/* The row is still the way in; the menu is for the two things a row
                        click cannot express. `stopPropagation` on the cell, not on each
                        item — the content is portalled, so only the trigger bubbles. */}
                    <td
                      className="w-10 px-2 py-3 text-muted-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.item && (
                        <LaneMenu
                          item={r.item}
                          channel={r.channel}
                          onDelete={setDeleting}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Group>

        {/* ─────────────── Push: they send to us. No setup on our side. ─────────────── */}
        {/* `Webhook`, not an arrow. This group and the CRM group both describe data
            arriving at Pi, and they used to wear arrows pointing opposite ways — which
            read as a direction contrast that does not exist. The distinction that does
            exist is who initiates: they POST to us, we pull from them. */}
        <Group
          icon={Webhook}
          title="Engagement tools that trigger campaigns here"
          caption="The campaign is built here. Their journey calls its endpoint to trigger it as each person qualifies. Nothing to connect — open one for the body to paste in."
        >
          <table className="w-full text-sm">
            <TableHead cols={["Tool", "Where the body goes"]} />
            <tbody className="divide-y divide-border">
              {LISTED_PUSH_TARGETS.map((t) => (
                <tr
                  key={t.key}
                  onClick={() => navigate({ to: "/integrations/tool/$key", params: { key: t.key } })}
                  className="cursor-pointer transition-colors hover:bg-accent/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px] font-semibold", t.accent)}>
                        {platformMark(t.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{t.name}</div>
                        {/* The Status column is gone — there was nothing to report, and a
                            green pill here claimed three configured integrations that do
                            not exist. What replaces it is the one fact that differs per
                            row and decides whether the pasted body resolves: each tool
                            spells a merge field its own way. */}
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                          {t.token("first_name")}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">{t.pasteInto}</td>
                  {/* Not a chevron. Every other row on this page leads somewhere you
                      configure something; these three lead to a page that says outright
                      it has nothing to save. The pill was the only hint they differ in
                      kind, so removing it made the glyph carry the difference. */}
                  <td className="w-10 px-2 py-3 text-muted-foreground">
                    <BookOpen className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Group>

        {/* ─────────────── Pull: we read from them. Real integration work. ─────────── */}
        <Group
          icon={ArrowDownLeft}
          title="CRMs we pull audiences from"
          caption="The campaign is built here; the people come from there. Authorise once, then pick a segment as the audience on any campaign."
        >
          <table className="w-full text-sm">
            <TableHead cols={["Source", "Status", "Activity"]} />
            <tbody className="divide-y divide-border">
              {connections.map((c) => {
                const p = platform(c.platform);
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate({ to: "/integrations/$id", params: { id: c.id } })}
                    className="cursor-pointer transition-colors hover:bg-accent/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px] font-semibold", p.accent)}>
                          {platformMark(p.name)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{c.label}</div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {p.name} · added {c.createdAt}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", HEALTH_TONE[c.health])}>
                        <span className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          c.health === "healthy" ? "bg-current" : "animate-pulse bg-current",
                        )} />
                        {HEALTH_LABEL[c.health]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{c.signal}</td>
                    <td className="w-10 px-2 py-3 text-muted-foreground">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                );
              })}

              {/* Roadmap, stated rather than implied. These rows carry no activity
                  column on purpose — an integration we haven't built cannot have
                  synced anything, and a plausible-looking timestamp here would be
                  the single most misleading pixel on the page. */}
              {soon.map((p) => (
                <tr key={p.key} className="bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5 opacity-55">
                      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px] font-semibold", p.accent)}>
                        {platformMark(p.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          Pulls {p.audienceNoun}s · {p.auth === "oauth" ? "OAuth" : "access key"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {/* "Soon", matching the chip on the same platform's tile in the add
                        dialog. Both are a status chip on an unbuilt platform and were
                        spelled two ways only because the widths differed. */}
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Soon
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">—</td>
                  <td className="w-10 px-2 py-3" />
                </tr>
              ))}
            </tbody>
          </table>

          {/* Inside the card, not under the page. This is a note about CRMs, and as a
              page-level paragraph it inherited the `space-y-7` gap and read as a
              footnote to all three groups — including the two it says nothing about. */}
          <p className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
            Plus {BROKERED_OVERFLOW} more on the roadmap. If your audience is somewhere
            we don't reach yet, a CSV upload or the API payload source covers it on any
            run today.
          </p>
        </Group>
      </div>

      <AddConnectionDialog open={adding} onOpenChange={setAdding} />
      <AddCtConnectorDialog open={addingCt} onOpenChange={setAddingCt} />

      {/* One dialog for the table, driven by which row is pending — rather than one
          mounted per row. The sender is in the prompt because it is what the client
          recognises the row by; the id is not shown anywhere else on this page.
          Both lanes share this copy because both consequences are the same: their
          provider entry outlives ours, and the credential cannot be reissued. */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">
              Delete this {deleting?.channel === "sms" ? "connection" : "connector"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px]">
              {deleting?.name} stops existing. {deleting?.vendor}&rsquo;s provider entry
              keeps posting to an endpoint that is no longer there, so remove it on their
              side too. The credentials cannot be reissued — a new one gets new ones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="h-8 bg-destructive text-xs text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleting) return;
                if (deleting.platform === "moengage") removeMoeConnection(deleting.id);
                else if (deleting.channel === "sms") removeSmsConnection(deleting.id);
                else removeCtConnector(deleting.id);
                toast.success("Deleted", {
                  description: `${deleting.name} · remove the provider entry in ${deleting.vendor}`,
                });
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

/**
 * What the delete dialog needs, which is less than the record it came from.
 *
 * `platform` is here because `channel` stopped being enough to name a store the
 * moment a second vendor shipped an SMS lane: CleverTap SMS and MoEngage SMS are both
 * `channel: "sms"` and live in different stores, so dispatching on the channel alone
 * would delete from the wrong one.
 */
type Pending = {
  id: string;
  name: string;
  channel: DeliveryChannel;
  platform: PushTarget["key"];
  /** The vendor's display name, for copy that names where the leftover entry lives. */
  vendor: string;
};

/**
 * Row actions for one set-up lane.
 *
 * Delete is gated on the row already being disabled, and the item stays visible while
 * it is blocked rather than being hidden. Hiding it makes the client hunt for a control
 * that is right there; showing it greyed with the reason under it teaches the order in
 * one glance — and the step that unblocks it is the item directly above.
 *
 * The gate is not ceremony. Disabled makes the endpoint reject, which is a signal
 * CleverTap can read and act on; deleting outright leaves their provider entry posting
 * into nothing. Disable-then-delete is the sequence that tells the other side what
 * happened, so it is the only sequence offered.
 *
 * One menu across both lanes, branching on `channel` for which store to write. What is
 * shared is not incidental — the gate, the ordering and the reason for both are the
 * same fact about CleverTap's end, not ours.
 */
function LaneMenu({
  item,
  channel,
  onDelete,
}: {
  item: LaneItem;
  channel: DeliveryChannel;
  onDelete: (p: Pending) => void;
}) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem className="gap-2 text-xs" onClick={() => navigate({ to: item.route, params: { id: item.id } })}>
          <ChevronRight className="h-3.5 w-3.5" /> Open
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-xs"
          onClick={() => {
            const next = !item.enabled;
            if (item.platform === "moengage") updateMoeConnection(item.id, { enabled: next });
            else if (channel === "sms") updateSmsConnection(item.id, { enabled: next });
            else updateCtConnector(item.id, { enabled: next });
            toast.success(next ? "Enabled" : "Disabled", {
              description: next
                ? `${item.name} · sends are accepted again`
                : `${item.name} · sends are now rejected`,
            });
          }}
        >
          <Power className="h-3.5 w-3.5" />
          {item.enabled ? "Disable" : "Enable"}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={item.enabled}
          className="gap-2 text-xs text-destructive focus:text-destructive"
          onClick={() =>
            onDelete({
              id: item.id,
              name: item.name,
              channel,
              platform: item.platform,
              vendor: pushTarget(item.platform).name,
            })
          }
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </DropdownMenuItem>
        {item.enabled && (
          <p className="px-2 pb-1 pl-9 text-[11px] leading-snug text-muted-foreground">
            Disable it first, so CleverTap sees rejections rather than nothing.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * What one set-up lane instance looks like to this table.
 *
 * Reduced to the four things a row renders, and deliberately not the record itself. A
 * WhatsApp connector is recognised by its number and an SMS connection by the sender
 * headers it covers — different fields on different types, with no supertype worth
 * writing for two cases. So the lane-specific reading happens once, in
 * {@link laneRows}, and the JSX handles one shape.
 *
 * `route` is on the item for the same reason. The destination varies per lane, and
 * re-deriving it in the click handler is exactly how a row ends up opening the wrong
 * page — the two paths differ by one word and both accept any id. It is the route
 * pattern rather than an interpolated URL so the router still typechecks it; both
 * patterns take the same single `id`, which is what lets one call site serve both.
 */
type LaneItem = {
  id: string;
  /** Which store this record came from — see {@link Pending}. */
  platform: PushTarget["key"];
  /** The number, or the headers. Whatever the client recognises this one by. */
  name: string;
  pill: { label: string; tone: string };
  activity?: string;
  route:
    | "/integrations/clevertap/$id"
    | "/integrations/clevertap-sms/$id"
    | "/integrations/moengage-sms/$id";
  enabled: boolean;
};

type LaneRow = {
  lane: DeliveryLane;
  channel: DeliveryChannel;
  /** `soon` = the lane isn't built. `empty` = it is, and nothing is set up on it. */
  kind: "item" | "empty" | "soon";
  item?: LaneItem;
};

/**
 * Every lane we could carry on, whether or not anything is set up on it.
 *
 * The capability matrix used to be a chip strip above this table, on the argument that
 * capability and instances are different things and the first column meant a phone
 * number on every real row. Splitting Platform, Channel and Number into their own
 * columns retires that: the first column holds a platform name either way and Number
 * carries an em dash where there is nothing to name. So the six pairs are rows, which
 * is also what the CRM group already does with its unbuilt platforms.
 *
 * Lanes come from the registry rather than from the records, and that is the point — an
 * unbuilt lane has no record to be derived from. Which store answers for a lane is
 * resolved here, so nothing above branches on a vendor or a channel. Neither store
 * carries a `platform` field, because every record in both is CleverTap by
 * construction and a discriminant with one possible value is worse than deriving it.
 */
function laneRows(
  ctConnectors: CtConnector[],
  smsConnections: SmsConnection[],
  moeConnections: MoeConnection[],
): LaneRow[] {
  const itemsFor = (lane: DeliveryLane, channel: DeliveryChannel): LaneItem[] => {
    if (lane.platform === "moengage") {
      /* MoEngage has no WhatsApp lane to carry — custom connectors are SMS-only — so
         there is no whatsapp branch here, only the guard that keeps one from being
         added by reflex. */
      if (channel !== "sms") return [];
      return moeConnections.map((c) => ({
        id: c.id,
        platform: "moengage",
        /* The workspace, because MoEngage allows one provider per domain and so one
           connection per workspace — the workspace is the thing it is one of. */
        name: c.workspace,
        pill: moeStatePill(c),
        activity: c.lastRequestAt,
        route: "/integrations/moengage-sms/$id",
        enabled: c.enabled,
      }));
    }
    if (lane.platform !== "clevertap") return [];
    if (channel === "whatsapp") {
      return ctConnectors.map((c) => ({
        id: c.id,
        platform: "clevertap",
        name: formatWaba(c.wabaNumber),
        pill: ctStatePill(c),
        activity: c.lastMessageAt,
        route: "/integrations/clevertap/$id",
        enabled: c.enabled,
      }));
    }
    return smsConnections.map((c) => ({
      id: c.id,
      platform: "clevertap",
      /* The headers, not the id or a nickname. CleverTap does not name an SMS provider
         after anything of ours the way it names a WhatsApp one after the number, so the
         sender set is the only identifier both sides can see. */
      name: c.headers.join(", "),
      pill: smsStatePill(c),
      activity: c.lastMessageAt,
      route: "/integrations/clevertap-sms/$id",
      enabled: c.enabled,
    }));
  };

  return DELIVERY_LANES.flatMap((lane) =>
    lane.channels.flatMap(({ channel, live }): LaneRow[] => {
      if (!live) return [{ lane, channel, kind: "soon" }];
      const found = itemsFor(lane, channel);
      return found.length
        ? found.map((item) => ({ lane, channel, kind: "item" as const, item }))
        : [{ lane, channel, kind: "empty" }];
    }),
  );
}

/**
 * A titled band. The caption carries the rule for the whole group, so no row has to
 * repeat it.
 *
 * No `action` slot. Adding is a page-level affordance now — there is one menu, in the
 * header, listing the two things that can be added — and a per-group button next to it
 * would be a second way to reach one of the two items.
 */
function Group({
  icon: Icon, title, caption, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex min-w-0 items-start gap-2">
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-secondary text-muted-foreground">
          <Icon className="h-3 w-3" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-tight">{title}</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{caption}</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">{children}</div>
    </section>
  );
}

function TableHead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
        {cols.map((c) => (
          <th key={c} className="px-4 py-2.5 text-left font-medium">{c}</th>
        ))}
        <th className="w-10 px-2 py-2.5" />
      </tr>
    </thead>
  );
}
