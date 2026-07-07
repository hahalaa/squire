import { describe, it, expect } from "vitest";
import { openingQuerySchema, normalizeFenForCache } from "./opening.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("normalizeFenForCache", () => {
  it("strips the halfmove clock and fullmove number", () => {
    expect(normalizeFenForCache(START_FEN)).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
    );
  });

  it("maps a transposition (same position, different move counters) to one key", () => {
    const a =
      "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 3";
    const b =
      "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 8 12";
    expect(normalizeFenForCache(a)).toBe(normalizeFenForCache(b));
  });

  it("returns null when there are fewer than four fields to key on", () => {
    expect(normalizeFenForCache("rnbqkbnr w KQ")).toBeNull();
    expect(normalizeFenForCache("garbage")).toBeNull();
  });
});

describe("openingQuerySchema", () => {
  it("accepts a well-formed FEN", () => {
    const parsed = openingQuerySchema.safeParse({ fen: START_FEN });
    expect(parsed.success).toBe(true);
  });

  it("accepts a full 32-piece opening position (no piece-count ceiling)", () => {
    const parsed = openingQuerySchema.safeParse({
      fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a malformed FEN", () => {
    const parsed = openingQuerySchema.safeParse({ fen: "not-a-fen" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing fen", () => {
    expect(openingQuerySchema.safeParse({}).success).toBe(false);
  });

  it("rejects unexpected extra keys (.strict)", () => {
    const parsed = openingQuerySchema.safeParse({
      fen: START_FEN,
      moves: "5",
    });
    expect(parsed.success).toBe(false);
  });
});
