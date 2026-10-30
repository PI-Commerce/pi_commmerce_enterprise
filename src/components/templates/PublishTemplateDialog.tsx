import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Scissors, ChevronRight, ChevronLeft, Rocket, Check, Wand2, Users, Building2,
  Plus, Layers,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EXAMPLE_CAMPAIGN_NAMES } from "@/lib/campaign-examples";
import {
  analyzeSource, publishTemplate, getTemplates, useTemplates,
  TEMPLATE_CATEGORIES, TEMPLATE_CLIENTS, CATEGORY_LABEL,
  type TemplateCategory, type CampaignTemplate,
} from "@/lib/campaign-templates";

/**
 * Publish a saved campaign as a reusable template. A three-pass wizard mirroring
 * the PRD: confirm the scrub (what tenant-bound bindings get stripped), review the
 * lint warnings (non-blocking), then fill catalog metadata. Re-publishing a source
 * that's already a template mints a new version rather than a duplicate.
 *
 * `sourceCampaignId` fixes the source (opened from a campaign row); when absent the
 * wizard opens on a source-picker so a superadmin can publish from the catalog.
 */
export function PublishTemplateDialog({
  open,
  onOpenChange,
  sourceCampaignId,
  editTemplate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceCampaignId?: string;
  /** When set, opens a simplified edit flow that re-publishes this template as a new version. */
  editTemplate?: CampaignTemplate;
}) {
  const navigate = useNavigate();
  const editMode = !!editTemplate;
  const fixedSource = editTemplate?.sourceCampaignId ?? sourceCampaignId;
  const needsSourcePick = !fixedSource;

  // Wizard state — reset whenever the dialog re-opens (keyed by `open`).
  const [source, setSource] = useState<string>(fixedSource ?? "");
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("retention");
  const [setupText, setSetupText] = useState("");
  const [performance, setPerformance] = useState("");
  const [audienceNotes, setAudienceNotes] = useState("");
  const [enabledClientIds, setEnabledClientIds] = useState<string[]>([]);
  const [nameTouched, setNameTouched] = useState(false);
  // Destination: mint a brand-new template, or version an existing one (its
  // enabled clients are then inherited). Editing is always an existing-version publish.
  const [publishMode, setPublishMode] = useState<"new" | "existing">("new");
  const [targetTemplateId, setTargetTemplateId] = useState("");

  // Published templates a version can be pushed onto (reactive so a just-published one shows up).
  const publishedTemplates = useTemplates().filter((t) => t.status === "published");
  const targetTemplate = publishedTemplates.find((t) => t.id === targetTemplateId);

  // Recompute the scrub/derive analysis whenever the chosen source changes.
  const analysis = useMemo(() => (source ? analyzeSource(source) : null), [source]);

  const toggleClient = (id: string) =>
    setEnabledClientIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  // Seed the editable catalog fields from an existing template (versioning it).
  const seedMetaFromTemplate = (t: CampaignTemplate) => {
    setName(t.name);
    setDescription(t.description);
    setCategory(t.category);
    setSetupText(t.setupSteps.join("\n"));
    setPerformance(t.performance ?? "");
    setAudienceNotes(t.audienceNotes ?? "");
    setEnabledClientIds(t.enabledClientIds);
  };

  // Seed the editable catalog fields fresh from the source campaign's analysis.
  const seedMetaFromSource = (id: string) => {
    const a = analyzeSource(id);
    setName(a.name);
    setDescription("");
    setCategory("retention");
    setSetupText(a.setupSteps.join("\n"));
    setPerformance("");
    setAudienceNotes("");
    setEnabledClientIds(TEMPLATE_CLIENTS.map((c) => c.id));
  };

  // Seed on source selection. If the source is already a template (or we're
  // editing one), default to versioning it; otherwise start a new template.
  const seedFromSource = (id: string) => {
    setSource(id);
    const matched = editTemplate ?? getTemplates().find((t) => t.sourceCampaignId === id);
    if (matched) {
      setPublishMode("existing");
      setTargetTemplateId(matched.id);
      seedMetaFromTemplate(matched);
    } else {
      setPublishMode("new");
      setTargetTemplateId("");
      seedMetaFromSource(id);
    }
  };

  // Destination-step handlers.
  const chooseNew = () => {
    setPublishMode("new");
    setTargetTemplateId("");
    if (source) seedMetaFromSource(source);
  };
  const chooseExisting = () => setPublishMode("existing");
  const pickTarget = (id: string) => {
    setTargetTemplateId(id);
    const t = publishedTemplates.find((x) => x.id === id);
    if (t) seedMetaFromTemplate(t);
  };

  // Fixed-source entry (opened from a campaign row or the edit action): seed the
  // metadata as the dialog opens so the details step isn't blank if the user skips ahead.
  useEffect(() => {
    if (open && fixedSource) seedFromSource(fixedSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedSource, editTemplate?.id]);

  const republishing = editMode || publishMode === "existing";

  // Step model. Edit mode is deliberately short (edit details → pick clients →
  // publish a new version); the full publish flow scrubs, chooses a destination
  // (new vs. existing template), then gates clients.
  const steps = useMemo(
    () =>
      editMode
        ? (["details", "clients"] as const)
        : ([
            ...(needsSourcePick ? (["pick"] as const) : []),
            "scrub",
            "target",
            "clients",
            "details",
          ] as const),
    [editMode, needsSourcePick],
  );
  const step = steps[Math.min(stepIndex, steps.length - 1)] as
    | "pick" | "scrub" | "target" | "clients" | "details";
  const isLast = stepIndex >= steps.length - 1;

  const reset = () => {
    setStepIndex(0);
    setSource(fixedSource ?? "");
    setName(""); setDescription(""); setCategory("retention");
    setSetupText(""); setPerformance(""); setAudienceNotes("");
    setEnabledClientIds([]); setNameTouched(false);
    setPublishMode("new"); setTargetTemplateId("");
  };

  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const canAdvance =
    step === "pick" ? !!source :
    step === "target" ? (publishMode === "new" || !!targetTemplateId) :
    step === "clients" ? enabledClientIds.length > 0 :
    step === "details" ? name.trim().length > 0 :
    true;

  const next = () => {
    if (step === "pick" && source) seedFromSource(source);
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  };
  const back = () => setStepIndex((i) => Math.max(0, i - 1));

  const submit = () => {
    if (!source || !name.trim() || enabledClientIds.length === 0) { setNameTouched(true); return; }
    const setupSteps = setupText.split("\n").map((s) => s.trim()).filter(Boolean);
    const versionTarget = editMode
      ? editTemplate!.id
      : publishMode === "existing"
        ? targetTemplateId
        : undefined;
    const tpl = publishTemplate({
      sourceCampaignId: source,
      name: name.trim(),
      description: description.trim(),
      category,
      setupSteps,
      performance: performance.trim() || undefined,
      audienceNotes: audienceNotes.trim() || undefined,
      enabledClientIds,
      targetTemplateId: versionTarget,
    });
    toast.success(republishing ? `Published version ${tpl.version}` : "Template published", {
      description: `${tpl.name} is now enabled for ${enabledClientIds.length} client${enabledClientIds.length > 1 ? "s" : ""}.`,
    });
    close(false);
    navigate({ to: "/campaigns/templates/$id", params: { id: tpl.id } });
  };

  // Numbered progress dots for the active step set.
  const stepMeta: Record<string, { label: string }> = {
    pick: { label: "Source" },
    scrub: { label: "Scrub" },
    target: { label: "Template" },
    clients: { label: "Clients" },
    details: { label: "Details" },
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Rocket className="h-4 w-4" />
            </span>
            {editMode ? "Edit template" : republishing ? "Re-publish template" : "Publish as template"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {editMode
              ? "Edit the catalog details and enabled clients, then publish a new version. Existing copies keep running."
              : republishing
                ? "This source is already in the catalog. Publishing mints a new version — existing copies keep running."
                : "Strip tenant-bound resources, choose which clients can use it, then add catalog details so they can copy and launch."}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-1.5">
          {steps.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div key={s} className="flex flex-1 items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    active ? "bg-foreground text-background"
                      : done ? "bg-success/15 text-success"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className={cn("text-[11px]", active ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {stepMeta[s].label}
                </span>
                {i < steps.length - 1 && <span className="h-px flex-1 bg-border" />}
              </div>
            );
          })}
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1 pr-1">
          {step === "pick" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Source campaign <span className="text-destructive">*</span></Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Choose a campaign to publish" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXAMPLE_CAMPAIGN_NAMES.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Its flow, branching, copy and audience schema are kept; only tenant-specific bindings are stripped.
                </p>
              </div>
            </div>
          )}

          {step === "scrub" && analysis && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 p-3">
                <Scissors className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  These bindings point at this workspace's resources, so they'll be emptied. Every other tenant
                  binds their own on copy — the flow structure, message copy and audience schema stay intact.
                </p>
              </div>
              {analysis.scrubItems.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
                  Nothing to strip — this campaign has no tenant-bound bindings set.
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                  {analysis.scrubItems.map((item, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]">
                      <div className="min-w-0">
                        <span className="font-medium">{item.field}</span>
                        <span className="ml-1.5 text-muted-foreground">on {item.nodeLabel}</span>
                      </div>
                      <span className="max-w-[45%] shrink-0 truncate rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground line-through">
                        {item.had}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {step === "target" && (
            <div className="space-y-3">
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Add this to the catalog as a brand-new template, or publish it as a new version of one
                that's already there.
              </p>
              <div className="space-y-2">
                {(
                  [
                    { mode: "new", icon: Plus, title: "Publish as a new template",
                      note: "Creates a new catalog entry starting at version 1.", onSelect: chooseNew },
                    { mode: "existing", icon: Layers, title: "Update an existing template",
                      note: "Publishes as a new version — its enabled clients are inherited automatically.", onSelect: chooseExisting },
                  ] as const
                ).map(({ mode, icon: Icon, title, note, onSelect }) => {
                  const on = publishMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={onSelect}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors",
                        on ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                          on ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-medium">{title}</span>
                        <span className="block text-[11px] text-muted-foreground">{note}</span>
                      </span>
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          on ? "border-primary" : "border-border",
                        )}
                      >
                        {on && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {publishMode === "existing" && (
                <div className="space-y-1.5 pl-1">
                  <Label className="text-xs">Template to version <span className="text-destructive">*</span></Label>
                  <Select value={targetTemplateId} onValueChange={pickTarget}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Choose a template to publish onto" />
                    </SelectTrigger>
                    <SelectContent>
                      {publishedTemplates.length === 0 ? (
                        <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                          No published templates yet.
                        </div>
                      ) : (
                        publishedTemplates.map((t) => (
                          <SelectItem key={t.id} value={t.id} className="text-xs">
                            {t.name} · v{t.version} · {CATEGORY_LABEL[t.category]}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {targetTemplate ? (
                    <p className="text-[11px] text-muted-foreground">
                      Publishes as v{targetTemplate.version + 1}. {targetTemplate.enabledClientIds.length} client
                      {targetTemplate.enabledClientIds.length > 1 ? "s" : ""} pre-selected on the next step.
                    </p>
                  ) : (
                    <p className="text-[11px] text-destructive">Pick the template to publish this version onto.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === "clients" && (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    Choose which client accounts can see and copy this template. Only the selected clients
                    will find it in their create-campaign flow.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEnabledClientIds(
                      enabledClientIds.length === TEMPLATE_CLIENTS.length ? [] : TEMPLATE_CLIENTS.map((c) => c.id),
                    )
                  }
                  className="shrink-0 whitespace-nowrap text-[11px] font-medium text-primary hover:underline"
                >
                  {enabledClientIds.length === TEMPLATE_CLIENTS.length ? "Clear all" : "Select all"}
                </button>
              </div>

              <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {TEMPLATE_CLIENTS.map((c) => {
                  const on = enabledClientIds.includes(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => toggleClient(c.id)}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[12.5px] transition-colors hover:bg-accent/50"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                            on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                          )}
                        >
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{c.id}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {enabledClientIds.length === 0 ? (
                <p className="text-[11px] text-destructive">Select at least one client to enable this template for.</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Enabled for {enabledClientIds.length} of {TEMPLATE_CLIENTS.length} clients.
                </p>
              )}
            </div>
          )}

          {step === "details" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name" className="text-xs">Template name <span className="text-destructive">*</span></Label>
                <Input
                  id="tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  placeholder="e.g. Lapsed Customer Win-back"
                  className="h-9 text-sm"
                />
                {nameTouched && !name.trim() && (
                  <p className="text-[11px] text-destructive">A template name is required.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_CATEGORIES.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-perf" className="text-xs">Performance note</Label>
                  <Input
                    id="tpl-perf"
                    value={performance}
                    onChange={(e) => setPerformance(e.target.value)}
                    placeholder="e.g. 34% redemption uplift"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tpl-desc" className="text-xs">Description</Label>
                <Textarea
                  id="tpl-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this journey does and when to reach for it…"
                  rows={3}
                  className="resize-none text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tpl-setup" className="flex items-center gap-1.5 text-xs">
                  <Wand2 className="h-3 w-3 text-muted-foreground" /> Setup checklist
                  <span className="text-muted-foreground">· one per line</span>
                </Label>
                <Textarea
                  id="tpl-setup"
                  value={setupText}
                  onChange={(e) => setSetupText(e.target.value)}
                  rows={4}
                  className="resize-none font-mono text-[12px]"
                />
                <p className="text-[11px] text-muted-foreground">
                  Pre-filled from the stripped fields — edit to guide the tenant through binding their resources.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tpl-aud" className="text-xs">Audience notes</Label>
                <Input
                  id="tpl-aud"
                  value={audienceNotes}
                  onChange={(e) => setAudienceNotes(e.target.value)}
                  placeholder="e.g. Best for 5k–50k members with a points balance"
                  className="h-9 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {stepIndex > 0 && (
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={back}>
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => close(false)}>Cancel</Button>
            {isLast ? (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={!name.trim() || enabledClientIds.length === 0}
                onClick={submit}
              >
                <Rocket className="h-3.5 w-3.5" />
                {republishing ? "Publish new version" : "Publish template"}
              </Button>
            ) : (
              <Button size="sm" className="h-8 gap-1 text-xs" disabled={!canAdvance} onClick={next}>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
