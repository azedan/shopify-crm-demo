# Shopify CRM Demo — Design

**Date:** 2026-08-31
**Status:** Draft — awaiting review
**Destination:** Demo / proof-of-concept

## Purpose

A lightweight CRM that runs embedded inside Shopify admin. It answers one
question: **"tell me everything about this person before I talk to them."**

Shopify admin already lists customers and their orders. This app earns its place
by merging orders, team interactions, and lifecycle events into a single sorted
timeline per customer — one place where the whole relationship is legible.

This is a demo, not a product. No billing, no App Store review, no GDPR webhook
handlers, no multi-tenancy beyond what the template provides.

## Core Architecture Decision

The app is **embedded in Shopify admin, but its data never comes from Shopify.**

Those two facts sit in tension on first reading, so state the reasoning plainly:
the embedding is what makes the demo convincing, and the local data is what makes
it reliable. Every customer, order, and timeline row is seeded into a local
database. The app never calls the Shopify Admin API for CRM data.

This buys three things:

1. **The demo is deterministic.** It looks identical on every run, regardless of
   dev store state, API rate limits, or whether last week's seed survived.
2. **Lifecycle and marketing events are free.** Sourced from Shopify they would
   each need a webhook subscription or a separate query. Seeded, they are just
   rows. This removes the only expensive item in the timeline scope.
3. **There is almost no failure surface.** No network calls means no timeouts,
   no rate limits, no token expiry to handle.

The app still authenticates and embeds normally — it uses the real OAuth flow and
runs in the real admin iframe. Only the CRM data is local.

## Stack

Scaffolded with the official Shopify Remix template (`shopify app init`), which
provides OAuth, session storage, App Bridge, and Polaris configured on day one.
Building the embedding by hand would be work done twice.

The template ships Prisma for session storage. **Verify the exact datastore at
scaffold time** and add the CRM tables to that same schema rather than
introducing a second persistence layer. If the template's default has changed,
match whatever it ships — do not fight it.

## Data Model

Four tables. Only one is written at runtime.

```
Customer
  id, firstName, lastName, email, phone, city, region,
  createdAt, marketingConsent (bool)

Order                                     — seeded, read-only
  id, customerId, orderNumber, total, currency, itemCount,
  placedAt        (required)
  fulfilledAt     (nullable)
  deliveredAt     (nullable)
  refundedAt      (nullable)
  refundAmount    (nullable)
  cancelledAt     (nullable)

Interaction                               — seeded AND written at runtime
  id, customerId,
  type            ('call' | 'email' | 'dm' | 'note')
  body            (nullable, max 2000 chars)
  outcome         (nullable, max 80 chars, free text)
  author          (string)
  occurredAt

LifecycleEvent                            — seeded, read-only
  id, customerId,
  kind            ('account_created' | 'consent_granted'
                   | 'consent_revoked' | 'abandoned_checkout')
  amount          (nullable — used by abandoned_checkout)
  occurredAt
```

### Notes on the model

**`Interaction.type` includes `note`.** Free-text notes are not a separate
concept — a note is an untyped interaction with a body and no outcome. One table,
one code path.

**One `Order` row expands into multiple timeline events.** An order that was
placed, fulfilled, delivered, and later partly refunded produces four timeline
entries from a single row via its nullable timestamps. This keeps the schema at
four tables and puts the expansion logic inside the pure function where it can be
tested directly.

**Invariant: `cancelledAt` is mutually exclusive with `fulfilledAt`,
`deliveredAt`, and `refundedAt`.** An order is either cancelled or it progresses;
it never does both. This caps expansion at four events per order and makes
"countable orders" unambiguous. The seed generator must uphold it, and
`buildTimeline` may assume it.

**`Interaction.author`** is a display string. Seeded interactions carry plausible
names; interactions created at runtime are attributed to `"You"`. The demo has no
user identity model and does not need one.

### Derived stats

The seed data contains refunds and cancellations, so these need exact
definitions — "lifetime value" has several defensible readings and the list and
sidebar must agree on one.

Let **countable orders** = all orders where `cancelledAt IS NULL`. Cancelled
orders are excluded from every stat; they still appear on the timeline.

| Stat | Definition |
|---|---|
| Lifetime value | `sum(total) - sum(refundAmount)` over countable orders — net of refunds |
| Order count | Number of countable orders |
| Average order value | `lifetimeValue / orderCount`, or `0` when `orderCount` is `0` |
| Customer since | `Customer.createdAt` |
| Last activity | Timestamp of the newest timeline event, whatever its source |

Lifetime value is net of refunds because a refund-heavy customer who looks
valuable on gross revenue is exactly the misreading this screen should prevent.

## The Timeline

The timeline is **derived at read time, never stored.**

`buildTimeline(customerId)` reads orders, interactions, and lifecycle events,
expands and normalizes each into a common shape, and returns them merged and
sorted:

```
TimelineEvent {
  id        string      // stable, e.g. "order:1481:delivered"
  source    'shopify' | 'crm'
  type      string      // 'order_placed', 'interaction_call', ...
  timestamp Date
  title     string
  detail    string?
}
```

Two consequences, both desirable:

- **Writes stay trivial.** Logging an interaction is one insert. It appears on
  the timeline immediately because the merge happens on read. There is no
  materialized timeline to keep in sync and no way for it to drift.
- **The core logic is a pure function over three arrays.** It is testable with no
  database at all, which is where the test effort concentrates.

### Sort order

Sorted by `timestamp` descending. **When timestamps collide** — which the seeded
data will certainly produce, since an order can be placed and paid in the same
second — ties break deterministically:

1. `timestamp` descending
2. then source-type priority: order events, then lifecycle events, then interactions
3. then `id` ascending

Without rule 2 and 3, ordering would depend on array iteration order and the UI
would shuffle between renders.

### Source distinction

Each event carries `source`, assigned as follows:

| Event origin | `source` | Marker |
|---|---|---|
| Order events (placed, fulfilled, delivered, refunded, cancelled) | `shopify` | Filled |
| Lifecycle events (account created, consent, abandoned checkout) | `shopify` | Filled |
| Interactions (call, email, dm, note) | `crm` | Hollow |

The split is **what Shopify would already know** versus **what only this app
knows**. Both order and lifecycle events would come from the Admin API in a real
build; interactions exist nowhere but here.

That makes the hollow markers precisely the value this app adds, which states the
product's central claim — *we add a layer on top of Shopify* — without narration.
It costs nothing to render and it is the clearest thing on the screen.

## Screens

Two screens. The template's index route redirects to the customer list.

### 1 · Customer list

Polaris `IndexTable`. Columns: name, email, lifetime value, order count, last
activity (relative — "2 days ago").

- Search filters by name or email
- Sortable by last activity or lifetime value
- Defaults to last activity descending, so the most recently active customer
  is on top
- Row click navigates to detail

### 2 · Customer detail

Two-column layout matching Shopify's own customer page — primary content left,
metadata sidebar right. Chosen because it reads as native to anyone who knows the
admin, which is the point of an embedded demo.

**Left column:**
- Log-interaction form (type select + body field + submit), above the feed
- The timeline

**Right sidebar:**
- Contact: email, phone, city/region
- Value: lifetime total, order count, average order value, customer since
- Consent: subscribed / not subscribed

**Timeline rendering** dispatches one component per event `type`. An order row
shows order number and status; an interaction row shows type, outcome, and body;
a lifecycle row shows the event. Adding a fifth event type later means one new
component and one new case — the merge logic is untouched.

## Write Path

**The application has exactly one write path.** Submit the interaction form → insert
one `Interaction` row → the Remix loader revalidates → the event appears at the
top of the timeline.

Nothing else in the demo mutates data. Everything else is read-only over seeded
rows. This keeps the surface area for bugs proportional to a demo.

## Seed Data

A script generates ~60 customers across five archetypes so the list has visible
texture rather than uniform noise:

| Archetype | Shape |
|---|---|
| VIP repeat buyer | High order count, high LTV, recent activity, several interactions |
| Steady regular | Moderate orders at regular intervals, few interactions |
| One-time buyer | Single order, sparse timeline |
| Churn risk | Good history, then a long gap; often an abandoned checkout near the end |
| Refund-heavy | Several orders with refunds, more support interactions |

Each customer gets a plausible order history with interactions and lifecycle
events threaded through it at realistic intervals.

**The generator uses a fixed RNG seed.** Re-seeding produces byte-identical data.
A demo that looks different on every run cannot be rehearsed, and stable data
makes test fixtures free.

## Testing

Test-first, per the project's TDD practice.

`buildTimeline` carries the test weight, because it holds the real logic and needs
no database:

- Merge order across all three sources
- **Tie-breaking when timestamps collide** — the rule above, asserted explicitly
- Expansion of one `Order` row into its 1–4 constituent events, including orders
  that were cancelled before fulfilment and orders refunded after delivery
- Normalization of each event type into the common shape
- Empty case: a customer with no orders, interactions, or events

Derived stats get their own tests, one per rule in the definitions above:

- Lifetime value is net of refunds, not gross
- Cancelled orders are excluded from lifetime value, order count, and average
  order value — but still appear on the timeline
- Average order value returns `0` rather than dividing by zero when a customer
  has no countable orders
- A customer whose only order was cancelled reports `0 / 0 orders`, not a crash

One integration test covers the single write path: submit an interaction, assert
it appears at the top of the returned timeline.

## Error Handling

Deliberately thin, because the failure surface is genuinely small. No Admin API
means no network errors, no rate limits, no token expiry.

What remains:

- **Unknown customer ID** → Polaris `EmptyState` with a route back to the list
- **Interaction form validation** → type is required; body capped at 2000 chars;
  outcome capped at 80. Surfaced as inline Polaris field errors.

Padding this section with speculative handling would misrepresent the system.

## Dev Loop

`shopify app dev` runs as a Solo-managed process. Its output carries the tunnel
and preview URLs, so they are read from the process rather than hunted for, and
`wait_for_bound_port` confirms the server is actually listening before anyone
claims the app works.

## Out of Scope

Cut deliberately. Each of these is a plausible addition that would make the demo
worse by diluting it:

- **Dashboard or analytics screen** — the pitch is "open a customer, know
  everything." A chart screen pulls attention away from the one screen that
  matters.
- Tags, custom fields, saved views, bulk actions, CSV export
- Follow-up pipeline, stages, tasks, due dates
- RFM or churn scoring
- Any write back to Shopify (tags, metafields)
- Billing, App Store review requirements, GDPR webhook handlers
- Real Admin API reads

## Decisions Log

| Decision | Chosen | Rejected |
|---|---|---|
| Destination | Demo / PoC | Public App Store app; single-store custom app |
| Core job | Customer 360 + timeline | Follow-up pipeline; scoring; bare interaction logging |
| Surface | Embedded in admin | Standalone web app |
| Data source | Fully local mock | Seeded dev store; Shopify sample data |
| Scaffold | Official Remix template | Plain Remix + Polaris, no Shopify deps |
| Detail layout | Timeline left, sidebar right | Profile left; stat-header + full-width timeline |
| Timeline storage | Derived at read time | Materialized timeline table |
| Notes | `note` as an interaction type | Separate notes table |
