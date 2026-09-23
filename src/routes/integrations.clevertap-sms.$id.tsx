/**
 * One CleverTap SMS connection.
 *
 * Built to the same principle as the WhatsApp connector page — a surface whose job is
 * to be transcribed into someone else's form — but what gets transcribed is different
 * enough to change the layout. There the client copies nine discrete values. Here they
 * copy one recipe, and the panel that holds it does most of the work.
 *
 * Three panels, read top to bottom in the order the client needs them: the credentials
 * CleverTap's form asks for first, the recipe that goes into it, and the callback URL
 * that comes back the other way.
 *
 * Nothing here can move the connection to Live, and for a plainer reason than
 * on the WhatsApp page: Live means real traffic has come through, and no button can
 * manufacture that.
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyRow } from "@/components/clevertap/CopyRow";
import { SmsRecipePanel } from "@/components/clevertap/SmsRecipePanel";
import { Panel } from "@/components/connections/Panel";
import { ConnectionDetailHeader } from "@/components/connections/ConnectionDetailHeader";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  callbackUrlError,
  graceUntil,
  maskCallbackUrl,
  newPassword,
} from "@/lib/clevertap";
import {
  SMS_DEFAULT_GRACE_DAYS,
  SMS_STATE_INFO,
  SMS_STATE_LABEL,
  SMS_STATE_TONE,
  reportingHealth,
  smsSendEndpoint,
  updateSmsConnection,
  useSmsConnection,
  type SmsConnection,
} from "@/lib/clevertap-sms";
import { CT_TARGET, DELIVERY_CHANNEL_LABEL } from "@/lib/delivery";

export const Route = createFileRoute("/integrations/clevertap-sms/$id")({
  component: SmsConnectionDetail,
  head: () => ({ meta: [{ title: "CleverTap SMS · Pi Commerce Enterprise" }] }),
});

function SmsConnectionDetail() {
  const { id } = Route.useParams();
  const c = useSmsConnection(id);

  const [header, setHeader] = useState<string | null>(null);
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

  /* The selected header defaults to the first one this connection covers, and is held
     as null until chosen so that a header being removed from the connection cannot
     leave the recipe pointing at one it no longer carries. */
  const activeHeader = header && c.headers.includes(header) ? header : c.headers[0];
  const health = reportingHealth(c);

  const rotate = () => {
    const pw = newPassword();
    updateSmsConnection(c.id, {
      password: pw,
      rotation: { until: graceUntil(SMS_DEFAULT_GRACE_DAYS), graceDays: SMS_DEFAULT_GRACE_DAYS },
    });
    setRotated(pw);
  };

  return (
    <AppShell>
      {/* ─────────────────────────────── Header ─────────────────────────────── */}
      {/* Titled by the senders it covers, because that is what a client recognises it
          by and what decides whether a given campaign can run on it. CleverTap does
          not name this provider for us the way it names a WhatsApp one after the
          number — the client types their own nickname — so there is no borrowed
          identifier to use instead. */}
      <ConnectionDetailHeader
        mark={CT_TARGET}
        title={c.headers.join(", ")}
        meta={
          <>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                SMS_STATE_TONE[c.state],
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {SMS_STATE_LABEL[c.state]}
            </span>
            {!c.enabled && (
              <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                Disabled
              </span>
            )}
            {/* The WhatsApp page carries "Last validated" here. There is no validation
                call on Generic SMS, so the nearest honest fact is when we last carried
                something — and it is absent on Draft rather than reading "Never",
                because the banner below already says exactly that. */}
            {c.lastMessageAt && (
              <span className="text-[12px] text-muted-foreground">
                Last message {c.lastMessageAt}
              </span>
            )}
            <span className="text-[12px] text-muted-foreground">
              {CT_TARGET.name} · {DELIVERY_CHANNEL_LABEL.sms}
            </span>
          </>
        }
        description={
          <>
            {SMS_STATE_INFO[c.state]} CleverTap builds the campaign and substitutes the
            recipient, body and identifiers into the recipe below; we deliver each message
            and post the receipt back. The audience and the personalisation stay on their
            side.
          </>
        }
      />

      {/* FR-10: a Draft connection looks like it is waiting for a button here, and it is
          not. Nothing on this page starts anything — the recipe has to reach their
          provider form, and that is the whole of the remaining work. */}
      {c.state === "draft" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0">
            <div className="text-[13px] font-medium">Nothing has come through yet</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Add the provider in CleverTap under{" "}
              <span className="font-medium text-foreground">
                Settings → Engage → Channels → SMS → Add Provider
              </span>
              , choose <span className="font-medium text-foreground">Other (Generic)</span>,
              and paste the recipe below. There is no setup check to pass — this moves to
              Live when a real message arrives.
            </p>
          </div>
        </div>
      )}

      {/* FR-7 and AC-5. The one failure in this integration that looks like nothing is
          wrong: every message delivers and CleverTap's report shows zero of everything.
          It is stated at the top of the page because by the time a client is looking
          for it they have already concluded the platform is broken. */}
      {health === "unreportable" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <div className="text-[13px] font-medium">Delivery reporting is not configured</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              All {c.messagesSeen.toLocaleString()} messages so far arrived without a{" "}
              <span className="font-mono">$$MessageID</span> value, so no callback could be
              attributed and CleverTap's report will show zero delivered against a fully
              delivered campaign. The recipe on their provider form is missing that
              mapping — replace it with the one below.
            </p>
          </div>
        </div>
      )}
      {health === "partial" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0">
            <div className="text-[13px] font-medium">Some messages cannot be reported</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              {(c.messagesSeen - c.messagesWithMessageId).toLocaleString()} of{" "}
              {c.messagesSeen.toLocaleString()} arrived without a{" "}
              <span className="font-mono">$$MessageID</span>. That points at one of several
              CleverTap providers on this connection carrying an older recipe — the
              campaigns it runs will report zero while the others report correctly.
            </p>
          </div>
        </div>
      )}

      <div className="min-w-0 max-w-4xl space-y-5">
        {/* ─────────────────── What their form asks for first ─────────────────── */}
        <Panel
          title="Paste into CleverTap"
          caption="Their provider form, field for field. The recipe goes in the Parameters field and has a panel of its own below."
        >
          <div className="divide-y divide-border">
            <CopyRow label="HTTP endpoint" value={smsSendEndpoint()} />
            {/* POST rather than a choice. CleverTap's form offers GET too, and a GET
                configuration cannot carry a batch and puts recipient numbers in a query
                string — so it is the option whose only reachable outcomes are worse. */}
            <CopyRow
              label="Request type"
              value="POST"
              copyable={false}
              note="Their form also offers GET. It cannot carry a batch and puts recipient numbers in the query string, so it is not supported here."
            />
            <CopyRow
              label="Authentication"
              value="Basic"
              copyable={false}
              note="Their form also offers OAuth 2.0, available on request. A failed OAuth token stops the whole SMS channel and retries only every 120 seconds, so Basic is what we issue by default."
            />
            <CopyRow label="Username" value={c.username} />
            <PasswordRow connection={c} onRotate={rotate} />
            {/* Batch key name and records per batch are not here, though their form asks
                for them in this order. Both are properties of the recipe rather than of
                the connection — the key is the recipe's array key, and whether it is
                filled in at all is what turns batching on — so they are listed in the
                next panel, beside the block they describe. */}
            <CopyRow
              label="Sender IDs covered"
              value={c.headers.join(", ")}
              copyable={false}
              note="A request carrying any other header is rejected. Registered to your DLT entity; add one under Channels."
              critical
            />
          </div>
        </Panel>

        {/* ────────────────────────────── The recipe ────────────────────────────── */}
        <SmsRecipePanel connection={c} header={activeHeader} onHeaderChange={setHeader} />

        {/* ──────────────────────────── The way back ────────────────────────────── */}
        <CallbackPanel connection={c} />
      </div>

      {/* ───────────────────────── The new password, once ───────────────────────── */}
      <Dialog open={!!rotated} onOpenChange={(v) => { if (!v) setRotated(null); }}>
        <DialogContent
          className="max-w-lg"
          // Already written, so a stray dismissal leaves a live connection holding a
          // password nobody has a copy of. Escape and outside clicks are blocked; the X
          // and Done are not, because those are deliberate.
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-[15px]">New password issued</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              The old password keeps working until{" "}
              <span className="font-medium text-foreground">{c.rotation?.until}</span>, so
              nothing fails while you update CleverTap.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <p className="text-[11.5px] leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">Shown only now.</span> Copy it
              before closing — if you lose it you will have to rotate again.
            </p>
          </div>

          <div className="divide-y divide-border">
            <CopyRow label="Username" value={c.username} />
            <CopyRow label="Password" value={rotated ?? ""} critical />
          </div>

          <DialogFooter>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setRotated(null);
                toast.success("Password rotated", {
                  description: `Update CleverTap before ${c.rotation?.until}.`,
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

/* ──────────────────────────────── Password ───────────────────────────────── */

/**
 * Shown once at creation, so this row is usually empty and says so rather than
 * rendering dots beside a copy control — a control that yields eight bullets is worse
 * than none, because it gets pasted.
 */
function PasswordRow({
  connection,
  onRotate,
}: {
  connection: SmsConnection;
  onRotate: () => void;
}) {
  return (
    <div className="flex items-start gap-3 border-l-2 border-warning/60 py-2 pl-2.5">
      <div className="w-[168px] shrink-0 pt-0.5">
        <p className="text-[11.5px] font-medium leading-tight">Password</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Shown once, when it was issued.
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {connection.rotation ? (
            <>
              Rotating — the previous password stays valid until{" "}
              <span className="font-medium text-foreground">{connection.rotation.until}</span>.
            </>
          ) : (
            <>Rotate to issue a new one. The old one keeps working for {SMS_DEFAULT_GRACE_DAYS} days.</>
          )}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-6 shrink-0 gap-1 px-2 text-[10.5px]"
        onClick={onRotate}
      >
        <RefreshCw className="h-2.5 w-2.5" /> Rotate
      </Button>
    </div>
  );
}

/* ──────────────────────────────── Callback ──────────────────────────────────── */

/**
 * One URL, because CleverTap's SMS provider screen generates one — delivered, failed,
 * clicked and replied all post to it. The WhatsApp connector has two because their
 * WhatsApp form has two, and splitting this to match would be inventing a field.
 *
 * Treated as a secret, which is not obvious and so is said on the screen: CleverTap
 * puts the authorisation in the path, so anyone holding it can write delivery receipts
 * into that account. Hence HTTPS enforced rather than warned about, and masked after
 * save.
 */
function CallbackPanel({ connection }: { connection: SmsConnection }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(connection.callbackUrl ?? "");
  const [touched, setTouched] = useState(false);

  const error = callbackUrlError(url);
  const configured = !!connection.callbackUrl;

  const save = () => {
    setTouched(true);
    if (error) return;
    updateSmsConnection(connection.id, { callbackUrl: url.trim() });
    setEditing(false);
    setTouched(false);
    toast.success("Callback URL saved", {
      description: "Receipts, clicks and replies will post to CleverTap from the next send.",
    });
  };

  return (
    <Panel
      title="Where we post back"
      caption="Generated by CleverTap on their provider screen once it is saved. Delivered, failed, clicked and replied all post to this one URL."
      action={
        !editing && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => {
              setUrl(connection.callbackUrl ?? "");
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
            <Label className="text-[12px]">Callback URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="h-8 font-mono text-xs"
            />
            {touched && error && <p className="text-[11px] text-destructive">{error}</p>}
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Treated as a secret. CleverTap puts the authorisation in the path, so whoever
            holds it can write statistics into that account — stored encrypted and masked
            here after saving.
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
            label="Callback URL"
            value={maskCallbackUrl(connection.callbackUrl!)}
            copyable={false}
            note="Masked. Replace it if CleverTap regenerates theirs."
          />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-warning/30 bg-warning/5 px-3 py-3 text-[11.5px] leading-snug text-muted-foreground">
          <span className="font-medium text-warning">Not set.</span> Messages will still
          send, but CleverTap will show every one as pending forever, and clicks and
          replies will not reach them. The URL appears on their provider screen once it is
          saved — and it only appears at all if the provider was created with callbacks
          enabled.
        </p>
      )}
    </Panel>
  );
}
