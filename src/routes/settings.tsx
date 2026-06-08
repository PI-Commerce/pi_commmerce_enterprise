import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/settings")({
  component: Settings,
  head: () => ({ meta: [{ title: "Settings · Pi Commerce Enterprise" }] }),
});

type Tab = "profile" | "team" | "billing";

function Settings() {
  const [tab, setTab] = useState<Tab>("profile");
  return (
    <AppShell>
      <PageHeader title="Settings" description="Workspace, members, and billing." />
      <PageTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "profile", label: "Profile" },
          { id: "team", label: "Team" },
          { id: "billing", label: "Billing & Usage" },
        ]}
      />
      {tab === "profile" && <Profile />}
      {tab === "team" && <Team />}
      {tab === "billing" && <Billing />}
    </AppShell>
  );
}

function Profile() {
  return (
    <div className="max-w-xl space-y-5 rounded-xl border border-border bg-card p-5">
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Full name</Label>
        <Input defaultValue="Aman Sharma" className="h-9" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Email</Label>
        <Input defaultValue="aman@piwealth.in" className="h-9" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Workspace</Label>
        <Input defaultValue="Pi Commerce — Production" className="h-9" />
      </div>
      <div className="flex justify-end pt-2"><Button size="sm" className="h-8 text-xs">Save changes</Button></div>
    </div>
  );
}

const MEMBERS = [
  { name: "Aman Sharma", email: "aman@piwealth.in", role: "Owner", last: "Just now" },
  { name: "Priya Iyer", email: "priya@piwealth.in", role: "Admin", last: "12m ago" },
  { name: "Ria Mehta", email: "ria@piwealth.in", role: "Editor", last: "2h ago" },
  { name: "Ops bot", email: "ops@piwealth.in", role: "Service account", last: "—" },
];

function Team() {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Members</h2>
          <Button size="sm" variant="outline" className="h-8 text-xs">Invite</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-2.5 text-left font-medium">Name</th><th className="px-4 py-2.5 text-left font-medium">Role (RBAC)</th><th className="px-4 py-2.5 text-left font-medium">Last active</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {MEMBERS.map((m) => (
              <tr key={m.email}>
                <td className="px-4 py-3">
                  <p className="font-medium">{m.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">{m.email}</p>
                </td>
                <td className="px-4 py-3 text-[12.5px]"><span className="rounded-full border border-border bg-secondary px-2 py-0.5">{m.role}</span></td>
                <td className="px-4 py-3 text-[12px] text-muted-foreground">{m.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Audit log</h2>
        <p className="text-[11.5px] text-muted-foreground">All workspace events, retained 90 days.</p>
        <ul className="mt-3 space-y-2 text-[12.5px]">
          {[
            ["Priya published campaign Reactivation v0.7", "12m ago"],
            ["Aman rotated API key pi_live_…a92f", "1h ago"],
            ["Ops bot ran sync · 42,318 audience members", "3h ago"],
          ].map(([t, w]) => (
            <li key={t} className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0">
              <span>{t}</span><span className="text-muted-foreground">{w}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Billing() {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-2 rounded-xl border border-border bg-card p-5">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Current plan</p>
        <h2 className="mt-1 text-xl font-semibold">Enterprise · ₹4,80,000 / yr</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">Includes unlimited campaigns, 10 seats, dedicated CSM.</p>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
          <Quota label="AI credits" used={62} total={100} unit="%" />
          <Quota label="Voice minutes" used={18400} total={50000} unit="min" />
          <Quota label="Messages sent" used={1248000} total={5000000} unit="" />
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">Billing contact</h3>
        <p className="mt-1 text-[12.5px] text-muted-foreground">billing@piwealth.in</p>
        <Button size="sm" variant="outline" className="mt-4 h-8 w-full text-xs">Manage invoices</Button>
      </div>
    </div>
  );
}

function Quota({ label, used, total, unit }: { label: string; used: number; total: number; unit: string }) {
  const pct = Math.min(100, (used / total) * 100);
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{used.toLocaleString()}<span className="text-muted-foreground"> / {total.toLocaleString()} {unit}</span></p>
      <div className="mt-1.5 h-1.5 rounded-full bg-secondary">
        <div className={`h-full rounded-full ${pct > 80 ? "bg-warning" : "bg-foreground"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
