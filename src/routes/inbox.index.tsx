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
 *  - Search: id or phone only (no name — leads may not have one).
 *  - Filter icon: popover with Created At (window), Last Interaction (window),
 *    and Campaign multi-select. Same primitives as the old table's filter bar.
 *  - Top-of-page card on the right: Lead ID + Phone + Created + Last
 *    interaction + up to 3 campaign chips ( +N more popover for the rest).
 *  - Empty state: when no lead matches the filters or the store is empty.
 */

import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LEAD_RECORDS, formatDate, formatDateTime, relTime,
  CAMPAIGN_CATALOG,
  type LeadRecord, type LeadCampaignEntry, type LeadChannel,
} from "@/lib/leads-data";
import {
  Search, Filter, X, MessageCircle, MessageSquare, MessageSquareText, Phone,
  ChevronDown, Check, Calendar,
} from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Conversations } from "@/components/inbox/Conversations";

export const Route = createFileRoute("/inbox/")({
  component: InboxPage,
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
  const [search, setSearch] = useState("");
  const [campaigns, setCampaigns] = useState<Set<string>>(new Set());
  const [createdWin, setCreatedWin] = useState<DateWindow>("all");
  const [interactedWin, setInteractedWin] = useState<DateWindow>("all");

  // -------------------- filtered + sorted list --------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = LEAD_RECORDS.filter((l) => {
      if (q) {
        const idMatch = l.id.toLowerCase().includes(q);
        const phoneMatch = l.phone.replace(/\s+/g, "").toLowerCase().includes(q.replace(/\s+/g, ""));
        if (!idMatch && !phoneMatch) return false;
      }
      if (campaigns.size > 0) {
        const has = l.campaigns.some((c) => campaigns.has(c.campaignId));
        if (!has) return false;
      }
      if (!withinWindow(l.createdAt, createdWin)) return false;
      if (!withinWindow(l.lastInteractionAt, interactedWin)) return false;
      return true;
    });
    // Sort by last interaction descending — the WhatsApp-web convention.
    rows.sort((a, b) => b.lastInteractionAt.localeCompare(a.lastInteractionAt));
    return rows;
  }, [search, campaigns, createdWin, interactedWin]);

  // -------------------- selection --------------------
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Auto-select the top lead whenever the filtered list changes and either the
  // current selection is no longer in the list or there's nothing selected yet.
  useEffect(() => {
    if (filtered.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !filtered.some((l) => l.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

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
              filtered.map((l) => (
                <ChatListCard
                  key={l.id}
                  lead={l}
                  selected={l.id === selectedId}
                  onSelect={() => setSelectedId(l.id)}
                />
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
              <LeadHeaderCard lead={selected} />
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
            placeholder="Search by Lead ID or phone"
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
  lead, selected, onSelect,
}: {
  lead: LeadRecord;
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
          <span className="truncate font-mono text-[12px] font-semibold">{lead.id}</span>
          <span className="shrink-0 text-[10.5px] text-muted-foreground">
            {relTime(lead.lastInteractionAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="truncate font-mono text-[11px] text-muted-foreground">{lead.phone}</span>
          {ChIcon && ch && (
            <span
              className={cn(
                "flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-background px-1.5 py-[1px] text-[9.5px] font-medium",
                CHANNEL_TONE[ch],
              )}
              title={`Last interaction: ${CHANNEL_LABEL[ch]}`}
            >
              <ChIcon className="h-2.5 w-2.5" />
              {CHANNEL_LABEL[ch]}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/* --------------------------- Lead header card --------------------------- */

const MAX_CHIP_CAMPAIGNS = 3;

function LeadHeaderCard({ lead }: { lead: LeadRecord }) {
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
          <p className="font-mono text-[13px] font-semibold text-foreground">{lead.id}</p>
          <p className="mt-0.5 font-mono text-[12px] text-muted-foreground">{lead.phone}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
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
        <MetaField
          label="Campaigns"
          icon={null}
          value={`${uniqueCampaigns.length}`}
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
