# Shopify CRM Demo

A lightweight CRM that runs embedded inside Shopify admin. It answers one
question: **"tell me everything about this person before I talk to them."**

Built as a demo for the [eCommerceFuel](https://www.ecommercefuel.com/) community.

> **This is a demo, not a product.** It is not on the Shopify App Store, it has
> no billing, and it is not intended for production use on a real store.

## What it does

Shopify admin already lists customers and their orders. This app earns its place
by merging three sources into a single sorted timeline per customer:

- **Orders and fulfillment** — placed, fulfilled, delivered, refunded, cancelled
- **Logged interactions** — calls, emails, DMs, and notes your team records
- **Lifecycle events** — account created, marketing consent, abandoned checkout

Filled markers on the timeline are events Shopify would already know about.
Hollow markers are the ones only this app knows. That distinction is the whole
pitch, rendered visually.

## The part worth understanding

**The app is embedded in Shopify admin, but its data never comes from Shopify.**

Those two facts pull against each other on first reading. The embedding is what
makes the demo convincing; the local data is what makes it reliable. Every
customer, order, and event is seeded into a local SQLite database, and the app
never calls the Shopify Admin API for CRM data.

That buys three things:

1. **The demo is deterministic.** Identical on every run, regardless of dev store
   state, API rate limits, or whether last week's seed survived. The seed script
   uses a fixed RNG and explicit row ids, so re-seeding is byte-identical.
2. **Lifecycle events are free.** Sourced from Shopify they would each need a
   webhook subscription or a separate query. Seeded, they are just rows.
3. **There is almost no failure surface.** No network calls means no timeouts,
   no rate limits, no token expiry.

If you are adapting this for real use, that is the seam to cut: replace the query
layer in `app/crm/queries.server.ts` with Admin API calls and keep everything
else. The timeline merge is a pure function over plain records and does not care
where they came from.

## Stack

Remix, Shopify App Bridge, Polaris, Prisma + SQLite, Vitest, TypeScript.

**A note on Remix:** Shopify's current default template is React Router, since
Remix v2 became React Router v7. This project deliberately uses Shopify's pinned
Remix template — the design predates the rename and its code is written against
Remix APIs. For a new project of your own, prefer
[the React Router template](https://github.com/Shopify/shopify-app-template-react-router).

## Getting started

Requires Node 20+ and the Shopify CLI.

```bash
npm install
npx prisma migrate dev
npx prisma db seed     # ~60 customers across five archetypes
npm run dev            # runs `shopify app dev`
```

The seed generates VIP repeat buyers, steady regulars, one-time buyers, churn
risks, and refund-heavy customers, so the list has visible texture rather than
uniform noise.

## Design docs

This project was designed before it was built, and both documents are in the
repo:

- [Design spec](docs/superpowers/specs/2026-08-31-shopify-crm-demo-design.md) —
  what it is and why, including the decisions log
- [Implementation plan](docs/superpowers/plans/2026-08-31-shopify-crm-demo.md) —
  eight test-first tasks

## Status

Under construction. The scaffold and database schema are in place; the timeline
merge, seed data, and UI are being built out task by task against the plan above.

## License

MIT
