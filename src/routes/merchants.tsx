import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Plus, Pencil, ArrowUpDown, Store } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMerchants, type Merchant } from "@/lib/merchants";
import { EditMerchantDialog } from "@/components/merchants/EditMerchantDialog";
import { OnboardMerchantDialog } from "@/components/merchants/OnboardMerchantDialog";

export const Route = createFileRoute("/merchants")({
  component: Merchants,
  head: () => ({
    meta: [
      { title: "Merchants · Pi Commerce Enterprise" },
      { name: "description", content: "Onboard and manage ENTERPRISE merchants, their profile, caps, and campaigns." },
    ],
  }),
});

function Merchants() {
  const merchants = useMerchants();
  const [query, setQuery] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? merchants.filter((m) => m.name.toLowerCase().includes(q)) : merchants;
    return [...list].sort((a, b) => {
      const cmp = a.updatedAt.localeCompare(b.updatedAt);
      return sortAsc ? cmp : -cmp;
    });
  }, [merchants, query, sortAsc]);

  const editing = merchants.find((m) => m.id === editId) ?? null;

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Merchants"
          description="Onboard and manage ENTERPRISE merchants across all tenants."
        />
        <Button size="sm" className="mt-1 shrink-0 gap-1.5" onClick={() => setOnboarding(true)}>
          <Plus className="h-4 w-4" /> Onboard Merchant
        </Button>
      </div>

      {/* Toolbar */}
      <div className="mb-3 mt-1 flex items-center gap-2">
        <div className="relative min-w-[240px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by merchant name..."
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Merchant Id</th>
              <th className="px-4 py-2.5 text-left font-medium">Merchant Name</th>
              <th className="px-4 py-2.5 text-left font-medium">Phone Number</th>
              <th className="px-4 py-2.5 text-left font-medium">Email</th>
              <th className="px-4 py-2.5 text-left font-medium">
                <button
                  type="button"
                  onClick={() => setSortAsc((v) => !v)}
                  className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
                >
                  Updated At <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((m) => (
              <MerchantRow key={m.id} merchant={m} onEdit={() => setEditId(m.id)} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  {query ? "No merchants match your search." : "No merchants yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <OnboardMerchantDialog
        open={onboarding}
        onOpenChange={setOnboarding}
        onCreated={(id) => setEditId(id)}
      />
      <EditMerchantDialog
        merchant={editing}
        open={!!editId}
        onOpenChange={(v) => !v && setEditId(null)}
      />
    </AppShell>
  );
}

function MerchantRow({ merchant: m, onEdit }: { merchant: Merchant; onEdit: () => void }) {
  return (
    <tr className="group cursor-pointer transition-colors hover:bg-accent/30" onClick={onEdit}>
      <td className="px-4 py-3 font-mono text-[12.5px] tabular-nums text-muted-foreground">#{m.merchantId}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
            <Store className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-medium group-hover:underline">{m.name}</div>
            {m.businessName && <div className="truncate text-[11px] text-muted-foreground">{m.businessName}</div>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 tabular-nums text-muted-foreground">
        {m.phone ? `${m.countryCode} ${m.phone}` : "—"}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{m.email || "—"}</td>
      <td className="px-4 py-3">
        <div className="text-[12px] text-muted-foreground">{m.updatedAt}</div>
        <div className="text-[11px] text-muted-foreground/70">{m.updatedBy}</div>
      </td>
      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant="outline" className={cn("h-7 gap-1.5 text-[11.5px]")} onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </td>
    </tr>
  );
}
