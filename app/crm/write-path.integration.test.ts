import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import prisma from "../db.server";
import { logInteraction } from "./interactions.server";
import { getCustomerDetail } from "./queries.server";

// The only test on this branch that crosses the database boundary. Everything
// else is a pure function over arrays, which leaves the app's single write
// path — insert an Interaction, re-read the customer, rebuild the timeline —
// otherwise unexercised.
//
// It runs against the seeded prisma/dev.sqlite and removes what it wrote. A
// leftover row would fail two other gates: the seed digest, and the check that
// no event is dated after the seed's pinned NOW (2026-08-31T12:00Z), since a
// runtime interaction carries the real clock.
const CUSTOMER_ID = "c0";

// Seeded interactions are attributed to a person's name; only runtime writes
// use "You". That makes the cleanup below hit exactly what this test created.
const RUNTIME_AUTHOR = "You";

describe("the interaction write path", () => {
  beforeAll(async () => {
    const customer = await prisma.customer.findUnique({
      where: { id: CUSTOMER_ID },
    });

    if (!customer) {
      throw new Error(
        `Customer ${CUSTOMER_ID} is missing — run \`npx prisma db seed\` first.`,
      );
    }
  });

  afterEach(async () => {
    await prisma.interaction.deleteMany({ where: { author: RUNTIME_AUTHOR } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("puts a submitted interaction at the top of the returned timeline", async () => {
    const before = await getCustomerDetail(CUSTOMER_ID);
    expect(before).not.toBeNull();
    expect(before!.timeline.length).toBeGreaterThan(0);

    await logInteraction(CUSTOMER_ID, {
      type: "note",
      body: "Asked us to hold the next shipment",
    });

    const updated = await getCustomerDetail(CUSTOMER_ID);
    expect(updated!.timeline).toHaveLength(before!.timeline.length + 1);

    // Top of the feed: logInteraction stamps the real clock, and every seeded
    // event is at least two days older than the seed's NOW.
    const newest = updated!.timeline[0];
    expect(newest.source).toBe("crm");
    expect(newest.type).toBe("interaction_note");
    expect(newest.title).toBe("Note — Asked us to hold the next shipment");
    expect(newest.detail).toBe(`logged by ${RUNTIME_AUTHOR}`);
    expect(newest.timestamp.getTime()).toBeGreaterThan(
      before!.timeline[0].timestamp.getTime(),
    );
  });
});
