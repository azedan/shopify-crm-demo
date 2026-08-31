import { describe, expect, it } from "vitest";
import { validateInteraction } from "./interactions.server";

describe("validateInteraction", () => {
  it("accepts a valid call with a body", () => {
    const result = validateInteraction({ type: "call", body: "Talked it over" });
    expect(result).toEqual({
      ok: true,
      value: { type: "call", body: "Talked it over" },
    });
  });

  it("accepts an empty body as null", () => {
    const result = validateInteraction({ type: "note", body: "   " });
    expect(result).toEqual({ ok: true, value: { type: "note", body: null } });
  });

  it("rejects a missing type", () => {
    const result = validateInteraction({ type: "", body: "hi" });
    expect(result).toEqual({ ok: false, error: "Choose an interaction type." });
  });

  it("rejects an unknown type", () => {
    const result = validateInteraction({ type: "carrier-pigeon", body: "hi" });
    expect(result).toEqual({ ok: false, error: "Choose an interaction type." });
  });

  it("rejects a body over 2000 characters", () => {
    const result = validateInteraction({ type: "note", body: "x".repeat(2001) });
    expect(result).toEqual({
      ok: false,
      error: "Keep the note under 2000 characters.",
    });
  });

  it("accepts a body of exactly 2000 characters", () => {
    const result = validateInteraction({ type: "note", body: "x".repeat(2000) });
    expect(result.ok).toBe(true);
  });
});
