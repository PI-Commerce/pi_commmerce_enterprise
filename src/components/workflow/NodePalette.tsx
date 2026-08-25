import { useState } from "react";
import {
  Users, GitBranch, Split, Phone, MessageCircle,
  MessageSquare, MessageSquareText, Clock, Megaphone, Plus, X, Webhook, Sparkles, Flag, Bot,
  type LucideIcon,
} from "lucide-react";
import type { NodeKind } from "@/lib/campaign-types";
import { NODE_LABELS } from "@/lib/campaign-types";
import { cn } from "@/lib/utils";

const ICONS: Partial<Record<NodeKind, LucideIcon>> = {
  audience: Users,
  apiToolCall: Webhook,
  conditional: GitBranch,
  abSplit: Split,
  delay: Clock,
  voiceCall: Phone,
  whatsapp: MessageCircle,
  aiChat: Bot,
  sms: MessageSquare,
  rcs: MessageSquareText,
  aiTransform: Sparkles,
  adsCampaign: Megaphone,
  needsReview: Flag,
};

// Audience is omitted: every canvas already ships with exactly one (non-deletable)
// Audience node as the single contact entry point, so it's never addable here.
//
// `adsCampaign` is deprecated and intentionally omitted: Click-to-WhatsApp is now a
// *source* on the Audience node (so it shares the flow's schema contract), not a
// standalone entry node. The kind is kept registered for back-compat with any saved
// flows, but it can no longer be added to a canvas.
const SECTIONS: Array<{ label: string; nodes: NodeKind[] }> = [
  { label: "Data Nodes", nodes: ["apiToolCall"] },
  { label: "Logic Nodes", nodes: ["conditional", "abSplit", "delay"] },
  { label: "AI Nodes", nodes: ["aiTransform"] },
  { label: "Action Nodes", nodes: ["voiceCall", "whatsapp", "aiChat", "sms", "rcs", "needsReview"] },
];

export function NodePalette({
  onAdd, disabled,
}: { onAdd: (kind: NodeKind) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-col items-start gap-2">
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          "pointer-events-auto flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[12.5px] font-medium shadow-sm transition-colors",
          disabled ? "cursor-not-allowed opacity-50" : "hover:bg-accent",
        )}
      >
        <Plus className="h-3.5 w-3.5" /> Add node
      </button>

      {open && !disabled && (
        <div className="pointer-events-auto w-[260px] overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_40px_-12px_rgba(0,0,0,0.2)] animate-fade-in">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Primitives</p>
            <button onClick={() => setOpen(false)} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="scrollbar-thin max-h-[420px] overflow-y-auto py-1">
            {SECTIONS.map((s) => {
              return (
                <div key={s.label} className="px-1 py-1">
                  <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">{s.label}</p>
                  {s.nodes.map((kind) => {
                    const Icon = ICONS[kind]!;
                    return (
                      <button
                        key={kind}
                        onClick={() => { onAdd(kind); setOpen(false); }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-accent"
                      >
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {NODE_LABELS[kind]}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
