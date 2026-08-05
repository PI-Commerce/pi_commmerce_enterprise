/**
 * Integrations → Developer.
 *
 * Two industry-standard tables + modal dialogs:
 *   - API Keys — Name · Key (prefix) · Created · Last used · Status · Actions
 *   - Webhooks — Name · Type · URL · Status · Last delivery · Actions
 *
 * v1 scope, kept intentionally minimal:
 *   - Only Human Escalation webhooks are creatable. Channels + Campaign
 *     options render disabled in the type picker (pending payload alignment
 *     with backend). Same version enables them; nothing in the app breaks
 *     when they flip to true.
 *   - HMAC-SHA256 signature on the raw POST body, `X-Webhook-Signature`
 *     header, hex lowercase output. Signing secret is shown once at
 *     creation; concealed thereafter with a Reveal toggle. No rotate in v1.
 *   - No retry-policy picker, no custom headers, no delivery-log drill-down.
 *     Row-level "Last delivery" cell only. Actions are Pause / Resume only —
 *     no destructive Delete in v1.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, KeyRound, Webhook as WebhookIcon, Copy, Trash2, Pause,
  CheckCircle2, EyeOff, Eye, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import {
  useWebhooks, upsertWebhook, toggleWebhook,
} from "@/lib/webhooks-store";
import {
  WEBHOOK_TYPE_LABEL, WEBHOOK_TYPE_DESCRIPTION, WEBHOOK_TYPE_ENABLED,
  AUTO_INCLUDED_FIELDS, PAYLOAD_EXAMPLE, SIGNATURE_HEADER,
  maskSecret, generateSigningSecret,
  type Webhook, type WebhookType,
} from "@/lib/webhooks-data";
import {
  useApiKeys, upsertApiKey, revokeApiKey, removeApiKey, generateApiKey,
} from "@/lib/api-keys-data";

/** Dummy docs URL — replace when API docs page ships. */
const DOCS_URL = "/docs/webhooks";

/* ============================================================ */
/*  Root                                                        */
/* ============================================================ */

export function Developer() {
  return (
    <div className="space-y-8">
      <ApiKeysCard />
      <WebhooksCard />
    </div>
  );
}

/* ============================================================ */
/*  API Keys                                                    */
/* ============================================================ */

function ApiKeysCard() {
  const keys = useApiKeys();
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<{ name: string; full: string } | null>(null);

  return (
    <>
      <SurfaceCard
        icon={KeyRound}
        title="API keys"
        subtitle="Authenticate inbound calls to the API. Full key is shown once at creation."
        cta={<Button size="sm" className="h-8 gap-1.5 text-[11.5px]" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" /> Create key</Button>}
      >
        {keys.length === 0 ? (
          <EmptyRow copy="No API keys yet." />
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Key</th>
                <th className="px-4 py-2 text-left font-medium">Created</th>
                <th className="px-4 py-2 text-left font-medium">Last used</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="w-16 px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-border/60">
                  <td className="px-4 py-3 font-medium">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-[11.5px] text-muted-foreground">{k.keyPrefix}{k.status === "active" ? "…" : ""}</td>
                  <td className="px-4 py-3 text-[11.5px] text-muted-foreground">{formatIso(k.createdAt)}</td>
                  <td className="px-4 py-3 text-[11.5px] text-muted-foreground">{k.lastUsedAt ? relTime(k.lastUsedAt) : <span className="text-muted-foreground/60">Never</span>}</td>
                  <td className="px-4 py-3"><StatusPill on={k.status === "active"} onLabel="Active" offLabel="Revoked" /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {k.status === "active" && (
                        <IconBtn title="Revoke" onClick={() => {
                          if (confirm(`Revoke "${k.name}"?`)) { revokeApiKey(k.id); toast.success("Key revoked"); }
                        }}>
                          <Pause className="h-3.5 w-3.5" />
                        </IconBtn>
                      )}
                      {k.status === "revoked" && (
                        <IconBtn title="Delete" onClick={() => {
                          if (confirm(`Delete "${k.name}" permanently?`)) { removeApiKey(k.id); toast.success("Key deleted"); }
                        }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SurfaceCard>

      <CreateApiKeyDialog
        key={creating ? "open" : "closed"}
        open={creating}
        onOpenChange={setCreating}
        onCreate={(name) => {
          const { prefix, full } = generateApiKey();
          const id = `ak_${Math.random().toString(36).slice(2, 8)}`;
          upsertApiKey({ id, name, keyPrefix: prefix, keyFull: full, createdAt: new Date().toISOString(), status: "active" });
          setJustCreated({ name, full });
        }}
      />

      <RevealApiKeyDialog
        open={!!justCreated}
        onOpenChange={(o) => { if (!o) setJustCreated(null); }}
        value={justCreated}
      />
    </>
  );
}

function CreateApiKeyDialog({
  open, onOpenChange, onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>Full key is shown once. Save it before closing.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Warehouse ingest" className="h-9 text-[13px]" />
          <p className="text-[11px] text-muted-foreground">A label for your reference.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!name.trim()} onClick={() => { onCreate(name.trim()); onOpenChange(false); }}>Create key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevealApiKeyDialog({
  open, onOpenChange, value,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: { name: string; full: string } | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save this key</DialogTitle>
          <DialogDescription>This is the only time the full key will be shown.</DialogDescription>
        </DialogHeader>
        {value && (
          <div className="space-y-2">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{value.name}</Label>
            <div className="rounded-lg border border-border bg-secondary/50 p-3">
              <p className="break-all font-mono text-[12px] text-foreground">{value.full}</p>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
                onClick={() => {
                  navigator.clipboard?.writeText(value.full).catch(() => undefined);
                  toast.success("Key copied");
                }}
              ><Copy className="h-3 w-3" /> Copy</Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================ */
/*  Webhooks                                                    */
/* ============================================================ */

function WebhooksCard() {
  const webhooks = useWebhooks();
  const [dialogState, setDialogState] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [justCreatedSecret, setJustCreatedSecret] = useState<{ name: string; secret: string } | null>(null);

  const editing = dialogState.editId ? webhooks.find((w) => w.id === dialogState.editId) : undefined;

  return (
    <>
      <SurfaceCard
        icon={WebhookIcon}
        title="Webhooks"
        subtitle="Register a URL to receive event notifications from the platform."
        cta={<Button size="sm" className="h-8 gap-1.5 text-[11.5px]" onClick={() => setDialogState({ open: true })}><Plus className="h-3.5 w-3.5" /> Add webhook</Button>}
      >
        {webhooks.length === 0 ? (
          <EmptyRow copy="No webhooks yet." />
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-left font-medium">URL</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Last delivery</th>
                <th className="w-16 px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w) => (
                <tr key={w.id} className="border-t border-border/60 hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <button onClick={() => setDialogState({ open: true, editId: w.id })} className="text-left font-medium hover:underline">
                      {w.name}
                    </button>
                    <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{w.id}</p>
                  </td>
                  <td className="px-4 py-3"><TypePill type={w.type} /></td>
                  <td className="px-4 py-3">
                    <p className="max-w-[280px] truncate font-mono text-[11px]" title={w.endpointUrl}>{w.endpointUrl}</p>
                  </td>
                  <td className="px-4 py-3"><StatusPill on={w.status === "active"} onLabel="Active" offLabel="Paused" /></td>
                  <td className="px-4 py-3 text-[11.5px] text-muted-foreground">
                    {w.lastDeliveryAt ? relTime(w.lastDeliveryAt) : <span className="text-muted-foreground/60">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn title={w.status === "active" ? "Pause" : "Resume"} onClick={() => {
                        toggleWebhook(w.id);
                        toast.success(`Webhook ${w.status === "active" ? "paused" : "resumed"}`);
                      }}>
                        {w.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SurfaceCard>

      <WebhookDialog
        key={dialogState.editId ?? (dialogState.open ? "__new__" : "__closed__")}
        open={dialogState.open}
        onOpenChange={(o) => setDialogState({ open: o })}
        initial={editing}
        onCreatedReveal={(name, secret) => setJustCreatedSecret({ name, secret })}
      />

      <RevealSecretDialog
        open={!!justCreatedSecret}
        onOpenChange={(o) => { if (!o) setJustCreatedSecret(null); }}
        value={justCreatedSecret}
      />
    </>
  );
}

function TypePill({ type }: { type: WebhookType }) {
  const tone: Record<WebhookType, string> = {
    channels:         "border-ai/30 bg-ai/10 text-ai",
    campaign:         "border-success/30 bg-success/10 text-success",
    human_escalation: "border-warning/40 bg-warning/10 text-warning",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium", tone[type])}>
      {WEBHOOK_TYPE_LABEL[type]}
    </span>
  );
}

/* ---------- Webhook add/edit dialog ---------- */

function WebhookDialog({
  open, onOpenChange, initial, onCreatedReveal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Webhook;
  onCreatedReveal: (name: string, secret: string) => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<WebhookType>(initial?.type ?? "human_escalation");
  const [endpointUrl, setEndpointUrl] = useState(initial?.endpointUrl ?? "");
  const [status, setStatus] = useState<Webhook["status"]>(initial?.status ?? "active");
  const [signingSecret, setSigningSecret] = useState(initial?.signingSecret ?? generateSigningSecret());
  const [secretRevealed, setSecretRevealed] = useState(false);

  // Belt-and-braces reset: the parent uses `key` to force a remount on open,
  // but HMR and Radix's own state can preserve stale values otherwise. Reset
  // form fields any time the dialog transitions to open or `initial` changes.
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setType(initial?.type ?? "human_escalation");
    setEndpointUrl(initial?.endpointUrl ?? "");
    setStatus(initial?.status ?? "active");
    setSigningSecret(initial?.signingSecret ?? generateSigningSecret());
    setSecretRevealed(false);
  }, [open, initial]);

  const save = () => {
    if (!name.trim())                             { toast.error("Add a name."); return; }
    if (!/^https?:\/\//.test(endpointUrl.trim())) { toast.error("URL must start with http(s)://"); return; }
    const next: Webhook = {
      id: initial?.id ?? `wh_${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      type,
      endpointUrl: endpointUrl.trim(),
      signingSecret,
      headers: initial?.headers ?? [],
      status,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      lastDeliveryAt: initial?.lastDeliveryAt,
    };
    upsertWebhook(next);
    onOpenChange(false);
    if (isEdit) {
      toast.success("Webhook updated");
    } else {
      onCreatedReveal(next.name, signingSecret);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit webhook" : "Add webhook"}</DialogTitle>
          <DialogDescription>Register a URL, pick a type, save. Attach it where the event fires.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client CRM · Escalations" className="h-9 text-[13px]" />
            </Field>

            <Field label="Type" required>
              <Select value={type} onValueChange={(v) => setType(v as WebhookType)} disabled={isEdit}>
                <SelectTrigger className="h-9 text-[12.5px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(WEBHOOK_TYPE_LABEL) as WebhookType[]).map((t) => (
                    <SelectItem
                      key={t}
                      value={t}
                      disabled={!WEBHOOK_TYPE_ENABLED[t]}
                      className="text-[12.5px]"
                    >
                      <span className="flex items-center gap-1.5">
                        {WEBHOOK_TYPE_LABEL[t]}
                        {!WEBHOOK_TYPE_ENABLED[t] && (
                          <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-muted-foreground">Soon</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{WEBHOOK_TYPE_DESCRIPTION[type]}</p>
              {isEdit && <p className="text-[10.5px] text-muted-foreground">Type is fixed after creation.</p>}
            </Field>

            <Field label="Endpoint URL" required>
              <Input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} placeholder="https://client.example.com/hooks/pi" className="h-9 font-mono text-[12px]" />
              <p className="text-[11px] text-muted-foreground">POST · JSON body · signed with {SIGNATURE_HEADER}.</p>
            </Field>
          </div>

          <div className="space-y-4">
            <Field label="Signing secret" desc={`HMAC-SHA256 over the raw body. Sent as ${SIGNATURE_HEADER}. Verify on your receiver.`}>
              <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
                {secretRevealed ? (
                  <p className="break-all font-mono text-[11.5px] text-foreground">{signingSecret}</p>
                ) : (
                  <p className="font-mono text-[11.5px] text-muted-foreground">{maskSecret(signingSecret)}</p>
                )}
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => {
                    navigator.clipboard?.writeText(signingSecret).catch(() => undefined);
                    toast.success("Secret copied");
                  }}>
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setSecretRevealed((v) => !v)}>
                    {secretRevealed ? <><EyeOff className="h-3 w-3" /> Hide</> : <><Eye className="h-3 w-3" /> Reveal</>}
                  </Button>
                </div>
                {!isEdit && (
                  <p className="text-[10.5px] text-warning">Save this secret. Full value is shown once at creation.</p>
                )}
              </div>
            </Field>

            <Field label="Payload preview" desc={<>Example event body. <a href={DOCS_URL} className="text-foreground underline underline-offset-2 hover:text-ai" target="_blank" rel="noreferrer">See docs <ExternalLink className="ml-0.5 inline h-2.5 w-2.5" /></a></>}>
              <PayloadPreview type={type} />
            </Field>

            <Field label="Status">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 p-3">
                <div>
                  <p className="text-[12.5px] font-medium">Active</p>
                  <p className="text-[11px] text-muted-foreground">Paused webhooks stay registered but receive nothing.</p>
                </div>
                <Switch checked={status === "active"} onCheckedChange={(v) => setStatus(v ? "active" : "paused")} />
              </div>
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={save}>{isEdit ? "Save changes" : "Add webhook"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Post-create secret reveal — matches the API-key pattern. */
function RevealSecretDialog({
  open, onOpenChange, value,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: { name: string; secret: string } | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save this signing secret</DialogTitle>
          <DialogDescription>
            You'll use it to verify {SIGNATURE_HEADER}. Full value shown once — copy it now.
          </DialogDescription>
        </DialogHeader>
        {value && (
          <div className="space-y-2">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{value.name}</Label>
            <div className="rounded-lg border border-border bg-secondary/50 p-3">
              <p className="break-all font-mono text-[12px] text-foreground">{value.secret}</p>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => {
                navigator.clipboard?.writeText(value.secret).catch(() => undefined);
                toast.success("Secret copied");
              }}><Copy className="h-3 w-3" /> Copy</Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Payload preview block (JSON snippet) ---------- */

function PayloadPreview({ type }: { type: WebhookType }) {
  const fields = AUTO_INCLUDED_FIELDS[type];
  const example = PAYLOAD_EXAMPLE[type];
  if (fields.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-secondary/30 p-3 text-[11.5px] text-muted-foreground">
        Payload for this event type is being finalised.
      </div>
    );
  }
  // Build a nicely formatted JSON snippet — dev-console style. Fields shown
  // in the order they'd appear on the wire.
  const lines: string[] = ["{"];
  fields.forEach((f, i) => {
    const v = example[f];
    const isStr = typeof v === "string";
    const rendered = v === undefined ? "…" : isStr ? `"${v}"` : String(v);
    const comma = i === fields.length - 1 ? "" : ",";
    lines.push(`  "${f}": ${rendered}${comma}`);
  });
  lines.push("}");
  return (
    <pre className="max-h-[220px] overflow-auto rounded-md border border-border bg-background/50 p-2.5 font-mono text-[11px] leading-relaxed text-foreground">
{lines.join("\n")}
    </pre>
  );
}

/* ============================================================ */
/*  Shared primitives                                           */
/* ============================================================ */

function SurfaceCard({
  icon: Icon, title, subtitle, cta, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  cta: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-[14px] font-semibold">{title}</h2>
            <p className="text-[11.5px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {cta}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ copy }: { copy: string }) {
  return <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">{copy}</div>;
}

function StatusPill({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
      on ? "border-success/30 bg-success/10 text-success" : "border-border bg-secondary text-muted-foreground",
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-success animate-pulse" : "bg-current opacity-60")} />
      {on ? onLabel : offLabel}
    </span>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
      {children}
    </button>
  );
}

function Field({ label, required, desc, children }: { label: string; required?: boolean; desc?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {desc && <p className="text-[11px] text-muted-foreground">{desc}</p>}
    </div>
  );
}

/* ---------- Formatting helpers ---------- */

function formatIso(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  });
}
function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
