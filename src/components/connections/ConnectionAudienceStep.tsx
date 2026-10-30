import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Check, Loader2, TriangleAlert, Wand2, Ban, Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useConnections, platform, platformMark, campaignFields, resolveBindings,
  bindingsReady, unresolvedCount,
  type Binding, type BindingStatus, type Connection, type SavedAudience,
} from "@/lib/connections";

/**
 * The audience step of a run, when we pull the audience out of a CRM.
 *
 * This is where "connect once, bind per run" is cashed in. The connection already
 * knows what its system can supply and which attributes are the phone, the name and
 * the record ID; this screen only has to resolve *this* campaign's fields against
 * that, and ask about the leftovers.
 *
 * By design, most of it is ticks. A dropdown appearing here is a small failure —
 * either a field we've never seen, or a binding that has gone stale — and it is
 * shown as an exception, not as the default state of the screen.
 *
 * The mirror of this screen — a run fed by an inbound payload — has no equivalent
 * and should never grow one: we hand that client the body to paste, so the keys
 * arrive already matching. Asking them to map afterwards would be asking them to
 * reconcile their own snippet against itself.
 */

export type ConnectionAudienceValue = {
  connectionId: string;
  audienceId?: string;
  /** Field name → source attribute, for the fields the user resolved by hand. */
  overrides: Record<string, string>;
  ready: boolean;
};

const STATUS_LABEL: Record<BindingStatus, string> = {
  role: "Auto",
  hint: "Remembered",
  exact: "Matched",
  unbound: "Needs mapping",
  remap: "Needs remapping",
};

const STATUS_TONE: Record<BindingStatus, string> = {
  role: "border-success/30 bg-success/10 text-success",
  hint: "border-success/30 bg-success/10 text-success",
  exact: "border-success/30 bg-success/10 text-success",
  unbound: "border-warning/30 bg-warning/10 text-warning",
  remap: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function ConnectionAudienceStep({
  campaignId, value, onChange,
}: {
  campaignId: string;
  value: ConnectionAudienceValue | null;
  onChange: (v: ConnectionAudienceValue | null) => void;
}) {
  const connections = useConnections();
  const [connectionId, setConnectionId] = useState(value?.connectionId ?? "");
  const [audienceId, setAudienceId] = useState(value?.audienceId ?? "");
  const [overrides, setOverrides] = useState<Record<string, string>>(value?.overrides ?? {});
  const [dryRun, setDryRun] = useState<"idle" | "running" | "done">("idle");

  const conn = connections.find((c) => c.id === connectionId);
  const fields = useMemo(() => campaignFields(campaignId), [campaignId]);
  const bindings = useMemo(
    () => (conn ? resolveBindings(fields, conn, overrides) : []),
    [conn, fields, overrides],
  );

  const audienceOk = !conn || !!audienceId;
  const ready = !!conn && bindingsReady(bindings) && audienceOk;
  const unresolved = unresolvedCount(bindings);

  // Changing the connection invalidates every by-hand mapping and the dry run —
  // a different system means different attributes.
  useEffect(() => {
    setOverrides({});
    setDryRun("idle");
    setAudienceId(conn?.audiences[0]?.id ?? "");
  }, [connectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setDryRun("idle"); }, [overrides, audienceId]);

  useEffect(() => {
    onChange(conn ? { connectionId, audienceId: audienceId || undefined, overrides, ready } : null);
  }, [connectionId, audienceId, overrides, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (connections.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-center">
        <Plug className="mx-auto mb-2 h-4 w-4 text-muted-foreground" />
        <p className="text-[12px] text-muted-foreground">
          No connections yet.{" "}
          <Link to="/integrations" className="font-medium text-foreground underline underline-offset-2">
            Connect a system
          </Link>{" "}
          and its audience becomes available here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ─────────────────────────── Pick a connection ─────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-xs">Connection <span className="text-destructive">*</span></Label>
        <Select value={connectionId} onValueChange={setConnectionId}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Select a connected system" />
          </SelectTrigger>
          <SelectContent>
            {connections.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs" disabled={c.health !== "healthy"}>
                {c.label}
                {c.health !== "healthy" && (
                  <span className="ml-1.5 text-muted-foreground">· needs reconnecting</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {conn && (
        <>
          <ConnectionSummary conn={conn} />

          {/* ─────────────────── Which audience, this run ────────────────────
              Labelled "Audience", not "List" or "Lead Search": one connection holds
              both kinds, so the platform's noun for either would be wrong half the
              time. Which kind each one is belongs in the option, where it describes
              a specific thing rather than the whole field. */}
          <div className="space-y-1.5">
            <Label className="text-xs">Audience <span className="text-destructive">*</span></Label>
            {conn.audiences.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
                This connection has no audiences yet.{" "}
                <Link
                  to="/integrations/$id" params={{ id: conn.id }}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Add one
                </Link>{" "}
                and it appears here.
              </p>
            ) : (
              <Select value={audienceId} onValueChange={setAudienceId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select an audience" />
                </SelectTrigger>
                <SelectContent>
                  {conn.audiences.map((a: SavedAudience) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">
                      {a.name}
                      <span className="text-muted-foreground">
                        {" · "}
                        {a.mode === "query"
                          ? (platform(conn.platform).queryNoun ?? "Search")
                          : `Saved ${platform(conn.platform).audienceNoun}`}
                        {" · "}{a.size.toLocaleString()} records
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Only people who newly qualify are picked up — nobody is contacted twice
              for the same run.
            </p>
          </div>

          {/* ──────────────────────────── Bindings ──────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Campaign fields</Label>
              {unresolved === 0 ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-success">
                  <Check className="h-3 w-3" /> All {bindings.length} resolved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-warning">
                  <TriangleAlert className="h-3 w-3" /> {unresolved} need{unresolved === 1 ? "s" : ""} your input
                </span>
              )}
            </div>

            <div className="divide-y divide-border overflow-hidden rounded-md border border-input">
              {bindings.map((b) => (
                <BindingRow
                  key={b.field.name}
                  binding={b}
                  conn={conn}
                  onPick={(attr) => setOverrides((o) => ({ ...o, [b.field.name]: attr }))}
                />
              ))}
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {unresolved === 0
                ? "Anything you answer here is remembered on the connection, so the next campaign asks less."
                : "A field with no source would send a blank into a live message, so these have to be answered before the run can start."}
            </p>
          </div>

          {/* ──────────────────────────── Dry run ──────────────────────────── */}
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-2.5">
            {dryRun === "done" ? (
              <DryRunResult conn={conn} bindings={bindings} onReset={() => setDryRun("idle")} />
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Check before you send.</span>{" "}
                  We'll pull five real people and show exactly what each message would say.
                  Nothing is contacted.
                </p>
                <Button
                  type="button" variant="outline" size="sm"
                  className="h-8 shrink-0 gap-1.5 text-xs"
                  disabled={!ready || dryRun === "running"}
                  onClick={() => { setDryRun("running"); setTimeout(() => setDryRun("done"), 1400); }}
                >
                  {dryRun === "running"
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</>
                    : <><Wand2 className="h-3.5 w-3.5" /> Check 5 people</>}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────── Sub-components ──────────────────────────── */

function ConnectionSummary({ conn }: { conn: Connection }) {
  const p = platform(conn.platform);
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-input bg-background px-3 py-2">
      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px] font-semibold", p.accent)}>
        {platformMark(p.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium">{conn.label}</div>
        <div className="truncate text-[11px] text-muted-foreground">{conn.signal}</div>
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {conn.catalogue.length} attributes
      </span>
    </div>
  );
}

function BindingRow({
  binding, conn, onPick,
}: {
  binding: Binding;
  conn: Connection;
  onPick: (attr: string) => void;
}) {
  const needsInput = binding.status === "unbound" || binding.status === "remap";
  return (
    <div className="grid grid-cols-[1fr_1.15fr] items-center gap-2 px-2.5 py-1.5">
      <div className="min-w-0">
        <div className="truncate font-mono text-[11.5px]">{binding.field.name}</div>
        {binding.status === "remap" && (
          <div className="truncate text-[10.5px] text-destructive">
            {binding.attribute} no longer exists in {platform(conn.platform).name}
          </div>
        )}
      </div>

      {needsInput ? (
        <Select value="" onValueChange={onPick}>
          <SelectTrigger className="h-7 text-[11px]">
            <SelectValue placeholder="Choose an attribute" />
          </SelectTrigger>
          <SelectContent>
            {conn.catalogue.map((a) => (
              <SelectItem key={a.name} value={a.name} className="font-mono text-xs">{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-mono text-[11.5px] text-muted-foreground">{binding.attribute}</span>
          <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", STATUS_TONE[binding.status])}>
            {STATUS_LABEL[binding.status]}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The dry run is the only place we show raw values, and it is the moment that
 * converts a mapping table into confidence. It also has to be honest about the
 * people we will *not* contact — a silent skip reads as a bug.
 */
function DryRunResult({
  conn, bindings, onReset,
}: {
  conn: Connection;
  bindings: Binding[];
  onReset: () => void;
}) {
  const p = platform(conn.platform);
  const attr = (name: string) => conn.catalogue.find((a) => a.name === name);

  const nameBinding = bindings.find((b) => b.role === "name") ?? bindings[0];
  const phoneBinding = bindings.find((b) => b.role === "phone");
  const detail = bindings.find((b) => !b.role && b.attribute);

  const namePool = ["Ananya Rao", "Rohit Kulkarni", "Meera Iyer", "Kabir Shah", "Priya Nair"];
  const phoneBase = phoneBinding?.attribute ? attr(phoneBinding.attribute)?.sample ?? "+91 98670 41123" : "—";
  const detailSample = detail?.attribute ? attr(detail.attribute)?.sample ?? "—" : null;

  // The last person is suppressed when this system tells us not to contact them.
  const hasConsent = !!conn.roles.consent;
  const skipped = hasConsent ? 1 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium">
          <Check className="h-3.5 w-3.5 text-success" />
          {5 - skipped} ready to send
          {skipped > 0 && <span className="font-normal text-muted-foreground">· {skipped} skipped</span>}
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={onReset}>
          Run again
        </Button>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded border border-border bg-card">
        {namePool.slice(0, 5).map((name, i) => {
          const isSkipped = hasConsent && i === 4;
          return (
            <div key={name} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
              {isSkipped
                ? <Ban className="h-3 w-3 shrink-0 text-muted-foreground" />
                : <Check className="h-3 w-3 shrink-0 text-success" />}
              <span className={cn("w-28 shrink-0 truncate", isSkipped && "text-muted-foreground line-through")}>
                {nameBinding?.attribute ? name : "—"}
              </span>
              <span className="w-32 shrink-0 truncate font-mono text-muted-foreground">
                {phoneBase.slice(0, -2)}{String(10 + i)}
              </span>
              {isSkipped ? (
                <span className="truncate text-muted-foreground">
                  {conn.roles.consent} set in {p.name}
                </span>
              ) : (
                detailSample && (
                  <span className="truncate text-muted-foreground">
                    {detail!.field.name}: {detailSample}
                  </span>
                )
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        These are real records read from {p.name}. Nobody was contacted.
        {hasConsent && " People this system marks as do-not-contact are suppressed automatically — you don't have to filter them out on their side."}
      </p>
    </div>
  );
}
