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
