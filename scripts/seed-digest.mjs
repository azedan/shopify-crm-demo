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
