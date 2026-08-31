# Shopify CRM Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight CRM embedded in Shopify admin that shows every customer's orders, interactions, and lifecycle events on one merged timeline, served entirely from local seeded data.

**Architecture:** The official Shopify Remix template provides OAuth, App Bridge, and Polaris. Four Prisma tables hold seeded CRM data. The timeline is derived at read time by a pure function over plain TypeScript records — no materialized timeline table, no Admin API calls. Two routes: a customer list and a customer detail page. Exactly one write path in the entire app.

**Tech Stack:** Remix, Shopify App Bridge, Polaris, Prisma, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-08-31-shopify-crm-demo-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Node 20 or newer** — required by the Shopify CLI.
- **All money is integer cents.** `totalCents`, `refundAmountCents`, `amountCents`. Never floats, never a `Decimal` type. Format for display only at the component boundary.
- **All timestamps are stored and compared in UTC.**
- **The app never calls the Shopify Admin API for CRM data.** Not for customers, orders, or events. If a task seems to need it, the task is wrong.
- **UI is Polaris components only.** No hand-rolled CSS files, no other component library.
- **Order invariant:** `cancelledAt` is mutually exclusive with `fulfilledAt`, `deliveredAt`, and `refundedAt`. The seed generator upholds it; `buildTimeline` may assume it.
- **Seed RNG is fixed at `20260831`, and every seeded row gets an explicit id.**
  Re-seeding must produce byte-identical data. Seeded rows must never fall
  through to Prisma's `cuid()` default — the timeline breaks timestamp ties by
  id, so random ids would reorder the timeline between reseeds while every
  monetary total stayed identical. Only runtime-created interactions use `cuid()`.
- **Timeline sort:** `timestamp` descending, then source priority (order `0`, lifecycle `1`, interaction `2`), then `id` ascending.
- **Stats:** countable orders are those with `cancelledAt === null`. Lifetime value is net of refunds. Average order value returns `0` when there are no countable orders.

---

### Task 1: Scaffold the app and define the CRM schema

**Files:**
- Create: the whole app via `shopify app init` (creates `package.json`, `app/`, `prisma/schema.prisma`, etc.)
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/` (generated)

**Interfaces:**
- Consumes: nothing — this is the foundation task.
- Produces: Prisma client models `Customer`, `Order`, `Interaction`, `LifecycleEvent`, importable via `import prisma from "../db.server"`. Field names exactly as written in Step 2.

- [ ] **Step 1: Scaffold the Shopify app**

**This step needs a human at the terminal.** `shopify app init` prompts for Shopify login, an organization, and an app name — these cannot be passed as flags.

Run from the repo root:

```bash
npm init @shopify/app@latest -- --template remix
```

When prompted: name the app **`crm-app`** (not `shopify-crm-demo` — a predictable
subdirectory name that cannot collide with the repo root), choose your dev
organization, and let it create a new app.

The template installs into `crm-app/`. Move it to the repo root with these exact
steps — the repo is public and already has history, so none of this is optional:

```bash
SCAFFOLD=crm-app
test -d "$SCAFFOLD" || { echo "No $SCAFFOLD/ — use the directory the template actually created"; exit 1; }

# 1. Drop the nested git repo. This repo already has history and a remote.
rm -rf "$SCAFFOLD/.git"

# 2. Merge the two .gitignore files as a union, template first.
#    A plain move would CLOBBER ours, un-ignoring .superpowers/ — which
#    Step 5's `git add -A` would then push to a public repo.
{
  cat "$SCAFFOLD/.gitignore"
  echo
  echo "# --- project ---"
  cat .gitignore
} > .gitignore.merged
mv .gitignore.merged .gitignore
rm -f "$SCAFFOLD/.gitignore"

# 3. Move everything up, dotfiles included. tar rather than `mv *`,
#    which silently skips dotfiles unless dotglob is set.
(cd "$SCAFFOLD" && tar cf - .) | tar xf -
rm -rf "$SCAFFOLD"
```

Verify the scaffold landed **and that nothing sensitive became committable**:

```bash
ls app/routes/app._index.tsx prisma/schema.prisma
grep '"@shopify/polaris"' package.json
git check-ignore -q .superpowers/ && echo "OK .superpowers ignored" || echo "FAIL .superpowers NOT ignored"
git check-ignore -q .env         && echo "OK .env ignored"         || echo "FAIL .env NOT ignored"
```

Expected: both files exist, Polaris appears in dependencies, and **both
`check-ignore` lines print OK.** If either prints FAIL, stop and fix `.gitignore`
before Step 5 — `.env` holds your Shopify API secret and this repo is public.

- [ ] **Step 2: Add the four CRM models to the Prisma schema**

Append to `prisma/schema.prisma`, leaving the template's existing `Session` model untouched:

```prisma
model Customer {
  id                String   @id @default(cuid())
  firstName         String
  lastName          String
  email             String   @unique
  phone             String?
  city              String
  region            String
  marketingConsent  Boolean  @default(false)
  createdAt         DateTime

  orders            Order[]
  interactions      Interaction[]
  lifecycleEvents   LifecycleEvent[]
}

model Order {
  id                String    @id @default(cuid())
  customerId        String
  orderNumber       String
  totalCents        Int
  currency          String    @default("USD")
  itemCount         Int
  placedAt          DateTime
  fulfilledAt       DateTime?
  deliveredAt       DateTime?
  refundedAt        DateTime?
  refundAmountCents Int?
  cancelledAt       DateTime?

  customer          Customer  @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@index([customerId])
}

model Interaction {
  id          String   @id @default(cuid())
  customerId  String
  type        String
  body        String?
  outcome     String?
  author      String
  occurredAt  DateTime

  customer    Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@index([customerId])
}

model LifecycleEvent {
  id          String   @id @default(cuid())
  customerId  String
  kind        String
  amountCents Int?
  occurredAt  DateTime

  customer    Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@index([customerId])
}
```

`type` and `kind` are plain strings because the template's datasource is SQLite, which has no native enum support. The domain types in Task 2 constrain them at the TypeScript boundary.

- [ ] **Step 3: Generate the migration**

```bash
npx prisma migrate dev --name add_crm_tables
```

Expected: a new directory under `prisma/migrations/`, and "Your database is now in sync with your schema."

- [ ] **Step 4: Verify the client has the models**

```bash
npx prisma generate
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();console.log(typeof p.customer.findMany, typeof p.order.findMany, typeof p.interaction.findMany, typeof p.lifecycleEvent.findMany)"
```

Expected: `function function function function`

- [ ] **Step 5: Commit**

Re-check the ignores first. `git add -A` on a public repo is the point of no
return, and Step 1's merge is the only thing standing between you and a
committed `.env`:

```bash
git check-ignore -q .superpowers/ && git check-ignore -q .env \
  && echo "safe to add" \
  || { echo "STOP — fix .gitignore before committing"; exit 1; }

git add -A
git status --short | head -20   # eyeball this: no .env, no .superpowers/
git commit -m "feat: scaffold Shopify app and add CRM schema"
```

---

### Task 2: Domain types and the timeline merge

This is the core of the application. It is a pure function over plain objects with no database and no Remix involvement, so it gets the heaviest test coverage.

**Files:**
- Create: `app/crm/types.ts`
- Create: `app/crm/timeline.ts`
- Test: `app/crm/timeline.test.ts`
- Modify: `package.json`, `vitest.config.ts`

**Interfaces:**
- Consumes: nothing from other tasks — deliberately decoupled from Prisma.
- Produces:
  - `TimelineEvent` — `{ id: string; source: 'shopify' | 'crm'; type: string; timestamp: Date; title: string; detail?: string }`
  - `OrderRecord`, `InteractionRecord`, `LifecycleRecord` — input interfaces that Prisma's generated row types structurally satisfy
  - `buildTimeline(orders: OrderRecord[], interactions: InteractionRecord[], lifecycle: LifecycleRecord[]): TimelineEvent[]`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Write the domain types**

Create `app/crm/types.ts`:

```ts
export type TimelineSource = "shopify" | "crm";

export type InteractionType = "call" | "email" | "dm" | "note";

export type LifecycleKind =
  | "account_created"
  | "consent_granted"
  | "consent_revoked"
  | "abandoned_checkout";

export interface TimelineEvent {
  id: string;
  source: TimelineSource;
  type: string;
  timestamp: Date;
  title: string;
  detail?: string;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  totalCents: number;
  currency: string;
  itemCount: number;
  placedAt: Date;
  fulfilledAt: Date | null;
  deliveredAt: Date | null;
  refundedAt: Date | null;
  refundAmountCents: number | null;
  cancelledAt: Date | null;
}

export interface InteractionRecord {
  id: string;
  type: InteractionType;
  body: string | null;
  outcome: string | null;
  author: string;
  occurredAt: Date;
}

export interface LifecycleRecord {
  id: string;
  kind: LifecycleKind;
  amountCents: number | null;
  occurredAt: Date;
}
```

- [ ] **Step 3: Write the failing tests**

Create `app/crm/timeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline";
import type {
  InteractionRecord,
  LifecycleRecord,
  OrderRecord,
} from "./types";

const at = (iso: string) => new Date(iso);

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "o1",
    orderNumber: "1481",
    totalCents: 16400,
    currency: "USD",
    itemCount: 3,
    placedAt: at("2026-08-01T10:00:00Z"),
    fulfilledAt: null,
    deliveredAt: null,
    refundedAt: null,
    refundAmountCents: null,
    cancelledAt: null,
    ...overrides,
  };
}

function interaction(
  overrides: Partial<InteractionRecord> = {},
): InteractionRecord {
  return {
    id: "i1",
    type: "call",
    body: "Asked about resizing",
    outcome: "resolved",
    author: "Ahmed",
    occurredAt: at("2026-08-05T10:00:00Z"),
    ...overrides,
  };
}

function lifecycle(
  overrides: Partial<LifecycleRecord> = {},
): LifecycleRecord {
  return {
    id: "l1",
    kind: "account_created",
    amountCents: null,
    occurredAt: at("2026-07-01T10:00:00Z"),
    ...overrides,
  };
}

describe("buildTimeline", () => {
  it("returns an empty array when there is nothing to show", () => {
    expect(buildTimeline([], [], [])).toEqual([]);
  });

  it("expands a placed-only order into one event", () => {
    const events = buildTimeline([order()], [], []);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("order_placed");
    expect(events[0].source).toBe("shopify");
    expect(events[0].id).toBe("order:o1:placed");
  });

  it("expands a fully progressed order into four events", () => {
    const events = buildTimeline(
      [
        order({
          fulfilledAt: at("2026-08-02T10:00:00Z"),
          deliveredAt: at("2026-08-03T10:00:00Z"),
          refundedAt: at("2026-08-04T10:00:00Z"),
          refundAmountCents: 4800,
        }),
      ],
      [],
      [],
    );
    expect(events.map((e) => e.type)).toEqual([
      "order_refunded",
      "order_delivered",
      "order_fulfilled",
      "order_placed",
    ]);
  });

  it("expands a cancelled order into placed and cancelled only", () => {
    const events = buildTimeline(
      [order({ cancelledAt: at("2026-08-02T10:00:00Z") })],
      [],
      [],
    );
    expect(events.map((e) => e.type)).toEqual([
      "order_cancelled",
      "order_placed",
    ]);
  });

  it("marks interactions as crm and everything else as shopify", () => {
    const events = buildTimeline([order()], [interaction()], [lifecycle()]);
    const bySource = Object.fromEntries(
      events.map((e) => [e.type, e.source]),
    );
    expect(bySource["order_placed"]).toBe("shopify");
    expect(bySource["lifecycle_account_created"]).toBe("shopify");
    expect(bySource["interaction_call"]).toBe("crm");
  });

  it("sorts newest first across all three sources", () => {
    const events = buildTimeline([order()], [interaction()], [lifecycle()]);
    expect(events.map((e) => e.type)).toEqual([
      "interaction_call",
      "order_placed",
      "lifecycle_account_created",
    ]);
  });

  it("breaks timestamp ties by source priority, then id", () => {
    const t = "2026-08-10T12:00:00Z";
    const events = buildTimeline(
      [order({ id: "o9", placedAt: at(t) })],
      [interaction({ id: "i9", occurredAt: at(t) })],
      [lifecycle({ id: "l9", occurredAt: at(t) })],
    );
    expect(events.map((e) => e.type)).toEqual([
      "order_placed",
      "lifecycle_account_created",
      "interaction_call",
    ]);
  });

  it("breaks ties within the same source by id ascending", () => {
    const t = "2026-08-10T12:00:00Z";
    const events = buildTimeline(
      [],
      [
        interaction({ id: "i-b", occurredAt: at(t) }),
        interaction({ id: "i-a", occurredAt: at(t) }),
      ],
      [],
    );
    expect(events.map((e) => e.id)).toEqual([
      "interaction:i-a",
      "interaction:i-b",
    ]);
  });

  it("puts the order number and item count in the placed detail", () => {
    const [event] = buildTimeline([order()], [], []);
    expect(event.title).toBe("Order #1481 placed");
    expect(event.detail).toBe("3 items · $164.00");
  });

  it("reports the refunded amount, not the order total", () => {
    const events = buildTimeline(
      [order({ refundedAt: at("2026-08-04T10:00:00Z"), refundAmountCents: 4800 })],
      [],
      [],
    );
    const refund = events.find((e) => e.type === "order_refunded");
    expect(refund?.detail).toBe("$48.00 returned");
  });

  it("shows the interaction outcome and author", () => {
    const [event] = buildTimeline([], [interaction()], []);
    expect(event.title).toBe("Call — Asked about resizing");
    expect(event.detail).toBe("Outcome: resolved · logged by Ahmed");
  });

  it("handles an interaction with no body and no outcome", () => {
    const [event] = buildTimeline(
      [],
      [interaction({ body: null, outcome: null, type: "note" })],
      [],
    );
    expect(event.title).toBe("Note");
    expect(event.detail).toBe("logged by Ahmed");
  });

  it("shows the abandoned checkout amount", () => {
    const [event] = buildTimeline(
      [],
      [],
      [lifecycle({ kind: "abandoned_checkout", amountCents: 21000 })],
    );
    expect(event.title).toBe("Abandoned checkout");
    expect(event.detail).toBe("$210.00");
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Failed to resolve import "./timeline"`.

- [ ] **Step 5: Implement the timeline merge**

Create `app/crm/timeline.ts`:

```ts
import type {
  InteractionRecord,
  LifecycleRecord,
  OrderRecord,
  TimelineEvent,
} from "./types";

const PRIORITY = { order: 0, lifecycle: 1, interaction: 2 } as const;

type Group = keyof typeof PRIORITY;

interface Ranked extends TimelineEvent {
  group: Group;
  sortId: string;
}

function money(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

const INTERACTION_LABEL: Record<string, string> = {
  call: "Call",
  email: "Email",
  dm: "DM",
  note: "Note",
};

const LIFECYCLE_LABEL: Record<string, string> = {
  account_created: "Account created",
  consent_granted: "Marketing consent granted",
  consent_revoked: "Marketing consent revoked",
  abandoned_checkout: "Abandoned checkout",
};

function expandOrder(o: OrderRecord): Ranked[] {
  const base = { source: "shopify" as const, group: "order" as const, sortId: o.id };
  const events: Ranked[] = [
    {
      ...base,
      id: `order:${o.id}:placed`,
      type: "order_placed",
      timestamp: o.placedAt,
      title: `Order #${o.orderNumber} placed`,
      detail: `${o.itemCount} items · ${money(o.totalCents, o.currency)}`,
    },
  ];

  if (o.fulfilledAt) {
    events.push({
      ...base,
      id: `order:${o.id}:fulfilled`,
      type: "order_fulfilled",
      timestamp: o.fulfilledAt,
      title: `Order #${o.orderNumber} fulfilled`,
    });
  }
  if (o.deliveredAt) {
    events.push({
      ...base,
      id: `order:${o.id}:delivered`,
      type: "order_delivered",
      timestamp: o.deliveredAt,
      title: `Order #${o.orderNumber} delivered`,
      detail: `${o.itemCount} items · ${money(o.totalCents, o.currency)}`,
    });
  }
  if (o.refundedAt) {
    events.push({
      ...base,
      id: `order:${o.id}:refunded`,
      type: "order_refunded",
      timestamp: o.refundedAt,
      title: `Order #${o.orderNumber} refunded`,
      detail: `${money(o.refundAmountCents ?? 0, o.currency)} returned`,
    });
  }
  if (o.cancelledAt) {
    events.push({
      ...base,
      id: `order:${o.id}:cancelled`,
      type: "order_cancelled",
      timestamp: o.cancelledAt,
      title: `Order #${o.orderNumber} cancelled`,
    });
  }

  return events;
}

function expandInteraction(i: InteractionRecord): Ranked {
  const label = INTERACTION_LABEL[i.type] ?? i.type;
  const detail = [
    i.outcome ? `Outcome: ${i.outcome}` : null,
    `logged by ${i.author}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id: `interaction:${i.id}`,
    source: "crm",
    group: "interaction",
    sortId: i.id,
    type: `interaction_${i.type}`,
    timestamp: i.occurredAt,
    title: i.body ? `${label} — ${i.body}` : label,
    detail,
  };
}

function expandLifecycle(l: LifecycleRecord): Ranked {
  return {
    id: `lifecycle:${l.id}`,
    source: "shopify",
    group: "lifecycle",
    sortId: l.id,
    type: `lifecycle_${l.kind}`,
    timestamp: l.occurredAt,
    title: LIFECYCLE_LABEL[l.kind] ?? l.kind,
    detail: l.amountCents === null ? undefined : money(l.amountCents),
  };
}

export function buildTimeline(
  orders: OrderRecord[],
  interactions: InteractionRecord[],
  lifecycle: LifecycleRecord[],
): TimelineEvent[] {
  const ranked: Ranked[] = [
    ...orders.flatMap(expandOrder),
    ...interactions.map(expandInteraction),
    ...lifecycle.map(expandLifecycle),
  ];

  ranked.sort((a, b) => {
    const byTime = b.timestamp.getTime() - a.timestamp.getTime();
    if (byTime !== 0) return byTime;

    const byGroup = PRIORITY[a.group] - PRIORITY[b.group];
    if (byGroup !== 0) return byGroup;

    return a.sortId < b.sortId ? -1 : a.sortId > b.sortId ? 1 : 0;
  });

  return ranked.map(({ group, sortId, ...event }) => event);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS — 13 tests in `app/crm/timeline.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add app/crm package.json vitest.config.ts package-lock.json
git commit -m "feat: add timeline merge with deterministic ordering"
```

---

### Task 3: Derived customer stats

**Files:**
- Create: `app/crm/stats.ts`
- Test: `app/crm/stats.test.ts`

**Interfaces:**
- Consumes: `OrderRecord` from `app/crm/types.ts` (Task 2)
- Produces: `customerStats(orders: OrderRecord[]): CustomerStats` where
  `CustomerStats = { lifetimeValueCents: number; orderCount: number; averageOrderValueCents: number }`

- [ ] **Step 1: Write the failing tests**

Create `app/crm/stats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { customerStats } from "./stats";
import type { OrderRecord } from "./types";

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "o1",
    orderNumber: "1000",
    totalCents: 10000,
    currency: "USD",
    itemCount: 1,
    placedAt: new Date("2026-08-01T10:00:00Z"),
    fulfilledAt: null,
    deliveredAt: null,
    refundedAt: null,
    refundAmountCents: null,
    cancelledAt: null,
    ...overrides,
  };
}

describe("customerStats", () => {
  it("returns zeroes for a customer with no orders", () => {
    expect(customerStats([])).toEqual({
      lifetimeValueCents: 0,
      orderCount: 0,
      averageOrderValueCents: 0,
    });
  });

  it("sums order totals", () => {
    const stats = customerStats([
      order({ id: "a", totalCents: 10000 }),
      order({ id: "b", totalCents: 5000 }),
    ]);
    expect(stats.lifetimeValueCents).toBe(15000);
    expect(stats.orderCount).toBe(2);
  });

  it("subtracts refunds from lifetime value", () => {
    const stats = customerStats([
      order({ id: "a", totalCents: 10000, refundAmountCents: 2500 }),
    ]);
    expect(stats.lifetimeValueCents).toBe(7500);
  });

  it("excludes cancelled orders from every stat", () => {
    const stats = customerStats([
      order({ id: "a", totalCents: 10000 }),
      order({
        id: "b",
        totalCents: 99999,
        cancelledAt: new Date("2026-08-02T10:00:00Z"),
      }),
    ]);
    expect(stats.lifetimeValueCents).toBe(10000);
    expect(stats.orderCount).toBe(1);
  });

  it("averages over countable orders", () => {
    const stats = customerStats([
      order({ id: "a", totalCents: 10000 }),
      order({ id: "b", totalCents: 5000 }),
    ]);
    expect(stats.averageOrderValueCents).toBe(7500);
  });

  it("returns zero average rather than dividing by zero when every order was cancelled", () => {
    const stats = customerStats([
      order({ id: "a", cancelledAt: new Date("2026-08-02T10:00:00Z") }),
    ]);
    expect(stats).toEqual({
      lifetimeValueCents: 0,
      orderCount: 0,
      averageOrderValueCents: 0,
    });
  });

  it("rounds the average to whole cents", () => {
    const stats = customerStats([
      order({ id: "a", totalCents: 10000 }),
      order({ id: "b", totalCents: 10001 }),
      order({ id: "c", totalCents: 10000 }),
    ]);
    expect(Number.isInteger(stats.averageOrderValueCents)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Failed to resolve import "./stats"`.

- [ ] **Step 3: Implement the stats**

Create `app/crm/stats.ts`:

```ts
import type { OrderRecord } from "./types";

export interface CustomerStats {
  lifetimeValueCents: number;
  orderCount: number;
  averageOrderValueCents: number;
}

export function customerStats(orders: OrderRecord[]): CustomerStats {
  const countable = orders.filter((o) => o.cancelledAt === null);

  const lifetimeValueCents = countable.reduce(
    (sum, o) => sum + o.totalCents - (o.refundAmountCents ?? 0),
    0,
  );

  const orderCount = countable.length;

  const averageOrderValueCents =
    orderCount === 0 ? 0 : Math.round(lifetimeValueCents / orderCount);

  return { lifetimeValueCents, orderCount, averageOrderValueCents };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS — 7 tests in `app/crm/stats.test.ts`, plus Task 2's still passing.

- [ ] **Step 5: Commit**

```bash
git add app/crm/stats.ts app/crm/stats.test.ts
git commit -m "feat: add derived customer stats net of refunds"
```

---

### Task 4: Deterministic seed script

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the Prisma models from Task 1.
- Produces: a populated database. No exported functions other tasks depend on.

- [ ] **Step 1: Write the seed script**

Create `prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED = 20260831;

// mulberry32 — small deterministic PRNG. Same seed, same sequence, every run.
function rng(seed: number) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(SEED);
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
const between = (lo: number, hi: number) =>
  Math.floor(random() * (hi - lo + 1)) + lo;

const FIRST = ["Dana", "Priya", "Marcus", "Ines", "Tobias", "Amara", "Wei", "Sofia", "Noor", "Felix"];
const LAST = ["Whitfield", "Raman", "Oyelaran", "Costa", "Berg", "Nakamura", "Duarte", "Haddad", "Lindqvist", "Moreau"];
const CITIES: Array<[string, string]> = [
  ["Portland", "OR"], ["Austin", "TX"], ["Brooklyn", "NY"], ["Denver", "CO"],
  ["Savannah", "GA"], ["Oakland", "CA"], ["Madison", "WI"], ["Asheville", "NC"],
];

const ARCHETYPES = [
  { name: "vip",      orders: [9, 16], gapDays: [12, 30],  interactions: [3, 6], refundRate: 0.05, cancelRate: 0.02 },
  { name: "steady",   orders: [4, 8],  gapDays: [25, 60],  interactions: [1, 3], refundRate: 0.08, cancelRate: 0.04 },
  { name: "onetime",  orders: [1, 1],  gapDays: [0, 0],    interactions: [0, 1], refundRate: 0.10, cancelRate: 0.05 },
  { name: "churn",    orders: [3, 6],  gapDays: [30, 70],  interactions: [1, 3], refundRate: 0.10, cancelRate: 0.05 },
  { name: "refundy",  orders: [4, 9],  gapDays: [20, 50],  interactions: [2, 5], refundRate: 0.55, cancelRate: 0.10 },
] as const;

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-31T12:00:00Z").getTime();

const INTERACTION_TYPES = ["call", "email", "dm", "note"] as const;
const BODIES = [
  "Asked about resizing", "Wanted a shipping update", "Requested a gift note",
  "Reported a damaged item", "Asked about restock", "Following up on refund",
  "Thanked us for fast delivery", null,
];
const OUTCOMES = ["resolved", "no reply", "escalated", "awaiting response", null];

async function main() {
  await prisma.lifecycleEvent.deleteMany();
  await prisma.interaction.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();

  let orderSeq = 1400;

  for (let n = 0; n < 60; n++) {
    const archetype = ARCHETYPES[n % ARCHETYPES.length];
    const firstName = pick([...FIRST]);
    const lastName = pick([...LAST]);
    const [city, region] = pick(CITIES);

    // Churn-risk customers stopped ordering a while ago.
    const trailingGapDays = archetype.name === "churn" ? between(120, 300) : between(2, 20);
    const orderCount = between(archetype.orders[0], archetype.orders[1]);

    // Walk backwards from the most recent order to the first.
    const placedAts: number[] = [];
    let cursor = NOW - trailingGapDays * DAY;
    for (let i = 0; i < orderCount; i++) {
      placedAts.push(cursor);
      cursor -= between(archetype.gapDays[0], archetype.gapDays[1] || 30) * DAY;
    }
    placedAts.reverse();

    const accountCreatedAt = new Date(placedAts[0] - between(3, 40) * DAY);
    const marketingConsent = random() > 0.35;

    const customer = await prisma.customer.create({
      data: {
        // Explicit deterministic id. The cuid() default would be random per
        // reseed, and buildTimeline breaks timestamp ties by id — so random
        // ids would silently reorder the timeline between reseeds.
        id: `c${n}`,
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${n}@example.com`,
        phone: `+1 415 555 ${String(between(1000, 9999))}`,
        city,
        region,
        marketingConsent,
        createdAt: accountCreatedAt,
      },
    });

    for (const placedMs of placedAts) {
      orderSeq += 1;
      const totalCents = between(2400, 38000);
      const cancelled = random() < archetype.cancelRate;

      // Invariant: cancelled orders never fulfil, deliver, or refund.
      if (cancelled) {
        await prisma.order.create({
          data: {
            id: `o${orderSeq}`,
            customerId: customer.id,
            orderNumber: String(orderSeq),
            totalCents,
            itemCount: between(1, 5),
            placedAt: new Date(placedMs),
            cancelledAt: new Date(placedMs + between(1, 3) * DAY),
          },
        });
        continue;
      }

      const fulfilledAt = new Date(placedMs + between(1, 3) * DAY);
      const deliveredAt = new Date(fulfilledAt.getTime() + between(1, 5) * DAY);
      const refunded = random() < archetype.refundRate;

      await prisma.order.create({
        data: {
          id: `o${orderSeq}`,
          customerId: customer.id,
          orderNumber: String(orderSeq),
          totalCents,
          itemCount: between(1, 5),
          placedAt: new Date(placedMs),
          fulfilledAt,
          deliveredAt,
          refundedAt: refunded
            ? new Date(deliveredAt.getTime() + between(2, 10) * DAY)
            : null,
          refundAmountCents: refunded
            ? Math.round(totalCents * (random() < 0.5 ? 0.35 : 1))
            : null,
        },
      });
    }

    const interactionCount = between(
      archetype.interactions[0],
      archetype.interactions[1],
    );
    for (let i = 0; i < interactionCount; i++) {
      const anchor = pick(placedAts);
      await prisma.interaction.create({
        data: {
          id: `i${n}-${i}`,
          customerId: customer.id,
          type: pick([...INTERACTION_TYPES]),
          body: pick(BODIES),
          outcome: pick(OUTCOMES),
          author: pick(["Ahmed", "Sam", "Rosa"]),
          occurredAt: new Date(anchor + between(1, 6) * DAY),
        },
      });
    }

    await prisma.lifecycleEvent.create({
      data: {
        id: `l${n}-created`,
        customerId: customer.id,
        kind: "account_created",
        occurredAt: accountCreatedAt,
      },
    });

    if (marketingConsent) {
      await prisma.lifecycleEvent.create({
        data: {
          id: `l${n}-consent`,
          customerId: customer.id,
          kind: "consent_granted",
          occurredAt: new Date(accountCreatedAt.getTime() + between(1, 10) * DAY),
        },
      });
    }

    // Churn-risk customers get an abandoned checkout as their last signal.
    if (archetype.name === "churn") {
      await prisma.lifecycleEvent.create({
        data: {
          id: `l${n}-abandoned`,
          customerId: customer.id,
          kind: "abandoned_checkout",
          amountCents: between(4000, 32000),
          occurredAt: new Date(placedAts[placedAts.length - 1] + between(5, 25) * DAY),
        },
      });
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Wire up the seed command**

```bash
npm install -D tsx
```

Add to `package.json`:

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

- [ ] **Step 3: Run the seed**

```bash
npx prisma db seed
```

Expected: completes with no error.

- [ ] **Step 4: Verify the data is present and the invariant holds**

```bash
node -e "
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  console.log('customers', await p.customer.count());
  console.log('orders', await p.order.count());
  console.log('interactions', await p.interaction.count());
  console.log('lifecycle', await p.lifecycleEvent.count());
  const bad = await p.order.count({where:{AND:[{cancelledAt:{not:null}},{OR:[{fulfilledAt:{not:null}},{deliveredAt:{not:null}},{refundedAt:{not:null}}]}]}});
  console.log('invariant violations (must be 0):', bad);
  await p.\$disconnect();
})()"
```

Expected: 60 customers, several hundred orders, and **`invariant violations (must be 0): 0`**.

- [ ] **Step 5: Verify the seed is deterministic**

Create `scripts/seed-digest.mjs`:

```js
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Digest ids and timestamps, not just amounts. buildTimeline breaks
// timestamp ties by id, so non-deterministic ids reorder the timeline
// while every monetary total stays identical — a checksum over amounts
// alone would report success on exactly the bug this guards against.
const rows = [
  ...(await prisma.customer.findMany({ orderBy: { id: "asc" } })).map(
    (c) => `c|${c.id}|${c.createdAt.toISOString()}`,
  ),
  ...(await prisma.order.findMany({ orderBy: { id: "asc" } })).map(
    (o) => `o|${o.id}|${o.customerId}|${o.totalCents}|${o.placedAt.toISOString()}`,
  ),
  ...(await prisma.interaction.findMany({ orderBy: { id: "asc" } })).map(
    (i) => `i|${i.id}|${i.customerId}|${i.type}|${i.occurredAt.toISOString()}`,
  ),
  ...(await prisma.lifecycleEvent.findMany({ orderBy: { id: "asc" } })).map(
    (l) => `l|${l.id}|${l.customerId}|${l.kind}|${l.occurredAt.toISOString()}`,
  ),
];

console.log(createHash("sha256").update(rows.join("\n")).digest("hex"));
await prisma.$disconnect();
```

Then run it, reseed, and run it again:

```bash
node scripts/seed-digest.mjs
npx prisma db seed
node scripts/seed-digest.mjs
```

Expected: **the two hashes are identical.** If they differ, either an id is still falling through to `cuid()`, the RNG is being seeded more than once, or `Math.random` leaked in. Fix before moving on — every later task assumes stable data, and the timeline tie-break test in Task 2 assumes stable ids.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts scripts/seed-digest.mjs package.json package-lock.json
git commit -m "feat: add deterministic seed data across five customer archetypes"
```

---

### Task 5: Customer data access layer

**Files:**
- Create: `app/crm/queries.server.ts`

**Interfaces:**
- Consumes: `buildTimeline` (Task 2), `customerStats` (Task 3), Prisma models (Task 1)
- Produces:
  - `listCustomers(search?: string): Promise<CustomerListRow[]>` where
    `CustomerListRow = { id, firstName, lastName, email, lifetimeValueCents, orderCount, lastActivityAt: Date | null }`
  - `getCustomerDetail(id: string): Promise<CustomerDetail | null>` where
    `CustomerDetail = { customer: Customer; stats: CustomerStats; timeline: TimelineEvent[] }`

- [ ] **Step 1: Write the data access module**

Create `app/crm/queries.server.ts`:

```ts
import prisma from "../db.server";
import { customerStats, type CustomerStats } from "./stats";
import { buildTimeline } from "./timeline";
import type { TimelineEvent } from "./types";

export interface CustomerListRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  lifetimeValueCents: number;
  orderCount: number;
  lastActivityAt: Date | null;
}

export interface CustomerDetail {
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    city: string;
    region: string;
    marketingConsent: boolean;
    createdAt: Date;
  };
  stats: CustomerStats;
  timeline: TimelineEvent[];
}

export async function listCustomers(
  search?: string,
): Promise<CustomerListRow[]> {
  const term = search?.trim();

  const customers = await prisma.customer.findMany({
    where: term
      ? {
          OR: [
            { firstName: { contains: term } },
            { lastName: { contains: term } },
            { email: { contains: term } },
          ],
        }
      : undefined,
    include: { orders: true, interactions: true, lifecycleEvents: true },
  });

  const rows = customers.map((c) => {
    const stats = customerStats(c.orders);
    const timeline = buildTimeline(c.orders, c.interactions as never, c.lifecycleEvents as never);

    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      lifetimeValueCents: stats.lifetimeValueCents,
      orderCount: stats.orderCount,
      lastActivityAt: timeline.length > 0 ? timeline[0].timestamp : null,
    };
  });

  rows.sort((a, b) => {
    const at = a.lastActivityAt?.getTime() ?? 0;
    const bt = b.lastActivityAt?.getTime() ?? 0;
    return bt - at;
  });

  return rows;
}

export async function getCustomerDetail(
  id: string,
): Promise<CustomerDetail | null> {
  const c = await prisma.customer.findUnique({
    where: { id },
    include: { orders: true, interactions: true, lifecycleEvents: true },
  });

  if (!c) return null;

  return {
    customer: {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      city: c.city,
      region: c.region,
      marketingConsent: c.marketingConsent,
      createdAt: c.createdAt,
    },
    stats: customerStats(c.orders),
    timeline: buildTimeline(c.orders, c.interactions as never, c.lifecycleEvents as never),
  };
}
```

The `as never` casts bridge Prisma's `string` columns to the narrower `InteractionType` and `LifecycleKind` unions. The seed script is the only writer of those columns and it only writes valid values, so the cast is safe here. If a future task lets users pick arbitrary types, replace the cast with a runtime parse.

- [ ] **Step 2: Verify it compiles and returns data**

```bash
npx tsc --noEmit
npx tsx -e "
import { listCustomers, getCustomerDetail } from './app/crm/queries.server';
const rows = await listCustomers();
console.log('rows', rows.length, '| first:', rows[0].firstName, rows[0].orderCount, 'orders');
const detail = await getCustomerDetail(rows[0].id);
console.log('timeline events', detail?.timeline.length);
console.log('search hit', (await listCustomers(rows[0].email)).length);
"
```

Expected: 60 rows, a non-zero timeline length, and exactly 1 search hit.

- [ ] **Step 3: Commit**

```bash
git add app/crm/queries.server.ts
git commit -m "feat: add customer query layer"
```

---

### Task 6: Customer list route

**Files:**
- Create: `app/routes/app.customers._index.tsx`
- Modify: `app/routes/app._index.tsx`

**Interfaces:**
- Consumes: `listCustomers` (Task 5)
- Produces: a route at `/app/customers`; rows link to `/app/customers/:id`

- [ ] **Step 1: Redirect the index route to the customer list**

Replace the entire contents of `app/routes/app._index.tsx`:

```tsx
import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return redirect("/app/customers");
};
```

- [ ] **Step 2: Write the customer list route**

Create `app/routes/app.customers._index.tsx`:

```tsx
import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import {
  Card,
  IndexTable,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback } from "react";
import { listCustomers } from "../crm/queries.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const search = new URL(request.url).searchParams.get("q") ?? "";
  return json({ search, customers: await listCustomers(search) });
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function relative(iso: string | null) {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export default function CustomerList() {
  const { customers, search } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const onSearch = useCallback(
    (value: string) => setSearchParams(value ? { q: value } : {}),
    [setSearchParams],
  );

  return (
    <Page title="Customers">
      <Card padding="0">
        <div style={{ padding: "12px" }}>
          <TextField
            label="Search customers"
            labelHidden
            value={search}
            onChange={onSearch}
            placeholder="Search by name or email"
            autoComplete="off"
            clearButton
            onClearButtonClick={() => onSearch("")}
          />
        </div>
        <IndexTable
          resourceName={{ singular: "customer", plural: "customers" }}
          itemCount={customers.length}
          selectable={false}
          headings={[
            { title: "Name" },
            { title: "Email" },
            { title: "Lifetime value" },
            { title: "Orders" },
            { title: "Last activity" },
          ]}
        >
          {customers.map((c, index) => (
            <IndexTable.Row
              id={c.id}
              key={c.id}
              position={index}
              onClick={() => navigate(`/app/customers/${c.id}`)}
            >
              <IndexTable.Cell>
                <Text as="span" fontWeight="semibold">
                  {c.firstName} {c.lastName}
                </Text>
              </IndexTable.Cell>
              <IndexTable.Cell>{c.email}</IndexTable.Cell>
              <IndexTable.Cell>{money(c.lifetimeValueCents)}</IndexTable.Cell>
              <IndexTable.Cell>{c.orderCount}</IndexTable.Cell>
              <IndexTable.Cell>{relative(c.lastActivityAt)}</IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </Card>
    </Page>
  );
}
```

- [ ] **Step 3: Verify it renders**

```bash
npm run dev
```

Open the app in your dev store. Expected: 60 customers, most recently active on top, and typing an email into the search box narrows to one row.

- [ ] **Step 4: Commit**

```bash
git add app/routes/app.customers._index.tsx app/routes/app._index.tsx
git commit -m "feat: add customer list route"
```

---

### Task 7: Customer detail route

**Files:**
- Create: `app/routes/app.customers.$id.tsx`
- Create: `app/components/Timeline.tsx`

**Interfaces:**
- Consumes: `getCustomerDetail` (Task 5), `TimelineEvent` (Task 2)
- Produces: a route at `/app/customers/:id`; `Timeline` component taking `{ events: TimelineEvent[] }`

- [ ] **Step 1: Write the timeline component**

Create `app/components/Timeline.tsx`:

```tsx
import { BlockStack, Box, InlineStack, Text } from "@shopify/polaris";
import type { TimelineEvent } from "../crm/types";

function when(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type SerializedEvent = Omit<TimelineEvent, "timestamp"> & { timestamp: string };

export function Timeline({ events }: { events: SerializedEvent[] }) {
  if (events.length === 0) {
    return (
      <Text as="p" tone="subdued">
        Nothing has happened with this customer yet.
      </Text>
    );
  }

  return (
    <BlockStack gap="0">
      {events.map((event) => (
        <Box
          key={event.id}
          paddingBlock="300"
          borderBlockEndWidth="025"
          borderColor="border-secondary"
        >
          <InlineStack gap="300" align="start" blockAlign="start" wrap={false}>
            <Box paddingBlockStart="150">
              <span
                aria-hidden
                style={{
                  display: "block",
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  border: "2px solid currentColor",
                  background:
                    event.source === "shopify" ? "currentColor" : "transparent",
                  opacity: 0.7,
                }}
              />
            </Box>
            <BlockStack gap="050">
              <Text as="span" fontWeight="semibold">
                {event.title}
              </Text>
              {event.detail ? (
                <Text as="span" tone="subdued" variant="bodySm">
                  {event.detail}
                </Text>
              ) : null}
            </BlockStack>
            <Box width="100%">
              <InlineStack align="end">
                <Text as="span" tone="subdued" variant="bodySm">
                  {when(event.timestamp)}
                </Text>
              </InlineStack>
            </Box>
          </InlineStack>
        </Box>
      ))}
    </BlockStack>
  );
}
```

Filled markers are Shopify-sourced events, hollow markers are CRM-sourced. That distinction is the product's central claim rendered visually — do not drop it.

- [ ] **Step 2: Write the detail route**

Create `app/routes/app.customers.$id.tsx`:

```tsx
import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Card,
  EmptyState,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { Timeline } from "../components/Timeline";
import { getCustomerDetail } from "../crm/queries.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const detail = await getCustomerDetail(params.id!);
  return json({ detail });
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <InlineStack align="space-between">
      <Text as="span" tone="subdued">
        {label}
      </Text>
      <Text as="span" fontWeight="semibold">
        {value}
      </Text>
    </InlineStack>
  );
}

export default function CustomerDetail() {
  const { detail } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  if (!detail) {
    return (
      <Page title="Customer not found">
        <Card>
          <EmptyState
            heading="We couldn't find that customer"
            action={{
              content: "Back to customers",
              onAction: () => navigate("/app/customers"),
            }}
            image=""
          >
            <p>The customer may have been removed, or the link is wrong.</p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const { customer, stats, timeline } = detail;

  return (
    <Page
      title={`${customer.firstName} ${customer.lastName}`}
      backAction={{ content: "Customers", onAction: () => navigate("/app/customers") }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                Timeline
              </Text>
              <Timeline events={timeline} />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  Customer
                </Text>
                <Text as="p">{customer.email}</Text>
                {customer.phone ? <Text as="p">{customer.phone}</Text> : null}
                <Text as="p">
                  {customer.city}, {customer.region}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  Value
                </Text>
                <Stat label="Lifetime" value={money(stats.lifetimeValueCents)} />
                <Stat label="Orders" value={String(stats.orderCount)} />
                <Stat
                  label="Avg order"
                  value={money(stats.averageOrderValueCents)}
                />
                <Stat
                  label="Customer since"
                  value={new Date(customer.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  Consent
                </Text>
                <InlineGrid>
                  <Badge tone={customer.marketingConsent ? "success" : undefined}>
                    {customer.marketingConsent ? "Subscribed" : "Not subscribed"}
                  </Badge>
                </InlineGrid>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

- [ ] **Step 3: Verify it renders**

With `npm run dev` running, click a customer from the list. Expected: the timeline on the left showing orders and interactions interleaved newest-first, the sidebar on the right with contact, value, and consent. Visit `/app/customers/does-not-exist` and expect the empty state, not a crash.

- [ ] **Step 4: Commit**

```bash
git add app/routes/app.customers.\$id.tsx app/components/Timeline.tsx
git commit -m "feat: add customer detail route with merged timeline"
```

---

### Task 8: Log an interaction — the single write path

**Files:**
- Modify: `app/routes/app.customers.$id.tsx`
- Create: `app/crm/interactions.server.ts`
- Test: `app/crm/interactions.test.ts`

**Interfaces:**
- Consumes: `getCustomerDetail` (Task 5), Prisma models (Task 1)
- Produces:
  - `validateInteraction(input: { type: string; body: string }): { ok: true; value: { type: InteractionType; body: string | null } } | { ok: false; error: string }`
  - `logInteraction(customerId: string, input: { type: InteractionType; body: string | null }): Promise<void>`

- [ ] **Step 1: Write the failing validation tests**

Create `app/crm/interactions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateInteraction } from "./interactions.server";

describe("validateInteraction", () => {
  it("accepts a valid call with a body", () => {
    const result = validateInteraction({ type: "call", body: "Talked it over" });
    expect(result).toEqual({
      ok: true,
      value: { type: "call", body: "Talked it over" },
    });
  });

  it("accepts an empty body as null", () => {
    const result = validateInteraction({ type: "note", body: "   " });
    expect(result).toEqual({ ok: true, value: { type: "note", body: null } });
  });

  it("rejects a missing type", () => {
    const result = validateInteraction({ type: "", body: "hi" });
    expect(result).toEqual({ ok: false, error: "Choose an interaction type." });
  });

  it("rejects an unknown type", () => {
    const result = validateInteraction({ type: "carrier-pigeon", body: "hi" });
    expect(result).toEqual({ ok: false, error: "Choose an interaction type." });
  });

  it("rejects a body over 2000 characters", () => {
    const result = validateInteraction({ type: "note", body: "x".repeat(2001) });
    expect(result).toEqual({
      ok: false,
      error: "Keep the note under 2000 characters.",
    });
  });

  it("accepts a body of exactly 2000 characters", () => {
    const result = validateInteraction({ type: "note", body: "x".repeat(2000) });
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Failed to resolve import "./interactions.server"`.

- [ ] **Step 3: Implement validation and the write**

Create `app/crm/interactions.server.ts`:

```ts
import prisma from "../db.server";
import type { InteractionType } from "./types";

const VALID_TYPES: InteractionType[] = ["call", "email", "dm", "note"];

const MAX_BODY = 2000;

export type ValidationResult =
  | { ok: true; value: { type: InteractionType; body: string | null } }
  | { ok: false; error: string };

export function validateInteraction(input: {
  type: string;
  body: string;
}): ValidationResult {
  if (!VALID_TYPES.includes(input.type as InteractionType)) {
    return { ok: false, error: "Choose an interaction type." };
  }

  if (input.body.length > MAX_BODY) {
    return { ok: false, error: `Keep the note under ${MAX_BODY} characters.` };
  }

  const trimmed = input.body.trim();

  return {
    ok: true,
    value: { type: input.type as InteractionType, body: trimmed || null },
  };
}

export async function logInteraction(
  customerId: string,
  input: { type: InteractionType; body: string | null },
): Promise<void> {
  await prisma.interaction.create({
    data: {
      customerId,
      type: input.type,
      body: input.body,
      outcome: null,
      author: "You",
      occurredAt: new Date(),
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS — 6 tests in `app/crm/interactions.test.ts`, all earlier tests still green.

- [ ] **Step 5: Add the action to the detail route**

In `app/routes/app.customers.$id.tsx`, add these imports alongside the existing ones:

```tsx
import { Button, InlineError, Select, TextField } from "@shopify/polaris";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import type { ActionFunctionArgs } from "@remix-run/node";
import { useState } from "react";
import { logInteraction, validateInteraction } from "../crm/interactions.server";
```

Add the action export directly below the existing `loader`:

```tsx
export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const form = await request.formData();
  const result = validateInteraction({
    type: String(form.get("type") ?? ""),
    body: String(form.get("body") ?? ""),
  });

  if (!result.ok) {
    return json({ error: result.error }, { status: 400 });
  }

  await logInteraction(params.id!, result.value);
  return json({ error: null });
};
```

- [ ] **Step 6: Add the form above the timeline**

Inside the component, below the existing `const { customer, stats, timeline } = detail;` line:

```tsx
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const [type, setType] = useState("call");
  const [body, setBody] = useState("");
```

Then, in the first `Layout.Section`, insert this `Card` immediately **before** the timeline `Card`:

```tsx
          <Card>
            <Form method="post" onSubmit={() => setBody("")}>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">
                  Log an interaction
                </Text>
                <InlineStack gap="200" blockAlign="end" wrap={false}>
                  <div style={{ width: 140 }}>
                    <Select
                      label="Type"
                      labelHidden
                      name="type"
                      value={type}
                      onChange={setType}
                      options={[
                        { label: "Call", value: "call" },
                        { label: "Email", value: "email" },
                        { label: "DM", value: "dm" },
                        { label: "Note", value: "note" },
                      ]}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="What happened?"
                      labelHidden
                      name="body"
                      value={body}
                      onChange={setBody}
                      placeholder="What happened?"
                      autoComplete="off"
                      maxLength={2000}
                    />
                  </div>
                  <Button submit variant="primary" loading={submitting}>
                    Log it
                  </Button>
                </InlineStack>
                {actionData?.error ? (
                  <InlineError message={actionData.error} fieldID="body" />
                ) : null}
              </BlockStack>
            </Form>
          </Card>
```

- [ ] **Step 7: Verify the write path end to end**

With `npm run dev` running, open a customer, choose "Call", type "Test interaction", and submit.

Expected: the entry appears at the top of the timeline immediately, with a hollow marker, attributed to "You". Reload the page and confirm it persists. Submitting with an empty body succeeds (an untyped note is valid); the type select cannot be empty through the UI, so the type error is covered by the unit tests rather than manually.

- [ ] **Step 8: Commit**

```bash
git add app/routes/app.customers.\$id.tsx app/crm/interactions.server.ts app/crm/interactions.test.ts
git commit -m "feat: log interactions from the customer detail page"
```

---

## Verification

After Task 8, the whole demo should hold together:

```bash
npm test          # all unit tests green
npx tsc --noEmit  # no type errors
npm run dev       # app boots and embeds
```

Walk the demo path once, end to end: customer list sorted by recency → search for a customer → open them → read a timeline mixing orders, interactions, and lifecycle events → log a new interaction → watch it appear at the top.
