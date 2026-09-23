/**
 * One CleverTap connector.
 *
 * This page is almost entirely a transcription surface. Every value in the first
 * panel has to be retyped into a screen inside CleverTap, by hand, by someone who
 * cannot see this page and CT's at the same time — so the ordering matches CT's
 * provider form field for field, and everything has a copy control. Ordering it by
 * importance instead would be tidier here and slower there.
 *
 * One column, read top to bottom: what you paste, then where we post back. Nothing
 * else, and the removals are the design. This page also carried payload encryption,
 * a limits panel (concurrency, import page size, Basic-or-Bearer) and an
 * unresolved-template log, and they failed in two different ways. The log and a
 * derived readiness checklist were reports on traffic, which a page built to be
 * transcribed into someone else's form is the wrong place for. The settings were
 * worse: each had exactly one correct value that had to match CleverTap's, so the
 * control's only reachable outcomes were the wrong ones — a client lowering
 * concurrency to be careful caused the rejections they were avoiding.
 *
 * What is left is values to read once and retype, which is why the column is capped
 * rather than allowed to fill the width: a copy control an inch from its label is
 * worse than one beside it.
 *
 * Nothing on this page can move the connector out of Draft. Only a real validation
 * call from CleverTap does that, which is the whole point: a client who has finished
 * their side and still sees Draft has learned that CT never called, and that is a
 * different problem from CT calling and being rejected.
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyRow } from "@/components/clevertap/CopyRow";
import { Panel } from "@/components/connections/Panel";
import { ConnectionDetailHeader } from "@/components/connections/ConnectionDetailHeader";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CT_DEFAULT_GRACE_DAYS,
  CT_STATE_INFO,
  CT_STATE_LABEL,
  CT_STATE_TONE,
  callbackUrlError,
  ctMessagesEndpoint,
  ctTemplatesEndpoint,
  formatWaba,
  graceUntil,
  maskCallbackUrl,
  newPassword,
  updateCtConnector,
  useCtConnector,
  type CtConnector,
} from "@/lib/clevertap";
import { CT_TARGET, DELIVERY_CHANNEL_LABEL } from "@/lib/delivery";

export const Route = createFileRoute("/integrations/clevertap/$id")({
  component: CtConnectorDetail,
  head: () => ({ meta: [{ title: "CleverTap connector · Pi Commerce Enterprise" }] }),
});

function CtConnectorDetail() {
  const { id } = Route.useParams();
  const c = useCtConnector(id);
  const [rotated, setRotated] = useState<string | null>(null);

  if (!c) {
    return (
      <AppShell>
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <h2 className="text-lg font-semibold">Connector not found</h2>
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

  /**
   * A rotation issues the new password and keeps the old one valid for the grace
   * period, so the client can update CleverTap without a window where sends fail.
   * Without the grace period this control would be unusable on a live connector.
   */
  const rotate = () => {
    const pw = newPassword();
    updateCtConnector(c.id, {
      password: pw,
      rotation: { until: graceUntil(CT_DEFAULT_GRACE_DAYS), graceDays: CT_DEFAULT_GRACE_DAYS },
    });
    setRotated(pw);
  };

  return (
    <AppShell>
      {/* ─────────────────────────────── Header ─────────────────────────────── */}
      {/* The title is a phone number, which on its own does not say whose lane it is.
          The mark comes from the shared registry — the same object the index row
          uses — rather than a hex retyped here, which is exactly the drift the
          registry exists to prevent. */}
      <ConnectionDetailHeader
        mark={CT_TARGET}
        title={formatWaba(c.wabaNumber)}
        meta={
          <>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                CT_STATE_TONE[c.state],
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {CT_STATE_LABEL[c.state]}
            </span>
            {!c.enabled && (
              <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                Disabled
              </span>
            )}
            {/* FR-1 and FR-3 both ask for this, and it sits next to the pill because it
                is the pill it qualifies — Validated and Live are both records of a check
                having passed, and neither says when. It is the page's only answer to
                "did my setup work, and is that still true", which is the question a
                client asks before they suspect us of anything.

                Absent on Draft rather than reading "Never". Draft means CleverTap has
                never called, the banner below says exactly that, and a second rendering
                of the same absence reads as a second finding. */}
            {c.lastValidationAt && (
              <span className="text-[12px] text-muted-foreground">
                Last validated {c.lastValidationAt}
              </span>
            )}
            <span className="text-[12px] text-muted-foreground">
              {CT_TARGET.name} · {DELIVERY_CHANNEL_LABEL.whatsapp}
            </span>
          </>
        }
        description={
          <>
            {CT_STATE_INFO[c.state]} CleverTap sends the message, we deliver it through
            Meta and post the receipt back — the campaign, the audience and the
            personalisation all stay on their side.
          </>
        }
      />

      {/* FR-3: nothing here can move a connector out of Draft, so the one state that
          looks like it needs a button says so full width, above the split. */}
      {c.state === "draft" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0">
            <div className="text-[13px] font-medium">Waiting on CleverTap</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Saving the values below on their provider screen triggers their setup check,
              which is what moves this to Validated. There is nothing to press here.
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════ Setup, then the settings it implies ════════════════ */}
      <div className="min-w-0 max-w-4xl space-y-5">
        <Panel
          title="Paste into CleverTap"
          caption="Their provider screen, field for field, in the same order. The provider nickname is the number itself."
        >
          <div className="divide-y divide-border">
            <CopyRow label="HTTP endpoint" value={ctMessagesEndpoint(c.id)} />
            <CopyRow label="Request type" value="POST" copyable={false} />
            <CopyRow label="Authentication" value="Basic" copyable={false} />
            <CopyRow label="Username" value={c.username} />
            <PasswordRow connector={c} onRotate={rotate} />
            <CopyRow label="Template import endpoint" value={ctTemplatesEndpoint(c.id)} />
            <CopyRow label="Import request type" value="GET" copyable={false} />
            <CopyRow label="Import authentication" value="Basic" copyable={false} />
            {/* A field on CleverTap's form, not a setting of ours — which is why it
                survived the pass that removed the tunables around it. The endpoint caps
                at 500 either way, so a client who guesses higher gets 500 back and reads
                the truncation as templates going missing. Stating the number is the
                whole of the fix. */}
            <CopyRow label="Recommended import limit" value="500" copyable={false} />
            <CopyRow
              label="Click tracking domain"
              value={c.clickTrackingDomain ?? ""}
              note={
                c.clickTrackingDomain
                  ? undefined
                  : "Leave empty in CleverTap — a wrong value breaks every button URL."
              }
            />
            <CopyRow
              label="WABA number"
              value={c.wabaNumber}
              note="A send whose number does not match this is rejected with 2002."
              critical
            />
          </div>
        </Panel>

        <CallbackPanel connector={c} />
      </div>

      {/* ───────────────────────── The new password, once ───────────────────── */}
      <Dialog open={!!rotated} onOpenChange={(v) => { if (!v) setRotated(null); }}>
        <DialogContent
          className="max-w-lg"
          // The rotation has already been written, so a dismissal here leaves a live
          // connector holding a password nobody has a copy of — recoverable only by
          // rotating again. Escape and a stray click outside are blocked for that
          // reason; the X and Done still work, because those are deliberate.
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
 * FR-1 shows the password once, which means this row is usually empty. It says so
 * rather than rendering dots next to a copy button — a copy control that yields
 * eight bullet characters is worse than no control, because it gets pasted.
 */
function PasswordRow({
  connector,
  onRotate,
}: {
  connector: CtConnector;
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
          {connector.rotation ? (
            <>
              Rotating — the previous password stays valid until{" "}
              <span className="font-medium text-foreground">{connector.rotation.until}</span>.
            </>
          ) : (
            <>Rotate to issue a new one. The old one keeps working for {CT_DEFAULT_GRACE_DAYS} days.</>
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

/* ──────────────────────────────── Callbacks ──────────────────────────────── */

/**
 * The two URLs that travel the other way.
 *
 * These are treated as secrets, which is not obvious and is worth saying on the
 * screen: CleverTap's callback URLs carry their own authorisation in the path, so
 * anyone holding one can write delivery receipts into that account. Hence masked
 * after save, and hence HTTPS enforced rather than warned about — the token is in
 * the URL, so plain HTTP would put it on the wire in clear.
 */
function CallbackPanel({ connector }: { connector: CtConnector }) {
  const [editing, setEditing] = useState(false);
  const [dlr, setDlr] = useState(connector.deliveryCallbackUrl ?? "");
  const [inbound, setInbound] = useState(connector.inboundCallbackUrl ?? "");
  const [touched, setTouched] = useState(false);

  const dlrError = callbackUrlError(dlr);
  const inboundError = callbackUrlError(inbound);
  const configured = !!connector.deliveryCallbackUrl && !!connector.inboundCallbackUrl;

  const save = () => {
    setTouched(true);
    if (dlrError || inboundError) return;
    updateCtConnector(connector.id, {
      deliveryCallbackUrl: dlr.trim(),
      inboundCallbackUrl: inbound.trim(),
    });
    setEditing(false);
    setTouched(false);
    toast.success("Callback URLs saved", {
      description: "Receipts and inbound replies will post to CleverTap from the next send.",
    });
  };

  return (
    <Panel
      title="Where we post back"
      caption="Generated by CleverTap, pasted here. Receipts go to the first; anything the customer replies goes to the second."
      action={
        !editing && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => {
              setDlr(connector.deliveryCallbackUrl ?? "");
              setInbound(connector.inboundCallbackUrl ?? "");
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
            <Label className="text-[12px]">Delivery report URL</Label>
            <Input
              value={dlr}
              onChange={(e) => setDlr(e.target.value)}
              placeholder="https://…"
              className="h-8 font-mono text-xs"
            />
            {touched && dlrError && <p className="text-[11px] text-destructive">{dlrError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">Inbound message URL</Label>
            <Input
              value={inbound}
              onChange={(e) => setInbound(e.target.value)}
              placeholder="https://…"
              className="h-8 font-mono text-xs"
            />
            {touched && inboundError && (
              <p className="text-[11px] text-destructive">{inboundError}</p>
            )}
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Treated as secrets. CleverTap puts the authorisation in the path, so whoever
            holds one of these can write into that account — they are stored encrypted and
            masked here after saving.
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
            label="Delivery report URL"
            value={maskCallbackUrl(connector.deliveryCallbackUrl!)}
            copyable={false}
            note="Masked. Replace it if CleverTap regenerates theirs."
          />
          <CopyRow
            label="Inbound message URL"
            value={maskCallbackUrl(connector.inboundCallbackUrl!)}
            copyable={false}
          />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-warning/30 bg-warning/5 px-3 py-3 text-[11.5px] leading-snug text-muted-foreground">
          <span className="font-medium text-warning">Not set.</span> Messages will still
          send, but CleverTap will show every one as pending forever and customer replies
          will not reach them. Both URLs are on their provider screen once it is saved.
        </p>
      )}
    </Panel>
  );
}

