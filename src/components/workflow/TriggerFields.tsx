// Trigger node config — the inbound entry point, rendered inside the ConfigPanel.
//
// An inbound journey starts from this one node instead of Start + Audience. The
// panel is an n8n-style "How does this journey start?" picker that fans out to
// three shapes, all persisted on the node's `config`:
//   • connector — a native integration event (schema known → fields auto-map)
//   • webhook   — a generic incoming webhook (schema unknown → test-fire + map)
//   • ctwa      — a Click-to-WhatsApp ad tap (fixed, Meta-defined schema)
//
// The catalog data lives in `@/lib/trigger-catalog` (lifted from the old
// standalone /triggers prototype) so the node and any future surface share it.

import { useEffect, useMemo, useState } from "react";
import {
  Webhook, Plug, ArrowLeft, Copy, RotateCw, Eye, EyeOff, Check, Plus, X,
  Radio, ChevronRight, CircleDot, ArrowRight, Loader2, MessageCircle, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkflowNodeData, PresetConfig, PresetVarMap } from "@/lib/campaign-types";
import { CTWA_SCHEMA_FIELDS, CHAT_MESSAGE_SCHEMA_FIELDS } from "@/lib/campaign-types";
import { sendersFor } from "@/lib/template-send";
import {
  CONNECTORS, CATEGORY_ORDER, CATEGORY_TINT, connectorById, connectorEvent,
  type Connector,
} from "@/lib/trigger-catalog";
import { generateSigningSecret, maskSecret } from "@/lib/webhooks-data";

type Props = {
  config?: PresetConfig;
  readOnly?: boolean;
  mark: (valid: boolean, error?: string) => void;
  onChange: (patch: Partial<WorkflowNodeData>) => void;
};

export function TriggerFields({ config, readOnly, mark, onChange }: Props) {
  const triggerType = config?.triggerType;

  // Report validity upward. Connector needs an event; webhook needs ≥1 mapped
  // field; CTWA is always valid (fixed schema); nothing chosen = invalid.
  const mapCount = config?.triggerVarMap?.length ?? 0;
  useEffect(() => {
    if (!triggerType) return mark(false, "Pick how this journey starts");
    if (triggerType === "connector") {
      const ok = !!config?.triggerConnectorId && !!config?.triggerEventId;
      return mark(ok, ok ? undefined : "Pick a connector event");
    }
    if (triggerType === "webhook") {
      const ok = mapCount > 0;
      return mark(ok, ok ? undefined : "Capture a test event and map a field");
    }
    if (triggerType === "chat_message") {
      const okSender = !!config?.chatSenderId;
      const okKw = config?.chatMatchMode !== "keyword" || (config?.chatKeywords?.length ?? 0) > 0;
      return mark(okSender && okKw, !okSender ? "Pick a number to listen on" : !okKw ? "Add at least one keyword" : undefined);
    }
    return mark(true);
  }, [
    triggerType, config?.triggerConnectorId, config?.triggerEventId, mapCount,
    config?.chatSenderId, config?.chatMatchMode, config?.chatKeywords?.length,
  ]);

  const patch = (next: Partial<PresetConfig>, extra?: Partial<WorkflowNodeData>) => {
    if (readOnly) return;
    onChange({ config: { ...(config ?? {}), ...next }, ...extra });
  };

  const reset = () =>
    patch(
      {
        triggerType: undefined,
        triggerConnectorId: undefined,
        triggerEventId: undefined,
        triggerWebhookPath: undefined,
        triggerSigningSecret: undefined,
        triggerVarMap: undefined,
        triggerFilters: undefined,
        chatChannel: undefined,
        chatSenderId: undefined,
        chatMatchMode: undefined,
        chatKeywords: undefined,
      },
      { subtitle: "Choose a trigger" },
    );

  if (!triggerType) return <Catalog readOnly={readOnly} patch={patch} />;
  if (triggerType === "connector")
    return <ConnectorConfig config={config} readOnly={readOnly} patch={patch} onReset={reset} />;
  if (triggerType === "webhook")
    return <WebhookConfig config={config} readOnly={readOnly} patch={patch} onReset={reset} />;
  if (triggerType === "chat_message")
    return <ChatMessageConfig config={config} readOnly={readOnly} patch={patch} onReset={reset} />;
  return <CtwaConfig readOnly={readOnly} onReset={reset} />;
}

/* -------------------------------------------------------------------------- *
 *  Catalog — "How does this journey start?"
 * -------------------------------------------------------------------------- */

function Catalog({
  readOnly, patch,
}: { readOnly?: boolean; patch: (n: Partial<PresetConfig>, e?: Partial<WorkflowNodeData>) => void }) {
  const pickConnector = (c: Connector) =>
    patch(
      { triggerType: "connector", triggerConnectorId: c.id, triggerEventId: c.events[0].id },
      { subtitle: `${c.name} · ${c.events[0].label}`, title: c.name },
    );
  const pickWebhook = () => patch({ triggerType: "webhook" }, { subtitle: "Incoming webhook", title: "Incoming webhook" });
  const pickCtwa = () => patch({ triggerType: "ctwa" }, { subtitle: "Click-to-WhatsApp", title: "Ad tap" });
  const pickChat = () =>
    patch(
      { triggerType: "chat_message", chatChannel: "whatsapp", chatMatchMode: "any" },
      { subtitle: "On chat message", title: "On chat message" },
    );

  return (
    <div className="space-y-5">
      <p className="text-[12.5px] text-muted-foreground">
        An inbound journey starts when something reaches in. Pick the event that opens it.
      </p>

      <Section title="Native connectors" hint="schema known · variables auto-map">
        <div className="space-y-4">
          {CATEGORY_ORDER.map((cat) => {
            const items = CONNECTORS.filter((c) => c.category === cat);
            if (!items.length) return null;
            return (
              <div key={cat}>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">{cat}</p>
                <div className="space-y-1.5">
                  {items.map((c) => (
                    <ConnectorRow key={c.id} connector={c} disabled={readOnly} onClick={() => pickConnector(c)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Messaging" hint="a customer reaches out">
        <div className="space-y-1.5">
          <PickRow
            icon={<MessageSquare className="h-4 w-4" />}
            title="On chat message"
            desc="A customer messages one of your WhatsApp numbers. Match any message or specific keywords."
            disabled={readOnly}
            onClick={pickChat}
          />
          <PickRow
            icon={<MessageCircle className="h-4 w-4" />}
            title="Click-to-WhatsApp ad tap"
            desc="A lead taps a Click-to-WhatsApp ad. Meta hands us a fixed contact.* schema."
            disabled={readOnly}
            onClick={pickCtwa}
          />
        </div>
      </Section>

      <Section title="Custom" hint="anything else">
        <PickRow
          icon={<Webhook className="h-4 w-4" />}
          title="Incoming webhook"
          desc="Any external system. We give you a URL + signing secret; you POST events and map fields."
          dashed
          disabled={readOnly}
          onClick={pickWebhook}
        />
      </Section>
    </div>
  );
}

function ConnectorRow({
  connector, onClick, disabled,
}: { connector: Connector; onClick: () => void; disabled?: boolean }) {
  const Icon = connector.icon;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg border border-border bg-card p-2.5 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-60" : "hover:border-ai/40 hover:bg-accent/40",
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-accent text-foreground">
        {connector.logoUrl ? (
          <img src={connector.logoUrl} alt="" className="h-4 w-auto object-contain" />
        ) : Icon ? (
          <Icon className="h-4 w-4" />
        ) : (
          <Plug className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[12.5px] font-semibold">{connector.name}</p>
          <span className={cn("rounded-full border px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide", CATEGORY_TINT[connector.category])}>
            {connector.events.length}
          </span>
        </div>
        <p className="truncate text-[10.5px] text-muted-foreground">{connector.blurb}</p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function PickRow({
  icon, title, desc, onClick, dashed, disabled,
}: { icon: React.ReactNode; title: string; desc: string; onClick: () => void; dashed?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
        dashed ? "border-dashed border-border" : "border-border",
        disabled ? "cursor-not-allowed opacity-60" : "hover:border-ai/40 hover:bg-accent/40",
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ai/10 text-ai">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold">{title}</p>
        <p className="text-[10.5px] text-muted-foreground">{desc}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/* -------------------------------------------------------------------------- *
 *  Native connector config
 * -------------------------------------------------------------------------- */

const FILTER_OPS = ["=", "≠", ">", "<", "≥", "≤", "contains"];

function ConnectorConfig({
  config, readOnly, patch, onReset,
}: {
  config?: PresetConfig;
  readOnly?: boolean;
  patch: (n: Partial<PresetConfig>, e?: Partial<WorkflowNodeData>) => void;
  onReset: () => void;
}) {
  const connector = connectorById(config?.triggerConnectorId);
  const event = connectorEvent(config?.triggerConnectorId, config?.triggerEventId) ?? connector?.events[0];
  const filters = config?.triggerFilters ?? [];

  if (!connector || !event) {
    return <ResetNotice onReset={onReset} label="This connector is no longer available." />;
  }
  const Icon = connector.icon;

  const pickEvent = (id: string) => {
    const ev = connector.events.find((e) => e.id === id);
    patch({ triggerEventId: id }, ev ? { subtitle: `${connector.name} · ${ev.label}` } : undefined);
  };
  const setFilters = (next: NonNullable<PresetConfig["triggerFilters"]>) => patch({ triggerFilters: next });

  return (
    <div className="space-y-5">
      <ConfigHeader
        onReset={onReset}
        readOnly={readOnly}
        icon={
          connector.logoUrl ? <img src={connector.logoUrl} alt="" className="h-4 w-auto object-contain" />
            : Icon ? <Icon className="h-4 w-4" /> : <Plug className="h-4 w-4" />
        }
        title={connector.name}
        badge={
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Connected
          </span>
        }
      />

      <Section title="Event" num={1}>
        <div className="space-y-1.5">
          {connector.events.map((e) => {
            const active = e.id === event.id;
            return (
              <button
                key={e.id}
                onClick={() => !readOnly && pickEvent(e.id)}
                disabled={readOnly}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-colors",
                  active ? "border-ai/50 bg-ai/5 ring-1 ring-ai/20" : "border-border bg-card",
                  !readOnly && !active && "hover:bg-accent/40",
                  readOnly && "cursor-default",
                )}
              >
                <CircleDot className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", active ? "text-ai" : "text-muted-foreground/40")} />
                <div className="min-w-0">
                  <p className="text-[12px] font-medium">{e.label}</p>
                  <p className="truncate text-[10.5px] text-muted-foreground">{e.desc}</p>
                  <code className="mt-0.5 block font-mono text-[10px] text-muted-foreground/70">{e.id}</code>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="This event carries" num={2} hint="auto-mapped">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-[11.5px]">
            <thead className="bg-secondary/40 text-[9.5px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2.5 py-1.5 text-left font-medium">Variable</th>
                <th className="w-6 px-1 py-1.5" />
                <th className="px-2.5 py-1.5 text-left font-medium">From</th>
              </tr>
            </thead>
            <tbody>
              {event.fields.map((f) => (
                <tr key={f.varName} className="border-t border-border/60">
                  <td className="px-2.5 py-1.5"><code className="font-mono text-[11px]">{f.varName}</code></td>
                  <td className="px-1 py-1.5 text-center text-muted-foreground/50"><ArrowLeft className="inline h-3 w-3" /></td>
                  <td className="px-2.5 py-1.5"><code className="font-mono text-[10.5px] text-muted-foreground">{f.from}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[10.5px] text-muted-foreground">
          Every <code className="font-mono text-[10px]">contact.*</code> field lands in the same namespace a CSV or API audience uses, so downstream nodes resolve unchanged.
        </p>
      </Section>

      <Section title="Only start when" num={3} hint="optional">
        <div className="space-y-2">
          {filters.map((flt, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select
                value={flt.variable}
                disabled={readOnly}
                onChange={(e) => setFilters(filters.map((x, xi) => (xi === i ? { ...x, variable: e.target.value } : x)))}
                className="h-8 flex-1 rounded-md border border-border bg-card px-1.5 text-[11px]"
              >
                <option value="">Field…</option>
                {event.fields.map((f) => <option key={f.varName} value={f.varName}>{f.varName}</option>)}
              </select>
              <select
                value={flt.op}
                disabled={readOnly}
                onChange={(e) => setFilters(filters.map((x, xi) => (xi === i ? { ...x, op: e.target.value } : x)))}
                className="h-8 w-14 rounded-md border border-border bg-card px-1 text-center text-[11px]"
              >
                {FILTER_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              <Input
                value={flt.value}
                disabled={readOnly}
                onChange={(e) => setFilters(filters.map((x, xi) => (xi === i ? { ...x, value: e.target.value } : x)))}
                placeholder="value"
                className="h-8 flex-1 text-[11px]"
              />
              {!readOnly && (
                <button
                  onClick={() => setFilters(filters.filter((_, xi) => xi !== i))}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button
              variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
              onClick={() => setFilters([...filters, { variable: "", op: ">", value: "" }])}
            >
              <Plus className="h-3 w-3" /> Add filter
            </Button>
          )}
        </div>
      </Section>

      <FlowStrip />
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  Generic incoming-webhook config
 * -------------------------------------------------------------------------- */

const SAMPLE_PAYLOAD: Record<string, unknown> = {
  event: "order.paid",
  buyer: { msisdn: "+919812340000", name: "Anita Rao" },
  txn: { ref: "T901823", amount_paise: 74900, status: "SUCCESS" },
};
const SUGGESTED_MAP: PresetVarMap[] = [
  { v: "contact.phone", def: "$.buyer.msisdn" },
  { v: "contact.name", def: "$.buyer.name" },
  { v: "order_id", def: "$.txn.ref" },
  { v: "order_total", def: "$.txn.amount_paise" },
];

function WebhookConfig({
  config, readOnly, patch, onReset,
}: {
  config?: PresetConfig;
  readOnly?: boolean;
  patch: (n: Partial<PresetConfig>, e?: Partial<WorkflowNodeData>) => void;
  onReset: () => void;
}) {
  const endpoint = useMemo(
    () => config?.triggerWebhookPath ?? `https://in.pi/hooks/ev/${Math.random().toString(36).slice(2, 10)}`,
    [config?.triggerWebhookPath],
  );
  const [secret, setSecret] = useState(() => config?.triggerSigningSecret ?? generateSigningSecret());
  const [revealed, setRevealed] = useState(false);
  const mappings = config?.triggerVarMap ?? [];
  const captured = mappings.length > 0;
  const [listening, setListening] = useState(false);

  const setMappings = (next: PresetVarMap[]) =>
    patch({ triggerVarMap: next, triggerWebhookPath: endpoint, triggerSigningSecret: secret });

  const sendTest = () => {
    if (readOnly) return;
    setListening(true);
    setTimeout(() => {
      setListening(false);
      setMappings(SUGGESTED_MAP);
      toast.success("Event captured", { description: "Fields mapped from the sample payload" });
    }, 1200);
  };

  return (
    <div className="space-y-5">
      <ConfigHeader
        onReset={onReset}
        readOnly={readOnly}
        icon={<Webhook className="h-4 w-4" />}
        title="Incoming webhook"
        badge={<span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">Bring-your-own</span>}
      />

      <Section title="Your endpoint" num={1}>
        <div className="space-y-2.5">
          <Field label="POST URL">
            <div className="flex items-center gap-1.5">
              <code className="flex-1 truncate rounded-md border border-border bg-secondary/50 px-2 py-1.5 font-mono text-[11px]">{endpoint}</code>
              <IconBtn title="Copy URL" onClick={() => copy(endpoint, "Endpoint URL copied")}><Copy className="h-3.5 w-3.5" /></IconBtn>
            </div>
          </Field>
          <Field label="Signing secret">
            <div className="flex items-center gap-1.5">
              <code className="flex-1 truncate rounded-md border border-border bg-secondary/50 px-2 py-1.5 font-mono text-[11px]">
                {revealed ? secret : maskSecret(secret)}
              </code>
              <IconBtn title={revealed ? "Hide" : "Reveal"} onClick={() => setRevealed((v) => !v)}>
                {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </IconBtn>
              <IconBtn title="Copy secret" onClick={() => copy(secret, "Signing secret copied")}><Copy className="h-3.5 w-3.5" /></IconBtn>
              {!readOnly && (
                <IconBtn
                  title="Rotate"
                  onClick={() => { const s = generateSigningSecret(); setSecret(s); setRevealed(true); if (captured) patch({ triggerSigningSecret: s }); toast.success("Signing secret rotated"); }}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </IconBtn>
              )}
            </div>
          </Field>
          <p className="text-[10.5px] text-muted-foreground">
            We verify every request's <code className="font-mono text-[10px]">X-Pi-Signature</code> header (HMAC-SHA256 over the raw body) against this secret.
          </p>
        </div>
      </Section>

      <Section title="Send a test event" num={2} hint="learn the payload shape">
        {!captured && !listening && !readOnly && (
          <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={sendTest}><Radio className="h-3.5 w-3.5" /> Start listening</Button>
        )}
        {listening && (
          <div className="flex items-center gap-2 rounded-lg border border-ai/30 bg-ai/5 px-3 py-2 text-[12px] text-ai">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Listening for your POST…
          </div>
        )}
        {captured && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-success"><Check className="h-3.5 w-3.5" /> Event captured</div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-secondary/40 p-2.5 font-mono text-[10.5px] leading-relaxed">{JSON.stringify(SAMPLE_PAYLOAD, null, 2)}</pre>
          </div>
        )}
        {!captured && !listening && readOnly && (
          <p className="text-[11px] text-muted-foreground">No test event captured.</p>
        )}
      </Section>

      <Section title="Map fields" num={3} hint="JSONPath → variable">
        {!captured ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
            Capture a test event first — then map its fields to variables.
          </p>
        ) : (
          <div className="space-y-2">
            {mappings.map((m, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  value={m.def}
                  disabled={readOnly}
                  onChange={(e) => setMappings(mappings.map((x, xi) => (xi === i ? { ...x, def: e.target.value } : x)))}
                  placeholder="$.path.to.field"
                  className="h-8 flex-1 font-mono text-[11px]"
                />
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                <Input
                  value={m.v}
                  disabled={readOnly}
                  onChange={(e) => setMappings(mappings.map((x, xi) => (xi === i ? { ...x, v: e.target.value } : x)))}
                  placeholder="variable_name"
                  className="h-8 flex-1 font-mono text-[11px]"
                />
                {!readOnly && (
                  <button
                    onClick={() => setMappings(mappings.filter((_, xi) => xi !== i))}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {!readOnly && (
              <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setMappings([...mappings, { v: "", def: "" }])}>
                <Plus className="h-3 w-3" /> Add mapping
              </Button>
            )}
          </div>
        )}
      </Section>

      <FlowStrip />
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  Click-to-WhatsApp config
 * -------------------------------------------------------------------------- */

function CtwaConfig({ readOnly, onReset }: { readOnly?: boolean; onReset: () => void }) {
  return (
    <div className="space-y-5">
      <ConfigHeader
        onReset={onReset}
        readOnly={readOnly}
        icon={<MessageCircle className="h-4 w-4" />}
        title="Click-to-WhatsApp"
        badge={<span className="rounded-full border border-ai/30 bg-ai/10 px-2 py-0.5 text-[10px] font-medium text-ai">Meta</span>}
      />
      <Section title="This trigger carries" num={1} hint="fixed by Meta">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-[11.5px]">
            <thead className="bg-secondary/40 text-[9.5px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2.5 py-1.5 text-left font-medium">Variable</th>
                <th className="px-2.5 py-1.5 text-left font-medium">Field</th>
              </tr>
            </thead>
            <tbody>
              {CTWA_SCHEMA_FIELDS.map((f) => (
                <tr key={f.key} className="border-t border-border/60">
                  <td className="px-2.5 py-1.5"><code className="font-mono text-[11px]">{f.key}</code></td>
                  <td className="px-2.5 py-1.5 text-muted-foreground">{f.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[10.5px] text-muted-foreground">
          Leads enter when a Click-to-WhatsApp ad is tapped. The schema is a superset of a normal contact, so downstream nodes resolve unchanged.
        </p>
      </Section>
      <FlowStrip />
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  On-chat-message config — inbound conversational entry
 * -------------------------------------------------------------------------- */

function ChatMessageConfig({
  config, readOnly, patch, onReset,
}: {
  config?: PresetConfig;
  readOnly?: boolean;
  patch: (n: Partial<PresetConfig>, e?: Partial<WorkflowNodeData>) => void;
  onReset: () => void;
}) {
  const senders = sendersFor("whatsapp");
  const senderId = config?.chatSenderId ?? "";
  const mode = config?.chatMatchMode ?? "any";
  const keywords = config?.chatKeywords ?? [];
  const [draft, setDraft] = useState("");

  const addKeyword = () => {
    const k = draft.trim();
    if (!k) return;
    if (keywords.some((x) => x.toLowerCase() === k.toLowerCase())) { setDraft(""); return; }
    patch({ chatKeywords: [...keywords, k] });
    setDraft("");
  };
  const removeKeyword = (k: string) => patch({ chatKeywords: keywords.filter((x) => x !== k) });

  return (
    <div className="space-y-5">
      <ConfigHeader
        onReset={onReset}
        readOnly={readOnly}
        icon={<MessageSquare className="h-4 w-4" />}
        title="On chat message"
        badge={<span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">WhatsApp</span>}
      />

      <Section title="Listen on" num={1}>
        <div className="space-y-2.5">
          <Field label="Channel">
            <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 text-[12px]">
              <MessageCircle className="h-3.5 w-3.5 text-success" /> WhatsApp
              <span className="ml-auto text-[10px] text-muted-foreground">RCS · SMS soon</span>
            </div>
          </Field>
          <Field label="Number">
            <select
              value={senderId}
              disabled={readOnly}
              onChange={(e) =>
                patch(
                  { chatSenderId: e.target.value },
                  { subtitle: `On chat · ${senders.find((s) => s.id === e.target.value)?.label ?? "WhatsApp"}` },
                )
              }
              className="h-9 w-full rounded-md border border-border bg-card px-2 text-[12px]"
            >
              <option value="">Select a number…</option>
              {senders.map((s) => (
                <option key={s.id} value={s.id}>{s.label}{s.meta ? ` · ${s.meta}` : ""}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Start when" num={2}>
        <div className="space-y-2.5">
          <div className="flex gap-1.5">
            <ModeBtn active={mode === "any"} disabled={readOnly} onClick={() => patch({ chatMatchMode: "any" })}>Any message</ModeBtn>
            <ModeBtn active={mode === "keyword"} disabled={readOnly} onClick={() => patch({ chatMatchMode: "keyword" })}>Specific keywords</ModeBtn>
          </div>

          {mode === "any" ? (
            <p className="text-[10.5px] text-muted-foreground">Every inbound message on this number opens the journey.</p>
          ) : (
            <div className="space-y-2">
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map((k) => (
                    <span key={k} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px]">
                      {k}
                      {!readOnly && (
                        <button onClick={() => removeKeyword(k)} className="text-muted-foreground transition-colors hover:text-foreground">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {!readOnly && (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
                    placeholder="Type a keyword, press Enter"
                    className="h-8 flex-1 text-[11px]"
                  />
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-[11px]" onClick={addKeyword}><Plus className="h-3 w-3" /> Add</Button>
                </div>
              )}
              <p className="text-[10.5px] text-muted-foreground">
                Case-insensitive · the message opens the journey if it contains any keyword. Intent routing — soon.
              </p>
            </div>
          )}
        </div>
      </Section>

      <Section title="This trigger carries" num={3} hint="fixed schema">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-[11.5px]">
            <thead className="bg-secondary/40 text-[9.5px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2.5 py-1.5 text-left font-medium">Variable</th>
                <th className="px-2.5 py-1.5 text-left font-medium">Field</th>
              </tr>
            </thead>
            <tbody>
              {CHAT_MESSAGE_SCHEMA_FIELDS.map((f) => (
                <tr key={f.key} className="border-t border-border/60">
                  <td className="px-2.5 py-1.5"><code className="font-mono text-[11px]">{f.key}</code></td>
                  <td className="px-2.5 py-1.5 text-muted-foreground">{f.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[10.5px] text-muted-foreground">
          Lands in the same <code className="font-mono text-[10px]">contact.*</code> namespace a CSV or API audience uses, so downstream nodes resolve unchanged.
        </p>
      </Section>

      <FlowStrip />
    </div>
  );
}

function ModeBtn({
  active, disabled, onClick, children,
}: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex-1 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
        active ? "border-ai/50 bg-ai/5 text-foreground" : "border-border bg-card text-muted-foreground",
        !disabled && !active && "hover:bg-accent/40",
        disabled && "cursor-default",
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- *
 *  Shared chrome
 * -------------------------------------------------------------------------- */

function ConfigHeader({
  onReset, readOnly, icon, title, badge,
}: { onReset: () => void; readOnly?: boolean; icon: React.ReactNode; title: string; badge?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      {!readOnly && (
        <button onClick={onReset} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Change trigger
        </button>
      )}
      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-accent text-foreground">{icon}</div>
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{title}</p>
        {badge}
      </div>
    </div>
  );
}

function ResetNotice({ onReset, label }: { onReset: () => void; label: string }) {
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12px]" onClick={onReset}>
        <ArrowLeft className="h-3.5 w-3.5" /> Pick a trigger
      </Button>
    </div>
  );
}

function Section({
  title, num, hint, children,
}: { title: string; num?: number; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        {num != null && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[9px] font-semibold text-background">{num}</span>
        )}
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {hint && <span className="text-[10.5px] text-muted-foreground/70">· {hint}</span>}
      </div>
      <div className={cn(num != null && "pl-6")}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

/** Reassurance strip: inbound lands in the same namespace + canvas as outbound. */
function FlowStrip() {
  const steps = ["Event fires", "contact.* set", "Your canvas", "End / Escalation"];
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/20 px-3 py-2.5">
      <span className="shrink-0 text-[9.5px] font-medium uppercase tracking-wider text-muted-foreground/70">Then</span>
      <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="whitespace-nowrap rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px]">{s}</span>
            {i < steps.length - 1 && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function copy(text: string, msg: string) {
  navigator.clipboard?.writeText(text).catch(() => undefined);
  toast.success(msg);
}
