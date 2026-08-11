/**
 * Admin Panel session + data store.
 *
 * Follows the module-store + `useSyncExternalStore` pattern already used by
 * {@link file://./rcs-store.ts} and {@link file://./sms-store.ts}.
 *
 * The **session** is the demo device the PRD's two-app split doesn't have in
 * production: a single bundle that can render either plane so the mock can be
 * walked end-to-end without two deploys. Real build ships the Provider Console
 * on its own internal subdomain behind SSO, see `PlaneSwitcher` for the note
 * shown to anyone reading the demo.
 *
 * In-memory only; the *session* (plane + roles) persists to localStorage so a
 * refresh doesn't drop you back into the tenant plane mid-demo.
 */

import { useSyncExternalStore } from "react";
import {
  SEED_TENANTS, SEED_TRUNKS, SEED_PROVIDER_USERS, SEED_TENANT_USERS, SEED_AUDIT,
  DEMO_TENANT_ID, nowStamp,
  type Tenant, type Trunk, type ProviderUser, type TenantUser, type AuditEvent, type AuditAction,
} from "@/lib/admin-data";
import type { Plane, ProviderRole, TenantRole, AnyRole } from "@/lib/admin-rbac";

/* ================================= Session ================================= */

export type Impersonation = {
  tenantId: string;
  /** Real provider principal the session is attributed to. */
  actor: string;
  actorRole: ProviderRole;
  /** Epoch ms. Hard expiry, non-renewable without re-auth. */
  expiresAt: number;
  /** Support ticket the session was opened against. */
  ticket: string;
};

export type Session = {
  plane: Plane;
  providerRole: ProviderRole;
  tenantRole: TenantRole;
  /** Tenant the tenant-plane view is scoped to. Implicit, never a picker. */
  tenantId: string;
  impersonation: Impersonation | null;
};

/** Max impersonation lifetime, per the PRD's non-functional requirements. */
export const IMPERSONATION_MINUTES = 30;

const DEFAULT_SESSION: Session = {
  plane: "tenant",
  providerRole: "GLOBAL_ADMIN",
  tenantRole: "ORG_OWNER",
  tenantId: DEMO_TENANT_ID,
  impersonation: null,
};

const SESSION_KEY = "pc_admin_session";

function loadSession(): Session {
  if (typeof window === "undefined") return DEFAULT_SESSION;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return DEFAULT_SESSION;
    const parsed = JSON.parse(raw) as Partial<Session>;
    return {
      ...DEFAULT_SESSION,
      ...parsed,
      // An impersonation session never survives a reload, it would outlive its
      // own expiry guarantee.
      impersonation: null,
    };
  } catch {
    return DEFAULT_SESSION;
  }
}

let session: Session = loadSession();

function persist() {
  if (typeof window === "undefined") return;
  const { plane, providerRole, tenantRole, tenantId } = session;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ plane, providerRole, tenantRole, tenantId }));
}

/* ================================== Data =================================== */

let tenants: Tenant[] = SEED_TENANTS;
let trunks: Trunk[] = SEED_TRUNKS;
let providerUsers: ProviderUser[] = SEED_PROVIDER_USERS;
let tenantUsers: TenantUser[] = SEED_TENANT_USERS;
let audit: AuditEvent[] = SEED_AUDIT;

/* ============================== Subscription =============================== */

const listeners = new Set<() => void>();
function emit() { for (const l of listeners) l(); }
function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }

/* ================================= Hooks =================================== */

export function useSession(): Session {
  return useSyncExternalStore(subscribe, () => session, () => DEFAULT_SESSION);
}
export function useTenants(): Tenant[] {
  return useSyncExternalStore(subscribe, () => tenants, () => SEED_TENANTS);
}
export function useTrunks(): Trunk[] {
  return useSyncExternalStore(subscribe, () => trunks, () => SEED_TRUNKS);
}
export function useProviderUsers(): ProviderUser[] {
  return useSyncExternalStore(subscribe, () => providerUsers, () => SEED_PROVIDER_USERS);
}
export function useTenantUsers(): TenantUser[] {
  return useSyncExternalStore(subscribe, () => tenantUsers, () => SEED_TENANT_USERS);
}
export function useAudit(): AuditEvent[] {
  return useSyncExternalStore(subscribe, () => audit, () => SEED_AUDIT);
}

export function getSession(): Session { return session; }

/**
 * The role actually in force right now.
 *
 * Inside an impersonation session the operator sees the tenant workspace as a
 * tenant ORG_OWNER would, that is the point of impersonation, but every write is
 * still attributed to the real provider principal in the audit log.
 */
export function effectiveRole(s: Session = session): AnyRole {
  if (s.impersonation) return "ORG_OWNER";
  return s.plane === "provider" ? s.providerRole : s.tenantRole;
}

export function useEffectiveRole(): AnyRole {
  return effectiveRole(useSession());
}

/* ================================ Mutations ================================ */

export function setPlane(plane: Plane) {
  if (session.impersonation) return; // exit impersonation first
  session = { ...session, plane };
  persist(); emit();
}

export function setProviderRole(role: ProviderRole) {
  session = { ...session, providerRole: role };
  persist(); emit();
}

export function setTenantRole(role: TenantRole) {
  session = { ...session, tenantRole: role };
  persist(); emit();
}

export function setTenantId(tenantId: string) {
  session = { ...session, tenantId };
  persist(); emit();
}

/** Append an audit row. Every privileged mutation in this mock funnels here. */
export function logAudit(e: {
  action: AuditAction;
  summary: string;
  tenantId?: string;
  actor?: string;
  actorRole?: AnyRole;
}) {
  const imp = session.impersonation;
  const actor = e.actor ?? (imp ? imp.actor : defaultActor());
  const actorRole = e.actorRole ?? (imp ? imp.actorRole : effectiveRole());
  const row: AuditEvent = {
    id: `ae_${Date.now()}`,
    at: nowStamp(),
    actor,
    actorRole,
    action: e.action,
    tenantId: e.tenantId,
    summary: e.summary,
    viaImpersonation: !!imp,
    ip: imp ? "10.42.9.4" : session.plane === "provider" ? "10.42.7.19" : "49.36.180.12",
  };
  audit = [row, ...audit];
  emit();
}

/** Who the demo is "signed in as" for a given plane. */
export function defaultActor(s: Session = session): string {
  if (s.impersonation) return s.impersonation.actor;
  if (s.plane === "provider") {
    const match = providerUsers.find((u) => u.role === s.providerRole && u.status === "Active");
    return match?.email ?? "aniket.jha@paytm.com";
  }
  const match = tenantUsers.find((u) => u.tenantId === s.tenantId && u.role === s.tenantRole);
  return match?.email ?? "rohit.menon@voltmoney.in";
}

/* ------------------------------- Tenants -------------------------------- */

export function addTenant(t: Tenant) {
  tenants = [t, ...tenants];
  logAudit({ action: "tenant.create", tenantId: t.id, summary: `Onboarded ${t.name}` });
}

export function updateTenant(t: Tenant) {
  tenants = tenants.map((x) => (x.id === t.id ? t : x));
  logAudit({ action: "tenant.update", tenantId: t.id, summary: `Updated ${t.name}` });
}

export function setTenantStatus(id: string, status: Tenant["status"]) {
  const t = tenants.find((x) => x.id === id);
  if (!t) return;
  tenants = tenants.map((x) => (x.id === id ? { ...x, status } : x));
  logAudit({
    action: status === "Suspended" ? "tenant.suspend" : "tenant.update",
    tenantId: id,
    summary: `${status === "Suspended" ? "Suspended" : `Set ${status}`} ${t.name}`,
  });
}

/* -------------------------------- Trunks --------------------------------- */

export function upsertTrunk(t: Trunk) {
  const exists = trunks.some((x) => x.id === t.id);
  trunks = exists ? trunks.map((x) => (x.id === t.id ? t : x)) : [t, ...trunks];
  logAudit({
    action: exists ? "trunk.update" : "trunk.create",
    tenantId: t.tenantId,
    summary: `${exists ? "Updated" : "Provisioned"} ${t.name} · concurrency ${t.concurrency}`,
  });
}

/* ----------------------------- Provider users ---------------------------- */

export function addProviderUser(u: ProviderUser) {
  providerUsers = [u, ...providerUsers];
  logAudit({ action: "user.create", summary: `Created provider user ${u.email} as ${u.role}` });
}

export function setProviderUserRole(id: string, role: ProviderRole) {
  const u = providerUsers.find((x) => x.id === id);
  if (!u) return;
  providerUsers = providerUsers.map((x) => (x.id === id ? { ...x, role } : x));
  logAudit({ action: "user.role_change", summary: `Changed ${u.email} from ${u.role} to ${role}` });
}

export function revokeProviderUser(id: string) {
  const u = providerUsers.find((x) => x.id === id);
  if (!u) return;
  providerUsers = providerUsers.map((x) => (x.id === id ? { ...x, status: "Revoked", group: "-" } : x));
  logAudit({
    action: "auth.access_revoked",
    summary: `${u.email} removed from the Workspace group, Provider Console access revoked`,
  });
}

/* ------------------------------ Tenant users ----------------------------- */

export function addTenantUser(u: TenantUser) {
  tenantUsers = [u, ...tenantUsers];
  logAudit({ action: "user.create", tenantId: u.tenantId, summary: `Invited ${u.email} as ${u.role}` });
}

export function setTenantUserRole(id: string, role: TenantRole) {
  const u = tenantUsers.find((x) => x.id === id);
  if (!u) return;
  tenantUsers = tenantUsers.map((x) => (x.id === id ? { ...x, role } : x));
  logAudit({
    action: "user.role_change",
    tenantId: u.tenantId,
    summary: `Changed ${u.name} from ${u.role} to ${role}`,
  });
}

export function setTenantUserStatus(id: string, status: TenantUser["status"]) {
  const u = tenantUsers.find((x) => x.id === id);
  if (!u) return;
  tenantUsers = tenantUsers.map((x) => (x.id === id ? { ...x, status } : x));
  logAudit({
    action: "user.disable",
    tenantId: u.tenantId,
    summary: `Set ${u.name} to ${status}`,
  });
}

/**
 * Remove a tenant member outright. This is the provider-plane bootstrap
 * exception in reverse: a Global/Workspace Admin can pull a member off a
 * tenant's roster (e.g. a mis-provisioned first Org Owner) without entering an
 * impersonation session. It only ever deletes a tenant-plane row, never a
 * provider one.
 */
export function removeTenantUser(id: string) {
  const u = tenantUsers.find((x) => x.id === id);
  if (!u) return;
  tenantUsers = tenantUsers.filter((x) => x.id !== id);
  logAudit({
    action: "user.disable",
    tenantId: u.tenantId,
    summary: `Removed ${u.name} (${u.email}) from tenant ${u.tenantId}`,
  });
}

/* ----------------------------- Impersonation ----------------------------- */

/**
 * Open a time-boxed session against exactly one tenant. Switches the view to
 * the tenant plane; the banner and hard expiry are rendered by
 * {@link file://../components/app/ImpersonationBanner.tsx}.
 */
export function startImpersonation(opts: { tenantId: string; ticket: string }) {
  const actor = defaultActor();
  const actorRole = session.providerRole;
  const t = tenants.find((x) => x.id === opts.tenantId);
  session = {
    ...session,
    plane: "tenant",
    tenantId: opts.tenantId,
    impersonation: {
      tenantId: opts.tenantId,
      actor,
      actorRole,
      expiresAt: Date.now() + IMPERSONATION_MINUTES * 60_000,
      ticket: opts.ticket,
    },
  };
  logAudit({
    action: "impersonation.start",
    tenantId: opts.tenantId,
    actor,
    actorRole,
    summary: `Started ${IMPERSONATION_MINUTES}-minute impersonation of ${t?.name ?? opts.tenantId}, ticket ${opts.ticket}`,
  });
}

export function endImpersonation(reason: "manual" | "expired" = "manual") {
  const imp = session.impersonation;
  if (!imp) return;
  const t = tenants.find((x) => x.id === imp.tenantId);
  // Log while the session is still active so the row is attributed correctly.
  logAudit({
    action: "impersonation.end",
    tenantId: imp.tenantId,
    actor: imp.actor,
    actorRole: imp.actorRole,
    summary:
      reason === "expired"
        ? `Impersonation session of ${t?.name ?? imp.tenantId} ended (expired after ${IMPERSONATION_MINUTES}:00)`
        : `Impersonation session of ${t?.name ?? imp.tenantId} ended by operator`,
  });
  session = { ...session, impersonation: null, plane: "provider", tenantId: DEMO_TENANT_ID };
  persist();
  emit();
}

/** Reset the whole mock to seed state, handy mid-demo. */
export function resetAdminMock() {
  tenants = SEED_TENANTS;
  trunks = SEED_TRUNKS;
  providerUsers = SEED_PROVIDER_USERS;
  tenantUsers = SEED_TENANT_USERS;
  audit = SEED_AUDIT;
  session = { ...DEFAULT_SESSION };
  persist();
  emit();
}
