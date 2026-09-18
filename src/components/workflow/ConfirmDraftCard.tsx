/**
 * Confirm-Draft card — rendered in chat when Pi emits a `propose_draft`
 * tool call. Users hit "Draft this" to accept and let Pi wire the flow,
 * or "Edit" to keep clarifying.
 *
 * Deliberately minimal — no cost previews, no audience-size estimates.
 * Iterates on principle: show Pi's plan; let the user act on it. Anything
 * more is hallucinated ceremony.
 */
import { Check, PencilLine, Sparkles } from "lucide-react";
import { NODE_LABELS } from "@/lib/campaign-types";
import type { NodeKind } from "@/lib/campaign-types";
import type { ProposedDraft } from "@/lib/pi-propose-draft";

export function ConfirmDraftCard({
  draft,
  onDraft,
  onEdit,
  disabled = false,
}: {
  draft: ProposedDraft;
  onDraft: () => void;
  onEdit: () => void;
  disabled?: boolean;
}) {
  const openQuestions = draft.openQuestions?.filter((q) => q.trim().length > 0) ?? [];
  return (
    <div className="ml-6 overflow-hidden rounded-2xl border border-ai/40 bg-card shadow-[0_10px_30px_-12px_color-mix(in_oklch,var(--ai)_30%,transparent)]">
      {/* Header */}
      <div className="flex items-start gap-2.5 border-b border-border/60 bg-ai/5 px-3.5 py-2.5">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai" />
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-medium uppercase tracking-wide text-ai">Plan ready to draft</div>
          <div className="mt-0.5 truncate text-[13.5px] font-semibold text-foreground">{draft.title}</div>
          {draft.summary && (
            <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{draft.summary}</div>
          )}
        </div>
      </div>

      {/* Branches */}
      <div className="divide-y divide-border/60">
        {draft.branches.map((branch, bi) => (
          <div key={`b-${bi}`} className="px-3.5 py-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {branch.label || `Branch ${bi + 1}`}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-foreground">
              {branch.channels.map((c, ci) => {
                const label = NODE_LABELS[c.kind as NodeKind] ?? c.kind;
                return (
                  <span key={`c-${bi}-${ci}`} className="inline-flex items-center gap-1.5">
                    {ci > 0 && <ArrowGlyph />}
                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px] font-medium">
                      {label}
                      {c.assetId && (
                        <span className="text-[10.5px] text-muted-foreground">· {c.assetId}</span>
                      )}
                    </span>
                  </span>
                );
              })}
            </div>
            {branch.channels.some((c) => c.note) && (
              <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-muted-foreground">
                {branch.channels
                  .filter((c) => c.note)
                  .map((c, ci) => (
                    <li key={`n-${bi}-${ci}`}>• {c.note}</li>
                  ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Open questions block — if Pi flagged anything it wasn't sure
          about, show it here so the user can address before drafting. */}
      {openQuestions.length > 0 && (
        <div className="border-t border-border/60 bg-warning/5 px-3.5 py-2.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-warning">Open questions</div>
          <ul className="mt-1 space-y-0.5 text-[12px] text-foreground">
            {openQuestions.map((q, i) => (
              <li key={`oq-${i}`}>• {q}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/30 px-3.5 py-2.5">
        <button
          onClick={onEdit}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <PencilLine className="h-3 w-3" />
          Edit
        </button>
        <button
          onClick={onDraft}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ai px-3 py-1.5 text-[12px] font-medium text-ai-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Check className="h-3 w-3" />
          Draft this
        </button>
      </div>
    </div>
  );
}

function ArrowGlyph() {
  return <span aria-hidden className="text-muted-foreground">·</span>;
}
