# CleverTap Generic SMS Integration — PRD

Version 2. Validated against current CleverTap Generic SMS documentation. Companion to the
CleverTap Generic WhatsApp Connector PRD v2 and the WebEngage WSP PRD. Read this document on its
own; where it differs from either, the difference is stated rather than assumed.

Validation note — 26 Aug 2026: This revision incorporates current CleverTap documentation checks.
The principal corrections are the documented 15-second Generic SMS timeout with zero CleverTap
retries, the documented 1,000-record single-batch limit, and clearer separation between CleverTap
protocol requirements and Pi Commerce design choices.

Sourcing. Every CleverTap protocol fact in this document is based on CleverTap’s current Generic
SMS documentation and current SMS troubleshooting/timeout documentation. Pi Commerce design
choices are explicitly labelled as proposed, and upstream SMS-route dependencies are explicitly
labelled as dependencies or questions. Key current facts include: Generic SMS uses a
customer-configured HTTP endpoint; CleverTap supports GET or POST, Basic/OAuth 2.0/No
Authentication, dynamic replacements, batching up to 1,000 records per batch, and callbacks for
delivery, failure, click and reply tracking. CleverTap documents a 15-second Generic SMS request
timeout and zero retries.

---

## 1. Objective

CleverTap supports any SMS provider through an open HTTP integration. A CleverTap client can point
their SMS channel at any endpoint that speaks HTTP, define the payload shape themselves, and
receive delivery, click and reply reporting through a callback. There is no provider list to join
and no CleverTap involvement required.

This document defines what Pi Commerce needs in order to be a good choice in that slot: an SMS
send API shaped so that a client can configure it in CleverTap without a support ticket, a
delivery callback that produces complete campaign statistics, and the panel surfaces that make
both self-serve.

Read §2.2 before the requirements. Unlike the WhatsApp integrations, the engineering work here is
modest and the commercial question is the hard one. This PRD is written on an assumption about
that question which may not hold.

---

## 2. Background

### 2.1 Generic SMS inverts Generic WhatsApp

Both contracts are published by CleverTap and both are called Generic, which invites the
assumption that they work the same way. They do not, and the difference decides most of this
document.

Under Generic WhatsApp, CleverTap defines the payload and the provider conforms to it. CleverTap
sends template.namespace and msgId and its own component structure, and every provider receives
the same shape. That is what makes the WhatsApp connector’s panel a transcription surface: the
values are fixed by CleverTap, so our page exists only to hold them for copying.

Under Generic SMS, the client defines the payload. CleverTap’s provider form asks for our HTTP
endpoint, our authentication, our headers, and then a payload template — either key-value pairs or
a complete JSON structure — into which CleverTap substitutes a small set of dynamic replacement
tokens at send time. CleverTap lets the customer define the provider payload structure; Pi
Commerce therefore controls the field names of its own API contract. It will send whatever the
client typed into that form.

Three consequences follow, and they run through every requirement below.

Our API shape is not constrained by CleverTap, but it is constrained by the client’s ability to
describe it. Any endpoint we can document, a client can configure. But a client who mis-describes
it gets an integration that fails in a way CleverTap cannot explain, because from CleverTap’s side
the configuration is valid and the provider is simply returning errors.

The most valuable artefact we ship is not code — it is the payload recipe. A JSON blob the client
pastes into CleverTap’s Parameters field, correct by construction, is worth more than any amount
of API documentation. This is FR-2, and it is the requirement most likely to be under-weighted
because it does not look like engineering.

There is a flexible Generic SMS path for providers outside CleverTap’s listed native SMS
integrations. A CleverTap client can configure a Pi Commerce endpoint under Other (Generic)
without Pi Commerce needing to be a native listed provider. That makes this the lowest-friction of
the three integrations to ship and the only one whose timeline we fully control.

### 2.2 The prerequisite question: does Pi Commerce sell SMS?

This PRD assumes Pi Commerce has, or intends to have, a commercial SMS product for the Indian
market with DLT-compliant delivery. If that assumption is wrong, this document is not actionable
and the correct output is a decision rather than a backlog. The assumption deserves stating
explicitly because the platform’s own competitive position has argued against owning the SMS
stack. Direct operator interconnect in India sits behind a regulatory moat — DLT registration,
scrubbing, the entity and template chain — that a small number of incumbents already hold, and the
standing conclusion has been that reselling is the sensible posture rather than building toward
interconnect. That conclusion does not settle this question; it reframes it. Generic SMS does not
require operator interconnect. It requires an HTTP endpoint that accepts a message and a callback
that reports what happened, and the delivery underneath can be resold. So the real question is
narrower than “should Pi Commerce build SMS”:

If Pi Commerce already resells SMS, this integration is a small amount of work that makes existing
capability reachable from a platform where clients already run campaigns. It is likely worth doing
on those grounds alone.

If Pi Commerce does not sell SMS today, this integration is not a reason to start. The margin on
resold SMS is thin, DLT support carries real operational cost (FR-6 and §2.5), and a client
configuring us as their SMS provider will hold us accountable for delivery outcomes we do not
control. The strategic case for SMS has to stand on its own; CleverTap reachability is not it.

[Decision required — Product] Confirm which of these is true before Epic A is scheduled. See Q1.

### 2.3 Division of responsibility

CleverTap owns the audience, the campaign, the personalisation, and the campaign statistics its
marketers see. Pi Commerce owns message delivery, delivery reporting back to CleverTap, click
tracking where enabled, reply forwarding, and everything on the Pi Commerce panel.

Two responsibilities are more ambiguous than on the WhatsApp path and should be settled in
contracts rather than left to discovery. DLT compliance is nominally the client’s — they register
the entity, the header and the template — but the failures surface as our error codes (906 through
909, 919) and the client will bring them to us. And delivery outcomes on resold SMS are the
upstream aggregator’s, while the client sees them as ours.

### 2.4 The constraint that drives the design

The WhatsApp connector’s design point is a hard latency budget: one second, 1500 concurrent,
stated by CleverTap. Generic SMS publishes no such figure. What it publishes instead is a set of
behaviours that together constrain the design more loosely but in one place very sharply.

The system dynamic replacement set currently documented by CleverTap contains six replacements —
$$To, $$Body, $$TemplateID, $$TemplateVariables, $$CampaignID and $$MessageID — plus
client-defined custom tokens settable per campaign. Anything our API needs that cannot be
expressed in that set must be a static value in the client’s configuration, which means it cannot
vary per recipient. Any API design requiring per-recipient data outside those six tokens is not
configurable in CleverTap at all. $$MessageID is the whole of delivery reporting. CleverTap
substitutes an opaque string, and the provider must return it verbatim in the meta field of every
callback event. The documentation is explicit that it is “mandatory in case of DLR (clicks,
delivered, replied, and delivery-related errors) tracking.” Lose it, mangle it, or normalise it,
and the client’s campaign statistics are permanently empty while every message delivers correctly
— a failure that looks like nothing is wrong. This is the single most important field in the
integration and FR-7 exists for it alone.

Batching is the client’s choice, and it is made on CleverTap’s form rather than in the payload we
author: naming the batch key packs multiple records into the recipients array, leaving it blank
sends one request per recipient. The recipe we generate is identical either way. What is not
established is what CleverTap puts on the wire in the blank case — a one-element recipients array,
or the record flattened to the top level. Until that is answered, our endpoint accepts both. See
FR-5.

### 2.5 DLT and the Indian regulatory surface

Six of CleverTap’s twenty error codes concern Indian DLT specifically — 906 header blocked, 907
entity blocked, 908 template blocked, 909 consent error, 919 platform failure, plus 913 NDNC — and
$$TemplateID exists in the replacement set only for “campaigns targeted to Indian mobile numbers.”

For a platform whose clients are predominantly Indian, DLT is not an edge case in this
integration; it is most of the failure surface. The practical consequence is that FR-6 and FR-9
carry more weight than their length suggests, and that the support burden of this integration will
be DLT questions rather than API questions. That should be planned for rather than discovered.

### 2.6 Panel design principle

The CleverTap WhatsApp connector establishes that its screen is a transcription surface — a page
holding values to be retyped into someone else’s form — and that a control whose only reachable
outcomes are wrong is not a feature.

The principle holds, but what gets transcribed changes. On the WhatsApp connector the client
copies nine discrete values. Here the client copies one configuration recipe: a complete JSON
payload structure, correct by construction, that goes into CleverTap’s Parameters field verbatim.
Alongside it sit the endpoint, the credentials, and a small number of values that vary.

The test to apply to every element is unchanged, and it bites harder here. Because the client is
authoring our request shape inside CleverTap, any element of the recipe we let them adjust is an
element they can get wrong, and every one of those failures reads as ours. The recipe should
therefore be copied whole and not assembled from parts, with per-client variation limited to what
genuinely varies — the DLT entity and template identifiers, and the sender header.

### 2.7 Assumptions

These have been assumed rather than confirmed, and should be corrected during review if wrong.

1. Pi Commerce has, or will have, a commercial SMS product for the Indian market with
   DLT-compliant delivery. This is the load-bearing assumption. See §2.2 and Q1.

2. SMS delivery is resold through an aggregator rather than delivered over direct operator
   interconnect. The requirements below hold either way, but the callback fidelity in FR-8 and
   FR-9 depends on what the upstream partner passes through, which is a procurement question. See
   Q2.

3. Pi Commerce’s existing metering covers SMS. No new commercial model is in scope.

4. Clients configuring this hold their own DLT registration — entity, header and template — with
   Pi Commerce or its upstream partner as the registered delivery route. This integration does not
   perform DLT registration.

5. The client’s CleverTap plan includes the SMS channel. A commercial prerequisite on CleverTap’s
   side and outside Pi Commerce’s control.

6. $$MessageID values are opaque and stable within a campaign, and are safe to store as an
   uninterpreted string. The documented sample —

9999999999.1200000000.1654002362.20220531.0.wzrk_default.-1. — is clearly structured, but nothing
in the documentation licenses parsing it and FR-7 forbids doing so.

7. Not every requirement below ships in one release. The epic split is in §2.8.

### 2.8 Note on document size and delivery

This PRD contains 14 functional requirements across three epics.

Epic A — send and report: FR-1 through FR-9. These must ship together. An SMS integration that
sends without reporting produces a CleverTap campaign showing zero delivered against a full send,
which is worse than no integration because it reads as total failure.

Epic B — panel and visibility: FR-10 through FR-14. The connection screen, the payload recipe
builder, analytics and the Connections matrix. FR-11 should be sequenced first within this epic;
per §2.1 the recipe is the highest-leverage artefact in the integration and a client cannot
self-serve without it.

Epic C — deferred: click tracking (FR-12) if the shared click infrastructure from the WhatsApp
connector’s FR-11 has not yet shipped, and inbound reply forwarding (FR-13) if two-way SMS is not
in the product today.

Unlike the WebEngage integration, nothing here is gated on an external party. Epic A can begin as
soon as §2.2 is answered.

---

## 3. Functional Requirements

Unless a requirement states otherwise, every payload structure, replacement token, error code and
limit attributed to CleverTap in this section comes from the Generic SMS documentation.

### FR-1: Provide an SMS send API that CleverTap’s provider form can call

**Story:** As a marketing operations user at a client, I should be able to point CleverTap’s SMS
channel at Pi Commerce and have messages send, so that I can run SMS campaigns from where I
already run everything else.

**Requirements:**

System should expose an SMS send endpoint accepting POST with a JSON body, reachable at a stable
HTTPS URL. CleverTap’s form also offers GET, but a GET configuration cannot carry a batched
payload and puts recipient numbers in a query string, so the documented recipe should be POST
only.

System should design every per-recipient field so that it maps to one of CleverTap’s six system
replacements, because nothing else can vary per recipient:

Token

Carries

Mandatory

$$To

Recipient phone number

Yes, always

$$Body

Message body

One of $$Body or

$$TemplateID

$$TemplateID

DLT template identifier

One of $$Body or

$$TemplateID; India only

$$TemplateVariables

Template variable values

No

$$CampaignID

CleverTap campaign identifier

No

$$MessageID

Callback join key

Yes, for any delivery reporting

System should accept $$MessageID under a key we specify in the recipe and store it byte-exact per
FR-7.

System should accept the message body as UTF-8. CleverTap states that “The messages sent out from
CleverTap are encoded in the UTF-8 charset”, which matters for regional-language SMS where
encoding errors silently change the character count and therefore the billing.

System should accept both a DLT template identifier and a rendered body, because a client sending
to Indian numbers uses $$TemplateID with $$TemplateVariables while a client sending
internationally uses $$Body. The same endpoint should serve both rather than requiring two
configurations.

System should accept a sender header (DLT header / sender ID) as a static value in the client’s
configuration, since it does not vary per recipient and has no system replacement token.

System should accept, and ignore without error, any additional keys present in the request. A
client building their configuration will leave keys in it, and rejecting an unexpected field turns
a harmless mistake into a total outage.

**Dependencies:** A commercial SMS capability per §2.2.

**Out of scope:** Campaign definition, audience selection and personalisation, all of which remain
in CleverTap. DLT registration.

### FR-2: Publish a canonical CleverTap payload recipe

**Story:** As a marketing operations user, I should be able to copy one block of configuration
from the Pi Commerce panel into CleverTap and have it work, so that I am not translating API
documentation into a form field.

Per §2.1 and §2.6 this is the highest-leverage requirement in the document, and the one most
likely to be treated as documentation rather than product.

**Requirements:**

System should generate a complete JSON payload structure, per connection, ready to paste into
CleverTap’s Parameters field with no editing. The shape below is the contract of the Pi Commerce
send endpoint, POST /v1/messages/sms/send, with CleverTap’s tokens substituted into it — not an
illustration to be finalised later:

```json
{
  "template_id": "$$TemplateID",
  "sender_id": "PICOMM",
  "campaign_id": "$$CampaignID",
  "recipients": [
    {
      "to": "$$To",
      "message_id": "$$MessageID",
      "variables": "$$TemplateVariables"
    }
  ]
}
```

An earlier revision of this document carried a different block here — "header" rather than
"sender_id", "messages" rather than "recipients", and three fields the endpoint does not have:
"entity_id", "body" and "encoding". It was written before the send API was checked and was
implemented verbatim, producing a connector whose every recipe would have been rejected on first
send. Two fields above are also not yet in the endpoint’s contract: "campaign_id" and
"recipients[].message_id" are asks on the API, tracked separately; message_id in particular is
blocking, because CleverTap has no other key for matching a delivery callback to the message it
sent.

System should generate one recipe, not two. An earlier revision required a non-batched variant
flattened to a single level; that variant is invalid against the Pi Commerce send endpoint, which
requires the recipients array in every request, so generating it would hand the client a block
that fails on first send. Batching is configured on CleverTap’s form by naming the batch key — it
is not expressed in the payload we author — so the recipe is identical either way and there is
nothing for the client to choose between here.

System should not offer a batched/non-batched control on the recipe surface, because such a
control changes nothing it appears to control. The choice and both of its consequences should
instead be stated alongside the batch key name, which is the field that decides it.

System should pre-fill every client-specific value in the recipe — the sender ID and the endpoint
— so that the copied block requires no substitution. A recipe with placeholders left in it is a
recipe that gets pasted with placeholders left in it. There is no DLT entity identifier in the
recipe: the send endpoint has no such field, and the sender ID alone resolves the entity on the
operator’s side.

System should state, adjacent to the recipe and not in a linked document, the three values that
must be entered elsewhere on CleverTap’s form: the HTTP endpoint, the authentication credentials,
and the batch key name with records per batch where batching is used.

System should state that CleverTap currently documents a maximum batch size of 1,000 records. Pi
Commerce may recommend a lower operational default based on its own throughput and upstream-route
constraints. CleverTap’s documentation gives two different figures — “A single batch can have a
maximum of 1,000 records” under the provider setup section and “CleverTap supports a maximum batch
size of 100 records” under the sample batched request. These cannot both be right. The current
provider setup documentation states a maximum of 1,000 records per batch, while another Generic
SMS sample section has historically shown 100. Because the current top-level/provider setup
documentation and multiple current provider examples state 1,000, the PRD should support up to
1,000 and treat 100 as a documentation inconsistency to clarify rather than as the confirmed
platform limit., while one built on 100 merely batches less efficiently on a platform that permits
1,000. [Reach out — CleverTap] See Q3.

System should warn, where a client already has a Pi Commerce provider configured in CleverTap
without callbacks, that callbacks cannot be added to it. CleverTap’s documentation states that “If
you already have a provider saved, you must set up a new one with the same configuration details
along with additional information for SMS callbacks.” A client who follows the obvious path — edit
the existing provider — will not get reporting and will have no indication why.

**Dependencies:** FR-1 (the recipe describes that API), FR-10 (the panel is where it is shown).

**Out of scope:** Configuring anything inside CleverTap on the client’s behalf.

### FR-3: Authenticate CleverTap requests

**Story:** As a security owner at a client, I should be able to give CleverTap credentials scoped
to my own account, so that a leaked configuration cannot send from anyone else’s sender.

**Requirements:**

System should support Basic Authentication as the documented and recommended scheme, matching what
the CleverTap WhatsApp connector and the WebEngage integration already issue, so that a client
operating several of them sees one credential model.

System should support OAuth 2.0 where a client’s security policy requires it. CleverTap’s form
accepts a client URL, client identifier, secret key and optional key-value pairs, and handles
token acquisition itself. Two behaviours should be understood before offering it: CleverTap
retries a failed authentication “after every 120 seconds”, and while it is failing “All SMSs will
fall under Dispatch Error” — so an expired secret stops the client’s entire SMS channel, not one
campaign, and recovery is on a two-minute cycle.

CleverTap supports No Authentication, Basic Authentication and OAuth 2.0. Pi Commerce should
support Basic Authentication and OAuth 2.0 and may deliberately prohibit No Authentication as a Pi
Commerce security policy. An unauthenticated send endpoint reachable from anywhere is a way for a
third party to send SMS at the client’s cost under the client’s sender header.

System should issue credentials per connection, scoped to the client’s account and sender headers,
and should reject a request whose header is not authorised to those credentials.

System should support secure credential creation, storage and rotation. The rotation mechanism and
grace period are Pi Commerce security-policy decisions, not CleverTap protocol requirements. — the
same behaviour and reasoning as the WhatsApp connector’s FR-1.

System should restrict credential creation and viewing to users holding integration management
permission.

**Dependencies:** FR-10 (the panel is where credentials are shown).

**Out of scope:** IP allowlisting; CleverTap does not publish stable egress addresses for the SMS
channel.

[Reach out — CleverTap] See Q4.

### FR-4: Accept and acknowledge within CleverTap’s tolerance

**Story:** As a growth marketer, I should be able to run a large SMS campaign without CleverTap
reporting dispatch errors caused by our response time, so that the campaign statistics reflect
delivery rather than infrastructure.

**Requirements:**

System should accept and acknowledge a valid request without waiting for the upstream aggregator,
queueing the send and reporting the true outcome through FR-8.

System should return an HTTP response within CleverTap’s documented 15-second Generic SMS timeout.
Pi Commerce should normally acknowledge an accepted request with HTTP 200 and queue downstream SMS
delivery rather than waiting for operator delivery. Non-2xx responses should be reserved for
requests Pi Commerce cannot accept or process.

System should not inherit the WhatsApp connector’s one-second latency/concurrency requirement.
CleverTap’s current SMS troubleshooting documentation specifies a 15-second Generic SMS request
timeout and zero CleverTap retries. Pi Commerce should set its own internal latency and throughput
targets below that limit., and the absence should not be read as permission. Batching makes the
arithmetic different but not gentler: at 100 records per request a million-recipient campaign is
10,000 requests, and each one is 100 messages that fail together if the request does.

System should return one HTTP response for the batch while processing records independently after
acceptance. The exact partial-failure response contract is a Pi Commerce API design decision;
CleverTap does not define a provider-side per-record response schema beyond the HTTP response., so
that one bad recipient number does not fail the other 99.

[Reach out — CleverTap] Confirm the request timeout on the Generic SMS provider endpoint, what
CleverTap does on a timeout, and whether a timed-out batch is retried in whole. Without this, the
behaviour of a slow response at campaign scale is unknown, and it is the difference between a
delay and a duplicate send. See Q5.

**Dependencies:** FR-1, FR-3.

**Out of scope:** Per-message synchronous delivery confirmation, which no SMS route can provide.

### FR-5: Handle batched and unbatched requests

**Story:** As a platform operator, I should be able to accept whichever payload shape the client
configured, so that a working CleverTap configuration is not silently dependent on a choice the
client did not know they were making.

**Requirements:**

System should accept both the batched form, with per-recipient records under an array key, and the
flattened single-message form, on the same endpoint, distinguished by the presence of the array.

Note — this requirement is retained deliberately and rests on an open question. It is not
established what CleverTap puts on the wire when the batch key name is left blank: it may wrap the
single record in the named array, in which case the flattened branch is dead code, or it may
flatten the record to the top level, in which case the branch is load-bearing for every unbatched
connection. The recipe we generate always carries the array, so the batched form is certain; the
flattened form is defensive. Support it until the question is answered, and do not read this
requirement as evidence that the connector emits two payload shapes — it does not. [Reach out —
CleverTap] Confirm the request body sent with no batch key configured. See Q3 and the connector's
API asks note.

System should support the CleverTap-configured batch size up to 1,000 records and should reject a
larger batch with a clear error naming the configured Pi

Commerce/CleverTap-supported limit rather than silently truncating. with a clear error naming the
limit rather than silently truncating. A truncated batch is indistinguishable from a delivery
failure on the client’s side.

System should return a per-record outcome within the batch response, so that a partially valid
batch reports which records were accepted.

System should preserve the seq value where the client’s recipe carries one, since CleverTap’s own
examples include it and a client may rely on it for ordering in their own reconciliation.

System should implement idempotency protection for duplicate outbound requests if required by Pi
Commerce’s reliability architecture. The idempotency key and retention window are Pi Commerce
design decisions and are not dictated by CleverTap Generic SMS documentation. CleverTap states
that it does not deduplicate callback requests and recommends providers retry callback submissions
after HTTP 5xx responses. This applies to Pi Commerce → CleverTap callback delivery; it should not
be interpreted as a requirement for outbound SMS-request deduplication.

**Dependencies:** FR-1, FR-7 (deduplication keys on the message identifier).

**Out of scope:** Reordering or re-batching records across requests.

### FR-6: Accept and honour DLT parameters for Indian traffic

**Story:** As a WhatsApp and SMS platform owner in India, I should be able to send DLT-compliant
SMS through CleverTap, so that my campaigns are not blocked at the operator.

**Requirements:**

System should accept the DLT template identifier through $$TemplateID and the variable values
through $$TemplateVariables, and should submit both to the upstream route in the form it requires.

System should accept the DLT entity identifier and the sender header as static configuration
values in the recipe, since neither varies per recipient.

System may validate, before dispatch, that the supplied template identifier is registered against
the client’s entity and header where the upstream route exposes such validation. This is an
upstream/Pi Commerce capability, not a CleverTap requirement. Catching a mismatch before dispatch
converts an operator rejection — which the client sees as error 906, 907 or 908 several minutes
later, aggregated across a campaign — into an immediate and specific failure. [Reach out —
upstream SMS partner] Confirm whether pre-dispatch DLT validation is available on the route, and
at what latency. If it is not, this requirement reduces to reporting after the fact and FR-9
carries the whole burden. See Q6.

System should support $$Body for traffic where a rendered body is appropriate and support
$$TemplateID/$$TemplateVariables for Indian traffic requiring DLT template information, per FR-1,
and should not require DLT parameters on traffic that does not need them.

System should surface the client’s registered headers and templates on the panel per FR-10, so
that the values entering the recipe are chosen rather than typed.

**Dependencies:** FR-1, Assumption 4 (the client holds their own DLT registration).

**Out of scope:** Performing DLT registration on the client’s behalf. Content scrubbing, which
happens upstream.

### FR-7: Store and echo the CleverTap message identifier

**Story:** As a growth marketer, I should be able to see delivery, click and reply statistics
against my CleverTap campaign, so that the campaign report reflects what actually happened.

Per §2.4 this requirement is the whole of delivery reporting, and its failure mode is silent.

**Requirements:**

System should store the value substituted for $$MessageID exactly as received and uninterpreted,
against every message record.

System should return that value unchanged in the meta field of every callback event. CleverTap’s
documentation describes meta as information it uses “for attributing delivered, clicked, errors,
etc., to respective campaigns, profiles, and sms providers” and states it “Must be passed as is to
CleverTap callback URL.”

System should not parse, split, normalise, trim, re-encode or validate the value. The documented
sample is visibly structured and ends in a trailing period, which is exactly the shape that
invites a well-meaning trim. Any modification breaks attribution for that message with no error
anywhere.

System should treat a message arriving without a $$MessageID value as sendable but unreportable,
dispatching it and recording that no callback will be possible. This is a real configuration
state: $$MessageID is optional in CleverTap’s replacement set and mandatory only for reporting, so
a client who omitted it from their recipe has an integration that sends perfectly and reports
nothing.

System should detect that state and surface it on the panel per FR-10, because it is the single
most likely misconfiguration in this integration and it produces a campaign report showing zero of
everything against a fully delivered campaign.

System should alert operations where the proportion of messages arriving without a message
identifier crosses a threshold, since it means a client has just configured a provider incorrectly
and will report the platform as broken within the day.

**Dependencies:** FR-1 (the field arrives there), FR-8 (the value is returned there).

**Out of scope:** Deriving a substitute identifier where none was supplied; nothing we generate
will attribute on CleverTap’s side.

### FR-8: Send delivery callbacks to CleverTap

**Story:** As a growth marketer, I should be able to see delivered counts, click-through rates and
replies in my CleverTap campaign report, so that I can judge SMS performance where I run
campaigns.

**Requirements:**

System should POST callback events to the Callback URL CleverTap generates on the provider setup
screen, which the client saves on the Pi Commerce panel per FR-10.

System should send the payload as a JSON array of event objects, each with an event name and a
data array, per CleverTap’s documented shape. This differs from most callback contracts and from
the WhatsApp connector’s: multiple event types travel in one request.

System should support the four documented callback event types — delivered, failed, clicked and
replied — subject to the underlying SMS route producing the corresponding event. The callback
payload must follow CleverTap’s documented event/object structure.

Event

Mandatory keys

Optional keys delivered ts, meta, description

—

failed ts, meta, code, description

—

clicked ts, meta, url shorturl replied ts, meta, incomingText toPhone, fromPhone

System should send ts as a Unix epoch integer, per the documented sample value

1654512921. CleverTap’s documentation currently uses both shortUrl and shorturl in different
            sections. Pi Commerce should support the documented mapping form and keep serializer
            compatibility for both forms until CleverTap confirms the canonical spelling.: the
            sample callback payload uses shortUrl with a capital U, while both the key reference
            table and the system event mapping section use shorturl. Two of three occurrences are
            lowercase, and the mapping section — which is the one describing how the value reaches
            the wzrk_c2a_short_url event property — is among them. Lowercase is the safer reading.

[Reach out — CleverTap] Confirm, and until confirmed consider sending both keys, since CleverTap
states that unrecognised keys are disregarded without error. See Q7.

System should treat CleverTap’s response per its documented codes: HTTP 200 success; 400 a
malformed payload, which should be dead-lettered rather than retried since retrying will fail
identically; 500 and 503 a CleverTap-side error.

System should retry 5xx responses after 10 minutes with exponential backoff, which is CleverTap’s
own recommendation, and should note why the interval is that long: CleverTap does not deduplicate,
so an aggressive retry against a server that received the payload but failed to respond writes
duplicate events into the client’s campaign statistics.

System should parse the unprocessed array in CleverTap’s response, which carries per-record
failures with a code, an error and the rejected record, and should surface these to operations
rather than discarding them. A partially rejected callback is otherwise invisible.

System should batch events where volume permits, and should move exhausted callbacks to a
dead-letter queue visible to operations for replay, so that a CleverTap outage does not
permanently lose statistics.

**Dependencies:** FR-7 (meta is the join key), FR-1 (messages must exist to report on).

**Out of scope:** Campaign-level aggregation, which CleverTap computes from these events.

### FR-9: Map delivery failures to CleverTap’s error vocabulary

**Story:** As a growth marketer, I should be able to see why my SMS failed in the CleverTap
campaign report, so that I can fix a DLT problem without opening a support ticket with two
vendors.

**Requirements:**

System should map every failure from the upstream route onto CleverTap’s error codes, which are
displayed in the Errors tab of the campaign stats:

Code

Description

Notes

901

DND failure

National DND registry

902

Failed spam detected

Carrier spam filter

903

Failed rejected blacklist User sent STOP; also operator-level blocks

904

Failed system error

Failure inside the provider’s system —

ours

905

Failed subscriber error

No balance, no network

906

Blocked by DLT

Sender header mismatch or unregistered — India

907

Entity blocked by DLT

Entity identifier missing or mismatched

— India

908

Template blocked by

DLT

Template identifier or content mismatch —

India

909

Failed DLT consent error

Consent registration required — India

910

Invalid subscriber

Invalid or inactive number

912

Message inbox full

913

NDNC rejected

Registered in NCPR database

914

Undelivered

Failed after operator retries

915

Dropped

J&K series ban; also

60-day SIM inactivity

916

Expired

Undelivered after operator retries

917

Force expired

Provider rule, invalid base, or client-requested drop

918

Duplicate message drop

Same content to same number within 30 minutes

Code

Description

Notes

919

DLT failure

Platform-level DLT issue

920

URL not whitelisted

Operator rejected an unwhitelisted URL

900

Anything else

Requires a real description in the payload

System should use 900 with a real description for anything the vocabulary does not cover, per
CleverTap’s instruction that “Any errors not specified in the above table must be sent with the
status code 900 along with the corresponding error description.” An approximate match onto a
defined code produces a campaign report that is confidently wrong and sends the client to fix the
wrong thing — particularly damaging among the DLT codes, where 906, 907 and 908 each imply a
different remediation in a different console.

System should log every 900 with its description and alert where the rate crosses a threshold,
since a recurring 900 means our upstream route returns a failure class CleverTap’s vocabulary
cannot express, which is worth raising with CleverTap rather than tolerating permanently.

System should note that 911 does not exist in CleverTap’s published list, which runs 901–910 and
912–920. This is recorded so that its absence is recognised as documented rather than investigated
as an omission on our side.

System should preserve the upstream route’s original error text alongside the mapped code, and
surface it in Pi Commerce’s own reporting per FR-14, because the mapping is lossy by design and
the original is what a support investigation needs.

System should map 918 carefully rather than automatically. The upstream route’s duplicate window
is its own and may not match CleverTap’s stated 30 minutes, and our own deduplication under FR-5
uses a 10-minute window on a different key. Three windows with three meanings will produce
confusing reports unless the mapping is deliberate.

**Dependencies:** FR-8 (codes travel on the callback), the upstream route’s error taxonomy.

**Out of scope:** Remediating DLT registration problems on the client’s behalf.

### FR-10: Create and manage a CleverTap SMS connection on the panel

**Story:** As a marketing operations user, I should be able to set up Pi Commerce as my CleverTap
SMS provider from the Pi Commerce panel without a support ticket, so that I can run SMS campaigns
the same week I decide to.

**Requirements:**

System should add CleverTap SMS to the delivery platforms section established by the WhatsApp
connector’s FR-14, so that a client running both sees one Connections page.

System should allow the user to create one connection per CleverTap account, and should show which
sender headers it covers, defaulting to all the client’s registered headers.

System should generate and display, each with a copy control except where noted: Field

Value

HTTP Endpoint

The SMS send endpoint

Request Type

POST — constant, no copy control

Authentication

Basic — constant, no copy control

Username

System generated

Password

System generated, shown once at creation, regenerable

Payload recipe (batched)

Per FR-2, complete and pre-filled

Payload recipe (unbatched)

Per FR-2, complete and pre-filled

Batch key name

The array key in the batched recipe

Records per batch

100 — constant per FR-2, no copy control

System should allow the user to paste and save the Callback URL CleverTap generates on its
provider setup screen, and should validate that it is HTTPS before saving.

System should store the callback URL encrypted at rest and mask it in the panel after saving,
leaving the host readable and hiding the path. As with the WhatsApp connector’s callback URLs,
this endpoint requires no authentication on CleverTap’s side, so anyone holding it can write false
statistics into the client’s CleverTap account. It is a secret.

System should show the connection in one of two states: Draft (created, never used) and Live (at
least one real message processed). There is no Validated state, because Generic SMS defines no
validation call — nothing on either side can move a connection there.

System should show a notice on a Draft connection explaining that the recipe must be pasted into
CleverTap under Settings > Engage > Channels > SMS > Add Provider, selecting Other (Generic), and
that nothing on the Pi Commerce panel triggers the connection.

System should display a reporting health indicator derived from FR-7: whether messages are
arriving with a message identifier. Where they are not, the connection screen should say that
delivery reporting is not configured, name the missing $$MessageID mapping as the cause, and point
at the recipe. Per FR-7 this is the most likely misconfiguration and the one that otherwise
presents as a totally failed campaign.

System should allow disabling without deletion, and deletion only after disablement, with the
delete action remaining visible while blocked and the reason shown adjacent — the same gate and
reasoning as the WhatsApp connector’s FR-1.

System should state in the delete confirmation that the CleverTap provider entry must be removed
too, and that credentials cannot be reissued.

**Dependencies:** FR-2 (the recipe), FR-3 (credentials), FR-7 (the health indicator).

**Out of scope:** Configuring anything inside CleverTap on the client’s behalf.

### FR-11: Generate the recipe against the client’s own registered values

**Story:** As a marketing operations user, I should be able to get a payload recipe already filled
in with my own sender header, so that I am not hand-editing JSON in a text field.

**Requirements:**

System should let the user select the sender header from those registered to them and covered by
the connection, regenerating the recipe on selection. This is the only control on the recipe,
because it is the only value in the block that legitimately varies between clients. There is no
DLT entity identifier to populate: the send endpoint has no such field, and the sender ID resolves
the entity on the operator’s side.

System should offer one recipe. An earlier revision required a batched and an unbatched form side
by side; batching is set by a field on CleverTap’s form and does not change the block, so the two
forms were identical. See FR-2.

System should include $$MessageID in the recipe by default and should not offer to remove it. It
is optional in CleverTap’s replacement set, but the only outcome of omitting it is an integration
with no reporting, which is the definition of a control whose reachable outcomes are all wrong.

System should validate a recipe the user has edited before they leave the page, checking that $$To
is present, that $$TemplateID is present, that $$MessageID is present, that a literal sender_id is
present, and that the JSON parses. CleverTap’s form will accept an invalid recipe and fail at send
time, so this is the last point at which the mistake is cheap. $$TemplateID is checked
unconditionally rather than as one of $$Body or $$TemplateID, because the send endpoint has no
body field — see FR-2 and Q4.

System should not offer a test send from the connection screen. An earlier revision required one,
on the reasoning that Generic SMS has no validation call and a test send is the only proof
available before real traffic. It was built and then withdrawn: a send that does not leave the
panel proves nothing about the client’s CleverTap configuration, which is where every failure this
integration has actually lives, and a green result against a provider that was never saved on
their side is worse than no result. The failure it was meant to catch — a recipe with no
$$MessageID — is caught earlier by the validation above and later by the reporting health
indicator in FR-7, neither of which can give a false pass.

**Dependencies:** FR-2, FR-6 (registered headers), FR-10 (the screen it lives on).

**Out of scope:** Editing the client’s CleverTap configuration.

### FR-12: Track clicks on links in SMS

**Story:** As a growth marketer, I should be able to see how many users clicked the link in my SMS
campaign, so that I can measure the campaign on outcomes rather than deliveries.

**Requirements:**

System should rewrite tracked links through the client’s click tracking domain, record the click,
and redirect, reusing the infrastructure the WhatsApp connector’s FR-11 establishes rather than
building a second one.

System should redirect within 300 milliseconds so that the user does not perceive an interstitial.

System should report a click to CleverTap as a clicked event per FR-8, carrying the original URL
in url and the shortened one in shorturl. CleverTap maps these to the wzrk_c2a and
wzrk_c2a_short_url properties of its Notification Clicked event, so url must be the destination
the client authored rather than our rewritten tracking link.

System should note that URL shortening interacts with DLT. Error code 920, URL not whitelisted,
exists because Indian operators reject SMS containing URLs that are not registered, and a
rewritten tracking domain is a different URL from the one the client registered. [Reach out —
upstream SMS partner] Confirm what URL whitelisting the route requires and whether our click
tracking domain can be registered against a client’s entity. If it cannot, click tracking is
unavailable on Indian traffic and should be stated as such rather than shipped and silently
failing. See Q8.

**Dependencies:** The WhatsApp connector’s FR-11 click infrastructure, FR-8 (clicks travel on the
callback).

**Out of scope:** Attribution beyond the click itself.

### FR-13: Forward replies to CleverTap

**Story:** As a growth marketer, I should be able to see a user’s reply to my SMS campaign in
CleverTap, so that opt-outs and responses reach the profile that generated them.

**Requirements:**

System should forward an inbound SMS as a replied event per FR-8, carrying incomingText and
toPhone where available, and meta where reliable attribution to the originating CleverTap message
is possible.

System should not assume that the most recent outbound message is necessarily the message being
replied to. Reply attribution should use upstream-provided correlation where available; otherwise
the attribution behaviour should be explicitly documented as a Pi Commerce limitation.

System should note that CleverTap trims incomingText beyond 512 characters, which is well beyond a
single SMS and is unlikely to bite, but is recorded here so that a truncated long reply is
recognised as expected behaviour.

System should treat an inbound STOP or UNSUBSCRIBE as an opt-out on the Pi Commerce side as well
as forwarding it, reusing the opt-out register the WhatsApp connector’s FR-10 establishes. Per
§2.5 the operator and DLT layers also enforce this, but a user who opts out should stop receiving
messages from us regardless of whether the operator blocks them.

**Dependencies:** FR-8, an inbound SMS capability on the route.

**Out of scope:** Two-way conversation UI, which remains in CleverTap. Opt-in capture.

### FR-14: Extend analytics, reporting and the Connections matrix to SMS

**Story:** As a platform owner, I should be able to see how my CleverTap SMS campaigns performed
on the platform that actually sent them, so that I can investigate a failure that CleverTap’s
mapped error codes cannot fully explain.

**Requirements:**

System should add CleverTap SMS as a traffic source alongside CleverTap, WebEngage, API and Panel
in the analytics established by the WhatsApp connector’s FR-12.

System should show, per campaign and per sender header, the funnel from submitted through
delivered, clicked and replied, with a data freshness label.

System should show a failure breakdown grouped by the CleverTap error code sent and by the
upstream route’s original error text, per FR-9. The mapping to CleverTap’s twenty codes is lossy
by design, and this is where the lost detail is recoverable.

System should group DLT failures — 906 through 909, plus 919 — distinctly from other failures,
since per §2.5 they are the largest support surface in this integration and each implies a
different fix in a different console.

System should include CleverTap SMS traffic in the recipient-level report established by the
WhatsApp connector’s FR-13, adding the CleverTap message identifier, the campaign identifier where
$$CampaignID was configured, the mapped error code and the upstream original.

System should apply the existing masking and audit rules unchanged.

System should add CleverTap SMS to the Connections matrix as carried once Epic A ships, and should
keep the existing rule that an uncarried pair is marked forthcoming with no reason text.

**Dependencies:** FR-8 and FR-9 (the event and error records are the input); the WhatsApp
connector’s FR-12, FR-13 and FR-14, which this extends rather than duplicates.

**Out of scope:** Campaign-level analytics, which remain CleverTap’s.

---

## 4. Non-Functional Requirements

| # | Requirement | Target | How it's measured |
|---|---|---|---|
| NFR-1 | CleverTap Generic SMS timeout is 15 seconds. Pi Commerce should target materially lower internal response latency. | p99 under 400ms, p99.9 under 900ms for a 100-record batch, measured server-side | APM dashboard, 7-day rolling window, reported separately from WhatsApp traffic |
| NFR-2 | Support customer-configured batches up to 1,000 records and sustain expected campaign throughput without exceeding CleverTap's 15-second request timeout. | Sustain the platform concurrency ceiling with zero timeouts; batch rejection rate under 0.1% | Load test before release, then production request and error-rate metrics |
| NFR-3 | Callback delivery to CleverTap. Late events mean a marketer watching a live campaign sees a delivery rate that is wrong rather than incomplete. | 99.5% of events acknowledged within 60 seconds of receipt from the route; p95 under 30 seconds | Callback queue lag and delivery success rate, daily |
| NFR-4 | Message identifier fidelity. Per FR-7 a single altered byte silently voids attribution for that message. | 100% byte-exact round trip, asserted on every release | Automated round-trip test with adversarial identifier values, in CI |
| NFR-5 | Availability of the send endpoint and the callback dispatcher. Shared with the WhatsApp connector, so the target is inherited. (Proposed — to be confirmed against client contracts.) | 99.9% monthly | Uptime monitoring with synthetic requests every 60 seconds |
| NFR-6 | Statistics reconciliation between CleverTap and Pi Commerce. | Delivered and failed counts within 0.5% of Pi Commerce records | Automated weekly reconciliation comparing CleverTap campaign exports against Pi Commerce message records |

---

## 5. Acceptance Criteria

### AC-1 — A client can configure Pi Commerce as their SMS provider unaided (verifies FR-1, FR-2, FR-10)

**Given:** A CleverTap account with the SMS channel and a Pi Commerce connection in Draft, and a
user who has not done this before.

**Steps:** 1. Open the connection screen and copy the batched recipe. 2. In CleverTap, add a
provider, select Other (Generic), and paste the recipe, endpoint and credentials. 3. Save and run
a test campaign.

**Expected result:** The configuration saves first time. Messages deliver. No value needed by
CleverTap’s form was absent from the Pi Commerce screen, and nothing pasted required editing.

### AC-2 — Both payload shapes work on one endpoint (verifies FR-5)

**Given:** Two CleverTap providers configured against the same connection, one batched and one
flattened.

**Steps:** 1. Run a 250-recipient campaign on each. 2. Count the requests received. 3. Compare
delivery.

**Expected result:** The batched configuration produced three requests of 100, 100 and 50. The
flattened configuration produced 250. All 500 messages delivered, and both reported identically.

### AC-3 — An oversized batch fails loudly (verifies FR-5)

**Given:** A connection, and a client configuration specifying 500 records per batch.

**Steps:** 1. Send a 500-record batch. 2. Inspect the response and the delivery.

**Expected result:** The request is rejected with an error naming the 100-record limit. No records
are silently dropped, and no partial send occurs.

### AC-4 — The message identifier survives byte-exact (verifies FR-7, NFR-4)

**Given:** A campaign whose $$MessageID values include the documented trailing period and a value
containing characters that would be altered by trimming or URL-encoding.

**Steps:** 1. Send the campaign. 2. Compare the stored value against the request. 3. Compare the
meta value on each callback against both. 4. Check the CleverTap campaign report.

**Expected result:** Byte-identical at all three points, including the trailing period. CleverTap
attributes every event to the campaign, and the report shows a full delivered count.

### AC-5 — A missing message identifier is caught before the client blames the platform (verifies FR-7, FR-10)

**Given:** A CleverTap provider configured without $$MessageID in the recipe.

**Steps:** 1. Run a campaign of at least 100 messages. 2. Check the recipients’ devices. 3. Open
the Pi Commerce connection screen. 4. Check the operations alerting channel.

**Expected result:** All messages deliver. The connection screen states that delivery reporting is
not configured, names the missing $$MessageID mapping, and points at the recipe. An operations
alert fires. The CleverTap report shows zero delivered, which the panel has already explained.

### AC-6 — Every callback event type reaches CleverTap correctly (verifies FR-8)

**Given:** A campaign producing a delivery, a failure, a click and a reply.

**Steps:** 1. Capture every callback sent. 2. Inspect the payload structure and keys. 3. Open the
CleverTap campaign stats.

**Expected result:** Each request is a JSON array of event objects. delivered carries ts, meta and
description; failed adds code; clicked carries url; replied carries incomingText. All four appear
in CleverTap’s stats against the right campaign and profile.

### AC-7 — A malformed callback is not retried forever (verifies FR-8)

**Given:** A callback that CleverTap rejects with HTTP 400.

**Steps:** 1. Send it. 2. Observe retry behaviour. 3. Check the dead-letter queue and the response
body.

**Expected result:** It is not retried, since a retry would fail identically. It is dead-lettered
and visible to operations. The unprocessed array from CleverTap’s response is captured with its
code, error and rejected record.

### AC-8 — A CleverTap outage does not lose or duplicate statistics (verifies FR-8, NFR-3)

**Given:** A running campaign, with the callback URL returning HTTP 503 for 30 minutes.

**Steps:** 1. Continue the campaign throughout. 2. Restore the URL. 3. Compare CleverTap’s counts
against Pi Commerce records.

**Expected result:** Messages continue to deliver. Events retry on the documented 10-minute
backoff and appear after restoration. No event is lost, and none appears twice — CleverTap does
not deduplicate, so a duplicate here would be visible as inflated stats.

### AC-9 — Failures map to the right CleverTap code (verifies FR-9)

**Given:** Messages failing for DND registration, an unregistered sender header, a mismatched DLT
template, an invalid number, and a reason with no CleverTap code.

**Steps:** 1. Send each. 2. Inspect the code on each callback. 3. Open CleverTap’s Errors tab.

**Expected result:** In order — 901, 906, 908, 910, and 900 with the upstream route’s real
description. No failure is mapped to an approximate code. The Errors tab distinguishes the three
DLT failures from each other.

### AC-10 — The upstream original survives the mapping (verifies FR-9, FR-14)

**Given:** A campaign with mixed failures including several mapped to 900.

**Steps:** 1. Open the failure breakdown in Pi Commerce analytics. 2. Find a 900 and read its
detail.

**Expected result:** Failures are grouped by CleverTap code and by the route’s original error
text. Every 900 carries the original reason. DLT failures are grouped distinctly from other
failures.

### AC-11 — DLT parameters reach the operator intact (verifies FR-6)

**Given:** An Indian client with a registered entity, header and template.

**Steps:** 1. Run a campaign using $$TemplateID and $$TemplateVariables. 2. Check the devices. 3.
Run a second campaign with a template identifier not registered to that entity.

**Expected result:** The first delivers with the correct sender header and rendered variables. The
second fails, and the failure names the mismatch specifically rather than reporting a generic
error.

### AC-12 — International traffic does not require DLT (verifies FR-1, FR-6)

**Given:** A connection and a non-Indian recipient number.

**Steps:** 1. Run a campaign using $$Body with no $$TemplateID. 2. Check the device.

**Expected result:** The message delivers. No DLT parameters were required and none were rejected.
The same endpoint served this and the Indian campaign in AC-11.

### AC-13 — Duplicate suppression works where CleverTap’s does not (verifies FR-5)

**Given:** A connection.

**Steps:** 1. Send the same batch twice within a minute with identical message identifiers. 2.
Check the devices and the billing record.

**Expected result:** Both requests return success. Each recipient receives one message. Each is
billed once.

### AC-14 — An unauthenticated configuration is not possible (verifies FR-3)

**Given:** The connection screen and CleverTap’s provider form.

**Steps:** 1. Read the recipe and setup instructions. 2. Attempt to send to the endpoint with no
credentials.

**Expected result:** Nothing on the Pi Commerce panel describes or recommends the No
Authentication option. An unauthenticated request is rejected.

### AC-15 — Credentials are shown once and rotate cleanly (verifies FR-3)

**Given:** A client with no CleverTap SMS connection.

**Steps:** 1. Create a connection and note the credentials. 2. Reload. 3. Rotate, then send with
the old password inside and outside the grace period.

**Expected result:** Shown once at creation; afterwards the row states so and offers rotation,
with no masked placeholder and no copy control on it. Both work during the grace period, only the
new one after.

### AC-16 — The callback URL is treated as a secret (verifies FR-10)

**Given:** A connection and the callback URL from CleverTap.

**Steps:** 1. Paste and save it. 2. Reload. 3. Attempt to save an http:// URL.

**Expected result:** Saved and shown masked, host readable and path hidden. The http:// URL is
blocked with the reason shown.

### AC-17 — Withdrawn.

This criterion verified the test send, which FR-11 no longer requires. It is left in place rather
than renumbered so that references to AC-18 onward still resolve. What it was for is covered twice
over: AC-18 catches a recipe missing $$MessageID before it reaches CleverTap, and AC-5 catches a
live connection whose traffic is arriving without one. Neither can report success against a
CleverTap configuration that was never saved, which is the false pass the test send could produce.

### AC-18 — An edited recipe is validated before it leaves the page (verifies FR-11)

**Given:** The connection screen with the recipe editable.

**Steps:** 1. Remove $$MessageID and attempt to leave. 2. Remove $$To and attempt to leave. 3.
Remove $$TemplateID and attempt to leave. 4. Remove the sender_id line and attempt to leave. 5.
Break the JSON and attempt to leave.

**Expected result:** Each is caught with a specific message naming what is missing and why it
matters. None of the five reaches CleverTap, where it would fail at send time instead.

### AC-19 — Clicks reach CleverTap with the right URL (verifies FR-12)

**Given:** A campaign with a tracked link, and click tracking enabled.

**Steps:** 1. Tap the link on a test device. 2. Inspect the callback. 3. Open the CleverTap
campaign stats.

**Expected result:** The device opens the destination without perceptible delay. The clicked event
carries the client’s original URL in url, not our tracking link, with the shortened form in
shorturl. CleverTap shows the click and a click-through rate.

### AC-20 — Replies and opt-outs land in both systems (verifies FR-13)

**Given:** A campaign and a recipient who replies STOP.

**Steps:** 1. Send the reply. 2. Check the CleverTap profile. 3. Check the Pi Commerce opt-out
register. 4. Target the same user again.

**Expected result:** A Notification Replied event appears on the CleverTap profile with the text.
The number is on the Pi Commerce opt-out register for that sender. The second campaign does not
reach them.

### AC-21 — Analytics recover what the error mapping loses (verifies FR-14)

**Given:** A completed campaign of at least 50,000 messages with mixed failures.

**Steps:** 1. Open Analytics with the source filter set to CleverTap SMS. 2. Compare against the
CleverTap campaign report. 3. Request a recipient-level report and find one failed user.

**Expected result:** Delivered and failed counts reconcile within tolerance. The Pi Commerce view
carries the upstream original error text that CleverTap’s code does not. The recipient report row
shows the message identifier, campaign identifier, mapped code and original error.

---

## 6. External dependencies and who to contact

Unlike the WebEngage integration, nothing here is gated on a partner accepting us. The
dependencies are one internal decision, one procurement question, and a short list of
documentation ambiguities.

### 6.1 Internal — Product and Commercial

The §2.2 question is the gate on this entire document. Whether Pi Commerce sells SMS, and on what
terms, decides whether Epic A is a small enabling piece of work on existing capability or the tail
end of a much larger strategic commitment. It should be answered before engineering is scheduled,
not during it.

### 6.2 Upstream SMS partner (or route owner)

Three questions, each of which changes a requirement:

1. Is pre-dispatch DLT validation available on the route, and at what latency? Decides whether
   FR-6 catches a template mismatch before send or only reports it afterwards.

2. What is the route’s full error taxonomy, and how does it map onto CleverTap’s twenty codes?
   FR-9 is only as good as this mapping, and the proportion falling to code 900 is the measure of
   it.

3. Can a Pi Commerce click tracking domain be whitelisted against a client’s DLT entity? If not,
   FR-12 is unavailable on Indian traffic and must be stated as such rather than shipped.

### 6.3 CleverTap — documentation clarifications

None of these block a build, but each is currently being resolved by picking the safer reading,
and each is cheaper to ask than to discover in production:

| # | Question | Affects |
|---|---|---|
| 1 | Is the maximum batch size 100 or 1,000? The documentation states both. | FR-2, FR-5 |
| 2 | Is the short URL key `shorturl` or `shortUrl`? The documentation uses both. | FR-8, FR-12 |
| 3 | What is the request timeout on the Generic SMS endpoint, and is a timed-out batch retried whole? | FR-4, NFR-1 |
| 4 | Does CleverTap publish stable egress addresses for the SMS channel? | FR-3 |
| 5 | Does error code 911 exist? The published list skips it. | FR-9 |
| 6 | Is there a per-provider or per-account send rate limit on the SMS channel? | NFR-2 |

CleverTap’s Generic SMS documentation is self-service with no partner onboarding path, so these go
through the client’s own CleverTap account team or standard support rather than a provider
channel.

---

## 7. Open Questions

### Q1 — Does Pi Commerce sell SMS, and should it?

Per §2.2 this is the only question that decides whether the rest of this document is actionable.
The integration itself is small and self-serve, which makes it attractive if the capability exists
and a poor reason to build the capability if it does not. The margin, the DLT operational load,
and the accountability for delivery outcomes we do not control all belong in that decision.

### Q2 — What does the upstream route pass through?

FR-8 and FR-9 promise CleverTap a granular event stream — delivered, failed with a specific code,
clicked, replied. Every one of those depends on what the aggregator returns to us. A route that
reports only submitted and delivered reduces this integration to a fraction of its value, and that
is a procurement criterion rather than a build detail. It should be settled before Epic A, not
discovered during it.

### Q3 — Should Pi Commerce also take WebEngage SMS and RCS?

WebEngage publishes Service Provider contracts for both, structurally similar to its WhatsApp one,
and its SMS status code vocabulary overlaps heavily with what FR-9 already builds here. If the
answer to Q1 is yes, the marginal cost of covering WebEngage SMS is low and the two should be
scoped together rather than sequentially. This is recorded in the WebEngage PRD as its own Q6.

### Q4 — Is MoEngage SMS now in scope?

MoEngage’s custom connector is SMS-only, which made it the wrong answer when the question was
WhatsApp. If Pi Commerce commits to SMS, that changes: MoEngage becomes reachable through a
mechanism that is already documented and needs no partnership. The three platforms would then be
covered on SMS while only two are covered on WhatsApp, which is close to the inverse of where this
scoping exercise started.

### Q5 — How is DLT support staffed?

Per §2.5, six of CleverTap’s twenty error codes are DLT-specific and they will be the majority of
the support load. Whether that sits with platform support, a dedicated messaging operations
function, or the upstream partner is a resourcing question that should be answered before the
first client onboards rather than after the first campaign is blocked.

### Q6 — Does a client running WhatsApp and SMS through Pi Commerce want a combined view?

FR-14 adds CleverTap SMS as a traffic source alongside the existing ones, which lets a client see
each separately. What is untested is whether they want one funnel across channels for a single
campaign. Worth asking the first client to configure both.

---

## 8. Validation Notes — CleverTap Documentation

Generic SMS is a flexible HTTP integration. CleverTap allows GET or POST, JSON/key-value payloads,
optional batching, headers, and No Authentication, Basic Authentication or OAuth 2.0.

CleverTap currently documents a maximum of 1,000 records in a single batch. The PRD therefore
treats 1,000 as the documented platform limit; any lower Pi Commerce batch default is an
operational choice.

CleverTap’s current SMS troubleshooting documentation specifies a 15-second Generic SMS
connection-request timeout and zero retries. Pi Commerce must therefore acknowledge requests
within that window and must not assume CleverTap will retry failed send requests.

CleverTap documents six system dynamic replacements: $$To, $$Body, $$TemplateID,
$$TemplateVariables, $$CampaignID and $$MessageID. Custom dynamic replacements are also supported.

For DLR/click/reply tracking, $$MessageID must be returned unchanged in callback meta. CleverTap
documents delivered, failed, clicked and replied callback event types. CleverTap recommends
retrying callback submissions after HTTP 5xx responses with exponential backoff because callback
requests are not deduplicated. This is distinct from outbound SMS request retry behaviour.

CleverTap documentation currently uses both shortUrl and shorturl in callback material. Pi
Commerce should retain serializer compatibility until CleverTap confirms the canonical spelling.

DLT validation, SMS-route error mapping, click-tracking infrastructure, inbound reply correlation,
credential lifecycle, idempotency, queueing and analytics are Pi Commerce/upstream design
decisions unless explicitly required by CleverTap.
