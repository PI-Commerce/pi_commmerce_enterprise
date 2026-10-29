import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, LayoutGrid, Rows3, MoreHorizontal, Pencil, Trash2, Copy,
  Package, Layers, Link as LinkIcon, ExternalLink, ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSelectedWaba } from "@/lib/waba-store";
import { ProductDialog } from "@/components/catalog/ProductDialog";
import { CatalogPickerDialog } from "@/components/catalog/CatalogPickerDialog";
import {
  INITIAL_CATALOG_BY_WABA,
  PRODUCT_AVAILABILITIES,
  SEED_PRODUCTS,
  SEED_SETS,
  catalogById,
  formatPrice,
  productsBySet,
  type AvailableCatalog,
  type CatalogProduct,
  type CatalogSet,
  type ProductAvailability,
} from "@/lib/catalog-seed";

type Sub = "items" | "sets";

const AVAIL_TONE: Record<ProductAvailability, string> = {
  "in stock":            "border-success/30 bg-success/10 text-success",
  "out of stock":        "border-destructive/30 bg-destructive/10 text-destructive",
  "available for order": "border-ai/30 bg-ai/10 text-ai",
  "discontinued":        "border-border bg-secondary text-muted-foreground",
};

/**
 * Catalog tab inside Channels → WhatsApp. Scoped to the currently-selected
 * WABA: Meta assigns one catalog per WABA (the catalog itself lives in the
 * Business Portfolio and can be shared across WABAs within the same BM).
 * If the selected WABA has no catalog linked, we show an empty state.
 *
 * First-cut scope: header + Items + Sets. Everything on save writes
 * through to Meta via catalog_management.
 */
export function WhatsAppCatalog() {
  const waba = useSelectedWaba();

  // WABA → catalogId mapping is stateful: picking a catalog in the picker
  // updates it live. Initial values come from Meta's commerce_settings; in
  // this demo they're seeded via INITIAL_CATALOG_BY_WABA.
  const [assignments, setAssignments] = useState<Record<string, string | null>>(INITIAL_CATALOG_BY_WABA);
  const [pickerOpen, setPickerOpen] = useState(false);

  const currentCatalogId = waba ? assignments[waba.id] ?? null : null;
  const connection = catalogById(currentCatalogId);

  function handlePick(catalogId: string) {
    if (!waba) return;
    setAssignments((prev) => ({ ...prev, [waba.id]: catalogId }));
    const picked = catalogById(catalogId);
    toast.success(`${picked?.catalogName ?? "Catalog"} linked to ${waba.name}`);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-8 pb-8 pt-6">
        {connection
          ? <LinkedCatalog connection={connection} wabaName={waba?.name ?? ""} onChangeCatalog={() => setPickerOpen(true)} />
          : <NoCatalog wabaName={waba?.name ?? ""} onLinkCatalog={() => setPickerOpen(true)} />}
      </div>

      <CatalogPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currentCatalogId={currentCatalogId}
        wabaName={waba?.name ?? ""}
        onPick={handlePick}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state — WABA has no catalog linked                            */
/* ------------------------------------------------------------------ */

function NoCatalog({ wabaName, onLinkCatalog }: { wabaName: string; onLinkCatalog: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground">
          <ShoppingBag className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-semibold">No catalog linked</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted-foreground">
          {wabaName} has no Meta Commerce catalog assigned yet. Link an existing catalog
          from your Business Portfolio to send products in chat.
        </p>
        <Button className="mt-5 gap-1.5" onClick={onLinkCatalog}>
          <LinkIcon className="h-4 w-4" /> Link a catalog
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Linked state                                                        */
/* ------------------------------------------------------------------ */

function LinkedCatalog({
  connection, wabaName, onChangeCatalog,
}: {
  connection: AvailableCatalog;
  wabaName: string;
  onChangeCatalog: () => void;
}) {
  const [sub, setSub] = useState<Sub>("items");
  const [products, setProducts] = useState<CatalogProduct[]>(SEED_PRODUCTS);
  const [sets, setSets]         = useState<CatalogSet[]>(SEED_SETS);

  return (
    <>
      {/* Connected-catalog header */}
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1877F2]/10 text-[#1877F2]">
            <LinkIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold">{connection.catalogName}</h2>
              <Badge variant="outline" className="border-success/30 bg-success/10 font-normal text-success">
                Linked to {wabaName}
              </Badge>
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Catalog ID <span className="font-mono text-[12px] text-foreground">{connection.catalogId}</span>
              {" · "}{connection.businessName}
              {" · "}{connection.itemCount} items
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={onChangeCatalog}>
              Change catalog
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`https://business.facebook.com/commerce/catalogs/${connection.catalogId}`} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" /> Commerce Manager
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Sub-nav */}
      <div className="mt-5 border-b border-border">
        <nav className="flex items-center gap-1">
          <SubTab active={sub === "items"} onClick={() => setSub("items")} icon={Package} label="Items" count={products.length} />
          <SubTab active={sub === "sets"}  onClick={() => setSub("sets")}  icon={Layers}  label="Sets"  count={sets.length} />
        </nav>
      </div>

      <div className="mt-5">
        {sub === "items" && <ItemsSection products={products} setProducts={setProducts} />}
        {sub === "sets"  && <SetsSection  sets={sets}         setSets={setSets} />}
      </div>
    </>
  );
}

function SubTab({
  active, onClick, icon: Icon, label, count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors",
        active
          ? "border-foreground font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {typeof count === "number" && (
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

function ItemsSection({
  products, setProducts,
}: {
  products: CatalogProduct[];
  setProducts: React.Dispatch<React.SetStateAction<CatalogProduct[]>>;
}) {
  const [query, setQuery] = useState("");
  const [fAvail, setFAvail] = useState<"all" | ProductAvailability>("all");
  const [fSet, setFSet] = useState<"all" | string>("all");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogProduct | undefined>(undefined);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !(p.name.toLowerCase().includes(q) || p.retailerId.toLowerCase().includes(q))) return false;
      if (fAvail !== "all" && p.availability !== fAvail) return false;
      if (fSet !== "all" && !p.setIds.includes(fSet)) return false;
      return true;
    });
  }, [products, query, fAvail, fSet]);

  function handleSave(p: CatalogProduct) {
    setProducts((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx === -1) return [p, ...prev];
      const next = [...prev]; next[idx] = p; return next;
    });
  }
  function handleDelete(p: CatalogProduct) {
    setProducts((prev) => prev.filter((x) => x.id !== p.id));
    toast.success(`Removed ${p.name} from Meta`);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-[320px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or SKU" className="h-9 pl-8 text-[13px]" />
        </div>

        <Select value={fAvail} onValueChange={(v) => setFAvail(v as typeof fAvail)}>
          <SelectTrigger className="h-9 w-[170px] text-[13px]"><SelectValue placeholder="Availability" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All availability</SelectItem>
            {PRODUCT_AVAILABILITIES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={fSet} onValueChange={(v) => setFSet(v)}>
          <SelectTrigger className="h-9 w-[180px] text-[13px]"><SelectValue placeholder="Set" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sets</SelectItem>
            {SEED_SETS.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5">
            <button type="button" onClick={() => setView("grid")} className={cn("flex h-7 items-center gap-1 rounded px-2 text-[12px]", view === "grid" ? "bg-accent text-foreground" : "text-muted-foreground")}><LayoutGrid className="h-3.5 w-3.5" /> Grid</button>
            <button type="button" onClick={() => setView("table")} className={cn("flex h-7 items-center gap-1 rounded px-2 text-[12px]", view === "table" ? "bg-accent text-foreground" : "text-muted-foreground")}><Rows3 className="h-3.5 w-3.5" /> Table</button>
          </div>
          <Button size="sm" onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New item
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No items match the current filters.
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((p) => (
            <ItemGridCard key={p.id} product={p} onEdit={() => { setEditing(p); setDialogOpen(true); }} onDelete={() => handleDelete(p)} />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[48px]"></TableHead>
                <TableHead>Item</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Availability</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="w-[52px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => { setEditing(p); setDialogOpen(true); }}>
                  <TableCell>
                    <div className="h-9 w-9 overflow-hidden rounded-md border border-border bg-muted">
                      <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-[11.5px] text-muted-foreground">{p.brand}</div>
                  </TableCell>
                  <TableCell className="font-mono text-[12px]">{p.retailerId}</TableCell>
                  <TableCell className="text-right">
                    <div className="font-medium">{formatPrice(p.salePrice ?? p.price, p.currency)}</div>
                    {p.salePrice && <div className="text-[11px] text-muted-foreground line-through">{formatPrice(p.price, p.currency)}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("font-normal", AVAIL_TONE[p.availability])}>{p.availability}</Badge>
                  </TableCell>
                  <TableCell className="text-[12.5px] capitalize text-muted-foreground">{p.visibility}</TableCell>
                  <TableCell className="text-[12.5px] tabular-nums">{p.inventory.toLocaleString("en-IN")}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <ItemRowMenu onEdit={() => { setEditing(p); setDialogOpen(true); }} onDelete={() => handleDelete(p)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={editing ? "edit" : "create"}
        initial={editing}
        onSave={handleSave}
      />
    </div>
  );
}

function ItemGridCard({
  product, onEdit, onDelete,
}: {
  product: CatalogProduct;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-background transition-colors hover:border-foreground/40">
      <button type="button" onClick={onEdit} className="block w-full text-left">
        <div className="relative aspect-square overflow-hidden bg-muted">
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
          {product.visibility === "staged" && (
            <div className="absolute right-1.5 top-1.5 rounded-full bg-muted-foreground/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
              Staged
            </div>
          )}
        </div>
        <div className="p-2.5">
          <div className="line-clamp-1 text-[13px] font-medium">{product.name}</div>
          <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{product.retailerId}</div>
          <div className="mt-1.5 flex items-center justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[13px] font-semibold">{formatPrice(product.salePrice ?? product.price, product.currency)}</span>
              {product.salePrice && <span className="text-[10.5px] text-muted-foreground line-through">{formatPrice(product.price, product.currency)}</span>}
            </div>
            <Badge variant="outline" className={cn("h-4 px-1.5 text-[9.5px] font-normal", AVAIL_TONE[product.availability])}>{product.availability}</Badge>
          </div>
        </div>
      </button>
      <div className="absolute bottom-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <ItemRowMenu onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}

function ItemRowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Sets                                                                */
/* ------------------------------------------------------------------ */

function SetsSection({
  sets, setSets,
}: {
  sets: CatalogSet[];
  setSets: React.Dispatch<React.SetStateAction<CatalogSet[]>>;
}) {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<CatalogSet | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sets;
    return sets.filter((s) => s.name.toLowerCase().includes(q));
  }, [sets, query]);

  function handleCreate(name: string, description: string, productIds: string[]) {
    const now = new Date().toISOString();
    const col: CatalogSet = {
      id: `set_${Math.random().toString(36).slice(2, 9)}`,
      name, description,
      coverImageUrl: SEED_PRODUCTS.find((p) => productIds.includes(p.id))?.imageUrl ?? "",
      productIds,
      createdAt: now, updatedAt: now,
    };
    setSets((prev) => [col, ...prev]);
  }
  function handleDelete(s: CatalogSet) {
    setSets((prev) => prev.filter((x) => x.id !== s.id));
    toast.success(`Removed ${s.name}`);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-[320px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sets" className="h-9 pl-8 text-[13px]" />
        </div>
        <Button className="ml-auto" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> New set
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No sets yet. Create one to group items for a Multi-Product Message.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const items = productsBySet(SEED_PRODUCTS, c.id);
            return (
              <div key={c.id} className="group relative overflow-hidden rounded-lg border border-border bg-background transition-colors hover:border-foreground/40">
                <button type="button" onClick={() => setDetail(c)} className="block w-full text-left">
                  <div className="relative h-32 overflow-hidden bg-muted">
                    {c.coverImageUrl ? (
                      <img src={c.coverImageUrl} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center"><Layers className="h-8 w-8 text-muted-foreground" /></div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-white">
                      <div className="text-[13.5px] font-semibold">{c.name}</div>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-[12px] text-muted-foreground">{c.description}</p>
                    <div className="mt-3 flex items-center gap-3 text-[11.5px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" /> {items.length} items</span>
                    </div>
                    <div className="mt-2.5 flex -space-x-1.5">
                      {items.slice(0, 5).map((p) => (
                        <div key={p.id} className="h-6 w-6 overflow-hidden rounded-full border border-background bg-muted">
                          <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                        </div>
                      ))}
                      {items.length > 5 && <div className="flex h-6 w-6 items-center justify-center rounded-full border border-background bg-secondary text-[10px] text-muted-foreground">+{items.length - 5}</div>}
                    </div>
                  </div>
                </button>
                <div className="absolute right-2 top-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="secondary" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDetail(c)}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { navigator.clipboard?.writeText(c.id); toast.success(`Copied product_set_id: ${c.id}`); }}>
                        <Copy className="mr-2 h-3.5 w-3.5" /> Copy set id
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => handleDelete(c)}>
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateSetDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      <SetDetailDialog setRecord={detail} onOpenChange={(v) => !v && setDetail(null)} />
    </div>
  );
}

function CreateSetDialog({
  open, onOpenChange, onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (name: string, description: string, productIds: string[]) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [q, setQ] = useState("");

  const matching = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return SEED_PRODUCTS;
    return SEED_PRODUCTS.filter((p) => p.name.toLowerCase().includes(s) || p.retailerId.toLowerCase().includes(s));
  }, [q]);

  const toggle = (id: string) => setProductIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  function handleCreate() {
    if (!name.trim()) { toast.error("Name is required."); return; }
    if (productIds.length === 0) { toast.error("Add at least one item."); return; }
    if (productIds.length > 30) { toast.error("Multi-Product Messages cap at 30 items."); return; }
    onCreate(name.trim(), description.trim(), productIds);
    setName(""); setDescription(""); setProductIds([]); setQ("");
    toast.success("Set created");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-[860px] flex-col">
        <DialogHeader>
          <DialogTitle>New set</DialogTitle>
          <DialogDescription>Up to 30 items. A set is Meta's grouping entity and is what an MPM carries.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] gap-6 overflow-y-auto pr-1">
          <div className="space-y-3">
            <div><Label className="text-[12px]">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Festive Picks 2026" /></div>
            <div><Label className="text-[12px]">Description</Label><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Internal note." /></div>
            <div className="rounded-md border border-border bg-secondary/50 p-2.5 text-[11.5px] text-muted-foreground">{productIds.length} / 30 items selected.</div>
          </div>
          <div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items to add" className="h-9 pl-8 text-[13px]" />
            </div>
            <div className="h-[320px] overflow-y-auto rounded-md border border-border">
              {matching.map((p) => {
                const on = productIds.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggle(p.id)} className={`flex w-full items-center gap-3 border-b border-border px-2 py-1.5 text-left transition-colors last:border-b-0 ${on ? "bg-accent" : "hover:bg-accent/40"}`}>
                    <div className="h-9 w-9 overflow-hidden rounded border border-border bg-muted"><img src={p.imageUrl} alt="" className="h-full w-full object-cover" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{p.name}</div>
                      <div className="font-mono text-[10.5px] text-muted-foreground">{p.retailerId}</div>
                    </div>
                    <div className="text-[12px] font-medium">{formatPrice(p.salePrice ?? p.price, p.currency)}</div>
                    <div className={`h-4 w-4 rounded border ${on ? "border-foreground bg-foreground" : "border-border bg-background"}`} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate}><Plus className="mr-1 h-3.5 w-3.5" /> Create set</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SetDetailDialog({
  setRecord, onOpenChange,
}: {
  setRecord: CatalogSet | null;
  onOpenChange: (v: boolean) => void;
}) {
  const open = !!setRecord;
  const items = setRecord ? productsBySet(SEED_PRODUCTS, setRecord.id) : [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[720px] overflow-y-auto">
        {setRecord && (
          <>
            <DialogHeader>
              <DialogTitle>{setRecord.name}</DialogTitle>
              <DialogDescription>{setRecord.description}</DialogDescription>
            </DialogHeader>
            <div className="mb-3 flex items-center gap-3 text-[12px] text-muted-foreground">
              <Badge variant="outline" className="font-normal">product_set_id {setRecord.id}</Badge>
              <span>· {items.length} items</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {items.map((p) => (
                <div key={p.id} className="rounded-md border border-border bg-background">
                  <div className="aspect-square overflow-hidden rounded-t-md bg-muted"><img src={p.imageUrl} alt="" className="h-full w-full object-cover" /></div>
                  <div className="p-2">
                    <div className="line-clamp-1 text-[12px] font-medium">{p.name}</div>
                    <div className="text-[11.5px] text-muted-foreground">{formatPrice(p.salePrice ?? p.price, p.currency)}</div>
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
