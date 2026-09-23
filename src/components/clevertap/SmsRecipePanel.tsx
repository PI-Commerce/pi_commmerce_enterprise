/**
 * The payload recipe.
 *
 * This is the only panel on the SMS connection screen that is not a list of values,
 * and it is the reason the screen exists. Under Generic SMS the client authors our
 * request shape inside CleverTap's form, so the artefact that decides whether the
 * integration works is one JSON block pasted whole — not documentation describing it.
 *
 * Which is also why so little of it is adjustable. Every element of the recipe a
 * client can change is an element they can get wrong, and each of those failures
 * reads on CleverTap's side as a valid configuration talking to a broken provider.
 * So there is one control — which sender header this provider sends from, the only
 * thing that genuinely varies between clients and changes the block — and editing
 * the JSON itself is a deliberate detour that validates before it will let go.
 *
 * There was a second control, for batching. It changed nothing in the block, because
 * batching is decided by a field on CleverTap's form and the recipe is identical
 * either way; a select that moves nothing is worse than the sentence it replaced. The
 * choice and its consequence are now stated below, next to the other values that are
 * entered on their form rather than ours.
 *
 * One recipe carries one header, because the header is a static value in CleverTap's
 * configuration rather than something we can vary per recipient. A client sending
 * from two headers therefore configures two providers against the same connection.
 * That is stated on the panel rather than left to be discovered when the second
 * header's traffic is rejected with 906.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Panel } from "@/components/connections/Panel";
import { CopyButton } from "@/components/clevertap/CopyRow";
import { Pencil, RotateCcw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CT_BATCH_CEILING,
  SMS_BATCH_KEY,
  SMS_BATCH_MAX,
  headerUse,
  recipeError,
  smsRecipe,
  updateSmsConnection,
  type SmsConnection,
} from "@/lib/clevertap-sms";

export function SmsRecipePanel({
  connection,
  header,
  onHeaderChange,
}: {
  connection: SmsConnection;
  header: string;
  onHeaderChange: (h: string) => void;
}) {
  const generated = smsRecipe({ header });
  const recipe = connection.recipeOverride ?? generated;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(recipe);
  const [touched, setTouched] = useState(false);

  const error = recipeError(draft);
  const edited = !!connection.recipeOverride;

  const startEdit = () => {
    setDraft(recipe);
    setTouched(false);
    setEditing(true);
  };

  const save = () => {
    setTouched(true);
    if (error) return;
    updateSmsConnection(connection.id, { recipeOverride: draft.trim() });
    setEditing(false);
    toast.success("Recipe saved", {
      description: "Paste it into CleverTap again — the copy already on their form is the old one.",
    });
  };

  const revert = () => {
    updateSmsConnection(connection.id, { recipeOverride: undefined });
    setEditing(false);
    setTouched(false);
    toast.success("Recipe reset", { description: "Back to the generated shape." });
  };

  return (
    <Panel
      title="Payload recipe"
      caption="Paste this whole block into the Parameters field on CleverTap's provider form. Nothing in it needs editing — the $$ tokens are theirs to substitute and are meant to survive the paste literally."
      action={
        !editing && (
          <div className="flex items-center gap-1.5">
            {edited && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[11px]"
                onClick={revert}
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={startEdit}>
              <Pencil className="h-3 w-3" /> Edit
            </Button>
            <CopyButton value={recipe} label="Copy recipe" />
          </div>
        )
      }
    >
      <div className="space-y-4">
        {/* ── The one thing that varies and changes the block. A wrong value here
               gets the whole campaign rejected at the operator. ── */}
        <div className="max-w-sm space-y-1.5">
          <Label className="text-[12px]">Sender ID (DLT header)</Label>
          <Select value={header} onValueChange={onHeaderChange} disabled={editing}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {connection.headers.map((h) => (
                <SelectItem key={h} value={h} className="text-xs">
                  <span className="font-mono">{h}</span>
                  <span className="ml-2 text-muted-foreground">{headerUse(h)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Only headers registered to you and covered by this connection. One recipe
            sends from one header — a second header means a second provider in
            CleverTap, against this same connection.
          </p>
        </div>

        {/* ─────────────────────────── The block itself ─────────────────────────── */}
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              rows={16}
              className="resize-y font-mono text-[11.5px] leading-relaxed"
            />
            {touched && error && (
              <p className="flex items-start gap-1.5 text-[11px] leading-snug text-destructive">
                <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
                {error}
              </p>
            )}
            <p className="text-[11px] leading-snug text-muted-foreground">
              Checked before you leave the page, because CleverTap's form will accept a
              broken recipe and fail at send time instead. $$MessageID cannot be removed —
              without it every message still delivers and their report stays empty forever.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setEditing(false);
                  setTouched(false);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={save}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative">
            <pre
              className={cn(
                "max-h-[420px] overflow-auto rounded-lg border bg-secondary/40 px-3.5 py-3 font-mono text-[11.5px] leading-relaxed",
                edited ? "border-warning/40" : "border-border",
              )}
            >
              {recipe}
            </pre>
            {edited && (
              <p className="mt-1.5 text-[11px] leading-snug text-warning">
                Edited by hand. The sender ID control above no longer drives this —
                reset to bring it back.
              </p>
            )}
          </div>
        )}

        {/* ── FR-2: the values that are *not* in the block. Adjacent, not linked to —
               a client who has to open a second page to finish one form will finish it
               from memory instead. ── */}
        <div className="rounded-lg border border-border bg-secondary/30 px-3.5 py-3">
          <p className="text-[11.5px] font-medium">Entered elsewhere on their form</p>
          <dl className="mt-2 space-y-1.5 text-[11.5px]">
            <Aside term="Endpoint, request type, authentication">
              In the panel above this one.
            </Aside>
            {/* Batching lives here rather than as a control, because this field is
                the whole of it — the block above is identical either way. Both
                consequences are stated together so the choice can be made once,
                here, without a toggle implying the recipe follows it. */}
            <Aside term="Batch key name">
              <span className="font-mono">{SMS_BATCH_KEY}</span> to batch, which sends up
              to {SMS_BATCH_MAX} recipients per request — a 250-recipient campaign is
              three requests. Leave it blank and the same block goes once per recipient,
              so that campaign is 250 requests. This field is the only thing that decides
              it; the recipe above does not change.
            </Aside>
            <Aside term="Records per batch">
              {SMS_BATCH_MAX}. CleverTap's form permits up to {CT_BATCH_CEILING}, but a
              larger batch is rejected here with an error naming the limit rather than
              truncated — a truncated batch is indistinguishable from a delivery failure on
              their side.
            </Aside>
          </dl>
        </div>
      </div>
    </Panel>
  );
}

function Aside({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-[150px] shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 flex-1 leading-relaxed text-muted-foreground">{children}</dd>
    </div>
  );
}
