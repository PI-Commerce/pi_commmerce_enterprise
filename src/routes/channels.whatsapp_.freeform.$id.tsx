import { useCallback, useEffect, useRef, useState } from "react";
import {
  createFileRoute,
  useNavigate,
  useBlocker,
} from "@tanstack/react-router";
import { ChevronLeft, Save, Check, AlertCircle, Lock, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FreeformCanvas } from "@/components/workflow/FreeformCanvas";
import {
  getFreeformWorkflow,
  saveFreeformWorkflow,
  createFreeformWorkflow,
  type FreeformStatus,
  type FreeformNodeRecord,
  type FreeformEdgeRecord,
} from "@/lib/freeform-types";

export const Route = createFileRoute("/channels/whatsapp_/freeform/$id")({
  component: FreeformBuilder,
  head: ({ params }) => ({
    meta: [{ title: `Freeform Workflow · Pi Commerce Enterprise` }],
    // reference params so TypeScript doesn't flag it as unused
    ...(params ? {} : {}),
  }),
});

/**
 * Freeform Workflow builder  -  full-screen canvas surface. Same shell shape as
 * the campaign builder (top bar + canvas), just simpler: no version history,
 * no publish-warning dialog, status flips from Draft > Ready automatically when
 * every node validates.
 */
/**
 * Route wrapper. A `key` on the inner component forces a full remount whenever
 * the URL id changes (e.g. right after "Duplicate to edit" navigates to the
 * new clone), so all local state — name, status, canvas nodes — refreshes from
 * the newly-loaded workflow instead of staying pinned to the old one.
 */
function FreeformBuilder() {
  const { id } = Route.useParams();
  return <FreeformBuilderInner key={id} id={id} />;
}

function FreeformBuilderInner({ id }: { id: string }) {
  const navigate = useNavigate();
  const stored = getFreeformWorkflow(id);
  // Locked workflows are read-only: the graph is rendered previewOnly, the top
  // bar swaps its Save button for a "Duplicate to edit" action, and the name is
  // frozen. This mirrors the store-level guard in saveFreeformWorkflow.
  const isLocked = !!stored?.locked;

  const [name, setName] = useState(stored?.name ?? "Untitled workflow");
  const [status, setStatus] = useState<FreeformStatus>(
    stored?.status ?? "draft",
  );
  const [dirty, setDirty] = useState(false);
  const [validCount, setValidCount] = useState(0);
  const [total, setTotal] = useState(0);
  // Meaningful count = non-terminal nodes. Ready requires at least one message
  // or logic node beyond the structural Start/End, otherwise the empty canvas
  // trivially validates and would flip Ready  -  which is misleading UX.
  const [meaningful, setMeaningful] = useState(0);

  useEffect(() => {
    if (total === 0) return;
    if (status === "draft" && validCount === total && meaningful > 0)
      setStatus("ready");
    if (status === "ready" && (validCount < total || meaningful === 0))
      setStatus("draft");
  }, [validCount, total, meaningful, status]);

  const {
    status: blockStatus,
    proceed,
    reset,
  } = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: false,
    withResolver: true,
  });

  useEffect(() => {
    if (blockStatus !== "blocked") return;
    toast.warning("Unsaved changes", {
      id: "unsaved-blocker-freeform",
      description: "Leave the builder? Your changes will be lost.",
      duration: Infinity,
      action: { label: "Leave", onClick: () => proceed?.() },
      cancel: { label: "Stay", onClick: () => reset?.() },
      onDismiss: () => reset?.(),
    });
  }, [blockStatus, proceed, reset]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Latest graph snapshot from the canvas  -  pushed on every change so Save
  // can persist without an extra round-trip.
  const graphRef = useRef<{
    nodes: FreeformNodeRecord[];
    edges: FreeformEdgeRecord[];
  }>({ nodes: [], edges: [] });
  const handleGraphChange = useCallback(
    (nodes: FreeformNodeRecord[], edges: FreeformEdgeRecord[]) => {
      graphRef.current = { nodes, edges };
    },
    [],
  );

  const handleSave = useCallback(() => {
    saveFreeformWorkflow(id, {
      name,
      status,
      nodes: graphRef.current.nodes,
      edges: graphRef.current.edges,
    });
    setDirty(false);
    toast.success("Workflow saved", { description: name });
  }, [id, name, status]);

  const handleExit = useCallback(() => {
    navigate({ to: "/channels/whatsapp" });
  }, [navigate]);

  // "Duplicate to edit" — the only edit path on a locked workflow. Clones the
  // current graph into a fresh Draft workflow and navigates the author into it.
  const handleDuplicateToEdit = useCallback(() => {
    if (!stored) return;
    const clone = createFreeformWorkflow({
      name: `${stored.name} (copy)`,
      description: stored.description,
    });
    // Seed the clone's graph from the locked source so the author doesn't start
    // from a blank canvas after clicking Duplicate.
    saveFreeformWorkflow(clone.id, {
      nodes: stored.nodes,
      edges: stored.edges,
    });
    toast.success("Duplicated to a new workflow", { description: clone.name });
    navigate({
      to: "/channels/whatsapp/freeform/$id",
      params: { id: clone.id },
    });
  }, [stored, navigate]);

  const handleValidity = useCallback((v: number, t: number, m: number) => {
    setValidCount(v);
    setTotal(t);
    setMeaningful(m);
  }, []);
  const handleDirty = useCallback(() => setDirty(true), []);

  const allValid = total > 0 && validCount === total;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <FreeformTopBar
        name={name}
        onNameChange={(n) => {
          setName(n);
          setDirty(true);
        }}
        status={status}
        dirty={dirty}
        validCount={validCount}
        total={total}
        allValid={allValid}
        onSave={handleSave}
        onExit={handleExit}
        locked={isLocked}
        lockedAt={stored?.lockedAt}
        onDuplicateToEdit={handleDuplicateToEdit}
      />
      <div className="relative flex-1">
        <FreeformCanvas
          initialNodes={stored?.nodes}
          initialEdges={stored?.edges}
          onValidityChange={handleValidity}
          onDirty={isLocked ? undefined : handleDirty}
          onGraphChange={isLocked ? undefined : handleGraphChange}
          previewOnly={isLocked}
        />
      </div>
    </div>
  );
}

function FreeformTopBar({
  name,
  onNameChange,
  status,
  dirty,
  validCount,
  total,
  allValid,
  onSave,
  onExit,
  locked,
  lockedAt,
  onDuplicateToEdit,
}: {
  name: string;
  onNameChange: (n: string) => void;
  status: FreeformStatus;
  dirty: boolean;
  validCount: number;
  total: number;
  allValid: boolean;
  onSave: () => void;
  onExit: () => void;
  locked?: boolean;
  lockedAt?: string;
  onDuplicateToEdit?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft !== name) onNameChange(draft.trim());
  };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-3 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onExit}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">WhatsApp</span>
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-[12.5px] text-muted-foreground">
          Freeform Workflows
        </span>
        <span className="text-muted-foreground/40">/</span>

        {editing && !locked ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(name);
                setEditing(false);
              }
            }}
            className="min-w-0 max-w-[420px] truncate rounded-md border border-input bg-background px-2 py-1 text-[13.5px] font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <button
            onClick={locked ? undefined : () => setEditing(true)}
            className={cn(
              "truncate rounded-md px-2 py-1 text-[13.5px] font-medium",
              locked ? "cursor-default" : "hover:bg-accent",
            )}
            title={locked ? name : "Rename workflow"}
          >
            {name}
          </button>
        )}

        {/* Status pill: Locked wins over Draft/Ready when applicable. */}
        {locked ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-warning"
            title={lockedAt ? `Locked on ${new Date(lockedAt).toLocaleString()}` : "Locked"}
          >
            <Lock className="h-3 w-3" />
            locked
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
              status === "ready"
                ? "border-success/40 bg-success/10 text-success"
                : "border-border bg-secondary text-muted-foreground",
            )}
          >
            {status}
          </span>
        )}

        {!locked && dirty && (
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground md:inline-flex">
            <span className="h-1 w-1 rounded-full bg-warning" /> Unsaved changes
          </span>
        )}

        {locked ? (
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground md:inline-flex">
            In use by at least one campaign run. Duplicate to iterate.
          </span>
        ) : (
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground lg:inline-flex">
            {allValid ? (
              <>
                <Check className="h-3 w-3 text-success" /> {total} nodes validated
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3 text-warning" /> {validCount}/
                {total} nodes configured
              </>
            )}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {locked ? (
          <Button
            size="sm"
            onClick={onDuplicateToEdit}
            className="h-8 gap-1.5 text-xs"
          >
            <Copy className="h-3.5 w-3.5" /> Duplicate to edit
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={!dirty}
            className="h-8 gap-1.5 text-xs"
          >
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        )}
      </div>
    </header>
  );
}
