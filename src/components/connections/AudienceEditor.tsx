import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, Loader2, Play, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  discoverAudiences, testSearch, SEARCH_TEMPLATE,
  type Platform, type SavedAudience, type SearchTest,
} from "@/lib/connections";

/**
 * Define one audience on a connection.
 *
 * Shared deliberately: the same form runs inside the connect flow and again on the
 * connection page every time someone adds another search. That repetition is the
 * point of the container model — the credential and the roles are answered once,
 * and this is the only thing you come back for.
 *
 * The two modes are not two styles of the same input. A saved list is *discovered*,
 * so it is a pick; a search is *authored*, so it is an editor with a test. The test
 * is not a nicety: a search has no size until it has been run, and the size is what
 * the audience row displays and what the run reports against. That data dependency
 * is why saving is gated on a passing test rather than on a policy about diligence.
 */

export type AudienceDraft = {
  name: string;
  mode: "list" | "query";
  /** Criteria, when mode is "query". */
  query: string;
  /** Chosen list id, when mode is "list". */
  listId: string;
  cadence: SavedAudience["cadence"];
  /** Result of the last test. Cleared whenever the criteria change. */
  tested: SearchTest | null;
};

const CADENCES: SavedAudience["cadence"][] = ["15 min", "Hourly", "Daily", "Weekly"];

/** A draft in its opening state — query mode when the platform supports it. */
export function emptyDraft(plat: Platform): AudienceDraft {
  return {
    name: "",
    mode: plat.queryNoun ? "query" : "list",
    query: plat.queryNoun ? SEARCH_TEMPLATE : "",
    listId: "",
    cadence: "Daily",
    tested: null,
  };
}

/** Whether this draft describes something we could actually go and fetch. */
export function draftReady(d: AudienceDraft): boolean {
  if (!d.name.trim()) return false;
  return d.mode === "query" ? !!d.tested?.ok : !!d.listId;
}

export function draftToAudience(d: AudienceDraft, plat: Platform): SavedAudience {
  if (d.mode === "list") {
    const list = discoverAudiences(plat.key).find((a) => a.id === d.listId)!;
    return { ...list, name: d.name.trim() || list.name, cadence: d.cadence };
  }
  return {
    id: `aud_${Date.now().toString(36)}`,
    name: d.name.trim(),
    cadence: d.cadence,
    size: d.tested?.ok ? d.tested.count : 0,
    mode: "query",
    query: d.query,
  };
}

export function AudienceEditor({
  plat, draft, onChange, existingIds = [],
}: {
  plat: Platform;
  draft: AudienceDraft;
  onChange: (d: AudienceDraft) => void;
  /** Lists already on this connection — offering them again would be a no-op. */
  existingIds?: string[];
}) {
  const [testing, setTesting] = useState(false);
  const set = (patch: Partial<AudienceDraft>) => onChange({ ...draft, ...patch });

  const lists = discoverAudiences(plat.key).filter((a) => !existingIds.includes(a.id));

  const runTest = () => {
    setTesting(true);
    window.setTimeout(() => {
      set({ tested: testSearch(plat.key, draft.query) });
      setTesting(false);
    }, 900);
  };

  return (
    <div className="space-y-4">
      {/* ───────────────── Mode. Only when both modes actually exist. ──────────── */}
      {plat.queryNoun && (
        <div className="grid grid-cols-2 rounded-md border border-input bg-background p-0.5">
          {(["query", "list"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => set({ mode: m })}
              className={cn(
                "h-8 rounded text-[12px] font-medium transition-colors",
                draft.mode === m ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "query" ? plat.queryNoun : `Saved ${plat.audienceNoun}`}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Name this audience <span className="text-destructive">*</span></Label>
        <Input
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={draft.mode === "query" ? "DPD 15–30" : "Pick one below"}
          className="h-9 text-sm"
          maxLength={60}
        />
        <p className="text-[11px] text-muted-foreground">
          This is what you'll pick on a run, so name it after the people in it.
        </p>
      </div>

      {/* ──────────────────────────── Authored search ─────────────────────────── */}
      {draft.mode === "query" ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">
              {plat.queryNoun} criteria <span className="text-destructive">*</span>
            </Label>
            <Button
              type="button" variant="outline" size="sm"
              className="h-7 shrink-0 gap-1.5 text-[11px]"
              disabled={testing || !draft.query.trim()}
              onClick={runTest}
            >
              {testing
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Running…</>
                : <><Play className="h-3 w-3" /> Test search</>}
            </Button>
          </div>

          <Textarea
            value={draft.query}
            onChange={(e) => set({ query: e.target.value, tested: null })}
            spellCheck={false}
            rows={7}
            className="resize-y font-mono text-[11.5px] leading-relaxed"
          />

          {draft.tested?.ok === true && (
            <div className="rounded-md border border-success/25 bg-success/8 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[12px] font-medium">
                <Check className="h-3.5 w-3.5 text-success" />
                {draft.tested.count.toLocaleString()} leads match
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                First few: {draft.tested.sample.join(", ")}
              </p>
            </div>
          )}

          {draft.tested?.ok === false && (
            <p className="flex items-start gap-1.5 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[11px] leading-relaxed text-destructive">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              {draft.tested.error}
            </p>
          )}

          {!draft.tested && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Run it once before saving. A search has no size until it has been run, and
              a search that matches nobody is only visible here — a run would simply
              process zero people and look like it worked.
            </p>
          )}
        </div>
      ) : (
        /* ─────────────────────────── Discovered list ────────────────────────── */
        <div className="space-y-1.5">
          <Label className="text-xs">
            Which {plat.audienceNoun}? <span className="text-destructive">*</span>
          </Label>
          {lists.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-[12px] text-muted-foreground">
              Every {plat.audienceNoun} on this account is already added.
              {plat.queryNoun && ` Use ${plat.queryNoun} to define a new one.`}
            </p>
          ) : (
            <div className="space-y-1.5">
              {lists.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => set({ listId: a.id, name: draft.name.trim() || a.name })}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                    draft.listId === a.id
                      ? "border-primary/40 bg-primary/5"
                      : "border-input bg-background hover:bg-accent/40",
                  )}
                >
                  <span className="truncate text-[12.5px] font-medium">{a.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {a.size.toLocaleString()} records
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────── Cadence ────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-xs">How often we look</Label>
        <div className="grid grid-cols-4 rounded-md border border-input bg-background p-0.5">
          {CADENCES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set({ cadence: c })}
              className={cn(
                "h-8 rounded text-[12px] font-medium transition-colors",
                draft.cadence === c ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Only people who newly qualify are picked up. Nobody is contacted twice for the
          same run.
        </p>
      </div>
    </div>
  );
}
