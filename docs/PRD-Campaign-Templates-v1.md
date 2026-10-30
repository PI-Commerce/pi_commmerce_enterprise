# PRD — Campaign Templates (v1)

**Product:** Pi Commerce Enterprise
**Feature area:** Campaign Templates ("Template Library")
**Status:** v1 — shipped as an in-memory UX prototype (state reseeds on hard reload)
**Last updated:** 6 Aug 2026

---

## 1. Overview

Campaign Templates let a **super-admin** package a proven campaign — its ReactFlow journey graph plus catalog metadata — as a reusable, tenant-agnostic **template**, and let **tenant users** copy one to stand up a new campaign in minutes.

A template is a campaign's journey with every **tenant-bound resource stripped** (the "scrub pass") plus catalog metadata: category, channels, versioning, a setup checklist, an audience schema, and a list of clients it is enabled for.

Two distinct journeys are in scope:

- **(a) Use a template — tenant users.** Browse the published catalog from the campaign create flow, preview a journey, and **fork** it into a new draft campaign that carries setup debt for the resources they must bind.
- **(b) Author a template — super-admin.** Publish a source campaign as a template (or a new version of an existing one) through a guided wizard: scrub → choose destination → enable clients → describe → publish.

### Core model: copying is a **fork**, not a subscription

Copying a template **deep-clones** the scrubbed graph into an independent draft. There is **no ongoing link** back to the source template. Later template edits do **not** propagate to already-forked copies. See §6 (Out of scope).

### Key definitions

| Term | Meaning |
|---|---|
| **Template** | A scrubbed campaign journey + catalog metadata, published to the library. |
| **Scrub pass** | Removes tenant-bound fields (WhatsApp template & number, voice agent, SMS sender/PE ID, API tool, audience source) and marks those nodes invalid so a copy shows what to bind. |
| **Fork / Copy** | A one-time deep clone of a template's scrubbed graph into a new draft campaign. |
| **Setup debt** | The count of invalid nodes (`errorCount`) in a fork that must be bound before launch. |
| **Enabled clients** | The list of client accounts a template is marked available for (`enabledClientIds`). |
| **Version** | Monotonic template version; new publishes to an existing template bump the version and append a changelog entry. |

---

## 2. Personas

- **Tenant user (campaign operator):** builds and launches campaigns for a single workspace. Wants a fast, proven starting point.
- **Super-admin (template manager):** curates the shared catalog, decides which clients see which templates, and owns versioning.

---

## 3. Feature (a): Use a template to create a campaign — tenant users

### 3.1 User story
> As a tenant user, I want to browse published templates and copy one into a new draft campaign, so I can launch a proven journey quickly instead of building from scratch.

### 3.2 Flow (as built)
Campaigns index → **Create a Campaign** dialog → **Explore templates** → **Template Picker** (search + category + channel filters) → **Preview** (full-screen, read-only) or **Use template** → `forkTemplateToCampaign` deep-clones the scrubbed graph into a new draft → navigate to the campaign builder → the draft appears at the top of the campaigns list with an **Incomplete** badge listing unbound resources.

### 3.3 Acceptance criteria

**AC-A1 — Entry point**
- GIVEN a tenant user on the Campaigns index
- WHEN they open **Create a Campaign** and choose **Explore templates**
- THEN the Template Picker opens showing only templates with status `published`.

**AC-A2 — Discovery & filters**
- The picker supports free-text search over template **name** and **description**.
- The picker filters by **category** (single-select) and **channel** (multi-select: WhatsApp / Voice / SMS / API); a template matches if it carries **any** selected channel.
- Each card shows: category, version, channels, audience-attribute count, setup-step count.

**AC-A3 — Preview before commit**
- WHEN the user chooses **Preview** on a card
- THEN a full-screen, read-only overlay renders the template's source journey canvas plus its metadata rail (summary, channels, setup checklist, audience schema).
- The preview is read-only: the user cannot edit nodes from it.

**AC-A4 — Fork into a draft**
- WHEN the user chooses **Use template**
- THEN the system deep-clones the template's **scrubbed** graph into a **new draft campaign** owned by the tenant, shows a "Template applied" toast, and navigates to the campaign builder.
- The fork is fully independent: subsequent edits to the source template do **not** change this campaign.

**AC-A5 — Setup debt surfaced**
- The forked draft carries `errorCount` = number of nodes left invalid by the scrub pass.
- The new campaign appears at the **top** of the campaigns list as a **draft** with an **Incomplete** badge indicating N resources still need binding before it can go live.
- The user cannot launch the campaign until required bindings are resolved in the builder.

**AC-A6 — Isolation from the admin catalog**
- Forking from the create flow **does not** mutate catalog analytics or state (it uses the section-independent fork path).
- The tenant flow never routes into the super-admin Template section.

**AC-A7 — Empty / no-match states**
- IF no published templates exist, the picker shows an empty state.
- IF filters exclude all templates, the picker shows a "no matches" message.

---

## 4. Feature (b): Admin creates a template and enables it for clients

### 4.1 User story
> As a super-admin, I want to publish a proven campaign as a template, control which clients can use it, and version it over time, so my tenants have a curated, safe-to-copy catalog.

### 4.2 Flow (as built)
Template Library `/campaigns/templates` → **Publish template** (or a campaign row's **Publish as template**) → **Publish wizard**:
`Source → Scrub → Template (new vs existing) → Clients → Details` → `publishTemplate` → template appears in the library. Detail page exposes edit-&-publish-new-version, unpublish, and re-list.

### 4.3 Acceptance criteria

**AC-B1 — Launch the wizard**
- The Template Library exposes a **Publish template** action that opens the publish wizard.
- A campaign can also be published directly (source pre-selected, skipping the source step).

**AC-B2 — Source selection**
- WHEN no source is pre-supplied
- THEN the wizard's first step lets the admin pick any existing campaign as the source.

**AC-B3 — Scrub pass (tenant-bound resources stripped)**
- On publish, the system strips every tenant-bound field from the journey and marks affected nodes invalid with an error label:
  - **WhatsApp:** WhatsApp template + WhatsApp number / WABA → "Pick template"
  - **Voice call:** Voice agent → "Select agent"
  - **SMS:** Sender ID + Header / PE ID → "Add sender ID"
  - **API tool call:** API tool / webhook (cleared)
  - **Audience:** file name, row count, CSV preview (cleared)
- The Scrub step shows the admin exactly which resources will be removed (`scrubItems`).

**AC-B4 — Destination: new vs existing template**
- The **Template** step offers two choices:
  - **Publish as a new template** → mints **v1**.
  - **Update an existing template** → the admin selects a published template as the target; publishing **bumps the version** and appends a changelog entry.
- IF **existing** is chosen with no target selected, **Next is disabled** with validation: "Pick the template to publish this version onto."
- WHEN an existing target is chosen, the step notes "Publishes as v{next}. {N} clients pre-selected on the next step."

**AC-B5 — Enable clients ("sync" scope for v1)**
- The **Clients** step lets the admin choose which client accounts the template is enabled for (`enabledClientIds`), from the 6 known clients (FCC, Acme Retail, Nova Telecom, Orbit Financial, Pulse Health, Zenith Mobility).
- WHEN publishing a new version onto an existing template, the target's current `enabledClientIds` are **auto-inherited** (pre-checked); the admin can adjust.
- The chosen enablement is persisted on the template and rendered on the detail page as **Enabled clients · N**.

**AC-B6 — Details & publish**
- The **Details** step captures name, description, category, and optional performance/audience notes.
- WHEN the admin publishes, the template is written to the catalog: new template at v1, or an existing template at `version+1` with a new changelog entry, and a success toast is shown.

**AC-B7 — Template detail page**
- The detail page renders: summary, channels, **Setup before launch** checklist, audience schema table, **Enabled clients**, **Version history** changelog, and adoption stats (copies / launches / tenants).
- The left pane shows a **read-only preview** of the **unscrubbed** source journey with a "Template preview · v{version}" pill.

**AC-B8 — Lifecycle: edit, unpublish, re-list**
- **Edit & publish new version** reopens the wizard in edit mode and versions the template.
- **Unpublish** archives the template (status `archived`); it is removed from the tenant picker but existing copies keep running.
- **Re-list** restores an archived template to `published`.
- The library's **Archived** toggle lets admins view archived templates.

**AC-B9 — Versioning integrity**
- Each publish onto an existing template increments the version by exactly 1 and appends a dated changelog note.
- The displayed "current version" always equals the latest changelog entry.

---

## 5. Non-functional / constraints (v1)

- **Prototype persistence:** all state is in-memory (reactive stores). A hard reload reseeds the catalog and clears tenant copies. No backend, no network calls.
- **Reactivity:** publishing, unpublishing, versioning, and enabling clients update the library and detail rail live without a reload.
- **No auth/permissions layer:** the admin/tenant separation is by surface (route), not enforced by roles in v1.

---

## 6. Not enabled in v1 (out of scope) — explicit call-outs

These are intentionally **not** part of v1 and must be communicated to stakeholders.

### 6.1 No ongoing **sync** of template updates to copies
- Copying a template is a **one-time fork**. Once a tenant copies a template, the resulting campaign is **fully independent**.
- Publishing a **new version** of a template does **not** propagate to, notify, or update any campaign already forked from it.
- There is no "update available" prompt, no diff/merge, and no re-sync action on forked campaigns.

### 6.2 Client enablement is stored but **not enforced as distribution/sync**
- `enabledClientIds` is captured and displayed, but the tenant **Template Picker shows all `published` templates regardless of client enablement**.
- v1 has **no per-client distribution**: enabling a template for specific clients does not gate visibility, does not push the template to those clients, and does not keep client-side copies in sync.
- True per-client catalog scoping and sync is a future milestone.

### 6.3 Channel-resource templates are **scrubbed**, not shipped
- **WhatsApp, SMS, and Voice-agent** bindings (and API tool + audience source) are **removed** by the scrub pass on publish. Templates carry the **journey structure only**, not the tenant's channel resources.
- Consequently:
  - **WhatsApp:** the message template and WhatsApp number/WABA are blank in a copy; the tenant must rebind their own.
  - **SMS:** sender ID and Header/PE ID are blank; the tenant must supply their own.
  - **Voice agent:** the bound agent is removed; the tenant must select their own agent.
- v1 does **not** provide reusable, shareable **channel-resource templates** (e.g., a shared WhatsApp template library, a shared SMS sender pool, or shared voice agents). Every tenant rebinds channel resources per copy.

### 6.4 Related exclusions
- No template approval workflow, ratings/reviews, or usage-based ranking.
- No import/export of templates across environments.
- No analytics beyond the prototype counters (copies / launches / tenants).

---

## 7. Success signals (prototype)

- A tenant can go from Campaigns index → live builder with a forked draft in under a minute.
- A published template's setup checklist exactly matches the nodes left invalid by the scrub pass.
- A new version published onto an existing template appears immediately in the library and detail rail, with clients auto-inherited.

---

## 8. Open questions / future milestones

1. **Sync engine:** notify or auto-update forked campaigns when a template versions (opt-in patch vs. informational only).
2. **Per-client distribution:** enforce `enabledClientIds` in the tenant picker; scope catalogs per workspace.
3. **Shared channel-resource libraries:** publishable WhatsApp/SMS/voice-agent resources so copies can bind without manual re-entry.
4. **Roles & permissions:** real admin vs. tenant enforcement.
5. **Persistence:** move stores to a backend so state survives reloads.
