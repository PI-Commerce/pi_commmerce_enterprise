import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, Plus, MoreHorizontal, Ban, PlayCircle, Eye, Cable, Building2 } from "lucide-react";
import { toast } from "sonner";
import { ProviderPage } from "@/components/admin/ProviderPage";
import {
  TableShell, HeadRow, BodyRow, EmptyRow, Pagination, paginate, Field, Toolbar,
  Pill, statusTone, Callout,
} from "@/components/admin/AdminUI";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession, useTenants, addTenant, setTenantStatus, startImpersonation } from "@/lib/admin-store";
import { todayLabel, type Tenant, type TenantStatus } from "@/lib/admin-data";
import { can } from "@/lib/admin-rbac";

export const Route = createFileRoute("/admin/tenants")({
  component: TenantsPage,
  head: () => ({ meta: [{ title: "Merchants · Provider Console" }] }),
});

const GRID = "grid-cols-[1.6fr_0.8fr_1.5fr_1.2fr_0.6fr_0.9fr_auto]";

function TenantsPage() {
  const session = useSession();
  const tenants = useTenants();
  const navigate = useNavigate();
  const role = session.providerRole;
  const mayProvision = can(role, "provisioning");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | TenantStatus>("all");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tenants.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (!needle) return true;
      return (
        t.name.toLowerCase().includes(needle) ||
        t.id.includes(needle) ||
        t.email.toLowerCase().includes(needle)
      );
    });
  }, [tenants, q, status]);

  const view = paginate(rows, page);

  return (
    <ProviderPage
      title="Merchants"
      description="Onboard and manage enterprise merchants across the platform."
      actions={
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!mayProvision}
          title={mayProvision ? undefined : "Support cannot onboard merchants"}
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> Onboard Merchant
        </Button>
      }
    >
      <Toolbar>
        <Field label="Search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="Name, merchant id or contact"
              className="h-9 w-[280px] pl-9"
            />
          </div>
        </Field>
        <Field label="Status">
          <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(0); }}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Live">Live</SelectItem>
              <SelectItem value="Onboarding">Onboarding</SelectItem>
              <SelectItem value="Suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="ml-auto">
          <Pill tone="ai">{rows.length} of {tenants.length} merchants</Pill>
        </div>
      </Toolbar>

      <TableShell>
        <HeadRow grid={GRID}>
          <span>Merchant</span>
          <span>Status</span>
          <span>Primary contact</span>
          <span>Channels</span>
          <span>Members</span>
          <span>Updated</span>
          <span className="w-16 text-right">Actions</span>
        </HeadRow>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view.length === 0 ? (
            <EmptyRow>No merchants match this filter.</EmptyRow>
          ) : (
            view.map((t) => (
              <BodyRow key={t.id} grid={GRID}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.name}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">merchant {t.id}</span>
                </span>
                <Pill tone={statusTone(t.status)}>{t.status}</Pill>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px]">{t.email}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">{t.phone}</span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {t.channels.map((c) => (
                    <span key={c} className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {c}
                    </span>
                  ))}
                </span>
                <span className="tabular-nums">{t.members}</span>
                <span className="text-[12px] text-muted-foreground">{t.updatedAt}</span>
                <span className="flex w-16 items-center justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="More actions"
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem
                        disabled={!can(role, "impersonation")}
                        onSelect={() => {
                          startImpersonation({ tenantId: t.id, ticket: "PICOM-AD-HOC" });
                          toast.success(`Impersonating ${t.name}`, { description: "Session ends in 30:00." });
                          navigate({ to: "/" });
                        }}
                      >
                        <Eye className="mr-2 h-3.5 w-3.5" /> Impersonate
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => navigate({ to: "/admin/trunks" })}>
                        <Cable className="mr-2 h-3.5 w-3.5" /> View trunks
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {t.status === "Suspended" ? (
                        <DropdownMenuItem
                          disabled={!mayProvision}
                          onSelect={() => { setTenantStatus(t.id, "Live"); toast.success(`${t.name} reactivated`); }}
                        >
                          <PlayCircle className="mr-2 h-3.5 w-3.5" /> Reactivate
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          disabled={!mayProvision}
                          className="text-destructive focus:text-destructive"
                          onSelect={() => { setTenantStatus(t.id, "Suspended"); toast.success(`${t.name} suspended`); }}
                        >
                          <Ban className="mr-2 h-3.5 w-3.5" /> Suspend merchant
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </BodyRow>
            ))
          )}
        </div>

        <Pagination page={page} total={rows.length} onPage={setPage} />
      </TableShell>

      <Callout className="mt-3">
        Suspending a merchant revokes every session it holds on the next token refresh. It does not
        delete data, retention is governed by the contract, not by this button.
      </Callout>

      <OnboardDialog open={creating} onOpenChange={setCreating} />
    </ProviderPage>
  );
}

/** Category → sub-category map, mirroring the merchant taxonomy in production. */
const MERCHANT_CATEGORIES: Record<string, string[]> = {
  "Financial Services": ["Lending", "Banking", "Insurance", "Wealth & Investments", "Payments"],
  "Retail & E-commerce": ["Marketplace", "D2C Brand", "Grocery", "Fashion & Lifestyle"],
  "Travel & Hospitality": ["Hotels", "Airlines", "Online Travel Agency", "Ride-hailing"],
  Healthcare: ["Hospitals", "Pharmacy", "Diagnostics", "Telemedicine"],
  Education: ["EdTech", "Institutions", "Test Prep"],
  Logistics: ["Courier & Delivery", "Freight", "Warehousing"],
};
const CATEGORY_KEYS = Object.keys(MERCHANT_CATEGORIES);
const COUNTRY_CODES = ["+91", "+1", "+44", "+65", "+971"];

/**
 * Onboarding mirrors the production "Onboard Merchant" form: it captures the
 * merchant's business, tax and address details and creates the tenant in an
 * Onboarding state. Minting the tenant's first ORG_OWNER is now a separate,
 * explicit step on the Tenant Users screen, so this form no longer touches the
 * tenant plane's roster.
 */
function OnboardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [merchantName, setMerchantName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [pan, setPan] = useState("");
  const [gstin, setGstin] = useState("");

  // Registered address
  const [regAddress, setRegAddress] = useState("");
  const [regCity, setRegCity] = useState("");
  const [regState, setRegState] = useState("");
  const [regCountry, setRegCountry] = useState("India");
  const [regZip, setRegZip] = useState("");

  // Communication address
  const [sameAsReg, setSameAsReg] = useState(true);
  const [comAddress, setComAddress] = useState("");
  const [comCity, setComCity] = useState("");
  const [comState, setComState] = useState("");
  const [comCountry, setComCountry] = useState("India");
  const [comZip, setComZip] = useState("");

  const subOptions = category ? MERCHANT_CATEGORIES[category] : [];

  const valid =
    merchantName.trim().length > 1 &&
    phone.trim().length >= 6 &&
    email.trim().includes("@") &&
    category !== "" &&
    subCategory !== "" &&
    regAddress.trim() !== "" &&
    regCity.trim() !== "" &&
    regState.trim() !== "" &&
    regZip.trim() !== "";

  function reset() {
    setMerchantName(""); setBusinessName(""); setCountryCode("+91"); setPhone("");
    setEmail(""); setCategory(""); setSubCategory(""); setPan(""); setGstin("");
    setRegAddress(""); setRegCity(""); setRegState(""); setRegCountry("India"); setRegZip("");
    setSameAsReg(true); setComAddress(""); setComCity(""); setComState("");
    setComCountry("India"); setComZip("");
  }

  function submit() {
    const t: Tenant = {
      id: String(2700 + Math.floor(Math.random() * 99)),
      name: merchantName.trim(),
      slug: merchantName.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""),
      status: "Onboarding",
      email: email.trim(),
      phone: `${countryCode} ${phone.trim()}`,
      channels: ["WhatsApp"],
      members: 0,
      createdAt: todayLabel(),
      updatedAt: todayLabel(),
    };
    addTenant(t);
    toast.success(`${t.name} onboarded`, {
      description: "Merchant created. Mint its first Org Owner from Merchant Users.",
    });
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-ai/15 text-ai">
              <Building2 className="h-4 w-4" />
            </span>
            Onboard merchant
          </DialogTitle>
          <DialogDescription>
            Create an enterprise merchant. The merchant id is generated automatically. Its first Org
            Owner is minted separately, from Tenant Users.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Merchant name">
              <Input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} placeholder="Volt Money" className="h-9" />
            </Field>
            <Field label="Business name (optional)">
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Defaults to merchant name" className="h-9" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone number">
              <div className="flex gap-2">
                <Select value={countryCode} onValueChange={setCountryCode}>
                  <SelectTrigger className="h-9 w-[84px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" className="h-9 flex-1" />
              </div>
            </Field>
            <Field label="Email">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ops@merchant.in" className="h-9" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select
                value={category}
                onValueChange={(v) => { setCategory(v); setSubCategory(""); }}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_KEYS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sub category">
              <Select value={subCategory} onValueChange={setSubCategory} disabled={!category}>
                <SelectTrigger className="h-9"><SelectValue placeholder={category ? "Select sub category" : "Pick a category first"} /></SelectTrigger>
                <SelectContent>
                  {subOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="PAN">
              <Input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="AAACV1234C" className="h-9" maxLength={10} />
            </Field>
            <Field label="GSTIN">
              <Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="27AAACV1234C1ZV" className="h-9" maxLength={15} />
            </Field>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Registered address</p>
            <Field label="Address">
              <Input value={regAddress} onChange={(e) => setRegAddress(e.target.value)} placeholder="Building, street, area" className="h-9" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City">
                <Input value={regCity} onChange={(e) => setRegCity(e.target.value)} placeholder="Bengaluru" className="h-9" />
              </Field>
              <Field label="State">
                <Input value={regState} onChange={(e) => setRegState(e.target.value)} placeholder="Karnataka" className="h-9" />
              </Field>
              <Field label="Country">
                <Input value={regCountry} onChange={(e) => setRegCountry(e.target.value)} placeholder="India" className="h-9" />
              </Field>
              <Field label="Zipcode">
                <Input value={regZip} onChange={(e) => setRegZip(e.target.value)} placeholder="560001" className="h-9" />
              </Field>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Communication address</p>
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
                <Checkbox checked={sameAsReg} onCheckedChange={(v) => setSameAsReg(v === true)} />
                Same as registered address
              </label>
            </div>
            {!sameAsReg && (
              <>
                <Field label="Address">
                  <Input value={comAddress} onChange={(e) => setComAddress(e.target.value)} placeholder="Building, street, area" className="h-9" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City">
                    <Input value={comCity} onChange={(e) => setComCity(e.target.value)} placeholder="Mumbai" className="h-9" />
                  </Field>
                  <Field label="State">
                    <Input value={comState} onChange={(e) => setComState(e.target.value)} placeholder="Maharashtra" className="h-9" />
                  </Field>
                  <Field label="Country">
                    <Input value={comCountry} onChange={(e) => setComCountry(e.target.value)} placeholder="India" className="h-9" />
                  </Field>
                  <Field label="Zipcode">
                    <Input value={comZip} onChange={(e) => setComZip(e.target.value)} placeholder="400001" className="h-9" />
                  </Field>
                </div>
              </>
            )}
          </div>

          <Callout>
            Onboarding creates the merchant only. The provider plane never manages a merchant's
            roster beyond minting its first Org Owner, which is a separate, explicit step on Tenant Users.
          </Callout>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid} onClick={submit}>Onboard merchant</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
