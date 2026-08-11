import { useEffect, useState } from "react";
import {
  X,
  Copy,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Plus,
  UploadCloud,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type {
  FreeformNodeConfig,
  FreeformNodeKind,
  ButtonsBlock,
} from "@/lib/freeform-types";
import {
  FREEFORM_NODE_LABELS,
  META_LIMITS,
  validateFreeformNode,
} from "@/lib/freeform-types";
import type { FreeformNodeData } from "./FreeformNodes";

/**
 * Freeform config panel. Layout mirrors the campaign builder's ConfigPanel:
 *
 *  - Header: NODE_KIND label (small, uppercase) + node title (bold).
 *  - Validation banner: green when valid, red with the current error otherwise.
 *  - Body: NameField (required, shown on canvas), DescriptionField (short
 *  ≤12-char label rendered as `serial • description` under the node title),
 *  then kind-specific fields with Meta-compliant char limits.
 *  - Footer: Duplicate + Delete on the left, Save on the right.
 *
 * The campaign ConfigPanel is used for API/Conditional; this panel only handles
 * freeform-owned kinds.
 */

const DESCRIPTION_MAX = 12;

export function FreeformConfigPanel({
  node,
  onClose,
  onChange,
  onDelete,
  onDuplicate,
}: {
  node: { id: string; data: FreeformNodeData } | null;
  onClose: () => void;
  onChange: (patch: Partial<FreeformNodeData>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  if (!node) return null;
  const { data } = node;
  const isSystem = data.kind === "start" || data.kind === "end";
  const valid = data.valid !== false;

  return (
    <div className="absolute inset-y-0 right-0 z-30 flex w-[400px] flex-col border-l border-border bg-background shadow-[-8px_0_30px_-12px_rgba(0,0,0,0.15)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {FREEFORM_NODE_LABELS[data.kind]}
          </p>
          <h2 className="mt-0.5 truncate text-base font-semibold">
            {data.title || FREEFORM_NODE_LABELS[data.kind]}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Validation banner */}
      <div
        className={cn(
          "flex items-center gap-2 border-b px-5 py-2 text-[11.5px]",
          valid
            ? "border-success/20 bg-success/5 text-success"
            : "border-destructive/20 bg-destructive/5 text-destructive",
        )}
      >
        {valid ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5" />
        )}
        {valid
          ? "Configuration valid"
          : (data.error ?? "Required fields missing")}
      </div>

      {/* Body */}
      <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <NameField data={data} onChange={onChange} />
        {!isSystem && <DescriptionField data={data} onChange={onChange} />}
        {isSystem ? (
          <div className="flex items-start gap-2.5 rounded-lg bg-muted px-3.5 py-3 text-[13px] text-muted-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {data.kind === "start"
                ? "Entry point of the workflow. The name above is how this node is referenced in Analytics."
                : "Terminal node of the workflow. The name above is how this node is referenced in Analytics."}
            </p>
          </div>
        ) : (
          <KindFields
            kind={data.kind}
            config={data.config ?? {}}
            onConfigChange={(patch) => {
              const nextCfg = { ...(data.config ?? {}), ...patch };
              const { valid: v, error } = validateFreeformNode(
                data.kind,
                nextCfg,
              );
              onChange({ config: nextCfg, valid: v, error });
            }}
          />
        )}
      </div>

      {/* Footer */}
      {!isSystem && (
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <div className="flex items-center gap-1">
            {!data.locked && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDuplicate}
                  className="h-8 gap-1 px-2 text-xs"
                >
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this node?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes{" "}
                        <span className="font-medium text-foreground">
                          {data.title}
                        </span>{" "}
                        and disconnects its edges. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete node
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
          <Button size="sm" disabled={!valid} className="h-8 text-xs">
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

/* --------------------------- Name / Description --------------------------- */

function NameField({
  data,
  onChange,
}: {
  data: FreeformNodeData;
  onChange: (p: Partial<FreeformNodeData>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Name <span className="text-destructive">*</span>
      </Label>
      <Input
        value={data.title ?? ""}
        placeholder={FREEFORM_NODE_LABELS[data.kind]}
        onChange={(e) => onChange({ title: e.target.value })}
        className="h-9 text-sm font-medium"
      />
      <p className="text-[11px] text-muted-foreground">
        Shown on the canvas and used as the reference label in Analytics.
      </p>
    </div>
  );
}

function DescriptionField({
  data,
  onChange,
}: {
  data: FreeformNodeData;
  onChange: (p: Partial<FreeformNodeData>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>Description</span>
        {data.serial && (
          <span className="font-mono normal-case tracking-normal text-muted-foreground/80">
            {data.serial}
          </span>
        )}
      </Label>
      <Input
        value={data.description ?? ""}
        maxLength={DESCRIPTION_MAX}
        placeholder="Short label (≤12 chars)"
        onChange={(e) =>
          onChange({ description: e.target.value.slice(0, DESCRIPTION_MAX) })
        }
        className="h-9 text-sm"
      />
      <p className="text-[11px] text-muted-foreground">
        Appears under the node as{" "}
        <span className="font-mono">
          {data.serial
            ? `${data.serial} • ${data.description || "…"}`
            : "serial • description"}
        </span>
        .
      </p>
    </div>
  );
}

/* --------------------------- Kind fields --------------------------- */

function KindFields({
  kind,
  config,
  onConfigChange,
}: {
  kind: FreeformNodeKind;
  config: FreeformNodeConfig;
  onConfigChange: (patch: Partial<FreeformNodeConfig>) => void;
}) {
  switch (kind) {
    case "text":
      return <TextFields config={config} onConfigChange={onConfigChange} />;
    case "image":
    case "video":
    case "document":
      return (
        <MediaFields
          kind={kind}
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    case "list":
      return <ListFields config={config} onConfigChange={onConfigChange} />;
    default:
      return null;
  }
}

function TextFields({
  config,
  onConfigChange,
}: {
  config: FreeformNodeConfig;
  onConfigChange: (p: Partial<FreeformNodeConfig>) => void;
}) {
  return (
    <>
      <Section title="Message">
        <CharField
          label="Body"
          required
          value={config.text ?? ""}
          onChange={(v) => onConfigChange({ text: v })}
          placeholder="Message the lead will see…"
          max={META_LIMITS.textBody}
          multiline
          rows={5}
        />
      </Section>
      <ButtonsBlockEditor
        block={config.buttonsBlock}
        onChange={(b) => onConfigChange({ buttonsBlock: b })}
      />
    </>
  );
}

function MediaFields({
  kind,
  config,
  onConfigChange,
}: {
  kind: "image" | "video" | "document";
  config: FreeformNodeConfig;
  onConfigChange: (p: Partial<FreeformNodeConfig>) => void;
}) {
  const source = config.mediaSource;
  return (
    <>
      <Section
        title={
          kind === "image" ? "Image" : kind === "video" ? "Video" : "Document"
        }
      >
        {/* Source toggle  -  URL or Upload */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Source <span className="text-destructive">*</span>
          </Label>
          <div className="grid grid-cols-2 gap-1.5">
            <SourceTile
              active={source === "url"}
              onClick={() => onConfigChange({ mediaSource: "url" })}
              label="From URL"
              hint="Paste a public link"
              icon={<ExternalLink className="h-3.5 w-3.5" />}
            />
            <SourceTile
              active={source === "upload"}
              onClick={() => onConfigChange({ mediaSource: "upload" })}
              label="Upload"
              hint="Pick a file"
              icon={<UploadCloud className="h-3.5 w-3.5" />}
            />
          </div>
        </div>

        {source === "url" && (
          <Field label="Media URL" required>
            <Input
              value={config.mediaUrl ?? ""}
              onChange={(e) => onConfigChange({ mediaUrl: e.target.value })}
              placeholder={
                kind === "image"
                  ? "https://…/image.jpg"
                  : kind === "video"
                    ? "https://…/video.mp4"
                    : "https://…/file.pdf"
              }
              className="h-9"
            />
          </Field>
        )}

        {source === "upload" && (
          <Field label={kind === "document" ? "File" : "Media"} required>
            <label className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 text-center text-xs text-muted-foreground hover:bg-muted/60">
              <input
                type="file"
                accept={
                  kind === "image"
                    ? "image/*"
                    : kind === "video"
                      ? "video/*"
                      : undefined
                }
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) {
                    onConfigChange({
                      mediaFileName: "",
                      mediaBlobUrl: undefined,
                    });
                    return;
                  }
                  // Object URL is transient (dies on reload), but that's fine  -  it
                  // just powers the on-canvas preview in the mock demo.
                  const blobUrl = URL.createObjectURL(file);
                  onConfigChange({
                    mediaFileName: file.name,
                    mediaBlobUrl: blobUrl,
                  });
                }}
              />
              <UploadCloud className="h-5 w-5" />
              <span>
                {config.mediaFileName
                  ? config.mediaFileName
                  : "Click to upload"}
              </span>
            </label>
          </Field>
        )}

        <CharField
          label="Caption"
          required
          value={config.caption ?? ""}
          onChange={(v) => onConfigChange({ caption: v })}
          placeholder="Caption / body text"
          max={META_LIMITS.captionBody}
          multiline
          rows={4}
        />
      </Section>
      <ButtonsBlockEditor
        block={config.buttonsBlock}
        onChange={(b) => onConfigChange({ buttonsBlock: b })}
      />
    </>
  );
}

function ListFields({
  config,
  onConfigChange,
}: {
  config: FreeformNodeConfig;
  onConfigChange: (p: Partial<FreeformNodeConfig>) => void;
}) {
  const rows = config.rows ?? [];
  const updateRow = (
    id: string,
    patch: Partial<{ title: string; description?: string }>,
  ) => {
    onConfigChange({
      rows: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };
  const addRow = () => {
    if (rows.length >= META_LIMITS.listMaxRows) return;
    onConfigChange({
      rows: [
        ...rows,
        { id: `row_${Math.random().toString(36).slice(2, 8)}`, title: "" },
      ],
    });
  };
  const removeRow = (id: string) => {
    onConfigChange({ rows: rows.filter((r) => r.id !== id) });
  };

  return (
    <Section title="List message">
      <CharField
        label="Header"
        value={config.header ?? ""}
        onChange={(v) => onConfigChange({ header: v })}
        placeholder="Optional short title above the body"
        max={META_LIMITS.listHeader}
      />
      <CharField
        label="Body"
        required
        value={config.body ?? ""}
        onChange={(v) => onConfigChange({ body: v })}
        placeholder="Message body"
        max={META_LIMITS.listBody}
        multiline
        rows={4}
      />
      <CharField
        label="Footer"
        value={config.footer ?? ""}
        onChange={(v) => onConfigChange({ footer: v })}
        placeholder="Optional footnote below the body"
        max={META_LIMITS.listFooter}
      />
      <CharField
        label="List button label"
        required
        value={config.buttonLabel ?? ""}
        onChange={(v) => onConfigChange({ buttonLabel: v })}
        placeholder="e.g. Choose a slot"
        max={META_LIMITS.listButtonLabel}
      />

      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Rows <span className="text-destructive">*</span>
          </Label>
          <span className="text-[10.5px] text-muted-foreground/70">
            {rows.length}/{META_LIMITS.listMaxRows}
          </span>
        </div>
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="rounded-md border border-border bg-secondary/30 p-2"
            >
              <div className="flex items-start gap-1.5">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div>
                    <Input
                      value={r.title}
                      onChange={(e) =>
                        updateRow(r.id, {
                          title: e.target.value.slice(
                            0,
                            META_LIMITS.listRowTitle,
                          ),
                        })
                      }
                      placeholder="Row title (required)"
                      maxLength={META_LIMITS.listRowTitle}
                      className="h-8 text-[12.5px]"
                    />
                    <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
                      {r.title.length}/{META_LIMITS.listRowTitle}
                    </p>
                  </div>
                  <div>
                    <Input
                      value={r.description ?? ""}
                      onChange={(e) =>
                        updateRow(r.id, {
                          description: e.target.value.slice(
                            0,
                            META_LIMITS.listRowDescription,
                          ),
                        })
                      }
                      placeholder="Description (optional)"
                      maxLength={META_LIMITS.listRowDescription}
                      className="h-8 text-[12.5px]"
                    />
                    <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
                      {(r.description ?? "").length}/
                      {META_LIMITS.listRowDescription}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeRow(r.id)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Remove row"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {rows.length < META_LIMITS.listMaxRows && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-xs"
              onClick={addRow}
            >
              <Plus className="h-3.5 w-3.5" /> Add row
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}

/* --------------------------- Buttons block editor --------------------------- */

/**
 * Buttons section. Always visible on Text/Media nodes. Empty state shows two
 * add CTAs (Meta doesn't allow mixing modes, so once the user picks one the
 * other option hides). Deleting the last button reverts to the empty state.
 */
function ButtonsBlockEditor({
  block,
  onChange,
}: {
  block?: ButtonsBlock;
  onChange: (b?: ButtonsBlock) => void;
}) {
  const addQuickReply = () => {
    const nextBtn = {
      id: `b_${Math.random().toString(36).slice(2, 8)}`,
      label: "",
    };
    if (!block || block.mode !== "quick_reply") {
      onChange({ mode: "quick_reply", buttons: [nextBtn] });
      return;
    }
    if (block.buttons.length >= META_LIMITS.maxQuickReplyButtons) return;
    onChange({ mode: "quick_reply", buttons: [...block.buttons, nextBtn] });
  };
  const addCtaUrl = () => {
    onChange({
      mode: "cta_url",
      button: {
        id: `b_${Math.random().toString(36).slice(2, 8)}`,
        label: "",
        url: "",
      },
    });
  };

  return (
    <Section title="Buttons">
      {!block && (
        <>
          <p className="text-[11.5px] text-muted-foreground">
            Up to 3 quick replies, or one CTA URL button. Meta doesn't allow
            mixing.
          </p>
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={addQuickReply}
            >
              <Plus className="h-3.5 w-3.5" /> Quick reply
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={addCtaUrl}
            >
              <Plus className="h-3.5 w-3.5" /> CTA URL
            </Button>
          </div>
        </>
      )}

      {block?.mode === "quick_reply" && (
        <QuickReplyEditor
          block={block}
          onChange={onChange}
          onAdd={addQuickReply}
        />
      )}
      {block?.mode === "cta_url" && (
        <CtaUrlEditor block={block} onChange={onChange} />
      )}
    </Section>
  );
}

function QuickReplyEditor({
  block,
  onChange,
  onAdd,
}: {
  block: Extract<ButtonsBlock, { mode: "quick_reply" }>;
  onChange: (b?: ButtonsBlock) => void;
  onAdd: () => void;
}) {
  const btns = block.buttons;
  const update = (id: string, label: string) => {
    onChange({
      mode: "quick_reply",
      buttons: btns.map((b) =>
        b.id === id
          ? { ...b, label: label.slice(0, META_LIMITS.buttonLabel) }
          : b,
      ),
    });
  };
  const remove = (id: string) => {
    const next = btns.filter((b) => b.id !== id);
    // Deleting the last quick reply reverts to the empty state so the user sees
    // both mode CTAs again and can pick CTA URL instead.
    if (next.length === 0) onChange(undefined);
    else onChange({ mode: "quick_reply", buttons: next });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Quick replies
        </Label>
        <span className="text-[10.5px] text-muted-foreground/70">
          {btns.length}/{META_LIMITS.maxQuickReplyButtons}
        </span>
      </div>
      {btns.map((b) => (
        <div key={b.id} className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <Input
              value={b.label}
              onChange={(e) => update(b.id, e.target.value)}
              placeholder="Button label"
              maxLength={META_LIMITS.buttonLabel}
              className="h-8 text-[12.5px]"
            />
            <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
              {b.label.length}/{META_LIMITS.buttonLabel}
            </p>
          </div>
          <button
            onClick={() => remove(b.id)}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {btns.length < META_LIMITS.maxQuickReplyButtons && (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={onAdd}
        >
          <Plus className="h-3.5 w-3.5" /> Add quick reply
        </Button>
      )}
    </div>
  );
}

function CtaUrlEditor({
  block,
  onChange,
}: {
  block: Extract<ButtonsBlock, { mode: "cta_url" }>;
  onChange: (b?: ButtonsBlock) => void;
}) {
  const b = block.button;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          CTA URL
        </Label>
        <button
          onClick={() => onChange(undefined)}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Remove CTA URL"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div>
        <Field label="Button label" required>
          <Input
            value={b.label}
            onChange={(e) =>
              onChange({
                mode: "cta_url",
                button: {
                  ...b,
                  label: e.target.value.slice(0, META_LIMITS.buttonLabel),
                },
              })
            }
            placeholder="e.g. Open link"
            maxLength={META_LIMITS.buttonLabel}
            className="h-8 text-[12.5px]"
          />
          <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
            {b.label.length}/{META_LIMITS.buttonLabel}
          </p>
        </Field>
      </div>
      <Field label="URL" required>
        <Input
          value={b.url}
          onChange={(e) =>
            onChange({ mode: "cta_url", button: { ...b, url: e.target.value } })
          }
          placeholder="https://…"
          className="h-8 text-[12.5px]"
        />
      </Field>
    </div>
  );
}

/* --------------------------- Primitives --------------------------- */

function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {right}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

/** Input/Textarea with a char counter and Meta hard limit. */
function CharField({
  label,
  required,
  value,
  onChange,
  placeholder,
  max,
  multiline,
  rows,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  max: number;
  multiline?: boolean;
  rows?: number;
}) {
  const over = value.length > max;
  return (
    <Field label={label} required={required}>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, max))}
          placeholder={placeholder}
          rows={rows ?? 3}
          maxLength={max}
          className="resize-none text-[13px]"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, max))}
          placeholder={placeholder}
          maxLength={max}
          className="h-9 text-sm"
        />
      )}
      <p
        className={cn(
          "text-right text-[10.5px]",
          over ? "text-destructive" : "text-muted-foreground/70",
        )}
      >
        {value.length}/{max}
      </p>
    </Field>
  );
}

function SourceTile({
  active,
  onClick,
  label,
  hint,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-colors",
        active
          ? "border-foreground bg-accent/40"
          : "border-border hover:bg-accent/30",
      )}
    >
      <span className="flex items-center gap-1.5 text-[12px] font-medium">
        {icon}
        {label}
      </span>
      <span className="text-[10.5px] text-muted-foreground">{hint}</span>
    </button>
  );
}
