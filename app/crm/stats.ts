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
