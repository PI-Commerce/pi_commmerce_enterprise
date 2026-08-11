import { Handle, Position, type NodeProps } from "reactflow";
import {
  Play,
  Square,
  Type as TypeIcon,
  Image as ImageIcon,
  Video,
  FileText,
  List as ListIcon,
  AlertCircle,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FreeformNodeKind,
  FreeformNodeConfig,
} from "@/lib/freeform-types";
import { FREEFORM_NODE_LABELS } from "@/lib/freeform-types";

/**
 * Freeform Workflow node. Visual style mirrors the campaign builder's
 * WorkflowNode (light card, colored icon square, title + `serial • description`
 * subtitle, right-side source handles) so a user switching between the two
 * builders sees the same primitives. Kind-specific body previews the actual
 * WhatsApp message so the canvas doubles as a rough what-the-lead-sees preview.
 */

export type FreeformNodeData = {
  kind: FreeformNodeKind;
  title: string;
  description?: string;
  serial?: string;
  valid?: boolean;
  error?: string;
  locked?: boolean;
  config?: FreeformNodeConfig;
};

const ICONS: Record<FreeformNodeKind, LucideIcon> = {
  start: Play,
  end: Square,
  text: TypeIcon,
  image: ImageIcon,
  video: Video,
  document: FileText,
  list: ListIcon,
};

/** Tone matches campaign NODE_GROUPS: message kinds render as `action` (green). */
const TONE = "text-success bg-success/10";

export function FreeformNode({ data, selected }: NodeProps<FreeformNodeData>) {
  const Icon = ICONS[data.kind] ?? TypeIcon;
  const invalid = data.valid === false;
  const isTerminal = data.kind === "start" || data.kind === "end";

  if (isTerminal) {
    const isStart = data.kind === "start";
    const label = data.title?.trim() || (isStart ? "Start" : "End");
    return (
      <div
        className={cn(
          "group flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition-all",
          "shadow-[0_1px_2px_rgba(0,0,0,0.06),0_6px_14px_-8px_rgba(0,0,0,0.18)]",
          isStart
            ? "border-success/40 bg-success/15 text-success"
            : "border-warning/50 bg-warning/20 text-warning",
          selected && "ring-2 ring-offset-2 ring-offset-background",
          selected && isStart && "ring-success/50",
          selected && !isStart && "ring-warning/60",
        )}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
        <span className="max-w-[180px] truncate">{label}</span>
        {!isStart && (
          <Handle
            type="target"
            position={Position.Left}
            className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground/60"
          />
        )}
        {isStart && (
          <Handle
            type="source"
            position={Position.Right}
            className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground/60"
          />
        )}
      </div>
    );
  }

  // Everything with a branch (buttons, list rows, conditional variants) renders
  // its handle directly on the visible chip in the body  -  matching the
  // reference where the edge emerges from the button/row itself, not from a
  // separate labelled stub. No footer branch strip.

  return (
    <div
      style={{ width: 260 }}
      className={cn(
        "group relative rounded-xl border bg-card text-card-foreground transition-all",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_-6px_rgba(0,0,0,0.06)]",
        "hover:shadow-[0_4px_10px_rgba(0,0,0,0.06),0_14px_30px_-8px_rgba(0,0,0,0.10)]",
        selected
          ? "border-foreground ring-2 ring-foreground/15"
          : invalid
            ? "border-destructive/50"
            : "border-border",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground/50"
      />

      {/* Header  -  icon + title + serial·description subtitle (campaign parity) */}
      <div className="flex items-start gap-2.5 p-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            TONE,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight">
            {data.title || FREEFORM_NODE_LABELS[data.kind]}
          </p>
          {data.serial ? (
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/80">
              {data.description
                ? `${data.serial} • ${data.description}`
                : data.serial}
            </p>
          ) : null}
          {invalid && (
            <p className="mt-1 flex items-center gap-1 text-[10.5px] font-medium text-destructive">
              <AlertCircle className="h-2.5 w-2.5" />{" "}
              {data.error ?? "Incomplete configuration"}
            </p>
          )}
        </div>
      </div>

      {/* Body  -  kind-specific visible preview */}
      <NodeBody data={data} />

      {/* Nodes without any body-attached branches (no buttons, no list rows)
  expose a single default source handle on the card's right edge. */}
      {!hasBodyBranches(data) && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground/50"
        />
      )}
    </div>
  );
}

/* --------------------------------- Body --------------------------------- */

function NodeBody({ data }: { data: FreeformNodeData }) {
  const cfg = data.config ?? {};
  switch (data.kind) {
    case "text":
      return (
        <div className="space-y-2 border-t border-border/60 px-3 py-2.5 text-[12px]">
          {cfg.text ? (
            <p className="whitespace-pre-wrap break-words text-foreground/90 line-clamp-4">
              {cfg.text}
            </p>
          ) : (
            <Placeholder>Add message text…</Placeholder>
          )}
          <ButtonsPreview cfg={cfg} />
        </div>
      );

    case "image":
    case "video":
    case "document":
      return (
        <div className="space-y-2 border-t border-border/60 px-3 py-2.5 text-[12px]">
          <MediaThumb kind={data.kind} cfg={cfg} />
          {cfg.caption ? (
            <p className="text-foreground/90 line-clamp-3">{cfg.caption}</p>
          ) : (
            <Placeholder>Caption required</Placeholder>
          )}
          <ButtonsPreview cfg={cfg} />
        </div>
      );

    case "list":
      return (
        <div className="space-y-2 border-t border-border/60 px-3 py-2.5 text-[12px]">
          {cfg.header && (
            <p className="text-[11px] font-semibold text-foreground/80">
              {cfg.header}
            </p>
          )}
          {cfg.body ? (
            <p className="text-foreground/90 line-clamp-3">{cfg.body}</p>
          ) : (
            <Placeholder>Body required</Placeholder>
          )}
          {cfg.footer && (
            <p className="text-[10.5px] text-muted-foreground">{cfg.footer}</p>
          )}
          <div className="rounded-md border border-border bg-background px-2 py-1.5 text-center text-[11.5px] font-medium text-ai">
            {cfg.buttonLabel || "Choose"}
          </div>
          {(cfg.rows?.length ?? 0) > 0 ? (
            <div className="space-y-1.5 pt-1">
              {cfg.rows!.map((r) => (
                <div
                  key={r.id}
                  className="relative rounded-md border border-ai/30 bg-ai/5 px-2.5 py-1.5 text-left"
                >
                  <p className="truncate text-[11.5px] font-medium text-foreground">
                    {r.title || "Untitled"}
                  </p>
                  {r.description && (
                    <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                      {r.description}
                    </p>
                  )}
                  <Handle
                    id={`row_${r.id}`}
                    type="source"
                    position={Position.Right}
                    className="!h-2 !w-2 !border-2 !border-background !bg-foreground/60"
                  />
                </div>
              ))}
            </div>
          ) : (
            <Placeholder>Add rows in the panel.</Placeholder>
          )}
        </div>
      );

    default:
      return null;
  }
}

function MediaThumb({
  kind,
  cfg,
}: {
  kind: "image" | "video" | "document";
  cfg: FreeformNodeConfig;
}) {
  const Icon =
    kind === "image" ? ImageIcon : kind === "video" ? Video : FileText;
  const hasMedia =
    (cfg.mediaSource === "url" && !!cfg.mediaUrl) ||
    (cfg.mediaSource === "upload" && !!cfg.mediaFileName);
  if (!hasMedia) {
    return (
      <div className="grid h-24 place-items-center rounded-md border border-dashed border-border bg-secondary/30 text-muted-foreground">
        <div className="flex flex-col items-center gap-1 text-[11px]">
          <Icon className="h-5 w-5 opacity-60" />
          <span>Add {kind}</span>
        </div>
      </div>
    );
  }
  // Image: show the actual pixels  -  from public URL, or from the transient
  // object URL created when the user uploaded a file.
  if (kind === "image") {
    const src = cfg.mediaSource === "url" ? cfg.mediaUrl : cfg.mediaBlobUrl;
    if (src) {
      return (
        <div className="grid h-32 place-items-center overflow-hidden rounded-md border border-border bg-secondary/30">
          <img
            src={src}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
        </div>
      );
    }
  }
  // Video: if uploaded, use HTML5 <video> with the object URL for a real preview.
  if (kind === "video") {
    const src = cfg.mediaSource === "url" ? cfg.mediaUrl : cfg.mediaBlobUrl;
    if (src) {
      return (
        <div className="grid h-32 place-items-center overflow-hidden rounded-md border border-border bg-black">
          <video
            src={src}
            className="max-h-full max-w-full"
            muted
            playsInline
          />
        </div>
      );
    }
  }
  // Document (and media fallback): file card.
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-2.5 py-2 text-[11.5px]">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        {cfg.mediaFileName || cfg.mediaUrl}
      </span>
    </div>
  );
}

function ButtonsPreview({ cfg }: { cfg: FreeformNodeConfig }) {
  const b = cfg.buttonsBlock;
  if (!b) return null;
  if (b.mode === "quick_reply") {
    if (b.buttons.length === 0) return null;
    return (
      <div className="space-y-1.5 pt-1">
        {b.buttons.map((btn) => (
          <div
            key={btn.id}
            className="relative rounded-md border border-ai/30 bg-ai/5 px-2.5 py-1.5 text-center text-[11.5px] font-medium text-ai"
          >
            {btn.label || "Quick reply"}
            <Handle
              id={`btn_${btn.id}`}
              type="source"
              position={Position.Right}
              className="!h-2 !w-2 !border-2 !border-background !bg-foreground/60"
            />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="pt-1">
      <div className="relative flex items-center justify-center gap-1.5 rounded-md border border-ai/30 bg-ai/5 px-2.5 py-1.5 text-[11.5px] font-medium text-ai">
        <ExternalLink className="h-3 w-3" />
        <span className="truncate">{b.button.label || "Open link"}</span>
        <Handle
          id={`btn_${b.button.id}`}
          type="source"
          position={Position.Right}
          className="!h-2 !w-2 !border-2 !border-background !bg-foreground/60"
        />
      </div>
    </div>
  );
}

/** True when the node body renders handle-bearing chips (buttons or list rows).
 *  Nodes with body branches don't need a default source handle on the shell. */
function hasBodyBranches(data: FreeformNodeData): boolean {
  const cfg = data.config;
  if (!cfg) return false;
  if (data.kind === "list" && (cfg.rows?.length ?? 0) > 0) return true;
  if (cfg.buttonsBlock?.mode === "quick_reply")
    return cfg.buttonsBlock.buttons.length > 0;
  if (cfg.buttonsBlock?.mode === "cta_url") return true;
  return false;
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] italic text-muted-foreground/70">{children}</p>
  );
}

export const freeformNodeTypes = { freeform: FreeformNode };
