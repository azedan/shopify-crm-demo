# Shopify CRM Demo

A lightweight CRM that runs embedded inside Shopify admin. It answers one
question: **"tell me everything about this person before I talk to them."**

**Built as a demo for the [eCommerceFuel](https://www.ecommercefuel.com/) (ECF)
community.**

> ### ⚠️ Demo software — use at your own risk
>
> This was built to show ECF members one way to approach a CRM layer on top of
> Shopify. **It is a demo, not a product.**
>
> - Not on the Shopify App Store, and not submitted for review
> - No billing, no support, no maintenance commitment
> - Not audited for security, privacy, or GDPR compliance
> - Its data is entirely fake and local — it is not wired to any real store
>
> If you run it, adapt it, or ship anything derived from it, **you do so
> entirely at your own risk.** Provided as-is, without warranty of any kind.
> Neither the author nor eCommerceFuel is liable for anything that results from
> its use. Review it yourself before it goes anywhere near a real storefront or
> real customer data.
>
> eCommerceFuel is credited as the audience this was made for. That is not an
> endorsement, affiliation, or review by ECF.

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

> ### ⚠️ Read this before adapting it: there is no tenant scoping
>
> `Customer`, `Order`, `Interaction`, and `LifecycleEvent` have **no `shop`
> column**. Only the template's `Session` model is shop-scoped. Every read and
> the single write address rows by id alone, without checking the row belongs to
> the authenticated shop.
>
> That is fine for what this is — a single dev store with fake local data — and
> it is a deliberate scoping decision, not an oversight. But if you point this at
> real data or install it on more than one shop, **any authenticated shop could
> read or write any other shop's customers.**
>
> Making it multi-tenant means adding `shop` to each model, backfilling it,
> indexing it, and filtering on it in every query in `queries.server.ts` and
> `interactions.server.ts`. That is real work, not a config flag. Do it before
> the app touches anything real.

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

Two things worth knowing before you run it:

- **The seed's "now" is pinned to 2026-08-31.** Relative times on the screens
  are computed against the real clock, so they decay as real time passes. Bump
  `NOW` in `prisma/seed.ts` and re-seed if you are demoing much later.
- **`npm run dev` has not been exercised on this branch** — see Status below.

## Design docs

This project was designed before it was built, and both documents are in the
repo:

- [Design spec](docs/superpowers/specs/2026-08-31-shopify-crm-demo-design.md) —
  what it is and why, including the decisions log
- [Implementation plan](docs/superpowers/plans/2026-08-31-shopify-crm-demo.md) —
  eight test-first tasks

## Status

Feature-complete against the design spec. The schema and migration, the
timeline merge, the derived stats, the seed generator, both screens, and the
single write path are all built. The 27-test suite passes (`npm test`),
`npm run lint` is clean, and `npx tsc --noEmit` reports only one pre-existing
template type clash in `app/shopify.server.ts` (the scaffold ships two copies of
`@shopify/shopify-api`).

**Verified running in Shopify admin.** It has been booted under
`shopify app dev` against a real dev store and walked end to end: the customer
list renders and sorts, search filters, a customer's merged timeline shows
orders and interactions interleaved with the correct filled/hollow source
markers, and logging an interaction writes it and surfaces it at the top of the
feed immediately.

One note if you run it yourself: `shopify app dev`'s default Cloudflare quick
tunnel proved unreliable here — the app loaded once and then stopped receiving
requests entirely, with no error on either side. `shopify app dev --use-localhost`
avoids tunnels altogether and worked immediately. It needs `mkcert` installed
(`brew install mkcert && mkcert -install`) and certs generated into `.shopify/`:

```bash
mkcert -key-file .shopify/localhost-key.pem -cert-file .shopify/localhost.pem localhost 127.0.0.1 ::1
shopify app dev --use-localhost
```

Localhost mode is incompatible with webhook subscriptions, since Shopify has to
reach those from outside. This app declares two inherited from the template and
uses neither meaningfully, so comment them out of `shopify.app.toml` while using
localhost mode.

## License

MIT — full text in [LICENSE](LICENSE).

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
