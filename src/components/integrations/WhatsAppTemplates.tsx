import { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Type as TypeIcon, Image as ImageIcon, Video, FileText,
  Smile, X, Trash2, Pencil, UploadCloud, Phone, Reply, Workflow, ExternalLink, Check,
  Signal, Wifi, BatteryFull, ChevronLeft, ChevronRight, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ConnectedWaba } from "@/lib/waba-onboarding";
import { useRegion } from "@/lib/region";
import {
  SEED_TEMPLATES, TEMPLATE_CATEGORIES, TEMPLATE_BUTTON_TYPES,
  MEDIA_HINTS, languageLabel, fillVariables, variableCount,
  MAX_TEMPLATE_BUTTONS, cappedButtonTypes, buttonRuleErrors, buttonFieldErrors,
  TEMPLATE_LIMITS,
  type WaTemplate, type TemplateStatus, type TemplateCategory, type TemplateFormat,
  type TemplateButton, type TemplateButtonType,
} from "@/lib/waba-templates";

/**
 * WhatsApp → Templates tab. The Template Manager: a searchable list of message
 * templates plus a full create/edit form with a live WhatsApp phone preview.
 *
 * Structure references the Paytm ConnectPlus "Template Management" screens, but
 * everything is rebuilt in the Pi Commerce design system (our tokens, our shadcn
 * primitives) rather than Paytm's blue UI. Mock only — nothing is sent to Meta.
 */
export function WhatsAppTemplates({ waba }: { waba: ConnectedWaba }) {
  const [templates, setTemplates] = useState<WaTemplate[]>(SEED_TEMPLATES);
  const [editing, setEditing] = useState<WaTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const openCreate = () => { setEditing(null); setCreating(true); };
  const openEdit = (t: WaTemplate) => { setEditing(t); setCreating(true); };
  const close = () => { setCreating(false); setEditing(null); };

  const save = (t: WaTemplate) => {
    setTemplates((prev) => {
      const i = prev.findIndex((x) => x.id === t.id);
      if (i === -1) return [t, ...prev];
      const next = [...prev]; next[i] = t; return next;
    });
    close();
  };

  if (creating) {
    return <TemplateForm waba={waba} initial={editing} onCancel={close} onSave={save} />;
  }
  return (
    <TemplateList
      templates={templates}
      onCreate={openCreate}
      onEdit={openEdit}
      onDelete={(id) => setTemplates((prev) => prev.filter((t) => t.id !== id))}
    />
  );
}

/* ================================ List view ================================ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "11 Jun 2026" → Date (local midnight). */
function parseCreated(s: string): Date {
  const [d, mon, y] = s.split(" ");
  return new Date(Number(y), Math.max(0, MONTHS.indexOf(mon)), Number(d));
}

function TemplateList({ templates, onCreate, onEdit, onDelete }: {
  templates: WaTemplate[];
  onCreate: () => void;
  onEdit: (t: WaTemplate) => void;
  onDelete: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const startD = start ? new Date(start) : null;
    const endD = end ? new Date(end) : null;
    return templates.filter((t) => {
      if (needle && !`${t.name} ${t.id}`.toLowerCase().includes(needle)) return false;
      const created = parseCreated(t.createdAt);
      if (startD && created < startD) return false;
      if (endD && created > endD) return false;
      return true;
    });
  }, [templates, q, start, end]);

  // Reset to the first page whenever the filters change the result set.
  useEffect(() => { setPage(1); }, [q, start, end, templates.length]);

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
            placeholder="Search template name or ID…"
            className="h-9 pl-9"
          />
        </div>
        <Field label="Start date">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 w-40" />
        </Field>
        <Field label="End date">
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 w-40" />
        </Field>
        <div className="ml-auto">
          <Button size="sm" onClick={onCreate} className="h-9 gap-1.5 text-xs">
            <Plus className="h-4 w-4" /> Create New Template
          </Button>
        </div>
      </div>

      {/* Table — frozen header row, only the body rows scroll */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border">
        <div className="grid shrink-0 grid-cols-[1.4fr_1.6fr_1fr_1fr_0.9fr_auto] items-center gap-3 border-b border-border bg-secondary/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>ID</span><span>Name</span><span>Create date</span><span>Category</span><span>Status</span>
          <span className="w-16 text-right">Action</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-16 text-center text-[13px] text-muted-foreground">
            No templates match your filters.
          </div>
        ) : (
          pageRows.map((t) => (
            <button
              key={t.id}
              onClick={() => onEdit(t)}
              className="grid w-full grid-cols-[1.4fr_1.6fr_1fr_1fr_0.9fr_auto] items-center gap-3 border-b border-border px-4 py-3 text-left text-[13px] transition-colors last:border-0 hover:bg-accent/40"
            >
              <span className="truncate font-mono text-[11.5px] text-muted-foreground">{t.id}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <FormatGlyph format={t.format} />
                  <span className="truncate font-medium text-foreground">{t.name}</span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{languageLabel(t.language)}</span>
              </span>
              <span className="text-muted-foreground">{t.createdAt}</span>
              <span><CategoryTag category={t.category} /></span>
              <span><StatusTag status={t.status} /></span>
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
          ))
        )}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 pt-3">
        <p className="text-[11.5px] text-muted-foreground">
          {filtered.length === 0
            ? "No templates"
            : `Showing ${rangeStart}–${rangeEnd} of ${filtered.length} templates`}
          {" · synced from your WhatsApp Business Account"}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageSafe <= 1}
              className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="px-1 text-[11.5px] tabular-nums text-muted-foreground">Page {pageSafe} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageSafe >= totalPages}
              className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              aria-label="Next page"
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

function FormatGlyph({ format }: { format: TemplateFormat }) {
  const Icon = format === "IMAGE" ? ImageIcon : format === "VIDEO" ? Video : format === "DOCUMENT" ? FileText : TypeIcon;
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-accent text-muted-foreground">
      <Icon className="h-3 w-3" />
    </span>
  );
}

function CategoryTag({ category }: { category: TemplateCategory }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {category}
    </span>
  );
}

function StatusTag({ status }: { status: TemplateStatus }) {
  const tone =
    status === "Approved" ? "border-success/30 bg-success/10 text-success"
    : status === "Pending" ? "border-warning/30 bg-warning/10 text-warning"
    : status === "Rejected" ? "border-destructive/30 bg-destructive/10 text-destructive"
    : "border-border bg-secondary text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full",
        status === "Approved" ? "bg-success" : status === "Pending" ? "bg-warning" : status === "Rejected" ? "bg-destructive" : "bg-muted-foreground/50")} />
      {status}
    </span>
  );
}

/* =============================== Create form =============================== */

const FORMATS: { id: TemplateFormat; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "TEXT", label: "TEXT", icon: TypeIcon },
  { id: "IMAGE", label: "IMAGE", icon: ImageIcon },
  { id: "VIDEO", label: "VIDEO", icon: Video },
  { id: "DOCUMENT", label: "DOCUMENT", icon: FileText },
];

function todayLabel(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function TemplateForm({ waba, initial, onCancel, onSave }: {
  waba: ConnectedWaba;
  initial: WaTemplate | null;
  onCancel: () => void;
  onSave: (t: WaTemplate) => void;
}) {
  const { templateLanguages, dialCode } = useRegion();
  const [wabaId] = useState(waba.waba.id);
  const [category, setCategory] = useState<TemplateCategory | "">(initial?.category ?? "");
  const [language, setLanguage] = useState(initial?.language ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [format, setFormat] = useState<TemplateFormat>(initial?.format ?? "TEXT");
  const [mediaName, setMediaName] = useState("");
  const [header, setHeader] = useState(initial?.header ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [params, setParams] = useState<string[]>([]);
  const [footer, setFooter] = useState(initial?.footer ?? "");
  const [buttons, setButtons] = useState<TemplateButton[]>(initial?.buttons ?? []);

  const varCount = variableCount(body);

  const addVariable = () => {
    const next = varCount + 1;
    setBody((b) => `${b}{{${next}}}`);
    setParams((p) => { const n = [...p]; n[next - 1] = n[next - 1] ?? ""; return n; });
  };

  const setParam = (i: number, v: string) =>
    setParams((p) => { const n = [...p]; n[i] = v; return n; });

  // Remove variable {{i+1}} from the body and renumber the rest.
  const removeVariable = (i: number) => {
    const target = i + 1;
    setBody((b) =>
      b.replace(/\{\{(\d+)\}\}/g, (_m, d) => {
        const num = Number(d);
        if (num === target) return "";
        return num > target ? `{{${num - 1}}}` : `{{${num}}}`;
      }),
    );
    setParams((p) => p.filter((_, idx) => idx !== i));
  };

  const addButton = () =>
    setButtons((b) => {
      if (b.length >= MAX_TEMPLATE_BUTTONS) return b;
      // Default to the first type that isn't already at its Meta cap.
      const capped = cappedButtonTypes(b);
      const type = TEMPLATE_BUTTON_TYPES.find((t) => !capped.has(t)) ?? "Quick Reply";
      return [...b, { type, text: "" }];
    });
  const setButton = (i: number, patch: Partial<TemplateButton>) =>
    setButtons((b) => b.map((btn, idx) => (idx === i ? { ...btn, ...patch } : btn)));
  const removeButton = (i: number) => setButtons((b) => b.filter((_, idx) => idx !== i));

  // Errors are revealed once the user attempts to submit, then update live.
  const [showErrors, setShowErrors] = useState(false);

  const headerVars = variableCount(header);
  const footerVars = variableCount(footer);
  const bodyFixedText = body.replace(/\{\{\d+\}\}/g, "").trim();
  // Require a sample for every variable, however it was created (so a {{n}}
  // typed straight into the body still needs an example value).
  const missingSample = Array.from({ length: varCount }, (_, i) => params[i]).some((p) => !p?.trim());

  const errors: {
    category?: string; language?: string; name?: string;
    header?: string; body?: string; footer?: string; variables?: string;
  } = {};
  if (!category) errors.category = "Select a category.";
  if (!language) errors.language = "Select a language.";
  if (!name.trim()) errors.name = "Template name is required.";
  else if (name.length > TEMPLATE_LIMITS.nameMax) errors.name = `Name must be ${TEMPLATE_LIMITS.nameMax} characters or fewer.`;
  if (format !== "TEXT" && !mediaName) errors.header = "Upload a media file for the header.";
  else if (format === "TEXT" && headerVars > TEMPLATE_LIMITS.headerVarsMax) errors.header = "Header allows at most one variable.";
  if (!body.trim()) errors.body = "Body is required.";
  else if (varCount > 0 && !bodyFixedText) errors.body = "Body must contain text, not only variables.";
  else if (varCount > TEMPLATE_LIMITS.bodyVarsMax) errors.body = `Body allows at most ${TEMPLATE_LIMITS.bodyVarsMax} variables.`;
  if (footerVars > TEMPLATE_LIMITS.footerVarsMax) errors.footer = "Footer cannot contain variables.";
  if (varCount > 0 && missingSample) errors.variables = "Provide a sample value for every variable.";

  // Button errors = Meta caps (1 phone / 2 URL / 1 flow) + missing required fields.
  const buttonErrors = [...buttonRuleErrors(buttons), ...buttonFieldErrors(buttons)];
  const hasErrors = Object.keys(errors).length > 0 || buttonErrors.length > 0;

  const submit = () => {
    if (hasErrors) {
      setShowErrors(true);
      toast.error("Please fix the highlighted fields before submitting.");
      return;
    }
    onSave(build("Pending"));
  };

  const build = (status: TemplateStatus): WaTemplate => ({
    id: initial?.id ?? `1024${Date.now().toString().slice(-9)}`,
    name: name || "untitled_template",
    category: (category || "Utility") as TemplateCategory,
    language: language || "en_US",
    format,
    status,
    createdAt: initial?.createdAt ?? todayLabel(),
    header: format === "TEXT" ? (header || undefined) : undefined,
    body,
    footer: footer || undefined,
    buttons: buttons.length ? buttons.filter((b) => b.text.trim()) : undefined,
  });

  return (
    // Full-page creation surface — like the campaign / agent / tool builders, a
    // template gets its own focused webpage with a dedicated top bar. The header
    // and action footer stay frozen, the preview stays pinned, only the middle
    // form area scrolls.
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
        <button
          onClick={onCancel}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back to templates"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">WhatsApp Business</span>
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="truncate text-[13.5px] font-medium">{initial ? "Edit Template" : "Create Template"}</span>
      </header>

      {/* Scrollable middle */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-5">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Form column */}
          <div className="space-y-4">
          {/* Basic information */}
          <Card title="Basic Information">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="WABA ID" required>
                <Select value={wabaId} onValueChange={() => {}}>
                  <SelectTrigger><SelectValue placeholder="Select WABA ID" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={waba.waba.id}>{waba.waba.name} · {waba.waba.id}</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Category" required error={showErrors ? errors.category : undefined}>
                <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
                  <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Language" required error={showErrors ? errors.language : undefined}>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger><SelectValue placeholder="Select Language" /></SelectTrigger>
                  <SelectContent>
                    {templateLanguages.map((code) => <SelectItem key={code} value={code}>{languageLabel(code)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                label="Template Name"
                required
                hint="Only lowercase letters, numbers, and underscores"
                error={showErrors ? errors.name : undefined}
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, TEMPLATE_LIMITS.nameMax))}
                  placeholder="enter_template_name"
                  className="h-9"
                />
              </FormField>
            </div>
          </Card>

          {/* Message format */}
          <Card title="Message Format">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {FORMATS.map((f) => {
                const active = format === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-4 text-[12px] font-medium transition-colors",
                      active ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    <f.icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                    {f.label}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Content */}
          <Card title="Content">
            {/* Header */}
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="mb-2 text-[12.5px] font-medium">
                Header <span className="font-normal text-muted-foreground">(Optional)</span>
                {format !== "TEXT" && <span className="ml-1 text-destructive">*</span>}
              </p>
              {format === "TEXT" ? (
                <div>
                  <Textarea
                    value={header}
                    onChange={(e) => setHeader(e.target.value.slice(0, TEMPLATE_LIMITS.headerMax))}
                    placeholder="Enter header text"
                    className="min-h-10 resize-none text-sm"
                  />
                  <div className="mt-1 text-right text-[11px] text-muted-foreground">{header.length}/{TEMPLATE_LIMITS.headerMax} characters · max 1 variable</div>
                </div>
              ) : (
                <MediaDrop format={format} fileName={mediaName} onPick={() => setMediaName(`sample.${format === "IMAGE" ? "jpg" : format === "VIDEO" ? "mp4" : "pdf"}`)} onClear={() => setMediaName("")} />
              )}
              {showErrors && errors.header && <ErrText msg={errors.header} />}
            </div>

            {/* Body */}
            <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3">
              <p className="mb-2 text-[12.5px] font-medium">Body <span className="text-destructive">*</span></p>
              <div className="relative">
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, TEMPLATE_LIMITS.bodyMax))}
                  placeholder="Enter message body"
                  className="min-h-28 resize-none pr-9 text-sm"
                />
                <Smile className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Use {"{{1}}"}, {"{{2}}"} for variables · up to {TEMPLATE_LIMITS.bodyVarsMax}</span>
                <span>{body.length}/{TEMPLATE_LIMITS.bodyMax}</span>
              </div>
              {showErrors && errors.body && <ErrText msg={errors.body} />}

              <div className="mt-3 flex items-start justify-between gap-3 border-t border-border pt-3">
                <p className="text-[11.5px] leading-snug text-muted-foreground">
                  To help us understand what kind of message you want to send, you have the option to provide specific content examples for your template.
                </p>
                <Button variant="outline" size="sm" onClick={addVariable} className="h-8 shrink-0 gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add Variable
                </Button>
              </div>

              {varCount > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {Array.from({ length: varCount }, (_, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        value={params[i] ?? ""}
                        onChange={(e) => setParam(i, e.target.value)}
                        placeholder={`Parameter ${i + 1}`}
                        className="h-8 w-40 text-sm"
                      />
                      <button onClick={() => removeVariable(i)} className="text-muted-foreground transition-colors hover:text-destructive" aria-label={`Remove parameter ${i + 1}`}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {showErrors && errors.variables && <ErrText msg={errors.variables} />}
            </div>

            {/* Footer */}
            <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3">
              <p className="mb-2 text-[12.5px] font-medium">Footer <span className="font-normal text-muted-foreground">(Optional)</span></p>
              <Input value={footer} onChange={(e) => setFooter(e.target.value.slice(0, TEMPLATE_LIMITS.footerMax))} placeholder="Enter footer text" className="h-9" />
              <div className="mt-1 text-right text-[11px] text-muted-foreground">{footer.length}/{TEMPLATE_LIMITS.footerMax} characters · no variables</div>
              {showErrors && errors.footer && <ErrText msg={errors.footer} />}
            </div>

            {/* Buttons */}
            <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[12.5px] font-medium">Buttons <span className="font-normal text-muted-foreground">(Optional)</span></p>
                <Button variant="outline" size="sm" onClick={addButton} disabled={buttons.length >= MAX_TEMPLATE_BUTTONS} className="h-8 gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add Button
                </Button>
              </div>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Meta allows up to {MAX_TEMPLATE_BUTTONS} buttons — at most 1 phone number, 2 URLs and 1 flow.
              </p>
              {buttons.length === 0 ? (
                <p className="py-2 text-center text-[12px] text-muted-foreground">No buttons added. Click Add Button to add one.</p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {buttons.map((btn, i) => (
                    <ButtonEditor
                      key={i}
                      index={i}
                      button={btn}
                      capped={cappedButtonTypes(buttons, i)}
                      dialCode={dialCode}
                      onChange={(patch) => setButton(i, patch)}
                      onRemove={() => removeButton(i)}
                    />
                  ))}
                </div>
              )}
              {showErrors && buttonErrors.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {buttonErrors.map((e) => (
                    <li key={e} className="flex items-center gap-1.5 text-[11px] text-destructive"><AlertCircle className="h-3 w-3 shrink-0" /> {e}</li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
          </div>

          {/* Preview column */}
          <div className="lg:sticky lg:top-0 lg:self-start">
            <p className="mb-3 text-center text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
            <PhonePreview
              displayName={waba.waba.displayName}
              format={format}
              mediaName={mediaName}
              header={format === "TEXT" ? header : ""}
              body={fillVariables(body, params)}
              footer={footer}
              buttons={buttons.filter((b) => b.text.trim())}
            />
          </div>
        </div>
      </div>

      {/* Fixed action footer */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-background px-8 py-3">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-9 text-xs">Cancel</Button>
        <Button variant="outline" size="sm" onClick={() => onSave(build("Draft"))} disabled={!name} className="h-9 text-xs">Save as Draft</Button>
        <Button size="sm" onClick={submit} className="h-9 text-xs">Submit Template</Button>
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

function MediaDrop({ format, fileName, onPick, onClear }: {
  format: Exclude<TemplateFormat, "TEXT"> | TemplateFormat; fileName: string; onPick: () => void; onClear: () => void;
}) {
  const hint = MEDIA_HINTS[format as Exclude<TemplateFormat, "TEXT">];
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center">
      {fileName ? (
        <div className="flex items-center justify-center gap-2 text-[13px]">
          <Check className="h-4 w-4 text-success" />
          <span className="font-medium">{fileName}</span>
          <button onClick={onClear} className="text-muted-foreground hover:text-destructive" aria-label="Remove file"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <>
          <UploadCloud className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-[13px]">
            Drop {hint?.verb} here or <button onClick={onPick} className="font-medium text-primary hover:underline">Browse</button>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">{hint?.accept}</p>
        </>
      )}
    </div>
  );
}

/* ============================== Phone preview ============================== */

function PhonePreview({ displayName, format, mediaName, header, body, footer, buttons }: {
  displayName: string;
  format: TemplateFormat;
  mediaName: string;
  header: string;
  body: string;
  footer: string;
  buttons: TemplateButton[];
}) {
  return (
    <div className="mx-auto w-[280px]">
      {/* iPhone frame */}
      <div className="relative rounded-[2.8rem] bg-[#0c0c0d] p-[10px] shadow-2xl ring-1 ring-black/10">
        {/* Dynamic Island */}
        <div className="absolute left-1/2 top-[18px] z-20 h-[22px] w-[80px] -translate-x-1/2 rounded-full bg-black" />

        {/* Screen */}
        <div className="relative flex h-[560px] flex-col overflow-hidden rounded-[2.3rem] bg-[#e5ddd5]">
          {/* WhatsApp green header */}
          <div className="shrink-0 bg-[#075e54] text-white">
            {/* iOS status bar */}
            <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold">
              <span>9:41</span>
              <span className="flex items-center gap-1.5">
                <Signal className="h-3 w-3" />
                <Wifi className="h-3 w-3" />
                <BatteryFull className="h-3.5 w-3.5" />
              </span>
            </div>
            {/* Chat header */}
            <div className="flex items-center gap-2 px-2.5 pb-2">
              <ChevronLeft className="h-5 w-5 shrink-0 text-white/90" />
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20 text-[12px] font-semibold">
                {displayName.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold leading-tight">{displayName}</p>
                <p className="text-[10px] text-white/70">business account</p>
              </div>
              <Video className="h-4 w-4 shrink-0 text-white/90" />
              <Phone className="h-4 w-4 shrink-0 text-white/90" />
            </div>
          </div>

          {/* Chat area */}
          <div className="flex-1 overflow-y-auto px-3 py-3" style={{ backgroundImage: "radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)", backgroundSize: "14px 14px" }}>
            <div className="mr-auto max-w-[85%] overflow-hidden rounded-lg rounded-tl-none bg-white shadow-sm">
              {/* Media header */}
              {format !== "TEXT" && (
                <div className="grid h-32 place-items-center bg-[#cfd8dc] text-[#5b6b73]">
                  {format === "IMAGE" && <ImageIcon className="h-8 w-8" />}
                  {format === "VIDEO" && <Video className="h-8 w-8" />}
                  {format === "DOCUMENT" && (
                    <div className="flex flex-col items-center gap-1">
                      <FileText className="h-8 w-8" />
                      <span className="text-[10px]">{mediaName || "document.pdf"}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="px-2.5 py-2">
                {format === "TEXT" && header.trim() && (
                  <p className="mb-1 text-[13px] font-semibold leading-snug text-[#111b21]">{header}</p>
                )}
                <p className="whitespace-pre-wrap break-words text-[13px] leading-snug text-[#111b21]">
                  {body.trim() || <span className="text-[#8696a0]">Your message body will appear here.</span>}
                </p>
                {footer.trim() && <p className="mt-1.5 text-[11px] text-[#8696a0]">{footer}</p>}
                <p className="mt-1 text-right text-[10px] text-[#8696a0]">10:21</p>
              </div>

              {/* Buttons */}
              {buttons.length > 0 && (
                <div className="border-t border-[#e9edef]">
                  {buttons.map((b, i) => (
                    <div key={i} className="flex items-center justify-center gap-1.5 border-t border-[#e9edef] py-2 text-[12.5px] font-medium text-[#00a5f4] first:border-0">
                      <ButtonGlyph type={b.type} />
                      {b.text || "Button"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Home indicator */}
          <div className="pointer-events-none absolute bottom-1.5 left-1/2 z-20 h-1 w-24 -translate-x-1/2 rounded-full bg-black/25" />
        </div>
      </div>
    </div>
  );
}

function ButtonGlyph({ type }: { type: TemplateButtonType }) {
  const Icon = type === "URL" ? ExternalLink : type === "Phone Number" ? Phone : type === "Link Flow" ? Workflow : Reply;
  return <Icon className="h-3.5 w-3.5" />;
}

/** A single button row in the Buttons section: type picker + the inputs that
 *  type requires (URL → url/suffix/tracking, Phone → number, etc.). */
function ButtonEditor({ index, button, capped, dialCode, onChange, onRemove }: {
  index: number;
  button: TemplateButton;
  capped: Set<TemplateButtonType>;
  dialCode: string;
  onChange: (patch: Partial<TemplateButton>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-medium">Button {index + 1}</p>
        <button onClick={onRemove} className="text-muted-foreground transition-colors hover:text-destructive" aria-label={`Remove button ${index + 1}`}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FieldLabel label="Type">
          <Select value={button.type} onValueChange={(v) => onChange({ type: v as TemplateButtonType })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TEMPLATE_BUTTON_TYPES.map((t) => (
                <SelectItem key={t} value={t} disabled={capped.has(t) && t !== button.type}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldLabel>
        <FieldLabel label="Button Text">
          <Input value={button.text} onChange={(e) => onChange({ text: e.target.value.slice(0, 25) })} placeholder="e.g. Track order" className="h-8 text-sm" />
        </FieldLabel>
      </div>

      {button.type === "URL" && (
        <div className="mt-2 space-y-2">
          <FieldLabel label="URL">
            <Input value={button.url ?? ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://example.com" className="h-8 text-sm" />
          </FieldLabel>
          <FieldLabel label="URL Suffix (Optional)">
            <Input value={button.urlSuffix ?? ""} onChange={(e) => onChange({ urlSuffix: e.target.value })} placeholder="Dynamic suffix" className="h-8 text-sm" />
          </FieldLabel>
          <label className="flex items-center gap-2 text-[12px] text-foreground">
            <Checkbox checked={!!button.clickTracking} onCheckedChange={(v) => onChange({ clickTracking: v === true })} />
            Enable Click Tracking
          </label>
        </div>
      )}

      {button.type === "Phone Number" && (
        <div className="mt-2">
          <FieldLabel label="Phone Number">
            <div className="flex h-8 items-center overflow-hidden rounded-md border border-input bg-transparent">
              <span className="grid h-full place-items-center border-r border-input bg-muted/50 px-2 text-[12px] font-medium text-muted-foreground">{dialCode}</span>
              <input
                value={button.phone ?? ""}
                onChange={(e) => onChange({ phone: e.target.value.replace(/[^\d\s]/g, "") })}
                placeholder="98100 12345"
                className="h-full flex-1 bg-transparent px-2 text-sm outline-none"
              />
            </div>
          </FieldLabel>
        </div>
      )}
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ErrText({ msg }: { msg: string }) {
  return (
    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-destructive">
      <AlertCircle className="h-3 w-3 shrink-0" /> {msg}
    </p>
  );
}
