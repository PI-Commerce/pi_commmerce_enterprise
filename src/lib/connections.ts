/**
 * Audience Connections — the model behind Connections (`/integrations`).
 *
 * A client's audience already lives somewhere else: in a CLM platform as a journey
 * that qualifies users in real time, or in a CRM as a list a sales team curates.
 * Pi Commerce does not rebuild that audience — it accepts it, decides whether each
 * person should be contacted, executes, and reports back.
 *
 * Three objects carry the whole model:
 *   Connection — how we reach a client's system, and what it can supply. Long-lived.
 *   Campaign   — what we send, and which fields the message needs. Long-lived.
 *   Run        — one execution of a campaign against one audience source. Per launch.
 *
 * The rule that keeps the experience simple: **connect once, bind per run.**
 *
 * A Connection is *pull only*. That restriction is the whole design, and it follows
 * from who authors the payload:
 *
 *   Pull (CRM — Salesforce, LeadSquared, …). We write the query, so their schema is
 *     fixed, discoverable, and not ours to choose. Naming is therefore *our* problem
 *     and we have to ask: hence the catalogue, the roles, and per-run bindings.
 *
 *   Push (CLM — CleverTap, WebEngage, MoEngage, custom). *They* build the request
 *     body, so there is no fixed schema to discover — the payload is whatever they
 *     typed. Naming is therefore *their* problem, and the way they solve it is by
 *     using our key names. We hand them the exact body to paste. Mapping a pushed
 *     payload would be a category error: it invites the user to reconcile a new
 *     campaign's fields against a catalogue learned from an unrelated older call.
 *
 * So push does not get a Connection. It stays the per-run API trigger it already
 * was, made platform-aware — see {@link PUSH_TARGETS} and {@link pushBody}. The
 * endpoint carries the run id (`/v1/runs/trigger/{runId}`) because a person arriving
 * on a connection-wide URL would have no run to belong to.
 *
 * Push tools do still appear on the Connections page, in their own group. That is
 * not a contradiction — they are listed there as *reference*, not configuration.
 * The page is where someone goes to ask "can you work with WebEngage", and the
 * honest answer is yes, here is the body it has to send. What that group carries is
 * a fixed fact about a platform, not a per-tenant object: no credential, no
 * catalogue, no health, and above all no endpoint, since the endpoint cannot exist
 * until a run does. The distinction is load-bearing enough that the two groups are
 * labelled by direction — see {@link PushTarget} and the Connections route.
 *
 * Everything else (batch vs single payloads, per-platform response conventions,
 * setup handshakes, coalescing, the brokered CRM layer, rate-limit pacing) is real
 * but deliberately hidden: if a field exists to tell us something we can detect, or
 * to expose a difference the client can't act on, it doesn't belong on screen.
 */
import { useSyncExternalStore } from "react";
import { EXAMPLE_CAMPAIGNS } from "@/lib/campaign-examples";

/* ================================== States ================================= */

/**
 * Two states, each with a distinct user action. Deliberately *not* modelled:
 * "needs attention" and "catalogue thin" — non-blocking warnings the client can't
 * act on are noise in a list that has to read at a glance. "Waiting for first
 * call" is gone with push: a pull connection can be verified the moment it is
 * authorised, so there is nothing to wait for.
 */
export type ConnectionHealth =
  /** Syncing. No action. */
  | "healthy"
  /** Expired token or revoked credential. One label for different causes — the
   *  detail page carries the specifics. */
  | "reconnect";

/* ================================== Roles =================================== */

/**
 * A handful of attributes are structural rather than campaign-specific. These are
 * assigned once per connection, by role — which is what makes field-name drift
 * (`phone` in one campaign, `ph_number` in the next) a non-event. We are not
 * matching strings between campaign and source; we match each side independently
 * to a role.
 *
 * `consent` earns role status because without it the dry run cannot honestly show
 * "skipped — DoNotCall set in Salesforce".
 */
export type RoleKey = "phone" | "email" | "name" | "identifier" | "consent";

export const ROLES: { key: RoleKey; label: string; hint: string; required: boolean }[] = [
  { key: "phone",      label: "Phone",              hint: "The number we dial or message.",              required: true },
  { key: "identifier", label: "Primary identifier", hint: "This system's own record ID.",                required: true },
  { key: "name",       label: "Name",               hint: "Used for personalisation.",                   required: false },
  { key: "email",      label: "Email",              hint: "Used for email steps and de-duplication.",    required: false },
  { key: "consent",    label: "Consent flag",       hint: "Suppresses anyone this system says not to contact.", required: false },
];

/**
 * Curated synonym list per role. Deliberately not an expression language — a
 * client should never have to write a rule to say "this column is the phone".
 */
const ROLE_SYNONYMS: Record<RoleKey, string[]> = {
  phone: ["phone", "phonenumber", "phoneno", "phnumber", "mobile", "mobilephone", "mobileno", "msisdn", "cell", "cellphone", "contactnumber", "primaryphone", "whatsappnumber"],
  email: ["email", "emailaddress", "mail", "primaryemail", "workemail", "emailid"],
  name: ["name", "firstname", "fname", "givenname", "fullname", "customername", "contactname", "leadname", "displayname"],
  identifier: ["id", "customerid", "leadid", "contactid", "recordid", "externalid", "prospectid", "userid", "uid", "accountid", "crmid"],
  consent: ["consent", "donotcall", "dnc", "donotcontact", "donotdisturb", "optout", "optin", "optedout", "optedin", "hasoptedout", "isoptedout", "emailoptout", "smsoptout", "marketingoptin", "subscribed", "unsubscribed", "consentflag"],
};

/**
 * Normalisation rule: lowercase, strip underscores / spaces / hyphens / dots.
 * `phone`, `ph_number`, `phoneNumber`, `Phone Number` and `mobile` all land on the
 * same role, with zero client effort.
 */
export function normaliseFieldName(name: string): string {
  return name.toLowerCase().replace(/[\s_\-.]/g, "");
}

/** The role a field name implies, if any. */
export function roleForFieldName(name: string): RoleKey | null {
  const n = normaliseFieldName(name);
  for (const key of Object.keys(ROLE_SYNONYMS) as RoleKey[]) {
    if (ROLE_SYNONYMS[key].includes(n)) return key;
  }
  return null;
}

/* ============================== Source catalogue ============================ */

/**
 * What the connected system can give us, read from the platform's field metadata.
 * Discovered, never typed by hand — a hand-typed field list is guaranteed to go
 * stale, and the drift is invisible until a message renders blank.
 */
export type SourceAttribute = {
  name: string;
  type: "String" | "Number" | "Boolean";
  /** A real value from the platform, shown in the dry run so mapping is provable. */
  sample?: string;
};

/* ============================== Saved audiences ============================= */

/**
 * One audience definition on the client's side, plus how often we look at it.
 *
 * The choice belongs to the *run* — one connection may feed a daily eligibility
 * campaign and a monthly win-back. But re-picking it every launch would break the
 * "connect once" promise, so definitions live on the connection and a run just
 * points at one. Same mechanism as binding hints: effort decays to zero without
 * adding a fourth object.
 *
 * Two modes, because CRMs genuinely offer two and they are not interchangeable:
 *
 *   list  — a saved list/report/view that already exists on their side. We can
 *           enumerate these, so the client picks rather than types.
 *   query — criteria the client supplies (LeadSquared's Lead Search being the
 *           case in point). There is nothing to enumerate: the audience does not
 *           exist until someone defines it, so it has to be authored here.
 *
 * A query mode audience is the reason a connection holds *many* of these. Each
 * saved search is a different audience, but they all come out of one account with
 * one credential, one field catalogue and one set of role assignments — so they
 * are rows inside a connection, not connections of their own.
 */
export type SavedAudience = {
  id: string;
  /** The client's own name for the list, or the name they gave this search. */
  name: string;
  /** How often we fetch it. */
  cadence: "15 min" | "Hourly" | "Daily" | "Weekly";
  /** Approximate size at last read — display only. */
  size: number;
  /** How this audience is defined on their side. */
  mode: "list" | "query";
  /**
   * The search criteria, verbatim, when `mode` is "query". Stored exactly as the
   * client wrote it: we send it back to their API untouched, so reformatting it
   * would mean showing them something other than what runs.
   */
  query?: string;
};

/* ================================ Connection =============================== */

export type Connection = {
  id: string;
  /** Platform key into {@link PLATFORMS}. */
  platform: string;
  /** Client-chosen label — several connections to one platform are normal. */
  label: string;
  /**
   * Which regional API host serves this account, keyed into `Platform.regions`.
   * Not a preference and not guessable: an account provisioned in one region is
   * simply not reachable on another host, so getting it wrong fails every call.
   */
  region?: string;
  health: ConnectionHealth;
  createdAt: string;
  /** The live signal shown on the row: records today, or last sync. */
  signal: string;
  /** What this system can supply. */
  catalogue: SourceAttribute[];
  /** Role → source attribute name. Confirmed once, at connect time. */
  roles: Partial<Record<RoleKey, string>>;
  /**
   * Bindings the client has confirmed before, keyed by *normalised* campaign field
   * name. The second campaign that declares `ph_number` arrives pre-bound because
   * someone answered that question once.
   */
  hints: Record<string, string>;
  /** Remembered list/cadence choices. */
  audiences: SavedAudience[];
  /** Write each person's outcome back into the source system against their record. */
  writeBack: boolean;
  /** Reconnect only — the specific cause, carried on the detail page. */
  issue?: string;
};

/* ============================ Platform registry ============================= */

/**
 * A regional API host. Several CRMs provision an account into one region and serve
 * it from a host that only that region answers on, so this is a fact to be told
 * rather than a setting to be tuned.
 */
export type Region = { key: string; label: string; host: string };

/**
 * LeadSquared's hosts. Someone who does not know theirs finds it on the API docs
 * page inside their own account, which is why the field says so rather than
 * offering a "detect" button we cannot honestly implement without a key.
 */
const LSQ_REGIONS: Region[] = [
  { key: "in21", label: "India",         host: "api-in21.leadsquared.com" },
  { key: "us11", label: "United States", host: "api-us11.leadsquared.com" },
];

/** A system we pull audiences from. */
export type Platform = {
  key: string;
  name: string;
  /** Tailwind classes for the letter-mark tile. */
  accent: string;
  /** What they pick an audience from, in their words. Singular. */
  audienceNoun: string;
  /** How they authorise. */
  auth: "oauth" | "credentials";
  /**
   * Whether the integration is actually built. A CRM pull is real work — their
   * query language, their field metadata, their pagination — so shipping one is
   * not the same as listing it. Saying so on the row is cheaper than letting
   * someone authorise into a dead end and discover it at the dry run.
   */
  live: boolean;
  /** Regional hosts, when the platform has them. Absent = one global host. */
  regions?: Region[];
  /**
   * What this platform calls a search the client authors themselves, in its own
   * vocabulary. Absent means audiences can only be picked from lists we enumerate.
   * Its presence is what turns on the query mode in {@link SavedAudience}.
   */
  queryNoun?: string;
};

export const PLATFORMS: Platform[] = [
  { key: "leadsquared",name: "LeadSquared",   accent: "bg-[#0E9F6E]/12 text-[#0E9F6E]", audienceNoun: "list",   auth: "credentials", live: true,  regions: LSQ_REGIONS, queryNoun: "Lead Search" },
  { key: "salesforce", name: "Salesforce",    accent: "bg-[#00A1E0]/12 text-[#0284C7]", audienceNoun: "report", auth: "oauth",       live: false },
  { key: "zoho",       name: "Zoho CRM",      accent: "bg-[#E42527]/12 text-[#DC2626]", audienceNoun: "view",   auth: "oauth",       live: false },
  { key: "hubspot",    name: "HubSpot",       accent: "bg-[#FF7A59]/12 text-[#EA580C]", audienceNoun: "list",   auth: "oauth",       live: false },
  { key: "dynamics",   name: "Dynamics 365",  accent: "bg-[#742774]/12 text-[#7E22CE]", audienceNoun: "view",   auth: "oauth",       live: false },
  { key: "pipedrive",  name: "Pipedrive",     accent: "bg-[#017737]/12 text-[#15803D]", audienceNoun: "filter", auth: "oauth",       live: false },
];

export function platform(key: string): Platform {
  return PLATFORMS.find((p) => p.key === key) ?? PLATFORMS[0];
}

/** The host a connection actually talks to, for display. */
export function connectionHost(conn: Connection): string | null {
  return platform(conn.platform).regions?.find((r) => r.key === conn.region)?.host ?? null;
}

/** Platforms reachable through the brokered CRM layer but not worth listing individually. */
export const BROKERED_OVERFLOW = 18;

/* =========================== Push targets (no connection) ================== */

/**
 * The systems that call *us*. These are not Connections and deliberately carry no
 * state: no catalogue, no roles, no key of their own. Picking one on a run changes
 * two things only — the personalisation token syntax in the generated body, and the
 * sentence naming where to paste it.
 *
 * That is the entire value over a bare REST endpoint, and it is enough: the
 * difference between "POST us some JSON" and "paste this into Journey → Webhook →
 * Custom body" is most of the setup failure rate.
 */
export type PushTarget = {
  key: string;
  name: string;
  accent: string;
  /**
   * Where the client pastes the body, named in the platform's own vocabulary —
   * "Call API block → Body" beats "sample request" because it names the screen
   * they are looking at.
   */
  pasteInto: string;
  /** How that platform writes a personalisation token. */
  token: (name: string) => string;
};

export const PUSH_TARGETS: PushTarget[] = [
  { key: "clevertap", name: "CleverTap",      accent: "bg-[#F04E5E]/12 text-[#D8394A]", pasteInto: "Journey → Webhook → Custom body",        token: (n) => `$${n}` },
  { key: "webengage", name: "WebEngage",      accent: "bg-[#4A3AFF]/12 text-[#4A3AFF]", pasteInto: "Journey → Call API block → Body",        token: (n) => `{{${n}}}` },
  { key: "moengage",  name: "MoEngage",       accent: "bg-[#1B6FE3]/12 text-[#1B6FE3]", pasteInto: "Custom Connector campaign → JSON body",  token: (n) => `\${${n}}` },
  { key: "custom",    name: "Custom / other", accent: "bg-secondary text-muted-foreground", pasteInto: "your system's HTTP POST body",       token: (n) => `<${n}>` },
];

export function pushTarget(key: string): PushTarget {
  return PUSH_TARGETS.find((t) => t.key === key) ?? PUSH_TARGETS[3];
}

/**
 * The push targets worth a row on the Connections page — i.e. the named products.
 * "Custom / other" is deliberately excluded: it is the *absence* of a named tool,
 * so a connector row for it would be a row about nothing. It remains a choice on
 * the run, which is where someone who has no named tool actually is.
 */
export const LISTED_PUSH_TARGETS = PUSH_TARGETS.filter((t) => t.key !== "custom");

/** Whether a key names a real product we list, as opposed to the custom fallback. */
export function isListedPushTarget(key: string): boolean {
  return LISTED_PUSH_TARGETS.some((t) => t.key === key);
}

/* ============================= Source catalogues =========================== */

const SF_CATALOGUE: SourceAttribute[] = [
  { name: "Id",                  type: "String", sample: "003Ax000004TmiKIAS" },
  { name: "FirstName",           type: "String", sample: "Ananya" },
  { name: "LastName",            type: "String", sample: "Rao" },
  { name: "MobilePhone",         type: "String", sample: "+91 98670 41123" },
  { name: "Email",               type: "String", sample: "ananya.rao@example.com" },
  { name: "DoNotCall",           type: "Boolean",sample: "false" },
  { name: "Eligible_Amount__c",  type: "Number", sample: "240000" },
  { name: "Product_Interest__c", type: "String", sample: "Top-up loan" },
  { name: "Branch_Code__c",      type: "String", sample: "MUM-014" },
  { name: "EMI_Date__c",         type: "String", sample: "2026-08-05" },
  { name: "Preferred_Language__c", type: "String", sample: "en" },
];

const LSQ_CATALOGUE: SourceAttribute[] = [
  { name: "ProspectId",          type: "String", sample: "b41f9a2e-77c0" },
  { name: "FirstName",           type: "String", sample: "Rohit" },
  { name: "Phone",               type: "String", sample: "+91 90045 22781" },
  { name: "EmailAddress",        type: "String", sample: "rohit.k@example.com" },
  { name: "mx_Do_Not_Call",      type: "Boolean",sample: "false" },
  { name: "mx_Eligible_Amount",  type: "Number", sample: "85000" },
  { name: "mx_Product",          type: "String", sample: "Personal loan" },
  { name: "mx_Branch",           type: "String", sample: "BLR-002" },
  { name: "mx_Weeks_Inactive",   type: "Number", sample: "11" },
];

/* ============================== Audience searches ========================== */

/**
 * The starting point in the query editor. A blank textarea asking for "search
 * criteria" is a documentation lookup; a template that already has the shape is a
 * two-word edit. It uses attributes from the real catalogue so the first thing
 * anyone does — change the value and test — actually returns something.
 */
export const SEARCH_TEMPLATE = [
  "{",
  '  "Conditions": [',
  '    { "Attribute": "mx_DPD", "Operator": "between", "Value": "15,30" }',
  "  ]",
  "}",
].join("\n");

export type SearchTest =
  | { ok: true; count: number; sample: string[] }
  | { ok: false; error: string };

/**
 * Run the search and report what came back.
 *
 * This exists because a hand-written search is *going* to be wrong sometimes, and
 * without it the first evidence of that is a run that quietly processes nobody —
 * by which point a campaign has been launched against an empty audience. Catching
 * it here costs one click.
 *
 * It reports a count *and* names, because they fail differently: zero results means
 * the criteria are too narrow, while plausible-looking names that are the wrong
 * people mean the criteria are simply wrong, and only a sample shows that.
 */
export function testSearch(platformKey: string, query: string): SearchTest {
  const text = query.trim();
  if (!text) return { ok: false, error: "Nothing to run — add your search criteria." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "This isn't valid JSON. Check for a trailing comma or an unclosed brace." };
  }

  const conditions = (parsed as { Conditions?: unknown })?.Conditions;
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return {
      ok: false,
      error: `${platform(platformKey).name} expects a non-empty "Conditions" array.`,
    };
  }

  // Deterministic from the criteria, so the same search reports the same size every
  // time it is tested — a number that moved on its own would read as a live count.
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) % 100000;
  const count = 400 + (hash % 9200);

  return {
    ok: true,
    count,
    sample: ["Ananya Rao", "Rohit Kulkarni", "Meera Iyer"],
  };
}

/* ================================ Seed data ================================ */

/**
 * Only LeadSquared is seeded, because only LeadSquared is built. A healthy
 * connection to an integration that does not exist is the most expensive kind of
 * demo data: it reads as a promise.
 */
const SEED: Connection[] = [
  {
    id: "conn_leadsquared",
    platform: "leadsquared",
    label: "LeadSquared · Lending",
    region: "in21",
    health: "healthy",
    createdAt: "27 Feb 2026",
    signal: "Last sync 4 h ago · 3 audiences",
    catalogue: LSQ_CATALOGUE,
    roles: { phone: "Phone", identifier: "ProspectId", name: "FirstName", email: "EmailAddress", consent: "mx_Do_Not_Call" },
    // `mx_EMI_Date` was renamed on their side — the hint now points at an attribute
    // the catalogue no longer contains, so any campaign field that resolves through
    // it lands in "needs remapping" rather than silently binding to null.
    hints: {
      eliamt: "mx_Eligible_Amount",
      product: "mx_Product",
      emidate: "mx_EMI_Date",
    },
    // Three audiences off one credential — which is the whole argument for the
    // container. Two are searches someone authored; one is a list that already
    // existed on their side.
    audiences: [
      {
        id: "aud_lsq_dpd",
        name: "DPD 15–30",
        cadence: "Hourly",
        size: 6204,
        mode: "query",
        query: SEARCH_TEMPLATE,
      },
      {
        id: "aud_lsq_cold",
        name: "Cold leads — 60d",
        cadence: "Daily",
        size: 9310,
        mode: "list",
      },
      {
        id: "aud_lsq_topup",
        name: "Top-up eligible · Bengaluru",
        cadence: "Daily",
        size: 1180,
        mode: "query",
        query: [
          "{",
          '  "Conditions": [',
          '    { "Attribute": "mx_Eligible_Amount", "Operator": "greater-than", "Value": "50000" },',
          '    { "Attribute": "mx_Branch", "Operator": "eq", "Value": "BLR-002" }',
          "  ]",
          "}",
        ].join("\n"),
      },
    ],
    writeBack: false,
  },
];

/* ================================ Discovery ================================ */

const GENERIC_CATALOGUE: SourceAttribute[] = [
  { name: "record_id",       type: "String", sample: "usr_88412" },
  { name: "full_name",       type: "String", sample: "Kabir Shah" },
  { name: "mobile",          type: "String", sample: "+91 98111 20034" },
  { name: "email",           type: "String", sample: "kabir.s@example.com" },
  { name: "opted_out",       type: "Boolean",sample: "false" },
  { name: "plan",            type: "String", sample: "Gold" },
  { name: "days_since_seen", type: "Number", sample: "14" },
  { name: "cart_value",      type: "Number", sample: "1890" },
  { name: "language",        type: "String", sample: "en" },
];

/**
 * What we learn about a system once we can see it, read from its field metadata at
 * authorise time. The client never types a field list; asking them to would
 * guarantee it goes stale.
 */
export function discoverCatalogue(platformKey: string): SourceAttribute[] {
  switch (platformKey) {
    case "leadsquared": return LSQ_CATALOGUE;
    case "salesforce":
    case "zoho":
    case "hubspot":
    case "dynamics":
    case "pipedrive":   return SF_CATALOGUE;
    default:            return GENERIC_CATALOGUE;
  }
}

/**
 * The lists, reports, views and filters that already exist on their side. We read
 * their names verbatim — the client should recognise their own work rather than
 * translate it into our vocabulary.
 *
 * This is the whole of what can be *discovered*. An audience defined by criteria
 * does not appear here and never will: it does not exist on their side until
 * someone writes it, which is exactly why the query mode has an editor.
 */
export function discoverAudiences(platformKey: string): Omit<SavedAudience, "cadence">[] {
  switch (platformKey) {
    case "salesforce":
      return [
        { id: "aud_sf_topup",  name: "Eligible for top-up (report)",     size: 12480, mode: "list" },
        { id: "aud_sf_lapsed", name: "Lapsed premium — 90d (filter)",    size: 3106,  mode: "list" },
        { id: "aud_sf_renew",  name: "Renewals due this month (report)", size: 1842,  mode: "list" },
      ];
    case "leadsquared":
      return [
        { id: "aud_lsq_cold",    name: "Cold leads — 60d",       size: 9310, mode: "list" },
        { id: "aud_lsq_webform", name: "Web form — last 7d",     size: 2140, mode: "list" },
        { id: "aud_lsq_nurture", name: "Nurture — unresponsive", size: 4870, mode: "list" },
      ];
    case "hubspot":
      return [
        { id: "aud_hs_mql",   name: "MQLs — this quarter (list)",  size: 890, mode: "list" },
        { id: "aud_hs_trial", name: "Trial expiring in 7d (list)", size: 412, mode: "list" },
      ];
    default:
      return [
        { id: "aud_active",  name: "Active customers (view)", size: 5400, mode: "list" },
        { id: "aud_dormant", name: "Dormant 90d (filter)",    size: 2210, mode: "list" },
      ];
  }
}

/**
 * Pre-fill role assignments from the discovered catalogue so the confirm step is a
 * glance rather than five dropdowns. The client still confirms — a wrong phone
 * column is the one mistake that must not pass silently.
 */
export function autoAssignRoles(catalogue: SourceAttribute[]): Partial<Record<RoleKey, string>> {
  const roles: Partial<Record<RoleKey, string>> = {};
  for (const attr of catalogue) {
    // `profile.phone` normalises to `profilephone`, so fall back to the last segment.
    const role = roleForFieldName(attr.name) ?? roleForFieldName(attr.name.split(".").pop() ?? "");
    if (role && !roles[role]) roles[role] = attr.name;
  }
  return roles;
}

/* ================================== Store ================================== */
/**
 * Module-level store + `useSyncExternalStore`, matching the WABA connection store:
 * connections must survive navigation between Connections, the detail page and the
 * Run modal without prop-drilling or a provider. In-memory only, so a hard refresh
 * resets the demo and the connect flows can be replayed live.
 */

let current: Connection[] = SEED;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive read of every connection. */
export function useConnections(): Connection[] {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

/** Reactive read of one connection. */
export function useConnection(id: string): Connection | undefined {
  return useConnections().find((c) => c.id === id);
}

/** Imperative read — handy outside React. */
export function getConnections() {
  return current;
}

export function addConnection(c: Connection) {
  current = [c, ...current];
  emit();
}

export function updateConnection(id: string, patch: Partial<Connection>) {
  current = current.map((c) => (c.id === id ? { ...c, ...patch } : c));
  emit();
}

export function removeConnection(id: string) {
  current = current.filter((c) => c.id !== id);
  emit();
}

/**
 * Remember a binding the client just confirmed, on the connection, keyed by the
 * normalised campaign field name. This is the mechanism that makes the audience
 * step all ticks and no dropdowns by the fourth or fifth campaign.
 */
export function rememberBindings(id: string, bindings: Record<string, string>) {
  const conn = current.find((c) => c.id === id);
  if (!conn) return;
  const hints = { ...conn.hints };
  for (const [field, attr] of Object.entries(bindings)) {
    hints[normaliseFieldName(field)] = attr;
  }
  updateConnection(id, { hints });
}

/**
 * Add an audience definition to a connection. Adding is idempotent by id so that
 * picking a saved list twice does not produce two identical rows.
 */
export function addAudience(id: string, audience: SavedAudience) {
  const conn = current.find((c) => c.id === id);
  if (!conn || conn.audiences.some((a) => a.id === audience.id)) return;
  updateConnection(id, {
    audiences: [...conn.audiences, audience],
    signal: `Last sync just now · ${conn.audiences.length + 1} audiences`,
  });
}

export function removeAudience(id: string, audienceId: string) {
  const conn = current.find((c) => c.id === id);
  if (!conn) return;
  updateConnection(id, { audiences: conn.audiences.filter((a) => a.id !== audienceId) });
}

/* =============================== Campaign fields =========================== */

/** A field the campaign's message needs, declared on its Audience node. */
export type CampaignField = { name: string; type: SourceAttribute["type"] };

const FALLBACK_FIELDS: CampaignField[] = [
  { name: "customer_id", type: "String" },
  { name: "phone",       type: "String" },
  { name: "first_name",  type: "String" },
  { name: "eli_amt",     type: "Number" },
  { name: "product",     type: "String" },
  { name: "branch",      type: "String" },
  { name: "emi_date",    type: "String" },
];

/**
 * The fields a campaign declares it needs, read from its Audience node — the same
 * list the campaign builder edits, so the run's bindings can never drift from what
 * the message actually renders.
 */
export function campaignFields(campaignId: string): CampaignField[] {
  const campaign = EXAMPLE_CAMPAIGNS[campaignId];
  const audience = campaign?.nodes.find((n) => n.data.kind === "audience");
  const cfg = audience?.data.config;
  if (cfg?.fields?.length) {
    return cfg.fields.map((f) => ({ name: f.name, type: f.type }));
  }
  if (cfg?.csvKeys?.length) {
    return cfg.csvKeys.map((name) => ({ name, type: "String" as const }));
  }
  return FALLBACK_FIELDS;
}

/* ============================== Binding resolver =========================== */

export type BindingStatus =
  /** Resolved by role — the field name normalised to a role this connection assigns. */
  | "role"
  /** Resolved by a binding the client confirmed on an earlier campaign. */
  | "hint"
  /** Resolved by an exact/normalised name match against the catalogue. */
  | "exact"
  /** No candidate. Needs a dropdown; blocks launch. */
  | "unbound"
  /** A remembered binding points at an attribute the catalogue no longer has.
   *  Blocks launch — a blank value in a live payment-link message is worse than a
   *  blocked launch, and it must never silently resolve to null. */
  | "remap";

export type Binding = {
  field: CampaignField;
  /** The source attribute this field reads from, if resolved. */
  attribute: string | null;
  status: BindingStatus;
  /** Set when the field maps to a structural role. */
  role: RoleKey | null;
};

/**
 * Resolve a campaign's declared fields against a connection, in priority order:
 * role → remembered hint → exact name match → unbound.
 *
 * `overrides` carries choices the user has made in the current run and always wins.
 */
export function resolveBindings(
  fields: CampaignField[],
  conn: Connection,
  overrides: Record<string, string> = {},
): Binding[] {
  const catalogue = new Set(conn.catalogue.map((a) => a.name));
  const byNormalised = new Map(conn.catalogue.map((a) => [normaliseFieldName(a.name), a.name]));

  return fields.map((field) => {
    const key = normaliseFieldName(field.name);
    const role = roleForFieldName(field.name);

    const override = overrides[field.name];
    if (override) {
      return { field, attribute: override, status: "exact" as BindingStatus, role };
    }

    // 1 — role. Field-name drift stops mattering here: each side is matched to a
    //     role independently, so `phone` vs `ph_number` is a non-event.
    if (role && conn.roles[role] && catalogue.has(conn.roles[role]!)) {
      return { field, attribute: conn.roles[role]!, status: "role", role };
    }

    // 2 — a binding someone confirmed on an earlier campaign.
    const hinted = conn.hints[key];
    if (hinted) {
      return catalogue.has(hinted)
        ? { field, attribute: hinted, status: "hint", role }
        : { field, attribute: hinted, status: "remap", role };
    }

    // 3 — an obvious candidate by name.
    const exact = byNormalised.get(key);
    if (exact) return { field, attribute: exact, status: "exact", role };

    return { field, attribute: null, status: "unbound", role };
  });
}

/** A run can only launch when every declared field resolves to a real attribute. */
export function bindingsReady(bindings: Binding[]): boolean {
  return bindings.every((b) => b.status !== "unbound" && b.status !== "remap");
}

export function unresolvedCount(bindings: Binding[]): number {
  return bindings.filter((b) => b.status === "unbound" || b.status === "remap").length;
}

/* ================================ Push body ================================ */

/**
 * The trigger endpoint for a run. The run id lives in the URL rather than in the
 * body: a person arriving on a system-wide URL would carry no run to belong to,
 * and a `run_id` key in the payload is a value the client can silently mistype.
 * One journey in their tool points at one run here.
 */
export function runEndpoint(runId: string): string {
  return `https://api.picommerce.io/v1/runs/trigger/${runId}`;
}

/**
 * The request body the client pastes into their tool, generated from the campaign's
 * own field names in that platform's token syntax.
 *
 * There is nothing to map afterwards: the keys on the left are the campaign's
 * declared fields, so a payload built from this snippet binds by construction. That
 * is the whole reason push does not get a mapping step — the alternative is asking
 * the client to reconcile this campaign's fields against a catalogue we happened to
 * learn from an unrelated earlier call.
 *
 * We never ask them to declare batch size, container shape, retry behaviour or
 * delivery mode — all of it is detected. A platform can flip between single and
 * batch payloads without the client realising, so asking them to declare it would
 * guarantee wrong answers.
 */
export function pushBody(targetKey: string, fields: CampaignField[]): string {
  const { token } = pushTarget(targetKey);
  const body = fields.map((f) => `  "${f.name}": "${token(f.name)}"`).join(",\n");
  return `{\n${body}\n}`;
}

/**
 * The same call as a runnable curl. This exists for the person the body cannot
 * help: whoever is wiring it up wants to POST one record by hand and watch the run
 * move before they trust a journey to it.
 *
 * It carries a placeholder key rather than a real one — we never mint a secret into
 * a screen that a dozen people screenshot. The key comes from settings, and saying
 * so here is cheaper than a support thread about a 401.
 */
export function curlSample(endpoint: string, body: string): string {
  const indented = body.split("\n").join("\n        ");
  return [
    `curl -X POST '${endpoint}' \\`,
    `  -H 'X-API-Key: <your-api-key>' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${indented}'`,
  ].join("\n");
}

/* ================================= Helpers ================================= */

export const HEALTH_LABEL: Record<ConnectionHealth, string> = {
  healthy: "Healthy",
  reconnect: "Reconnect",
};

export const HEALTH_TONE: Record<ConnectionHealth, string> = {
  healthy: "border-success/30 bg-success/10 text-success",
  reconnect: "border-destructive/30 bg-destructive/10 text-destructive",
};

/** Two-letter mark for the platform tile — no vendor logos to license or drift. */
export function platformMark(name: string): string {
  const clean = name.replace(/[^A-Za-z ]/g, "").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}
