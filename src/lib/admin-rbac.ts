/**
 * RBAC contract for the two-plane Admin model (Admin Panel V1).
 *
 * This file is the **single source of truth** the PRD asks for: capabilities as
 * rows, roles as columns. A new role is a new column; a new capability is a new
 * row. In production this same table is mirrored by the `ProviderRole` /
 * `TenantRole` server contract and the Supabase RLS policy — the UI gate here is
 * the *last* layer, never the enforcement boundary.
 *
 *   Provider plane (Paytm-internal, Google SSO only) → control plane
 *   Tenant plane   (per-customer, hard-scoped)       → data plane
 *
 * Mock only: nothing here talks to a server.
 */

export type Plane = "provider" | "tenant";

export type ProviderRole = "GLOBAL_ADMIN" | "WORKSPACE_ADMIN" | "SUPPORT";
export type TenantRole = "ADMIN" | "MEMBER" | "VIEWER";
export type AnyRole = ProviderRole | TenantRole;

export const PROVIDER_ROLES: ProviderRole[] = ["GLOBAL_ADMIN", "WORKSPACE_ADMIN", "SUPPORT"];
export const TENANT_ROLES: TenantRole[] = ["ADMIN", "MEMBER", "VIEWER"];

/** Which plane a role belongs to. No role ever spans both. */
export function planeOf(role: AnyRole): Plane {
  return (PROVIDER_ROLES as string[]).includes(role) ? "provider" : "tenant";
}

/**
 * Rank within a plane. Used by the grant guard: no principal may ever mint a
 * role above its own rank. Ranks are NOT comparable across planes.
 */
export const ROLE_RANK: Record<AnyRole, number> = {
  GLOBAL_ADMIN: 3,
  WORKSPACE_ADMIN: 2,
  SUPPORT: 1,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

export const ROLE_LABEL: Record<AnyRole, string> = {
  GLOBAL_ADMIN: "Global Admin",
  WORKSPACE_ADMIN: "Workspace Admin",
  SUPPORT: "Support",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

/** One-line description shown in role pickers and the matrix legend. */
export const ROLE_BLURB: Record<AnyRole, string> = {
  GLOBAL_ADMIN: "Break-glass. Everything, cross-tenant, incl. provider users. MFA + fully audited.",
  WORKSPACE_ADMIN: "Onboard tenants, provision trunks, mint a tenant's first Admin.",
  SUPPORT: "Cross-tenant read + time-boxed impersonation. The day-to-day dev/debug role.",
  ADMIN: "Everything a Member can, plus manage members and WABA accounts.",
  MEMBER: "Create, edit and run campaigns, agents and channels. View everything.",
  VIEWER: "Read-only: dashboard, analytics and history.",
};

/* ============================ Capability matrix ============================ */

export type Capability =
  | "waba_management"
  | "member_management"
  | "build_content"
  | "provisioning"
  | "provider_user_management"
  | "own_workspace"
  | "provider_console"
  | "cross_tenant_read"
  | "impersonation";

export type CapabilityMeta = {
  key: Capability;
  label: string;
  /** Shown under the label in the matrix — why this row exists. */
  note: string;
};

/** Row order in the matrix, matching the PRD table. */
export const CAPABILITIES: CapabilityMeta[] = [
  { key: "waba_management", label: "WABA management", note: "Add and manage WhatsApp Business accounts" },
  { key: "member_management", label: "Member management", note: "Create / view / edit members of one tenant" },
  { key: "build_content", label: "Build campaigns / agents / channels", note: "Author and run tenant content" },
  { key: "provisioning", label: "Trunk & tenant provisioning", note: "Onboard a tenant, provision trunks, mint its first Admin" },
  { key: "provider_user_management", label: "Provider-user management", note: "Create / manage provider accounts" },
  { key: "own_workspace", label: "Own workspace", note: "Access the customer-facing Tenant Workspace" },
  { key: "provider_console", label: "Provider Console", note: "Reach the Paytm-internal control plane" },
  { key: "cross_tenant_read", label: "Cross-tenant read", note: "Read data belonging to more than one tenant" },
  { key: "impersonation", label: "Impersonation", note: "Open one tenant's workspace in a time-boxed session" },
];

/**
 * The grant table. `true` = granted, `false` = not granted.
 *
 * Note the two deliberate holes the PRD calls out:
 *  - Provider roles never hold `own_workspace` or `build_content`. They write to
 *    tenant data only *inside* an impersonation session, which is a transient
 *    session capability, not a standing grant — so it isn't ticked here.
 *  - `VIEWER` holds `own_workspace` read-only; every mutating capability is false.
 */
const MATRIX: Record<Capability, Record<AnyRole, boolean>> = {
  waba_management: {
    ADMIN: true, MEMBER: false, VIEWER: false,
    GLOBAL_ADMIN: false, WORKSPACE_ADMIN: false, SUPPORT: false,
  },
  member_management: {
    ADMIN: true, MEMBER: false, VIEWER: false,
    GLOBAL_ADMIN: false, WORKSPACE_ADMIN: false, SUPPORT: false,
  },
  build_content: {
    ADMIN: true, MEMBER: true, VIEWER: false,
    GLOBAL_ADMIN: false, WORKSPACE_ADMIN: false, SUPPORT: false,
  },
  provisioning: {
    ADMIN: false, MEMBER: false, VIEWER: false,
    GLOBAL_ADMIN: true, WORKSPACE_ADMIN: true, SUPPORT: false,
  },
  provider_user_management: {
    ADMIN: false, MEMBER: false, VIEWER: false,
    GLOBAL_ADMIN: true, WORKSPACE_ADMIN: false, SUPPORT: false,
  },
  own_workspace: {
    ADMIN: true, MEMBER: true, VIEWER: true,
    GLOBAL_ADMIN: false, WORKSPACE_ADMIN: false, SUPPORT: false,
  },
  provider_console: {
    ADMIN: false, MEMBER: false, VIEWER: false,
    GLOBAL_ADMIN: true, WORKSPACE_ADMIN: true, SUPPORT: true,
  },
  cross_tenant_read: {
    ADMIN: false, MEMBER: false, VIEWER: false,
    GLOBAL_ADMIN: true, WORKSPACE_ADMIN: true, SUPPORT: true,
  },
  impersonation: {
    ADMIN: false, MEMBER: false, VIEWER: false,
    GLOBAL_ADMIN: true, WORKSPACE_ADMIN: false, SUPPORT: true,
  },
};

/** Does `role` hold `cap`? The one function every gate should call. */
export function can(role: AnyRole, cap: Capability): boolean {
  return MATRIX[cap][role];
}

/** Every capability held by a role — used by the role picker summary. */
export function capabilitiesOf(role: AnyRole): CapabilityMeta[] {
  return CAPABILITIES.filter((c) => can(role, c.key));
}

/* ============================ Grant validation ============================ */

export type GrantCheck = { ok: boolean; reason?: string };

/**
 * A grant is valid only when
 *   (a) the target role is in the same plane as the granter, and
 *   (b) target rank ≤ granter rank, and
 *   (c) the granter actually holds the relevant management capability.
 *
 * Server-side this is a rejection, not a hidden menu item. The UI calls it so
 * the mock behaves the same way the API will.
 */
export function canGrant(granter: AnyRole, target: AnyRole): GrantCheck {
  if (planeOf(granter) !== planeOf(target)) {
    return { ok: false, reason: "Cross-plane grant. A tenant role can never mint a provider role." };
  }
  const managing: Capability =
    planeOf(target) === "provider" ? "provider_user_management" : "member_management";
  if (!can(granter, managing)) {
    return { ok: false, reason: `${ROLE_LABEL[granter]} cannot manage ${planeOf(target)} users.` };
  }
  if (ROLE_RANK[target] > ROLE_RANK[granter]) {
    return { ok: false, reason: `No principal may grant a role above its own rank (${ROLE_LABEL[granter]}).` };
  }
  return { ok: true };
}

/** The roles a given principal is allowed to offer in a create-user form. */
export function assignableRoles(granter: AnyRole): AnyRole[] {
  const pool: AnyRole[] = planeOf(granter) === "provider" ? [...PROVIDER_ROLES] : [...TENANT_ROLES];
  return pool.filter((r) => canGrant(granter, r).ok);
}

/* ============================ Role migration ============================ */

/** The current → target mapping from the PRD, rendered on the Roles page. */
export const ROLE_MIGRATION: { from: string; to: string; note: string }[] = [
  {
    from: "ADMIN held by a customer",
    to: "ADMIN (tenant plane)",
    note: "Scoped to one tenant. Loses cross-tenant access, provisioning, and trunk edits.",
  },
  {
    from: "ADMIN used by Paytm staff",
    to: "WORKSPACE_ADMIN / GLOBAL_ADMIN",
    note: "Moves to the provider plane, reachable only through Google SSO.",
  },
  {
    from: "ROOT_USER",
    to: "GLOBAL_ADMIN",
    note: "Provider plane, internal only. Break-glass with MFA and full audit.",
  },
  {
    from: "STANDARD_USER",
    to: "MEMBER (default) or VIEWER",
    note: "Members keep building; read-only staff drop to Viewer.",
  },
];
