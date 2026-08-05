/**
 * Settings → Developer → API keys.
 *
 * v1 scope, kept intentionally minimal:
 *   - Platform-scoped keys only. No per-scope / per-endpoint permissions.
 *   - Full key is shown once at creation. Prefix is stored server-side for
 *     support, but never rendered in the UI after creation.
 *   - Row actions live behind a 3-dot menu (Revoke on active; Delete on
 *     revoked).
 *
 * These keys authenticate inbound calls to the Pi Commerce API — the
 * primary use case in v1 is API-based Campaign Runs (client system triggers
 * runs via authenticated API calls instead of scheduled / dashboard runs).
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, KeyRound, Copy, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  useApiKeys, upsertApiKey, revokeApiKey, removeApiKey, generateApiKey,
} from "@/lib/api-keys-data";

export function DeveloperApiKeys() {
  const keys = useApiKeys();
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<{ name: string; full: string } | null>(null);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-[14px] font-semibold">API keys</h2>
              <p className="text-[11.5px] text-muted-foreground">
                Authenticate inbound calls to the Pi Commerce API. Full key is shown once at creation.
              </p>
            </div>
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-[11.5px]" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> Create key
          </Button>
        </div>

        {keys.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">No API keys yet.</div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-secondary/30 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Created</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="w-12 px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-border/60">
                  <td className="px-4 py-3 font-medium">{k.name}</td>
                  <td className="px-4 py-3 text-[11.5px] text-muted-foreground">{formatIso(k.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
                      k.status === "active" ? "border-success/30 bg-success/10 text-success" : "border-border bg-secondary text-muted-foreground",
                    )}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", k.status === "active" ? "bg-success animate-pulse" : "bg-current opacity-60")} />
                      {k.status === "active" ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="More actions"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-[12px]">
                        {k.status === "active" && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => {
                              if (confirm(`Revoke "${k.name}"? Existing calls using this key will start failing.`)) {
                                revokeApiKey(k.id);
                                toast.success("Key revoked");
                              }
                            }}
                          >
                            Revoke
                          </DropdownMenuItem>
                        )}
                        {k.status === "revoked" && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => {
                              if (confirm(`Delete "${k.name}" permanently?`)) {
                                removeApiKey(k.id);
                                toast.success("Key deleted");
                              }
                            }}
                          >
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateApiKeyDialog
        key={creating ? "open" : "closed"}
        open={creating}
        onOpenChange={setCreating}
        onCreate={(name) => {
          const { prefix, full } = generateApiKey();
          const id = `ak_${Math.random().toString(36).slice(2, 8)}`;
          upsertApiKey({ id, name, keyPrefix: prefix, keyFull: full, createdAt: new Date().toISOString(), status: "active" });
          setJustCreated({ name, full });
        }}
      />

      <RevealApiKeyDialog
        open={!!justCreated}
        onOpenChange={(o) => { if (!o) setJustCreated(null); }}
        value={justCreated}
      />
    </div>
  );
}

function CreateApiKeyDialog({
  open, onOpenChange, onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>Full key is shown once. Save it before closing.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Warehouse ingest" className="h-9 text-[13px]" />
          <p className="text-[11px] text-muted-foreground">A label for your reference.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!name.trim()} onClick={() => { onCreate(name.trim()); onOpenChange(false); }}>
            Create key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevealApiKeyDialog({
  open, onOpenChange, value,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: { name: string; full: string } | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save this key</DialogTitle>
          <DialogDescription>This is the only time the full key will be shown.</DialogDescription>
        </DialogHeader>
        {value && (
          <div className="space-y-2">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{value.name}</Label>
            <div className="rounded-lg border border-border bg-secondary/50 p-3">
              <p className="break-all font-mono text-[12px] text-foreground">{value.full}</p>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
                onClick={() => {
                  navigator.clipboard?.writeText(value.full).catch(() => undefined);
                  toast.success("Key copied");
                }}
              ><Copy className="h-3 w-3" /> Copy</Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatIso(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  });
}
