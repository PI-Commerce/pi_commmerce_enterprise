import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Plus,
  Search,
  Copy,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDashed,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getFreeformWorkflows,
  subscribeFreeformWorkflows,
  createFreeformWorkflow,
  type FreeformWorkflowRow,
  type FreeformStatus,
} from "@/lib/freeform-types";

/**
 * Channels > WhatsApp > Freeform Workflows tab.
 *
 * Freeform Workflows are reusable conversation flows used inside WhatsApp's
 * 24-hour customer-service window. This is the list surface  -  mirrors the
 * Templates table layout (grid, frozen header, paginated body) but simpler:
 * these live in Pi Commerce, not Meta, so there's no external sync, no
 * category tag, no language, no version history in v1.
 */
export function WhatsAppFreeformWorkflows() {
  const workflows = useSyncExternalStore(
    subscribeFreeformWorkflows,
    getFreeformWorkflows,
    getFreeformWorkflows,
  );
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return workflows;
    return workflows.filter((w) =>
      `${w.name} ${w.description ?? ""}`.toLowerCase().includes(needle),
    );
  }, [workflows, q]);

  useEffect(() => {
    setPage(1);
  }, [q, workflows.length]);

  const PAGE_SIZE = 8;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (pageSafe - 1) * PAGE_SIZE,
    pageSafe * PAGE_SIZE,
  );
  const rangeStart = filtered.length === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(pageSafe * PAGE_SIZE, filtered.length);

  const handleCreated = (row: FreeformWorkflowRow) => {
    setCreateOpen(false);
    navigate({ to: "/channels/whatsapp/freeform/$id", params: { id: row.id } });
  };

  const handleOpen = (id: string) => {
    navigate({ to: "/channels/whatsapp/freeform/$id", params: { id } });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-8 pb-6 pt-6">
      <div className="flex h-full w-full flex-col">
        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-end gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search workflow name or description…"
              className="h-9 pl-9"
            />
          </div>
          <div className="ml-auto">
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="h-9 gap-1.5 text-xs"
            >
              <Plus className="h-4 w-4" /> Create workflow
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border">
          <div className="grid shrink-0 grid-cols-[2fr_0.9fr_1fr_1fr_1fr_auto] items-center gap-3 border-b border-border bg-secondary/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Name</span>
            <span>Status</span>
            <span>Last modified</span>
            <span>Created</span>
            <span>Used in campaigns</span>
            <span className="w-16 text-right">Actions</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <EmptyState
                hasQuery={q.trim().length > 0}
                onCreate={() => setCreateOpen(true)}
              />
            ) : (
              pageRows.map((w) => (
                <button
                  key={w.id}
                  onClick={() => handleOpen(w.id)}
                  className="grid w-full grid-cols-[2fr_0.9fr_1fr_1fr_1fr_auto] items-center gap-3 border-b border-border px-4 py-3 text-left text-[13px] transition-colors last:border-0 hover:bg-accent/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {w.name}
                    </span>
                    {w.description && (
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {w.description}
                      </span>
                    )}
                  </span>
                  <span>
                    <StatusTag status={w.status} locked={w.locked} />
                  </span>
                  <span className="text-muted-foreground">
                    {relativeTime(w.lastModified)}
                  </span>
                  <span className="text-muted-foreground">
                    {shortDate(w.createdAt)}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {w.usedInCampaigns === 0 ? (
                      <span className="text-muted-foreground/60"> - </span>
                    ) : (
                      `${w.usedInCampaigns} campaign${w.usedInCampaigns === 1 ? "" : "s"}`
                    )}
                  </span>
                  <span className="flex w-16 items-center justify-end gap-1">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        const copy = createFreeformWorkflow({
                          name: `${w.name} (copy)`,
                          description: w.description,
                        });
                        handleCreated(copy);
                      }}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      aria-label="Duplicate"
                      title="Duplicate"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpen(w.id);
                      }}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      aria-label="Open"
                      title="Open"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 pt-3">
          <p className="text-[11.5px] text-muted-foreground">
            {filtered.length === 0
              ? "No workflows"
              : `Showing ${rangeStart}-${rangeEnd} of ${filtered.length} workflow${filtered.length === 1 ? "" : "s"}`}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
                className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <span className="px-1 text-[11.5px] tabular-nums text-muted-foreground">
                Page {pageSafe} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <CreateWorkflowDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}

/* ------------------------------ Empty state ------------------------------ */

function EmptyState({
  hasQuery,
  onCreate,
}: {
  hasQuery: boolean;
  onCreate: () => void;
}) {
  if (hasQuery) {
    return (
      <div className="px-4 py-16 text-center text-[13px] text-muted-foreground">
        No workflows match your search.
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="text-[13px] font-medium text-foreground">
        No freeform workflows yet
      </p>
      <p className="max-w-sm text-[12px] text-muted-foreground">
        Build reusable conversation flows for the 24-hour service window and
        reference them from any campaign.
      </p>
      <Button size="sm" onClick={onCreate} className="mt-1 gap-1.5 text-xs">
        <Plus className="h-4 w-4" /> Create workflow
      </Button>
    </div>
  );
}

/* --------------------------------- Status --------------------------------- */

function StatusTag({
  status,
  locked,
}: {
  status: FreeformStatus;
  locked?: boolean;
}) {
  // Locked wins over Draft/Ready. A locked workflow is by definition "Ready"
  // (Meta would reject running an invalid one), but we show Locked because
  // that's the actionable state — the author can't edit until they duplicate.
  if (locked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-warning">
        <Lock className="h-3 w-3" />
        locked
      </span>
    );
  }
  const isReady = status === "ready";
  const Icon = isReady ? CheckCircle2 : CircleDashed;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide",
        isReady
          ? "border-success/40 bg-success/10 text-success"
          : "border-border bg-secondary text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

/* --------------------------- Create dialog (name only) --------------------------- */

function CreateWorkflowDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (row: FreeformWorkflowRow) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
    }
  }, [open]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    const row = createFreeformWorkflow({ name: trimmed, description });
    onCreated(row);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create freeform workflow</DialogTitle>
          <DialogDescription>
            Give this workflow a name. You'll design the flow on the next
            screen.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <label className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Test-drive slot picker"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) submit();
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
              Description{" "}
              <span className="font-normal normal-case text-muted-foreground/70">
                (optional)
              </span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this flow do? Who uses it?"
              rows={3}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            Create workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Helpers --------------------------------- */

function shortDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return shortDate(iso);
}
