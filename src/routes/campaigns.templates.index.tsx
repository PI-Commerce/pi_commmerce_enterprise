import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search, Rocket, LayoutTemplate, MessageCircle, Phone, MessageSquare, Webhook,
  Users, GitBranch, Copy, Sparkles, Archive, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useTemplates, TEMPLATE_CATEGORIES, CATEGORY_LABEL,
  type CampaignTemplate, type ChannelLabel, type TemplateCategory,
} from "@/lib/campaign-templates";
import { PublishTemplateDialog } from "@/components/templates/PublishTemplateDialog";

export const Route = createFileRoute("/campaigns/templates/")({
  component: TemplateCatalog,
  head: () => ({
    meta: [
      { title: "Template Library · Pi Commerce Enterprise" },
      { name: "description", content: "Browse, preview and copy pre-built campaign templates." },
    ],
  }),
});

const CHANNEL_ICON: Record<ChannelLabel, typeof MessageCircle> = {
  WhatsApp: MessageCircle,
  Voice: Phone,
  SMS: MessageSquare,
  API: Webhook,
};

function TemplateCatalog() {
  const templates = useTemplates();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | TemplateCategory>("all");
  const [channels, setChannels] = useState<ChannelLabel[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const toggleChannel = (ch: ChannelLabel) =>
    setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (!showArchived && t.status === "archived") return false;
      if (category !== "all" && t.category !== category) return false;
      // Multi-select: match a template if it carries ANY of the selected channels.
      if (channels.length > 0 && !channels.some((c) => t.channels.includes(c))) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [templates, showArchived, category, channels, query]);

  const publishedCount = templates.filter((t) => t.status === "published").length;

  return (
    <AppShell>
      <PageHeader
        title="Template Library"
        description="Publish proven campaigns as templates, then copy one to launch a new journey in minutes."
        actions={
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setPublishOpen(true)}>
            <Rocket className="h-3.5 w-3.5" /> Publish template
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
          <SelectTrigger className="h-8 w-auto gap-1.5 px-2.5 text-xs">
            <span className="text-muted-foreground">Category:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All categories</SelectItem>
            {TEMPLATE_CATEGORIES.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs transition-colors hover:bg-accent"
            >
              <span className="text-muted-foreground">Channels:</span>
              <span className="text-foreground">
                {channels.length === 0 ? "All" : channels.length === 1 ? channels[0] : `${channels.length} selected`}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            {(["WhatsApp", "Voice", "SMS", "API"] as ChannelLabel[]).map((c) => (
              <DropdownMenuCheckboxItem
                key={c}
                checked={channels.includes(c)}
                onCheckedChange={() => toggleChannel(c)}
                onSelect={(e) => e.preventDefault()}
                className="text-xs"
              >
                {c}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={() => setShowArchived((s) => !s)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
            showArchived
              ? "border-border bg-accent text-foreground"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
          title="Show archived (unpublished) templates"
        >
          <Archive className="h-3.5 w-3.5" /> Archived
        </button>
      </div>

      {publishedCount === 0 && !showArchived ? (
        <EmptyState onPublish={() => setPublishOpen(true)} />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">No templates match these filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}

      <PublishTemplateDialog open={publishOpen} onOpenChange={setPublishOpen} />
    </AppShell>
  );
}

function TemplateCard({ template: t }: { template: CampaignTemplate }) {
  return (
    <Link
      to="/campaigns/templates/$id"
      params={{ id: t.id }}
      className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-accent/30"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          <LayoutTemplate className="h-3 w-3" />
          {CATEGORY_LABEL[t.category]}
        </span>
        <div className="flex items-center gap-1">
          {t.status === "archived" && (
            <span className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Archived
            </span>
          )}
          <span className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            v{t.version}
          </span>
        </div>
      </div>

      <h3 className="text-[15px] font-semibold leading-tight tracking-tight group-hover:underline">{t.name}</h3>
      <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-muted-foreground">{t.description}</p>

      {t.performance && (
        <p className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-success">
          <Sparkles className="h-3 w-3" /> {t.performance}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {t.channels.map((ch) => {
          const Icon = CHANNEL_ICON[ch];
          return (
            <span
              key={ch}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[10.5px] text-muted-foreground"
            >
              <Icon className="h-3 w-3" /> {ch}
            </span>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1" title="Audience attributes required">
          <Users className="h-3 w-3" /> {t.audienceSchema.length} attrs
        </span>
        <span className="inline-flex items-center gap-1" title="Setup steps to bind before launch">
          <GitBranch className="h-3 w-3" /> {t.setupSteps.length} setup
        </span>
        <span className="ml-auto inline-flex items-center gap-1" title="Times copied by tenants">
          <Copy className="h-3 w-3" /> {t.analytics.copies}
        </span>
      </div>
    </Link>
  );
}

function EmptyState({ onPublish }: { onPublish: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary">
        <LayoutTemplate className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">No templates published yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Publish a proven campaign as a template. Tenant-bound resources are stripped so any workspace can copy,
        bind their own, and launch.
      </p>
      <Button size="sm" className="mt-5 h-8 gap-1.5 text-xs" onClick={onPublish}>
        <Rocket className="h-3.5 w-3.5" /> Publish template
      </Button>
    </div>
  );
}
