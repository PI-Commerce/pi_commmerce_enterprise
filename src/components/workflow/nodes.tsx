import { Handle, Position, type NodeProps } from "reactflow";
import {
  Play, Square, Users, GitBranch, Split,
  Phone, MessageCircle, MessageSquare,
  Clock, Megaphone, AlertCircle, CheckCircle2, Loader2, Sparkles, FlaskConical,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeKind, WorkflowNodeData } from "@/lib/campaign-types";
import { NODE_GROUPS } from "@/lib/campaign-types";

export type { WorkflowNodeData } from "@/lib/campaign-types";

const ICONS: Record<NodeKind, LucideIcon> = {
  start: Play,
  end: Square,
  audience: Users,
  conditional: GitBranch,
  abSplit: Split,
  delay: Clock,
  voiceCall: Phone,
  whatsapp: MessageCircle,
  sms: MessageSquare,
  adsCampaign: Megaphone,
};

const GROUP_TONE: Record<string, string> = {
  system: "text-foreground bg-accent",
  data: "text-chart-2 bg-chart-2/10",
  logic: "text-chart-1 bg-chart-1/10",
  action: "text-success bg-success/10",
  ai: "text-ai bg-ai/10",
  ads: "text-chart-3 bg-chart-3/10",
};

export function WorkflowNode({ data, selected }: NodeProps<WorkflowNodeData>) {
  const Icon = ICONS[data.kind] ?? Sparkles;
  const group = NODE_GROUPS[data.kind];
  const tone = GROUP_TONE[group];
  const invalid = data.valid === false;
  const running = data.runState === "running";
  const success = data.runState === "success";
  const failed = data.runState === "failed";
  const isTerminal = data.kind === "start" || data.kind === "end";
  const outputs = data.outputs ?? [];
  const multiOut = outputs.length > 0;
  const abTest = data.abTest;
  // Fixed width — outputs stack vertically on the right edge, so the node grows
  // downward with more ports instead of ballooning sideways.
  const nodeWidth = multiOut ? 240 : 224;

  // Skeleton wireframe placeholder used during Ask Pi build phase.
  if (data.building) {
    return (
      <div
        className={cn(
          "askpi-skeleton relative rounded-xl border border-ai/40 bg-ai/[0.04]",
          isTerminal ? "h-8 w-[120px] rounded-full" : "h-[64px] w-[224px]",
        )}
      >
        {!isTerminal && (
          <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-2 !border-background !bg-ai/40" />
        )}
        {!isTerminal && (
          <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-2 !border-background !bg-ai/40" />
        )}
        {isTerminal && data.kind !== "start" && (
          <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-2 !border-background !bg-ai/40" />
        )}
        {isTerminal && data.kind !== "end" && (
          <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-2 !border-background !bg-ai/40" />
        )}
        <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
          <div className="askpi-skeleton-shimmer h-full w-full" />
        </div>
        <style>{`
          @keyframes askPiSkelPulse {
            0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--ai) 0%, transparent); border-color: color-mix(in oklch, var(--ai) 35%, transparent); }
            50%      { box-shadow: 0 0 22px -2px color-mix(in oklch, var(--ai) 55%, transparent); border-color: color-mix(in oklch, var(--ai) 70%, transparent); }
          }
          .askpi-skeleton { animation: askPiSkelPulse 1.8s ease-in-out infinite; }
          @keyframes askPiSkelShimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          .askpi-skeleton-shimmer {
            background: linear-gradient(90deg, transparent, color-mix(in oklch, var(--ai) 22%, transparent), transparent);
            animation: askPiSkelShimmer 1.8s linear infinite;
          }
        `}</style>
      </div>
    );
  }


  // Terminal nodes render as a distinctive colored pill — no config, no validation chrome.
  if (isTerminal) {
    const isStart = data.kind === "start";
    const fallback = isStart ? "Start" : "End";
    const label = data.title?.trim() ? data.title : fallback;
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
        {data.kind !== "start" && (
          <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground/60" />
        )}
        {data.kind !== "end" && (
          <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground/60" />
        )}
      </div>
    );
  }

  return (
    <div
      style={{ width: nodeWidth }}
      className={cn(
        "group relative rounded-xl border bg-card text-card-foreground transition-all",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_-6px_rgba(0,0,0,0.06)]",
        "hover:shadow-[0_4px_10px_rgba(0,0,0,0.06),0_14px_30px_-8px_rgba(0,0,0,0.10)]",
        selected
          ? "border-foreground ring-2 ring-foreground/15"
          : invalid
            ? "border-destructive/50"
            : success
              ? "border-success/50"
              : failed
                ? "border-destructive/60"
                : "border-border",
        running && "animate-pulse-glow",
      )}
    >
      {abTest && (
        <div className="absolute -right-2 -top-2.5 z-10 flex items-center gap-1 rounded-full border border-chart-1/40 bg-chart-1/10 px-1.5 py-0.5 text-[9px] font-semibold text-chart-1 shadow-sm backdrop-blur-sm">
          <FlaskConical className="h-2.5 w-2.5" />
          A/B {abTest.variants.map((v) => v.pct).join("/")}
        </div>
      )}

      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground/50" />

      <div className="flex items-start gap-2.5 p-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-medium leading-tight">{data.title}</p>
            {success && <CheckCircle2 className="h-3 w-3 text-success" />}
            {failed && <AlertCircle className="h-3 w-3 text-destructive" />}
            {running && <Loader2 className="h-3 w-3 animate-spin text-ai" />}
          </div>
          {data.subtitle && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{data.subtitle}</p>
          )}
          {invalid && (
            <p className="mt-1 flex items-center gap-1 text-[10.5px] font-medium text-destructive">
              <AlertCircle className="h-2.5 w-2.5" /> {data.error ?? "Incomplete configuration"}
            </p>
          )}
        </div>
      </div>

      {data.metrics && (
        <div className="grid grid-cols-3 gap-1 border-t border-border bg-secondary/40 px-3 py-1.5 text-[10px]">
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">In</span>
            <span className="font-semibold tabular-nums">{data.metrics.entered.toLocaleString()}</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Out</span>
            <span className="font-semibold tabular-nums">{data.metrics.exited.toLocaleString()}</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Drop</span>
            <span className="font-semibold tabular-nums">{data.metrics.dropoffPct.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {running && (
        <div className="absolute inset-x-3 bottom-1.5 h-[2px] overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/2 animate-[shimmer_1.6s_linear_infinite] bg-gradient-to-r from-transparent via-ai to-transparent bg-[length:200%_100%]" />
        </div>
      )}

      {multiOut ? (
        <div className="border-t border-border bg-secondary/40 py-1">
          {outputs.map((o) => (
            <div key={o.id} className="relative flex items-center justify-end px-3 py-[3px]">
              <span
                title={o.label}
                className={cn(
                  "max-w-full truncate text-[10px] font-medium leading-tight",
                  o.kind === "default" ? "text-muted-foreground" : "text-foreground/80",
                )}
              >
                {o.label}
              </span>
              <Handle
                id={o.id}
                type="source"
                position={Position.Right}
                className={cn(
                  "!h-2 !w-2 !border-2 !border-background",
                  o.kind === "default" ? "!bg-muted-foreground/40" : "!bg-foreground/60",
                )}
              />
            </div>
          ))}
        </div>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground/50" />
      )}
    </div>
  );
}


export const nodeTypes = { workflow: WorkflowNode };
