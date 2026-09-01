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

// Every timestamp that walks FORWARD from an anchor goes through here, and the
// offset is capped by the room left before NOW. The room is ample in practice;
// the cap is what makes "the seed contains no future-dated events" a property
// of the generator rather than a property of one lucky RNG sequence. Exactly
// one `between` draw either way, so the sequence stays deterministic.
function after(anchorMs: number, minDays: number, maxDays: number) {
  const room = Math.max(0, Math.floor((NOW - anchorMs) / DAY));
  const hi = Math.min(maxDays, room);
  const lo = Math.min(minDays, hi);
  return anchorMs + between(lo, hi) * DAY;
}

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

    // Walk backwards from the most recent order to the first. Each cursor value
    // is that order's LAST event, not its first — placedAt is then derived by
    // walking back through the fulfil/deliver/refund offsets. Anchoring from
    // the start instead let any order whose trailing gap was shorter than its
    // own forward walk (up to 18 days) push fabricated events past NOW, where
    // both relative-time helpers render them as "Today".
    const lastTouches: number[] = [];
    let cursor = NOW - trailingGapDays * DAY;
    for (let i = 0; i < orderCount; i++) {
      lastTouches.push(cursor);
      cursor -= between(archetype.gapDays[0], archetype.gapDays[1] || 30) * DAY;
    }
    lastTouches.reverse();

    const orders = lastTouches.map((lastTouch) => {
      const totalCents = between(2400, 38000);
      const itemCount = between(1, 5);

      // Invariant: cancelled orders never fulfil, deliver, or refund.
      if (random() < archetype.cancelRate) {
        return {
          totalCents,
          itemCount,
          placedAt: lastTouch - between(1, 3) * DAY,
          fulfilledAt: null,
          deliveredAt: null,
          refundedAt: null,
          refundAmountCents: null,
          cancelledAt: lastTouch,
        };
      }

      const refunded = random() < archetype.refundRate;
      const deliveredAt = refunded ? lastTouch - between(2, 10) * DAY : lastTouch;
      const fulfilledAt = deliveredAt - between(1, 5) * DAY;

      return {
        totalCents,
        itemCount,
        placedAt: fulfilledAt - between(1, 3) * DAY,
        fulfilledAt,
        deliveredAt,
        refundedAt: refunded ? lastTouch : null,
        refundAmountCents: refunded
          ? Math.round(totalCents * (random() < 0.5 ? 0.35 : 1))
          : null,
        cancelledAt: null,
      };
    });

    // Chains can overlap by a few days, so take the extremes rather than the
    // first and last elements.
    const firstPlacedAt = Math.min(...orders.map((o) => o.placedAt));
    const lastTouchedAt = lastTouches[lastTouches.length - 1];

    const accountCreatedAt = new Date(firstPlacedAt - between(3, 40) * DAY);
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

    for (const order of orders) {
      orderSeq += 1;
      await prisma.order.create({
        data: {
          id: `o${orderSeq}`,
          customerId: customer.id,
          orderNumber: String(orderSeq),
          totalCents: order.totalCents,
          itemCount: order.itemCount,
          placedAt: new Date(order.placedAt),
          fulfilledAt: order.fulfilledAt === null ? null : new Date(order.fulfilledAt),
          deliveredAt: order.deliveredAt === null ? null : new Date(order.deliveredAt),
          refundedAt: order.refundedAt === null ? null : new Date(order.refundedAt),
          refundAmountCents: order.refundAmountCents,
          cancelledAt: order.cancelledAt === null ? null : new Date(order.cancelledAt),
        },
      });
    }

    const interactionCount = between(
      archetype.interactions[0],
      archetype.interactions[1],
    );
    for (let i = 0; i < interactionCount; i++) {
      const anchor = pick(orders).placedAt;
      await prisma.interaction.create({
        data: {
          id: `i${n}-${i}`,
          customerId: customer.id,
          type: pick([...INTERACTION_TYPES]),
          body: pick(BODIES),
          outcome: pick(OUTCOMES),
          author: pick(["Ahmed", "Sam", "Rosa"]),
          occurredAt: new Date(after(anchor, 1, 6)),
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
          occurredAt: new Date(after(accountCreatedAt.getTime(), 1, 10)),
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
          occurredAt: new Date(after(lastTouchedAt, 5, 25)),
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
