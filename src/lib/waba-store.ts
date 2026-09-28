/**
 * Workspace session store — the single source of truth for which BM, WABA
 * and phone number the merchant is currently working inside.
 *
 * There is one BM, many WABAs under it, many numbers under each WABA. Every
 * WABA-scoped or number-scoped surface reads from this store instead of
 * assuming a single implicit sender.
 *
 * Legacy surfaces (webhooks scope picker, broadcasts, WhatsApp channel page,
 * three integrations components) were written against the flat
 * {@link ConnectedWaba} shape. They keep working via {@link useWabaConnection}
 * which returns a projection of the currently-selected (WABA, phone).
 *
 * Intentionally in-memory only (no localStorage): a hard refresh restores the
 * seeded demo topology so the story can be replayed live. `getServerSnapshot`
 * returns the seed to stay SSR/hydration-safe.
 */
import { useSyncExternalStore } from "react";
import {
  DEMO_SESSION,
  projectSelected,
  type BusinessManager,
  type ConnectedWaba,
  type PhoneNumber,
  type Waba,
  type WorkspaceSession,
} from "@/lib/waba-onboarding";

let session: WorkspaceSession = DEMO_SESSION;
let connected = true;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/* -------------------------------------------------------------------------- *
 *  New multi-WABA API
 * -------------------------------------------------------------------------- */

/** Read the whole workspace session, or `null` when disconnected. */
export function useWorkspaceSession(): WorkspaceSession | null {
  return useSyncExternalStore(
    subscribe,
    () => (connected ? session : null),
    () => (connected ? session : null),
  );
}

/** Imperative read — handy outside React. */
export function getWorkspaceSession(): WorkspaceSession | null {
  return connected ? session : null;
}

/** Currently selected Business Manager, or `null` when disconnected. */
export function useSelectedBm(): BusinessManager | null {
  const s = useWorkspaceSession();
  if (!s) return null;
  return (
    s.businessManagers.find((b) => b.id === s.selectedBusinessManagerId) ??
    s.businessManagers[0] ??
    null
  );
}

/** Every BM on the workspace (empty when disconnected). */
export function useAllBms(): BusinessManager[] {
  const s = useWorkspaceSession();
  return s?.businessManagers ?? [];
}

/** Currently selected WABA, or `null` when disconnected. */
export function useSelectedWaba(): Waba | null {
  const s = useWorkspaceSession();
  if (!s) return null;
  return s.wabas.find((w) => w.id === s.selectedWabaId) ?? s.wabas[0] ?? null;
}

/** Currently selected phone number, or `null` when disconnected. */
export function useSelectedPhone(): PhoneNumber | null {
  const s = useWorkspaceSession();
  if (!s) return null;
  const waba = s.wabas.find((w) => w.id === s.selectedWabaId) ?? s.wabas[0];
  if (!waba) return null;
  return waba.phones.find((p) => p.id === s.selectedPhoneNumberId) ?? waba.phones[0] ?? null;
}

/** WABAs that live under a specific BM. */
export function useWabasForBm(bmId: string): Waba[] {
  const s = useWorkspaceSession();
  return s?.wabas.filter((w) => w.bmId === bmId) ?? [];
}

/** Every WABA on the workspace (empty when disconnected). */
export function useAllWabas(): Waba[] {
  const s = useWorkspaceSession();
  return s?.wabas ?? [];
}

/**
 * Switch the selected Business Manager. WABA selection cascades to the first
 * WABA under the new BM; phone selection cascades to that WABA's first phone.
 * A WABA belongs to exactly one BM, so keeping a stale WABA/phone id across a
 * BM switch would silently point at another BM's assets.
 */
export function selectBm(bmId: string) {
  const bm = session.businessManagers.find((b) => b.id === bmId);
  if (!bm) return;
  const firstWaba = session.wabas.find((w) => w.bmId === bm.id);
  session = {
    ...session,
    selectedBusinessManagerId: bm.id,
    selectedWabaId: firstWaba?.id ?? session.selectedWabaId,
    selectedPhoneNumberId:
      firstWaba?.phones[0]?.id ?? session.selectedPhoneNumberId,
  };
  emit();
}

/**
 * Switch the selected WABA. The number selection resets to the WABA's first
 * phone — a number belongs to exactly one WABA, so keeping a stale phone id
 * after a WABA switch would silently point at nothing. If the WABA belongs to
 * another BM, the BM selection also updates to match.
 */
export function selectWaba(wabaId: string) {
  const waba = session.wabas.find((w) => w.id === wabaId);
  if (!waba) return;
  session = {
    ...session,
    selectedBusinessManagerId: waba.bmId,
    selectedWabaId: waba.id,
    selectedPhoneNumberId: waba.phones[0]?.id ?? session.selectedPhoneNumberId,
  };
  emit();
}

/** Switch the selected phone number within the currently selected WABA. */
export function selectPhoneNumber(phoneNumberId: string) {
  const waba = session.wabas.find((w) => w.id === session.selectedWabaId);
  if (!waba?.phones.some((p) => p.id === phoneNumberId)) return;
  session = { ...session, selectedPhoneNumberId: phoneNumberId };
  emit();
}

/** Replace the entire session — used by onboarding after a fresh connect. */
export function setWorkspaceSession(next: WorkspaceSession) {
  session = next;
  connected = true;
  emit();
}

/** Reset the session back to the seeded demo topology. */
export function resetWorkspaceSession() {
  session = DEMO_SESSION;
  connected = true;
  emit();
}

/* -------------------------------------------------------------------------- *
 *  Legacy API — projects the current session down to the flat single-WABA
 *  shape older surfaces still read.
 * -------------------------------------------------------------------------- */

/**
 * Legacy reactive hook. Returns the currently-selected (WABA, phone) folded
 * into the pre-multi-WABA shape, or `null` when disconnected. New code should
 * use {@link useWorkspaceSession}, {@link useSelectedWaba} or
 * {@link useSelectedPhone} instead.
 */
export function useWabaConnection(): ConnectedWaba | null {
  const s = useWorkspaceSession();
  return s ? projectSelected(s) : null;
}

/** Legacy imperative read. */
export function getWabaConnection(): ConnectedWaba | null {
  return connected ? projectSelected(session) : null;
}

/**
 * Legacy setter. `null` disconnects the workspace entirely (used by the
 * WhatsApp channel page's "Disconnect" action). A non-null value replaces
 * the currently-selected WABA + phone in place, leaving the wider workspace
 * (BM, sibling WABAs) intact so switching remains possible after a manual
 * override.
 */
export function setWabaConnection(next: ConnectedWaba | null) {
  if (next == null) {
    connected = false;
    emit();
    return;
  }
  connected = true;
  const wabas = session.wabas.map((w) => {
    if (w.id !== next.waba.id) return w;
    return {
      ...w,
      name: next.waba.name,
      displayName: next.waba.displayName,
      category: next.waba.category,
      phones: w.phones.map((p) =>
        p.id === next.phone.id
          ? { ...p, display: next.phone.display, verified: next.phone.verified }
          : p,
      ),
    };
  });
  // Ensure the BM referenced by the legacy connection exists in our BM list.
  // Legacy `businessPortfolio` maps 1:1 to a BM; if it's already there we
  // update fields, otherwise we append.
  const bmIndex = session.businessManagers.findIndex(
    (b) => b.id === next.businessPortfolio.id,
  );
  const businessManagers =
    bmIndex >= 0
      ? session.businessManagers.map((b, i) =>
          i === bmIndex ? { ...b, name: next.businessPortfolio.name } : b,
        )
      : [
          ...session.businessManagers,
          {
            id: next.businessPortfolio.id,
            name: next.businessPortfolio.name,
            verified: true,
            creditLine: "Shared" as const,
            dataRegion: session.businessManagers[0]?.dataRegion ?? "Asia (Mumbai)",
          },
        ];
  session = {
    ...session,
    businessManagers,
    wabas,
    selectedBusinessManagerId: next.businessPortfolio.id,
    selectedWabaId: next.waba.id,
    selectedPhoneNumberId: next.phone.id,
    connection: { ...next.connection },
  };
  emit();
}
