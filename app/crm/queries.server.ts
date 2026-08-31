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
