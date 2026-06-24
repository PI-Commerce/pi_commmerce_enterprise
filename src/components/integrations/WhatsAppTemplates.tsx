import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, Type as TypeIcon, Image as ImageIcon, Video, FileText,
  Smile, X, Trash2, Pencil, UploadCloud, Phone, Reply, Workflow, ExternalLink, Check,
  Signal, Wifi, BatteryFull, ChevronLeft, ChevronRight, AlertCircle,
  Bold, Italic, Strikethrough, Code, Info, List, ArrowUp, ArrowDown, ChevronDown, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ConnectedWaba } from "@/lib/waba-onboarding";
import { useRegion } from "@/lib/region";
import {
  SEED_TEMPLATES, TEMPLATE_CATEGORIES, TEMPLATE_BUTTON_TYPES, BUTTON_TYPE_LABELS,
  MEDIA_HINTS, languageLabel, fillVariables, variableCount,
  MAX_TEMPLATE_BUTTONS, cappedButtonTypes, buttonRuleErrors, buttonFieldErrors, duplicateButtonIndexes,
  bodyEdgeVariable, bodyTooManyVariables,
  TEMPLATE_LIMITS,
  type WaTemplate, type TemplateStatus, type TemplateCategory, type TemplateFormat,
  type TemplateButton, type TemplateButtonType,
} from "@/lib/waba-templates";

/** Max buttons shown inline in the WhatsApp bubble; the rest fold into
 *  "See all options" (Meta shows the first two when there are more than three). */
const INLINE_BUTTON_LIMIT = 2;

/** Meta groups buttons into two sections: call-to-action (URL / Phone / Flow)
 *  and quick reply (Custom). Reordering is scoped within a group, and the
 *  "All options" sheet lists CTAs first, then quick replies. */
function buttonGroup(type: TemplateButtonType): "cta" | "quick" {
  return type === "Quick Reply" ? "quick" : "cta";
}

/* ---------------------------------------------------------------------------
 * Authentication templates (Copy-code method only).
 *
 * Meta supports a lot here (zero-tap / one-tap / copy-code delivery, etc.) — we
 * deliberately ship only the Copy-code flow, so the form is just: an optional
 * security line, an optional code-expiry line, and a message validity period.
 * The verification-code body itself is fixed by Meta.
 * ------------------------------------------------------------------------- */
const AUTH_CODE_LINE = "{{1}} is your verification code.";
const AUTH_SECURITY_LINE = "For your security, do not share this code.";
/** Sample code shown in the live preview ({{1}} stand-in). */
const AUTH_SAMPLE_CODE = "123456";
/** Message validity (TTL) options offered for authentication templates. */
const VALIDITY_OPTIONS = ["1 minute", "2 minutes", "3 minutes", "5 minutes", "10 minutes", "15 minutes", "30 minutes"];

/** A compact emoji set for the body picker (mirrors WhatsApp's "Smileys & people"). */
const EMOJIS = [
  "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰",
  "😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥳","🤩","😏",
  "😒","😞","😔","😟","🙁","😣","😫","😩","🥺","😢","😭","😤","😠","😡","🤯","😳",
  "👍","👎","👏","🙏","💪","🎉","✅","❌","⭐","🔥","❤️","💯","📞","📅","🛒","🎁",
];

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
  const [headerParam, setHeaderParam] = useState("");
  const [body, setBody] = useState(initial?.body ?? "");
  const [params, setParams] = useState<string[]>([]);
  const [footer, setFooter] = useState(initial?.footer ?? "");
  const [buttons, setButtons] = useState<TemplateButton[]>(initial?.buttons ?? []);

  // Authentication-only content (Copy-code method). Derived from the seed body
  // when editing an existing auth template, otherwise sensible defaults.
  const isAuth = category === "Authentication";
  const [authSecurity, setAuthSecurity] = useState(
    initial?.category === "Authentication" && /do not share/i.test(initial?.body ?? ""),
  );
  const [authExpiry, setAuthExpiry] = useState(
    initial?.category === "Authentication" && /expires? in/i.test(initial?.footer ?? ""),
  );
  const [authExpiryMinutes, setAuthExpiryMinutes] = useState(10);
  const [customValidity, setCustomValidity] = useState(false);
  const [validityPeriod, setValidityPeriod] = useState("10 minutes");

  // Fixed verification body + optional security line; expiry shows as a footer.
  const authBody = `${AUTH_CODE_LINE}${authSecurity ? ` ${AUTH_SECURITY_LINE}` : ""}`;
  const authFooter = authExpiry ? `This code expires in ${authExpiryMinutes} minutes.` : "";

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const varCount = variableCount(body);
  const headerVars = variableCount(header);
  const headerHasVar = headerVars > 0;

  const addVariable = () => {
    const next = varCount + 1;
    setBody((b) => `${b}{{${next}}}`);
    setParams((p) => { const n = [...p]; n[next - 1] = n[next - 1] ?? ""; return n; });
  };

  // Header supports exactly one variable ({{1}}, scoped to the header).
  const addHeaderVariable = () => setHeader((h) => (variableCount(h) > 0 ? h : `${h}{{1}}`));

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

  // Wrap the current body selection in WhatsApp markdown (*, _, ~, ```).
  const wrapBody = (open: string, close = open) => {
    const ta = bodyRef.current;
    const s = ta?.selectionStart ?? body.length;
    const e = ta?.selectionEnd ?? body.length;
    const sel = body.slice(s, e) || "text";
    const next = (body.slice(0, s) + open + sel + close + body.slice(e)).slice(0, TEMPLATE_LIMITS.bodyMax);
    setBody(next);
    requestAnimationFrame(() => { ta?.focus(); const a = s + open.length; ta?.setSelectionRange(a, a + sel.length); });
  };
  const insertBody = (snippet: string) => {
    const ta = bodyRef.current;
    const s = ta?.selectionStart ?? body.length;
    const e = ta?.selectionEnd ?? body.length;
    const next = (body.slice(0, s) + snippet + body.slice(e)).slice(0, TEMPLATE_LIMITS.bodyMax);
    setBody(next);
    requestAnimationFrame(() => { ta?.focus(); const p = s + snippet.length; ta?.setSelectionRange(p, p); });
  };

  const addButtonOfType = (type: TemplateButtonType) =>
    setButtons((b) => (b.length >= MAX_TEMPLATE_BUTTONS
      ? b
      : [...b, { type, text: "", ...(type === "URL" ? { urlType: "Static" as const } : {}) }]));
  const setButton = (i: number, patch: Partial<TemplateButton>) =>
    setButtons((b) => b.map((btn, idx) => (idx === i ? { ...btn, ...patch } : btn)));
  const removeButton = (i: number) => setButtons((b) => b.filter((_, idx) => idx !== i));
  // Reorder within the same group only: quick replies move among themselves and
  // CTAs among themselves (swap with the nearest same-group neighbour).
  const moveButton = (i: number, dir: -1 | 1) =>
    setButtons((b) => {
      const g = buttonGroup(b[i].type);
      let j = -1;
      for (let k = i + dir; k >= 0 && k < b.length; k += dir) {
        if (buttonGroup(b[k].type) === g) { j = k; break; }
      }
      if (j === -1) return b;
      const n = [...b]; [n[i], n[j]] = [n[j], n[i]]; return n;
    });
  const canMove = (i: number, dir: -1 | 1) => {
    const g = buttonGroup(buttons[i].type);
    for (let k = i + dir; k >= 0 && k < buttons.length; k += dir) {
      if (buttonGroup(buttons[k].type) === g) return true;
    }
    return false;
  };
  const dupButtons = duplicateButtonIndexes(buttons);
  const capped = cappedButtonTypes(buttons);
  // Meta renders buttons in two sections: call-to-action (URL / Phone) and quick
  // reply (Custom). Keep the global index so move / edit handlers stay correct.
  const ctaIdxs = buttons.map((_, i) => i).filter((i) => buttonGroup(buttons[i].type) === "cta");
  const quickIdxs = buttons.map((_, i) => i).filter((i) => buttonGroup(buttons[i].type) === "quick");

  // Errors are revealed once the user attempts to submit, then update live.
  const [showErrors, setShowErrors] = useState(false);

  const footerVars = variableCount(footer);
  // Require a sample for every variable, however it was created (so a {{n}}
  // typed straight into the body still needs an example value).
  const missingBodySample = Array.from({ length: varCount }, (_, i) => params[i]).some((p) => !p?.trim());
  const missingHeaderSample = headerHasVar && !headerParam.trim();

  const errors: {
    category?: string; language?: string; name?: string;
    header?: string; body?: string; footer?: string; variables?: string;
  } = {};
  if (!category) errors.category = "Select a category.";
  if (!language) errors.language = "Select a language.";
  if (!name.trim()) errors.name = "Template name is required.";
  else if (name.length > TEMPLATE_LIMITS.nameMax) errors.name = `Name must be ${TEMPLATE_LIMITS.nameMax} characters or fewer.`;
  // Authentication uses a fixed verification body + Copy-code button, so the
  // header/body/footer/variable/button checks below don't apply.
  if (!isAuth) {
    if (format !== "TEXT" && !mediaName) errors.header = "Upload a media file for the header.";
    else if (format === "TEXT" && headerVars > TEMPLATE_LIMITS.headerVarsMax) errors.header = "Header allows at most one variable.";
    if (!body.trim()) errors.body = "Body is required.";
    else if (bodyEdgeVariable(body)) errors.body = "Variables can't be at the start or end of the template.";
    else if (bodyTooManyVariables(body)) errors.body = "This template has too many variables for its length. Add more text or remove a variable.";
    else if (varCount > TEMPLATE_LIMITS.bodyVarsMax) errors.body = `Body allows at most ${TEMPLATE_LIMITS.bodyVarsMax} variables.`;
    if (footerVars > TEMPLATE_LIMITS.footerVarsMax) errors.footer = "Footer cannot contain variables.";
    if (missingBodySample || missingHeaderSample) errors.variables = "Provide a sample value for every variable.";
  }

  // Button errors = Meta caps (1 phone / 2 URL) + missing required fields + duplicate labels.
  const buttonErrors = isAuth ? [] : [...buttonRuleErrors(buttons), ...buttonFieldErrors(buttons)];
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
    format: isAuth ? "TEXT" : format,
    status,
    createdAt: initial?.createdAt ?? todayLabel(),
    header: isAuth ? undefined : (format === "TEXT" ? (header || undefined) : undefined),
    body: isAuth ? authBody : body,
    footer: isAuth ? (authFooter || undefined) : (footer || undefined),
    // Authentication ships a built-in "Copy code" button, not custom buttons.
    buttons: isAuth ? undefined : (buttons.length ? buttons.filter((b) => b.text.trim()) : undefined),
  });

  return (
    // Full-page creation surface — like the campaign / agent / tool builders, a
    // template gets its own focused webpage with a dedicated top bar. The header
    // and action footer stay frozen, the preview stays pinned, only the middle
    // form area scrolls.
    <TooltipProvider delayDuration={150}>
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

          {/* Message format — not applicable to authentication (fixed text body) */}
          {!isAuth && (
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
          )}

          {/* Authentication content — Copy-code method only (no code-delivery
              setup): an optional security line, an optional code-expiry line,
              and a message validity period. */}
          {isAuth && (
          <>
          <Card title="Content">
            <p className="mb-3 text-[12px] leading-snug text-muted-foreground">
              Authentication messages use a fixed verification-code format and the Copy code method. Choose what to include — each option updates the preview.
            </p>
            <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
              <label className="flex items-start gap-2.5 text-[13px]">
                <Checkbox checked={authSecurity} onCheckedChange={(v) => setAuthSecurity(v === true)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-foreground">Add security recommendation</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">Appends “{AUTH_SECURITY_LINE}”</span>
                </span>
              </label>
              <div className="border-t border-border/60" />
              <label className="flex items-start gap-2.5 text-[13px]">
                <Checkbox checked={authExpiry} onCheckedChange={(v) => setAuthExpiry(v === true)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-foreground">Add expiry time for the code</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">Tells the customer how long the code stays valid.</span>
                </span>
              </label>
              {authExpiry && (
                <div className="flex items-center gap-2 pl-7">
                  <span className="text-[12px] text-muted-foreground">Expires in</span>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={authExpiryMinutes}
                    onChange={(e) => setAuthExpiryMinutes(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                    className="h-8 w-20"
                  />
                  <span className="text-[12px] text-muted-foreground">minutes</span>
                </div>
              )}
            </div>
          </Card>

          <Card title="Message validity period">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-[12.5px] font-medium text-foreground">Set custom validity period for your message</span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">If the message isn’t delivered within this period, it won’t be sent to the customer.</span>
              </span>
              <Switch checked={customValidity} onCheckedChange={setCustomValidity} />
            </label>
            {customValidity && (
              <div className="mt-3">
                <FieldLabel label="Validity period">
                  <Select value={validityPeriod} onValueChange={setValidityPeriod}>
                    <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VALIDITY_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FieldLabel>
              </div>
            )}
          </Card>
          </>
          )}

          {/* Content (Marketing / Utility) */}
          {!isAuth && (
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
                    className={cn("min-h-10 resize-none text-sm", showErrors && errors.header && "border-destructive")}
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={addHeaderVariable} disabled={headerHasVar} className="h-7 gap-1 text-[11px]">
                      <Plus className="h-3 w-3" /> Add variable
                    </Button>
                    <span className="text-[11px] text-muted-foreground">{header.length}/{TEMPLATE_LIMITS.headerMax} · max 1 variable</span>
                  </div>
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
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, TEMPLATE_LIMITS.bodyMax))}
                  placeholder="Enter message body"
                  className={cn("min-h-28 resize-none pr-16 text-sm", showErrors && errors.body && "border-destructive")}
                />
                <span className="pointer-events-none absolute right-3 top-2.5 text-[11px] tabular-nums text-muted-foreground">{body.length}/{TEMPLATE_LIMITS.bodyMax}</span>
              </div>
              {/* Structural body errors (start/end variable, too many variables)
                  surface live — they're about content shape, not emptiness. */}
              {(() => {
                const live = body.trim()
                  ? bodyEdgeVariable(body)
                    ? "Variables can't be at the start or end of the template."
                    : bodyTooManyVariables(body)
                      ? "This template has too many variables for its length. Add more text or remove a variable."
                      : ""
                  : "";
                if (showErrors && errors.body) return <ErrText msg={errors.body} />;
                return live ? <ErrText msg={live} /> : null;
              })()}

              {/* Formatting toolbar (WhatsApp markdown) + Add variable */}
              <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
                <EmojiPicker onPick={insertBody} />
                <FmtBtn title="Bold (*text*)" onClick={() => wrapBody("*")}><Bold className="h-4 w-4" /></FmtBtn>
                <FmtBtn title="Italic (_text_)" onClick={() => wrapBody("_")}><Italic className="h-4 w-4" /></FmtBtn>
                <FmtBtn title="Strikethrough (~text~)" onClick={() => wrapBody("~")}><Strikethrough className="h-4 w-4" /></FmtBtn>
                <FmtBtn title="Monospace (```text```)" onClick={() => wrapBody("```")}><Code className="h-4 w-4" /></FmtBtn>
                <span className="mx-1 h-4 w-px bg-border" />
                <Button variant="ghost" size="sm" onClick={addVariable} className="h-8 gap-1 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add variable
                </Button>
                <InfoTip text="Add variables by selecting columns from your customer list. When your message has been sent, the variable will be replaced with data from the column." />
              </div>
            </div>

            {/* Variable samples */}
            {(headerHasVar || varCount > 0) && (
              <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-[12.5px] font-medium">Variable samples</p>
                <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                  Include samples of all variables in your message to help Meta review your template. Don't include any real customer information.
                </p>
                {headerHasVar && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[11.5px] font-semibold text-foreground">Header</p>
                    <SampleRow token="{{1}}" value={headerParam} onChange={setHeaderParam} invalid={showErrors && !headerParam.trim()} />
                  </div>
                )}
                {varCount > 0 && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[11.5px] font-semibold text-foreground">Body</p>
                    <div className="space-y-2">
                      {Array.from({ length: varCount }, (_, i) => (
                        <SampleRow
                          key={i}
                          token={`{{${i + 1}}}`}
                          value={params[i] ?? ""}
                          onChange={(v) => setParam(i, v)}
                          onRemove={() => removeVariable(i)}
                          invalid={showErrors && !(params[i] ?? "").trim()}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3">
              <p className="mb-2 text-[12.5px] font-medium">Footer <span className="font-normal text-muted-foreground">(Optional)</span></p>
              <Input value={footer} onChange={(e) => setFooter(e.target.value.slice(0, TEMPLATE_LIMITS.footerMax))} placeholder="Enter footer text" className="h-9" />
              <div className="mt-1 text-right text-[11px] text-muted-foreground">{footer.length}/{TEMPLATE_LIMITS.footerMax} characters · no variables</div>
              {showErrors && errors.footer && <ErrText msg={errors.footer} />}
            </div>

            {/* Buttons */}
            <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[12.5px] font-medium">Buttons <span className="font-normal text-muted-foreground">(Optional)</span></p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={buttons.length >= MAX_TEMPLATE_BUTTONS} className="h-8 gap-1.5 text-xs">
                      <Plus className="h-3.5 w-3.5" /> Add button <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {TEMPLATE_BUTTON_TYPES.map((t) => (
                      <DropdownMenuItem
                        key={t}
                        disabled={capped.has(t)}
                        onSelect={() => addButtonOfType(t)}
                        className="gap-2.5 text-[12.5px]"
                      >
                        <ButtonGlyph type={t} />
                        <span className="flex-1">{BUTTON_TYPE_LABELS[t]}</span>
                        {t === "URL" && <span className="text-[10.5px] text-muted-foreground">2 max</span>}
                        {t === "Phone Number" && <span className="text-[10.5px] text-muted-foreground">1 max</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="mb-3 text-[11px] text-muted-foreground">
                Create buttons that let customers respond to your message or take action. You can add up to {MAX_TEMPLATE_BUTTONS} buttons (max 1 call button, 2 website buttons). If you add more than three, they appear in a list under "See all options".
              </p>
              {buttons.length === 0 ? (
                <p className="py-2 text-center text-[12px] text-muted-foreground">No buttons added. Use "Add button" to create one.</p>
              ) : (
                <div className="space-y-4">
                  {ctaIdxs.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[12px] font-semibold text-foreground">Call to action <span className="font-normal text-muted-foreground">· Optional</span></p>
                      <div className="space-y-2">
                        {ctaIdxs.map((i) => (
                          <ButtonEditor
                            key={i}
                            index={i}
                            scope="cta"
                            canUp={canMove(i, -1)}
                            canDown={canMove(i, 1)}
                            button={buttons[i]}
                            capped={cappedButtonTypes(buttons, i)}
                            dialCode={dialCode}
                            duplicate={dupButtons.has(i)}
                            showErrors={showErrors}
                            onChange={(patch) => setButton(i, patch)}
                            onRemove={() => removeButton(i)}
                            onMove={(dir) => moveButton(i, dir)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {quickIdxs.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[12px] font-semibold text-foreground">Quick reply <span className="font-normal text-muted-foreground">· Optional</span></p>
                      <div className="space-y-2">
                        {quickIdxs.map((i) => (
                          <ButtonEditor
                            key={i}
                            index={i}
                            scope="quick"
                            canUp={canMove(i, -1)}
                            canDown={canMove(i, 1)}
                            button={buttons[i]}
                            capped={cappedButtonTypes(buttons, i)}
                            dialCode={dialCode}
                            duplicate={dupButtons.has(i)}
                            showErrors={showErrors}
                            onChange={(patch) => setButton(i, patch)}
                            onRemove={() => removeButton(i)}
                            onMove={(dir) => moveButton(i, dir)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
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
          )}
          </div>

          {/* Preview column */}
          <div className="lg:sticky lg:top-0 lg:self-start">
            <p className="mb-3 text-center text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
            <PhonePreview
              displayName={waba.waba.displayName}
              format={isAuth ? "TEXT" : format}
              mediaName={mediaName}
              header={isAuth ? "" : (format === "TEXT" ? fillVariables(header, [headerParam]) : "")}
              body={isAuth ? fillVariables(authBody, [AUTH_SAMPLE_CODE]) : fillVariables(body, params)}
              footer={isAuth ? authFooter : footer}
              buttons={isAuth ? [] : buttons.filter((b) => b.text.trim())}
              copyCode={isAuth}
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
    </TooltipProvider>
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

function PhonePreview({ displayName, format, mediaName, header, body, footer, buttons, copyCode }: {
  displayName: string;
  format: TemplateFormat;
  mediaName: string;
  header: string;
  body: string;
  footer: string;
  buttons: TemplateButton[];
  /** Authentication templates render a built-in "Copy code" button. */
  copyCode?: boolean;
}) {
  const [allOpen, setAllOpen] = useState(false);
  const ctaButtons = buttons.filter((b) => buttonGroup(b.type) === "cta");
  const quickButtons = buttons.filter((b) => buttonGroup(b.type) === "quick");
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
                  {body.trim() ? <FormattedText text={body} /> : <span className="text-[#8696a0]">Your message body will appear here.</span>}
                </p>
                {footer.trim() && <p className="mt-1.5 text-[11px] text-[#8696a0]">{footer}</p>}
                <p className="mt-1 text-right text-[10px] text-[#8696a0]">10:21</p>
              </div>

              {/* Authentication: a single built-in "Copy code" button. */}
              {copyCode && (
                <div className="border-t border-[#e9edef]">
                  <div className="flex items-center justify-center gap-1.5 py-2 text-[12.5px] font-medium text-[#00a5f4]">
                    <Copy className="h-3.5 w-3.5" /> Copy code
                  </div>
                </div>
              )}

              {/* Buttons — WhatsApp shows the first two inline when there are
                  more than three; the rest fold into "See all options". */}
              {!copyCode && buttons.length > 0 && (() => {
                const overflow = buttons.length > 3;
                const inline = overflow ? buttons.slice(0, INLINE_BUTTON_LIMIT) : buttons;
                return (
                  <div className="border-t border-[#e9edef]">
                    {inline.map((b, i) => (
                      <div key={i} className="flex items-center justify-center gap-1.5 border-t border-[#e9edef] py-2 text-[12.5px] font-medium text-[#00a5f4] first:border-0">
                        <ButtonGlyph type={b.type} />
                        {b.text || "Button"}
                      </div>
                    ))}
                    {overflow && (
                      <button
                        type="button"
                        onClick={() => setAllOpen(true)}
                        className="flex w-full items-center justify-center gap-1.5 border-t border-[#e9edef] py-2 text-[12.5px] font-medium text-[#00a5f4]"
                      >
                        <List className="h-3.5 w-3.5" /> See all options
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* "All options" bottom sheet — opened from "See all options". Lists every
              button grouped CTA-first, then quick replies (Meta's layout). */}
          {allOpen && (
            <div className="absolute inset-0 z-30 flex flex-col justify-end">
              <button className="absolute inset-0 bg-black/40" onClick={() => setAllOpen(false)} aria-label="Close options" />
              <div className="relative z-10 max-h-[80%] overflow-y-auto rounded-t-2xl bg-white pb-3">
                <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-black/15" />
                <div className="flex items-center gap-2 px-4 py-3">
                  <button onClick={() => setAllOpen(false)} aria-label="Close"><X className="h-4 w-4 text-[#54656f]" /></button>
                  <span className="flex-1 text-center text-[14px] font-semibold text-[#111b21]">All options</span>
                  <span className="w-4" />
                </div>
                <div className="px-2 pb-1">
                  {ctaButtons.map((b, i) => (
                    <div key={`c-${i}`} className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-[#111b21]">
                      <span className="text-[#54656f]"><ButtonGlyph type={b.type} /></span>
                      {b.text || "Button"}
                    </div>
                  ))}
                  {ctaButtons.length > 0 && quickButtons.length > 0 && <div className="my-1 border-t border-[#e9edef]" />}
                  {quickButtons.map((b, i) => (
                    <div key={`q-${i}`} className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-[#111b21]">
                      <span className="text-[#54656f]"><ButtonGlyph type={b.type} /></span>
                      {b.text || "Button"}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

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

/** A single full-width button row (Meta layout): reorder controls + a labeled
 *  set of fields that depends on the button type, plus inline field errors. */
function ButtonEditor({ index, scope, canUp, canDown, button, capped, dialCode, duplicate, showErrors, onChange, onRemove, onMove }: {
  index: number;
  scope: "cta" | "quick";
  canUp: boolean;
  canDown: boolean;
  button: TemplateButton;
  capped: Set<TemplateButtonType>;
  dialCode: string;
  duplicate: boolean;
  showErrors: boolean;
  onChange: (patch: Partial<TemplateButton>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { buttonTextMax, buttonUrlMax, buttonPhoneMax } = TEMPLATE_LIMITS;
  const textErr = showErrors ? (!button.text.trim() ? "Add button text." : duplicate ? "You can't use the same text for multiple buttons." : "") : "";
  const urlErr = showErrors && button.type === "URL" && !button.url?.trim() ? "Add a website URL." : "";
  const phoneErr = showErrors && button.type === "Phone Number" && !button.phone?.trim() ? "Enter a valid phone number." : "";
  // The type dropdown only offers types from this button's section.
  const typeOptions: TemplateButtonType[] = scope === "quick"
    ? ["Quick Reply"]
    : TEMPLATE_BUTTON_TYPES.filter((t) => buttonGroup(t) === "cta");
  // Country dial codes — default to India (+91); include the region's code.
  const dialCodeOptions = Array.from(new Set([dialCode, "+91", "+971", "+1", "+44", "+65"]));

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2.5">
        {/* Reorder — scoped within the button's group (CTA vs quick reply) */}
        <div className="flex shrink-0 flex-col gap-0.5 pt-[18px]">
          <button onClick={() => onMove(-1)} disabled={!canUp} className="grid h-5 w-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30" aria-label="Move button up"><ArrowUp className="h-3.5 w-3.5" /></button>
          <button onClick={() => onMove(1)} disabled={!canDown} className="grid h-5 w-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30" aria-label="Move button down"><ArrowDown className="h-3.5 w-3.5" /></button>
        </div>

        <div className="grid min-w-0 flex-1 gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
          <FieldLabel label={scope === "quick" ? "Type" : "Type of action"} className="min-w-0">
            <Select value={button.type} onValueChange={(v) => onChange({ type: v as TemplateButtonType, ...(v === "URL" && !button.urlType ? { urlType: "Static" } : {}) })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {typeOptions.map((t) => (
                  <SelectItem key={t} value={t} disabled={capped.has(t) && t !== button.type}>{BUTTON_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldLabel>
          <FieldLabel label="Button text" className="min-w-0">
            <CharInput value={button.text} max={buttonTextMax} onChange={(v) => onChange({ text: v })} placeholder="Button text" invalid={!!textErr} />
          </FieldLabel>

          {button.type === "URL" && (
            <>
              <FieldLabel label="URL type" className="min-w-0">
                <Select value={button.urlType ?? "Static"} onValueChange={(v) => onChange({ urlType: v as "Static" | "Dynamic" })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Static">Static</SelectItem>
                    <SelectItem value="Dynamic">Dynamic</SelectItem>
                  </SelectContent>
                </Select>
              </FieldLabel>
              <FieldLabel label="Website URL" className="min-w-0">
                <CharInput value={button.url ?? ""} max={buttonUrlMax} onChange={(v) => onChange({ url: v })} placeholder="https://www.example.com" invalid={!!urlErr} />
              </FieldLabel>
              {button.urlType === "Dynamic" && (
                <FieldLabel label="URL suffix" className="min-w-0">
                  <Input value={button.urlSuffix ?? ""} onChange={(e) => onChange({ urlSuffix: e.target.value })} placeholder="{{1}}" className="h-8 text-sm" />
                </FieldLabel>
              )}
            </>
          )}

          {button.type === "Phone Number" && (
            <>
              <FieldLabel label="Country" className="min-w-0">
                <Select value={button.dialCode ?? dialCode} onValueChange={(v) => onChange({ dialCode: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {dialCodeOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldLabel>
              <FieldLabel label="Phone number" className="min-w-0">
                <CharInput value={button.phone ?? ""} max={buttonPhoneMax} onChange={(v) => onChange({ phone: v.replace(/[^\d\s]/g, "") })} placeholder="98100 12345" invalid={!!phoneErr} />
              </FieldLabel>
            </>
          )}
        </div>

        <button onClick={onRemove} className="shrink-0 pt-[22px] text-muted-foreground transition-colors hover:text-destructive" aria-label={`Remove button ${index + 1}`}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tracking — only Visit-website (URL) buttons support conversion tracking. */}
      {button.type === "URL" && (
        <label className="mt-2 flex items-center gap-2 text-[12px] text-foreground">
          <Checkbox checked={!!button.clickTracking} onCheckedChange={(v) => onChange({ clickTracking: v === true })} />
          Track app conversions <span className="text-muted-foreground">(Marketing Messages API for WhatsApp only)</span>
          <InfoTip text="You can map an Android deep link to a marketing template URL button that loads a particular location or content within your app. This feature is only available for the Marketing Messages API for WhatsApp." />
        </label>
      )}

      {(textErr || urlErr || phoneErr) && (
        <div className="mt-1.5 space-y-0.5">
          {textErr && <ErrText msg={textErr} />}
          {urlErr && <ErrText msg={urlErr} />}
          {phoneErr && <ErrText msg={phoneErr} />}
        </div>
      )}
    </div>
  );
}

function FieldLabel({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/** Input with an inline character counter, mirroring Meta's button fields. */
function CharInput({ value, max, onChange, placeholder, invalid }: {
  value: string; max: number; onChange: (v: string) => void; placeholder?: string; invalid?: boolean;
}) {
  return (
    <div className={cn("flex h-8 items-center rounded-md border bg-transparent", invalid ? "border-destructive" : "border-input")}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
      />
      <span className="px-2 text-[10.5px] tabular-nums text-muted-foreground">{value.length}/{max}</span>
    </div>
  );
}

/** A WhatsApp-style "variable sample" row: the {{n}} token + a sample input. */
function SampleRow({ token, value, onChange, onRemove, invalid }: {
  token: string; value: string; onChange: (v: string) => void; onRemove?: () => void; invalid?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-20 shrink-0 items-center justify-center rounded-md border border-border bg-secondary font-mono text-[11.5px] text-muted-foreground">{token}</span>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter content for ${token}`}
          className={cn("h-8 flex-1 text-sm", invalid && "border-destructive")}
        />
        {onRemove && (
          <button onClick={onRemove} className="text-muted-foreground transition-colors hover:text-destructive" aria-label={`Remove ${token}`}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {invalid && <p className="mt-1 pl-[88px] text-[11px] text-destructive">Add sample text</p>}
    </div>
  );
}

/** A small toolbar button used by the body formatting controls. */
function FmtBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
      {children}
    </button>
  );
}

/** Emoji button → opens a picker; clicking an emoji inserts it at the caret
 *  (the popover stays open so several can be added in a row, like WhatsApp). */
function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title="Emoji" className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <Smile className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="mb-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Smileys &amp; people</p>
        <div className="grid grid-cols-8 gap-0.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onPick(e)}
              className="grid h-7 w-7 place-items-center rounded text-[17px] leading-none transition-colors hover:bg-accent"
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** A hover info "ⓘ" with a styled white tooltip card (matches Meta's helper text). */
function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="More information" className="grid h-5 w-5 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground">
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] border border-border bg-popover p-3 text-[12px] font-normal leading-snug text-foreground shadow-md">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/** Render WhatsApp markdown (*bold*, _italic_, ~strike~, ```mono```) in the preview. */
function FormattedText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[\s\S]+?```)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("```")) parts.push(<code key={k++} className="rounded bg-black/5 px-1 font-mono text-[12px]">{tok.slice(3, -3)}</code>);
    else if (tok.startsWith("*")) parts.push(<strong key={k++}>{tok.slice(1, -1)}</strong>);
    else if (tok.startsWith("_")) parts.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    else parts.push(<span key={k++} className="line-through">{tok.slice(1, -1)}</span>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function ErrText({ msg }: { msg: string }) {
  return (
    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-destructive">
      <AlertCircle className="h-3 w-3 shrink-0" /> {msg}
    </p>
  );
}
