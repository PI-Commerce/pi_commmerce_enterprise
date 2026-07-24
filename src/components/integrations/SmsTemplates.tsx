import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, Trash2, Pencil, ChevronLeft, ChevronRight, AlertCircle, UploadCloud,
  Download, FileSpreadsheet, Check, X, Type as TypeIcon, Languages, Zap, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { SmsChannelConfig } from "@/lib/sms-config";
import { sendersForCampaignType } from "@/lib/sms-config";
import {
  SMS_TYPES, SMS_CAMPAIGN_TYPES, SMS_BULK_HEADERS,
  smsPlaceholders, smsSegments, templateSegments, isFlashType, isUnicodeType,
  validateSmsTemplate, parseSmsBulkCsv, sampleBulkCsv, downloadCsvFile,
  todayLabel, parseSmsCreated,
  type SmsTemplate, type SmsType, type SmsCampaignType, type SmsBulkResult,
} from "@/lib/sms-templates";
import { useSmsTemplates, upsertSmsTemplate, addSmsTemplates, removeSmsTemplate } from "@/lib/sms-store";

/**
 * SMS → Templates tab. The DLT Template Registry: a searchable list of the
 * client's DLT-approved templates, a create/edit form, and a bulk CSV import.
 *
 * Structurally a sibling of {@link file://./WhatsAppTemplates.tsx}, with two
 * deliberate differences that follow from DLT:
 *  - **no approval status.** Entries here are copies of templates already
 *    approved on the client's DLT panel, and there is no API to re-verify them,
 *    so every row is treated as active. No status column, no draft state, no
 *    "Submit for review".
 *  - **bulk import.** Clients register templates on DLT in batches, so the
 *    registry accepts a CSV whose columns mirror the single-template form.
 *
 * Mock only — nothing is submitted to DLT or to the SMS vendor.
 */
export function SmsTemplates({ config }: { config: SmsChannelConfig }) {
  const templates = useSmsTemplates();
  const [editing, setEditing] = useState<SmsTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const close = () => { setCreating(false); setEditing(null); };

  const save = (t: SmsTemplate) => {
    upsertSmsTemplate(t);
    toast.success(editing ? `Template ${t.name} updated` : `Template ${t.name} added to the registry`);
    close();
  };

  if (creating) {
    return (
      <SmsTemplateForm
        config={config}
        initial={editing}
        existing={templates}
        onCancel={close}
        onSave={save}
      />
    );
  }

  return (
    <>
      <SmsTemplateList
        templates={templates}
        onCreate={() => { setEditing(null); setCreating(true); }}
        onEdit={(t) => { setEditing(t); setCreating(true); }}
        onDelete={(id) => {
          removeSmsTemplate(id);
          toast.success("Template removed from the registry");
        }}
        onBulk={() => setBulkOpen(true)}
      />
      <BulkImportDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        existing={templates}
        onImport={(rows) => {
          addSmsTemplates(rows);
          toast.success(`Imported ${rows.length} template${rows.length === 1 ? "" : "s"}`);
          setBulkOpen(false);
        }}
      />
    </>
  );
}

/* ================================ List view ================================ */

const GRID = "grid-cols-[1.5fr_1.7fr_1fr_1fr_0.9fr_0.7fr_auto]";

function SmsTemplateList({ templates, onCreate, onEdit, onDelete, onBulk }: {
  templates: SmsTemplate[];
  onCreate: () => void;
  onEdit: (t: SmsTemplate) => void;
  onDelete: (id: string) => void;
  onBulk: () => void;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<SmsCampaignType | "all">("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const startD = start ? new Date(start) : null;
    const endD = end ? new Date(end) : null;
    return templates.filter((t) => {
      if (needle && !`${t.name} ${t.id} ${t.senderId}`.toLowerCase().includes(needle)) return false;
      if (type !== "all" && t.campaignType !== type) return false;
      const created = parseSmsCreated(t.createdAt);
      if (startD && created < startD) return false;
      if (endD && created > endD) return false;
      return true;
    });
  }, [templates, q, type, start, end]);

  useEffect(() => { setPage(1); }, [q, type, start, end, templates.length]);

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
              placeholder="Search template name, ID or sender…"
              className="h-9 pl-9"
            />
          </div>
          <Field label="Campaign type">
            <Select value={type} onValueChange={(v) => setType(v as SmsCampaignType | "all")}>
              <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {SMS_CAMPAIGN_TYPES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Start date">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 w-40" />
          </Field>
          <Field label="End date">
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 w-40" />
          </Field>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onBulk} className="h-9 gap-1.5 text-xs">
              <UploadCloud className="h-4 w-4" /> Bulk Upload
            </Button>
            <Button size="sm" onClick={onCreate} className="h-9 gap-1.5 text-xs">
              <Plus className="h-4 w-4" /> Add Template
            </Button>
          </div>
        </div>

        {/* Table — frozen header row, only the body rows scroll */}
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border">
          <div className={cn("grid shrink-0 items-center gap-3 border-b border-border bg-secondary/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", GRID)}>
            <span>Template ID</span><span>Name</span><span>Campaign type</span>
            <span>Sender ID</span><span>Create date</span><span className="text-right">Segments</span>
            <span className="w-16 text-right">Action</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-16 text-center text-[13px] text-muted-foreground">
                {templates.length === 0
                  ? "No templates yet. Add one, or bulk upload your DLT-registered templates."
                  : "No templates match your filters."}
              </div>
            ) : (
              pageRows.map((t) => {
                const seg = templateSegments(t);
                return (
                  <button
                    key={t.id}
                    onClick={() => onEdit(t)}
                    className={cn("grid w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-[13px] transition-colors last:border-0 hover:bg-accent/40", GRID)}
                  >
                    <span className="truncate font-mono text-[11.5px] text-muted-foreground">{t.id}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <SmsTypeGlyph type={t.smsType} />
                        <span className="truncate font-medium text-foreground">{t.name}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{t.content}</span>
                    </span>
                    <span><CampaignTag type={t.campaignType} /></span>
                    <span className="font-mono text-[12px] text-muted-foreground">{t.senderId}</span>
                    <span className="text-muted-foreground">{t.createdAt}</span>
                    <span className="text-right font-mono text-[12px] text-muted-foreground" title={`${seg.encoding} · up to ${seg.segments} SMS per recipient`}>
                      {seg.segments}
                    </span>
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
            {" · mirrored from your DLT panel"}
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

function SmsTypeGlyph({ type }: { type: SmsType }) {
  const Icon = isFlashType(type) ? Zap : isUnicodeType(type) ? Languages : TypeIcon;
  return (
    <span
      className="grid h-5 w-5 shrink-0 place-items-center rounded bg-accent text-muted-foreground"
      title={type}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}

function CampaignTag({ type }: { type: SmsCampaignType }) {
  const tone =
    type === "Transactional" ? "border-ai/30 bg-ai/10 text-ai"
    : type === "OTP" ? "border-warning/30 bg-warning/10 text-warning"
    : "border-border bg-secondary text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", tone)}>
      {type}
    </span>
  );
}

/* =============================== Create form =============================== */

function SmsTemplateForm({ config, initial, existing, onCancel, onSave }: {
  config: SmsChannelConfig;
  initial: SmsTemplate | null;
  existing: SmsTemplate[];
  onCancel: () => void;
  onSave: (t: SmsTemplate) => void;
}) {
  const [smsType, setSmsType] = useState<SmsType>(initial?.smsType ?? "Text");
  const [peId, setPeId] = useState(initial?.peId ?? config.principalEntity.id);
  const [campaignType, setCampaignType] = useState<SmsCampaignType | "">(initial?.campaignType ?? "");
  const [senderId, setSenderId] = useState(initial?.senderId ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [id, setId] = useState(initial?.id ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [showErrors, setShowErrors] = useState(false);

  // Sender IDs are approved per use case on DLT, so the picker narrows once a
  // campaign type is chosen. A sender that loses its approval for the newly
  // selected type is cleared rather than silently kept.
  const senders = campaignType ? sendersForCampaignType(config, campaignType) : config.senderIds;
  useEffect(() => {
    if (senderId && !senders.some((s) => s.id === senderId)) setSenderId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignType]);

  const draft: Partial<SmsTemplate> = { smsType, peId, campaignType: campaignType || undefined, senderId, name, id, content };
  const errorList = validateSmsTemplate(draft, existing, initial?.id);
  // Map the shared validator's messages back onto fields so each one renders
  // inline; the validator is the single source of truth for both this form and
  // the bulk import, so the rules can't drift apart.
  const errorFor = (needle: string) => errorList.find((e) => e.toLowerCase().startsWith(needle));
  const errors = {
    smsType: errorFor("sms type"),
    peId: errorFor("pe id"),
    campaignType: errorFor("campaign type"),
    senderId: errorFor("sender id"),
    name: errorFor("template name"),
    id: errorFor("template id"),
    content: errorFor("message content"),
  };

  const vars = smsPlaceholders(content);
  const seg = smsSegments(content, smsType);
  // What the recipient will actually be billed for once variables are filled.
  const worst = content.trim() ? templateSegments({ content, smsType }) : seg;

  const submit = () => {
    if (errorList.length > 0) {
      setShowErrors(true);
      toast.error("Please fix the highlighted fields before saving.");
      return;
    }
    onSave({
      id: id.trim(),
      name: name.trim(),
      smsType,
      campaignType: campaignType as SmsCampaignType,
      peId: peId.trim(),
      senderId: senderId.trim(),
      content: content.trim(),
      createdAt: initial?.createdAt ?? todayLabel(),
    });
  };

  return (
    // Full-page surface, matching the WhatsApp template builder: frozen header
    // and action footer, pinned preview, only the form column scrolls.
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
        <button
          onClick={onCancel}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back to templates"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">SMS</span>
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="truncate text-[13.5px] font-medium">{initial ? "Edit Template" : "Add DLT Template"}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-5">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Form column */}
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-[11.5px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Enter the template exactly as approved on your DLT panel. This registry stores a copy —
                it does not submit anything to DLT, and the content must match character for character or
                the operator will reject the message.
              </span>
            </div>

            <Card title="DLT registration">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="PE ID" required error={showErrors ? errors.peId : undefined}>
                  <Select value={peId} onValueChange={setPeId}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select PE ID" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={config.principalEntity.id}>
                        {config.principalEntity.id} · {config.principalEntity.name}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Campaign Type" required error={showErrors ? errors.campaignType : undefined}>
                  <Select value={campaignType} onValueChange={(v) => setCampaignType(v as SmsCampaignType)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select Campaign Type" /></SelectTrigger>
                    <SelectContent>
                      {SMS_CAMPAIGN_TYPES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField
                  label="Sender ID"
                  required
                  hint={campaignType ? `Approved for ${campaignType} messages` : "Select a campaign type first"}
                  error={showErrors ? errors.senderId : undefined}
                >
                  <Select value={senderId} onValueChange={setSenderId} disabled={!campaignType}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select Sender ID" /></SelectTrigger>
                    <SelectContent>
                      {senders.map((s) => <SelectItem key={s.id} value={s.id}>{s.id}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="SMS Type" required error={showErrors ? errors.smsType : undefined}>
                  <Select value={smsType} onValueChange={(v) => setSmsType(v as SmsType)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SMS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
              {isFlashType(smsType) && (
                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Zap className="h-3 w-3 shrink-0" /> Class 0 (flash) messages display immediately on the handset and are not saved to the inbox.
                </p>
              )}
            </Card>

            <Card title="Template identity">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="Template Name"
                  required
                  hint="Exactly as issued by your DLT panel"
                  error={showErrors ? errors.name : undefined}
                >
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="order_confirm_txn"
                    className="h-9"
                  />
                </FormField>
                <FormField
                  label="Template ID"
                  required
                  hint="The numeric ID issued by DLT"
                  error={showErrors ? errors.id : undefined}
                >
                  <Input
                    value={id}
                    onChange={(e) => setId(e.target.value.replace(/\D/g, "").slice(0, 25))}
                    placeholder="1107168420993847112"
                    className="h-9 font-mono text-[12.5px]"
                    disabled={!!initial}
                  />
                </FormField>
              </div>
              {initial && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Template ID identifies the DLT record and can't be changed. Delete and re-add to correct it.
                </p>
              )}
            </Card>

            <Card title="Message content">
              <FormField
                label="Content"
                required
                hint="Use {{variable}} for values filled in at send time, e.g. {{name}} or {{order_id}}."
                error={showErrors ? errors.content : undefined}
              >
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Hi {{name}}, your order {{order_id}} of Rs {{amount}} is confirmed. Track: {{link}} - PICOMM"
                  className="min-h-32 resize-none text-sm"
                />
              </FormField>

              {/* Segment meter — the SMS count the campaign report bills against. */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span><span className="font-medium text-foreground">{seg.length}</span> characters</span>
                <span><span className="font-medium text-foreground">{seg.encoding}</span> encoding</span>
                <span>
                  <span className="font-medium text-foreground">{worst.segments}</span> SMS
                  {worst.segments === 1 ? "" : " segments"} when variables are filled
                </span>
                {seg.segments > 0 && <span>{seg.remaining} characters left in this segment</span>}
              </div>
              {worst.segments > 1 && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-warning">
                  <AlertCircle className="mt-px h-3 w-3 shrink-0" />
                  Each recipient is billed for {worst.segments} messages. {isUnicodeType(smsType)
                    ? "Unicode messages fit only 70 characters per segment."
                    : "Shorten the copy to stay within one 160-character segment."}
                </p>
              )}

              {vars.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                    Variables · {vars.length}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {vars.map((v) => (
                      <span key={v} className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    These become the mapping rows on the SMS node in the campaign builder.
                  </p>
                </div>
              )}
            </Card>
          </div>

          {/* Preview column */}
          <div className="lg:sticky lg:top-0 lg:self-start">
            <p className="mb-3 text-center text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
            <SmsPreview senderId={senderId} content={content} flash={isFlashType(smsType)} />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-background px-8 py-3">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-9 text-xs">Cancel</Button>
        <Button size="sm" onClick={submit} className="h-9 text-xs">
          {initial ? "Save changes" : "Add to registry"}
        </Button>
      </div>
    </div>
  );
}

/** Handset preview — an SMS thread headed by the Sender ID. */
function SmsPreview({ senderId, content, flash }: { senderId: string; content: string; flash: boolean }) {
  return (
    <div className="mx-auto w-[300px] overflow-hidden rounded-[2rem] border-[6px] border-foreground/85 bg-background shadow-xl">
      <div className="flex items-center justify-center bg-foreground/85 pb-1.5 pt-0.5">
        <div className="h-1 w-16 rounded-full bg-background/30" />
      </div>
      <div className="border-b border-border bg-card px-3 py-2 text-center">
        <p className="truncate text-[12px] font-semibold text-foreground">{senderId || "SENDER"}</p>
        <p className="text-[10px] text-muted-foreground">SMS</p>
      </div>
      <div className="min-h-[320px] bg-muted/30 px-3 py-4">
        {flash && (
          <p className="mb-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Flash · shown over the lock screen
          </p>
        )}
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-card px-3 py-2 shadow-sm">
          <p className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-foreground">
            {content || "Your message content will appear here."}
          </p>
        </div>
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

/* =============================== Bulk import =============================== */

/**
 * Bulk CSV import. The expected columns are exactly the fields of the single
 * create form, in the same order, so a client who has added one template by hand
 * already knows the shape (PICOM-4726 §3). Every row runs through the same
 * validator as the form; valid and invalid rows are reported separately and the
 * valid ones can be imported without fixing the rest.
 */
function BulkImportDialog({ open, onOpenChange, existing, onImport }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing: SmsTemplate[];
  onImport: (rows: SmsTemplate[]) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<SmsBulkResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear the previous run whenever the dialog is reopened.
  useEffect(() => {
    if (!open) { setFileName(""); setResult(null); }
  }, [open]);

  const readFile = (file: File) => {
    setFileName(file.name);
    file.text().then((text) => setResult(parseSmsBulkCsv(text, existing)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk upload templates</DialogTitle>
          <DialogDescription>
            Upload a CSV of your DLT-approved templates. Columns match the Add Template form.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Expected columns + sample */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Required columns</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SMS_BULK_HEADERS.map((h) => (
                    <span key={h} className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5 text-xs"
                onClick={() => downloadCsvFile("sms-templates-sample.csv", sampleBulkCsv())}
              >
                <Download className="h-3.5 w-3.5" /> Sample CSV
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Column order doesn't matter. Wrap message content in quotes if it contains commas.
            </p>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) readFile(f);
            }}
            className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
                // Reset so re-picking the same file fires onChange again.
                e.target.value = "";
              }}
            />
            {fileName ? (
              <div className="flex items-center justify-center gap-2 text-[13px]">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{fileName}</span>
                <button
                  onClick={() => { setFileName(""); setResult(null); }}
                  className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Clear file"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <UploadCloud className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-[13px] text-muted-foreground">Drop a CSV here, or</p>
                <Button variant="outline" size="sm" className="mt-2 h-8 text-xs" onClick={() => inputRef.current?.click()}>
                  Choose file
                </Button>
              </>
            )}
          </div>

          {/* Validation report */}
          {result?.headerError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{result.headerError}</span>
            </div>
          )}

          {result && !result.headerError && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-[12px]">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-medium text-success">
                  <Check className="h-3 w-3" /> {result.valid.length} ready to import
                </span>
                {result.invalid.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
                    <X className="h-3 w-3" /> {result.invalid.length} skipped
                  </span>
                )}
              </div>

              {result.invalid.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                  {result.invalid.map((r) => (
                    <div key={r.row} className="border-b border-border px-3 py-2 last:border-0">
                      <p className="text-[11.5px] font-medium text-foreground">Row {r.row}</p>
                      <ul className="mt-0.5 space-y-0.5">
                        {r.errors.map((e) => (
                          <li key={e} className="flex items-start gap-1.5 text-[11px] text-destructive">
                            <AlertCircle className="mt-px h-3 w-3 shrink-0" /> {e}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="h-9 text-xs">Cancel</Button>
          <Button
            size="sm"
            className="h-9 text-xs"
            disabled={!result || !!result.headerError || result.valid.length === 0}
            onClick={() => result && onImport(result.valid)}
          >
            Import {result && !result.headerError && result.valid.length > 0 ? `${result.valid.length} template${result.valid.length === 1 ? "" : "s"}` : "templates"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
