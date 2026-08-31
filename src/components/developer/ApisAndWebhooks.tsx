/**
 * Developer > APIs & Webhooks.
 *
 * Two sections stacked vertically: API keys on top, Channel Webhooks below.
 * Channel Webhooks lets an integrator register one or more HTTPS endpoints
 * per channel (WhatsApp, SMS, RCS), scoped to a specific WABA + phone number
 * (WA) / sender id (SMS) / agent (RCS).
 *
 * v1 is deliberately minimal:
 *   - Auth is a single write-once Bearer token per webhook. We send it as
 *     `Authorization: Bearer <token>` on every POST. No HMAC. No rotate.
 *   - Only the Delivery Status event bucket is exposed. Body mirrors the
 *     vendor's own delivery webhook shape (Meta / Jio / RBM). Templates and
 *     Incoming Messages buckets ship in a follow-up.
 *   - Status is derived: Active, Paused, or Error. Error means the scope
 *     target vanished (WABA disconnected, sender deprovisioned, agent
 *     deleted) OR the backend has auto-paused after repeated delivery
 *     failures. Client can't recover from Error via the UI. Backend handles.
 */

import { useMemo, useState } from "react";
import { Webhook, Plus, MoreHorizontal, Copy, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { DeveloperApiKeys } from "@/components/settings/DeveloperApiKeys";
import {
  CHANNEL_EVENTS, WEBHOOK_CHANNEL_LABEL, generateAuthToken, maskToken,
  type Webhook as WebhookRow, type WebhookChannel, type WebhookScope,
} from "@/lib/webhooks-data";
import { useWebhooks, upsertWebhook, removeWebhook, toggleWebhook } from "@/lib/webhooks-store";
import { useWabaConnection } from "@/lib/waba-store";
import { SEED_SMS_CONFIG } from "@/lib/sms-config";
import { SEED_RCS_CONFIG } from "@/lib/rcs-config";

export function ApisAndWebhooks() {
  return (
    <div className="space-y-8">
      <DeveloperApiKeys />
      <ChannelWebhooks />
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  Scope catalogs
 * -------------------------------------------------------------------------- */

type WaOption = { wabaId: string; wabaName: string; phoneNumberId: string; phoneDisplay: string };
type SmsOption = { senderId: string; entityName: string };
type RcsOption = { agentId: string; agentName: string; brandName: string };

function useWaOptions(): WaOption[] {
  const conn = useWabaConnection();
  if (!conn) return [];
  return [{
    wabaId: conn.waba.id,
    wabaName: conn.waba.name,
    phoneNumberId: conn.phone.id,
    phoneDisplay: conn.phone.display,
  }];
}
function smsOptions(): SmsOption[] {
  const out: SmsOption[] = [];
  for (const e of SEED_SMS_CONFIG.principalEntities) {
    for (const s of e.senderIds) out.push({ senderId: s.id, entityName: e.name });
  }
  return out;
}
function rcsOptions(): RcsOption[] {
  const out: RcsOption[] = [];
  for (const b of SEED_RCS_CONFIG.brands) {
    for (const a of b.agents) out.push({ agentId: a.id, agentName: a.name, brandName: b.name });
  }
  return out;
}

/**
 * Derive a webhook's effective status:
 *   - "paused" if the user paused it
 *   - "error"  if the scope target no longer exists (WABA disconnected,
 *              sender deprovisioned, agent deleted). Backend also flips
 *              webhooks to this state after retry exhaustion.
 *   - "active" otherwise
 *
 * Returns the derived status + a short reason string used as the tooltip
 * body when the pill is "error".
 */
type EffectiveStatus = { status: "active" | "paused" | "error"; reason?: string };

function deriveStatus(
  row: WebhookRow,
  ctx: { wa: WaOption[]; sms: SmsOption[]; rcs: RcsOption[] },
): EffectiveStatus {
  if (row.status === "paused") return { status: "paused" };
  const s = row.scope;
  if (!s) return { status: "error", reason: "Scope target missing." };
  if (row.channel === "whatsapp") {
    const hit = ctx.wa.find((o) => o.wabaId === s.wabaId && o.phoneNumberId === s.phoneNumberId);
    if (!hit) return { status: "error", reason: "WABA or phone number no longer connected." };
  } else if (row.channel === "sms") {
    const hit = ctx.sms.find((o) => o.senderId === s.senderId);
    if (!hit) return { status: "error", reason: "Sender ID has been deprovisioned." };
  } else if (row.channel === "rcs") {
    const hit = ctx.rcs.find((o) => o.agentId === s.agentId);
    if (!hit) return { status: "error", reason: "RBM agent no longer exists." };
  }
  return { status: "active" };
}

/* -------------------------------------------------------------------------- *
 *  Slug-style name validation
 *
 *  Same rule for both webhook names and API-key names: lowercase letters,
 *  digits, hyphens or underscores. 3-40 chars. `sanitizeName` is idempotent
 *  and safe to call on every keystroke.
 * -------------------------------------------------------------------------- */

export const NAME_HINT = "Lowercase letters, digits, hyphens or underscores. 3–40 characters.";
export const NAME_REGEX = /^[a-z0-9_-]{3,40}$/;

export function sanitizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}

/* -------------------------------------------------------------------------- *
 *  Channel Webhooks
 * -------------------------------------------------------------------------- */

function ChannelWebhooks() {
  const all = useWebhooks();
  const rows = useMemo(() => all.filter((w) => w.type === "channels"), [all]);
  const wa = useWaOptions();
  const sms = useMemo(smsOptions, []);
  const rcs = useMemo(rcsOptions, []);

  const [editing, setEditing] = useState<WebhookRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [revealToken, setRevealToken] = useState<{ name: string; token: string } | null>(null);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-[14px] font-semibold">Channel webhooks</h2>
            <p className="text-[11.5px] text-muted-foreground">
              Register endpoints to receive channel events. Each webhook is scoped to one channel and one sender. Payload mirrors the vendor's own webhook shape.
            </p>
          </div>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-[11.5px]" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" /> Add webhook
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
          No channel webhooks yet.
        </div>
      ) : (
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Channel</th>
              <th className="px-4 py-2 text-left font-medium">Endpoint</th>
              <th className="px-4 py-2 text-left font-medium">Events</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="w-12 px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <WebhookRowView
                key={w.id}
                row={w}
                effective={deriveStatus(w, { wa, sms, rcs })}
                onEdit={() => setEditing(w)}
              />
            ))}
          </tbody>
        </table>
      )}

      <WebhookDialog
        key={creating ? "create" : editing ? `edit-${editing.id}` : "closed"}
        open={creating || !!editing}
        initial={editing}
        onOpenChange={(open) => {
          if (!open) { setCreating(false); setEditing(null); }
        }}
        onSubmit={(next) => {
          upsertWebhook(next);
          toast.success(editing ? "Webhook updated" : "Webhook added");
          setCreating(false);
          setEditing(null);
          if (!editing) setRevealToken({ name: next.name, token: next.authToken });
        }}
        wa={wa}
        sms={sms}
        rcs={rcs}
      />

      <RevealTokenDialog
        open={!!revealToken}
        onOpenChange={(o) => { if (!o) setRevealToken(null); }}
        value={revealToken}
      />
    </div>
  );
}

function WebhookRowView({
  row, effective, onEdit,
}: {
  row: WebhookRow;
  effective: EffectiveStatus;
  onEdit: () => void;
}) {
  const ch: WebhookChannel = row.channel ?? "whatsapp";

  const copyEndpoint = () => {
    navigator.clipboard?.writeText(row.endpointUrl).catch(() => undefined);
    toast.success("Endpoint copied");
  };

  const sendTest = () => {
    toast.info(`Sending test event to ${row.endpointUrl}`);
    window.setTimeout(() => {
      // Mock: 90% success, 10% simulated failure. In production this hits
      // the real endpoint from the backend.
      const ok = Math.random() > 0.1;
      if (ok) toast.success("Test event delivered (200 OK)");
      else toast.error("Test event failed (connection timeout)");
    }, 900);
  };

  return (
    <tr className="border-t border-border/60">
      <td className="px-4 py-3 font-mono text-[12px]">{row.name}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] font-medium">
          {WEBHOOK_CHANNEL_LABEL[ch]}
        </span>
      </td>
      <td className="px-4 py-3 text-[11.5px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="font-mono" title={row.endpointUrl}>{truncateMiddle(row.endpointUrl, 40)}</span>
          <button
            type="button"
            onClick={copyEndpoint}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Copy endpoint"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </td>
      <td className="px-4 py-3 text-[11.5px] text-muted-foreground">
        {formatEvents(row)}
      </td>
      <td className="px-4 py-3">
        <StatusPill effective={effective} />
      </td>
      <td className="px-4 py-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="More actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-[12px]">
            <DropdownMenuItem onSelect={onEdit} disabled={effective.status === "error"}>Edit</DropdownMenuItem>
            <DropdownMenuItem onSelect={sendTest} disabled={effective.status === "error"}>
              Send test event
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                toggleWebhook(row.id);
                toast.success(row.status === "active" ? "Webhook paused" : "Webhook resumed");
              }}
              disabled={effective.status === "error"}
            >
              {row.status === "active" ? "Pause" : "Resume"}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => {
                if (confirm(`Delete "${row.name}"? Events will stop firing to ${row.endpointUrl}.`)) {
                  removeWebhook(row.id);
                  toast.success("Webhook deleted");
                }
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function StatusPill({ effective }: { effective: EffectiveStatus }) {
  if (effective.status === "error") {
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
              <AlertCircle className="h-3 w-3" />
              Error
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px] text-[11.5px]">
            {effective.reason ?? "Webhook is in an error state."}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  const isActive = effective.status === "active";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
      isActive
        ? "border-success/30 bg-success/10 text-success"
        : "border-border bg-secondary text-muted-foreground",
    )}>
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        isActive ? "bg-success animate-pulse" : "bg-current opacity-60",
      )} />
      {isActive ? "Active" : "Paused"}
    </span>
  );
}

/* -------------------------------------------------------------------------- *
 *  Create / Edit dialog
 * -------------------------------------------------------------------------- */

function WebhookDialog({
  open, initial, onOpenChange, onSubmit, wa, sms, rcs,
}: {
  open: boolean;
  initial: WebhookRow | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (next: WebhookRow) => void;
  wa: WaOption[];
  sms: SmsOption[];
  rcs: RcsOption[];
}) {
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [channel, setChannel] = useState<WebhookChannel>(initial?.channel ?? "whatsapp");
  const [url, setUrl] = useState(initial?.endpointUrl ?? "");

  const initialScope: WebhookScope = initial?.scope ?? {};
  const [wabaId, setWabaId] = useState<string>(initialScope.wabaId ?? wa[0]?.wabaId ?? "");
  const [phoneNumberId, setPhoneNumberId] = useState<string>(initialScope.phoneNumberId ?? wa[0]?.phoneNumberId ?? "");
  const [senderId, setSenderId] = useState<string>(initialScope.senderId ?? sms[0]?.senderId ?? "");
  const [agentId, setAgentId] = useState<string>(initialScope.agentId ?? rcs[0]?.agentId ?? "");

  // Events default to *all buckets* for the selected channel unless the
  // caller (edit path) had a prior explicit subset.
  const [events, setEvents] = useState<string[]>(
    initial?.events && initial.events.length > 0
      ? initial.events
      : CHANNEL_EVENTS[initial?.channel ?? "whatsapp"].map((e) => e.id),
  );

  const catalog = CHANNEL_EVENTS[channel];
  const allChecked = events.length === catalog.length;
  const showEventsChecklist = catalog.length > 1;

  const urlOk = /^https:\/\//i.test(url.trim()) && !isPrivateHost(url.trim());
  const urlPrivate = /^https:\/\//i.test(url.trim()) && isPrivateHost(url.trim());
  const nameOk = NAME_REGEX.test(name);
  const eventsOk = events.length > 0;
  const scopeOk =
    channel === "whatsapp" ? !!(wabaId && phoneNumberId) :
    channel === "sms"      ? !!senderId :
    channel === "rcs"      ? !!agentId : false;
  const canSubmit = nameOk && urlOk && scopeOk && eventsOk;

  const toggleEvent = (id: string) => {
    setEvents((prev) => prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]);
  };

  const sendTest = () => {
    if (!urlOk) return;
    toast.info(`Sending test event to ${url.trim()}`);
    window.setTimeout(() => {
      const ok = Math.random() > 0.1;
      if (ok) toast.success("Test event delivered (200 OK)");
      else toast.error("Test event failed (connection timeout)");
    }, 900);
  };

  const submit = () => {
    if (!canSubmit) return;
    const scope: WebhookScope =
      channel === "whatsapp" ? { wabaId, phoneNumberId } :
      channel === "sms"      ? { senderId } :
                               { agentId };
    const id = initial?.id ?? `wh_${Math.random().toString(36).slice(2, 8)}`;
    const next: WebhookRow = {
      id,
      name,
      type: "channels",
      channel,
      scope,
      events,
      endpointUrl: url.trim(),
      authToken: initial?.authToken ?? generateAuthToken(),
      headers: initial?.headers ?? [],
      status: initial?.status ?? "active",
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      lastDeliveryAt: initial?.lastDeliveryAt,
    };
    onSubmit(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit webhook" : "Add webhook"}</DialogTitle>
          <DialogDescription>
            Register an HTTPS endpoint to receive channel events. Each webhook is scoped to one channel and one sender.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(sanitizeName(e.target.value))}
              placeholder="crm-delivery-feed"
              className={cn("h-9 text-[13px] font-mono", name && !nameOk && "border-destructive focus-visible:ring-destructive")}
              maxLength={40}
              disabled={isEdit}
            />
            <p className="text-[10.5px] text-muted-foreground">{NAME_HINT}</p>
            {isEdit && (
              <p className="text-[10.5px] text-muted-foreground">Name is fixed after creation.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Channel</Label>
            <Select
              value={channel}
              onValueChange={(v) => {
                const next = v as WebhookChannel;
                setChannel(next);
                setEvents(CHANNEL_EVENTS[next].map((e) => e.id));
              }}
              disabled={isEdit}
            >
              <SelectTrigger className="h-9 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="rcs">RCS</SelectItem>
              </SelectContent>
            </Select>
            {isEdit && (
              <p className="text-[10.5px] text-muted-foreground">
                Channel is fixed after creation. Add a new webhook for a different channel.
              </p>
            )}
          </div>

          {channel === "whatsapp" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">WABA</Label>
                <Select
                  value={wabaId}
                  onValueChange={(v) => {
                    setWabaId(v);
                    const hit = wa.find((o) => o.wabaId === v);
                    if (hit) setPhoneNumberId(hit.phoneNumberId);
                  }}
                  disabled={wa.length === 0}
                >
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue placeholder={wa.length === 0 ? "No WABA connected" : "Select a WABA"} />
                  </SelectTrigger>
                  <SelectContent>
                    {wa.map((o) => (
                      <SelectItem key={o.wabaId} value={o.wabaId}>{o.wabaName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Phone number</Label>
                <Select value={phoneNumberId} onValueChange={setPhoneNumberId} disabled={!wabaId}>
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue placeholder="Select a phone number" />
                  </SelectTrigger>
                  <SelectContent>
                    {wa.filter((o) => o.wabaId === wabaId).map((o) => (
                      <SelectItem key={o.phoneNumberId} value={o.phoneNumberId}>{o.phoneDisplay}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {channel === "sms" && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sender ID</Label>
              <Select value={senderId} onValueChange={setSenderId}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="Select a sender" />
                </SelectTrigger>
                <SelectContent>
                  {sms.map((o) => (
                    <SelectItem key={o.senderId} value={o.senderId}>
                      {o.senderId} · {o.entityName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {channel === "rcs" && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Agent</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {rcs.map((o) => (
                    <SelectItem key={o.agentId} value={o.agentId}>
                      {o.agentName} · {o.brandName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Endpoint URL</Label>
              {urlOk && (
                <button
                  type="button"
                  onClick={sendTest}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Send test event
                </button>
              )}
            </div>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/hooks/pi"
              className={cn("h-9 text-[13px] font-mono", url && !urlOk && "border-destructive focus-visible:ring-destructive")}
            />
            {url && !urlOk && !urlPrivate && (
              <p className="text-[10.5px] text-destructive">Must be an HTTPS URL.</p>
            )}
            {urlPrivate && (
              <p className="text-[10.5px] text-destructive">Private and internal hosts are not allowed. Use a public URL.</p>
            )}
          </div>

          {/* Auth affordance — same panel in create + edit, wording differs.
              Create tells the user what will happen. Edit shows the masked
              token so they can confirm which webhook they're editing without
              being able to re-reveal the plaintext. */}
          <div className="space-y-1.5 rounded-lg border border-border bg-secondary/30 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Auth</div>
            {isEdit && initial ? (
              <div className="space-y-1">
                <p className="font-mono text-[12px]">{maskToken(initial.authToken)}</p>
                <p className="text-[10.5px] text-muted-foreground">
                  Pi Commerce sends this token as <span className="font-mono">Authorization: Bearer {"<token>"}</span> on every POST. The full token is only shown at creation. If you lost it, delete this webhook and create a new one.
                </p>
              </div>
            ) : (
              <p className="text-[10.5px] text-muted-foreground">
                A Bearer token will be generated on submit and shown once. Pi Commerce sends it as <span className="font-mono">Authorization: Bearer {"<token>"}</span> on every POST. Your receiver should string-compare against the stored token.
              </p>
            )}
          </div>

          {showEventsChecklist ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Events</Label>
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                  onClick={() => setEvents(allChecked ? [] : catalog.map((e) => e.id))}
                >
                  {allChecked ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
                {catalog.map((ev) => {
                  const checked = events.includes(ev.id);
                  return (
                    <label
                      key={ev.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-accent/40",
                        checked && "bg-accent/30",
                      )}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleEvent(ev.id)} />
                      <span className="text-[12.5px]">{ev.label}</span>
                    </label>
                  );
                })}
              </div>
              {!eventsOk && (
                <p className="text-[10.5px] text-destructive">Select at least one event.</p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-[11.5px] text-muted-foreground">
              This webhook receives <span className="font-medium text-foreground">{catalog[0]?.label}</span> events.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!canSubmit} onClick={submit}>
            {isEdit ? "Save changes" : "Add webhook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- *
 *  Reveal token dialog (on create only)
 * -------------------------------------------------------------------------- */

function RevealTokenDialog({
  open, onOpenChange, value,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: { name: string; token: string } | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save this auth token</DialogTitle>
          <DialogDescription>
            Pi Commerce sends this token as <span className="font-mono">Authorization: Bearer {"<token>"}</span> on every webhook POST. Save it now. Your receiver should string-compare against this value.
          </DialogDescription>
        </DialogHeader>
        {value && (
          <div className="space-y-2">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{value.name}</Label>
            <div className="rounded-lg border border-border bg-secondary/50 p-3">
              <p className="break-all font-mono text-[12px] text-foreground">{value.token}</p>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
                onClick={() => {
                  navigator.clipboard?.writeText(value.token).catch(() => undefined);
                  toast.success("Token copied");
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

/* -------------------------------------------------------------------------- *
 *  Utils
 * -------------------------------------------------------------------------- */

/** Compact events summary for the table cell. Shows the single bucket name
 *  when only one is subscribed, "All (N)" when everything is subscribed, or
 *  a comma-joined list otherwise. */
function formatEvents(row: WebhookRow): string {
  const ch: WebhookChannel = row.channel ?? "whatsapp";
  const catalog = CHANNEL_EVENTS[ch];
  const subscribed = row.events ?? [];
  const labels = catalog.filter((c) => subscribed.includes(c.id)).map((c) => c.label);
  if (labels.length === 0) return "None";
  if (labels.length === catalog.length && catalog.length > 1) return `All (${catalog.length})`;
  return labels.join(", ");
}

function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return `${s.slice(0, half)}…${s.slice(-half)}`;
}

/**
 * Block private and internal hosts to prevent SSRF via webhook targets.
 * Covers RFC1918 ranges, loopback, link-local, and common internal-only TLDs
 * (`.internal`, `.local`, `.localhost`).
 */
function isPrivateHost(rawUrl: string): boolean {
  let host = "";
  try { host = new URL(rawUrl).hostname; } catch { return false; }
  if (!host) return false;
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".internal") || h.endsWith(".local")) return true;
  // RFC1918 + loopback + link-local
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}
