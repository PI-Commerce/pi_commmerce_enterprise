import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { PageTabs } from "@/components/app/Tabs";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MessageCircle, Link2, Unplug, Plus } from "lucide-react";
import { WhatsAppOverview } from "@/components/integrations/WhatsAppOverview";
import { WhatsAppTemplates } from "@/components/integrations/WhatsAppTemplates";
import { WhatsAppFreeformWorkflows } from "@/components/integrations/WhatsAppFreeformWorkflows";
import { WhatsAppEmbeddedSignup } from "@/components/integrations/WhatsAppEmbeddedSignup";
import {
  useWabaConnection, setWabaConnection,
  useWorkspaceSession, useSelectedBm, useSelectedWaba, useSelectedPhone,
  useAllBms, useWabasForBm,
  selectBm, selectWaba, selectPhoneNumber,
} from "@/lib/waba-store";

export const Route = createFileRoute("/channels/whatsapp")({
  component: WhatsAppManage,
  head: () => ({ meta: [{ title: "WhatsApp Business · Pi Commerce Enterprise" }] }),
});

type Tab = "overview" | "templates" | "freeform";

/**
 * Channels → WhatsApp Business. A normal in-app page (keeps the sidebar): a
 * thin header with the channel name and lifecycle actions, then a compact
 * BM + WABA switcher pair (Meta's account tree lives here, not in the app
 * chrome — Pi Commerce is multi-channel), then two tabs — Overview and
 * Templates (Freeform is workspace-scoped and stays available regardless of
 * WABA selection). The switcher writes to the shared workspace session store,
 * so other WABA-scoped surfaces (Broadcasts, campaign nodes) inherit the
 * selection.
 */
function WhatsAppManage() {
  const connection = useWabaConnection();
  const [tab, setTab] = useState<Tab>("overview");
  const [signupOpen, setSignupOpen] = useState(false);

  return (
    <AppShell bare>
      <div className="flex h-full flex-col">
        {/* Page header — title + lifecycle */}
        <div className="shrink-0 px-8 pt-6">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-[22px] font-semibold tracking-tight">WhatsApp Business</h1>
                <p className="mt-1 text-sm text-muted-foreground">Manage your WhatsApp Business connection and message templates.</p>
              </div>
              {connection && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSignupOpen(true)} className="h-8 gap-1.5 text-xs">
                    <Link2 className="h-3.5 w-3.5" /> Reconnect
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setWabaConnection(null)}
                    className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Unplug className="h-3.5 w-3.5" /> Disconnect
                  </Button>
                </div>
              )}
            </div>

            {connection && (
              <>
                {/* BM + WABA selection lives here — the multi-WABA control
                    surface is the WhatsApp channel page, not app chrome. */}
                <WorkspaceSelectorStrip onAdd={() => setSignupOpen(true)} />

                <div className="mt-6">
                  <PageTabs<Tab>
                    value={tab}
                    onChange={setTab}
                    tabs={[
                      { id: "overview", label: "Overview" },
                      { id: "templates", label: "Templates" },
                      { id: "freeform", label: "Freeform Workflows" },
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1">
          {connection ? (
            tab === "overview" ? (
              <WhatsAppOverview data={connection} />
            ) : tab === "templates" ? (
              <WhatsAppTemplates waba={connection} />
            ) : (
              <WhatsAppFreeformWorkflows />
            )
          ) : (
            <div className="h-full overflow-y-auto">
              <div className="px-8 pb-8 pt-6">
                <NotConnected onConnect={() => setSignupOpen(true)} />
              </div>
            </div>
          )}
        </div>
      </div>

      <WhatsAppEmbeddedSignup
        open={signupOpen}
        onOpenChange={setSignupOpen}
        onComplete={(result) => setWabaConnection(result)}
      />
    </AppShell>
  );
}

/**
 * The three-dropdown BM > WABA > Phone picker plus small "+ Add" affordances
 * for each level. All three "+ Add" buttons open the same Meta Embedded
 * Signup dialog — Meta's SDK covers the full "add BM / add WABA under a BM /
 * add phone number under a WABA" tree from one entry point. Which step the
 * flow lands on inside Meta's popup depends on what the user chooses in the
 * first screen (create new portfolio vs pick existing, etc.).
 */
function WorkspaceSelectorStrip({ onAdd }: { onAdd: () => void }) {
  const bms = useAllBms();
  const selectedBm = useSelectedBm();
  const selectedWaba = useSelectedWaba();
  const selectedPhone = useSelectedPhone();
  const bmWabas = useWabasForBm(selectedBm?.id ?? "");
  if (!selectedBm || !selectedWaba || !selectedPhone) return null;

  return (
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <SelectorField
        label="Business Manager"
        addLabel="Add BM"
        onAdd={onAdd}
        minWidth={220}
      >
        <Select value={selectedBm.id} onValueChange={(v) => selectBm(v)}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {bms.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SelectorField>

      <SelectorField
        label="WhatsApp Business Account"
        addLabel="Add WABA"
        onAdd={onAdd}
        minWidth={240}
      >
        <Select value={selectedWaba.id} onValueChange={(v) => selectWaba(v)}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {bmWabas.map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SelectorField>

      <SelectorField
        label="Phone number"
        addLabel="Add number"
        onAdd={onAdd}
        minWidth={240}
      >
        <Select
          value={selectedPhone.id}
          onValueChange={(v) => selectPhoneNumber(v)}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selectedWaba.phones.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.display} · {p.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SelectorField>
    </div>
  );
}

/**
 * Small label-with-add-affordance wrapper for a dropdown. Keeps the picker
 * strip aligned and centralizes the "+ Add" button placement.
 */
function SelectorField({
  label, addLabel, onAdd, minWidth, children,
}: {
  label: string;
  addLabel: string;
  onAdd: () => void;
  minWidth: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minWidth }}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          title={addLabel}
        >
          <Plus className="h-3 w-3" />
          {addLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

function NotConnected({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#25D366]/15 text-[#1FA855]">
          <MessageCircle className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-semibold">Connect WhatsApp Business</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted-foreground">
          Pi Commerce is your BSP. Link your Meta Business Portfolio and WhatsApp Business Account
          through Embedded Signup to start sending templates and going live in minutes.
        </p>
        <Button className="mt-5 gap-1.5" onClick={onConnect}>
          <Link2 className="h-4 w-4" /> Connect with Meta
        </Button>
      </div>
    </div>
  );
}
