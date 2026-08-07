/**
 * Seed data for the Admin Panel mock (Provider Console + Tenant Workspace).
 *
 * Shapes mirror what the real panel shows today (merchant ids, trunk names,
 * user rows), so the demo reads as the actual product rather than lorem. Mock
 * only — no backend, no persistence beyond the in-memory store.
 */

import type { ProviderRole, TenantRole } from "@/lib/admin-rbac";

/* ================================= Tenants ================================= */

export type TenantStatus = "Live" | "Onboarding" | "Suspended";

export type Tenant = {
  /** Merchant id as shown in the current Merchants table. */
  id: string;
  name: string;
  /** Short slug used in the workspace switcher and audit rows. */
  slug: string;
  status: TenantStatus;
  email: string;
  phone: string;
  /** Channels provisioned for this tenant. */
  channels: ("WhatsApp" | "SMS" | "RCS" | "Voice")[];
  members: number;
  createdAt: string;
  updatedAt: string;
};

export const SEED_TENANTS: Tenant[] = [
  {
    id: "411", name: "Volt Money", slug: "voltmoney", status: "Live",
    email: "support@voltmoney.in", phone: "8071174410",
    channels: ["WhatsApp", "SMS", "Voice"], members: 6,
    createdAt: "18 Jun 2026", updatedAt: "14 Jul 2026",
  },
  {
    id: "410", name: "BharatNXT", slug: "bharatnxt", status: "Live",
    email: "ops@bharatnxt.com", phone: "9873322104",
    channels: ["WhatsApp", "Voice"], members: 4,
    createdAt: "18 Jun 2026", updatedAt: "02 Jul 2026",
  },
  {
    id: "658", name: "Fabhotels", slug: "fabhotels", status: "Live",
    email: "support@fabhotels.com", phone: "7042424242",
    channels: ["WhatsApp", "SMS", "RCS", "Voice"], members: 9,
    createdAt: "23 Jul 2026", updatedAt: "28 Jul 2026",
  },
  {
    id: "1099", name: "Suryoday Small Finance Bank", slug: "suryoday", status: "Live",
    email: "saptarnav.ghosh@suryodaybank.com", phone: "9038748998",
    channels: ["WhatsApp", "Voice"], members: 12,
    createdAt: "23 Jul 2026", updatedAt: "29 Jul 2026",
  },
  {
    id: "2330", name: "InstaMoney", slug: "instamoney", status: "Live",
    email: "cs@instamoney.app", phone: "8247845655",
    channels: ["SMS", "Voice"], members: 3,
    createdAt: "23 Jul 2026", updatedAt: "26 Jul 2026",
  },
  {
    id: "1100", name: "Prathu", slug: "prathu", status: "Onboarding",
    email: "mukul.upadhyay@paytm.com", phone: "9667196470",
    channels: ["WhatsApp"], members: 1,
    createdAt: "23 Jul 2026", updatedAt: "23 Jul 2026",
  },
  {
    id: "2660", name: "PICOM_CLIENT_1", slug: "picom1", status: "Live",
    email: "sanskar.shrivastava@paytm.com", phone: "8839034908",
    channels: ["WhatsApp", "SMS", "RCS"], members: 5,
    createdAt: "28 Jul 2026", updatedAt: "28 Jul 2026",
  },
  {
    id: "2664", name: "PICOM_CLIENT_5", slug: "picom5", status: "Suspended",
    email: "sanskar.shrivastava@paytm.com", phone: "8839034908",
    channels: ["WhatsApp"], members: 2,
    createdAt: "28 Jul 2026", updatedAt: "05 Aug 2026",
  },
];

/** The tenant the demo signs in as on the tenant plane. */
export const DEMO_TENANT_ID = "411";

export function tenantById(id: string): Tenant | undefined {
  return SEED_TENANTS.find((t) => t.id === id);
}

/* ================================== Trunks ================================= */

export type Trunk = {
  id: string;
  tenantId: string;
  name: string;
  /** Concurrent call capacity. */
  concurrency: number;
  status: "Active" | "Inactive";
  /** SIP host, shown read-only in the drawer. */
  host: string;
  createdAt: string;
  updatedAt: string;
};

export const SEED_TRUNKS: Trunk[] = [
  { id: "tr_1", tenantId: "411", name: "volt-money-trunk-1", concurrency: 10, status: "Active", host: "sip.picomm.in:5060", createdAt: "08 Jun 2026", updatedAt: "08 Jun 2026" },
  { id: "tr_2", tenantId: "410", name: "bharat-nxt-trunk", concurrency: 30, status: "Active", host: "sip.picomm.in:5060", createdAt: "18 Jun 2026", updatedAt: "18 Jun 2026" },
  { id: "tr_3", tenantId: "411", name: "volt-money-poc-trunk", concurrency: 100, status: "Active", host: "sip-poc.picomm.in:5060", createdAt: "18 Jun 2026", updatedAt: "14 Jul 2026" },
  { id: "tr_4", tenantId: "411", name: "trunk_volt_money_poc", concurrency: 10, status: "Active", host: "sip-poc.picomm.in:5060", createdAt: "22 Jun 2026", updatedAt: "22 Jun 2026" },
  { id: "tr_5", tenantId: "658", name: "trunk_fab_hotels_poc", concurrency: 10, status: "Active", host: "sip-poc.picomm.in:5060", createdAt: "22 Jun 2026", updatedAt: "22 Jun 2026" },
  { id: "tr_6", tenantId: "410", name: "trunk_bharat_poc", concurrency: 10, status: "Active", host: "sip-poc.picomm.in:5060", createdAt: "22 Jun 2026", updatedAt: "22 Jun 2026" },
  { id: "tr_7", tenantId: "1099", name: "trunk_suryoday_bank_poc", concurrency: 10, status: "Active", host: "sip-poc.picomm.in:5060", createdAt: "22 Jun 2026", updatedAt: "22 Jun 2026" },
  { id: "tr_8", tenantId: "1099", name: "trunk_suryoday_bank_post_poc", concurrency: 10, status: "Active", host: "sip.picomm.in:5060", createdAt: "22 Jun 2026", updatedAt: "29 Jul 2026" },
  { id: "tr_9", tenantId: "658", name: "fab-hotels-trunk", concurrency: 30, status: "Active", host: "sip.picomm.in:5060", createdAt: "22 Jun 2026", updatedAt: "28 Jul 2026" },
  { id: "tr_10", tenantId: "2330", name: "trunk_instamoney_poc", concurrency: 10, status: "Inactive", host: "sip-poc.picomm.in:5060", createdAt: "23 Jul 2026", updatedAt: "26 Jul 2026" },
];

/* ============================== Provider users ============================== */

export type ProviderUser = {
  id: string;
  name: string;
  /** Google Workspace identity — the only way into the Provider Console. */
  email: string;
  role: ProviderRole;
  /** Workspace group membership that derives access. */
  group: string;
  status: "Active" | "Revoked";
  lastSeen: string;
};

/** The allowlisted Google Workspace group gating the Provider Console. */
export const PROVIDER_SSO_GROUP = "picommerce-ops@paytm.com";

export const SEED_PROVIDER_USERS: ProviderUser[] = [
  { id: "pu_1", name: "Aniket Jha", email: "aniket.jha@paytm.com", role: "GLOBAL_ADMIN", group: PROVIDER_SSO_GROUP, status: "Active", lastSeen: "7 Aug 2026, 1:12 pm" },
  { id: "pu_2", name: "Sanskar Shrivastava", email: "sanskar.shrivastava@paytm.com", role: "WORKSPACE_ADMIN", group: PROVIDER_SSO_GROUP, status: "Active", lastSeen: "7 Aug 2026, 11:40 am" },
  { id: "pu_3", name: "Hafeez Ahmed", email: "hafeez.ahmed@paytm.com", role: "WORKSPACE_ADMIN", group: PROVIDER_SSO_GROUP, status: "Active", lastSeen: "6 Aug 2026, 6:05 pm" },
  { id: "pu_4", name: "Mukul Upadhyay", email: "mukul.upadhyay@paytm.com", role: "SUPPORT", group: PROVIDER_SSO_GROUP, status: "Active", lastSeen: "7 Aug 2026, 9:58 am" },
  { id: "pu_5", name: "Divyanshu Rai", email: "divyanshu.rai@paytm.com", role: "SUPPORT", group: PROVIDER_SSO_GROUP, status: "Active", lastSeen: "5 Aug 2026, 4:22 pm" },
  { id: "pu_6", name: "Spencer Fernandes", email: "spencer.f@paytm.com", role: "SUPPORT", group: "—", status: "Revoked", lastSeen: "22 Jul 2026, 3:11 pm" },
];

/* =============================== Tenant users =============================== */

export type TenantUser = {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  role: TenantRole;
  status: "Active" | "Invited" | "Disabled";
  lastSeen: string;
};

export const SEED_TENANT_USERS: TenantUser[] = [
  // Volt Money — the tenant the demo signs into.
  { id: "tu_1", name: "Rohit Menon", email: "rohit.menon@voltmoney.in", tenantId: "411", role: "ADMIN", status: "Active", lastSeen: "7 Aug 2026, 12:31 pm" },
  { id: "tu_2", name: "Priya Nair", email: "priya.nair@voltmoney.in", tenantId: "411", role: "MEMBER", status: "Active", lastSeen: "7 Aug 2026, 10:04 am" },
  { id: "tu_3", name: "Karan Shah", email: "karan.shah@voltmoney.in", tenantId: "411", role: "MEMBER", status: "Active", lastSeen: "6 Aug 2026, 7:45 pm" },
  { id: "tu_4", name: "Ananya Iyer", email: "ananya.iyer@voltmoney.in", tenantId: "411", role: "VIEWER", status: "Active", lastSeen: "5 Aug 2026, 2:18 pm" },
  { id: "tu_5", name: "Vikram Desai", email: "vikram.desai@voltmoney.in", tenantId: "411", role: "VIEWER", status: "Invited", lastSeen: "—" },
  { id: "tu_6", name: "Neha Kulkarni", email: "neha.k@voltmoney.in", tenantId: "411", role: "MEMBER", status: "Disabled", lastSeen: "12 Jul 2026, 11:02 am" },
  // Other tenants — only ever visible from the Provider Console.
  { id: "tu_7", name: "Abhimanyu Rao", email: "abhimanyu@bharatnxt.com", tenantId: "410", role: "ADMIN", status: "Active", lastSeen: "6 Aug 2026, 5:30 pm" },
  { id: "tu_8", name: "Sneha Pillai", email: "sneha@bharatnxt.com", tenantId: "410", role: "MEMBER", status: "Active", lastSeen: "4 Aug 2026, 9:12 am" },
  { id: "tu_9", name: "Deepak Sharma", email: "deepak@fabhotels.com", tenantId: "658", role: "ADMIN", status: "Active", lastSeen: "7 Aug 2026, 8:47 am" },
  { id: "tu_10", name: "Ritu Malhotra", email: "ritu@fabhotels.com", tenantId: "658", role: "MEMBER", status: "Active", lastSeen: "6 Aug 2026, 1:23 pm" },
  { id: "tu_11", name: "Saptarnav Ghosh", email: "saptarnav.ghosh@suryodaybank.com", tenantId: "1099", role: "ADMIN", status: "Active", lastSeen: "7 Aug 2026, 10:55 am" },
  { id: "tu_12", name: "Meera Joshi", email: "meera.joshi@suryodaybank.com", tenantId: "1099", role: "VIEWER", status: "Active", lastSeen: "3 Aug 2026, 4:40 pm" },
  { id: "tu_13", name: "Arjun Reddy", email: "arjun@instamoney.app", tenantId: "2330", role: "ADMIN", status: "Active", lastSeen: "5 Aug 2026, 6:19 pm" },
  { id: "tu_14", name: "Dev User 2660", email: "dev.user1.2660@example.com", tenantId: "2660", role: "MEMBER", status: "Active", lastSeen: "1 Aug 2026, 3:02 pm" },
];

/* ================================ Audit log ================================ */

export type AuditAction =
  | "tenant.create" | "tenant.update" | "tenant.suspend"
  | "trunk.create" | "trunk.update"
  | "user.create" | "user.role_change" | "user.disable"
  | "impersonation.start" | "impersonation.end"
  | "auth.sso_login" | "auth.access_revoked";

export type AuditEvent = {
  id: string;
  at: string;
  /** The real principal — never the impersonated tenant. */
  actor: string;
  actorRole: ProviderRole | TenantRole;
  action: AuditAction;
  /** Tenant the action touched, when scoped. */
  tenantId?: string;
  summary: string;
  /** True when performed inside an impersonation session. */
  viaImpersonation?: boolean;
  ip: string;
};

export const SEED_AUDIT: AuditEvent[] = [
  { id: "ae_20", at: "7 Aug 2026, 1:12:04 pm", actor: "aniket.jha@paytm.com", actorRole: "GLOBAL_ADMIN", action: "auth.sso_login", summary: "SSO login via picommerce-ops@paytm.com", ip: "10.42.7.19" },
  { id: "ae_19", at: "7 Aug 2026, 12:58:41 pm", actor: "mukul.upadhyay@paytm.com", actorRole: "SUPPORT", action: "impersonation.end", tenantId: "411", summary: "Impersonation session ended (expired after 30:00)", ip: "10.42.9.4" },
  { id: "ae_18", at: "7 Aug 2026, 12:41:07 pm", actor: "mukul.upadhyay@paytm.com", actorRole: "SUPPORT", action: "user.role_change", tenantId: "411", summary: "Changed Ananya Iyer from MEMBER to VIEWER", viaImpersonation: true, ip: "10.42.9.4" },
  { id: "ae_17", at: "7 Aug 2026, 12:28:41 pm", actor: "mukul.upadhyay@paytm.com", actorRole: "SUPPORT", action: "impersonation.start", tenantId: "411", summary: "Started 30-minute impersonation of Volt Money — ticket PICOM-5120", ip: "10.42.9.4" },
  { id: "ae_16", at: "7 Aug 2026, 11:40:22 am", actor: "sanskar.shrivastava@paytm.com", actorRole: "WORKSPACE_ADMIN", action: "auth.sso_login", summary: "SSO login via picommerce-ops@paytm.com", ip: "10.42.7.31" },
  { id: "ae_15", at: "6 Aug 2026, 6:12:55 pm", actor: "sanskar.shrivastava@paytm.com", actorRole: "WORKSPACE_ADMIN", action: "trunk.update", tenantId: "1099", summary: "Raised trunk_suryoday_bank_post_poc concurrency 10 → 30", ip: "10.42.7.31" },
  { id: "ae_14", at: "6 Aug 2026, 5:02:13 pm", actor: "hafeez.ahmed@paytm.com", actorRole: "WORKSPACE_ADMIN", action: "user.create", tenantId: "658", summary: "Created first tenant Admin deepak@fabhotels.com", ip: "10.42.7.77" },
  { id: "ae_13", at: "5 Aug 2026, 4:31:09 pm", actor: "aniket.jha@paytm.com", actorRole: "GLOBAL_ADMIN", action: "tenant.suspend", tenantId: "2664", summary: "Suspended PICOM_CLIENT_5 — non-payment", ip: "10.42.7.19" },
  { id: "ae_12", at: "5 Aug 2026, 4:22:44 pm", actor: "divyanshu.rai@paytm.com", actorRole: "SUPPORT", action: "auth.sso_login", summary: "SSO login via picommerce-ops@paytm.com", ip: "10.42.9.18" },
  { id: "ae_11", at: "3 Aug 2026, 10:14:02 am", actor: "rohit.menon@voltmoney.in", actorRole: "ADMIN", action: "user.create", tenantId: "411", summary: "Invited vikram.desai@voltmoney.in as VIEWER", ip: "49.36.180.12" },
  { id: "ae_10", at: "1 Aug 2026, 2:45:38 pm", actor: "aniket.jha@paytm.com", actorRole: "GLOBAL_ADMIN", action: "user.create", summary: "Created provider user divyanshu.rai@paytm.com as SUPPORT", ip: "10.42.7.19" },
  { id: "ae_9", at: "28 Jul 2026, 4:39:05 pm", actor: "sanskar.shrivastava@paytm.com", actorRole: "WORKSPACE_ADMIN", action: "tenant.create", tenantId: "2664", summary: "Onboarded PICOM_CLIENT_5", ip: "10.42.7.31" },
  { id: "ae_8", at: "22 Jul 2026, 3:15:20 pm", actor: "system", actorRole: "GLOBAL_ADMIN", action: "auth.access_revoked", summary: "spencer.f@paytm.com removed from picommerce-ops@paytm.com — Provider Console access revoked", ip: "—" },
  { id: "ae_7", at: "14 Jul 2026, 3:09:14 pm", actor: "sanskar.shrivastava@paytm.com", actorRole: "WORKSPACE_ADMIN", action: "trunk.update", tenantId: "411", summary: "Raised volt-money-poc-trunk concurrency 30 → 100", ip: "10.42.7.31" },
];

/* ================================= Helpers ================================= */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "7 Aug 2026" — the panel's display date format. */
export function todayLabel(): string {
  const d = new Date();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "7 Aug 2026, 1:12:04 pm" — the audit log's timestamp format. */
export function nowStamp(): string {
  const d = new Date();
  const h = d.getHours() % 12 || 12;
  const ampm = d.getHours() < 12 ? "am" : "pm";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ampm}`;
}
