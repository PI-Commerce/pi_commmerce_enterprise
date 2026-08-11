import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, Check, Eye, EyeOff, Info } from "lucide-react";
import { curlSnippet, endpointFor, DEMO_API_KEY, type CurlTemplate } from "@/lib/template-send";

/**
 * "Get Curl" — the ready-to-fire curl for a single template. Reused by the
 * WhatsApp / SMS / RCS template lists: pass a channel-agnostic {@link CurlTemplate}.
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

  if (!template) return null;

  const shown = curlSnippet(template, { apiKey: revealed ? DEMO_API_KEY : "YOUR_API_KEY" });

  function copy() {
    navigator.clipboard?.writeText(curlSnippet(template!, { apiKey: DEMO_API_KEY }));
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
                className="flex items-center gap-1 text-[11px] text-white/50 transition-colors hover:text-white"
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
