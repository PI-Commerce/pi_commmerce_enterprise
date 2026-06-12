import { cn } from "@/lib/utils";

export function PageTabs<T extends string>({
  tabs, value, onChange,
}: {
  tabs: ReadonlyArray<{ id: T; label: string; count?: number; disabled?: boolean }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="mb-5 flex items-center gap-0 border-b border-border">
      {tabs.map((t) => {
        const active = t.id === value;
        if (t.disabled) {
          return (
            <span
              key={t.id}
              title="Coming soon"
              className="relative -mb-px flex cursor-not-allowed items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium text-muted-foreground/40"
            >
              {t.label}
              <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground/70">
                Soon
              </span>
            </span>
          );
        }
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative -mb-px flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{t.count}</span>
            )}
            {active && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-foreground" />}
          </button>
        );
      })}
    </div>
  );
}
