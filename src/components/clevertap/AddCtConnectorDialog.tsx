/**
 * Create a delivery connector.
 *
 * Three steps: which lane, then the lane's own fields, then the credentials. The last
 * split is forced by FR-1 rather than chosen for pacing — the password is shown once,
 * so if issuing it and confirming it were the same step, a client who closed the
 * dialog to check something would lose the credential and have to rotate before they
 * had ever used it. Nothing is generated until the lane's own fields are settled, and
 * once generated the dialog will not close quietly.
 *
 * The lane step is load-bearing rather than ceremonial. There are two live lanes and
 * they are not two labels on one flow: WhatsApp issues one connector per number,
 * because CleverTap names the provider after the number; SMS issues one connection
 * covering a *set* of DLT sender headers, because the header is a static value inside
 * CleverTap's payload and one provider can carry exactly one of them. So the lane
 * decides the middle step's question and which store gets written. Options come from
 * {@link liveLanes}, so a third lane shows up here without this file being touched —
 * though it will need its own branch, which is the honest cost of two flows that are
 * genuinely different rather than one parameterised flow.
 *
 * Both middle steps pick from a registry rather than accepting free text, for the same
 * reason. A typed WhatsApp number let someone create a connector for a number we have
 * no Meta sender for; it looked identical to a good one and failed every send with
 * 2002, which reads on CleverTap's side as *their* misconfiguration. A typed sender
 * header is worse: Indian operators reject it at the gateway with 906, minutes later,
 * aggregated across a whole campaign, against a configuration that looks correct.
 * Picking from {@link WABA_NUMBERS} and {@link DLT_HEADERS} removes both classes of
 * mistake rather than validating against them.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyRow } from "@/components/clevertap/CopyRow";
import { ArrowLeft, ArrowRight, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { pushTarget } from "@/lib/connections";
import {
  DELIVERY_CHANNEL_LABEL,
  liveLanes,
  type DeliveryChannel,
} from "@/lib/delivery";
import {
  WABA_NUMBERS,
  addCtConnector,
  ctMessagesEndpoint,
  ctTemplatesEndpoint,
  formatWaba,
  newConnectorId,
  newPassword,
  today,
  useCtConnectors,
  type CtConnector,
} from "@/lib/clevertap";
import {
  DLT_HEADERS,
  addSmsConnection,
  newSmsConnectionId,
  smsSendEndpoint,
  useSmsConnections,
  type SmsConnection,
} from "@/lib/clevertap-sms";
import {
  addMoeConnection,
  canCreateMoeConnection,
  authorizationHeaderValue,
  moeSendEndpoint,
  newMoeConnectionId,
  useMoeConnections,
  MOE_CONTENT_TYPE,
  type MoeConnection,
} from "@/lib/moengage-sms";

/** Computed once: what is built is a fact about the codebase, not about a merchant. */
const LANES = liveLanes();
const LANE_PLATFORMS = [...new Set(LANES.map((l) => l.platform))];
const channelsOn = (p: string) => LANES.filter((l) => l.platform === p).map((l) => l.channel);

/**
 * What was issued, discriminated by lane.
 *
 * Not a union of one shape with optional fields, because there is no field the two
 * have in common that the credentials step renders the same way — WhatsApp shows a
 * number and two endpoints, SMS shows a header set and one. The tag is what picks the
 * route to open on Done, and getting that wrong lands the client on a page that says
 * the connection does not exist.
 */
type Issued =
  | { lane: "whatsapp"; connector: CtConnector }
  | { lane: "sms"; connection: SmsConnection }
  | { lane: "moengage"; connection: MoeConnection };

export function AddCtConnectorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<"lane" | "setup">("lane");
  const [platformKey, setPlatformKey] = useState(LANE_PLATFORMS[0] ?? "");
  const [channel, setChannel] = useState<DeliveryChannel>(
    channelsOn(LANE_PLATFORMS[0] ?? "")[0] ?? "whatsapp",
  );
  const [picked, setPicked] = useState("");
  const [pickedHeaders, setPickedHeaders] = useState<string[]>([]);
  const [headersTouched, setHeadersTouched] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);

  const target = pushTarget(platformKey);

  /**
   * The lane, as the rest of this dialog branches on it.
   *
   * `channel` stopped being enough once a second vendor shipped SMS: CleverTap SMS and
   * MoEngage SMS are both `channel: "sms"` and are issued completely differently — one
   * takes a disjoint subset of headers, the other takes all of them by default and is
   * limited to one per workspace.
   */
  const laneKind: "whatsapp" | "sms" | "moengage" =
    platformKey === "moengage" ? "moengage" : channel === "sms" ? "sms" : "whatsapp";

  /* FR-6: one connection per MoEngage workspace, because MoEngage requires a distinct
     domain per service provider and we have one. */
  /* Subscribed for its side effect, not its value: `canCreateMoeConnection` reads the
     store directly, so without this the guard would not re-evaluate when a connection
     is created or deleted while the dialog is open. */
  useMoeConnections();
  const moeAvailable = canCreateMoeConnection();

  /**
   * One connector per number, per FR-1 — two on one number would each hold a valid
   * credential for it and the second would silently shadow the first. Taken numbers
   * stay in the list and are disabled rather than filtered out: a client looking for
   * a number they own needs to see that it is spoken for, not find it missing and
   * wonder whether the onboarding worked.
   */
  const connectors = useCtConnectors();
  const options = useMemo(
    () =>
      WABA_NUMBERS.map((n) => ({
        ...n,
        taken: connectors.some((c) => c.wabaNumber === n.e164),
      })),
    [connectors],
  );
  const free = options.filter((o) => !o.taken);

  /** Defaulting to the first free number is why there is no error state on this step. */
  const e164 = picked || free[0]?.e164 || "";

  /**
   * The same exclusivity rule, one axis over: a header covered by another connection
   * cannot be covered by this one, because each connection's credential is scoped to
   * its headers and a request arriving under a header the credential does not cover is
   * exactly what we have to be able to reject.
   *
   * No default pick here, unlike the number. A set has no obvious first member, and
   * pre-ticking one would create a connection scoped to a header the client never
   * chose — so this step does have an error state.
   */
  const smsConnections = useSmsConnections();
  const headerOptions = useMemo(() => {
    const taken = new Set(smsConnections.flatMap((c) => c.headers));
    return DLT_HEADERS.map((h) => ({ ...h, taken: taken.has(h.header) }));
  }, [smsConnections]);
  const freeHeaders = headerOptions.filter((h) => !h.taken);

  const reset = () => {
    setStep("lane");
    setPlatformKey(LANE_PLATFORMS[0] ?? "");
    setChannel(channelsOn(LANE_PLATFORMS[0] ?? "")[0] ?? "whatsapp");
    setPicked("");
    setPickedHeaders([]);
    setHeadersTouched(false);
    setIssued(null);
  };

  /** A platform's channels are its own, so the previous pick may not exist here. */
  const pickPlatform = (p: string) => {
    setPlatformKey(p);
    const options = channelsOn(p);
    if (!options.includes(channel)) setChannel(options[0]);
    /* FR-6 defaults a MoEngage connection to every registered header, because one
       provider carries all of them as senders — the subset is the exception. The
       CleverTap lane keeps its empty default, where a header belongs to one
       connection and pre-ticking would scope a credential nobody chose. */
    setPickedHeaders(p === "moengage" ? DLT_HEADERS.map((h) => h.header) : []);
    setHeadersTouched(false);
  };

  const toggleHeader = (h: string) =>
    setPickedHeaders((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h],
    );

  const createWhatsapp = () => {
    if (!e164) return;
    const connector: CtConnector = {
      id: newConnectorId(),
      wabaNumber: e164,
      createdAt: today(),
      state: "draft",
      enabled: true,
      username: `ct_${newConnectorId().slice(4)}_pub`,
      password: newPassword(),
    };
    addCtConnector(connector);
    setIssued({ lane: "whatsapp", connector });
  };

  /**
   * Headers are stored in registry order rather than click order, so two connections
   * covering the same pair read the same on the index and in the page title.
   */
  const createSms = () => {
    setHeadersTouched(true);
    if (pickedHeaders.length === 0) return;
    const id = newSmsConnectionId();
    const connection: SmsConnection = {
      id,
      createdAt: today(),
      state: "draft",
      enabled: true,
      headers: DLT_HEADERS.filter((h) => pickedHeaders.includes(h.header)).map((h) => h.header),
      username: `${id}_pub`,
      password: newPassword(),
      messagesSeen: 0,
      messagesWithMessageId: 0,
    };
    addSmsConnection(connection);
    setIssued({ lane: "sms", connection });
  };

  /**
   * Headers are not checked for exclusivity here, unlike the CleverTap lane.
   *
   * A DLT header is registered to the *merchant*, not to a connector, and the same
   * business legitimately sends under PICOMM from both CleverTap and MoEngage. The
   * CleverTap rule is about two CleverTap credentials shadowing each other on one
   * header; it says nothing about a different platform.
   */
  const createMoe = () => {
    setHeadersTouched(true);
    if (pickedHeaders.length === 0) return;
    const id = newMoeConnectionId();
    const connection: MoeConnection = {
      id,
      createdAt: today(),
      state: "draft",
      enabled: true,
      workspace: "acme-india",
      headers: DLT_HEADERS.filter((h) => pickedHeaders.includes(h.header)).map((h) => h.header),
      username: `${id}_pub`,
      password: newPassword(),
      heldCallbacks: 0,
      deadLetteredCallbacks: 0,
    };
    addMoeConnection(connection);
    setIssued({ lane: "moengage", connection });
  };

  const finish = () => {
    const done = issued;
    onOpenChange(false);
    reset();
    if (!done) return;
    if (done.lane === "whatsapp") {
      navigate({ to: "/integrations/clevertap/$id", params: { id: done.connector.id } });
    } else if (done.lane === "moengage") {
      navigate({ to: "/integrations/moengage-sms/$id", params: { id: done.connection.id } });
    } else {
      navigate({ to: "/integrations/clevertap-sms/$id", params: { id: done.connection.id } });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent
        className="max-w-lg"
        // Once the password is on screen it exists nowhere else, so the two ways of
        // closing a dialog by accident are blocked. The X and Done are left alone —
        // someone who aims at either has decided.
        onEscapeKeyDown={(e) => { if (issued) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (issued) e.preventDefault(); }}
      >
        {issued ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-[15px]">
                {issued.lane === "whatsapp"
                  ? `Connector for ${formatWaba(issued.connector.wabaNumber)}`
                  : issued.lane === "moengage"
                    ? `MoEngage SMS · ${issued.connection.workspace}`
                    : `Connection for ${issued.connection.headers.join(", ")}`}
              </DialogTitle>
              <DialogDescription className="text-[12.5px]">
                {issued.lane === "whatsapp" ? (
                  <>
                    Paste these into CleverTap's WhatsApp provider screen. The rest of the
                    values are on the connector page.
                  </>
                ) : issued.lane === "moengage" ? (
                  <>
                    Paste these into MoEngage under Settings → Channels → SMS → Sender
                    Configuration. The body rows and the field mapping — the parts that
                    decide whether reporting works — are on the connection page.
                  </>
                ) : (
                  <>
                    Paste these into CleverTap's SMS provider screen, under Settings →
                    Engage → Channels → SMS → Add Provider. The rest of the values are on
                    the connection page.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                <span className="font-medium text-foreground">
                  {issued.lane === "moengage"
                    ? "The Authorization header is shown only now."
                    : "The password is shown only now."}
                </span>{" "}
                Copy it before closing. If you lose it, rotate it — a rotation keeps the
                old credential working for a grace period, so nothing breaks while you
                update {issued.lane === "moengage" ? "MoEngage" : "CleverTap"}.
              </p>
            </div>

            <div className="divide-y divide-border">
              {issued.lane === "whatsapp" ? (
                <>
                  <CopyRow label="HTTP endpoint" value={ctMessagesEndpoint(issued.connector.id)} />
                  <CopyRow label="Username" value={issued.connector.username} />
                  <CopyRow label="Password" value={issued.connector.password ?? ""} critical />
                  <CopyRow
                    label="Template import endpoint"
                    value={ctTemplatesEndpoint(issued.connector.id)}
                  />
                </>
              ) : issued.lane === "moengage" ? (
                <>
                  <CopyRow label="API URL" value={moeSendEndpoint()} />
                  {/* A finished header value, not a username and a password. MoEngage's
                      provider form has no Basic Authentication field — credentials go in
                      its Headers section — so splitting these would leave the client to
                      base64 them by hand, and a bad encoding is a 401 on every send that
                      MoEngage reports as a failed campaign. */}
                  <CopyRow label="Header · Authorization" value={authorizationHeaderValue(issued.connection) ?? ""} critical />
                  <CopyRow label="Header · Content-Type" value={MOE_CONTENT_TYPE} />
                  <CopyRow
                    label="Senders covered"
                    value={issued.connection.headers.join(", ")}
                    copyable={false}
                    note="Each becomes one sender under this single provider. MoEngage allows one provider per domain, so a second provider is not an option."
                  />
                </>
              ) : (
                <>
                  <CopyRow label="HTTP endpoint" value={smsSendEndpoint()} />
                  <CopyRow label="Username" value={issued.connection.username} />
                  <CopyRow label="Password" value={issued.connection.password ?? ""} critical />
                  {/* No second endpoint. Generic SMS has no template import — the DLT
                      template identifier travels in the payload per message, so there is
                      nothing to register with us ahead of a send. */}
                </>
              )}
            </div>

            <DialogFooter>
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  toast.success(
                    issued.lane === "whatsapp" ? "Connector created" : "Connection created",
                    {
                      description:
                        issued.lane === "whatsapp"
                          ? "Save the provider in CleverTap to validate it."
                          : issued.lane === "moengage"
                            ? "The body rows and field mapping are next — MoEngage reports nothing without them."
                            : "The remaining values are on the connection page.",
                    },
                  );
                  finish();
                }}
              >
                Done — open {issued.lane === "whatsapp" ? "connector" : "connection"}{" "}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </DialogFooter>
          </>
        ) : step === "lane" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-[15px]">New delivery connector</DialogTitle>
              <DialogDescription className="text-[12.5px]">
                Which lane this connector carries. It decides what we have to issue, so it
                is asked before anything is generated and cannot be changed afterwards.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 py-1">
              <div className="space-y-1.5">
                <Label className="text-[12px]">Platform</Label>
                <Select value={platformKey} onValueChange={pickPlatform}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANE_PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p} className="text-xs">
                        {pushTarget(p).name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[12px]">Channel</Label>
                <Select
                  value={channel}
                  onValueChange={(v) => setChannel(v as DeliveryChannel)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {channelsOn(platformKey).map((ch) => (
                      <SelectItem key={ch} value={ch} className="text-xs">
                        {DELIVERY_CHANNEL_LABEL[ch]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Only built lanes are offered, so the roadmap is stated here rather than
                being discovered as greyed-out rows nobody can pick. The index table is
                where the full matrix lives. */}
            <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Only lanes we carry today are listed. MoEngage carries SMS but not WhatsApp —
              its custom connectors are SMS-only — and WebEngage is on the roadmap. The
              Connections table shows where every lane stands.
            </p>

            <DialogFooter>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setStep("setup")}>
                Continue <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-[15px]">
                {target.name} · {DELIVERY_CHANNEL_LABEL[channel]}
              </DialogTitle>
              <DialogDescription className="text-[12.5px]">
                {laneKind === "whatsapp" ? (
                  <>
                    One per WhatsApp number. CleverTap names the provider after the number,
                    so a number is all this needs — everything else is generated.
                  </>
                ) : laneKind === "moengage" ? (
                  <>
                    Which sender headers this provider carries. Every one becomes a sender
                    under the single Pi Commerce provider in MoEngage, so the default is all
                    of them — narrow it only if this workspace should not be able to send
                    under a header you hold.
                  </>
                ) : (
                  <>
                    Which sender headers this connection is allowed to send under. Requests
                    arriving on any other header are rejected, so this is the one field
                    that cannot be widened later without reissuing credentials.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            {laneKind === "moengage" ? (
              <div className="py-1">
                {!moeAvailable ? (
                  /* FR-6: one connection per workspace, stated as the rule rather than as
                     a validation failure — MoEngage requires a distinct domain per service
                     provider, and Pi Commerce has one, so a second is not something that
                     could be made to work by trying again. */
                  <p className="rounded-lg border border-dashed border-warning/30 bg-warning/5 px-3 py-3 text-[11.5px] leading-snug text-muted-foreground">
                    <span className="font-medium text-warning">
                      This workspace already has a MoEngage connection.
                    </span>{" "}
                    MoEngage requires a distinct domain per service provider and shares one
                    Delivery Tracking URL across every sender on it, so a second Pi Commerce
                    provider cannot exist alongside the first. To cover another header, add
                    a sender to the existing connection instead.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-[12px]">Sender IDs (DLT headers)</Label>
                    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                      {DLT_HEADERS.map((h) => (
                        <label
                          key={h.header}
                          className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 hover:bg-accent/30"
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={pickedHeaders.includes(h.header)}
                            onCheckedChange={() => toggleHeader(h.header)}
                          />
                          <div className="min-w-0">
                            <div className="font-mono text-[12px]">{h.header}</div>
                            <div className="text-[11px] leading-snug text-muted-foreground">
                              {h.use}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                    {headersTouched && pickedHeaders.length === 0 && (
                      <p className="text-[11px] text-destructive">
                        Pick at least one. A connection covering no header would reject every
                        request it received.
                      </p>
                    )}
                    {/* Unlike the CleverTap lane, nothing is greyed out: a DLT header
                        belongs to the merchant rather than to a connector, and the same
                        business legitimately sends under it from both platforms. */}
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      A header already used by a CleverTap connection can still be used
                      here — the registration belongs to you, not to a platform.
                    </p>
                  </div>
                )}
              </div>
            ) : laneKind === "sms" ? (
              <div className="py-1">
                {freeHeaders.length === 0 ? (
                  /* Same shape as the WhatsApp exhaustion notice, and the same reason:
                     naming what is spoken for is how someone recognises that the
                     connection they wanted already exists. */
                  <p className="rounded-lg border border-dashed border-warning/30 bg-warning/5 px-3 py-3 text-[11.5px] leading-snug text-muted-foreground">
                    <span className="font-medium text-warning">
                      Every registered header is already covered.
                    </span>{" "}
                    A header can belong to one connection only, so there is nothing left to
                    create. Register another header against your DLT entity under Channels,
                    or open the connection covering the header you meant.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-[12px]">Sender IDs (DLT headers)</Label>
                    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                      {headerOptions.map((h) => (
                        <label
                          key={h.header}
                          className={cn(
                            "flex items-start gap-2.5 px-3 py-2.5",
                            h.taken ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:bg-accent/30",
                          )}
                        >
                          <Checkbox
                            className="mt-0.5"
                            disabled={h.taken}
                            checked={pickedHeaders.includes(h.header)}
                            onCheckedChange={() => toggleHeader(h.header)}
                          />
                          <div className="min-w-0">
                            <div className="font-mono text-[12px]">{h.header}</div>
                            <div className="text-[11px] leading-snug text-muted-foreground">
                              {h.use}
                              {h.taken && " · covered by another connection"}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                    {headersTouched && pickedHeaders.length === 0 && (
                      <p className="text-[11px] text-destructive">
                        Pick at least one. A connection covering no header would reject
                        every request it received.
                      </p>
                    )}
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Pick several if one CleverTap account sends under several — each
                      header still needs its own provider there, because the header is a
                      fixed value in the payload.
                    </p>
                  </div>
                )}
              </div>
            ) : (
            <div className="py-1">
              {free.length === 0 ? (
                /* Every number is spoken for, and the fix is on a different page. Saying
                   which numbers are taken matters more than saying none are left — it is
                   how someone recognises that the connector they want already exists. */
                <p className="rounded-lg border border-dashed border-warning/30 bg-warning/5 px-3 py-3 text-[11.5px] leading-snug text-muted-foreground">
                  <span className="font-medium text-warning">
                    Every WhatsApp number already has a connector.
                  </span>{" "}
                  CleverTap allows one provider per number, so there is nothing left to
                  create. Onboard another number under Channels first, or open the existing
                  connector for the number you meant.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-[12px]">WhatsApp Business number</Label>
                  <Select value={e164} onValueChange={setPicked}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((o) => (
                        <SelectItem
                          key={o.e164}
                          value={o.e164}
                          disabled={o.taken}
                          className="text-xs"
                        >
                          <span className="font-mono">{formatWaba(o.e164)}</span>
                          <span className="ml-2 text-muted-foreground">
                            {o.waba}
                            {o.taken && " · connector exists"}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Only numbers onboarded to Pi Commerce are listed — a connector on any
                    other number would take every send and fail it. Add one under Channels.
                  </p>
                </div>
              )}
            </div>
            )}

            <DialogFooter>
              {/* Back, not Cancel. Nothing has been written yet, so the escape hatch
                  that matters is returning to a lane picked by mistake. */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setStep("lane")}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={
                  laneKind === "moengage"
                    ? !moeAvailable
                    : laneKind === "sms"
                      ? freeHeaders.length === 0
                      : free.length === 0
                }
                onClick={
                  laneKind === "moengage"
                    ? createMoe
                    : laneKind === "sms"
                      ? createSms
                      : createWhatsapp
                }
              >
                Generate credentials <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
