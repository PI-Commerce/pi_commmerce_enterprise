/**
 * Developer > APIs & Webhooks.
 *
 * Two sections stacked vertically: the existing API-keys table on top, and a
 * placeholder for Webhooks (being built next) below. No sub-tabs; merchant
 * teams asked for a single scroll rather than a hidden second surface.
 */

import { Webhook } from "lucide-react";
import { DeveloperApiKeys } from "@/components/settings/DeveloperApiKeys";

export function ApisAndWebhooks() {
  return (
    <div className="space-y-8">
      <DeveloperApiKeys />
      <WebhooksPlaceholder />
    </div>
  );
}

function WebhooksPlaceholder() {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-semibold">Webhooks</h2>
              <span className="rounded-full border border-border bg-secondary/80 px-1.5 py-[1px] text-[9.5px] uppercase tracking-wider text-muted-foreground">
                Soon
              </span>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              Register endpoints to receive delivery, run lifecycle and channel callback events.
            </p>
          </div>
        </div>
      </div>
      <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
        Being built next. Signing, retry and replay controls will land with the first version.
      </div>
    </div>
  );
}
