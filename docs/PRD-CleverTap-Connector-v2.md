# CleverTap Generic WhatsApp Channel Connector — PRD

**Version 2.** Supersedes version 1 in full. Read this document on its own; nothing here is
expressed as a change to an earlier draft.

---

## 1. Objective

Clients who run their marketing campaigns on CleverTap cannot currently use Pi Commerce as their
WhatsApp provider, because Pi Commerce does not have an integration with CleverTap. This document
defines a generic WhatsApp connector that lets any Pi Commerce client connect the two platforms
themselves, using the open integration contract CleverTap publishes for WhatsApp providers. The
goal is to stop losing WhatsApp volume from clients who adopt CleverTap, and to make Pi Commerce a
valid provider choice for CleverTap customers who are not on Pi Commerce today.

---

## 2. Background

CleverTap (referred to as CT in this document) is a customer engagement platform. Clients use it to
build audience segments, run campaigns and journeys, and message users across channels. WhatsApp is
one of those channels, and for a WhatsApp campaign to work, CT has to hand the message off to a
WhatsApp Business Solution Provider (BSP) who actually delivers it to the user through Meta.

CT ships ready-made integrations with a fixed list of BSPs — Gupshup, Karix, Infobip, Kaleyra,
Route Mobile and others. Pi Commerce is not on that list. A client who uses CT for campaigns and Pi
Commerce for WhatsApp therefore has no way to connect the two. In practice they do one of two
things: move their WhatsApp traffic to a BSP that CT already supports, or run WhatsApp campaigns
outside CT and give up unified segmentation and reporting. The first option costs us the account's
WhatsApp volume outright. The second is unstable and usually ends in the first.

There is no workaround available today. A client can technically export a segment from CT and
upload it to the Pi Commerce panel to send a campaign manually, but this breaks journeys, breaks
triggered messaging, and gives the marketer no delivery stats inside CT. Nobody does this at scale.

CT has published an open integration contract, called Generic WhatsApp, that removes the dependency
on CT's engineering team. Under this contract CT sends outbound message payloads to an endpoint the
BSP hosts, and the BSP posts delivery statuses and incoming user messages back to callback URLs
that CT generates. Any provider who implements the contract correctly can be used by any CT
customer. This is why we are building against the generic contract rather than asking CT to build a
native Pi Commerce integration — we control the timeline, and the same work also qualifies Pi
Commerce to be listed on CT's supported provider page.

### Division of responsibility

CT owns the audience, the campaign, the personalisation and the campaign-level statistics its
marketers see. Pi Commerce owns template approval with Meta, actual message delivery, delivery
receipt handling, incoming message handling, media storage, and everything shown on the Pi Commerce
panel. Pi Commerce never sees a CT campaign definition, and CT never talks to Meta.

### The constraint that drives the design

One constraint from CT's contract should be understood before reading the requirements: **CT expects
a success response from the provider's endpoint within one second, and sends up to 1500 requests
concurrently.** Delivering a message to Meta takes considerably longer than one second and can fail
for reasons outside our control. The endpoint therefore has to accept and acknowledge the request
without waiting for Meta, and report the real outcome later through a callback. CT's own
troubleshooting documentation confirms that providers who fail to hold this concurrency are the most
common source of campaign errors on their platform.

Note that the 1500 figure is not negotiable from our side and not reliably reduced from CT's. CT
sends up to 1500 concurrent requests regardless of the limit configured in its own dashboard, so the
platform treats 1500 as a fixed design point rather than a tunable one. This is recorded again in
NFR-2 because it decides FR-1 and FR-6.

### Encryption in regulated accounts

A second consideration applies to clients in regulated industries. Several of them encrypt
personally identifiable information inside CT, which means the phone number arriving at Pi Commerce
may be ciphertext rather than a readable number. CT's published framework for this encrypts the
entire payload using AES-256-CBC, with the initialisation vector and key version passed as request
headers, and requires the provider to encrypt its callbacks in return. Pi Commerce therefore needs
to decrypt on the way in and encrypt on the way out, without breaching the one-second response
budget. This is covered in FR-2, and a caveat about channel availability is recorded in Q1.

### Panel design principle

The connector screen on the Pi Commerce panel is a **transcription surface**. Its job is to hold
values that the client retypes into a form inside CT's product, and every element on it either
serves that job or competes with it.

This principle decides, throughout section 3, which values appear as editable controls and which
appear as fixed constants or read-only facts. The test applied is whether the client's choice can
differ from ours without breaking delivery. Where a value must match what CT's side already holds —
the authentication scheme, the recommended import limit, the concurrency ceiling, whether payloads
arrive encrypted — the panel **states** it and does not offer to change it, because the only
reachable outcomes of changing it are wrong ones and the resulting failure surfaces inside CT as our
fault.

Concurrency is the worked example. If the client could set a per-connector ceiling below what CT
actually sends, lowering it "to be careful" would produce exactly the HTTP 429 storm it was meant to
avoid, and the marketer would see campaign errors in CT with no indication that a Pi Commerce
setting caused them. The ceiling is therefore a platform constant.

The principle argues against controls, not against information. Constants and read-only facts that
the client must paste into CT, or must read to know whether the integration is working, belong on
the page.

### Assumptions

These have been assumed rather than confirmed, and should be corrected during review if wrong.

1. Clients already have approved WhatsApp templates on Pi Commerce. This connector does not change
   how templates are created or submitted to Meta.
2. The client's CT plan includes the WhatsApp Connect add-on. This is a commercial prerequisite on
   CT's side and outside Pi Commerce's control.
3. Peak volume is under 1 million messages per campaign per client, as confirmed during scoping. NFR
   targets are sized to this.
4. CT's published payload contract is stable at `payloadVersion 0.1`.
5. Messages sent through this connector are billed through Pi Commerce's existing metering. No new
   commercial model is in scope.
6. A client creating a connector already has the WhatsApp sender provisioned on Pi Commerce through
   Embedded Signup. Connector creation is downstream of WABA onboarding and cannot bring a number
   into existence.
7. Encryption keys originate from CT and are relayed to Pi Commerce **by the client to Pi Commerce
   operations**, who load them into the platform key store. CT states that it generates and manages
   the keys and provides no key management interface, so there is no key for the client to generate
   and no self-service field for them to enter one into. This needs confirming with CT for the
   WhatsApp channel specifically — see Q1.
8. The number of clients using payload encryption stays within what an operations-led onboarding can
   absorb. This assumption fails quietly — by operations becoming a queue rather than by anything
   erroring — so it is the one to watch. See Q2.
9. Basic Authentication is sufficient for the template import endpoint in every account we expect to
   serve. If a client's CT configuration requires a bearer token, this is a code change rather than
   a setting.
10. Not every requirement below ships in one release. The epic split is in the next section and is
    load-bearing rather than advisory: FR-12 carries client-facing failure reporting that FR-2 and
    FR-5 depend on, which is stated in each.

### Note on document size and delivery

This PRD contains 14 functional requirements, which is more than a single document should ideally
carry. It splits into three epics for delivery planning:

- **Epic A — the integration itself:** FR-1 through FR-10, and FR-14. These must ship together to be
  useful. A connector that sends messages but reports no delivery status is not shippable, and a
  connector that cannot decrypt an encrypted payload is unusable for the clients most likely to ask
  for it.
- **Epic B — visibility and tracking:** FR-11, FR-12, FR-13. Click tracking, template analytics and
  recipient reporting. Separable, and each independently valuable. **FR-12 should be sequenced first
  within this epic**, because it is where FR-2 and FR-5 send their client-facing failure reporting;
  until it ships, two failure modes are diagnosable only by support. See Q3.
- **Epic C — deferred panel surfaces:** provisioning the click-tracking domain (blocked on FR-11
  regardless) and disabling a connector from its own detail page. Both small; neither blocks
  anything.

---

## 3. Functional Requirements

Unless a requirement states otherwise, every payload structure, field name, header, error code and
behaviour attributed to CleverTap in this section comes from the Generic WhatsApp documentation.
Requirements drawing on a different CleverTap page name it explicitly.

### FR-1: Create and configure a CleverTap connector

**Story:** As a marketing operations user at a client, I should be able to create a CleverTap
connector for my WhatsApp number on the Pi Commerce panel and get all the values CT asks for, so
that I can complete the CT setup myself without raising a support ticket.

**Requirements:**

System should add a section on the Pi Commerce panel under Connections for delivery platforms,
within which CleverTap connectors are created and opened.

System should allow the user to create one connector per WhatsApp Business Account (WABA) number. A
client with three numbers creates three connectors. This matches CT's own setup screen, where the
provider nickname is defined as the phone number.

System should require the user to **select** the WABA number from the WhatsApp senders already
provisioned for that merchant, and should offer no other means of supplying a number. A number that
Pi Commerce does not hold produces a connector indistinguishable from a working one: it accepts
every send and fails every send with error code 2000, which reads on CT's side as an invalid
recipient, so the client spends the outage auditing their own CT configuration for a fault that is a
typo in ours. Selection makes the mistake unexpressible, which is preferable to validating against
it.

System should show, for each selectable number, the number and the WABA that owns it. The number
alone does not say which brand the recipient sees as the sender, and two numbers on different WABAs
are two different senders.

System should keep numbers that already have a connector visible in the list, disabled and annotated
to say so, rather than filtering them out. A client looking for a number they own needs to learn
that it is already spoken for; a number that has silently vanished reads as a failed onboarding.

System should default the selection to the first available number, so that the step has no error
state.

System should, where every provisioned number already has a connector, state the one-connector-per-
number constraint, point the user at WABA onboarding under Channels and at the existing connector,
and disable the create action.

System should generate and display the following values on connector creation, each with a
copy-to-clipboard control except where noted, because every one of them has to be pasted into the CT
dashboard:

| Field | Value |
|---|---|
| HTTP Endpoint | Unique per connector, for example `https://<region>.picommerce.<tld>/ct/v1/messages/{connectorId}` |
| Request Type | `POST` — constant, no copy control |
| Authentication | `Basic` — constant, no copy control |
| Username | System generated |
| Password | System generated, shown once at creation, regenerable |
| Template Import Endpoint | `https://<region>.picommerce.<tld>/ct/v1/templates/{connectorId}` |
| Template Import Request Type | `GET` — constant, no copy control |
| Template Import Authentication | `Basic` — constant, no copy control |
| Recommended Import Limit | `500` — constant, no copy control |
| Click Tracking Domain | Populated if FR-11 is enabled for the client, blank otherwise |
| WABA Number | The number this connector is bound to |

System should display the Recommended Import Limit as `500`. This is a field on CT's provider form
rather than a setting of ours, and the import endpoint caps at 500 regardless, so a client who
guesses a higher number receives 500 rows and has every reason to read the truncation as templates
going missing. Stating the number is the whole of the fix.

System should show the password **once**, at creation. After that the row should state that it was
shown once and offer rotation, rather than rendering a masked placeholder beside a copy control — a
copy control that yields bullet characters is worse than no control, because it gets pasted.

System should support password rotation with two valid passwords for a configurable grace period
(default 7 days, kept configurable), so a client can update CT before the previous password stops
working.

System should allow the user to paste and save two callback URLs that CT generates on its own
dashboard: the Delivery Report Callback URL and the Inbound Message Callback URL.

System should validate that both callback URLs use HTTPS before saving. If a URL is not HTTPS,
system should block the save and show the reason.

System should store both callback URLs encrypted at rest and mask them in the panel after saving,
leaving the host readable and hiding the path, because the path is what carries the token. These
URLs require no authentication on CT's side, so anyone holding one can write false statistics into
the client's CT account. They are secrets.

System should show the connector in one of three states: **Draft** (created, never contacted by CT),
**Validated** (CT's validation payload received and answered successfully), **Live** (at least one
real message processed). These are a record of what CT has done rather than a workflow the client
advances, and nothing on the panel should move a connector to Validated.

System should display the timestamp of the last successful CT validation. Placement and empty-state
behaviour are specified in FR-3, which is the requirement that produces the timestamp.

System should fix the messaging endpoint's concurrency ceiling at a platform constant of 1500 and
should not offer a per-connector concurrency setting. Rationale is in section 2 and NFR-2.

System should reject any incoming message request whose WABA number does not match the number bound
to the authenticated connector. This is a security boundary: one client's connector should never be
able to send from another client's number.

System should allow the user to disable a connector without deleting it. A disabled connector should
reject all incoming requests with error code 2000.

System should show enablement and state as a single indicator, with `Disabled` taking precedence when
set. State records what CT has done; enablement is a switch we hold; they are orthogonal and asking
the reader to combine them serves nothing. A Live connector rejecting every request with 2000 is not
usefully described as Live. Both values should persist, so that re-enabling returns the connector to
Live rather than to Draft.

System should allow the user to delete a connector, **and only after it has been disabled.** The
delete action should remain visible while blocked, with the reason shown and the step that unblocks
it adjacent. The gate is not ceremony: a disabled connector rejects with 2000, which is a code CT
surfaces and a client can act on, whereas a deleted connector leaves CT's provider entry posting into
a 404 with no interpretable cause. Disable-then-delete is the only sequence that tells the other side
what happened.

System should name the **WABA number** rather than the connector identifier in the delete
confirmation, because the number is what the client recognises, and should state that the CT provider
entry must be removed on their side too and that credentials cannot be reissued — a new connector
gets new ones.

System should restrict connector creation and credential viewing to users with integration
management permission on that WABA number.

**Dependencies:** A provisioned WhatsApp sender (Assumption 6). **Out of scope:** Creating or
editing WhatsApp templates, which continues to happen in the existing Templates section of the
panel. Configuring anything inside the CT dashboard on the client's behalf. Choosing an import
authentication scheme, a concurrency ceiling, or an import page size.

---

### FR-2: Accept and decrypt encrypted payloads from CleverTap

**Story:** As a security or compliance owner at a client in a regulated industry, I should be able to
have Pi Commerce hold the decryption key for my CT account, so that customer phone numbers are never
sent in readable form between the two platforms and my messages still deliver.

**Requirements:**

System should decrypt payloads encrypted with AES-256-CBC, reading the initialisation vector from the
`X-AES-IV` header and the key version from the `X-AES-KEY-VERSION` header.

System should support both of CT's encryption modes — full payload, and recipient field only — and
should determine which is in use from the payload rather than from a client-supplied setting. Which
mode an account uses is a fact about that account's CT configuration, discoverable from the first
request; asking the client to declare it creates a state where the declaration and reality disagree,
and in that state every message fails.

System should treat the presence of encryption as detected rather than declared, for the same reason.
There should be no enable switch.

System should accept encryption keys through operations tooling only, and should provide no key entry
field on the connector screen. Keys are provisioned by Pi Commerce operations from the key the client
obtained from CT (Assumption 7). The population of encrypting clients is small, the material is an
AES-256 key for a regulated-industry account, and Q1 is unresolved, so a self-service field would be
built against an unconfirmed shape.

System should hold at least two key versions concurrently and continue decrypting in-flight payloads
under the previous key, so that a rotation on CT's side does not fail a running campaign.

System should store keys in the platform key management service, never in configuration, never in
logs, and should never return a key through any API.

System should encrypt its callbacks in both directions when the connector is encrypted, generating a
fresh initialisation vector per payload and never reusing one.

System should validate the decrypted phone number as E.164 and should treat a validation failure as a
decryption failure.

System should distinguish a decryption failure from an invalid number internally, while returning
error code 2002 to CT for both.

System should apply encryption handling to the validation payload of FR-3 as well as to message
payloads.

System should log ciphertext only, never plaintext payloads.

System should hold the active key in memory rather than fetching it per request, in order to stay
inside the NFR-1 budget.

System should raise an **operations alert** when decryption failures exceed 10 in any 60-second
window. A wrong key fails every message in a campaign, so somebody must know within seconds rather
than at the end of the run — and because keys are provisioned by operations, operations are the party
who can correct one.

System should surface decryption failures to the client as a distinct failure reason in FR-12's
template analytics. The client's need is narrower than a fix: they need to know that a campaign is
failing and why, not to repair the key. There should be no failure banner on the connector screen,
which is a transcription surface rather than a place to read live traffic.

**Dependencies:** FR-1 (a connector must exist to bind a key to). Client-facing visibility of
decryption failures depends on FR-12, which is in Epic B — see Q3. **Out of scope:** PII
tokenization, where CT holds tokens rather than encrypted values (Q4). Self-service key management.

---

### FR-3: Respond to CleverTap's endpoint validation check

**Story:** As a marketing operations user, I should be able to save the Pi Commerce provider in CT
and have it accepted first time, so that I know the integration is correctly configured before I
build a campaign on it.

**Requirements:**

System should accept and answer CT's validation payload at the messaging endpoint, including when
that payload is encrypted.

System should return success for CT's validation and template-check payloads addressed to a dummy
number, without attempting a real send.

System should move the connector from Draft to Validated on the first successful validation.

System should display the time of the last validation check received from CT on the connector detail
screen, **immediately after the state indicator**, because it is that indicator which the timestamp
qualifies: Validated and Live are both records of a check having passed and neither says when. This
is the panel's only answer to "did my setup work, and is that still true" — the question a client asks
just before they begin suspecting us.

System should **omit** the timestamp entirely on a Draft connector rather than rendering `Never` or a
placeholder. Draft means CT has never called; the Draft notice already states exactly that, and a
second rendering of the same absence reads as a second, separate finding.

System should show a notice on a Draft connector explaining that saving the values on CT's provider
screen is what triggers the check, and that there is nothing to press on the Pi Commerce panel. This
is the state most likely to generate a support ticket, because the client is waiting for something
that will never originate from our side.

**Dependencies:** FR-1 (connector and credentials must exist), FR-2 (an encrypted validation payload
must be decryptable). **Out of scope:** Any panel control that advances the connector's state.

---

### FR-4: Sync approved templates into CleverTap

**Story:** As a WhatsApp platform owner at a client, I should be able to import my approved Pi
Commerce templates into CT, so that my marketers can build campaigns without recreating every
template by hand.

**Requirements:**

System should expose a template import endpoint per connector, accepting `GET`, returning the
client's approved templates for the WABA number that connector is bound to.

System should authenticate the import endpoint with **Basic Authentication**. A bearer token is not
supported (Assumption 9).

System should accept a `limit` parameter between 50 and 500, capping at 500 and defaulting to 500.

System should return templates in exactly the Meta response shape CT expects, including every
component type CT can consume — among them CAROUSEL and LIMITED_TIME_OFFER.

System should paginate with an opaque cursor derived from created time and identifier, and should
return an absolute `paging.next` only when a further page exists.

System should convert positional parameters to `POSITIONAL` form symmetrically with FR-6, so that a
template imported into CT resolves on the send path.

System should keep template identifiers stable across re-imports, so that a re-import does not
duplicate templates in CT.

System should rate-limit the endpoint at 60 requests per minute per connector and should serve it
from a read replica.

**Dependencies:** FR-1 (connector must exist to scope the templates). **Out of scope:** Creating
templates or submitting them to Meta. A panel control for the import page size — the value is
displayed as a constant per FR-1 because it is pasted into CT.

---

### FR-5: Support templates created manually in CleverTap

**Story:** As a WhatsApp platform owner, I should be able to recreate a template by hand in CT rather
than importing it, and have it deliver correctly, so that I am not blocked when import is impractical.

**Requirements:**

System should provide a CleverTap Setup view on every approved template, opened from the WhatsApp
Templates list, showing every value needed to recreate that template in CT by hand.

System should mark the template name and language code as critical in that view, because they are the
only two fields used to resolve an incoming send, and should state that the name is matched literally.

System should show, each with a copy control: the accepted language variants CT is known to send, the
category, the header type with a separate count of any header placeholders, the body with visible
`{{n}}` numbering, the body parameter count, the footer, and every button with its type, text and
position.

System should provide a test send from that view — pick an enabled connector, enter a number, and send
through the same code path a CT request follows — so that the client can prove the template resolves
before running a campaign on it.

System should record the exact template name and language code CT supplied for every failed
resolution, retained for diagnosis.

System should return error code 2001 on a parameter count mismatch, reporting expected against
supplied counts.

System should present recent resolution failures, alongside the closest matching Pi Commerce
templates, in **FR-12's template analytics**. A name or language mismatch is the most likely first
failure on a manually created template and it is silent from the client's side, so the view exists to
turn a multi-hour support investigation into a self-service fix. It sits in analytics rather than on
the connector screen because it reports on live traffic: it is consulted when something is wrong, not
when something is being set up, and FR-12 is already where a client goes to ask why messages failed.

**Dependencies:** FR-6 (resolution happens on the send path). The failure view depends on FR-12, in
Epic B — the data is captured from Epic A onward, so no history is lost in the interval, but the view
is not available until FR-12 ships. See Q3. **Out of scope:** Creating or updating templates in CT on
the client's behalf.

---

### FR-6: Accept and deliver template messages from CleverTap

**Story:** As a growth marketer at a client, I should be able to run a WhatsApp campaign in CT and
have the messages actually delivered by Pi Commerce, so that I get the reach of my Pi Commerce
WhatsApp number with the targeting of CT.

**Requirements:**

System should expose one messaging endpoint per connector accepting `POST` with Basic Authentication,
splitting template from freeform traffic on the `isTemplate` flag.

System should accept and acknowledge a valid request within the one-second budget without waiting for
Meta, queueing the send and reporting the true outcome through FR-8.

System should follow CT's twelve-step accept-and-acknowledge sequence: authenticate, check enablement,
decrypt where encrypted, validate the WABA binding, read the message identifier, check the duplicate
window, resolve the template, translate components, resolve media, enqueue, acknowledge, then dispatch
to Meta asynchronously.

System should read the template name from `template.namespace`, which despite its name carries the
template name rather than a namespace.

System should normalise language codes across the four formats CT sends, logging every fallback so
that a systematic mismatch is visible rather than silently absorbed.

System should translate CT's component structure into Meta's, covering header, body, footer, buttons,
and every component type FR-4 can export.

System should **distrust CT's button `index`** and match buttons by text and subtype, dead-lettering
the message where no match is found. CT's index has been observed not to correspond to button order.

System should accept the message identifier under both `msgId` and `msg_id` and store it byte-exact,
because it is the join key for every subsequent status callback.

System should suppress a duplicate send where the same message identifier arrives within a 10-minute
window, returning success for both requests and billing once.

System should cache resolved media keyed on the URL hash, so that a campaign referencing one image
does not re-upload it per recipient.

System should retry failed dispatches to Meta on a bounded ladder and dead-letter what exhausts it.

System should return error codes in the response body with HTTP 200, per CT's contract: 2000
(connector disabled or number unmatched), 2001 (template resolution or parameter mismatch), 2002
(decryption failure or invalid number), 2003 (recipient opted out), 2004 (outside the 24-hour window).

System should return HTTP 429 with the body `{"message": "Too many requests to process"}` when the
platform concurrency ceiling of 1500 is reached. A slow success is worse than a fast rejection here,
because CT counts a timeout as a campaign error.

System should retain raw payloads for 30 days, as ciphertext where the connector is encrypted.

**Dependencies:** FR-1 (connector and credentials), FR-2 (decryption where enabled), FR-4 or FR-5 (a
resolvable template). **Out of scope:** Campaign definition, audience selection and personalisation,
all of which remain in CT.

---

### FR-7: Accept and deliver freeform messages from CleverTap

**Story:** As a growth marketer replying to a user from CT Conversations, I should be able to send a
text, image, document, video or audio message and have it reach the user, so that agent conversations
work through the same connector as campaigns.

**Requirements:**

System should accept freeform messages of five types — text, image, document, video, audio — on the
same endpoint, identified by `isTemplate` being false.

System should enforce Meta's 24-hour customer service window, computed from the user's last inbound
message.

System should return error code 2004 synchronously where the window has closed and the request can be
judged immediately, and status code 1008 on the FR-8 callback where it cannot, so that the agent sees
a failure rather than a message that appears to send and then disappears.

System should resolve and forward media with captions preserved.

**Dependencies:** FR-6 (shared endpoint, authentication, queue and media handling), FR-9 (incoming
messages establish the window). **Out of scope:** Agent chat UI, which remains in CT.

---

### FR-8: Send delivery status callbacks to CleverTap

**Story:** As a growth marketer, I should be able to see accurate sent, delivered, read, failed and
clicked counts in my CT campaign report, so that I can judge campaign performance where I run
campaigns.

**Requirements:**

System should post delivery statuses to the Delivery Report Callback URL saved in FR-1.

System should send the five statuses CT accepts — `Sent`, `Delivered`, `Read`, `Failed`, `Clicked` —
matching CT's capitalisation exactly, including `Clicked`.

System should map failures to CT's eleven status codes, 1000 through 1010, and should include Meta's
original error alongside, so that FR-12 and FR-13 can report a usable reason rather than a
miscellaneous error.

System should encrypt callback bodies where the connector is encrypted, including the initialisation
vector and key version in the request headers. CT will not process a callback that does not match the
encryption state of the account.

System should batch statuses at up to 100 per request or every 2 seconds, whichever comes first.

System should retry failed callback deliveries on a bounded ladder and move exhausted statuses to a
dead-letter queue visible to operations for replay, so that a CT outage does not permanently lose
status history.

**Dependencies:** FR-1 (callback URL), FR-2 (encryption where enabled), FR-6 and FR-7 (messages must
exist to report on). **Out of scope:** Campaign-level aggregation, which CT computes from these
statuses.

---

### FR-9: Send incoming user messages to CleverTap

**Story:** As a growth marketer, I should be able to see a user's reply to my WhatsApp campaign inside
CT Conversations, threaded against the message they replied to, so that agents can respond in context.

**Requirements:**

System should post incoming user messages to the Inbound Message Callback URL saved in FR-1.

System should set `context.id` to **CT's** message identifier for the message being replied to, not Pi
Commerce's, because CT threads on its own identifier and a foreign one produces an untethered message.

System should maintain a reverse index from Pi Commerce message identifiers to CT identifiers to make
that lookup possible on the inbound path.

System should forward text, image, document, video, audio and location messages.

System should provide media URLs that remain valid for 7 days, so that an agent opening a conversation
some days later still sees the attachment.

System should encrypt callback bodies where the connector is encrypted.

**Dependencies:** FR-1 (callback URL), FR-2 (encryption where enabled), FR-6 (outbound history is
required to thread against). **Out of scope:** Conversation UI and agent assignment, which remain in
CT.

---

### FR-10: Handle opt-out requests

**Story:** As a WhatsApp platform owner, I should be able to rely on Pi Commerce stopping messages to
users who opted out, so that we stay compliant regardless of what a CT campaign targets.

**Requirements:**

System should treat an inbound `STOP` or `UNSUBSCRIBE` as an opt-out for that number on that WABA
number.

System should reject subsequent sends to an opted-out number with error code 2003, matching the number
after decryption where the connector is encrypted.

System should forward the opt-out message itself to CT as an incoming message, so that the marketer
sees why the number stopped receiving.

System should provide an opt-out list per WABA number on the Pi Commerce panel, with export and manual
removal, so that a client can evidence compliance and correct a mistaken opt-out.

**Dependencies:** FR-9 (opt-outs arrive as incoming messages), FR-2 (numbers must be decrypted before
matching). **Out of scope:** Opt-in capture, which happens outside this connector.

---

### FR-11: Track clicks on template buttons

**Story:** As a growth marketer, I should be able to see how many users clicked the link in my
WhatsApp campaign, so that I can measure the campaign on outcomes rather than deliveries.

**Requirements:**

System should provide a click tracking domain per client, rewrite tracked button URLs through it, and
record the click before redirecting.

System should redirect within 300 milliseconds, so that the user does not perceive the interstitial.

System should report a click to CT as the `Clicked` status through FR-8.

System should display the click tracking domain on the connector screen read-only.

System should state explicitly, where the domain is not provisioned, that the client should leave CT's
Track Clicks field empty — **because a wrong value there breaks every button URL in every template.**
That warning is the row's primary purpose while the domain is blank.

**Dependencies:** FR-4 (import is what tags a button as tracked in CT), FR-8 (clicks are delivered on
the status callback). **Out of scope:** Panel provisioning of the domain, which is Epic C. Attribution
beyond the click itself.

---

### FR-12: View template analytics on the Pi Commerce panel

**Story:** As a WhatsApp platform owner, I should be able to see how each template performed on the Pi
Commerce panel, and why messages failed, so that I can diagnose problems in the system that actually
sent the messages.

**Requirements:**

System should show per-template usage with the funnel from sent through delivered, read, clicked and
replied, with a data freshness label.

System should provide a traffic source filter of All, CleverTap, API and Panel, so that CT traffic can
be judged separately from other sends of the same template.

System should show a failure breakdown grouped by the CT error code returned and by Meta's underlying
error description.

System should include **decryption failures as a distinct failure reason**, per FR-2, so that a client
whose key is wrong can see that this is what is happening to their campaign even though the fix is
ours.

System should show **recent template resolution failures**, per FR-5, each showing the exact template
name and language code CT supplied, alongside the closest matching Pi Commerce templates. The worked
case is CT asking for `Order_Update` in `en_US` while Pi Commerce holds `order_update` in `en`: the
view must make that difference obvious enough that the client corrects it in CT without opening a
ticket.

**Dependencies:** FR-6, FR-7 and FR-8 (message and status records are the input); FR-2 and FR-5 send
their client-facing failure reporting here. **Out of scope:** Campaign-level analytics, which remain
CT's.

---

### FR-13: Download a recipient-level report

**Story:** As a WhatsApp platform owner, I should be able to download a report showing what happened
to each recipient, so that I can investigate an individual complaint.

**Requirements:**

System should generate a recipient-level report asynchronously for a template and date range,
notifying the requester on completion with a download link, without blocking the panel.

System should offer CSV and XLSX.

System should include per row: the message identifier, template name, recipient, every status
timestamp, the final status, the CT error code and Meta's original error description.

System should mask recipient numbers unless the requesting user holds unmasked export permission, and
should record an unmasked export in the audit log with the user, filters and row count.

**Dependencies:** FR-6, FR-7 and FR-8 (message and status records are the input). **Out of scope:**
Scheduled or recurring report delivery.

---

### FR-14: State which platforms and channels Pi Commerce delivers for

**Story:** As a marketing operations user, I should be able to see on the Connections page whether Pi
Commerce can carry the platform and channel I use, so that I stop looking for a setup step that does
not exist.

**Requirements:**

System should present delivery as a matrix of platform against channel, one row per pair, listing
**every** pair — carried and not carried alike. Without this, a page showing only what we carry reads
as though the one carried platform is the whole product, and the absences are invisible.

System should show, per row: platform, channel, number, state, last activity, and a row menu.

System should mark an uncarried pair as forthcoming, muted, with no number, no activity and no row
menu.

System should show a carried pair with no connector yet as having none, with the action to create one
on that row.

System should show one row per connector for a carried pair that has them, with the number, the state
indicator from FR-1, and the last activity timestamp.

System should **not** state a reason on an uncarried row. The honest reason is the same roadmap
sentence repeated, and it is not something the client can act on.

System should treat last activity as the last real message and leave it blank where there is none. A
validation call is deliberately not activity: it proves CT can reach us, not that anyone was messaged.
The question of when validation last succeeded is answered on the connector detail screen per FR-3.

**Dependencies:** FR-1 (connectors are the rows). **Out of scope:** Any setup path for a platform we
do not carry.

---

## 4. Non-Functional Requirements

| # | Requirement | Target | How it's measured |
|---|---|---|---|
| NFR-1 | Messaging endpoint response time, including payload decryption where encryption is enabled. CT abandons the request at 1 second and counts it as a campaign error, so this is a hard product constraint rather than a performance goal. | p99 under 400ms, p99.9 under 900ms, measured server-side | APM dashboard per connector, 7-day rolling window, reported separately for encrypted and unencrypted connectors |
| NFR-2 | Concurrency handling. CT sends up to 1500 concurrent requests regardless of the limit configured in its dashboard, which is why the ceiling is a platform constant and not a per-connector setting (FR-1). | Sustain 1500 concurrent requests per connector with zero timeouts; HTTP 429 rate under 1% of total requests | Load test before release, then production request and error-rate metrics per connector |
| NFR-3 | Callback delivery to CT. Late statuses mean a marketer watching a live campaign sees numbers that are wrong. | 99.5% of statuses acknowledged by CT within 60 seconds of receipt from Meta; p95 under 30 seconds | Callback queue lag metric and delivery success rate, daily |
| NFR-4 | Availability of the messaging endpoint and both callback dispatchers. (Proposed — to be confirmed against client contracts.) | 99.9% monthly | Uptime monitoring with synthetic requests every 60 seconds |
| NFR-5 | Statistics reconciliation between CT and Pi Commerce, since a client seeing different numbers in two systems will treat both as unreliable. | Sent, delivered and read counts within 0.5% of Pi Commerce records | Automated weekly reconciliation job comparing CT campaign exports against Pi Commerce message records |

---

## 5. Acceptance Criteria

**AC-1 — Connector creation produces everything CT asks for (verifies FR-1)**
*Given:* A client account with a provisioned WABA number and no existing CleverTap connector.
*Steps:* 1. Open the Pi Commerce panel and go to Connections. 2. Create a new delivery connector and
select the WABA number. 3. Compare the fields shown against CT's provider setup screen.
*Expected result:* The connector screen shows an HTTP endpoint, request type `POST`, authentication
`Basic`, a username, a password, a template import endpoint, import request type `GET`, import
authentication `Basic`, a recommended import limit of `500`, and the WABA number. Every field CT's
provider setup screen asks for has a corresponding value here, and each value that needs pasting has a
working copy control. The connector shows the state Draft.

**AC-2 — Callback URLs are saved and masked (verifies FR-1)**
*Given:* A connector in Draft state and the two callback URLs copied from the CT dashboard.
*Steps:* 1. Paste the Delivery Report and Inbound Message callback URLs into the connector screen and
save. 2. Reload the page.
*Expected result:* Both URLs save and are shown masked after reload, with the host readable and the
path hidden. Attempting to save a URL beginning `http://` is blocked with a message explaining why.

**AC-3 — An encryption key can be loaded and proven before use (verifies FR-2)**
*Given:* A connector, and an AES-256 key with its version identifier obtained from CT by the client
and relayed to operations.
*Steps:* 1. Load the key through operations tooling. 2. Decrypt a sample ciphertext and initialisation
vector through the same tooling. 3. Attempt to read the key back through any panel screen or API.
*Expected result:* The key loads and the sample decrypts. No panel screen offers key entry, and no API
returns the key material. The connector screen shows no encryption section.

**AC-4 — An encrypted campaign delivers to real numbers (verifies FR-2, FR-6)**
*Given:* A connector with a loaded key, on a CT account that encrypts payloads.
*Steps:* 1. Run a CT campaign to at least 10 test users. 2. Check the receiving devices. 3. Open the
Pi Commerce message logs for the campaign.
*Expected result:* All 10 messages arrive at the correct numbers. The logs hold ciphertext rather than
readable numbers, and no plaintext payload appears in any log.

**AC-5 — A wrong encryption key is caught within seconds (verifies FR-2)**
*Given:* A connector loaded with an incorrect key version.
*Steps:* 1. Start a CT campaign to at least 50 users. 2. Watch the operations alerting channel.
3. Open the template's failure breakdown on the Pi Commerce panel.
*Expected result:* An operations alert fires within a minute of the threshold being crossed. CT
receives 2002 for the affected messages. The failure breakdown shows the failures under a distinct
decryption reason rather than as a generic error. No banner appears on the connector screen.

**AC-6 — Encrypted callbacks reach CT (verifies FR-2, FR-8, FR-9)**
*Given:* A completed encrypted campaign and a test device that has replied.
*Steps:* 1. Open the campaign report in CT. 2. Reply from a test device and open CT Conversations.
*Expected result:* Statuses appear in the CT report and the reply appears in Conversations, confirming
CT accepted callbacks encrypted with a fresh initialisation vector and the correct key version.

**AC-7 — A key rotation does not interrupt sending (verifies FR-2)**
*Given:* A running campaign on an encrypted connector, with two key versions loaded.
*Steps:* 1. While the campaign is running, have CT switch to the newer key version. 2. Let the
campaign finish and check the campaign report.
*Expected result:* No message fails as a result of the rotation. Payloads sent under the previous key
continue to decrypt until they drain.

**AC-8 — Saving the provider in CT succeeds first time (verifies FR-3)**
*Given:* A connector in Draft with both callback URLs saved.
*Steps:* 1. In CT, go to Settings, Channels, WhatsApp, WhatsApp Connect and add a provider of type
Other. 2. Enter the Pi Commerce values and click Save. 3. Return to the Pi Commerce connector screen.
*Expected result:* CT accepts the provider without error. The connector moves to Validated, and the
screen shows the time of that validation immediately after the state indicator.

**AC-9 — A wrong password produces the right error (verifies FR-1, FR-6)**
*Given:* A connector with generated credentials.
*Steps:* 1. In CT, enter the correct endpoint but an incorrect password. 2. Click Save.
*Expected result:* CT reports an authentication failure rather than a generic save error, and the
connector remains in Draft.

**AC-10 — Templates import into CT without manual re-entry (verifies FR-4)**
*Given:* A client with at least 60 approved templates including a CAROUSEL template.
*Steps:* 1. In CT, configure the template import endpoint with request type `GET` and a limit of 50.
2. Run the import. 3. Open several imported templates in CT's template editor.
*Expected result:* Templates import across pages without duplication, and components — including the
carousel — render correctly in CT's editor. Requesting a limit above 500 returns 500 rows.

**AC-11 — A manually created CT template delivers (verifies FR-5)**
*Given:* An approved Pi Commerce template not imported into CT.
*Steps:* 1. Open the template on the Pi Commerce panel and go to the CleverTap Setup view. 2. Create a
template in CT by hand, copying the name, language, body and buttons from that view. 3. Use the test
send on the Pi Commerce panel to a test number. 4. Run a small CT campaign using the manually created
template.
*Expected result:* The test send arrives, and the campaign delivers. Every value CT's editor requires
was available to copy from the Setup view.

**AC-12 — A template name mismatch is explained, not just rejected (verifies FR-5, FR-12)**
*Given:* A Pi Commerce template `order_update` in `en`, and FR-12 shipped.
*Steps:* 1. Create a template in CT named `Order_Update` in language `en_US`. 2. Send a test message
from CT using it. 3. Open the template analytics failure view on the Pi Commerce panel.
*Expected result:* The send fails with 2001. The failure view shows the exact name and language CT
supplied alongside `order_update` / `en` as the closest match, such that the client can correct CT
without contacting support. **Note:** this criterion verifies an Epic B deliverable and does not pass
against Epic A alone — see Q3.

**AC-13 — Saving a template in CT succeeds (verifies FR-6)**
*Given:* An imported template in CT.
*Steps:* 1. Open a template in CT and click Save.
*Expected result:* CT's template check payload, addressed to a dummy number, returns success without
attempting a real send.

**AC-14 — A campaign delivers and reports correctly (verifies FR-6, FR-8)**
*Given:* A CT campaign of at least 1,000 recipients on an imported template.
*Steps:* 1. Publish the campaign in CT. 2. Check a receiving test device. 3. Open the campaign report
in CT after all messages complete. 4. Open the same template in Analytics, Templates on the Pi
Commerce panel.
*Expected result:* Messages arrive. CT's report shows sent, delivered and read counts, and those
counts reconcile with the Pi Commerce figures within the NFR-5 tolerance.

**AC-15 — Personalised values land in the right places (verifies FR-6)**
*Given:* A template with three body placeholders and a dynamic URL button.
*Steps:* 1. Run a CT campaign personalising all three placeholders with distinguishable values.
2. Read the message on a test device and open the button link.
*Expected result:* The three values appear in the correct positions in the body, and the button opens
the URL built from the correct value.

**AC-16 — A failed message reports a usable reason (verifies FR-8)**
*Given:* A CT campaign including at least one invalid phone number and one number that has blocked the
business.
*Steps:* 1. Publish the campaign. 2. Open the campaign report in CT. 3. Open the failure breakdown for
the same template on the Pi Commerce panel.
*Expected result:* CT categorises each failure rather than grouping everything under a miscellaneous
error. The Pi Commerce breakdown shows both the code sent to CT and Meta's original error description.

**AC-17 — A reply appears in CT Conversations (verifies FR-9)**
*Given:* A test user who has received a campaign message.
*Steps:* 1. From the test device, reply with a text message. 2. Reply again with a photo, a document
and a location. 3. Open Conversations in CT.
*Expected result:* All four replies appear against the correct user, threaded under the campaign
message they replied to. The photo and document open correctly from within CT.

**AC-18 — An agent reply reaches the user (verifies FR-7)**
*Given:* An open conversation in CT Conversations following a user reply.
*Steps:* 1. From CT agent chat, send a text message, then an image, then a PDF document. 2. Check the
test device.
*Expected result:* All three arrive, with the image and document opening correctly and any caption
showing.

**AC-19 — Messaging outside the 24-hour window is refused clearly (verifies FR-7)**
*Given:* A user whose last incoming message was more than 24 hours ago.
*Steps:* 1. Attempt to send a freeform message to that user from CT agent chat.
*Expected result:* The agent sees a failure immediately rather than the message appearing to send and
then silently disappearing.

**AC-20 — An opted-out user stops receiving messages (verifies FR-10)**
*Given:* A test user who has received a campaign message, on a connector with encryption enabled.
*Steps:* 1. From the test device, reply with the word STOP. 2. On the Pi Commerce panel, open the
opt-out list for that WABA number. 3. Run a new CT campaign that includes this user. 4. Check the test
device and the campaign report in CT.
*Expected result:* The number appears on the opt-out list. The new campaign does not deliver to the
device, confirming the encrypted number was matched against the list correctly. CT's report shows the
message failed rather than delivered. The STOP message itself appears in CT Conversations.

**AC-21 — Clicks are counted (verifies FR-11)**
*Given:* Click tracking provisioned and the tracking domain entered in CT.
*Steps:* 1. Run a campaign using a template with a dynamic URL button. 2. Tap the button on a test
device. 3. Check the campaign report in CT and the template detail view on the Pi Commerce panel.
*Expected result:* The device opens the correct destination without visible delay. Both CT and the Pi
Commerce panel show a click recorded against the campaign and the template.

**AC-22 — Template analytics separate CT traffic from other traffic (verifies FR-12)**
*Given:* A template used by both a CT campaign and a direct Pi Commerce API send in the same week.
*Steps:* 1. Open Analytics, Templates on the Pi Commerce panel. 2. Set the source filter to CleverTap.
3. Change the source filter to All.
*Expected result:* With the CleverTap filter applied, the counts match the CT campaign only. With All
applied, the counts include both. The view shows a data freshness label and the funnel from sent
through to replied.

**AC-23 — The recipient report contains what is needed to investigate a complaint (verifies FR-13)**
*Given:* A completed CT campaign of at least 50,000 messages including some failures.
*Steps:* 1. Request a recipient-level report for the template and date range. 2. Wait for the
completion notification and download the file. 3. Find the row for a specific user who reported not
receiving the message.
*Expected result:* The report is generated without blocking the panel, and the notification arrives
with a working download link. The user's row shows the message identifier, template name, every status
timestamp, the final status, and both the CT error code and Meta's original error description.

**AC-24 — Phone numbers are masked unless the user is permitted (verifies FR-13)**
*Given:* A client account with phone masking enabled, and two panel users, one with unmasked export
permission and one without.
*Steps:* 1. Download a recipient report as the user without the permission. 2. Download the same
report as the user with the permission. 3. Check the audit log.
*Expected result:* The first file shows masked numbers, the second full numbers. The audit log records
the second download with the user, filters and row count, and does not record the first as an unmasked
export.

**AC-25 — The endpoint holds up under campaign load (verifies NFR-1, NFR-2)**
*Given:* A load test replaying CT's message payload at 1500 concurrent requests, run once against an
unencrypted connector and once against an encrypted one.
*Steps:* 1. Run each test for 15 minutes at sustained concurrency. 2. Review latency and error metrics
for both. 3. Increase concurrency beyond the 1500 ceiling.
*Expected result:* No request exceeds 1 second in either run, and p99 stays under 400ms including on
the encrypted connector. Beyond the ceiling, requests are refused with HTTP 429 and the contract's
message body, and response times for accepted requests do not degrade.

**AC-26 — A CT outage does not stop message delivery (verifies FR-8, NFR-3)**
*Given:* A running campaign, with the CT callback URL made unreachable for 10 minutes.
*Steps:* 1. Continue the campaign while callbacks are failing. 2. Restore the callback URL. 3. Check
the campaign report in CT and the Pi Commerce message records.
*Expected result:* Messages continue to be delivered throughout. Statuses accumulated during the
outage are retried and appear in CT after restoration. No status is permanently lost, and any that
exhaust retries are visible to operations for replay.

**AC-27 — A duplicate request does not send twice (verifies FR-6)**
*Given:* A configured connector.
*Steps:* 1. Send the same message payload twice within a minute, with an identical message identifier.
2. Check the test device.
*Expected result:* Both requests return success. Only one message arrives on the device. Only one
message is billed.

**AC-28 — A connector cannot be created for a number Pi Commerce does not hold (verifies FR-1)**
*Given:* A merchant with several provisioned numbers, some of which already have connectors.
*Steps:* 1. Open the create dialog and inspect every option. 2. Attempt to select a number that
already has a connector. 3. Attempt to supply a number by any other means.
*Expected result:* Every option is a provisioned number, shown with the WABA that owns it. Numbers
that already have a connector are present but unselectable and say why. There is no free-text entry
anywhere in the flow. Where every number is taken, the step explains the one-per-number constraint,
points at Channels, and disables the create action.

**AC-29 — Deletion tells CleverTap what happened (verifies FR-1)**
*Given:* An enabled connector in Live state.
*Steps:* 1. Open the row menu and attempt Delete. 2. Disable the connector. 3. Attempt Delete again
and confirm.
*Expected result:* Delete is visible but blocked while the connector is enabled, with the reason shown
and the unblocking step adjacent. After disabling, the connector rejects requests with 2000 and Delete
becomes available. The confirmation names the WABA number, states that the CT provider entry must also
be removed, and states that credentials cannot be reissued.

**AC-30 — The page states what Pi Commerce cannot carry (verifies FR-14)**
*Given:* The Connections page.
*Steps:* 1. Read the delivery table.
*Expected result:* Every platform and channel pair has a row. Uncarried pairs are marked as
forthcoming with no number, no activity and no row menu, and carry no reason text. A client using an
uncarried pair can determine that within one screen without opening anything.

**AC-31 — The client can tell when validation last succeeded (verifies FR-1, FR-3)**
*Given:* One connector that CT has validated, and one still in Draft.
*Steps:* 1. Open each connector's detail screen and read the header.
*Expected result:* The validated connector shows its state indicator followed by the time of the last
successful validation. The Draft connector shows the state indicator and **no** validation line —
neither `Never` nor a placeholder — with the Draft notice carrying that fact instead.

---

## 6. Open Questions

**Q1 — Does CleverTap issue per-channel encryption keys for WhatsApp?** CT documents payload
encryption for data sent to providers but does not state clearly whether a key is issued per channel
or per account, and it provides no key management interface. This shapes FR-2 and Assumption 7, and it
is a precondition for ever offering self-service key entry — a field cannot be designed against an
unconfirmed shape.

**Q2 — At what volume does operations-led key provisioning stop working?** Assumption 8 holds that the
encrypting population is small enough for a human onboarding step. It fails quietly, by operations
becoming a queue. A threshold should be agreed now so that the failure is noticed as a threshold
crossing rather than as a series of slow onboardings.

**Q3 — Does the FR-12 dependency leave an unacceptable gap in Epic A?** FR-2's client-visible
decryption reporting and FR-5's resolution-failure view both live in FR-12, which is Epic B. Between
Epic A shipping and FR-12 shipping, both failure modes are diagnosable only by support — and a
template name mismatch is the most likely first failure on a manually created template. AC-12 does not
pass against Epic A. Two ways to close it, neither yet chosen: sequence FR-12 first inside Epic B, or
ship the failure views alone ahead of the rest of FR-12.

**Q4 — Is PII tokenization in scope later?** CT documents an alternative where it holds tokens rather
than encrypted PII. Out of scope here, and it would change FR-2 substantially rather than extend it.

**Q5 — Should a connector be disableable from its own detail screen?** Disable and delete both live on
the connector list row, on the reasoning that the list is where you act on a connector and the detail
screen is where you read one. If walking from detail back to list proves to be a common path, the
detail screen header — not a settings panel — is where it belongs. Epic C.

**Q6 — Who provisions the click tracking domain, and when?** FR-11 displays the domain read-only and
warns the client to leave CT's field empty until it exists. Nothing provisions it. This is blocked on
FR-11 regardless, so it needs answering only when Epic B starts.
