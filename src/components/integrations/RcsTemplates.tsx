import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, Trash2, Pencil, ChevronLeft, ChevronRight, AlertCircle, Info,
  Type as TypeIcon, Image as ImageIcon, X, Link2, UploadCloud, Reply, ExternalLink, Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { RcsChannelConfig } from "@/lib/rcs-config";
import { botsForCategory, botById } from "@/lib/rcs-config";
import {
  RCS_CATEGORIES, RCS_TEMPLATE_TYPES, RCS_MEDIA_HEIGHTS, RCS_CARD_ORIENTATIONS,
  RCS_BUTTON_TYPES, RCS_BUTTON_LABELS, MAX_BUTTONS,
  templatePlaceholders, fillRcsVariables, mediaAccept, mediaFormatsHint,
  validateRcsTemplate, todayLabel, parseRcsCreated,
  type RcsTemplate, type RcsTemplateType, type RcsCategory, type RcsApprovalStatus,
  type RcsButton, type RcsButtonType, type RcsMedia, type RcsMediaType,
} from "@/lib/rcs-templates";
import { useRcsTemplates, upsertRcsTemplate, removeRcsTemplate } from "@/lib/rcs-store";

/**
 * RCS → Templates tab. The RCS template registry: a searchable list plus a rich
 * create/edit form for Text and Rich-card templates.
 *
 * A sibling of {@link file://./SmsTemplates.tsx} (registry shell) and
 * {@link file://./WhatsAppTemplates.tsx} (rich form + phone preview). Unlike SMS,
 * RCS templates carry a vendor **approval status** (Netcore reviews; Jio
 * auto-approves), so the list shows a status column and only Approved templates
 * are offered to campaign nodes. No bulk import — RCS content is rich and
 * authored one at a time. Mock only.
 */
export function RcsTemplates({ config }: { config: RcsChannelConfig }) {
  const templates = useRcsTemplates();
  const [editing, setEditing] = useState<RcsTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const close = () => { setCreating(false); setEditing(null); };

  const save = (t: RcsTemplate) => {
    upsertRcsTemplate(t);
    toast.success(editing ? `Template ${t.name} updated` : `Template ${t.name} added to the registry`);
    close();
  };

  if (creating) {
    return (
      <RcsTemplateForm
        config={config}
        initial={editing}
        existing={templates}
        onCancel={close}
        onSave={save}
      />
    );
  }

  return (
    <RcsTemplateList
      config={config}
      templates={templates}
      onCreate={() => { setEditing(null); setCreating(true); }}
      onEdit={(t) => { setEditing(t); setCreating(true); }}
      onDelete={(id) => {
        removeRcsTemplate(id);
        toast.success("Template removed from the registry");
      }}
    />
  );
}

/* ================================ List view ================================ */

const GRID = "grid-cols-[1.6fr_1.2fr_1fr_0.9fr_1fr_1fr_auto]";

function RcsTemplateList({ config, templates, onCreate, onEdit, onDelete }: {
  config: RcsChannelConfig;
  templates: RcsTemplate[];
  onCreate: () => void;
  onEdit: (t: RcsTemplate) => void;
  onDelete: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<RcsCategory | "all">("all");
  const [status, setStatus] = useState<RcsApprovalStatus | "all">("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return templates.filter((t) => {
      const botName = botById(config, t.botId)?.name ?? t.botId;
      if (needle && !`${t.name} ${t.id} ${botName}`.toLowerCase().includes(needle)) return false;
      if (cat !== "all" && t.category !== cat) return false;
      if (status !== "all" && t.approvalStatus !== status) return false;
      return true;
    });
  }, [templates, q, cat, status, config]);

  useEffect(() => { setPage(1); }, [q, cat, status, templates.length]);

  const PAGE_SIZE = 8;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(pageSafe * PAGE_SIZE, filtered.length);

  return (
    <div className="flex h-full flex-col px-8 pb-6">
      <div className="flex h-full w-full flex-col">
        {/* Frozen toolbar */}
        <div className="flex shrink-0 flex-wrap items-end gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search template name, ID or bot…"
              className="h-9 pl-9"
            />
          </div>
          <Field label="Category">
            <Select value={cat} onValueChange={(v) => setCat(v as RcsCategory | "all")}>
              <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {RCS_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Approval">
            <Select value={status} onValueChange={(v) => setStatus(v as RcsApprovalStatus | "all")}>
              <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(["Approved", "Pending", "Rejected"] as RcsApprovalStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="ml-auto">
            <Button size="sm" onClick={onCreate} className="h-9 gap-1.5 text-xs">
              <Plus className="h-4 w-4" /> Add Template
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border">
          <div className={cn("grid shrink-0 items-center gap-3 border-b border-border bg-secondary/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", GRID)}>
            <span>Name</span><span>Bot</span><span>Category</span><span>Type</span>
            <span>Approval</span><span>Create date</span><span className="w-16 text-right">Action</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-16 text-center text-[13px] text-muted-foreground">
                {templates.length === 0
                  ? "No templates yet. Add your first RCS template."
                  : "No templates match your filters."}
              </div>
            ) : (
              pageRows.map((t) => {
                const bot = botById(config, t.botId);
                return (
                  <button
                    key={t.id}
                    onClick={() => onEdit(t)}
                    className={cn("grid w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-[13px] transition-colors last:border-0 hover:bg-accent/40", GRID)}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <TypeGlyph type={t.type} />
                        <span className="truncate font-medium text-foreground">{t.name}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{t.body}</span>
                    </span>
                    <span className="min-w-0 truncate text-muted-foreground">{bot?.name ?? t.botId}</span>
                    <span><CategoryTag type={t.category} /></span>
                    <span className="text-[12px] text-muted-foreground">{t.type === "TEXT" ? "Text" : "Rich card"}</span>
                    <span><StatusTag status={t.approvalStatus} /></span>
                    <span className="text-muted-foreground">{t.createdAt}</span>
                    <span className="flex w-16 items-center justify-end gap-1">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); onEdit(t); }}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 pt-3">
          <p className="text-[11.5px] text-muted-foreground">
            {filtered.length === 0
              ? "No templates"
              : `Showing ${rangeStart}–${rangeEnd} of ${filtered.length} templates`}
            {" · submitted to your RCS vendor for approval"}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
                className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <span className="px-1 text-[11.5px] tabular-nums text-muted-foreground">Page {pageSafe} of {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function TypeGlyph({ type }: { type: RcsTemplateType }) {
  const Icon = type === "RICH_CARD" ? ImageIcon : TypeIcon;
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-accent text-muted-foreground" title={type === "RICH_CARD" ? "Rich card" : "Text"}>
      <Icon className="h-3 w-3" />
    </span>
  );
}

function CategoryTag({ type }: { type: RcsCategory }) {
  const tone =
    type === "Utility" ? "border-ai/30 bg-ai/10 text-ai"
    : type === "OTP" ? "border-warning/30 bg-warning/10 text-warning"
    : "border-border bg-secondary text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", tone)}>
      {type}
    </span>
  );
}

function StatusTag({ status }: { status: RcsApprovalStatus }) {
  const tone =
    status === "Approved" ? "border-success/30 bg-success/10 text-success"
    : status === "Pending" ? "border-warning/30 bg-warning/10 text-warning"
    : "border-destructive/30 bg-destructive/10 text-destructive";
  const dot =
    status === "Approved" ? "bg-success" : status === "Pending" ? "bg-warning" : "bg-destructive";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} /> {status}
    </span>
  );
}

/* =============================== Create form =============================== */

function RcsTemplateForm({ config, initial, existing, onCancel, onSave }: {
  config: RcsChannelConfig;
  initial: RcsTemplate | null;
  existing: RcsTemplate[];
  onCancel: () => void;
  onSave: (t: RcsTemplate) => void;
}) {
  const [category, setCategory] = useState<RcsCategory | "">(initial?.category ?? "");
  const [botId, setBotId] = useState(initial?.botId ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<RcsTemplateType>(initial?.type ?? "TEXT");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [orientation, setOrientation] = useState(initial?.orientation ?? "VERTICAL");
  const [media, setMedia] = useState<RcsMedia>(
    initial?.media ?? { mediaType: "IMAGE", mediaHeight: "MEDIUM", source: "url", url: "" },
  );
  const [buttons, setButtons] = useState<RcsButton[]>(initial?.buttons ?? []);
  const [showErrors, setShowErrors] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Bot picker narrows to the chosen category. Clear a bot that no longer fits.
  const bots = category ? botsForCategory(config, category) : [];
  useEffect(() => {
    if (botId && !bots.some((b) => b.id === botId)) setBotId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const draft: Partial<RcsTemplate> = {
    id: initial?.id, name, category: category || undefined, botId, type, body,
    title: type === "RICH_CARD" ? title : undefined,
    media: type === "RICH_CARD" ? media : undefined,
    buttons,
  };
  const errorList = validateRcsTemplate(draft, existing, initial?.id);
  const errorFor = (needle: string) => errorList.find((e) => e.toLowerCase().startsWith(needle));
  const errors = {
    name: errorFor("template name"),
    category: errorFor("category"),
    botId: errorFor("bot"),
    body: errorFor("message body"),
    title: errorFor("card title"),
    media: errorList.find((e) => e.toLowerCase().includes("media")),
  };

  const vars = templatePlaceholders({ body, title });

  const setButton = (i: number, patch: Partial<RcsButton>) =>
    setButtons((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const addButton = () =>
    setButtons((prev) => (prev.length >= MAX_BUTTONS ? prev : [...prev, { type: "REPLY", text: "" }]));
  const removeButton = (i: number) => setButtons((prev) => prev.filter((_, idx) => idx !== i));

  const submit = () => {
    if (errorList.length > 0) {
      setShowErrors(true);
      toast.error("Please fix the highlighted fields before saving.");
      return;
    }
    // New templates land as Pending (submitted to vendor); edits keep their status.
    onSave({
      id: initial?.id ?? `rcs_tpl_${Date.now().toString(36)}`,
      name: name.trim(),
      botId,
      category: category as RcsCategory,
      type,
      approvalStatus: initial?.approvalStatus ?? "Pending",
      body: body.trim(),
      title: type === "RICH_CARD" ? title.trim() : undefined,
      orientation: type === "RICH_CARD" ? orientation : undefined,
      media: type === "RICH_CARD" ? media : undefined,
      buttons: buttons.filter((b) => b.text.trim()),
      createdAt: initial?.createdAt ?? todayLabel(),
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
        <button
          onClick={onCancel}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">RCS</span>
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="truncate text-[13.5px] font-medium">{initial ? "Edit Template" : "Add RCS Template"}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-5">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Form column */}
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-[11.5px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                New templates are submitted to your RCS vendor for approval (Netcore reviews; Jio auto-approves).
                Only Approved templates can be used in campaign nodes.
              </span>
            </div>

            <Card title="Bot & identity">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Category" required error={showErrors ? errors.category : undefined}>
                  <Select value={category} onValueChange={(v) => setCategory(v as RcsCategory)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select Category" /></SelectTrigger>
                    <SelectContent>
                      {RCS_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField
                  label="Bot"
                  required
                  hint={category ? "Bots registered for this category" : "Select a category first"}
                  error={showErrors ? errors.botId : undefined}
                >
                  <Select value={botId} onValueChange={setBotId} disabled={!category}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select Bot" /></SelectTrigger>
                    <SelectContent>
                      {bots.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name} · {b.vendor === "JIO" ? "JIO" : "Netcore-VI"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField
                  label="Template Name"
                  required
                  hint="A label to identify this template in Pi Commerce"
                  error={showErrors ? errors.name : undefined}
                >
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="welcome_offer_card" className="h-9" />
                </FormField>
                <FormField label="Template type" required>
                  <div className="grid grid-cols-2 gap-1.5">
                    {RCS_TEMPLATE_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setType(t.value)}
                        className={cn(
                          "flex h-9 items-center justify-center gap-1.5 rounded-md border text-[12.5px] font-medium transition-colors",
                          type === t.value ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {t.value === "RICH_CARD" ? <ImageIcon className="h-3.5 w-3.5" /> : <TypeIcon className="h-3.5 w-3.5" />}
                        {t.label}
                      </button>
                    ))}
                  </div>
                </FormField>
              </div>
            </Card>

            {/* Rich card extras */}
            {type === "RICH_CARD" && (
              <Card title="Card">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Card title" required error={showErrors ? errors.title : undefined}>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Your order is on its way" className="h-9" />
                  </FormField>
                  <FormField label="Orientation">
                    <Select value={orientation} onValueChange={(v) => setOrientation(v as typeof orientation)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RCS_CARD_ORIENTATIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>

                {/* Media */}
                <div className="mt-4">
                  <p className="mb-1.5 text-[12px] font-medium text-foreground">Media <span className="text-destructive">*</span></p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <FormField label="Type">
                      <Select value={media.mediaType} onValueChange={(v) => setMedia((m) => ({ ...m, mediaType: v as RcsMediaType }))}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="IMAGE">Image</SelectItem>
                          <SelectItem value="VIDEO">Video</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Height">
                      <Select value={media.mediaHeight} onValueChange={(v) => setMedia((m) => ({ ...m, mediaHeight: v as RcsMedia["mediaHeight"] }))}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RCS_MEDIA_HEIGHTS.map((h) => <SelectItem key={h.value} value={h.value}>{h.label} · {h.dp} DP</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormField>
                  </div>

                  {/* URL or upload */}
                  <div className="mt-2">
                    <div className="mb-1.5 inline-flex rounded-md border border-border p-0.5">
                      <button
                        type="button"
                        onClick={() => setMedia((m) => ({ ...m, source: "url" }))}
                        className={cn("flex items-center gap-1 rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors", media.source === "url" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
                      >
                        <Link2 className="h-3.5 w-3.5" /> URL
                      </button>
                      <button
                        type="button"
                        onClick={() => setMedia((m) => ({ ...m, source: "upload" }))}
                        className={cn("flex items-center gap-1 rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors", media.source === "upload" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
                      >
                        <UploadCloud className="h-3.5 w-3.5" /> Upload
                      </button>
                    </div>

                    {media.source === "url" ? (
                      <Input
                        value={media.url ?? ""}
                        onChange={(e) => setMedia((m) => ({ ...m, url: e.target.value }))}
                        placeholder="https://cdn.example.com/media.jpg"
                        className="h-9 font-mono text-[12px]"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileRef}
                          type="file"
                          accept={mediaAccept(media.mediaType)}
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) setMedia((m) => ({ ...m, fileName: f.name }));
                            e.target.value = "";
                          }}
                        />
                        {media.fileName ? (
                          <span className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px]">
                            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" /> {media.fileName}
                            <button onClick={() => setMedia((m) => ({ ...m, fileName: undefined }))} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                          </span>
                        ) : (
                          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => fileRef.current?.click()}>
                            <UploadCloud className="h-3.5 w-3.5" /> Choose file
                          </Button>
                        )}
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">{mediaFormatsHint(media.mediaType)} · card payload up to 250 KB</p>
                    {showErrors && errors.media && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive"><AlertCircle className="h-3 w-3 shrink-0" /> {errors.media}</p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Message body */}
            <Card title="Message">
              <FormField
                label={type === "RICH_CARD" ? "Card description" : "Body"}
                required
                hint="Use {{variable}} for values filled in at send time."
                error={showErrors ? errors.body : undefined}
              >
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hi {{name}}, your order {{order_id}} has shipped and arrives by {{eta}}."
                  className="min-h-24 resize-none text-sm"
                />
              </FormField>
              {vars.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Variables · {vars.length}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {vars.map((v) => (
                      <span key={v} className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{`{{${v}}}`}</span>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">These become the mapping rows on the RCS node in the campaign builder.</p>
                </div>
              )}
            </Card>

            {/* Buttons */}
            <Card title="Suggestion buttons">
              <div className="space-y-2">
                {buttons.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No buttons. Add up to {MAX_BUTTONS} — quick replies become branches on the RCS node.</p>
                )}
                {buttons.map((b, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card/40 p-3">
                    <div className="flex items-center gap-2">
                      <Select value={b.type} onValueChange={(v) => setButton(i, { type: v as RcsButtonType })}>
                        <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RCS_BUTTON_TYPES.map((t) => <SelectItem key={t} value={t}>{RCS_BUTTON_LABELS[t]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input value={b.text} onChange={(e) => setButton(i, { text: e.target.value })} placeholder="Button label" className="h-8 flex-1 text-xs" />
                      <button onClick={() => removeButton(i)} className="grid h-7 w-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remove button">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {b.type === "URL" && (
                      <Input value={b.url ?? ""} onChange={(e) => setButton(i, { url: e.target.value })} placeholder="https://…" className="mt-2 h-8 font-mono text-[11.5px]" />
                    )}
                    {b.type === "DIALER" && (
                      <Input value={b.phone ?? ""} onChange={(e) => setButton(i, { phone: e.target.value })} placeholder="+91…" className="mt-2 h-8 font-mono text-[11.5px]" />
                    )}
                    {b.type === "REPLY" && (
                      <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-muted-foreground"><Reply className="h-3 w-3" /> Becomes a branch output on the RCS node.</p>
                    )}
                  </div>
                ))}
                {buttons.length < MAX_BUTTONS && (
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={addButton}>
                    <Plus className="h-3.5 w-3.5" /> Add button
                  </Button>
                )}
              </div>
            </Card>
          </div>

          {/* Preview column */}
          <div className="lg:sticky lg:top-0 lg:self-start">
            <p className="mb-3 text-center text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
            <RcsPreview
              agentName={botById(config, botId)?.name ?? "RCS Agent"}
              type={type}
              title={title}
              body={body}
              media={media}
              buttons={buttons}
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-background px-8 py-3">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-9 text-xs">Cancel</Button>
        <Button size="sm" onClick={submit} className="h-9 text-xs">{initial ? "Save changes" : "Submit for approval"}</Button>
      </div>
    </div>
  );
}

/** Handset preview of an RCS message: agent header, card/text bubble, suggestion chips. */
function RcsPreview({ agentName, type, title, body, media, buttons }: {
  agentName: string; type: RcsTemplateType; title: string; body: string; media: RcsMedia; buttons: RcsButton[];
}) {
  const sampleVars: Record<string, string> = {};
  const filledBody = fillRcsVariables(body, sampleVars);
  const filledTitle = fillRcsVariables(title, sampleVars);
  const mediaLabel = media.source === "url" ? media.url : media.fileName;
  const heightPx = media.mediaHeight === "SHORT" ? 84 : media.mediaHeight === "TALL" ? 172 : 120;

  return (
    <div className="mx-auto w-[300px] overflow-hidden rounded-[2rem] border-[6px] border-foreground/85 bg-background shadow-xl">
      <div className="flex items-center justify-center bg-foreground/85 pb-1.5 pt-0.5">
        <div className="h-1 w-16 rounded-full bg-background/30" />
      </div>
      <div className="border-b border-border bg-card px-3 py-2 text-center">
        <p className="truncate text-[12px] font-semibold text-foreground">{agentName}</p>
        <p className="text-[10px] text-muted-foreground">RCS Business Messaging</p>
      </div>
      <div className="min-h-[340px] bg-muted/30 px-3 py-4">
        <div className="max-w-[88%] overflow-hidden rounded-2xl rounded-tl-sm bg-card shadow-sm">
          {type === "RICH_CARD" && (
            <div className="grid place-items-center bg-secondary text-muted-foreground" style={{ height: heightPx }}>
              {mediaLabel ? (
                <div className="flex flex-col items-center gap-1 px-3 text-center">
                  <ImageIcon className="h-5 w-5" />
                  <span className="line-clamp-1 text-[10px] font-mono">{mediaLabel}</span>
                </div>
              ) : (
                <ImageIcon className="h-5 w-5" />
              )}
            </div>
          )}
          <div className="px-3 py-2.5">
            {type === "RICH_CARD" && filledTitle && <p className="mb-1 text-[12.5px] font-semibold text-foreground">{filledTitle}</p>}
            <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground">
              {filledBody || "Your message content will appear here."}
            </p>
          </div>
        </div>
        {/* Suggestion chips */}
        {buttons.filter((b) => b.text.trim()).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {buttons.filter((b) => b.text.trim()).map((b, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground">
                {b.type === "URL" ? <ExternalLink className="h-3 w-3" /> : b.type === "DIALER" ? <Phone className="h-3 w-3" /> : <Reply className="h-3 w-3" />}
                {b.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-[14px] font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function FormField({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive"><AlertCircle className="h-3 w-3 shrink-0" /> {error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
