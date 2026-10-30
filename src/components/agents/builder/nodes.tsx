/**
 * Agent-builder canvas nodes. Unlike the campaign canvas (a free flow of steps),
 * an agent is a fixed composition: a Model, a Knowledge base, and any number of
 * Tools all feed the single Agent hub. So there are four node kinds and one
 * polymorphic renderer, reusing the campaign node's visual language (rounded
 * card, tinted icon tile, left/right handles).
 */
import { Handle, Position, type NodeProps } from "reactflow";
import { Bot, Cpu, BookOpen, Wrench, AlertCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentType, PostCallVar } from "@/lib/agent-data";

export type AgentNodeKind = "agent" | "model" | "knowledge" | "tool";

export type AgentNodeData = {
  kind: AgentNodeKind;
  title: string;
  subtitle?: string;
  valid?: boolean;
  error?: string;
  // agent hub
  name?: string;
  agentType?: AgentType;
  status?: "live" | "draft" | "paused";
  masterPrompt?: string;
  evalPrompt?: string;
  postCall?: PostCallVar[];
  // model
  modelConfigId?: string;
  // knowledge
  knowledgeBase?: string;
  // tool
  toolHandle?: string;
};

const ICONS: Record<AgentNodeKind, LucideIcon> = {
  agent: Bot,
  model: Cpu,
  knowledge: BookOpen,
  tool: Wrench,
};

const TONE: Record<AgentNodeKind, string> = {
  agent: "text-ai bg-ai/10",
  model: "text-chart-1 bg-chart-1/10",
  knowledge: "text-chart-2 bg-chart-2/10",
  tool: "text-success bg-success/10",
};

export function AgentFlowNode({ data, selected }: NodeProps<AgentNodeData>) {
  const Icon = ICONS[data.kind];
  const tone = TONE[data.kind];
  const invalid = data.valid === false;
  const isHub = data.kind === "agent";

  return (
    <div
      style={{ width: isHub ? 248 : 216 }}
      className={cn(
        "group relative rounded-xl border bg-card text-card-foreground transition-all",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_-6px_rgba(0,0,0,0.06)]",
        "hover:shadow-[0_4px_10px_rgba(0,0,0,0.06),0_14px_30px_-8px_rgba(0,0,0,0.10)]",
        selected
          ? "border-foreground ring-2 ring-foreground/15"
          : invalid
            ? "border-destructive/50"
            : isHub
              ? "border-ai/40"
              : "border-border",
      )}
    >
      {/* Source nodes (model / knowledge / tool) feed the hub from the left; the
          hub receives them on its left edge. */}
      {isHub ? (
        <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground/50" />
      ) : (
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground/50" />
      )}

      <div className="flex items-start gap-2.5 p-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-medium leading-tight">{data.title}</p>
          </div>
          {data.subtitle && (
            <p title={data.subtitle} className="mt-0.5 truncate text-[11px] text-muted-foreground">{data.subtitle}</p>
          )}
          {invalid && (
            <p className="mt-1 flex items-center gap-1 text-[10.5px] font-medium text-destructive">
              <AlertCircle className="h-2.5 w-2.5" /> {data.error ?? "Incomplete"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export const agentNodeTypes = { agentNode: AgentFlowNode };
