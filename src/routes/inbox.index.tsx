/**
 * Team Inbox (Agent Suite) — the human-operations surface for inbound.
 *
 * Three panes, Sprinklr / Wati / AiSensy style:
 *   1. Queue rail — status tabs (You · Unassigned · Bot · All · Resolved),
 *      search, routing-mode control, and conversation cards.
 *   2. Conversation — header with the case status + assignment controls, the
 *      ported Conversations viewer (read-only history across all channels), and
 *      a reply composer that unlocks once a human owns the chat.
 *   3. Context — lead profile, campaigns, assignment, priority, tags, SLA.
 *
 * Inbound story: a Trigger starts a journey → an aiChat agent handles it (status
 * "bot") → on a needsReview / "talk to human" escalation it drops into the queue
 * (status "queued") → an agent claims it (status "assigned") and replies → they
 * resolve it (status "resolved"). The mutable overlay lives in this route.
 */

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Conversations } from "@/components/inbox/Conversations";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Search, Bot, UserCheck, Inbox as InboxIcon, Users, CheckCircle2,
  MessageCircle, MessageSquare, MessageSquareText, Phone, Send, Sparkles,
  Clock, AlertTriangle, ChevronDown, UserPlus, RotateCcw, CornerUpLeft, Hand,
  Tag, Calendar,
} from "lucide-react";
import {
  CONVERSATIONS, TEAMMATES, CURRENT_USER_ID, getTeammate, getLead,
  STATUS_META, PRIORITY_META, ROUTING_META, QUICK_REPLIES, SLA_TARGET_MIN,
  waitLabel, isSlaBreached, openLoadFor, autoPickAssignee,
  makeAgentReply,
  type Conversation, type ConversationStatus, type RoutingMode, type Teammate,
} from "@/lib/inbox-data";
import {
  formatDate, formatDateTime, relTime,
  type LeadRecord, type LeadChannel, type LeadMessage,
} from "@/lib/leads-data";

export const Route = createFileRoute("/inbox/")({
  component: InboxPage,
  head: () => ({ meta: [{ title: "Inbox · Pi Commerce Enterprise" }] }),
});

/* --------------------------------- Channel glyphs --------------------------------- */

const CHANNEL_ICON: Record<LeadChannel, typeof MessageCircle> = {
  wa: MessageCircle, sms: MessageSquare, rcs: MessageSquareText, voice: Phone,
};
const CHANNEL_TONE: Record<LeadChannel, string> = {
  wa: "text-success", sms: "text-warning", rcs: "text-ai", voice: "text-chart-1",
};

/* --------------------------------- Queue tabs --------------------------------- */

type QueueTab = "you" | "unassigned" | "bot" | "all" | "resolved";
const TAB_DEFS: { id: QueueTab; label: string; icon: typeof Bot }[] = [
  { id: "you",        label: "You",        icon: UserCheck },
  { id: "unassigned", label: "Unassigned", icon: InboxIcon },
  { id: "bot",        label: "Bot",        icon: Bot },
  { id: "all",        label: "All",        icon: Users },
  { id: "resolved",   label: "Resolved",   icon: CheckCircle2 },
];

function matchesTab(c: Conversation, tab: QueueTab): boolean {
  switch (tab) {
    case "you":        return c.status === "assigned" && c.assigneeId === CURRENT_USER_ID;
    case "unassigned": return c.status === "queued";
    case "bot":        return c.status === "bot";
    case "resolved":   return c.status === "resolved";
    case "all":        return c.status !== "resolved";
  }
}

/* --------------------------------- Root --------------------------------- */

type Overlay = { status: ConversationStatus; assigneeId: string | null };

function InboxPage() {
  // Mutable overlay on the seeded conversations + appended agent replies.
  const [overlay, setOverlay] = useState<Record<string, Overlay>>({});
  const [replies, setReplies] = useState<Record<string, LeadMessage[]>>({});
  const [routingMode, setRoutingMode] = useState<RoutingMode>("round_robin");

  const [tab, setTab] = useState<QueueTab>("unassigned");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Apply the overlay to produce the live conversation list.
  const conversations = useMemo<Conversation[]>(
    () => CONVERSATIONS.map((c) => (overlay[c.id] ? { ...c, ...overlay[c.id] } : c)),
    [overlay],
  );

  const counts = useMemo(() => {
    const acc: Record<QueueTab, number> = { you: 0, unassigned: 0, bot: 0, all: 0, resolved: 0 };
    for (const c of conversations) for (const t of TAB_DEFS) if (matchesTab(c, t.id)) acc[t.id]++;
    return acc;
  }, [conversations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = conversations.filter((c) => {
      if (!matchesTab(c, tab)) return false;
      if (q) {
        const lead = getLead(c.leadId);
        const hay = `${lead?.name ?? ""} ${lead?.phone ?? ""} ${c.leadId} ${c.intent}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Queue ordering: SLA-breached first, then priority, then longest wait.
    rows.sort((a, b) => {
      const sla = Number(isSlaBreached(b)) - Number(isSlaBreached(a));
      if (sla) return sla;
      const pr = PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
      if (pr) return pr;
      return Date.parse(a.waitingSince) - Date.parse(b.waitingSince);
    });
    return rows;
  }, [conversations, tab, search]);

  // Keep a valid selection within the current filter.
  const selected = useMemo(() => {
    const inList = filtered.find((c) => c.id === selectedId);
    return inList ?? filtered[0] ?? null;
  }, [filtered, selectedId]);

  const selectedLead = selected ? getLead(selected.leadId) ?? null : null;

  /* ----- mutations ----- */

  const applyOverlay = (conv: Conversation, next: Overlay) =>
    setOverlay((o) => ({ ...o, [conv.id]: next }));

  const assignTo = (conv: Conversation, teammateId: string) => {
    applyOverlay(conv, { status: "assigned", assigneeId: teammateId });
    const who = teammateId === CURRENT_USER_ID ? "you" : getTeammate(teammateId)?.name;
    toast.success(`Assigned to ${who}`);
  };
  const takeOver = (conv: Conversation) => {
    applyOverlay(conv, { status: "assigned", assigneeId: CURRENT_USER_ID });
    toast.success("You took over this conversation");
  };
  const returnToQueue = (conv: Conversation) => {
    applyOverlay(conv, { status: "queued", assigneeId: null });
    toast("Returned to queue");
  };
  const resolve = (conv: Conversation) => {
    applyOverlay(conv, { status: "resolved", assigneeId: conv.assigneeId });
    toast.success("Conversation resolved");
  };
  const reopen = (conv: Conversation) => {
    applyOverlay(conv, { status: "assigned", assigneeId: CURRENT_USER_ID });
    toast("Reopened — assigned to you");
  };
  const autoAssign = (conv: Conversation) => {
    const id = autoPickAssignee(conversations, routingMode, conv.id);
    if (!id) { toast.error("No agents available"); return; }
    assignTo(conv, id);
  };
  const sendReply = (conv: Conversation, body: string) => {
    const me = getTeammate(CURRENT_USER_ID)!;
    const msg = makeAgentReply(conv, me, body);
    setReplies((r) => ({ ...r, [conv.id]: [...(r[conv.id] ?? []), msg] }));
  };

  // Merge appended agent replies into the lead passed to the viewer.
  const mergedLead = useMemo<LeadRecord | null>(() => {
    if (!selectedLead || !selected) return selectedLead;
    const extra = replies[selected.id];
    if (!extra?.length) return selectedLead;
    return { ...selectedLead, messages: [...selectedLead.messages, ...extra] };
  }, [selectedLead, selected, replies]);

  return (
    <AppShell bare>
      <div className="flex h-full min-h-0">
        {/* 1 — Queue rail */}
        <aside className="flex w-[340px] shrink-0 flex-col border-r border-border bg-card/40">
          <QueueHeader
            search={search}
            onSearch={setSearch}
            routingMode={routingMode}
            onRoutingMode={setRoutingMode}
            conversations={conversations}
          />
          <QueueTabs tab={tab} onTab={setTab} counts={counts} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-12 text-center text-[12.5px] text-muted-foreground">
                Nothing here right now.
              </div>
            ) : (
              filtered.map((c) => (
                <ConversationCard
                  key={c.id}
                  conv={c}
                  lead={getLead(c.leadId)}
                  selected={selected?.id === c.id}
                  onSelect={() => setSelectedId(c.id)}
                />
              ))
            )}
          </div>
        </aside>

        {/* 2 — Conversation */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selected && mergedLead ? (
            <>
              <ConversationHeader
                conv={selected}
                lead={mergedLead}
                onTakeOver={() => takeOver(selected)}
                onAssign={(id) => assignTo(selected, id)}
                onAutoAssign={() => autoAssign(selected)}
                onReturnToQueue={() => returnToQueue(selected)}
                onResolve={() => resolve(selected)}
                onReopen={() => reopen(selected)}
                conversations={conversations}
              />
              <div className="min-h-0 flex-1 overflow-hidden">
                <Conversations lead={mergedLead} />
              </div>
              <Composer conv={selected} onSend={(body) => sendReply(selected, body)} onTakeOver={() => takeOver(selected)} />
            </>
          ) : (
            <div className="grid h-full place-items-center text-[13px] text-muted-foreground">
              Select a conversation.
            </div>
          )}
        </main>

        {/* 3 — Context */}
        {selected && selectedLead && (
          <ContextPanel conv={selected} lead={selectedLead} />
        )}
      </div>
    </AppShell>
  );
}

/* --------------------------------- Queue header --------------------------------- */

function QueueHeader({
  search, onSearch, routingMode, onRoutingMode, conversations,
}: {
  search: string;
  onSearch: (v: string) => void;
  routingMode: RoutingMode;
  onRoutingMode: (m: RoutingMode) => void;
  conversations: Conversation[];
}) {
  const onlineCount = TEAMMATES.filter((t) => t.presence === "online").length;
  return (
    <div className="shrink-0 space-y-2.5 border-b border-border p-3">
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-semibold">Team Inbox</h1>
        <PresenceCluster conversations={conversations} />
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search name, phone, intent…"
          className="h-8 pl-8 text-[12.5px]"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center justify-between rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-[11.5px] hover:bg-accent/50">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-ai" />
              Auto-assign: <span className="font-medium text-foreground">{ROUTING_META[routingMode].label}</span>
            </span>
            <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> {onlineCount} online
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[260px]">
          <DropdownMenuLabel className="text-[11px]">Assignment routing</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(Object.keys(ROUTING_META) as RoutingMode[]).map((m) => (
            <DropdownMenuItem key={m} onClick={() => onRoutingMode(m)} className="flex-col items-start gap-0.5">
              <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
                {routingMode === m && <span className="h-1.5 w-1.5 rounded-full bg-ai" />}
                {ROUTING_META[m].label}
              </span>
              <span className="text-[11px] text-muted-foreground">{ROUTING_META[m].desc}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function PresenceCluster({ conversations }: { conversations: Conversation[] }) {
  return (
    <div className="flex items-center -space-x-1.5">
      {TEAMMATES.filter((t) => t.presence !== "offline").slice(0, 4).map((t) => (
        <div key={t.id} className="relative" title={`${t.name} · ${openLoadFor(conversations, t.id)} open`}>
          <TeammateAvatar teammate={t} size="xs" ring />
          <span className={cn(
            "absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-card",
            t.presence === "online" ? "bg-success" : "bg-warning",
          )} />
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- Queue tabs --------------------------------- */

function QueueTabs({
  tab, onTab, counts,
}: {
  tab: QueueTab;
  onTab: (t: QueueTab) => void;
  counts: Record<QueueTab, number>;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2 py-1.5">
      {TAB_DEFS.map((t) => {
        const active = tab === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors",
              active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
            <span className={cn(
              "rounded-full px-1.5 text-[10px] font-semibold",
              active ? "bg-foreground/10 text-foreground" : "bg-secondary text-muted-foreground",
            )}>
              {counts[t.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- Conversation card --------------------------------- */

function ConversationCard({
  conv, lead, selected, onSelect,
}: {
  conv: Conversation;
  lead: LeadRecord | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const ChIcon = CHANNEL_ICON[conv.channel];
  const assignee = getTeammate(conv.assigneeId);
  const breached = isSlaBreached(conv);
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors",
        selected ? "bg-accent/60" : "hover:bg-accent/30",
      )}
    >
      <div className="relative shrink-0">
        <InitialsAvatar
          initials={initialsOf(lead?.name)}
          className="h-9 w-9 bg-secondary text-[12px] text-foreground"
        />
        <span className={cn(
          "absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full border border-card bg-background",
          CHANNEL_TONE[conv.channel],
        )}>
          <ChIcon className="h-2.5 w-2.5" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12.5px] font-semibold">{lead?.name ?? conv.leadId}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{relTime(conv.lastMessageAt)}</span>
        </div>
        <p className={cn("mt-0.5 truncate text-[11.5px]", conv.unread ? "font-medium text-foreground" : "text-muted-foreground")}>
          {conv.preview}
        </p>
        <div className="mt-1 flex items-center gap-1">
          <StatusPill status={conv.status} compact />
          {conv.status === "queued" && (
            <span className={cn(
              "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9.5px] font-medium",
              breached ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border bg-secondary text-muted-foreground",
            )}>
              {breached ? <AlertTriangle className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
              {waitLabel(conv.waitingSince)}
            </span>
          )}
          {assignee && <TeammateAvatar teammate={assignee} size="xs" />}
          <span className="ml-auto flex items-center gap-1">
            {conv.unread && <span className="h-2 w-2 rounded-full bg-ai" />}
            <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_META[conv.priority].tone.includes("destructive") ? "bg-destructive" : PRIORITY_META[conv.priority].tone.includes("warning") ? "bg-warning" : "bg-transparent")} />
          </span>
        </div>
      </div>
    </button>
  );
}

/* --------------------------------- Conversation header --------------------------------- */

function ConversationHeader({
  conv, lead, onTakeOver, onAssign, onAutoAssign, onReturnToQueue, onResolve, onReopen, conversations,
}: {
  conv: Conversation;
  lead: LeadRecord;
  onTakeOver: () => void;
  onAssign: (teammateId: string) => void;
  onAutoAssign: () => void;
  onReturnToQueue: () => void;
  onResolve: () => void;
  onReopen: () => void;
  conversations: Conversation[];
}) {
  const assignee = getTeammate(conv.assigneeId);
  const ownedByMe = conv.assigneeId === CURRENT_USER_ID;
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <InitialsAvatar
          initials={initialsOf(lead.name)}
          className="h-9 w-9 bg-secondary text-[12px]"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[14px] font-semibold">{lead.name}</p>
            <StatusPill status={conv.status} />
          </div>
          <p className="truncate font-mono text-[11.5px] text-muted-foreground">
            {lead.phone}
            {assignee && <span className="ml-2 text-muted-foreground/80">· {ownedByMe ? "You" : assignee.name}</span>}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {conv.status === "bot" && (
          <>
            <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={onTakeOver}>
              <Hand className="h-3.5 w-3.5" /> Take over
            </Button>
            <AssignMenu onAssign={onAssign} onAutoAssign={onAutoAssign} conversations={conversations} />
          </>
        )}
        {conv.status === "queued" && (
          <>
            <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={onTakeOver}>
              <UserCheck className="h-3.5 w-3.5" /> Assign to me
            </Button>
            <AssignMenu onAssign={onAssign} onAutoAssign={onAutoAssign} conversations={conversations} />
          </>
        )}
        {conv.status === "assigned" && (
          <>
            {!ownedByMe && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={onTakeOver}>
                <Hand className="h-3.5 w-3.5" /> Take over
              </Button>
            )}
            <AssignMenu label="Reassign" onAssign={onAssign} onAutoAssign={onAutoAssign} conversations={conversations} />
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={onReturnToQueue}>
              <CornerUpLeft className="h-3.5 w-3.5" /> Queue
            </Button>
            <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={onResolve}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
            </Button>
          </>
        )}
        {conv.status === "resolved" && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={onReopen}>
            <RotateCcw className="h-3.5 w-3.5" /> Reopen
          </Button>
        )}
      </div>
    </div>
  );
}

function AssignMenu({
  label = "Assign", onAssign, onAutoAssign, conversations,
}: {
  label?: string;
  onAssign: (teammateId: string) => void;
  onAutoAssign: () => void;
  conversations: Conversation[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]">
          <UserPlus className="h-3.5 w-3.5" /> {label}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuItem onClick={onAutoAssign} className="gap-2 text-[12.5px]">
          <Sparkles className="h-3.5 w-3.5 text-ai" /> Auto-assign
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px]">Teammates</DropdownMenuLabel>
        {TEAMMATES.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => onAssign(t.id)}
            disabled={t.presence === "offline"}
            className="gap-2 text-[12.5px]"
          >
            <TeammateAvatar teammate={t} size="xs" />
            <span className="flex-1 truncate">{t.isYou ? "You" : t.name}</span>
            <span className="text-[10.5px] text-muted-foreground">{openLoadFor(conversations, t.id)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* --------------------------------- Composer --------------------------------- */

function Composer({
  conv, onSend, onTakeOver,
}: {
  conv: Conversation;
  onSend: (body: string) => void;
  onTakeOver: () => void;
}) {
  const [text, setText] = useState("");
  const [showCanned, setShowCanned] = useState(false);
  const canReply = conv.status === "assigned" && conv.assigneeId === CURRENT_USER_ID;

  if (!canReply) {
    const hint =
      conv.status === "bot" ? "The AI agent is handling this chat."
      : conv.status === "queued" ? "This conversation is waiting in the queue."
      : conv.status === "assigned" ? `Owned by ${getTeammate(conv.assigneeId)?.name ?? "another agent"}.`
      : "This conversation is resolved.";
    const action = conv.status === "resolved" ? null : "Take over to reply";
    return (
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-secondary/30 px-5 py-3">
        <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
          {conv.status === "bot" ? <Bot className="h-4 w-4 text-ai" /> : <Clock className="h-4 w-4" />}
          {hint}
        </p>
        {action && (
          <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={onTakeOver}>
            <Hand className="h-3.5 w-3.5" /> {action}
          </Button>
        )}
      </div>
    );
  }

  const send = () => {
    const body = text.trim();
    if (!body) return;
    onSend(body);
    setText("");
  };

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 py-3">
      {showCanned && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q}
              onClick={() => { setText(q); setShowCanned(false); }}
              className="max-w-full truncate rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {q}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          onClick={() => setShowCanned((s) => !s)}
          title="Quick replies"
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border transition-colors",
            showCanned ? "bg-accent text-foreground" : "bg-background text-muted-foreground hover:bg-accent",
          )}
        >
          <Sparkles className="h-4 w-4" />
        </button>
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type a reply…  (Enter to send, Shift+Enter for a new line)"
          className="scrollbar-thin max-h-28 min-h-[36px] min-w-0 flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button size="sm" className="h-9 gap-1.5 px-3 text-[12px]" disabled={!text.trim()} onClick={send}>
          <Send className="h-3.5 w-3.5" /> Send
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------- Context panel --------------------------------- */

function ContextPanel({ conv, lead }: { conv: Conversation; lead: LeadRecord }) {
  const assignee = getTeammate(conv.assigneeId);
  const uniqueCampaigns = useMemo(() => {
    const m = new Map<string, { campaignId: string; campaignName: string }>();
    for (const c of lead.campaigns) if (!m.has(c.campaignId)) m.set(c.campaignId, c);
    return [...m.values()];
  }, [lead.campaigns]);

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col overflow-y-auto border-l border-border bg-card/40 lg:flex">
      <div className="border-b border-border px-4 py-4">
        <InitialsAvatar
          initials={initialsOf(lead.name)}
          className="h-12 w-12 bg-secondary text-[15px]"
        />
        <p className="mt-2.5 text-[14px] font-semibold">{lead.name}</p>
        <p className="font-mono text-[12px] text-muted-foreground">{lead.phone}</p>
        {lead.email && <p className="truncate text-[11.5px] text-muted-foreground">{lead.email}</p>}
      </div>

      <Section title="Case">
        <Row label="Status"><StatusPill status={conv.status} /></Row>
        <Row label="Priority">
          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium", PRIORITY_META[conv.priority].tone)}>
            {PRIORITY_META[conv.priority].label}
          </span>
        </Row>
        <Row label="Intent"><span className="text-[12px] text-foreground">{conv.intent}</span></Row>
        <Row label="Assignee">
          {assignee ? (
            <span className="flex items-center gap-1.5 text-[12px]">
              <TeammateAvatar teammate={assignee} size="xs" /> {assignee.isYou ? "You" : assignee.name}
            </span>
          ) : <span className="text-[12px] text-muted-foreground">Unassigned</span>}
        </Row>
        {conv.status === "queued" && (
          <Row label="Waiting">
            <span className={cn("inline-flex items-center gap-1 text-[12px]", isSlaBreached(conv) ? "text-destructive" : "text-foreground")}>
              <Clock className="h-3 w-3" /> {waitLabel(conv.waitingSince)}
              <span className="text-[10.5px] text-muted-foreground">/ {SLA_TARGET_MIN}m SLA</span>
            </span>
          </Row>
        )}
      </Section>

      {conv.tags.length > 0 && (
        <Section title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {conv.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] text-foreground/80">
                <Tag className="h-2.5 w-2.5" /> {t}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Lead">
        <Row label="Lead ID"><span className="font-mono text-[11.5px]">{lead.id}</span></Row>
        <Row label="Created"><span className="flex items-center gap-1 text-[12px]"><Calendar className="h-3 w-3 text-muted-foreground" />{formatDate(lead.createdAt)}</span></Row>
        <Row label="Last seen"><span className="text-[12px]" title={formatDateTime(lead.lastInteractionAt)}>{relTime(lead.lastInteractionAt)}</span></Row>
        <Row label="Messages"><span className="text-[12px]">{lead.messages.length}</span></Row>
      </Section>

      <Section title={`Journeys (${uniqueCampaigns.length})`}>
        <div className="space-y-1.5">
          {uniqueCampaigns.map((c) => (
            <div key={c.campaignId} className="truncate rounded-md border border-border bg-background px-2.5 py-1.5 text-[11.5px]" title={c.campaignName}>
              {c.campaignName}
            </div>
          ))}
        </div>
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-4 py-3">
      <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

/* --------------------------------- Shared bits --------------------------------- */

function StatusPill({ status, compact }: { status: ConversationStatus; compact?: boolean }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", m.tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot, status === "bot" && "animate-pulse")} />
      {compact ? m.short : m.label}
    </span>
  );
}

function TeammateAvatar({
  teammate, size = "sm", ring,
}: {
  teammate: Teammate;
  size?: "xs" | "sm";
  ring?: boolean;
}) {
  return (
    <InitialsAvatar
      initials={teammate.initials}
      className={cn(
        size === "xs" ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[9px]",
        teammate.tone,
        ring && "ring-2 ring-card",
      )}
    />
  );
}

function InitialsAvatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full font-semibold", className)}>
      {initials}
    </span>
  );
}

function initialsOf(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}
