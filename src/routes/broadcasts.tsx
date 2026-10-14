import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Search, MessageCircle, MessageSquare, MessageSquareText,
  CircleCheck, Clock, CircleDashed, Send,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/broadcasts")({
  component: Broadcasts,
  head: () => ({
    meta: [
      { title: "Broadcasts · Pi Commerce Enterprise" },
      { name: "description", content: "Fire a single approved template to an audience in one shot, no canvas required." },
    ],
  }),
});

// A broadcast is a one-shot template send (the Send-API / blast surface): pick a
// channel + approved template + audience, fire once. Distinct from a Workflow,
// which is a multi-step orchestrated graph. Seeded so the list renders populated.
type Channel = "whatsapp" | "sms" | "rcs";
type BroadcastStatus = "sent" | "scheduled" | "draft";

type BroadcastRow = {
  id: string;
  name: string;
  channel: Channel;
  template: string;
  audience: number;
  sent: number;
  delivered: number;
  engaged: number; // read (WA/RCS) or clicked
  status: BroadcastStatus;
  when: string;
};

const ROWS: BroadcastRow[] = [
  { id: "b1", name: "Diwali cashback blast",        channel: "whatsapp", template: "festive_cashback_v3", audience: 184200, sent: 184200, delivered: 181940, engaged: 96310, status: "sent",      when: "11 Oct 2026, 10:02" },
  { id: "b2", name: "EMI due reminder (Oct cycle)", channel: "sms",      template: "emi_due_dlt_0471",    audience: 42600,  sent: 42600,  delivered: 41880,  engaged: 7320,  status: "sent",      when: "09 Oct 2026, 08:30" },
  { id: "b3", name: "Protection plan launch",       channel: "rcs",      template: "plan_launch_rich_v2", audience: 61500,  sent: 61500,  delivered: 58120,  engaged: 22440, status: "sent",      when: "06 Oct 2026, 17:15" },
  { id: "b4", name: "KYC completion nudge",         channel: "whatsapp", template: "kyc_nudge_v1",        audience: 28750,  sent: 0,      delivered: 0,      engaged: 0,     status: "scheduled", when: "14 Oct 2026, 11:00" },
  { id: "b5", name: "Year-end loyalty bonus",       channel: "whatsapp", template: "loyalty_bonus_v4",    audience: 97400,  sent: 0,      delivered: 0,      engaged: 0,     status: "scheduled", when: "20 Oct 2026, 09:30" },
  { id: "b6", name: "Winter SKU cross-sell",        channel: "sms",      template: "xsell_winter_dlt",    audience: 0,      sent: 0,      delivered: 0,      engaged: 0,     status: "draft",     when: "Last edited 2 days ago" },
];

const CHANNEL_META: Record<Channel, { label: string; icon: typeof MessageCircle; tone: string }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle,     tone: "text-emerald-600" },
  sms:      { label: "SMS",      icon: MessageSquare,     tone: "text-sky-600" },
  rcs:      { label: "RCS",      icon: MessageSquareText, tone: "text-violet-600" },
};

const STATUS_META: Record<BroadcastStatus, { label: string; icon: typeof CircleCheck; cls: string }> = {
  sent:      { label: "Sent",      icon: CircleCheck,  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  scheduled: { label: "Scheduled", icon: Clock,        cls: "bg-amber-50 text-amber-700 border-amber-200" },
  draft:     { label: "Draft",     icon: CircleDashed, cls: "bg-secondary text-muted-foreground border-border" },
};

type Tab = "all" | "sent" | "scheduled" | "draft";
const nf = (n: number) => n.toLocaleString("en-IN");
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function Broadcasts() {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => ({
    all: ROWS.length,
    sent: ROWS.filter((r) => r.status === "sent").length,
    scheduled: ROWS.filter((r) => r.status === "scheduled").length,
    draft: ROWS.filter((r) => r.status === "draft").length,
  }), []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ROWS.filter((r) => {
      if (tab !== "all" && r.status !== tab) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.template.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tab, query]);

  return (
    <AppShell>
      <PageHeader
        title="Broadcasts"
        description="Fire a single approved template to an audience in one shot, no canvas required."
        actions={
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Broadcast composer", { description: "Pick a channel, template and audience to blast." })}>
            <Plus className="h-3.5 w-3.5" /> New broadcast
          </Button>
        }
      />

      <div className="mt-4 flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search broadcasts…"
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      <div className="mt-3">
        <PageTabs<Tab>
          tabs={[
            { id: "all", label: "All", count: counts.all },
            { id: "sent", label: "Sent", count: counts.sent },
            { id: "scheduled", label: "Scheduled", count: counts.scheduled },
            { id: "draft", label: "Draft", count: counts.draft },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Broadcast</th>
              <th className="px-4 py-2.5 font-medium">Channel</th>
              <th className="px-4 py-2.5 font-medium">Audience</th>
              <th className="px-4 py-2.5 font-medium">Delivered</th>
              <th className="px-4 py-2.5 font-medium">Engaged</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ch = CHANNEL_META[r.channel];
              const st = STATUS_META[r.status];
              const ChIcon = ch.icon;
              const StIcon = st.icon;
              return (
                <tr key={r.id} className="border-b border-border last:border-0 transition-colors hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{r.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{r.template}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <ChIcon className={cn("h-3.5 w-3.5", ch.tone)} />
                      <span className="text-[13px]">{ch.label}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{r.audience > 0 ? nf(r.audience) : "—"}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.status === "sent" ? (
                      <span className="text-foreground">{nf(r.delivered)} <span className="text-muted-foreground">({pct(r.delivered, r.sent)}%)</span></span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.status === "sent" ? (
                      <span className="text-foreground">{nf(r.engaged)} <span className="text-muted-foreground">({pct(r.engaged, r.delivered)}%)</span></span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", st.cls)}>
                      <StIcon className="h-3 w-3" /> {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">{r.when}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center">
                  <Send className="mx-auto h-6 w-6 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No broadcasts match this filter.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
