import { useState } from "react";
import {
  Type as TypeIcon,
  Image as ImageIcon,
  Video,
  FileText,
  List as ListIcon,
  Webhook,
  GitBranch,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import type { FreeformNodeKind } from "@/lib/freeform-types";
import { FREEFORM_NODE_LABELS } from "@/lib/freeform-types";
import { cn } from "@/lib/utils";

/**
 * Freeform palette. Only two categories:
 *  - Message Nodes  > freeform-owned WhatsApp primitives (each carries its own
 *  optional Buttons block per Meta's interactive spec, so there's no separate
 *  Buttons or CTA URL kind).
 *  - Logic Nodes  > API Call + Conditional, reused from the main campaign
 *  construct (WorkflowNode + ConfigPanel), routed via `logicKind`.
 */
export type LogicKind = "apiToolCall" | "conditional";
export type PaletteAdd =
  | { kind: "freeform"; freeform: FreeformNodeKind }
  | { kind: "logic"; logic: LogicKind };

const MSG_ICONS: Partial<Record<FreeformNodeKind, LucideIcon>> = {
  text: TypeIcon,
  image: ImageIcon,
  video: Video,
  document: FileText,
  list: ListIcon,
};

const MESSAGE_KINDS: FreeformNodeKind[] = [
  "text",
  "image",
  "video",
  "document",
  "list",
];

export function FreeformNodePalette({
  onAdd,
  disabled,
}: {
  onAdd: (a: PaletteAdd) => void;
  disabled?: boolean;
}) {
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
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Primitives
            </p>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="scrollbar-thin max-h-[420px] overflow-y-auto py-1">
            <div className="px-1 py-1">
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                Message Nodes
              </p>
              {MESSAGE_KINDS.map((k) => {
                const Icon = MSG_ICONS[k]!;
                return (
                  <button
                    key={k}
                    onClick={() => {
                      onAdd({ kind: "freeform", freeform: k });
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-accent"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {FREEFORM_NODE_LABELS[k]}
                  </button>
                );
              })}
            </div>
            <div className="px-1 py-1">
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                Logic Nodes
              </p>
              <button
                onClick={() => {
                  onAdd({ kind: "logic", logic: "apiToolCall" });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-accent"
              >
                <Webhook className="h-3.5 w-3.5 text-muted-foreground" />
                API Call
              </button>
              <button
                onClick={() => {
                  onAdd({ kind: "logic", logic: "conditional" });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-accent"
              >
                <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                Conditional
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
