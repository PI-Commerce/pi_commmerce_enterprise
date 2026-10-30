# CleverTap Generic SMS — what the send API still needs

The connector's payload recipe (`src/lib/clevertap-sms.ts`, `smsRecipe`) is now written against
the real send endpoint:

```
POST https://api.picommerce.paytm.com/v1/messages/sms/send
```

Five of the things it does are not supported by that endpoint today. Each one is invisible from the
UI — the recipe pastes cleanly, CleverTap accepts it, and the failure shows up later as something
other than a configuration error — so they are listed here rather than left to be discovered.

## 1. `recipients[].message_id` — accept it and echo it back · **blocking**

CleverTap substitutes an opaque identifier into `$$MessageID` per recipient. It must come back
verbatim on every delivery callback, because it is the only key CleverTap has for matching a callback
to the message it sent.

Without it the integration sends perfectly and reports nothing: a campaign shows zero delivered
against a full send, permanently, with no error on either side. Nothing else on this list can fail
this quietly, and nothing else blocks go-live.

## 2. Basic auth, scoped per connection

The endpoint takes `Authorization: Bearer <api key>` today. CleverTap's provider form offers only
No Auth, Basic and OAuth 2.0, so the CleverTap lane issues a per-connection Basic credential
(`username` / `password`, with rotation and a grace window) and the endpoint has to accept both
schemes.

Scoping matters as much as the scheme. A credential is registered against a set of sender IDs, and a
request whose `sender_id` falls outside that set must be rejected — otherwise one leaked credential
can send promotional traffic from a transactional header, which is a DLT compliance problem rather
than a delivery one.

## 3. `variables` — accept CleverTap's serialisation, and resolve names from `template_id`

A direct caller sends an object of named values:

```json
"variables": { "name": "Asha", "order_id": "PI-4471" }
```

CleverTap cannot. It exposes one opaque `$$TemplateVariables` token and has no way to emit our key
names, so the CleverTap lane sends whatever CleverTap serialises into that token. The endpoint needs
to accept that form alongside the object, map the values onto the template's named variables using
the DLT-panel mirror keyed on `template_id`, and **reject a count mismatch before send** rather than
substituting a partial set.

## 4. `campaign_id` — accept and store it for correlation

The API mints its own campaign and run for every send. `$$CampaignID` is therefore a foreign key to
record, not a campaign to create. Without it there is no way to get from a CleverTap campaign to the
Pi run it produced, which is the first thing anyone asks when a campaign's numbers look wrong.

## 5. Batch cap of 100 — enforce it with an error, never truncate

CleverTap's provider page says a batch may hold 1,000 records; a sample elsewhere in the same
documentation says 100. The connector configures 100 and tells the client that ours is the limit that
binds. The endpoint has to make that true by rejecting a larger batch with an error naming the limit.
Truncating instead is worse than failing: the surplus recipients are indistinguishable from a
delivery failure on CleverTap's side.

## 6. Accept a flattened body as well as a batched one

Batching is configured entirely on CleverTap's side, by naming a batch key on their provider form.
Name `recipients` and CleverTap packs up to 100 records into that array; leave it blank and it sends
one request per recipient.

What is *not* established is what the blank case puts on the wire. Either it wraps the single record
in the named array — in which case the two modes are byte-identical and there is nothing to do — or
it flattens the record to the top level and sends no `recipients` key at all, which the endpoint
rejects today. Until that is answered (see below), the endpoint should **accept both**: a body
carrying a `recipients` array, and a flattened single-record body, distinguished by the presence of
the array.

The cost of supporting the flattened form and finding it unnecessary is one dead branch. The cost of
not supporting it and finding it necessary is that every unbatched connection fails on its first
send. The second is the more expensive way to be wrong.

---

# Open questions

Three things that cannot be answered from either the CleverTap PRD or the send API, and that were
deliberately not guessed.

## `$$TemplateVariables` serialisation is undocumented

CleverTap's documentation describes the token as "Template variable values" and does not say whether
it emits a JSON array, a delimited string, or an object. It is also absent from the PRD's own list of
open questions, which means nobody has asked yet. **Ask CleverTap.**

If the answer is "positional, in template order", then a DLT template whose variables are reordered
in the panel will silently swap values between fields while every send reports success. That is the
same class of failure as a missing `$$MessageID` — correct-looking output, no error anywhere — and
warrants the same treatment: detect it, don't document it.

## `$$Body` has no field to go to

The API has no field for a pre-rendered message body; every send names a registered `template_id`.
The connector's recipe therefore carries no `body` key.

That leaves **AC-12** — international traffic, which has no DLT template and needs to send a rendered
body — with no expressible payload on this lane. Either the endpoint gains a `body` field that is
valid when `template_id` is absent, or AC-12 is explicitly out of scope for CleverTap SMS.

Do not add a `body` key to the recipe on the strength of the acceptance criterion alone. An earlier
version of this connector carried `body`, `entity_id` and `encoding` on exactly that reasoning —
fields inferred from a PRD rather than from the API — and all three were silently ignored by an
endpoint that had never been checked.

## What does CleverTap send when no batch key is configured?

The PRD asserts both that batching "follows the payload shape" and that it is switched on by a batch
key name on CleverTap's form. Those are the same mechanism described from opposite ends, and neither
statement answers the only question that matters here: with the batch key left blank, does CleverTap
send `{"recipients": [ … ]}` with one element, or does it flatten the record to the top level?

This connector assumes the array. **Ask CleverTap**, because the assumption is unverified and it is
what ask 6 above exists to cover.

It also decides whether that ask can ever be closed out. If CleverTap always wraps, the flattened
branch is dead code and can be dropped; if it flattens, the branch is load-bearing for every
unbatched connection. Until someone asks, the endpoint carries both — which is the correct trade,
but it is a trade being made in the absence of an answer rather than because of one.
