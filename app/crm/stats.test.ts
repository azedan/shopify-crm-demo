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
