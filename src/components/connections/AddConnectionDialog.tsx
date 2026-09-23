import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, ArrowRight, Check, Loader2, ShieldCheck, CircleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLATFORMS, BROKERED_OVERFLOW, ROLES, platformMark, autoAssignRoles,
  discoverCatalogue, addConnection,
  type Connection, type Platform, type RoleKey, type SourceAttribute,
} from "@/lib/connections";
import {
  AudienceEditor, emptyDraft, draftReady, draftToAudience, type AudienceDraft,
} from "./AudienceEditor";

/**
 * Connect a CRM.
 *
 *   choose → authorise → roles → audience → done
 *
 * Four questions, asked once. The order is deliberate: permission first, because
 * nothing after it is answerable without their data; roles second, because they
 * are a property of the system rather than of any campaign; the audience last,
 * because it is the only answer a run can override.
 *
 * The audience step defines the *first* audience, not the only one. Everything
 * before it — the credential, the region, the catalogue, the roles — belongs to
 * the account and is true of every audience read through it, so a second search
 * is a row added on the connection page rather than a second trip through here.
 *
 * Systems that push to us have no flow here at all. There is no credential to
 * take, no catalogue to read and no audience to pick — the only thing to decide
 * is the shape of the body, and that depends on a campaign, so it belongs on the
 * run. See the header of `@/lib/connections`.
 */

type Step = "choose" | "authorise" | "roles" | "audience" | "done";

export function AddConnectionDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("choose");
  const [plat, setPlat] = useState<Platform | null>(null);
  const [label, setLabel] = useState("");
  const [region, setRegion] = useState("");
  const [busy, setBusy] = useState(false);
  const [catalogue, setCatalogue] = useState<SourceAttribute[]>([]);
  const [roles, setRoles] = useState<Partial<Record<RoleKey, string>>>({});
  const [draft, setDraft] = useState<AudienceDraft | null>(null);
  const [created, setCreated] = useState<Connection | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const after = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStep("choose"); setPlat(null); setLabel(""); setRegion(""); setBusy(false);
    setCatalogue([]); setRoles({}); setDraft(null); setCreated(null);
  };

  useEffect(() => { if (open) reset(); return () => timers.current.forEach(clearTimeout); }, [open]);

  const pick = (p: Platform) => {
    setPlat(p);
    setLabel(`${p.name} · Main`);
    // Preselect the first region rather than an empty state. A required field with
    // no default reads as a decision; there is a most-common answer, and anyone on
    // the other host knows it.
    setRegion(p.regions?.[0].key ?? "");
    setDraft(emptyDraft(p));
    setStep("authorise");
  };

  /** Read their field metadata, then guess what each field means. */
  const authorise = () => {
    setBusy(true);
    after(1500, () => {
      const found = discoverCatalogue(plat!.key);
      setCatalogue(found);
      setRoles(autoAssignRoles(found));
      setBusy(false);
      setStep("roles");
    });
  };

  const rolesOk = ROLES.filter((r) => r.required).every((r) => !!roles[r.key]);
  const host = plat?.regions?.find((r) => r.key === region)?.host ?? null;

  const finish = () => {
    const first = draftToAudience(draft!, plat!);

    const conn: Connection = {
      id: `conn_${plat!.key}_${Date.now().toString(36)}`,
      platform: plat!.key,
      label: label.trim() || plat!.name,
      region: region || undefined,
      health: "healthy",
      createdAt: "Today",
      signal: `Synced just now · ${first.size.toLocaleString()} records`,
      catalogue,
      roles,
      hints: {},
      audiences: [first],
      writeBack: false,
    };
    addConnection(conn);
    setCreated(conn);
    setStep("done");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {/* "CRM source", not "connection": this dialog only ever lists CRMs, and
                calling it a connection made it look like the way to add any of the
                three kinds of thing on the Connections page. Same words as the menu
                item that opens it and the column header of the group it adds to. */}
            {step === "choose" ? "Add a CRM source" : plat?.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {step === "choose" && "Pi Commerce reads your audience where it already lives. Pick the CRM it comes from."}
            {step === "authorise" && `Authorise Pi Commerce to read your ${plat?.audienceNoun}s.`}
            {step === "roles" && "We found these. Confirm we've read them correctly — this is asked once, not per campaign."}
            {step === "audience" && "Define the first audience we watch. You can add more from the connection page."}
            {step === "done" && "Connected. This is now available as an audience source on any run."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] overflow-y-auto py-1 pr-1">
          {/* ───────────────────────── Choose a platform ───────────────────────── */}
          {step === "choose" && (
            <div className="space-y-3">
              {/* Unbuilt platforms stay visible but unclickable. Hiding them would
                  make the list read as final and invite "do you support X?" tickets;
                  letting them be picked would spend someone's OAuth consent on a dead
                  end they'd discover two screens later. */}
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    disabled={!p.live}
                    onClick={() => pick(p)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md border border-input px-3 py-2.5 text-left transition-colors",
                      p.live
                        ? "bg-background hover:border-primary/40 hover:bg-accent/40"
                        : "cursor-not-allowed bg-muted/30",
                    )}
                  >
                    <span className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px] font-semibold",
                      p.accent, !p.live && "opacity-55",
                    )}>
                      {platformMark(p.name)}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-[12.5px] font-medium", !p.live && "text-muted-foreground")}>
                      {p.name}
                    </span>
                    {!p.live && (
                      <span className="shrink-0 rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Soon
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Plus {BROKERED_OVERFLOW} more CRMs on the roadmap. Until yours is live, a
                CSV upload covers the same run.
              </p>
              {/* Answers "my engagement tool isn't in this list" — the one question
                  this step provokes. Two answers, because there are two things a
                  client can mean by CleverTap, and the old note gave only the first
                  while the second was live on the page behind this dialog. */}
              <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                CleverTap, WebEngage or MoEngage? If they <span className="font-medium text-foreground">push
                people to you</span>, there is nothing to connect — pick{" "}
                <span className="font-medium text-foreground">API payload</span> on a run
                and we'll generate the body. If you want{" "}
                <span className="font-medium text-foreground">us to deliver their
                campaigns</span>, that's a delivery connector — the other item in the Add
                menu.
              </p>
            </div>
          )}

          {/* ─────────────────────────────── Authorise ─────────────────────────── */}
          {step === "authorise" && plat && (
            <div className="space-y-4">
              <Field label="Name this connection">
                <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-9 text-sm" maxLength={60} />
              </Field>

              {plat.auth === "oauth" ? (
                <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-8 text-center">
                  <ShieldCheck className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
                  <p className="mx-auto max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
                    You'll sign in to {plat.name} and approve read access. Pi Commerce
                    never sees your password, and the permission can be revoked from
                    {" "}{plat.name} at any time.
                  </p>
                  <Button size="sm" className="mt-4 h-8 gap-1.5 text-xs" disabled={busy} onClick={authorise}>
                    {busy
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Authorising…</>
                      : <>Continue to {plat.name} <ArrowRight className="h-3.5 w-3.5" /></>}
                  </Button>
                </div>
              ) : (
                <>
                  {/* Region sits above the keys because it is the thing people get
                      wrong. Keys are copied and pasted; the host is remembered, and a
                      wrong one fails every call with an error that looks like bad
                      credentials. Showing the resolved host makes it checkable against
                      the URL already in their browser. */}
                  {plat.regions && (
                    <Field
                      label="Account region"
                      hint={
                        host
                          ? `We'll call ${host}. It's the domain on your ${plat.name} API docs page — check it matches.`
                          : undefined
                      }
                    >
                      <Select value={region} onValueChange={setRegion}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {plat.regions.map((r) => (
                            <SelectItem key={r.key} value={r.key} className="text-xs">
                              {r.label} <span className="text-muted-foreground">· {r.host}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                  <Field label="Access key">
                    <Input placeholder="Paste from your admin console" className="h-9 text-sm" />
                  </Field>
                  <Field label="Secret key" hint="Stored encrypted. Used only to read the audiences you choose.">
                    <Input type="password" placeholder="••••••••••••" className="h-9 text-sm" />
                  </Field>
                </>
              )}
            </div>
          )}

          {/* ──────────────────────────── Confirm roles ────────────────────────── */}
          {step === "roles" && (
            <div className="space-y-4">
              <p className="rounded-md border border-success/25 bg-success/8 px-3 py-2 text-[12px] text-foreground">
                <Check className="mr-1.5 inline h-3.5 w-3.5 text-success" />
                Read {catalogue.length} attributes.
                {" "}
                <span className="text-muted-foreground">
                  Campaign fields bind to these automatically — you'll only be asked about
                  the ones we can't work out.
                </span>
              </p>

              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {ROLES.map((role) => (
                  <div key={role.key} className="grid grid-cols-[1fr_1.2fr] items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium">
                        {role.label}
                        {role.required && <span className="ml-1 text-destructive">*</span>}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">{role.hint}</div>
                    </div>
                    <Select
                      value={roles[role.key] ?? "__none"}
                      onValueChange={(v) => setRoles((r) => ({ ...r, [role.key]: v === "__none" ? undefined : v }))}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none" className="text-xs text-muted-foreground">Not available</SelectItem>
                        {catalogue.map((a) => (
                          <SelectItem key={a.name} value={a.name} className="text-xs font-mono">{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {!rolesOk && (
                <p className="flex items-start gap-1.5 text-[11px] text-destructive">
                  <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                  Phone and primary identifier are required — without them we can't reach
                  anyone or report an outcome back against the right record.
                </p>
              )}
            </div>
          )}

          {/* ────────────────────────── Choose the audience ────────────────────── */}
          {step === "audience" && plat && draft && (
            <AudienceEditor plat={plat} draft={draft} onChange={setDraft} />
          )}

          {/* ──────────────────────────────── Done ─────────────────────────────── */}
          {step === "done" && created && plat && (
            <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-success/10 text-success">
                <Check className="h-6 w-6" />
              </div>
              <h3 className="text-[15px] font-semibold">{created.label} is connected</h3>
              <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">{created.audiences[0].name}</span>{" "}
                is checked{" "}
                {created.audiences[0].cadence === "15 min"
                  ? "every 15 minutes"
                  : created.audiences[0].cadence.toLowerCase()}
                , and is now selectable on any run.
              </p>
              <p className="mx-auto mt-2 max-w-sm text-[11.5px] leading-relaxed text-muted-foreground">
                Need another audience off this account? Add it on the connection page —
                the credential and the field mapping are already done.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"
            onClick={() => {
              if (step === "choose" || step === "done") { onOpenChange(false); return; }
              if (step === "authorise") { setStep("choose"); setPlat(null); return; }
              if (step === "roles") { setStep("authorise"); return; }
              if (step === "audience") setStep("roles");
            }}
            disabled={busy}
          >
            {step === "choose" || step === "done"
              ? "Close"
              : <><ArrowLeft className="h-3.5 w-3.5" /> Back</>}
          </Button>

          {step === "authorise" && plat?.auth === "credentials" && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={authorise}>
              {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting…</> : <>Connect <ArrowRight className="h-3.5 w-3.5" /></>}
            </Button>
          )}
          {step === "roles" && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!rolesOk} onClick={() => setStep("audience")}>
              Confirm <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {step === "audience" && (
            <Button
              size="sm" className="h-8 gap-1.5 text-xs"
              disabled={!draft || !draftReady(draft)}
              onClick={finish}
            >
              Finish <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {step === "done" && created && (
            <Button
              size="sm" className="h-8 gap-1.5 text-xs"
              onClick={() => { onOpenChange(false); navigate({ to: "/integrations/$id", params: { id: created.id } }); }}
            >
              View connection <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}
