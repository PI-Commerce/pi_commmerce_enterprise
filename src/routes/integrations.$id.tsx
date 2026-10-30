import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, ChevronDown, Loader2, Plus, RefreshCw, Trash2, TriangleAlert, Undo2, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useConnection, updateConnection, removeConnection, platform,
  discoverCatalogue, autoAssignRoles, addAudience, removeAudience, connectionHost,
  ROLES, HEALTH_LABEL, HEALTH_TONE,
  type RoleKey,
} from "@/lib/connections";
import {
  AudienceEditor, emptyDraft, draftReady, draftToAudience, type AudienceDraft,
} from "@/components/connections/AudienceEditor";
import { ConnectionDetailHeader } from "@/components/connections/ConnectionDetailHeader";
import { Panel } from "@/components/connections/Panel";

export const Route = createFileRoute("/integrations/$id")({
  component: ConnectionDetail,
  head: () => ({ meta: [{ title: "Connection · Pi Commerce Enterprise" }] }),
});

/**
 * One connection.
 *
 * The header answers "is it working". The main column then answers, top to bottom,
 * who we can reach, what we have agreed each field means, and what the system holds.
 * The rail holds the maintenance — dropping a remembered binding, turning write-back
 * on — which is read-mostly and deliberately quiet. It used to sit in a second column
 * of equal weight, which made it a second thing to read rather than a thing to glance
 * at.
 *
 * Audiences lead because they are the only part of this page that accumulates. One
 * account can be searched a dozen different ways, and every one of those searches
 * shares this credential, this catalogue and these roles — so they are rows here
 * rather than connections of their own. Adding the second one costs a name and a
 * search; nothing above it gets asked again.
 *
 * What is *not* here: batch sizes, retry policy, response-shape settings, rate
 * limits, coalescing windows. Those are real and we handle them, but a client
 * cannot act on any of them, so putting them on screen would only invite wrong
 * answers to questions we can answer ourselves.
 */
function ConnectionDetail() {
  const { id } = Route.useParams();
  const conn = useConnection(id);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [draft, setDraft] = useState<AudienceDraft | null>(null);
  const [openQuery, setOpenQuery] = useState<string | null>(null);

  if (!conn) {
    return (
      <AppShell>
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <h2 className="text-lg font-semibold">Connection not found</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">It may have been removed.</p>
          <Button variant="outline" size="sm" className="mt-5 h-8 gap-1.5 text-xs" asChild>
            <Link to="/integrations"><ArrowLeft className="h-3.5 w-3.5" /> All connections</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const p = platform(conn.platform);

  /** Reconnecting lands where a healthy connection already is: we can read again. */
  const recover = (message: string) => {
    setBusy(true);
    setTimeout(() => {
      const catalogue = conn.catalogue.length ? conn.catalogue : discoverCatalogue(conn.platform);
      updateConnection(conn.id, {
        health: "healthy",
        catalogue,
        roles: Object.keys(conn.roles).length ? conn.roles : autoAssignRoles(catalogue),
        signal: "Last sync just now",
        issue: undefined,
      });
      setBusy(false);
      toast.success(message);
    }, 1800);
  };

  const setRole = (role: RoleKey, value: string) => {
    updateConnection(conn.id, {
      roles: { ...conn.roles, [role]: value === "__none" ? undefined : value },
    });
  };

  const forgetHint = (field: string) => {
    const hints = { ...conn.hints };
    delete hints[field];
    updateConnection(conn.id, { hints });
    toast.success("Binding forgotten — you'll be asked about this field on the next run.");
  };

  const saveAudience = () => {
    addAudience(conn.id, draftToAudience(draft!, p));
    setDraft(null);
    toast.success("Audience added. It's selectable on any run using this connection.");
  };

  /** Which catalogue attribute, if any, each role currently points at. */
  const roleOwners = new Set(Object.values(conn.roles).filter(Boolean) as string[]);
  const catalogueNames = new Set(conn.catalogue.map((a) => a.name));
  const staleHints = Object.entries(conn.hints).filter(([, attr]) => !catalogueNames.has(attr));

  return (
    <AppShell>
      {/* ─────────────────────────────── Header ─────────────────────────────── */}
      <ConnectionDetailHeader
        mark={p}
        title={conn.label}
        meta={
          <>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", HEALTH_TONE[conn.health])}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" /> {HEALTH_LABEL[conn.health]}
            </span>
            <span className="text-[12px] text-muted-foreground">{conn.signal}</span>
            {/* The host, stated plainly. It is the one setting that silently
                invalidates everything else, so it should never have to be inferred
                from a failure. */}
            {connectionHost(conn) && (
              <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                {connectionHost(conn)}
              </span>
            )}
          </>
        }
        aside={
          /* Outline and destructive-toned, matching Delete on the connector pages. It
             was a ghost button in muted grey, which made the one irreversible action on
             this page the quietest control on it — and it fired immediately, while the
             equivalent on every connector page confirms first. */
          <Button
            variant="outline" size="sm"
            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
            onClick={() => setConfirmingRemove(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
        }
      />

      {/* ───────────────────────── Attention, if any ────────────────────────── */}
      {conn.health === "reconnect" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">Reconnect to resume</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              {conn.issue ?? "We can no longer read from this system."} Runs using this
              connection are paused, not cancelled — they resume from where they stopped.
            </p>
          </div>
          <Button size="sm" className="h-8 shrink-0 gap-1.5 text-xs" disabled={busy} onClick={() => recover("Reconnected. Syncing resumed.")}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Reconnect
          </Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* ──────────────── Audiences ───────────────── */}
          <Panel
            flush
            title="Audiences"
            caption={`Each one is a separate set of people read through this connection.${p.queryNoun ? "" : " Added from your saved lists."}`}
            action={
              <Button
                variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
                onClick={() => setDraft(emptyDraft(p))}
              >
                <Plus className="h-3 w-3" /> Add
              </Button>
            }
          >
            {conn.audiences.length === 0 ? (
              <Blank>None yet — add one and it becomes selectable on a run.</Blank>
            ) : (
              <div className="divide-y divide-border">
                {conn.audiences.map((a) => (
                  <div key={a.id} className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] font-medium">{a.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {a.mode === "query" ? (p.queryNoun ?? "Search") : `Saved ${p.audienceNoun}`}
                          {" · "}
                          checked {a.cadence === "15 min" ? "every 15 min" : a.cadence.toLowerCase()}
                          {" · "}
                          {a.size.toLocaleString()} records
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center">
                        {/* An authored search is only trustworthy if you can read it
                            back. Collapsed by default because three expanded JSON
                            bodies would bury everything under this panel. */}
                        {a.mode === "query" && a.query && (
                          <Button
                            variant="ghost" size="sm"
                            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={() => setOpenQuery(openQuery === a.id ? null : a.id)}
                          >
                            Criteria
                            <ChevronDown className={cn("h-3 w-3 transition-transform", openQuery === a.id && "rotate-180")} />
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="sm"
                          className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            removeAudience(conn.id, a.id);
                            toast.success("Audience removed. Runs already using it are unaffected.");
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {openQuery === a.id && a.query && (
                      <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-secondary/40 px-3 py-2 font-mono text-[11px] leading-relaxed">
                        {a.query}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* ─────────────────────── Roles ─────────────────────── */}
          <Panel
            flush
            title="What each attribute means"
            caption="Confirmed once, not per campaign. Campaign fields match by name, so phone in one and ph_number in the next both resolve without anyone being asked."
          >
            {conn.catalogue.length === 0 ? (
              <Blank>Nothing to assign yet — reconnect and we'll read your field list.</Blank>
            ) : (
              <div className="divide-y divide-border">
                {ROLES.map((role) => (
                  <div key={role.key} className="grid grid-cols-[1fr_1.1fr] items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium">
                        {role.label}
                        {role.required && <span className="ml-1 text-destructive">*</span>}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">{role.hint}</div>
                    </div>
                    <Select value={conn.roles[role.key] ?? "__none"} onValueChange={(v) => setRole(role.key, v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none" className="text-xs text-muted-foreground">Not available</SelectItem>
                        {conn.catalogue.map((a) => (
                          <SelectItem key={a.name} value={a.name} className="text-xs font-mono">{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* ──────────────────── Source catalogue ───────────────────── */}
          <Panel
            flush
            title="What this system can give us"
            caption="Read from your field metadata. Refreshed on every sync."
          >
            {conn.catalogue.length === 0 ? (
              <Blank>We'll list these once we can see your data.</Blank>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Attribute</th>
                    <th className="px-4 py-2 text-left font-medium">Type</th>
                    <th className="px-4 py-2 text-left font-medium">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {conn.catalogue.map((a) => (
                    <tr key={a.name}>
                      <td className="px-4 py-2 font-mono text-[12px]">
                        {a.name}
                        {roleOwners.has(a.name) && (
                          <span className="ml-2 rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            role
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[12px] text-muted-foreground">{a.type}</td>
                      <td className="px-4 py-2 truncate text-[12px] text-muted-foreground">{a.sample ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>

        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          {/* ─────────────── Remembered bindings ──────────────── */}
          <Panel
            flush
            title="Remembered bindings"
            caption="Answers you've already given. Each one means one fewer question on the next campaign."
          >
            {Object.keys(conn.hints).length === 0 ? (
              <Blank>Nothing remembered yet.</Blank>
            ) : (
              <div className="divide-y divide-border">
                {Object.entries(conn.hints).map(([field, attr]) => {
                  const stale = !catalogueNames.has(attr);
                  return (
                    <div key={field} className="flex items-center justify-between gap-2 px-4 py-2">
                      <div className="min-w-0 font-mono text-[11.5px]">
                        <span className="text-muted-foreground">{field}</span>
                        <span className="mx-1.5 text-muted-foreground/60">→</span>
                        <span className={cn(stale && "text-destructive line-through")}>{attr}</span>
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 shrink-0 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => forgetHint(field)}
                      >
                        <Undo2 className="h-3 w-3" /> Forget
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            {staleHints.length > 0 && (
              <p className="flex items-start gap-1.5 border-t border-border px-4 py-2.5 text-[11px] leading-relaxed text-destructive">
                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                {staleHints.length === 1 ? "One binding points" : `${staleHints.length} bindings point`} at an
                attribute this system no longer has. Any run that needs {staleHints.length === 1 ? "it" : "them"} will
                ask you to remap before it can launch — we won't send a message with a blank in it.
              </p>
            )}
          </Panel>

          {/* ─────────────── Write-back ──────────────── */}
          <Panel flush title="Results back in your system">
            <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
              <Switch
                checked={conn.writeBack}
                onCheckedChange={(v) => updateConnection(conn.id, { writeBack: v })}
                className="mt-0.5"
              />
              <span className="min-w-0 text-[12px] leading-relaxed text-muted-foreground">
                Write each person's outcome back against their record in {p.name} — contacted,
                replied, converted, or why we skipped them.
              </span>
            </label>
          </Panel>
        </div>
      </div>

      {/* ──────────────────────────── Add an audience ───────────────────────── */}
      <Dialog open={!!draft} onOpenChange={(v) => { if (!v) setDraft(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">Add an audience</DialogTitle>
            <DialogDescription className="text-xs">
              Read through {conn.label}. The credential and field mapping are already
              set — this only asks who's in it.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[62vh] overflow-y-auto py-1 pr-1">
            {draft && (
              <AudienceEditor
                plat={p}
                draft={draft}
                onChange={setDraft}
                existingIds={conn.audiences.map((a) => a.id)}
              />
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              size="sm" className="h-8 text-xs"
              disabled={!draft || !draftReady(draft)}
              onClick={saveAudience}
            >
              Add audience
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmingRemove} onOpenChange={setConfirmingRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Remove this connection?</AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px]">
              {conn.label} stops existing, along with the audiences defined on it. Runs that
              pull from it will have nothing to read. The credentials cannot be reissued —
              reconnecting creates a new connection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="h-8 bg-destructive text-xs text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                removeConnection(conn.id);
                toast.success("Connection removed.");
                navigate({ to: "/integrations" });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AppShell>
  );
}

function Blank({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">{children}</p>;
}
