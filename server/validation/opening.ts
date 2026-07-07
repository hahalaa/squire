import { z } from "zod";
import { Chess } from "chess.js";

// Query schema for GET /api/opening.
//
// FEN validation delegates to chess.js's Chess(fen) constructor rather than a
// hand-rolled regex: it's already a dependency and throws on BOTH malformed and
// illegal FENs, giving one authoritative pass/fail. Re-deriving FEN grammar
// here would create a second, independently-drifting notion of "valid FEN"
// (CHESS-015's tablebase proxy validates the same way).
//
// IMPORTANT: no piece-count ceiling here. CHESS-015 additionally requires
// <=7 pieces because Syzygy tablebases only cover that; opening positions have
// 20-32 pieces, so any such ceiling would reject every real opening lookup.
// This route validates "well-formed FEN" ONLY.
export const openingQuerySchema = z
  .object({
    fen: z
      .string()
      .min(1)
      .refine(
        (fen) => {
          try {
            new Chess(fen);
            return true;
          } catch {
            return false;
          }
        },
        { message: "Invalid FEN" },
      ),
  })
  .strict();

// Normalize a FEN into a cache key. Strips the halfmove-clock and
// fullmove-number (the two trailing fields), keeping only piece placement +
// side-to-move + castling rights + en-passant target.
//
// Two positions reached by different move orders (a transposition — extremely
// common in the opening phase this route serves) are identical for lookup but
// carry different move counters, so keying on the raw FEN would silently miss
// the cache hits this cache exists to catch, wasting the shared LICHESS_TOKEN
// rate-limit budget on avoidable upstream calls.
//
// Returns null when the string doesn't have the four leading fields to key on,
// so callers that run before full FEN validation (e.g. the rate-limiter skip
// check) can bail out safely rather than key on garbage.
export function normalizeFenForCache(fen: string): string | null {
  const fields = fen.trim().split(/\s+/);
  if (fields.length < 4) return null;
  return fields.slice(0, 4).join(" ");
}
