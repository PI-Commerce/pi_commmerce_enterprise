/**
 * Inbox — the conversations-first surface (Phase 5 shell).
 *
 * A left chat-list rail and a right pane with the selected lead's context card
 * at the top and a placeholder where the Conversations component will land in
 * Phase 6. Replaces the old Leads table entirely. Everything the leads table
 * did (filter by campaign, filter by dates, search by id/phone) still works,
 * but the primary use case is now "read the conversation", not "scan the table".
 *
 *  - Cards on the left: Lead ID + Phone + last-interaction timestamp + a small
 *    channel badge for the channel of that last interaction.
 *  - Sort: last interaction descending (most recent at top). Not configurable.
 *  - Search: name, id or phone. Name was excluded while leads had none; they all
 *    carry one now, and it is what anyone actually types.
 *  - Filter icon: popover with Created At (window), Last Interaction (window),
 *    and Campaign multi-select. Same primitives as the old table's filter bar.
 *  - Top-of-page card on the right: Lead ID + Phone + Created + Last
 *    interaction + up to 3 campaign chips ( +N more popover for the rest).
 *  - Empty state: when no lead matches the filters or the store is empty.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL, STATUS_TONE, STATUS_INFO, CURRENT_OPERATOR_ID, operator,
  ESCALATION_LABEL, ESCALATION_INFO, ESCALATION_TONE,
  type EscalationStatus, type SessionStatus,
} from "@/lib/inbound";
import {
  useEscalationOverrides, setSessionEscalation, resolveEscalation,
  useAssignees, resolveAssignee, assignSession,
} from "@/lib/inbox-store";
import {
  LEAD_RECORDS, formatDate, formatDateTime, relTime,
  CAMPAIGN_CATALOG,
  type LeadRecord, type LeadCampaignEntry, type LeadChannel,
} from "@/lib/leads-data";
import {
  Search, Filter, X, MessageCircle, MessageSquare, MessageSquareText, Phone,
  ChevronDown, Check, Calendar, UserRoundCheck,
} from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Conversations } from "@/components/inbox/Conversations";

export const Route = createFileRoute("/inbox/")({
  component: InboxPage,
  // `?lead=l_1004` preselects a lead. Used by Inbound's session summary to hand
  // off to the conversation, which lives here rather than in the session sheet.
  validateSearch: (raw: Record<string, unknown>): { lead?: string } => ({
    lead: typeof raw.lead === "string" ? raw.lead : undefined,
  }),
  head: () => ({ meta: [{ title: "Inbox · Pi Commerce Enterprise" }] }),
});

/* --------------------------- Date-window helper --------------------------- */

type DateWindow = "all" | "7d" | "30d" | "90d";
const DATE_WINDOWS: { value: DateWindow; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7d",  label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];
function daysAgo(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}
function withinWindow(iso: string | undefined, win: DateWindow): boolean {
  if (!iso || win === "all") return true;
  const d = daysAgo(iso);
  return win === "7d" ? d <= 7 : win === "30d" ? d <= 30 : d <= 90;
}

/* --------------------------- Channel badge --------------------------- */

const CHANNEL_ICON: Record<LeadChannel, typeof MessageCircle> = {
  wa: MessageCircle,
  sms: MessageSquare,
  rcs: MessageSquareText,
  voice: Phone,
};
const CHANNEL_LABEL: Record<LeadChannel, string> = {
  wa: "WhatsApp",
  sms: "SMS",
  rcs: "RCS",
  voice: "Voice",
};
const CHANNEL_TONE: Record<LeadChannel, string> = {
  wa: "text-success",
  sms: "text-warning",
  rcs: "text-ai",
  voice: "text-chart-1",
};

/** Returns the channel of the most recent message on this lead, or `undefined`
 *  when the lead has no messages at all. */
function lastChannelOf(lead: LeadRecord): LeadChannel | undefined {
  if (!lead.messages.length) return undefined;
  const last = [...lead.messages].sort((a, b) => a.at.localeCompare(b.at))[lead.messages.length - 1];
  return last.channel;
}

/* --------------------------- Root page --------------------------- */

function InboxPage() {
  // -------------------- filters --------------------
  /* Read once at the top and passed down: the rail, the ordering and the header
     all have to agree about one session's escalation, and three independent
     reads is how they stop agreeing. */
  const escalations = useEscalationOverrides();
  const assignees = useAssignees();

  /* Both axes resolved in one place and passed down. The rail groups by assignee
     and sorts by escalation, so a second read that disagrees puts a row in one
     group and sorts it as though it were in another. */
  const assigneeOf = useCallback(
    (l: LeadRecord) => resolveAssignee(assignees, l.inbound?.sessionId, l.inbound?.assigneeId),
    [assignees],
  );

  const [search, setSearch] = useState("");
  const [campaigns, setCampaigns] = useState<Set<string>>(new Set());
  const [createdWin, setCreatedWin] = useState<DateWindow>("all");
  const [interactedWin, setInteractedWin] = useState<DateWindow>("all");

  // -------------------- filtered + sorted list --------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = LEAD_RECORDS.filter((l) => {
      if (q) {
        const nameMatch = l.name.toLowerCase().includes(q);
        const idMatch = l.id.toLowerCase().includes(q);
        const phoneMatch = l.phone.replace(/\s+/g, "").toLowerCase().includes(q.replace(/\s+/g, ""));
        if (!nameMatch && !idMatch && !phoneMatch) return false;
      }
      if (campaigns.size > 0) {
        const has = l.campaigns.some((c) => campaigns.has(c.campaignId));
        if (!has) return false;
      }
      if (!withinWindow(l.createdAt, createdWin)) return false;
      if (!withinWindow(l.lastInteractionAt, interactedWin)) return false;
      return true;
    });
    /* Recency descending within a bucket, not across the whole list. Straight
       recency is the messaging-app convention and it is the wrong one here: an
       operator opening a queue is not browsing a chat history, they are asking what
       is theirs and what is unanswered. Bucketing answers that; recency orders it. */
    rows.sort((a, b) => b.lastInteractionAt.localeCompare(a.lastInteractionAt));
    return rows;
  }, [search, campaigns, createdWin, interactedWin]);

  /**
   * The rail, as an operator reads it: mine, then unowned, then everyone else's.
   *
   * Three buckets rather than the two asked for, because "assigned to someone else"
   * and "assigned to nobody" are opposite situations wearing the same absence. Work
   * with no owner is the queue's actual backlog — it is the thing an operator can
   * pick up — so burying it among other people's threads would hide the only group
   * they can act on beyond their own.
   *
   * Closed threads stay in their owner's bucket rather than forming a fourth. They
   * are history, and history belongs with the person it happened to.
   */
  const buckets = useMemo(() => {
    const me = CURRENT_OPERATOR_ID;
    /* "Needs a person" sorts above everything, including Open. An open thread is
       waiting on time; a marked one is waiting on a person, and a person is
       exactly who is reading this rail. */
    const rank = (l: LeadRecord) => {
      if (l.inbound
          && resolveEscalation(escalations, l.inbound.sessionId, l.inbound.escalation) === "needed")
        return -1;
      const st = l.inbound?.status;
      return st === "open" ? 0 : st === "pending" ? 1 : st === "expired" ? 2 : 3;
    };
    const order = (rows: LeadRecord[]) =>
      rows.slice().sort((a, b) => rank(a) - rank(b) ||
        b.lastInteractionAt.localeCompare(a.lastInteractionAt));

    const mine: LeadRecord[] = [], unassigned: LeadRecord[] = [], others: LeadRecord[] = [];
    for (const l of filtered) {
      const who = assigneeOf(l);
      if (who === me) mine.push(l);
      else if (!who) unassigned.push(l);
      else others.push(l);
    }
    return [
      { key: "mine", label: "Assigned to you", rows: order(mine) },
      { key: "unassigned", label: "Unassigned", rows: order(unassigned) },
      { key: "others", label: "Assigned to others", rows: order(others) },
    ].filter((g) => g.rows.length > 0);
  }, [filtered, escalations, assigneeOf]);

  // -------------------- selection --------------------
  const { lead: leadParam } = Route.useSearch();
  const [selectedId, setSelectedId] = useState<string | null>(leadParam ?? null);
  // A ?lead= param wins once, on arrival. Tracked so that navigating in with the
  // same param twice still re-selects, but a later manual pick isn't overridden.
  const honouredParam = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (leadParam && honouredParam.current !== leadParam) {
      honouredParam.current = leadParam;
      setSelectedId(leadParam);
    }
  }, [leadParam]);
  // Auto-select the top lead whenever the filtered list changes and either the
  // current selection is no longer in the list or there's nothing selected yet.
  useEffect(() => {
    if (filtered.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !filtered.some((l) => l.id === selectedId)) {
      /* The top of the rail, which is bucket order — not `filtered[0]`, which is
         whatever happened to be most recent and may sit three groups down. */
      setSelectedId(buckets[0]?.rows[0]?.id ?? filtered[0].id);
    }
  }, [filtered, buckets, selectedId]);

  const selected = useMemo(
    () => filtered.find((l) => l.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  const activeFilterCount =
    (createdWin !== "all" ? 1 : 0) +
    (interactedWin !== "all" ? 1 : 0) +
    (campaigns.size > 0 ? 1 : 0);

  return (
    <AppShell bare>
      <div className="flex h-full min-h-0">
        {/* Left rail: filters + chat list */}
        <aside className="flex w-[360px] shrink-0 flex-col border-r border-border bg-card/40">
          <TopFilters
            search={search}
            onSearchChange={setSearch}
            createdWin={createdWin}
            interactedWin={interactedWin}
            campaigns={campaigns}
            activeFilterCount={activeFilterCount}
            onCreatedWinChange={setCreatedWin}
            onInteractedWinChange={setInteractedWin}
            onCampaignsChange={setCampaigns}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <EmptyRail
                hasQuery={search.length > 0 || activeFilterCount > 0}
                onClear={() => {
                  setSearch("");
                  setCampaigns(new Set());
                  setCreatedWin("all");
                  setInteractedWin("all");
                }}
              />
            ) : (
              buckets.map((g) => (
                <div key={g.key}>
                  <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-border/60 bg-background/95 px-3 py-1.5 backdrop-blur">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {g.label}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground">{g.rows.length}</span>
                  </div>
                  {g.rows.map((l) => (
                    <ChatListCard
                      key={l.id}
                      lead={l}
                      escalation={
                        l.inbound
                          ? resolveEscalation(escalations, l.inbound.sessionId, l.inbound.escalation)
                          : "none"
                      }
                      assigneeId={assigneeOf(l)}
                      selected={l.id === selectedId}
                      onSelect={() => setSelectedId(l.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
          <div className="shrink-0 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            {filtered.length} of {LEAD_RECORDS.length} leads
          </div>
        </aside>

        {/* Right pane: selected lead card + conversations placeholder */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selected ? (
            <>
              <LeadHeaderCard
                lead={selected}
                escalations={escalations}
                assigneeId={assigneeOf(selected)}
              />
              <div className="min-h-0 flex-1">
                <Conversations lead={selected} />
              </div>
            </>
          ) : (
            <div className="grid h-full place-items-center text-[13px] text-muted-foreground">
              No lead selected.
            </div>
          )}
        </main>
      </div>
    </AppShell>
  );
}

/* --------------------------- Top filters --------------------------- */

function TopFilters({
  search, onSearchChange,
  createdWin, interactedWin, campaigns, activeFilterCount,
  onCreatedWinChange, onInteractedWinChange, onCampaignsChange,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  createdWin: DateWindow;
  interactedWin: DateWindow;
  campaigns: Set<string>;
  activeFilterCount: number;
  onCreatedWinChange: (w: DateWindow) => void;
  onInteractedWinChange: (w: DateWindow) => void;
  onCampaignsChange: (s: Set<string>) => void;
}) {
  return (
    <div className="shrink-0 space-y-2 border-b border-border p-3">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, lead ID or phone"
            className="h-8 pl-8 text-[12.5px]"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "relative grid h-8 w-8 place-items-center rounded-md border border-border transition-colors",
                activeFilterCount > 0
                  ? "border-foreground/30 bg-accent text-foreground"
                  : "bg-background text-muted-foreground hover:bg-accent",
              )}
              aria-label="Filters"
            >
              <Filter className="h-3.5 w-3.5" />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-foreground px-1 text-[9px] font-semibold text-background">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[280px] space-y-3 p-3">
            <FilterField label="Created">
              <DateWindowSelect value={createdWin} onChange={onCreatedWinChange} />
            </FilterField>
            <FilterField label="Last interaction">
              <DateWindowSelect value={interactedWin} onChange={onInteractedWinChange} />
            </FilterField>
            <FilterField label="Campaign">
              <CampaignMultiPicker value={campaigns} onChange={onCampaignsChange} />
            </FilterField>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onCreatedWinChange("all");
                  onInteractedWinChange("all");
                  onCampaignsChange(new Set());
                }}
              >
                <X className="h-3 w-3" /> Reset filters
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function DateWindowSelect({
  value, onChange,
}: {
  value: DateWindow;
  onChange: (v: DateWindow) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {DATE_WINDOWS.map((w) => (
        <button
          key={w.value}
          onClick={() => onChange(w.value)}
          className={cn(
            "rounded-md border px-2 py-1 text-left text-[11.5px] transition-colors",
            value === w.value
              ? "border-foreground/40 bg-accent text-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-accent/50",
          )}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

function CampaignMultiPicker({
  value, onChange,
}: {
  value: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) => {
    const next = new Set(value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const summary =
    value.size === 0
      ? "All campaigns"
      : value.size === 1
        ? CAMPAIGN_CATALOG.find((c) => c.id === [...value][0])?.name ?? "1 campaign"
        : `${value.size} campaigns`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex h-8 w-full items-center justify-between rounded-md border border-border bg-background px-2.5 text-left text-[12px] hover:bg-accent/50">
          <span className={cn(value.size === 0 && "text-muted-foreground")}>{summary}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[260px] w-[240px] overflow-y-auto p-1">
        {CAMPAIGN_CATALOG.map((c) => {
          const on = value.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-accent"
            >
              <span
                className={cn(
                  "grid h-4 w-4 shrink-0 place-items-center rounded border",
                  on ? "border-foreground bg-foreground text-background" : "border-border",
                )}
              >
                {on && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/* --------------------------- Chat-list card --------------------------- */

function ChatListCard({
  lead, escalation, assigneeId, selected, onSelect,
}: {
  lead: LeadRecord;
  /** Already resolved against the operator's edits by the page. */
  escalation: EscalationStatus;
  assigneeId?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const ch = lastChannelOf(lead);
  const ChIcon = ch ? CHANNEL_ICON[ch] : null;
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2 border-b border-border/60 px-3 py-2.5 text-left transition-colors",
        selected ? "bg-accent/60" : "hover:bg-accent/30",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          {/* The name leads. The id is a support handle, not how anyone recognises a
              person, and a rail of `l_1044` rows is an inbox you cannot read. */}
          <span className="truncate text-[12.5px] font-semibold">{lead.name}</span>
          <span className="shrink-0 text-[10.5px] text-muted-foreground">
            {relTime(lead.lastInteractionAt)}
          </span>
        </div>
        {/* Two lines, and the second holds at most three things. The rail is read
            by scanning, and a row that carried the lead id, the phone, a channel
            chip, two state chips, an overflow count, a name and a tag was ten
            things to take in before deciding whether to click. Everything cut
            from here is on the header card, one click away, where there is room
            to lay it out properly. */}
        {lead.inbound && (
          <div className="mt-1 flex items-center gap-1.5">
            <StateChip
              status={lead.inbound.status}
              escalation={escalation}
              disposition={lead.inbound.disposition}
            />
            {/* Suppressed in the "Assigned to you" group — the heading already said
                it, and repeating your own name down every row is noise. */}
            {assigneeId && assigneeId !== CURRENT_OPERATOR_ID && (
              <span className="shrink-0 truncate text-[10px] text-muted-foreground">
                {operator(assigneeId)?.name}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * One chip for "what state is this in", not two.
 *
 * Status and escalation are separate axes and stay separate in the model — but a
 * rail is read by scanning, and in a list the two answer one question. Showing
 * both put "Needs a person" and "Open" side by side on the same row, which reads
 * as two facts when it is one situation.
 *
 * Escalation wins when it is live, because it is the only state that is waiting on
 * the reader rather than on time. Both axes are still shown in full on the header
 * card, where there is room for the distinction to mean something.
 */
function StateChip({
  status, escalation, disposition,
}: {
  status: SessionStatus;
  escalation: EscalationStatus;
  disposition?: string;
}) {
  const needsPerson = escalation === "needed";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-[1px] text-[9.5px] font-medium",
        needsPerson ? ESCALATION_TONE.needed : STATUS_TONE[status],
      )}
      title={needsPerson
        ? `${ESCALATION_INFO.needed}${disposition ? ` Disposition: ${disposition}` : ""}`
        : STATUS_INFO[status]}
    >
      {needsPerson && <UserRoundCheck className="h-2.5 w-2.5" />}
      {needsPerson ? ESCALATION_LABEL.needed : STATUS_LABEL[status]}
    </span>
  );
}

/* --------------------------- Lead header card --------------------------- */

const MAX_CHIP_CAMPAIGNS = 3;

/**
 * The escalation mark, as a control rather than a label.
 *
 * The agent set this from its disposition when the conversation closed. That is
 * a guess made by something that has just left the room; the operator reading
 * the thread is the one who can tell whether a person is really needed. So the
 * mark opens — three states, and the agent's own answer named so the operator
 * can see what they are overriding and put it back.
 *
 * Shown even at "No escalation", unlike the rail badge. On a row, a badge for
 * the common case is noise; here it is the only way to escalate a thread the
 * agent closed confidently and wrongly.
 */
function EscalationControl({
  sessionId, agentSet, current, disposition, assigneeId,
}: {
  sessionId: string;
  agentSet: EscalationStatus;
  current: EscalationStatus;
  disposition?: string;
  assigneeId?: string;
}) {
  const edited = current !== agentSet;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-[1px] text-[10.5px] font-medium transition-colors hover:brightness-95",
            ESCALATION_TONE[current],
          )}
          title={ESCALATION_INFO[current]}
        >
          <UserRoundCheck className="h-3 w-3" />
          {ESCALATION_LABEL[current]}
          {disposition && !edited && (
            <span className="font-normal opacity-80">· {disposition}</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-1">
        {(["needed", "handled", "none"] as EscalationStatus[]).map((e) => (
          <button
            key={e}
            onClick={() => {
              setSessionEscalation(sessionId, e, agentSet);
              /* Marking something handled without anybody holding it produced a
                 row sitting in Unassigned labelled "Handled by a person" — two
                 states that contradict each other. Whoever says it is handled is
                 the person handling it. */
              if (e === "handled" && !assigneeId) {
                assignSession(sessionId, CURRENT_OPERATOR_ID, e);
              }
            }}
            className={cn(
              "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent",
              e === current && "bg-accent",
            )}
          >
            <Check className={cn("mt-0.5 h-3 w-3 shrink-0", e === current ? "opacity-100" : "opacity-0")} />
            <span className="min-w-0">
              <span className="block text-[12px] font-medium">
                {ESCALATION_LABEL[e]}
                {e === agentSet && (
                  <span className="ml-1 font-normal text-muted-foreground">· agent&rsquo;s</span>
                )}
              </span>
              <span className="block text-[10.5px] leading-snug text-muted-foreground">
                {ESCALATION_INFO[e]}
              </span>
            </span>
          </button>
        ))}
        {disposition && (
          <p className="border-t border-border px-2 pb-1 pt-1.5 text-[10.5px] leading-snug text-muted-foreground">
            The agent closed this as <span className="font-medium">{disposition}</span>.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Who holds this conversation, and the one action that changes it.
 *
 * Assignment used to be a label. `assigneeId` was written only by the seed
 * generator, so a conversation the agent marked for a person landed in
 * Unassigned and nothing in the product could move it out — a backlog an
 * operator could read and never claim.
 *
 * Claiming is a button rather than only a side-effect of replying, because the
 * two are different moments: you often take something to stop a colleague
 * starting it, well before you have worked out what to say.
 */
function AssignControl({
  sessionId, assigneeId, escalation,
}: {
  sessionId: string;
  assigneeId?: string;
  escalation: EscalationStatus;
}) {
  const mine = assigneeId === CURRENT_OPERATOR_ID;
  const label = !assigneeId
    ? "Unassigned"
    : mine ? "Assigned to you" : `Assigned to ${operator(assigneeId)?.name}`;

  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <button
        onClick={() => assignSession(sessionId, mine ? null : CURRENT_OPERATOR_ID, escalation)}
        className="rounded-md border border-border px-1.5 py-[1px] text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title={mine
          ? "Put it back in the queue for somebody else"
          : assigneeId
            ? "Take it from them — the rail will show it as yours"
            : "Claim it so nobody else starts on it"}
      >
        {mine ? "Release" : assigneeId ? "Take over" : "Assign to me"}
      </button>
    </span>
  );
}

function LeadHeaderCard({
  lead, escalations, assigneeId,
}: {
  lead: LeadRecord;
  escalations: ReadonlyMap<string, EscalationStatus>;
  assigneeId?: string;
}) {
  const uniqueCampaigns = useMemo(() => {
    const m = new Map<string, LeadCampaignEntry>();
    for (const c of lead.campaigns) if (!m.has(c.campaignId)) m.set(c.campaignId, c);
    return [...m.values()];
  }, [lead.campaigns]);
  const shown = uniqueCampaigns.slice(0, MAX_CHIP_CAMPAIGNS);
  const overflow = uniqueCampaigns.slice(MAX_CHIP_CAMPAIGNS);

  return (
    <div className="border-b border-border bg-background px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-foreground">{lead.name}</p>
            {lead.inbound && (
              <span
                className={cn(
                  "rounded-full border px-2 py-[1px] text-[10.5px] font-medium",
                  STATUS_TONE[lead.inbound.status],
                )}
              >
                {STATUS_LABEL[lead.inbound.status]}
              </span>
            )}
            {lead.inbound && (
              <EscalationControl
                sessionId={lead.inbound.sessionId}
                agentSet={lead.inbound.escalation}
                current={resolveEscalation(escalations, lead.inbound.sessionId, lead.inbound.escalation)}
                disposition={lead.inbound.disposition}
                assigneeId={assigneeId}
              />
            )}
            {lead.inbound && (
              <AssignControl
                sessionId={lead.inbound.sessionId}
                assigneeId={assigneeId}
                escalation={resolveEscalation(escalations, lead.inbound.sessionId, lead.inbound.escalation)}
              />
            )}
            {lead.inbound && lead.inbound.openCount > 1 && (
              <span className="text-[11.5px] text-muted-foreground">
                {lead.inbound.openCount} conversations open
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">
            {lead.id} · {lead.phone}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            Campaigns
          </span>
          {uniqueCampaigns.length === 0 && (
            <span className="text-[11px] text-muted-foreground">None</span>
          )}
          {shown.map((c) => (
            <span
              key={c.campaignId}
              className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-[11px] text-foreground/80"
              title={c.campaignName}
            >
              <span className="truncate">{c.campaignName}</span>
            </span>
          ))}
          {overflow.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent">
                  +{overflow.length} more
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="max-h-[220px] w-[240px] overflow-y-auto p-1">
                {overflow.map((c) => (
                  <div
                    key={c.campaignId}
                    className="truncate rounded-md px-2 py-1.5 text-[12px] hover:bg-accent"
                  >
                    {c.campaignName}
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 text-[11.5px] text-muted-foreground sm:grid-cols-4">
        <MetaField
          label="Created"
          icon={<Calendar className="h-3 w-3" />}
          value={formatDate(lead.createdAt)}
        />
        <MetaField
          label="Last interaction"
          icon={<Calendar className="h-3 w-3" />}
          value={formatDateTime(lead.lastInteractionAt)}
        />
        {/* Campaigns are already named as chips above — a count beside them said
            nothing the chips did not. */}
        <MetaField
          label="Disposition"
          icon={null}
          value={lead.inbound?.disposition ?? "—"}
        />
        <MetaField
          label="Messages"
          icon={null}
          value={`${lead.messages.length}`}
        />
      </div>
    </div>
  );
}

function MetaField({
  label, icon, value,
}: {
  label: string;
  icon: React.ReactNode | null;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
        {label}
      </p>
      <p className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] text-foreground">
        {icon}
        {value}
      </p>
    </div>
  );
}

/* --------------------------- Empty rail --------------------------- */

function EmptyRail({ hasQuery, onClear }: { hasQuery: boolean; onClear: () => void }) {
  if (hasQuery) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-[12.5px] text-muted-foreground">No leads match your filters.</p>
        <button
          onClick={onClear}
          className="mt-2 text-[11.5px] font-medium text-foreground underline hover:no-underline"
        >
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <div className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">
      Leads appear here after a campaign run creates them.
    </div>
  );
}
