/**
 * Outcome audiences — step three, where the loop actually closes.
 *
 * Meta knows who tapped the ad. It does not know who asked a question and then
 * went quiet, and that segment is the most valuable thing a merchant owns: high
 * intent, already in a thread, one nudge from converting. It only exists because
 * the conversation outcome was captured in the first place.
 *
 * Membership is evaluated live against the conversation feed rather than frozen
 * at save time, so a lead who comes back and converts leaves the audience by
 * themselves. That is the difference between an audience and a CSV export.
 *
 * BACKEND: `Retarget` currently pre-fills an ad draft. With a real Meta
 * connection this is also where the member list uploads as a Custom Audience.
 */
import { useState } from "react";
import { Target, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Empty } from "@/components/ads/ui";
import {
  addOutcomeAudience, outcomeAudienceMembers, removeOutcomeAudience,
  useCtwaAds, useCtwaConversations, useOutcomeAudiences, useSimNow,
} from "@/lib/ctwa-store";
import {
  OUTCOME_STAGE_LABELS, type OutcomeAudience, type OutcomeAudienceRule, type OutcomeStage,
} from "@/lib/ctwa-types";

/** Stages worth retargeting: everything except the one that already paid. */
const RULE_STAGES: OutcomeStage[] = [
  "clicked",
  "opened_whatsapp",
  "conversation_started",
  "qualified",
  "dropped",
];

const QUIET_DAYS = [1, 3, 7, 14];

const STAGE_RATIONALE: Partial<Record<OutcomeStage, string>> = {
  clicked: "Paid for the tap, never got a message. Worth one more impression, not much more.",
  opened_whatsapp: "Opened the thread and typed nothing. Usually a friction or timing problem.",
  conversation_started: "Asked something, then stalled. The densest intent a merchant owns.",
  qualified: "Cleared qualification and didn't buy. Closest to revenue of anything here.",
  dropped: "Written off by the funnel. Cheap to re-approach with a different angle.",
};

let audienceSeq = 0;

export function OutcomeAudiences({ onRetarget }: { onRetarget: (audienceId: string) => void }) {
  const ads = useCtwaAds();
  const audiences = useOutcomeAudiences();
  // Not read directly — subscribing keeps the live member counts below honest as
  // the sim clock moves and conversations advance out of their audience.
  useCtwaConversations();
  const nowMs = useSimNow();

  const [stage, setStage] = useState<OutcomeStage>("conversation_started");
  const [days, setDays] = useState(3);
  const [adId, setAdId] = useState("");
  const [name, setName] = useState("");

  const rule: OutcomeAudienceRule = { stage, noDownstreamEventWithinDays: days };
  const preview = outcomeAudienceMembers(rule, adId || undefined);
  const suggestedName = `${OUTCOME_STAGE_LABELS[stage]} · quiet ${days}d`;

  const save = () => {
    const audience: OutcomeAudience = {
      id: `aud_${++audienceSeq}_${stage}`,
      name: name.trim() || suggestedName,
      adId: adId || undefined,
      rule,
      createdAt: new Date(nowMs).toISOString().slice(0, 10),
    };
    addOutcomeAudience(audience);
    setName("");
    toast.success(`"${audience.name}" saved`, {
      description: `${preview.length} conversation${preview.length === 1 ? "" : "s"} match right now.`,
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-[13.5px] font-medium">Build an audience</h3>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Reached a stage, then went quiet. Membership is re-evaluated continuously.
        </p>

        <div className="mt-3.5 space-y-3">
          <Field label="Reached">
            <Select value={stage} onValueChange={(v) => setStage(v as OutcomeStage)}>
              <SelectTrigger className="h-9 text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{OUTCOME_STAGE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {STAGE_RATIONALE[stage] && (
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{STAGE_RATIONALE[stage]}</p>
            )}
          </Field>

          <Field label="Then nothing for">
            <div className="grid grid-cols-4 gap-1.5">
              {QUIET_DAYS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={cn(
                    "h-8 rounded-md border text-[12px] font-medium transition-colors",
                    days === d
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>
          </Field>

          <Field label="Source ad">
            <Select value={adId || "all"} onValueChange={(v) => setAdId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every ad</SelectItem>
                {ads.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              placeholder={suggestedName}
              className="h-9 text-[12.5px]"
            />
          </Field>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span className="text-[11.5px]">Matching now</span>
            </div>
            <span className="font-mono text-[15px] font-semibold tabular-nums">{preview.length}</span>
          </div>

          <Button size="sm" className="h-8 w-full text-xs" onClick={save} disabled={preview.length === 0}>
            {preview.length === 0 ? "No one matches this rule" : "Save audience"}
          </Button>
        </div>
      </div>

      <div className="space-y-2.5">
        {audiences.length === 0 ? (
          <Empty>
            No outcome audiences yet. The people who started a conversation and stalled are invisible to
            Meta until you build one.
          </Empty>
        ) : (
          audiences.map((a) => (
            <AudienceCard
              key={a.id}
              audience={a}
              adName={a.adId ? ads.find((x) => x.id === a.adId)?.name : undefined}
              onRetarget={() => onRetarget(a.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function AudienceCard({
  audience, adName, onRetarget,
}: {
  audience: OutcomeAudience;
  adName?: string;
  onRetarget: () => void;
}) {
  // Evaluated on every render rather than memoised: the parent subscribes to the
  // feed and the clock, and a memo keyed on the rule would freeze exactly the
  // liveness that makes this an audience rather than an export.
  const members = outcomeAudienceMembers(audience.rule, audience.adId);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{audience.name}</p>
        <p className="truncate text-[11.5px] text-muted-foreground">
          Reached {OUTCOME_STAGE_LABELS[audience.rule.stage]} · quiet{" "}
          {audience.rule.noDownstreamEventWithinDays}d · {adName ?? "every ad"}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-[15px] font-semibold tabular-nums">{members.length}</p>
        <p className="text-[10.5px] text-muted-foreground">members</p>
      </div>
      <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-xs" onClick={onRetarget}>
        <Target className="h-3.5 w-3.5" /> Retarget
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => removeOutcomeAudience(audience.id)}
        className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
        aria-label={`Delete ${audience.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-medium">{label}</label>
      {children}
    </div>
  );
}
