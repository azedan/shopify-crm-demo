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
