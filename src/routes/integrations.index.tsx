import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { CreditCard, LineChart, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/integrations/")({
  component: Integrations,
  head: () => ({ meta: [{ title: "Integrations · Pi Commerce Enterprise" }] }),
});

/**
 * Integrations — v2 reintroduces a lean vendor catalog. Just three cards for
 * now (Paytm PG · CleverTap · Shopify), grouped by category. All mock — the
 * "Connect" flow is stubbed; nothing wires to a real credential store. When we
 * add more vendors, keep the pattern: 1 icon + name + one-line meta + a
 * category chip so the classification is visible even in isolation.
 */

type Category = "Payments" | "Customer Data" | "E-commerce";
type Vendor = {
  name: string;
  icon?: React.ComponentType<{ className?: string }>;
  logoUrl?: string;
  connected: boolean;
  meta: string;
  category: Category;
};

const VENDORS: Vendor[] = [
  {
    category: "Payments",
    name: "Paytm Payment Gateway",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Paytm_Logo_%28standalone%29.svg/250px-Paytm_Logo_%28standalone%29.svg.png",
    connected: false,
    meta: "UPI · cards · netbanking · wallet · EMI · payment links",
  },
  {
    category: "Customer Data",
    name: "CleverTap",
    icon: LineChart,
    connected: false,
    meta: "Customer profiles · events · segments · lifecycle triggers",
  },
  {
    category: "E-commerce",
    name: "Shopify",
    icon: ShoppingBag,
    connected: false,
    meta: "Orders · products · customers · cart events",
  },
];

const CATEGORY_META: Record<Category, { label: string; tint: string; icon: React.ComponentType<{ className?: string }> }> = {
  Payments:        { label: "Payment Gateways",  tint: "text-ai bg-ai/10 border-ai/25",           icon: CreditCard },
  "Customer Data": { label: "Customer Data Platforms", tint: "text-success bg-success/10 border-success/25", icon: LineChart },
  "E-commerce":    { label: "E-commerce",       tint: "text-warning bg-warning/10 border-warning/25", icon: ShoppingBag },
};

const CATEGORY_ORDER: Category[] = ["Payments", "Customer Data", "E-commerce"];

function Integrations() {
  return (
    <AppShell>
      <PageHeader
        title="Integrations"
        description="Connect data sources, developer tooling, and third-party services. Messaging channels live under Channels."
      />
      <div className="space-y-6">
        {CATEGORY_ORDER.map((cat) => {
          const items = VENDORS.filter((v) => v.category === cat);
          if (items.length === 0) return null;
          return (
            <section key={cat}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {CATEGORY_META[cat].label}
                </h3>
                <span className="text-[11px] text-muted-foreground/70">· {items.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {items.map((v) => (
                  <Card key={v.name} icon={v.icon} logoUrl={v.logoUrl} title={v.name} meta={v.meta} connected={v.connected} category={v.category} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}

function Card({
  icon: Icon, logoUrl, title, meta, connected, category,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  logoUrl?: string;
  title: string;
  meta: string;
  connected: boolean;
  category: Category;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-accent text-foreground">
            {logoUrl ? (
              <img src={logoUrl} alt={title} className="h-6 w-auto object-contain" />
            ) : Icon ? (
              <Icon className="h-4 w-4" />
            ) : null}
          </div>
          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${CATEGORY_META[category].tint}`}>
            {category}
          </span>
        </div>
        {connected ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10.5px] font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] text-muted-foreground">
            Not connected
          </span>
        )}
      </div>
      <h3 className="mt-3 text-[14px] font-semibold">{title}</h3>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">{meta}</p>
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant={connected ? "outline" : "default"} className="h-7 text-[11.5px]">
          {connected ? "Manage" : "Connect"}
        </Button>
      </div>
    </div>
  );
}
