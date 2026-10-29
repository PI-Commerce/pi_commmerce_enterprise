import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Image as ImageIcon, MessageCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  META_PRODUCT_LIMITS,
  PRODUCT_AVAILABILITIES,
  SEED_SETS,
  formatPrice,
  isValidGtin,
  type CatalogProduct,
  type ProductAvailability,
} from "@/lib/catalog-seed";

export type ProductDialogMode = "create" | "edit";

type Draft = Omit<CatalogProduct, "id" | "updatedAt">;

const EMPTY: Draft = {
  retailerId: "",
  name: "",
  description: "",
  brand: "ACME",
  price: 0,
  salePrice: undefined,
  currency: "INR",
  availability: "in stock",
  condition: "new",
  visibility: "staged",
  imageUrl: "",
  url: "",
  gtin: "",
  inventory: 0,
  setIds: [],
};

/** Create / edit product. All Meta Commerce catalog fields that
 *  `catalog_management` scope touches, grouped sensibly. The right-hand pane
 *  shows a live WhatsApp Single-Product-Message preview so the merchant can
 *  see how the record will render in-chat. */
export function ProductDialog({
  open, onOpenChange, mode, initial, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: ProductDialogMode;
  initial?: CatalogProduct;
  onSave: (p: CatalogProduct) => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const { id: _id, updatedAt: _u, ...rest } = initial;
      setDraft(rest);
    } else {
      setDraft(EMPTY);
    }
  }, [open, initial]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  function handleSave() {
    if (!draft.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!draft.retailerId.trim()) {
      toast.error("Retailer ID / SKU is required.");
      return;
    }
    if (draft.price <= 0) {
      toast.error("Price must be greater than 0.");
      return;
    }
    if (draft.gtin && !isValidGtin(draft.gtin)) {
      toast.error("GTIN must be 8, 12, 13, or 14 digits.");
      return;
    }
    const now = new Date().toISOString();
    const product: CatalogProduct = {
      id: initial?.id ?? `prd_${Math.random().toString(36).slice(2, 9)}`,
      updatedAt: now,
      ...draft,
    };
    onSave(product);
    onOpenChange(false);
    toast.success(mode === "create" ? "Item created in Meta" : "Item updated in Meta");
  }

  const toggleSet = (cid: string) => {
    set("setIds", draft.setIds.includes(cid)
      ? draft.setIds.filter((x) => x !== cid)
      : [...draft.setIds, cid]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-[920px] flex-col">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New product" : `Edit ${initial?.name}`}</DialogTitle>
          <DialogDescription>
            Fields map to Meta Commerce catalog schema. Save writes directly to Meta.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_280px] gap-6 overflow-y-auto pr-1">
          {/* Form */}
          <div className="space-y-4">
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Identity</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <LimitedLabel label="Name" value={draft.name} max={META_PRODUCT_LIMITS.name} />
                  <Input
                    value={draft.name}
                    onChange={(e) => set("name", e.target.value)}
                    maxLength={META_PRODUCT_LIMITS.name}
                    placeholder="ACME Buds Pro 2"
                  />
                </div>
                <div>
                  <LimitedLabel label="Retailer ID / SKU" value={draft.retailerId} max={META_PRODUCT_LIMITS.retailerId} />
                  <Input
                    value={draft.retailerId}
                    onChange={(e) => set("retailerId", e.target.value)}
                    maxLength={META_PRODUCT_LIMITS.retailerId}
                    placeholder="ACME-AUD-001"
                  />
                </div>
                <div className="col-span-2">
                  <LimitedLabel label="Description" value={draft.description} max={META_PRODUCT_LIMITS.description} />
                  <Textarea
                    rows={3}
                    value={draft.description}
                    onChange={(e) => set("description", e.target.value)}
                    maxLength={META_PRODUCT_LIMITS.description}
                    placeholder="Short, chat-friendly description. Shown inside WhatsApp product cards."
                  />
                </div>
                <div>
                  <LimitedLabel label="Brand" value={draft.brand} max={META_PRODUCT_LIMITS.brand} />
                  <Input
                    value={draft.brand}
                    onChange={(e) => set("brand", e.target.value)}
                    maxLength={META_PRODUCT_LIMITS.brand}
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pricing & stock</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-[12px]">Price</Label>
                  <Input type="number" value={draft.price || ""} onChange={(e) => set("price", Number(e.target.value))} />
                </div>
                <div>
                  <Label className="text-[12px]">Sale price</Label>
                  <Input
                    type="number"
                    value={draft.salePrice ?? ""}
                    onChange={(e) => set("salePrice", e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
                <div>
                  <Label className="text-[12px]">Currency</Label>
                  <Select value={draft.currency} onValueChange={(v) => set("currency", v as Draft["currency"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INR">INR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="AED">AED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[12px]">Availability</Label>
                  <Select value={draft.availability} onValueChange={(v) => set("availability", v as ProductAvailability)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRODUCT_AVAILABILITIES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[12px]">Condition</Label>
                  <Select value={draft.condition} onValueChange={(v) => set("condition", v as Draft["condition"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">new</SelectItem>
                      <SelectItem value="refurbished">refurbished</SelectItem>
                      <SelectItem value="used">used</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[12px]">Inventory</Label>
                  <Input type="number" value={draft.inventory || ""} onChange={(e) => set("inventory", Number(e.target.value))} />
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Media & links</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-[12px]">Primary image URL</Label>
                  <Input value={draft.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://..." />
                </div>
                <div>
                  <Label className="text-[12px]">Product URL</Label>
                  <Input value={draft.url} onChange={(e) => set("url", e.target.value)} placeholder="https://shop.acme.in/p/..." />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-[12px]">GTIN (optional)</Label>
                    {draft.gtin && !isValidGtin(draft.gtin) && (
                      <span className="text-[10.5px] text-destructive">Must be 8/12/13/14 digits</span>
                    )}
                  </div>
                  <Input
                    value={draft.gtin ?? ""}
                    onChange={(e) => set("gtin", e.target.value.replace(/\D/g, ""))}
                    maxLength={14}
                    inputMode="numeric"
                    placeholder="8, 12, 13 or 14 digit code"
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sets</h3>
              <p className="mb-2 text-[11.5px] text-muted-foreground">
                Product sets are what Meta uses to render WhatsApp Multi-Product Messages (up to 30 items). An item can belong to multiple sets.
              </p>
              <div className="flex flex-wrap gap-2">
                {SEED_SETS.map((c) => {
                  const on = draft.setIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleSet(c.id)}
                      className={`rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                        on
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background text-muted-foreground hover:border-foreground/40"
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Visibility</h3>
              <div className="flex items-center gap-2">
                <Select value={draft.visibility} onValueChange={(v) => set("visibility", v as Draft["visibility"])}>
                  <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staged">Staged (not visible)</SelectItem>
                    <SelectItem value="published">Published (live on channels)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11.5px] text-muted-foreground">
                  Staged items sync to Meta but stay hidden until published.
                </p>
              </div>
            </section>
          </div>

          {/* Preview */}
          <aside className="min-w-0">
            <div className="sticky top-0">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                <MessageCircle className="h-3 w-3" /> WhatsApp SPM preview
              </div>
              <div className="rounded-xl border border-border bg-[#e5ddd5] p-3">
                <div className="rounded-lg bg-white p-2 shadow-sm">
                  <div className="aspect-square overflow-hidden rounded-md bg-muted">
                    {draft.imageUrl ? (
                      <img src={draft.imageUrl} alt={draft.name || "product"} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="mt-2 space-y-0.5">
                    <p className="line-clamp-2 text-[12.5px] font-medium text-foreground">{draft.name || "Product name"}</p>
                    <p className="text-[12px] font-semibold text-foreground">
                      {draft.price ? formatPrice(draft.salePrice ?? draft.price, draft.currency) : "—"}
                      {draft.salePrice && draft.price > draft.salePrice && (
                        <span className="ml-1.5 text-[10.5px] font-normal text-muted-foreground line-through">
                          {formatPrice(draft.price, draft.currency)}
                        </span>
                      )}
                    </p>
                    <p className="line-clamp-2 text-[10.5px] text-muted-foreground">{draft.description || "No description"}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
                  <span>SKU {draft.retailerId || "—"}</span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9.5px] font-normal">
                    {draft.availability}
                  </Badge>
                </div>
              </div>
              <p className="mt-2 text-[10.5px] text-muted-foreground">
                Rendered as a Single Product Message. To send multiple at once, add this item to a Set and use a Multi-Product Message.
              </p>
            </div>
          </aside>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {mode === "create" ? "Create product" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Label + inline char counter. Turns red near / at the Meta cap so authors
 *  know a long value will be rejected by the catalog_management API. */
function LimitedLabel({ label, value, max }: { label: string; value: string; max: number }) {
  const n = value?.length ?? 0;
  const near = n >= max * 0.9;
  const over = n >= max;
  return (
    <div className="flex items-center justify-between">
      <Label className="text-[12px]">{label}</Label>
      <span className={`text-[10.5px] tabular-nums ${over ? "text-destructive" : near ? "text-warning" : "text-muted-foreground"}`}>
        {n} / {max}
      </span>
    </div>
  );
}
