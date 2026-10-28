import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ExternalLink, Package, RefreshCw, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AVAILABLE_CATALOGS, type AvailableCatalog } from "@/lib/catalog-seed";

/**
 * Catalog picker — shared by the "Change catalog" header action and the
 * "Link a catalog" empty-state CTA. Lists the catalogs our app has
 * `catalog_management` permission on in the connected Business Portfolio
 * (in production from GET /{business_id}/owned_product_catalogs). Picking
 * one writes it to the WABA's commerce_settings.
 */
export function CatalogPickerDialog({
  open, onOpenChange, currentCatalogId, wabaName, onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentCatalogId: string | null;
  wabaName: string;
  onPick: (catalogId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(currentCatalogId);
  const [refreshing, setRefreshing] = useState(false);
  const [lastPulledAt, setLastPulledAt] = useState<Date | null>(null);

  useEffect(() => {
    if (open) setSelected(currentCatalogId);
  }, [open, currentCatalogId]);

  const changed = selected !== currentCatalogId;

  /** Pulls the list of catalogs the app has catalog_management access to in
   *  the connected Business Portfolio. In production: GET
   *  /{business_id}/owned_product_catalogs. In this demo we stub a short delay
   *  and show a success toast with the count. */
  function handleRefresh() {
    setRefreshing(true);
    window.setTimeout(() => {
      setRefreshing(false);
      setLastPulledAt(new Date());
      toast.success(`Pulled ${AVAILABLE_CATALOGS.length} catalogs from Meta Commerce Manager`);
    }, 900);
  }

  function handleConfirm() {
    if (!selected) return;
    onPick(selected);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{currentCatalogId ? "Change catalog" : "Link a catalog"}</DialogTitle>
          <DialogDescription>
            Pick which catalog to serve on <span className="font-medium text-foreground">{wabaName}</span>.
            Buyers tapping the storefront icon in this WABA's chat will see this catalog.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-muted-foreground">
            {lastPulledAt
              ? `Last pulled from Meta ${formatPullAge(lastPulledAt)}`
              : "Showing catalogs this app has access to in your Business Portfolio."}
          </p>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="h-7 text-[11.5px]">
            <RefreshCw className={cn("mr-1 h-3 w-3", refreshing && "animate-spin")} />
            {refreshing ? "Pulling…" : "Refresh"}
          </Button>
        </div>

        {AVAILABLE_CATALOGS.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/40 px-6 py-10 text-center">
            <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-secondary text-muted-foreground">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <p className="text-[13.5px] font-medium">No catalogs in this Business Portfolio</p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted-foreground">
              Create a catalog in Meta Commerce Manager, then come back here to link it to {wabaName || "this WABA"}.
            </p>
            <Button className="mt-4 gap-1.5" size="sm" asChild>
              <a href="https://business.facebook.com/commerce/" target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Open Commerce Manager
              </a>
            </Button>
          </div>
        ) : (
          <>
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {AVAILABLE_CATALOGS.map((c) => (
                <CatalogRow
                  key={c.catalogId}
                  catalog={c}
                  selected={selected === c.catalogId}
                  current={currentCatalogId === c.catalogId}
                  onSelect={() => setSelected(c.catalogId)}
                />
              ))}
            </div>

            <p className="text-[11.5px] text-muted-foreground">
              Don't see your catalog? It needs to live in the connected Business Portfolio.{" "}
              <a
                href="https://business.facebook.com/commerce/"
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-foreground underline-offset-2 hover:underline"
              >
                Create one in Commerce Manager <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {AVAILABLE_CATALOGS.length === 0 ? "Close" : "Cancel"}
          </Button>
          {AVAILABLE_CATALOGS.length > 0 && (
            <Button onClick={handleConfirm} disabled={!selected || !changed}>
              {currentCatalogId ? "Change catalog" : "Link catalog"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CatalogRow({
  catalog, selected, current, onSelect,
}: {
  catalog: AvailableCatalog;
  selected: boolean;
  current: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-foreground bg-accent/60"
          : "border-border bg-background hover:border-foreground/40",
      )}
    >
      <div className={cn(
        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
        selected ? "border-foreground bg-foreground text-background" : "border-border",
      )}>
        {selected && <Check className="h-3 w-3" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-[13.5px] font-medium">{catalog.catalogName}</div>
          {current && (
            <Badge variant="outline" className="border-success/30 bg-success/10 font-normal text-success">
              Current
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[11.5px] text-muted-foreground">
          <span className="font-mono">{catalog.catalogId}</span>
          <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" /> {catalog.itemCount} items</span>
        </div>
      </div>
    </button>
  );
}

function formatPullAge(d: Date): string {
  const diff = Date.now() - d.getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} hr ago`;
}
