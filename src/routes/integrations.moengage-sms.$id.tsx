/**
 * The MoEngage SMS connection.
 *
 * Laid out in the order the client works through it, because the setup crosses
 * between two products four times and the order is the hard part — not any single
 * value. MoEngage will not save a sender until its test send passes, and will not
 * generate a Delivery Tracking URL until the sender is saved, so the URL this page
 * asks for cannot exist when the page is first opened. A screen that presented all
 * the fields at once would be read as a form with a missing field.
 *
 * So the panels run in that order — credentials, the URL that comes back, field
 * mapping — and the tracking-URL panel owns the explanation for its own absence rather
 * than a progress strip owning it from the top of the page. Field mapping is the one
 * panel the CleverTap lanes have no equivalent of, because MoEngage cannot infer it.
 *
 * Nothing here can move the connection to Live, and nothing here disables or deletes
 * it. Live means a request passed authentication, which no button can manufacture;
 * disable and delete live in the row menu on Connections, the one place they live for
 * every lane.
 */
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CopyRow, CopyButton, DetailRow } from "@/components/clevertap/CopyRow";
import { Panel } from "@/components/connections/Panel";
import { ConnectionDetailHeader } from "@/components/connections/ConnectionDetailHeader";
import { ConnectionActions } from "@/components/connections/ConnectionActions";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { graceUntil, newPassword } from "@/lib/clevertap";
import { DELIVERY_CHANNEL_LABEL, MOE_TARGET } from "@/lib/delivery";
import {
  MOE_CONTENT_TYPE,
  MOE_DEFAULT_GRACE_DAYS,
  MOE_FIELD_MAPPING,
  MOE_HOLD_HOURS,
  MOE_STATE_INFO,
  MOE_STATE_LABEL,
  MOE_STATE_TONE,
  authorizationHeaderValue,
  maskTrackingUrl,
  moeSendEndpoint,
  trackingUrlError,
  updateMoeConnection,
  removeMoeConnection,
  useMoeConnection,
  type MoeConnection,
} from "@/lib/moengage-sms";

export const Route = createFileRoute("/integrations/moengage-sms/$id")({
  component: MoeConnectionDetail,
  head: () => ({ meta: [{ title: "MoEngage SMS · Pi Commerce Enterprise" }] }),
});

function MoeConnectionDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const c = useMoeConnection(id);

  const [rotated, setRotated] = useState<string | null>(null);

  if (!c) {
    return (
      <AppShell>
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <h2 className="text-lg font-semibold">Connection not found</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">It may have been removed.</p>
          <Button variant="outline" size="sm" className="mt-5 h-8 gap-1.5 text-xs" asChild>
            <Link to="/integrations">
              <ArrowLeft className="h-3.5 w-3.5" /> All connections
            </Link>
          </Button>
        </div>
      </AppShell>
    );
  }


  const rotate = () => {
    const pw = newPassword();
    updateMoeConnection(c.id, {
      password: pw,
      rotation: { until: graceUntil(MOE_DEFAULT_GRACE_DAYS), graceDays: MOE_DEFAULT_GRACE_DAYS },
    });
    setRotated(pw);
  };

  return (
    <AppShell>
      <ConnectionDetailHeader
        mark={MOE_TARGET}
        title={`MoEngage SMS · ${c.workspace}`}
        meta={
          <>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                MOE_STATE_TONE[c.state],
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {MOE_STATE_LABEL[c.state]}
            </span>
            {!c.enabled && (
              <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                Disabled
              </span>
            )}
            {c.lastRequestAt && (
              <span className="text-[12px] text-muted-foreground">
                Last request {c.lastRequestAt}
              </span>
            )}
            <span className="text-[12px] text-muted-foreground">
              {MOE_TARGET.name} · {DELIVERY_CHANNEL_LABEL.sms}
            </span>
          </>
        }
        description={
          <>
            {MOE_STATE_INFO[c.state]} MoEngage builds and renders the message; we send it
            under your DLT registration and post the outcome back. One provider covers every
            sender header — MoEngage allows one per domain.
          </>
        }
        aside={
          <ConnectionActions
            enabled={c.enabled}
            name={c.workspace}
            vendor={MOE_TARGET.name}
            noun={"connection"}
            onToggle={(next) => {
              updateMoeConnection(c.id, { enabled: next });
              toast.success(next ? "Enabled" : "Disabled", {
                description: next
                  ? "Sends are accepted again."
                  : "New sends are rejected; already-accepted messages still report back.",
              });
            }}
            onDelete={() => {
              removeMoeConnection(c.id);
              toast.success("Deleted", { description: "Remove the provider entry on their side too." });
              navigate({ to: "/integrations" });
            }}
          />
        }
      />

      {/* Nothing on this page can move a connection out of Draft, so the one state that
          looks like it is waiting for a button says so, full width, above the panels —
          the same banner both CleverTap lanes carry. */}
      {c.state === "draft" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0">
            <div className="text-[13px] font-medium">Waiting on MoEngage</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Add the provider in MoEngage under{" "}
              <span className="font-medium text-foreground">
                Settings → Channels → SMS → Sender Configuration
              </span>
              , paste the values below, and send their test SMS. This moves to Live on the
              first request that reaches us — there is nothing to press here.
            </p>
          </div>
        </div>
      )}

      <div className="min-w-0 space-y-5">
        {/* ─── 1. What MoEngage's provider form asks for first ─── */}
        <Panel
          title="Paste into MoEngage"
          caption="Settings → Channels → SMS → Sender Configuration → add a custom service provider. Field for field, in their order."
        >
          <div className="divide-y divide-border">
            <CopyRow
              label="Service provider name"
              value="Pi Commerce"
              note="MoEngage uses it as a label only. One provider carries every sender below."
            />
            <CopyRow label="API URL" value={moeSendEndpoint()} />
            <CopyRow
              label="Method"
              value="POST"
              copyable={false}
              note="One destination per request, in a JSON body. There is no GET path."
            />
            <CopyRow
              label="Body type"
              value="JSON"
              copyable={false}
              note="The only mode that resolves @ attributes, so campaign_name can be mapped. Raw mode sends but cannot resolve them."
            />
            <AuthorizationRow connection={c} onRotate={rotate} />
            <CopyRow label="Header · Content-Type" value={MOE_CONTENT_TYPE} />
            <CopyRow
              label="Sender names"
              value={c.headers.join(", ")}
              note="One MoEngage sender per header, all under this same provider. A request carrying any other header is rejected."
              critical
            />
          </div>
        </Panel>

        {/* ─── 2. The URL that comes back the other way ─── */}
        <TrackingUrlPanel connection={c} />

        {/* ─── 3. The mapping that cannot be inferred ─── */}
        <FieldMappingPanel />
      </div>

      {/* ───────────────────────── The new credential, once ───────────────────────── */}
      <Dialog open={!!rotated} onOpenChange={(v) => { if (!v) setRotated(null); }}>
        <DialogContent
          className="max-w-lg"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-[15px]">New credential issued</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              The old header keeps working until{" "}
              <span className="font-medium text-foreground">{c.rotation?.until}</span>, so
              nothing fails while you update MoEngage.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <p className="text-[11.5px] leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">Shown only now.</span> Copy the
              header value before closing — if you lose it you will have to rotate again.
            </p>
          </div>

          <div className="divide-y divide-border">
            <CopyRow label="Header name" value="Authorization" />
            <CopyRow label="Header value" value={authorizationHeaderValue(c) ?? ""} critical />
          </div>

          <DialogFooter>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setRotated(null);
                toast.success("Credential rotated", {
                  description: `Update MoEngage before ${c.rotation?.until}.`,
                });
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

/* ──────────────────────────── Authorization ─────────────────────────────────── */

/**
 * The finished header value, not a username and a password.
 *
 * MoEngage's form has no Basic Authentication field — credentials go in the Headers
 * section — so splitting this into two rows would leave the client to base64 them by
 * hand. That is both easy to get wrong and invisible when it is: a bad encoding is a
 * 401 on every send, which MoEngage reports as a failed campaign rather than a
 * configuration problem.
 *
 * Usually empty, because the value exists only in the session it was issued in. It
 * says so rather than rendering dots beside a copy control — a control that yields
 * bullets is worse than none, because it gets pasted.
 */
function AuthorizationRow({
  connection,
  onRotate,
}: {
  connection: MoeConnection;
  onRotate: () => void;
}) {
  const value = authorizationHeaderValue(connection);

  if (value) {
    return (
      <CopyRow
        label="Header · Authorization"
        value={value}
        critical
        note="Shown only in this session. Paste it into MoEngage's Headers section as a header named Authorization."
      />
    );
  }

  return (
    <DetailRow
      label="Header · Authorization"
      critical
      action={
        <Button
          variant="outline"
          size="sm"
          className="h-6 shrink-0 gap-1 px-2 text-[10.5px]"
          onClick={onRotate}
        >
          <RefreshCw className="h-2.5 w-2.5" /> Rotate
        </Button>
      }
    >
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Shown once, when it was issued.
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        {connection.rotation ? (
          <>
            Rotating — the previous value stays valid until{" "}
            <span className="font-medium text-foreground">{connection.rotation.until}</span>.
          </>
        ) : (
          <>
            Rotate to issue a new one. The old value keeps working for{" "}
            {MOE_DEFAULT_GRACE_DAYS} days, so MoEngage can be updated without a gap.
          </>
        )}
      </p>
    </DetailRow>
  );
}

/* ────────────────────────── Delivery Tracking URL ───────────────────────────── */

/**
 * The one value that travels the other way, and the one that cannot be had yet.
 *
 * Its absence is normal rather than an error for the whole first phase of setup, so
 * the empty state explains the ordering instead of warning. What it does say plainly
 * is the consequence: callbacks are held for {@link MOE_HOLD_HOURS} hours and flushed
 * when this is saved, so a client who takes a day over the MoEngage half loses nothing,
 * and one who takes three days does.
 */
function TrackingUrlPanel({ connection }: { connection: MoeConnection }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(connection.deliveryTrackingUrl ?? "");
  const [touched, setTouched] = useState(false);

  const error = trackingUrlError(url);
  const configured = !!connection.deliveryTrackingUrl;

  const save = () => {
    setTouched(true);
    if (error) return;
    updateMoeConnection(connection.id, {
      deliveryTrackingUrl: url.trim(),
      heldCallbacks: 0,
    });
    setEditing(false);
    setTouched(false);
    toast.success("Delivery Tracking URL saved", {
      description: connection.heldCallbacks
        ? `${connection.heldCallbacks.toLocaleString()} held callbacks will be delivered now.`
        : "Delivery outcomes will post to MoEngage from the next send.",
    });
  };

  return (
    <Panel
      title="Where we post back"
      caption="Generated by MoEngage when you edit the saved sender and turn on delivery tracking. Delivered and failed both post to this one URL, which covers every sender on the provider."
      action={
        !editing && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => {
              setUrl(connection.deliveryTrackingUrl ?? "");
              setEditing(true);
            }}
          >
            {configured ? "Replace" : "Add"}
          </Button>
        )
      }
    >
      {editing ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[12px]">SMS Delivery Tracking URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api-01.moengage.com/sms/dlr/custom/…"
              className="h-8 font-mono text-xs"
            />
            {touched && error && <p className="text-[11px] text-destructive">{error}</p>}
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Treated as a secret. The endpoint takes no authentication — its path carries
            MoEngage's connector ID, so whoever holds the URL can write statistics into your
            account. Stored encrypted and masked here after saving.
          </p>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setEditing(false);
                setTouched(false);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={save}>
              Save
            </Button>
          </div>
        </div>
      ) : configured ? (
        <div className="divide-y divide-border">
          <CopyRow
            label="Tracking URL"
            value={maskTrackingUrl(connection.deliveryTrackingUrl!)}
            copyable={false}
            note="Path masked. Replace it if MoEngage regenerates the sender."
          />
          {connection.deadLetteredCallbacks > 0 && (
            <CopyRow
              label="Dead-lettered"
              value={`${connection.deadLetteredCallbacks.toLocaleString()} callbacks`}
              copyable={false}
              note="Not acknowledged after five attempts. Replayable — their statistics are missing until then."
              critical
            />
          )}
        </div>
      ) : (
        /* One block, same shape and voice as the CleverTap SMS panel: what state this
           is in, what still works, and what is lost. The tone follows whether it is
           actionable — on a Draft connection the URL *cannot* exist yet, so warning
           colour would be scolding someone for the order their setup has to run in;
           once traffic is flowing, held callbacks are expiring and it is a real
           problem. */
        <p
          className={cn(
            "rounded-lg border border-dashed px-3 py-3 text-[11.5px] leading-snug text-muted-foreground",
            connection.state === "draft"
              ? "border-border bg-secondary/30"
              : "border-warning/30 bg-warning/5",
          )}
        >
          <span
            className={cn(
              "font-medium",
              connection.state === "draft" ? "text-foreground" : "text-warning",
            )}
          >
            {connection.state === "draft" ? "Not available yet." : "Not set."}
          </span>{" "}
          Messages will still send, but MoEngage cannot show a delivery status for any of
          them until this is saved. The URL appears once you edit the saved sender and turn
          on delivery tracking — it cannot exist before their test send passes, so it is
          normal for this to stay empty while you finish the MoEngage side. Outcomes are
          held for {MOE_HOLD_HOURS} hours and delivered when you paste it here
          {connection.heldCallbacks > 0 && (
            <>
              {" "}— <span className="font-medium text-warning">
                {connection.heldCallbacks.toLocaleString()} are waiting now
              </span>
            </>
          )}
          ; after that window they are dropped, and those messages show in MoEngage as
          never delivered.
        </p>
      )}
    </Panel>
  );
}

/* ──────────────────────────── Field mapping ─────────────────────────────────── */

/**
 * The five values that have to be typed in by hand, and why.
 *
 * MoEngage offers auto-mapping, which reads the test SMS's callback to infer these.
 * That callback cannot reach MoEngage until the tracking URL above is saved — which
 * happens after the test — so auto-mapping at the point it is offered infers from
 * nothing and maps nothing, with no error. This panel exists because "choose the
 * manual option" is counter-intuitive advice that has to survive being skimmed.
 */
function FieldMappingPanel() {
  const all = MOE_FIELD_MAPPING.map((m) => `${m.field}: ${m.value}`).join("\n");

  return (
    <Panel
      title="Field mapping"
      caption='On the sender’s delivery tracking screen, choose "Map fields manually" and enter these five.'
      action={<CopyButton value={all} label="Copy all" />}
    >
      <div className="divide-y divide-border">
        {MOE_FIELD_MAPPING.map((m) => (
          <CopyRow
            key={m.field}
            label={m.field}
            value={m.value}
            note={m.note}
            critical={m.field === "Success values for delivery status"}
          />
        ))}
      </div>
    </Panel>
  );
}

