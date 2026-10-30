import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, Copy, MessageCircle, Phone, MessageSquare, Webhook, Sparkles,
  Users, ListChecks, History, MoreHorizontal, Archive, RotateCcw, Pencil, LayoutTemplate,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PublishTemplateDialog } from "@/components/templates/PublishTemplateDialog";
import {
  getTemplate, useTemplates, copyTemplate, unpublishTemplate, republishTemplate,
  CATEGORY_LABEL, TEMPLATE_CLIENTS, type ChannelLabel,
} from "@/lib/campaign-templates";

export const Route = createFileRoute("/campaigns/templates/$id")({
  component: TemplateDetail,
  head: ({ params }) => ({
    meta: [{ title: `Template · ${params.id} · Pi Commerce Enterprise` }],
  }),
});

const CHANNEL_ICON: Record<ChannelLabel, typeof MessageCircle> = {
  WhatsApp: MessageCircle,
  Voice: Phone,
  SMS: MessageSquare,
  API: Webhook,
};

function TemplateDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  // Subscribe so version/status/analytics changes re-render the rail live.
  useTemplates();
  const template = getTemplate(id);
  const [editOpen, setEditOpen] = useState(false);

  if (!template) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
        <LayoutTemplate className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">This template no longer exists.</p>
        <Link
          to="/campaigns/templates"
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to library
        </Link>
      </div>
    );
  }

  const handleCopy = () => {
    const newId = copyTemplate(template);
    toast.success("Template copied", {
      description: `${template.name} added to your campaigns as a draft. Bind your resources to launch.`,
    });
    navigate({ to: "/campaigns/$id", params: { id: newId } });
  };

  const changelog = [...template.versions].reverse();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar — mirrors the builder header */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
        <Link
          to="/campaigns/templates"
          className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Back to template library"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Templates</span>
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="truncate text-[13.5px] font-medium">{template.name}</span>
        <span className="ml-1 inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground">
          <LayoutTemplate className="h-3 w-3" />
          {CATEGORY_LABEL[template.category]}
        </span>
        {template.status === "archived" && (
          <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Archived
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5" /> Copy to my campaigns
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="gap-2 text-xs" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit & publish new version
              </DropdownMenuItem>
              {template.status === "published" ? (
                <DropdownMenuItem
                  className="gap-2 text-xs text-destructive focus:text-destructive"
                  onClick={() => { unpublishTemplate(template.id); toast.success("Template unpublished", { description: "Delisted from the catalog. Existing copies keep running." }); }}
                >
                  <Archive className="h-3.5 w-3.5" /> Unpublish
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  onClick={() => { republishTemplate(template.id); toast.success("Template re-listed", { description: "Back in the catalog." }); }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Re-list
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Read-only flow preview — the unscrubbed source graph, click a node to inspect */}
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-3 py-1 text-[11px] font-medium shadow-sm backdrop-blur">
              <LayoutTemplate className="h-3 w-3 text-muted-foreground" />
              Template preview · v{template.version}
            </div>
          </div>
          <WorkflowCanvas status="ready" campaignId={template.sourceCampaignId} previewOnly />
        </div>

        {/* Metadata rail */}
        <aside className="w-[380px] shrink-0 overflow-y-auto border-l border-border bg-background">
          <div className="space-y-6 p-5">
            {/* Summary */}
            <section>
              <h1 className="text-[17px] font-semibold leading-tight tracking-tight">{template.name}</h1>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{template.description}</p>
              {template.performance && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-success/25 bg-success/10 px-2 py-1 text-[12px] font-medium text-success">
                  <Sparkles className="h-3.5 w-3.5" /> {template.performance}
                </p>
              )}
            </section>

            {/* Channels */}
            <section>
              <RailLabel icon={Webhook} text="Channels" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {template.channels.map((ch) => {
                  const Icon = CHANNEL_ICON[ch];
                  return (
                    <span key={ch} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-2 py-1 text-[11.5px] text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" /> {ch}
                    </span>
                  );
                })}
              </div>
            </section>

            {/* Setup checklist */}
            <section>
              <RailLabel icon={ListChecks} text={`Setup before launch · ${template.setupSteps.length}`} />
              {template.setupSteps.length === 0 ? (
                <p className="mt-2 text-[12px] text-muted-foreground">Ready to run — no bindings needed.</p>
              ) : (
                <ol className="mt-2 space-y-1.5">
                  {template.setupSteps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground">
                        {i + 1}
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* Audience schema */}
            <section>
              <RailLabel icon={Users} text={`Audience schema · ${template.audienceSchema.length}`} />
              {template.audienceSchema.length === 0 ? (
                <p className="mt-2 text-[12px] text-muted-foreground">No declared attributes.</p>
              ) : (
                <div className="mt-2 overflow-hidden rounded-md border border-border">
                  <table className="w-full text-[12px]">
                    <tbody className="divide-y divide-border">
                      {template.audienceSchema.map((a) => (
                        <tr key={a.name}>
                          <td className="px-3 py-1.5 font-mono text-[11.5px]">{a.name}</td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground">{a.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {template.audienceNotes && (
                <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{template.audienceNotes}</p>
              )}
            </section>

            {/* Enabled clients */}
            <section>
              <RailLabel icon={Building2} text={`Enabled clients · ${template.enabledClientIds.length}`} />
              {template.enabledClientIds.length === 0 ? (
                <p className="mt-2 text-[12px] text-muted-foreground">Not enabled for any client yet.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {template.enabledClientIds.map((cid) => {
                    const c = TEMPLATE_CLIENTS.find((x) => x.id === cid);
                    return (
                      <span key={cid} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-2 py-1 text-[11.5px] text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" /> {c?.name ?? cid}
                      </span>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Version history */}
            <section>
              <RailLabel icon={History} text={`Version history · v${template.version}`} />
              <ol className="mt-2 space-y-2.5">
                {changelog.map((v) => (
                  <li key={v.version} className="flex gap-2.5">
                    <div className="flex flex-col items-center">
                      <span className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold",
                        v.version === template.version ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
                      )}>
                        {v.version}
                      </span>
                      {v.version !== changelog[changelog.length - 1].version && <span className="mt-0.5 w-px flex-1 bg-border" />}
                    </div>
                    <div className="pb-0.5">
                      <p className="text-[12px] leading-tight">{v.note}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{v.date}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* Adoption */}
            <section>
              <RailLabel icon={Copy} text="Adoption" />
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Stat label="Copies" value={template.analytics.copies} />
                <Stat label="Launches" value={template.analytics.launches} />
                <Stat label="Tenants" value={template.analytics.tenants} />
              </div>
            </section>
          </div>
        </aside>
      </div>

      <PublishTemplateDialog open={editOpen} onOpenChange={setEditOpen} editTemplate={template} />
    </div>
  );
}

function RailLabel({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {text}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-secondary/40 px-2 py-2 text-center">
      <div className="text-[16px] font-semibold tabular-nums">{value}</div>
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
