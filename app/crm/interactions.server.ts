import prisma from "../db.server";
import type { InteractionType } from "./types";

const VALID_TYPES: InteractionType[] = ["call", "email", "dm", "note"];

const MAX_BODY = 2000;

export type ValidationResult =
  | { ok: true; value: { type: InteractionType; body: string | null } }
  | { ok: false; error: string };

export function validateInteraction(input: {
  type: string;
  body: string;
}): ValidationResult {
  if (!VALID_TYPES.includes(input.type as InteractionType)) {
    return { ok: false, error: "Choose an interaction type." };
  }

  if (input.body.length > MAX_BODY) {
    return { ok: false, error: `Keep the note under ${MAX_BODY} characters.` };
  }

  const trimmed = input.body.trim();

  return {
    ok: true,
    value: { type: input.type as InteractionType, body: trimmed || null },
  };
}

export async function logInteraction(
  customerId: string,
  input: { type: InteractionType; body: string | null },
): Promise<void> {
  await prisma.interaction.create({
    data: {
      customerId,
      type: input.type,
      body: input.body,
      outcome: null,
      author: "You",
      occurredAt: new Date(),
    },
  });
}
