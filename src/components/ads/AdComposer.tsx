/**
 * Create / edit a Click-to-WhatsApp ad.
 *
 * Full-screen form in the same shape as the WhatsApp template composer: form
 * column on the left, live preview on the right, sticky action bar on top.
 *
 * Two things here are load-bearing rather than cosmetic:
 *
 *  - the objective → optimisation goal pair is a single control group, and the
 *    goal options are derived from `allowedGoals(objective)`. Choosing Leads
 *    physically cannot yield "Conversions", which is the whole trap: the merchant
 *    sees why the option disappeared instead of discovering it in a burn report.
 *  - warnings render inline and do NOT block submit. They are strategy notes, not
 *    field errors — a merchant is allowed to run a Leads ad, they just shouldn't
 *    do it by accident.
 */
import { useMemo, useRef, useState } from "react";
import {
  AlertCircle, AlertTriangle, ChevronLeft, Lightbulb, Loader2, MessageCircle,
  Sparkles, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useRegion } from "@/lib/region";
import { CreativeTile, money } from "@/components/ads/ui";
import { generateCreatives, type CreativeVariant } from "@/lib/ctwa-creative";
import { useOutcomeAudiences } from "@/lib/ctwa-store";
import { AD_DESTINATION_NUMBERS } from "@/lib/ctwa-onboarding";
import {
  CUSTOM_AUDIENCES, GEO_OPTIONS, INTEREST_OPTIONS, LOOKALIKE_SOURCES,
} from "@/lib/ctwa-seed";
import { EXAMPLE_CAMPAIGN_NAMES } from "@/lib/campaign-examples";
import {
  GOAL_LABELS, OBJECTIVE_LABELS, allowedGoals, validateAd,
  type AdFormat, type AdObjective, type CtwaAd, type OptimizationGoal,
} from "@/lib/ctwa-types";

const FORMATS: { id: AdFormat; label: string }[] = [
  { id: "image", label: "Single image" },
  { id: "video", label: "Video" },
  { id: "carousel", label: "Carousel" },
];

const OBJECTIVE_HINT: Record<AdObjective, string> = {
  OUTCOME_LEADS: "Meta buys people likely to open a chat.",
  OUTCOME_SALES: "Meta buys people likely to complete a conversion point.",
  OUTCOME_ENGAGEMENT: "Meta buys reach and replies, not intent.",
};

/** Reach scales with budget and narrows as targeting tightens — enough to feel responsive. */
function estimateReach(dailyBudget: number, geo: string[], interests: string[], audiences: string[]) {
  if (geo.length === 0) return { low: 0, high: 0 };
  const breadth = geo.includes("All India") ? 6 : geo.length;
  const narrowing = 1 / (1 + interests.length * 0.18 + audiences.length * 0.3);
  const base = dailyBudget * 42 * breadth * narrowing;
  return { low: Math.round(base * 0.62), high: Math.round(base * 1.55) };
}

export function AdComposer({
  initial,
  onCancel,
  onSave,
  onSubmitForReview,
}: {
  initial: CtwaAd;
  onCancel: () => void;
  onSave: (ad: CtwaAd) => void;
  onSubmitForReview: (ad: CtwaAd) => void;
}) {
  const { symbol } = useRegion();
  const isNew = !initial.submittedAt && initial.name === "";
  const outcomeAudiences = useOutcomeAudiences();

  const [name, setName] = useState(initial.name);
  const [headline, setHeadline] = useState(initial.headline);
  const [caption, setCaption] = useState(initial.caption);
  const [mediaUrl, setMediaUrl] = useState(initial.mediaUrl);
  const [format, setFormat] = useState<AdFormat>(initial.format);
  const [objective, setObjective] = useState<AdObjective>(initial.objective);
  const [goal, setGoal] = useState<OptimizationGoal>(initial.optimizationGoal);
  const [phone, setPhone] = useState(initial.wabaPhoneNumber);
  const [prefilled, setPrefilled] = useState(initial.prefilledMessage);
  const [campaignId, setCampaignId] = useState(initial.campaignId ?? "");
  const [geo, setGeo] = useState<string[]>(initial.targeting.geo);
  const [interests, setInterests] = useState<string[]>(initial.targeting.interests);
  const [audienceIds, setAudienceIds] = useState<string[]>(initial.targeting.customAudienceIds);
  const [lookalike, setLookalike] = useState(initial.targeting.lookalikeSourceId ?? "");
  const [gender, setGender] = useState(initial.targeting.gender);
  const [age, setAge] = useState<[number, number]>([initial.targeting.ageRange.min, initial.targeting.ageRange.max]);
  const [budget, setBudget] = useState(initial.dailyBudget);
  const [startAt, setStartAt] = useState(initial.startAt);
  const [endAt, setEndAt] = useState(initial.endAt ?? "");
  const [showErrors, setShowErrors] = useState(false);

  // Selecting an objective can invalidate the current goal — snap to the first legal one.
  const goals = allowedGoals(objective);
  const pickObjective = (next: AdObjective) => {
    setObjective(next);
    const legal = allowedGoals(next);
    if (!legal.includes(goal)) setGoal(legal[0]);
  };

  const reach = useMemo(
    () => estimateReach(budget, geo, interests, audienceIds),
    [budget, geo, interests, audienceIds],
  );

  const draft: CtwaAd = {
    ...initial,
    name: name.trim(),
    headline,
    caption,
    mediaUrl,
    format,
    objective,
    optimizationGoal: goal,
    wabaPhoneNumber: phone,
    prefilledMessage: prefilled,
    campaignId: campaignId || undefined,
    targeting: {
      geo,
      ageRange: { min: age[0], max: age[1] },
      gender,
      interests,
      customAudienceIds: audienceIds,
      lookalikeSourceId: lookalike || undefined,
    },
    dailyBudget: budget,
    startAt,
    endAt: endAt || undefined,
    estimatedReach: reach,
  };

  const check = validateAd(draft);
  const errorFor = (fragment: string) =>
    showErrors ? check.errors.find((e) => e.toLowerCase().includes(fragment)) : undefined;

  const save = () => {
    onSave(draft);
    toast.success(isNew ? "Ad saved as draft" : "Changes saved");
  };

  const submit = () => {
    if (!check.valid) {
      setShowErrors(true);
      toast.error("Ad is incomplete", { description: check.errors[0] });
      return;
    }
    onSubmitForReview(draft);
  };

  const applyVariant = (v: CreativeVariant) => {
    setHeadline(v.headline);
    setCaption(v.caption);
    setMediaUrl(v.mediaUrl);
    setFormat(v.format);
    toast.success(`Applied the "${v.angle}" variant`);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
        <button
          onClick={onCancel}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back to ads"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Meta Ads</span>
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="truncate text-[13.5px] font-medium">{isNew ? "Create ad" : name || "Edit ad"}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={save}>Save draft</Button>
          <Button size="sm" className="h-8 text-xs" onClick={submit}>Submit for review</Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-5">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <Card title="Basics">
              <div className="space-y-4">
                <FormField label="Ad name" required error={errorFor("ad name")}>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Gold Loan · Festive"
                    className="h-9"
                  />
                </FormField>
                <FormField
                  label="PiCom campaign"
                  hint="The flow inbound taps enter. Leave unset to collect conversations without automation."
                >
                  <Select value={campaignId || "none"} onValueChange={(v) => setCampaignId(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No campaign</SelectItem>
                      {EXAMPLE_CAMPAIGN_NAMES.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            </Card>

            <ObjectiveCard
              objective={objective}
              goal={goal}
              goals={goals}
              onObjective={pickObjective}
              onGoal={setGoal}
              warnings={check.warnings}
            />

            <Card title="Creative">
              <div className="space-y-4">
                <CreativeStudio
                  subject={name}
                  onApply={applyVariant}
                />
                <FormField label="Headline" required error={errorFor("headline")}>
                  <Input
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value.slice(0, 40))}
                    placeholder="Gold loan in 30 minutes"
                    className="h-9"
                  />
                </FormField>
                <FormField label="Primary text" required error={errorFor("primary text")}>
                  <Textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value.slice(0, 280))}
                    placeholder="What the ad says above the creative."
                    className="min-h-[86px] text-[13px]"
                  />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Format">
                    <Select value={format} onValueChange={(v) => setFormat(v as AdFormat)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FORMATS.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Media" required error={errorFor("creative media")}>
                    <Input
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      placeholder="picom://creative/my-ad"
                      className="h-9 font-mono text-[12px]"
                    />
                  </FormField>
                </div>
              </div>
            </Card>

            <Card title="Destination">
              <div className="space-y-4">
                <FormField
                  label="WhatsApp number"
                  required
                  hint="Taps open a chat with this number. It must sit on a connected WABA."
                  error={errorFor("whatsapp destination")}
                >
                  <Select value={phone} onValueChange={setPhone}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select a number" /></SelectTrigger>
                    <SelectContent>
                      {AD_DESTINATION_NUMBERS.map((n) => (
                        <SelectItem key={n.id} value={n.display}>{n.display} · {n.meta}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField
                  label="Pre-filled first message"
                  required
                  hint="Seeded into the customer's composer. Meta stamps ctwa_clid on it — this message is what starts attribution."
                  error={errorFor("pre-filled")}
                >
                  <Input
                    value={prefilled}
                    onChange={(e) => setPrefilled(e.target.value.slice(0, 120))}
                    placeholder="Hi, I'd like to check my eligibility."
                    className="h-9"
                  />
                </FormField>
              </div>
            </Card>

            <Card title="Audience">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Locations" required error={errorFor("location")}>
                    <MultiSelect
                      options={GEO_OPTIONS.map((g) => ({ value: g, label: g }))}
                      value={geo}
                      onChange={setGeo}
                      placeholder="Select locations"
                      triggerClassName="h-9"
                    />
                  </FormField>
                  <FormField label="Interests">
                    <MultiSelect
                      options={INTEREST_OPTIONS.map((i) => ({ value: i, label: i }))}
                      value={interests}
                      onChange={setInterests}
                      placeholder="Any interest"
                      triggerClassName="h-9"
                    />
                  </FormField>
                </div>
                <FormField label={`Age · ${age[0]}–${age[1]}`}>
                  <Slider
                    min={13}
                    max={65}
                    step={1}
                    value={age}
                    onValueChange={(v) => setAge([v[0], v[1]] as [number, number])}
                    className="mt-3"
                  />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Gender">
                    <Select value={gender} onValueChange={(v) => setGender(v as typeof gender)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="male">Men</SelectItem>
                        <SelectItem value="female">Women</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Lookalike source">
                    <Select value={lookalike || "none"} onValueChange={(v) => setLookalike(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {LOOKALIKE_SOURCES.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>
                <FormField label="Custom audiences" hint="Outcome audiences you build from conversations appear here too.">
                  <MultiSelect
                    options={[
                      ...outcomeAudiences.map((a) => ({ value: a.id, label: `${a.name} · outcome` })),
                      ...CUSTOM_AUDIENCES.map((a) => ({ value: a.id, label: a.name })),
                    ]}
                    value={audienceIds}
                    onChange={setAudienceIds}
                    placeholder="No custom audience"
                    triggerClassName="h-9"
                  />
                </FormField>
              </div>
            </Card>

            <Card title="Budget & schedule">
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Daily budget" required error={errorFor("daily budget")}>
                  <Input
                    type="number"
                    min={0}
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value) || 0)}
                    className="h-9 tabular-nums"
                  />
                </FormField>
                <FormField label="Start date">
                  <Input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="h-9" />
                </FormField>
                <FormField label="End date" hint="Leave empty to run always-on.">
                  <Input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="h-9" />
                </FormField>
              </div>
            </Card>
          </div>

          {/* Preview + readiness rail */}
          <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">
            <AdPreview
              headline={headline}
              caption={caption}
              mediaUrl={mediaUrl}
              format={format}
              pageName="Paytm Commerce"
              prefilled={prefilled}
            />

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-2 text-[13px] font-semibold">Estimated daily reach</h3>
              {geo.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Select at least one location to estimate reach.</p>
              ) : (
                <>
                  <p className="text-2xl font-semibold tabular-nums tracking-tight">
                    {reach.low.toLocaleString("en-IN")} – {reach.high.toLocaleString("en-IN")}
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    At {money(budget, symbol)}/day across {geo.length} location{geo.length === 1 ? "" : "s"}.
                  </p>
                </>
              )}
            </div>

            {showErrors && check.errors.length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" /> Fix before submitting
                </h3>
                <ul className="space-y-1 text-[11.5px] text-destructive/90">
                  {check.errors.map((e) => <li key={e}>· {e}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Objective + goal ─────────────────────────── */

/**
 * Objective and goal share a card because they are one decision. Splitting them
 * is how merchants end up on Leads · Conversations without noticing.
 */
function ObjectiveCard({
  objective, goal, goals, onObjective, onGoal, warnings,
}: {
  objective: AdObjective;
  goal: OptimizationGoal;
  goals: OptimizationGoal[];
  onObjective: (o: AdObjective) => void;
  onGoal: (g: OptimizationGoal) => void;
  warnings: string[];
}) {
  return (
    <Card title="Objective & optimisation">
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2.5">
          {(Object.keys(OBJECTIVE_LABELS) as AdObjective[]).map((o) => {
            const active = objective === o;
            return (
              <button
                key={o}
                onClick={() => onObjective(o)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  active ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50",
                )}
              >
                <p className="text-[13px] font-medium">{OBJECTIVE_LABELS[o]}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{OBJECTIVE_HINT[o]}</p>
              </button>
            );
          })}
        </div>

        <FormField
          label="Optimisation goal"
          hint={
            goals.length === 1
              ? `${OBJECTIVE_LABELS[objective]} only supports ${GOAL_LABELS[goals[0]]}.`
              : "Conversions requires conversion points flowing back through CAPI."
          }
        >
          <Select value={goal} onValueChange={(v) => onGoal(v as OptimizationGoal)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {goals.map((g) => <SelectItem key={g} value={g}>{GOAL_LABELS[g]}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>

        {warnings.map((w) => (
          <div
            key={w}
            className="flex gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-[11.5px] leading-snug text-warning"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{w}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─────────────────────────── AI creative ─────────────────────────── */

function CreativeStudio({ subject, onApply }: { subject: string; onApply: (v: CreativeVariant) => void }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [offer, setOffer] = useState("");
  const [busy, setBusy] = useState(false);
  const [variants, setVariants] = useState<CreativeVariant[]>([]);
  const run = useRef(0);

  const generate = async () => {
    const id = ++run.current;
    setBusy(true);
    const next = await generateCreatives(prompt || subject, { brandName: "Paytm", offer });
    if (run.current !== id) return;
    setVariants(next);
    setBusy(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setPrompt(subject); }}
        className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[12.5px] font-medium">Generate ad copy</span>
          <span className="block text-[11px] text-muted-foreground">Describe the offer and pick from four angles.</span>
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-[12.5px] font-medium">Generate ad copy</span>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto text-[11.5px] text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What are you advertising?"
          className="h-8 text-[12.5px]"
        />
        <Input
          value={offer}
          onChange={(e) => setOffer(e.target.value)}
          placeholder="Offer (optional)"
          className="h-8 text-[12.5px]"
        />
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={generate} disabled={busy}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
          {variants.length ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {variants.length > 0 && (
        <div className="mt-3 space-y-2">
          {variants.map((v) => (
            <div key={v.id} className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-2.5">
              <CreativeTile mediaUrl={v.mediaUrl} format={v.format} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <Lightbulb className="h-2.5 w-2.5" /> {v.angle}
                  </span>
                </div>
                <p className="mt-1 truncate text-[12.5px] font-medium">{v.headline}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{v.caption}</p>
              </div>
              <Button variant="outline" size="sm" className="h-7 shrink-0 text-[11px]" onClick={() => onApply(v)}>
                Use
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Preview ─────────────────────────── */

/** Feed-style render of the ad plus the WhatsApp composer the tap opens. */
function AdPreview({
  headline, caption, mediaUrl, format, pageName, prefilled,
}: {
  headline: string;
  caption: string;
  mediaUrl: string;
  format: AdFormat;
  pageName: string;
  prefilled: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#0866FF] text-[11px] font-bold text-white">P</span>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium">{pageName}</p>
          <p className="text-[10px] text-muted-foreground">Sponsored</p>
        </div>
      </div>
      <p className="px-3 pb-2 text-[11.5px] leading-snug text-foreground/90">
        {caption || <span className="text-muted-foreground">Primary text appears here.</span>}
      </p>
      <CreativeTile mediaUrl={mediaUrl} format={format} className="h-40 w-full rounded-none" />
      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium">
            {headline || <span className="text-muted-foreground">Headline</span>}
          </p>
          <p className="text-[10px] text-muted-foreground">Send message</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md bg-[#25D366] px-2 py-1 text-[10.5px] font-semibold text-white">
          <MessageCircle className="h-3 w-3" /> WhatsApp
        </span>
      </div>
      <div className="border-t border-border bg-[#0b141a]/[0.03] px-3 py-2.5 dark:bg-white/[0.03]">
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Opens with</p>
        <p className="ml-auto w-fit max-w-full rounded-lg rounded-br-sm bg-[#d9fdd3] px-2.5 py-1.5 text-[11.5px] leading-snug text-[#111b21]">
          {prefilled || "Pre-filled message appears here."}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────── Form chrome ─────────────────────────── */

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
        <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
