import { Workflow, Megaphone, BarChart3, Sparkles, Boxes, Plug, Settings, Command } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { icon: Workflow, label: "Workflows", active: true },
  { icon: Megaphone, label: "Campaigns" },
  { icon: BarChart3, label: "Analytics" },
  { icon: Sparkles, label: "Ask Pi", ai: true },
  { icon: Boxes, label: "Capabilities" },
  { icon: Plug, label: "Integrations" },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-14 flex-col items-center justify-between border-r border-border bg-background py-3">
      <div className="flex flex-col items-center gap-1">
        <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
          <Command className="h-4 w-4" />
        </div>
        {items.map((item) => (
          <button
            key={item.label}
            title={item.label}
            className={cn(
              "group relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground",
              item.active && "bg-accent text-foreground",
            )}
          >
            <item.icon className={cn("h-[18px] w-[18px]", item.ai && "text-ai")} />
            {item.active && (
              <span className="absolute -left-[13px] top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-foreground" />
            )}
          </button>
        ))}
      </div>
      <button
        title="Settings"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
      >
        <Settings className="h-[18px] w-[18px]" />
      </button>
    </aside>
  );
}
