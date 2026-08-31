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
