/**
 * Users seed data for the Settings > Users tab.
 *
 * Mirrors the production Users page layout so the local build matches the
 * live product. The real backend stores hashed passwords and issues an
 * ORG_OWNER or MEMBER role.
 */

export type UserRole = "ORG_OWNER" | "MEMBER";
export type UserStatus = "Active" | "Suspended";

export type UserRow = {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  updatedAt: string; // ISO
};

export const SEED_USERS: UserRow[] = [
  { id: 17, username: "Nausheen",       email: "noora.nausheen@paytm.com",     role: "ORG_OWNER", status: "Active", updatedAt: "2026-09-14T14:19:41+05:30" },
  { id: 67, username: "Rupam Nandi",    email: "rupam.nandi@paytm.com",        role: "ORG_OWNER", status: "Active", updatedAt: "2026-09-14T12:54:39+05:30" },
  { id: 25, username: "demo",           email: "demo@picommerce.com",          role: "ORG_OWNER", status: "Active", updatedAt: "2026-09-14T10:30:00+05:30" },
  { id: 20, username: "dev_user1_2660", email: "dev.user1.2660@example.com",   role: "ORG_OWNER", status: "Active", updatedAt: "2026-09-10T20:27:01+05:30" },
  { id: 43, username: "Puru Chauhan",   email: "puru.chauhan@paytm.com",       role: "ORG_OWNER", status: "Active", updatedAt: "2026-08-31T15:08:34+05:30" },
  { id: 18, username: "sanskar1",       email: "sanskar.shrivastava@sales.com",role: "ORG_OWNER", status: "Active", updatedAt: "2026-08-25T15:32:36+05:30" },
  { id: 19, username: "aniket.jha",     email: "aniket.jha@sales.com",         role: "ORG_OWNER", status: "Active", updatedAt: "2026-08-24T20:22:06+05:30" },
  { id: 21, username: "hafeez",         email: "hafeez@paytm.com",             role: "ORG_OWNER", status: "Active", updatedAt: "2026-08-19T19:28:48+05:30" },
  { id: 23, username: "divyanshu",      email: "divyanshu.shekhar@paytm.com",  role: "ORG_OWNER", status: "Active", updatedAt: "2026-08-19T19:28:48+05:30" },
  { id: 26, username: "Spencer",        email: "spencerretail@picommerce.com", role: "ORG_OWNER", status: "Active", updatedAt: "2026-08-19T19:28:48+05:30" },
  { id: 30, username: "superK",         email: "SuperK@picom.com",             role: "ORG_OWNER", status: "Active", updatedAt: "2026-08-19T19:28:48+05:30" },
];
