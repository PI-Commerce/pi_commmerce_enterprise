/**
 * Settings surface.
 *
 * Workspace administration only. Developer surfaces (API keys, webhooks, etc.)
 * moved to /developer. Users tab mirrors the live product's user management.
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil } from "lucide-react";
import { SEED_USERS, type UserRow } from "@/lib/users";

export const Route = createFileRoute("/settings")({
  component: Settings,
  head: () => ({ meta: [{ title: "Settings · Pi Commerce Enterprise" }] }),
});

type Tab = "users" | "usage-billing" | "team";

function Settings() {
  const [tab, setTab] = useState<Tab>("users");
  return (
    <AppShell>
      <PageHeader
        title="Settings"
        description="Workspace administration: users, usage and billing."
      />
      <PageTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "users",         label: "Users" },
          { id: "usage-billing", label: "Usage & Billing", disabled: true },
          { id: "team",          label: "Team",            disabled: true },
        ]}
      />
      {tab === "users" ? (
        <UsersTab />
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
          <p className="text-[13px] font-medium">Workspace settings coming soon</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
            Usage &amp; Billing and Team management will land here. For API keys
            and webhooks, head to Developer.
          </p>
        </div>
      )}
    </AppShell>
  );
}

function UsersTab() {
  const users = SEED_USERS;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12.5px] text-muted-foreground">
          Manage the members of your organisation.
        </p>
        <Button size="sm" className="h-8 gap-1.5 text-[12.5px]">
          <Plus className="h-3.5 w-3.5" />
          Create User
        </Button>
      </div>
      <div className="rounded-lg border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Id</TableHead>
              <TableHead className="w-[200px]">Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-[140px]">Role</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[180px]">Updated At</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-[12.5px] text-muted-foreground">{u.id}</TableCell>
                <TableCell className="text-[13px]">{u.username}</TableCell>
                <TableCell className="text-[12.5px] text-muted-foreground">{u.email}</TableCell>
                <TableCell className="font-mono text-[12px] text-muted-foreground">{u.role}</TableCell>
                <TableCell><StatusPill row={u} /></TableCell>
                <TableCell className="text-[12.5px] text-muted-foreground">{formatUpdated(u.updatedAt)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[12.5px]">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatusPill({ row }: { row: UserRow }) {
  return (
    <Badge
      variant="secondary"
      className="bg-emerald-50 font-medium text-emerald-700 hover:bg-emerald-50"
    >
      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
      {row.status}
    </Badge>
  );
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return `${date}, ${time}`;
}
