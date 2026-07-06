// Centipawn-loss move classification for free-play and game analysis ONLY —
// endgame drills use tablebase category-preservation instead (see
// chess-domain.md's "Endgame drill grading and hint logic"). Do not reach
// for this inside anything endgame-related.

export type MoveClassification = "best" | "good" | "inaccuracy" | "mistake" | "blunder" | "miss";

export interface MoveClassificationInput {
  /** Best-move eval minus actual-move eval, both from the mover's own
   * perspective, in centipawns. Expected to be >= 0. */
  centipawnLoss: number;
  /** Eval before the move, from the mover's perspective, exceeded +200cp. */
  wasWinningBeforeMove: boolean;
  /** Eval after the move, from the mover's perspective, still exceeds +200cp. */
  isWinningAfterMove: boolean;
}

const BEST_MAX = 10;
const GOOD_MAX = 25;
const INACCURACY_MAX = 100;
const MISTAKE_MAX = 200;

/**
 * Best 0-10cp | Good 11-25cp | Inaccuracy 26-100cp | Mistake 101-200cp |
 * Blunder 201+cp | Miss: was winning (>200cp) before, not after — takes
 * precedence over the centipawn-loss bands above whenever it applies.
 */
export function classifyMove({
  centipawnLoss,
  wasWinningBeforeMove,
  isWinningAfterMove,
}: MoveClassificationInput): MoveClassification {
  if (wasWinningBeforeMove && !isWinningAfterMove) return "miss";
  if (centipawnLoss <= BEST_MAX) return "best";
  if (centipawnLoss <= GOOD_MAX) return "good";
  if (centipawnLoss <= INACCURACY_MAX) return "inaccuracy";
  if (centipawnLoss <= MISTAKE_MAX) return "mistake";
  return "blunder";
}
