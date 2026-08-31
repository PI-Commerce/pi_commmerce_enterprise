import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Check, Eye, EyeOff, Info, AlertTriangle } from "lucide-react";
import {
  curlSnippet, endpointFor, sendersFor, SENDER_META, DEMO_API_KEY, type CurlTemplate,
} from "@/lib/template-send";

/**
 * "Get Curl" — the ready-to-fire curl for a single template. Reused by the
 * WhatsApp / SMS / RCS template lists: pass a channel-agnostic {@link CurlTemplate}.
 *
 * The send payload must name a sender. SMS/RCS templates are pinned to one
 * (DLT header / agent) so it defaults in; a WhatsApp template belongs to a WABA
 * that can hold several numbers, so the caller must pick one before the curl is
 * valid — the dialog blocks copy until they do.
 */
export function GetCurlDialog({
  template, open, onOpenChange,
}: {
  template: CurlTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [senderId, setSenderId] = useState<string>("");

  // Hydrate the sender when the template changes: use the template's pinned
  // sender, else auto-select when there's exactly one, else force a choice.
  useEffect(() => {
    if (!template) return;
    const senders = sendersFor(template.channel);
    setSenderId(template.defaultSenderId ?? (senders.length === 1 ? senders[0].id : ""));
  }, [template]);

  if (!template) return null;

  const senders = sendersFor(template.channel);
  const meta = SENDER_META[template.channel];
  const noSenders = senders.length === 0;
  const needsSender = !noSenders && !senderId;
  const blocked = noSenders || needsSender;

  const shown = curlSnippet(template, {
    apiKey: revealed ? DEMO_API_KEY : "YOUR_API_KEY",
    senderId: senderId || undefined,
  });

  function copy() {
    if (blocked) return;
    navigator.clipboard?.writeText(
      curlSnippet(template!, { apiKey: DEMO_API_KEY, senderId }),
    );
    setCopied(true);
    toast.success("cURL copied");
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Get cURL</DialogTitle>
          <DialogDescription>
            Fire <span className="font-medium text-foreground">{template.name}</span> straight from your system.
            Replace the phone number{template.variables.length ? " and variable values" : ""}, then send.
          </DialogDescription>
        </DialogHeader>

        {/* Endpoint */}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 font-mono text-[12px]">
          <span className="rounded bg-success/10 px-1.5 py-0.5 font-semibold text-success">POST</span>
          <span className="truncate text-muted-foreground">{endpointFor(template.channel)}</span>
        </div>

        {/* Sender picker */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label className="text-[12px] font-medium text-foreground">{meta.label}</label>
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[10.5px] text-muted-foreground">
              {meta.field}
            </code>
          </div>
          {noSenders ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11.5px] text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{meta.empty}</span>
            </div>
          ) : (
            <Select value={senderId} onValueChange={setSenderId}>
              <SelectTrigger className={needsSender ? "border-warning ring-1 ring-warning/40" : undefined}>
                <SelectValue placeholder={`Select a sender — ${meta.hint}`} />
              </SelectTrigger>
              <SelectContent>
                {senders.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex flex-col">
                      <span className="text-[12.5px]">{s.label}</span>
                      {s.meta && <span className="text-[10.5px] text-muted-foreground">{s.meta}</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {needsSender && (
            <div className="flex items-start gap-2 text-[11px] text-warning">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                This merchant has {senders.length} senders on this channel — pick one. The API rejects a
                send with no <code className="font-mono">{meta.field}</code> (<code className="font-mono">400 SENDER_REQUIRED</code>).
              </span>
            </div>
          )}
        </div>

        {/* cURL block */}
        <div className="overflow-hidden rounded-lg border border-border bg-[#0d1117]">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="font-mono text-[11px] uppercase tracking-wide text-white/60">cURL</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setRevealed((r) => !r)}
                className="flex items-center gap-1 text-[11px] text-white/50 transition-colors hover:text-white"
              >
                {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />} {revealed ? "Hide key" : "Show key"}
              </button>
              <button
                onClick={copy}
                disabled={blocked}
                className="flex items-center gap-1 text-[11px] text-white/50 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />} Copy
              </button>
            </div>
          </div>
          <pre className="max-h-[340px] overflow-auto px-3 py-3 text-[12px] leading-relaxed text-[#c9d1d9]"><code>{shown}</code></pre>
        </div>

        <div className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            Keep your API key secret. Add more objects to{" "}
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px] text-foreground">recipients</code>{" "}
            to send to multiple people. A campaign and run are created automatically, so this still shows up in Analytics.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
