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

/** The two columns the spec makes sortable. */
export type CustomerSortKey = "lastActivity" | "lifetimeValue";

export interface CustomerSort {
  key: CustomerSortKey;
  direction: "asc" | "desc";
}

export const DEFAULT_CUSTOMER_SORT: CustomerSort = {
  key: "lastActivity",
  direction: "desc",
};

/**
 * Sort comes off the query string, so anything can arrive here. Narrow to the
 * two supported keys and fall back to the default rather than trusting it.
 */
export function parseCustomerSort(
  key: string | null,
  direction: string | null,
): CustomerSort {
  return {
    key: key === "lifetimeValue" ? "lifetimeValue" : "lastActivity",
    direction: direction === "asc" ? "asc" : "desc",
  };
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
  sort: CustomerSort = DEFAULT_CUSTOMER_SORT,
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

  const sortValue = (row: CustomerListRow) =>
    sort.key === "lifetimeValue"
      ? row.lifetimeValueCents
      : (row.lastActivityAt?.getTime() ?? 0);

  rows.sort((a, b) => {
    const delta = sortValue(a) - sortValue(b);
    if (delta !== 0) return sort.direction === "asc" ? delta : -delta;

    // Ties are common — several customers can share a lifetime value of 0.
    // Without this the order falls through to whatever Prisma returned, which
    // is stable per query but not something to rely on.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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
