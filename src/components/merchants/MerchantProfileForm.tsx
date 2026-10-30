import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  MERCHANT_CATEGORIES, MERCHANT_SUBCATEGORIES,
  type MerchantProfile, type MerchantAddress,
} from "@/lib/merchants";

/**
 * The merchant onboarding / edit profile form (name, business, contact, category,
 * tax IDs, and the registered + communication addresses). Fully controlled — the
 * parent owns the `MerchantProfile` and both the Onboard dialog and the Edit
 * dialog's Profile tab render this same form.
 */
export function MerchantProfileForm({
  value, onChange,
}: {
  value: MerchantProfile;
  onChange: (next: MerchantProfile) => void;
}) {
  const set = <K extends keyof MerchantProfile>(key: K, v: MerchantProfile[K]) =>
    onChange({ ...value, [key]: v });

  const setAddr = (
    which: "registered" | "communication",
    key: keyof MerchantAddress,
    v: string,
  ) => onChange({ ...value, [which]: { ...value[which], [key]: v } });

  const subOptions = MERCHANT_SUBCATEGORIES[value.category] ?? [];

  return (
    <div className="space-y-5">
      {/* Identity + contact */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field label="Merchant Name" required>
          <Input
            value={value.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. PICOM_CLIENT_6"
            className="h-9 text-sm"
          />
        </Field>
        <Field label="Business Name" hint="Optional — defaults to Merchant Name when left blank.">
          <Input
            value={value.businessName}
            onChange={(e) => set("businessName", e.target.value)}
            placeholder="Registered legal name"
            className="h-9 text-sm"
          />
        </Field>

        <Field label="Country Code" required>
          <Input
            value={value.countryCode}
            onChange={(e) => set("countryCode", e.target.value)}
            placeholder="+91"
            className="h-9 text-sm"
          />
        </Field>
        <Field label="Phone Number" required hint="10-digit mobile number without country code.">
          <Input
            value={value.phone}
            onChange={(e) => set("phone", e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            maxLength={10}
            placeholder="9876543210"
            className="h-9 text-sm tabular-nums"
          />
        </Field>

        <Field label="Email" required>
          <Input
            type="email"
            value={value.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="ops@merchant.com"
            className="h-9 text-sm"
          />
        </Field>
        <Field label="Category" required>
          <Select
            value={value.category || undefined}
            onValueChange={(v) => onChange({ ...value, category: v, subCategory: "" })}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {MERCHANT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Sub Category" required>
          <Select
            value={value.subCategory || undefined}
            onValueChange={(v) => set("subCategory", v)}
            disabled={subOptions.length === 0}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder={value.category ? "Select sub category" : "Pick a category first"} />
            </SelectTrigger>
            <SelectContent>
              {subOptions.map((s) => (
                <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="PAN">
          <Input
            value={value.pan}
            onChange={(e) => set("pan", e.target.value.toUpperCase())}
            placeholder="ABCDE1234F"
            maxLength={10}
            className="h-9 text-sm uppercase tabular-nums"
          />
        </Field>

        <Field label="GSTIN">
          <Input
            value={value.gstin}
            onChange={(e) => set("gstin", e.target.value.toUpperCase())}
            placeholder="27ABCDE1234F1Z5"
            maxLength={15}
            className="h-9 text-sm uppercase tabular-nums"
          />
        </Field>
      </div>

      {/* Registered address */}
      <AddressFieldset
        title="Registered Address"
        addr={value.registered}
        onField={(k, v) => setAddr("registered", k, v)}
      />

      {/* Same-as toggle */}
      <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-secondary/40 px-3 py-2.5">
        <Checkbox
          checked={value.sameAsRegistered}
          onCheckedChange={(v) => set("sameAsRegistered", v === true)}
        />
        <span className="text-[12.5px]">Communication address is the same as the registered address</span>
      </label>

      {/* Communication address — only when different */}
      {!value.sameAsRegistered && (
        <AddressFieldset
          title="Communication Address"
          addr={value.communication}
          onField={(k, v) => setAddr("communication", k, v)}
        />
      )}
    </div>
  );
}

function AddressFieldset({
  title, addr, onField,
}: {
  title: string;
  addr: MerchantAddress;
  onField: (key: keyof MerchantAddress, v: string) => void;
}) {
  return (
    <fieldset className="rounded-lg border border-border p-4">
      <legend className="flex items-center gap-1.5 px-1.5 text-[12px] font-medium text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" /> {title}
      </legend>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Address" required>
            <Input value={addr.address} onChange={(e) => onField("address", e.target.value)} placeholder="Street, building, area" className="h-9 text-sm" />
          </Field>
        </div>
        <Field label="City" required>
          <Input value={addr.city} onChange={(e) => onField("city", e.target.value)} className="h-9 text-sm" />
        </Field>
        <Field label="State" required>
          <Input value={addr.state} onChange={(e) => onField("state", e.target.value)} className="h-9 text-sm" />
        </Field>
        <Field label="Country" required>
          <Input value={addr.country} onChange={(e) => onField("country", e.target.value)} className="h-9 text-sm" />
        </Field>
        <Field label="Zipcode" required>
          <Input value={addr.zipcode} onChange={(e) => onField("zipcode", e.target.value)} className="h-9 text-sm tabular-nums" />
        </Field>
      </div>
    </fieldset>
  );
}

function Field({
  label, required, hint, children,
}: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className={cn("text-[12px]")}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[10.5px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Minimum required fields for a valid submit. */
export function isProfileComplete(p: MerchantProfile): boolean {
  const addrOk = (a: MerchantAddress) => a.address && a.city && a.state && a.country && a.zipcode;
  return Boolean(
    p.name && p.countryCode && p.phone.length === 10 && p.email && p.category && p.subCategory &&
    addrOk(p.registered) && (p.sameAsRegistered || addrOk(p.communication)),
  );
}
